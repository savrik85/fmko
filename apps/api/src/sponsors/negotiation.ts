/**
 * Jednání se sponzorem (etapa 2): ochota O, cena požadavků, vyhodnocení kola, trpělivost
 * a řádky slibů pro podpis. Čisté funkce bez DB. Rozpočet B počítá budget.ts (sponsorBudgetB).
 */
import { MAX_LICENCE } from "@okresni-masina/shared";
import { gameExpiry } from "../lib/game-time";
import {
  attendanceAmbition, cupRoundAmbition, expectedWinsPerSeason, leaguePositionAmbition, MONTHS_PER_SEASON,
  noRelegationAmbition, promotionAmbition, sponsorChance, TERM_PROMISE_CHANCE,
} from "./ambition";
import { clampFavor } from "./favor-math";
import type { OwnerPersonality } from "./owners";
import {
  BIG_FACILITIES, DEADLINE_KINDS, PROMISE_BASE_SHARE, PROMISE_DEADLINE_DAYS, SEASONAL_KINDS,
  type PromiseKind, type PromiseParams, type PromiseSpec,
} from "./promise-kinds";
import { kindAllowedForCategory, promiseInterest } from "./wishes";

export type NegotiationCategory = "main" | "stadium";

export const BASE_WILLINGNESS = 0.7;
export const WILLINGNESS_CAP = 1.5;
export const COUNTER_BAND = 1.15;
export const INSULT_BAND = 1.5;
export const INSULT_FAVOR = -3;
export const COOLDOWN_DAYS = 14;
export const NEGOTIATION_DAYS = 7;
export const MIN_SEASONS = 1;
export const MAX_SEASONS = 3;
export const CAUTIOUS_SEASON_BONUS = 0.05;
/** Tolerance porovnání cen v Kč (plovoucí čárka). */
const EPS = 1e-6;

/** Zařízení stadionu: současná úroveň, zámek dalšího stupně (getUpgradeOptions) a ceník. */
export interface FacilityOption { facility: string; currentLevel: number; locked: boolean; costs: readonly number[] }
export interface EquipmentOption { category: string; currentLevel: number; nextLevel: number; cost: number; locked: boolean }

/** Všechno, co server o klubu ví a co jednání potřebuje. Skládá ho negotiation-db.ts. */
export interface NegotiationContext {
  category: NegotiationCategory;
  personality: OwnerPersonality;
  wishes: PromiseKind[];
  budgetB: number;
  /** Aktuální sezóna (podpis). Sezónní sliby platí od season + 1. */
  season: number;
  leagueTeams: number;
  expectedPosition: number;
  cupTotalRounds: number;
  lastAvgAttendance: number;
  reputation: number;
  licenceLevel: number;
  sponsorType: string;
  /** Klub má aktivní banner stejného oboru, exkluzivitu oboru nejde slíbit. */
  sectorBannerActive: boolean;
  facilities: FacilityOption[];
  equipment: EquipmentOption[];
  /** Poměrná výpovědní pokuta u JINÉHO současného sponzora v kategorii (0 = není co platit). */
  currentTerminationFee: number;
}

export interface Demands {
  monthly: number;
  winBonus: number;
  signingBonus: number;
  goalBonuses: Partial<Record<PromiseKind, number>>;
  /** Zařízení stadionu, které sponzor zaplatí o úroveň výš. */
  construction: string | null;
  /** Kategorie vybavení (míče, dresy), kterou sponzor koupí o úroveň výš. */
  equipment: string | null;
  payCurrentFee: boolean;
}

export interface Proposal {
  seasons: number;
  promises: PromiseSpec[];
  demands: Demands;
}

export function initialPatience(favor: number): number {
  return 2 + Math.floor(clampFavor(favor) / 25);
}

export function afterReject(patience: number): { patience: number; walkedAway: boolean } {
  const next = Math.max(0, patience - 1);
  return { patience: next, walkedAway: next === 0 };
}

export function contractMonths(seasons: number): number {
  return seasons * MONTHS_PER_SEASON;
}

function facilityOf(ctx: NegotiationContext, facility: string | undefined): FacilityOption | null {
  return ctx.facilities.find((f) => f.facility === facility) ?? null;
}

