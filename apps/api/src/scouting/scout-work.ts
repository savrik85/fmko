/**
 * Skaut na úkolu (spec 2026-10-04): manažer mu zadá post, věk, okruh a počet týdnů,
 * skaut každé pondělí objede 2–4 kluby mimo hru v okruhu a pošle nejvýš jedno hlášení.
 *
 * Brzdy balancu: kluby mimo hru mají stálé kádry podle velikosti obce (outside-clubs.ts),
 * hlásí se hráč s odhadem aspoň na jedenáctého nejlepšího v kádru (u mladých i to, kam do
 * dvou sezón doroste), cestovné každý týden, hlášení platí deset dní a mezitím hráče může
 * koupit jiný tým nebo ho sebrat klub mimo hru.
 */

import {
  SCOUT_AGE_MAX, SCOUT_AGE_MIN, SCOUT_POSITIONS, SCOUT_WEEKS_OPTIONS, isYouthScoutTask,
  scoutWeeklyCost, willingnessFromChance, SCOUT_LEAGUE_WEEKLY_COST, SCOUT_POSITION_LABELS, PLAN_TACTIC_LABELS,
} from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { recordTransaction } from "../season/finance-processor";
import { logger } from "../lib/logger";
import { stableSeed } from "../lib/scout-estimate";
import { initAiSellerState } from "../transfers/ai-seller";
import { estimateWillingness, expireNegotiation, type AiNegotiationRow, type PushEnv } from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { haversineKm } from "../transfers/player-agency";
import { boundingBox, loadVillagesInRadius, pickClubsToVisit, villageClubName, type VillageInRange } from "./candidates";
import { blurredAskHint, blurredWillingness, potentialRange, rangeMid, ratingRange, type Range } from "./fog";
import { projectRating } from "./youth-growth";
import { isFromAbroad } from "./foreign";
import { OPPONENT_ANALYSIS_BONUS_DAYS, OPPONENT_ANALYSIS_MORALE_BONUS, OPPONENT_ANALYSIS_TECHNIQUE_BONUS } from "./opponent-analysis";
import { GAME_PLAYER_ID_SQL, gamePlayerIdOf, type ScoutReportPlayerData } from "./game-player-report";
import { activeSeasonNumber, loadOutsideSquad, outsideClubValuation, type OutsideSquad } from "./outside-clubs";
import { emptyWeekSms, finishedSms, reportCons, reportPros, reportSms, revisitSms, type ReportSubject } from "./report-text";

/** Hlášení platí deset dní (odhad, spec). */
export const SCOUT_REPORT_TTL_DAYS = 10;
/** Opakovaná návštěva prodlouží platnost hlášení o týden. */
const REVISIT_EXTEND_DAYS = 7;
/** Cestovné jednorázové mise (sledování hráče, rozbor soupeře). */
export const SCOUT_MISSION_COST = 500;
/** Za kolik herních dní skaut misi odvede (slibuje to i formulář: „Doba mise: 2 dny“). */
export const SCOUT_MISSION_DAYS = 2;
/** Denní šance, že hráče z hlášení sebere jiný klub (odhad, spec). */
export const SCOUT_SNAP_UP_DAILY_CHANCE = 0.03;
/** Názor na potenciál dává skaut jen u mladých; u dospělých by model růstu sliboval nesmysly. */
const POTENTIAL_MAX_AGE = 21;
/** Za kolik sezón musí nadějný mladík dorůst na sestavu, aby ho skaut nahlásil. */
const PROMISING_SEASONS = 2;

export interface AssignmentRow {
  id: string;
  team_id: string;
  staff_id: string;
  assignment_type?: "area" | "player" | "match" | "u21_league" | "league";
  target_player_id?: string | null;
  target_team_id?: string | null;
  target_match_id?: string | null;
  target_league_id?: string | null;
  result_data?: string | null;
  position: string | null;
  /** JSON pole postů (víc postů najednou); NULL = podle starého `position`, případně kdokoli. */
  positions: string | null;
  age_min: number;
  age_max: number;
  radius_km: number;
  weekly_cost: number;
  weeks_total: number;
  weeks_worked: number;
  last_work_game_date: string | null;
  reports_sent: number;
  clubs_visited: number;
  revisit_report_id: string | null;
  status: "active" | "finished" | "cancelled";
  end_reason: string | null;
  started_game_date: string;
  created_at: string;
  closed_at: string | null;
}

interface ScoutRow {
  id: string; first_name: string; last_name: string; judgement: number; communication: number; avatar?: string | null;
}

type Fail = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });

export function scoutEffectiveness(s: { judgement: number; communication: number }): number {
  return (2 * (s.judgement ?? 5) + (s.communication ?? 5)) / 3;
}

export async function loadTeamScouts(db: D1Database, teamId: string): Promise<ScoutRow[]> {
  const res = await db.prepare(
    "SELECT id, first_name, last_name, judgement, communication, avatar FROM staff_members WHERE team_id = ? AND role = 'skaut' ORDER BY hired_at ASC",
  ).bind(teamId).all<ScoutRow>().catch((e) => { logger.warn({ module: "scouting" }, "load scouts", e); return { results: [] as ScoutRow[] }; });
  return res.results;
}

export async function loadTeamScout(db: D1Database, teamId: string, staffId?: string): Promise<ScoutRow | null> {
  if (staffId) {
    return db.prepare(
      "SELECT id, first_name, last_name, judgement, communication, avatar FROM staff_members WHERE team_id = ? AND role = 'skaut' AND id = ? LIMIT 1",
    ).bind(teamId, staffId).first<ScoutRow>().catch((e) => { logger.warn({ module: "scouting" }, "load scout by id", e); return null; });
  }
  return db.prepare(
    "SELECT id, first_name, last_name, judgement, communication, avatar FROM staff_members WHERE team_id = ? AND role = 'skaut' ORDER BY hired_at ASC LIMIT 1",
  ).bind(teamId).first<ScoutRow>().catch((e) => { logger.warn({ module: "scouting" }, "load scout", e); return null; });
}

export async function loadActiveAssignments(db: D1Database, teamId: string): Promise<AssignmentRow[]> {
  const res = await db.prepare("SELECT * FROM scout_assignments WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<AssignmentRow>().catch((e) => { logger.warn({ module: "scouting" }, "load active assignments", e); return { results: [] as AssignmentRow[] }; });
  return res.results;
}

export async function loadActiveAssignment(db: D1Database, teamId: string, staffId?: string): Promise<AssignmentRow | null> {
  if (staffId) {
    return db.prepare("SELECT * FROM scout_assignments WHERE team_id = ? AND staff_id = ? AND status = 'active' LIMIT 1")
      .bind(teamId, staffId).first<AssignmentRow>().catch((e) => { logger.warn({ module: "scouting" }, "load active assignment for staff", e); return null; });
  }
  return db.prepare("SELECT * FROM scout_assignments WHERE team_id = ? AND status = 'active' LIMIT 1")
    .bind(teamId).first<AssignmentRow>().catch((e) => { logger.warn({ module: "scouting" }, "load active assignment", e); return null; });
}

// ─── Zadání a zrušení úkolu ─────────────────────────────────────────────────

/**
 * Posty úkolu jako seznam. Prázdný seznam nebo všechny čtyři = kdokoli (null).
 * Neznámý post = chyba (vrací `false`).
 */
export function normalizePositions(input: readonly unknown[] | null | undefined): string[] | null | false {
  if (!input || input.length === 0) return null;
  const uniq = [...new Set(input)];
  if (uniq.some((p) => typeof p !== "string" || !(SCOUT_POSITIONS as readonly string[]).includes(p))) return false;
  if (uniq.length >= SCOUT_POSITIONS.length) return null;
  return SCOUT_POSITIONS.filter((p) => uniq.includes(p));
}

/** Posty, které skaut na úkolu hledá; null = kdokoli. Starší úkoly mají jen jeden `position`. */
export function assignmentPositions(a: Pick<AssignmentRow, "position" | "positions">): string[] | null {
  if (a.positions) {
    try {
      const list = JSON.parse(a.positions) as string[];
      return list.length > 0 ? list : null;
    } catch (e) {
      logger.warn({ module: "scouting" }, "parse positions úkolu", e);
    }
  }
  return a.position ? [a.position] : null;
}

export async function createScoutAssignment(db: D1Database, input: {
  teamId: string; staffId?: string; positions: readonly unknown[] | null; ageMin: number; ageMax: number; radiusKm: number; weeks: number; gameDate: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const scout = await loadTeamScout(db, input.teamId, input.staffId);
  if (!scout) return fail(400, "Nemáš skauta. Najmi ho v Zaměstnancích.");
  const active = await loadActiveAssignment(db, input.teamId, scout.id);
  if (active) return fail(409, "Tento skaut už na jednom úkolu je. Nejdřív ho ukonči.");
  const positions = normalizePositions(input.positions);
  if (positions === false) return fail(400, "Neznámý post.");
  const weeklyCost = scoutWeeklyCost(input.radiusKm);
  if (weeklyCost === null) return fail(400, "Neznámý okruh.");
  if (!(SCOUT_WEEKS_OPTIONS as readonly number[]).includes(input.weeks)) return fail(400, "Neznámá délka úkolu.");
  if (!Number.isInteger(input.ageMin) || !Number.isInteger(input.ageMax)
    || input.ageMin < SCOUT_AGE_MIN || input.ageMax > SCOUT_AGE_MAX || input.ageMin > input.ageMax) {
    return fail(400, `Věk musí být ${SCOUT_AGE_MIN}–${SCOUT_AGE_MAX} a „od“ nejvýš „do“.`);
  }
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO scout_assignments (id, team_id, staff_id, assignment_type, position, positions, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date)
       VALUES (?, ?, ?, 'area', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.teamId, scout.id, positions?.length === 1 ? positions[0] : null, positions ? JSON.stringify(positions) : null,
      input.ageMin, input.ageMax, input.radiusKm, weeklyCost, input.weeks, input.gameDate).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "zadání úkolu", e);
    return fail(409, "Skaut už na jednom úkolu je. Nejdřív ho ukonči.");
  }
  return { ok: true, id };
}

