/**
 * Skaut na úkolu (spec 2026-10-04): manažer mu zadá post, věk, okruh a počet týdnů,
 * skaut každé pondělí objede 2–4 kluby mimo hru v okruhu a pošle nejvýš jedno hlášení.
 *
 * Brzdy balancu: kvalita klubů mimo hru podle velikosti obce (candidates.ts), hlásí se jen
 * hráč, jehož odhad dosáhne aspoň jedenáctého nejlepšího v kádru, cestovné každý týden,
 * hlášení platí deset dní a mezitím hráče může sebrat jiný klub.
 */

import {
  SCOUT_AGE_MAX, SCOUT_AGE_MIN, SCOUT_POSITIONS, SCOUT_WEEKS_OPTIONS, isYouthScoutTask,
  scoutWeeklyCost, willingnessFromChance,
} from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import { createPlayer, categoryFromVillageSize } from "../generators/create-player";
import { FIRSTNAMES } from "../data/czech-names";
import { shiftForRating } from "../skills/generator";
import { recordTransaction } from "../season/finance-processor";
import { logger } from "../lib/logger";
import { stableSeed } from "../lib/scout-estimate";
import { initAiSellerState } from "../transfers/ai-seller";
import { estimateWillingness, expireNegotiation, type AiNegotiationRow, type PushEnv } from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { haversineKm } from "../transfers/player-agency";
import {
  boundingBox, clubMeanFor, clubRankOf, expectedMatches, loadVillagesInRadius, normal, pickClubsToVisit,
  villageClubName, type VillageInRange, CLUB_AGE_MAX, CLUB_AGE_MIN,
} from "./candidates";
import { potentialRange, rangeMid, ratingRange, type Range } from "./fog";
import { clubValuation } from "./youth-growth";
import { emptyWeekSms, finishedSms, reportCons, reportPros, reportSms, revisitSms } from "./report-text";

/** Hlášení platí deset dní (odhad, spec). */
export const SCOUT_REPORT_TTL_DAYS = 10;
/** Opakovaná návštěva prodlouží platnost hlášení o týden. */
const REVISIT_EXTEND_DAYS = 7;
/** Denní šance, že hráče z hlášení sebere jiný klub (odhad, spec). */
export const SCOUT_SNAP_UP_DAILY_CHANCE = 0.03;
/** Rozptyl cíle při vzniku hráče; generátor sám přidá ~3,3, dohromady sd 4,5 (spec). */
const TARGET_SD = 3.1;
/** Nejvýš tolik hráčů z jednoho kádru odpovídá úkolu. */
const MAX_MATCHES_PER_CLUB = 4;
/**
 * Klub mimo hru není silnější než průměr ligy kupujícího + 2 body. Vzorec podle velikosti
 * obce je nafitovaný na jižní Čechy, kde vychází Písek 48,7 a Strakonice 47,2 proti průměru
 * Prachatic 47,4. Pražské městské části mají desítky tisíc obyvatel a bez stropu by kluby
 * mimo hru byly o deset bodů nad pražskou ligou (průměr 39). Strop je odhad, ne data.
 */
const CLUB_MEAN_OVER_LEAGUE = 2;
/** Názor na potenciál dává skaut jen u mladých; u dospělých by model růstu sliboval nesmysly. */
const POTENTIAL_MAX_AGE = 21;

export interface AssignmentRow {
  id: string;
  team_id: string;
  staff_id: string;
  position: string | null;
  age_min: number;
  age_max: number;
  radius_km: number;
  weekly_cost: number;
  weeks_total: number;
  weeks_worked: number;
  last_work_game_date: string | null;
  reports_sent: number;
  clubs_visited: number;
  revisit_report_id: string | null;
  status: "active" | "finished" | "cancelled";
  end_reason: string | null;
  started_game_date: string;
  created_at: string;
  closed_at: string | null;
}

interface ScoutRow {
  id: string; first_name: string; last_name: string; judgement: number; communication: number;
}

type Fail = { ok: false; status: 400 | 404 | 409; error: string };
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });

export function scoutEffectiveness(s: { judgement: number; communication: number }): number {
  return (2 * (s.judgement ?? 5) + (s.communication ?? 5)) / 3;
}

export async function loadTeamScout(db: D1Database, teamId: string): Promise<ScoutRow | null> {
  return db.prepare(
    "SELECT id, first_name, last_name, judgement, communication FROM staff_members WHERE team_id = ? AND role = 'skaut' LIMIT 1",
  ).bind(teamId).first<ScoutRow>();
}

