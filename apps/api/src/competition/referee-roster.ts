/**
 * Zásahy komisaře rozhodčích do delegace — výměna sudího a stopka na tři kola.
 *
 * Delegace běží automaticky jako vždy; komisař do HOTOVÉHO obsazení zasahuje.
 * Střet zájmů se tím nepopírá, jen se zviditelňuje: každá výměna se zapisuje
 * i s tím, koho odvolala, a klub vidí, že mu komisař sudího vyměnil. Na uzdě to
 * drží počet výměn na kolo, ne zákaz.
 *
 * Náhradník musí být volný — kdo už ten den píská jinde, by šel do druhého
 * zápasu utahaný a soutěž by si výměnou uškodila sama.
 */

import { logger } from "../lib/logger";

const M = "competition-referee-roster";

/** Na kolik kol vypadne pozastavený sudí z delegace. */
export const PAUSE_WEEKS = 3;

/** Kolik stopek smí komisař rozdat za sezónu. */
export const MAX_PAUSES_PER_SEASON = 3;

/**
 * Kolik sudích smí komisař v jednom kole vyměnit.
 *
 * Strop je tu proto, aby z pravomoci nebyla ruční delegace: kolo má sedm zápasů
 * a kdo přeobsadí tři, ještě zasahuje — kdo přeobsadí všechny, losuje sám.
 * Opakovaná výměna téhož zápasu se do počtu započítá jen jednou.
 */
export const MAX_SWAPS_PER_ROUND = 3;

/**
 * Pod tolik použitelných sudích se listina nesmí dostat ani dočasně.
 *
 * V okrese se hraje 14 zápasů v jednom dni (7 seniorských a 7 U21), takže patnáct
 * je čtrnáct zápasů plus jeden náhradník. Níž by delegace spadla do nouzového
 * ventilu a jeden sudí by pískal dvakrát denně — což je trest pro kluby, ne pro něj.
 */
export const MIN_USABLE_FOR_ROUND = 15;

// ── Pozastavení ─────────────────────────────────────────────────────────────

