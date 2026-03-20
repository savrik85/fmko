/**
 * Generátor rozpisu zápasů pro ligový systém.
 *
 * Dvojkolo (každý s každým 2×) — podzim + jaro.
 * Round-robin algoritmus (Berger table).
 */

import type { Rng } from "../generators/rng";

export interface ScheduledMatch {
  round: number;
  homeTeamIndex: number;
  awayTeamIndex: number;
}

/**
 * Generate a full double round-robin schedule.
 *
 * For N teams: (N-1)*2 rounds, each round has N/2 matches.
 * If N is odd, one team has a bye each round.
 */
export function generateSchedule(rng: Rng, teamCount: number): ScheduledMatch[] {
  const matches: ScheduledMatch[] = [];

  // Make even by adding a "bye" team
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  const hasBye = teamCount % 2 !== 0;
  const byeIndex = n - 1;

  const teams = Array.from({ length: n }, (_, i) => i);

  // First half (podzim) — standard round-robin
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];

      if (hasBye && (home === byeIndex || away === byeIndex)) continue;

      // Alternate home/away for first team to balance
      if (round % 2 === 0) {
        matches.push({ round: round + 1, homeTeamIndex: home, awayTeamIndex: away });
      } else {
        matches.push({ round: round + 1, homeTeamIndex: away, awayTeamIndex: home });
      }
    }

    // Rotate teams (keep first team fixed)
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  // Second half (jaro) — reversed home/away
  const firstHalfCount = matches.length;
  const roundsInFirstHalf = n - 1;

  for (let i = 0; i < firstHalfCount; i++) {
    const m = matches[i];
    matches.push({
      round: m.round + roundsInFirstHalf,
      homeTeamIndex: m.awayTeamIndex,
      awayTeamIndex: m.homeTeamIndex,
    });
  }

  return matches;
}

/**
 * Calculate total rounds for a league.
 */
export function totalRounds(teamCount: number): number {
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return (n - 1) * 2;
}