export async function loadActiveAssignment(db: D1Database, teamId: string): Promise<AssignmentRow | null> {
  return db.prepare("SELECT * FROM scout_assignments WHERE team_id = ? AND status = 'active' LIMIT 1").bind(teamId).first<AssignmentRow>();
}

// ─── Zadání a zrušení úkolu ─────────────────────────────────────────────────

export async function createScoutAssignment(db: D1Database, input: {
  teamId: string; position: string | null; ageMin: number; ageMax: number; radiusKm: number; weeks: number; gameDate: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const scout = await loadTeamScout(db, input.teamId);
  if (!scout) return fail(400, "Nemáš skauta. Najmi ho v Zaměstnancích.");
  if (input.position !== null && !(SCOUT_POSITIONS as readonly string[]).includes(input.position)) return fail(400, "Neznámý post.");
  const weeklyCost = scoutWeeklyCost(input.radiusKm);
  if (weeklyCost === null) return fail(400, "Neznámý okruh.");
  if (!(SCOUT_WEEKS_OPTIONS as readonly number[]).includes(input.weeks)) return fail(400, "Neznámá délka úkolu.");
  if (!Number.isInteger(input.ageMin) || !Number.isInteger(input.ageMax)
    || input.ageMin < SCOUT_AGE_MIN || input.ageMax > SCOUT_AGE_MAX || input.ageMin > input.ageMax) {
    return fail(400, `Věk musí být ${SCOUT_AGE_MIN}–${SCOUT_AGE_MAX} a „od“ nejvýš „do“.`);
  }
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO scout_assignments (id, team_id, staff_id, position, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.teamId, scout.id, input.position, input.ageMin, input.ageMax, input.radiusKm, weeklyCost, input.weeks, input.gameDate).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "zadání úkolu", e);
    return fail(409, "Skaut už na jednom úkolu je. Nejdřív ho ukonči.");
  }
  return { ok: true, id };
}

export async function cancelScoutAssignment(db: D1Database, teamId: string, reason: string): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE scout_assignments SET status = 'cancelled', end_reason = ?, revisit_report_id = NULL,
       closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE team_id = ? AND status = 'active'`,
  ).bind(reason, teamId).run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Skaut se má na hráče z hlášení podívat znovu (místo hledání nových, příští pondělí). */
export async function requestRevisit(db: D1Database, teamId: string, reportId: string): Promise<{ ok: true } | Fail> {
  const report = await db.prepare("SELECT id, status FROM scout_reports WHERE id = ? AND team_id = ?").bind(reportId, teamId)
    .first<{ id: string; status: string }>();
  if (!report) return fail(404, "Hlášení nenalezeno.");
  if (report.status !== "active" && report.status !== "negotiating") return fail(409, "Hlášení už neplatí.");
  const res = await db.prepare(
    "UPDATE scout_assignments SET revisit_report_id = ? WHERE team_id = ? AND status = 'active' AND revisit_report_id IS NULL",
  ).bind(reportId, teamId).run();
  if ((res.meta?.changes ?? 0) === 0) {
    const a = await loadActiveAssignment(db, teamId);
    return fail(409, a ? "Skaut už má na příští týden jednu návštěvu naplánovanou." : "Skaut teď nemá úkol. Znovu se podívá jen během úkolu.");
  }
  return { ok: true };
}

// ─── SMS od skauta ──────────────────────────────────────────────────────────

async function sendScoutSms(db: D1Database, teamId: string, sender: string, body: string, reportId?: string): Promise<void> {
  try {
    let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Skaut'")
      .bind(teamId).first<{ id: string }>().then((r) => r?.id ?? null);
    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', 'Skaut', 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      ).bind(convId, teamId).run();
    }
    const metadata = reportId ? { type: "scout_report", reportId } : { type: "staff" };
    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), convId, sender, body, JSON.stringify(metadata)).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(body.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: "scouting" }, "SMS od skauta", e);
  }
}

// ─── Týdenní práce ──────────────────────────────────────────────────────────

/** Jedenáctý nejlepší v kádru: kdo je pod ním, do sestavy se nedostane. */
async function lineupBar(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
     ORDER BY overall_rating DESC LIMIT 1 OFFSET 10`,
  ).bind(teamId).first<{ overall_rating: number }>();
  if (row) return row.overall_rating;
  const min = await db.prepare("SELECT MIN(overall_rating) AS r FROM players WHERE team_id = ?").bind(teamId).first<{ r: number | null }>();
  return min?.r ?? 0;
}

