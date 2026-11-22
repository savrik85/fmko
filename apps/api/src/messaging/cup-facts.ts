/**
 * Pohár v kontextu hráče (oprava 2026-11-18).
 *
 * Pohárové zápasy leží v `cup_matches` a tým v nich vystupuje jako `cup_teams.id`,
 * ne `teams.id`. Prompt hráče četl jen `matches`, takže pohár pro něj neexistoval:
 * Mikeš po nule v poháru odepsal „Jakej pohár? Dneska se nic nehrálo“ (Čkyně 14. 11.),
 * Pešek den předem „Zítra pohár? O tom nic nevím“ (Vršovice 13. 11.).
 *
 * Statistiky hráčů z poháru jdou do společné `match_player_stats` (match_id = cup_matches.id),
 * absence v `cup_matches.absences` nesou `teamId` pohárového týmu.
 */

import { logger } from "../lib/logger";
import { matchDayLabel } from "./next-match";

const M = "cup-facts";

export interface LastCupMatch {
  id: string;
  /** Pohárové id týmu, za který se hrálo (páruje absence). */
  cupTeamId: string;
  isHome: boolean;
  myScore: number | null;
  oppScore: number | null;
  myPens: number | null;
  oppPens: number | null;
  opponent: string;
  cupName: string | null;
  round: number | null;
  lineupData: string | null;
  absences: string | null;
  simulatedAt: string;
}

export interface NextCupMatch {
  scheduledAt: string;
  isHome: boolean;
  opponent: string;
  cupName: string | null;
}

/** Všechna pohárová id týmu (jedno na každý ročník poháru). */
async function cupTeamIds(db: D1Database, teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM cup_teams WHERE team_id = ?").bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `pohárové týmy ${teamId}`, e); return { results: [] as Array<{ id: string }> }; });
  return rows.results.map((r) => r.id);
}

const MATCH_COLUMNS = `cm.id, cm.round, cm.home_cup_team_id, cm.away_cup_team_id, cm.home_score, cm.away_score,
  cm.home_pens, cm.away_pens, cm.home_lineup_data, cm.away_lineup_data, cm.absences, cm.simulated_at, cm.scheduled_at,
  ht.name AS home_name, at.name AS away_name, cc.name AS cup_name`;

const MATCH_JOINS = `FROM cup_matches cm
  LEFT JOIN cup_teams ht ON ht.id = cm.home_cup_team_id
  LEFT JOIN cup_teams at ON at.id = cm.away_cup_team_id
  LEFT JOIN cup_competitions cc ON cc.id = cm.cup_id`;

interface CupMatchRow {
  id: string; round: number | null; home_cup_team_id: string; away_cup_team_id: string;
  home_score: number | null; away_score: number | null; home_pens: number | null; away_pens: number | null;
  home_lineup_data: string | null; away_lineup_data: string | null; absences: string | null;
  simulated_at: string | null; scheduled_at: string | null;
  home_name: string | null; away_name: string | null; cup_name: string | null;
}

/** Poslední odehraný pohárový zápas týmu, nebo null. */
export async function loadLastCupMatch(db: D1Database, teamId: string): Promise<LastCupMatch | null> {
  const ids = await cupTeamIds(db, teamId);
  if (ids.length === 0) return null;
  const ph = ids.map(() => "?").join(",");
  const r = await db.prepare(
    `SELECT ${MATCH_COLUMNS} ${MATCH_JOINS}
      WHERE (cm.home_cup_team_id IN (${ph}) OR cm.away_cup_team_id IN (${ph}))
        AND cm.status = 'simulated' AND cm.simulated_at IS NOT NULL
      ORDER BY cm.simulated_at DESC LIMIT 1`,
  ).bind(...ids, ...ids).first<CupMatchRow>()
    .catch((e) => { logger.warn({ module: M }, `poslední pohárový zápas ${teamId}`, e); return null; });
  if (!r || !r.simulated_at) return null;
  const isHome = ids.includes(r.home_cup_team_id);
  return {
    id: r.id,
    cupTeamId: isHome ? r.home_cup_team_id : r.away_cup_team_id,
    isHome,
    myScore: isHome ? r.home_score : r.away_score,
    oppScore: isHome ? r.away_score : r.home_score,
    myPens: isHome ? r.home_pens : r.away_pens,
    oppPens: isHome ? r.away_pens : r.home_pens,
    opponent: (isHome ? r.away_name : r.home_name) ?? "soupeř",
    cupName: r.cup_name,
    round: r.round,
    lineupData: isHome ? r.home_lineup_data : r.away_lineup_data,
    absences: r.absences,
    simulatedAt: r.simulated_at,
  };
}

