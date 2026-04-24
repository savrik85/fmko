// Helper pro sestaveni player view objektu s optional "blur" pro cizi tymy.
// Stejna logika jako v teams.ts GET /:id/players/:playerId (radky 940-958),
// aby ji mohl pouzit i detail offer endpoint, market endpoint atd.

type Json = Record<string, unknown>;

function parseJson(value: unknown): Json {
  if (!value) return {};
  if (typeof value === "object") return value as Json;
  try { return JSON.parse(value as string) as Json; } catch { return {}; }
}

const blur5 = (v: number) => Math.round(v / 5) * 5;
const blur10 = (v: number) => Math.round(v / 10) * 10;

export interface PlayerView {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  age: number;
  position: string;
  overall_rating: number;
  avatar: Json;
  skills: Record<string, number>;
  physical: Record<string, number>;
  personality: Record<string, number>;
  lifeContext: Json;
  isOwn: boolean;
  weekly_wage: number | null;
  squad_number: number | null;
  loan_from_team_id: string | null;
  loan_until: string | null;
}

export function buildPlayerView(row: Record<string, unknown>, viewerTeamId: string): PlayerView {
  const isOwn = row.team_id === viewerTeamId;
  const skills = parseJson(row.skills) as Record<string, number>;
  const physical = parseJson(row.physical) as Record<string, number>;
  const personality = parseJson(row.personality) as Record<string, number>;
  const lifeContext = parseJson(row.life_context);
  const avatar = parseJson(row.avatar);

  if (!isOwn) {
    for (const k of Object.keys(skills)) { if (typeof skills[k] === "number") skills[k] = blur5(skills[k]); }
    for (const k of Object.keys(physical)) { if (typeof physical[k] === "number") physical[k] = blur5(physical[k]); }
    for (const k of Object.keys(personality)) { if (typeof personality[k] === "number") personality[k] = blur5(personality[k]); }
    lifeContext.condition = blur10((lifeContext.condition as number) ?? 50);
    lifeContext.morale = blur10((lifeContext.morale as number) ?? 50);
  }

  return {
    id: row.id as string,
    team_id: row.team_id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    nickname: (row.nickname as string | null) ?? null,
    age: row.age as number,
    position: row.position as string,
    overall_rating: row.overall_rating as number,
    avatar,
    skills,
    physical,
    personality,
    lifeContext,
    isOwn,
    weekly_wage: isOwn ? ((row.weekly_wage as number | null) ?? null) : null,
    squad_number: isOwn ? ((row.squad_number as number | null) ?? null) : null,
    loan_from_team_id: (row.loan_from_team_id as string | null) ?? null,
    loan_until: (row.loan_until as string | null) ?? null,
  };
}
