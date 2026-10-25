/**
 * Bufet AI klubu nad databází: co trenér v pondělí ví (provoz, sklad po kvalitách, domácí
 * zápasy do příští správy, návštěva, počasí, obsluha a party) a dorovnání skladu před
 * domácím zápasem (úloha `match` v den zápasu, jobs.ts). Rozhoduje a hlídá
 * `concession-decision.ts`, nakupuje se stejnou službou jako u člověka (services/concessions.ts).
 */

import type { Weather } from "../engine/types";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { CONCESSION_CATALOG, type ProductKey } from "../season/concession-catalog";
import { loadConcessionStock } from "../season/concession-stock";
import { ensureFansRow } from "../season/fans-processor";
import { computeExternalWeeklyConcession } from "../season/finance-processor";
import { restockConcession } from "../services/concessions";
import {
  buildConcessionContext, CONCESSION_MODES, CONCESSION_WINDOW_DAYS, DEFAULT_HOME_ATTENDANCE, DEFAULT_PEAK_ATTENDANCE,
  emptyConcessionContext, FRIENDLY_ATTENDANCE, FRIENDLY_PEAK_ATTENDANCE, PEAK_ATTENDANCE_MUL, planConcessionTopUp,
  type ConcessionContext, type ConcessionDecidedBy, type ConcessionFixture, type ConcessionMode, type ConcessionTopUpPlan,
} from "./concession-decision";
import { logDecision } from "./decision-log";
import { readCoachMode, type CoachMode } from "./mode";

const M = "ai-coach-concessions";
/** Plán bufetu z pondělní správy platí nejvýš tolik dní (jako přestupní kurz). */
const PLAN_MAX_AGE_DAYS = 8;
/**
 * Dorovnává se přes den: pohár se hraje v poledne, liga a přáteláky v 18:00. Úloha `match`
 * běží v 8:00 nebo 9:00 v Praze (cron 0 7), chybějící sestavy ve 13:45 (cron 45 12).
 */
const TOPUP_FROM_HOUR = 7;
const TOPUP_TO_HOUR = 17;

function addDays(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface HomeFixtureRow {
  id: string;
  kind: ConcessionFixture["kind"];
  /** Termín zápasu (přátelák má jen den). */
  scheduledAt: string;
}

/**
 * Neodehrané domácí zápasy klubu v okně [od, od + dní): liga aktuální sezóny, pohár (klub je
 * domácí) a přátelák doma. Na neutrální půdě se bufet neprovozuje, venku taky ne.
 */
export async function loadHomeFixtures(db: D1Database, teamId: string, fromDay: string, days: number): Promise<HomeFixtureRow[]> {
  const from = `${fromDay.slice(0, 10)}T00:00:00.000Z`;
  const to = `${addDays(fromDay, days)}T00:00:00.000Z`;
  const out: HomeFixtureRow[] = [];

  const league = await db.prepare(
    `SELECT m.id, sc.scheduled_at FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.home_team_id = ? AND m.status != 'simulated' AND sc.status = 'scheduled'
        AND sc.scheduled_at >= ? AND sc.scheduled_at < ?
        AND sc.season_number = (SELECT MAX(sc2.season_number) FROM season_calendar sc2 WHERE sc2.league_id = m.league_id)
      ORDER BY sc.scheduled_at`,
  ).bind(teamId, from, to).all<{ id: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "domácí ligové zápasy", e); return null; });
  for (const r of league?.results ?? []) out.push({ id: r.id, kind: "league", scheduledAt: r.scheduled_at });

  // Stejný výběr poháru jako nejbližší domácí zápas v bufetu člověka (season/next-home-match.ts).
  const cup = await db.prepare(
    `SELECT cm.id, cm.scheduled_at FROM cup_matches cm
       JOIN cup_competitions cc ON cc.id = cm.cup_id AND cc.season_number = (SELECT MAX(season_number) FROM cup_competitions)
       JOIN cup_teams my ON my.cup_id = cm.cup_id AND my.team_id = ? AND my.id = cm.home_cup_team_id
      WHERE cm.status != 'simulated' AND cm.scheduled_at >= ? AND cm.scheduled_at < ?
      ORDER BY cm.scheduled_at`,
  ).bind(teamId, from, to).all<{ id: string; scheduled_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "domácí pohárové zápasy", e); return null; });
  for (const r of cup?.results ?? []) out.push({ id: r.id, kind: "cup", scheduledAt: r.scheduled_at });

  // Přátelák má den v `created_at` (multiplayer/friendly-actions.ts), domácí je pořadatel.
  const friendlies = await db.prepare(
    `SELECT m.id, m.created_at FROM matches m JOIN challenges c ON c.match_id = m.id AND c.status = 'accepted'
      WHERE m.home_team_id = ? AND m.calendar_id IS NULL AND m.league_id IS NULL AND m.status IN ('scheduled', 'lineups_open')
        AND (c.venue IS NULL OR c.venue != 'neutral')
        AND substr(m.created_at, 1, 10) >= ? AND substr(m.created_at, 1, 10) < ?
      ORDER BY m.created_at`,
  ).bind(teamId, from.slice(0, 10), to.slice(0, 10)).all<{ id: string; created_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "domácí přáteláky", e); return null; });
  for (const r of friendlies?.results ?? []) out.push({ id: r.id, kind: "friendly", scheduledAt: r.created_at });

  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Násobič poptávky z obsluhy bufetu a útraty part, stejně jako při prodeji v zápase. */
