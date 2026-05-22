/**
 * Lightweight DB → MatchPlayer loader pro lineup-preview endpoint.
 *
 * Nedělá absence/injury/suspended kontrolu (to je už ošetřeno v UI před voláním).
 * Pouze namapuje DB row na MatchPlayer struct kompatibilní s lineup-strength.ts.
 */

import type { MatchPlayer } from "./types";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  position: string;
  skills: string;
  personality: string;
  life_context: string;
  physical: string | null;
}

let engineIdCounter = 1;

export function mapRowToMatchPlayer(row: PlayerRow, matchPosition?: string): MatchPlayer {
  const skills = JSON.parse(row.skills) as Record<string, number>;
  const personality = JSON.parse(row.personality) as Record<string, number | string>;
  const lifeContext = JSON.parse(row.life_context) as Record<string, number | string>;
  const physical = row.physical ? JSON.parse(row.physical) as Record<string, number | string> : {};

  return {
    id: engineIdCounter++,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    position: row.position as "GK" | "DEF" | "MID" | "FWD",
    matchPosition: matchPosition ? matchPosition as "GK" | "DEF" | "MID" | "FWD" : undefined,
    speed: (skills.speed as number) ?? 50,
    technique: (skills.technique as number) ?? 50,
    shooting: (skills.shooting as number) ?? 50,
    passing: (skills.passing as number) ?? 50,
    heading: (skills.heading as number) ?? 50,
    defense: (skills.defense as number) ?? 50,
    goalkeeping: (skills.goalkeeping as number) ?? 50,
    stamina: ((physical.stamina as number) ?? (skills.stamina as number)) ?? 50,
    strength: ((physical.strength as number) ?? (skills.strength as number)) ?? 50,
    vision: (skills.vision as number) ?? 50,
    creativity: (skills.creativity as number) ?? 50,
    setPieces: (skills.setPieces as number) ?? 50,
    discipline: (personality.discipline as number) ?? 50,
    alcohol: (personality.alcohol as number) ?? 30,
    temper: (personality.temper as number) ?? 40,
    leadership: (personality.leadership as number) ?? 30,
    workRate: (personality.workRate as number) ?? 50,
    aggression: (personality.aggression as number) ?? 40,
    consistency: (personality.consistency as number) ?? 50,
    clutch: (personality.clutch as number) ?? 50,
    preferredFoot: ((physical.preferredFoot as string) ?? "right") as MatchPlayer["preferredFoot"],
    preferredSide: ((physical.preferredSide as string) ?? "center") as MatchPlayer["preferredSide"],
    condition: (lifeContext.condition as number) ?? 100,
    morale: (lifeContext.morale as number) ?? 50,
  };
}

/**
 * Vybere "best 11" pro daný tým podle ratingu a pozic — auto sestava pro soupeře
 * v lineup-preview, kdy nevíme co soupeř postaví. Hradí "best available" princip.
 */
export async function autoSelectBest11(
  db: D1Database,
  teamId: string,
): Promise<{ players: MatchPlayer[]; tactic: "balanced"; formation: "4-4-2" }> {
  const rows = (await db.prepare(
    "SELECT id, first_name, last_name, nickname, position, skills, personality, life_context, physical, overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
  ).bind(teamId).all<PlayerRow & { overall_rating: number }>()).results ?? [];

  // 4-4-2: 1 GK + 4 DEF + 4 MID + 2 FWD
  const quotas: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const lineup: PlayerRow[] = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    const candidates = rows.filter((r) => r.position === pos).slice(0, quotas[pos]);
    lineup.push(...candidates);
  }

  // Fill any missing slots with best remaining players (in case team has fewer of some position)
  const filled = new Set(lineup.map((r) => r.id));
  while (lineup.length < 11) {
    const next = rows.find((r) => !filled.has(r.id));
    if (!next) break;
    lineup.push(next);
    filled.add(next.id);
  }

  const matchPlayers = lineup.map((r) => mapRowToMatchPlayer(r, r.position));
  return { players: matchPlayers, tactic: "balanced", formation: "4-4-2" };
}
