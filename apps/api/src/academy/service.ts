/**
 * Žáci: databázová část akademie. Pravidla a čísla jsou v `rules.ts`, návrh v
 * docs/youth-academy-redesign-2026-11-04.md.
 *
 * Kluk (12–15 let) žije v `youth_prospects`. Hráčem se stane, až ho klub vezme do dorostu:
 * trenér mládeže ho průběžně nabízí přes `player_offers` (source `youth`, `prospect_id`)
 * a přijetí nabídky ho založí v U21 (`acceptPlayerOffer`). Ruční vytažení ze stránky Žáci
 * jde stejnou cestou, takže hráč vzniká na jediném místě.
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
  type AcademyProgram, programWeeklyCost, programQuality, weeklyProgress, distanceKm, expectedKidsFromVillage, rollKids,
  RECRUIT_RADIUS_KM, RECRUIT_FEE, MAX_RECRUIT_VILLAGES, MAX_CLASS_SIZE, MAX_SQUAD, MIN_SQUAD, estimatedTalent, verdictText,
  commitmentText, readinessText, canPromote, REOFFER_DAYS, firstOfferDay, quitChance, talentShiftAt14, pickTraits,
  positionVisible, GRADUATE_WAGE_FACTOR, PROGRAM_COST,
} from "./rules";

const M = "academy";

/** Délka sezóny, když z kalendáře nejde zjistit, kolik dní zbývá. */
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
  lat: number;
  lng: number;
  academy_upkeep: number;
  academy_hall: number;
  academy_bus: number;
  academy_recruit_villages: string;
}

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

