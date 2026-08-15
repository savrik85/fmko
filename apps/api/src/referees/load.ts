/**
 * Napojení rozhodčích na zápas — načtení profilu před výkopem a zápis bilance po něm.
 *
 * Zápisy po zápase se schválně vracejí jako pole statementů, aby je runner mohl poslat
 * jedním `db.batch()` po dohrání celého kola. Match tick zpracovává všechny ligy
 * v jedné invokaci a CPU workeru je reálné omezení.
 */

import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { NEUTRAL_REFEREE, type RefereeProfile, type RefereeIncident } from "../engine/referee";
import { rowToProfile, refereeFullName, ensureReferees, type RefereeRow } from "./referee-generator";
import { delegateRefereesForCalendar } from "./delegation";

/** Profil uložený k zápasu — nese i věci, které engine nepotřebuje, ale UI ano. */
export interface RefereeSnapshot extends RefereeProfile {
  nickname: string | null;
  /** Kvůli rodu v textech — „klidná veteránka" místo „klidný veterán". */
  gender: string;
  age: number;
  occupation: string;
  bio: string;
  hlaska: string;
  avatar: Record<string, unknown> | null;
}

export interface LoadedReferee {
  profile: RefereeProfile;
  snapshot: RefereeSnapshot;
}

const NEUTRAL_SNAPSHOT: RefereeSnapshot = {
  ...NEUTRAL_REFEREE,
  nickname: null,
  gender: "m",
  age: 40,
  occupation: "",
  bio: "O tomhle sudím se toho moc neví.",
  hlaska: "",
  avatar: null,
};

function toSnapshot(row: RefereeRow): RefereeSnapshot {
  let avatar: Record<string, unknown> | null = null;
  try {
    avatar = row.avatar ? JSON.parse(row.avatar) as Record<string, unknown> : null;
  } catch (e) {
    logger.warn({ module: "referees" }, `nečitelný avatar rozhodčího ${row.id}`, e);
  }
  return {
    ...rowToProfile(row),
    nickname: row.nickname,
    gender: row.gender,
    age: row.age,
    occupation: row.occupation,
    bio: row.bio,
    hlaska: row.hlaska,
    avatar,
  };
}

/**
 * Načte rozhodčího delegovaného na zápas.
 *
 * Když delegace chybí (denní tick kolo minul, recovery zaseknutého kola), dodělá se
 * synchronně se stejným seedem — přidělí tedy totéž, co by přidělil před dvěma dny.
 * Když ani to nevyjde, vrátí neutrálního sudího. Nikdy nehází výjimku: zápas se musí
 * odehrát i bez rozhodčího.
 */
export async function loadRefereeForMatch(
  db: D1Database,
  matchId: string,
  calendarId?: string | null,
): Promise<LoadedReferee> {
  const readRow = async (): Promise<RefereeRow | null> =>
    db.prepare(
      `SELECT r.* FROM matches m JOIN referees r ON r.id = m.referee_id WHERE m.id = ?`
    ).bind(matchId).first<RefereeRow>()
      .catch((e) => { logger.warn({ module: "referees" }, "načtení rozhodčího zápasu", e); return null; });

  let row = await readRow();

  if (!row && calendarId) {
    const added = await delegateRefereesForCalendar(db, calendarId)
      .catch((e) => { logger.warn({ module: "referees" }, "dodatečná delegace", e); return 0; });
    if (added > 0) row = await readRow();
  }

  if (!row) {
    logger.warn({ module: "referees" }, `zápas ${matchId} nemá delegovaného rozhodčího — neutrální profil`);
    return { profile: NEUTRAL_REFEREE, snapshot: NEUTRAL_SNAPSHOT };
  }

  const snapshot = toSnapshot(row);
  return { profile: rowToProfile(row), snapshot };
}

/**
 * Doplní do profilu, co si sudí pamatuje o obou klubech.
 *
 * Bez toho by paměť z pozápasových rozhovorů byla jen číslo v tabulce — teprve
 * tímhle se propíše do hraničních verdiktů příštího vzájemného zápasu.
 */
