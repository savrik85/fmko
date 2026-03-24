const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    // Network error (API unreachable) — throw with status 0
    const error = new Error("Network error");
    (error as Error & { status: number }).status = 0;
    throw error;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error((err as { error: string }).error ?? "API error");
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.json() as Promise<T>;
}

export interface Village {
  id: string;
  name: string;
  district: string;
  region: string;
  population: number;
  size: string;
  lat: number;
  lng: number;
}

export interface Team {
  id: string;
  user_id?: string;
  name: string;
  village_name: string;
  population: number;
  size: string;
  district: string;
  region: string;
  primary_color: string;
  secondary_color: string;
  budget: number;
  reputation: number;
  league_id?: string;
  jersey_pattern?: string;
  badge_pattern?: string;
  stadium_name?: string;
  captain_id?: string;
  penalty_taker_id?: string;
  freekick_taker_id?: string;
}

export interface Player {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  overall_rating: number;
  skills: { speed: number; technique: number; shooting: number; passing: number; heading: number; defense: number; goalkeeping: number; creativity?: number; setPieces?: number };
  physical: { stamina: number; strength: number; injuryProneness: number; height?: number; weight?: number; preferredFoot?: "left" | "right" | "both"; preferredSide?: "left" | "center" | "right" | "any" };
  personality: { discipline: number; patriotism: number; alcohol: number; temper: number; leadership?: number; workRate?: number; aggression?: number; consistency?: number; clutch?: number };
  lifeContext: { occupation: string; condition: number; morale: number };
  avatar: Record<string, unknown>;
  description: string;
  residence?: string;
  commute_km?: number;
}

export interface CareerStats {
  seasons: {
    season: number;
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    avgRating: number;
    cleanSheets: number;
  }[];
  totals: {
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  };
}

export interface ManagerProfile {
  id: string;
  name: string;
  backstory: string;
  avatar: Record<string, unknown>;
  age?: number;
  coaching?: number;
  motivation?: number;
  tactics?: number;
  youthDevelopment?: number;
  discipline?: number;
  reputation?: number;
  bio?: string;
  birthplace?: string;
}
