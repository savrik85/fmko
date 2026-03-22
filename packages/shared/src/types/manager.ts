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
  createdAt: string;
}
