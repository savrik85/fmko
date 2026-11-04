/**
 * Žáci: databázová část družstva žáků. Pravidla jsou v `rules.ts`, návrh v
 * docs/youth-academy-redesign-2026-11-04.md.
 *
 * Kluk (11–14 let) žije v `youth_prospects`. Hráčem se stane v létě postupem do dorostu
 * (U21), nebo dřív, když hraje o kategorii výš. Obojí jde přes nabídku v `player_offers`
 * (source `youth`, `prospect_id`) a `acceptPlayerOffer`, takže hráč vzniká na jediném místě.
 */

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
  type CoachType, YOUNGEST_AGE, OLDEST_AGE, MIN_SQUAD, UPKEEP_WEEKLY, VOLUNTEER_MIN_AGE, expectedKidsPerYear, rollKids,
  programQuality, weeklyProgress, estimatedTalent, verdictText, commitmentText, canPlayUp, recommendsPlayUp,
  REOFFER_DAYS, firstOfferDay, quitChance, talentShiftAt13, pickTraits, positionVisible, GRADUATE_WAGE_FACTOR,
  youthTransferFee, distanceKm, qualityText, PLAY_UP_ESTIMATE, estimateRange, strengthsOf, staffQualityText,
  YOUTH_EQUIPMENT, POTENTIAL_SCALE, type YouthEquipment,
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
            t.academy_upkeep, t.academy_coach_type, t.academy_coach_player_id, t.academy_coach_name, t.academy_coach_prospect_id
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