export function promiseAmbition(p: PromiseSpec, ctx: NegotiationContext): number {
  switch (p.kind) {
    case "league_position": return leaguePositionAmbition(ctx.expectedPosition, p.params.position ?? ctx.expectedPosition, ctx.leagueTeams);
    case "promotion": return promotionAmbition(ctx.expectedPosition, ctx.leagueTeams);
    case "no_relegation": return noRelegationAmbition(ctx.expectedPosition, ctx.leagueTeams);
    case "cup_round": return cupRoundAmbition(p.params.round ?? 2, ctx.cupTotalRounds);
    case "attendance": return attendanceAmbition(p.params.attendance ?? ctx.lastAvgAttendance, ctx.lastAvgAttendance);
    default: return 1;
  }
}

/** Základ jako podíl B. Licence 5 % za stupeň, stavba 5 % (tribuny, osvětlení, střecha 10 %) za úroveň. */
export function promiseBaseShare(p: PromiseSpec, ctx: NegotiationContext): number {
  if (p.kind === "coach_licence") return 0.05 * Math.max(0, (p.params.level ?? 0) - ctx.licenceLevel);
  if (p.kind === "stadium_upgrade") {
    const steps = Math.max(0, (p.params.level ?? 0) - (facilityOf(ctx, p.params.facility)?.currentLevel ?? 0));
    return (BIG_FACILITIES.has(p.params.facility ?? "") ? 0.10 : 0.05) * steps;
  }
  return PROMISE_BASE_SHARE[p.kind];
}

export function promiseValueShare(p: PromiseSpec, ctx: NegotiationContext): number {
  return promiseBaseShare(p, ctx) * promiseInterest(p.kind, ctx.personality, ctx.wishes) * promiseAmbition(p, ctx);
}

/** Opatrný majitel ocení dlouhou smlouvu: +5 % za každou sezónu nad jednu. */
export function seasonMultiplier(personality: OwnerPersonality, seasons: number): number {
  return personality === "cautious" ? 1 + CAUTIOUS_SEASON_BONUS * (seasons - 1) : 1;
}

/** Ochota O (měsíčně): 0,7 × B + hodnota slibů, strop 1,5 × B. */
export function willingness(proposal: Proposal, ctx: NegotiationContext): number {
  const promised = proposal.promises.reduce((s, p) => s + promiseValueShare(p, ctx), 0);
  const raw = (BASE_WILLINGNESS + promised) * ctx.budgetB * seasonMultiplier(ctx.personality, proposal.seasons);
  return Math.min(raw, WILLINGNESS_CAP * ctx.budgetB);
}

export function promiseChance(p: PromiseSpec, ctx: NegotiationContext): number {
  return SEASONAL_KINDS.has(p.kind) ? sponsorChance(promiseAmbition(p, ctx)) : TERM_PROMISE_CHANCE;
}

/** Kolik řádků sponsor_promises slib založí: sezónní jeden za každou sezónu od příští. */
export function promiseRowCount(kind: PromiseKind, seasons: number): number {
  return SEASONAL_KINDS.has(kind) ? Math.max(0, seasons - 1) : 1;
}

/** Měsíční náklad sponzora na 1 Kč bonusu za výhru. */
export function winBonusFactor(ctx: NegotiationContext): number {
  return expectedWinsPerSeason(ctx.expectedPosition, ctx.leagueTeams) / MONTHS_PER_SEASON;
}

export function constructionCost(ctx: NegotiationContext, facility: string): number {
  const f = facilityOf(ctx, facility);
  return f ? f.costs[f.currentLevel + 1] ?? 0 : 0;
}

export function equipmentCost(ctx: NegotiationContext, category: string): number {
  return ctx.equipment.find((e) => e.category === category)?.cost ?? 0;
}

export type CostKey =
  | "monthly" | "winBonus" | "signingBonus" | "construction" | "equipment" | "currentFee" | `goal:${PromiseKind}`;

export interface CostItem {
  key: CostKey;
  /** Částka v požadavku (Kč). */
  amount: number;
  /** Měsíční náklad sponzora na 1 Kč částky. */
  perUnit: number;
  monthly: number;
  /** Peněžní položka, kterou sponzor při protinabídce smí ubrat. */
  reducible: boolean;
}

