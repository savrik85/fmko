/**
 * Obsazovací listina kola a pozastavení rozhodčího — pravomoci komisaře rozhodčích.
 *
 * Obojí stojí na jednom rozhodnutí: komisař smí říct, KDO v kole píská, ale ne
 * KOMU. Párování dál losuje delegace. Kdyby směl přiřazovat sudí k zápasům,
 * poslal by kartového cvoka na soupeře v boji o postup a vlastnímu klubu nechal
 * pohodáře — a to je střet zájmů, kvůli kterému delegace nikdy ruční nebyla.
 *
 * Zbývá napětí, které chceme: nasadit na kolo tři puntičkáře jde, ale los je
 * stejně dobře pošle na vlastní zápas.
 */

import { logger } from "../lib/logger";

const M = "competition-referee-roster";

/** Na kolik kol vypadne pozastavený sudí z delegace. */
export const PAUSE_WEEKS = 3;

/** Kolik stopek smí komisař rozdat za sezónu. */
export const MAX_PAUSES_PER_SEASON = 3;

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
 * Nejbližší kolo soutěže, které ještě nemá delegované rozhodčí.
 *
 * Delegace běží dva herní dny před výkopem, takže tohle je přesně to okno, ve
 * kterém má komisař co ovlivnit. Jakmile tick kolo obsadí, zmizí mu ze stolu.
 */
export async function nextOpenRound(
  db: D1Database, leagueId: string,
): Promise<OpenRound | null> {
  const row = await db.prepare(
    `SELECT sc.id AS calendar_id, sc.game_week, sc.season_number, sc.scheduled_at,
            COUNT(m.id) AS matches
       FROM season_calendar sc
       JOIN matches m ON m.calendar_id = sc.id AND m.referee_id IS NULL
      WHERE sc.league_id = ? AND sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(x.season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)
      GROUP BY sc.id
      ORDER BY sc.scheduled_at
      LIMIT 1`
  ).bind(leagueId).first<{
    calendar_id: string; game_week: number; season_number: number;
    scheduled_at: string; matches: number;
  }>().catch((e) => { logger.warn({ module: M }, "nejbližší nedelegované kolo", e); return null; });

  if (!row) return null;
  return {
    calendarId: row.calendar_id, gameWeek: row.game_week, seasonNumber: row.season_number,
    scheduledAt: row.scheduled_at, matches: row.matches,
  };
}

/** Kdo je na obsazovací listině daného kola. Prázdné = deleguje se ze všech. */
export async function nominationsFor(db: D1Database, calendarId: string): Promise<Set<string>> {
  const rows = await db.prepare(
    "SELECT referee_id FROM competition_referee_nominations WHERE calendar_id = ?"
  ).bind(calendarId).all<{ referee_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "obsazovací listina kola", e); return { results: [] }; });
  return new Set(rows.results.map((r) => r.referee_id));
}

export interface RosterSaveResult { ok: boolean; reason?: string; saved?: number }

/**
 * Uloží obsazovací listinu kola. Přepisuje celou — komisař posílá výsledný stav,
 * ne rozdíl, takže odebrání jména musí umět taky.
 *
 * Nominovat míň sudích než je zápasů nejde: delegace by musela sama doplnit
 * zbytek a komisař by měl pocit, že mu do listiny někdo mluví.
 */
export async function saveNominations(db: D1Database, opts: {
  leagueId: string; round: OpenRound; refereeIds: string[];
  teamId: string; gameDate: string; usable: Set<string>;
}): Promise<RosterSaveResult> {
  const unikatni = [...new Set(opts.refereeIds)];

  const cizi = unikatni.filter((id) => !opts.usable.has(id));
  if (cizi.length > 0) {
    return { ok: false, reason: "Někdo z vybraných na listinu tohohle kola nepatří — je vyškrtnutý nebo má stopku." };
  }

  if (unikatni.length > 0 && unikatni.length < opts.round.matches) {
    return {
      ok: false,
      reason: `V kole je ${opts.round.matches} zápasů, vybral jsi ${unikatni.length} rozhodčích. Musí jich být aspoň tolik, kolik je zápasů.`,
    };
  }

  await db.prepare("DELETE FROM competition_referee_nominations WHERE calendar_id = ?")
    .bind(opts.round.calendarId).run()
    .catch((e) => logger.warn({ module: M }, "úklid staré obsazovací listiny", e));

  // Prázdný výběr je legitimní: komisař listinu zrušil a kolo se obsadí ze všech.
  if (unikatni.length === 0) return { ok: true, saved: 0 };

  await db.batch(unikatni.map((refereeId) => db.prepare(
    `INSERT OR IGNORE INTO competition_referee_nominations
      (id, league_id, calendar_id, referee_id, season_number, nominated_by_team, game_date)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), opts.leagueId, opts.round.calendarId, refereeId,
    opts.round.seasonNumber, opts.teamId, opts.gameDate,
  ))).catch((e) => { logger.error({ module: M }, "zápis obsazovací listiny", e); });

  logger.info({ module: M },
    `soutěž ${opts.leagueId}: obsazovací listina ${opts.round.gameWeek}. kola — ${unikatni.length} rozhodčích`);
  return { ok: true, saved: unikatni.length };
}