export async function createPlayerScoutAssignment(db: D1Database, input: {
  teamId: string; staffId?: string; targetPlayerId: string; gameDate: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const scout = await loadTeamScout(db, input.teamId, input.staffId);
  if (!scout) return fail(400, "Nemáš skauta. Najmi ho v Zaměstnancích.");
  const active = await loadActiveAssignment(db, input.teamId, scout.id);
  if (active) return fail(409, "Tento skaut už na jednom úkolu je. Nejdřív ho ukonči.");

  const player = await db.prepare("SELECT id, first_name, last_name, team_id FROM players WHERE id = ?")
    .bind(input.targetPlayerId).first<{ id: string; first_name: string; last_name: string; team_id: string | null }>();
  if (!player) return fail(404, "Hráč nenalezen.");
  if (player.team_id === input.teamId) return fail(400, "Nemůžeš skautovat vlastního hráče.");

  const cost = SCOUT_MISSION_COST;
  const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(input.teamId).first<{ budget: number }>();
  if (!budget || budget.budget < cost) return fail(400, "V pokladně není dost peněz na cestovné (500 Kč).");

  // Cestovné se strhne, až skaut práci odvede (workMission), ne při zadání.
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO scout_assignments (id, team_id, staff_id, assignment_type, target_player_id, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date)
       VALUES (?, ?, ?, 'player', ?, 0, 99, 0, ?, 1, ?)`,
    ).bind(id, input.teamId, scout.id, player.id, cost, input.gameDate).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "zadání hráčského úkolu", e);
    return fail(409, "Skaut už na jednom úkolu je.");
  }
  return { ok: true, id };
}

export async function createMatchScoutAssignment(db: D1Database, input: {
  teamId: string; staffId?: string; targetTeamId: string; targetMatchId?: string | null; gameDate: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const scout = await loadTeamScout(db, input.teamId, input.staffId);
  if (!scout) return fail(400, "Nemáš skauta. Najmi ho v Zaměstnancích.");
  const active = await loadActiveAssignment(db, input.teamId, scout.id);
  if (active) return fail(409, "Tento skaut už na jednom úkolu je. Nejdřív ho ukonči.");

  if (input.targetTeamId === input.teamId) return fail(400, "Nemůžeš skautovat vlastní tým.");
  const opp = await db.prepare("SELECT id, name FROM teams WHERE id = ?").bind(input.targetTeamId).first<{ id: string; name: string }>();
  if (!opp) return fail(404, "Soupeř nenalezen.");

  const cost = SCOUT_MISSION_COST;
  const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(input.teamId).first<{ budget: number }>();
  if (!budget || budget.budget < cost) return fail(400, "V pokladně není dost peněz na cestovné (500 Kč).");

  // Cestovné se strhne, až skaut rozbor odvede (workMission), ne při zadání.
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO scout_assignments (id, team_id, staff_id, assignment_type, target_team_id, target_match_id, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date)
       VALUES (?, ?, ?, 'match', ?, ?, 0, 99, 0, ?, 1, ?)`,
    ).bind(id, input.teamId, scout.id, opp.id, input.targetMatchId ?? null, cost, input.gameDate).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "zadání zápasového úkolu", e);
    return fail(409, "Skaut už na jednom úkolu je.");
  }
  return { ok: true, id };
}

export async function createLeagueScoutAssignment(db: D1Database, input: {
  teamId: string;
  staffId?: string;
  assignmentType: "u21_league" | "league";
  targetLeagueId?: string;
  positions?: readonly unknown[] | null;
  weeks: number;
  gameDate: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const scout = await loadTeamScout(db, input.teamId, input.staffId);
  if (!scout) return fail(400, "Nemáš skauta. Najmi ho v Zaměstnancích.");
  const active = await loadActiveAssignment(db, input.teamId, scout.id);
  if (active) return fail(409, "Tento skaut už na jednom úkolu je. Nejdřív ho ukonči.");

  let targetLeagueId = input.targetLeagueId;
  if (!targetLeagueId) {
    if (input.assignmentType === "u21_league") {
      const u21Team = await db.prepare("SELECT league_id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
        .bind(input.teamId).first<{ league_id: string }>();
      targetLeagueId = u21Team?.league_id;
    } else {
      const seniorTeam = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
        .bind(input.teamId).first<{ league_id: string }>();
      targetLeagueId = seniorTeam?.league_id;
    }
  }
  if (!targetLeagueId) {
    return fail(404, input.assignmentType === "u21_league" ? "Tvůj klub nemá U21 tým ani U21 ligu." : "Liga nenalezena.");
  }

  const league = await db.prepare("SELECT id, name FROM leagues WHERE id = ?")
    .bind(targetLeagueId).first<{ id: string; name: string }>();
  if (!league) return fail(404, "Soutěž nenalezena.");

  const positions = normalizePositions(input.positions);
  if (positions === false) return fail(400, "Neznámý post.");

  const weeklyCost = SCOUT_LEAGUE_WEEKLY_COST;
  if (!(SCOUT_WEEKS_OPTIONS as readonly number[]).includes(input.weeks as any)) return fail(400, "Neznámá délka úkolu.");

  const ageMin = input.assignmentType === "u21_league" ? 16 : 18;
  const ageMax = input.assignmentType === "u21_league" ? 21 : 36;

  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO scout_assignments
        (id, team_id, staff_id, assignment_type, target_league_id, position, positions, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(
      id, input.teamId, scout.id, input.assignmentType, targetLeagueId,
      positions?.length === 1 ? positions[0] : null, positions ? JSON.stringify(positions) : null,
      ageMin, ageMax, weeklyCost, input.weeks, input.gameDate,
    ).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "zadání ligového úkolu", e);
    return fail(409, "Skaut už na jednom úkolu je.");
  }
  return { ok: true, id };
}

export async function cancelScoutAssignment(db: D1Database, teamId: string, reason: string, staffId?: string): Promise<boolean> {
  const query = staffId
    ? "UPDATE scout_assignments SET status = 'cancelled', end_reason = ?, revisit_report_id = NULL, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE team_id = ? AND staff_id = ? AND status = 'active'"
    : "UPDATE scout_assignments SET status = 'cancelled', end_reason = ?, revisit_report_id = NULL, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE team_id = ? AND status = 'active'";
  const binds = staffId ? [reason, teamId, staffId] : [reason, teamId];
  const res = await db.prepare(query).bind(...binds).run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Skaut se má na hráče z hlášení podívat znovu (místo hledání nových, příští pondělí). */
export async function requestRevisit(db: D1Database, teamId: string, reportId: string): Promise<{ ok: true } | Fail> {
  const report = await db.prepare("SELECT id, status FROM scout_reports WHERE id = ? AND team_id = ?").bind(reportId, teamId)
    .first<{ id: string; status: string }>();
  if (!report) return fail(404, "Hlášení nenalezeno.");
  if (report.status !== "active" && report.status !== "negotiating") return fail(409, "Hlášení už neplatí.");
  const res = await db.prepare(
    "UPDATE scout_assignments SET revisit_report_id = ? WHERE team_id = ? AND status = 'active' AND revisit_report_id IS NULL",
  ).bind(reportId, teamId).run();
  if ((res.meta?.changes ?? 0) === 0) {
    const a = await loadActiveAssignment(db, teamId);
    return fail(409, a ? "Skaut už má na příští týden jednu návštěvu naplánovanou." : "Skaut teď nemá úkol. Znovu se podívá jen během úkolu.");
  }
  return { ok: true };
}

// ─── SMS od skauta ──────────────────────────────────────────────────────────

async function sendScoutSms(db: D1Database, teamId: string, sender: string, body: string, reportId?: string): Promise<void> {
  try {
    let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Skaut'")
      .bind(teamId).first<{ id: string }>().then((r) => r?.id ?? null);
    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', 'Skaut', 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      ).bind(convId, teamId).run();
    }
    const metadata = reportId ? { type: "scout_report", reportId } : { type: "staff" };
    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), convId, sender, body, JSON.stringify(metadata)).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(body.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "SMS od skauta", e);
  }
}

