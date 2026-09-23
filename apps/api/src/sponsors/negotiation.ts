/**
 * Jednání se sponzorem (etapa 2): ochota O, cena požadavků, vyhodnocení kola, trpělivost
 * a řádky slibů pro podpis. Čisté funkce bez DB. Rozpočet B počítá budget.ts (sponsorBudgetB).
 */
import { MAX_LICENCE } from "@okresni-masina/shared";
import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { gameExpiry } from "../lib/game-time";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import {
  attendanceAmbition, cupRoundAmbition, expectedWinsPerSeason, leaguePositionAmbition, MONTHS_PER_SEASON,
  noRelegationAmbition, promotionAmbition, RELEGATION_SPOTS,
} from "./ambition";
import { clampFavor } from "./favor-math";
import { WISH_ACCUSATIVE } from "./negotiation-texts";
import type { OwnerPersonality } from "./owners";
import {
  BIG_FACILITIES, CLUB_CONTROLLED_KINDS, DEADLINE_KINDS, isOfferableKind, LEAGUE_FINISH_KINDS, PROMISE_BASE_SHARE, PROMISE_DEADLINE_DAYS, SEASONAL_KINDS,
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
  /** Rukáv dresu už nese logo tohohle sponzora (aktivní smlouva), slib loga by nic nepřidal. */
  sleeveHeldBySponsor: boolean;
  facilities: FacilityOption[];
  equipment: EquipmentOption[];
  /** Poměrná výpovědní pokuta u JINÉHO současného sponzora v kategorii (0 = není co platit). */
  currentTerminationFee: number;
  /**
   * Kolik měsíců aktuální sezóny už uplynulo (0 až MONTHS_PER_SEASON, loadTeamSeasonProgress).
   * Smlouva běží od podpisu do konce poslední sezóny, tahle část sezóny podpisu do ní nepatří.
   */
  seasonProgressMonths: number;
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

/** Nominální délka smlouvy v měsících (celé sezóny, bez ohledu na den podpisu). */
export function contractMonths(seasons: number): number {
  return seasons * MONTHS_PER_SEASON;
}

/**
 * Skutečná délka smlouvy v měsících: od podpisu do konce poslední sezóny. Rollover ubírá sezónu
 * smlouvy na konci KAŽDÉ sezóny, i té, ve které se podepsalo, takže smlouva podepsaná pozdě
 * v sezóně běží o uplynulou část kratší. Aspoň 1 měsíc (podpis v poslední den sezóny).
 * Stejná délka jako v clawbackAmount (signing.ts): seasons × MONTHS_PER_SEASON − startOffsetMonths.
 */
export function effectiveContractMonths(seasons: number, progressMonths: number): number {
  return Math.max(1, seasons * MONTHS_PER_SEASON - Math.max(0, progressMonths));
}

/**
 * Nejkratší smlouva, kterou jde k danému postupu sezóny podepsat. Na konci sezóny (do jejího konce
 * zbývá méně než měsíc) by smlouva na 1 sezónu trvala jen pár dní, ale díky podlaze 1 měsíce
 * v effectiveContractMonths by nesla podpisový příspěvek jako za celý měsíc. Klub by ji pak každou
 * sezónu „prodlužoval" pro nový příspěvek. Proto je tehdy nejkratší smlouva na 2 sezóny.
 */
export function minContractSeasons(progressMonths: number): number {
  return MIN_SEASONS * MONTHS_PER_SEASON - Math.max(0, progressMonths) < 1 ? MIN_SEASONS + 1 : MIN_SEASONS;
}

/** Délky smlouvy (v sezónách), které jde k danému postupu sezóny podepsat. */
export function allowedContractSeasons(progressMonths: number): number[] {
  const min = minContractSeasons(progressMonths);
  return Array.from({ length: MAX_SEASONS - min + 1 }, (_, i) => min + i);
}

/** Skutečná délka návrhu v měsících podle postupu sezóny v kontextu. */
export function proposalMonths(proposal: Proposal, ctx: NegotiationContext): number {
  return effectiveContractMonths(proposal.seasons, ctx.seasonProgressMonths);
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
 * Šance, kterou sponzor slibu dává (pro cenu bonusu za splnění). Sliby v rukou klubu
 * (CLUB_CONTROLLED_KINDS: licence, stavba, dres, exkluzivita oboru, mladí v sestavě, žádné
 * výtržnosti) si klub splní sám, sponzor s bonusem počítá celým (šance 1,0).
 * U ostatních (výsledky, pohár, návštěva, reputace) klesá spojitě s ambicí (1,15 − 0,5 × ambice,
 * mezi 0,1 a 1,0): na podlaze ambice (0,3) vychází přesně 1,0, u nejtěžších slibů (ambice 2) 0,1.
 */
export function promiseChance(p: PromiseSpec, ctx: NegotiationContext): number {
  if (CLUB_CONTROLLED_KINDS.has(p.kind)) return 1.0;
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

/**
 * Cena požadavků pro sponzora jako měsíční ekvivalent za dobu smlouvy (spec, tabulka požadavků).
 * Jednorázové položky se rozpočítají na skutečnou délku smlouvy (proposalMonths), ne na celé
 * sezóny: jinak by podpis na konci sezóny s velkým příspěvkem za podpis byl opakovatelný zisk.
 */
export function costBreakdown(proposal: Proposal, ctx: NegotiationContext): CostItem[] {
  const m = proposalMonths(proposal, ctx);
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

/**
 * Součet bonusů za splnění u termínových slibů (licence, stavba, dres). Klub si je splní sám
 * a sponzor bonus vyplatí hned po splnění, takže jsou to fakticky jednorázové platby.
 */
export function deadlineGoalBonusTotal(proposal: Proposal): number {
  return proposal.promises
    .filter((p) => DEADLINE_KINDS.has(p.kind))
    .reduce((s, p) => s + (proposal.demands.goalBonuses[p.kind] ?? 0), 0);
}

/**
 * Jednorázové položky návrhu v Kč: podpisový příspěvek, stavba, vybavení, doplacená pokuta podle ceníku
 * a bonusy za splnění termínových slibů (deadlineGoalBonusTotal). Pro vratku zálohy (advanceClawback)
 * je tohle přesně to, co se počítá (oneTimeTotal v signing.ts).
 */
export function proposalOneTimeTotal(proposal: Proposal, ctx: NegotiationContext): number {
  const d = proposal.demands;
  return oneTimeTotal({
    signingBonus: d.signingBonus,
    construction: d.construction ? constructionCost(ctx, d.construction) : 0,
    equipment: d.equipment ? equipmentCost(ctx, d.equipment) : 0,
    paidFee: d.payCurrentFee ? ctx.currentTerminationFee : 0,
    deadlineGoalBonuses: deadlineGoalBonusTotal(proposal),
  });
}

function withAmount(d: Demands, key: CostKey, value: number): void {
  if (key === "monthly") d.monthly = value;
  else if (key === "winBonus") d.winBonus = value;
  else if (key === "signingBonus") d.signingBonus = value;
  else if (key.startsWith("goal:")) d.goalBonuses[key.slice(5) as PromiseKind] = value;
}

/**
 * Protinabídka „sleva": ubírá peněžní položky od nejdražší (po celých stovkách dolů),
 * dokud cena nesedne na O. Stavbu, vybavení a pokutu neubírá. Měsíční podpora neklesne pod 1 Kč
 * (smlouva bez měsíčního závazku nejde); když ji to zastaví a jednorázové položky se pak ubraly,
 * druhý průchod ubere z měsíční podpory zbytek. null = nejde to.
 */
export function reduceToWillingness(proposal: Proposal, ctx: NegotiationContext, target: number): Proposal | null {
  let excess = requestCost(proposal, ctx) - target;
  const demands: Demands = { ...proposal.demands, goalBonuses: { ...proposal.demands.goalBonuses } };
  const items = costBreakdown(proposal, ctx)
    .filter((i) => i.reducible && i.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const amounts = new Map<CostKey, number>(items.map((i) => [i.key, i.amount]));
  for (let pass = 0; pass < 2 && excess > EPS; pass++) {
    for (const it of items) {
      if (excess <= EPS) break;
      const amount = amounts.get(it.key) ?? 0;
      // Měsíční podpora nikdy neklesne pod 1 Kč (smlouva bez měsíčního závazku nejde).
      const floor = it.key === "monthly" ? 1 : 0;
      if (amount <= floor) continue;
      // EPS: plovoucí čárka (0,7 × B = 6999,9999…) nesmí přidat stovku navíc.
      const cut = Math.min(amount - floor, Math.ceil((excess / it.perUnit - EPS) / 100) * 100);
      amounts.set(it.key, amount - cut);
      withAmount(demands, it.key, amount - cut);
      excess -= cut * it.perUnit;
    }
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
  // Postup a nesestup se teď nehrají (starší jednání je můžou mít mezi přáními).
  if (!isOfferableKind(kind)) return null;
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
      return spec({});
    case "jersey_logo":
      // Rukáv už jeho logo nese, další slib by nic nepřidal (bonus zadarmo při prodloužení).
      return ctx.sleeveHeldBySponsor ? null : spec({});
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
      // Přesně položka „průměr" z katalogu (proposal.ts, stejné zaokrouhlení nahoru), aby ji klient
      // našel. Strop 5000 podle validátoru, nad ním slib nabídnout nejde.
      const target = attendanceCatalogValue(ctx.lastAvgAttendance, 1);
      return target > MAX_ATTENDANCE ? null : spec({ attendance: target });
    }
    case "youth": return spec({ count: 2 });
    case "reputation": {
      // Dolní mez podle validátoru: aspoň current + 3, nesmí přes 100.
      const target = ctx.reputation + 3;
      return target > 100 ? null : spec({ reputation: target });
    }
  }
}

/** Nejvyšší návštěva, kterou jde slíbit (validátor v proposal.ts). */
export const MAX_ATTENDANCE = 5000;

/** Nejnižší slibovaná návštěva: 0,9 × loňský průměr (validátor v proposal.ts). */
export function minAttendance(lastAvgAttendance: number): number {
  return Math.max(1, Math.round(lastAvgAttendance * 0.9));
}

/**
 * Hodnota návštěvy v katalogu slibů pro násobek loňského průměru: zaokrouhleno NAHORU na desítky
 * a nikdy pod dolní mez validátoru. Sdílí ji katalog (proposal.ts) i protinávrh majitele
 * (defaultPromise), aby protinávrh vždycky ukazoval na položku katalogu.
 */
export function attendanceCatalogValue(lastAvgAttendance: number, mult: number): number {
  const avg = Math.max(10, lastAvgAttendance);
  const floor = Math.max(10, minAttendance(lastAvgAttendance));
  return Math.max(floor, Math.ceil((avg * mult) / 10) * 10);
}

/**
 * Kolik z ochoty majitel nabídne v úvodní nabídce: obchodník si nechává nejvíc rezervy,
 * fanoušek nejmíň. Zbytek do ochoty si klub může dojednat v dalších kolech.
 */
export const OPENING_OFFER_SHARE: Record<OwnerPersonality, number> = {
  businessman: 0.75,
  cautious: 0.8,
  patriot: 0.85,
  fan: 0.9,
};

/**
 * Jaký díl úvodní nabídky (měsíční ekvivalent × skutečné měsíce smlouvy) majitel dá hned jako
 * příspěvek za podpis. Obchodník a opatrný drží peníze radši v měsících.
 */
export const OPENING_SIGNING_SHARE: Record<OwnerPersonality, number> = {
  businessman: 0.15,
  cautious: 0.15,
  patriot: 0.2,
  fan: 0.2,
};

/** Dolů na stovky (EPS kvůli plovoucí čárce), pod stovku dolů na koruny. */
function floorHundreds(v: number): number {
  return v >= 100 ? Math.floor(v / 100 + EPS) * 100 : Math.max(0, Math.floor(v + EPS));
}

/**
 * Úvodní nabídka majitele při otevření jednání: délka 2 sezóny (jinak nejkratší povolená),
 * jeho přání jako sliby (defaultPromise, jen platné a něco nesoucí, max MAX_PROMISES, jeden cíl
 * v lize) a peníze za podíl ochoty podle povahy (OPENING_OFFER_SHARE). Z toho asi
 * OPENING_SIGNING_SHARE celé hodnoty smlouvy jde jako příspěvek za podpis, zbytek měsíčně, obojí
 * dolů na stovky. Bez bonusů za výhru a za splnění. Cena ≤ ochota platí vždy (jinak nabídka
 * spadne na samotnou měsíční podporu). Deterministická (bez RNG).
 */
export function openingOffer(ctx: NegotiationContext, personality: OwnerPersonality = ctx.personality): Proposal {
  const allowed = allowedContractSeasons(ctx.seasonProgressMonths);
  const seasons = allowed.includes(2) ? 2 : allowed[0];
  const base: Proposal = {
    seasons, promises: [],
    demands: { monthly: 0, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
  };
  const promises: PromiseSpec[] = [];
  for (const wish of ctx.wishes) {
    if (promises.length >= MAX_PROMISES) break;
    if (promises.some((p) => p.kind === wish)) continue;
    if (LEAGUE_FINISH_KINDS.has(wish) && promises.some((p) => LEAGUE_FINISH_KINDS.has(p.kind))) continue;
    // Liga bez nesestupového místa (nemělo by nastat): umístění by validátor nepustil.
    if (wish === "league_position" && ctx.leagueTeams - RELEGATION_SPOTS < 1) continue;
    const spec = defaultPromise(wish, ctx, base);
    // Slib s nulovou hodnotou (ambice na podlaze) by klub jen zavazoval a sponzorovi nic nepřidal.
    if (!spec || promiseValueShare(spec, ctx) <= 0) continue;
    promises.push(spec);
  }
  const proposal: Proposal = { ...base, promises };
  const o = willingness(proposal, ctx);
  const target = o * OPENING_OFFER_SHARE[personality];
  const m = proposalMonths(proposal, ctx);
  const signingBonus = floorHundreds(target * m * OPENING_SIGNING_SHARE[personality]);
  const monthly = Math.max(1, floorHundreds(target - signingBonus / m));
  const offer: Proposal = { ...proposal, demands: { ...base.demands, monthly, signingBonus } };
  if (requestCost(offer, ctx) <= o + EPS) return offer;
  // Pojistka (drobný rozpočet, zaokrouhlení): jen měsíční podpora, ta cenu pod ochotu splní vždy.
  return { ...proposal, demands: { ...base.demands, monthly: Math.max(1, floorHundreds(target)) } };
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
  // Na konci sezóny majitel smlouvu na 1 sezónu nenabídne (minContractSeasons); validateProposal
  // ji sem ani nepustí, tohle je pojistka, aby protinabídka nikdy neměla zakázanou délku.
  if (cost <= COUNTER_BAND * o + EPS && proposal.seasons >= minContractSeasons(ctx.seasonProgressMonths)) {
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

export interface Complaint {
  key: CostKey | `wish:${PromiseKind}`;
  text: string;
}

/** Text stížnosti na konkrétní chybějící přání. Sdílí ho complaintFor i counter_wish v routes/sponsors.ts (stejný slib). */
export function wishComplaint(wish: PromiseKind): Complaint {
  return { key: `wish:${wish}`, text: `Chybí mi slib: ${WISH_ACCUSATIVE[wish]}.` };
}

/** Dolů na celé Kč, tisíce oddělené mezerou (cs-CZ). */
function kc(n: number): string {
  return `${Math.floor(n).toLocaleString("cs-CZ")} Kč`;
}

function costComplaintText(item: CostItem, proposal: Proposal, ctx: NegotiationContext): string {
  switch (item.key) {
    case "monthly": return `Měsíčně ${kc(item.amount)} je nad moje možnosti.`;
    case "winBonus": return `Bonus za výhru ${kc(item.amount)} je moc.`;
    case "signingBonus": return `Nejvíc mi vadí příspěvek za podpis ${kc(item.amount)}.`;
    case "construction": {
      const facility = proposal.demands.construction ?? "";
      const level = (facilityOf(ctx, facility)?.currentLevel ?? 0) + 1;
      return `Stavba (${FACILITY_LABELS[facility] ?? facility}) na úroveň ${level} za ${kc(item.amount)} je moc.`;
    }
    case "equipment": {
      const category = proposal.demands.equipment ?? "";
      return `Vybavení (${CATEGORY_LABELS[category] ?? category}) za ${kc(item.amount)} je moc.`;
    }
    case "currentFee": {
      const pronoun = ctx.personality === "patriot" || ctx.personality === "fan" ? "za tebe" : "za vás";
      return `Zaplatit výpovědní pokutu ${kc(item.amount)} ${pronoun} nechci.`;
    }
    default: {
      // `goal:${PromiseKind}`: bonus za splnění konkrétního slibu.
      const kind = item.key.slice(5) as PromiseKind;
      return `Bonus za splnění (${WISH_ACCUSATIVE[kind]}) ${kc(item.amount)} je moc.`;
    }
  }
}

/**
 * Co majiteli na návrhu konkrétně vadí, když ho odmítne, urazí se, odejde nebo pošle
 * protinabídku (routes/sponsors.ts, response.complaint). Nejdřív chybějící přání (jde nabídnout
 * teď, viz defaultPromise, a v návrhu chybí), jinak nejdražší položka požadavků (costBreakdown,
 * měsíční ekvivalent). Deterministické, žádné RNG. Pro accept/offer se nepoužívá.
 */
export function complaintFor(proposal: Proposal, ctx: NegotiationContext, previous?: Proposal | null): Complaint | null {
  const promised = new Set(proposal.promises.map((p) => p.kind));
  for (const wish of ctx.wishes) {
    if (promised.has(wish)) continue;
    if (!defaultPromise(wish, ctx, proposal)) continue;
    return wishComplaint(wish);
  }
  const items = costBreakdown(proposal, ctx).filter((i) => i.amount > 0);
  if (items.length === 0) return null;
  // Majitel vytkne položku, kterou klub oproti poslední dohodě (jeho nabídce nebo přijatému
  // návrhu) zvedl nejvíc. Když nic nezvedl nebo dohoda není, nejdražší položku návrhu.
  if (previous) {
    const before = new Map(costBreakdown(previous, ctx).map((i) => [i.key, i.monthly]));
    const raised = items
      .map((i) => ({ item: i, diff: i.monthly - (before.get(i.key) ?? 0) }))
      .filter((x) => x.diff > 0.5);
    if (raised.length > 0) {
      const top = raised.reduce((a, b) => (b.diff > a.diff ? b : a)).item;
      return { key: top.key, text: costComplaintText(top, proposal, ctx) };
    }
  }
  const biggest = items.reduce((a, b) => (b.monthly > a.monthly ? b : a));
  return { key: biggest.key, text: costComplaintText(biggest, proposal, ctx) };
}

/**
 * Pokuta za nesplněný slib, na jeden řádek: share × B × seasonMultiplier × měsíce CELÉ smlouvy
 * (skutečná délka od podpisu, proposalMonths) / počet řádků (pevně při podpisu). `seasonMultiplier` musí být STEJNÝ jako ten, kterým
 * willingness() násobí přínos slibu do ochoty (kolo 3 review) — jinak by u opatrného majitele
 * na víc sezón součet pokut nedosáhl skutečné hodnoty, kterou slib do ochoty přidal.
 */
export function promisePenalty(valueShare: number, budgetB: number, months: number, rows: number, seasonMult = 1): number {
  return Math.round((valueShare * budgetB * seasonMult * months) / Math.max(1, rows));
}

/**
 * Výpovědní pokuta nové smlouvy: jen z měsíční podpory, stejný vzorec jako u dřívějších pevných nabídek.
 * Na měsících smlouvy nezávisí (sezóny, při výpovědi se krátí podle zbývajících sezón).
 */
export function earlyTerminationFee(i: { monthly: number; seasons: number }): number {
  return Math.round(i.monthly * i.seasons * 2);
}

/**
 * Součet jednorázových položek smlouvy: podpisový příspěvek, stavba, vybavení, doplacená stará pokuta
 * a bonusy za splnění termínových slibů, které sponzor už VYPLATIL. Sezónní bonusy jsou opakovaná
 * platba po splnění, ne záloha na celou smlouvu, proto do vratky (advanceClawback) nepatří.
 */
export function oneTimeTotal(demands: {
  signingBonus: number; construction: number; equipment: number; paidFee: number; deadlineGoalBonuses?: number;
}): number {
  return demands.signingBonus + demands.construction + demands.equipment + demands.paidFee + (demands.deadlineGoalBonuses ?? 0);
}

/**
 * Vratka jednorázových položek (záloha na celou smlouvu, ne měsíční závazek, včetně už vyplacených
 * bonusů za splnění termínových slibů, viz oneTimeTotal) při JAKÉMKOLI
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
  const months = proposalMonths(proposal, ctx);
  const seasonMult = seasonMultiplier(ctx.personality, proposal.seasons);
  for (const p of proposal.promises) {
    // Pokuta z NEzaokrouhleného podílu (jinak by u velkého B zaokrouhlení podílu na 4 místa
    // stáhlo součet pokut pod hodnotu, kterou slib do ochoty přidal). Zaokrouhlený jen uložený value_share.
    const rawShare = promiseValueShare(p, ctx);
    const valueShare = Math.round(rawShare * 10000) / 10000;
    const rowCount = promiseRowCount(p.kind, proposal.seasons);
    const base = {
      kind: p.kind, params: p.params, valueShare,
      reward: proposal.demands.goalBonuses[p.kind] ?? 0,
      penalty: promisePenalty(rawShare, ctx.budgetB, months, rowCount, seasonMult),
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