/** Sudí, kteří mají v daném kole stopku. */
export async function pausedIds(
  db: D1Database, leagueId: string, seasonNumber: number, gameWeek: number,
): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT referee_id FROM competition_referee_suspensions
      WHERE league_id = ? AND season_number = ? AND ? BETWEEN from_week AND until_week`
  ).bind(leagueId, seasonNumber, gameWeek).all<{ referee_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "seznam stopek", e); return { results: [] }; });
  return new Set(rows.results.map((r) => r.referee_id));
}

export interface ActivePause {
  refereeId: string;
  fromWeek: number;
  untilWeek: number;
  reason: string;
}

/** Běžící stopky od daného kola dál — pro panel komisaře. */
export async function activePauses(
  db: D1Database, leagueId: string, seasonNumber: number, gameWeek: number,
): Promise<ActivePause[]> {
  const rows = await db.prepare(
    `SELECT referee_id, from_week, until_week, reason
       FROM competition_referee_suspensions
      WHERE league_id = ? AND season_number = ? AND until_week >= ?
      ORDER BY until_week`
  ).bind(leagueId, seasonNumber, gameWeek).all<{
    referee_id: string; from_week: number; until_week: number; reason: string;
  }>().catch((e) => { logger.warn({ module: M }, "běžící stopky", e); return { results: [] }; });

  return rows.results.map((r) => ({
    refereeId: r.referee_id, fromWeek: r.from_week, untilWeek: r.until_week, reason: r.reason,
  }));
}

export interface PauseCheck { ok: boolean; reason?: string; usable?: number }

/**
 * Smí komisař pozastavit dalšího sudího?
 *
 * Dvě brzdy: kolik lidí zbyde na listině (jinak by se kolo pískalo dvakrát denně)
 * a jestli už tenhle sudí stopku nemá — dvě souběžné by se jen překrývaly a
 * komisař by si tím zadarmo prodlužoval tu první.
 */
export async function canPauseReferee(
  db: D1Database, leagueId: string, seasonNumber: number, district: string,
  gameWeek: number, refereeId?: string,
): Promise<PauseCheck> {
  const usable = await usableForWeek(db, leagueId, seasonNumber, district, gameWeek);

  if (usable - 1 < MIN_USABLE_FOR_ROUND) {
    return {
      ok: false, usable,
      reason: `Na kolo by zbylo jen ${usable - 1} rozhodčích. Minimum je ${MIN_USABLE_FOR_ROUND} — jinak by jeden pískal dva zápasy denně.`,
    };
  }

  if (refereeId) {
    const paused = await pausedIds(db, leagueId, seasonNumber, gameWeek);
    if (paused.has(refereeId)) {
      return { ok: false, usable, reason: "Tenhle sudí už stopku má. Počkej, až doběhne." };
    }
  }

  return { ok: true, usable };
}

/**
 * Kolik sudích může soutěž v daném kole reálně nasadit — okresní pool minus
 * vyškrtnutí a minus běžící stopky.
 */
export async function usableForWeek(
  db: D1Database, leagueId: string, seasonNumber: number, district: string, gameWeek: number,
): Promise<number> {
  const { normalizeDistrict } = await import("../referees/referee-generator");
  const { bannedIds } = await import("./referee-bans");
  const base = normalizeDistrict(district);

  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM referees WHERE district = ? AND status = 'active'"
  ).bind(base).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "velikost okresního poolu", e); return null; });
  const pool = row?.n ?? 0;
  if (pool === 0) return 0;

  const [bans, pauses] = await Promise.all([
    bannedIds(db, leagueId, seasonNumber),
    pausedIds(db, leagueId, seasonNumber, gameWeek),
  ]);

  // Vyškrtnutý sudí může mít i stopku — spočítat by se měl jednou.
  const out = new Set([...bans, ...pauses]);
  return Math.max(0, pool - out.size);
}

export interface PauseOpts {
  leagueId: string;
  seasonNumber: number;
  refereeId: string;
  fromWeek: number;
  reason: string;
  issuedByTeamId: string;
  gameDate: string;
}

/**
 * Dá sudímu stopku na tři kola.
 *
 * Sudí si to pamatuje — ale míň než vyškrtnutí (−15 proti −40), protože po třech
 * kolech je zpátky. Je to napomenutí, ne konec kariéry.
 */
export async function applyRefereePause(db: D1Database, opts: PauseOpts): Promise<boolean> {
  const untilWeek = opts.fromWeek + PAUSE_WEEKS - 1;

  const res = await db.prepare(
    `INSERT INTO competition_referee_suspensions
      (id, league_id, referee_id, season_number, from_week, until_week, reason, issued_by_team_id, game_date)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), opts.leagueId, opts.refereeId, opts.seasonNumber,
    opts.fromWeek, untilWeek, opts.reason, opts.issuedByTeamId, opts.gameDate,
  ).run().catch((e) => { logger.error({ module: M }, "zápis stopky", e); return null; });

  if (!res || (res.meta?.changes ?? 0) === 0) return false;

  await db.prepare(
    `INSERT INTO referee_team_relations (id, referee_id, team_id, sentiment, duvod)
     VALUES (?,?,?,?,?)
     ON CONFLICT(referee_id, team_id) DO UPDATE SET
       sentiment = MAX(-100, referee_team_relations.sentiment - 15),
       duvod = excluded.duvod`
  ).bind(crypto.randomUUID(), opts.refereeId, opts.issuedByTeamId, -15, "Dali mi stopku na tři kola.")
    .run().catch((e) => logger.warn({ module: M }, "paměť pozastaveného sudího", e));

  logger.info({ module: M },
    `soutěž ${opts.leagueId}: rozhodčí ${opts.refereeId} má stopku na kola ${opts.fromWeek}–${untilWeek}`);
  return true;
}

// ── Obsazovací listina ──────────────────────────────────────────────────────

export interface OpenRound {
  calendarId: string;
  gameWeek: number;
  seasonNumber: number;
  scheduledAt: string;
  matches: number;
}

/**
 * Nejbližší kolo, do kterého jde ještě mluvit — obsazené, ale neodehrané.
 *
 * Delegace proběhne dva herní dny před výkopem, takže tohle okno se otevře
 * automaticky a zavře se výkopem. Kolo bez delegace se nevrací: měnit se dá
 * jen to, co už los rozdal.
 */
