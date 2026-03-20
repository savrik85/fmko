export interface User {
  id: number;
  email: string;
  displayName: string;
  teamId: number | null;
  createdAt: string;
}