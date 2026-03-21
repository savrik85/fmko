/**
 * FMK-18: Match runner — orchestruje simulaci zápasu pro multiplayer.
 *
 * Volán z cron triggeru v čase zápasu.
 * 1. Najde všechny scheduled matches pro tento tick
 * 2. Pro každý match: zkontroluje lineup, případně auto-lineup
 * 3. Spustí simulaci (engine/simulation.ts)
 * 4. Uloží výsledky do DB
 */

export interface MatchRunResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  eventsCount: number;
  matchType: "pvp" | "pve_home" | "pve_away" | "ai_vs_ai";
}

/**
 * Run all matches scheduled for a given calendar entry.
 *
 * This is the main entry point called by the cron worker.
 * In production, this queries D1 for scheduled matches,
 * loads lineups, runs simulation, and saves results.
 */
export async function runScheduledMatches(
  db: D1Database,
  calendarId: string,
): Promise<MatchRunResult[]> {
  const results: MatchRunResult[] = [];

  // 1. Find all matches for this calendar entry
  const matches = await db.prepare(
    "SELECT * FROM matches WHERE calendar_id = ? AND status = 'lineups_open'"
  ).bind(calendarId).all();

  for (const match of matches.results) {
    const matchId = match.id as string;
    const homeTeamId = match.home_team_id as string;
    const awayTeamId = match.away_team_id as string;

    // 2. Check lineups exist, generate auto if missing
    let homeLineup = await db.prepare(
      "SELECT * FROM lineups WHERE team_id = ? AND calendar_id = ?"
    ).bind(homeTeamId, calendarId).first();

    let awayLineup = await db.prepare(
      "SELECT * FROM lineups WHERE team_id = ? AND calendar_id = ?"
    ).bind(awayTeamId, calendarId).first();

    // Auto-lineup for teams without submitted lineup
    if (!homeLineup) {
      homeLineup = await createAutoLineup(db, homeTeamId, calendarId);
    }
    if (!awayLineup) {
      awayLineup = await createAutoLineup(db, awayTeamId, calendarId);
    }

    // 3. Determine match type
    const homeTeam = await db.prepare("SELECT * FROM teams WHERE id = ?").bind(homeTeamId).first();
    const awayTeam = await db.prepare("SELECT * FROM teams WHERE id = ?").bind(awayTeamId).first();
    const homeIsHuman = !!(homeTeam?.user_id);
    const awayIsHuman = !!(awayTeam?.user_id);
    const matchType = homeIsHuman && awayIsHuman ? "pvp" as const
      : homeIsHuman ? "pve_home" as const
      : awayIsHuman ? "pve_away" as const
      : "ai_vs_ai" as const;

    // 4. Simulate match (simplified — full simulation uses engine/simulation.ts)
    // For now: random score based on team strength
    const homeRating = await getTeamAvgRating(db, homeTeamId);
    const awayRating = await getTeamAvgRating(db, awayTeamId);

    const homeAdvantage = 3; // Home team bonus
    const homeExpected = (homeRating + homeAdvantage) / (homeRating + homeAdvantage + awayRating);

    const homeScore = Math.floor(Math.random() * 4 * homeExpected + Math.random());
    const awayScore = Math.floor(Math.random() * 4 * (1 - homeExpected) + Math.random());

    // 5. Save results
    await db.prepare(
      "UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?, simulated_at = datetime('now') WHERE id = ?"
    ).bind(homeScore, awayScore, matchId).run();

    results.push({ matchId, homeScore, awayScore, eventsCount: 0, matchType });
  }

  return results;
}

async function getTeamAvgRating(db: D1Database, teamId: string): Promise<number> {
  const result = await db.prepare(
    "SELECT AVG(overall_rating) as avg_rating FROM players WHERE team_id = ?"
  ).bind(teamId).first<{ avg_rating: number }>();
  return result?.avg_rating ?? 30;
}

async function createAutoLineup(
  db: D1Database,
  teamId: string,
  calendarId: string,
): Promise<Record<string, unknown>> {
  const players = await db.prepare(
    "SELECT id, position, overall_rating FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 11"
  ).bind(teamId).all();

  const lineupData = players.results.map((p) => ({
    playerId: p.id, position: p.position,
  }));

  const lineupId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, is_auto) VALUES (?, ?, ?, '4-4-2', 'balanced', ?, 1)"
  ).bind(lineupId, teamId, calendarId, JSON.stringify(lineupData)).run();

  return { id: lineupId, team_id: teamId, calendar_id: calendarId };
}
