/**
 * Oslabení AI klubů ligy: jednorázová korekce, když narovnání nastavilo AI kluby výš, než
 * má být. Strakonice 11/2026: lidský nováček z okresního města skončil po narovnání na středu
 * ligy a nejsilnější AI kluby měly nejlepší jedenáctku o devět bodů výš.
 *
 * Každý hráč původního AI klubu ligy klesne o `shift` bodů hodnocení: dovednosti o stejný
 * kus, strop o tentýž kus (`lowerToRating`, stejně jako u dorostenců při narovnání). Pořadí
 * AI klubů mezi sebou zůstane. Rozpočet nad `budgetCap` se strhne na strop, jinak by si klub
 * silné hráče hned dokoupil. Inzeráty snížených hráčů se stáhnou, cena vznikla ze starého
 * hodnocení a AI trenér je vystaví znovu.
 *
 * Nikdy se nesahá na lidský klub, na klub převzatý od člověka (vlastník se může vrátit)
 * ani na hostující hráče (patří jinému klubu).
 *
 * Plán (`planWeakening`) nic nezapisuje. Provedení (`applyWeakening`) stav znovu načte
 * a změny spočítá stejně.
 */

import { logger } from "../lib/logger";
import { lowerToRating, topAverage } from "./leveling";

const M = "ai-weaken";

/** Zápisy v dávkách, aby se liga se 14 kluby vešla do jednoho požadavku Workeru. */
const BATCH_SIZE = 80;

export const MAX_WEAKEN_SHIFT = 20;

export interface WeakeningOptions {
  leagueId: string;
  /** O kolik bodů hodnocení klesne každý hráč. */
  shift: number;
  /** Strop rozpočtu AI klubu; `null` = rozpočty beze změny. */
  budgetCap: number | null;
}

export interface WeakenedClub {
  teamId: string;
  name: string;
  players: number;
  top11Before: number;
  top11After: number;
  budgetBefore: number;
  budgetAfter: number;
}

export interface UntouchedClub {
  teamId: string;
  name: string;
  reason: "human" | "taken-over";
  top11: number;
}

export interface WeakeningPlan {
  leagueId: string;
  shift: number;
  budgetCap: number | null;
  clubs: WeakenedClub[];
  untouched: UntouchedClub[];
}

export interface WeakeningResult {
  clubs: number;
  playersLowered: number;
  budgetsCapped: number;
  listingsWithdrawn: number;
  failedStatements: number;
}

interface TeamRow {
  id: string;
  name: string;
  user_id: string;
  budget: number | null;
  ai_former_user_id: string | null;
}

interface PlayerRow {
  id: string;
  team_id: string;
  position: string;
  overall_rating: number | null;
  skills: string | null;
  physical: string | null;
  skills_max: string | null;
  hidden_talent: number | null;
}

interface LoweredPlayer {
  id: string;
  teamId: string;
  skills: Record<string, unknown>;
  physical: Record<string, unknown>;
  skillsMax: Record<string, unknown>;
  rating: number;
}

