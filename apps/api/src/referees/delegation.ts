/**
 * Delegace rozhodčích — dva herní dny před výkopem.
 *
 * Proč dva dny: manažer musí stihnout přizpůsobit sestavu a (od fáze 2) tvrdost hry
 * tomu, kdo bude pískat. Dřív by to bylo bez napětí, později by to bylo k ničemu.
 *
 * Delegace je deterministická (seed z calendar ID), takže opakovaný běh denního ticku
 * i pozdější dodělání chybějící delegace přidělí totéž.
 */

import { createRng, type Rng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { ensureReferees, normalizeDistrict, type RefereeRow } from "./referee-generator";

export interface DelegationMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface DelegationState {
  /** Kolik zápasů už rozhodčí v sezóně odpískal — základ férového rozdělení. */
  assignedCount: Record<string, number>;
  /** Poslední kolo, ve kterém rozhodčí pískal. */
  lastWeekOf: Record<string, number>;
  /** Kdo naposledy pískal danému týmu. */
  lastRefOfTeam: Record<string, string>;
  /** Rozhodčí, kteří už mají v ten den zápas (i v jiné soutěži okresu). */
  busyToday: Set<string>;
  currentWeek: number;
}

/**
 * Rozdělí rozhodčí na zápasy jednoho kola.
 *
 * Váha = férová zátěž, měkce potlačená u toho, kdo témuž týmu pískal naposledy nebo
 * kdo pískal minulé kolo. Měkké násobiče (ne tvrdé vyloučení) proto, že senior a U21
 * můžou hrát tentýž den — 15 sudích na 14 zápasů by s tvrdým pravidlem uvázlo.
 */
export function pickRefereesForRound(
  rng: Rng,
  pool: RefereeRow[],
  matches: DelegationMatch[],
  state: DelegationState,
): Array<{ matchId: string; refereeId: string }> {
  if (pool.length === 0) return [];

  const out: Array<{ matchId: string; refereeId: string }> = [];
  const usedThisRound = new Set<string>(state.busyToday);
  const assigned = { ...state.assignedCount };
  const lastRefOfTeam = { ...state.lastRefOfTeam };

  // Pořadí zápasů je stabilní, jinak by stejný seed dal jiné přiřazení.
  const ordered = [...matches].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const match of ordered) {
    let candidates = pool.filter((r) => !usedThisRound.has(r.id));
    // Nouzový ventil: víc zápasů než sudích v okrese (senior + U21 naráz).
    if (candidates.length === 0) candidates = pool;

    // Nejdřív dostanou slovo ti nejméně vytížení. Samotná váha 1/(1+n) rozdíly
    // nedorovná, protože ji přebíjejí postihy za opakování — bez tvrdého okna se
    // za sezónu rozjede zátěž o čtyři zápasy mezi nejvytíženějším a nejméně vytíženým.
    const minLoad = Math.min(...candidates.map((r) => assigned[r.id] ?? 0));
    const leastBusy = candidates.filter((r) => (assigned[r.id] ?? 0) <= minLoad + 1);
    if (leastBusy.length > 0) candidates = leastBusy;

    const weights = candidates.map((r) => {
      let w = 1 / (1 + (assigned[r.id] ?? 0));
      if (lastRefOfTeam[match.homeTeamId] === r.id) w *= 0.05;
      if (lastRefOfTeam[match.awayTeamId] === r.id) w *= 0.05;
      if (state.lastWeekOf[r.id] === state.currentWeek - 1) w *= 0.50;
      return w;
    });

    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.random() * total;
    let picked = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { picked = candidates[i]; break; }
    }

    out.push({ matchId: match.id, refereeId: picked.id });
    usedThisRound.add(picked.id);
    assigned[picked.id] = (assigned[picked.id] ?? 0) + 1;
    lastRefOfTeam[match.homeTeamId] = picked.id;
    lastRefOfTeam[match.awayTeamId] = picked.id;
  }

  return out;
}

interface CalendarRow {
  calendar_id: string;
  league_id: string;
  game_week: number;
  season_number: number;
  scheduled_at: string;
  district: string;
}

