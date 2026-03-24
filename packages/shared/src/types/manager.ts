export type ManagerBackstory =
  | "byvaly_hrac"
  | "mistni_ucitel"
  | "pristehovalec"
  | "syn_trenera"
  | "hospodsky";

export interface Manager {
  id: string;
  userId: string;
  teamId: string;
  name: string;
  backstory: ManagerBackstory;
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
  createdAt: string;
}
