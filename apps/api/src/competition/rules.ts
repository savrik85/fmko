/**
 * Načítání sazebníku a stavu samosprávy soutěže.
 *
 * KAŽDÁ cesta musí umět běžet bez samosprávy. `loadRules` vrací null pro ligu,
 * která ji nemá zapnutou, a volající pak spadne na DEFAULT_RULES — tedy přesně
 * na hodnoty, které měl kód natvrdo před zavedením samosprávy.
 *
 * GRÉMIUM OKRESU. Seniorské soutěže jednoho okresu v téže sezóně (Okresní přebor
 * a III. třída) mají JEDNO grémium. Sedí u nejvyšší z nich, u „řídící" soutěže:
 * tam visí řádek samosprávy, funkcionáři, volby, návrhy, zasedání, nástěnka,
 * sazebník, sankce, vyškrtnutí a stopky sudích, revize i sponzor soutěže.
 *
 * Pokladna je ale dál per skutečná soutěž (competition_ledger podle league_id):
 * dotace, startovné, prémie, odměny i pokuty jdou z a do pokladny soutěže, ve
 * které se to stalo. Nižší soutěž má vlastní řádek competition_governance jen
 * jako značku otevřené pokladny (a kvůli balance_cache). Jeho pole o vedení,
 * schůzích ani sponzorovi se nečtou.
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

// ── Grémium okresu ──────────────────────────────────────────────────────────

/** Úrovně, které se v okrese sdružují pod jedno grémium. */
const DISTRICT_LEVELS = ["okresni_prebor", "okresni_soutez"] as const;
/** Pořadí řídící soutěže: vyšší úroveň vede. */
const LEVEL_RANK: Record<string, number> = { okresni_prebor: 2, okresni_soutez: 1 };

export interface DistrictLeague {
  id: string;
  name: string;
  level: string;
}

/**
 * Soutěže, které sdílí grémium s danou soutěží, řídící první.
 *
 * Vždy obsahuje aspoň soutěž samotnou, i když chybí její řádek v `leagues` nebo
 * dotaz spadne. Bez toho by porucha jednoho dotazu nechala soutěž bez voličů
 * i bez sazebníku. U21 a vyšší soutěže se nesdružují, vedou samy sebe.
 */
export async function districtLeagues(db: D1Database, leagueId: string): Promise<DistrictLeague[]> {
  const levels = DISTRICT_LEVELS.map((l) => `'${l}'`).join(",");
  let found: DistrictLeague[] = [];
  try {
    const rows = await db.prepare(
      `SELECT o.id, o.name, o.level FROM leagues l
         JOIN leagues o ON o.id = l.id OR (
              l.level IN (${levels}) AND COALESCE(l.league_type,'senior') = 'senior'
          AND o.district = l.district AND o.season_id = l.season_id
          AND o.level IN (${levels}) AND COALESCE(o.league_type,'senior') = 'senior'
          AND o.status = 'active')
        WHERE l.id = ?`
    ).bind(leagueId).all<DistrictLeague>();
    found = rows?.results ?? [];
  } catch (e) {
    logger.warn({ module: M }, `soutěže okresu ligy ${leagueId}`, e);
  }

  const list = found.filter((r) => r && typeof r.id === "string");
  if (!list.some((r) => r.id === leagueId)) list.push({ id: leagueId, name: "", level: "" });
  // Řídící první: nejvyšší úroveň, při shodě stabilně podle id.
  return list.sort((a, b) =>
    (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0) || a.id.localeCompare(b.id));
}

/** Id všech soutěží pod jedním grémiem (řídící první). */
export async function districtLeagueIds(db: D1Database, leagueId: string): Promise<string[]> {
  return (await districtLeagues(db, leagueId)).map((l) => l.id);
}

/**
 * Soutěž, u které sedí grémium okresu. Pro přebor je to on sám, pro III. třídu
 * přebor téhož okresu a sezóny. Okres s jedinou soutěží vede sám sebe.
 */
