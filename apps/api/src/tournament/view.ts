/**
 * Data pro stránku /turnaj po losu: rozpis se skóre, tabulka ligové fáze, hřiště,
 * střelci a kolik už klub od sponzora dostal.
 */

import { computeStandings } from "./draw";
import type { TournamentRow } from "./service";

interface MatchViewRow {
  id: string;
  stage: string;
  day: number;
  bracket_pos: number;
  scheduled_at: string;
  status: string;
  venue_id: string | null;
  venue_name: string | null;
  venue_is_main: number | null;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
  home_color: string | null;
  away_color: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  winner_team_id: string | null;
  attendance: number | null;
}

export async function loadCompetitionView(db: D1Database, t: TournamentRow, teamId: string) {
  const [matchRows, teamRows, venueRows, scorerRows, earned] = await Promise.all([
    db.prepare(
      `SELECT m.id, m.stage, m.day, m.bracket_pos, m.scheduled_at, m.status, m.venue_id,
              v.name AS venue_name, v.is_main AS venue_is_main,
              m.home_team_id, m.away_team_id, h.name AS home_name, a.name AS away_name,
              h.primary_color AS home_color, a.primary_color AS away_color,
              m.home_score, m.away_score, m.home_pens, m.away_pens, m.winner_team_id, m.attendance
         FROM tournament_matches m
         JOIN teams h ON h.id = m.home_team_id
         JOIN teams a ON a.id = m.away_team_id
         LEFT JOIN tournament_venues v ON v.id = m.venue_id
        WHERE m.tournament_id = ?
        ORDER BY m.day, CASE WHEN v.is_main = 1 THEN 0 ELSE 1 END, m.bracket_pos`
    ).bind(t.id).all<MatchViewRow>(),
    db.prepare(
      `SELECT t.id, t.name, t.primary_color, COALESCE(t.reputation, 0) AS reputation, l.district
         FROM tournament_entries e JOIN teams t ON t.id = e.team_id LEFT JOIN leagues l ON l.id = t.league_id
        WHERE e.tournament_id = ?`
    ).bind(t.id).all<{ id: string; name: string; primary_color: string | null; reputation: number; district: string | null }>(),
    db.prepare("SELECT id, name, capacity, is_main FROM tournament_venues WHERE city = ? ORDER BY sort").bind(t.city)
      .all<{ id: string; name: string; capacity: number; is_main: number }>(),
    db.prepare(
      `SELECT s.player_id, p.first_name, p.last_name, s.team_id, t.name AS team_name,
              SUM(s.goals) AS goals, SUM(s.assists) AS assists, COUNT(*) AS apps
         FROM match_player_stats s
         JOIN tournament_matches m ON m.id = s.match_id AND m.tournament_id = ?
         LEFT JOIN players p ON p.id = s.player_id
         LEFT JOIN teams t ON t.id = s.team_id
        GROUP BY s.player_id
       HAVING SUM(s.goals) > 0
        ORDER BY goals DESC, assists DESC, apps ASC
        LIMIT 20`
    ).bind(t.id).all<{ player_id: string; first_name: string | null; last_name: string | null; team_id: string; team_name: string | null; goals: number; assists: number; apps: number }>(),
    db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
        WHERE team_id = ? AND type = 'tournament_prize'
          AND (reference_id = ? OR reference_id IN (SELECT 'tournament-' || id || '-' || ? FROM tournament_matches WHERE tournament_id = ?))`
    ).bind(teamId, `tournament-${t.id}-place-${teamId}`, teamId, t.id).first<{ total: number }>(),
  ]);

  const matches = matchRows.results.map((m) => ({
    id: m.id,
    stage: m.stage,
    day: m.day,
    scheduledAt: m.scheduled_at,
    status: m.status,
    venue: m.venue_id ? { id: m.venue_id, name: m.venue_name, isMain: m.venue_is_main === 1 } : null,
    home: { teamId: m.home_team_id, name: m.home_name, color: m.home_color },
    away: { teamId: m.away_team_id, name: m.away_name, color: m.away_color },
    homeScore: m.home_score,
    awayScore: m.away_score,
    homePens: m.home_pens,
    awayPens: m.away_pens,
    winnerTeamId: m.winner_team_id,
    attendance: m.attendance,
  }));

  const league = matchRows.results.filter((m) => m.stage === "league" && m.status === "simulated");
  const meta = new Map(teamRows.results.map((r) => [r.id, r]));
  const standings = computeStandings(teamRows.results, league.map((m) => ({
    home: m.home_team_id, away: m.away_team_id, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0,
  }))).map((r, i) => ({
    position: i + 1,
    teamId: r.teamId,
    name: meta.get(r.teamId)?.name ?? "",
    color: meta.get(r.teamId)?.primary_color ?? null,
    district: meta.get(r.teamId)?.district ?? null,
    played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
    goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: r.points,
  }));

  return {
    matches,
    standings,
    venues: venueRows.results.map((v) => ({ id: v.id, name: v.name, capacity: v.capacity, isMain: v.is_main === 1 })),
    scorers: scorerRows.results.map((s) => ({
      playerId: s.player_id,
      name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Neznámý hráč",
      teamId: s.team_id,
      teamName: s.team_name ?? "",
      goals: s.goals,
      assists: s.assists,
      apps: s.apps,
    })),
    myEarnings: earned?.total ?? 0,
    advancing: t.league_matches != null && teamRows.results.length >= 8 ? 8 : 4,
  };
}