async function loadStaffYouthCoach(db: D1Database, teamId: string): Promise<{ effectiveness: number; judgement: number; name: string } | null> {
  const row = await db.prepare(
    `SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm, first_name, last_name
       FROM staff_members WHERE team_id = ? AND role = 'trener_mladeze' LIMIT 1`,
  ).bind(teamId).first<StaffEffectRow & { first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load youth coach", e); return null; });
  if (!row) return null;
  return { effectiveness: rowEffectiveness(row, "trener_mladeze"), judgement: row.judgement, name: `${row.first_name} ${row.last_name}` };
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
}

/** Kdo žáky vede a jak dobrá je příprava. Trenér, který zmizel (hráč odešel, zaměstnanec skončil), se nepočítá. */
async function coachState(db: D1Database, club: ClubRow, squadSize: number): Promise<CoachState> {
  const managerYouth = await loadManagerYouth(db, club.id);
  const equipment = await loadYouthEquipment(db, club.id);
  const type = club.academy_coach_type as CoachType | null;
  if (type === "staff") {
    const staff = await loadStaffYouthCoach(db, club.id);
    if (staff) {
      return { type, name: staff.name, judgement: staff.judgement,
        quality: programQuality({ coach: type, staffEffectiveness: staff.effectiveness, managerYouth, squadSize, equipment }) };
    }
  } else if (type === "volunteer") {
    const v = await loadVolunteer(db, club.id, club.academy_coach_player_id);
    if (v) return { type, name: v.name, judgement: null, quality: programQuality({ coach: type, volunteerLeadership: v.leadership, managerYouth, squadSize, equipment }) };
  } else if (type === "parent" && club.academy_coach_name) {
    return { type, name: club.academy_coach_name, judgement: null, quality: programQuality({ coach: type, managerYouth, squadSize, equipment }) };
  }
  return { type: null, name: null, judgement: null, quality: 0 };
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

const POSITION_WEIGHTS: Record<string, number> = { GK: 1, DEF: 8, MID: 8, FWD: 7 };

/** Identita kluka: pevná pro jeho semínko, generuje se jako pro šestnáctiletého (povolání, vzhled). */
async function prospectIdentity(db: D1Database, seed: number, club: ClubRow, position: string) {
  const info: VillageInfo = { region_code: club.district, category: categoryFromVillageSize(club.size), population: club.population ?? 500, district: club.district };
  const districtData = await getDistrictDataFromDB(db, club.district);
  return generatePlayer(
    createRng(seed), info, position as "GK" | "DEF" | "MID" | "FWD",
    { surnames: districtData.surnames, female_forms: {} }, { male: FIRSTNAMES, female: {} }, { age: 16 },
  );
}

async function createProspect(db: D1Database, rng: Rng, club: ClubRow, age: number, gameDate: string, nextOfferOn: string | null): Promise<ProspectRow> {
  const position = rng.weighted(POSITION_WEIGHTS);
  const seed = rng.int(1, 2_000_000_000);
  const identity = await prospectIdentity(db, seed, club, position);
  const gem = rng.random() < GEM_CHANCE;
  const talent = gem ? rng.int(GEM_TALENT[0], GEM_TALENT[1]) : talentForAge(rng, levelFromVillageSize(club.size), 16);
  const row: ProspectRow = {
    id: crypto.randomUUID(), team_id: club.id, first_name: identity.firstName, last_name: identity.lastName, age, position,
    home_village_id: club.village_id, identity_seed: seed, hidden_talent: talent, gem_cap: gem ? rng.int(GEM_EXTRA_CAP[0], GEM_EXTRA_CAP[1]) : 0,
    progress_current: 0, progress_cap: 0, estimate_offset: Math.round((rng.random() * 2 - 1) * 100) / 100,
    traits: JSON.stringify(pickTraits(rng)), commitment: rng.int(55, 85), status: "active", next_offer_on: nextOfferOn, player_id: null,
    joined_at: day(gameDate), left_at: null,
  };
  await db.prepare(
    `INSERT INTO youth_prospects (id, team_id, first_name, last_name, age, position, home_village_id, identity_seed, hidden_talent,
       gem_cap, progress_current, progress_cap, estimate_offset, traits, commitment, status, next_offer_on, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(row.id, row.team_id, row.first_name, row.last_name, row.age, row.position, row.home_village_id, row.identity_seed,
    row.hidden_talent, row.gem_cap, row.progress_current, row.progress_cap, row.estimate_offset, row.traits, row.commitment,
    row.next_offer_on, row.joined_at).run();
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
export async function foundYouthTeam(db: D1Database, rng: Rng, teamId: string, gameDate: string, extraYears = 0): Promise<ServiceResult<{ created: number }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  // Nejvýš jednou za sezónu: založit, poslat starší kluky do dorostu, zrušit a založit znovu
  // by jinak dávalo hráče zadarmo dokola
  const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "active season", e); return null; });
  const seasonNumber = season?.number ?? 0;
  const claim = await db.prepare(
    "UPDATE teams SET academy_upkeep = 1, academy_founded_season = ? WHERE id = ? AND academy_upkeep = 0 AND (academy_founded_season IS NULL OR academy_founded_season < ?)",
  ).bind(seasonNumber, teamId, seasonNumber).run();
  if (claim.meta.changes === 0) {
    return { ok: false, status: 409, error: club.academy_upkeep ? "Žáky už máš" : "Žáky jde letos založit jen jednou, znovu až příští sezónu" };
  }

  const seasonDays = await remainingSeasonDays(db, club.league_id, gameDate);
  const coach = await coachState(db, club, MIN_SQUAD);
  const step = weeklyProgress(Math.max(0.6, coach.quality));
  let created = 0;
  for (let age = YOUNGEST_AGE; age <= OLDEST_AGE; age++) {
    const kids = rollKids(rng, expectedKidsPerYear(club.population ?? 0));
    for (let i = 0; i < kids; i++) {
      const p = await createProspect(db, rng, club, age, gameDate, null);
      // Kluci, co už v obci kopou, nejsou úplní začátečníci; u přechodu ze staré akademie víc
      const years = Math.min(age - YOUNGEST_AGE, 1 + extraYears);
      const next = playUpDay(rng, p, coach.judgement, gameDate, seasonDays);
      await db.prepare("UPDATE youth_prospects SET progress_current = ?, progress_cap = ?, next_offer_on = ? WHERE id = ?")
        .bind(step.current * 15 * years, step.cap * 15 * years, next, p.id).run();
      created++;
    }
  }
  logger.info({ module: M, teamId }, `založeno družstvo žáků: ${created} kluků`);
  return { ok: true, created };
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
  volunteers: { playerId: string; name: string; age: number; leadership: string }[];
  /** Táta jednoho z kluků. Null = klub nemá žádného kluka, jehož táta by to vzal. */
  parent: { name: string; prospectId: string; kid: string } | null;
  staff: { name: string } | null;
}

function leadershipText(l: number): string {
  if (l >= 70) return "kluky si získá";
  if (l >= 45) return "umí to s lidmi";
  return "spíš mlčenlivý";
}

/** Táta kluka: jméno z příjmení kluka, křestní jméno pevné podle kluka. */
function parentFor(p: ProspectRow): { name: string; prospectId: string; kid: string } {
  const names = ["Pavel", "Jiří", "Petr", "Martin", "Tomáš", "Jan", "Josef", "Michal", "Roman", "Zdeněk", "Luboš", "Karel"];
  return { name: `${names[p.identity_seed % names.length]} ${p.last_name}`, prospectId: p.id, kid: `${p.first_name} ${p.last_name}` };
}

export async function loadCoachOptions(db: D1Database, teamId: string): Promise<CoachOptions> {
  type Row = { id: string; first_name: string; last_name: string; age: number; personality: string };
  const players = await db.prepare(
    `SELECT id, first_name, last_name, age, personality FROM players
      WHERE team_id = ? AND age >= ? AND (status IS NULL OR status = 'active')`,
  ).bind(teamId, VOLUNTEER_MIN_AGE).all<Row>()
    .catch((e) => { logger.warn({ module: M, teamId }, "volunteer candidates", e); return { results: [] as Row[] }; });
  const volunteers = players.results
    .map((p) => ({ p, leadership: parseJson<{ leadership?: number }>(p.personality, {}, "personality").leadership ?? 40 }))
    .sort((a, b) => b.leadership - a.leadership)
    .slice(0, 5)
    .map(({ p, leadership }) => ({ playerId: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age, leadership: leadershipText(leadership) }));
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
    if (!options.parent) return { ok: false, status: 409, error: "Žádný táta to vzít nemůže, nemáš kluky" };
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
  await recordTransaction(db, teamId, "youth_academy", -Math.round(UPKEEP_WEEKLY * opsCostMul), "Žáci (dresy, míče, startovné, cesty)", gameDate);
  const squad = (await activeProspects(db, teamId)).length;
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
  const rng = createRng(cryptoSeed());
  const created = createPlayer(rng, {
    identity, position: p.position as "GK" | "DEF" | "MID" | "FWD", level: levelFromVillageSize(club.size),
    academy: { current: Math.round(p.progress_current), cap: Math.round(p.progress_cap) + p.gem_cap, talent: [0, 0], gemChance: 0 },
    hiddenTalent: p.hidden_talent,
  });
  const personality = { ...created.personality, patriotism: Math.min(100, created.personality.patriotism + rng.int(10, 20)) };
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
const NO_U21_ERROR = "Klub nemá dorost (U21) a za muže smí kluk až od 15 let. V létě ve čtrnácti půjde do dorostu jiného klubu.";

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
  if (!p) return { ok: false, status: 404, error: "Kluk u žáků není" };
  if (!canPlayUp(p.age)) return { ok: false, status: 409, error: "Do dorostu smí kluk až od 13 let" };
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
  if (!p) return { ok: false, status: 404, error: "Kluk u žáků není" };
  if (!canPlayUp(p.age)) return { ok: false, status: 409, error: "Do dorostu smí kluk až od 13 let" };
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
      WHERE v.district = ? AND t.parent_team_id IS NULL AND t.id != ?
        AND EXISTS (SELECT 1 FROM teams u WHERE u.parent_team_id = t.id AND u.team_type = 'u21')`,
  ).bind(club.district, club.id).all<U21ClubRow>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "clubs with u21", e); return { results: [] as U21ClubRow[] }; });
  const sorted = res.results.filter((r) => r.lat !== null).sort((a, b) => distanceKm(club, a) - distanceKm(club, b));
  return sorted[0] ?? null;
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

