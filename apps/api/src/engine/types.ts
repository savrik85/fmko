import type { MatchEvent, EventType, GoalSource } from "@okresni-masina/shared";
import type { RefereeProfile, RefereeIncident } from "./referee";
import type { Hardness } from "./hardness";

export type Tactic = "offensive" | "balanced" | "defensive" | "long_ball" | "possession" | "pressing";
export type Weather = "sunny" | "cloudy" | "rain" | "wind" | "snow";
export type RelationType = "brothers" | "father_son" | "in_laws" | "classmates" | "coworkers" | "neighbors" | "drinking_buddies" | "rivals" | "mentor_pupil";

export type PreferredFoot = "left" | "right" | "both";
export type PreferredSide = "left" | "center" | "right" | "any";

export interface MatchPlayer {
  id: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: "GK" | "DEF" | "MID" | "FWD";
  matchPosition?: "GK" | "DEF" | "MID" | "FWD"; // pozice v sestavě (může se lišit od přirozené)
  // Core skills
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  strength: number;
  // Extended skills
  vision: number;
  creativity: number;
  setPieces: number;
  // Personality
  discipline: number;
  alcohol: number;
  temper: number;
  leadership: number;
  workRate: number;
  aggression: number;
  consistency: number;  // hidden from UI
  clutch: number;       // hidden from UI
  injuryProneness?: number; // 0-100, váží výběr zraněného v simulaci (default 50)
  // Positioning
  preferredFoot: PreferredFoot;
  preferredSide: PreferredSide;
  // Mutable state
  condition: number;
  morale: number;
  // Relationships with other players in lineup (injected by match-runner).
  // `strength` (20–95) škáluje sílu efektu — chybí-li, počítá se neutrální 50.
  relationshipsInLineup?: Array<{ withId: number; type: RelationType; strength?: number }>;
}

export interface TeamSetup {
  teamId: number;
  teamName: string;
  lineup: MatchPlayer[];   // 11 hráčů na hřišti
  subs: MatchPlayer[];     // náhradníci
  tactic: Tactic;
  formation?: string;      // např. "4-4-2", "3-4-3" — pro formationSynergy
  captainId?: number;      // engine ID kapitána (ovlivňuje morale)
  /** Engine ID exekutora penalt. Není-li na hřišti, kope nejlepší setPieces. */
  penaltyTakerId?: number;
  /** Engine ID exekutora přímých kopů a rohů. Fallback stejný jako u penalt. */
  freekickTakerId?: number;
  /** Jak tvrdě tým hraje. Chybí-li, počítá se "normal". */
  hardness?: Hardness;
  formationFamiliarity?: number;  // 0-100, sehranost zvolené formace
  weatherResist?: number;  // 0-0.45 ze zimní výbavy — tlumí postih počasí (nastavuje simulateMatch)
}

export interface EquipmentMods {
  techniqueMod: number;    // bonus to technique (e.g. +3 from good balls)
  gkBonus: number;         // bonus to GK skill
  injurySeverityMod: number; // 0-0.3, reduces injury chance
  conditionDrainMod: number; // 0-0.24, reduces condition drain
  moraleMod: number;        // bonus morale at start
  setPiecesMod?: number;    // tréninková zeď: bonus ke standardkám
  weatherResistMod?: number; // zimní výbava: postih počasí ×(1 - mod)
  lateFatigueMod?: number;   // iontové nápoje: propad kondice po 70. minutě ×(1 - mod)
}

export interface MatchConfig {
  home: TeamSetup;
  away: TeamSetup;
  weather: Weather;
  isHomeAdvantage: boolean;
  /** Možnost přepsat sílu domácí výhody (0–0.10). Když není nastaveno,
   *  použije se 0.05 pokud isHomeAdvantage, jinak 0. */
  homeAdvantage?: number;
  pitchCondition?: number; // 0-100, affects injury probability
  /** Nasáklost půdy 0–100 (50 = normál) — bahno i vyprahlá zem mění hru i riziko zranění. */
  pitchMoisture?: number | null;
  stadiumName?: string;
  attendance?: number;
  homeEquipment?: EquipmentMods;
  awayEquipment?: EquipmentMods;
  /** Delegovaný rozhodčí. Chybí-li (nedelegováno, přátelák), použije se NEUTRAL_REFEREE. */
  referee?: RefereeProfile;
}

export interface MatchMinuteState {
  minute: number;
  homeScore: number;
  awayScore: number;
  possession: "home" | "away";
}

export interface PlayerMinuteTrack {
  entered: number;   // minuta vstupu (0 = starter)
  left: number | null; // minuta odchodu (null = dohrál do konce)
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  homeLineup: MatchPlayer[];
  awayLineup: MatchPlayer[];
  playerMinutes: Record<number, PlayerMinuteTrack>; // engineId → minuty
  possessionHome: number; // 0-100, average možnost domácích za zápas
  /** Sporné situace rozhodčího — nejvýš jedna na zápas. */
  refereeIncidents: RefereeIncident[];
  /** Známka rozhodčího za zápas, 1,0–5,0. */
  refereeGrade: number;
}

export { MatchEvent, EventType, GoalSource };
export type { RefereeProfile, RefereeIncident, Hardness };