async function demandMultiplier(db: D1Database, teamId: string): Promise<number> {
  const { calculateStaffEffects } = await import("../staff/staff-effects");
  const staff = await db.prepare(
    "SELECT role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id = ?",
  ).bind(teamId).all<{
    role: string; coaching: number; medicine: number; maintenance: number; judgement: number;
    communication: number; work_rate: number; charm: number;
  }>().catch((e) => { logger.warn({ module: M, teamId }, "zaměstnanci pro bufet", e); return null; });
  const { loadFanGroupMatchEffects } = await import("../fans/fan-group-state");
  const groups = await loadFanGroupMatchEffects(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "party pro bufet", e); return null; });
  return calculateStaffEffects(staff?.results ?? []).concessionDemandMul * (groups?.concessionMul ?? 1);
}

/**
 * Bufet klubu pro rozhodnutí: provoz, sklad, domácí zápasy v okně (počasí jako při prodeji:
 * liga s teplotou kola, pohár bez teploty, přátelák „zataženo") a návštěva z posledních
 * domácích zápasů. `spendable` = peníze nad rezervou trenéra.
 */
export async function loadConcessionContext(
  db: D1Database,
  teamId: string,
  opts: { gameDay: string; days?: number; spendable: number },
): Promise<ConcessionContext> {
  const stadium = await db.prepare("SELECT refreshments, concession_mode FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<{ refreshments: number | null; concession_mode: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "stadion pro bufet", e); return null; });
  if (!stadium) return emptyConcessionContext();
  const mode: ConcessionMode = stadium.concession_mode === "self" ? "self" : "external";
  const refreshmentsLevel = stadium.refreshments ?? 0;

  await ensureFansRow(db, teamId);
  const team = await db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "reputace pro bufet", e); return null; });
  const fans = await db.prepare("SELECT satisfaction FROM fans WHERE team_id = ?").bind(teamId).first<{ satisfaction: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "spokojenost pro bufet", e); return null; });
  const stock = await loadConcessionStock(db, teamId);

  const { loadHomeAttendance } = await import("../stadium/home-attendance");
  const history = await loadHomeAttendance(db, teamId);
  const average = history?.average ?? DEFAULT_HOME_ATTENDANCE;
  const peak = history?.average != null
    ? Math.max(history.max ?? 0, Math.round(average * PEAK_ATTENDANCE_MUL))
    : DEFAULT_PEAK_ATTENDANCE;

  const { resolveWeatherForDate } = await import("../season/season-weather");
  const fixtures: ConcessionFixture[] = [];
  for (const row of await loadHomeFixtures(db, teamId, opts.gameDay, opts.days ?? CONCESSION_WINDOW_DAYS)) {
    const day = row.scheduledAt.slice(0, 10);
    if (row.kind === "friendly") {
      // Přátelák se prodává bez počasí a teploty (friendly-runner je finančnímu zpracování nepředává).
      fixtures.push({ id: row.id, kind: row.kind, day, attendance: FRIENDLY_ATTENDANCE, peak: FRIENDLY_PEAK_ATTENDANCE, weather: "cloudy", temperature: null });
      continue;
    }
    const w = await resolveWeatherForDate(db, row.scheduledAt)
      .catch((e) => { logger.warn({ module: M, teamId }, `počasí zápasu ${row.id}`, e); return null; });
    const weather: Weather = w?.weather ?? "cloudy";
    // Pohárový prodej teplotu nezná (zápas není v kalendáři ligy), ligový ji bere z kola.
    const temperature = row.kind === "league" && w ? w.temperature : null;
    fixtures.push({ id: row.id, kind: row.kind, day, attendance: average, peak, weather, temperature });
  }

  return buildConcessionContext({
    mode,
    refreshmentsLevel,
    externalWeeklyIncome: computeExternalWeeklyConcession(refreshmentsLevel, team?.reputation ?? 50),
    satisfaction: fans?.satisfaction ?? 50,
    demandMul: await demandMultiplier(db, teamId),
    attendance: { average, peak, matches: history?.matches ?? 0 },
    fixtures,
    spendable: opts.spendable,
    stock: stock.map((r) => ({ key: r.key, qualityLevel: r.qualityLevel, sellPrice: r.sellPrice, stockByTier: r.stockByTier })),
  });
}