/** Průměr základní jedenáctky (laťka pro mladé: musí mít na to dotáhnout se do ní). */
async function lineupAverage(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT AVG(overall_rating) AS avg FROM (SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
       ORDER BY overall_rating DESC LIMIT 11)`,
  ).bind(teamId).first<{ avg: number | null }>();
  return Math.round(row?.avg ?? 0);
}

/** Průměr dospělých hráčů ligy kupujícího (strop síly klubů mimo hru). */
async function leagueAverage(db: D1Database, teamId: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT AVG(p.overall_rating) AS avg FROM players p JOIN teams t ON t.id = p.team_id
      WHERE t.league_id = (SELECT league_id FROM teams WHERE id = ?)`,
  ).bind(teamId).first<{ avg: number | null }>();
  return row?.avg ?? null;
}

interface Candidate {
  id: string;
  source: "village_club" | "free_agent";
  player: VirtualPlayerData;
  rating: number;
  talent: number;
  skillsMax: Record<string, { current: number; maxPotential: number }>;
  village: { id: string | null; name: string; district: string; lat: number; lng: number } | null;
  clubName: string | null;
  clubMean: number | null;
  clubRank: number | null;
  distanceKm: number;
  freeAgentId: string | null;
  ratingRange: Range;
  potential: Range | null;
  estimate: number;
}

export interface ScoutWorkResult { teams: number; reports: number; revisits: number; finished: number; skippedNoMoney: number }

/**
 * Pondělní práce skautů na úkolech. Idempotentní přes `last_work_game_date`; `force`
 * (admin testování) pracuje znovu i týž den.
 */
export async function runScoutWork(env: Pick<Bindings, "DB">, opts: { gameDate: string; teamId?: string; force?: boolean }): Promise<ScoutWorkResult> {
  const db = env.DB;
  const day = opts.gameDate.slice(0, 10);
  const result: ScoutWorkResult = { teams: 0, reports: 0, revisits: 0, finished: 0, skippedNoMoney: 0 };
  const rows = await db.prepare(
    `SELECT * FROM scout_assignments WHERE status = 'active'${opts.teamId ? " AND team_id = ?" : ""}`,
  ).bind(...(opts.teamId ? [opts.teamId] : [])).all<AssignmentRow>()
    .catch((e) => { logger.warn({ module: "scouting" }, "načtení úkolů", e); return { results: [] as AssignmentRow[] }; });

  for (const a of rows.results) {
    try {
      const claim = await db.prepare(
        `UPDATE scout_assignments SET last_work_game_date = ? WHERE id = ? AND status = 'active'
           AND (last_work_game_date IS NULL OR last_work_game_date != ? OR ? = 1)`,
      ).bind(day, a.id, day, opts.force ? 1 : 0).run();
      if ((claim.meta?.changes ?? 0) === 0) continue;
      result.teams++;
      await workOneWeek(db, a, opts.gameDate, result);
    } catch (e) {
      logger.error({ module: "scouting" }, `práce skauta ${a.id}`, e);
    }
  }
  return result;
}

