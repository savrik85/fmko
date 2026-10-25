/**
 * Týdenní správa AI klubu (pondělí po týdenních financích).
 *
 * Trenér projde klub jako člověk: trénink, vstupné, trávník, stavby, vybavení,
 * zaměstnance, akademii, bannery a přesuny mezi áčkem a U21. Volí model (nebo
 * náhradní pravidlo podle povahy), kód hlídá rezervu a všechno provede stejnými
 * službami jako lidský manažer (apps/api/src/services).
 */

import { ROLE_DEFS, type StaffRole } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getEquipmentOptions, repairEquipment, upgradeEquipment } from "../services/equipment";
import { listBannerOffers, MAX_BANNERS, signSponsorContract } from "../services/banner-sponsors";
import { setAcademyInvestment, setTicketPrice } from "../services/club-settings";
import { hireStaff, listStaffMarket, loadCoachLicence, requiredLicence } from "../services/staff-hire";
import { getStadiumUpgradeOptions, maintainPitch, setPitchCareMode, upgradeStadiumFacility } from "../services/stadium";
import { setTrainingPlan } from "../services/training";
import { promotePlayerFromU21, sendPlayerToU21 } from "../services/u21-moves";
import { logDecision, type DecisionMode } from "./decision-log";
import { callCoachModel, COACH_MODEL } from "./llm";
import { readCoachMode } from "./mode";
import { ensureAiProfile } from "./profile";
import {
  buildTrainingPlan, computeReserve, fallbackWeeklyDecision, planWeeklyActions, renderWeeklyPrompt, reserveWeeksFor,
  validateWeeklyDecision, weeklyDecisionSchema, WEEKLY_SYSTEM_PROMPT,
  type BannerOption, type PricedOption, type RepairChoice, type StaffCandidateOption, type U21MoveOption, type WeeklyAction,
  type WeeklyContext, type WeeklyDecision,
} from "./weekly-decision";

const M = "ai-coach-weekly";

/** Pravidelné výdaje klubu (z nich se počítá rezerva). Jednorázové nákupy sem nepatří. */
const RUNNING_COST_TYPES = [
  "wage", "staff_wage", "training_cost", "match_expense", "pitch_maintenance", "pitch_repair", "youth_academy",
  "competition_fee", "cash_loan_repayment", "concession_wholesale", "equipment_expense", "bus_subsidy", "transfer_installment",
];

const POSITION_DEPTH: Record<string, number> = { GK: 2, DEF: 6, MID: 6, FWD: 4 };

