/**
 * Fanoušci vstřebávají, co se kolem klubu stalo.
 *
 * Čte nezpracované `club_events`, promítne je do nálady a naštvanosti part,
 * a když je to dost velká věc, nechá vůdce napsat SMS. Běží jednou za herní den
 * z `syncFanGroups`, takže se dopady nesčítají vícekrát než jednou za událost.
 *
 * Rozhodování o tom, KOLIK to bolí, sedí v `engine/fan-reactions.ts` (čisté
 * funkce). Tenhle soubor jen tahá data a zapisuje.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  CLUB_EVENTS, dopadUdalosti,
  type ClubEventKind,
} from "../engine/fan-reactions";
import type { FanGroupKind } from "../engine/fan-groups";
import { fanLeaderFullName, type FanGroupRow, type FanLeaderRow } from "./fan-group-generator";
import { loadUnprocessed, markProcessed, type ClubEventRow } from "./club-events";

const M = "fan-reactions";

/** Nejvýš tolik zpráv od vůdců za jeden herní den. Telefon není spamovací kanál. */
const MAX_SMS_ZA_DEN = 1;
/** Pod touhle silou se nikdo neozývá — drobnosti se jen tiše promítnou do nálady. */
const PRAH_PRO_SMS = 0.45;

export interface ReactionResult {
  zpracovano: number;
  sms: number;
}

/**
 * Promítne nezpracované události do part.
 *
 * Vrací počty, ať je z logu poznat, jestli se něco dělo. Nikdy nehází —
 * fanoušci nesmí shodit denní tick.
 */
export async function zpracujUdalostiKlubu(
  db: D1Database,
  teamId: string,
  groups: FanGroupRow[],
): Promise<ReactionResult> {
  const out: ReactionResult = { zpracovano: 0, sms: 0 };
  if (groups.length === 0) return out;

  const udalosti = await loadUnprocessed(db, teamId);
  if (udalosti.length === 0) return out;

  const leaders = await nactiVudce(db, teamId);
  const zmeny = new Map<string, { mood: number; heat: number; duvod: string }>();
  let poslanoSms = 0;

  for (const u of udalosti) {
    const def = CLUB_EVENTS[u.kind as ClubEventKind];
    if (!def) {
      logger.warn({ module: M }, `neznámý druh události ${u.kind} u ${teamId}`);
      continue;
    }

    for (const g of groups) {
      const d = dopadUdalosti(u.kind as ClubEventKind, g.kind as FanGroupKind, {
        severity: u.severity,
        passion: g.passion,
        loyalty: g.loyalty,
      });
      if (d.mood === 0 && d.heat === 0) continue;
      const acc = zmeny.get(g.id) ?? { mood: 0, heat: 0, duvod: "" };
      acc.mood += d.mood;
      acc.heat += d.heat;
      // Do „důvodu" jde ta nejvýraznější věc, ne poslední v pořadí.
      if (!acc.duvod || Math.abs(d.mood) > 6) acc.duvod = def.label;
      zmeny.set(g.id, acc);
    }

    if (poslanoSms < MAX_SMS_ZA_DEN && u.severity >= PRAH_PRO_SMS && def.pise && def.texty?.length) {
      const parta = groups.find((g) => g.kind === def.pise);
      const vudce = parta?.leader_id ? leaders.get(parta.leader_id) : undefined;
      if (parta && vudce) {
        const poslano = await posliZpravu(db, teamId, u, def.texty, parta, vudce, !!def.ptaSe);
        if (poslano) poslanoSms++;
      }
    }

    out.zpracovano++;
  }

  await zapisZmeny(db, zmeny);
  await markProcessed(db, udalosti.map((u) => u.id));
  out.sms = poslanoSms;

  if (out.zpracovano > 0) {
    logger.info(
      { module: M, teamId },
      `fanoušci vstřebali ${out.zpracovano} událostí, poslali ${out.sms} zpráv`,
    );
  }
  return out;
}

async function nactiVudce(db: D1Database, teamId: string): Promise<Map<string, FanLeaderRow>> {
  const rows = await db
    .prepare("SELECT * FROM fan_leaders WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "vůdci pro reakce", e); return null; });
  return new Map((rows?.results ?? []).map((l) => [l.id, l]));
}

async function posliZpravu(
  db: D1Database,
  teamId: string,
  u: ClubEventRow,
  texty: readonly string[],
  parta: FanGroupRow,
  vudce: FanLeaderRow,
  ptaSe: boolean,
): Promise<boolean> {
  // Seed z ID události: tentýž průšvih vždycky vyvolá tutéž zprávu.
  const rng = createRng(seedFromString(`fanmsg|${u.id}`));
  const co = detailZPayloadu(u.payload);
  const text = rng.pick(texty).replace(/\{co\}/g, co);

  const { sendLeaderSMS } = await import("../messaging/system-sms");
  const convId = await sendLeaderSMS(
    db, teamId,
    { id: vudce.id, name: fanLeaderFullName(vudce), avatar: vudce.avatar, groupId: parta.id },
    text,
    { ceka: ptaSe, tema: u.kind },
  );
  return convId !== null;
}

/** Co přesně se stalo — jde do `{co}` v šabloně. */
function detailZPayloadu(raw: string | null): string {
  if (!raw) return "to";
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return String(p.co ?? p.jmeno ?? p.nazev ?? "to");
  } catch (e) {
    logger.warn({ module: M }, "nečitelný payload události", e);
    return "to";
  }
}

async function zapisZmeny(
  db: D1Database,
  zmeny: Map<string, { mood: number; heat: number; duvod: string }>,
): Promise<void> {
  if (zmeny.size === 0) return;
  const stmts: D1PreparedStatement[] = [];
  for (const [groupId, z] of zmeny) {
    stmts.push(
      db.prepare(
        `UPDATE fan_groups SET
           mood = MAX(0, MIN(100, mood + ?)),
           heat = MAX(0, MIN(100, heat + ?)),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?`,
      ).bind(z.mood, z.heat, groupId),
    );
  }
  await db.batch(stmts).catch((e) => { logger.warn({ module: M }, "zápis reakcí part", e); });
}
