/**
 * Žáci: databázová část družstva žáků. Pravidla jsou v `rules.ts`, návrh v
 * docs/youth-academy-redesign-2026-11-04.md.
 *
 * Kluk (11–14 let) žije v `youth_prospects`. Hráčem se stane v létě postupem do dorostu
 * (U21), nebo dřív, když hraje o kategorii výš. Obojí jde přes nabídku v `player_offers`
 * (source `youth`, `prospect_id`) a `acceptPlayerOffer`, takže hráč vzniká na jediném místě.
 */

import { alcoholAfterAging } from "../generators/alcohol-age";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { createPlayer, levelFromVillageSize, categoryFromVillageSize } from "../generators/create-player";
import { talentForAge, GEM_CHANCE, GEM_TALENT, GEM_EXTRA_CAP } from "../skills/generator";
import { getDistrictDataFromDB } from "../data/districts";
import { FIRSTNAMES } from "../data/czech-names";
import { rowEffectiveness, type StaffEffectRow } from "../staff/staff-effects";
import { recordTransaction } from "../season/finance-processor";
import { logger } from "../lib/logger";
import {
  type CoachType, YOUNGEST_AGE, OLDEST_AGE, MIN_SQUAD, UPKEEP_BASE, UPKEEP_PER_KID, upkeepWeekly, VOLUNTEER_MIN_AGE,
  ACADEMY_LEVELS, academyLevelOf, type AcademyLevel, coachSonAge,
  STAFF_SPLIT_U21_FACTOR, VOLUNTEER_QUIT_BONUS, VOLUNTEER_ATTRACT, PARENT_RECRUIT_EXTRA, expectedKidsPerYear, rollKids,
  programQuality, weeklyProgress, estimatedTalent, verdictText, commitmentText, canPlayUp, recommendsPlayUp,
  REOFFER_DAYS, firstOfferDay, quitChance, talentShiftAt13, pickTraits, positionVisible, GRADUATE_WAGE_FACTOR,
  youthTransferFee, distanceKm, qualityText, PLAY_UP_ESTIMATE, estimateRange, strengthsOf, staffQualityText,
  YOUTH_EQUIPMENT, POTENTIAL_SCALE, type YouthEquipment,
  RECRUIT_DAY_COST, recruitDayExpected, WEEKS_PER_SEASON, NEIGHBOR_RADIUS_KM, neighborKidsExpected, NEIGHBOR_MAX_PER_YEAR, MAX_SQUAD,
  POACH_RADIUS_KM, MAX_POACH_PER_SEASON, POACH_THRESHOLD, POACH_ACTIONS, type PoachAction, poachBaseInterest,
  interestText, youthFeeByAge,
} from "./rules";

const M = "academy";

/** Délka sezóny pro rozložení doporučení, když z kalendáře nejde zjistit, kolik zbývá. */
const FALLBACK_SEASON_DAYS = 100;

export interface ProspectRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  age: number;
  position: string;
  home_village_id: string | null;
  identity_seed: number;
  hidden_talent: number;
  gem_cap: number;
  progress_current: number;
  progress_cap: number;
  estimate_offset: number;
  traits: string;
  commitment: number;
  status: string;
  next_offer_on: string | null;
  aged_season: number | null;
  coach_son: number;
  player_id: string | null;
  joined_at: string;
  left_at: string | null;
}

interface ClubRow {
  id: string;
  user_id: string | null;
  league_id: string | null;
  village_id: string;
  village_name: string;
  district: string;
  size: string;
  population: number;
  lat: number;
  lng: number;
  academy_upkeep: number;
  academy_coach_type: string | null;
  academy_coach_player_id: string | null;
  academy_coach_name: string | null;
  academy_coach_prospect_id: string | null;
  academy_level: string | null;
}

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };

const day = (iso: string) => iso.slice(0, 10);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${day(isoDate)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseJson<T>(raw: string | null | undefined, fallback: T, what: string): T {
  try { return raw ? JSON.parse(raw) as T : fallback; }
  catch (e) { logger.warn({ module: M }, `parse ${what}`, e); return fallback; }
}

const isHuman = (club: { user_id: string | null }) => !!club.user_id && club.user_id !== "ai";

async function loadClub(db: D1Database, teamId: string): Promise<ClubRow | null> {
  return db.prepare(
    `SELECT t.id, t.user_id, t.league_id, t.village_id, v.name AS village_name, v.district, v.size, v.population, v.lat, v.lng,
            t.academy_upkeep, t.academy_coach_type, t.academy_coach_player_id, t.academy_coach_name, t.academy_coach_prospect_id, t.academy_level
       FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<ClubRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load club", e); return null; });
}

async function activeProspects(db: D1Database, teamId: string): Promise<ProspectRow[]> {
  const res = await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = 'active' ORDER BY age DESC, last_name")
    .bind(teamId).all<ProspectRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load prospects", e); return { results: [] as ProspectRow[] }; });
  return res.results;
}

async function loadStaffYouthCoach(db: D1Database, teamId: string): Promise<{ effectiveness: number; judgement: number; name: string; weeklyWage: number } | null> {
  const row = await db.prepare(
    `SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm, first_name, last_name, weekly_wage
       FROM staff_members WHERE team_id = ? AND role = 'trener_mladeze' LIMIT 1`,
  ).bind(teamId).first<StaffEffectRow & { first_name: string; last_name: string; weekly_wage: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load youth coach", e); return null; });
  if (!row) return null;
  return { effectiveness: rowEffectiveness(row, "trener_mladeze"), judgement: row.judgement, name: `${row.first_name} ${row.last_name}`, weeklyWage: row.weekly_wage ?? 0 };
}

async function loadManagerYouth(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT youth_development FROM managers WHERE team_id = ? LIMIT 1")
    .bind(teamId).first<{ youth_development: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load manager youth", e); return null; });
  return row?.youth_development ?? 40;
}

/** Vůdcovství dobrovolníka z áčka, null = hráč v klubu už není. */
async function loadVolunteer(db: D1Database, teamId: string, playerId: string | null): Promise<{ name: string; leadership: number } | null> {
  if (!playerId) return null;
  const row = await db.prepare("SELECT first_name, last_name, personality FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')")
    .bind(playerId, teamId).first<{ first_name: string; last_name: string; personality: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load volunteer", e); return null; });
  if (!row) return null;
  return { name: `${row.first_name} ${row.last_name}`, leadership: parseJson<{ leadership?: number }>(row.personality, {}, "personality").leadership ?? 40 };
}

/** Úrovně klubového vybavení, které využívají i žáci (tabulka `equipment`). */
async function loadYouthEquipment(db: D1Database, teamId: string): Promise<YouthEquipment> {
  const row = await db.prepare("SELECT balls, training_cones, winter_gear, team_van FROM equipment WHERE team_id = ?")
    .bind(teamId).first<YouthEquipment>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load youth equipment", e); return null; });
  return { balls: row?.balls ?? 0, training_cones: row?.training_cones ?? 0, winter_gear: row?.winter_gear ?? 0, team_van: row?.team_van ?? 0 };
}

interface CoachState {
  type: CoachType | null;
  name: string | null;
  quality: number;
  /** Úsudek placeného trenéra pro odhad talentu, jinak null. */
  judgement: number | null;
  /** Týdenní plat placeného trenéra mládeže (platí se jako zaměstnanec), jinak 0. */
  weeklyWage: number;
}

/** Kdo žáky vede a jak dobrá je příprava (trenér, vybavení a úroveň akademie). */
async function coachState(db: D1Database, club: ClubRow, squadSize: number): Promise<CoachState> {
  const base = await coachStateRaw(db, club, squadSize);
  return { ...base, quality: base.quality * ACADEMY_LEVELS[academyLevelOf(club.academy_level)].growth };
}

/** Trenér, který zmizel (hráč odešel, zaměstnanec skončil), se nepočítá. */
async function coachStateRaw(db: D1Database, club: ClubRow, squadSize: number): Promise<CoachState> {
  const managerYouth = await loadManagerYouth(db, club.id);
  const equipment = await loadYouthEquipment(db, club.id);
  const type = club.academy_coach_type as CoachType | null;
  if (type === "staff") {
    const staff = await loadStaffYouthCoach(db, club.id);
    if (staff) {
      return { type, name: staff.name, judgement: staff.judgement, weeklyWage: staff.weeklyWage,
        quality: programQuality({ coach: type, staffEffectiveness: staff.effectiveness, managerYouth, squadSize, equipment }) };
    }
  } else if (type === "volunteer") {
    const v = await loadVolunteer(db, club.id, club.academy_coach_player_id);
    if (v) return { type, name: v.name, judgement: null, weeklyWage: 0, quality: programQuality({ coach: type, volunteerLeadership: v.leadership, managerYouth, squadSize, equipment }) };
  } else if (type === "parent" && club.academy_coach_name) {
    return { type, name: club.academy_coach_name, judgement: null, weeklyWage: 0, quality: programQuality({ coach: type, managerYouth, squadSize, equipment }) };
  }
  return { type: null, name: null, judgement: null, weeklyWage: 0, quality: 0 };
}

/** Kolik dní zbývá do posledního zápasu ligy v aktuální sezóně. */
async function remainingSeasonDays(db: D1Database, leagueId: string | null, gameDate: string): Promise<number> {
  if (!leagueId) return FALLBACK_SEASON_DAYS;
  const row = await db.prepare(
    `SELECT MAX(scheduled_at) AS last FROM season_calendar
      WHERE league_id = ? AND season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)`,
  ).bind(leagueId, leagueId).first<{ last: string | null }>()
    .catch((e) => { logger.warn({ module: M, leagueId }, "season length", e); return null; });
  if (!row?.last) return FALLBACK_SEASON_DAYS;
  const days = Math.round((new Date(day(row.last)).getTime() - new Date(day(gameDate)).getTime()) / 86_400_000);
  return days >= 21 ? days : FALLBACK_SEASON_DAYS;
}

// ── Kluci ─────────────────────────────────────────────────────────────────────

// Brankář je v družstvu žáků jeden až dva z dvanácti (s vahou 1 z 24 neměla půlka akademií žádného)
const POSITION_WEIGHTS: Record<string, number> = { GK: 2, DEF: 8, MID: 8, FWD: 7 };
/** Od tolika žáků při založení má družstvo vždycky aspoň jednoho brankáře. */
const FOUNDING_GK_FROM = 5;

/**
 * Příjmení okresu se nemění, a čtou se pro každého kluka (stránka akademie s 24 kluky by
 * jinak četla tabulku příjmení 24krát). Mezipaměť drží izolát Workeru.
 */
const districtCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof getDistrictDataFromDB>> }>();
const DISTRICT_CACHE_MS = 10 * 60_000;

async function districtData(db: D1Database, district: string) {
  const hit = districtCache.get(district);
  if (hit && Date.now() - hit.at < DISTRICT_CACHE_MS) return hit.data;
  const data = await getDistrictDataFromDB(db, district);
  districtCache.set(district, { at: Date.now(), data });
  return data;
}

/** Identita se generuje jako pro šestnáctiletého (povolání, vzhled). */
const IDENTITY_AGE = 16;

/** Identita kluka: pevná pro jeho semínko, generuje se jako pro šestnáctiletého (povolání, vzhled). */
async function prospectIdentity(db: D1Database, seed: number, club: ClubRow, position: string) {
  const info: VillageInfo = { region_code: club.district, category: categoryFromVillageSize(club.size), population: club.population ?? 500, district: club.district };
  const districtData_ = await districtData(db, club.district);
  return generatePlayer(
    createRng(seed), info, position as "GK" | "DEF" | "MID" | "FWD",
    { surnames: districtData_.surnames, female_forms: {} }, { male: FIRSTNAMES, female: {} }, { age: IDENTITY_AGE },
  );
}

async function createProspect(db: D1Database, rng: Rng, club: ClubRow, age: number, gameDate: string, nextOfferOn: string | null, homeVillageId?: string, agedSeason: number | null = null, forcedPosition?: string): Promise<ProspectRow> {
  const position = forcedPosition ?? rng.weighted(POSITION_WEIGHTS);
  const seed = rng.int(1, 2_000_000_000);
  const identity = await prospectIdentity(db, seed, club, position);
  const gem = rng.random() < GEM_CHANCE;
  const talent = gem ? rng.int(GEM_TALENT[0], GEM_TALENT[1]) : talentForAge(rng, levelFromVillageSize(club.size), 16);
  const row: ProspectRow = {
    id: crypto.randomUUID(), team_id: club.id, first_name: identity.firstName, last_name: identity.lastName, age, position,
    home_village_id: homeVillageId ?? club.village_id, identity_seed: seed, hidden_talent: talent, gem_cap: gem ? rng.int(GEM_EXTRA_CAP[0], GEM_EXTRA_CAP[1]) : 0,
    progress_current: 0, progress_cap: 0, estimate_offset: Math.round((rng.random() * 2 - 1) * 100) / 100,
    traits: JSON.stringify(pickTraits(rng)), commitment: rng.int(55, 85), status: "active", next_offer_on: nextOfferOn, aged_season: agedSeason, coach_son: 0, player_id: null,
    joined_at: day(gameDate), left_at: null,
  };
  await db.prepare(
    `INSERT INTO youth_prospects (id, team_id, first_name, last_name, age, position, home_village_id, identity_seed, hidden_talent,
       gem_cap, progress_current, progress_cap, estimate_offset, traits, commitment, status, next_offer_on, aged_season, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(row.id, row.team_id, row.first_name, row.last_name, row.age, row.position, row.home_village_id, row.identity_seed,
    row.hidden_talent, row.gem_cap, row.progress_current, row.progress_cap, row.estimate_offset, row.traits, row.commitment,
    row.next_offer_on, row.aged_season, row.joined_at).run();
  return row;
}

/** Den, kdy trenér doporučí kluka o kategorii výš, pokud na to podle něj má. */
function playUpDay(rng: Rng, p: Pick<ProspectRow, "age" | "hidden_talent" | "estimate_offset">, judgement: number | null, gameDate: string, seasonDays: number): string | null {
  const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, judgement);
  return recommendsPlayUp(p.age, estimate) ? addDays(gameDate, firstOfferDay(rng, seasonDays)) : null;
}

/**
 * Založí družstvo žáků: kluci 11–14 let z obce hned, po ročnících podle počtu obyvatel.
 * Nic nestojí, platí se až týdenní provoz. Klub, který žáky už má, nezaloží podruhé.
 */
export async function foundYouthTeam(db: D1Database, rng: Rng, teamId: string, gameDate: string, extraYears = 0, minKids = 0): Promise<ServiceResult<{ created: number }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  // Nejvýš jednou za sezónu: založit, poslat starší žáky do dorostu, zrušit a založit znovu
  // by jinak dávalo hráče zadarmo dokola
  const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "active season", e); return null; });
  const seasonNumber = season?.number ?? 0;
  const claim = await db.prepare(
    // Nová akademie začíná jako běžná (po zrušení nezůstane úroveň z minula)
    "UPDATE teams SET academy_upkeep = 1, academy_level = 'standard', academy_founded_season = ? WHERE id = ? AND academy_upkeep = 0 AND (academy_founded_season IS NULL OR academy_founded_season < ?)",
  ).bind(seasonNumber, teamId, seasonNumber).run();
  if (claim.meta.changes === 0) {
    return { ok: false, status: 409, error: club.academy_upkeep ? "Žáky už máš" : "Akademii jde založit jen jednou za sezónu, znovu až příští sezónu" };
  }
  const founded = { ...club, academy_upkeep: 1, academy_level: "standard" };

  // Kdo přijde: žáci z obce a z okolních obcí bez akademie (jako každé léto), po ročnících
  const neighbors = await neighborVillages(db, founded);
  const slots: { age: number; villageId?: string }[] = [];
  for (let age = YOUNGEST_AGE; age <= OLDEST_AGE; age++) {
    const own = rollKids(rng, expectedKidsPerYear(club.population ?? 0));
    for (let i = 0; i < own; i++) slots.push({ age });
    let room = NEIGHBOR_MAX_PER_YEAR;
    for (const v of neighbors) {
      const n = Math.min(room, rollKids(rng, v.expected));
      room -= n;
      for (let i = 0; i < n; i++) slots.push({ age, villageId: v.id });
    }
  }
  // Přechod ze staré akademie: klub do žáků roky platil, takže je nějaké má i v osadě
  // (dojíždějí z okolí jako ve skutečných společných družstvech)
  if (slots.length < minKids) {
    const around = neighbors.length ? neighbors.map((v) => v.id) : await nearestVillages(db, club, 5);
    while (slots.length < Math.min(minKids, MAX_SQUAD)) {
      slots.push({ age: rng.int(YOUNGEST_AGE, OLDEST_AGE), villageId: around.length ? around[rng.int(0, around.length - 1)] : undefined });
    }
  }
  // Místo pro trenérova syna, ať družstvo nepřeteče přes MAX_SQUAD
  slots.splice(MAX_SQUAD - 1);
  const positions = slots.map(() => rng.weighted(POSITION_WEIGHTS));
  if (slots.length >= FOUNDING_GK_FROM && !positions.includes("GK")) positions[rng.int(0, positions.length - 1)] = "GK";

  const seasonDays = await remainingSeasonDays(db, club.league_id, gameDate);
  const coach = await coachState(db, club, MIN_SQUAD);
  const step = weeklyProgress(Math.max(0.6, coach.quality));
  let created = 0;
  for (let i = 0; i < slots.length; i++) {
    const { age, villageId } = slots[i];
    const p = await createProspect(db, rng, club, age, gameDate, null, villageId, null, positions[i]);
    // Žáci, co už v obci kopou, nejsou úplní začátečníci; u přechodu ze staré akademie víc
    const years = Math.min(age - YOUNGEST_AGE, 1 + extraYears);
    const next = playUpDay(rng, p, coach.judgement, gameDate, seasonDays);
    await db.prepare("UPDATE youth_prospects SET progress_current = ?, progress_cap = ?, next_offer_on = ? WHERE id = ?")
      .bind(step.current * 15 * years, step.cap * 15 * years, next, p.id).run();
    created++;
  }
  const son = await ensureCoachSon(db, rng, teamId, gameDate)
    .catch((e) => { logger.warn({ module: M, teamId }, "coach son at founding", e); return null; });
  if (son) created++;
  logger.info({ module: M, teamId }, `založeno družstvo žáků: ${created} žáků`);
  return { ok: true, created };
}