/** Cena požadavků pro sponzora jako měsíční ekvivalent za dobu smlouvy (spec, tabulka požadavků). */
export function costBreakdown(proposal: Proposal, ctx: NegotiationContext): CostItem[] {
  const m = contractMonths(proposal.seasons);
  const d = proposal.demands;
  const item = (key: CostKey, amount: number, perUnit: number, reducible: boolean): CostItem =>
    ({ key, amount, perUnit, monthly: amount * perUnit, reducible });
  const items: CostItem[] = [
    item("monthly", d.monthly, 1, true),
    item("winBonus", d.winBonus, winBonusFactor(ctx), true),
    item("signingBonus", d.signingBonus, 1 / m, true),
  ];
  for (const p of proposal.promises) {
    const g = d.goalBonuses[p.kind] ?? 0;
    if (g > 0) items.push(item(`goal:${p.kind}`, g, (promiseChance(p, ctx) * promiseRowCount(p.kind, proposal.seasons)) / m, true));
  }
  if (d.construction) items.push(item("construction", constructionCost(ctx, d.construction), 1 / m, false));
  if (d.equipment) items.push(item("equipment", equipmentCost(ctx, d.equipment), 1 / m, false));
  if (d.payCurrentFee) items.push(item("currentFee", ctx.currentTerminationFee, 1 / m, false));
  return items;
}

export function requestCost(proposal: Proposal, ctx: NegotiationContext): number {
  return costBreakdown(proposal, ctx).reduce((s, i) => s + i.monthly, 0);
}

function withAmount(d: Demands, key: CostKey, value: number): void {
  if (key === "monthly") d.monthly = value;
  else if (key === "winBonus") d.winBonus = value;
  else if (key === "signingBonus") d.signingBonus = value;
  else if (key.startsWith("goal:")) d.goalBonuses[key.slice(5) as PromiseKind] = value;
}

/**
 * Protinabídka „sleva": ubírá peněžní položky od nejdražší (po celých stovkách dolů),
 * dokud cena nesedne na O. Stavbu, vybavení a pokutu neubírá. null = nejde to.
 */
