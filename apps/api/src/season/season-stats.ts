/**
 * "Sezona v číslech" — DETERMINISTICKÁ retrospektiva (bez AI).
 *
 * Použití:
 *  (a) ověřená fakta do promptu velkého článku o sezóně (méně halucinací),
 *  (b) JSON blok uložený do league_history.season_stats pro stránku historie.
 */

import { logger } from "../lib/logger";

export interface SeasonMatchHighlight {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface SeasonStats {
  matchesPlayed: number;
  totalGoals: number;
  goalsPerMatch: number;
  biggestWin: (SeasonMatchHighlight & { margin: number }) | null;
  highestScoring: (SeasonMatchHighlight & { total: number }) | null;
  recordAttendance: { value: number; homeTeam: string; awayTeam: string } | null;
  totalAttendance: number;
  totalBeer: number;
  wildestMatch: { homeTeam: string; awayTeam: string; cards: number } | null;
  totalYellowCards: number;
  totalRedCards: number;
  longestWinStreak: { teamName: string; length: number } | null;
}

/** Průměrná spotřeba piva na diváka (vesnický fotbal, žízeň jako trám). */
const BEER_PER_FAN = 2.4;

interface MatchRow {
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  attendance: number | null;
  game_week: number;
}

/**
 * Spočítá deterministické statistiky aktuální (nejvyšší) sezóny ligy.
 */
export async function computeSeasonStats(
  db: D1Database,
  leagueId: string,
  seasonNumber: number,
): Promise<SeasonStats> {
  const empty: SeasonStats = {
    matchesPlayed: 0, totalGoals: 0, goalsPerMatch: 0,
    biggestWin: null, highestScoring: null, recordAttendance: null,
    totalAttendance: 0, totalBeer: 0, wildestMatch: null,
    totalYellowCards: 0, totalRedCards: 0, longestWinStreak: null,
  };

  // Názvy týmů
  const teamRows = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all()
    .catch((e) => { logger.warn({ module: "season-stats" }, "load teams", e); return { results: [] as Record<string, unknown>[] }; });
  const teamName = new Map<string, string>();
  for (const t of teamRows.results) teamName.set(t.id as string, t.name as string);

  // Odehrané zápasy aktuální sezóny, seřazené pro výpočet série
  const matchRes = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.attendance, sc.game_week
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = ?
     ORDER BY sc.game_week ASC, sc.scheduled_at ASC`,
  ).bind(leagueId, seasonNumber).all()
    .catch((e) => { logger.warn({ module: "season-stats" }, "load matches", e); return null; });
  if (!matchRes) return empty;

  const matches = matchRes.results as unknown as MatchRow[];
  if (matches.length === 0) return empty;

  let totalGoals = 0;
  let biggestWin: (SeasonMatchHighlight & { margin: number }) | null = null;
  let highestScoring: (SeasonMatchHighlight & { total: number }) | null = null;
  let recordAttendance: { value: number; homeTeam: string; awayTeam: string } | null = null;
  let totalAttendance = 0;
  // Vítězné série per tým (v pořadí kol)
  const streakNow = new Map<string, number>();
  let longestWinStreak: { teamName: string; length: number } | null = null;

  const nameOf = (id: string) => teamName.get(id) ?? "Neznámý";

  for (const m of matches) {
    const hs = m.home_score ?? 0;
    const as_ = m.away_score ?? 0;
    totalGoals += hs + as_;

    const margin = Math.abs(hs - as_);
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin)) {
      biggestWin = { homeTeam: nameOf(m.home_team_id), awayTeam: nameOf(m.away_team_id), homeScore: hs, awayScore: as_, margin };
    }
    const total = hs + as_;
    if (!highestScoring || total > highestScoring.total) {
      highestScoring = { homeTeam: nameOf(m.home_team_id), awayTeam: nameOf(m.away_team_id), homeScore: hs, awayScore: as_, total };
    }
    if (m.attendance != null) {
      totalAttendance += m.attendance;
      if (!recordAttendance || m.attendance > recordAttendance.value) {
        recordAttendance = { value: m.attendance, homeTeam: nameOf(m.home_team_id), awayTeam: nameOf(m.away_team_id) };
      }
    }

    // Vítězné série
    const winner = hs > as_ ? m.home_team_id : as_ > hs ? m.away_team_id : null;
    for (const tid of [m.home_team_id, m.away_team_id]) {
      if (tid === winner) {
        const cur = (streakNow.get(tid) ?? 0) + 1;
        streakNow.set(tid, cur);
        if (!longestWinStreak || cur > longestWinStreak.length) {
          longestWinStreak = { teamName: nameOf(tid), length: cur };
        }
      } else {
        streakNow.set(tid, 0);
      }
    }
  }

  // Karty
  const cardRes = await db.prepare(
    `SELECT COALESCE(SUM(mps.yellow_cards),0) AS y, COALESCE(SUM(mps.red_cards),0) AS r
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = ?`,
  ).bind(leagueId, seasonNumber).first<{ y: number; r: number }>()
    .catch((e) => { logger.warn({ module: "season-stats" }, "load cards", e); return null; });

  // Nejdivočejší zápas — nejvíc karet v jednom utkání
  const wildRes = await db.prepare(
    `SELECT mps.match_id, SUM(mps.yellow_cards) + SUM(mps.red_cards) AS cards, m.home_team_id, m.away_team_id
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     JOIN season_calendar sc ON sc.id = m.calendar_id
     WHERE m.league_id = ? AND m.status = 'simulated' AND sc.season_number = ?
     GROUP BY mps.match_id
     ORDER BY cards DESC LIMIT 1`,
  ).bind(leagueId, seasonNumber).first<{ cards: number; home_team_id: string; away_team_id: string }>()
    .catch((e) => { logger.warn({ module: "season-stats" }, "load wildest match", e); return null; });
  const wildestMatch = wildRes && wildRes.cards > 0
    ? { homeTeam: nameOf(wildRes.home_team_id), awayTeam: nameOf(wildRes.away_team_id), cards: wildRes.cards }
    : null;

  return {
    matchesPlayed: matches.length,
    totalGoals,
    goalsPerMatch: Math.round((totalGoals / matches.length) * 10) / 10,
    biggestWin,
    highestScoring,
    recordAttendance,
    totalAttendance,
    totalBeer: Math.round(totalAttendance * BEER_PER_FAN),
    wildestMatch,
    totalYellowCards: cardRes?.y ?? 0,
    totalRedCards: cardRes?.r ?? 0,
    longestWinStreak,
  };
}

/** Lidsky čitelné věty pro AI prompt / fallback zobrazení. */
export function seasonStatsToLines(s: SeasonStats): string[] {
  const lines: string[] = [];
  lines.push(`Odehráno zápasů: ${s.matchesPlayed}`);
  lines.push(`Celkem branek: ${s.totalGoals} (${s.goalsPerMatch} na zápas)`);
  if (s.biggestWin) lines.push(`Nejvyšší výhra: ${s.biggestWin.homeTeam} ${s.biggestWin.homeScore}:${s.biggestWin.awayScore} ${s.biggestWin.awayTeam}`);
  if (s.highestScoring && s.highestScoring.total !== s.biggestWin?.margin) lines.push(`Nejgólovější zápas: ${s.highestScoring.homeTeam} ${s.highestScoring.homeScore}:${s.highestScoring.awayScore} ${s.highestScoring.awayTeam} (${s.highestScoring.total} branek)`);
  if (s.recordAttendance) lines.push(`Rekordní návštěva: ${s.recordAttendance.value} diváků (${s.recordAttendance.homeTeam} vs ${s.recordAttendance.awayTeam})`);
  if (s.totalBeer > 0) lines.push(`Vypito piva za sezónu: zhruba ${s.totalBeer.toLocaleString("cs")} piv`);
  if (s.wildestMatch) lines.push(`Nejdivočejší zápas: ${s.wildestMatch.homeTeam} vs ${s.wildestMatch.awayTeam} (${s.wildestMatch.cards} karet)`);
  lines.push(`Karet celkem: ${s.totalYellowCards} žlutých, ${s.totalRedCards} červených`);
  if (s.longestWinStreak) lines.push(`Nejdelší vítězná série: ${s.longestWinStreak.teamName} (${s.longestWinStreak.length} výher v řadě)`);
  return lines;
}