/** Nejbližší obce okresu (bez ohledu na akademie): odkud dojíždějí žáci do osady, kolem které jiné obce nejsou volné. */
async function nearestVillages(db: D1Database, club: ClubRow, limit: number): Promise<string[]> {
  type Row = { id: string; lat: number; lng: number };
  const res = await db.prepare("SELECT id, lat, lng FROM villages WHERE district = ? AND id != ? AND lat IS NOT NULL")
    .bind(club.district, club.village_id).all<Row>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "nearest villages", e); return { results: [] as Row[] }; });
  return res.results.sort((a, b) => distanceKm(club, a) - distanceKm(club, b)).slice(0, limit).map((v) => v.id);
}

/** Zruší družstvo žáků: kluci končí hned, nevyřízená doporučení propadnou. */
export async function closeYouthTeam(db: D1Database, teamId: string, gameDate: string): Promise<ServiceResult<{ quit: number }>> {
  const claim = await db.prepare(
    "UPDATE teams SET academy_upkeep = 0, academy_coach_type = NULL, academy_coach_player_id = NULL, academy_coach_name = NULL, academy_coach_prospect_id = NULL WHERE id = ? AND academy_upkeep = 1",
  ).bind(teamId).run();
  if (claim.meta.changes === 0) return { ok: false, status: 409, error: "Žáky nemáš" };
  await db.prepare("UPDATE player_offers SET status = 'expired' WHERE team_id = ? AND status = 'pending' AND prospect_id IS NOT NULL").bind(teamId).run();
  const res = await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE team_id = ? AND status = 'active'")
    .bind(day(gameDate), teamId).run();
  return { ok: true, quit: res.meta.changes ?? 0 };
}

// ── Trenér žáků ───────────────────────────────────────────────────────────────

export interface CoachOptions {
  volunteers: { playerId: string; name: string; age: number; leadership: string; rating: number; role: string }[];
  /** Táta jednoho z kluků. Null = klub nemá žádného kluka, jehož táta by to vzal. */
  parent: { name: string; prospectId: string; kid: string } | null;
  staff: { name: string } | null;
}

function leadershipText(l: number): string {
  if (l >= 70) return "žáky si získá";
  if (l >= 45) return "umí to s lidmi";
  return "spíš mlčenlivý";
}

/** Táta kluka: jméno z příjmení kluka, křestní jméno pevné podle kluka. */
function parentFor(p: ProspectRow): { name: string; prospectId: string; kid: string } {
  const names = ["Pavel", "Jiří", "Petr", "Martin", "Tomáš", "Jan", "Josef", "Michal", "Roman", "Zdeněk", "Luboš", "Karel"];
  return { name: `${names[p.identity_seed % names.length]} ${p.last_name}`, prospectId: p.id, kid: `${p.first_name} ${p.last_name}` };
}

export async function loadCoachOptions(db: D1Database, teamId: string): Promise<CoachOptions> {
  type Row = { id: string; first_name: string; last_name: string; age: number; personality: string; overall_rating: number; rank: number };
  // Pořadí v kádru podle hodnocení: jestli bere oporu, nebo náhradníka, je to podstatné rozhodnutí
  const players = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.age, p.personality, p.overall_rating,
            (SELECT COUNT(*) FROM players q WHERE q.team_id = p.team_id AND (q.status IS NULL OR q.status = 'active') AND q.overall_rating > p.overall_rating) + 1 AS rank
       FROM players p
      WHERE p.team_id = ? AND p.age >= ? AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(teamId, VOLUNTEER_MIN_AGE).all<Row>()
    .catch((e) => { logger.warn({ module: M, teamId }, "volunteer candidates", e); return { results: [] as Row[] }; });
  const volunteers = players.results
    .map((p) => ({ p, leadership: parseJson<{ leadership?: number }>(p.personality, {}, "personality").leadership ?? 40 }))
    .sort((a, b) => b.leadership - a.leadership)
    .slice(0, 5)
    .map(({ p, leadership }) => ({
      playerId: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age, leadership: leadershipText(leadership),
      rating: p.overall_rating, role: p.rank <= 11 ? "opora áčka" : p.rank <= 16 ? "náhradník" : "mimo sestavu",
    }));
  const kids = await activeProspects(db, teamId);
  // Táta nejmladšího kluka vydrží nejdéle
  const youngest = [...kids].sort((a, b) => a.age - b.age || a.identity_seed - b.identity_seed)[0];
  const staff = await loadStaffYouthCoach(db, teamId);
  return { volunteers, parent: youngest ? parentFor(youngest) : null, staff: staff ? { name: staff.name } : null };
}

