/**
 * Úkoly zaměstnanců (kromě skauta, ten má vlastní scouting/scout-work.ts).
 *
 * Zaměstnanec dává pořád svůj trvalý bonus (staff-effects.ts). Úkol je práce navíc,
 * kterou zadává manažer:
 *  - zápasový úkol se váže na nejbližší ligový zápas klubu. Bonus do zápasu se přičte
 *    v match-mods.ts (jen čtení, takže dvojí simulace kola ho nezapočítá dvakrát), ranní
 *    práce v den zápasu (masáž, trávník) proběhne ve staff ticku a po odehrání úkol
 *    uzavře další staff tick. Pak má zaměstnanec STAFF_TASK_MATCH_COOLDOWN_DAYS oddech.
 *  - dlouhý úkol běží zvolený počet dní, pracuje se v něm každý den ve staff ticku
 *    a po posledním dni přijde zpráva s výsledkem.
 *
 * Cena se platí předem. Vrací se celá, dokud zaměstnanec nezačal pracovat. Při propuštění,
 * přeřazení na jinou roli nebo odchodu hráče z klubu se dlouhý úkol vrací za neodpracované dny.
 */

import {
  ROLE_DEFS, STAFF_TASK_DEFS, STAFF_TASK_MATCH_COOLDOWN_DAYS, PSYCH_SESSION_PLAYER_GAP_DAYS,
  YOUTH_PLAN_AGE_MAX, staffTaskCost,
  type StaffRole, type StaffTaskType, type StaffTaskView, type StaffTaskPlayer,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { logConditionStmt } from "../lib/condition-log";
import { recordTransaction, assertPurchaseAllowed } from "../season/finance-processor";
import { rowEffectiveness, type StaffEffectRow } from "./staff-effects";
import { sendStaffSystemMessage } from "./staff-messages";
import { idealWeight, playerBodyView } from "../generators/physicals";

const MODULE = "staff-tasks";

export type Fail = { ok: false; status: 400 | 404 | 409 | 500; error: string };
const fail = (status: Fail["status"], error: string): Fail => ({ ok: false, status, error });

export interface StaffTaskRow {
  id: string;
  team_id: string;
  staff_id: string;
  task_type: string;
  kind: "match" | "weekly";
  target_player_id: string | null;
  target_match_id: string | null;
  params: string | null;
  status: "active" | "done" | "cancelled" | "failed";
  starts_game_date: string;
  ends_game_date: string;
  cost_paid: number;
  result_data: string | null;
  end_reason: string | null;
  last_work_game_date: string | null;
}

interface TaskStaffRow extends StaffEffectRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  course_attribute: string | null;
  task_cooldown_until: string | null;
}

const STAFF_COLS = "s.id, s.team_id, s.role, s.first_name, s.last_name, s.gender, s.coaching, s.medicine, s.maintenance, s.judgement, s.communication, s.work_rate, s.charm, s.course_attribute, s.task_cooldown_until";

interface TaskParams { playerIds?: string[]; durationDays?: number; pitchBefore?: number; pitchAfter?: number; startWeight?: number }
interface TaskResult { text: string }

