/**
 * Výpočet ligové tabulky.
 */

export interface StandingEntry {
  teamIndex: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface MatchResult {
  homeTeamIndex: number;
  awayTeamIndex: number;
  homeScore: number;
  awayScore: number;
}

/**
 * Calculate league standings from match results.
 */
export function calculateStandings(
  teamCount: number,
  results: MatchResult[],
): StandingEntry[] {
  const standings: StandingEntry[] = Array.from({ length: teamCount }, (_, i) => ({
    teamIndex: i,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }));

  for (const r of results) {
    const home = standings[r.homeTeamIndex];
    const away = standings[r.awayTeamIndex];

    home.played++;
    away.played++;
    home.goalsFor += r.homeScore;
    home.goalsAgainst += r.awayScore;
    away.goalsFor += r.awayScore;
    away.goalsAgainst += r.homeScore;

    if (r.homeScore > r.awayScore) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (r.homeScore < r.awayScore) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points += 1;
      away.points += 1;
    }
  }

  // Sort: points DESC, goal diff DESC, goals for DESC
  standings.sort((a, b) => {
    const pointDiff = b.points - a.points;
    if (pointDiff !== 0) return pointDiff;

    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;

    return b.goalsFor - a.goalsFor;
  });

  return standings;
}