/** Kdo povede žáky: dobrovolník z áčka (`playerId`), táta jednoho z kluků, nebo placený trenér mládeže. */
export async function setYouthCoach(db: D1Database, teamId: string, body: unknown): Promise<ServiceResult<{ coach: CoachType }>> {
  const b = (body ?? {}) as { type?: unknown; playerId?: unknown };
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  if (!club.academy_upkeep) return { ok: false, status: 409, error: "Nejdřív založ žáky" };
  const options = await loadCoachOptions(db, teamId);
  if (b.type === "volunteer") {
    if (typeof b.playerId !== "string" || !options.volunteers.some((v) => v.playerId === b.playerId)) {
      return { ok: false, status: 400, error: `Žáky může vést jen hráč áčka od ${VOLUNTEER_MIN_AGE} let` };
    }
    await db.prepare("UPDATE teams SET academy_coach_type = 'volunteer', academy_coach_player_id = ?, academy_coach_name = NULL, academy_coach_prospect_id = NULL WHERE id = ?")
      .bind(b.playerId, teamId).run();
    return { ok: true, coach: "volunteer" };
  }
  if (b.type === "parent") {
    if (!options.parent) return { ok: false, status: 409, error: "Žádný táta to vzít nemůže, nemáš žáky" };
    await db.prepare("UPDATE teams SET academy_coach_type = 'parent', academy_coach_player_id = NULL, academy_coach_name = ?, academy_coach_prospect_id = ? WHERE id = ?")
      .bind(options.parent.name, options.parent.prospectId, teamId).run();
    return { ok: true, coach: "parent" };
  }
  if (b.type === "staff") {
    if (!options.staff) return { ok: false, status: 409, error: "Nemáš trenéra mládeže, najmi ho v Zaměstnancích" };
    await db.prepare("UPDATE teams SET academy_coach_type = 'staff', academy_coach_player_id = NULL, academy_coach_name = NULL, academy_coach_prospect_id = NULL WHERE id = ?")
      .bind(teamId).run();
    return { ok: true, coach: "staff" };
  }
  return { ok: false, status: 400, error: "Neplatný trenér" };
}

/** Id hráče áčka, který dělá trenéra žáků (chodí méně na trénink áčka, daily-tick). */
export async function volunteerCoachId(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT academy_coach_player_id FROM teams WHERE id = ? AND academy_upkeep = 1 AND academy_coach_type = 'volunteer'")
    .bind(teamId).first<{ academy_coach_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "volunteer coach id", e); return null; });
  return row?.academy_coach_player_id ?? null;
}

// ── Týdenní provoz a růst ─────────────────────────────────────────────────────

/** Týdenní uzávěrka: provoz žáků a posun kluků podle kvality přípravy (finance-processor). */
export async function weeklyAcademy(db: D1Database, teamId: string, gameDate: string, opsCostMul: number): Promise<void> {
  const club = await loadClub(db, teamId);
  if (!club || !club.academy_upkeep) return;
  const squad = (await activeProspects(db, teamId)).length;
  const level = academyLevelOf(club.academy_level);
  await recordTransaction(db, teamId, "youth_academy", -Math.round(upkeepWeekly(squad, level) * opsCostMul), `Akademie, ${ACADEMY_LEVELS[level].label.toLowerCase()} (${squad} žáků)`, gameDate);
  if (squad === 0) return;
  const coach = await coachState(db, club, squad);
  if (coach.quality <= 0) return;
  const step = weeklyProgress(coach.quality);
  await db.prepare(
    "UPDATE youth_prospects SET progress_current = progress_current + ?, progress_cap = progress_cap + ? WHERE team_id = ? AND status = 'active'",
  ).bind(step.current, step.cap, teamId).run();
}

// ── Postup do dorostu ─────────────────────────────────────────────────────────

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

/** SMS od trenéra žáků do konverzace „Žáci“. */
export async function academySms(db: D1Database, teamId: string, body: string): Promise<void> {
  try {
    const title = "Žáci";
    let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
      .bind(teamId, title).first<{ id: string }>().then((r) => r?.id ?? null);
    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
      ).bind(convId, teamId, title).run();
    }
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Trenér žáků', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
    ).bind(crypto.randomUUID(), convId, body).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(body.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: M, teamId }, "academy SMS", e);
  }
}

/** Hráč z kluka: společný generátor + náskok z let u žáků. Čistě výpočet. */
async function buildGraduate(db: D1Database, p: ProspectRow, club: ClubRow) {
  const identity = await prospectIdentity(db, p.identity_seed, club, p.position);
  identity.firstName = p.first_name;
  identity.lastName = p.last_name;
  identity.age = p.age;
  // Stejné semínko jako `prospectProfile`: hráč má ty silné stránky, které Akademie ukazovala
  const rng = createRng(p.identity_seed ^ 0x5bd1e995);
  const created = createPlayer(rng, {
    identity, position: p.position as "GK" | "DEF" | "MID" | "FWD", level: levelFromVillageSize(club.size),
    academy: { current: Math.round(p.progress_current), cap: Math.round(p.progress_cap) + p.gem_cap, talent: [0, 0], gemChance: 0 },
    hiddenTalent: p.hidden_talent,
  });
  // Identita vzniká jako pro šestnáctiletého: alkohol přepočítat na skutečný věk žáka
  const personality = {
    ...created.personality,
    patriotism: Math.min(100, created.personality.patriotism + rng.int(10, 20)),
    alcohol: alcoholAfterAging(created.personality.alcohol, IDENTITY_AGE, p.age),
  };
  const weeklyWage = Math.round((10 + (created.rating / 100) * 400) * GRADUATE_WAGE_FACTOR);
  return { created, personality, weeklyWage };
}

/**
 * Nabídka kluka do dorostu v `player_offers`, se stejnými údaji, jaké dostane hráč po přijetí.
 * `forTeamId` je klub, který ho bere (vlastní, nebo klub s dorostem, když vlastní ho nemá).
 */
async function insertProspectOffer(db: D1Database, club: ClubRow, p: ProspectRow, forTeamId: string, message: string, gameDate: string): Promise<string> {
  await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();
  const { created, personality, weeklyWage } = await buildGraduate(db, p, club);
  const expires = new Date(`${day(gameDate)}T12:00:00Z`);
  expires.setUTCDate(expires.getUTCDate() + 6);
  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO player_offers (id, team_id, source, source_name, message, first_name, last_name, nickname, age, position, overall_rating,
       skills, physical, personality, life_context, avatar, weekly_wage, expires_at, nationality, prospect_id)
     VALUES (?, ?, 'youth', 'Trenér žáků', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    offerId, forTeamId, message, p.first_name, p.last_name, p.age, p.position, created.rating,
    JSON.stringify(created.skills), JSON.stringify(created.physical),
    JSON.stringify({ ...personality, hiddenTalent: created.hiddenTalent }),
    JSON.stringify({ ...created.lifeContext, morale: 60, skillsMax: created.skillsMax }),
    JSON.stringify(created.avatar), weeklyWage, expires.toISOString(), created.nationality, p.id,
  ).run();
  return offerId;
}

async function loadProspect(db: D1Database, teamId: string, prospectId: string): Promise<ProspectRow | null> {
  return db.prepare("SELECT * FROM youth_prospects WHERE id = ? AND team_id = ? AND status = 'active'")
    .bind(prospectId, teamId).first<ProspectRow>();
}

/** Bez dorostu nemá kluk kam o kategorii výš: za muže smí až od 15 let (FAČR). */
const NO_U21_ERROR = "Klub nemá dorost (U21) a za muže smí žák až od 15 let. V létě ve čtrnácti půjde do dorostu jiného klubu.";

async function hasU21Team(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "check u21", e); return null; });
  return !!row;
}

/** Trenér žáků doporučí kluka o kategorii výš: SMS a nabídka v Přestupy → Nabídky. */
export async function recommendPlayUp(db: D1Database, teamId: string, prospectId: string, gameDate: string): Promise<ServiceResult<{ offerId: string }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const p = await loadProspect(db, teamId, prospectId);
  if (!p) return { ok: false, status: 404, error: "Žák u žáků není" };
  if (!canPlayUp(p.age)) return { ok: false, status: 409, error: "Do dorostu smí žák až od 13 let" };
  if (!(await hasU21Team(db, teamId))) return { ok: false, status: 409, error: NO_U21_ERROR };
  const coach = await coachState(db, club, MIN_SQUAD);
  const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, coach.judgement);
  const offerId = await insertProspectOffer(db, club, p, teamId, `${p.first_name} ${p.last_name} by mohl hrát o kategorii výš. ${verdictText(estimate)}`, gameDate);
  const rng = createRng(cryptoSeed());
  await db.prepare("UPDATE youth_prospects SET next_offer_on = ? WHERE id = ?").bind(addDays(gameDate, rng.int(REOFFER_DAYS[0], REOFFER_DAYS[1])), p.id).run();
  if (isHuman(club)) {
    const traits = parseJson<string[]>(p.traits, [], "traits");
    await academySms(db, teamId,
      `${p.first_name} ${p.last_name} (${p.age}, ${POSITION_CS[p.position] ?? p.position}${traits.length ? `, ${traits[0]}` : ""}) je na žáky už moc dobrej, dal bych ho do dorostu o kategorii výš. ${verdictText(estimate)} Vzít ho můžeš v Přestupy → Nabídky. Když ne, nechám ho u žáků a v létě postoupí sám.`);
  }
  return { ok: true, offerId };
}

/** Ruční přesun kluka od 13 let do dorostu (stránka Žáci): nabídka a hned její přijetí. */
export async function promoteProspect(db: D1Database, teamId: string, prospectId: string): Promise<ServiceResult<{ playerId: string }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const p = await loadProspect(db, teamId, prospectId);
  if (!p) return { ok: false, status: 404, error: "Žák u žáků není" };
  if (!canPlayUp(p.age)) return { ok: false, status: 409, error: "Do dorostu smí žák až od 13 let" };
  if (!(await hasU21Team(db, teamId))) return { ok: false, status: 409, error: NO_U21_ERROR };
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const offerId = await insertProspectOffer(db, club, p, teamId, `${p.first_name} ${p.last_name} jde do dorostu.`, team?.game_date ?? new Date().toISOString());
  const { acceptPlayerOffer } = await import("../services/player-offer-actions");
  const res = await acceptPlayerOffer(db, teamId, offerId);
  if (!res.ok) return res;
  return { ok: true, playerId: res.playerId };
}

/** Přijetí nabídky kluka: datum odchodu od žáků. Status zabírá atomicky `acceptPlayerOffer`. */
export async function markProspectPromoted(db: D1Database, prospectId: string, playerId: string, gameDate: string): Promise<void> {
  await db.prepare("UPDATE youth_prospects SET left_at = ? WHERE id = ? AND player_id = ?").bind(day(gameDate), prospectId, playerId).run();
}

type U21ClubRow = { id: string; name: string; user_id: string | null; lat: number; lng: number; level: string | null };

