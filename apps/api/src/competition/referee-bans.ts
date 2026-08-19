/**
 * Vyškrtávání rozhodčích z listiny soutěže.
 *
 * Ban je PER SOUTĚŽ, ne per okres: pool patří okresu a sdílí ho i U21, která
 * o vyškrtnutí nehlasovala. Řádek v `referees` se proto nikdy nemaže ani nemění —
 * filtruje se až při delegaci.
 *
 * Listina se po vyškrtnutí NEDOPLŇUJE. Kdo v kole píská druhý zápas, jde do něj
 * unavený. Kluby si vyhozením kartového cvoka koupí utahané sudí — a to je celý
 * smysl té brzdy.
 */

import { logger } from "../lib/logger";
import { recordCompetitionEntry } from "./ledger";

const M = "competition-referee-bans";

/** Pod tenhle počet použitelných sudích se listina nesmí dostat. */
export const MIN_ACTIVE_REFEREES = 12;
/** Kolik sudích smí soutěž za sezónu vyškrtnout. Pravomoc komisaře čerpá týž slot. */
export const MAX_BANS_PER_SEASON = 1;
/** Průměrná známka, od které se sudí objeví na programu sám. */
export const AUTO_PROPOSAL_GRADE = 4.0;
/** Kolik zápasů musí mít odpískaných, než se ta známka bere vážně. */
export const AUTO_PROPOSAL_MATCHES = 8;

export interface BanCheck { ok: boolean; reason?: string; usable?: number }

/**
 * Smí soutěž vyškrtnout dalšího sudího?
 *
 * Dvě brzdy: sezónní strop a minimální velikost listiny. Bez té druhé by šlo
 * pool vyprázdnit tak, že by delegace spadla do nouzového ventilu a jeden sudí
 * by pískal dva zápasy denně.
 */
export async function canBanReferee(
  db: D1Database, leagueId: string, seasonNumber: number, district: string,
): Promise<BanCheck> {
  // Počet použitelných se počítá vždycky — i když ban stejně neprojde, UI ho ukazuje.
  const usable = await countUsable(db, leagueId, seasonNumber, district);

  const used = await db.prepare(
    "SELECT COUNT(*) AS n FROM competition_referee_bans WHERE league_id = ? AND season_number = ?"
  ).bind(leagueId, seasonNumber).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet banů", e); return null; });
  if ((used?.n ?? 0) >= MAX_BANS_PER_SEASON) {
    return {
      ok: false, usable,
      reason: "Letos už soutěž jednoho rozhodčího vyškrtla. Víc jich za sezónu nejde.",
    };
  }

  if (usable - 1 < MIN_ACTIVE_REFEREES) {
    return {
      ok: false, usable,
      reason: `Na listině by zbylo jen ${usable - 1} rozhodčích. Minimum je ${MIN_ACTIVE_REFEREES} — jinak by jeden pískal dva zápasy denně.`,
    };
  }
  return { ok: true, usable };
}

/** Kolik sudích může soutěž reálně nasadit — okresní pool minus její vlastní bany. */
export async function countUsable(
  db: D1Database, leagueId: string, seasonNumber: number, district: string,
): Promise<number> {
  const { normalizeDistrict } = await import("../referees/referee-generator");
  const base = normalizeDistrict(district);
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM referees r
      WHERE r.district = ? AND r.status = 'active'
        AND r.id NOT IN (
          SELECT referee_id FROM competition_referee_bans
           WHERE league_id = ? AND ? BETWEEN season_number AND COALESCE(until_season, season_number))`
  ).bind(base, leagueId, seasonNumber).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet použitelných sudích", e); return null; });
  return row?.n ?? 0;
}

/** Sudí, které soutěž právě teď nesmí nasadit. */
export async function bannedIds(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT referee_id FROM competition_referee_bans
      WHERE league_id = ? AND ? BETWEEN season_number AND COALESCE(until_season, season_number)`
  ).bind(leagueId, seasonNumber).all<{ referee_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "seznam banů", e); return { results: [] }; });
  return new Set(rows.results.map((r) => r.referee_id));
}

export interface ApplyBanOpts {
  leagueId: string;
  seasonNumber: number;
  refereeId: string;
  reason: string;
  source: "komise" | "snem" | "auto";
  proposalId: string | null;
  gameDate: string;
}

/**
 * Vyškrtne sudího a rozdá následky.
 *
 * Sudí se po sezóně vrátí naštvaný na všechny, kdo pro vyškrtnutí hlasovali,
 * a kolegové z okresu se za něj postaví u navrhovatele. Vyhodit někoho není zadarmo.
 */
