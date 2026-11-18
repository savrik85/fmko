/**
 * Přemluvit pachatele, ať to vrátí nebo zaplatí (zadání 2026-11-18).
 *
 * Trenér napíše hráči „vrať to“ nebo „zaplať tu škodu“. Když je hráč opravdu pachatel
 * krádeže nebo poškození (odhalený, nebo ho trenér tipnul správně), rozhodne se podle povahy
 * a vztahu k trenérovi. Když kývne: ukradené vybavení vrátí, hotovost dá zpátky, rozbité
 * zaplatí (nejvýš čtyři týdenní odměny jako u srážky), přizná se a incident se uzavře.
 * Zkouší se jednou na incident (značka `restitution` ve sloupci `tactics`, migrace 0317).
 * Volá incidents/zprava-trenera.ts ještě před odpovědí hráče, ta už výsledek zná.
 */

import { CATEGORIES, CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { recordTransaction } from "../season/finance-processor";
import { sendIncidentSystemSms } from "./club-messages";
import { nactiHraceKadru, smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { SMS_ROLE_KUSTOD } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy } from "./stopy-db";
import { castkaSrazky, hodnotaSkody } from "./tresty";
import { stopaNaHrace } from "./vysetrovani";

const M = "incidents-restitution";

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/** Trenér chce, ať to hráč vrátí nebo zaplatí („vrať to“, „zaplať tu škodu“, „dej to do pořádku“). */
const RESTITUTION_RE = /\b(vrat|vratis|vratit|vrat to|vrat ty|vrat mi|dej to zpatky|dej to zpet|vrat to zpatky|zaplat|zaplatis|zaplatit|nahrad|nahradis|nahradit|uhrad|uhradis|dej to do poradku|dat to do poradku|oprav to|opravis to)\b/;
/** Slib mírnosti pomáhá („když to vrátíš, nebudu to řešit“). */
const LENIENCY_RE = /\b(nebudu to resit|nebude se to resit|zapomeneme|bez trestu|nic se ti nestane|odpustim|zmirnim|mezi nama|mezi nami|zustane to mezi)\b/;
const INSULT_RE = /\b(kurv\w*|pic\w*|kokot\w*|debil\w*|zmrd\w*|zlodej\w*|parchant\w*|hovad\w*)\b/;

export function isRestitutionRequest(text: string): boolean {
  return RESTITUTION_RE.test(plain(text));
}

/** Šance v procentech, že pachatel kývne. Odhalený a se stopou na sobě se brání méně. */
export function restitutionChance(
  p: { disciplina: number; temperament: number; vztahKTrenerovi: number },
  o: { revealed: boolean; clueOnHim: boolean; leniency: boolean; insult: boolean },
): number {
  const base = (p.disciplina + (100 - p.temperament) + p.vztahKTrenerovi) / 3 - 15;
  const sance = base + (o.revealed ? 25 : 0) + (o.clueOnHim ? 10 : 0) + (o.leniency ? 15 : 0) - (o.insult ? 20 : 0);
  return Math.max(5, Math.min(90, Math.round(sance)));
}

export type RestitutionOutcome = { outcome: "returned" | "paid"; amount: number } | { outcome: "refused" };

interface IncidentRow {
  id: string; kind: string; category: string; status: string; loss: string | null; culprit_revealed: number;
}

/**
 * Zpráva trenéra hráči: chce, ať to vrátí nebo zaplatí. Vrací výsledek, nebo null
 * (žádost to není, hráč nic neprovedl, už se zkoušelo).
 */
export async function tryRestitution(
  db: D1Database,
  o: { teamId: string; playerId: string; text: string; gameDate: string },
): Promise<RestitutionOutcome | null> {
  if (!isRestitutionRequest(o.text)) return null;
  const inc = await db.prepare(
    `SELECT id, kind, category, status, loss, culprit_revealed FROM club_incidents
      WHERE team_id = ? AND culprit_type = 'hrac' AND culprit_player_id = ? AND status IN ('otevreny', 'policie')
        AND category IN ('kradez', 'poskozeni')
      ORDER BY game_date DESC LIMIT 1`,
  ).bind(o.teamId, o.playerId).first<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `incident pachatele ${o.playerId}`, e); return null; });
  if (!inc) return null;

  // Jednou na incident: značka v taktikách výslechu (řádek pachatele ve znalostech).
  const mark = await db.prepare(
    `UPDATE club_incident_knowledge SET tactics = json_insert(COALESCE(tactics, '[]'), '$[#]', 'restitution')
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'
        AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(club_incident_knowledge.tactics, '[]')) WHERE value = 'restitution')`,
  ).bind(inc.id, o.playerId, o.teamId).run()
    .catch((e) => { logger.warn({ module: M }, `značka přemlouvání ${inc.id}`, e); return null; });
  if ((mark?.meta?.changes ?? 0) === 0) return null;

  const player = await nactiHraceKadru(db, o.teamId, o.playerId);
  if (!player) return null;
  const clueOnHim = stopaNaHrace(await nactiStopy(db, inc.id), player.id);
  const t = plain(o.text);
  const chance = restitutionChance(player, {
    revealed: inc.culprit_revealed === 1, clueOnHim, leniency: LENIENCY_RE.test(t), insult: INSULT_RE.test(t),
  });
  const rng = createRng(seedFromString(`restitution|${inc.id}|${o.playerId}`));
  if (rng.random() * 100 >= chance) {
    // Odmítl: hráč o tom ví a v odpovědi trenérovi nevyhoví (odhalený), nebo zapírá dál.
    if (inc.culprit_revealed === 1) await addCulpritFact(db, inc.id, o.playerId, "Trenér po tobě chce, ať to vrátíš nebo zaplatíš. Nechce se ti a vymlouváš se.");
    logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} odmítl vrátit ${inc.id} (šance ${chance} %)`);
    return { outcome: "refused" };
  }

  const name = `${player.krestni} ${player.prijmeni}`;
  const title = nazevIncidentu(inc.kind);
  const losses = nactiZtraty(inc.loss);
  let cash = 0;
  let damage = 0;
  const returned: string[] = [];
  for (const z of losses) {
    if (z.typ === "penize") { cash += z.castka; continue; }
    if (z.typ === "vybaveni" && (CATEGORIES as readonly string[]).includes(z.kategorie)) {
      const r = await db.prepare(
        `UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} < ?`,
      ).bind(z.uroven, z.stav, o.teamId, z.uroven).run()
        .catch((e) => { logger.error({ module: M }, `vrácení vybavení ${inc.id}`, e); return null; });
      if ((r?.meta?.changes ?? 0) > 0) returned.push(CATEGORY_LABELS[z.kategorie] ?? z.kategorie);
      continue;
    }
    damage += hodnotaSkody([z]);
  }
  // Rozbité zaplatí ze svého, nejvýš čtyři týdenní odměny (stejný strop jako srážka ze mzdy).
  const paid = damage > 0 ? castkaSrazky(damage, player.mzda) : 0;
  const total = cash + paid;
  const outcome: "returned" | "paid" = inc.category === "kradez" ? "returned" : "paid";

  const closed = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', culprit_revealed = 1, resolution = ?, resolution_data = ?, resolved_on = ?
      WHERE id = ? AND team_id = ? AND status IN ('otevreny', 'policie')`,
  ).bind(outcome === "returned" ? "vratil" : "nahradil", JSON.stringify({ castka: total, vraceno: returned }), o.gameDate, inc.id, o.teamId).run()
    .catch((e) => { logger.error({ module: M }, `uzavření incidentu po vrácení ${inc.id}`, e); return null; });
  if ((closed?.meta?.changes ?? 0) === 0) return null;
  if (total > 0) {
    await recordTransaction(db, o.teamId, "incident_recovery", total, `${outcome === "returned" ? "Vrácený lup" : "Náhrada škody"} od hráče: ${name}`, o.gameDate, `nahrada-${inc.id}`)
      .catch((e) => logger.error({ module: M }, `náhrada od hráče ${inc.id}`, e));
  }
  await db.prepare(
    `UPDATE club_incident_knowledge SET interrogation = 'priznal', interrogated_on = COALESCE(interrogated_on, ?)
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'`,
  ).bind(o.gameDate, inc.id, o.playerId, o.teamId).run()
    .catch((e) => logger.warn({ module: M }, `přiznání po vrácení ${inc.id}`, e));
  await addCulpritFact(db, inc.id, o.playerId, outcome === "returned"
    ? "Trenér tě přemluvil a ty jsi to přiznal a všechno vrátil. Je ti to trapné, ale ulevilo se ti."
    : "Trenér tě přemluvil a ty jsi to přiznal a škodu zaplatil ze svého. Je ti to trapné, ale ulevilo se ti.");

  const what = [...returned, ...(cash > 0 ? [`${cash.toLocaleString("cs-CZ")} Kč`] : [])];
  const body = outcome === "returned"
    ? `✋ ${name} se přiznal (${title}) a vrátil ${what.length > 0 ? what.join(", ") : "co vzal"}. Incident je vyřešený.`
    : `✋ ${name} se přiznal (${title}) a škodu zaplatil${paid > 0 ? `, ${paid.toLocaleString("cs-CZ")} Kč` : ""}. Incident je vyřešený.`;
  await sendIncidentSystemSms(db, o.teamId, SMS_ROLE_KUSTOD, body, smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS po vrácení ${inc.id}`, e));
  logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} ${outcome} ${inc.id}: ${total} Kč`);
  return { outcome, amount: total };
}

/** Doplní pachateli do znalostí, co se stalo, ať o tom v odpovědi trenérovi ví. */
async function addCulpritFact(db: D1Database, incidentId: string, playerId: string, fact: string): Promise<void> {
  await db.prepare(
    `UPDATE club_incident_knowledge SET fact = fact || ' ' || ?
      WHERE incident_id = ? AND player_id = ? AND role = 'pachatel'`,
  ).bind(fact, incidentId, playerId).run()
    .catch((e) => logger.warn({ module: M }, `znalost pachatele ${incidentId}`, e));
}