/** Nejbližší klub okresu s dorostem (U21), kam jdou čtrnáctiletí z klubu bez dorostu. */
async function nearestClubWithU21(db: D1Database, club: ClubRow): Promise<U21ClubRow | null> {
  const res = await db.prepare(
    `SELECT t.id, t.name, t.user_id, v.lat, v.lng, l.level FROM teams t
       JOIN villages v ON v.id = t.village_id LEFT JOIN leagues l ON l.id = t.league_id
      WHERE v.district = ? AND t.parent_team_id IS NULL AND t.id != ? AND t.name NOT LIKE 'DELETED%'
        AND EXISTS (SELECT 1 FROM teams u WHERE u.parent_team_id = t.id AND u.team_type = 'u21')`,
  ).bind(club.district, club.id).all<U21ClubRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "clubs with u21", e); return { results: [] as U21ClubRow[] }; });
  const sorted = res.results.filter((r) => r.lat !== null).sort((a, b) => distanceKm(club, a) - distanceKm(club, b));
  // Propojené kluby (stejný majitel) by si odstupné jen přelévaly
  const { areClubsLinked } = await import("../competition/club-links");
  for (const candidate of sorted) {
    if (!(await areClubsLinked(db, club.id, candidate.id))) return candidate;
  }
  return null;
}

/**
 * Letní postup čtrnáctiletého: do dorostu vlastního klubu, nebo, když klub dorost nemá, do
 * nejbližšího klubu s dorostem za tabulkové odstupné (Přestupní řád FAČR, § 23).
 */
async function graduate(db: D1Database, club: ClubRow, p: ProspectRow, gameDate: string, hasU21: boolean): Promise<{ ok: boolean; to: string | null; fee: number }> {
  const { acceptPlayerOffer } = await import("../services/player-offer-actions");
  if (hasU21) {
    const offerId = await insertProspectOffer(db, club, p, club.id, `${p.first_name} ${p.last_name} postupuje do dorostu.`, gameDate);
    const res = await acceptPlayerOffer(db, club.id, offerId);
    return { ok: res.ok, to: null, fee: 0 };
  }
  const target = await nearestClubWithU21(db, club);
  if (!target) {
    await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE id = ? AND status = 'active'").bind(day(gameDate), p.id).run();
    return { ok: false, to: null, fee: 0 };
  }
  // Soused ho nemusí vzít: dostane nabídku a odstupné zaplatí, až když ji přijme
  // (acceptPlayerOffer → chargeYouthTransferFee). Kluk mezitím u žáků už není.
  await insertProspectOffer(db, club, p, target.id, `${p.first_name} ${p.last_name} (${p.age}) z ${club.village_name}, kde nemají dorost, by chtěl k vám. Když ho vezmeš, zaplatíš jejich klubu odstupné ${youthTransferFee(target.level).toLocaleString("cs")} Kč.`, gameDate);
  await db.prepare("UPDATE youth_prospects SET status = 'leaving', next_offer_on = NULL WHERE id = ? AND status = 'active'").bind(p.id).run();
  if (isHuman({ user_id: target.user_id })) {
    await academySms(db, target.id, `${club.village_name} nemá dorost a ${p.first_name} ${p.last_name} (${p.age}) by chtěl hrát u vás. Nabídku najdeš v Přestupy → Nabídky, odstupné ${youthTransferFee(target.level).toLocaleString("cs")} Kč by šlo jejich klubu.`);
  }
  return { ok: true, to: target.name, fee: youthTransferFee(target.level) };
}

/**
 * Odstupné za kluka, kterého si vzal klub s dorostem od klubu, kde dorost nemají
 * (Přestupní řád FAČR, § 23). Volá `acceptPlayerOffer`, platí se jen při přijetí.
 */
export async function chargeYouthTransferFee(db: D1Database, fromTeamId: string, toTeamId: string, playerName: string, gameDate: string): Promise<number> {
  const row = await db.prepare("SELECT t.name, l.level FROM teams t LEFT JOIN leagues l ON l.id = t.league_id WHERE t.id = ?")
    .bind(toTeamId).first<{ name: string; level: string | null }>();
  const from = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(fromTeamId).first<{ name: string }>();
  const fee = youthTransferFee(row?.level);
  await recordTransaction(db, fromTeamId, "transfer_income", fee, `Odstupné za odchovance: ${playerName} (${row?.name ?? "jiný klub"})`, gameDate);
  await recordTransaction(db, toTeamId, "transfer_fee", -fee, `Odstupné za dorostence: ${playerName} (${from?.name ?? "jiný klub"})`, gameDate);
  return fee;
}

interface AdvanceContext {
  coach: CoachState;
  /** Změna roční šance na odchod podle úrovně akademie. */
  levelQuit: number;
  playsCompetition: boolean;
  vanLevel: number;
  hasU21: boolean;
  seasonNumber: number;
}

type AdvanceResult = { kind: "promoted" | "transferred" | "quit" | "aged" | "failed"; name: string; to?: string | null; fee?: number };

/**
 * Konec sezóny pro jednoho kluka: čtrnáctiletý postoupí do dorostu (nebo jde nabídkou do klubu
 * s dorostem), mladší buď skončí, nebo zestárne o rok. Zapíše `aged_season`, ať ho stejný konec
 * sezóny nezpracuje podruhé (přetažený kluk, souběh klubů v kurzoru).
 */
async function advanceProspect(db: D1Database, rng: Rng, club: ClubRow, p: ProspectRow, ctx: AdvanceContext, gameDate: string): Promise<AdvanceResult> {
  const name = `${p.first_name} ${p.last_name}`;
  const claim = await db.prepare("UPDATE youth_prospects SET aged_season = ? WHERE id = ? AND status = 'active' AND (aged_season IS NULL OR aged_season < ?)")
    .bind(ctx.seasonNumber, p.id, ctx.seasonNumber).run();
  if (claim.meta.changes === 0) return { kind: "failed", name };
  // Nabídka z minulé sezóny má staré údaje (věk, dovednosti): propadá
  await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();

  if (p.age >= OLDEST_AGE) {
    const res = await graduate(db, club, p, gameDate, ctx.hasU21)
      .catch((e) => { logger.warn({ module: M, teamId: club.id }, "graduate", e); return { ok: false, to: null, fee: 0 }; });
    if (res.ok) return res.fee > 0 ? { kind: "transferred", name, to: res.to, fee: res.fee } : { kind: "promoted", name };
    // Postup selhal: kluk nesmí zůstat viset ve čtrnácti, končí
    logger.warn({ module: M, teamId: club.id, prospectId: p.id }, "postup do dorostu selhal, kluk končí");
    await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE id = ? AND status = 'active'").bind(day(gameDate), p.id).run();
    return { kind: "quit", name };
  }
  if (rng.random() < quitChance(p.commitment, ctx.playsCompetition, ctx.coach.type !== null, ctx.vanLevel, ctx.levelQuit)) {
    const res = await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE id = ? AND status = 'active'").bind(day(gameDate), p.id).run();
    return res.meta.changes ? { kind: "quit", name } : { kind: "failed", name };
  }
  const age = p.age + 1;
  const talent = age === 13 ? Math.max(0, Math.min(100, p.hidden_talent + talentShiftAt13(rng))) : p.hidden_talent;
  const commitment = Math.max(10, Math.min(95, p.commitment + rng.int(-12, 10)));
  const next = ctx.hasU21 ? playUpDay(rng, { age, hidden_talent: talent, estimate_offset: p.estimate_offset }, ctx.coach.judgement, gameDate, FALLBACK_SEASON_DAYS) : null;
  await db.prepare("UPDATE youth_prospects SET age = ?, hidden_talent = ?, commitment = ?, next_offer_on = ? WHERE id = ? AND status = 'active'")
    .bind(age, talent, commitment, next, p.id).run();
  return { kind: "aged", name };
}

/**
 * Konec sezóny (fáze `academy`, před letním stárnutím hráčů): čtrnáctiletí postoupí do dorostu,
 * někdo skončí, ostatní zestárnou o rok, přijde nový ročník jedenáctiletých. Táta, jehož kluk
 * u žáků skončil, s ním odchází jako trenér. Lidský klub dostane jednu SMS se souhrnem.
 */
export async function seasonEndAcademy(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<void> {
  const club = await loadClub(db, teamId);
  if (!club) return;
  // Letní přestupy přetahovaných kluků dřív, než kluci zestárnou a postoupí
  const { poached, lost } = await resolvePoaches(db, club, gameDate)
    .catch((e) => { logger.warn({ module: M, teamId }, "resolve poaches", e); return { poached: [] as string[], lost: [] as string[] }; });
  const prospects = await activeProspects(db, teamId);
  const coach = await coachState(db, club, prospects.length);
  const playsCompetition = prospects.length >= MIN_SQUAD;
  const vanLevel = (await loadYouthEquipment(db, teamId)).team_van;
  const u21 = await db.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "check u21", e); return null; });

  const seasonNumber = await currentSeasonNumber(db);
  const ctx: AdvanceContext = {
    coach, playsCompetition, vanLevel, hasU21: !!u21, seasonNumber,
    levelQuit: ACADEMY_LEVELS[academyLevelOf(club.academy_level)].quit + (coach.type === "volunteer" ? VOLUNTEER_QUIT_BONUS : 0),
  };
  const promoted: string[] = [];
  const transferred: string[] = [];
  let feeTotal = 0;
  const quit: string[] = [];
  for (const p of prospects) {
    // Kluk, který už letos zestárl (přetažený z klubu zpracovaného dřív), se nezpracuje znovu
    if (p.aged_season !== null && p.aged_season >= seasonNumber) continue;
    const res = await advanceProspect(db, rng, club, p, ctx, gameDate)
      .catch((e) => { logger.warn({ module: M, teamId }, "advance prospect", e); return { kind: "failed" as const, name: "" }; });
    if (res.kind === "transferred") { transferred.push(`${res.name} (${res.to})`); feeTotal += res.fee ?? 0; }
    else if (res.kind === "promoted") promoted.push(res.name);
    else if (res.kind === "quit") quit.push(res.name);
  }

  // Táta trénoval kvůli svému klukovi: když kluk u žáků skončil, končí i on
  let coachLeft: string | null = null;
  if (club.academy_coach_type === "parent" && club.academy_coach_prospect_id) {
    const kid = await db.prepare("SELECT status, team_id FROM youth_prospects WHERE id = ?").bind(club.academy_coach_prospect_id).first<{ status: string; team_id: string }>();
    // Kluk skončil, postoupil, nebo ho přetáhli jinam: táta s ním
    if (kid?.status !== "active" || kid.team_id !== teamId) {
      coachLeft = club.academy_coach_name;
      await db.prepare("UPDATE teams SET academy_coach_type = NULL, academy_coach_name = NULL, academy_coach_prospect_id = NULL WHERE id = ?").bind(teamId).run();
    }
  }

  // Trenérovi je o rok víc: syn mohl dorůst do věku žáků (dřív než noví, ať se vejde)
  if (club.academy_upkeep) {
    await ensureCoachSon(db, rng, teamId, gameDate, seasonNumber)
      .catch((e) => logger.warn({ module: M, teamId }, "coach son at season end", e));
  }

  const newKids: string[] = [];
  const neighborKids: string[] = [];
  if (club.academy_upkeep) {
    const kids = Math.min(MAX_SQUAD - (await activeProspects(db, teamId)).length, rollKids(rng, expectedKidsPerYear(club.population ?? 0)));
    for (let i = 0; i < kids; i++) {
      const p = await createProspect(db, rng, club, YOUNGEST_AGE, gameDate, null, undefined, seasonNumber)
        .catch((e) => { logger.warn({ module: M, teamId }, "new prospect", e); return null; });
      if (p) newKids.push(`${p.first_name} ${p.last_name}`);
    }
    // Kluci z okolních obcí, které vlastní akademii nemají, chodí do té nejbližší
    let room = Math.min(NEIGHBOR_MAX_PER_YEAR, MAX_SQUAD - (await activeProspects(db, teamId)).length);
    for (const v of await neighborVillages(db, club)) {
      const n = Math.min(room, rollKids(rng, v.expected));
      room -= n;
      for (let i = 0; i < n; i++) {
        const p = await createProspect(db, rng, club, YOUNGEST_AGE, gameDate, null, v.id, seasonNumber)
          .catch((e) => { logger.warn({ module: M, teamId }, "neighbor prospect", e); return null; });
        if (p) neighborKids.push(`${p.first_name} ${p.last_name} (${v.name})`);
      }
    }
  }

  if (!isHuman(club)) return;
  const parts: string[] = [];
  if (promoted.length) parts.push(`Do dorostu postoupili: ${promoted.join(", ")}.`);
  if (transferred.length) parts.push(`Dorost nemáme, tak chtějí jinam: ${transferred.join(", ")}. Když je tam vezmou, dostaneme odstupné, celkem až ${feeTotal.toLocaleString("cs")} Kč.`);
  if (quit.length) parts.push(`Skončili: ${quit.join(", ")}.`);
  if (newKids.length) parts.push(`Noví jedenáctiletí: ${newKids.join(", ")}.`);
  else if (club.academy_upkeep) parts.push("Nových žáků z obce letos nepřišlo.");
  if (neighborKids.length) parts.push(`Z okolních obcí bez akademie přišli: ${neighborKids.join(", ")}.`);
  if (poached.length) parts.push(`Přetáhli jsme: ${poached.join(", ")}.`);
  if (lost.length) parts.push(`Jinam přešli: ${lost.join(", ")}.`);
  if (coachLeft) parts.push(`${coachLeft} končí, jeho syn už u žáků není. Žáci potřebují nového trenéra.`);
  if (parts.length) await academySms(db, teamId, `Konec sezóny u žáků. ${parts.join(" ")}`);
}

