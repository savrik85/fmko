/**
 * Incidenty v AI klubu (spec AI klubů 3.2): krádeže, škody a dluhy hráčů řeší AI trenér podle
 * povahy, bez zpráv.
 *
 * AI klubu se incidenty dějí stejně jako lidskému (incidents/denni-krok.ts), SMS ani notifikace
 * mu nechodí (incidents/club-messages.ts). Rozhodnutí jde přes stejné služby jako routa člověka:
 * obvinění, policie a tresty (incidents/akce.ts), záloha na mzdu (incidents/situace-db.ts).
 *
 * Model navrhuje, kód hlídá (incident-decision.ts): kód nabídne jen to, co pravidla v tu chvíli
 * dovolí, model z toho vybere. Bez modelu (výpadek, neplatná odpověď, režim off, chybí binding)
 * platí náhradní pravidlo podle povahy. Režim shadow rozhodne a zapíše do deníku, nic neprovede.
 *
 * Trenér reaguje s lidskou prodlevou: o novém incidentu rozhodne do dvou dnů (pevně pro incident),
 * vždy nejpozději den před lhůtou, jednou za herní den a jen přes den. Každou fázi incidentu
 * (vyšetřování, trest, záloha) rozhodne jednou; nová stopa nebo neúspěch policie je nová fáze.
 */

import type { Bindings } from "../index";
import { obvinHrace, rozhodni, zavolejPolicii, type VysledekAkce } from "../incidents/akce";
import { jeRecidivista, nactiHraceKadru, proAkce, SLOUPCE_INCIDENTU, type IncidentRadek } from "../incidents/incident-db";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { MAX_OBVINENI, POVOLANI_POLICISTA, ZALOHA_MAX_KC, ZALOHA_MIN_KC } from "../incidents/nastaveni";
import { nactiZtraty } from "../incidents/popis";
import { rozhodniZalohu } from "../incidents/situace-db";
import { nactiStopy } from "../incidents/stopy-db";
import { castkaPokuty, castkaSrazky, hodnotaSkody, jeOblibeny } from "../incidents/tresty";
import { dostupneAkce, sancePolicie, stavVysetrovani } from "../incidents/vysetrovani";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { seedFromString } from "../lib/seed";
import { claimCoachTask, releaseCoachTask } from "./claims";
import { logDecision } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import {
  INCIDENT_KIND_TEXT, INCIDENT_SYSTEM_PROMPT, clueLine, fallbackIncidentDecision, incidentDecisionSchema, incidentOptions,
  renderIncidentPrompt, validateIncidentDecision,
  type IncidentAction, type IncidentClub, type IncidentDecisionContext, type IncidentFacts, type IncidentOption,
  type IncidentPlayer, type IncidentStage, type IncidentSuspect,
} from "./incident-decision";
import { callCoachModel } from "./llm";
import { readCoachMode, type CoachArea, type CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import { analyzeSquad, loadClubSquad, type SquadAnalysis, type SquadMember } from "./squad";
import { weeklyRunningCosts } from "./transfer-club";
import { budgetReserve } from "./valuation";

const M = "ai-coach-incidents";

/** Incidenty patří ke správě klubu, přepínač je společný s týdenní správou. */
export const INCIDENT_COACH_AREA: CoachArea = "weekly";

/** Přes den, ne v noci: v kolik hodin (Praha) trenér incidenty řeší. */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;
/** Za kolik dní nejpozději trenér na nový incident zareaguje. */
const MAX_REACTION_DELAY_DAYS = 2;
/** Model na incident nemá přemýšlet dlouho: hodinová úloha nesmí stát. */
const MODEL_TIMEOUT_MS = 60_000;

export interface IncidentCoachOpts {
  /** Režim přepínače. `shadow` rozhodne a zapíše do deníku, ale nic neprovede. */
  mode?: CoachMode;
  /** Binding Workers AI. Bez něj rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání). */
  model?: string;
}

type DecidedBy = "model" | "fallback";

export interface IncidentDecisionResult {
  incidentId: string;
  stage: IncidentStage;
  choice: string;
  decidedBy: DecidedBy;
  /** Služba rozhodnutí provedla (v režimu shadow nikdy). */
  executed: boolean;
}

export interface IncidentRunResult {
  skipped: "night" | "not_ai" | "nothing_due" | "done_today" | null;
  decisions: IncidentDecisionResult[];
}

interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
}

const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null };

interface AiTeamRow {
  id: string;
  name: string;
  budget: number;
  user_id: string | null;
  parent_team_id: string | null;
  team_type: string | null;
  game_date: string | null;
}