/** Post do SMS česky („záložník“), ne zkratkou MID. */
function postLabel(position: string): string {
  return (SCOUT_POSITION_LABELS[position as keyof typeof SCOUT_POSITION_LABELS] ?? position).toLowerCase();
}

/** Kolik km je obec cizího týmu od obce klubu; bez souřadnic 0. */
async function distanceFromClub(db: D1Database, teamId: string, lat: number | null, lng: number | null): Promise<number> {
  if (lat == null || lng == null) return 0;
  const home = await db.prepare("SELECT v.lat, v.lng FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?")
    .bind(teamId).first<{ lat: number; lng: number }>();
  return home ? Math.round(haversineKm(home.lat, home.lng, lat, lng)) : 0;
}

// ─── Týdenní práce ──────────────────────────────────────────────────────────

/** Jedenáctý nejlepší v kádru: kdo je pod ním, do sestavy se nedostane. */
async function lineupBar(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
     ORDER BY overall_rating DESC LIMIT 1 OFFSET 10`,
  ).bind(teamId).first<{ overall_rating: number }>();
  if (row) return row.overall_rating;
  const min = await db.prepare("SELECT MIN(overall_rating) AS r FROM players WHERE team_id = ?").bind(teamId).first<{ r: number | null }>();
  return min?.r ?? 0;
}

/** Průměr základní jedenáctky (laťka pro mladé: musí mít na to dotáhnout se do ní). */
async function lineupAverage(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT AVG(overall_rating) AS avg FROM (SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
       ORDER BY overall_rating DESC LIMIT 11)`,
  ).bind(teamId).first<{ avg: number | null }>();
  return Math.round(row?.avg ?? 0);
}

interface Candidate {
  id: string;
  source: "village_club" | "free_agent";
  player: VirtualPlayerData;
  rating: number;
  talent: number;
  skillsMax: Record<string, { current: number; maxPotential: number }>;
  village: { id: string | null; name: string; district: string; lat: number; lng: number } | null;
  clubName: string | null;
  clubMean: number | null;
  clubRank: number | null;
  distanceKm: number;
  freeAgentId: string | null;
  /** Hráč stálého kádru klubu mimo hru (`outside_players.id`); u něj je `id` totéž. */
  outsidePlayerId: string | null;
  ratingRange: Range;
  potential: Range | null;
  estimate: number;
}

export interface ScoutWorkResult { teams: number; reports: number; revisits: number; finished: number; skippedNoMoney: number }

/** Jednorázová mise (sledování hráče, rozbor soupeře), na rozdíl od týdenních úkolů. */
function isMission(a: Pick<AssignmentRow, "assignment_type">): boolean {
  return a.assignment_type === "player" || a.assignment_type === "match";
}

