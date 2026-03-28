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
  game_date?: string;
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
  loan_from_team_id?: string | null;
  loan_until?: string | null;
  squad_number?: number | null;
  weekly_wage?: number | null;
}

export interface CareerStats {
  seasons: {
    season: number;
    teamId: string;
    teamName: string;
    teamColor: string;
    teamSecondary: string;
    teamBadge: string;
    leagueName: string | null;
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    avgRating: number;
    cleanSheets: number;
    minutesPlayed: number;
  }[];
  totals: {
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
  };
}

export interface PlayerContract {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamSecondary: string;
  teamBadge: string;
  seasonNumber: number;
  joinedAt: string;
  leftAt: string | null;
  joinType: string;
  joinLabel: string;
  leaveType: string | null;
  fee: number;
  isActive: boolean;
}

export interface PlayerMatchEntry {
  matchId: string;
  date: string;
  round: number;
  isHome: boolean;
  opponent: string;
  opponentId: string;
  opponentColor: string;
  opponentSecondary: string;
  opponentBadge: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "D" | "L";
  position: string;
  started: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;
  weather: string | null;
}

export interface TeamMatchResult {
  id: string;
  round: number;
  date: string;
  isHome: boolean;
  opponent: string;
  opponentId: string;
  opponentColor: string;
  opponentSecondary: string;
  opponentBadge: string;
  homeScore: number;
  awayScore: number;
  result: "W" | "D" | "L";
  weather: string | null;
  attendance: number | null;
  stadium: string | null;
}

export interface TeamMatchResults {
  matches: TeamMatchResult[];
  form: string[];
  summary: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  topPlayers: {
    playerId: string;
    name: string;
    nickname: string | null;
    position: string;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    appearances: number;
    avgRating: number;
  }[];
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