/**
 * Konec sezóny (fáze `academy`, před letním stárnutím hráčů): čtrnáctiletí postoupí do dorostu,
 * někdo skončí, ostatní zestárnou o rok, přijde nový ročník jedenáctiletých. Táta, jehož kluk
 * u žáků skončil, s ním odchází jako trenér. Lidský klub dostane jednu SMS se souhrnem.
 */
export async function seasonEndAcademy(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<void> {
  const club = await loadClub(db, teamId);
  if (!club) return;
  const prospects = await activeProspects(db, teamId);
  const coach = await coachState(db, club, prospects.length);
  const playsCompetition = prospects.length >= MIN_SQUAD;
  const vanLevel = (await loadYouthEquipment(db, teamId)).team_van;
  const u21 = await db.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "check u21", e); return null; });

  const promoted: string[] = [];
  const transferred: string[] = [];
  let feeTotal = 0;
  const quit: string[] = [];
  for (const p of prospects) {
    const name = `${p.first_name} ${p.last_name}`;
    if (p.age >= OLDEST_AGE) {
      const res = await graduate(db, club, p, gameDate, !!u21)
        .catch((e) => { logger.warn({ module: M, teamId }, "graduate", e); return { ok: false, to: null, fee: 0 }; });
      if (res.fee > 0) { transferred.push(`${name} (${res.to})`); feeTotal += res.fee; }
      else if (res.ok) promoted.push(name);
      continue;
    }
    if (rng.random() < quitChance(p.commitment, playsCompetition, coach.type !== null, vanLevel)) {
      const res = await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE id = ? AND status = 'active'").bind(day(gameDate), p.id).run();
      if (res.meta.changes === 0) continue;
      await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();
      quit.push(name);
      continue;
    }
    const age = p.age + 1;
    const talent = age === 13 ? Math.max(0, Math.min(100, p.hidden_talent + talentShiftAt13(rng))) : p.hidden_talent;
    const commitment = Math.max(10, Math.min(95, p.commitment + rng.int(-12, 10)));
    const next = playUpDay(rng, { age, hidden_talent: talent, estimate_offset: p.estimate_offset }, coach.judgement, gameDate, FALLBACK_SEASON_DAYS);
    await db.prepare("UPDATE youth_prospects SET age = ?, hidden_talent = ?, commitment = ?, next_offer_on = ? WHERE id = ? AND status = 'active'")
      .bind(age, talent, commitment, next, p.id).run();
  }

  // Táta trénoval kvůli svému klukovi: když kluk u žáků skončil, končí i on
  let coachLeft: string | null = null;
  if (club.academy_coach_type === "parent" && club.academy_coach_prospect_id) {
    const kid = await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(club.academy_coach_prospect_id).first<{ status: string }>();
    if (kid?.status !== "active") {
      coachLeft = club.academy_coach_name;
      await db.prepare("UPDATE teams SET academy_coach_type = NULL, academy_coach_name = NULL, academy_coach_prospect_id = NULL WHERE id = ?").bind(teamId).run();
    }
  }

  const newKids: string[] = [];
  if (club.academy_upkeep) {
    const kids = rollKids(rng, expectedKidsPerYear(club.population ?? 0));
    for (let i = 0; i < kids; i++) {
      const p = await createProspect(db, rng, club, YOUNGEST_AGE, gameDate, null)
        .catch((e) => { logger.warn({ module: M, teamId }, "new prospect", e); return null; });
      if (p) newKids.push(`${p.first_name} ${p.last_name}`);
    }
  }

  if (!isHuman(club)) return;
  const parts: string[] = [];
  if (promoted.length) parts.push(`Do dorostu postoupili: ${promoted.join(", ")}.`);
  if (transferred.length) parts.push(`Dorost nemáme, tak chtějí jinam: ${transferred.join(", ")}. Když je tam vezmou, dostaneme odstupné, celkem až ${feeTotal.toLocaleString("cs")} Kč.`);
  if (quit.length) parts.push(`Skončili: ${quit.join(", ")}.`);
  if (newKids.length) parts.push(`Noví jedenáctiletí: ${newKids.join(", ")}.`);
  else if (club.academy_upkeep) parts.push("Nových kluků z obce letos nepřišlo.");
  if (coachLeft) parts.push(`${coachLeft} končí, jeho kluk už u žáků není. Žáci potřebují nového trenéra.`);
  if (parts.length) await academySms(db, teamId, `Konec sezóny u žáků. ${parts.join(" ")}`);
}