async function loadClub(db: D1Database, teamId: string): Promise<ClubRow | null> {
  return db.prepare(
    `SELECT t.id, t.user_id, t.league_id, t.village_id, v.name AS village_name, v.district, v.size, v.lat, v.lng,
            t.academy_upkeep, t.academy_hall, t.academy_bus, t.academy_recruit_villages
       FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<ClubRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load club", e); return null; });
}

export function programOf(club: Pick<ClubRow, "academy_upkeep" | "academy_hall" | "academy_bus">): AcademyProgram {
  return { upkeep: !!club.academy_upkeep, hall: !!club.academy_hall, bus: !!club.academy_bus };
}

const isHuman = (club: { user_id: string | null }) => !!club.user_id && club.user_id !== "ai";

/** Trenér mládeže klubu: efektivita v roli a úsudek (0–20). Null = klub ho nemá. */
async function loadYouthTrainer(db: D1Database, teamId: string): Promise<{ effectiveness: number; judgement: number } | null> {
  const row = await db.prepare(
    `SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm
       FROM staff_members WHERE team_id = ? AND role = 'trener_mladeze' LIMIT 1`,
  ).bind(teamId).first<StaffEffectRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load youth trainer", e); return null; });
  if (!row) return null;
  return { effectiveness: rowEffectiveness(row, "trener_mladeze"), judgement: row.judgement };
}

async function loadManagerYouth(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT youth_development FROM managers WHERE team_id = ? LIMIT 1")
    .bind(teamId).first<{ youth_development: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load manager youth", e); return null; });
  return row?.youth_development ?? 40;
}

async function activeProspects(db: D1Database, teamId: string): Promise<ProspectRow[]> {
  const res = await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = 'active' ORDER BY age DESC, last_name")
    .bind(teamId).all<ProspectRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load prospects", e); return { results: [] as ProspectRow[] }; });
  return res.results;
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

// ── Obce pro nábor ────────────────────────────────────────────────────────────

export interface RecruitVillage {
  id: string;
  name: string;
  population: number;
  km: number;
  /** Kolik klubů má v obci domov (o kluky se s nimi dělí). */
  competitors: number;
  /** Střední počet kluků za ročník. */
  expectedKids: number;
  own: boolean;
  selected: boolean;
}

/** Vlastní obec a obce do `RECRUIT_RADIUS_KM`, seřazené podle toho, kolik kluků slibují. */
export async function recruitVillages(db: D1Database, club: ClubRow): Promise<RecruitVillage[]> {
  const selected = new Set(parseJson<string[]>(club.academy_recruit_villages, [], "recruit villages"));
  // Hrubý čtverec kolem obce, přesná vzdálenost se dopočítá.
  const dLat = RECRUIT_RADIUS_KM / 111.2;
  const dLng = RECRUIT_RADIUS_KM / 71.5;
  const res = await db.prepare(
    `SELECT v.id, v.name, v.population, v.lat, v.lng,
            (SELECT COUNT(*) FROM teams t WHERE t.village_id = v.id AND t.parent_team_id IS NULL AND t.id != ?) AS competitors
       FROM villages v
      WHERE v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?`,
  ).bind(club.id, club.lat - dLat, club.lat + dLat, club.lng - dLng, club.lng + dLng)
    .all<{ id: string; name: string; population: number; lat: number; lng: number; competitors: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: club.id }, "load recruit villages", e); return { results: [] as { id: string; name: string; population: number; lat: number; lng: number; competitors: number }[] }; });

  return res.results
    .map((v) => {
      const own = v.id === club.village_id;
      const km = own ? 0 : distanceKm(club, v);
      return {
        id: v.id, name: v.name, population: v.population ?? 0, km: Math.round(km * 10) / 10,
        competitors: own ? 0 : v.competitors,
        expectedKids: Math.round(expectedKidsFromVillage(v.population ?? 0, own ? 0 : v.competitors) * 10) / 10,
        own, selected: own || selected.has(v.id),
      };
    })
    .filter((v) => v.own || v.km <= RECRUIT_RADIUS_KM)
    .sort((a, b) => Number(b.own) - Number(a.own) || b.expectedKids - a.expectedKids || a.km - b.km);
}

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };

/** Obce, kde klub příští léto udělá nábor (kromě vlastní). */
export async function setRecruitVillages(db: D1Database, teamId: string, ids: unknown): Promise<ServiceResult<{ villageIds: string[] }>> {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) return { ok: false, status: 400, error: "Neplatný seznam obcí" };
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const options = new Map((await recruitVillages(db, club)).filter((v) => !v.own).map((v) => [v.id, v]));
  // Vlastní obec je v náboru vždy, v seznamu se neukládá
  const chosen = [...new Set(ids as string[])].filter((id) => id !== club.village_id);
  if (chosen.some((id) => !options.has(id))) {
    return { ok: false, status: 400, error: `Nábor jde jen v obcích do ${RECRUIT_RADIUS_KM} km` };
  }
  if (chosen.length > MAX_RECRUIT_VILLAGES) return { ok: false, status: 400, error: `Nábor najednou nejvýš v ${MAX_RECRUIT_VILLAGES} dalších obcích` };
  await db.prepare("UPDATE teams SET academy_recruit_villages = ? WHERE id = ?").bind(JSON.stringify(chosen), teamId).run();
  return { ok: true, villageIds: chosen };
}

/** Zapne nebo vypne položky zázemí. Hala a autobus bez provozu nedávají smysl, vypnou se s ním. */
export async function setAcademyProgram(db: D1Database, teamId: string, body: unknown): Promise<ServiceResult<{ program: AcademyProgram }>> {
  const b = (body ?? {}) as Record<string, unknown>;
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const current = programOf(club);
  const next: AcademyProgram = { ...current };
  for (const key of ["upkeep", "hall", "bus"] as const) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "boolean") return { ok: false, status: 400, error: "Neplatné nastavení zázemí" };
    next[key] = b[key] as boolean;
  }
  if (!next.upkeep) { next.hall = false; next.bus = false; }
  await db.prepare("UPDATE teams SET academy_upkeep = ?, academy_hall = ?, academy_bus = ? WHERE id = ?")
    .bind(Number(next.upkeep), Number(next.hall), Number(next.bus), teamId).run();
  logger.info({ module: M, teamId }, `zázemí žáků: provoz ${next.upkeep}, hala ${next.hall}, autobus ${next.bus}`);
  return { ok: true, program: next };
}

// ── Nábor ─────────────────────────────────────────────────────────────────────

const POSITION_WEIGHTS = { GK: 1, DEF: 8, MID: 8, FWD: 7 } as const;

async function villageInfoFor(db: D1Database, villageId: string): Promise<{ info: VillageInfo; size: string; lat: number; lng: number } | null> {
  const v = await db.prepare("SELECT id, district, population, size, lat, lng FROM villages WHERE id = ?")
    .bind(villageId).first<{ id: string; district: string; population: number; size: string; lat: number; lng: number }>()
    .catch((e) => { logger.warn({ module: M }, "load village", e); return null; });
  if (!v) return null;
  return {
    info: { region_code: v.district, category: categoryFromVillageSize(v.size), population: v.population ?? 500, district: v.district },
    size: v.size, lat: v.lat, lng: v.lng,
  };
}

/** Identita kluka: pevná pro jeho semínko, generuje se jako pro šestnáctiletého (povolání, vzhled). */
async function prospectIdentity(db: D1Database, seed: number, villageId: string | null, fallbackDistrict: string, position: string) {
  const village = villageId ? await villageInfoFor(db, villageId) : null;
  const info: VillageInfo = village?.info ?? { region_code: fallbackDistrict, category: "obec", population: 500, district: fallbackDistrict };
  const districtData = await getDistrictDataFromDB(db, info.district ?? fallbackDistrict);
  const identity = generatePlayer(
    createRng(seed), info, position as "GK" | "DEF" | "MID" | "FWD",
    { surnames: districtData.surnames, female_forms: {} }, { male: FIRSTNAMES, female: {} }, { age: 16 },
  );
  return { identity, size: village?.size ?? "village" };
}

/** Založí jednoho kluka z dané obce. */
async function createProspect(db: D1Database, rng: Rng, club: ClubRow, villageId: string, age: number, gameDate: string): Promise<ProspectRow | null> {
  const position = rng.weighted(POSITION_WEIGHTS as unknown as Record<string, number>) as string;
  const seed = rng.int(1, 2_000_000_000);
  const { identity, size } = await prospectIdentity(db, seed, villageId, club.district, position);
  const gem = rng.random() < GEM_CHANCE;
  const talent = gem ? rng.int(GEM_TALENT[0], GEM_TALENT[1]) : talentForAge(rng, levelFromVillageSize(size), 16);
  const row: ProspectRow = {
    id: crypto.randomUUID(), team_id: club.id, first_name: identity.firstName, last_name: identity.lastName, age, position,
    home_village_id: villageId, identity_seed: seed, hidden_talent: talent, gem_cap: gem ? rng.int(GEM_EXTRA_CAP[0], GEM_EXTRA_CAP[1]) : 0,
    progress_current: 0, progress_cap: 0, estimate_offset: Math.round((rng.random() * 2 - 1) * 100) / 100,
    traits: JSON.stringify(pickTraits(rng)), commitment: rng.int(55, 85), status: "active", next_offer_on: null, player_id: null,
    joined_at: day(gameDate), left_at: null,
  };
  await db.prepare(
    `INSERT INTO youth_prospects (id, team_id, first_name, last_name, age, position, home_village_id, identity_seed, hidden_talent,
       gem_cap, progress_current, progress_cap, estimate_offset, traits, commitment, status, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(row.id, row.team_id, row.first_name, row.last_name, row.age, row.position, row.home_village_id, row.identity_seed,
    row.hidden_talent, row.gem_cap, row.progress_current, row.progress_cap, row.estimate_offset, row.traits, row.commitment, row.joined_at).run();
  return row;
}

/**
 * Letní nábor: z vlastní obce a vybraných okolních přijdou dvanáctiletí. Za každou další obec
 * se platí `RECRUIT_FEE`. Bez provozu žáků se nábor nedělá.
 */
export async function recruitClass(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<ProspectRow[]> {
  const club = await loadClub(db, teamId);
  if (!club || !club.academy_upkeep) return [];
  const squad = (await activeProspects(db, teamId)).length;
  const room = Math.min(MAX_CLASS_SIZE, MAX_SQUAD - squad);
  if (room <= 0) return [];

  const villages = (await recruitVillages(db, club)).filter((v) => v.selected);
  const extra = villages.filter((v) => !v.own).length;
  if (extra > 0) {
    await recordTransaction(db, teamId, "youth_academy", -RECRUIT_FEE * extra, `Nábor žáků (${extra} ${extra === 1 ? "obec" : extra < 5 ? "obce" : "obcí"})`, gameDate);
  }

  const created: ProspectRow[] = [];
  for (const v of villages) {
    const kids = rollKids(rng, expectedKidsFromVillage(v.population, v.competitors));
    for (let i = 0; i < kids && created.length < room; i++) {
      const p = await createProspect(db, rng, club, v.id, 12, gameDate)
        .catch((e) => { logger.warn({ module: M, teamId }, "create prospect", e); return null; });
      if (p) created.push(p);
    }
  }
  logger.info({ module: M, teamId }, `nábor: ${created.length} kluků z ${villages.length} obcí`);
  return created;
}

/** Šance za den, že se mezi nábory přihlásí kluk sám (v průměru jeden za sezónu). */
export const WALK_IN_DAILY_CHANCE = 0.01;

// ── Týdenní provoz a růst ───────────────────────────────────────────────────

/**
 * Týdenní uzávěrka: zaplatí zázemí a posune všechny žáky podle kvality přípravy.
 * Volá ji finance-processor místo dřívější platby za úroveň akademie.
 */
export async function weeklyAcademy(db: D1Database, teamId: string, gameDate: string, opsCostMul: number): Promise<void> {
  const club = await loadClub(db, teamId);
  if (!club) return;
  const program = programOf(club);
  const cost = Math.round(programWeeklyCost(program) * opsCostMul);
  if (cost > 0) {
    const items = ["provoz", program.hall ? "hala" : null, program.bus ? "autobus" : null].filter(Boolean).join(", ");
    await recordTransaction(db, teamId, "youth_academy", -cost, `Žáci (${items})`, gameDate);
  }
  if (!program.upkeep) return;

  const squad = (await activeProspects(db, teamId)).length;
  if (squad === 0) return;
  const trainer = await loadYouthTrainer(db, teamId);
  const q = programQuality({
    program, trainerEffectiveness: trainer?.effectiveness ?? null,
    managerYouth: await loadManagerYouth(db, teamId), squadSize: squad,
  });
  const step = weeklyProgress(q);
  await db.prepare(
    "UPDATE youth_prospects SET progress_current = progress_current + ?, progress_cap = progress_cap + ? WHERE team_id = ? AND status = 'active'",
  ).bind(step.current, step.cap, teamId).run();
}

// ── Nabídky do dorostu ──────────────────────────────────────────────────────

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

/** Napíše SMS od trenéra mládeže do konverzace „Žáci“. */
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
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Trenér mládeže', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
    ).bind(crypto.randomUUID(), convId, body).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(body.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: M, teamId }, "academy SMS", e);
  }
}

