/**
 * Ocenění hráče AI trenérem: za kolik prodá, kolik nejvýš zaplatí a kolik má návrh
 * se splátkami, procenty z dalšího prodeje a hráči na výměnu skutečně cenu.
 *
 * Cenu počítá vždy kód, model ji nikdy nepřebije (spec 3.7). Na AI klubu si člověk nesmí
 * nahrabat: levně koupit oporu, opakovanými nabídkami vyzkoušet, kolik AI chce, ani AI obejít
 * splátkami s malou zálohou nebo výměnou za šunt.
 *
 * Odkud jsou čísla:
 * - násobky tržní ceny podle postavení v kádru: poměr zaplaceno / tržní cena u lidských přestupů
 *   na produkci (medián 1,03, p75 1,35, p90 1,87; stejná data jako `transfers/ai-seller.ts`),
 * - diskont splátek 2,06 % týdně: bankovní půjčka 15 % na ~13 týdnů (jako cizí kluby),
 *   k tomu srážka 10 % z odložené části za riziko, takže splátky AI bere jen s přirážkou,
 * - procenta z dalšího prodeje, která kupující nabízí, AI nepočítá vůbec: jestli se hráč dál
 *   prodá, rozhoduje kupující, a kdo chce AI obrat, ten ho dál neprodá,
 * - naopak doložku a nedoplacené splátky, které AI klub za hráče dluží, si AI z prodeje odečte
 *   (`settleOnResale` je z ceny hned zaplatí), takže zpětný odkup s doložkou nic nevynese.
 */

import { marketValue, transferSchedule, type TransferTerms } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import type { AiCoachProfile } from "./profile";

/** AI neprodá pod 60 % tržní hodnoty, ať je nabídka jakkoli složená (rozhodnutí 2026-10-25). */
export const HARD_FLOOR_RATIO = 0.6;
/** Šum ocenění je pro hráče pevný na 14 dní: opakované nabídky v okně nic neprozradí. */
export const VALUATION_WINDOW_DAYS = 14;
/** Týdenní diskont splátek (bankovní půjčka 15 % na ~13 týdnů). */
export const WEEKLY_DISCOUNT = 0.0206;
/** Srážka z odložené části: kupující nemusí splatit, peníze přijdou pozdě. */
export const INSTALLMENT_RISK_HAIRCUT = 0.1;
/** Hráč na výměnu, kterého AI klub využije (bude hrát), a hráč, kterého by musel zase udat. */
export const SWAP_USEFUL_RATIO = 0.6;
export const SWAP_JUNK_RATIO = 0.15;
/** Nejnižší cena, se kterou AI počítá (nejlevnější hráč má tržní cenu 500 Kč). */
export const MIN_PRICE = 500;

const DAY_MS = 86_400_000;

export type SquadImportance = "key" | "rotation" | "surplus";

/** Násobek tržní ceny podle toho, jak moc klub hráče potřebuje (opora výrazně víc, přebytečný méně). */
export const IMPORTANCE_MULTIPLIER: Record<SquadImportance, number> = {
  key: 1.75,
  rotation: 1.25,
  surplus: 0.95,
};

/**
 * AI prodává podle horní čtvrtiny cen mezi lidmi, ne podle mediánu (uživatel 25. 10.: inzeráty
 * a protinávrhy AI „furt levný“): kdo koupí za medián, prodá dráž a AI ošidí. Poměr 75. percentilu
 * k mediánu ceny / tržní hodnoty u přestupů mezi lidmi (hodnocení ze dne prodeje, po přeměření
 * tržní hodnoty 25. 10.): od 22 let 1,41–1,52 (okna 60 a 120 dní), do 21 let 1,2 (30 dní, mladí
 * zdražují a starší okna jsou pod dnešní úrovní). Násobky podle postavení v kádru se tím posunou
 * o stupeň: přebytečný hráč za 75. percentil, rotace kolem 90. percentilu, opora nad něj.
 */