export interface WeeklyResult {
  used: "model" | "fallback";
  executed: Array<{ action: WeeklyAction["kind"]; ok: boolean; detail: string }>;
  skipped: Array<{ item: string; reason: string }>;
  spent: number;
  mode: DecisionMode;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()) / 86_400_000);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function weeklyFinance(db: D1Database, teamId: string, gameDay: string, u21Id: string | null): Promise<{ running: number; income: number }> {
  const since = addDays(gameDay, -28);
  const placeholders = RUNNING_COST_TYPES.map(() => "?").join(",");
  const row = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN amount < 0 AND type IN (${placeholders}) THEN -amount ELSE 0 END), 0) AS running,
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
       MIN(game_date) AS first_day
     FROM transactions WHERE team_id = ? AND game_date >= ?`,
  ).bind(...RUNNING_COST_TYPES, teamId, since).first<{ running: number; income: number; first_day: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "finance za 4 týdny", e); return null; });
  const weeks = row?.first_day ? Math.max(1, Math.min(4, (daysBetween(row.first_day, gameDay) + 1) / 7)) : 4;
  let running = (row?.running ?? 0) / weeks;
  const income = (row?.income ?? 0) / weeks;
  if (running <= 0) {
    // Bez historie: mzdy hráčů (áčko i U21) a zaměstnanců plus tři tréninky.
    const wages = await db.prepare(
      `SELECT COALESCE(SUM(weekly_wage), 0) AS w FROM players WHERE team_id IN (?, ?) AND (status IS NULL OR status = 'active')`,
    ).bind(teamId, u21Id ?? teamId).first<{ w: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "mzdy hráčů", e); return null; });
    const staff = await db.prepare("SELECT COALESCE(SUM(weekly_wage), 0) AS w FROM staff_members WHERE team_id = ?").bind(teamId).first<{ w: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "mzdy zaměstnanců", e); return null; });
    running = (wages?.w ?? 0) + (staff?.w ?? 0) + 1200;
  }
  return { running: Math.round(running), income: Math.round(income) };
}

async function lastTicketChange(db: D1Database, teamId: string, gameDay: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT created_at FROM ai_coach_decisions WHERE team_id = ? AND kind = 'weekly' AND executed LIKE '%ticket_price%'
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(teamId).first<{ created_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "poslední změna vstupného", e); return null; });
  return row ? Math.max(0, daysBetween(row.created_at, gameDay)) : null;
}

/** Načte všechno, co trenér v pondělí potřebuje vědět. Null = tým nejde najít. */
export async function loadWeeklyContext(db: D1Database, teamId: string, gameDayOverride?: string): Promise<WeeklyContext | null> {
  const team = await db.prepare(
    `SELECT t.id, t.name, t.budget, t.reputation, t.league_id, t.game_date, t.training_type, t.training_approach, t.training_sessions,
            t.youth_investment, v.size AS village_size
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{
    id: string; name: string; budget: number; reputation: number; league_id: string | null; game_date: string | null;
    training_type: string | null; training_approach: string | null; training_sessions: number | null; youth_investment: string | null; village_size: string | null;
  }>().catch((e) => { logger.warn({ module: M, teamId }, "tým", e); return null; });
  if (!team) return null;
  const gameDay = (gameDayOverride ?? team.game_date ?? new Date().toISOString()).slice(0, 10);
  const profile = await ensureAiProfile(db, teamId);

  const u21 = await db.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "U21 tým", e); return null; });
  const money = await weeklyFinance(db, teamId, gameDay, u21?.id ?? null);
  const reserve = computeReserve(profile, money.running);

  // Tabulka
  let league = { position: null as number | null, teams: null as number | null, points: null as number | null, played: 0 };
  let matchWeekdays = [1, 4];
  if (team.league_id) {
    const { calculateStandings } = await import("../stats/standings");
    const table = await calculateStandings(db, team.league_id).catch((e) => { logger.warn({ module: M, teamId }, "tabulka", e); return []; });
    const me = table.find((t) => t.teamId === teamId);
    if (me && me.played > 0) league = { position: me.pos, teams: table.length, points: me.points, played: me.played };
    const lg = await db.prepare("SELECT match_weekdays FROM leagues WHERE id = ?").bind(team.league_id).first<{ match_weekdays: string | null }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "hrací dny ligy", e); return null; });
    // NULL = pondělí a čtvrtek (migrace 0276). Prázdné položky se nesmí stát nulou (neděle).
    const parsed = (lg?.match_weekdays ?? "").split(",").map((x) => x.trim()).filter((x) => /^\d$/.test(x)).map(Number).filter((x) => x >= 0 && x <= 6);
    if (parsed.length > 0) matchWeekdays = parsed;
  }

  // Kádr
  const squadRows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.age, p.overall_rating, p.life_context, p.loan_from_team_id, p.next_match_return,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) AS injured,
            (SELECT ps.appearances FROM player_stats ps WHERE ps.player_id = p.id AND ps.team_id = p.team_id
               AND ps.season_id = (SELECT id FROM seasons WHERE status = 'active' LIMIT 1)) AS apps
       FROM players p WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active') ORDER BY p.overall_rating DESC`,
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number; life_context: string; loan_from_team_id: string | null; next_match_return: number; injured: number; apps: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "kádr", e); return { results: [] as never[] }; });
  const squad = squadRows.results;
  const conditionOf = (raw: string): number => {
    try {
      const v = JSON.parse(raw) as { condition?: unknown };
      return typeof v.condition === "number" ? v.condition : 100;
    } catch (e) {
      logger.warn({ module: M, teamId }, "nečitelný life_context", e);
      return 100;
    }
  };
  const avgCondition = squad.length ? Math.round(squad.reduce((s, p) => s + conditionOf(p.life_context), 0) / squad.length) : 100;

  // Fanoušci a vstupné
  const { getBaseTicketPrice, mapVillageSize } = await import("../season/finance-processor");
  const villageBase = getBaseTicketPrice(mapVillageSize(team.village_size ?? "village"));
  const fans = await db.prepare("SELECT satisfaction, base_ticket_price FROM fans WHERE team_id = ?").bind(teamId).first<{ satisfaction: number; base_ticket_price: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "fanoušci", e); return null; });

  // Trávník
  const stadiumRow = await db.prepare("SELECT pitch_condition, pitch_type, pitch_care_mode FROM stadiums WHERE team_id = ?").bind(teamId)
    .first<{ pitch_condition: number; pitch_type: string; pitch_care_mode: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "stadion", e); return null; });
  const equipment = await getEquipmentOptions(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "nabídka vybavení", e); return null; });

  // Nabídky staveb a vybavení (jen odemčené a v dosahu rozpočtu)
  const stadiumOptions = ((await getStadiumUpgradeOptions(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "nabídka staveb", e); return null; })) ?? [])
    .filter((o) => !o.locked && o.cost <= team.budget)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 12);
  const stadium: PricedOption[] = stadiumOptions.map((o, i) => ({
    key: `S${i + 1}`, ref: o.facility, label: `${o.facility} ${o.currentLevel}->${o.nextLevel}`, cost: o.cost, detail: o.effect,
  }));
  const equipmentUpgrades: PricedOption[] = (equipment?.upgrades ?? [])
    .filter((o) => !o.locked && o.cost <= team.budget)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 20)
    .map((o, i) => ({ key: `E${i + 1}`, ref: o.category, label: `${o.category} ${o.currentLevel}->${o.nextLevel}`, cost: o.cost, detail: o.effect }));
  const equipmentRepairs: RepairChoice[] = (equipment?.repairs ?? []).map((o, i) => ({
    key: `R${i + 1}`, ref: o.category, label: `${o.category} level ${o.level}`, cost: o.cost, detail: `state ${o.condition} %`, condition: o.condition,
  }));

  // Zaměstnanci: obsazené role a nejlepší kandidáti na volné role (jen ti, kdo půjdou pod licenci trenéra).
  const hired = await db.prepare("SELECT role FROM staff_members WHERE team_id = ? AND role IS NOT NULL").bind(teamId).all<{ role: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "zaměstnanci", e); return { results: [] as Array<{ role: string }> }; });
  const hiredRoles = hired.results.map((r) => r.role);
  const licence = await loadCoachLicence(db, teamId);
  const market = await listStaffMarket(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "trh zaměstnanců", e); return []; });
  const candidates: StaffCandidateOption[] = [];
  const openRoles = (Object.keys(ROLE_DEFS) as StaffRole[]).filter((r) => r !== "skaut" && !hiredRoles.includes(r));
  for (const role of openRoles) {
    const def = ROLE_DEFS[role];
    const best = market
      .filter((m) => requiredLicence(m) <= licence)
      .map((m) => ({ m, q: (m as unknown as Record<string, number>)[def.primary] * 2 + (m as unknown as Record<string, number>)[def.secondary] }))
      .sort((a, b) => b.q - a.q)
      .slice(0, 1);
    for (const b of best) {
      if (candidates.some((c) => c.ref === b.m.id)) continue;
      candidates.push({
        key: `C${candidates.length + 1}`, ref: b.m.id, role, label: `${b.m.first_name} ${b.m.last_name}`,
        detail: `${def.primary} ${(b.m as unknown as Record<string, number>)[def.primary]}`,
        cost: b.m.signing_fee, weeklyWage: b.m.weekly_wage,
      });
    }
    if (candidates.length >= 10) break;
  }

  // Bannery
  const bannerData = await listBannerOffers(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "nabídky bannerů", e); return null; });
  const offers: BannerOption[] = (bannerData?.offers ?? []).slice(0, 6).map((o, i) => ({
    key: `B${i + 1}`, ref: o.sponsorName, label: o.sponsorName, cost: 0, detail: o.sponsorType,
    monthly: o.monthlyAmount, seasons: o.seasons, sponsorType: o.sponsorType,
  }));

  // U21: kdo by se do áčka hodil a kdo v áčku jen sedí.
  const promote: U21MoveOption[] = [];
  const sendDown: U21MoveOption[] = [];
  if (u21) {
    const depthLine = (pos: string): number => {
      const ratings = squad.filter((p) => p.position === pos).map((p) => p.overall_rating).sort((a, b) => b - a);
      const n = POSITION_DEPTH[pos] ?? 5;
      return ratings.length < n ? 0 : ratings[n - 1];
    };
    const youth = await db.prepare(
      `SELECT id, first_name, last_name, position, age, overall_rating FROM players
        WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC LIMIT 25`,
    ).bind(u21.id).all<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "kádr U21", e); return { results: [] as never[] }; });
    for (const y of youth.results) {
      if (promote.length >= 3) break;
      if (y.overall_rating > depthLine(y.position)) {
        promote.push({ key: `U${promote.length + 1}`, playerId: y.id, label: `${y.position} ${y.age}y rating ${y.overall_rating} (A-team depth line ${depthLine(y.position)})` });
      }
    }
    if (squad.length > 18) {
      for (const p of squad) {
        if (sendDown.length >= 3) break;
        if (p.age > 21 || p.loan_from_team_id || p.next_match_return) continue;
        const better = squad.filter((o) => o.position === p.position && o.overall_rating > p.overall_rating).length;
        if (better >= (POSITION_DEPTH[p.position] ?? 5)) {
          sendDown.push({ key: `Y${sendDown.length + 1}`, playerId: p.id, label: `${p.position} ${p.age}y rating ${p.overall_rating}, ${p.apps ?? 0} apps, ${better} better at his position` });
        }
      }
    }
  }

  const effectivePrice = fans && fans.base_ticket_price > 0 ? fans.base_ticket_price : villageBase;
  const youthWeekly = { none: 0, minimal: 1500, medium: 5000, high: 12000 }[(team.youth_investment ?? "none") as "none"] ?? 0;
  return {
    teamId,
    teamName: team.name,
    gameDay,
    budget: team.budget,
    reputation: team.reputation,
    profile,
    finance: {
      weeklyRunningCost: money.running,
      weeklyIncome: money.income,
      reserveWeeks: reserveWeeksFor(profile),
      reserve,
      spendable: Math.max(0, team.budget - reserve),
    },
    league,
    training: {
      type: team.training_type ?? "conditioning",
      approach: team.training_approach ?? "balanced",
      sessions: team.training_sessions ?? 2,
      matchWeekdays,
      avgCondition,
      injured: squad.filter((p) => p.injured > 0).length,
      squadSize: squad.length,
      youngPlayers: squad.filter((p) => p.age <= 21).length,
    },
    fans: {
      satisfaction: fans?.satisfaction ?? 50,
      ticketPrice: effectivePrice,
      villageBasePrice: villageBase,
      daysSinceTicketChange: await lastTicketChange(db, teamId, gameDay),
    },
    pitch: {
      condition: stadiumRow?.pitch_condition ?? 50,
      type: stadiumRow?.pitch_type ?? "natural",
      careMode: stadiumRow?.pitch_care_mode ?? "auto",
      hasCareEquipment: (equipment?.levels.pitch_heating ?? 0) + (equipment?.levels.pitch_irrigation ?? 0) > 0,
      hasMower: (equipment?.levels.mower ?? 0) > 0,
    },
    stadium,
    equipmentUpgrades,
    equipmentRepairs,
    staff: { hiredRoles, candidates },
    academy: { current: team.youth_investment ?? "none", weeklyCostNow: Math.round(youthWeekly / 4.3) },
    banners: { active: bannerData?.activeBanners ?? 0, max: MAX_BANNERS, offers },
    u21: { exists: !!u21, aTeamSize: squad.length, promote, sendDown },
  };
}

