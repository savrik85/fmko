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
import {
  FAN_GROUPS, fanGroupMatchEffects, NEUTRAL_GROUP_EFFECTS, jadroVelikost,
  type FanGroupKind, type FanGroupMatchEffects, type FanSector,
} from "../engine/fan-groups";
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
 *
 * Loajalita tlumí JEN pád dolů: pamětníci, co chodí od roku 1974, kvůli jedné
 * špatné sezóně nezhořknou. Nahoru je netlumí nic — z výhry má radost každý.
 */
export function targetMood(opts: {
  satisfaction: number;
  passion: number;
  loyalty: number;
  ticketDiscount: number;
  heat: number;
}): number {
  const sat = Math.max(0, Math.min(100, opts.satisfaction));
  const amplituda = 0.7 + (Math.max(0, Math.min(100, opts.passion)) / 100) * 0.6;
  const odchylka = sat - 50;
  const tlumeni = odchylka < 0 ? 1 - Math.max(0, Math.min(100, opts.loyalty)) / 200 : 1;
  let t = 50 + odchylka * amplituda * tlumeni;
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

/**
 * Sníží počítadlo uzavřených sektorů o jeden domácí zápas.
 *
 * Volá se z vyhodnocení domácího zápasu, uvnitř nároku na něj — opakovaný běh
 * téhož zápasu tak trest nezkrátí dvakrát.
 */
export async function odbytZapasUzavreniSektoru(db: D1Database, teamId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE fan_groups SET closed_matches = closed_matches - 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE team_id = ? AND closed_matches > 0`,
    )
    .bind(teamId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `odečet uzavření sektoru u ${teamId}`, e); });
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

  // Nejdřív dění kolem klubu, teprve pak drift k cíli — jinak by se reakce
  // na prodej opory hned ve stejném ticku zase rozpustila.
  if (opts.drift) {
    const { zpracujUdalostiKlubu } = await import("./fan-reactions");
    await zpracujUdalostiKlubu(db, teamId, groups)
      .catch((e) => { logger.warn({ module: M }, `reakce na dění u ${teamId}`, e); });
  }

  const fans = await db
    .prepare("SELECT satisfaction FROM fans WHERE team_id = ?")
    .bind(teamId)
    .first<{ satisfaction: number }>()
    .catch((e) => { logger.warn({ module: M }, `spokojenost týmu ${teamId}`, e); return null; });
  const satisfaction = fans?.satisfaction ?? 50;

  const stmts: D1PreparedStatement[] = [];
  const out: FanGroupRow[] = [];

  const cerstve = opts.drift
    ? (await db.prepare("SELECT * FROM fan_groups WHERE team_id = ? ORDER BY kind")
        .bind(teamId).all<FanGroupRow>()
        .catch((e) => { logger.warn({ module: M }, "party po reakcích", e); return null; }))?.results ?? groups
    : groups;

  for (const g of cerstve) {
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
        targetMood({
          satisfaction, passion: g.passion, loyalty: g.loyalty,
          ticketDiscount: g.ticket_discount, heat: g.heat,
        }),
        MOOD_DRIFT_PER_DAY,
      );
      heat = Math.max(0, g.heat - HEAT_DECAY_PER_DAY);
    }

    // Tvrdé jádro se dopočítává ze stavu party, stejně jako velikost — otrávený
    // kotel se scvrkne na hrstku, spokojený nabobtná. Ztráty po rvačce a po
    // zavřeném sektoru řeší resolver zápasu rovnou, tohle je klidový stav.
    const core = jadroVelikost({
      kind: g.kind as FanGroupKind, size, mood, passion: g.passion,
    });

    if (size !== g.size || mood !== g.mood || heat !== g.heat || core !== g.core) {
      stmts.push(
        db.prepare(
          `UPDATE fan_groups SET size = ?, mood = ?, heat = ?, core = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
        ).bind(size, mood, heat, core, g.id),
      );
    }
    out.push({ ...g, size, mood, heat, core });
  }

  if (stmts.length > 0) {
    await db.batch(stmts)
      .catch((e) => { logger.warn({ module: M }, `zápis stavu part týmu ${teamId}`, e); });
  }

  return out;
}

/**
 * Dopady part na jeden domácí zápas. Načte je z DB a předá čisté funkci.
 *
 * Vrací neutrál, když klub party ještě nemá — tím se stará ekonomika nehne
 * ani u klubů, které vznikly před touhle featurou.
 */
export async function loadFanGroupMatchEffects(
  db: D1Database,
  teamId: string,
): Promise<FanGroupMatchEffects> {
  const rows = await db
    .prepare(
      `SELECT size, mood, passion, spending, noise, sector, closed_matches, ticket_discount
       FROM fan_groups WHERE team_id = ?`,
    )
    .bind(teamId)
    .all<{
      size: number; mood: number; passion: number; spending: number; noise: number;
      sector: string; closed_matches: number; ticket_discount: number;
    }>()
    .catch((e) => { logger.warn({ module: M }, `dopady part u ${teamId}`, e); return null; });

  const groups = rows?.results ?? [];
  if (groups.length === 0) return NEUTRAL_GROUP_EFFECTS;

  return fanGroupMatchEffects(groups.map((g) => ({
    size: g.size,
    mood: g.mood,
    passion: g.passion,
    spending: g.spending,
    noise: g.noise,
    sector: (g.sector as FanSector) ?? "hlavni",
    sectorClosed: g.closed_matches > 0,
    ticketDiscount: g.ticket_discount,
  })));
}