/** Denní tick: trenér doporučí kluka o kategorii výš, jehož den přišel (nejvýš jednoho denně). */
export async function dailyAcademy(db: D1Database, teamId: string, gameDate: string): Promise<{ offered: number }> {
  // Čtrnáctiletý z klubu bez dorostu, kterého soused nevzal (odmítl, nabídka propadla): končí
  await db.prepare(
    `UPDATE youth_prospects SET status = 'quit', left_at = ?
      WHERE team_id = ? AND status = 'leaving'
        AND NOT EXISTS (SELECT 1 FROM player_offers o WHERE o.prospect_id = youth_prospects.id AND o.status = 'pending')`,
  ).bind(day(gameDate), teamId).run()
    .catch((e) => logger.warn({ module: M, teamId }, "leaving prospects sweep", e));
  const due = await db.prepare(
    `SELECT p.id FROM youth_prospects p JOIN teams t ON t.id = p.team_id
      WHERE p.team_id = ? AND t.academy_upkeep = 1 AND t.academy_coach_type IS NOT NULL AND p.status = 'active'
        AND EXISTS (SELECT 1 FROM teams u WHERE u.parent_team_id = t.id AND u.team_type = 'u21')
        AND p.next_offer_on IS NOT NULL AND p.next_offer_on <= ?
        AND NOT EXISTS (SELECT 1 FROM player_offers o WHERE o.prospect_id = p.id AND o.status = 'pending')
      ORDER BY p.next_offer_on LIMIT 1`,
  ).bind(teamId, day(gameDate)).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "due prospects", e); return null; });
  if (!due) return { offered: 0 };
  const res = await recommendPlayUp(db, teamId, due.id, gameDate);
  if (!res.ok) {
    // Ať se fronta nezasekne na jednom klukovi: další pokus za týden
    logger.warn({ module: M, teamId, prospectId: due.id }, `doporučení o kategorii výš selhalo: ${res.error}`);
    await db.prepare("UPDATE youth_prospects SET next_offer_on = ? WHERE id = ?").bind(addDays(gameDate, 7), due.id).run();
  }
  return { offered: res.ok ? 1 : 0 };
}

// ── Pohled pro stránku Žáci ───────────────────────────────────────────────────

export async function loadAcademyView(db: D1Database, teamId: string) {
  const club = await loadClub(db, teamId);
  if (!club) return null;
  const prospects = await activeProspects(db, teamId);
  const coach = await coachState(db, club, prospects.length);
  const options = club.academy_upkeep ? await loadCoachOptions(db, teamId) : null;
  const pending = await db.prepare("SELECT prospect_id FROM player_offers WHERE team_id = ? AND status = 'pending' AND prospect_id IS NOT NULL")
    .bind(teamId).all<{ prospect_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "pending academy offers", e); return { results: [] as { prospect_id: string }[] }; });
  const offered = new Set(pending.results.map((r) => r.prospect_id));
  const u21 = await db.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "check u21", e); return null; });
  const equipment = await loadYouthEquipment(db, teamId);
  const staffMarket = club.academy_upkeep && coach.type !== "staff" ? await youthCoachMarket(db, club) : [];
  const profiles = new Map<string, { strengths: string[]; weakness: string | null; avatar: Record<string, unknown> | null }>();
  for (const p of prospects) profiles.set(p.id, await prospectProfile(db, p, club));

  const seasonNumber = await currentSeasonNumber(db);
  const recruitDayUsed = (await db.prepare("SELECT academy_recruit_day_season AS s FROM teams WHERE id = ?").bind(teamId).first<{ s: number | null }>())?.s === seasonNumber;
  const poach = club.academy_upkeep ? await poachView(db, club, coach, seasonNumber) : null;

  const foundedSeason = (await db.prepare("SELECT academy_founded_season AS s FROM teams WHERE id = ?").bind(teamId).first<{ s: number | null }>())?.s ?? null;
  // Okolní obce dají žáky i hned při založení, takže je odhad musí znát předem
  const neighborList = await neighborVillages(db, club.academy_upkeep ? club : { ...club, academy_upkeep: 1, academy_level: "standard" });
  const neighborPerYear = Math.min(NEIGHBOR_MAX_PER_YEAR, neighborList.reduce((n, v) => n + v.expected, 0));
  const ownPerYear = expectedKidsPerYear(club.population ?? 0);
  const budget = (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "academy budget", e); return null; }))?.budget ?? 0;
  const weeklyCost = upkeepWeekly(prospects.length, academyLevelOf(club.academy_level));
  const weeklyTotal = club.academy_upkeep
    ? weeklyCost + (coach.type === "staff" ? coach.weeklyWage : 0)
    : upkeepWeekly(Math.round((ownPerYear + neighborPerYear) * 4), "standard");
  return {
    founded: !!club.academy_upkeep,
    /** Založit jde jednou za sezónu: po zrušení až příští sezónu. */
    canFound: !club.academy_upkeep && (foundedSeason === null || foundedSeason < seasonNumber),
    potentialScale: POTENTIAL_SCALE,
    recruitDay: {
      available: !!club.academy_upkeep && !!coach.type && !recruitDayUsed,
      used: recruitDayUsed,
      cost: RECRUIT_DAY_COST,
      expected: Math.round(recruitDayExpectedFor(club, coach) * 10) / 10,
    },
    neighborMax: NEIGHBOR_MAX_PER_YEAR,
    neighbors: neighborList.map((v) => ({ name: v.name, km: v.km, expected: Math.round(v.expected * 10) / 10 })),
    /** Kolik žáků za rok přijde z okolních obcí bez akademie (nejvýš NEIGHBOR_MAX_PER_YEAR). */
    neighborPerYear: Math.round(neighborPerYear * 10) / 10,
    /** Rozpočet nevystačí na sezónu akademie: stránka varuje dřív, než klub zadluží. */
    budgetWarning: budget < weeklyTotal * WEEKS_PER_SEASON
      ? { budget, seasonCost: weeklyTotal * WEEKS_PER_SEASON, weeks: Math.max(0, Math.floor(budget / Math.max(1, weeklyTotal))) }
      : null,
    poach,
    equipment: YOUTH_EQUIPMENT.map((e) => ({ ...e, level: equipment[e.key] ?? 0 })),
    staffMarket,
    village: club.village_name,
    /** Kolik kluků obec dá na ročník, slovy počítá UI. */
    expectedPerYear: Math.round(expectedKidsPerYear(club.population ?? 0) * 10) / 10,
    weeklyCost,
    level: academyLevelOf(club.academy_level),
    levels: (Object.keys(ACADEMY_LEVELS) as AcademyLevel[]).map((k) => ({
      key: k, label: ACADEMY_LEVELS[k].label, text: ACADEMY_LEVELS[k].text,
      base: ACADEMY_LEVELS[k].base, perKid: ACADEMY_LEVELS[k].perKid, weekly: upkeepWeekly(prospects.length, k),
    })),
    upkeepBase: UPKEEP_BASE,
    upkeepPerKid: UPKEEP_PER_KID,
    minSquad: MIN_SQUAD,
    playsCompetition: prospects.length >= MIN_SQUAD,
    hasU21: !!u21,
    coach: {
      type: coach.type, name: coach.name, quality: qualityText(coach.quality, coach.type),
      playerId: coach.type === "volunteer" ? club.academy_coach_player_id : null,
      /** Plat placeného trenéra mládeže: platí se zvlášť jako zaměstnanec, ne z provozu akademie. */
      weeklyWage: coach.weeklyWage,
    },
    coachOptions: options,
    nextSummer: prospects.filter((p) => p.age >= OLDEST_AGE).length,
    prospects: prospects.map((p) => {
      const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, coach.judgement);
      const range = estimateRange(estimate, p.age, coach.judgement);
      const profile = profiles.get(p.id);
      return {
        id: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age,
        position: p.position,
        /** Syn trenéra klubu. */
        coachSon: !!p.coach_son,
        /** U mladších žáků se pozice teprve hledá. */
        positionSure: positionVisible(p.age),
        /** Dětský obličej (facesjs), pevný pro kluka. */
        avatar: profile?.avatar ?? null,
        strengths: coach.type ? profile?.strengths ?? [] : [],
        weakness: coach.type ? profile?.weakness ?? null : null,
        /** Trenérův odhad potenciálu 0–100 (v UI jen pás na slovní stupnici). Null bez trenéra. */
        potential: coach.type ? { estimate, low: range.low, high: range.high } : null,
        traits: parseJson<string[]>(p.traits, [], "traits"),
        verdict: coach.type ? verdictText(estimate) : null,
        /** Trenér ho bere jako nadějného (doporučil by ho o kategorii výš). */
        promising: !!coach.type && estimate >= PLAY_UP_ESTIMATE,
        mood: commitmentText(p.commitment),
        /** O kategorii výš jen do vlastního dorostu: za muže smí kluk až od 15 let. */
        canPlayUp: canPlayUp(p.age) && !!u21,
        offered: offered.has(p.id),
      };
    }),
  };
}

