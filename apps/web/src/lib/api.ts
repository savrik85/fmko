const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? "API error");
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
  skills: { speed: number; technique: number; shooting: number; passing: number; heading: number; defense: number; goalkeeping: number };
  physical: { stamina: number; strength: number; injuryProneness: number; height?: number; weight?: number };
  personality: { discipline: number; patriotism: number; alcohol: number; temper: number };
  lifeContext: { occupation: string; condition: number; morale: number };
  avatar: Record<string, unknown>;
  description: string;
}
