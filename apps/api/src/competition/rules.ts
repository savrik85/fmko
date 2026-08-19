/**
 * Načítání sazebníku a stavu samosprávy soutěže.
 *
 * KAŽDÁ cesta musí umět běžet bez samosprávy. `loadRules` vrací null pro ligu,
 * která ji nemá zapnutou, a volající pak spadne na DEFAULT_RULES — tedy přesně
 * na hodnoty, které měl kód natvrdo před zavedením samosprávy.
 */

import { logger } from "../lib/logger";
import { DEFAULT_RULES, MIN_HUMAN_CLUBS, type CompetitionRules } from "./defaults";

const M = "competition";

export interface GovernanceRow {
  league_id: string;
  enabled: number;
  enabled_from_season: number | null;
  balance_cache: number;
  sponsor_name: string | null;
  sponsor_amount: number;
  sponsor_satisfaction: number;
  sponsor_until_season: number | null;
  original_name: string | null;
  next_meeting_at: string | null;
  last_meeting_at: string | null;
}

export interface CompetitionContext {
  leagueId: string;
  seasonNumber: number;
  rules: CompetitionRules;
}

const RULE_FIELDS = Object.keys(DEFAULT_RULES) as Array<keyof CompetitionRules>;

function rowToRules(row: Record<string, unknown>): CompetitionRules {
  const out = { ...DEFAULT_RULES } as CompetitionRules;
  for (const f of RULE_FIELDS) {
    const v = row[f];
    if (typeof v === "number" && Number.isFinite(v)) out[f] = v;
  }
  return out;
}

/** Stav samosprávy jedné soutěže. null = řádek ještě nevznikl. */
export async function loadGovernance(db: D1Database, leagueId: string): Promise<GovernanceRow | null> {
  return await db.prepare("SELECT * FROM competition_governance WHERE league_id = ?")
    .bind(leagueId).first<GovernanceRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení governance ligy ${leagueId}`, e); return null; });
}

/**
 * Sazebník platný pro danou sezónu. Vrací null, když soutěž samosprávu nemá
 * nebo pro tu sezónu ještě nevznikl řádek — volající pak použije výchozí hodnoty.
 */
export async function loadRules(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<CompetitionRules | null> {
  const gov = await loadGovernance(db, leagueId);
  if (!gov || !gov.enabled) return null;

  const row = await db.prepare(
    "SELECT * FROM competition_rules WHERE league_id = ? AND season_number = ?"
  ).bind(leagueId, seasonNumber).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `načtení pravidel ligy ${leagueId}/${seasonNumber}`, e); return null; });

  if (!row) return null;
  return rowToRules(row);
}

/** Sazebník s fallbackem na výchozí hodnoty. Nikdy nevrací null. */
export async function resolveRules(
  db: D1Database, leagueId: string | null | undefined, seasonNumber: number | null | undefined,
): Promise<CompetitionRules> {
  if (!leagueId || !seasonNumber) return { ...DEFAULT_RULES } as CompetitionRules;
  const r = await loadRules(db, leagueId, seasonNumber);
  return r ?? ({ ...DEFAULT_RULES } as CompetitionRules);
}

/**
 * Kontext pro zápasové finance. Načítá se JEDNOU na kolo v match-runneru,
 * ne per tým — jinak by to bylo 14 dotazů na kolo navíc.
 */
export async function loadCompetitionContext(
  db: D1Database, leagueId: string | null | undefined, seasonNumber: number | null | undefined,
): Promise<CompetitionContext | null> {
  if (!leagueId || !seasonNumber) return null;
  const rules = await loadRules(db, leagueId, seasonNumber);
  if (!rules) return null;
  return { leagueId, seasonNumber, rules };
}

/**
 * Kolik klubů v soutěži řídí skutečný člověk.
 *
 * Filtr na team_type a parent_team_id je POVINNÝ: U21 tým sdílí user_id se svým
 * A-týmem (league/u21-generator.ts), takže bez něj by Prachatice měly 28 „lidských
 * klubů" místo 14 a kvórum by bylo nesplnitelné.
 */
export async function countHumanClubs(db: D1Database, leagueId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM teams
      WHERE league_id = ? AND user_id != 'ai'
        AND team_type = 'senior' AND parent_team_id IS NULL`
  ).bind(leagueId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `počet lidských klubů ligy ${leagueId}`, e); return null; });
  return row?.n ?? 0;
}

/** Všechny kluby v soutěži (i AI) — platí startovné a berou odměny. */
export async function countAllClubs(db: D1Database, leagueId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM teams WHERE league_id = ?"
  ).bind(leagueId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `počet klubů ligy ${leagueId}`, e); return null; });
  return row?.n ?? 0;
}

/** Kluby s hlasovacím právem. */
export async function listVoters(db: D1Database, leagueId: string): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT id FROM teams
      WHERE league_id = ? AND user_id != 'ai'
        AND team_type = 'senior' AND parent_team_id IS NULL`
  ).bind(leagueId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `seznam voličů ligy ${leagueId}`, e); return { results: [] }; });
  return rows.results.map((r) => r.id);
}

/** Splňuje soutěž práh pro samosprávu? Vyhodnocuje se JEN při rolloveru. */
export async function meetsThreshold(db: D1Database, leagueId: string): Promise<boolean> {
  return (await countHumanClubs(db, leagueId)) >= MIN_HUMAN_CLUBS;
}

export interface LeagueMeta {
  id: string;
  name: string;
  level: string;
  district: string;
  league_type: string;
  season_number: number;
}

/** Základní data soutěže včetně čísla aktuální sezóny. */
export async function loadLeagueMeta(db: D1Database, leagueId: string): Promise<LeagueMeta | null> {
  return await db.prepare(
    `SELECT l.id, l.name, l.level, l.district, COALESCE(l.league_type,'senior') AS league_type,
            COALESCE(s.number, 1) AS season_number
       FROM leagues l LEFT JOIN seasons s ON s.id = l.season_id
      WHERE l.id = ?`
  ).bind(leagueId).first<LeagueMeta>()
    .catch((e) => { logger.warn({ module: M }, `načtení ligy ${leagueId}`, e); return null; });
}
