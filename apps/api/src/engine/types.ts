import type { MatchEvent, EventType } from "@okresni-masina/shared";

export type Tactic = "offensive" | "balanced" | "defensive" | "long_ball";
export type Weather = "sunny" | "cloudy" | "rain" | "wind" | "snow";

export interface MatchPlayer {
  id: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: "GK" | "DEF" | "MID" | "FWD";
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  strength: number;
  discipline: number;
  alcohol: number;
  temper: number;
  condition: number; // Mutable during match — starts at player's condition
  morale: number;
}

export interface TeamSetup {
  teamId: number;
  teamName: string;
  lineup: MatchPlayer[];   // 11 hráčů na hřišti
  subs: MatchPlayer[];     // náhradníci
  tactic: Tactic;
}

export interface MatchConfig {
  home: TeamSetup;
  away: TeamSetup;
  weather: Weather;
  isHomeAdvantage: boolean;
}

export interface MatchMinuteState {
  minute: number;
  homeScore: number;
  awayScore: number;
  possession: "home" | "away";
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  homeLineup: MatchPlayer[]; // Final state (kondice atd.)
  awayLineup: MatchPlayer[];
}

export { MatchEvent, EventType };