export async function governingLeagueId(db: D1Database, leagueId: string): Promise<string> {
  return (await districtLeagues(db, leagueId))[0]?.id ?? leagueId;
}

/** `?,?,?` pro `IN (...)` nad seznamem soutěží. */
export function sqlPlaceholders(ids: readonly unknown[]): string {
  return ids.map(() => "?").join(",");
}

/** Vlastní řádek competition_governance soutěže, BEZ přesměrování na řídící soutěž. */
export async function loadOwnGovernance(db: D1Database, leagueId: string): Promise<GovernanceRow | null> {
  return await db.prepare("SELECT * FROM competition_governance WHERE league_id = ?")
    .bind(leagueId).first<GovernanceRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení governance ligy ${leagueId}`, e); return null; });
}

/**
 * Stav samosprávy, pod kterou soutěž patří: řádek ŘÍDÍCÍ soutěže okresu.
 * null = řádek ještě nevznikl.
 */
export async function loadGovernance(db: D1Database, leagueId: string): Promise<GovernanceRow | null> {
  return loadOwnGovernance(db, await governingLeagueId(db, leagueId));
}

/** Sazebník řídící soutěže na sezónu, když má zapnutou samosprávu. */
async function rulesOfGoverning(
  db: D1Database, governingId: string, seasonNumber: number,
): Promise<CompetitionRules | null> {
  const gov = await loadOwnGovernance(db, governingId);
  if (!gov || !gov.enabled) return null;

  const row = await db.prepare(
    "SELECT * FROM competition_rules WHERE league_id = ? AND season_number = ?"
  ).bind(governingId, seasonNumber).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `načtení pravidel ligy ${governingId}/${seasonNumber}`, e); return null; });

  if (!row) return null;
  return rowToRules(row);
}

/**
 * Sazebník platný pro danou sezónu. Je společný pro celý okres a leží u řídící
 * soutěže. Vrací null, když grémium samosprávu nemá nebo pro tu sezónu ještě
 * nevznikl řádek — volající pak použije výchozí hodnoty.
 */
export async function loadRules(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<CompetitionRules | null> {
  return rulesOfGoverning(db, await governingLeagueId(db, leagueId), seasonNumber);
}

/**
 * Má soutěž otevřenou vlastní pokladnu? Řídící soutěž ji má se samosprávou,
 * nižší soutěž až po rolloveru (nebo ručním zapnutí), kdy dostane dotaci
 * a startovné. Do té doby se z její pokladny nesmí nic vyplácet.
 */
export async function treasuryOpen(db: D1Database, leagueId: string): Promise<boolean> {
  const governingId = await governingLeagueId(db, leagueId);
  const gov = await loadOwnGovernance(db, governingId);
  if (!gov?.enabled) return false;
  if (governingId === leagueId) return true;
  return !!(await loadOwnGovernance(db, leagueId))?.enabled;
}

/**
 * Sazebník pro VÝDAJE z pokladny soutěže (prémie, rozhodčí, odměny za umístění).
 *
 * Stejný společný sazebník jako loadRules, dostane ho ale jen soutěž s otevřenou
 * pokladnou. III. třída, která pod grémium přibyla uprostřed sezóny a ještě
 * nedostala dotaci, by jinak platila prémie z prázdné pokladny a odměny za
 * umístění by se jí na konci sezóny zkrátily na nulu.
 */
export async function loadTreasuryRules(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<CompetitionRules | null> {
  const governingId = await governingLeagueId(db, leagueId);
  if (governingId !== leagueId && !(await loadOwnGovernance(db, leagueId))?.enabled) return null;
  return rulesOfGoverning(db, governingId, seasonNumber);
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
 *
 * `leagueId` zůstává skutečná soutěž zápasu: z její pokladny jdou prémie
 * i rozhodčí. Sazebník je společný okresní (viz loadTreasuryRules).
 */
export async function loadCompetitionContext(
  db: D1Database, leagueId: string | null | undefined, seasonNumber: number | null | undefined,
): Promise<CompetitionContext | null> {
  if (!leagueId || !seasonNumber) return null;
  const rules = await loadTreasuryRules(db, leagueId, seasonNumber);
  if (!rules) return null;
  return { leagueId, seasonNumber, rules };
}

/**
 * Pokladna, která s klubem vyřizuje peníze za věc grémia: pokladna jeho vlastní
 * soutěže, když patří pod totéž grémium. Klub odjinud (soupeř z poháru) jde přes
 * pokladnu soutěže, kterou volající předal, jako dřív.
 *
 * `payout` = z pokladny se bude VYPLÁCET (dotace). Zavřená pokladna III. třídy
 * nemá z čeho, takže zaplatí pokladna řídící soutěže. Příjem (kauce, pokuta) do
 * zavřené pokladny nevadí, zůstane jí, až se otevře.
 */
export async function treasuryLeagueForTeam(
  db: D1Database, teamId: string, anyDistrictLeagueId: string, payout = false,
): Promise<string> {
  const ids = await districtLeagueIds(db, anyDistrictLeagueId);
  const team = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `soutěž klubu ${teamId}`, e); return null; });
  const own = team?.league_id;
  if (!own || !ids.includes(own)) return anyDistrictLeagueId;
  if (!payout || own === ids[0] || await treasuryOpen(db, own)) return own;
  return ids[0];
}

// ── Členové grémia ──────────────────────────────────────────────────────────

/**
 * Kolik klubů pod grémiem okresu řídí skutečný člověk: přebor i III. třída
 * dohromady, ať se ptá kterákoli z nich.
 *
 * Filtr na team_type a parent_team_id je POVINNÝ: U21 tým sdílí user_id se svým
 * A-týmem (league/u21-generator.ts), takže bez něj by Prachatice měly 28 „lidských
 * klubů" místo 14 a kvórum by bylo nesplnitelné.
 */
export async function countHumanClubs(db: D1Database, leagueId: string): Promise<number> {
  const ids = await districtLeagueIds(db, leagueId);
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM teams
      WHERE league_id IN (${sqlPlaceholders(ids)}) AND user_id != 'ai'
        AND team_type = 'senior' AND parent_team_id IS NULL`
  ).bind(...ids).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `počet lidských klubů ligy ${leagueId}`, e); return null; });
  return row?.n ?? 0;
}