async function workOneWeek(db: D1Database, a: AssignmentRow, gameDate: string, result: ScoutWorkResult): Promise<void> {
  const scout = await db.prepare(
    "SELECT id, first_name, last_name, judgement, communication FROM staff_members WHERE id = ? AND team_id = ? AND role = 'skaut'",
  ).bind(a.staff_id, a.team_id).first<ScoutRow>();
  if (!scout) {
    await cancelScoutAssignment(db, a.team_id, "scout_left");
    return;
  }
  const sender = `${scout.first_name} ${scout.last_name}`;
  const eff = scoutEffectiveness(scout);
  const rng = createRng(cryptoSeed());

  const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(a.team_id).first<{ budget: number }>();
  let worked = false;
  let visited = 0;
  let reported = 0;
  if (!budget || budget.budget < a.weekly_cost) {
    result.skippedNoMoney++;
    await sendScoutSms(db, a.team_id, sender, `⛽ Na cestovné (${a.weekly_cost.toLocaleString("cs-CZ")} Kč) v klubu nejsou peníze. Tenhle týden zůstávám doma.`);
  } else {
    await recordTransaction(db, a.team_id, "scout_travel", -a.weekly_cost, `Cestovné skauta (okruh ${a.radius_km} km)`, gameDate, a.id);
    worked = true;
    if (a.revisit_report_id && await revisit(db, a, eff, sender)) {
      result.revisits++;
    } else {
      const found = await search(db, a, eff, sender, rng, gameDate);
      visited = found.visited;
      reported = found.reported ? 1 : 0;
      result.reports += reported;
    }
  }

  const weeksWorked = a.weeks_worked + 1;
  const finished = weeksWorked >= a.weeks_total;
  await db.prepare(
    `UPDATE scout_assignments SET weeks_worked = ?, clubs_visited = clubs_visited + ?, reports_sent = reports_sent + ?,
       revisit_report_id = CASE WHEN ? = 1 THEN NULL ELSE revisit_report_id END,
       status = CASE WHEN ? = 1 THEN 'finished' ELSE status END,
       end_reason = CASE WHEN ? = 1 THEN 'done' ELSE end_reason END,
       closed_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%SZ','now') ELSE closed_at END
     WHERE id = ?`,
  ).bind(weeksWorked, visited, reported, worked ? 1 : 0, finished ? 1 : 0, finished ? 1 : 0, finished ? 1 : 0, a.id).run();
  if (finished) {
    result.finished++;
    await sendScoutSms(db, a.team_id, sender, finishedSms(a.clubs_visited + visited, a.reports_sent + reported));
  }
}

async function revisit(db: D1Database, a: AssignmentRow, eff: number, sender: string): Promise<boolean> {
  const r = await db.prepare(
    "SELECT id, player_data, visits, age, position, expires_at FROM scout_reports WHERE id = ? AND team_id = ? AND status IN ('active','negotiating')",
  ).bind(a.revisit_report_id, a.team_id).first<{ id: string; player_data: string; visits: number; age: number; position: string; expires_at: string }>();
  if (!r) return false;
  let player: VirtualPlayerData;
  try { player = JSON.parse(r.player_data) as VirtualPlayerData; } catch (e) {
    logger.warn({ module: "scouting" }, "parse player_data při návštěvě", e);
    return false;
  }
  const visits = r.visits + 1;
  const rr = ratingRange(player.overallRating, eff, visits, r.id);
  const pr = r.age <= POTENTIAL_MAX_AGE
    ? potentialRange({
      age: r.age, rating: player.overallRating, position: r.position, talent: player.hiddenTalent ?? 0, skillsMax: player.skillCaps ?? {},
    }, eff, visits, r.id)
    : null;
  const extended = new Date(Math.max(new Date(r.expires_at).getTime(), Date.now() + REVISIT_EXTEND_DAYS * 86_400_000)).toISOString();
  await db.prepare(
    "UPDATE scout_reports SET visits = ?, rating_lo = ?, rating_hi = ?, potential_lo = ?, potential_hi = ?, expires_at = ? WHERE id = ?",
  ).bind(visits, rr.lo, rr.hi, pr?.lo ?? null, pr?.hi ?? null, extended, r.id).run();
  await sendScoutSms(db, a.team_id, sender, revisitSms({
    name: `${player.firstName} ${player.lastName}`, ratingLo: rr.lo, ratingHi: rr.hi,
    potentialLo: pr?.lo ?? null, potentialHi: pr?.hi ?? null, youth: isYouthScoutTask(r.age),
  }), r.id);
  return true;
}