export function upperMarketFactor(age: number): number {
  return age <= 21 ? 1.2 : 1.5;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const ceil100 = (v: number) => Math.ceil(v / 100) * 100;
const floor100 = (v: number) => Math.floor(v / 100) * 100;

/** FNV-1a: stabilní číslo z textu (id hráče, okno), stejné na každém stroji. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stabilní náhodné číslo 0–1 pro daný klíč. */
export function stableUnit(key: string): number {
  return createRng(hashString(key)).random();
}

/** Číslo 14denního okna, do kterého `now` patří. */
export function valuationWindow(now: Date): number {
  return Math.floor(now.getTime() / (VALUATION_WINDOW_DAYS * DAY_MS));
}

/** Normální rozdělení ze dvou rovnoměrných (Box–Muller), deterministicky z klíče. */
function stableNormal(key: string): number {
  const rng = createRng(hashString(key));
  const u = Math.max(1e-9, rng.random());
  const v = rng.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Šum ocenění hráče: e^N(0; 0,08) oříznutý na 0,86–1,16. Pevný pro hráče v jednom
 * 14denním okně, takže deset nabídek během dvou týdnů vidí pořád stejnou cenu.
 */
export function valuationNoise(playerId: string, now: Date, purpose: "sell" | "buy" = "sell"): number {
  const z = stableNormal(`${purpose}|${playerId}|${valuationWindow(now)}`);
  return clamp(Math.exp(z * 0.08), 0.86, 1.16);
}

/**
 * Povaha: ambiciózní trenér si hráče cení víc (nechce oslabit tým), obchodník prodává ochotněji.
 * Rozsah 0,85–1,15.
 */
export function sellerPersonalityFactor(profile: AiCoachProfile): number {
  return clamp(1 + (profile.ambition - 50) / 400 - (profile.trading - 50) / 400, 0.85, 1.15);
}

/** Tržní hodnota hráče jediným sdíleným vzorcem. */
export function playerMarketValue(p: { overallRating: number; age: number; position: string | null }): number {
  return marketValue(p.overallRating, p.age, p.position);
}

export interface ReservationInput {
  marketValue: number;
  /** Věk hráče: AI chce horní čtvrtinu cen jeho věkové skupiny (`upperMarketFactor`). */
  age: number;
  importance: SquadImportance;
  profile: AiCoachProfile;
  playerId: string;
  now: Date;
}

/**
 * Skrytá rezervační cena: pod ni AI klub hráče neprodá. Tržní hodnota × význam v kádru
 * × horní čtvrtina trhu × povaha × šum, nikdy pod HARD_FLOOR_RATIO tržní hodnoty.
 */
export function reservationPrice(input: ReservationInput): number {
  const mv = Math.max(MIN_PRICE, input.marketValue);
  const raw = mv * IMPORTANCE_MULTIPLIER[input.importance]
    * upperMarketFactor(input.age)
    * sellerPersonalityFactor(input.profile)
    * valuationNoise(input.playerId, input.now, "sell");
  return ceil100(Math.max(raw, mv * HARD_FLOOR_RATIO, MIN_PRICE));
}

/**
 * První požadavek (a cena inzerátu): rezervace s přirážkou 12–37 % podle trpělivosti.
 * Trpělivý trenér začíná výš, protože má čas ustupovat. Pevný v okně jako rezervace.
 */
export function openingAsk(input: ReservationInput): number {
  const reservation = reservationPrice(input);
  const spread = 1.12 + (input.profile.patience / 100) * 0.2
    + stableUnit(`ask|${input.playerId}|${valuationWindow(input.now)}`) * 0.05;
  return ceil100(reservation * spread);
}

/**
 * Pevná pojistka: čistá hodnota prodeje (`netSaleValue`) nikdy pod 60 % tržní hodnoty.
 * Kontroluje se při odpovědi AI i při přijetí jejího protinávrhu kupujícím.
 */
export function isBelowHardFloor(value: number, marketValueOfPlayer: number): boolean {
  return value < Math.max(MIN_PRICE, marketValueOfPlayer) * HARD_FLOOR_RATIO;
}

export interface MaxBuyInput {
  marketValue: number;
  /** Jak moc klub hráče na tom postu potřebuje, 0–1. */
  need: number;
  profile: AiCoachProfile;
  playerId: string;
  now: Date;
  /** Kolik smí klub utratit (rozpočet minus rezerva na provoz). */
  spendable: number;
}

/**
 * Strop nákupu vůči tržní hodnotě: 75. percentil poměru zaplaceno / tržní cena u lidských
 * přestupů (1,35). Ani zoufale potřebný post AI nepřinutí přeplatit víc než rozumný člověk.
 */
export const MAX_BUY_TO_VALUE = 1.35;

/**
 * Kolik AI nejvýš zaplatí: tržní hodnota × potřeba postu × ambice (šetrný méně) × šum,
 * nejvýš MAX_BUY_TO_VALUE tržní hodnoty a jen do toho, co klubu zbude nad rezervou na provoz.
 */
export function maxBuyPrice(input: MaxBuyInput): number {
  const mv = Math.max(MIN_PRICE, input.marketValue);
  const needFactor = 0.8 + 0.45 * clamp(input.need, 0, 1);
  const styleFactor = clamp(0.9 + (input.profile.ambition / 100) * 0.3 - (input.profile.thrift / 100) * 0.12, 0.78, 1.2);
  const noise = clamp(valuationNoise(input.playerId, input.now, "buy"), 0.92, 1.08);
  const price = Math.min(mv * needFactor * styleFactor * noise, mv * MAX_BUY_TO_VALUE);
  return Math.max(0, floor100(Math.min(price, Math.max(0, input.spendable))));
}

/** První nabídka kupujícího AI: pod jeho stropem, ať má kam přidávat. */
export function openingBid(maxPrice: number, marketValueOfPlayer: number, profile: AiCoachProfile, playerId: string, now: Date): number {
  const start = 0.78 + (profile.risk / 100) * 0.1 + stableUnit(`bid|${playerId}|${valuationWindow(now)}`) * 0.06;
  // Pod 60 % tržní hodnoty by to byla urážka, kterou žádný rozumný prodávající nebere.
  const floor = marketValueOfPlayer * 0.7;
  return Math.max(MIN_PRICE, floor100(Math.min(maxPrice, Math.max(floor, maxPrice * start))));
}

/**
 * Současná hodnota peněz z návrhu pro prodávajícího: záloha hned, splátky diskontované a se
 * srážkou za riziko. Procenta z dalšího prodeje se nepočítají (rozhoduje o nich kupující).
 */
export function presentValue(terms: TransferTerms): number {
  const s = transferSchedule(terms);
  let value = s.upfront;
  for (let i = 1; i <= s.installments; i++) {
    const payment = i === s.installments ? s.lastInstallment : s.installmentAmount;
    value += (payment / Math.pow(1 + WEEKLY_DISCOUNT, i)) * (1 - INSTALLMENT_RISK_HAIRCUT);
  }
  return Math.round(value);
}

/** Co AI klub z prodeje odvede jiným: doložka o procentech a nedoplacené splátky za hráče. */
export interface SaleCosts {
  /** Procenta z ceny prodeje pro klub, kterému AI klub hráče dřív odkoupil s doložkou. */
  sellOnPct: number;
  /** Zbytek splátek, které AI klub za hráče ještě dluží (doplatí se z prodeje hned). */
  remainingDebt: number;
  /** Tržní hodnota hráčů na výměnu: procenta z doložky se platí i z nich. */
  swapMarketValue: number;
}

export const NO_SALE_COSTS: SaleCosts = { sellOnPct: 0, remainingDebt: 0, swapMarketValue: 0 };

/** Kolik AI klubu z prodeje opravdu zůstane: peníze a hráči na výměnu minus doložka a dluh. */
export function netSaleValue(terms: TransferTerms, swapValue: number, costs: SaleCosts = NO_SALE_COSTS): number {
  const owed = (Math.max(0, costs.sellOnPct) / 100) * (terms.amount + Math.max(0, costs.swapMarketValue)) + Math.max(0, costs.remainingDebt);
  return Math.round(presentValue(terms) + swapValue - owed);
}

/**
 * Cena hráče, který přijde na výměnu: kterého klub využije, toho bere za 60 % tržní hodnoty
 * (musí ho zapracovat a platit), šunt jen za 15 % (musel by ho zase prodat nebo propustit).
 */
export function swapPlayerValue(p: { marketValue: number; useful: boolean }): number {
  return Math.round(Math.max(0, p.marketValue) * (p.useful ? SWAP_USEFUL_RATIO : SWAP_JUNK_RATIO));
}

/**
 * Podmínky protinávrhu s požadovanou čistou hodnotou (`netSaleValue`): drží strukturu kupujícího
 * (záloha, počet splátek; procenta, která sám nabídl, nechá) a dopočítá cenu.
 */
export function termsForValue(value: number, structure: TransferTerms, swapValue = 0, costs: SaleCosts = NO_SALE_COSTS): TransferTerms {
  const p = Math.max(0, costs.sellOnPct) / 100;
  const needed = Math.max(0, value - swapValue + p * Math.max(0, costs.swapMarketValue) + Math.max(0, costs.remainingDebt));
  const probe = 100_000;
  const factor = structure.installments > 0 ? presentValue({ ...structure, amount: probe }) / probe : 1;
  // Peníze, které AI z každé koruny ceny zůstanou: současná hodnota minus procenta z doložky.
  const kept = factor - p;
  const lumpKept = 1 - p;
  const usable = kept > 0.05 ? { factor: kept, structure } : { factor: lumpKept, structure: { ...structure, upfrontPct: 100, installments: 0 } };
  const terms: TransferTerms = {
    amount: ceil100(needed / usable.factor),
    upfrontPct: usable.structure.upfrontPct,
    installments: usable.structure.installments,
    sellOnPct: structure.sellOnPct,
  };
  for (let i = 0; i < 200 && netSaleValue(terms, swapValue, costs) < value; i++) terms.amount += 100;
  return terms;
}

/** Rezerva na provoz: týdenní náklady × 2–10 týdnů podle šetrnosti. */
export function budgetReserve(profile: AiCoachProfile, weeklyCosts: number): number {
  const weeks = 2 + (profile.thrift / 100) * 8;
  return Math.round(Math.max(0, weeklyCosts) * weeks);
}

/** Kolik přestupů (koupě, prodeje, hostování, volní hráči) smí klub uzavřít za 30 dní. */
export function monthlyDealLimit(profile: AiCoachProfile): number {
  return 1 + Math.floor(profile.trading / 20);
}

/** Kolik vlastních nabídek a inzerátů může mít klub rozjetých najednou. */
export function openDealLimit(profile: AiCoachProfile): number {
  return 1 + Math.floor(profile.trading / 40);
}

/** Kolik kol smlouvání AI snese, než jednání ukončí (trpělivost 0 → 2 kola, 100 → 5 kol). */
export function maxCounterRounds(profile: AiCoachProfile): number {
  return 2 + Math.round((profile.patience / 100) * 3);
}

/** Jak velký kus rozdílu mezi požadavkem a nabídkou AI v jednom kole sleví (netrpělivý víc). */
export function concessionRate(profile: AiCoachProfile): number {
  return clamp(0.45 - (profile.patience / 100) * 0.25, 0.2, 0.45);
}