/**
 * Silné a slabé stránky kluka: dovednosti, jaké by měl jako hráč (stejný generátor, pevné
 * semínko kluka, ať se mezi načteními nemění).
 */
async function prospectProfile(db: D1Database, p: ProspectRow, club: ClubRow): Promise<{ strengths: string[]; weakness: string | null; avatar: Record<string, unknown> | null }> {
  try {
    const identity = await prospectIdentity(db, p.identity_seed, club, p.position);
    identity.age = p.age;
    const created = createPlayer(createRng(p.identity_seed ^ 0x5bd1e995), {
      identity, position: p.position as "GK" | "DEF" | "MID" | "FWD", level: levelFromVillageSize(club.size),
      academy: { current: Math.round(p.progress_current), cap: Math.round(p.progress_cap) + p.gem_cap, talent: [0, 0], gemChance: 0 },
      hiddenTalent: p.hidden_talent,
    });
    const { generatePlayerFace } = await import("../routes/teams");
    // Obličej podle věku: stejné semínko, takže kluk vypadá pořád stejně, jen v létě o rok starší
    const faceRng = createRng(p.identity_seed ^ 0x2c1b3c6d);
    const avatar = generatePlayerFace({ age: p.age, bodyType: identity.bodyType, ethnicity: identity.ethnicity }, () => faceRng.random());
    return { ...strengthsOf(p.position, created.skills), avatar };
  } catch (e) {
    logger.warn({ module: M, teamId: club.id }, "prospect profile", e);
    return { strengths: [], weakness: null, avatar: null };
  }
}

/** Volní trenéři mládeže z okresu, nejlepší v roli napřed (najímá se přes staff/hire). */
async function youthCoachMarket(db: D1Database, club: ClubRow) {
  type Row = StaffEffectRow & { id: string; first_name: string; last_name: string; age: number; weekly_wage: number; signing_fee: number; description: string | null };
  const res = await db.prepare(
    `SELECT id, role, coaching, medicine, maintenance, judgement, communication, work_rate, charm, first_name, last_name, age, weekly_wage, signing_fee, description
       FROM staff_members WHERE district = ? AND team_id IS NULL`,
  ).bind(club.district).all<Row>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "youth coach market", e); return { results: [] as Row[] }; });
  // Stejná podmínka licence jako při najímání (services/staff-hire.ts): kdo by pod trenérem
  // bez papírů nešel, se ukáže s důvodem, ne až chybou po kliknutí.
  const { requiredLicence, loadCoachLicence } = await import("../services/staff-hire");
  const { licenceLabel } = await import("@okresni-masina/shared");
  const licence = await loadCoachLicence(db, club.id);
  return res.results
    .map((r) => ({ r, eff: rowEffectiveness(r, "trener_mladeze") }))
    .sort((a, b) => b.eff - a.eff)
    .slice(0, 5)
    .map(({ r, eff }) => {
      const needed = requiredLicence(r);
      return {
        id: r.id, name: `${r.first_name} ${r.last_name}`, age: r.age, quality: staffQualityText(eff),
        weeklyWage: r.weekly_wage, signingFee: r.signing_fee, description: r.description ?? "",
        /** Proč ho najmout nejde (licence trenéra), null = jde. */
        blockedReason: needed > 0 && licence < needed ? `Chce trenéra s licencí ${licenceLabel(needed)} nebo vyšší.` : null,
      };
    });
}

// ── Úroveň akademie a syn trenéra ─────────────────────────────────────────────

/** Kolik klub do akademie dává: skromná, běžná, ambiciózní (platí od příští týdenní uzávěrky). */
export async function setAcademyLevel(db: D1Database, teamId: string, level: unknown): Promise<ServiceResult<{ level: AcademyLevel }>> {
  if (level !== "modest" && level !== "standard" && level !== "ambitious") return { ok: false, status: 400, error: "Neplatná úroveň akademie" };
  const res = await db.prepare("UPDATE teams SET academy_level = ? WHERE id = ? AND academy_upkeep = 1").bind(level, teamId).run();
  if (res.meta.changes === 0) return { ok: false, status: 409, error: "Nejdřív založ akademii" };
  return { ok: true, level };
}

/**
 * Trenérův syn přijde do akademie, až mu bude 11 (nebo hned při založení, je-li mu 11–14),
 * a jen jednou. Má příjmení po tátovi, velkou chuť hrát a nikdo ho nepřetáhne.
 */
export async function ensureCoachSon(db: D1Database, rng: Rng, teamId: string, gameDate: string, agedSeason: number | null = null): Promise<string | null> {
  const club = await loadClub(db, teamId);
  if (!club || !club.academy_upkeep) return null;
  const manager = await db.prepare("SELECT id, name, age FROM managers WHERE team_id = ? LIMIT 1").bind(teamId).first<{ id: string; name: string; age: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load manager for son", e); return null; });
  if (!manager?.age) return null;
  const age = coachSonAge(manager.id, manager.age);
  if (age === null || age < YOUNGEST_AGE || age > OLDEST_AGE) return null;
  const had = await db.prepare("SELECT 1 AS ok FROM youth_prospects WHERE team_id = ? AND coach_son = 1").bind(teamId).first<{ ok: number }>();
  if (had) return null;
  const surname = manager.name.trim().split(/\s+/).pop() ?? manager.name;
  const p = await createProspect(db, rng, club, age, gameDate, null, undefined, agedSeason);
  await db.prepare("UPDATE youth_prospects SET last_name = ?, commitment = 95, coach_son = 1 WHERE id = ?").bind(surname, p.id).run();
  const name = `${p.first_name} ${surname}`;
  if (isHuman(club)) await academySms(db, teamId, `Tvůj syn ${name} (${age}) začal chodit na žáky. Doma o ničem jiném nemluví.`);
  logger.info({ module: M, teamId }, `syn trenéra v akademii: ${name} (${age})`);
  return name;
}

// ── Nábor a kluci z okolí ─────────────────────────────────────────────────────

async function currentSeasonNumber(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "active season", e); return null; });
  return row?.number ?? 0;
}

/** Kolik žáků přivede náborový den: hráč áčka přitáhne víc dětí, táta zná rodiče (žák navíc). */
function recruitDayExpectedFor(club: ClubRow, coach: CoachState): number {
  const base = recruitDayExpected(club.population ?? 0, coach.quality) * (coach.type === "volunteer" ? VOLUNTEER_ATTRACT : 1);
  return base + (coach.type === "parent" ? PARENT_RECRUIT_EXTRA : 0);
}

function recruitDayKids(rng: Rng, club: ClubRow, coach: CoachState): number {
  return rollKids(rng, recruitDayExpectedFor(club, coach));
}

/** Vede žáky placený trenér mládeže? Pak má dorost (U21) a mladí v áčku jen poloviční bonus. */
export async function staffSplitFactor(db: D1Database, clubId: string): Promise<number> {
  const row = await db.prepare("SELECT 1 AS ok FROM teams WHERE id = ? AND academy_upkeep = 1 AND academy_coach_type = 'staff'").bind(clubId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: clubId }, "staff split", e); return null; });
  return row ? STAFF_SPLIT_U21_FACTOR : 1;
}

/**
 * Náborový den ve škole: jednou za sezónu, s trenérem, za `RECRUIT_DAY_COST`. Přijdou kluci
 * 11–12 let z vlastní obce, kolik podle velikosti obce a trenéra.
 */
export async function recruitDay(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<ServiceResult<{ names: string[] }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  if (!club.academy_upkeep) return { ok: false, status: 409, error: "Nejdřív založ akademii" };
  const squad = (await activeProspects(db, teamId)).length;
  const coach = await coachState(db, club, squad);
  if (!coach.type) return { ok: false, status: 409, error: "Nábor potřebuje trenéra žáků" };
  if (squad >= MAX_SQUAD) return { ok: false, status: 409, error: `Máš ${MAX_SQUAD} žáků, víc jich akademie neuživí` };
  const seasonNumber = await currentSeasonNumber(db);
  const claim = await db.prepare(
    "UPDATE teams SET academy_recruit_day_season = ? WHERE id = ? AND (academy_recruit_day_season IS NULL OR academy_recruit_day_season < ?)",
  ).bind(seasonNumber, teamId, seasonNumber).run();
  if (claim.meta.changes === 0) return { ok: false, status: 409, error: "Náborový den už letos byl, další až příští sezónu" };
  await recordTransaction(db, teamId, "youth_academy", -RECRUIT_DAY_COST, "Náborový den žáků ve škole", gameDate);
  const kids = Math.min(MAX_SQUAD - squad, recruitDayKids(rng, club, coach));
  const names: string[] = [];
  for (let i = 0; i < kids; i++) {
    const p = await createProspect(db, rng, club, rng.int(11, 12), gameDate, null);
    names.push(`${p.first_name} ${p.last_name} (${p.age})`);
  }
  if (isHuman(club)) {
    await academySms(db, teamId, names.length
      ? `Náborový den ve škole se povedl, přišli noví žáci: ${names.join(", ")}.`
      : "Na náborový den ve škole přišlo pár dětí, ale nikdo se nakonec nepřihlásil. Zkusíme to příští sezónu.");
  }
  return { ok: true, names };
}

type NeighborRow = { id: string; name: string; population: number; lat: number; lng: number };

/**
 * Obce do `NEIGHBOR_RADIUS_KM`, kde žádný klub nemá akademii: jejich kluci chodí do akademie
 * v okolí a dělí se mezi akademie, které mají blízko.
 */
async function neighborVillages(db: D1Database, club: ClubRow): Promise<{ id: string; name: string; km: number; expected: number }[]> {
  const dLat = NEIGHBOR_RADIUS_KM / 111.2;
  const dLng = NEIGHBOR_RADIUS_KM / 71.5;
  const res = await db.prepare(
    `SELECT v.id, v.name, v.population, v.lat, v.lng FROM villages v
      WHERE v.district = ? AND v.id != ? AND v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.village_id = v.id AND t.academy_upkeep = 1)`,
  ).bind(club.district, club.village_id, club.lat - dLat, club.lat + dLat, club.lng - dLng, club.lng + dLng).all<NeighborRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "neighbor villages", e); return { results: [] as NeighborRow[] }; });
  const near = res.results.map((v) => ({ v, km: distanceKm(club, v) })).filter((x) => x.km <= NEIGHBOR_RADIUS_KM);
  if (near.length === 0) return [];
  type AcademyRow = { lat: number; lng: number };
  const academies = (await db.prepare(
    `SELECT v.lat, v.lng FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE v.district = ? AND t.academy_upkeep = 1 AND t.parent_team_id IS NULL`,
  ).bind(club.district).all<AcademyRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "academies around", e); return { results: [] as AcademyRow[] }; })).results;
  return near
    .map(({ v, km }) => {
      const around = academies.filter((a) => a.lat !== null && distanceKm(a, v) <= NEIGHBOR_RADIUS_KM).length;
      const attract = ACADEMY_LEVELS[academyLevelOf(club.academy_level)].attract * (club.academy_coach_type === "volunteer" ? VOLUNTEER_ATTRACT : 1);
      return { id: v.id, name: v.name, km: Math.round(km * 10) / 10, expected: neighborKidsExpected(v.population ?? 0, Math.max(1, around)) * attract };
    })
    .filter((v) => v.expected >= 0.05)
    .sort((a, b) => b.expected - a.expected);
}