// ── Dorovnání skladu před domácím zápasem ───────────────────────────────────

function parseTopUpPlan(raw: string): ConcessionTopUpPlan | null {
  try {
    const p = JSON.parse(raw) as Partial<ConcessionTopUpPlan>;
    if (!p || !CONCESSION_MODES.includes(p.mode as ConcessionMode) || typeof p.reserve !== "number" || !Array.isArray(p.products)) return null;
    const decidedBy: ConcessionDecidedBy = p.decidedBy === "model" || p.decidedBy === "fallback" ? p.decidedBy : "guard";
    const products = p.products.filter((x): x is ConcessionTopUpPlan["products"][number] =>
      !!x && typeof x === "object" && typeof x.key === "string" && !!CONCESSION_CATALOG[x.key as ProductKey]
      && Number.isInteger(x.tier) && x.tier >= 1 && x.tier <= 3 && typeof x.price === "number" && typeof x.cover === "number");
    return { decidedBy, mode: p.mode as ConcessionMode, reserve: p.reserve, products };
  } catch (e) {
    logger.warn({ module: M }, "nečitelný plán bufetu", e);
    return null;
  }
}

/**
 * Plán bufetu z poslední provedené pondělní správy (ne nanečisto ani v režimu shadow),
 * nejvýš 8 dní starý podle hodin hry (`actions.at`). Bez plánu se nedorovnává.
 */
export async function loadWeeklyConcessionPlan(db: D1Database, teamId: string, now: Date): Promise<ConcessionTopUpPlan | null> {
  const rows = await db.prepare(
    `SELECT CASE WHEN json_valid(actions) THEN json_extract(actions, '$.concessionPlan') END AS plan,
            CASE WHEN json_valid(actions) THEN json_extract(actions, '$.at') END AS at
       FROM ai_coach_decisions
      WHERE team_id = ? AND kind = 'weekly' AND mode != 'shadow'
      ORDER BY created_at DESC LIMIT 3`,
  ).bind(teamId).all<{ plan: string | null; at: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "plán bufetu z pondělní správy", e); return null; });
  const since = new Date(now.getTime() - PLAN_MAX_AGE_DAYS * 86_400_000).toISOString();
  const row = (rows?.results ?? []).find((r) => r.plan && r.at && r.at >= since);
  return row?.plan ? parseTopUpPlan(row.plan) : null;
}

export interface ConcessionTopUpResult {
  bought: number;
  spent: number;
  detail: string;
}

