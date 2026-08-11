export type MatchStatus = "scheduled" | "in_progress" | "finished";

export type EventType =
  | "goal"
  | "assist"
  | "chance"
  | "foul"
  | "card"
  | "injury"
  | "substitution"
  | "special"
  | "penalty"
  | "corner"
  | "freekick";

/**
 * Odkud gól přišel. Chybí-li (starší zápasy), jde o gól ze hry.
 * Nese ho událost typu "goal" — `detail` u gólu je obsazený skóre.
 */
export type GoalSource = "open_play" | "counter" | "penalty" | "freekick" | "corner" | "cross";

export interface MatchEvent {
  minute: number;
  type: EventType;
  playerId: number;
  playerName: string;
  teamId: number;
  description: string;
  detail?: string;
  source?: GoalSource;
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