function parseObject(raw: string | null, what: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${what})`, e);
    return {};
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

async function loadLeague(db: D1Database, leagueId: string): Promise<{ teams: TeamRow[]; players: PlayerRow[] }> {
  const teams = await db.prepare(
    `SELECT id, name, user_id, budget, ai_former_user_id FROM teams
      WHERE league_id = ? AND COALESCE(team_type, 'senior') = 'senior' ORDER BY name`,
  ).bind(leagueId).all<TeamRow>();
  // Hostující hráč patří jinému klubu: do síly klubu se počítá, oslabení se ho netýká.
  const players = await db.prepare(
    `SELECT p.id, p.team_id, p.position, p.overall_rating, p.skills, p.physical, p.skills_max, p.hidden_talent
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE t.league_id = ? AND COALESCE(t.team_type, 'senior') = 'senior'
        AND (p.status IS NULL OR p.status = 'active') AND p.loan_from_team_id IS NULL
      ORDER BY p.id`,
  ).bind(leagueId).all<PlayerRow>();
  return { teams: teams.results, players: players.results };
}

function isWeakened(t: TeamRow): boolean {
  return t.user_id === "ai" && !t.ai_former_user_id;
}

function computeWeakening(
  opts: WeakeningOptions, teams: TeamRow[], players: PlayerRow[],
): { plan: WeakeningPlan; lowered: LoweredPlayer[] } {
  const byTeam = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const list = byTeam.get(p.team_id);
    if (list) list.push(p);
    else byTeam.set(p.team_id, [p]);
  }

  const clubs: WeakenedClub[] = [];
  const untouched: UntouchedClub[] = [];
  const lowered: LoweredPlayer[] = [];
  for (const t of teams) {
    const squad = byTeam.get(t.id) ?? [];
    const before = squad.map((p) => p.overall_rating ?? 0);
    if (!isWeakened(t)) {
      untouched.push({ teamId: t.id, name: t.name, reason: t.user_id === "ai" ? "taken-over" : "human", top11: round1(topAverage(before, 11)) });
      continue;
    }
    const after: number[] = [];
    for (const p of squad) {
      const rating = p.overall_rating ?? 0;
      const next = lowerToRating({
        position: p.position,
        skills: parseObject(p.skills, `skills ${p.id}`),
        physical: parseObject(p.physical, `physical ${p.id}`),
        skillsMax: parseObject(p.skills_max, `skills_max ${p.id}`),
        hiddenTalent: p.hidden_talent ?? 0,
        rating,
      }, Math.max(1, rating - opts.shift));
      after.push(next.rating);
      if (next.rating < rating) {
        lowered.push({ id: p.id, teamId: t.id, skills: next.skills, physical: next.physical, skillsMax: next.skillsMax, rating: next.rating });
      }
    }
    const budget = t.budget ?? 0;
    clubs.push({
      teamId: t.id, name: t.name, players: squad.length,
      top11Before: round1(topAverage(before, 11)), top11After: round1(topAverage(after, 11)),
      budgetBefore: budget, budgetAfter: opts.budgetCap !== null ? Math.min(budget, opts.budgetCap) : budget,
    });
  }
  return { plan: { leagueId: opts.leagueId, shift: opts.shift, budgetCap: opts.budgetCap, clubs, untouched }, lowered };
}

export async function planWeakening(db: D1Database, opts: WeakeningOptions): Promise<WeakeningPlan> {
  const { teams, players } = await loadLeague(db, opts.leagueId);
  return computeWeakening(opts, teams, players).plan;
}

export async function applyWeakening(db: D1Database, opts: WeakeningOptions): Promise<{ plan: WeakeningPlan; result: WeakeningResult }> {
  const { teams, players } = await loadLeague(db, opts.leagueId);
  const { plan, lowered } = computeWeakening(opts, teams, players);
  const result: WeakeningResult = { clubs: plan.clubs.length, playersLowered: 0, budgetsCapped: 0, listingsWithdrawn: 0, failedStatements: 0 };

  type Kind = "player" | "listing" | "budget";
  const stmts: Array<{ kind: Kind; stmt: D1PreparedStatement }> = [];
  for (const p of lowered) {
    stmts.push({ kind: "player", stmt: db.prepare("UPDATE players SET skills = ?, physical = ?, skills_max = ?, overall_rating = ? WHERE id = ?")
      .bind(JSON.stringify(p.skills), JSON.stringify(p.physical), JSON.stringify(p.skillsMax), p.rating, p.id) });
    stmts.push({ kind: "listing", stmt: db.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE player_id = ? AND team_id = ? AND status = 'active'")
      .bind(p.id, p.teamId) });
  }
  for (const c of plan.clubs) {
    if (c.budgetAfter < c.budgetBefore) {
      stmts.push({ kind: "budget", stmt: db.prepare("UPDATE teams SET budget = MIN(budget, ?) WHERE id = ? AND user_id = 'ai' AND ai_former_user_id IS NULL")
        .bind(c.budgetAfter, c.teamId) });
    }
  }

  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const part = stmts.slice(i, i + BATCH_SIZE);
    const res = await db.batch(part.map((x) => x.stmt)).catch((e) => {
      logger.error({ module: M }, `oslabení ligy ${opts.leagueId}: dávka od příkazu ${i}`, e);
      return null;
    });
    if (!res) {
      result.failedStatements += part.length;
      continue;
    }
    res.forEach((r, j) => {
      const changes = r.meta?.changes ?? 0;
      if (part[j].kind === "player") result.playersLowered += changes;
      else if (part[j].kind === "listing") result.listingsWithdrawn += changes;
      else result.budgetsCapped += changes;
    });
  }
  logger.info({ module: M }, `oslabení ligy ${opts.leagueId} o ${opts.shift}: ${result.playersLowered} hráčů, ${result.budgetsCapped} rozpočtů, ${result.listingsWithdrawn} inzerátů, selhalo ${result.failedStatements}`);
  return { plan, result };
}
