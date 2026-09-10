/**
 * Stav fanouškovských part — velikost, nálada, naštvanost.
 *
 * Velikost party NENÍ vlastní pravda. Je to podíl na vrstvě `team_fanbase`, kterou
 * spravuje `season/fanbase-helpers.ts` — jediný zdroj návštěvnosti i domácí výhody.
 * Kdyby si parta držela vlastní počet lidí, rozešly by se součty s ekonomikou.
 *
 * Nálada a naštvanost naopak vlastní jsou: to je ta část fanoušků, kterou hráč
 * reálně ovládá.
 */

import { logger } from "../lib/logger";
import { loadFanbaseAggregate } from "../season/fanbase-helpers";
import { FAN_GROUPS, type FanGroupKind } from "../engine/fan-groups";
import { ensureFanGroups, type FanGroupRow } from "./fan-group-generator";

const M = "fan-groups";

/** O kolik se nálada za herní den posune k cíli. Rychleji než loajalita, pomaleji než výsledek. */
export const MOOD_DRIFT_PER_DAY = 4;
/** Křivda vyprchává sama, ale pomalu — jinak by stačilo počkat týden a zapomene se všechno. */
export const HEAT_DECAY_PER_DAY = 1;

/**
 * Kam nálada party směřuje.
 *
 * Vášnivá parta prožívá spokojenost klubu silněji oběma směry — kotel je z výhry
 * u vytržení a z prohry zdrcený, zatímco pamětníci to berou tak, jak to je.
 */
export function targetMood(opts: {
  satisfaction: number;
  passion: number;
  ticketDiscount: number;
  heat: number;
}): number {
  const sat = Math.max(0, Math.min(100, opts.satisfaction));
  const amplituda = 0.7 + (Math.max(0, Math.min(100, opts.passion)) / 100) * 0.6;
  let t = 50 + (sat - 50) * amplituda;
  t += Math.max(0, Math.min(0.5, opts.ticketDiscount)) * 20;   // sleva potěší, ale nespasí
  t -= (Math.max(0, Math.min(100, opts.heat)) / 100) * 25;     // křivda náladu drží dole
  return Math.round(Math.max(0, Math.min(100, t)));
}

/** Posun o jeden herní den — o `step` bodů k cíli, nikdy přes něj. */
export function driftToward(current: number, target: number, step: number): number {
  if (current === target) return current;
  const dir = target > current ? 1 : -1;
  const next = current + dir * step;
  return dir > 0 ? Math.min(next, target) : Math.max(next, target);
}

/** Kolik lidí parta má — podíl na své vrstvě fanbáze. */
export function sizeForShare(share: number, tierCount: number): number {
  return Math.max(0, Math.round(Math.max(0, tierCount) * Math.max(0, Math.min(1, share))));
}

/** Je sektor party k tomuhle hernímu dni zavřený za trest? */
export function isSectorClosed(closedUntilGd: string | null, gameDate: string): boolean {
  return !!closedUntilGd && closedUntilGd > gameDate;
}

/**
 * Srovná velikosti part s aktuální fanbází a posune náladu o jeden herní den.
 *
 * Volá se z denního ticku i před čtením v API — party se tak nikdy nezobrazí
 * s velikostí z minulého týdne. Opakované volání ve stejný den velikosti jen přepíše
 * na stejné hodnoty; nálada se posune znovu, proto denní tick zůstává jediné místo,
 * kde se driftuje (viz `drift` flag).
 */
export async function syncFanGroups(
  db: D1Database,
  teamId: string,
  opts: { drift: boolean },
): Promise<FanGroupRow[]> {
  const groups = await ensureFanGroups(db, teamId);
  if (groups.length === 0) return [];

  const { agg } = await loadFanbaseAggregate(db, teamId);
  const tierCount: Record<string, number> = {
    hardcore: agg.hardcore,
    regular: agg.regular,
    casual: agg.casual,
  };

  const fans = await db
    .prepare("SELECT satisfaction FROM fans WHERE team_id = ?")
    .bind(teamId)
    .first<{ satisfaction: number }>()
    .catch((e) => { logger.warn({ module: M }, `spokojenost týmu ${teamId}`, e); return null; });
  const satisfaction = fans?.satisfaction ?? 50;

  const stmts: D1PreparedStatement[] = [];
  const out: FanGroupRow[] = [];

  for (const g of groups) {
    const def = FAN_GROUPS[g.kind as FanGroupKind];
    if (!def) {
      logger.warn({ module: M }, `neznámý druh party ${g.kind} u týmu ${teamId}`);
      out.push(g);
      continue;
    }
    const size = sizeForShare(g.share, tierCount[def.tier] ?? 0);
    let mood = g.mood;
    let heat = g.heat;

    if (opts.drift) {
      mood = driftToward(
        g.mood,
        targetMood({ satisfaction, passion: g.passion, ticketDiscount: g.ticket_discount, heat: g.heat }),
        MOOD_DRIFT_PER_DAY,
      );
      heat = Math.max(0, g.heat - HEAT_DECAY_PER_DAY);
    }

    if (size !== g.size || mood !== g.mood || heat !== g.heat) {
      stmts.push(
        db.prepare(
          `UPDATE fan_groups SET size = ?, mood = ?, heat = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
        ).bind(size, mood, heat, g.id),
      );
    }
    out.push({ ...g, size, mood, heat });
  }

  if (stmts.length > 0) {
    await db.batch(stmts)
      .catch((e) => { logger.warn({ module: M }, `zápis stavu part týmu ${teamId}`, e); });
  }

  return out;
}