export async function withRefereeMemory(
  db: D1Database,
  profile: RefereeProfile,
  homeTeamId: string,
  awayTeamId: string,
): Promise<RefereeProfile> {
  if (!profile.id) return profile;
  const rows = await db.prepare(
    "SELECT team_id, sentiment FROM referee_team_relations WHERE referee_id = ? AND team_id IN (?, ?)"
  ).bind(profile.id, homeTeamId, awayTeamId).all<{ team_id: string; sentiment: number }>()
    .catch((e) => { logger.warn({ module: "referees" }, "paměť rozhodčího k týmům", e); return null; });

  const byTeam = new Map((rows?.results ?? []).map((r) => [r.team_id, r.sentiment]));
  return {
    ...profile,
    homeRespect: byTeam.get(homeTeamId) ?? 0,
    awayRespect: byTeam.get(awayTeamId) ?? 0,
  };
}

/**
 * Zášť i přízeň vyprchávají — jeden bod k nule za odehrané kolo, takže ostrá
 * kritika (−16) zmizí zhruba za sezónu. Jeden UPDATE na ligu a kolo.
 */
export async function decayRefereeMemory(db: D1Database, leagueId: string): Promise<void> {
  await db.prepare(
    `UPDATE referee_team_relations
     SET sentiment = sentiment - CASE WHEN sentiment > 0 THEN 1 WHEN sentiment < 0 THEN -1 ELSE 0 END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE sentiment != 0 AND team_id IN (SELECT id FROM teams WHERE league_id = ?)`
  ).bind(leagueId).run()
    .catch((e) => logger.warn({ module: "referees" }, "decay paměti rozhodčích", e));
}

/**
 * Rozhodčí pro pohárový zápas.
 *
 * Pohár nedeleguje dva dny předem — pavouk se plní až po dohrání předchozího kola.
 * Sudí se proto vybírá deterministicky z komise okresu domácího klubu. Když je
 * domácí velkoklub bez reálného týmu (nemá okres), píská neutrální sudí.
 */
export async function loadCupReferee(
  db: D1Database,
  cupMatchId: string,
  homeRealTeamId: string | null,
): Promise<LoadedReferee> {
  if (!homeRealTeamId) return { profile: NEUTRAL_REFEREE, snapshot: NEUTRAL_SNAPSHOT };

  const districtRow = await db.prepare(
    "SELECT v.district AS district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
  ).bind(homeRealTeamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: "referees" }, "okres domácího klubu v poháru", e); return null; });

  if (!districtRow?.district) return { profile: NEUTRAL_REFEREE, snapshot: NEUTRAL_SNAPSHOT };

  const pool = await ensureReferees(db, districtRow.district);
  if (pool.length === 0) return { profile: NEUTRAL_REFEREE, snapshot: NEUTRAL_SNAPSHOT };

  const row = pool[seedFromString(cupMatchId) % pool.length];
  return { profile: rowToProfile(row), snapshot: toSnapshot(row) };
}

/** Sporná situace s DB identifikátory týmů — tak, jak se ukládá do zápasu. */
export interface StoredIncident extends Omit<RefereeIncident, "againstTeamId" | "favourTeamId"> {
  againstTeamId: string;
  favourTeamId: string;
}

/**
 * Převede engine ID týmů (1 = domácí, 2 = hosté) na DB UUID.
 * Bez toho by frontend i pozápasový rozhovor musely parsovat všechny události zápasu.
 */
export function mapIncidentsToDb(
  incidents: RefereeIncident[],
  homeTeamId: string,
  awayTeamId: string,
): StoredIncident[] {
  const resolve = (id: number) => (id === 1 ? homeTeamId : awayTeamId);
  return incidents.map((i) => ({
    minute: i.minute,
    kind: i.kind,
    severity: i.severity,
    playerName: i.playerName,
    text: i.text,
    againstTeamId: resolve(i.againstTeamId),
    favourTeamId: resolve(i.favourTeamId),
  }));
}

