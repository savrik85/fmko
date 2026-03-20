export type LeagueStatus =
  | "preparation"
  | "autumn"
  | "winter_break"
  | "spring"
  | "finished";

export interface League {
  id: number;
  name: string;
  district: string;
  level: number;
  season: string;
  currentRound: number;
  totalRounds: number;
  status: LeagueStatus;
  createdAt: string;
}