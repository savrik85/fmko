/**
 * FMK-22: Poháry a turnaje — vyřazovací systém.
 */

import type { Rng } from "../generators/rng";

export type CupType = "district_cup" | "regional_cup" | "winter_tournament" | "friendly_tournament";

export interface BracketMatch {
  roundName: string;     // "1. kolo", "Čtvrtfinále", "Semifinále", "Finále"
  matchIndex: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore?: number;
  awayScore?: number;
  winnerId?: string;
  status: "pending" | "scheduled" | "played";
}

export interface CupBracket {
  rounds: BracketMatch[][];
  totalRounds: number;
}

const ROUND_NAMES: Record<number, string[]> = {
  2: ["Finále"],
  4: ["Semifinále", "Finále"],
  8: ["Čtvrtfinále", "Semifinále", "Finále"],
  16: ["1. kolo", "Čtvrtfinále", "Semifinále", "Finále"],
};

/**
 * Generate a knockout bracket for N teams.
 * Teams are seeded and paired: 1 vs N, 2 vs N-1, etc.
 */
export function generateBracket(
  rng: Rng,
  teamIds: string[],
): CupBracket {
  // Round up to nearest power of 2
  let bracketSize = 2;
  while (bracketSize < teamIds.length) bracketSize *= 2;

  const totalRounds = Math.log2(bracketSize);
  const roundNames = ROUND_NAMES[bracketSize] ?? Array.from(
    { length: totalRounds },
    (_, i) => i === totalRounds - 1 ? "Finále" : i === totalRounds - 2 ? "Semifinále" : `${i + 1}. kolo`,
  );

  // Shuffle teams for random draw
  const shuffled = [...teamIds];
  rng.shuffle(shuffled);

  // Pad with byes (null)
  while (shuffled.length < bracketSize) {
    shuffled.push("BYE");
  }

  // Generate first round
  const firstRound: BracketMatch[] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const home = shuffled[i];
    const away = shuffled[bracketSize - 1 - i];

    firstRound.push({
      roundName: roundNames[0],
      matchIndex: i,
      homeTeamId: home === "BYE" ? null : home,
      awayTeamId: away === "BYE" ? null : away,
      status: home === "BYE" || away === "BYE" ? "played" : "pending",
      // Auto-advance byes
      winnerId: home === "BYE" ? (away === "BYE" ? undefined : away)
        : away === "BYE" ? home : undefined,
    });
  }

  // Generate empty subsequent rounds
  const rounds: BracketMatch[][] = [firstRound];
  let matchesInRound = bracketSize / 4;

  for (let r = 1; r < totalRounds; r++) {
    const round: BracketMatch[] = [];
    for (let i = 0; i < matchesInRound; i++) {
      round.push({
        roundName: roundNames[r],
        matchIndex: i,
        homeTeamId: null,
        awayTeamId: null,
        status: "pending",
      });
    }
    rounds.push(round);
    matchesInRound = Math.max(1, matchesInRound / 2);
  }

  return { rounds, totalRounds };
}

/**
 * Advance winner to next round.
 */
export function advanceWinner(
  bracket: CupBracket,
  roundIndex: number,
  matchIndex: number,
  winnerId: string,
): void {
  const match = bracket.rounds[roundIndex][matchIndex];
  match.winnerId = winnerId;
  match.status = "played";

  // Place winner in next round
  if (roundIndex + 1 < bracket.totalRounds) {
    const nextMatchIndex = Math.floor(matchIndex / 2);
    const nextMatch = bracket.rounds[roundIndex + 1][nextMatchIndex];
    if (matchIndex % 2 === 0) {
      nextMatch.homeTeamId = winnerId;
    } else {
      nextMatch.awayTeamId = winnerId;
    }
    // If both teams filled, mark as scheduled
    if (nextMatch.homeTeamId && nextMatch.awayTeamId) {
      nextMatch.status = "scheduled";
    }
  }
}
