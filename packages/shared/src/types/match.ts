export type MatchStatus = "scheduled" | "in_progress" | "finished";

export type EventType =
  | "goal"
  | "chance"
  | "foul"
  | "card"
  | "injury"
  | "substitution"
  | "special";

export interface MatchEvent {
  minute: number;
  type: EventType;
  playerId: number;
  playerName: string;
  teamId: number;
  description: string;
  detail?: string;
}

export interface Match {
  id: number;
  leagueId: number;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  events: MatchEvent[];
  commentary: string[];
  playedAt: string | null;
  createdAt: string;
}