/** Herní den YYYY-MM-DD z ISO data (teams.game_date i datum staff ticku). */
export function gameDay(iso: string): string {
  return iso.slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 5. 10. — datum tak, jak ho čte člověk. */
function czDate(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d}. ${m}.`;
}

function isTaskType(t: string): t is StaffTaskType {
  return t in STAFF_TASK_DEFS;
}

/** Síla zaměstnance v roli úkolu, 0–1 (efektivita / 20). */
function strength(staff: StaffEffectRow, type: StaffTaskType): number {
  return rowEffectiveness(staff, STAFF_TASK_DEFS[type].role) / 20;
}

/** Sloveso podle rodu zaměstnance: „připravil“ / „připravila“. */
function rod(staff: { gender: string }, m: string, f: string): string {
  return staff.gender === "f" ? f : m;
}

function parseJson<T>(s: string | null, what: string): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch (e) { logger.warn({ module: MODULE }, `parse ${what}`, e); return null; }
}

// ─── Zápasové bonusy ────────────────────────────────────────────────────────

export interface TaskMatchMods {
  injurySeverityMod: number;
  setPiecesMod: number;
  lateFatigueMod: number;
  conditionDrainMod: number;
  crowdMod: number;
  moraleMod: number;
}

/** Co úkol přidá do zápasu. Čisté, testovatelné. `f` je síla zaměstnance 0–1. */
export function taskMatchMods(type: StaffTaskType, f: number, isHome: boolean): TaskMatchMods {
  const m: TaskMatchMods = { injurySeverityMod: 0, setPiecesMod: 0, lateFatigueMod: 0, conditionDrainMod: 0, crowdMod: 0, moraleMod: 0 };
  switch (type) {
    // Lékárnička z vybavení dává 0,1–0,3. Prohlídka je jednorázová, proto menší.
    case "doctor_checkup": m.injurySeverityMod = 0.05 + 0.10 * f; break;
    // Tréninková zeď dává +1 až +5 ke standardkám.
    case "set_piece_drill": m.setPiecesMod = 2 + Math.round(3 * f); break;
    // Iontové nápoje dávají 0,2–0,6 proti propadu po 70. minutě.
    case "fitness_prep":
      m.lateFatigueMod = 0.10 + 0.20 * f;
      m.conditionDrainMod = 0.02 + 0.04 * f;
      break;
    // Kotel z vybavení dává +4 až +12 % návštěvy. Choreo jen doma.
    case "fan_choreo":
      if (isHome) {
        m.crowdMod = 0.05 + 0.10 * f;
        m.moraleMod = 1 + Math.round(2 * f);
      }
      break;
    default: break;
  }
  return m;
}

/** Bonusy ze zápasových úkolů klubu na konkrétní zápas (volá match-mods.ts). */
export async function loadTaskMatchMods(db: D1Database, teamId: string, matchId: string, isHome: boolean): Promise<TaskMatchMods> {
  const total: TaskMatchMods = { injurySeverityMod: 0, setPiecesMod: 0, lateFatigueMod: 0, conditionDrainMod: 0, crowdMod: 0, moraleMod: 0 };
  const rows = await db.prepare(
    `SELECT t.task_type, ${STAFF_COLS}
       FROM staff_tasks t JOIN staff_members s ON s.id = t.staff_id AND s.team_id = t.team_id
      WHERE t.team_id = ? AND t.target_match_id = ? AND t.status = 'active' AND t.kind = 'match'`,
  ).bind(teamId, matchId).all<TaskStaffRow & { task_type: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `zápasové úkoly ${teamId}`, e); return { results: [] as (TaskStaffRow & { task_type: string })[] }; });
  for (const r of rows.results) {
    if (!isTaskType(r.task_type)) continue;
    const m = taskMatchMods(r.task_type, strength(r, r.task_type), isHome);
    for (const k of Object.keys(total) as (keyof TaskMatchMods)[]) total[k] += m[k];
  }
  return total;
}

// ─── Individuální trénink (volá daily-tick) ───────────────────────────────────

/** Násobek šance na zlepšení při tréninku pro hráče s individuálním plánem. `f` 0–1. */
export function individualTrainingMul(f: number): number {
  return 1.25 + 0.5 * f;
}

/** Hráč → násobek tréninku z běžících individuálních plánů (trenér mládeže, trenér brankářů). */
export async function loadIndividualTrainingMuls(db: D1Database, teamId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rows = await db.prepare(
    `SELECT t.task_type, t.target_player_id, ${STAFF_COLS}
       FROM staff_tasks t
       JOIN staff_members s ON s.id = t.staff_id AND s.team_id = t.team_id
       JOIN players p ON p.id = t.target_player_id
      WHERE p.team_id = ? AND t.status = 'active' AND t.task_type IN ('youth_plan', 'gk_plan')`,
  ).bind(teamId).all<TaskStaffRow & { task_type: string; target_player_id: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `individuální plány ${teamId}`, e); return { results: [] as (TaskStaffRow & { task_type: string; target_player_id: string })[] }; });
  for (const r of rows.results) {
    if (!isTaskType(r.task_type)) continue;
    const mul = individualTrainingMul(strength(r, r.task_type));
    map.set(r.target_player_id, (map.get(r.target_player_id) ?? 1) * mul);
  }
  return map;
}

/** Plán hubnutí jen pro hráče s nadváhou (ne svalnatého, ne v normě). */
export function weightPlanEligible(physical: Record<string, unknown>): boolean {
  const cat = playerBodyView(physical).weightCategory;
  return cat === "over" || cat === "obese";
}

/** Plán nabírání jen pro hráče s podváhou. */
export function weightGainEligible(physical: Record<string, unknown>): boolean {
  return playerBodyView(physical).weightCategory === "under";
}

/** Kg s desetinnou čárkou. */
function kgText(kg: number): string {
  return (Math.round(kg * 10) / 10).toFixed(1).replace(".", ",");
}

/** Závěrečná SMS plánu hubnutí. Pod půl kila se bere jako „skoro nezhubl“. */
export function weightPlanSummary(name: string, startWeight: number | null, currentWeight: number | null, days: number): string {
  const lost = startWeight !== null && currentWeight !== null ? startWeight - currentWeight : 0;
  if (lost < 0.5 || currentWeight === null) {
    return `🏃 Plán hubnutí: ${name} za ${days} dní skoro nezhubl. Na trénink chodit musí, jinak plán nepomůže.`;
  }
  return `🏃 Plán hubnutí: ${name} za ${days} dní shodil ${kgText(lost)} kg, teď váží ${kgText(currentWeight)} kg.`;
}

/** Závěrečná SMS plánu nabírání. Pod půl kila se bere jako „skoro nenabral“. */
export function weightGainSummary(name: string, startWeight: number | null, currentWeight: number | null, days: number): string {
  const gained = startWeight !== null && currentWeight !== null ? currentWeight - startWeight : 0;
  if (gained < 0.5 || currentWeight === null) {
    return `💪 Plán nabírání: ${name} za ${days} dní skoro nenabral. Bez tréninku plán nepomůže.`;
  }
  return `💪 Plán nabírání: ${name} za ${days} dní nabral ${kgText(gained)} kg, teď váží ${kgText(currentWeight)} kg.`;
}

/**
 * Hráč → síla kondičního trenéra (0–1) z běžících plánů hubnutí (nebo nabírání). Úbytek z ní spočítá denní
 * změna váhy (season/body-drift.ts weightPlanDailyLoss), tady se jen najdou plány.
 */
export async function loadWeightPlanStrengths(
  db: D1Database,
  teamIds: readonly string[],
  type: "weight_plan" | "weight_gain" = "weight_plan",
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (teamIds.length === 0) return map;
  const rows = await db.prepare(
    `SELECT t.target_player_id, ${STAFF_COLS}
       FROM staff_tasks t
       JOIN staff_members s ON s.id = t.staff_id AND s.team_id = t.team_id
       JOIN players p ON p.id = t.target_player_id
      WHERE p.team_id IN (${teamIds.map(() => "?").join(",")}) AND t.status = 'active' AND t.task_type = ?`,
  ).bind(...teamIds, type).all<TaskStaffRow & { target_player_id: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `plány ${type}`, e); return { results: [] as (TaskStaffRow & { target_player_id: string })[] }; });
  for (const r of rows.results) map.set(r.target_player_id, strength(r, type));
  return map;
}

// ─── Zadání ───────────────────────────────────────────────────────────────

export interface NextLeagueMatch {
  id: string;
  day: string;
  isHome: boolean;
  homeName: string;
  awayName: string;
}

/** Nejbližší neodehraný ligový zápas klubu (dnešní taky, dokud se nezačal hrát). */
export async function findNextLeagueMatch(db: D1Database, teamId: string, today: string): Promise<NextLeagueMatch | null> {
  const row = await db.prepare(
    `SELECT m.id, m.home_team_id, sc.scheduled_at, ht.name AS home_name, aw.name AS away_name
       FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams aw ON aw.id = m.away_team_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1)
        AND m.league_id IS NOT NULL AND m.status != 'simulated'
        AND sc.status = 'scheduled'
        AND substr(sc.scheduled_at, 1, 10) >= ?2
        -- Jen aktuální sezóna ligy: neodehraná kola starých sezón (testovací data) se nepočítají.
        AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = sc.league_id)
      ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId, today).first<{ id: string; home_team_id: string; scheduled_at: string; home_name: string; away_name: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `příští zápas ${teamId}`, e); return null; });
  if (!row) return null;
  return { id: row.id, day: gameDay(row.scheduled_at), isHome: row.home_team_id === teamId, homeName: row.home_name, awayName: row.away_name };
}

/** Áčko a jeho U21: hráče z obou smí zaměstnanci klubu brát na individuální práci. */
async function clubTeamIds(db: D1Database, teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM teams WHERE id = ? OR parent_team_id = ?")
    .bind(teamId, teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `týmy klubu ${teamId}`, e); return { results: [{ id: teamId }] }; });
  return rows.results.map((r) => r.id);
}

interface PlayerRow { id: string; team_id: string; first_name: string; last_name: string; age: number; position: string }

async function loadClubPlayer(db: D1Database, teamId: string, playerId: string): Promise<PlayerRow | null> {
  const teams = await clubTeamIds(db, teamId);
  const p = await db.prepare("SELECT id, team_id, first_name, last_name, age, position FROM players WHERE id = ?")
    .bind(playerId).first<PlayerRow>()
    .catch((e) => { logger.warn({ module: MODULE }, `hráč ${playerId}`, e); return null; });
  if (!p || !teams.includes(p.team_id)) return null;
  return p;
}

export interface CreateStaffTaskInput {
  teamId: string;
  staffId: string;
  taskType: string;
  playerId?: string | null;
  playerIds?: unknown;
  durationDays?: number | null;
  /** teams.game_date (ISO). */
  gameDate: string;
}

