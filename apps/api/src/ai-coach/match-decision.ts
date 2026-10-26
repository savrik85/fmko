/**
 * Rozhodnutí AI trenéra před zápasem: čisté funkce bez databáze.
 *
 * Model (nebo náhradní pravidlo) volí jen styl: formaci, taktiku, tvrdost, koho šetřit,
 * komu dát šanci, kapitána, exekutory standardek a pokyny na lavičce. Jedenáctku
 * a lavičku podle obsazení postů skládá kód (`assembleLineup`) a výsledek kontroluje
 * stejnými pravidly jako lidskou sestavu (`validateMatchPlan`, `validateBench`).
 * Kapitán klubu (`teams.captain_id`, páska z dohody s hráčem) nosí pásku vždy, když hraje.
 */

import { MAX_PLAN_RULES, PLAN_CONDITION_MAX, PLAN_CONDITION_MIN, PLAN_MINUTE_MAX, PLAN_MINUTE_MIN, type MatchPlanRule } from "@okresni-masina/shared";
import { decideAiHardness, type Hardness } from "../engine/hardness";
import { playerRoleRating } from "../engine/roles";
import { applyPositionPenalty } from "../engine/simulation";
import { calcFormationSynergy, calcTacticFit } from "../engine/tactics";
import type { MatchPlayer } from "../engine/types";
import { MAX_BENCH, validateBench } from "../lib/lineup-bench";
import { validateMatchPlan } from "../lib/match-plan-validation";
import { FORMATIONS, TACTICS, type AiCoachProfile, type Formation, type Tactic } from "./profile";

export type Slot = "GK" | "DEF" | "MID" | "FWD";
export const SLOTS: readonly Slot[] = ["GK", "DEF", "MID", "FWD"];
export const HARDNESS_OPTIONS: readonly Hardness[] = ["fair", "normal", "hard"];
export type FixtureKind = "league" | "cup" | "friendly";

/** Hráč kádru, jak ho vidí rozhodování (klíč `P1…` místo UUID kvůli modelu). */
export interface SquadPlayer {
  key: string;
  id: string;
  name: string;
  position: Slot;
  age: number;
  rating: number;
  condition: number;
  morale: number;
  /** Průměr posledních pěti známek (1–10), null = zatím nehrál. */
  form: number | null;
  appearances: number;
  leadership: number;
  aggression: number;
  setPieces: number;
  shooting: number;
  /** Hráč je jednu žlutou od stopky. */
  oneYellowFromBan: boolean;
  /** Hodnota hráče na každém postu (engine, včetně postihu za hraní mimo post a únavy). */
  slotRating: Record<Slot, number>;
  /** Hráč pro engine na přirozeném postu (taktika, tvrdost). */
  engine: MatchPlayer;
}

export interface UnavailablePlayer {
  key: string;
  id: string;
  name: string;
  position: Slot;
  reason: "injured" | "suspended" | "excused";
}

export interface MatchContext {
  teamId: string;
  teamName: string;
  fixture: {
    kind: FixtureKind;
    calendarId: string;
    isHome: boolean;
    opponentName: string;
    /** Pohár: název kola; liga: číslo kola. */
    label: string;
    isDerby: boolean;
    /** Sázka u přáteláku (Kč). */
    stake: number;
  };
  own: { position: number | null; teams: number | null; points: number | null; form: string; strength: number };
  opponent: { position: number | null; form: string; strength: number | null; bigClub: boolean };
  /** Přísnost delegovaného sudího 0–100, null = neznámý. */
  refereeStrictness: number | null;
  weather: string | null;
  pitchCondition: number | null;
  /** Za kolik dní je další soutěžní zápas (null = nevíme / dlouho nic). */
  daysToNextMatch: number | null;
  familiarity: Record<string, number>;
  profile: AiCoachProfile;
  squad: SquadPlayer[];
  unavailable: UnavailablePlayer[];
  currentRoles: { penaltyTakerId: string | null; freekickTakerId: string | null };
  lastLineup: { formation: string; tactic: string } | null;
  /**
   * Klíče dostupných hráčů, kterým trenér slíbil místo v sestavě (dohoda s nespokojeným
   * hráčem). Slib se plní vždy: hrají od začátku, ať model rozhodne cokoli.
   */
  promisedStarters?: string[];
  /**
   * Klíč kapitána klubu (`teams.captain_id`, třeba z dohody s nespokojeným hráčem), dostupného
   * i nedostupného. Když hraje od začátku, pásku nosí on; model volí kapitána jen pro zápas bez něj.
   */
  clubCaptain?: string | null;
}

/** Pokyn na lavičce, jak ho píše model (ploché pole, kód ho převede na MatchPlanRule). */
export interface DecisionPlanRule {
  fromMinute: number;
  when: "losing" | "drawing" | "winning" | "minute" | "down_a_man" | "up_a_man" | "tired";
  byAtLeast?: number;
  below?: number;
  action: "tactic" | "hardness" | "sub";
  tactic?: Tactic;
  hardness?: Hardness;
  out?: string;
  in?: string;
}

/** Rozhodnutí v řeči klíčů hráčů (P1…), stejný tvar pro model i náhradní pravidlo. */
export interface MatchDecision {
  formation: Formation;
  tactic: Tactic;
  hardness: Hardness;
  captain: string | null;
  rest: string[];
  mustStart: string[];
  penaltyTaker: string | null;
  freekickTaker: string | null;
  plan: DecisionPlanRule[];
  reasoning: string;
}

