export interface Team {
  id: number;
  villageId: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  budget: number;
  reputation: number;
  leagueId: number | null;
  isAi: boolean;
  createdAt: string;
}