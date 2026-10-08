/**
 * Přehled „Postava kádru“ (postava, část 3; spec docs/superpowers/specs/2026-10-08-player-body-levers-design.md).
 *
 * Kdo má s váhou problém, proč a co to stojí základní jedenáctku. Výpočet je čistý
 * (`buildBodyOverview`), načtení z DB dělá `loadBodyOverview`.
 */

import { idealWeight, playerBodyView, type WeightCategory } from "../generators/physicals";
import { logger } from "../lib/logger";
import { weightSmsCause, weightTrend, type WeightSmsCause } from "./body-drift";

const M = "body-overview";
/** Přibírání, které už je problém i u hráče v normě (kg za ~měsíc). */
const PROBLEM_TREND_KG = 1.5;

export interface OverviewPlayerInput {
  id: string;
  name: string;
  position: string;
  rating: number | null;
  physical: Record<string, unknown>;
  trend30d: number | null;
  injured: boolean;
  pubVisits28d: number;
  planUntil: string | null;
  pledgeUntil: string | null;
}

export interface OverviewPlayer {
  id: string;
  name: string;
  position: string;
  weight: number | null;
  weightCategory: WeightCategory | null;
  trend30d: number | null;
  effects: { speed: number; stamina: number; strength: number; heading: number };
  /** Proč přibírá, jen u hráčů s nadváhou nebo s rychlým přírůstkem. */
  cause: WeightSmsCause | null;
  planUntil: string | null;
  pledgeUntil: string | null;
  problem: boolean;
}

export interface BodyOverview {
  summary: {
    avgExcess: number | null;
    counts: Record<WeightCategory, number>;
    avgTrend30d: number | null;
    lineupPenalty: { speed: number; stamina: number };
    lineupSource: "lineup" | "best11";
  };
  players: OverviewPlayer[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const SEVERITY: Record<string, number> = { obese: 0, over: 1, under: 2 };

export function buildBodyOverview(inputs: readonly OverviewPlayerInput[], lineupIds: ReadonlySet<string> | null): BodyOverview {
  const counts: Record<WeightCategory, number> = { under: 0, ideal: 0, muscular: 0, over: 0, obese: 0 };
  const excesses: number[] = [];
  const trends: number[] = [];

  const players = inputs.map((p): OverviewPlayer & { rating: number } => {
    const view = playerBodyView(p.physical);
    if (view.weightCategory) counts[view.weightCategory]++;
    const weight = typeof p.physical.weight === "number" ? p.physical.weight : null;
    const height = typeof p.physical.height === "number" && p.physical.height > 0 ? p.physical.height : null;
    if (weight !== null && height !== null) excesses.push(weight - idealWeight(height));
    if (p.trend30d !== null) trends.push(p.trend30d);
    const gaining = (p.trend30d ?? 0) >= PROBLEM_TREND_KG;
    const heavy = view.weightCategory === "over" || view.weightCategory === "obese";
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      weight,
      weightCategory: view.weightCategory,
      trend30d: p.trend30d,
      effects: view.effects,
      cause: heavy || gaining ? weightSmsCause({ injured: p.injured, pubVisits28d: p.pubVisits28d }) : null,
      planUntil: p.planUntil,
      pledgeUntil: p.pledgeUntil,
      problem: heavy || gaining || view.weightCategory === "under",
      rating: p.rating ?? 0,
    };
  });

  const rank = (x: OverviewPlayer) => SEVERITY[x.weightCategory ?? ""] ?? (x.problem ? 3 : 4);
  players.sort((a, b) => rank(a) - rank(b) || a.effects.speed - b.effects.speed
    || (b.trend30d ?? 0) - (a.trend30d ?? 0) || a.name.localeCompare(b.name, "cs"));

  const useLineup = !!lineupIds && lineupIds.size > 0;
  const starters = useLineup
    ? players.filter((x) => lineupIds!.has(x.id))
    : [...players].sort((a, b) => b.rating - a.rating).slice(0, 11);
  const lineupPenalty = starters.reduce(
    (s, x) => ({ speed: s.speed + x.effects.speed, stamina: s.stamina + x.effects.stamina }),
    { speed: 0, stamina: 0 },
  );

  const mean = (xs: number[]) => (xs.length > 0 ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    summary: { avgExcess: mean(excesses), counts, avgTrend30d: mean(trends), lineupPenalty, lineupSource: useLineup ? "lineup" : "best11" },
    players: players.map(({ rating: _rating, ...rest }) => rest),
  };
}

function shiftDate(isoDay: string, days: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parse(raw: string | null, what: string, id: string): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, playerId: id }, `parse ${what}`, e);
    return {};
  }
}

