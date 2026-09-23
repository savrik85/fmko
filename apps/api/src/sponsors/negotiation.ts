/**
 * Jednání se sponzorem (etapa 2): ochota O, cena požadavků, vyhodnocení kola, trpělivost
 * a řádky slibů pro podpis. Čisté funkce bez DB. Rozpočet B počítá budget.ts (sponsorBudgetB).
 */
import { MAX_LICENCE } from "@okresni-masina/shared";
import { gameExpiry } from "../lib/game-time";
import {
  attendanceAmbition, cupRoundAmbition, expectedWinsPerSeason, leaguePositionAmbition, MONTHS_PER_SEASON,
  noRelegationAmbition, promotionAmbition, RELEGATION_SPOTS,
} from "./ambition";
import { clampFavor } from "./favor-math";
import type { OwnerPersonality } from "./owners";
import {
  BIG_FACILITIES, DEADLINE_KINDS, LEAGUE_FINISH_KINDS, PROMISE_BASE_SHARE, PROMISE_DEADLINE_DAYS, SEASONAL_KINDS,
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
/** Nejvíc slibů v jednom návrhu (validateProposal i protinabídka za přání). */
export const MAX_PROMISES = 8;
/** Ambice na podlaze (≤ 0,3, clamp v ambition.ts) = slib je fakticky jistý, nemá dávat hodnotu ani šanci pod jistotu. */
const FLOOR_AMBITION = 0.3;
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

/** Sezónní slib s ambicí na podlaze je fakticky jistý (skoro se stane sám) — nedává klubu žádnou hodnotu. */
function isFloorAmbition(kind: PromiseKind, ambition: number): boolean {
  return SEASONAL_KINDS.has(kind) && ambition <= FLOOR_AMBITION + EPS;
}

export function promiseValueShare(p: PromiseSpec, ctx: NegotiationContext): number {
  const ambition = promiseAmbition(p, ctx);
  if (isFloorAmbition(p.kind, ambition)) return 0;
  return promiseBaseShare(p, ctx) * promiseInterest(p.kind, ctx.personality, ctx.wishes) * ambition;
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

/**
 * Šance, kterou sponzor slibu dává (pro cenu bonusu za splnění). Nesezónní sliby (licence,
 * stavba, dres, exkluzivita oboru) řeší klub sám, tam sponzor riskuje 0 — šance 1,0.
 * U sezónního slibu klesá spojitě s ambicí (1,15 − 0,5 × ambice, mezi 0,1 a 1,0) — na podlaze
 * ambice (0,3) vychází přesně 1,0, u nejtěžších slibů (ambice 2) klesá až k 0,1.
 */
export function promiseChance(p: PromiseSpec, ctx: NegotiationContext): number {
  if (!SEASONAL_KINDS.has(p.kind)) return 1.0;
  const ambition = promiseAmbition(p, ctx);
  return Math.max(0.1, Math.min(1.0, 1.15 - 0.5 * ambition));
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
    // Měsíční podpora nikdy neklesne na 0 (byla by to smlouva bez skutečného peněžního závazku).
    const floor = it.key === "monthly" ? 1 : 0;
    // EPS: plovoucí čárka (0,7 × B = 6999,9999…) nesmí přidat stovku navíc.
    const cut = Math.min(it.amount - floor, Math.ceil((excess / it.perUnit - EPS) / 100) * 100);
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
    case "league_position": {
      // Nikdy sestupovou příčku (validátor), i kdyby byl klub v ohrožení sestupu.
      const max = ctx.leagueTeams - RELEGATION_SPOTS;
      return spec({ position: Math.max(1, Math.min(ctx.expectedPosition, max)) });
    }
    case "promotion":
    case "no_relegation":
    case "no_riots":
    case "jersey_logo":
      return spec({});
    case "cup_round":
      // Pohár aspoň 2 kola (validátor); bez poháru nebo jen 1 kolo nejde nabídnout nic platného.
      return ctx.cupTotalRounds < 2 ? null : spec({ round: Math.min(ctx.cupTotalRounds, 3) });
    case "coach_licence": return ctx.licenceLevel >= MAX_LICENCE ? null : spec({ level: ctx.licenceLevel + 1 });
    case "stadium_upgrade": {
      const f = ctx.facilities
        .filter((x) => !x.locked && x.currentLevel < 3 && (x.costs[x.currentLevel + 1] ?? 0) > 0 && x.facility !== proposal.demands.construction)
        .sort((a, b) => a.costs[a.currentLevel + 1] - b.costs[b.currentLevel + 1] || a.facility.localeCompare(b.facility))[0];
      return f ? spec({ facility: f.facility, level: f.currentLevel + 1 }) : null;
    }
    case "sector_exclusivity": return ctx.sectorBannerActive ? null : spec({ sector: ctx.sponsorType });
    case "attendance": {
      // Dolní mez i strop podle validátoru (proposal.ts): aspoň 0,9 × loňský průměr, max 5000.
      const min = Math.max(1, Math.round(ctx.lastAvgAttendance * 0.9));
      if (min > 5000) return null;
      // Stejná hodnota jako položka „průměr" v katalogu (proposal.ts), aby ji klient našel.
      const target = Math.max(min, Math.round(Math.max(10, ctx.lastAvgAttendance) / 10) * 10);
      return spec({ attendance: Math.min(5000, target) });
    }
    case "youth": return spec({ count: 2 });
    case "reputation": {
      // Dolní mez podle validátoru: aspoň current + 3, nesmí přes 100.
      const target = ctx.reputation + 3;
      return target > 100 ? null : spec({ reputation: target });
    }
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
    const hasLeagueFinish = proposal.promises.some((p) => LEAGUE_FINISH_KINDS.has(p.kind));
    for (const wish of ctx.wishes) {
      // Duplicitní druh, plný počet slibů nebo kolize s pravidlem „jeden cíl v lize" (1d) — přeskočit.
      if (promised.has(wish)) continue;
      if (proposal.promises.length >= MAX_PROMISES) continue;
      if (LEAGUE_FINISH_KINDS.has(wish) && hasLeagueFinish) continue;
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

/**
 * Pokuta za nesplněný slib, na jeden řádek: share × B × měsíce CELÉ smlouvy / počet řádků
 * (pevně při podpisu). Rozpočítáno tak, aby součet pokut přes všechny řádky jednoho slibu
 * odpovídal celé hodnotě, kterou slib přinesl do ochoty — nevyplatí se slíbit a nesplnit.
 */
export function promisePenalty(valueShare: number, budgetB: number, months: number, rows: number): number {
  return Math.round((valueShare * budgetB * months) / Math.max(1, rows));
}

/** Výpovědní pokuta nové smlouvy: jen z měsíční podpory, stejný vzorec jako u dřívějších pevných nabídek. */
export function earlyTerminationFee(i: { monthly: number; seasons: number }): number {
  return Math.round(i.monthly * i.seasons * 2);
}

/** Součet jednorázových položek smlouvy: podpisový příspěvek, stavba, vybavení, doplacená stará pokuta. */
export function oneTimeTotal(demands: { signingBonus: number; construction: number; equipment: number; paidFee: number }): number {
  return demands.signingBonus + demands.construction + demands.equipment + demands.paidFee;
}

/**
 * Vratka jednorázových položek (záloha na celou smlouvu, ne měsíční závazek) při JAKÉMKOLI
 * předčasném konci smlouvy — ať vypoví klub, nebo sponzor kvůli nesplněným slibům. Klesá lineárně
 * s odehranými měsíci, na konci smlouvy je nulová. Na rozdíl od earlyTerminationFee se NEDĚLÍ
 * třemi (spec, live terminate route) — jednorázová platba se totiž nevztahuje ke zbývajícím
 * sezónám, ale k poměru odehraných a celkových měsíců smlouvy.
 */
export function advanceClawback(i: { oneTimeTotal: number; contractMonths: number; monthsElapsed: number }): number {
  if (i.contractMonths <= 0) return 0;
  const remaining = Math.max(0, i.contractMonths - i.monthsElapsed);
  return Math.round((i.oneTimeTotal * remaining) / i.contractMonths);
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
  const months = contractMonths(proposal.seasons);
  for (const p of proposal.promises) {
    const valueShare = Math.round(promiseValueShare(p, ctx) * 10000) / 10000;
    const rowCount = promiseRowCount(p.kind, proposal.seasons);
    const base = {
      kind: p.kind, params: p.params, valueShare,
      reward: proposal.demands.goalBonuses[p.kind] ?? 0,
      penalty: promisePenalty(valueShare, ctx.budgetB, months, rowCount),
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

/**
 * Shrnutí před podpisem: všechny sliby s pokutou a odměnou, platby a výpovědní pokuta nové
 * smlouvy. Vratka jednorázových položek (advanceClawback) se počítá až při skutečném předčasném
 * konci (Task 7 / etapa 3), tady jen `oneTimeTotal(demands)` dá jejich součet pro zobrazení.
 */
export function signingSummary(proposal: Proposal, ctx: NegotiationContext, signGameDate: string): SigningSummary {
  const d = proposal.demands;
  const constructionAmount = d.construction ? constructionCost(ctx, d.construction) : 0;
  const equipmentAmount = d.equipment ? equipmentCost(ctx, d.equipment) : 0;
  const currentFeeAmount = d.payCurrentFee ? ctx.currentTerminationFee : 0;
  return {
    proposal,
    rows: buildPromiseRows(proposal, ctx, signGameDate),
    terminationFee: earlyTerminationFee({ monthly: d.monthly, seasons: proposal.seasons }),
    constructionCost: constructionAmount,
    equipmentCost: equipmentAmount,
    currentFee: currentFeeAmount,
  };
}