// ── Přetahování nadějných žáků ────────────────────────────────────────────────

type PoachRow = { id: string; prospect_id: string; from_team_id: string; to_team_id: string; season_number: number; interest: number; actions: string; status: string };
type OtherClubRow = { id: string; name: string; user_id: string | null; lat: number; lng: number; level: string | null };

async function clubLeagueLevel(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT l.level FROM teams t LEFT JOIN leagues l ON l.id = t.league_id WHERE t.id = ?").bind(teamId).first<{ level: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "league level", e); return null; });
  return row?.level ?? null;
}

/** Kluk, kterého někdo letos nebo loni přetáhl, se rok přetahovat nedá. */
async function recentlyPoached(db: D1Database, prospectId: string, seasonNumber: number): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM youth_poach WHERE prospect_id = ? AND status = 'done' AND season_number >= ?")
    .bind(prospectId, seasonNumber - 1).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M }, "recently poached", e); return null; });
  return !!row;
}

/** Výchozí zájem kluka z cizího klubu o klub, který ho láká. */
async function baseInterestFor(db: D1Database, p: ProspectRow, from: ClubRow, to: ClubRow): Promise<number> {
  const fromKids = (await activeProspects(db, from.id)).length;
  const toKids = (await activeProspects(db, to.id)).length;
  const bonus = ACADEMY_LEVELS[academyLevelOf(to.academy_level)].poachBonus;
  return Math.max(0, Math.min(100, bonus + poachBaseInterest({
    fromHasU21: await hasU21Team(db, from.id),
    fromLeague: await clubLeagueLevel(db, from.id),
    toLeague: await clubLeagueLevel(db, to.id),
    fromQuality: (await coachState(db, from, fromKids)).quality,
    toQuality: (await coachState(db, to, toKids)).quality,
    distanceKm: distanceKm(from, to),
    commitment: p.commitment,
  })));
}

async function poachView(db: D1Database, club: ClubRow, coach: CoachState, seasonNumber: number) {
  type TargetRow = ProspectRow & { club_name: string; c_lat: number; c_lng: number };
  const dLat = POACH_RADIUS_KM / 111.2;
  const dLng = POACH_RADIUS_KM / 71.5;
  const rows = (await db.prepare(
    `SELECT p.*, t.name AS club_name, v.lat AS c_lat, v.lng AS c_lng FROM youth_prospects p
       JOIN teams t ON t.id = p.team_id JOIN villages v ON v.id = t.village_id
      WHERE p.status = 'active' AND p.team_id != ? AND v.district = ? AND p.coach_son = 0
        AND v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?`,
  ).bind(club.id, club.district, club.lat - dLat, club.lat + dLat, club.lng - dLng, club.lng + dLng).all<TargetRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "poach targets", e); return { results: [] as TargetRow[] }; })).results;
  const mine = (await db.prepare("SELECT * FROM youth_poach WHERE to_team_id = ? AND season_number = ? AND status = 'active'")
    .bind(club.id, seasonNumber).all<PoachRow>()).results;
  const mineByProspect = new Map(mine.map((m) => [m.prospect_id, m]));

  // Trenér ví o klucích z okolí jen přibližně: odhad s jeho šumem, ukazuje se jen slovy
  const targets = rows
    .filter((r) => distanceKm(club, { lat: r.c_lat, lng: r.c_lng }) <= POACH_RADIUS_KM)
    .map((r) => ({ r, estimate: estimatedTalent(r.hidden_talent, r.age, r.estimate_offset, coach.judgement) }))
    .filter(({ r, estimate }) => mineByProspect.has(r.id) || estimate >= 25)
    .sort((a, b) => Number(mineByProspect.has(b.r.id)) - Number(mineByProspect.has(a.r.id)) || b.estimate - a.estimate)
    .slice(0, 6);
  const out = [];
  for (const { r, estimate } of targets) {
    const poach = mineByProspect.get(r.id);
    // Silné stránky podle jeho vlastního klubu (úroveň obce), ne podle toho, kdo se dívá
    const own = await loadClub(db, r.team_id);
    const profile = await prospectProfile(db, r, own ?? club);
    out.push({
      prospectId: r.id, name: `${r.first_name} ${r.last_name}`, age: r.age, club: r.club_name, position: r.position,
      km: Math.round(distanceKm(club, { lat: r.c_lat, lng: r.c_lng }) * 10) / 10,
      strengths: profile.strengths, avatar: profile.avatar, verdict: verdictText(estimate),
      protected: await recentlyPoached(db, r.id, seasonNumber),
      interest: poach ? interestText(poach.interest) : null,
      done: poach ? parseJson<string[]>(poach.actions, [], "poach actions") : [],
    });
  }
  type IncomingRow = PoachRow & { first_name: string; last_name: string; age: number; club_name: string };
  const incoming = (await db.prepare(
    `SELECT y.*, p.first_name, p.last_name, p.age, t.name AS club_name FROM youth_poach y
       JOIN youth_prospects p ON p.id = y.prospect_id JOIN teams t ON t.id = y.to_team_id
      WHERE y.from_team_id = ? AND y.season_number = ? AND y.status = 'active'`,
  ).bind(club.id, seasonNumber).all<IncomingRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "incoming poaches", e); return { results: [] as IncomingRow[] }; })).results;
  const ownLevel = await clubLeagueLevel(db, club.id);
  const canPromiseU21 = await hasU21Team(db, club.id);
  const canPromiseVan = (await loadYouthEquipment(db, club.id)).team_van > 0;
  return {
    remaining: Math.max(0, MAX_POACH_PER_SEASON - mine.length),
    bootsCost: POACH_ACTIONS.boots.cost,
    /** Tabulkové odstupné, které zaplatíš (FAČR § 23 podle tvé soutěže): mladší a starší žák. */
    feeYounger: youthFeeByAge(11, ownLevel),
    feeOlder: youthFeeByAge(14, ownLevel),
    /** Co klub může slíbit (dorost = má U21, odvoz = má dodávku). */
    promise: { u21: canPromiseU21, van: canPromiseVan },
    targets: out,
    incoming: incoming.map((y) => ({
      poachId: y.id, name: `${y.first_name} ${y.last_name}`, age: y.age, club: y.club_name,
      interest: interestText(y.interest), defended: parseJson<string[]>(y.actions, [], "poach actions").includes("defend"),
    })),
  };
}

/**
 * Akce při lákání cizího kluka: pozvat na trénink, slíbit rodičům, dát na kopačky. Každá jednou.
 * První akce založí zájem (nejvýš `MAX_POACH_PER_SEASON` kluků za sezónu). Jeho klub se o pozvání
 * dozví; kopačky můžou prasknout.
 */
export async function poachAction(db: D1Database, rng: Rng, teamId: string, prospectId: string, action: unknown, gameDate: string): Promise<ServiceResult<{ interest: string }>> {
  if (action !== "invite" && action !== "promise" && action !== "boots") return { ok: false, status: 400, error: "Neplatná akce" };
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  if (!club.academy_upkeep) return { ok: false, status: 409, error: "Nejdřív založ akademii" };
  const p = await db.prepare("SELECT * FROM youth_prospects WHERE id = ? AND status = 'active' AND team_id != ?").bind(prospectId, teamId).first<ProspectRow>();
  if (!p) return { ok: false, status: 404, error: "Žák nenalezen" };
  if (p.coach_son) return { ok: false, status: 409, error: "Syna trenéra nikdo nepřetáhne" };
  const from = await loadClub(db, p.team_id);
  if (!from || from.district !== club.district || distanceKm(club, from) > POACH_RADIUS_KM) {
    return { ok: false, status: 400, error: `Lákat jde jen žáky z klubů do ${POACH_RADIUS_KM} km` };
  }
  // Kluby stejného majitele nebo propojené by si přes přetahování posílaly kluky a odstupné
  const { areClubsLinked } = await import("../competition/club-links");
  if (await areClubsLinked(db, teamId, from.id)) return { ok: false, status: 409, error: "Mezi propojenými kluby se žáci přetahovat nedají" };
  const seasonNumber = await currentSeasonNumber(db);
  if (await recentlyPoached(db, p.id, seasonNumber)) return { ok: false, status: 409, error: "Žák teprve přestoupil, rok ho nech být" };

  let poach = await db.prepare("SELECT * FROM youth_poach WHERE prospect_id = ? AND to_team_id = ? AND season_number = ? AND status = 'active'")
    .bind(p.id, teamId, seasonNumber).first<PoachRow>();
  if (!poach) {
    // Limit za sezónu atomicky: dvě souběžná nová lákání nepřelezou MAX_POACH_PER_SEASON
    const id = crypto.randomUUID();
    const base = await baseInterestFor(db, p, from, club);
    const inserted = await db.prepare(
      `INSERT INTO youth_poach (id, prospect_id, from_team_id, to_team_id, season_number, interest)
       SELECT ?, ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM youth_poach WHERE to_team_id = ? AND season_number = ? AND status = 'active') < ?
          AND NOT EXISTS (SELECT 1 FROM youth_poach WHERE prospect_id = ? AND to_team_id = ? AND season_number = ? AND status = 'active')`,
    ).bind(id, p.id, from.id, teamId, seasonNumber, base, teamId, seasonNumber, MAX_POACH_PER_SEASON, p.id, teamId, seasonNumber).run();
    poach = await db.prepare("SELECT * FROM youth_poach WHERE prospect_id = ? AND to_team_id = ? AND season_number = ? AND status = 'active'")
      .bind(p.id, teamId, seasonNumber).first<PoachRow>();
    // Nevložilo se a ani souběžný požadavek stejného kluka nezaložil: plný limit
    if (!poach) return { ok: false, status: 409, error: `Za sezónu jde lákat nejvýš ${MAX_POACH_PER_SEASON} žáky` };
    if (inserted.meta.changes === 0 && poach.id !== id) logger.info({ module: M, teamId }, "poach založil souběžný požadavek");
  }
  // Akce atomicky a relativně: každá jen jednou, souběžné kliknutí zájem nezdvojí
  const def = POACH_ACTIONS[action as PoachAction];
  // Slib platí jen podle toho, co klub opravdu má: dorost (U21) a dodávku na odvoz
  let gain: number = def.interest;
  if (action === "promise") {
    const u21 = await hasU21Team(db, teamId);
    const van = (await loadYouthEquipment(db, teamId)).team_van > 0;
    if (!u21 && !van) return { ok: false, status: 409, error: "Nemáš dorost ani dodávku, není co slíbit" };
    gain = (u21 ? 10 : 0) + (van ? 5 : 0);
  }
  if (def.cost > 0) {
    const { assertPurchaseAllowed } = await import("../season/finance-processor");
    const allowed = await assertPurchaseAllowed(db, teamId, def.cost);
    if (!allowed.ok) return { ok: false, status: 409, error: allowed.reason };
  }
  const applied = await db.prepare(
    `UPDATE youth_poach SET interest = MAX(0, MIN(100, interest + ?)), actions = json_insert(actions, '$[#]', ?)
      WHERE id = ? AND status = 'active' AND NOT EXISTS (SELECT 1 FROM json_each(youth_poach.actions) WHERE value = ?)`,
  ).bind(gain, action, poach.id, action).run();
  if (applied.meta.changes === 0) return { ok: false, status: 409, error: "Tohle už jsi zkusil" };
  // Peníze až po úspěšné akci
  if (def.cost > 0) await recordTransaction(db, teamId, "youth_academy", -def.cost, `Příspěvek rodičům na kopačky: ${p.first_name} ${p.last_name}`, gameDate);
  const interest = (await db.prepare("SELECT interest FROM youth_poach WHERE id = ?").bind(poach.id).first<{ interest: number }>())?.interest ?? 0;

  const name = `${p.first_name} ${p.last_name}`;
  if (action === "invite" && isHuman(from)) {
    await academySms(db, from.id, `Za ${name} byli z ${club.village_name}, pozvali ho k nim na trénink. Jestli o něj nechceš přijít, promluv s rodiči v Mládež → Akademie.`);
  }
  if (action === "boots" && rng.random() < POACH_ACTIONS.boots.scandalChance && isHuman(from)) {
    await academySms(db, from.id, `Prý dali z ${club.village_name} rodičům ${name} peníze na kopačky, ať k nim žák přejde. V obci se o tom mluví.`);
  }
  return { ok: true, interest: interestText(interest) };
}