/** Načte přehled áčka z DB (hráči, historie váhy, hospoda, zranění, plány, sestava). */
export async function loadBodyOverview(db: D1Database, teamId: string): Promise<BodyOverview> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "game_date", e); return null; });
  const today = (team?.game_date ?? new Date().toISOString()).slice(0, 10);

  type Row = { id: string; first_name: string; last_name: string; position: string; overall_rating: number | null; physical: string | null; life_context: string | null };
  const rows = await db.prepare(
    `SELECT id, first_name, last_name, position, overall_rating, physical, life_context FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(teamId).all<Row>()
    .catch((e) => { logger.warn({ module: M }, "players", e); return { results: [] as Row[] }; });
  const ids = rows.results.map((r) => r.id);
  if (ids.length === 0) return buildBodyOverview([], null);
  const ph = ids.map(() => "?").join(",");

  const [log, pubs, injuries, plans] = await Promise.all([
    db.prepare(`SELECT player_id, game_date, weight FROM weight_log WHERE player_id IN (${ph}) AND game_date >= ?`)
      .bind(...ids, shiftDate(today, -42)).all<{ player_id: string; game_date: string; weight: number }>()
      .catch((e) => { logger.warn({ module: M }, "weight log", e); return { results: [] as { player_id: string; game_date: string; weight: number }[] }; }),
    db.prepare("SELECT attendees FROM pub_sessions WHERE team_id = ? AND game_date > ?")
      .bind(teamId, shiftDate(today, -28)).all<{ attendees: string }>()
      .catch((e) => { logger.warn({ module: M }, "pub sessions", e); return { results: [] as { attendees: string }[] }; }),
    db.prepare(`SELECT DISTINCT player_id FROM injuries WHERE days_remaining > 0 AND COALESCE(osobni_volno, 0) = 0 AND player_id IN (${ph})`)
      .bind(...ids).all<{ player_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "injuries", e); return { results: [] as { player_id: string }[] }; }),
    db.prepare(`SELECT target_player_id, ends_game_date FROM staff_tasks WHERE task_type = 'weight_plan' AND status = 'active' AND target_player_id IN (${ph})`)
      .bind(...ids).all<{ target_player_id: string; ends_game_date: string }>()
      .catch((e) => { logger.warn({ module: M }, "weight plans", e); return { results: [] as { target_player_id: string; ends_game_date: string }[] }; }),
  ]);

  const logBy = new Map<string, { gameDate: string; weight: number }[]>();
  for (const r of log.results) logBy.set(r.player_id, [...(logBy.get(r.player_id) ?? []), { gameDate: r.game_date, weight: r.weight }]);
  const pubCount = new Map<string, number>();
  for (const r of pubs.results) {
    try {
      for (const a of JSON.parse(r.attendees) as Array<{ playerId?: string }>) if (a.playerId) pubCount.set(a.playerId, (pubCount.get(a.playerId) ?? 0) + 1);
    } catch (e) {
      logger.warn({ module: M }, "parse pub attendees", e);
    }
  }
  const injured = new Set(injuries.results.map((r) => r.player_id));
  const planBy = new Map(plans.results.map((r) => [r.target_player_id, r.ends_game_date]));

  let lineupIds: Set<string> | null = null;
  try {
    const { findNextLeagueMatch, loadLineupIds } = await import("../staff/staff-tasks");
    const next = await findNextLeagueMatch(db, teamId, today);
    if (next) lineupIds = (await loadLineupIds(db, teamId, next.id))?.start ?? null;
  } catch (e) {
    logger.warn({ module: M }, "next lineup", e);
  }

  const inputs: OverviewPlayerInput[] = rows.results.map((r) => {
    const physical = parse(r.physical, "physical", r.id);
    const lc = parse(r.life_context, "life_context", r.id);
    const weight = typeof physical.weight === "number" ? physical.weight : null;
    const pledge = typeof lc.dietPledgeUntil === "string" && lc.dietPledgeUntil >= today ? lc.dietPledgeUntil : null;
    return {
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      position: r.position,
      rating: r.overall_rating,
      physical,
      trend30d: weight === null ? null : weightTrend(weight, logBy.get(r.id) ?? [], today),
      injured: injured.has(r.id),
      pubVisits28d: pubCount.get(r.id) ?? 0,
      planUntil: planBy.get(r.id) ?? null,
      pledgeUntil: pledge,
    };
  });
  return buildBodyOverview(inputs, lineupIds);
}