export async function upcomingRound(
  db: D1Database, leagueId: string,
): Promise<OpenRound | null> {
  const row = await db.prepare(
    `SELECT sc.id AS calendar_id, sc.game_week, sc.season_number, sc.scheduled_at,
            COUNT(m.id) AS matches
       FROM season_calendar sc
       JOIN matches m ON m.calendar_id = sc.id AND m.referee_id IS NOT NULL
      WHERE sc.league_id = ? AND sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(x.season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
      GROUP BY sc.id
      ORDER BY sc.scheduled_at
      LIMIT 1`
  ).bind(leagueId).first<{
    calendar_id: string; game_week: number; season_number: number;
    scheduled_at: string; matches: number;
  }>().catch((e) => { logger.warn({ module: M }, "nejbližší obsazené kolo", e); return null; });

  if (!row) return null;
  return {
    calendarId: row.calendar_id, gameWeek: row.game_week, seasonNumber: row.season_number,
    scheduledAt: row.scheduled_at, matches: row.matches,
  };
}

export interface DelegatedMatch {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  refereeId: string | null;
  refereeName: string | null;
  archetype: string | null;
  avgGrade: number | null;
  /** Los určil někoho jiného a komisař ho vyměnil. */
  swapped: boolean;
  swapReason: string | null;
}