export interface AssembledLineup {
  formation: Formation;
  tactic: Tactic;
  hardness: Hardness;
  players: Array<{ playerId: string; matchPosition: Slot }>;
  bench: string[];
  captainId: string | null;
  matchPlan: MatchPlanRule[];
  penaltyTakerId: string | null;
  freekickTakerId: string | null;
  /** Co se z rozhodnutí nepodařilo splnit (do deníku). */
  notes: string[];
}

const MAX_REST = 6;
const MAX_MUST_START = 3;
/** Kolik minut musí slíbený hráč odehrát, aby se zápas počítal do slibu (checkMinutesPledge). */
const PROMISED_MINUTES = 45;
const PLAN_WHEN = ["losing", "drawing", "winning", "minute", "down_a_man", "up_a_man", "tired"] as const;
const PLAN_ACTIONS = ["tactic", "hardness", "sub"] as const;

// ── Pomocné výpočty ─────────────────────────────────────────────────────────

export function formationQuotas(formation: string): Record<Slot, number> {
  const [d, m, f] = formation.split("-").map(Number);
  return { GK: 1, DEF: d || 4, MID: m || 4, FWD: f || 2 };
}

/** Kopie hráče na daném postu se stejným postihem za hraní mimo post, jaký dá zápas. */
export function atSlot(p: MatchPlayer, slot: Slot): MatchPlayer {
  const copy = { ...p, matchPosition: slot };
  applyPositionPenalty(copy);
  return copy;
}

export function slotRatings(p: MatchPlayer): Record<Slot, number> {
  const out = {} as Record<Slot, number>;
  for (const s of SLOTS) out[s] = Math.round(playerRoleRating(atSlot(p, s)) * 10) / 10;
  return out;
}

interface PickOptions {
  exclude?: ReadonlySet<string>;
  include?: readonly string[];
}

interface PickedEleven {
  picks: Array<{ player: SquadPlayer; slot: Slot }>;
  notes: string[];
}

/**
 * Jedenáctka pro formaci: nejdřív hráči, kterým trenér chce dát šanci, pak přirození
 * hráči postů podle hodnoty na postu, zbytek nejlepší z ostatních (s postihem mimo post).
 * Šetření hráči (`exclude`) se použijí jen tehdy, když bez nich nejde postavit jedenáct.
 */