export function reduceToWillingness(proposal: Proposal, ctx: NegotiationContext, target: number): Proposal | null {
  let excess = requestCost(proposal, ctx) - target;
  const demands: Demands = { ...proposal.demands, goalBonuses: { ...proposal.demands.goalBonuses } };
  const items = costBreakdown(proposal, ctx)
    .filter((i) => i.reducible && i.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  for (const it of items) {
    if (excess <= EPS) break;
    // EPS: plovoucí čárka (0,7 × B = 6999,9999…) nesmí přidat stovku navíc.
    const cut = Math.min(it.amount, Math.ceil((excess / it.perUnit - EPS) / 100) * 100);
    const next = it.amount - cut;
    withAmount(demands, it.key, next);
    excess -= cut * it.perUnit;
  }
  if (excess > EPS) return null;
  return { ...proposal, demands };
}

/**
 * Slib, který majitel při protinabídce „za přání" navrhne sám. null = za této délky
 * smlouvy nebo stavu klubu slíbit nejde.
 */
export function defaultPromise(kind: PromiseKind, ctx: NegotiationContext, proposal: Proposal): PromiseSpec | null {
  if (SEASONAL_KINDS.has(kind) && proposal.seasons < 2) return null;
  if (!kindAllowedForCategory(kind, ctx.category)) return null;
  const spec = (params: PromiseParams): PromiseSpec => ({ kind, params });
  switch (kind) {
    case "league_position": return spec({ position: Math.max(1, ctx.expectedPosition) });
    case "promotion":
    case "no_relegation":
    case "no_riots":
    case "jersey_logo":
      return spec({});
    case "cup_round": return spec({ round: Math.min(ctx.cupTotalRounds, 3) });
    case "coach_licence": return ctx.licenceLevel >= MAX_LICENCE ? null : spec({ level: ctx.licenceLevel + 1 });
    case "stadium_upgrade": {
      const f = ctx.facilities
        .filter((x) => !x.locked && x.currentLevel < 3 && (x.costs[x.currentLevel + 1] ?? 0) > 0 && x.facility !== proposal.demands.construction)
        .sort((a, b) => a.costs[a.currentLevel + 1] - b.costs[b.currentLevel + 1] || a.facility.localeCompare(b.facility))[0];
      return f ? spec({ facility: f.facility, level: f.currentLevel + 1 }) : null;
    }
    case "sector_exclusivity": return ctx.sectorBannerActive ? null : spec({ sector: ctx.sponsorType });
    // Stejná hodnota jako položka „průměr" v katalogu (proposal.ts), aby ji klient našel.
    case "attendance": return spec({ attendance: Math.max(10, Math.round(Math.max(10, ctx.lastAvgAttendance) / 10) * 10) });
    case "youth": return spec({ count: 2 });
    case "reputation": return spec({ reputation: ctx.reputation });
  }
}

export type RoundOutcome =
  | { kind: "accept" }
  | { kind: "counter_money"; counter: Proposal }
  | { kind: "counter_wish"; counter: Proposal; wish: PromiseKind }
  | { kind: "reject"; insulted: boolean };

/** Kolo jednání podle specifikace: ≤ O přijme, do 1,15 O protinabídka, jinak odmítne (nad 1,5 O se urazí). */
export function evaluateRound(proposal: Proposal, ctx: NegotiationContext): RoundOutcome {
  const cost = requestCost(proposal, ctx);
  const o = willingness(proposal, ctx);
  if (cost <= o + EPS) return { kind: "accept" };
  if (cost <= COUNTER_BAND * o + EPS) {
    const promised = new Set(proposal.promises.map((p) => p.kind));
    for (const wish of ctx.wishes) {
      if (promised.has(wish)) continue;
      const extra = defaultPromise(wish, ctx, proposal);
      if (!extra) continue;
      const withWish: Proposal = { ...proposal, promises: [...proposal.promises, extra] };
      if (cost <= willingness(withWish, ctx) + EPS) return { kind: "counter_wish", counter: withWish, wish };
    }
    const reduced = reduceToWillingness(proposal, ctx, o);
    if (reduced) return { kind: "counter_money", counter: reduced };
  }
  return { kind: "reject", insulted: cost > INSULT_BAND * o };
}

/** Pokuta za nesplněný slib: value_share × B × měsíce sezóny (pevně při podpisu). */
export function promisePenalty(valueShare: number, budgetB: number): number {
  return Math.round(valueShare * budgetB * MONTHS_PER_SEASON);
}

/** Výpovědní pokuta nové smlouvy, stejný vzorec jako u dřívějších pevných nabídek. */
export function earlyTerminationFee(monthly: number, seasons: number): number {
  return Math.round(monthly * seasons * 2);
}

export interface PromiseRow {
  kind: PromiseKind;
  params: PromiseParams;
  season: number | null;
  deadlineGameDate: string | null;
  valueShare: number;
  reward: number;
  penalty: number;
}

/** Řádky sponsor_promises pro podpis: sezónní za každou sezónu od příští, termínové s termínem. */
export function buildPromiseRows(proposal: Proposal, ctx: NegotiationContext, signGameDate: string): PromiseRow[] {
  const rows: PromiseRow[] = [];
  for (const p of proposal.promises) {
    const valueShare = Math.round(promiseValueShare(p, ctx) * 10000) / 10000;
    const base = {
      kind: p.kind, params: p.params, valueShare,
      reward: proposal.demands.goalBonuses[p.kind] ?? 0,
      penalty: promisePenalty(valueShare, ctx.budgetB),
    };
    if (SEASONAL_KINDS.has(p.kind)) {
      for (let s = ctx.season + 1; s < ctx.season + proposal.seasons; s++) rows.push({ ...base, season: s, deadlineGameDate: null });
    } else if (DEADLINE_KINDS.has(p.kind)) {
      rows.push({ ...base, season: null, deadlineGameDate: gameExpiry(signGameDate, PROMISE_DEADLINE_DAYS) });
    } else {
      rows.push({ ...base, season: null, deadlineGameDate: null });
    }
  }
  return rows;
}

export interface SigningSummary {
  proposal: Proposal;
  rows: PromiseRow[];
  terminationFee: number;
  constructionCost: number;
  equipmentCost: number;
  currentFee: number;
}

/** Shrnutí před podpisem: všechny sliby s pokutou a odměnou, platby a výpovědní pokuta nové smlouvy. */
export function signingSummary(proposal: Proposal, ctx: NegotiationContext, signGameDate: string): SigningSummary {
  const d = proposal.demands;
  return {
    proposal,
    rows: buildPromiseRows(proposal, ctx, signGameDate),
    terminationFee: earlyTerminationFee(d.monthly, proposal.seasons),
    constructionCost: d.construction ? constructionCost(ctx, d.construction) : 0,
    equipmentCost: d.equipment ? equipmentCost(ctx, d.equipment) : 0,
    currentFee: d.payCurrentFee ? ctx.currentTerminationFee : 0,
  };
}