interface ClubView {
  club: IncidentClub;
  analysis: SquadAnalysis;
  members: Map<string, SquadMember>;
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00.000Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00.000Z`)) / 86_400_000);
}

/** Nárok podle režimu: rozhodnutí nanečisto nesmí po přepnutí na `on` zablokovat skutečné. */
function claimKey(mode: CoachMode, task: string): string {
  return mode === "shadow" ? `shadow:${task}` : task;
}

/** Za kolik dní po vzniku trenér na incident zareaguje (0–2), pevně pro incident. */
export function reactionDelayDays(incidentId: string): number {
  return seedFromString(`incident-reaction:${incidentId}`) % (MAX_REACTION_DELAY_DAYS + 1);
}

/** Je čas o incidentu rozhodnout? Ne hned po vzniku, ale vždy nejpozději den před lhůtou. */
export function incidentDecisionDue(input: { today: string; createdDay: string; deadlineDay: string | null; delayDays: number }): boolean {
  if (input.deadlineDay && input.today >= addDays(input.deadlineDay, -1)) return true;
  return input.today >= addDays(input.createdDay, input.delayDays);
}

async function loadAiTeam(db: D1Database, teamId: string): Promise<AiTeamRow | null> {
  const row = await db.prepare("SELECT id, name, budget, user_id, parent_team_id, team_type, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<AiTeamRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "AI klub k incidentům", e); return null; });
  if (!row || row.user_id !== "ai" || row.parent_team_id || (row.team_type ?? "senior") === "u21") return null;
  return row;
}

/** Otevřené krádeže a škody letošní sezóny a dluhy, u kterých se ještě nerozhodlo o záloze. */
async function loadOpenIncidents(db: D1Database, teamId: string): Promise<IncidentRadek[]> {
  const rows = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.join(", ")} FROM club_incidents
      WHERE team_id = ?
        AND season_number = (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)
        AND ((status = 'otevreny' AND category IN ('kradez', 'poskozeni'))
          OR (status = 'probiha' AND kind = 'dluhy' AND json_extract(resolution_data, '$.zaloha') IS NULL))
      ORDER BY game_date, id`,
  ).bind(teamId).all<IncidentRadek>()
    .catch((e) => { logger.warn({ module: M, teamId }, "otevřené incidenty AI klubu", e); return null; });
  return rows?.results ?? [];
}

async function countUpcomingMatches(db: D1Database, teamId: string, today: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status IN ('scheduled', 'lineups_open')
        AND substr(sc.scheduled_at, 1, 10) BETWEEN ?2 AND ?3`,
  ).bind(teamId, today, addDays(today, 7)).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "zápasy v příštím týdnu", e); return null; });
  return row?.n ?? 0;
}

async function hasPoliceman(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS ano FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
       AND json_extract(life_context, '$.occupation') = ? LIMIT 1`,
  ).bind(teamId, POVOLANI_POLICISTA).first()
    .catch((e) => { logger.warn({ module: M, teamId }, "policista v kádru", e); return null; });
  return row !== null;
}

async function loadClubView(db: D1Database, team: AiTeamRow, profile: AiCoachProfile, today: string): Promise<ClubView> {
  const members = await loadClubSquad(db, team.id);
  const analysis = analyzeSquad(members, profile);
  const weeklyCosts = await weeklyRunningCosts(db, team.id);
  return {
    club: {
      teamName: team.name, profile, budget: Number(team.budget) || 0, reserve: budgetReserve(profile, weeklyCosts),
      squadSize: analysis.seniorOwnCount, matchesNext7Days: await countUpcomingMatches(db, team.id, today),
    },
    analysis,
    members: new Map(members.map((m) => [m.id, m])),
  };
}

/** Hráč kádru očima trenéra, nebo null, když v kádru už není. */
async function squadPlayer(db: D1Database, teamId: string, playerId: string, view: ClubView): Promise<(IncidentPlayer & { weeklyWage: number }) | null> {
  const p = await nactiHraceKadru(db, teamId, playerId);
  if (!p) return null;
  const m = view.members.get(playerId);
  return {
    playerId, name: p.jmeno, position: m?.position ?? "unknown", age: m?.age ?? p.vek, rating: Math.round(m?.rating ?? 0),
    importance: view.analysis.importanceOf(playerId), popular: jeOblibeny(p.vudcovstvi, p.silnychVztahu), weeklyWage: p.mzda,
  };
}

function baseFacts(inc: IncidentRadek, today: string) {
  return {
    incidentId: inc.id,
    kind: inc.kind,
    description: INCIDENT_KIND_TEXT[inc.kind] ?? KATALOG_PODLE_KIND.get(inc.kind)?.label ?? inc.kind,
    category: inc.category as "kradez" | "poskozeni" | "zivotni",
    severity: inc.severity,
    damage: hodnotaSkody(nactiZtraty(inc.loss)),
    daysToDeadline: inc.deadline ? Math.max(0, daysBetween(today, inc.deadline)) : null,
  };
}