/**
 * Před dnešním domácím zápasem dorovná sklad zvolené kvality na pokrytí z pondělního plánu,
 * stejnými mezemi jako v pondělí a jen z peněz nad rezervou. Hlídá se tím, že sklad po nákupu
 * stačí: další běh téhož dne už nic nekoupí. V režimu shadow se pondělní plán neprovedl,
 * dorovnávat není co.
 */
export async function topUpConcessions(
  env: Pick<Bindings, "DB" | "CACHE_KV">,
  teamId: string,
  now: Date,
  opts: { mode?: CoachMode } = {},
): Promise<ConcessionTopUpResult> {
  const db = env.DB;
  const none = (detail: string): ConcessionTopUpResult => ({ bought: 0, spent: 0, detail });
  const mode = opts.mode ?? await readCoachMode(env.CACHE_KV, "weekly");
  if (mode === "shadow") return none("režim shadow");
  const hour = pragueHour(now);
  if (hour !== null && (hour < TOPUP_FROM_HOUR || hour > TOPUP_TO_HOUR)) return none("mimo denní hodiny");

  const stadium = await db.prepare("SELECT concession_mode FROM stadiums WHERE team_id = ?").bind(teamId).first<{ concession_mode: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "provoz bufetu", e); return null; });
  if (stadium?.concession_mode !== "self") return none("bufet nemá vlastní provoz");
  const plan = await loadWeeklyConcessionPlan(db, teamId, now);
  if (!plan || plan.mode !== "self" || plan.products.length === 0) return none("bez plánu bufetu");

  const team = await db.prepare("SELECT budget, game_date FROM teams WHERE id = ?").bind(teamId).first<{ budget: number; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "tým pro bufet", e); return null; });
  if (!team) return none("tým nenalezen");
  const gameDay = (team.game_date ?? now.toISOString()).slice(0, 10);
  const c = await loadConcessionContext(db, teamId, { gameDay, days: 1, spendable: team.budget - plan.reserve });
  if (c.fixtures.length === 0) return none("dnes doma nehraje");

  const { purchases, skipped } = planConcessionTopUp(c, plan, team.budget);
  if (purchases.length === 0) return none("sklad stačí");

  const executed: Array<{ product: ProductKey; ok: boolean; detail: string }> = [];
  let spent = 0;
  let bought = 0;
  for (const p of purchases) {
    // Peníze se mezi nákupy mění (přestup, pokuta): po nákupu musí zůstat rezerva.
    const current = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "rozpočet před dokupem", e); return null; });
    if (!current || current.budget - p.cost < plan.reserve) {
      executed.push({ product: p.key, ok: false, detail: `rezerva: rozpočet ${current?.budget ?? "?"} Kč, cena ${p.cost} Kč` });
      continue;
    }
    const res = await restockConcession(db, teamId, p.key, p.quantity, { expectedLevel: p.tier })
      .catch((e) => {
        logger.warn({ module: M, teamId }, `dokup ${p.key} selhal`, e);
        return { ok: false as const, status: 500 as const, error: String((e as Error)?.message ?? e).slice(0, 200) };
      });
    executed.push({ product: p.key, ok: res.ok, detail: res.ok ? `L${res.level} +${res.quantity} ks, ${res.totalCost} Kč` : res.error });
    if (res.ok) {
      spent += res.totalCost;
      bought += res.quantity;
    }
  }

  const stockText = c.products.map((p) => `${p.key}:L${p.currentLevel}/${p.tiers.find((t) => t.level === p.currentLevel)?.stock ?? 0}`).join(" ");
  await logDecision(db, {
    teamId,
    kind: "concession_topup",
    mode,
    model: null,
    contextRef: `topup:${c.fixtures.map((f) => f.id).join(",")}`,
    inputSummary: `budget=${team.budget} reserve=${plan.reserve} fixtures=${c.fixtures.map((f) => `${f.kind}:${f.attendance}`).join(",")} stock=${stockText}`,
    actions: { plan, purchases, skipped, at: now.toISOString() },
    executed,
    usedFallback: plan.decidedBy === "fallback",
  });
  return { bought, spent, detail: executed.map((e) => `${e.product} ${e.detail}`).join("; ") };
}