export async function createStaffTask(db: D1Database, input: CreateStaffTaskInput): Promise<{ ok: true; id: string } | Fail> {
  if (!isTaskType(input.taskType)) return fail(400, "Neznámý úkol.");
  const type = input.taskType;
  const def = STAFF_TASK_DEFS[type];
  const today = gameDay(input.gameDate);

  const staff = await db.prepare(`SELECT ${STAFF_COLS} FROM staff_members s WHERE s.id = ? AND s.team_id = ?`)
    .bind(input.staffId, input.teamId).first<TaskStaffRow>()
    .catch((e) => { logger.warn({ module: MODULE }, "načtení zaměstnance", e); return null; });
  if (!staff) return fail(404, "Zaměstnanec nenalezen.");
  if (staff.role !== def.role) return fail(400, `Tenhle úkol dělá ${ROLE_DEFS[def.role].label.toLowerCase()}.`);
  if (staff.task_cooldown_until && staff.task_cooldown_until > today) {
    return fail(409, `${staff.first_name} ${staff.last_name} si po minulém zápase oddechne, další úkol vezme od ${czDate(staff.task_cooldown_until)}`);
  }
  const active = await db.prepare("SELECT id FROM staff_tasks WHERE staff_id = ? AND status = 'active'")
    .bind(staff.id).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, "aktivní úkol", e); return null; });
  if (active) return fail(409, `${staff.first_name} ${staff.last_name} už na jednom úkolu je.`);

  let targetMatchId: string | null = null;
  let targetPlayerId: string | null = null;
  let endsDay = today;
  const params: TaskParams = {};
  let targetText = "";

  if (def.kind === "match") {
    const match = await findNextLeagueMatch(db, input.teamId, today);
    if (!match) return fail(400, "Klub teď nemá žádný ligový zápas, na který by se dalo chystat.");
    if (def.homeOnly && !match.isHome) return fail(400, `Tohle jde jen na domácí zápas. Příští zápas hraješ venku (${match.homeName} – ${match.awayName}).`);
    const again = await db.prepare(
      `SELECT id FROM staff_tasks WHERE team_id = ? AND task_type = ? AND target_match_id = ?
         AND (status IN ('active', 'done') OR last_work_game_date IS NOT NULL) LIMIT 1`,
    ).bind(input.teamId, type, match.id).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: MODULE }, "úkol na zápas už byl", e); return null; });
    if (again) return fail(409, `Úkol „${def.label}“ na tenhle zápas už jednou byl.`);
    targetMatchId = match.id;
    endsDay = match.day;
    targetText = `${match.homeName} – ${match.awayName}`;
  } else {
    const durations = def.durations ?? [7];
    const days = input.durationDays ?? durations[0];
    if (!durations.includes(days)) return fail(400, "Neznámá délka úkolu.");
    params.durationDays = days;
    endsDay = addDays(today, days);
  }

  if (def.target === "player") {
    if (!input.playerId) return fail(400, "Vyber hráče.");
    const p = await loadClubPlayer(db, input.teamId, input.playerId);
    if (!p) return fail(404, "Hráč není v tvém klubu.");
    const name = `${p.first_name} ${p.last_name}`;
    if (type === "youth_plan" && p.age > YOUTH_PLAN_AGE_MAX) return fail(400, `${name} je na plán pro mladé moc starý (do ${YOUTH_PLAN_AGE_MAX} let).`);
    if (type === "gk_plan" && p.position !== "GK") return fail(400, `${name} není brankář.`);
    if (type === "weight_plan" || type === "weight_gain") {
      const row = await db.prepare("SELECT physical FROM players WHERE id = ?").bind(p.id).first<{ physical: string | null }>()
        .catch((e) => { logger.warn({ module: MODULE }, "postava hráče pro plán", e); return null; });
      let physical: Record<string, unknown> = {};
      try {
        physical = row?.physical ? JSON.parse(row.physical) : {};
      } catch (e) {
        logger.warn({ module: MODULE }, "parse physical pro plán", e);
      }
      if (type === "weight_plan" && !weightPlanEligible(physical)) return fail(400, `${name} nadváhu nemá, hubnout nepotřebuje.`);
      if (type === "weight_gain" && !weightGainEligible(physical)) return fail(400, `${name} podváhu nemá, nabírat nepotřebuje.`);
      if (typeof physical.weight === "number") params.startWeight = physical.weight;
    }
    if (type === "doctor_injury_care") {
      const inj = await db.prepare("SELECT id FROM injuries WHERE player_id = ? AND days_remaining > 0 AND osobni_volno = 0 LIMIT 1")
        .bind(p.id).first<{ id: string }>()
        .catch((e) => { logger.warn({ module: MODULE }, "zranění hráče", e); return null; });
      if (!inj) return fail(400, `${name} není zraněný.`);
    }
    if (type === "psych_session") {
      const since = addDays(today, -PSYCH_SESSION_PLAYER_GAP_DAYS);
      const recent = await db.prepare(
        `SELECT ends_game_date FROM staff_tasks
          WHERE task_type = 'psych_session' AND target_player_id = ? AND status IN ('active', 'done') AND ends_game_date > ?
          ORDER BY ends_game_date DESC LIMIT 1`,
      ).bind(p.id, since).first<{ ends_game_date: string }>()
        .catch((e) => { logger.warn({ module: MODULE }, "poslední sezení", e); return null; });
      if (recent) return fail(409, `${name} byl u psychologa nedávno, další sezení jde od ${czDate(addDays(recent.ends_game_date, PSYCH_SESSION_PLAYER_GAP_DAYS))}`);
    }
    // Jeden hráč, jeden individuální plán stejného druhu.
    const dup = await db.prepare("SELECT id FROM staff_tasks WHERE task_type = ? AND target_player_id = ? AND status = 'active'")
      .bind(type, p.id).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: MODULE }, "duplicitní úkol", e); return null; });
    if (dup) return fail(409, `${name} už tenhle úkol má.`);
    targetPlayerId = p.id;
    targetText = name;
  } else if (def.target === "players") {
    const ids = Array.isArray(input.playerIds) ? [...new Set(input.playerIds.filter((x): x is string => typeof x === "string"))] : [];
    const max = def.maxPlayers ?? 5;
    if (ids.length === 0) return fail(400, "Vyber aspoň jednoho hráče.");
    if (ids.length > max) return fail(400, `Najednou nejvýš ${max} hráčů.`);
    const found = await db.prepare(`SELECT id FROM players WHERE team_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
      .bind(input.teamId, ...ids).all<{ id: string }>()
      .catch((e) => { logger.warn({ module: MODULE }, "hráči úkolu", e); return { results: [] as { id: string }[] }; });
    if (found.results.length !== ids.length) return fail(400, "Někdo z vybraných hráčů není v áčku.");
    params.playerIds = ids;
  }

  const cost = staffTaskCost(type, params.durationDays);
  if (cost > 0) {
    const allowed = await assertPurchaseAllowed(db, input.teamId, cost);
    if (!allowed.ok) return fail(400, allowed.reason);
    if (allowed.budget < cost) return fail(400, `V pokladně není dost peněz (úkol stojí ${cost.toLocaleString("cs")} Kč).`);
  }

  const id = crypto.randomUUID();
  try {
    await db.prepare(
      `INSERT INTO staff_tasks (id, team_id, staff_id, task_type, kind, target_player_id, target_match_id, params, starts_game_date, ends_game_date, cost_paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, input.teamId, staff.id, type, def.kind, targetPlayerId, targetMatchId, JSON.stringify(params), today, endsDay, cost).run();
  } catch (e) {
    logger.warn({ module: MODULE }, "zadání úkolu", e);
    return fail(409, `${staff.first_name} ${staff.last_name} už na jednom úkolu je.`);
  }
  if (cost > 0) {
    try {
      await recordTransaction(db, input.teamId, "staff_task", -cost,
        `${def.label}${targetText ? ` (${targetText})` : ""}: ${staff.first_name} ${staff.last_name}`, input.gameDate, id);
    } catch (e) {
      // Platba neprošla (záporný rozpočet ze souběžného nákupu, chyba D1). Úkol bez platby
      // nesmí zůstat aktivní: proběhl by zadarmo a zrušení by vrátilo nezaplacené peníze.
      logger.error({ module: MODULE }, `platba úkolu ${id}`, e);
      await db.prepare(
        `UPDATE staff_tasks SET status = 'cancelled', end_reason = 'payment_failed', cost_paid = 0,
                closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      ).bind(id).run()
        .catch((e2) => logger.error({ module: MODULE }, `zrušení nezaplaceného úkolu ${id}`, e2));
      const blocked = e instanceof Error && e.message.startsWith("BUDGET_BLOCKED");
      return blocked
        ? fail(400, "Klub je v minusu, úkol se nezadal.")
        : fail(500, "Platba se nepovedla, úkol se nezadal. Zkus to znovu.");
    }
  }

  // Ranní práce v den zápasu už proběhla? Zadáno v den zápasu po staff ticku → udělat hned.
  if (def.kind === "match" && endsDay === today) {
    const task = await db.prepare("SELECT * FROM staff_tasks WHERE id = ?").bind(id).first<StaffTaskRow>()
      .catch((e) => { logger.warn({ module: MODULE }, "načtení nového úkolu", e); return null; });
    if (task) await doMatchDayWork(db, task, staff, today);
  }
  return { ok: true, id };
}

// ─── Zrušení ───────────────────────────────────────────────────────────────

/**
 * Kolik se vrátí při zrušení.
 *  - nezačatý úkol: všechno,
 *  - `prorata` (propuštění, přeřazení, odchod hráče, nehraný zápas): dlouhý úkol za neodpracované dny,
 *    zápasový nic, pokud už ranní práce proběhla. Celá vratka u rozjetého úkolu by šla
 *    zneužít: nechat lékaře dva týdny pracovat, přeřadit ho a vzít si peníze zpátky.
 *  - zrušení manažerem po začátku: nic.
 */
export function refundAmount(task: Pick<StaffTaskRow, "kind" | "cost_paid" | "starts_game_date" | "ends_game_date" | "last_work_game_date">, prorata: boolean): number {
  if (task.cost_paid <= 0) return 0;
  if (task.last_work_game_date === null) return task.cost_paid;
  if (!prorata || task.kind === "match") return 0;
  const total = Math.max(1, daysBetween(task.starts_game_date, task.ends_game_date));
  const left = Math.max(0, daysBetween(task.last_work_game_date, task.ends_game_date));
  return Math.floor(task.cost_paid * left / total);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Zrušení s vratkou podle `refundAmount`. */
async function cancelTask(db: D1Database, task: StaffTaskRow, reason: string, gameDate: string, prorata: boolean): Promise<number | null> {
  const res = await db.prepare(
    `UPDATE staff_tasks SET status = 'cancelled', end_reason = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND status = 'active'`,
  ).bind(reason, task.id).run()
    .catch((e) => { logger.error({ module: MODULE }, `zrušení úkolu ${task.id}`, e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return null;
  const refund = refundAmount(task, prorata);
  if (refund > 0) {
    const def = isTaskType(task.task_type) ? STAFF_TASK_DEFS[task.task_type] : null;
    await recordTransaction(db, task.team_id, "staff_task", refund,
      `Vráceno za zrušený úkol: ${def?.label ?? task.task_type}`, gameDate, task.id);
  }
  // Zápasový úkol zrušený po ranní práci: oddech platí stejně, jinak by šlo masáž
  // nebo trávník na tentýž zápas zadat znovu.
  if (task.kind === "match" && task.last_work_game_date !== null) {
    await db.prepare("UPDATE staff_members SET task_cooldown_until = ? WHERE id = ?")
      .bind(addDays(task.ends_game_date, STAFF_TASK_MATCH_COOLDOWN_DAYS), task.staff_id).run()
      .catch((e) => logger.warn({ module: MODULE }, `oddech po zrušení ${task.id}`, e));
  }
  return refund;
}

/** Zrušení manažerem. Peníze se vrací jen, dokud zaměstnanec nezačal. */
export async function cancelStaffTask(db: D1Database, teamId: string, taskId: string, gameDate: string): Promise<{ ok: true; refunded: boolean } | Fail> {
  const task = await db.prepare("SELECT * FROM staff_tasks WHERE id = ? AND team_id = ? AND status = 'active'")
    .bind(taskId, teamId).first<StaffTaskRow>()
    .catch((e) => { logger.warn({ module: MODULE }, "načtení úkolu ke zrušení", e); return null; });
  if (!task) return fail(404, "Úkol nenalezen.");
  if (task.kind === "match" && task.target_match_id) {
    const m = await db.prepare(
      "SELECT m.status, sc.status AS round_status FROM matches m LEFT JOIN season_calendar sc ON sc.id = m.calendar_id WHERE m.id = ?",
    ).bind(task.target_match_id).first<{ status: string; round_status: string | null }>()
      .catch((e) => { logger.warn({ module: MODULE }, "stav zápasu úkolu", e); return null; });
    if (m && (m.status === "simulated" || m.round_status === "lineup_locked")) return fail(409, "Zápas se už hraje, úkol nejde zrušit.");
  }
  const refund = await cancelTask(db, task, "manager", gameDate, false);
  if (refund === null) return fail(409, "Úkol už skončil.");
  return { ok: true, refunded: refund > 0 };
}

/** Zaměstnanec odešel nebo dělá jinou roli: úkol končí a peníze se vrací celé. */
export async function endStaffTasksOnLeave(db: D1Database, teamId: string, staffId: string, gameDate: string): Promise<void> {
  const rows = await db.prepare("SELECT * FROM staff_tasks WHERE team_id = ? AND staff_id = ? AND status = 'active'")
    .bind(teamId, staffId).all<StaffTaskRow>()
    .catch((e) => { logger.warn({ module: MODULE }, "úkoly odcházejícího", e); return { results: [] as StaffTaskRow[] }; });
  for (const t of rows.results) await cancelTask(db, t, "staff_left", gameDate, true);
}

// ─── Denní běh (staff tick) ──────────────────────────────────────────────────

/** Ranní práce v den zápasu: masáž vybraných hráčů, příprava trávníku. Jen jednou. */
async function doMatchDayWork(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow, today: string): Promise<void> {
  if (task.task_type !== "massage_prep" && task.task_type !== "pitch_prep") return;
  const claim = await db.prepare("UPDATE staff_tasks SET last_work_game_date = ? WHERE id = ? AND status = 'active' AND last_work_game_date IS NULL")
    .bind(today, task.id).run()
    .catch((e) => { logger.warn({ module: MODULE }, `claim ranní práce ${task.id}`, e); return null; });
  if (!claim || (claim.meta?.changes ?? 0) === 0) return;
  const type = task.task_type as StaffTaskType;
  const f = strength(staff, type);
  const params = parseJson<TaskParams>(task.params, "params") ?? {};

  if (type === "massage_prep") {
    const plus = 4 + Math.round(8 * f);
    const ids = params.playerIds ?? [];
    if (ids.length === 0) return;
    const rows = await db.prepare(
      `SELECT id, team_id, first_name, last_name, COALESCE(json_extract(life_context, '$.condition'), 100) AS cond
         FROM players WHERE team_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
    ).bind(task.team_id, ...ids).all<{ id: string; team_id: string; first_name: string; last_name: string; cond: number }>()
      .catch((e) => { logger.warn({ module: MODULE }, "hráči na masáž", e); return { results: [] as { id: string; team_id: string; first_name: string; last_name: string; cond: number }[] }; });
    const stmts: D1PreparedStatement[] = [];
    const lines: string[] = [];
    for (const p of rows.results) {
      const next = Math.min(100, p.cond + plus);
      if (next === p.cond) { lines.push(`${p.first_name} ${p.last_name} je fit, masáž nepotřeboval`); continue; }
      stmts.push(logConditionStmt(db, p.id, p.team_id, p.cond, next, "staff", "Masáž před zápasem", today));
      stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?").bind(next, p.id));
      lines.push(`${p.first_name} ${p.last_name} ${Math.round(p.cond)} → ${next}`);
    }
    if (stmts.length) await db.batch(stmts).catch((e) => logger.warn({ module: MODULE }, "masáž před zápasem", e));
    await saveResult(db, task.id, { text: `Masáž před zápasem: ${lines.join(", ")}.` });
  } else {
    const plus = 5 + Math.round(10 * f);
    const st = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?").bind(task.team_id).first<{ pitch_condition: number }>()
      .catch((e) => { logger.warn({ module: MODULE }, "stav trávníku", e); return null; });
    if (!st) return;
    const after = Math.min(100, st.pitch_condition + plus);
    await db.prepare("UPDATE stadiums SET pitch_condition = ? WHERE team_id = ?").bind(after, task.team_id).run()
      .catch((e) => logger.warn({ module: MODULE }, "příprava trávníku", e));
    await saveResult(db, task.id, { text: `Trávník před zápasem: ${st.pitch_condition} → ${after} %.` });
  }
}

async function saveResult(db: D1Database, taskId: string, result: TaskResult): Promise<void> {
  await db.prepare("UPDATE staff_tasks SET result_data = ? WHERE id = ?").bind(JSON.stringify(result), taskId).run()
    .catch((e) => logger.warn({ module: MODULE }, `uložení výsledku ${taskId}`, e));
}

/** Uzavře úkol jako hotový, pošle zprávu a u zápasového úkolu nastaví oddech. */
async function finishTask(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow, text: string, cooldownFrom: string | null): Promise<void> {
  const res = await db.prepare(
    `UPDATE staff_tasks SET status = 'done', end_reason = 'finished', result_data = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND status = 'active'`,
  ).bind(JSON.stringify({ text }), task.id).run()
    .catch((e) => { logger.error({ module: MODULE }, `uzavření úkolu ${task.id}`, e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return;
  if (cooldownFrom) {
    await db.prepare("UPDATE staff_members SET task_cooldown_until = ? WHERE id = ?")
      .bind(addDays(cooldownFrom, STAFF_TASK_MATCH_COOLDOWN_DAYS), staff.id).run()
      .catch((e) => logger.warn({ module: MODULE }, `oddech zaměstnance ${staff.id}`, e));
  }
  const role = staff.role as StaffRole;
  await sendStaffSystemMessage(db, task.team_id, `${staff.first_name} ${staff.last_name}`, ROLE_DEFS[role]?.label ?? "Zaměstnanci", text);
}

interface PlayedMatch { status: string; home_team_id: string; home_score: number | null; away_score: number | null; attendance: number | null; home_name: string; away_name: string; day: string | null }

/** Co se po zápase napíše, případně dodělá (grilovačka). */
async function closeMatchTask(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow, m: PlayedMatch): Promise<string> {
  const type = task.task_type as StaffTaskType;
  const f = strength(staff, type);
  const isHome = m.home_team_id === task.team_id;
  const score = `${m.home_name} ${m.home_score ?? 0}:${m.away_score ?? 0} ${m.away_name}`;
  const earlier = parseJson<TaskResult>(task.result_data, "result")?.text;
  switch (type) {
    case "doctor_checkup": {
      const inj = await db.prepare(
        `SELECT p.first_name, p.last_name FROM injuries i JOIN players p ON p.id = i.player_id
          WHERE i.match_id = ? AND p.team_id = ? AND i.is_fake = 0 AND i.osobni_volno = 0`,
      ).bind(task.target_match_id, task.team_id).all<{ first_name: string; last_name: string }>()
        .catch((e) => { logger.warn({ module: MODULE }, "zranění ze zápasu", e); return { results: [] as { first_name: string; last_name: string }[] }; });
      const names = inj.results.map((p) => `${p.first_name} ${p.last_name}`);
      return names.length === 0
        ? `🩺 Prohlídka před zápasem ${score}: nikdo se nezranil.`
        : `🩺 Prohlídka před zápasem ${score}: i tak ${names.length === 1 ? "se zranil" : "se zranili"} ${names.join(", ")}.`;
    }
    case "set_piece_drill":
      return `🎯 Nácvik standardek před zápasem ${score} je za námi. Rohy a přímé kopy šly líp než obvykle.`;
    case "fitness_prep":
      return `🏃 Kondiční příprava na zápas ${score}: kluci vydrželi do konce.`;
    case "massage_prep":
      return `💆 ${earlier ?? "Masáž před zápasem proběhla."} Zápas: ${score}.`;
    case "pitch_prep":
      return `🌱 ${earlier ?? "Trávník byl před zápasem připravený."} Zápas: ${score}.`;
    case "fan_choreo":
      return `📣 Choreo na zápas ${score}: ${m.attendance ? `přišlo ${m.attendance} lidí.` : "lidi to bavilo."}`;
    case "bar_program": {
      if (!isHome || m.status !== "simulated") return `🍖 Grilovačka se nekonala.`;
      const plus = 1 + Math.round(3 * f);
      await db.prepare("UPDATE fans SET satisfaction = MIN(100, satisfaction + ?) WHERE team_id = ?")
        .bind(plus, task.team_id).run()
        .catch((e) => logger.warn({ module: MODULE }, "grilovačka spokojenost", e));
      return `🍖 Po zápase ${score} se u bufetu grilovalo. Fanoušci odcházeli spokojenější (spokojenost +${plus}).`;
    }
    default:
      return `Úkol k zápasu ${score} je hotový.`;
  }
}

/** Jeden den práce na dlouhém úkolu. Vrací text, pokud úkol skončil dřív (hráč se uzdravil apod.). */
async function doWeeklyDay(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow, today: string): Promise<string | null> {
  const type = task.task_type as StaffTaskType;
  const f = strength(staff, type);
  const pid = task.target_player_id;
  switch (type) {
    case "doctor_injury_care": {
      if (!pid) return "Hráč už není v klubu.";
      const inj = await db.prepare(
        "SELECT id, is_fake, days_remaining FROM injuries WHERE player_id = ? AND days_remaining > 0 AND osobni_volno = 0 ORDER BY days_remaining DESC LIMIT 1",
      ).bind(pid).first<{ id: string; is_fake: number; days_remaining: number }>()
        .catch((e) => { logger.warn({ module: MODULE }, "zranění v péči", e); return null; });
      const name = await playerName(db, pid);
      if (!inj) return `🩹 ${name} je zdravý, péče skončila dřív.`;
      // Simulant: lékař ho pozná, čím je lepší, tím spíš hned první den.
      if (inj.is_fake) {
        if (Math.random() < 0.4 + 0.5 * f) return `🕵️ ${name} nic nemá. Prohlédl${rod(staff, "", "a")} jsem ho pořádně a zranění jen hraje.`;
        return null;
      }
      const extra = Math.random() < 0.5 + 0.5 * f ? 1 : 0;
      await db.prepare("UPDATE injuries SET days_remaining = MAX(0, days_remaining - ?) WHERE id = ?")
        .bind(1 + extra, inj.id).run()
        .catch((e) => logger.warn({ module: MODULE }, "péče o zraněného", e));
      if (inj.days_remaining - 1 - extra <= 0) return `🩹 ${name} je díky každodenní péči zpátky fit.`;
      return null;
    }
    case "psych_session": {
      if (!pid) return "Hráč už není v klubu.";
      const morale = f < 0.4 ? 1 : 2;
      const calm = 2 + Math.round(4 * f);
      // Morálku zvedá jen do 85. Kdo je výš, tomu ji sezení nesníží.
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
            CASE WHEN COALESCE(json_extract(life_context, '$.morale'), 50) >= 85 THEN json_extract(life_context, '$.morale')
                 ELSE MIN(85, COALESCE(json_extract(life_context, '$.morale'), 50) + ?) END)
          WHERE id = ?`,
      ).bind(morale, pid).run()
        .catch((e) => logger.warn({ module: MODULE }, "sezení s psychologem: morálka", e));
      // Nespokojenost (chce pryč) jen u toho, kdo ji má. Na nule klíč uklidí processTransferUnrest.
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.transferUnrest.level',
            MAX(0, COALESCE(json_extract(life_context, '$.transferUnrest.level'), 0) - ?))
          WHERE id = ? AND json_type(life_context, '$.transferUnrest') = 'object'`,
      ).bind(calm, pid).run()
        .catch((e) => logger.warn({ module: MODULE }, "sezení s psychologem: nespokojenost", e));
      return null;
    }
    default:
      return null;
  }
}

/** Je hráč pořád v áčku nebo U21 klubu? `null` = nepodařilo se zjistit, úkol pak nerušit. */
async function playerInClub(db: D1Database, teamId: string, playerId: string): Promise<boolean | null> {
  const r = await db.prepare(
    `SELECT EXISTS(SELECT 1 FROM players p JOIN teams t ON t.id = p.team_id
                    WHERE p.id = ?1 AND (t.id = ?2 OR t.parent_team_id = ?2)
                      AND (p.status IS NULL OR p.status != 'released')) AS here`,
  ).bind(playerId, teamId).first<{ here: number }>()
    .catch((e) => { logger.warn({ module: MODULE }, `hráč ${playerId} v klubu ${teamId}`, e); return null; });
  return r ? r.here === 1 : null;
}

async function staffMessage(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow, text: string): Promise<void> {
  await sendStaffSystemMessage(db, task.team_id, `${staff.first_name} ${staff.last_name}`, ROLE_DEFS[staff.role as StaffRole]?.label ?? "Zaměstnanci", text);
}

async function playerName(db: D1Database, playerId: string): Promise<string> {
  const p = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(playerId)
    .first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: MODULE }, `jméno hráče ${playerId}`, e); return null; });
  return p ? `${p.first_name} ${p.last_name}` : "Hráč";
}