/**
 * Co o incidentu trenér ví a v jaké je fázi. Klíč fáze se změní, kdykoli přibude nová
 * možnost: obvinění, výsledek policie, nová nalezená stopa.
 */
async function incidentFacts(
  db: D1Database, team: AiTeamRow, inc: IncidentRadek, view: ClubView, today: string,
): Promise<{ facts: IncidentFacts; stageKey: string } | null> {
  if (inc.status === "probiha") {
    if (inc.kind !== "dluhy" || !inc.subject_player_id) return null;
    const player = await squadPlayer(db, team.id, inc.subject_player_id, view);
    if (!player) return null;
    return {
      facts: { ...baseFacts(inc, today), stage: "advance", player, advanceMin: ZALOHA_MIN_KC, advanceMax: ZALOHA_MAX_KC },
      stageKey: "advance",
    };
  }

  if (inc.culprit_revealed === 1) {
    if (inc.culprit_type !== "hrac" || !inc.culprit_player_id) return null;
    const culprit = await squadPlayer(db, team.id, inc.culprit_player_id, view);
    if (!culprit) return null;
    const allowed = dostupneAkce(proAkce(inc, true)).tresty;
    if (allowed.length === 0) return null;
    const damage = hodnotaSkody(nactiZtraty(inc.loss));
    const block = view.analysis.sellBlock(culprit.playerId);
    const seniorGoalkeepers = [...view.members.values()].filter((m) => !m.isU21Roster && !m.loanedIn && m.position === "GK").length;
    const repeatOffender = await jeRecidivista(db, team.id, culprit.playerId, inc.id, inc.season_number, team.game_date ?? `${today}T12:00:00.000Z`);
    return {
      facts: {
        ...baseFacts(inc, today), stage: "punish",
        culprit: { ...culprit, repeatOffender },
        allowed,
        deduction: castkaSrazky(damage, culprit.weeklyWage),
        fine: castkaPokuty(damage, culprit.weeklyWage),
        lastGoalkeeper: culprit.position === "GK" && seniorGoalkeepers <= 1,
        canRelease: block !== "loaned_in" && block !== "last_goalkeeper" && block !== "min_squad",
      },
      stageKey: "punish",
    };
  }

  const clues = await nactiStopy(db, inc.id);
  const actions = dostupneAkce(proAkce(inc, false));
  const suspects: IncidentSuspect[] = [];
  for (const id of stavVysetrovani(clues, false).podezreli) {
    const p = await squadPlayer(db, team.id, id, view);
    if (p) suspects.push({ ...p, directClue: clues.some((c) => c.nalezena && c.ukazujeNa === id) });
  }
  const names = new Map(suspects.map((s) => [s.playerId, s.name]));
  const found = clues.filter((c) => c.nalezena);
  return {
    facts: {
      ...baseFacts(inc, today), stage: "investigate",
      clues: found.map((c) => clueLine(c, (id) => names.get(id) ?? "a player who has left the club")),
      suspects,
      accusationsLeft: Math.max(0, MAX_OBVINENI - inc.accusations),
      canAccuse: actions.obvinit,
      policeAvailable: actions.policie,
      policeFailed: inc.police_success === 0,
      policeChance: sancePolicie(clues, await hasPoliceman(db, team.id)),
    },
    stageKey: `investigate:a${inc.accusations}:p${inc.police_success ?? "-"}:c${found.length}`,
  };
}