async function search(db: D1Database, a: AssignmentRow, eff: number, sender: string, rng: Rng, gameDate: string): Promise<{ visited: number; reported: boolean }> {
  const home = await db.prepare(
    "SELECT v.id, v.lat, v.lng, v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(a.team_id).first<{ id: string; lat: number; lng: number; district: string }>();
  if (!home) return { visited: 0, reported: false };

  const youth = isYouthScoutTask(a.age_max);
  const villages = await loadVillagesInRadius(db, home, a.radius_km);
  const visitCount = Math.round(2 * (1 + eff / 20));
  const visited = pickClubsToVisit(rng, villages, visitCount);

  const candidates: Candidate[] = [];
  const names = new Map<string, Awaited<ReturnType<typeof namesFor>>>();
  const league = await leagueAverage(db, a.team_id);
  const meanCap = league != null ? league + CLUB_MEAN_OVER_LEAGUE : Number.POSITIVE_INFINITY;
  for (const v of visited) {
    if (!names.has(v.district)) names.set(v.district, await namesFor(db, v.district));
    candidates.push(...villageCandidates(rng, v, a, eff, names.get(v.district)!, meanCap));
  }
  candidates.push(...await freeAgentCandidates(db, a, home, eff, rng));

  // Dospělý musí mít aspoň na jedenáctého nejlepšího v kádru, mladý na průměr sestavy:
  // jeho odhad je potenciál a model růstu je spíš optimistický.
  const bar = youth ? await lineupAverage(db, a.team_id) : await lineupBar(db, a.team_id);
  const best = candidates
    .filter((c) => c.estimate >= bar)
    .sort((x, y) => y.estimate - x.estimate)[0];

  if (!best) {
    await sendScoutSms(db, a.team_id, sender, emptyWeekSms(rng, visited.map((v) => v.name)));
    return { visited: visited.length, reported: false };
  }
  await createReport(db, a, best, sender, rng, youth, gameDate);
  return { visited: visited.length, reported: true };
}

async function namesFor(db: D1Database, district: string) {
  const { getDistrictDataFromDB } = await import("../data/districts");
  const data = await getDistrictDataFromDB(db, district);
  return {
    surnameData: { surnames: data.surnames, female_forms: {} as Record<string, string> },
    firstnameData: { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> },
  };
}

function villageCandidates(
  rng: Rng, v: VillageInRange, a: AssignmentRow, eff: number, names: Awaited<ReturnType<typeof namesFor>>, meanCap: number,
): Candidate[] {
  const mean = Math.min(clubMeanFor(v.population), meanCap);
  const expected = expectedMatches(a.position, a.age_min, a.age_max);
  const count = Math.min(MAX_MATCHES_PER_CLUB, Math.floor(expected) + (rng.random() < expected - Math.floor(expected) ? 1 : 0));
  const youth = isYouthScoutTask(a.age_max);
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const position = (a.position ?? rng.weighted({ GK: 2, DEF: 6, MID: 6, FWD: 4 })) as "GK" | "DEF" | "MID" | "FWD";
    const age = rng.int(Math.max(CLUB_AGE_MIN, a.age_min), Math.min(CLUB_AGE_MAX, a.age_max));
    const target = mean + normal(rng) * TARGET_SD;
    const created = createPlayer(rng, {
      position, age, level: "village",
      village: { region_code: v.district, category: categoryFromVillageSize(v.size), population: v.population, district: v.district },
      names, shift: shiftForRating("village", position, 27, target),
    });
    const id = crypto.randomUUID();
    const clubName = villageClubName(v);
    const player: VirtualPlayerData = {
      firstName: created.firstName, lastName: created.lastName, age: created.age, position,
      overallRating: created.rating, skills: created.skills, physical: created.physical, personality: created.personality,
      weeklyWage: Math.round(10 + (created.rating / 100) * 400), avatar: created.avatar, nationality: created.nationality,
      fromTeam: clubName, fromCity: v.name, fromDistrict: v.district,
      skillCaps: created.skillsMax as Record<string, { current: number; maxPotential: number }>, hiddenTalent: created.hiddenTalent,
      occupation: created.lifeContext.occupation,
    };
    out.push(withEstimate({
      id, source: "village_club", player, rating: created.rating, talent: created.hiddenTalent,
      skillsMax: player.skillCaps!, village: { id: v.id, name: v.name, district: v.district, lat: v.lat, lng: v.lng },
      clubName, clubMean: Math.round(mean), clubRank: clubRankOf(rng, created.rating, mean), distanceKm: v.distanceKm,
      freeAgentId: null,
    }, eff, youth));
  }
  return out;
}

function withEstimate(c: Omit<Candidate, "ratingRange" | "potential" | "estimate">, eff: number, youth: boolean): Candidate {
  const rr = ratingRange(c.rating, eff, 1, c.id);
  const pr = c.player.age <= POTENTIAL_MAX_AGE
    ? potentialRange({ age: c.player.age, rating: c.rating, position: c.player.position, talent: c.talent, skillsMax: c.skillsMax }, eff, 1, c.id)
    : null;
  const estimate = youth && pr ? rangeMid(pr) : rangeMid(rr);
  return { ...c, ratingRange: rr, potential: pr, estimate };
}

