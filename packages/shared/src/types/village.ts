export type VillageCategory = "vesnice" | "obec" | "mestys" | "mesto";
export type PitchType = "hlinak" | "trava" | "umelka";

export interface Village {
  id: number;
  name: string;
  code: string;
  district: string;
  region: string;
  population: number;
  latitude: number | null;
  longitude: number | null;
  category: VillageCategory;
  baseBudget: number;
  playerPoolSize: number;
  pitchType: PitchType;
  createdAt: string;
}