/** Závěrečná zpráva dlouhého úkolu po posledním dni. */
async function weeklySummary(db: D1Database, task: StaffTaskRow, staff: TaskStaffRow): Promise<string> {
  const type = task.task_type as StaffTaskType;
  const f = strength(staff, type);
  const pid = task.target_player_id;
  switch (type) {
    case "doctor_injury_care": {
      const name = pid ? await playerName(db, pid) : "Hráč";
      const inj = pid ? await db.prepare("SELECT days_remaining FROM injuries WHERE player_id = ? AND days_remaining > 0 AND osobni_volno = 0 ORDER BY days_remaining DESC LIMIT 1")
        .bind(pid).first<{ days_remaining: number }>()
        .catch((e) => { logger.warn({ module: MODULE }, "zranění na konci péče", e); return null; }) : null;
      return inj ? `🩹 Péče o hráče ${name} skončila, do návratu mu zbývá ${inj.days_remaining} dní.` : `🩹 ${name} je zpátky fit.`;
    }
    case "psych_session": {
      const name = pid ? await playerName(db, pid) : "Hráč";
      const lc = pid ? await db.prepare("SELECT json_extract(life_context, '$.morale') AS morale, json_extract(life_context, '$.transferUnrest.level') AS unrest FROM players WHERE id = ?")
        .bind(pid).first<{ morale: number | null; unrest: number | null }>()
        .catch((e) => { logger.warn({ module: MODULE }, "nálada po sezení", e); return null; }) : null;
      const unrest = lc?.unrest ?? 0;
      return `🧠 Týden sezení s hráčem ${name} je za námi. Morálka je teď ${Math.round(lc?.morale ?? 50)}${unrest > 0 ? `, pryč ale pořád chce (nespokojenost ${Math.round(unrest)})` : ", odchod neřeší"}.`;
    }
    case "weight_plan":
    case "weight_gain": {
      const name = pid ? await playerName(db, pid) : "Hráč";
      const params = parseJson<TaskParams>(task.params, "params") ?? {};
      const now = pid ? await db.prepare("SELECT json_extract(physical, '$.weight') AS w FROM players WHERE id = ?").bind(pid)
        .first<{ w: number | null }>()
        .catch((e) => { logger.warn({ module: MODULE }, "váha na konci plánu", e); return null; }) : null;
      const summary = type === "weight_gain" ? weightGainSummary : weightPlanSummary;
      return summary(name, params.startWeight ?? null, now?.w ?? null, params.durationDays ?? 14);
    }
    case "youth_plan":
    case "gk_plan": {
      const name = pid ? await playerName(db, pid) : "Hráč";
      const grow = pid ? await db.prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(change), 0) AS total FROM training_log
          WHERE player_id = ? AND change > 0 AND substr(game_date, 1, 10) > ? AND substr(game_date, 1, 10) <= ?`,
      ).bind(pid, task.starts_game_date, task.ends_game_date).first<{ n: number; total: number }>()
        .catch((e) => { logger.warn({ module: MODULE }, "růst při plánu", e); return null; }) : null;
      const label = type === "gk_plan" ? "Individuální trénink brankáře" : "Individuální plán";
      return grow && grow.total > 0
        ? `📈 ${label}: ${name} se za tu dobu zlepšil celkem o ${grow.total} ${grow.total === 1 ? "bod" : grow.total < 5 ? "body" : "bodů"} v dovednostech.`
        : `📈 ${label}: ${name} se za tu dobu nezlepšil. Na trénink chodit musí, jinak plán nepomůže.`;
    }
    case "sponsor_care": {
      const visits = 2 + Math.round(3 * f);
      const plus = 2 + Math.round(2 * f);
      const { favorDeltaStmts } = await import("../sponsors/favor");
      const firms = await db.prepare(
        `SELECT ds.id, ds.name FROM district_sponsors ds
           JOIN teams t ON t.id = ? JOIN villages v ON v.id = t.village_id
          WHERE ds.district = v.district ORDER BY RANDOM() LIMIT ?`,
      ).bind(task.team_id, visits).all<{ id: number; name: string }>()
        .catch((e) => { logger.warn({ module: MODULE }, "firmy k obejití", e); return { results: [] as { id: number; name: string }[] }; });
      if (firms.results.length === 0) return `💼 V okrese nebyla žádná firma, kterou by šlo obejít.`;
      const reason = `${staff.first_name} ${staff.last_name} přinesl${rod(staff, "", "a")} dárkový koš`;
      const stmts = firms.results.flatMap((s) => favorDeltaStmts(db, s.id, task.team_id, plus, reason));
      await db.batch(stmts).catch((e) => logger.warn({ module: MODULE }, "náklonnost sponzorů", e));
      return `💼 Obešel${rod(staff, "", "a")} jsem ${firms.results.map((s) => s.name).join(", ")}. Majitelé klub vidí raději (náklonnost +${plus}).`;
    }
    default:
      return "Úkol je hotový.";
  }
}

export interface StaffTasksRunResult { matchDayWork: number; closed: number; expired: number; weeklyDays: number; finished: number }

/** Denní běh úkolů. Volá staff tick (5:00 UTC, před zápasy v 16:00). `today` = herní den. */
export async function runStaffTasks(db: D1Database, todayIso: string): Promise<StaffTasksRunResult> {
  const today = gameDay(todayIso);
  const out: StaffTasksRunResult = { matchDayWork: 0, closed: 0, expired: 0, weeklyDays: 0, finished: 0 };
  const rows = await db.prepare(
    `SELECT t.*, ${STAFF_COLS.replace(/s\.id/, "s.id AS s_id").replace(/s\.team_id/, "s.team_id AS s_team_id")}
       FROM staff_tasks t JOIN staff_members s ON s.id = t.staff_id
      WHERE t.status = 'active'`,
  ).all<StaffTaskRow & TaskStaffRow & { s_id: string; s_team_id: string | null }>()
    .catch((e) => { logger.error({ module: MODULE }, "načtení aktivních úkolů", e); return { results: [] as (StaffTaskRow & TaskStaffRow & { s_id: string; s_team_id: string | null })[] }; });

  for (const r of rows.results) {
    const task: StaffTaskRow = r;
    const staff: TaskStaffRow = { ...r, id: r.s_id, team_id: r.s_team_id ?? "" };
    if (!isTaskType(task.task_type)) continue;
    try {
      // Zaměstnanec mezitím odešel (propuštění úkoly ruší, tohle je pojistka).
      if (staff.team_id !== task.team_id || staff.role !== STAFF_TASK_DEFS[task.task_type].role) {
        await cancelTask(db, task, "staff_left", todayIso, true);
        continue;
      }
      if (task.kind === "match") {
        const m = await db.prepare(
          `SELECT m.status, m.home_team_id, m.home_score, m.away_score, m.attendance, ht.name AS home_name, aw.name AS away_name,
                  substr(sc.scheduled_at, 1, 10) AS day
             FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams aw ON aw.id = m.away_team_id
             LEFT JOIN season_calendar sc ON sc.id = m.calendar_id
            WHERE m.id = ?`,
        ).bind(task.target_match_id).first<PlayedMatch>()
          .catch((e) => { logger.warn({ module: MODULE }, `zápas úkolu ${task.id}`, e); return null; });
        const morningJob = task.task_type === "massage_prep" || task.task_type === "pitch_prep";
        if (m?.status === "simulated" && morningJob && task.last_work_game_date === null) {
          // Ranní práce v den zápasu neproběhla (staff tick ten den nedoběhl). Nepsat, že
          // proběhla, a vrátit peníze: last_work_game_date je NULL, takže se vrací celé.
          const refund = await cancelTask(db, task, "work_missed", todayIso, true);
          if (refund !== null) {
            out.expired++;
            await staffMessage(db, task, staff,
              `Před zápasem ${m.home_name} – ${m.away_name} jsem se k ${task.task_type === "massage_prep" ? "masáži" : "trávníku"} nedostal${rod(staff, "", "a")}. Úkol jsem zrušil${rod(staff, "", "a")}${refund > 0 ? " a peníze jdou zpátky do pokladny" : ""}.`);
          }
        } else if (m?.status === "simulated") {
          await finishTask(db, task, staff, await closeMatchTask(db, task, staff, m), m.day ?? task.ends_game_date);
          out.closed++;
        } else if (!m || addDays(task.ends_game_date, 2) < today) {
          // Zápas se nehrál (odložení, kontumace): úkol zrušit. Peníze se vrací, jen pokud
          // ranní práce (masáž, trávník) ještě neproběhla, zpráva musí říct, jak to je.
          const refund = await cancelTask(db, task, "match_not_played", todayIso, true);
          if (refund !== null) {
            out.expired++;
            await staffMessage(db, task, staff,
              `Zápas, na který jsem se chystal${rod(staff, "", "a")}, se nehrál. Úkol jsem zrušil${rod(staff, "", "a")}${refund > 0
                ? " a peníze jdou zpátky do pokladny."
                : `. Práci před zápasem jsem už udělal${rod(staff, "", "a")}, takže se peníze nevracejí.`}`);
          }
        } else if (task.ends_game_date === today && (task.task_type === "massage_prep" || task.task_type === "pitch_prep")) {
          await doMatchDayWork(db, task, staff, today);
          out.matchDayWork++;
        }
        continue;
      }

      // Hráč mezitím z klubu odešel (prodej, propuštění): nepracovat na cizím hráči,
      // úkol ukončit a vrátit peníze za neodpracované dny.
      if (task.target_player_id && await playerInClub(db, task.team_id, task.target_player_id) === false) {
        const name = await playerName(db, task.target_player_id);
        const refund = await cancelTask(db, task, "player_left", todayIso, true);
        if (refund !== null) {
          out.expired++;
          await staffMessage(db, task, staff,
            `${name} už v klubu není, úkol jsem ukončil${rod(staff, "", "a")}${refund > 0 ? ` a za neodpracované dny jde zpátky do pokladny ${refund.toLocaleString("cs")} Kč` : ""}.`);
        }
        continue;
      }

      // Dlouhý úkol: den práce (jednou za herní den), pak případně konec.
      if (today > task.starts_game_date && today <= task.ends_game_date) {
        const claim = await db.prepare(
          "UPDATE staff_tasks SET last_work_game_date = ? WHERE id = ? AND status = 'active' AND (last_work_game_date IS NULL OR last_work_game_date < ?)",
        ).bind(today, task.id, today).run()
          .catch((e) => { logger.warn({ module: MODULE }, `claim dne ${task.id}`, e); return null; });
        if (claim && (claim.meta?.changes ?? 0) > 0) {
          out.weeklyDays++;
          const earlyEnd = await doWeeklyDay(db, task, staff, today);
          if (earlyEnd) {
            await finishTask(db, task, staff, earlyEnd, null);
            out.finished++;
            continue;
          }
        }
      }
      if (today >= task.ends_game_date) {
        await finishTask(db, task, staff, await weeklySummary(db, task, staff), null);
        out.finished++;
      }
    } catch (e) {
      logger.error({ module: MODULE }, `úkol ${task.id} (${task.task_type})`, e);
    }
  }
  return out;
}

// ─── Pohled pro API ───────────────────────────────────────────────────────────

/** Kdo je v sestavě áčka na zápas: přesná sestava na kolo, jinak poslední ruční (jako match-runner). */
export async function loadLineupIds(db: D1Database, teamId: string, matchId: string): Promise<{ start: Set<string>; bench: Set<string> | null } | null> {
  const row = await db.prepare(
    `SELECT l.players_data, l.bench_data FROM lineups l
      WHERE l.team_id = ?1 AND (l.calendar_id = (SELECT calendar_id FROM matches WHERE id = ?2) OR l.is_auto = 0)
      ORDER BY l.calendar_id = (SELECT calendar_id FROM matches WHERE id = ?2) DESC, l.is_auto ASC, l.submitted_at DESC, l.id ASC
      LIMIT 1`,
  ).bind(teamId, matchId).first<{ players_data: string | null; bench_data: string | null }>()
    .catch((e) => { logger.warn({ module: MODULE }, `sestava ${teamId}`, e); return null; });
  if (!row) return null;
  const start = parseJson<{ playerId?: string }[]>(row.players_data, "sestava") ?? [];
  // Bez uložené lavičky ji před zápasem vybere automat: kdo na ní bude, se neví.
  const bench = parseJson<unknown[]>(row.bench_data, "lavička");
  return {
    start: new Set(start.map((p) => p.playerId).filter((id): id is string => typeof id === "string")),
    bench: Array.isArray(bench) ? new Set(bench.filter((id): id is string => typeof id === "string")) : null,
  };
}

/** Hráči klubu (áčko i U21) pro výběr v úkolu, s tím, podle čeho se vybírá. */
export async function loadStaffTaskPlayers(db: D1Database, teamId: string, today: string, nextMatchId: string | null): Promise<StaffTaskPlayer[]> {
  const since = addDays(today, -PSYCH_SESSION_PLAYER_GAP_DAYS);
  const [rows, lineup] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.age, p.position, p.overall_rating, t.team_type,
              i.days_remaining AS injury_days, i.days_total AS injury_total, COALESCE(i.description, i.type) AS injury_name,
              json_extract(p.life_context, '$.condition') AS cond,
              json_extract(p.life_context, '$.morale') AS morale,
              json_extract(p.life_context, '$.transferUnrest.level') AS unrest,
              p.physical,
              (SELECT MAX(st.ends_game_date) FROM staff_tasks st
                WHERE st.task_type = 'psych_session' AND st.target_player_id = p.id
                  AND st.status IN ('active', 'done') AND st.ends_game_date > ?2) AS psych_last
         FROM players p
         JOIN teams t ON t.id = p.team_id
         LEFT JOIN injuries i ON i.id = (SELECT i2.id FROM injuries i2 WHERE i2.player_id = p.id AND i2.days_remaining > 0 AND i2.osobni_volno = 0
                                          ORDER BY i2.days_remaining DESC LIMIT 1)
        WHERE (t.id = ?1 OR t.parent_team_id = ?1) AND (p.status IS NULL OR p.status != 'released')
        ORDER BY t.parent_team_id IS NOT NULL, CASE p.position WHEN 'GK' THEN 0 WHEN 'DEF' THEN 1 WHEN 'MID' THEN 2 ELSE 3 END, p.last_name`,
    ).bind(teamId, since).all<{
      id: string; first_name: string; last_name: string; age: number; position: string; overall_rating: number | null; team_type: string | null;
      injury_days: number | null; injury_total: number | null; injury_name: string | null;
      cond: number | null; morale: number | null; unrest: number | null; psych_last: string | null; physical: string | null;
    }>()
      .then((r) => r.results)
      .catch((e) => { logger.warn({ module: MODULE }, `hráči pro úkoly ${teamId}`, e); return []; }),
    nextMatchId ? loadLineupIds(db, teamId, nextMatchId) : Promise.resolve(null),
  ]);
  return rows.map((p) => {
    const isU21 = p.team_type === "u21";
    let physical: Record<string, unknown> = {};
    try {
      physical = p.physical ? JSON.parse(p.physical) : {};
    } catch (e) {
      logger.warn({ module: MODULE }, `postava hráče ${p.id}`, e);
    }
    const weight = typeof physical.weight === "number" ? physical.weight : null;
    const height = typeof physical.height === "number" && physical.height > 0 ? physical.height : null;
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      age: p.age,
      position: p.position,
      isU21,
      rating: p.overall_rating === null ? null : Math.round(p.overall_rating),
      injuryDays: p.injury_days,
      injuryDaysTotal: p.injury_total,
      injuryName: p.injury_name,
      condition: p.cond === null ? null : Math.round(p.cond),
      morale: p.morale === null ? null : Math.round(p.morale),
      unrest: p.unrest === null ? null : Math.round(p.unrest),
      lineup: !lineup || isU21 ? null
        : lineup.start.has(p.id) ? "start"
        : !lineup.bench ? null
        : lineup.bench.has(p.id) ? "bench" : "out",
      psychAgainFrom: p.psych_last ? addDays(p.psych_last, PSYCH_SESSION_PLAYER_GAP_DAYS) : null,
      weight,
      weightCategory: playerBodyView(physical).weightCategory,
      weightExcess: weight !== null && height !== null ? Math.round((weight - idealWeight(height)) * 10) / 10 : null,
    };
  });
}