/** Rozhodne týdenní správu (model nebo náhradní pravidlo) bez provedení. */
export async function decideWeekly(env: Pick<Bindings, "AI">, ctx: WeeklyContext, opts: { useModel: boolean; model?: string; reasoningEffort?: "low" | "medium" | "high"; timeoutMs?: number }): Promise<{
  decision: WeeklyDecision;
  used: "model" | "fallback";
  raw: string | null;
  model: string | null;
  error: string | null;
  rejected: string[];
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
}> {
  if (!opts.useModel) {
    return { decision: fallbackWeeklyDecision(ctx), used: "fallback", raw: null, model: null, error: null, rejected: [], tokensIn: null, tokensOut: null, latencyMs: null };
  }
  const res = await callCoachModel(env, {
    system: WEEKLY_SYSTEM_PROMPT,
    user: renderWeeklyPrompt(ctx),
    maxTokens: 1500,
    schema: { name: "weekly_decision", schema: weeklyDecisionSchema(ctx) },
    model: opts.model,
    reasoningEffort: opts.reasoningEffort,
    timeoutMs: opts.timeoutMs,
  });
  const base = { raw: res.raw, model: res.model, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null, latencyMs: res.latencyMs };
  if (!res.json) return { ...base, decision: fallbackWeeklyDecision(ctx), used: "fallback", error: res.error ?? "bez odpovědi", rejected: [] };
  const check = validateWeeklyDecision(res.json, ctx);
  if (!check.ok) return { ...base, decision: fallbackWeeklyDecision(ctx), used: "fallback", error: check.reason, rejected: [] };
  return { ...base, decision: check.decision, used: "model", error: null, rejected: check.rejected };
}