/** Obrana vlastního kluka: promluvit s rodiči (jednou za lákání). */
export async function defendPoach(db: D1Database, teamId: string, poachId: string): Promise<ServiceResult<{ interest: string }>> {
  const poach = await db.prepare("SELECT * FROM youth_poach WHERE id = ? AND from_team_id = ? AND status = 'active'").bind(poachId, teamId).first<PoachRow>();
  if (!poach) return { ok: false, status: 404, error: "O tvého žáka se nikdo nezajímá" };
  const applied = await db.prepare(
    `UPDATE youth_poach SET interest = MAX(0, MIN(100, interest + ?)), actions = json_insert(actions, '$[#]', 'defend')
      WHERE id = ? AND status = 'active' AND NOT EXISTS (SELECT 1 FROM json_each(youth_poach.actions) WHERE value = 'defend')`,
  ).bind(POACH_ACTIONS.defend.interest, poach.id).run();
  if (applied.meta.changes === 0) return { ok: false, status: 409, error: "S rodiči už jsi mluvil" };
  const interest = (await db.prepare("SELECT interest FROM youth_poach WHERE id = ?").bind(poach.id).first<{ interest: number }>())?.interest ?? 0;
  return { ok: true, interest: interestText(interest) };
}

/**
 * Letní okno (fáze academy klubu, kde kluk je): kdo má zájem nad `POACH_THRESHOLD`,
 * přestoupí za tabulkové odstupné podle věku a soutěže nového klubu. Ostatní lákání propadá.
 */
async function resolvePoaches(db: D1Database, club: ClubRow, gameDate: string): Promise<{ poached: string[]; lost: string[] }> {
  const rows = (await db.prepare("SELECT * FROM youth_poach WHERE from_team_id = ? AND status = 'active'").bind(club.id).all<PoachRow>()).results;
  const lost: string[] = [];
  for (const y of rows) {
    const p = await db.prepare("SELECT * FROM youth_prospects WHERE id = ?").bind(y.prospect_id).first<ProspectRow>();
    const to = await loadClub(db, y.to_team_id);
    const { areClubsLinked } = await import("../competition/club-links");
    const linked = to ? await areClubsLinked(db, club.id, to.id) : false;
    const full = to ? (await activeProspects(db, to.id)).length >= MAX_SQUAD : true;
    if (!p || p.status !== "active" || p.team_id !== club.id || !to || y.interest < POACH_THRESHOLD || !to.academy_upkeep || linked || full) {
      await db.prepare("UPDATE youth_poach SET status = 'failed' WHERE id = ?").bind(y.id).run();
      continue;
    }
    const moved = await db.prepare("UPDATE youth_prospects SET team_id = ?, commitment = 75, next_offer_on = NULL WHERE id = ? AND team_id = ? AND status = 'active'")
      .bind(to.id, p.id, club.id).run();
    if (moved.meta.changes === 0) continue;
    await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();
    await db.prepare("UPDATE youth_poach SET status = 'done' WHERE id = ?").bind(y.id).run();
    await db.prepare("UPDATE youth_poach SET status = 'failed' WHERE prospect_id = ? AND status = 'active'").bind(p.id).run();
    const fee = youthFeeByAge(p.age, await clubLeagueLevel(db, to.id));
    const name = `${p.first_name} ${p.last_name}`;
    await recordTransaction(db, club.id, "transfer_income", fee, `Odstupné za žáka: ${name} (${to.village_name})`, gameDate);
    await recordTransaction(db, to.id, "transfer_fee", -fee, `Odstupné za žáka: ${name} (${club.village_name})`, gameDate);
    lost.push(`${name} do ${to.village_name}, odstupné ${fee.toLocaleString("cs")} Kč`);
    // Nový klub mohl mít konec sezóny za sebou: kluk se posune hned (jinak by rok ztratil).
    // Když nový klub teprve přijde na řadu, `aged_season` zajistí, že ho nezpracuje podruhé.
    const toKids = await activeProspects(db, to.id);
    const moved_ = toKids.find((k) => k.id === p.id);
    if (moved_) {
      const toU21 = await hasU21Team(db, to.id);
      const toCoach = await coachState(db, to, toKids.length);
      const vanLevel = (await loadYouthEquipment(db, to.id)).team_van;
      await advanceProspect(db, createRng(cryptoSeed()), to, moved_, {
        coach: toCoach, levelQuit: ACADEMY_LEVELS[academyLevelOf(to.academy_level)].quit, playsCompetition: toKids.length >= MIN_SQUAD, vanLevel, hasU21: toU21, seasonNumber: await currentSeasonNumber(db),
      }, gameDate).catch((e) => logger.warn({ module: M, teamId: to.id }, "advance poached prospect", e));
    }
    if (isHuman(to)) await academySms(db, to.id, `${name} (${p.age}) k nám v létě přestoupil z ${club.village_name}. Odstupné ${fee.toLocaleString("cs")} Kč šlo jejich klubu.`);
  }
  // Přetažené k nám v tomhle kole řeší SMS lákajícího klubu výš; tady jen souhrn vlastních ztrát
  return { poached: [], lost };
}

// ── AI kluby a přechod ze staré akademie ──────────────────────────────────────

/** Volby AI trenéra (ACADEMY_CHOICES v ai-coach/weekly-decision.ts). */
export type YouthChoice = "none" | "volunteer" | "parent" | "staff";

/** Pro týdenní správu AI klubu: má žáky, kdo je trénuje, kolik kluků a jaké má možnosti. */
export async function youthContextForTeam(db: D1Database, teamId: string) {
  const club = await loadClub(db, teamId);
  if (!club) return null;
  const prospects = (await activeProspects(db, teamId)).length;
  const coach = await coachState(db, club, prospects);
  const options = await loadCoachOptions(db, teamId);
  const founded = await db.prepare("SELECT academy_founded_season AS s FROM teams WHERE id = ?").bind(teamId).first<{ s: number | null }>();
  return {
    current: (club.academy_upkeep ? coach.type ?? "none" : "none") as YouthChoice,
    founded: !!club.academy_upkeep,
    /** Založit jde jednou za sezónu: po zrušení až příští sezónu. */
    canFound: !!club.academy_upkeep || (founded?.s ?? -1) < (await currentSeasonNumber(db)),
    prospects,
    expectedPerYear: expectedKidsPerYear(club.population ?? 0),
    canVolunteer: options.volunteers.length > 0,
    canStaff: !!options.staff,
  };
}

/**
 * AI trenér nastaví žáky volbou: none = zrušit, jinak založit (když nejsou) a dát trenéra.
 * Dobrovolníka vybere kód (hráč áčka s nejvyšším vůdcovstvím), táta je ten nejmladšího kluka.
 */
export async function applyYouthChoice(db: D1Database, teamId: string, choice: YouthChoice, gameDate: string): Promise<ServiceResult<{ choice: YouthChoice }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  if (choice === "none") {
    if (!club.academy_upkeep) return { ok: true, choice };
    const res = await closeYouthTeam(db, teamId, gameDate);
    return res.ok ? { ok: true, choice } : res;
  }
  if (!club.academy_upkeep) {
    const founded = await foundYouthTeam(db, createRng(cryptoSeed()), teamId, gameDate);
    if (!founded.ok) return founded;
  }
  const options = await loadCoachOptions(db, teamId);
  const body = choice === "volunteer" ? { type: "volunteer", playerId: options.volunteers[0]?.playerId } : { type: choice };
  const res = await setYouthCoach(db, teamId, body);
  return res.ok ? { ok: true, choice } : res;
}

/**
 * Jednorázový přechod ze staré akademie: klub, který platil, dostane družstvo žáků hned,
 * s placeným trenérem mládeže, pokud ho má, jinak s dobrovolníkem z áčka. Idempotentní.
 */
/** Kolik žáků dostane klub při přechodu ze staré akademie nejméně, podle toho, kolik do ní dával. */
const LEGACY_MIN_KIDS: Record<string, number> = { minimal: 4, medium: 6, high: 9 };

export async function seedFromLegacy(db: D1Database, teamId: string, gameDate: string): Promise<{ created: number; skipped?: string }> {
  const legacy = await db.prepare("SELECT youth_investment, academy_upkeep FROM teams WHERE id = ?").bind(teamId)
    .first<{ youth_investment: string | null; academy_upkeep: number }>();
  if (!legacy) return { created: 0, skipped: "no club" };
  if (legacy.academy_upkeep) return { created: 0, skipped: "has youth team" };
  const extraYears = legacy.youth_investment === "high" ? 2 : legacy.youth_investment === "medium" ? 1 : legacy.youth_investment === "minimal" ? 0 : -1;
  if (extraYears < 0) return { created: 0, skipped: "no legacy academy" };

  const founded = await foundYouthTeam(db, createRng(cryptoSeed()), teamId, gameDate, extraYears, LEGACY_MIN_KIDS[legacy.youth_investment ?? ""] ?? 0);
  if (!founded.ok) return { created: 0, skipped: founded.error };
  // Placeného trenéra mládeže sem nedáváme sami: u žáků by se míň věnoval U21 a klub by
  // potichu přišel o část bonusu dorostu. Vybere si ho manažer sám, SMS mu to řekne.
  const options = await loadCoachOptions(db, teamId);
  const coach = options.volunteers[0] ? { type: "volunteer", playerId: options.volunteers[0].playerId } : { type: "parent" };
  await setYouthCoach(db, teamId, coach);

  const club = await loadClub(db, teamId);
  if (club && isHuman(club)) {
    const coachText = coach.type === "volunteer" ? `Žáky zatím vede ${options.volunteers[0].name} z áčka` : "Žáky zatím vede jeden z tátů";
    const staffText = options.staff ? ` Můžeš je dát i svému trenérovi mládeže (${options.staff.name}), víc je naučí, ale bude mít míň času na U21.` : "";
    await academySms(db, teamId, `Akademie se mění: místo úrovní investice má klub vlastní družstvo žáků. Máš ${founded.created} žáků od 11 do 14 let, každé léto postoupí čtrnáctiletí do dorostu. ${coachText}.${staffText} Všechno najdeš v Mládež → Akademie.`);
  }
  return { created: founded.created };
}