interface FreeAgentRow {
  id: string; district: string; first_name: string; last_name: string; age: number; position: string; overall_rating: number;
  skills: string; physical: string; personality: string; life_context: string; avatar: string; nationality: string | null;
  weekly_wage: number; hidden_talent: number | null; skills_max: string | null; rejected_by: string | null;
  v_id: string; v_name: string; lat: number; lng: number;
}

/** Volní hráči z jiných okresů v okruhu (z vlastního okresu je manažer vidí sám). */
async function freeAgentCandidates(
  db: D1Database, a: AssignmentRow, home: { id: string; lat: number; lng: number; district: string }, eff: number, rng: Rng,
): Promise<Candidate[]> {
  const box = boundingBox(home.lat, home.lng, a.radius_km);
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(a.team_id).first<{ game_date: string | null }>();
  const rows = await db.prepare(
    `SELECT fa.id, fa.district, fa.first_name, fa.last_name, fa.age, fa.position, fa.overall_rating, fa.skills, fa.physical,
            fa.personality, fa.life_context, fa.avatar, fa.nationality, fa.weekly_wage, fa.hidden_talent, fa.skills_max, fa.rejected_by,
            v.id AS v_id, v.name AS v_name, v.lat, v.lng
       FROM free_agents fa JOIN villages v ON v.id = fa.village_id
      WHERE fa.district != ? AND fa.expires_at > ? AND COALESCE(fa.is_celebrity, 0) = 0
        AND fa.age BETWEEN ? AND ? ${a.position ? "AND fa.position = ?" : ""}
        AND v.lat BETWEEN ? AND ? AND v.lng BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM scout_reports sr WHERE sr.free_agent_id = fa.id AND sr.team_id = ?)`,
  ).bind(
    home.district, team?.game_date ?? new Date().toISOString(), a.age_min, a.age_max,
    ...(a.position ? [a.position] : []), box.minLat, box.maxLat, box.minLng, box.maxLng, a.team_id,
  ).all<FreeAgentRow>()
    .catch((e) => { logger.warn({ module: "scouting" }, "volní hráči v okruhu", e); return { results: [] as FreeAgentRow[] }; });

  const youth = isYouthScoutTask(a.age_max);
  const out: Candidate[] = [];
  for (const fa of rows.results) {
    const distanceKm = Math.round(haversineKm(home.lat, home.lng, fa.lat, fa.lng));
    if (distanceKm > a.radius_km) continue;
    try {
      if ((JSON.parse(fa.rejected_by ?? "[]") as string[]).includes(a.team_id)) continue;
      const skillsMax = JSON.parse(fa.skills_max ?? "{}") as Record<string, { current: number; maxPotential: number }>;
      const player: VirtualPlayerData = {
        firstName: fa.first_name, lastName: fa.last_name, age: fa.age, position: fa.position, overallRating: fa.overall_rating,
        skills: JSON.parse(fa.skills), physical: JSON.parse(fa.physical), personality: JSON.parse(fa.personality),
        weeklyWage: fa.weekly_wage, avatar: JSON.parse(fa.avatar), nationality: fa.nationality ?? "CZ",
        fromCity: fa.v_name, fromDistrict: fa.district, skillCaps: skillsMax, hiddenTalent: fa.hidden_talent ?? 0,
      };
      out.push(withEstimate({
        id: crypto.randomUUID(), source: "free_agent", player, rating: fa.overall_rating, talent: fa.hidden_talent ?? 0, skillsMax,
        village: { id: fa.v_id, name: fa.v_name, district: fa.district, lat: fa.lat, lng: fa.lng },
        clubName: null, clubMean: null, clubRank: null, distanceKm, freeAgentId: fa.id,
      }, eff, youth));
    } catch (e) {
      logger.warn({ module: "scouting" }, `volný hráč ${fa.id}`, e);
    }
  }
  // Skaut volné hráče nepotkává všechny: nejvýš jednoho za týden, náhodně.
  return out.length > 0 ? [out[rng.int(0, out.length - 1)]] : [];
}

