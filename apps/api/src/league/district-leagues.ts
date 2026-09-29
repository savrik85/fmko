/**
 * Seniorské soutěže jednoho okresu: kam se nový klub zařadí a jestli je okres plný.
 *
 * Okres může mít dvě soutěže nad sebou: okresní přebor (nahoře) a pod ním
 * okresní soutěž, která se hráčům ukazuje jako „III. třída <okres>“. Tahle funkce
 * je jediné místo s pravidlem pro zakládání týmu, používá ho `POST /api/teams`
 * i výpis plných okresů pro onboarding (`/api/villages/stats`).
 *
 * Pravidlo:
 *   1. Senior ligy okresu v aktivní sezóně seřazené od nejvyšší úrovně.
 *   2. Nový manažer převezme AI tým v nejvyšší lize, která ho má.
 *   3. Žádná liga ještě není → založí se okresní přebor.
 *   4. Všechny ligy plné a nižší soutěž chybí → založí se III. třída z obcí okresu,
 *      které nepoužívá žádný senior tým (ani obec hráče). Velikost 14, minimum 12.
 *   5. Jinak je okres plný.
 */

import { logger } from "../lib/logger";

export type DistrictLeagueLevel = "okresni_prebor" | "okresni_soutez";

/** Pořadí úrovní shora dolů. Vyšší číslo = vyšší soutěž. */
const LEVEL_RANK: Record<string, number> = {
  krajsky_prebor: 5,
  ia_trida: 4,
  ib_trida: 3,
  okresni_prebor: 2,
  okresni_soutez: 1,
};

export const LOWER_LEAGUE_SIZE = 14;
export const LOWER_LEAGUE_MIN_SIZE = 12;

export const LEAGUE_FULL_MESSAGE =
  "Všechny soutěže v tomto okrese jsou plné. Vyber si prosím jiný okres.";
export const LOWER_LEAGUE_TOO_SMALL_MESSAGE =
  "Okresní přebor je plný a na III. třídu v okrese nezbývá dost volných obcí. Vyber si prosím jiný okres.";

export interface DistrictLeague {
  id: string;
  name: string;
  level: string;
  aiTeams: number;
  teams: number;
}

export type DistrictSlot =
  | { kind: "join"; league: DistrictLeague }
  | { kind: "create"; level: DistrictLeagueLevel; name: string; size: number; villageIds: string[] | null }
  | { kind: "full"; message: string };

/** Jméno ligy podle úrovně. Praha má vlastní názvosloví přeboru. */
export function districtLeagueName(district: string, level: DistrictLeagueLevel): string {
  if (level === "okresni_soutez") return `III. třída ${district}`;
  return district === "Praha" ? "Přebor Prahy" : `Okresní přebor ${district}`;
}

/** Senior ligy okresu v dané sezóně, od nejvyšší úrovně. */
export async function listDistrictSeniorLeagues(
  db: D1Database, district: string, seasonId: string,
): Promise<DistrictLeague[]> {
  const rows = await db.prepare(
    `SELECT l.id, l.name, l.level,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id AND t.user_id = 'ai') AS ai_teams,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) AS teams
       FROM leagues l
      WHERE l.district = ? AND l.season_id = ? AND l.status = 'active'
        AND COALESCE(l.league_type, 'senior') = 'senior'`,
  ).bind(district, seasonId).all<{ id: string; name: string; level: string; ai_teams: number; teams: number }>();

  return rows.results
    .map((r) => ({ id: r.id, name: r.name, level: r.level, aiTeams: r.ai_teams, teams: r.teams }))
    .sort((a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0));
}

/**
 * Obce okresu, které nepoužívá žádný senior tým zařazený do ligy.
 * `excludeVillageId` = obec hráče (jeho klub z ní už hraje).
 */