/** Je mise zadaná aspoň před `SCOUT_MISSION_DAYS` herními dny? */
function missionDue(a: Pick<AssignmentRow, "started_game_date">, gameDate: string): boolean {
  const start = Date.parse(`${(a.started_game_date ?? "").slice(0, 10)}T12:00:00Z`);
  const today = Date.parse(`${gameDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(today)) return true;
  return Math.round((today - start) / 86_400_000) >= SCOUT_MISSION_DAYS;
}

/**
 * Práce skautů na úkolech. Týdenní úkoly (oblast, ligy) pracují v pondělí, mise den, kdy
 * od zadání uplynou `SCOUT_MISSION_DAYS` dny (`missionsOnly` = denní běh jen pro mise).
 * Idempotentní přes `last_work_game_date`; `force` (admin testování) pracuje znovu i týž
 * den a mise nečeká.
 */
export async function runScoutWork(
  env: Pick<Bindings, "DB">, opts: { gameDate: string; teamId?: string; force?: boolean; missionsOnly?: boolean },
): Promise<ScoutWorkResult> {
  const db = env.DB;
  const day = opts.gameDate.slice(0, 10);
  const result: ScoutWorkResult = { teams: 0, reports: 0, revisits: 0, finished: 0, skippedNoMoney: 0 };
  const rows = await db.prepare(
    `SELECT * FROM scout_assignments WHERE status = 'active'${opts.teamId ? " AND team_id = ?" : ""}`
      + (opts.missionsOnly ? " AND assignment_type IN ('player','match')" : ""),
  ).bind(...(opts.teamId ? [opts.teamId] : [])).all<AssignmentRow>()
    .catch((e) => { logger.warn({ module: "scouting" }, "načtení úkolů", e); return { results: [] as AssignmentRow[] }; });

  for (const a of rows.results) {
    if (isMission(a) && !opts.force && !missionDue(a, opts.gameDate)) continue;
    try {
      const claim = await db.prepare(
        `UPDATE scout_assignments SET last_work_game_date = ? WHERE id = ? AND status = 'active'
           AND (last_work_game_date IS NULL OR last_work_game_date != ? OR ? = 1)`,
      ).bind(day, a.id, day, opts.force ? 1 : 0).run();
      if ((claim.meta?.changes ?? 0) === 0) continue;
      result.teams++;
      await workOneWeek(db, a, opts.gameDate, result);
    } catch (e) {
      // Cestovné se strhává až po odvedené práci, takže spadlá práce nic nestojí. Úkol zůstává
      // aktivní a skaut to zkusí při dalším běhu.
      logger.error({ module: "scouting", teamId: a.team_id }, `práce skauta ${a.id} (${a.assignment_type ?? "area"}) spadla, cestovné se nestrhlo`, e);
    }
  }
  return result;
}

/**
 * Jednorázová mise (sledování hráče, rozbor soupeře). Cestovné se strhne až po odvedené
 * práci. Starší mise se platily už při zadání, ty se podruhé neplatí.
 */
async function workMission(db: D1Database, a: AssignmentRow, scout: ScoutRow, gameDate: string, sender: string, result: ScoutWorkResult): Promise<void> {
  const prepaid = await db.prepare(
    "SELECT 1 AS paid FROM transactions WHERE team_id = ? AND type = 'scout_travel' AND reference_id = ? LIMIT 1",
  ).bind(a.team_id, a.id).first<{ paid: number }>();
  if (!prepaid) {
    const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(a.team_id).first<{ budget: number }>();
    if (!budget || budget.budget < a.weekly_cost) {
      result.skippedNoMoney++;
      await db.prepare(
        "UPDATE scout_assignments SET status = 'cancelled', end_reason = 'no_money', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND status = 'active'",
      ).bind(a.id).run();
      await sendScoutSms(db, a.team_id, sender,
        `⛽ Na cestovné (${a.weekly_cost.toLocaleString("cs-CZ")} Kč) v klubu nejsou peníze, takže nikam nejedu. Úkol ruším, zadej ho znovu, až peníze budou.`);
      return;
    }
  }
  const travel = a.assignment_type === "player"
    ? await evaluatePlayerMission(db, a, scout, gameDate, sender)
    : await evaluateMatchMission(db, a, scout, gameDate, sender);
  if (!travel) return;
  if (!prepaid) await recordTransaction(db, a.team_id, "scout_travel", -a.weekly_cost, travel, gameDate, a.id);
  result.reports++;
  result.finished++;
}

/** Hlášení o hráči. Vrací popis cestovného, `null` když hráč už ve hře není (mise zrušena). */
async function evaluatePlayerMission(
  db: D1Database,
  a: AssignmentRow,
  scout: ScoutRow,
  gameDate: string,
  sender: string,
): Promise<string | null> {
  // Hráč obec nemá, má ji jeho klub (players.village_id neexistuje).
  const player = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.hidden_talent,
            p.skills, p.physical, p.skills_max, p.personality, p.avatar,
            t.village_id, v.name AS club_city, v.district, v.lat, v.lng, t.name AS club_name
     FROM players p
     LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN villages v ON v.id = t.village_id
     WHERE p.id = ?`,
  ).bind(a.target_player_id).first<{
    id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number;
    hidden_talent: number | null; skills: string | null; physical: string | null; skills_max: string | null;
    personality: string | null; avatar: string | null; village_id: string | null; club_city: string | null;
    district: string | null; lat: number | null; lng: number | null; club_name: string | null;
  }>();

  if (!player) {
    await db.prepare("UPDATE scout_assignments SET status = 'cancelled', end_reason = 'player_gone', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(a.id).run();
    return null;
  }

  const eff = scoutEffectiveness(scout);
  const rr = ratingRange(player.overall_rating, eff, 2, a.id);
  const pr = player.age <= POTENTIAL_MAX_AGE
    ? potentialRange({
        age: player.age,
        rating: player.overall_rating,
        position: player.position,
        talent: player.hidden_talent ?? 0,
        skillsMax: player.skills_max ? JSON.parse(player.skills_max) : {},
      }, eff, 2, a.id)
    : null;

  let pers: Record<string, number> = {};
  try { pers = player.personality ? JSON.parse(player.personality) : {}; } catch (e) { logger.warn({ module: "scouting" }, "neplatná povaha hráče v hlášení", e); }
  const pros: string[] = [];
  const cons: string[] = [];
  if ((pers.workRate ?? 50) >= 65) pros.push("Dříč na tréninku, nevypustí souboj.");
  if ((pers.loyalty ?? 50) >= 65) pros.push("Loajální srdcař, drží partu.");
  if ((pers.alcohol ?? 0) >= 60) cons.push("V pátek rád zajde na pivo, bývá to znát.");
  if ((pers.temper ?? 50) >= 70) cons.push("Horká hlava, hrozí zbytečné karty.");
  if (pros.length === 0) pros.push("Spolehlivý fotbalista pro týmovou souhru.");
  if (cons.length === 0) cons.push("Žádné výrazné slabiny v přístupu.");

  const reportId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SCOUT_REPORT_TTL_DAYS * 86_400_000).toISOString();
  // Hráč hraje ve hře: hlášení vede na jeho profil a běžnou nabídku (game-player-report.ts),
  // proto bez ceny a ochoty klubu mimo hru.
  const pData: ScoutReportPlayerData = {
    gamePlayerId: player.id,
    firstName: player.first_name,
    lastName: player.last_name,
    age: player.age,
    position: player.position,
    overallRating: player.overall_rating,
    hiddenTalent: player.hidden_talent ?? 0,
    skills: player.skills ? JSON.parse(player.skills) : {},
    skillCaps: player.skills_max ? JSON.parse(player.skills_max) : {},
    avatar: player.avatar ? JSON.parse(player.avatar) : {},
    physical: player.physical ? JSON.parse(player.physical) : {},
    personality: pers,
    fromTeam: player.club_name ?? undefined,
    fromCity: player.club_city ?? undefined,
    fromDistrict: player.district ?? undefined,
  };
  const distanceKm = await distanceFromClub(db, a.team_id, player.lat, player.lng);

  await db.prepare(
    `INSERT INTO scout_reports (id, team_id, assignment_id, source, village_id, club_name, club_city, district, distance_km,
       player_data, first_name, last_name, age, position, rating_lo, rating_hi, potential_lo, potential_hi, visits,
       pros, cons, willingness, status, expires_at, created_game_date)
     VALUES (?, ?, ?, 'village_club', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, NULL, 'active', ?, ?)`,
  ).bind(
    reportId, a.team_id, a.id, player.village_id, player.club_name ?? "Cizí klub", player.club_city, player.district ?? "Okres", distanceKm,
    JSON.stringify(pData), player.first_name, player.last_name, player.age, player.position,
    rr.lo, rr.hi, pr?.lo ?? null, pr?.hi ?? null, JSON.stringify(pros), JSON.stringify(cons), expiresAt, gameDate.slice(0, 10),
  ).run();

  await db.prepare(
    `UPDATE scout_assignments SET status = 'finished', end_reason = 'done', reports_sent = 1, weeks_worked = 1,
       closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
  ).bind(a.id).run();

  const club = player.club_name ? `, ${player.club_name}` : "";
  await sendScoutSms(db, a.team_id, sender,
    `🔍 Byl jsem se podívat na hráče ${player.first_name} ${player.last_name} (${postLabel(player.position)}${club}). `
      + `Hodnocení odhaduju na ${rr.lo} až ${rr.hi}. Hlášení máš na stole, nabídku mu pošleš z jeho profilu.`,
    reportId,
  );
  return `Cestovné skauta: sledování hráče ${player.first_name} ${player.last_name}`;
}

/** Rozbor soupeře. Vrací popis cestovného, `null` když soupeř už ve hře není (mise zrušena). */
async function evaluateMatchMission(
  db: D1Database,
  a: AssignmentRow,
  scout: ScoutRow,
  gameDate: string,
  sender: string,
): Promise<string | null> {
  const opp = await db.prepare("SELECT id, name FROM teams WHERE id = ?").bind(a.target_team_id).first<{ id: string; name: string }>();
  if (!opp) {
    await db.prepare("UPDATE scout_assignments SET status = 'cancelled', end_reason = 'team_gone', closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(a.id).run();
    return null;
  }
  // Rozestavení tým nemá ve `teams`, je v sestavě. Přednost má poslední uložená ručně
  // (automatická nemá `submitted_at`, řadí se na konec), bez sestavy výchozí 4-4-2.
  const lineup = await db.prepare(
    "SELECT formation, tactic FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC, id ASC LIMIT 1",
  ).bind(opp.id).first<{ formation: string | null; tactic: string | null }>();

  const topPlayer = await db.prepare(
    "SELECT first_name, last_name, position, overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC LIMIT 1",
  ).bind(opp.id).first<{ first_name: string; last_name: string; position: string; overall_rating: number }>();

  const weakPlayer = await db.prepare(
    `SELECT first_name, last_name, position, overall_rating FROM players
     WHERE team_id = ? AND (status IS NULL OR status = 'active')
     ORDER BY overall_rating ASC LIMIT 1`,
  ).bind(opp.id).first<{ first_name: string; last_name: string; position: string; overall_rating: number }>();

  const formation = lineup?.formation ?? "4-4-2";
  const tactic = PLAN_TACTIC_LABELS[(lineup?.tactic ?? "balanced") as keyof typeof PLAN_TACTIC_LABELS] ?? PLAN_TACTIC_LABELS.balanced;
  const keyDesc = topPlayer ? `${topPlayer.first_name} ${topPlayer.last_name} (${postLabel(topPlayer.position)}, hodnocení ${topPlayer.overall_rating})` : "vyrovnaný kádr";
  const weakDesc = weakPlayer ? `${weakPlayer.first_name} ${weakPlayer.last_name} (${postLabel(weakPlayer.position)})` : "bez výrazné díry";

  // Bonus do zápasu čte equipment/match-mods.ts podle hotového úkolu (opponent-analysis.ts),
  // tady se jen zapíše, co rozbor dal a do kdy platí.
  const bonusUntil = new Date(Date.now() + OPPONENT_ANALYSIS_BONUS_DAYS * 86_400_000);
  const resultData = JSON.stringify({
    opponentId: opp.id,
    opponentName: opp.name,
    formation,
    tactic,
    keyPlayer: keyDesc,
    weakPlayer: weakDesc,
    techniqueBonus: OPPONENT_ANALYSIS_TECHNIQUE_BONUS,
    moraleBonus: OPPONENT_ANALYSIS_MORALE_BONUS,
    bonusUntil: bonusUntil.toISOString(),
  });

  await db.prepare(
    `UPDATE scout_assignments SET status = 'finished', end_reason = 'done', reports_sent = 1, weeks_worked = 1,
       result_data = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
  ).bind(resultData, a.id).run();

  const until = bonusUntil.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
  await sendScoutSms(db, a.team_id, sender,
    `📋 Taktický rozbor soupeře ${opp.name} je hotový. Hrají ${formation} a taktiku „${tactic}“. `
      + `Nejvíc si hlídejte: ${keyDesc}. Slabé místo: ${weakDesc}. `
      + `Na ligový zápas s nimi do ${until} máme navrch: +${OPPONENT_ANALYSIS_TECHNIQUE_BONUS} technika a +${OPPONENT_ANALYSIS_MORALE_BONUS} morálka.`,
  );
  return `Cestovné skauta: zápasový rozbor soupeře ${opp.name}`;
}

async function workOneWeek(db: D1Database, a: AssignmentRow, gameDate: string, result: ScoutWorkResult): Promise<void> {
  const scout = await db.prepare(
    "SELECT id, first_name, last_name, judgement, communication, avatar FROM staff_members WHERE id = ? AND team_id = ? AND role = 'skaut'",
  ).bind(a.staff_id, a.team_id).first<ScoutRow>();
  if (!scout) {
    await cancelScoutAssignment(db, a.team_id, "scout_left", a.staff_id);
    return;
  }
  const sender = `${scout.first_name} ${scout.last_name}`;

  if (isMission(a)) {
    await workMission(db, a, scout, gameDate, sender, result);
    return;
  }

  const eff = scoutEffectiveness(scout);
  const rng = createRng(cryptoSeed());

  const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(a.team_id).first<{ budget: number }>();
  let worked = false;
  let visited = 0;
  let reported = 0;
  if (!budget || budget.budget < a.weekly_cost) {
    result.skippedNoMoney++;
    await sendScoutSms(db, a.team_id, sender, `⛽ Na cestovné (${a.weekly_cost.toLocaleString("cs-CZ")} Kč) v klubu nejsou peníze. Tenhle týden zůstávám doma.`);
  } else {
    // Nejdřív práce, cestovné až po ní: když práce spadne, výjimka sem nedojde a tým nic
    // nezaplatí (dřív se strhávalo předem a ligové úkoly platily týdny bez jediné práce).
    if (a.revisit_report_id && await revisit(db, a, eff, sender)) {
      result.revisits++;
    } else if (a.assignment_type === "u21_league" || a.assignment_type === "league") {
      const found = await searchLeague(db, a, eff, sender, rng, gameDate);
      visited = found.visited;
      reported = found.reported ? 1 : 0;
      result.reports += reported;
    } else {
      const found = await search(db, a, eff, sender, rng, gameDate);
      visited = found.visited;
      reported = found.reported ? 1 : 0;
      result.reports += reported;
    }
    const travelDesc = a.assignment_type === "u21_league"
      ? "Cestovné skauta (U21 liga)"
      : a.assignment_type === "league"
        ? "Cestovné skauta (A-tým liga)"
        : `Cestovné skauta (okruh ${a.radius_km} km)`;
    await recordTransaction(db, a.team_id, "scout_travel", -a.weekly_cost, travelDesc, gameDate, a.id);
    worked = true;
  }

  const weeksWorked = a.weeks_worked + 1;
  const finished = weeksWorked >= a.weeks_total;
  await db.prepare(
    `UPDATE scout_assignments SET weeks_worked = ?, clubs_visited = clubs_visited + ?, reports_sent = reports_sent + ?,
       revisit_report_id = CASE WHEN ? = 1 THEN NULL ELSE revisit_report_id END,
       status = CASE WHEN ? = 1 THEN 'finished' ELSE status END,
       end_reason = CASE WHEN ? = 1 THEN 'done' ELSE end_reason END,
       closed_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%SZ','now') ELSE closed_at END
     WHERE id = ?`,
  ).bind(weeksWorked, visited, reported, worked ? 1 : 0, finished ? 1 : 0, finished ? 1 : 0, finished ? 1 : 0, a.id).run();
  if (finished) {
    result.finished++;
    await sendScoutSms(db, a.team_id, sender, finishedSms(a.clubs_visited + visited, a.reports_sent + reported));
  }
}