/** Hráč z kluka: společný generátor + náskok z let v akademii. Čistě výpočet, nic nezapisuje. */
async function buildGraduate(db: D1Database, p: ProspectRow, district: string) {
  const { identity, size } = await prospectIdentity(db, p.identity_seed, p.home_village_id, district, p.position);
  identity.firstName = p.first_name;
  identity.lastName = p.last_name;
  identity.age = p.age;
  const rng = createRng(cryptoSeed());
  const created = createPlayer(rng, {
    identity, position: p.position as "GK" | "DEF" | "MID" | "FWD", level: levelFromVillageSize(size),
    academy: { current: Math.round(p.progress_current), cap: Math.round(p.progress_cap) + p.gem_cap, talent: [0, 0], gemChance: 0 },
    hiddenTalent: p.hidden_talent,
  });
  const personality = { ...created.personality, patriotism: Math.min(100, created.personality.patriotism + rng.int(10, 20)) };
  const weeklyWage = Math.round((10 + (created.rating / 100) * 400) * GRADUATE_WAGE_FACTOR);
  return { created, personality, weeklyWage };
}

/**
 * Trenér nabídne kluka do dorostu: nabídka v `player_offers` se stejnými údaji, jaké dostane
 * hráč po přijetí. `notify` = SMS (lidský klub, nabídka od trenéra; ne ruční vytažení).
 */