/**
 * Příští pohárový zápas týmu, nebo null. `scheduled_at` prvního kola bývá posunutý
 * (zápasy se hrají v pražské poledne, kdy běží pohárový tick), proto se hráči říká
 * jen den a „v poledne“, ne přesný čas.
 */
export async function loadNextCupMatch(db: D1Database, teamId: string, now: Date = new Date()): Promise<NextCupMatch | null> {
  const ids = await cupTeamIds(db, teamId);
  if (ids.length === 0) return null;
  const ph = ids.map(() => "?").join(",");
  const since = new Date(now.getTime() - 12 * 3600 * 1000).toISOString();
  const r = await db.prepare(
    `SELECT ${MATCH_COLUMNS} ${MATCH_JOINS}
      WHERE (cm.home_cup_team_id IN (${ph}) OR cm.away_cup_team_id IN (${ph}))
        AND cm.status = 'scheduled' AND cm.scheduled_at IS NOT NULL AND cm.scheduled_at >= ?
      ORDER BY cm.scheduled_at LIMIT 1`,
  ).bind(...ids, ...ids, since).first<CupMatchRow>()
    .catch((e) => { logger.warn({ module: M }, `příští pohárový zápas ${teamId}`, e); return null; });
  // Soupeř ještě nemusí být známý (čeká se na vítěze jiné dvojice).
  if (!r || !r.scheduled_at) return null;
  const isHome = ids.includes(r.home_cup_team_id);
  const opponent = isHome ? r.away_name : r.home_name;
  return { scheduledAt: r.scheduled_at, isHome, opponent: opponent ?? "", cupName: r.cup_name };
}

/** Výsledek pohárového zápasu z pohledu týmu, včetně penalt. */
export function cupOutcome(m: Pick<LastCupMatch, "myScore" | "oppScore" | "myPens" | "oppPens">): "win" | "loss" | "draw" | null {
  if (m.myScore == null || m.oppScore == null) return null;
  if (m.myScore !== m.oppScore) return m.myScore > m.oppScore ? "win" : "loss";
  if (m.myPens != null && m.oppPens != null && m.myPens !== m.oppPens) return m.myPens > m.oppPens ? "win" : "loss";
  return "draw";
}

function cupLabel(cupName: string | null, round: number | null): string {
  const name = cupName?.trim() || "pohár";
  return round ? `${name}, ${round}. kolo` : name;
}

/** „pohárový zápas (Okresní pohár, 1. kolo): výhra 1:0 venku s FK Budějovice“ */
export function describeLastCupMatch(m: LastCupMatch): string | undefined {
  if (m.myScore == null || m.oppScore == null) return undefined;
  const where = m.isHome ? "doma s" : "venku s";
  const pens = m.myScore === m.oppScore && m.myPens != null && m.oppPens != null
    ? `, na penalty ${m.myPens > m.oppPens ? "jsme vyhráli" : "jsme prohráli"} ${m.myPens}:${m.oppPens}`
    : "";
  const verdict = m.myScore > m.oppScore ? "výhra" : m.myScore < m.oppScore ? "prohra" : "remíza";
  const result = cupOutcome(m) === "win" ? "postupujeme" : cupOutcome(m) === "loss" ? "vypadli jsme" : "";
  return `pohárový zápas (${cupLabel(m.cupName, m.round)}): ${verdict} ${m.myScore}:${m.oppScore} ${where} ${m.opponent}${pens}${result ? `, ${result}` : ""}`;
}

/** „zítra (sobota 28. 11.) v poledne venku s SK Lhota (Okresní pohár)“ */
export function describeNextCupMatch(m: NextCupMatch, now: Date = new Date()): string {
  const when = matchDayLabel(new Date(m.scheduledAt), now);
  const against = m.opponent ? ` ${m.isHome ? "doma s" : "venku s"} ${m.opponent}` : ", soupeř se teprve rozhodne";
  return `${when} v poledne${against}${m.cupName ? ` (${m.cupName})` : ""}`;
}

/** Ligové časy bývají bez zóny („2026-11-08 17:00:00“), v D1 jsou v UTC. */
export function toUtcMs(s: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`);
}

/** Je čas `a` pozdější než `b`? Chybějící `b` = ano. */
export function isLater(a: string, b: string | null | undefined): boolean {
  return !b || toUtcMs(a) > toUtcMs(b);
}

/** Starší ze dvou zápasů (liga a pohár) se hráči připomene, jen když byl nejvýš 4 dny před novějším. */
export function withinPreviousWindow(olderAt: string | null | undefined, newerAt: string | null | undefined): boolean {
  if (!olderAt || !newerAt) return false;
  const older = toUtcMs(olderAt);
  const newer = toUtcMs(newerAt);
  return older <= newer && newer - older <= 4 * 86400000;
}