async function revisit(db: D1Database, a: AssignmentRow, eff: number, sender: string): Promise<boolean> {
  const r = await db.prepare(
    "SELECT id, player_data, visits, age, position, expires_at, source, club_rank, outside_player_id FROM scout_reports WHERE id = ? AND team_id = ? AND status IN ('active','negotiating')",
  ).bind(a.revisit_report_id, a.team_id).first<{ id: string; player_data: string; visits: number; age: number; position: string; expires_at: string; source: string; club_rank: number | null; outside_player_id: string | null }>();
  if (!r) return false;
  // Mlha i cena klubu se odvozují od hráče, ne od hlášení (u stálého kádru se liší).
  const seedKey = r.outside_player_id ?? r.id;
  let player: VirtualPlayerData;
  try { player = JSON.parse(r.player_data) as VirtualPlayerData; } catch (e) {
    logger.warn({ module: "scouting" }, "parse player_data při návštěvě", e);
    return false;
  }
  const visits = r.visits + 1;
  const rr = ratingRange(player.overallRating, eff, visits, seedKey);
  const pr = r.age <= POTENTIAL_MAX_AGE
    ? potentialRange({
      age: r.age, rating: player.overallRating, position: r.position, talent: player.hiddenTalent ?? 0, skillsMax: player.skillCaps ?? {},
    }, eff, visits, seedKey)
    : null;
  const extended = new Date(Math.max(new Date(r.expires_at).getTime(), Date.now() + REVISIT_EXTEND_DAYS * 86_400_000)).toISOString();
  // Další návštěva zpřesní i odhad ceny. Hráč ve hře cenu klubu mimo hru nemá (game-player-report.ts).
  const askHint = r.source === "village_club" && !gamePlayerIdOf(player)
    ? blurredAskHint(openingAsk(player, r.club_rank, a.team_id, seedKey), eff, visits, seedKey)
    : null;
  await db.prepare(
    "UPDATE scout_reports SET visits = ?, rating_lo = ?, rating_hi = ?, potential_lo = ?, potential_hi = ?, expires_at = ?, ask_hint = COALESCE(?, ask_hint) WHERE id = ?",
  ).bind(visits, rr.lo, rr.hi, pr?.lo ?? null, pr?.hi ?? null, extended, askHint, r.id).run();
  await sendScoutSms(db, a.team_id, sender, revisitSms({
    name: `${player.firstName} ${player.lastName}`, ratingLo: rr.lo, ratingHi: rr.hi,
    potentialLo: pr?.lo ?? null, potentialHi: pr?.hi ?? null, youth: isYouthScoutTask(r.age),
  }), r.id);
  return true;
}