export async function createProspectOffer(
  db: D1Database, teamId: string, prospectId: string, gameDate: string, opts: { notify: boolean },
): Promise<ServiceResult<{ offerId: string }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const p = await db.prepare("SELECT * FROM youth_prospects WHERE id = ? AND team_id = ? AND status = 'active'")
    .bind(prospectId, teamId).first<ProspectRow>();
  if (!p) return { ok: false, status: 404, error: "Kluk u žáků není" };

  const trainer = await loadYouthTrainer(db, teamId);
  const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, trainer?.judgement ?? null);
  if (!canPromote(p.age, estimate)) return { ok: false, status: 409, error: "Na dorost je ještě moc mladý" };

  // Nevyřízená nabídka stejného kluka se zruší, ať nevisí dvě
  await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();

  const { created, personality, weeklyWage } = await buildGraduate(db, p, club.district);
  const message = `${p.first_name} ${p.last_name} je podle mě připravenej na dorost. ${verdictText(estimate)}`;
  const expires = new Date(`${day(gameDate)}T12:00:00Z`);
  expires.setUTCDate(expires.getUTCDate() + 6);
  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO player_offers (id, team_id, source, source_name, message, first_name, last_name, nickname, age, position, overall_rating,
       skills, physical, personality, life_context, avatar, weekly_wage, expires_at, nationality, prospect_id)
     VALUES (?, ?, 'youth', 'Trenér mládeže', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    offerId, teamId, message, p.first_name, p.last_name, p.age, p.position, created.rating,
    JSON.stringify(created.skills), JSON.stringify(created.physical),
    JSON.stringify({ ...personality, hiddenTalent: created.hiddenTalent }),
    JSON.stringify({ ...created.lifeContext, morale: 60, skillsMax: created.skillsMax }),
    JSON.stringify(created.avatar), weeklyWage, expires.toISOString(), created.nationality, p.id,
  ).run();

  const rng = createRng(cryptoSeed());
  await db.prepare("UPDATE youth_prospects SET next_offer_on = ? WHERE id = ?")
    .bind(addDays(gameDate, rng.int(REOFFER_DAYS[0], REOFFER_DAYS[1])), p.id).run();

  if (opts.notify && isHuman(club)) {
    const traits = parseJson<string[]>(p.traits, [], "traits");
    const lastChance = p.age >= 16 ? " Je mu šestnáct, jestli ho do konce sezóny nevezmeš, odejde." : " Když ho teď nevezmeš, nechám ho u žáků a ozvu se zas.";
    await academySms(db, teamId,
      `${p.first_name} ${p.last_name} (${p.age}, ${POSITION_CS[p.position] ?? p.position}${traits.length ? `, ${traits[0]}` : ""}) je podle mě připravenej na dorost. ${verdictText(estimate)} Vzít ho můžeš v Přestupy → Nabídky.${lastChance}`);
  }
  logger.info({ module: M, teamId }, `nabídka do dorostu: ${p.first_name} ${p.last_name} (${p.age}, hodnocení ${created.rating})`);
  return { ok: true, offerId };
}