/** Provede jednu akci stejnou službou, jakou používá manažer. Nikdy nehází. */
async function executeAction(db: D1Database, teamId: string, ctx: WeeklyContext, a: WeeklyAction): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (a.kind) {
      case "training": {
        const plan = buildTrainingPlan(a, ctx.training.matchWeekdays);
        const res = await setTrainingPlan(db, teamId, {
          type: a.focus === "mixed" ? "technique" : a.focus, approach: a.approach,
          sessionsPerWeek: Object.keys(plan).length, trainingPlan: plan,
        });
        return { ok: res.ok, detail: res.ok ? JSON.stringify(plan) : res.error };
      }
      case "ticket_price": {
        const res = await setTicketPrice(db, teamId, a.price);
        return { ok: true, detail: `${a.from} -> ${res.baseTicketPrice} Kč` };
      }
      case "pitch_care_mode": {
        const res = await setPitchCareMode(db, teamId, a.mode);
        return { ok: res.ok, detail: res.ok ? res.mode : res.error };
      }
      case "academy": {
        const res = await setAcademyInvestment(db, teamId, a.level);
        return { ok: res.ok, detail: res.ok ? res.investment : res.error };
      }
      case "banner": {
        const res = await signSponsorContract(db, teamId, {
          category: "banner", sponsorName: a.sponsorName, sponsorType: a.sponsorType,
          monthlyAmount: a.monthly, winBonus: 0, seasons: a.seasons, earlyTerminationFee: 0,
        });
        return { ok: res.ok, detail: res.ok ? `${a.sponsorName} ${a.monthly} Kč/měsíc` : res.error };
      }
      case "promote": {
        const res = await promotePlayerFromU21(db, teamId, a.playerId);
        return { ok: res.ok, detail: res.ok ? a.playerId : res.error };
      }
      case "send_down": {
        const res = await sendPlayerToU21(db, teamId, a.playerId, "permanent");
        return { ok: res.ok, detail: res.ok ? a.playerId : res.error };
      }
      case "equipment_repair": {
        const res = await repairEquipment(db, teamId, a.category);
        return { ok: res.ok, detail: res.ok ? `${a.category} ${res.cost} Kč` : res.error };
      }
      case "pitch_maintenance": {
        const res = await maintainPitch(db, teamId, a.level);
        return { ok: res.ok, detail: res.ok ? `${a.level} ${res.cost} Kč` : res.error };
      }
      case "hire": {
        const res = await hireStaff(db, teamId, a.staffId, a.role);
        return { ok: res.ok, detail: res.ok ? `${a.role} ${a.cost} Kč` : res.error };
      }
      case "equipment_upgrade": {
        const res = await upgradeEquipment(db, teamId, a.category);
        return { ok: res.ok, detail: res.ok ? `${a.category} -> ${res.newLevel}, ${res.cost} Kč` : res.error };
      }
      case "stadium_upgrade": {
        const res = await upgradeStadiumFacility(db, teamId, a.facility);
        return { ok: res.ok, detail: res.ok ? `${a.facility} -> ${res.newLevel}, ${res.cost} Kč` : res.error };
      }
    }
  } catch (e) {
    logger.warn({ module: M, teamId }, `akce ${a.kind} selhala`, e);
    return { ok: false, detail: String((e as Error)?.message ?? e).slice(0, 200) };
  }
  return { ok: false, detail: "neznámá akce" };
}