async function searchLeague(
  db: D1Database, a: AssignmentRow, eff: number, sender: string, rng: Rng, gameDate: string,
): Promise<{ visited: number; reported: boolean }> {
  const isU21 = a.assignment_type === "u21_league";
  let targetLeagueId = a.target_league_id;
  if (!targetLeagueId) {
    if (isU21) {
      const u21Team = await db.prepare("SELECT league_id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
        .bind(a.team_id).first<{ league_id: string }>();
      targetLeagueId = u21Team?.league_id;
    } else {
      const seniorTeam = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
        .bind(a.team_id).first<{ league_id: string }>();
      targetLeagueId = seniorTeam?.league_id;
    }
  }
  if (!targetLeagueId) return { visited: 0, reported: false };

  const oppTeams = await db.prepare(
    `SELECT t.id, t.name, v.name as city, v.district, v.population, v.id as village_id
     FROM teams t
     LEFT JOIN villages v ON t.village_id = v.id
     WHERE t.league_id = ? AND t.id != ? AND (t.parent_team_id IS NULL OR t.parent_team_id != ?)`,
  ).bind(targetLeagueId, a.team_id, a.team_id).all<{
    id: string; name: string; city: string | null; district: string | null; population: number | null; village_id: string | null;
  }>();

  const teamRows = oppTeams.results ?? [];
  if (teamRows.length === 0) {
    await sendScoutSms(db, a.team_id, sender, "V soutěži jsem nenašel žádné soupeře k analýze.");
    return { visited: 0, reported: false };
  }

  const visitCount = Math.min(teamRows.length, Math.max(1, Math.round(2 * (1 + eff / 20))));
  const visitedTeams = rng.shuffle([...teamRows]).slice(0, visitCount);

  const teamIds = visitedTeams.map((t) => t.id);
  const placeholders = teamIds.map(() => "?").join(",");
  const positions = assignmentPositions(a);

  // Obličej je v `players.avatar` (sloupec face_config neexistuje).
  let query = `SELECT p.id, p.team_id, p.first_name, p.last_name, p.age, p.position, p.overall_rating, p.hidden_talent,
                      p.personality, p.physical, p.avatar, p.skills_max, p.skills,
                      t.name as club_name, v.name as club_city, v.district, v.id as village_id, v.lat, v.lng
               FROM players p
               JOIN teams t ON p.team_id = t.id
               LEFT JOIN villages v ON t.village_id = v.id
               WHERE p.team_id IN (${placeholders})
                 AND (p.status IS NULL OR p.status = 'active')`;
  const binds: (string | number)[] = [...teamIds];

  if (positions && positions.length > 0) {
    const posPlaceholders = positions.map(() => "?").join(",");
    query += ` AND p.position IN (${posPlaceholders})`;
    binds.push(...positions);
  }
  if (isU21) {
    query += " AND p.age <= 21";
  }

  const pRows = await db.prepare(query).bind(...binds).all<{
    id: string; team_id: string; first_name: string; last_name: string; age: number; position: string;
    overall_rating: number; hidden_talent: number | null; personality: string | null; physical: string | null;
    avatar: string | null; skills_max: string | null; skills: string | null; club_name: string; club_city: string | null;
    district: string | null; village_id: string | null; lat: number | null; lng: number | null;
  }>();

  if (!pRows.results || pRows.results.length === 0) {
    await sendScoutSms(db, a.team_id, sender, emptyWeekSms(rng, visitedTeams.map((t) => t.name)));
    return { visited: visitedTeams.length, reported: false };
  }

  // O kom už tým platné hlášení má, toho skaut znovu nehlásí (dřív se hledalo `player_data.id`,
  // které se nikdy nezapisovalo, takže chodilo pořád totéž jméno).
  const activeReports = await db.prepare(
    `SELECT ${GAME_PLAYER_ID_SQL} AS id FROM scout_reports WHERE team_id = ? AND status IN ('active','negotiating')`,
  ).bind(a.team_id).all<{ id: string | null }>();
  const reportedIds = new Set(activeReports.results.map((r) => r.id).filter((id): id is string => !!id));

  const pool = pRows.results.filter((p) => !reportedIds.has(p.id));
  const candidates = pool.length > 0 ? pool : pRows.results;

  const scored = candidates.map((p) => {
    let skillCaps: Record<string, { current: number; maxPotential: number }> = {};
    try {
      if (p.skills_max) {
        const raw = JSON.parse(p.skills_max) as Record<string, unknown>;
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === "object" && v !== null && "maxPotential" in v) {
            const casted = v as { current?: number; maxPotential?: number };
            skillCaps[k] = { current: Number(casted.current ?? 0), maxPotential: Number(casted.maxPotential ?? 0) };
          } else if (typeof v === "number") {
            skillCaps[k] = { current: v, maxPotential: v };
          }
        }
      }
    } catch (e) { logger.warn({ module: "scouting" }, "neplatný strop dovedností kandidáta", e); }

    let faceConfig: Record<string, unknown> | undefined = undefined;
    try { if (p.avatar) faceConfig = JSON.parse(p.avatar); } catch (e) { logger.warn({ module: "scouting" }, "neplatný obličej kandidáta", e); }

    let parsedSkills: Record<string, number> = {};
    try { if (p.skills) parsedSkills = JSON.parse(p.skills); } catch (e) { logger.warn({ module: "scouting" }, "neplatné dovednosti kandidáta", e); }

    let parsedPersonality: Record<string, number> = {};
    try { if (p.personality) parsedPersonality = JSON.parse(p.personality); } catch (e) { logger.warn({ module: "scouting" }, "neplatná povaha kandidáta", e); }

    let parsedPhysical: Record<string, unknown> = {};
    try { if (p.physical) parsedPhysical = JSON.parse(p.physical); } catch (e) { logger.warn({ module: "scouting" }, "neplatné fyzické údaje kandidáta", e); }

    const rr = ratingRange(p.overall_rating, eff, 1, p.id);
    const pr = isU21 || p.age <= POTENTIAL_MAX_AGE
      ? potentialRange({ age: p.age, rating: p.overall_rating, position: p.position, talent: p.hidden_talent ?? 0, skillsMax: skillCaps }, eff, 1, p.id)
      : null;
    const estimate = isU21 && pr ? rangeMid(pr) : rangeMid(rr);

    return {
      row: p,
      parsedSkills,
      parsedPersonality,
      parsedPhysical,
      skillCaps,
      faceConfig,
      ratingRange: rr,
      potential: pr,
      estimate,
    };
  });

  scored.sort((x, y) => y.estimate - x.estimate);
  const best = scored[0];
  if (!best) {
    await sendScoutSms(db, a.team_id, sender, emptyWeekSms(rng, visitedTeams.map((t) => t.name)));
    return { visited: visitedTeams.length, reported: false };
  }

  const reportId = crypto.randomUUID();
  // Hráč soupeře hraje ve hře: hlášení vede na jeho profil a běžnou nabídku, ne na jednání
  // s klubem mimo hru (to by ho naklonovalo). Proto ani cena a ochota klubu mimo hru.
  const playerPayload: ScoutReportPlayerData = {
    gamePlayerId: best.row.id,
    firstName: best.row.first_name,
    lastName: best.row.last_name,
    age: best.row.age,
    position: best.row.position,
    overallRating: best.row.overall_rating,
    skills: best.parsedSkills,
    physical: best.parsedPhysical,
    personality: best.parsedPersonality,
    hiddenTalent: best.row.hidden_talent ?? 0,
    avatar: best.faceConfig,
    skillCaps: best.skillCaps,
    fromTeam: best.row.club_name,
    fromCity: best.row.club_city ?? undefined,
    fromDistrict: best.row.district ?? undefined,
  };

  const expiresAt = new Date(Date.now() + 28 * 86_400_000).toISOString();
  const distanceKm = await distanceFromClub(db, a.team_id, best.row.lat, best.row.lng);
  const subject: ReportSubject = {
    position: best.row.position,
    age: best.row.age,
    skills: best.parsedSkills,
    personality: best.parsedPersonality,
    distanceKm,
  };

  await db.prepare(
    `INSERT INTO scout_reports
      (id, team_id, assignment_id, source, village_id, club_name, club_city, district, distance_km,
       player_data, first_name, last_name, age, position, rating_lo, rating_hi, potential_lo, potential_hi,
       visits, club_rank, club_mean, ask_hint, pros, cons, willingness, status, expires_at, created_game_date)
     VALUES (?, ?, ?, 'village_club', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ?, NULL, 'active', ?, ?)`
  ).bind(
    reportId, a.team_id, a.id, best.row.village_id, best.row.club_name, best.row.club_city, best.row.district, distanceKm,
    JSON.stringify(playerPayload), best.row.first_name, best.row.last_name, best.row.age, best.row.position,
    best.ratingRange.lo, best.ratingRange.hi, best.potential?.lo ?? null, best.potential?.hi ?? null,
    JSON.stringify(reportPros(subject)), JSON.stringify(reportCons(subject)),
    expiresAt, gameDate.slice(0, 10),
  ).run();

  const leagueLabel = isU21 ? "dorostenecké U21 lize" : "naší lize";
  const posLabel = postLabel(best.row.position);
  const smsBody = isU21 && best.potential
    ? `V ${leagueLabel} jsem na zápase týmu ${best.row.club_name} sledoval talent: ${best.row.first_name} ${best.row.last_name} (${posLabel}, ${best.row.age} let). Strop vidím na ${best.potential.lo} až ${best.potential.hi}. Hlášení je připraveno, nabídku mu pošleš z jeho profilu.`
    : `V ${leagueLabel} jsem na zápase týmu ${best.row.club_name} sledoval hráče: ${best.row.first_name} ${best.row.last_name} (${posLabel}, ${best.row.age} let). Hodnocení odhaduju na ${best.ratingRange.lo} až ${best.ratingRange.hi}. Hlášení je připraveno, nabídku mu pošleš z jeho profilu.`;

  await sendScoutSms(db, a.team_id, sender, smsBody, reportId);
  return { visited: visitedTeams.length, reported: true };
}

async function search(db: D1Database, a: AssignmentRow, eff: number, sender: string, rng: Rng, gameDate: string): Promise<{ visited: number; reported: boolean }> {
  const home = await db.prepare(
    "SELECT v.id, v.lat, v.lng, v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(a.team_id).first<{ id: string; lat: number; lng: number; district: string }>();
  if (!home) return { visited: 0, reported: false };

  const youth = isYouthScoutTask(a.age_max);
  const villages = await loadVillagesInRadius(db, home, a.radius_km);
  const visitCount = Math.round(2 * (1 + eff / 20));
  const visited = pickClubsToVisit(rng, villages, visitCount);

  const candidates: Candidate[] = [];
  const names = new Map<string, Awaited<ReturnType<typeof namesFor>>>();
  const season = await activeSeasonNumber(db);
  // Hráč, o kterém už tým hlášení má (nebo ho odmítl, nebo ho koupil), se znovu nehlásí.
  const known = new Set((await db.prepare(
    `SELECT outside_player_id AS id FROM scout_reports
      WHERE team_id = ? AND outside_player_id IS NOT NULL AND status IN ('active','negotiating','signed','refused')`,
  ).bind(a.team_id).all<{ id: string }>()).results.map((r) => r.id));
  for (const v of visited) {
    if (season == null) break;
    if (!names.has(v.district)) names.set(v.district, await namesFor(db, v.district));
    const squad = await loadOutsideSquad(db, v, season, names.get(v.district)!)
      .catch((e) => { logger.warn({ module: "scouting" }, `kádr klubu ${v.name}`, e); return null; });
    if (squad) candidates.push(...squadCandidates(v, squad, a, eff, known));
  }
  candidates.push(...await freeAgentCandidates(db, a, home, eff, rng));

  // Dospělý musí mít aspoň na jedenáctého nejlepšího v kádru, mladý na průměr sestavy:
  // jeho odhad je potenciál a model růstu je spíš optimistický.
  const youthBar = await lineupAverage(db, a.team_id);
  if (youth) {
    const best = pickReported(rng, candidates, (c) => c.estimate, youthBar);
    if (!best) return emptyWeek(db, a, sender, rng, visited);
    await createReport(db, a, best, sender, rng, true, gameDate, eff);
    return { visited: visited.length, reported: true };
  }

  // Úkol i pro starší (třeba 16–25): skaut losuje mezi hráči kolem laťky sestavy (`pickReported`).
  // Mladí do 21 let se měří i tím, kam se dostanou do `PROMISING_SEASONS` sezón (naměřené tempo
  // růstu, youth-growth.ts), takže skaut hlásí i nadějné. Potenciál na 8 sezón se na to nehodí:
  // slibuje sestavu i osmnáctiletému s hodnocením 8.
  const bar = await lineupBar(db, a.team_id);
  const later = (c: Candidate) => c.estimate + projectRating(
    { age: c.player.age, rating: c.rating, position: c.player.position, talent: c.talent, skillsMax: c.skillsMax }, PROMISING_SEASONS,
  ) - c.rating;
  // Nadějný = do 21 let, dnes na sestavu nemá, ale do ní doroste. Hlásí se jen občas
  // (`PROMISING_SHARE`) nebo když kolem laťky nikdo není: ve společném losu s ostatními
  // vyhrávali (mladých je v kádrech hodně) a skaut nosil skoro jen šestnáctileté.
  const ready = pickReported(rng, candidates, (c) => c.estimate, bar);
  const promisingPool = candidates.filter((c) => c.player.age <= POTENTIAL_MAX_AGE && c.estimate < bar && later(c) >= bar);
  const usePromising = promisingPool.length > 0 && (!ready || rng.random() < PROMISING_SHARE);
  const best = usePromising ? pickReported(rng, promisingPool, later, bar) : ready;
  if (!best) return emptyWeek(db, a, sender, rng, visited);
  await createReport(db, a, best, sender, rng, best.player.age <= POTENTIAL_MAX_AGE && !!best.potential, gameDate, eff, usePromising);
  return { visited: visited.length, reported: true };
}

/**
 * O kolik pod laťkou sestavy skaut hráče ještě nahlásí. Dřív hlásil jen hráče nad laťkou,
 * a to vždy toho s nejlepším odhadem: u silného týmu jen opory městských klubů, každý týden
 * (Jitona 2026-10-19). Skaut ale nepřiváží jen to nejlepší v okolí, ale toho, koho najde.
 */
export const REPORT_MARGIN = 5;
/** Jak často skaut místo hráče kolem laťky přinese nadějného mladíka (když nějakého viděl). */
export const PROMISING_SHARE = 0.25;

/**
 * Koho skaut nahlásí: los mezi hráči, kterým podle svého odhadu (`score`) dává aspoň laťku
 * mínus `REPORT_MARGIN`, s vahou podle toho, o kolik je nad touto hranicí. Lepší hráč má
 * větší šanci, ale přijde i průměrný; slabý skaut se navíc v odhadu plete (fog.ts).
 */
export function pickReported<T>(rng: Rng, candidates: readonly T[], score: (c: T) => number, bar: number): T | undefined {
  const floor = bar - REPORT_MARGIN;
  const pool = candidates.map((c) => ({ c, w: score(c) - floor + 1 })).filter((x) => x.w >= 1);
  if (pool.length === 0) return undefined;
  const total = pool.reduce((sum, x) => sum + x.w, 0);
  let r = rng.random() * total;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x.c;
  }
  return pool[pool.length - 1].c;
}