/** Ruční vytažení kluka do dorostu ze stránky Žáci: nabídka a hned její přijetí. */
export async function promoteProspect(db: D1Database, teamId: string, prospectId: string): Promise<ServiceResult<{ playerId: string }>> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const gameDate = team?.game_date ?? new Date().toISOString();
  const offer = await createProspectOffer(db, teamId, prospectId, gameDate, { notify: false });
  if (!offer.ok) return offer;
  const { acceptPlayerOffer } = await import("../services/player-offer-actions");
  const res = await acceptPlayerOffer(db, teamId, offer.offerId);
  if (!res.ok) return res;
  return { ok: true, playerId: res.playerId };
}

/** Přijetí nabídky z akademie: kluk je teď hráč, u žáků končí. Volá `acceptPlayerOffer`. */
export async function markProspectPromoted(db: D1Database, prospectId: string, playerId: string, gameDate: string): Promise<void> {
  await db.prepare("UPDATE youth_prospects SET status = 'promoted', player_id = ?, left_at = ?, next_offer_on = NULL WHERE id = ?")
    .bind(playerId, day(gameDate), prospectId).run();
}

/** Kluk odchází na trh jako volný hráč: z vlastní vůle klubu, nebo protože mu je přes šestnáct. */
async function releaseToMarket(db: D1Database, club: ClubRow, p: ProspectRow, status: "released" | "aged_out", gameDate: string): Promise<void> {
  await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();
  await db.prepare("UPDATE youth_prospects SET status = ?, left_at = ?, next_offer_on = NULL WHERE id = ?")
    .bind(status, day(gameDate), p.id).run();
  // Dvanáctiletý na trh nepatří, odchází prostě domů
  if (p.age < 15) return;
  const { created, personality, weeklyWage } = await buildGraduate(db, p, club.district);
  const expires = new Date(`${day(gameDate)}T12:00:00Z`);
  expires.setUTCDate(expires.getUTCDate() + 14);
  await db.prepare(
    `INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context,
       avatar, nationality, weekly_wage, source, released_from_team_id, village_id, expires_at, skills_max, hidden_talent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), club.district, p.first_name, p.last_name, p.age, p.position, created.rating,
    JSON.stringify(created.skills), JSON.stringify(created.physical), JSON.stringify(personality),
    JSON.stringify({ ...created.lifeContext, morale: 50, raisedByTeamId: club.id }), JSON.stringify(created.avatar),
    created.nationality, Math.round(weeklyWage / GRADUATE_WAGE_FACTOR), club.id, p.home_village_id, expires.toISOString(),
    JSON.stringify(created.skillsMax), created.hiddenTalent,
  ).run();
}

/** Klub kluka pustí (stránka Žáci). Od patnácti jde na trh, mladší odchází domů. */
export async function releaseProspect(db: D1Database, teamId: string, prospectId: string): Promise<ServiceResult<{ released: true }>> {
  const club = await loadClub(db, teamId);
  if (!club) return { ok: false, status: 404, error: "Tým nenalezen" };
  const p = await db.prepare("SELECT * FROM youth_prospects WHERE id = ? AND team_id = ? AND status = 'active'")
    .bind(prospectId, teamId).first<ProspectRow>();
  if (!p) return { ok: false, status: 404, error: "Kluk u žáků není" };
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  await releaseToMarket(db, club, p, "released", team?.game_date ?? new Date().toISOString());
  return { ok: true, released: true };
}

/**
 * Denní tick: trenér nabídne kluka, jehož den přišel (nejvýš jednoho denně), a občas se
 * přihlásí kluk sám z obcí, kde klub nabírá.
 */
export async function dailyAcademy(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<{ offered: number; walkIns: number }> {
  const club = await loadClub(db, teamId);
  if (!club || !club.academy_upkeep) return { offered: 0, walkIns: 0 };
  let offered = 0;
  let walkIns = 0;

  const due = await db.prepare(
    `SELECT p.id FROM youth_prospects p
      WHERE p.team_id = ? AND p.status = 'active' AND p.next_offer_on IS NOT NULL AND p.next_offer_on <= ?
        AND NOT EXISTS (SELECT 1 FROM player_offers o WHERE o.prospect_id = p.id AND o.status = 'pending')
      ORDER BY p.next_offer_on LIMIT 1`,
  ).bind(teamId, day(gameDate)).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "due prospects", e); return null; });
  if (due) {
    const res = await createProspectOffer(db, teamId, due.id, gameDate, { notify: true });
    if (res.ok) offered++;
  }

  if (rng.random() < WALK_IN_DAILY_CHANCE) {
    const squad = (await activeProspects(db, teamId)).length;
    const villages = (await recruitVillages(db, club)).filter((v) => v.selected && v.expectedKids > 0);
    if (squad < MAX_SQUAD && villages.length > 0) {
      const v = rng.weighted(Object.fromEntries(villages.map((x) => [x.id, x.expectedKids])));
      const kid = await createProspect(db, rng, club, v, rng.int(12, 13), gameDate)
        .catch((e) => { logger.warn({ module: M, teamId }, "walk-in prospect", e); return null; });
      if (kid) {
        walkIns++;
        if (isHuman(club)) {
          const home = villages.find((x) => x.id === v);
          await academySms(db, teamId, `Na trénink přišel sám od sebe ${kid.first_name} ${kid.last_name} (${kid.age})${home && !home.own ? ` z obce ${home.name}` : ""}. Nechal jsem ho u nás.`);
        }
      }
    }
  }
  return { offered, walkIns };
}

// ── Konec sezóny ────────────────────────────────────────────────────────────

/**
 * Fáze `academy` na konci sezóny (před letním stárnutím hráčů): šestnáctiletí, které klub
 * nevzal, odcházejí na trh, někdo skončí, ostatní zestárnou o rok, čtrnáctiletým se ukáže
 * talent a přijde nový ročník z náboru. Lidský klub dostane jednu SMS se souhrnem.
 */
export async function seasonEndAcademy(db: D1Database, rng: Rng, teamId: string, gameDate: string): Promise<void> {
  const club = await loadClub(db, teamId);
  if (!club) return;
  const program = programOf(club);
  const prospects = await activeProspects(db, teamId);
  const homes = new Map<string, { lat: number; lng: number }>();
  for (const id of new Set(prospects.map((p) => p.home_village_id).filter((x): x is string => !!x))) {
    const v = await villageInfoFor(db, id);
    if (v) homes.set(id, v);
  }
  const trainer = await loadYouthTrainer(db, teamId);

  const left: string[] = [];
  const quit: string[] = [];
  const lastYear: string[] = [];
  for (const p of prospects) {
    const name = `${p.first_name} ${p.last_name}`;
    if (p.age >= 16) {
      await releaseToMarket(db, club, p, "aged_out", gameDate);
      left.push(name);
      continue;
    }
    const home = p.home_village_id ? homes.get(p.home_village_id) : undefined;
    const km = home ? distanceKm(club, home) : 0;
    if (!program.upkeep || rng.random() < quitChance(p.commitment, km, program.bus)) {
      await db.prepare("UPDATE player_offers SET status = 'expired' WHERE prospect_id = ? AND status = 'pending'").bind(p.id).run();
      await db.prepare("UPDATE youth_prospects SET status = 'quit', left_at = ?, next_offer_on = NULL WHERE id = ?").bind(day(gameDate), p.id).run();
      quit.push(name);
      continue;
    }
    const age = p.age + 1;
    const talent = age === 14 ? Math.max(0, Math.min(100, p.hidden_talent + talentShiftAt14(rng))) : p.hidden_talent;
    const commitment = Math.max(10, Math.min(95, p.commitment + rng.int(-12, 10)));
    const estimate = estimatedTalent(talent, age, p.estimate_offset, trainer?.judgement ?? null);
    const nextOffer = p.next_offer_on ?? (canPromote(age, estimate) ? addDays(gameDate, firstOfferDay(rng, FALLBACK_SEASON_DAYS)) : null);
    await db.prepare("UPDATE youth_prospects SET age = ?, hidden_talent = ?, commitment = ?, next_offer_on = ? WHERE id = ?")
      .bind(age, talent, commitment, nextOffer, p.id).run();
    if (age === 16) lastYear.push(name);
  }

  const recruits = await recruitClass(db, rng, teamId, gameDate);

  if (!isHuman(club)) return;
  const parts: string[] = [];
  if (recruits.length) parts.push(`Z náboru přišli noví kluci: ${recruits.map((r) => `${r.first_name} ${r.last_name}`).join(", ")}.`);
  else if (program.upkeep) parts.push("Z náboru letos nepřišel nikdo, zkus nabírat i v okolních obcích.");
  if (quit.length) parts.push(`Skončili: ${quit.join(", ")}.`);
  if (left.length) parts.push(`Do dorostu jsi nevzal, tak odešli: ${left.join(", ")}.`);
  if (lastYear.length) parts.push(`Šestnáct je teď: ${lastYear.join(", ")}. Jestli je do konce sezóny nevezmeš, odejdou.`);
  if (parts.length) await academySms(db, teamId, `Konec sezóny u žáků. ${parts.join(" ")}`);
}

// ── Pohled pro stránku Žáci ─────────────────────────────────────────────────

export interface ProspectView {
  id: string;
  name: string;
  age: number;
  position: string | null;
  village: string | null;
  traits: string[];
  verdict: string;
  readiness: string;
  mood: string;
  canPromote: boolean;
  /** Má otevřenou nabídku od trenéra. */
  offered: boolean;
}

export async function loadAcademyView(db: D1Database, teamId: string) {
  const club = await loadClub(db, teamId);
  if (!club) return null;
  const program = programOf(club);
  const prospects = await activeProspects(db, teamId);
  const trainer = await loadYouthTrainer(db, teamId);
  const managerYouth = await loadManagerYouth(db, teamId);
  const villages = await recruitVillages(db, club);
  const names = new Map(villages.map((v) => [v.id, v.name]));
  const missing = [...new Set(prospects.map((p) => p.home_village_id).filter((x): x is string => !!x && !names.has(x)))];
  for (const id of missing) {
    const row = await db.prepare("SELECT name FROM villages WHERE id = ?").bind(id).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "village name", e); return null; });
    if (row) names.set(id, row.name);
  }
  const pending = await db.prepare("SELECT prospect_id FROM player_offers WHERE team_id = ? AND status = 'pending' AND prospect_id IS NOT NULL")
    .bind(teamId).all<{ prospect_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "pending academy offers", e); return { results: [] as { prospect_id: string }[] }; });
  const offered = new Set(pending.results.map((r) => r.prospect_id));
  const u21 = await db.prepare("SELECT 1 AS ok FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ ok: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "check u21", e); return null; });

  // Bez kluků se kvalita hodnotí, jako by jich bylo dost: malý počet řeší zvlášť `smallSquad`
  const q = programQuality({ program, trainerEffectiveness: trainer?.effectiveness ?? null, managerYouth, squadSize: prospects.length || MIN_SQUAD });
  const view: ProspectView[] = prospects.map((p) => {
    const estimate = estimatedTalent(p.hidden_talent, p.age, p.estimate_offset, trainer?.judgement ?? null);
    return {
      id: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age,
      position: positionVisible(p.age) ? p.position : null,
      village: p.home_village_id ? names.get(p.home_village_id) ?? null : null,
      traits: parseJson<string[]>(p.traits, [], "traits"),
      verdict: verdictText(estimate), readiness: readinessText(p.age, estimate, p.progress_current),
      mood: commitmentText(p.commitment), canPromote: canPromote(p.age, estimate), offered: offered.has(p.id),
    };
  });

  return {
    program,
    costs: { ...PROGRAM_COST, recruitFee: RECRUIT_FEE },
    weeklyCost: programWeeklyCost(program),
    trainer: trainer ? { hired: true } : { hired: false },
    /** Kvalita přípravy slovy, ne číslem. */
    quality: !program.upkeep ? "Žáci nefungují, klub neplatí provoz." : q >= 1.15 ? "Příprava jako v krajském klubu." : q >= 0.9 ? "Slušná příprava." : q >= 0.7 ? "Příprava na koleně." : "Kluci spíš jen kopou do míče.",
    smallSquad: prospects.length > 0 && prospects.length < MIN_SQUAD,
    hasU21: !!u21,
    maxRecruitVillages: MAX_RECRUIT_VILLAGES,
    radiusKm: RECRUIT_RADIUS_KM,
    villages: villages.slice(0, 30),
    prospects: view,
  };
}

// ── Přechod ze staré akademie ───────────────────────────────────────────────

/** Kolik kluků a jaký náskok dostane klub podle dřívější úrovně investice. */
export const LEGACY_SEED: Record<string, { kids: number; ages: number[]; years: number; program: AcademyProgram } | undefined> = {
  high: { kids: 14, ages: [12, 13, 14, 15], years: 2, program: { upkeep: true, hall: true, bus: true } },
  medium: { kids: 10, ages: [12, 13, 14, 15], years: 1, program: { upkeep: true, hall: false, bus: false } },
  minimal: { kids: 6, ages: [12, 13], years: 0, program: { upkeep: true, hall: false, bus: false } },
};

/**
 * Jednorázový přechod: klub, který platil starou akademii, dostane rozjetou partu. Idempotentní,
 * klub, který už žáky má, přeskočí. Nábor jde z vlastní obce a nejlepších okolních.
 */
export async function seedFromLegacy(db: D1Database, teamId: string, gameDate: string): Promise<{ created: number; skipped?: string }> {
  const club = await loadClub(db, teamId);
  if (!club) return { created: 0, skipped: "no club" };
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE team_id = ?").bind(teamId).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return { created: 0, skipped: "has prospects" };
  const legacy = await db.prepare("SELECT youth_investment FROM teams WHERE id = ?").bind(teamId).first<{ youth_investment: string | null }>();
  const plan = LEGACY_SEED[legacy?.youth_investment ?? "none"];
  if (!plan) return { created: 0, skipped: "no legacy academy" };

  const rng = createRng(cryptoSeed());
  await db.prepare("UPDATE teams SET academy_upkeep = ?, academy_hall = ?, academy_bus = ? WHERE id = ?")
    .bind(Number(plan.program.upkeep), Number(plan.program.hall), Number(plan.program.bus), teamId).run();
  const villages = await recruitVillages(db, club);
  const neighbours = villages.filter((v) => !v.own && v.expectedKids > 0).slice(0, 2);
  await db.prepare("UPDATE teams SET academy_recruit_villages = ? WHERE id = ?").bind(JSON.stringify(neighbours.map((v) => v.id)), teamId).run();
  const pool = [villages.find((v) => v.own), ...neighbours].filter((v): v is RecruitVillage => !!v);
  const weights = Object.fromEntries(pool.map((v) => [v.id, Math.max(0.2, v.expectedKids)]));

  const trainer = await loadYouthTrainer(db, teamId);
  const q = programQuality({ program: plan.program, trainerEffectiveness: trainer?.effectiveness ?? null, managerYouth: await loadManagerYouth(db, teamId), squadSize: plan.kids });
  const step = weeklyProgress(q);
  let created = 0;
  for (let i = 0; i < plan.kids; i++) {
    const age = plan.ages[i % plan.ages.length];
    const p = await createProspect(db, rng, club, rng.weighted(weights), age, gameDate);
    if (!p) continue;
    const years = Math.min(plan.years, age - 12);
    const estimate = estimatedTalent(p.hidden_talent, age, p.estimate_offset, trainer?.judgement ?? null);
    const nextOffer = canPromote(age, estimate) ? addDays(gameDate, firstOfferDay(rng, await remainingSeasonDays(db, club.league_id, gameDate))) : null;
    await db.prepare("UPDATE youth_prospects SET progress_current = ?, progress_cap = ?, next_offer_on = ? WHERE id = ?")
      .bind(step.current * 15 * years, step.cap * 15 * years, nextOffer, p.id).run();
    created++;
  }
  if (isHuman(club)) {
    await academySms(db, teamId, `Akademie se mění: místo úrovní teď máš vlastní žáky. Za to, co jsi do mládeže sypal, máš partu ${created} kluků. Najdeš je v U21 → Žáci. Starší kluky ti budu průběžně nabízet do dorostu.`);
  }
  return { created };
}

export { remainingSeasonDays };

/** Zázemí jako jedna úroveň pro AI trenéra (ACADEMY_CHOICES v ai-coach/weekly-decision.ts). */
export type ProgramLevel = "none" | "minimal" | "medium" | "high";

export function programLevel(p: AcademyProgram): ProgramLevel {
  if (!p.upkeep) return "none";
  if (p.hall && p.bus) return "high";
  if (p.hall) return "medium";
  return "minimal";
}

export function programFromLevel(level: ProgramLevel): AcademyProgram {
  return { upkeep: level !== "none", hall: level === "medium" || level === "high", bus: level === "high" };
}

/** Pro týdenní správu AI klubu: zázemí, počet žáků a obce pro nábor. */
export async function recruitVillagesForTeam(db: D1Database, teamId: string) {
  const club = await loadClub(db, teamId);
  if (!club) return null;
  return { program: programOf(club), prospects: (await activeProspects(db, teamId)).length, villages: await recruitVillages(db, club) };
}
