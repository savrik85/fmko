// Helper pro sestaveni player view objektu s optional "blur" pro cizi tymy.
// Stejna logika jako v teams.ts GET /:id/players/:playerId (radky 940-958),
// aby ji mohl pouzit i detail offer endpoint, market endpoint atd.

import { logger } from "../lib/logger";

type Json = Record<string, unknown>;

function parseJson(value: unknown): Json {
  if (!value) return {};
  if (typeof value === "object") return value as Json;
  try {
    return JSON.parse(value as string) as Json;
  } catch (e) {
    logger.warn({ module: "player-view" }, "nečitelný JSON hráče", e);
    return {};
  }
}

const blur5 = (v: number) => Math.round(v / 5) * 5;
const blur10 = (v: number) => Math.round(v / 10) * 10;

/**
 * Co z `life_context` smí vidět cizí klub. Whitelist, ne blacklist: do `life_context`
 * se průběžně přidávají interní klíče (truc, potenciál, náklady celebrity, kocovina,
 * volno, důvod absence) a každý nový by jinak automaticky unikl soupeři.
 */
export function verejnyZivotHrace(lifeContext: Json): Json {
  const out: Json = {
    condition: blur10((lifeContext.condition as number) ?? 50),
    morale: blur10((lifeContext.morale as number) ?? 50),
  };
  if (typeof lifeContext.occupation === "string") out.occupation = lifeContext.occupation;
  return out;
}

/** Zaokrouhlí číselné atributy na pětky — cizí klub vidí jen přibližnou úroveň. */
export function zamlzAtributy(obj: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...obj };
  for (const k of Object.keys(out)) { if (typeof out[k] === "number") out[k] = blur5(out[k]); }
  return out;
}

/** Sloupce hráče, které cizí klub nesmí dostat ani surově. */
const TAJNE_SLOUPCE = ["skills_max", "gk_skills_max", "hidden_talent", "coach_relationship"] as const;

/**
 * Řádek hráče z `SELECT *` očištěný pro cizí klub: bez potenciálu, skrytého talentu,
 * vztahu k trenérovi a mzdy, se zamlženými brankářskými dovednostmi.
 *
 * `skills_max` nese i aktuální hodnoty přehledu a zkušenosti, které u části hráčů
 * v plochém `skills` chybí a detail hráče si je odtud dohledává. Proto se vrací
 * zvlášť `doplnitDoSkills` (jen aktuální hodnoty, zamlžené) a maximum ven nejde.
 */
export function ocistiRadekProCizi(row: Json): { row: Json; doplnitDoSkills: Record<string, number> } {
  const doplnitDoSkills: Record<string, number> = {};
  const max = parseJson(row.skills_max);
  for (const [k, v] of Object.entries(max)) {
    const current = typeof v === "number" ? v
      : (v && typeof v === "object" && typeof (v as { current?: unknown }).current === "number") ? (v as { current: number }).current
      : null;
    if (current != null) doplnitDoSkills[k] = blur5(current);
  }
  const out: Json = { ...row };
  for (const k of TAJNE_SLOUPCE) delete out[k];
  out.weekly_wage = null;
  if (out.gk_skills) out.gk_skills = JSON.stringify(zamlzAtributy(parseJson(out.gk_skills) as Record<string, number>));
  return { row: out, doplnitDoSkills };
}

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
  }
  // Cizí klub vidí jen whitelist (truc, potenciál ani další interní klíče ne).
  const verejnyZivot = isOwn ? lifeContext : verejnyZivotHrace(lifeContext);

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
    lifeContext: verejnyZivot,
    isOwn,
    weekly_wage: isOwn ? ((row.weekly_wage as number | null) ?? null) : null,
    squad_number: isOwn ? ((row.squad_number as number | null) ?? null) : null,
    loan_from_team_id: (row.loan_from_team_id as string | null) ?? null,
    loan_until: (row.loan_until as string | null) ?? null,
  };
}