async function decide(
  ctx: IncidentDecisionContext, mode: CoachMode, opts: IncidentCoachOpts,
): Promise<{ option: IncidentOption; reason: string; by: DecidedBy; trace: ModelTrace }> {
  if (mode === "off" || !opts.ai) return { option: fallbackIncidentDecision(ctx), reason: "fallback", by: "fallback", trace: NO_TRACE };
  const res = await callCoachModel(opts.ai, {
    system: INCIDENT_SYSTEM_PROMPT, user: renderIncidentPrompt(ctx), maxTokens: 300,
    schema: { name: "incident_decision", schema: incidentDecisionSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs,
  };
  const parsed = res.json ? validateIncidentDecision(res.json, ctx) : null;
  if (!parsed) {
    return { option: fallbackIncidentDecision(ctx), reason: "fallback", by: "fallback", trace: { ...trace, error: trace.error ?? "neplatná odpověď modelu" } };
  }
  return { option: parsed.option, reason: parsed.reason, by: "model", trace };
}

/** Provede rozhodnutí stejnou službou, jakou volá routa člověka. `null` = nic se nedělá. */
async function execute(env: Bindings, teamId: string, incidentId: string, action: IncidentAction): Promise<VysledekAkce | null> {
  switch (action.type) {
    case "wait": return null;
    case "police": return zavolejPolicii(env, teamId, incidentId);
    case "accuse": return obvinHrace(env, teamId, incidentId, action.playerId);
    case "punish": return rozhodni(env, teamId, incidentId, action.punishment, { zapasu: action.matches });
    case "advance": return rozhodniZalohu(env, teamId, incidentId, action.lend ? "pujcit" : "odmitnout");
  }
}

async function handleIncident(
  env: Bindings, team: AiTeamRow, inc: IncidentRadek, view: ClubView, today: string, mode: CoachMode, opts: IncidentCoachOpts,
): Promise<IncidentDecisionResult | null> {
  const db = env.DB;
  const built = await incidentFacts(db, team, inc, view, today);
  if (!built) return null;
  const options = incidentOptions(built.facts, view.club);
  // Jediná možnost (jen počkat) není rozhodnutí a model se na ni neptá.
  if (options.length < 2) return null;
  const ctx: IncidentDecisionContext = { club: view.club, facts: built.facts, options };

  const task = claimKey(mode, `incident:${inc.id}`);
  if (!(await claimCoachTask(db, team.id, task, built.stageKey))) return null;
  try {
    const outcome = await decide(ctx, mode, opts);
    let executed: Record<string, unknown> | null = null;
    let retry = false;
    if (mode !== "shadow") {
      const res = await execute(env, team.id, inc.id, outcome.option.action);
      executed = res === null ? { ok: true, action: outcome.option.key }
        : res.ok ? { ...res, action: outcome.option.key }
        : { ok: false, action: outcome.option.key, status: res.kod, error: res.chyba };
      // Chyba databáze: zítra to trenér zkusí znovu. Změněný incident (409) má novou fázi sám.
      retry = res !== null && !res.ok && res.kod === 500;
    }
    await logDecision(db, {
      teamId: team.id, kind: "incident", mode, model: outcome.trace.model, contextRef: `${inc.id}:${built.stageKey}`,
      inputSummary: renderIncidentPrompt(ctx), rawOutput: outcome.trace.raw,
      actions: { stage: built.facts.stage, choice: outcome.option.key, reason: outcome.reason, decidedBy: outcome.by },
      executed, usedFallback: outcome.by === "fallback", error: outcome.trace.error,
      tokensIn: outcome.trace.tokensIn, tokensOut: outcome.trace.tokensOut, latencyMs: outcome.trace.latencyMs,
    });
    if (retry) await releaseCoachTask(db, team.id, task, built.stageKey);
    return {
      incidentId: inc.id, stage: built.facts.stage, choice: outcome.option.key, decidedBy: outcome.by,
      executed: executed?.ok === true && mode !== "shadow",
    };
  } catch (e) {
    await releaseCoachTask(db, team.id, task, built.stageKey);
    throw e;
  }
}

/**
 * Rozhodne o incidentech AI klubu, na které je čas: jednou za herní den, přes den.
 * Lidskému klubu ani U21 nedělá nic.
 */
export async function handleAiIncidents(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: IncidentCoachOpts = {},
): Promise<IncidentRunResult> {
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < DAY_FROM_HOUR || hour > DAY_TO_HOUR)) return { skipped: "night", decisions: [] };
  const db = env.DB;
  const team = await loadAiTeam(db, teamId);
  if (!team) return { skipped: "not_ai", decisions: [] };
  const today = (team.game_date ?? now.toISOString()).slice(0, 10);

  const due = (await loadOpenIncidents(db, teamId)).filter((inc) => incidentDecisionDue({
    today, createdDay: inc.game_date, deadlineDay: inc.deadline, delayDays: reactionDelayDays(inc.id),
  }));
  if (due.length === 0) return { skipped: "nothing_due", decisions: [] };

  const dayTask = claimKey(mode, "incidents");
  if (!(await claimCoachTask(db, teamId, dayTask, today))) return { skipped: "done_today", decisions: [] };
  let view: ClubView;
  try {
    view = await loadClubView(db, team, profile, today);
  } catch (e) {
    await releaseCoachTask(db, teamId, dayTask, today);
    throw e;
  }

  const decisions: IncidentDecisionResult[] = [];
  for (const inc of due) {
    try {
      const d = await handleIncident(env, team, inc, view, today, mode, opts);
      if (d) decisions.push(d);
    } catch (e) {
      logger.error({ module: M, teamId }, `rozhodnutí AI trenéra o incidentu ${inc.id}`, e);
    }
  }
  return { skipped: null, decisions };
}

/** Hodinová část AI trenéra pro incidenty (podpis HourlyHook z ai-coach/hourly-hooks.ts). */
export const incidentsHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, INCIDENT_COACH_AREA);
  await handleAiIncidents(env, teamId, profile, now, { mode, ai: env });
};
