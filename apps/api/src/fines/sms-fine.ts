/**
 * Pokuta z SMS a sazebník kabiny.
 *
 * Pokuta z SMS zůstává (trenér ji napíše, udělí tlačítkem, peníze jdou klubu), jen se
 * eviduje mezi pokutami: počítá se do zátěže hráče a hráč na ni odpoví podle faktů.
 * Když trenér v SMS pokutuje prohřešek, za který hráč už v posledních dnech zaplatil
 * podle sazebníku, druhá pokuta se neudělí.
 */

import type { FineItemKey } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { addDays, recordFines } from "./store";

const M = "fines-sms";

/** Podle čeho v SMS trenéra pozná, o jakou položku sazebníku jde. */
const ITEM_CUES: Partial<Record<FineItemKey, RegExp>> = {
  training_missed: /tr[eé]nink/i,
  training_broken_pledge: /tr[eé]nink|slíbil|slibil/i,
  training_forgot_boots: /kopa[cč]k|boty/i,
  match_excuse: /omluv|nep[rř]i[sš]el na z[aá]pas|z[aá]pas/i,
  match_hangover: /kocovin|opil|chlast/i,
  yellow_card: /[zž]lut|kart/i,
  red_card: /[cč]erven|vylou[cč]|kart/i,
  suspension: /stopk|kart/i,
  penalty_miss: /penalt/i,
  match_late: /pozd[eě]|zpo[zž]d/i,
  pub_before_match: /hospod|piv|chlast/i,
  pub_fight: /rva[cč]k|pr[aá]l|bitk/i,
};

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Fakt pokuty ze sazebníku, kterou SMS pokuta zdvojuje, nebo null. Bere pokuty za poslední
 * 3 herní dny, jejichž položka odpovídá slovům v SMS.
 */
export async function scheduleDuplicateOf(
  db: D1Database, o: { teamId: string; playerId: string; quote: string | null; day: string },
): Promise<string | null> {
  if (!o.quote) return null;
  const rows = await db.prepare(
    `SELECT item_key, fact FROM fines WHERE team_id = ? AND player_id = ? AND in_schedule = 1 AND status != 'forgiven' AND game_date >= ?
      ORDER BY game_date DESC`,
  ).bind(o.teamId, o.playerId, addDays(o.day.slice(0, 10), -3)).all<{ item_key: string; fact: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: o.teamId }, "pokuty ze sazebníku k SMS pokutě", e); return null; });
  const q = plain(o.quote);
  for (const r of rows?.results ?? []) {
    const cue = ITEM_CUES[r.item_key as FineItemKey];
    if (cue && cue.test(q)) return (r.fact ?? "pokuta ze sazebníku").replace(/\.$/, "");
  }
  return null;
}

/**
 * Zapíše pokutu z SMS do pokladničky kabiny. Když se nezapíše, vyhodí chybu: volající
 * (coach-commitments.ts) pak slib vrátí, ať ho jde udělit znovu a pokuta nezmizí.
 */
export async function recordSmsFine(
  db: D1Database, o: { teamId: string; playerId: string; commitmentId: string; amount: number; quote: string | null; day: string },
): Promise<void> {
  const recorded = await recordFines(db, o.teamId, o.day.slice(0, 10), [{
    playerId: o.playerId, itemKey: null, conditionKey: null, sourceRef: `sms|${o.commitmentId}`, source: "sms",
    amountCzk: o.amount, fact: o.quote ? `Trenér ti v SMS napsal: „${o.quote.slice(0, 200)}“` : "Pokuta od trenéra v SMS",
  }], []);
  if (recorded.length === 0) throw new Error(`SMS pokuta ${o.commitmentId} se nezapsala do pokladničky`);
}
