export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";
export type BodyType = "thin" | "athletic" | "normal" | "stocky" | "obese";

export interface PlayerAttributes {
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  strength: number;
  injuryProneness: number;
  discipline: number;
  patriotism: number;
  alcohol: number;
  temper: number;
}

export interface AvatarConfig {
  bodyType: BodyType;
  head: number;
  eyes: number;
  nose: number;
  mouth: number;
  ears: number;
  hair: string;
  hairColor: string;
  skinTone: string;
  facialHair: string;
  glasses: string;
  accessories: string[];
}

export interface Player {
  id: number;
  teamId: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  position: PlayerPosition;
  speed: number;
  technique: number;
  shooting: number;
  passing: number;
  heading: number;
  defense: number;
  goalkeeping: number;
  stamina: number;
  strength: number;
  injuryProneness: number;
  discipline: number;
  patriotism: number;
  alcohol: number;
  temper: number;
  occupation: string | null;
  bodyType: BodyType;
  avatarConfig: AvatarConfig;
  condition: number;
  morale: number;
  injuredUntil: string | null;
  createdAt: string;
}