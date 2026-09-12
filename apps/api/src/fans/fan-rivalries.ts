/**
 * Rivalita mezi tábory — paměť fanoušků, ne manažerů.
 *
 * Dvě party se můžou nesnášet, i když si trenéři tykají. Dosud se „derby"
 * poznalo výhradně podle `heat` mezi manažery (`community/manager-relations`),
 * takže fanoušci žádnou vlastní historii neměli a rvačka nic nezanechala.
 *
 * Dvojice se drží vždy lexikograficky seřazená — jinak by vznikly dva řádky
 * pro jednu rivalitu a každý by si pamatoval jinou polovinu.
 */

import { logger } from "../lib/logger";
import { rivalitaKlic, rivalitaPo, rivalitaWord, type RivalitaDuvod } from "../engine/fan-groups";

const M = "fan-rivalries";

export interface RivalitaRow {
  id: string;
  team_a: string;
  team_b: string;
  heat: number;
  fights: number;
  incidents: number;
  last_game_date: string | null;
  history: string;
}

/** Kolik momentů si rivalita pamatuje. Starší se zahazují. */
const HISTORIE_MAX = 8;

export interface RivalitaMoment {
  gameDate: string;
  duvod: RivalitaDuvod;
  text: string;
}

/** Teplota rivality dvou klubů. Řádek nemusí existovat — pak je nula. */
export async function nactiRivalitu(
  db: D1Database,
  teamA: string,
  teamB: string,
): Promise<RivalitaRow | null> {
  const { a, b } = rivalitaKlic(teamA, teamB);
  return await db
    .prepare("SELECT * FROM fan_rivalries WHERE team_a = ? AND team_b = ?")
    .bind(a, b)
    .first<RivalitaRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení rivality ${a}/${b}`, e); return null; });
}

/**
 * Teplota po vychladnutí, aniž by se cokoli zapisovalo.
 *
 * Čte se před zápasem, kdy se ještě nic nestalo — a musí už počítat s tím, že
 * od minula uplynul čas. Jinak by rivalita vypadala horčeji, než jaká je.
 */
export async function teplotaRivality(
  db: D1Database,
  teamA: string,
  teamB: string,
  gameDate: string,
): Promise<number> {
  const row = await nactiRivalitu(db, teamA, teamB);
  if (!row) return 0;
  return rivalitaPo(row.heat, dnyMezi(row.last_game_date, gameDate), null);
}

/**
 * Přiloží pod rivalitu. Vytvoří řádek, když ještě není.
 *
 * Vrací novou teplotu, aby volající mohl rovnou napsat „po dnešku je to mezi
 * nimi vyhrocené" bez druhého dotazu.
 */
export async function priloz(
  db: D1Database,
  opts: {
    teamA: string;
    teamB: string;
    duvod: RivalitaDuvod;
    gameDate: string;
    text: string;
  },
): Promise<number> {
  const { a, b, id } = rivalitaKlic(opts.teamA, opts.teamB);
  const stav = await nactiRivalitu(db, a, b);

  const noveHeat = rivalitaPo(
    stav?.heat ?? 0,
    dnyMezi(stav?.last_game_date ?? null, opts.gameDate),
    opts.duvod,
  );

  const historie: RivalitaMoment[] = bezpecneJson(stav?.history);
  historie.unshift({ gameDate: opts.gameDate, duvod: opts.duvod, text: opts.text });

  await db
    .prepare(
      `INSERT INTO fan_rivalries (id, team_a, team_b, heat, fights, incidents, last_game_date, history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_a, team_b) DO UPDATE SET
         heat = excluded.heat,
         fights = fan_rivalries.fights + excluded.fights,
         incidents = fan_rivalries.incidents + excluded.incidents,
         last_game_date = excluded.last_game_date,
         history = excluded.history,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    )
    .bind(
      id, a, b, noveHeat,
      opts.duvod === "rvacka" ? 1 : 0,
      opts.duvod === "incident" ? 1 : 0,
      opts.gameDate,
      JSON.stringify(historie.slice(0, HISTORIE_MAX)),
    )
    .run()
    .catch((e) => { logger.warn({ module: M }, `přiložení k rivalitě ${a}/${b}`, e); });

  return noveHeat;
}

/** Nejžhavější rivalové klubu — pro stránku fanoušků. */
export async function rivaloveKlubu(
  db: D1Database,
  teamId: string,
  gameDate: string,
  limit = 5,
): Promise<Array<{ teamId: string; name: string; heat: number; word: string; fights: number; historie: RivalitaMoment[] }>> {
  const rows = await db
    .prepare(
      `SELECT r.*, ta.name AS name_a, tb.name AS name_b
       FROM fan_rivalries r
       LEFT JOIN teams ta ON ta.id = r.team_a
       LEFT JOIN teams tb ON tb.id = r.team_b
       WHERE r.team_a = ? OR r.team_b = ?
       ORDER BY r.heat DESC LIMIT ?`,
    )
    .bind(teamId, teamId, limit)
    .all<RivalitaRow & { name_a: string | null; name_b: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `rivalové klubu ${teamId}`, e); return { results: [] as never[] }; });

  return rows.results
    .map((r) => {
      const jsemA = r.team_a === teamId;
      const heat = rivalitaPo(r.heat, dnyMezi(r.last_game_date, gameDate), null);
      return {
        teamId: jsemA ? r.team_b : r.team_a,
        name: (jsemA ? r.name_b : r.name_a) ?? "Neznámý klub",
        heat,
        word: rivalitaWord(heat),
        fights: r.fights,
        historie: bezpecneJson<RivalitaMoment>(r.history),
      };
    })
    .filter((r) => r.heat > 0);
}

/** Kolik herních dní uplynulo. Neplatné datum = žádné chladnutí, ne NaN. */
function dnyMezi(od: string | null, do_: string): number {
  if (!od) return 0;
  const a = Date.parse(od);
  const b = Date.parse(do_);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function bezpecneJson<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (e) {
    logger.warn({ module: M }, "rozbitá historie rivality", e);
    return [];
  }
}