/** Denní tick: trenér doporučí kluka o kategorii výš, jehož den přišel (nejvýš jednoho denně). */
export async function dailyAcademy(db: D1Database, teamId: string, gameDate: string): Promise<{ offered: number }> {
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

  return {
    founded: !!club.academy_upkeep,
    potentialScale: POTENTIAL_SCALE,
    equipment: YOUTH_EQUIPMENT.map((e) => ({ ...e, level: equipment[e.key] ?? 0 })),
    staffMarket,
    village: club.village_name,
    /** Kolik kluků obec dá na ročník, slovy počítá UI. */
    expectedPerYear: Math.round(expectedKidsPerYear(club.population ?? 0) * 10) / 10,
    weeklyCost: UPKEEP_WEEKLY,
    minSquad: MIN_SQUAD,
    playsCompetition: prospects.length >= MIN_SQUAD,
    hasU21: !!u21,
    coach: { type: coach.type, name: coach.name, quality: qualityText(coach.quality, coach.type), playerId: coach.type === "volunteer" ? club.academy_coach_player_id : null },
    coachOptions: options,
    nextSummer: prospects.filter((p) => p.age >= OLDEST_AGE).length,
    prospects: prospects.map((p) => {
      const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, coach.judgement);
      const range = estimateRange(estimate, p.age, coach.judgement);
      const profile = profiles.get(p.id);
      return {
        id: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age,
        position: p.position,
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
  return {
    current: (club.academy_upkeep ? coach.type ?? "none" : "none") as YouthChoice,
    founded: !!club.academy_upkeep,
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
export async function seedFromLegacy(db: D1Database, teamId: string, gameDate: string): Promise<{ created: number; skipped?: string }> {
  const legacy = await db.prepare("SELECT youth_investment, academy_upkeep FROM teams WHERE id = ?").bind(teamId)
    .first<{ youth_investment: string | null; academy_upkeep: number }>();
  if (!legacy) return { created: 0, skipped: "no club" };
  if (legacy.academy_upkeep) return { created: 0, skipped: "has youth team" };
  const extraYears = legacy.youth_investment === "high" ? 2 : legacy.youth_investment === "medium" ? 1 : legacy.youth_investment === "minimal" ? 0 : -1;
  if (extraYears < 0) return { created: 0, skipped: "no legacy academy" };

  const founded = await foundYouthTeam(db, createRng(cryptoSeed()), teamId, gameDate, extraYears);
  if (!founded.ok) return { created: 0, skipped: founded.error };
  const options = await loadCoachOptions(db, teamId);
  const coach = options.staff ? { type: "staff" } : options.volunteers[0] ? { type: "volunteer", playerId: options.volunteers[0].playerId } : { type: "parent" };
  await setYouthCoach(db, teamId, coach);

  const club = await loadClub(db, teamId);
  if (club && isHuman(club)) {
    await academySms(db, teamId, `Akademie se mění: místo úrovní investice má klub vlastní družstvo žáků. Máš ${founded.created} kluků od 11 do 14 let, každé léto postoupí čtrnáctiletí do dorostu. Najdeš je v Mládež → Akademie, tam vybereš i trenéra.`);
  }
  return { created: founded.created };
}