/**
 * Týdenní správa AI klubu. V režimu `shadow` (nebo `dryRun`) jen rozhodne a zapíše do deníku.
 * Placené akce nikdy nesáhnou na peníze pod rezervou podle šetrnosti trenéra.
 */
export async function runWeeklyReview(env: Bindings, teamId: string, now: Date, opts: { dryRun?: boolean; model?: string } = {}): Promise<WeeklyResult> {
  const db = env.DB;
  const mode = await readCoachMode(env.CACHE_KV, "weekly");
  const ctx = await loadWeeklyContext(db, teamId);
  const logMode: DecisionMode = opts.dryRun ? "shadow" : mode;
  if (!ctx) {
    logger.warn({ module: M, teamId }, "týdenní správa: tým nenalezen");
    return { used: "fallback", executed: [], skipped: [], spent: 0, mode: logMode };
  }
  const decided = await decideWeekly(env, ctx, { useModel: mode !== "off", model: opts.model });
  const plan = planWeeklyActions(ctx, decided.decision);

  const executed: WeeklyResult["executed"] = [];
  let spent = 0;
  if (mode !== "shadow" && !opts.dryRun) {
    for (const a of plan.actions) {
      const r = await executeAction(db, teamId, ctx, a);
      executed.push({ action: a.kind, ok: r.ok, detail: r.detail });
      if (r.ok && "cost" in a) spent += a.cost;
    }
  }

  await logDecision(db, {
    teamId,
    kind: "weekly",
    mode: logMode,
    model: decided.model ?? (mode === "off" ? null : COACH_MODEL),
    contextRef: `week:${ctx.gameDay}`,
    inputSummary: renderWeeklyPrompt(ctx),
    rawOutput: decided.raw,
    actions: { decision: decided.decision, rejected: decided.rejected, plan: plan.actions, skipped: plan.skipped, at: now.toISOString() },
    executed: executed.length ? executed : null,
    usedFallback: decided.used === "fallback",
    error: decided.error,
    tokensIn: decided.tokensIn,
    tokensOut: decided.tokensOut,
    latencyMs: decided.latencyMs,
  });

  return { used: decided.used, executed, skipped: plan.skipped, spent, mode: logMode };
}