/** Obsazení kola tak, jak teď stojí — i s tím, do čeho komisař sáhl. */
export async function delegationOf(
  db: D1Database, calendarId: string, leagueId: string, seasonNumber: number,
): Promise<DelegatedMatch[]> {
  const { refereeFullName } = await import("../referees/referee-generator");

  const rows = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.referee_id,
            h.name AS home_name, a.name AS away_name,
            r.first_name, r.last_name, r.nickname, r.archetype,
            CASE WHEN COALESCE(s.matches,0) > 0 THEN s.grade_sum / s.matches ELSE NULL END AS avg_grade,
            w.reason AS swap_reason
       FROM matches m
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
       LEFT JOIN referees r ON r.id = m.referee_id
       LEFT JOIN referee_stats s
              ON s.referee_id = m.referee_id AND s.season_number = ? AND s.league_id = ?
       LEFT JOIN competition_referee_swaps w ON w.match_id = m.id
      WHERE m.calendar_id = ?
      ORDER BY h.name`
  ).bind(seasonNumber, leagueId, calendarId).all<{
    id: string; home_team_id: string; away_team_id: string; referee_id: string | null;
    home_name: string; away_name: string;
    first_name: string | null; last_name: string | null; nickname: string | null;
    archetype: string | null; avg_grade: number | null; swap_reason: string | null;
  }>().catch((e) => { logger.warn({ module: M }, "obsazení kola", e); return { results: [] }; });

  return rows.results.map((m) => ({
    matchId: m.id,
    homeTeamId: m.home_team_id, homeTeamName: m.home_name,
    awayTeamId: m.away_team_id, awayTeamName: m.away_name,
    refereeId: m.referee_id,
    refereeName: m.first_name && m.last_name
      ? refereeFullName({ first_name: m.first_name, last_name: m.last_name, nickname: m.nickname })
      : null,
    archetype: m.archetype,
    avgGrade: m.avg_grade,
    swapped: m.swap_reason !== null,
    swapReason: m.swap_reason,
  }));
}

/** Kolik výměn už komisař v tomhle kole udělal. */
export async function swapsInRound(db: D1Database, calendarId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM competition_referee_swaps WHERE calendar_id = ?"
  ).bind(calendarId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet výměn v kole", e); return null; });
  return row?.n ?? 0;
}

/**
 * Sudí, kteří v ten den nikde nepískají — jediní použitelní jako náhrada.
 *
 * Den, ne kolo: okres sdílí pool se seniory i U21 a ti hrají tentýž den.
 * Kdo už má zápas, by do druhého šel utahaný.
 */
export async function freeForRound(
  db: D1Database, leagueId: string, seasonNumber: number, district: string, round: OpenRound,
): Promise<Set<string>> {
  const { normalizeDistrict } = await import("../referees/referee-generator");
  const { bannedIds } = await import("./referee-bans");
  const base = normalizeDistrict(district);

  const den = new Date(round.scheduledAt);
  const od = new Date(den); od.setUTCHours(0, 0, 0, 0);
  const do_ = new Date(den); do_.setUTCHours(23, 59, 59, 999);

  const [vsichni, obsazeni, bans, pauses] = await Promise.all([
    db.prepare("SELECT id FROM referees WHERE district = ? AND status = 'active'")
      .bind(base).all<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, "okresní pool", e); return { results: [] }; }),
    db.prepare(
      `SELECT DISTINCT m.referee_id AS rid
         FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE m.referee_id IS NOT NULL AND sc.scheduled_at BETWEEN ? AND ?`
    ).bind(od.toISOString(), do_.toISOString()).all<{ rid: string }>()
      .catch((e) => { logger.warn({ module: M }, "sudí obsazení v ten den", e); return { results: [] }; }),
    bannedIds(db, leagueId, seasonNumber),
    pausedIds(db, leagueId, seasonNumber, round.gameWeek),
  ]);

  const zabrani = new Set(obsazeni.results.map((r) => r.rid));
  return new Set(
    vsichni.results
      .map((r) => r.id)
      .filter((id) => !zabrani.has(id) && !bans.has(id) && !pauses.has(id)),
  );
}

export interface SwapResult { ok: boolean; reason?: string; refereeName?: string }

/**
 * Vymění sudího na jednom zápase.
 *
 * Zapisuje se `from_referee_id`, i když je to jen informace — bez něj by nešlo
 * poznat, koho los původně určil, a výměna by byla nedohledatelná.
 */
export async function swapReferee(db: D1Database, opts: {
  leagueId: string; seasonNumber: number; round: OpenRound;
  matchId: string; fromRefereeId: string | null; toRefereeId: string;
  reason: string; teamId: string; ownMatch: boolean; gameDate: string;
}): Promise<SwapResult> {
  const res = await db.prepare(
    "UPDATE matches SET referee_id = ? WHERE id = ? AND calendar_id = ?"
  ).bind(opts.toRefereeId, opts.matchId, opts.round.calendarId).run()
    .catch((e) => { logger.error({ module: M }, "zápis výměny sudího", e); return null; });

  if (!res || (res.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: "Zápas se nepodařilo přeobsadit." };
  }

  // Jeden zápas, jeden řádek — opakovaná výměna přepíše důvod, ale nezaloží
  // druhý záznam, jinak by počítadlo výměn rostlo i při opravě překlepu.
  await db.prepare("DELETE FROM competition_referee_swaps WHERE match_id = ?")
    .bind(opts.matchId).run()
    .catch((e) => logger.warn({ module: M }, "úklid starého záznamu výměny", e));

  await db.prepare(
    `INSERT INTO competition_referee_swaps
      (id, league_id, season_number, calendar_id, match_id, from_referee_id, to_referee_id,
       reason, swapped_by_team, own_match, game_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), opts.leagueId, opts.seasonNumber, opts.round.calendarId,
    opts.matchId, opts.fromRefereeId, opts.toRefereeId, opts.reason,
    opts.teamId, opts.ownMatch ? 1 : 0, opts.gameDate,
  ).run().catch((e) => logger.error({ module: M }, "záznam výměny", e));

  // Odvolaný sudí si to pamatuje. Je to mírnější než stopka — pískat bude dál,
  // jen ne tenhle zápas.
  if (opts.fromRefereeId) {
    await db.prepare(
      `INSERT INTO referee_team_relations (id, referee_id, team_id, sentiment, duvod)
       VALUES (?,?,?,?,?)
       ON CONFLICT(referee_id, team_id) DO UPDATE SET
         sentiment = MAX(-100, referee_team_relations.sentiment - 10),
         duvod = excluded.duvod`
    ).bind(crypto.randomUUID(), opts.fromRefereeId, opts.teamId, -10, "Sundali mě ze zápasu.")
      .run().catch((e) => logger.warn({ module: M }, "paměť odvolaného sudího", e));
  }

  logger.info({ module: M },
    `soutěž ${opts.leagueId}: zápas ${opts.matchId} přeobsazen na ${opts.toRefereeId}`);
  return { ok: true };
}
