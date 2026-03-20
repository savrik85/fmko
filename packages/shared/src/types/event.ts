export type GameEventType =
  | "injury"
  | "absence"
  | "morale_change"
  | "sponsor_offer"
  | "player_arrival"
  | "player_departure"
  | "training"
  | "special";

export interface GameEvent {
  id: number;
  teamId: number;
  playerId: number | null;
  type: GameEventType;
  description: string;
  impact: Record<string, unknown> | null;
  season: string | null;
  round: number | null;
  createdAt: string;
}