export async function applyRefereeBan(db: D1Database, opts: ApplyBanOpts): Promise<boolean> {
  const res = await db.prepare(
    `INSERT OR IGNORE INTO competition_referee_bans
      (id, league_id, referee_id, season_number, until_season, reason, source)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), opts.leagueId, opts.refereeId, opts.seasonNumber,
    opts.seasonNumber, opts.reason, opts.source,
  ).run().catch((e) => { logger.error({ module: M }, "zápis banu", e); return null; });

  if (!res || (res.meta?.changes ?? 0) === 0) return false;

  await punishVoters(db, opts);
  await colleaguesReact(db, opts);

  logger.info({ module: M }, `soutěž ${opts.leagueId}: vyškrtnut rozhodčí ${opts.refereeId} (${opts.source})`);
  return true;
}

/** Vyškrtnutý si pamatuje, kdo zvedl ruku. Vrátí se s tím do příští sezóny. */
async function punishVoters(db: D1Database, opts: ApplyBanOpts): Promise<void> {
  if (!opts.proposalId) return;

  const voters = await db.prepare(
    "SELECT team_id FROM competition_ballots WHERE proposal_id = ? AND answer = 'pro'"
  ).bind(opts.proposalId).all<{ team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "hlasující pro ban", e); return { results: [] }; });

  for (const v of voters.results) {
    await db.prepare(
      `INSERT INTO referee_team_relations (id, referee_id, team_id, sentiment, duvod)
       VALUES (?,?,?,?,?)
       ON CONFLICT(referee_id, team_id) DO UPDATE SET
         sentiment = MAX(-100, referee_team_relations.sentiment - 40),
         duvod = excluded.duvod`
    ).bind(crypto.randomUUID(), opts.refereeId, v.team_id, -40, "Vyškrtli mě z listiny.")
      .run().catch((e) => logger.warn({ module: M }, `paměť sudího vůči ${v.team_id}`, e));
  }
}

/**
 * Kolegiální solidarita. Bafuňáři v okresní komisi drží při sobě — navrhovatele
 * si zapamatují všichni sudí archetypu `bafunar`.
 */
async function colleaguesReact(db: D1Database, opts: ApplyBanOpts): Promise<void> {
  if (!opts.proposalId) return;

  const proposer = await db.prepare(
    "SELECT proposed_by_team_id FROM competition_proposals WHERE id = ?"
  ).bind(opts.proposalId).first<{ proposed_by_team_id: string }>()
    .catch(() => null);
  if (!proposer) return;

  const banned = await db.prepare("SELECT district FROM referees WHERE id = ?")
    .bind(opts.refereeId).first<{ district: string }>()
    .catch(() => null);
  if (!banned) return;

  const colleagues = await db.prepare(
    "SELECT id FROM referees WHERE district = ? AND archetype = 'bafunar' AND status = 'active' AND id != ?"
  ).bind(banned.district, opts.refereeId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kolegové z komise", e); return { results: [] }; });

  for (const col of colleagues.results) {
    await db.prepare(
      `INSERT INTO referee_team_relations (id, referee_id, team_id, sentiment, duvod)
       VALUES (?,?,?,?,?)
       ON CONFLICT(referee_id, team_id) DO UPDATE SET
         sentiment = MAX(-100, referee_team_relations.sentiment - 15),
         duvod = excluded.duvod`
    ).bind(crypto.randomUUID(), col.id, proposer.proposed_by_team_id, -15, "Vyhodili nám kolegu z listiny.")
      .run().catch((e) => logger.warn({ module: M }, "reakce kolegů", e));
  }
}

export interface RefereeStanding {
  refereeId: string;
  name: string;
  archetype: string;
  matches: number;
  avgGrade: number | null;
  banned: boolean;
  /** Splňuje podmínky pro automatický návrh na vyškrtnutí. */
  flagged: boolean;
}

/**
 * Listina soutěže se známkami. Slouží komisi k rozhodování a zároveň z ní
 * vzniká automatický návrh — sudí, kterému se v okrese soustavně nedaří,
 * se na program dostane sám, ne z něčí libovůle.
 */
export async function refereeStandings(
  db: D1Database, leagueId: string, seasonNumber: number, district: string,
): Promise<RefereeStanding[]> {
  const { normalizeDistrict, refereeFullName } = await import("../referees/referee-generator");
  const base = normalizeDistrict(district);

  const rows = await db.prepare(
    `SELECT r.id, r.first_name, r.last_name, r.nickname, r.archetype,
            COALESCE(s.matches, 0) AS matches,
            CASE WHEN COALESCE(s.matches,0) > 0 THEN s.grade_sum / s.matches ELSE NULL END AS avg_grade
       FROM referees r
       LEFT JOIN referee_stats s
              ON s.referee_id = r.id AND s.season_number = ? AND s.league_id = ?
      WHERE r.district = ? AND r.status = 'active'
      ORDER BY avg_grade DESC NULLS LAST, r.last_name`
  ).bind(seasonNumber, leagueId, base).all<{
    id: string; first_name: string; last_name: string; nickname: string | null;
    archetype: string; matches: number; avg_grade: number | null;
  }>().catch((e) => { logger.warn({ module: M }, "listina se známkami", e); return { results: [] }; });

  const bans = await bannedIds(db, leagueId, seasonNumber);

  return rows.results.map((r) => ({
    refereeId: r.id,
    name: refereeFullName({ first_name: r.first_name, last_name: r.last_name, nickname: r.nickname } as never),
    archetype: r.archetype,
    matches: r.matches,
    avgGrade: r.avg_grade,
    banned: bans.has(r.id),
    flagged: r.matches >= AUTO_PROPOSAL_MATCHES
      && r.avg_grade !== null && r.avg_grade > AUTO_PROPOSAL_GRADE
      && !bans.has(r.id),
  }));
}

/** Bany končí se sezónou — sudí se vrací automaticky. */
export async function expiredBans(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM competition_referee_bans WHERE league_id = ? AND COALESCE(until_season, season_number) < ?"
  ).bind(leagueId, seasonNumber).first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}

export { recordCompetitionEntry };