async function createReport(db: D1Database, a: AssignmentRow, c: Candidate, sender: string, rng: Rng, youth: boolean, gameDate: string): Promise<void> {
  const p = c.player;
  const askHint = c.source === "village_club"
    ? Math.round(initAiSellerState({
      stance: "poached", clubRank: c.clubRank ?? 12,
      marketValue: clubValuation({ age: p.age, rating: p.overallRating, position: p.position, talent: p.hiddenTalent ?? 0, skillsMax: p.skillCaps ?? {} }),
      seed: stableSeed(`${c.id}:${a.team_id}`),
    }).ask / 1000) * 1000
    : null;
  const chance = await estimateWillingness(db, a.team_id, p, c.village?.district ?? null,
    c.village ? { lat: c.village.lat, lng: c.village.lng } : null, c.clubMean)
    .catch((e) => { logger.warn({ module: "scouting" }, "odhad ochoty do hlášení", e); return null; });
  const subject = { position: p.position, age: p.age, skills: p.skills, personality: p.personality, distanceKm: c.distanceKm };
  const expiresAt = new Date(Date.now() + SCOUT_REPORT_TTL_DAYS * 86_400_000).toISOString();

  await db.prepare(
    `INSERT INTO scout_reports (id, team_id, assignment_id, source, village_id, club_name, club_city, district, distance_km,
       free_agent_id, player_data, first_name, last_name, age, position, rating_lo, rating_hi, potential_lo, potential_hi,
       visits, club_rank, club_mean, ask_hint, pros, cons, willingness, expires_at, created_game_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    c.id, a.team_id, a.id, c.source, c.village?.id ?? null, c.clubName, c.village?.name ?? null, c.village?.district ?? null,
    c.distanceKm, c.freeAgentId, JSON.stringify(p), p.firstName, p.lastName, p.age, p.position,
    c.ratingRange.lo, c.ratingRange.hi, c.potential?.lo ?? null, c.potential?.hi ?? null,
    c.clubRank, c.clubMean, askHint, JSON.stringify(reportPros(subject)), JSON.stringify(reportCons(subject)),
    chance != null ? willingnessFromChance(chance) : null, expiresAt, gameDate.slice(0, 10),
  ).run();

  await sendScoutSms(db, a.team_id, sender, reportSms(rng, {
    name: `${p.firstName} ${p.lastName}`, age: p.age, position: p.position,
    ratingLo: c.ratingRange.lo, ratingHi: c.ratingRange.hi, potentialLo: c.potential?.lo ?? null, potentialHi: c.potential?.hi ?? null,
    youth, source: c.source, clubName: c.clubName, villageName: c.village?.name ?? null, district: c.village?.district ?? null, askHint,
  }), c.id);
}

// ─── Denní údržba hlášení ───────────────────────────────────────────────────

/**
 * Prošlá hlášení a hráči, které mezitím sebral jiný klub. Platnost je v reálném čase stejně
 * jako inzeráty na trhu (herní den se od reálného liší jen pevným posunem).
 */
export async function maintainScoutReports(db: D1Database, env: PushEnv | undefined, now = new Date()): Promise<{ expired: number; gone: number }> {
  const nowIso = now.toISOString();
  const expired = await db.prepare(
    "UPDATE scout_reports SET status = 'expired', resolved_at = ? WHERE status = 'active' AND expires_at < ?",
  ).bind(nowIso, nowIso).run();

  // Volný hráč, který z poolu zmizel (podepsal jinde nebo vypršel).
  await db.prepare(
    `UPDATE scout_reports SET status = 'gone', resolved_at = ?
     WHERE status = 'active' AND source = 'free_agent' AND NOT EXISTS (SELECT 1 FROM free_agents fa WHERE fa.id = scout_reports.free_agent_id)`,
  ).bind(nowIso).run();

  const live = await db.prepare(
    "SELECT id, status, negotiation_id FROM scout_reports WHERE status IN ('active','negotiating') AND source = 'village_club'",
  ).all<{ id: string; status: string; negotiation_id: string | null }>();
  const rng = createRng(cryptoSeed());
  let gone = 0;
  for (const r of live.results) {
    if (rng.random() >= SCOUT_SNAP_UP_DAILY_CHANCE) continue;
    const res = await db.prepare("UPDATE scout_reports SET status = 'gone', resolved_at = ? WHERE id = ? AND status = ?")
      .bind(nowIso, r.id, r.status).run();
    if ((res.meta?.changes ?? 0) === 0) continue;
    gone++;
    if (r.negotiation_id) {
      const row = await db.prepare("SELECT * FROM ai_negotiations WHERE id = ?").bind(r.negotiation_id).first<AiNegotiationRow>();
      if (row) await expireNegotiation(db, env, row, "Hráče mezitím sebral jiný klub.", now);
    }
  }
  return { expired: expired.meta?.changes ?? 0, gone };
}
