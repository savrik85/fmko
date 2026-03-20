export type SponsorType = "hospoda" | "obchod" | "remeslo" | "firma" | "obec";

export interface Sponsor {
  id: number;
  teamId: number;
  name: string;
  type: SponsorType;
  monthlyAmount: number;
  winBonus: number;
  contractUntil: string;
  createdAt: string;
}