export async function freeDistrictVillages(
  db: D1Database, district: string, excludeVillageId: string | null,
): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT v.id FROM villages v
      WHERE v.district = ? AND v.id <> ?
        AND NOT EXISTS (
          SELECT 1 FROM teams t
           WHERE t.village_id = v.id AND t.league_id IS NOT NULL
             AND COALESCE(t.team_type, 'senior') = 'senior'
        )`,
  ).bind(district, excludeVillageId ?? "").all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/**
 * Kam se nový klub v okrese zařadí.
 *
 * `playerVillageId` je obec zakládaného klubu. Bez ní (výpis plných okresů) se
 * počítá s tím, že hráč zabere jednu z volných obcí, takže se okres neoznačí
 * za plný, dokud se do III. třídy aspoň teoreticky vejde.
 */
export async function resolveDistrictSlot(
  db: D1Database, district: string, seasonId: string, playerVillageId: string | null,
): Promise<DistrictSlot> {
  const leagues = await listDistrictSeniorLeagues(db, district, seasonId);

  if (leagues.length === 0) {
    return { kind: "create", level: "okresni_prebor", name: districtLeagueName(district, "okresni_prebor"), size: LOWER_LEAGUE_SIZE, villageIds: null };
  }

  const withAi = leagues.find((l) => l.aiTeams > 0);
  if (withAi) return { kind: "join", league: withAi };

  if (leagues.some((l) => l.level === "okresni_soutez")) {
    return { kind: "full", message: LEAGUE_FULL_MESSAGE };
  }

  // Obec hráče se z volných vyřadí vždy. Když ji výpis nezná, hráč si ji teprve
  // vybere a klidně to může být obec, kterou už někdo používá, proto se tu nic neubírá.
  const free = await freeDistrictVillages(db, district, playerVillageId);
  const size = Math.min(LOWER_LEAGUE_SIZE, free.length + 1);
  if (size < LOWER_LEAGUE_MIN_SIZE) {
    logger.info({ module: "district-leagues" }, `${district}: na III. třídu jen ${free.length} volných obcí`);
    return { kind: "full", message: LOWER_LEAGUE_TOO_SMALL_MESSAGE };
  }
  return { kind: "create", level: "okresni_soutez", name: districtLeagueName(district, "okresni_soutez"), size, villageIds: free };
}

/**
 * Okresy, kam se nový klub už nevejde. Pro onboarding: bere okresy, které mají
 * v aktivní sezóně aspoň jednu senior ligu (okres bez ligy plný být nemůže).
 */
export async function listFullDistricts(db: D1Database): Promise<string[]> {
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>();
  if (!season) return [];
  const districts = await db.prepare(
    `SELECT DISTINCT district FROM leagues
      WHERE season_id = ? AND status = 'active' AND COALESCE(league_type, 'senior') = 'senior'`,
  ).bind(season.id).all<{ district: string }>();

  const full: string[] = [];
  for (const row of districts.results) {
    const slot = await resolveDistrictSlot(db, row.district, season.id, null);
    if (slot.kind === "full") full.push(row.district);
  }
  return full;
}

export interface RunningSeason {
  /** Sdílený herní den běžících lig. */
  gameDate: string;
  seasonStart: string | null;
  seasonEnd: string | null;
  /** Termín posledního kola běžící sezóny, po něm začne rollover. */
  lastMatchAt: string | null;
}

/**
 * Běží v aktivní sezóně už nějaká senior liga (má odehraný zápas)? Když ano,
 * vrátí sdílený herní čas, do kterého se nová liga zařadí bez rozpisu.
 */
export async function getRunningSeason(db: D1Database, seasonNumber: number): Promise<RunningSeason | null> {
  const league = await db.prepare(
    `SELECT sc.league_id FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN leagues l ON l.id = sc.league_id
      WHERE COALESCE(l.league_type, 'senior') = 'senior' AND sc.season_number = ? AND m.status = 'simulated'
      LIMIT 1`,
  ).bind(seasonNumber).first<{ league_id: string }>();
  if (!league) return null;

  const team = await db.prepare(
    `SELECT game_date, season_start, season_end FROM teams
      WHERE league_id = ? AND game_date IS NOT NULL
      ORDER BY game_date DESC LIMIT 1`,
  ).bind(league.league_id).first<{ game_date: string; season_start: string | null; season_end: string | null }>();

  const bounds = await db.prepare(
    `SELECT MIN(sc.scheduled_at) AS first, MAX(sc.scheduled_at) AS last
       FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id
      WHERE COALESCE(l.league_type, 'senior') = 'senior' AND sc.season_number = ?
        AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)`,
  ).bind(seasonNumber).first<{ first: string | null; last: string | null }>();

  return {
    gameDate: team?.game_date ?? new Date().toISOString(),
    seasonStart: team?.season_start ?? bounds?.first ?? null,
    seasonEnd: team?.season_end ?? bounds?.last ?? null,
    lastMatchAt: bounds?.last ?? null,
  };
}

export interface LeaguePreseason {
  /** Termín posledního kola běžící sezóny (ISO). Po něm liga dostane rozpis. */
  startsAfter: string | null;
}

/**
 * Je liga v přípravném období? Tedy nemá v aktivní sezóně žádné zápasy, zatímco
 * ostatní ligy už hrají. U21 liga se ptá své seniorské ligy.
 */
export async function getLeaguePreseason(db: D1Database, leagueId: string): Promise<LeaguePreseason | null> {
  const league = await db.prepare(
    `SELECT COALESCE(l.parent_league_id, l.id) AS senior_id, s.number AS season_number
       FROM leagues l JOIN seasons s ON s.id = l.season_id
      WHERE l.id = ?`,
  ).bind(leagueId).first<{ senior_id: string; season_number: number }>();
  if (!league) return null;

  const hasMatches = await db.prepare(
    `SELECT 1 FROM season_calendar sc
      WHERE sc.league_id = ? AND sc.season_number = ?
        AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)
      LIMIT 1`,
  ).bind(league.senior_id, league.season_number).first();
  if (hasMatches) return null;

  const running = await getRunningSeason(db, league.season_number);
  if (!running) return null;
  return { startsAfter: running.lastMatchAt };
}