async function emptyWeek(
  db: D1Database, a: AssignmentRow, sender: string, rng: Rng, visited: readonly VillageInRange[],
): Promise<{ visited: number; reported: boolean }> {
  await sendScoutSms(db, a.team_id, sender, emptyWeekSms(rng, visited.map((v) => v.name)));
  return { visited: visited.length, reported: false };
}

async function namesFor(db: D1Database, district: string) {
  const { getDistrictDataFromDB } = await import("../data/districts");
  const data = await getDistrictDataFromDB(db, district);
  return {
    surnameData: { surnames: data.surnames, female_forms: {} as Record<string, string> },
    firstnameData: { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> },
  };
}

/**
 * Kdo z kádru klubu odpovídá úkolu: post, věk, pořád v klubu a tým o něm ještě nemá hlášení.
 * Skaut na zápase vidí celý kádr, takže bere všechny, kdo úkolu odpovídají.
 */
function squadCandidates(v: VillageInRange, squad: OutsideSquad, a: AssignmentRow, eff: number, known: ReadonlySet<string>): Candidate[] {
  const positions = assignmentPositions(a);
  const youth = isYouthScoutTask(a.age_max);
  return squad.players
    .filter((p) => p.status === "available" && !known.has(p.id)
      && p.age >= a.age_min && p.age <= a.age_max && (!positions || positions.includes(p.position)))
    .map((p) => withEstimate({
      id: p.id, source: "village_club", player: p.player, rating: p.rating, talent: p.player.hiddenTalent ?? 0,
      skillsMax: p.player.skillCaps ?? {}, village: { id: v.id, name: v.name, district: v.district, lat: v.lat, lng: v.lng },
      clubName: villageClubName(v), clubMean: Math.round(squad.clubMean), clubRank: p.clubRank, distanceKm: v.distanceKm,
      freeAgentId: null, outsidePlayerId: p.id,
    }, eff, youth));
}

function withEstimate(c: Omit<Candidate, "ratingRange" | "potential" | "estimate">, eff: number, youth: boolean): Candidate {
  const rr = ratingRange(c.rating, eff, 1, c.id);
  const pr = c.player.age <= POTENTIAL_MAX_AGE
    ? potentialRange({ age: c.player.age, rating: c.rating, position: c.player.position, talent: c.talent, skillsMax: c.skillsMax }, eff, 1, c.id)
    : null;
  const estimate = youth && pr ? rangeMid(pr) : rangeMid(rr);
  return { ...c, ratingRange: rr, potential: pr, estimate };
}

interface FreeAgentRow {
  id: string; district: string; first_name: string; last_name: string; age: number; position: string; overall_rating: number;
  skills: string; physical: string; personality: string; life_context: string; avatar: string; nationality: string | null;
  weekly_wage: number; hidden_talent: number | null; skills_max: string | null; rejected_by: string | null;
  v_id: string; v_name: string; lat: number; lng: number;
}

/** Volní hráči z jiných okresů v okruhu (z vlastního okresu je manažer vidí sám). */
async function freeAgentCandidates(
  db: D1Database, a: AssignmentRow, home: { id: string; lat: number; lng: number; district: string }, eff: number, rng: Rng,
): Promise<Candidate[]> {
  const box = boundingBox(home.lat, home.lng, a.radius_km);
  const faPositions = assignmentPositions(a);
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(a.team_id).first<{ game_date: string | null }>();
  const rows = await db.prepare(
    `SELECT fa.id, fa.district, fa.first_name, fa.last_name, fa.age, fa.position, fa.overall_rating, fa.skills, fa.physical,
            fa.personality, fa.life_context, fa.avatar, fa.nationality, fa.weekly_wage, fa.hidden_talent, fa.skills_max, fa.rejected_by,
            v.id AS v_id, v.name AS v_name, v.lat, v.lng
       FROM free_agents fa JOIN villages v ON v.id = fa.village_id
      WHERE fa.district != ? AND fa.expires_at > ? AND COALESCE(fa.is_celebrity, 0) = 0
        AND fa.age BETWEEN ? AND ? ${faPositions ? `AND fa.position IN (${faPositions.map(() => "?").join(",")})` : ""}
        AND v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM scout_reports sr WHERE sr.free_agent_id = fa.id AND sr.team_id = ?)`,
  ).bind(
    home.district, team?.game_date ?? new Date().toISOString(), a.age_min, a.age_max,
    ...(faPositions ?? []), box.minLat, box.maxLat, box.minLng, box.maxLng, a.team_id,
  ).all<FreeAgentRow>()
    .catch((e) => { logger.warn({ module: "scouting" }, "volní hráči v okruhu", e); return { results: [] as FreeAgentRow[] }; });

  const youth = isYouthScoutTask(a.age_max);
  const out: Candidate[] = [];
  for (const fa of rows.results) {
    const distanceKm = Math.round(haversineKm(home.lat, home.lng, fa.lat, fa.lng));
    if (distanceKm > a.radius_km) continue;
    try {
      if ((JSON.parse(fa.rejected_by ?? "[]") as string[]).includes(a.team_id)) continue;
      const skillsMax = JSON.parse(fa.skills_max ?? "{}") as Record<string, { current: number; maxPotential: number }>;
      const player: VirtualPlayerData = {
        firstName: fa.first_name, lastName: fa.last_name, age: fa.age, position: fa.position, overallRating: fa.overall_rating,
        skills: JSON.parse(fa.skills), physical: JSON.parse(fa.physical), personality: JSON.parse(fa.personality),
        weeklyWage: fa.weekly_wage, avatar: JSON.parse(fa.avatar), nationality: fa.nationality ?? "CZ",
        fromCity: fa.v_name, fromDistrict: fa.district, skillCaps: skillsMax, hiddenTalent: fa.hidden_talent ?? 0,
      };
      out.push(withEstimate({
        id: crypto.randomUUID(), source: "free_agent", player, rating: fa.overall_rating, talent: fa.hidden_talent ?? 0, skillsMax,
        village: { id: fa.v_id, name: fa.v_name, district: fa.district, lat: fa.lat, lng: fa.lng },
        clubName: null, clubMean: null, clubRank: null, distanceKm, freeAgentId: fa.id, outsidePlayerId: null,
      }, eff, youth));
    } catch (e) {
      logger.warn({ module: "scouting" }, `volný hráč ${fa.id}`, e);
    }
  }
  // Skaut volné hráče nepotkává všechny: nejvýš jednoho za týden, náhodně.
  return out.length > 0 ? [out[rng.int(0, out.length - 1)]] : [];
}

/**
 * První požadavek klubu (stejný výpočet jako na začátku jednání, stejný seed), aby se skautův
 * odhad ceny vztahoval ke skutečné ceně klubu.
 */
export function openingAsk(p: VirtualPlayerData, clubRank: number | null, teamId: string, reportId: string): number {
  return initAiSellerState({
    stance: "poached", clubRank: clubRank ?? 12,
    marketValue: outsideClubValuation(p),
    seed: stableSeed(`${reportId}:${teamId}`),
  }).ask;
}