export interface RefereeMatchFacts {
  refereeId: string;
  seasonNumber: number;
  leagueId: string | null;
  /** Pohár nemá ligu — bilance obou stran musí jít na reálná teams.id, nebo nikam. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  grade: number;
  fouls: number;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  homePenalties: number;
  awayPenalties: number;
  incidents: StoredIncident[];
}

/**
 * Sestaví statementy, které po zápase doplní sezónní bilanci rozhodčího a jeho
 * historii vůči oběma klubům. Voláním se nic nespouští — runner je pošle v jedné dávce.
 */
export function refereeStatsStatements(db: D1Database, f: RefereeMatchFacts): D1PreparedStatement[] {
  const yellow = f.homeYellow + f.awayYellow;
  const red = f.homeRed + f.awayRed;
  const penalties = f.homePenalties + f.awayPenalties;
  const homeWin = f.homeScore > f.awayScore ? 1 : 0;
  const awayWin = f.awayScore > f.homeScore ? 1 : 0;
  const draw = f.homeScore === f.awayScore ? 1 : 0;

  // Pohár nemá league_id. NULL by tu nešel použít — UNIQUE bere NULLy jako různé,
  // takže by se druhý pohárový zápas rozbil o primární klíč místo aby se přičetl.
  const leagueKey = f.leagueId ?? "cup";
  const statsId = `rs-${f.refereeId}-${f.seasonNumber}-${leagueKey}`;
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO referee_stats
         (id, referee_id, season_number, league_id, matches, fouls, yellow_cards, red_cards,
          penalties, incidents, grade_sum, home_wins, away_wins, draws)
       VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(referee_id, season_number, league_id) DO UPDATE SET
         matches = matches + 1,
         fouls = fouls + excluded.fouls,
         yellow_cards = yellow_cards + excluded.yellow_cards,
         red_cards = red_cards + excluded.red_cards,
         penalties = penalties + excluded.penalties,
         incidents = incidents + excluded.incidents,
         grade_sum = grade_sum + excluded.grade_sum,
         home_wins = home_wins + excluded.home_wins,
         away_wins = away_wins + excluded.away_wins,
         draws = draws + excluded.draws,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
    ).bind(
      statsId, f.refereeId, f.seasonNumber, leagueKey,
      f.fouls, yellow, red, penalties, f.incidents.length, f.grade,
      homeWin, awayWin, draw,
    ),
  ];

  const side = (teamId: string, isHome: boolean) => {
    const win = isHome ? homeWin : awayWin;
    const loss = isHome ? awayWin : homeWin;
    const y = isHome ? f.homeYellow : f.awayYellow;
    const r = isHome ? f.homeRed : f.awayRed;
    const penFor = isHome ? f.homePenalties : f.awayPenalties;
    const penAgainst = isHome ? f.awayPenalties : f.homePenalties;
    const incFor = f.incidents.filter((i) => i.favourTeamId === teamId).length;
    const incAgainst = f.incidents.filter((i) => i.againstTeamId === teamId).length;

    return db.prepare(
      `INSERT INTO referee_team_relations
         (id, referee_id, team_id, matches, wins, draws, losses, yellow_cards, red_cards,
          penalties_for, penalties_against, incidents_for, incidents_against)
       VALUES (?,?,?,1,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(referee_id, team_id) DO UPDATE SET
         matches = matches + 1,
         wins = wins + excluded.wins,
         draws = draws + excluded.draws,
         losses = losses + excluded.losses,
         yellow_cards = yellow_cards + excluded.yellow_cards,
         red_cards = red_cards + excluded.red_cards,
         penalties_for = penalties_for + excluded.penalties_for,
         penalties_against = penalties_against + excluded.penalties_against,
         incidents_for = incidents_for + excluded.incidents_for,
         incidents_against = incidents_against + excluded.incidents_against,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
    ).bind(
      `rtr-${f.refereeId}-${teamId}`, f.refereeId, teamId,
      win, draw, loss, y, r, penFor, penAgainst, incFor, incAgainst,
    );
  };

  // Velkoklub v poháru nemá řádek v `teams` — jeho bilanci není kam zapsat.
  if (f.homeTeamId) stmts.push(side(f.homeTeamId, true));
  if (f.awayTeamId) stmts.push(side(f.awayTeamId, false));
  return stmts;
}

export { refereeFullName };