export function pickEleven(squad: readonly SquadPlayer[], formation: string, opts: PickOptions = {}): PickedEleven {
  const quotas = formationQuotas(formation);
  const notes: string[] = [];
  const exclude = opts.exclude ?? new Set<string>();
  let pool = squad.filter((p) => !exclude.has(p.key));
  if (pool.length < 11) {
    const back = squad.filter((p) => exclude.has(p.key)).sort((a, b) => b.rating - a.rating);
    while (pool.length < 11 && back.length > 0) {
      const p = back.shift()!;
      pool = [...pool, p];
      notes.push(`${p.key} musel hrát i přes šetření`);
    }
  }

  const left: Record<Slot, number> = { ...quotas };
  const used = new Set<string>();
  const picks: Array<{ player: SquadPlayer; slot: Slot }> = [];
  const take = (player: SquadPlayer, slot: Slot) => {
    picks.push({ player, slot });
    used.add(player.key);
    left[slot]--;
  };

  for (const key of opts.include ?? []) {
    const p = pool.find((x) => x.key === key);
    if (!p || used.has(p.key)) continue;
    if (left[p.position] > 0) { take(p, p.position); continue; }
    // Přirozený post je plný: nejlepší jiný volný post v poli (do brány ne).
    const alt = (["DEF", "MID", "FWD"] as const)
      .filter((s) => left[s] > 0 && p.position !== "GK")
      .sort((a, b) => p.slotRating[b] - p.slotRating[a])[0];
    if (alt) take(p, alt);
    else notes.push(`${p.key} se do sestavy nevešel`);
  }

  // Brankář: přirozený, jinak nejlepší v bráně z ostatních.
  if (left.GK > 0) {
    const gk = pool.filter((p) => !used.has(p.key) && p.position === "GK").sort((a, b) => b.slotRating.GK - a.slotRating.GK)[0]
      ?? pool.filter((p) => !used.has(p.key)).sort((a, b) => b.slotRating.GK - a.slotRating.GK)[0];
    if (gk) take(gk, "GK");
  }

  // Přirození hráči postů.
  for (const slot of ["DEF", "MID", "FWD"] as const) {
    const naturals = pool.filter((p) => !used.has(p.key) && p.position === slot).sort((a, b) => b.slotRating[slot] - a.slotRating[slot]);
    for (const p of naturals) {
      if (left[slot] <= 0) break;
      take(p, slot);
    }
  }

  // Zbylá místa: nejlepší dvojice (hráč, post) z ostatních. Brankáře do pole až nakonec.
  while (picks.length < 11) {
    let best: { player: SquadPlayer; slot: Slot; value: number } | null = null;
    for (const p of pool) {
      if (used.has(p.key)) continue;
      for (const slot of ["DEF", "MID", "FWD"] as const) {
        if (left[slot] <= 0) continue;
        const value = p.slotRating[slot] - (p.position === "GK" ? 1000 : 0);
        if (!best || value > best.value) best = { player: p, slot, value };
      }
    }
    if (!best) break;
    take(best.player, best.slot);
  }
  return { picks, notes };
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export interface FormationOption {
  formation: Formation;
  strength: number;
  outOfPosition: number;
  familiarity: number;
}

export function formationOptions(ctx: MatchContext): FormationOption[] {
  return FORMATIONS.map((formation) => {
    const { picks } = pickEleven(ctx.squad, formation);
    return {
      formation,
      strength: Math.round(avg(picks.map((x) => x.player.slotRating[x.slot])) * 10) / 10,
      outOfPosition: picks.filter((x) => x.player.position !== x.slot).length,
      familiarity: Math.round(ctx.familiarity[formation] ?? 0),
    };
  });
}

export function elevenEngine(picks: PickedEleven["picks"]): MatchPlayer[] {
  return picks.map((x) => atSlot(x.player.engine, x.slot));
}

/** Jak tým zvládá taktiku v dané formaci: zvládnutí × synergie (0,6 až 1,3). */
export function tacticOptions(ctx: MatchContext, formation: Formation): Array<{ tactic: Tactic; fit: number; synergy: number }> {
  const xi = elevenEngine(pickEleven(ctx.squad, formation).picks);
  return TACTICS.map((tactic) => ({
    tactic,
    fit: Math.round(calcTacticFit(xi, tactic) * 100) / 100,
    synergy: Math.round(calcFormationSynergy(tactic, formation) * 100) / 100,
  }));
}

function strengthGap(ctx: MatchContext): number {
  return ctx.opponent.strength === null ? 0 : ctx.opponent.strength - ctx.own.strength;
}

/** Tvrdost podle stejného pravidla jako dřív u AI týmů (sudí, agresivita, karty, síla soupeře). */
export function ruleHardness(ctx: MatchContext, xiKeys?: ReadonlySet<string>): Hardness {
  const xi = ctx.squad.filter((p) => !xiKeys || xiKeys.has(p.key));
  return decideAiHardness({
    squadAggression: avg(xi.map((p) => p.aggression)) || 50,
    refStrictness: ctx.refereeStrictness ?? 50,
    strengthGap: strengthGap(ctx),
    playersOneYellowFromBan: xi.filter((p) => p.oneYellowFromBan).length,
    isDerby: ctx.fixture.isDerby,
    isU21: false,
  });
}

// ── Náhradní pravidlo podle povahy ──────────────────────────────────────────

function bestFormation(ctx: MatchContext): Formation {
  const fav = ctx.profile.favouriteFormations;
  const scored = formationOptions(ctx).map((o) => ({
    o,
    score: o.strength
      + (o.familiarity / 100) * 1.5
      + (fav[0] === o.formation ? 1.5 : fav[1] === o.formation ? 0.8 : 0)
      - o.outOfPosition * 1.2,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.o.formation ?? "4-4-2";
}

function bestTactic(ctx: MatchContext, formation: Formation): Tactic {
  const options = tacticOptions(ctx, formation);
  const eff = (t: Tactic) => {
    const o = options.find((x) => x.tactic === t);
    return o ? o.fit * o.synergy : 0;
  };
  const p = ctx.profile;
  const gap = strengthGap(ctx);
  if (gap >= 6 && p.risk < 60) return eff("defensive") >= 0.9 ? "defensive" : "balanced";
  if (gap <= -6 && p.ambition >= 50) {
    const attacking: Tactic[] = ["offensive", "possession", "pressing"];
    if (attacking.includes(p.favouriteTactic) && eff(p.favouriteTactic) >= 0.9) return p.favouriteTactic;
    return eff("offensive") >= 0.9 ? "offensive" : "balanced";
  }
  return eff(p.favouriteTactic) >= 0.92 ? p.favouriteTactic : "balanced";
}

function bestBy(players: readonly SquadPlayer[], score: (p: SquadPlayer) => number): SquadPlayer | null {
  return [...players].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function fallbackMatchDecision(ctx: MatchContext): MatchDecision {
  const p = ctx.profile;
  const friendly = ctx.fixture.kind === "friendly";
  const gap = strengthGap(ctx);

  // Slíbené místo v sestavě (dohoda s nespokojeným hráčem) má přednost: hráč hraje a nešetří se.
  const promised = (ctx.promisedStarters ?? []).filter((k) => ctx.squad.some((pl) => pl.key === k));

  // Koho šetřit: unavení, u přáteláku i ti, kdo hrají za dva dny soutěž.
  const restThreshold = 55 - (p.risk - 50) / 5 + (friendly ? 12 : 0);
  const rest: string[] = [];
  for (const pl of [...ctx.squad].sort((a, b) => a.condition - b.condition)) {
    if (rest.length >= MAX_REST) break;
    if (pl.condition >= restThreshold || promised.includes(pl.key)) continue;
    const others = ctx.squad.filter((o) => o.position === pl.position && o.key !== pl.key && !rest.includes(o.key));
    if (others.length >= formationQuotas("4-4-2")[pl.position]) rest.push(pl.key);
  }

  // Komu dát šanci: slíbení hráči, pak mládežník v přáteláku nebo proti slabšímu soupeři.
  const mustStart: string[] = [...promised];
  if (p.youthFocus >= 60 && (friendly || gap <= -8)) {
    const formation0 = bestFormation(ctx);
    const xi = new Set(pickEleven(ctx.squad, formation0, { exclude: new Set(rest), include: mustStart }).picks.map((x) => x.player.key));
    const youngsters = ctx.squad
      .filter((pl) => pl.age <= 21 && !xi.has(pl.key) && !rest.includes(pl.key) && pl.position !== "GK")
      .sort((a, b) => b.rating - a.rating)
      .slice(0, friendly ? 2 : 1);
    mustStart.push(...youngsters.map((y) => y.key));
  }

  const formation = bestFormation(ctx);
  const tactic = bestTactic(ctx, formation);
  const xiPicks = pickEleven(ctx.squad, formation, { exclude: new Set(rest), include: mustStart }).picks;
  const xiKeys = new Set(xiPicks.map((x) => x.player.key));
  let hardness = ruleHardness(ctx, xiKeys);
  if (p.risk >= 75 && hardness === "normal" && (ctx.refereeStrictness ?? 50) < 60) hardness = "hard";
  if (p.risk <= 20 && hardness === "hard") hardness = "normal";
  if (friendly && hardness === "hard") hardness = "normal";

  const xiPlayers = ctx.squad.filter((pl) => xiKeys.has(pl.key));
  const captain = ctx.clubCaptain && xiKeys.has(ctx.clubCaptain)
    ? ctx.clubCaptain
    : bestBy(xiPlayers, (pl) => pl.leadership * 2 + pl.age / 2)?.key ?? null;
  const currentPen = ctx.squad.find((pl) => pl.id === ctx.currentRoles.penaltyTakerId);
  const currentFk = ctx.squad.find((pl) => pl.id === ctx.currentRoles.freekickTakerId);
  const penaltyTaker = currentPen?.key ?? bestBy(xiPlayers, (pl) => pl.shooting * 0.6 + pl.setPieces * 0.4)?.key ?? null;
  const freekickTaker = currentFk?.key ?? bestBy(xiPlayers, (pl) => pl.setPieces)?.key ?? null;

  const plan: DecisionPlanRule[] = [];
  const attackTactic: Tactic = ["offensive", "possession", "pressing"].includes(p.favouriteTactic) ? p.favouriteTactic : "offensive";
  if (p.risk >= 40) {
    plan.push({ fromMinute: Math.round(65 - (p.risk - 40) / 4), when: "losing", byAtLeast: 1, action: "tactic", tactic: attackTactic });
  }
  if (p.risk < 60) plan.push({ fromMinute: 75, when: "winning", byAtLeast: 1, action: "tactic", tactic: "defensive" });
  else plan.push({ fromMinute: 80, when: "winning", byAtLeast: 2, action: "tactic", tactic: "defensive" });
  if (p.risk < 35) plan.push({ fromMinute: 1, when: "down_a_man", action: "tactic", tactic: "defensive" });

  // Střídání unavených: dva nejméně čerství z pole za náhradníka stejného postu.
  const remaining = ctx.squad.filter((pl) => !xiKeys.has(pl.key));
  const tired = xiPicks
    .filter((x) => x.slot !== "GK")
    .sort((a, b) => a.player.condition - b.player.condition)
    .slice(0, 2);
  const usedIn = new Set<string>();
  for (const t of tired) {
    if (plan.length >= MAX_PLAN_RULES) break;
    const sub = remaining
      .filter((r) => r.position === t.slot && !usedIn.has(r.key) && r.condition >= 70)
      .sort((a, b) => b.rating - a.rating)[0];
    if (!sub) continue;
    usedIn.add(sub.key);
    plan.push({ fromMinute: 55, when: "tired", below: 40, action: "sub", out: t.player.key, in: sub.key });
  }

  return {
    formation, tactic, hardness, captain, rest, mustStart, penaltyTaker, freekickTaker,
    plan: plan.slice(0, MAX_PLAN_RULES),
    reasoning: "fallback rule",
  };
}

// ── Kontrola rozhodnutí modelu ─────────────────────────────────────────────

export type DecisionCheck =
  | { ok: true; decision: MatchDecision; rejected: string[] }
  | { ok: false; reason: string };

function keyList(raw: unknown, field: string, valid: ReadonlySet<string>, max: number, rejected: string[]): string[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return `${field} není seznam`;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return `${field} obsahuje neplatnou hodnotu`;
    if (!valid.has(item)) return `${field}: neznámý nebo nedostupný hráč ${item}`;
    if (!out.includes(item)) out.push(item);
  }
  if (out.length > max) {
    rejected.push(`${field}: zkráceno na ${max}`);
    return out.slice(0, max);
  }
  return out;
}

function optionalKey(raw: unknown, field: string, valid: ReadonlySet<string>): string | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return { error: `${field} není klíč hráče` };
  if (!valid.has(raw)) return { error: `${field}: neznámý nebo nedostupný hráč ${raw}` };
  return raw;
}

function planRule(raw: unknown, valid: ReadonlySet<string>): DecisionPlanRule | string {
  if (!raw || typeof raw !== "object") return "pokyn není objekt";
  const r = raw as Record<string, unknown>;
  const fromMinute = Number(r.fromMinute);
  if (!Number.isInteger(fromMinute) || fromMinute < PLAN_MINUTE_MIN || fromMinute > PLAN_MINUTE_MAX) return "neplatná minuta pokynu";
  if (!(PLAN_WHEN as readonly string[]).includes(r.when as string)) return "neplatná podmínka pokynu";
  if (!(PLAN_ACTIONS as readonly string[]).includes(r.action as string)) return "neplatná akce pokynu";
  const rule: DecisionPlanRule = { fromMinute, when: r.when as DecisionPlanRule["when"], action: r.action as DecisionPlanRule["action"] };
  if (rule.when === "losing" || rule.when === "winning") {
    const by = r.byAtLeast === undefined || r.byAtLeast === null ? 1 : Number(r.byAtLeast);
    if (!Number.isInteger(by) || by < 1 || by > 3) return "neplatný rozdíl gólů";
    rule.byAtLeast = by;
  }
  if (rule.when === "tired") {
    const below = Number(r.below);
    if (!Number.isInteger(below) || below < PLAN_CONDITION_MIN || below > PLAN_CONDITION_MAX) return "neplatná hranice kondice";
    rule.below = below;
  }
  if (rule.action === "tactic") {
    if (!(TACTICS as readonly string[]).includes(r.tactic as string)) return "neplatná taktika v pokynu";
    rule.tactic = r.tactic as Tactic;
  } else if (rule.action === "hardness") {
    if (!(HARDNESS_OPTIONS as readonly string[]).includes(r.hardness as string)) return "neplatná tvrdost v pokynu";
    rule.hardness = r.hardness as Hardness;
  } else {
    if (typeof r.out !== "string" || typeof r.in !== "string" || !r.out || !r.in) return "střídání bez hráčů";
    if (!valid.has(r.out) || !valid.has(r.in)) return `střídání: neznámý hráč ${valid.has(r.out) ? r.in : r.out}`;
    rule.out = r.out;
    rule.in = r.in;
  }
  return rule;
}

/**
 * Zkontroluje odpověď modelu. Neznámá formace, taktika, tvrdost nebo hráč, který není
 * k dispozici, shodí celé rozhodnutí (rozhodne náhradní pravidlo). Jednotlivý chybný
 * pokyn na lavičce se jen zahodí.
 */
export function validateMatchDecision(raw: unknown, ctx: MatchContext): DecisionCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "odpověď není objekt" };
  const r = raw as Record<string, unknown>;
  if (!(FORMATIONS as readonly string[]).includes(r.formation as string)) return { ok: false, reason: `neznámá formace ${String(r.formation)}` };
  if (!(TACTICS as readonly string[]).includes(r.tactic as string)) return { ok: false, reason: `neznámá taktika ${String(r.tactic)}` };
  if (!(HARDNESS_OPTIONS as readonly string[]).includes(r.hardness as string)) return { ok: false, reason: `neznámá tvrdost ${String(r.hardness)}` };

  const valid = new Set(ctx.squad.map((p) => p.key));
  const rejected: string[] = [];
  const rest = keyList(r.rest, "rest", valid, MAX_REST, rejected);
  if (typeof rest === "string") return { ok: false, reason: rest };
  const mustStart = keyList(r.mustStart, "mustStart", valid, MAX_MUST_START, rejected);
  if (typeof mustStart === "string") return { ok: false, reason: mustStart };
  const captain = optionalKey(r.captain, "captain", valid);
  if (captain && typeof captain === "object") return { ok: false, reason: captain.error };
  const penaltyTaker = optionalKey(r.penaltyTaker, "penaltyTaker", valid);
  if (penaltyTaker && typeof penaltyTaker === "object") return { ok: false, reason: penaltyTaker.error };
  const freekickTaker = optionalKey(r.freekickTaker, "freekickTaker", valid);
  if (freekickTaker && typeof freekickTaker === "object") return { ok: false, reason: freekickTaker.error };

  const plan: DecisionPlanRule[] = [];
  if (r.plan !== undefined && r.plan !== null) {
    if (!Array.isArray(r.plan)) return { ok: false, reason: "plan není seznam" };
    for (const item of r.plan) {
      const rule = planRule(item, valid);
      if (typeof rule === "string") {
        if (rule.startsWith("střídání: neznámý")) return { ok: false, reason: rule };
        rejected.push(rule);
        continue;
      }
      if (plan.length >= MAX_PLAN_RULES) { rejected.push("pokynů je víc než 5"); break; }
      plan.push(rule);
    }
  }
  const conflicted = mustStart.filter((k) => rest.includes(k));
  if (conflicted.length > 0) rejected.push(`šetřit i nasadit zároveň: ${conflicted.join(", ")}`);

  return {
    ok: true,
    rejected,
    decision: {
      formation: r.formation as Formation,
      tactic: r.tactic as Tactic,
      hardness: r.hardness as Hardness,
      captain: captain as string | null,
      rest: rest.filter((k) => !conflicted.includes(k)),
      mustStart,
      penaltyTaker: penaltyTaker as string | null,
      freekickTaker: freekickTaker as string | null,
      plan,
      reasoning: typeof r.reasoning === "string" ? r.reasoning.slice(0, 400) : "",
    },
  };
}

// ── Složení sestavy z rozhodnutí ────────────────────────────────────────────

function toPlanRule(rule: DecisionPlanRule, index: number, idOf: Map<string, string>): MatchPlanRule | null {
  const trigger: MatchPlanRule["trigger"] =
    rule.when === "losing" || rule.when === "winning" ? { kind: "score", state: rule.when, byAtLeast: rule.byAtLeast ?? 1 }
      : rule.when === "drawing" ? { kind: "score", state: "drawing" }
        : rule.when === "minute" ? { kind: "minute" }
          : rule.when === "down_a_man" ? { kind: "men", state: "down" }
            : rule.when === "up_a_man" ? { kind: "men", state: "up" }
              : { kind: "condition", below: rule.below ?? 40 };
  let action: MatchPlanRule["action"];
  if (rule.action === "tactic" && rule.tactic) action = { kind: "tactic", tactic: rule.tactic };
  else if (rule.action === "hardness" && rule.hardness) action = { kind: "hardness", hardness: rule.hardness };
  else if (rule.action === "sub" && rule.out && rule.in) {
    const outId = idOf.get(rule.out);
    const inId = idOf.get(rule.in);
    if (!outId || !inId) return null;
    action = { kind: "sub", outPlayerId: outId, inPlayerId: inId };
  } else return null;
  return { id: `ai-${index + 1}`, fromMinute: rule.fromMinute, trigger, action };
}

/**
 * Z rozhodnutí poskládá sestavu, lavičku, kapitána, exekutory a pokyny.
 * `squadIds` = celý aktivní kádr (pro stejnou kontrolu pokynů a lavičky jako u člověka).
 */
export function assembleLineup(ctx: MatchContext, decision: MatchDecision, squadIds: Set<string>): AssembledLineup {
  const notes: string[] = [];
  // Slib místa v sestavě se plní vždy (nespokojený hráč, unhappy-players.ts): hráč jde do
  // základu jako první, šetřit ho nejde a stáhnout až po poločase, slib chce 45 minut.
  const promised = (ctx.promisedStarters ?? []).filter((k) => ctx.squad.some((p) => p.key === k));
  const overridden = decision.rest.filter((k) => promised.includes(k));
  if (overridden.length > 0) notes.push(`slib místa v sestavě: ${overridden.join(", ")} hraje i přes šetření`);
  const { picks, notes: pickNotes } = pickEleven(ctx.squad, decision.formation, {
    exclude: new Set(decision.rest.filter((k) => !promised.includes(k))),
    include: [...promised, ...decision.mustStart.filter((k) => !promised.includes(k))],
  });
  notes.push(...pickNotes);
  const xiKeys = new Set(picks.map((x) => x.player.key));
  const byKey = new Map(ctx.squad.map((p) => [p.key, p]));
  const idOf = new Map(ctx.squad.map((p) => [p.key, p.id]));

  // Lavička: náhradní brankář, pak nejlepší z každé řady, pak podle hodnocení (šetření nakonec).
  const restSet = new Set(decision.rest);
  const others = ctx.squad.filter((p) => !xiKeys.has(p.key))
    .sort((a, b) => (restSet.has(a.key) ? 1 : 0) - (restSet.has(b.key) ? 1 : 0) || b.rating - a.rating);
  const bench: SquadPlayer[] = [];
  const pushBench = (p: SquadPlayer | undefined) => {
    if (p && bench.length < MAX_BENCH && !bench.includes(p)) bench.push(p);
  };
  pushBench(others.find((p) => p.position === "GK"));
  for (const slot of ["DEF", "MID", "FWD"] as const) pushBench(others.find((p) => p.position === slot && !bench.includes(p)));
  for (const p of others) pushBench(p);

  // Pokyny: střídání jen ze základu za hráče na lavičce (jinak ho engine nemá kým provést).
  const plan: MatchPlanRule[] = [];
  decision.plan.forEach((rule, i) => {
    if (rule.action === "sub") {
      if (!rule.out || !xiKeys.has(rule.out)) { notes.push(`střídání ${rule.out} → ${rule.in}: hráč nehraje od začátku`); return; }
      if (promised.includes(rule.out) && rule.fromMinute < PROMISED_MINUTES) {
        notes.push(`střídání ${rule.out} → ${rule.in}: slíbený hráč musí odehrát aspoň ${PROMISED_MINUTES} minut`);
        return;
      }
      const incoming = rule.in ? byKey.get(rule.in) : undefined;
      if (!incoming || xiKeys.has(incoming.key)) { notes.push(`střídání ${rule.out} → ${rule.in}: střídající už hraje`); return; }
      if (!bench.includes(incoming)) {
        if (bench.length >= MAX_BENCH) {
          // Vyměnit posledního z lavičky, který není potřeba pro jiné střídání.
          const neededIns = new Set(decision.plan.filter((r) => r.action === "sub" && r.in).map((r) => r.in as string));
          const dropIdx = [...bench].reverse().findIndex((b) => !neededIns.has(b.key) && b.position !== "GK");
          if (dropIdx < 0) { notes.push(`střídání ${rule.out} → ${rule.in}: plná lavička`); return; }
          bench.splice(bench.length - 1 - dropIdx, 1);
        }
        bench.push(incoming);
      }
    }
    const mapped = toPlanRule(rule, i, idOf);
    if (mapped) plan.push(mapped);
  });

  const starterIds = new Set(picks.map((x) => x.player.id));
  let matchPlan = plan;
  const planCheck = validateMatchPlan(plan, { starterIds, squadIds });
  if (!planCheck.ok) {
    notes.push(`pokyny neprošly kontrolou: ${planCheck.error}`);
    matchPlan = [];
  } else matchPlan = planCheck.plan;

  let benchIds: string[] = bench.map((p) => p.id);
  const benchCheck = validateBench(benchIds, { starterIds, squadIds });
  if (!benchCheck.ok) {
    notes.push(`lavička neprošla kontrolou: ${benchCheck.error}`);
    benchIds = [];
  }

  const xiPlayers = picks.map((x) => x.player);
  // Kapitán klubu (páska z dohody s nespokojeným hráčem platí): když hraje, nosí ji on.
  const clubCaptain = ctx.clubCaptain && xiKeys.has(ctx.clubCaptain) ? byKey.get(ctx.clubCaptain) : undefined;
  const captain = clubCaptain
    ?? (decision.captain && xiKeys.has(decision.captain) ? byKey.get(decision.captain)! : bestBy(xiPlayers, (p) => p.leadership * 2 + p.age / 2));
  if (clubCaptain && decision.captain && decision.captain !== clubCaptain.key) {
    notes.push(`kapitán klubu ${clubCaptain.key} hraje, pásku nosí on (model chtěl ${decision.captain})`);
  } else if (!clubCaptain && decision.captain && !xiKeys.has(decision.captain)) {
    notes.push(`kapitán ${decision.captain} nehraje, kapitánem je ${captain?.key}`);
  }

  const taker = (key: string | null, current: string | null, score: (p: SquadPlayer) => number): string | null => {
    if (key && byKey.has(key)) return byKey.get(key)!.id;
    if (current && ctx.squad.some((p) => p.id === current)) return current;
    return bestBy(xiPlayers, score)?.id ?? null;
  };

  return {
    formation: decision.formation,
    tactic: decision.tactic,
    hardness: decision.hardness,
    players: picks.map((x) => ({ playerId: x.player.id, matchPosition: x.slot })),
    bench: benchIds,
    captainId: captain?.id ?? null,
    matchPlan,
    penaltyTakerId: taker(decision.penaltyTaker, ctx.currentRoles.penaltyTakerId, (p) => p.shooting * 0.6 + p.setPieces * 0.4),
    freekickTakerId: taker(decision.freekickTaker, ctx.currentRoles.freekickTakerId, (p) => p.setPieces),
    notes,
  };
}

// ── Prompt pro model ───────────────────────────────────────────────────────

export const MATCH_SYSTEM_PROMPT = [
  "You are the head coach of an amateur Czech district football club in a football management game.",
  "Make the match-day decisions a thoughtful real manager would make, consistent with YOUR personality profile.",
  "You only choose among the listed options; the game engine builds the exact line-up from your choices and validates everything.",
  "Use only player keys (P1, P2, ...) from the AVAILABLE list. Never invent players or values.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

function describeTrait(v: number): string {
  return v >= 75 ? "very high" : v >= 60 ? "high" : v >= 40 ? "medium" : v >= 25 ? "low" : "very low";
}

function weatherText(w: string | null): string {
  switch (w) {
    case "sunny": return "sunny";
    case "cloudy": return "cloudy";
    case "rain": return "rain (heavy pitch, ground passing suffers)";
    case "wind": return "strong wind (long balls unreliable)";
    case "snow": return "snow (very heavy pitch)";
    default: return "unknown";
  }
}

export function renderMatchPrompt(ctx: MatchContext): string {
  const p = ctx.profile;
  const f = ctx.fixture;
  const lines: string[] = [];
  lines.push("YOUR PERSONALITY (0-100):");
  lines.push(`ambition ${p.ambition} (${describeTrait(p.ambition)}), risk appetite ${p.risk} (${describeTrait(p.risk)}), youth focus ${p.youthFocus} (${describeTrait(p.youthFocus)}), patience ${p.patience}.`);
  lines.push(`Favourite tactic: ${p.favouriteTactic}. Favourite formations: ${p.favouriteFormations.join(", ")}.`);
  lines.push("");
  const kindText = f.kind === "league" ? `league match (${f.label})` : f.kind === "cup" ? `cup tie (${f.label}, knockout: a draw goes to penalties)` : `friendly match${f.stake > 0 ? ` with a ${f.stake} CZK bet on the result` : " (nothing at stake, good for rotation and testing youngsters)"}`;
  lines.push(`MATCH: ${kindText}, ${f.isHome ? "HOME" : "AWAY"} vs ${f.opponentName}${f.isDerby ? " (local derby!)" : ""}.`);
  lines.push(`Your team ${ctx.teamName}: ${ctx.own.position ? `table position ${ctx.own.position}/${ctx.own.teams}, ${ctx.own.points} pts` : "no table position yet"}, recent form ${ctx.own.form || "n/a"}, strength of best XI ${ctx.own.strength.toFixed(1)}.`);
  lines.push(`Opponent: ${ctx.opponent.position ? `table position ${ctx.opponent.position}` : "position n/a"}, recent form ${ctx.opponent.form || "n/a"}, strength ${ctx.opponent.strength === null ? "unknown" : ctx.opponent.strength.toFixed(1)}${ctx.opponent.bigClub ? " (a professional club far above your level)" : ""}.`);
  lines.push(`Weather: ${weatherText(ctx.weather)}. Pitch condition: ${ctx.pitchCondition ?? "n/a"}/100. Next competitive match: ${ctx.daysToNextMatch === null ? "not soon" : `in ${ctx.daysToNextMatch} day(s)`}.`);
  lines.push(`Referee strictness: ${ctx.refereeStrictness === null ? "unknown" : `${ctx.refereeStrictness}/100${ctx.refereeStrictness >= 65 ? " (strict, hard tackling gets punished)" : ctx.refereeStrictness <= 35 ? " (lenient, lets physical play go)" : ""}`}.`);
  lines.push("");
  lines.push("FORMATION OPTIONS (strength of the best XI the engine can field, players out of position, familiarity 0-100):");
  for (const o of formationOptions(ctx)) {
    lines.push(`- ${o.formation}: strength ${o.strength.toFixed(1)}, out of position ${o.outOfPosition}, familiarity ${o.familiarity}`);
  }
  const ref = bestFormation(ctx);
  lines.push("TACTIC EFFECTIVENESS by formation (how well this squad can play it: fit x formation synergy; 1.00 = neutral, below 0.90 = a real handicap, above 1.05 = a real advantage):");
  for (const formation of FORMATIONS) {
    lines.push(`- ${formation}: ${tacticOptions(ctx, formation).map((t) => `${t.tactic} ${(t.fit * t.synergy).toFixed(2)}`).join(", ")}`);
  }
  lines.push("Tactics: offensive = more attack, weaker defence; defensive = parks the bus, counters; long_ball = suits tall strong forwards; possession = needs technical passing midfield; pressing = high work rate, drains stamina faster; balanced = neutral.");
  lines.push(`HARDNESS: fair / normal / hard. Hard = more fouls and cards, intimidates soft opponents; it pays off only with an aggressive strong squad and a lenient referee. Rule-based suggestion: ${ruleHardness(ctx)}.`);
  lines.push("");
  const defaultXi = new Map(pickEleven(ctx.squad, ref).picks.map((x) => [x.player.key, x.slot]));
  lines.push(`AVAILABLE PLAYERS (key pos age rating cond morale form = avg of last 5 match marks 1-10, apps = this season; flags). "XI" = in the engine's default XI for ${ref}:`);
  for (const pl of [...ctx.squad].sort((a, b) => SLOTS.indexOf(a.position) - SLOTS.indexOf(b.position) || b.rating - a.rating)) {
    const xiSlot = defaultXi.get(pl.key);
    const flags = [
      xiSlot ? (xiSlot === pl.position ? "XI" : `XI as ${xiSlot}`) : "",
      ctx.clubCaptain === pl.key ? "club captain" : "",
      ctx.promisedStarters?.includes(pl.key) ? "promised a start" : "",
      pl.oneYellowFromBan ? "one yellow from ban" : "",
      pl.condition < 60 ? "tired" : "",
      pl.leadership >= 65 ? "leader" : "",
      pl.setPieces >= 60 ? "set-piece specialist" : "",
    ].filter(Boolean).join(", ");
    lines.push(`${pl.key} ${pl.position} ${pl.age}y ${pl.rating} cond ${pl.condition} mor ${pl.morale} form ${pl.form === null ? "-" : pl.form.toFixed(1)} apps ${pl.appearances}${flags ? `; ${flags}` : ""}`);
  }
  if (ctx.unavailable.length > 0) {
    lines.push(`UNAVAILABLE (cannot play): ${ctx.unavailable.map((u) => `${u.key} ${u.position} ${u.reason}`).join(", ")}.`);
  }
  const promised = (ctx.promisedStarters ?? []).filter((k) => ctx.squad.some((p) => p.key === k));
  if (promised.length > 0) {
    lines.push(`PROMISES: you promised ${promised.join(", ")} a starting place (2 of the next 3 matches). The engine starts them and keeps them on for at least ${PROMISED_MINUTES} minutes, so do not rest or substitute them early; plan the rest of the team around them.`);
  }
  if (ctx.clubCaptain) {
    lines.push(ctx.squad.some((p) => p.key === ctx.clubCaptain)
      ? `CAPTAIN: ${ctx.clubCaptain} is your club captain. Whenever he starts he wears the armband (the engine sees to it), so your captain choice only counts if he does not start.`
      : `CAPTAIN: your club captain ${ctx.clubCaptain} cannot play today, so choose today's captain.`);
  }
  lines.push("");
  lines.push("DECIDE (JSON keys):");
  lines.push('formation, tactic, hardness, captain (key), rest (keys to keep OUT of the starting XI, e.g. tired players or key men before a big match; max 6), mustStart (keys you insist on starting, e.g. to give a youngster a chance; max 3), penaltyTaker (key), freekickTaker (key), plan (0-5 in-game rules), reasoning (max 30 words).');
  lines.push('Plan rule: {"fromMinute": 1-90, "when": "losing"|"winning"|"drawing"|"minute"|"down_a_man"|"up_a_man"|"tired", "byAtLeast": 1-3 (losing/winning only), "below": 10-60 (tired only, condition threshold), "action": "tactic"|"hardness"|"sub", "tactic": ..., "hardness": ..., "out": key of a starter, "in": key of a non-starter}.');
  lines.push("The engine starts the strongest XI for your formation by itself: use mustStart only to force in players it would leave out, and rest only for players you deliberately keep out. It also fills the bench (max 7); a substitution rule needs a starter out and a non-starter in.");
  lines.push("Remember: every fit regular you rest and every weaker player you force in lowers your chances today. A real manager rotates in friendlies, against much weaker opponents or before a more important match within two days; in other league and cup matches he fields his best side, in his own style.");
  return lines.join("\n");
}

/** JSON schéma odpovědi pro structured outputs (klíče hráčů jako výčet dostupných). */
export function matchDecisionSchema(ctx: MatchContext): Record<string, unknown> {
  const keys = ctx.squad.map((p) => p.key);
  const keyOrEmpty = { type: "string", enum: [...keys, ""] };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      formation: { type: "string", enum: [...FORMATIONS] },
      tactic: { type: "string", enum: [...TACTICS] },
      hardness: { type: "string", enum: [...HARDNESS_OPTIONS] },
      captain: { type: "string", enum: keys },
      rest: { type: "array", items: { type: "string", enum: keys } },
      mustStart: { type: "array", items: { type: "string", enum: keys } },
      penaltyTaker: { type: "string", enum: keys },
      freekickTaker: { type: "string", enum: keys },
      plan: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fromMinute: { type: "integer" },
            when: { type: "string", enum: [...PLAN_WHEN] },
            byAtLeast: { type: "integer" },
            below: { type: "integer" },
            action: { type: "string", enum: [...PLAN_ACTIONS] },
            tactic: { type: "string", enum: [...TACTICS, ""] },
            hardness: { type: "string", enum: [...HARDNESS_OPTIONS, ""] },
            out: keyOrEmpty,
            in: keyOrEmpty,
          },
          required: ["fromMinute", "when", "action"],
        },
      },
      reasoning: { type: "string" },
    },
    required: ["formation", "tactic", "hardness", "captain", "rest", "mustStart", "penaltyTaker", "freekickTaker", "plan", "reasoning"],
  };
}