/**
 * Všechny kluby v JEDNÉ soutěži (i AI) — platí startovné a berou odměny. Na
 * rozdíl od voličů se nesčítá za okres: dotaci i závazky má každá pokladna svoje.
 */
export async function countAllClubs(db: D1Database, leagueId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM teams WHERE league_id = ?"
  ).bind(leagueId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `počet klubů ligy ${leagueId}`, e); return null; });
  return row?.n ?? 0;
}

/** Kluby s hlasovacím právem v grémiu okresu (ve všech jeho soutěžích). */
export async function listVoters(db: D1Database, leagueId: string): Promise<string[]> {
  const ids = await districtLeagueIds(db, leagueId);
  const rows = await db.prepare(
    `SELECT id FROM teams
      WHERE league_id IN (${sqlPlaceholders(ids)}) AND user_id != 'ai'
        AND team_type = 'senior' AND parent_team_id IS NULL`
  ).bind(...ids).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `seznam voličů ligy ${leagueId}`, e); return { results: [] }; });
  return rows.results.map((r) => r.id);
}

/** Splňuje grémium okresu práh pro samosprávu? Vyhodnocuje se JEN při rolloveru. */
export async function meetsThreshold(db: D1Database, leagueId: string): Promise<boolean> {
  return (await countHumanClubs(db, leagueId)) >= MIN_HUMAN_CLUBS;
}

/**
 * Kolik zápasů má soutěž v aktuální sezóně odehráno. Filtr na sezónu je stejný
 * jako v calculateStandings — league_id se napříč sezónami recykluje.
 */
export async function playedMatches(db: D1Database, leagueId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.league_id = ? AND m.status = 'simulated'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`
  ).bind(leagueId, leagueId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `odehrané zápasy ligy ${leagueId}`, e); return null; });
  return row?.n ?? 0;
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