export async function loadStaffTaskViews(db: D1Database, teamId: string): Promise<StaffTaskView[]> {
  const rows = await db.prepare(
    `SELECT t.*, p.first_name AS p_first, p.last_name AS p_last,
            ht.name AS home_name, aw.name AS away_name
       FROM staff_tasks t
       LEFT JOIN players p ON p.id = t.target_player_id
       LEFT JOIN matches m ON m.id = t.target_match_id
       LEFT JOIN teams ht ON ht.id = m.home_team_id
       LEFT JOIN teams aw ON aw.id = m.away_team_id
      WHERE t.team_id = ? AND (t.status = 'active' OR t.closed_at > datetime('now', '-10 days'))
      ORDER BY t.status = 'active' DESC, t.created_at DESC
      LIMIT 40`,
  ).bind(teamId).all<StaffTaskRow & { p_first: string | null; p_last: string | null; home_name: string | null; away_name: string | null }>()
    .catch((e) => { logger.warn({ module: MODULE }, `úkoly klubu ${teamId}`, e); return { results: [] as (StaffTaskRow & { p_first: string | null; p_last: string | null; home_name: string | null; away_name: string | null })[] }; });

  const allIds = new Set<string>();
  const paramsById = new Map<string, TaskParams>();
  for (const r of rows.results) {
    const p = parseJson<TaskParams>(r.params, "params") ?? {};
    paramsById.set(r.id, p);
    for (const id of p.playerIds ?? []) allIds.add(id);
  }
  const names = new Map<string, string>();
  if (allIds.size > 0) {
    const ids = [...allIds];
    const ps = await db.prepare(`SELECT id, first_name, last_name FROM players WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<{ id: string; first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: MODULE }, "jména hráčů úkolů", e); return { results: [] as { id: string; first_name: string; last_name: string }[] }; });
    for (const p of ps.results) names.set(p.id, `${p.first_name} ${p.last_name}`);
  }

  return rows.results.filter((r) => isTaskType(r.task_type)).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    taskType: r.task_type as StaffTaskType,
    kind: r.kind,
    status: r.status,
    targetPlayerId: r.target_player_id,
    targetPlayerName: r.p_first ? `${r.p_first} ${r.p_last}` : null,
    targetMatchId: r.target_match_id,
    targetMatchLabel: r.home_name ? `${r.home_name} – ${r.away_name}` : null,
    playerNames: (paramsById.get(r.id)?.playerIds ?? []).map((id) => names.get(id) ?? "?"),
    startsGameDate: r.starts_game_date,
    endsGameDate: r.ends_game_date,
    costPaid: r.cost_paid,
    resultText: parseJson<TaskResult>(r.result_data, "result")?.text ?? null,
    endReason: r.end_reason,
  }));
}