async function createReport(
  db: D1Database, a: AssignmentRow, c: Candidate, sender: string, rng: Rng, youth: boolean, gameDate: string, eff: number, promising = false,
): Promise<void> {
  const p = c.player;
  const askHint = c.source === "village_club" ? blurredAskHint(openingAsk(p, c.clubRank, a.team_id, c.id), eff, 1, c.id) : null;
  const chance = await estimateWillingness(db, a.team_id, p, c.village?.district ?? null,
    c.village ? { lat: c.village.lat, lng: c.village.lng } : null, c.clubMean)
    .catch((e) => { logger.warn({ module: "scouting" }, "odhad ochoty do hlášení", e); return null; });
  const subject = { position: p.position, age: p.age, skills: p.skills, personality: p.personality, distanceKm: c.distanceKm };
  const expiresAt = new Date(Date.now() + SCOUT_REPORT_TTL_DAYS * 86_400_000).toISOString();
  // Hráče stálého kádru může mít v hlášení víc týmů: hlášení má vlastní id, hráč zůstává `c.id`
  // (z něj se odvozuje mlha odhadů i cena klubu, stejně jako v jednání).
  const reportId = c.outsidePlayerId ? crypto.randomUUID() : c.id;

  await db.prepare(
    `INSERT INTO scout_reports (id, team_id, assignment_id, source, village_id, club_name, club_city, district, distance_km,
       free_agent_id, player_data, first_name, last_name, age, position, rating_lo, rating_hi, potential_lo, potential_hi,
       visits, club_rank, club_mean, ask_hint, pros, cons, willingness, expires_at, created_game_date, outside_player_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    reportId, a.team_id, a.id, c.source, c.village?.id ?? null, c.clubName, c.village?.name ?? null, c.village?.district ?? null,
    c.distanceKm, c.freeAgentId, JSON.stringify(p), p.firstName, p.lastName, p.age, p.position,
    c.ratingRange.lo, c.ratingRange.hi, c.potential?.lo ?? null, c.potential?.hi ?? null,
    c.clubRank, c.clubMean, askHint, JSON.stringify(reportPros(subject)), JSON.stringify(reportCons(subject)),
    chance != null ? blurredWillingness(willingnessFromChance(chance), eff, 1, c.id) : null, expiresAt, gameDate.slice(0, 10),
    c.outsidePlayerId,
  ).run();

  await sendScoutSms(db, a.team_id, sender, reportSms(rng, {
    name: `${p.firstName} ${p.lastName}`, age: p.age, position: p.position,
    ratingLo: c.ratingRange.lo, ratingHi: c.ratingRange.hi, potentialLo: c.potential?.lo ?? null, potentialHi: c.potential?.hi ?? null,
    youth, source: c.source, clubName: c.clubName, villageName: c.village?.name ?? null, district: c.village?.district ?? null, askHint,
    promising, abroad: isFromAbroad(p),
  }), reportId);
}

// ─── Vrácení cestovného za úkoly bez práce ──────────────────────────────────

const REFUND_LABELS: Record<string, string> = {
  u21_league: "U21 liga", league: "naše liga", player: "sledování hráče", match: "rozbor soupeře",
};

export interface TravelRefund {
  teamId: string; teamName: string; transactionId: string; assignmentId: string; assignmentType: string; amount: number;
}

/**
 * Vrácení cestovného, které starý kód strhl za úkoly, jež nikdy nic neodpracovaly (prověrka
 * 2026-10-24: U21 liga, Naše liga a mise padaly na SQL a cestovné se strhávalo dál).
 *
 * Vrací se každé stržení zvlášť (typ scout_travel, `reference_id` = id stržení), takže druhý
 * běh už nic nevrátí. Jen stržení před `before` (nasazení opravy): týdny odpracované potom
 * se platí normálně. Aktivní mise se nevrací, hlášení po opravě dostanou bez další platby.
 * `apply: false` jen vypíše, co by se vrátilo.
 */
export async function refundUnworkedScoutTravel(
  db: D1Database, opts: { before: string; apply: boolean },
): Promise<{ refunds: TravelRefund[]; total: number }> {
  const rows = await db.prepare(
    `SELECT tr.id AS transactionId, tr.team_id AS teamId, t.name AS teamName, -tr.amount AS amount,
            sa.id AS assignmentId, sa.assignment_type AS assignmentType, t.game_date AS gameDate
       FROM transactions tr
       JOIN scout_assignments sa ON sa.id = tr.reference_id
       JOIN teams t ON t.id = tr.team_id
      WHERE tr.type = 'scout_travel' AND tr.amount < 0 AND julianday(tr.created_at) < julianday(?)
        AND (sa.assignment_type IN ('league','u21_league')
             OR (sa.assignment_type IN ('player','match') AND sa.status = 'cancelled'))
        AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.reference_id = tr.id AND r.type = 'scout_travel' AND r.amount > 0)
      ORDER BY t.name, tr.created_at`,
  ).bind(opts.before).all<TravelRefund & { gameDate: string | null }>();

  const refunds: TravelRefund[] = [];
  for (const r of rows.results) {
    if (opts.apply) {
      await recordTransaction(db, r.teamId, "scout_travel", r.amount,
        `Vráceno cestovné skauta: úkol bez práce (${REFUND_LABELS[r.assignmentType] ?? r.assignmentType})`,
        r.gameDate ?? new Date().toISOString(), r.transactionId);
    }
    refunds.push({ teamId: r.teamId, teamName: r.teamName, transactionId: r.transactionId, assignmentId: r.assignmentId, assignmentType: r.assignmentType, amount: r.amount });
  }
  return { refunds, total: refunds.reduce((sum, r) => sum + r.amount, 0) };
}

// ─── Denní údržba hlášení ───────────────────────────────────────────────────

/**
 * Prošlá hlášení a hráči, které mezitím sebral jiný klub. Platnost je v reálném čase stejně
 * jako inzeráty na trhu (herní den se od reálného liší jen pevným posunem).
 */
export async function maintainScoutReports(db: D1Database, env: PushEnv | undefined, now = new Date()): Promise<{ expired: number; gone: number }> {
  const nowIso = now.toISOString();
  const expired = await db.prepare(
    "UPDATE scout_reports SET status = 'expired', resolved_at = ? WHERE status = 'active' AND expires_at < ?",
  ).bind(nowIso, nowIso).run();

  // Volný hráč, který z poolu zmizel (podepsal jinde nebo vypršel).
  await db.prepare(
    `UPDATE scout_reports SET status = 'gone', resolved_at = ?
     WHERE status = 'active' AND source = 'free_agent' AND NOT EXISTS (SELECT 1 FROM free_agents fa WHERE fa.id = scout_reports.free_agent_id)`,
  ).bind(nowIso).run();

  // Hráč ve hře (game-player-report.ts), který už ve hře není (konec kariéry, smazaný tým).
  await db.prepare(
    `UPDATE scout_reports SET status = 'gone', resolved_at = ?
     WHERE status = 'active' AND ${GAME_PLAYER_ID_SQL} IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM players p WHERE p.id = ${GAME_PLAYER_ID_SQL})`,
  ).bind(nowIso).run();

  const rng = createRng(cryptoSeed());
  let gone = 0;
  const goneReport = async (r: { id: string; status: string; negotiation_id: string | null }) => {
    const res = await db.prepare("UPDATE scout_reports SET status = 'gone', resolved_at = ? WHERE id = ? AND status = ?")
      .bind(nowIso, r.id, r.status).run();
    if ((res.meta?.changes ?? 0) === 0) return;
    gone++;
    if (r.negotiation_id) {
      const row = await db.prepare("SELECT * FROM ai_negotiations WHERE id = ?").bind(r.negotiation_id).first<AiNegotiationRow>();
      if (row) await expireNegotiation(db, env, row, "Hráče mezitím sebral jiný klub.", now);
    }
  };

  // Hráč stálého kádru: jiný klub mimo hru ho sebere všem najednou (los za hráče, ne za hlášení).
  const shared = await db.prepare(
    "SELECT DISTINCT outside_player_id AS id FROM scout_reports WHERE status IN ('active','negotiating') AND outside_player_id IS NOT NULL",
  ).all<{ id: string }>();
  for (const p of shared.results) {
    if (rng.random() >= SCOUT_SNAP_UP_DAILY_CHANCE) continue;
    const sold = await db.prepare("UPDATE outside_players SET status = 'sold', sold_at = ? WHERE id = ? AND status = 'available'")
      .bind(nowIso, p.id).run();
    if ((sold.meta?.changes ?? 0) === 0) continue;
    const reports = await db.prepare(
      "SELECT id, status, negotiation_id FROM scout_reports WHERE outside_player_id = ? AND status IN ('active','negotiating')",
    ).bind(p.id).all<{ id: string; status: string; negotiation_id: string | null }>();
    for (const r of reports.results) await goneReport(r);
  }

  // Starší hlášení (hráč vylosovaný jen pro jedno hlášení) po staru, každé zvlášť. Hráče ve
  // hře klub mimo hru nesebere, ten patří svému klubu.
  const live = await db.prepare(
    `SELECT id, status, negotiation_id FROM scout_reports
      WHERE status IN ('active','negotiating') AND source = 'village_club' AND outside_player_id IS NULL AND ${GAME_PLAYER_ID_SQL} IS NULL`,
  ).all<{ id: string; status: string; negotiation_id: string | null }>();
  for (const r of live.results) {
    if (rng.random() >= SCOUT_SNAP_UP_DAILY_CHANCE) continue;
    await goneReport(r);
  }
  return { expired: expired.meta?.changes ?? 0, gone };
}
