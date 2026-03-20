export type RelationshipType =
  | "brothers"
  | "father_son"
  | "in_laws"
  | "classmates"
  | "coworkers";

export interface Relationship {
  id: number;
  playerAId: number;
  playerBId: number;
  type: RelationshipType;
  strength: number;
  createdAt: string;
}