/** Načte stav potřebný pro férovou rotaci v dané lize a den. */
async function loadState(
  db: D1Database,
  cal: CalendarRow,
  poolIds: Set<string>,
): Promise<DelegationState> {
  const day = new Date(cal.scheduled_at);
  const dayStart = new Date(day); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(day); dayEnd.setUTCHours(23, 59, 59, 999);

  const [loadRes, busyRes, lastRes] = await db.batch([
    // Sezónní zátěž + poslední odpískané kolo.
    db.prepare(
      `SELECT m.referee_id AS rid, COUNT(*) AS c, MAX(sc.game_week) AS last_week
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.referee_id IS NOT NULL AND sc.season_number = ?
       GROUP BY m.referee_id`
    ).bind(cal.season_number),
    // Kdo už má ten den zápas — i v jiné soutěži okresu (senior vs. U21).
    db.prepare(
      `SELECT DISTINCT m.referee_id AS rid
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.referee_id IS NOT NULL AND sc.scheduled_at BETWEEN ? AND ?`
    ).bind(dayStart.toISOString(), dayEnd.toISOString()),
    // Kdo naposledy pískal kterému týmu v této lize.
    db.prepare(
      `SELECT m.home_team_id AS h, m.away_team_id AS a, m.referee_id AS rid, sc.game_week AS gw
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.referee_id IS NOT NULL AND sc.league_id = ? AND sc.season_number = ?
       ORDER BY sc.game_week ASC`
    ).bind(cal.league_id, cal.season_number),
  ]);

  const assignedCount: Record<string, number> = {};
  const lastWeekOf: Record<string, number> = {};
  for (const row of loadRes.results as Array<{ rid: string; c: number; last_week: number }>) {
    if (!poolIds.has(row.rid)) continue;
    assignedCount[row.rid] = row.c;
    lastWeekOf[row.rid] = row.last_week;
  }

  const busyToday = new Set<string>();
  for (const row of busyRes.results as Array<{ rid: string }>) {
    if (poolIds.has(row.rid)) busyToday.add(row.rid);
  }

  // Řazení vzestupně podle kola → poslední zápis vyhraje, tedy nejnovější kolo.
  const lastRefOfTeam: Record<string, string> = {};
  for (const row of lastRes.results as Array<{ h: string; a: string; rid: string; gw: number }>) {
    lastRefOfTeam[row.h] = row.rid;
    lastRefOfTeam[row.a] = row.rid;
  }

  return { assignedCount, lastWeekOf, lastRefOfTeam, busyToday, currentWeek: cal.game_week };
}

/** Přidělí rozhodčí všem dosud nedelegovaným zápasům jednoho kola. */
async function delegateCalendar(db: D1Database, cal: CalendarRow): Promise<number> {
  const pool = await ensureReferees(db, cal.district);
  if (pool.length === 0) {
    logger.warn({ module: "referees" }, `okres ${cal.district} nemá rozhodčí — delegace přeskočena`);
    return 0;
  }

  const matchRows = await db.prepare(
    "SELECT id, home_team_id, away_team_id FROM matches WHERE calendar_id = ? AND referee_id IS NULL"
  ).bind(cal.calendar_id).all<{ id: string; home_team_id: string; away_team_id: string }>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení zápasů kola", e); return null; });

  const matches: DelegationMatch[] = (matchRows?.results ?? []).map((m) => ({
    id: m.id, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
  }));
  if (matches.length === 0) return 0;

  const poolIds = new Set(pool.map((r) => r.id));
  const state = await loadState(db, cal, poolIds);

  const rng = createRng(seedFromString(cal.calendar_id) + 4241);
  const picks = pickRefereesForRound(rng, pool, matches, state);
  if (picks.length === 0) return 0;

  // `AND referee_id IS NULL` chrání před souběhem denního a zápasového ticku.
  await db.batch(picks.map((p) => db.prepare(
    "UPDATE matches SET referee_id = ? WHERE id = ? AND referee_id IS NULL"
  ).bind(p.refereeId, p.matchId)))
    .catch((e) => { logger.error({ module: "referees" }, "zápis delegace", e); });

  return picks.length;
}

/**
 * Deleguje rozhodčí na zápasy, které se hrají za dva herní dny.
 *
 * Herní čas, ne reálný — `scheduled_at` v kalendáři je odvozené z herního data,
 * takže obě strany porovnání musí být v herním čase.
 */
export async function delegateReferees(db: D1Database, gameDate: string): Promise<number> {
  const target = new Date(gameExpiry(gameDate, 2));
  const from = new Date(target); from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target); to.setUTCHours(23, 59, 59, 999);

  const cals = await db.prepare(
    `SELECT sc.id AS calendar_id, sc.league_id, sc.game_week, sc.season_number, sc.scheduled_at,
            l.district AS district
     FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id
     WHERE sc.scheduled_at BETWEEN ? AND ? AND sc.status = 'scheduled'
       AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id AND m.referee_id IS NULL)`
  ).bind(from.toISOString(), to.toISOString()).all<CalendarRow>()
    .catch((e) => { logger.warn({ module: "referees" }, "hledání kol k delegaci", e); return null; });

  let total = 0;
  for (const cal of cals?.results ?? []) {
    try {
      total += await delegateCalendar(db, { ...cal, district: normalizeDistrict(cal.district) });
    } catch (e) {
      logger.error({ module: "referees" }, `delegace kola ${cal.calendar_id} selhala`, e);
    }
  }
  return total;
}

/**
 * Dodělá delegaci pro konkrétní kolo. Používá se jako záchrana, když denní tick
 * kolo minul (recovery zaseknutého kola, liga založená mid-week). Deterministický
 * seed zajistí, že přidělí totéž, co by přidělil před dvěma dny.
 */
export async function delegateRefereesForCalendar(db: D1Database, calendarId: string): Promise<number> {
  const cal = await db.prepare(
    `SELECT sc.id AS calendar_id, sc.league_id, sc.game_week, sc.season_number, sc.scheduled_at,
            l.district AS district
     FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id
     WHERE sc.id = ?`
  ).bind(calendarId).first<CalendarRow>()
    .catch((e) => { logger.warn({ module: "referees" }, "načtení kola pro dodatečnou delegaci", e); return null; });

  if (!cal) return 0;
  return delegateCalendar(db, { ...cal, district: normalizeDistrict(cal.district) });
}
