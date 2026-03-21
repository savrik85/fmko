/**
 * FMK-18: Matchmaking — automatické párování hráčů v rámci okresu.
 *
 * Ligové zápasy: dle rozpisu (season_calendar + schedule)
 * Přátelské: výzvy mezi hráčskými týmy
 */

import type { Rng } from "../generators/rng";

export interface MatchPairing {
  homeTeamId: string;
  awayTeamId: string;
  isLeague: boolean;
  round?: number;
}

/**
 * Generate match pairings for a calendar entry (league round).
 * Finds which teams play in this round from the schedule.
 */
export function getLeaguePairings(
  schedule: Array<{ round: number; homeTeamIndex: number; awayTeamIndex: number }>,
  teamIds: string[],
  round: number,
): MatchPairing[] {
  return schedule
    .filter((s) => s.round === round)
    .map((s) => ({
      homeTeamId: teamIds[s.homeTeamIndex],
      awayTeamId: teamIds[s.awayTeamIndex],
      isLeague: true,
      round,
    }));
}

/**
 * Check if a team has a human player (not AI).
 * Both teams being human = PvP match.
 * One human + one AI = simulated with AI lineup.
 */
export function isPvPMatch(
  homeIsHuman: boolean,
  awayIsHuman: boolean,
): "pvp" | "pve_home" | "pve_away" | "ai_vs_ai" {
  if (homeIsHuman && awayIsHuman) return "pvp";
  if (homeIsHuman) return "pve_home";
  if (awayIsHuman) return "pve_away";
  return "ai_vs_ai";
}

/**
 * Generate auto-lineup for a team that didn't submit one.
 * Picks best available players by overall rating.
 */
export function generateAutoLineup(
  players: Array<{ id: string; position: string; overall_rating: number }>,
): Array<{ playerId: string; position: string }> {
  const byPosition: Record<string, typeof players> = { GK: [], DEF: [], MID: [], FWD: [] };

  for (const p of players) {
    byPosition[p.position]?.push(p);
  }

  // Sort each position by rating desc
  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => b.overall_rating - a.overall_rating);
  }

  // Pick 4-4-2 formation: 1 GK, 4 DEF, 4 MID, 2 FWD
  const lineup: Array<{ playerId: string; position: string }> = [];
  const targets: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

  for (const [pos, count] of Object.entries(targets)) {
    const available = byPosition[pos];
    for (let i = 0; i < count && i < available.length; i++) {
      lineup.push({ playerId: available[i].id, position: pos });
    }
  }

  // Fill remaining spots from any position if short
  const usedIds = new Set(lineup.map((l) => l.playerId));
  const remaining = players
    .filter((p) => !usedIds.has(p.id))
    .sort((a, b) => b.overall_rating - a.overall_rating);

  while (lineup.length < 11 && remaining.length > 0) {
    const p = remaining.shift()!;
    lineup.push({ playerId: p.id, position: p.position });
  }

  return lineup;
}
