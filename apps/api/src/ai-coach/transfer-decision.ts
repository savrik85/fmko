/**
 * Rozhodnutí AI trenéra v přestupovém jednání. Čisté funkce bez databáze: stejný vstup
 * dá vždy stejné rozhodnutí, nikdo není zvýhodněný (lidský ani AI kupující).
 *
 * Prodávající AI (spec 3.7), model navrhuje, kód hlídá:
 * - `sellerOptions`: kód spočítá ceny a pojistky a z nich přípustné akce (přijmout, protinávrh
 *   v mezích, odmítnout). Když zbývá jediná (blokovaný hráč, pod 60 % tržní hodnoty, nabídka
 *   za vlastní požadavek, žádný prostor pro protinávrh), rozhodne kód bez modelu.
 * - Jinak volí model (transfer-reply-decision.ts) a bez něj náhradní pravidlo `decideSellerReply`:
 *   nabídka nad požadavkem projde, mírně pod rezervací přijde protinávrh a postupné ustupování
 *   podle trpělivosti, hluboko pod rezervací odmítnutí.
 * - `sellerGuardViolation` před provedením: pod rezervací AI nic nepřijme a protinávrh pod ni
 *   nikdy nejde, ať rozhodl kdokoli. Pod 60 % tržní hodnoty nikdy nic.
 *
 * Kola smlouvání se počítají přes všechna jednání téhož kupujícího o témže hráči ve 14denním
 * okně a požadavek AI vůči němu nikdy neroste, takže stažením a novou nabídkou se AI
 * „nevynuluje“ a cenu z ní nejde vylovit ani opakovaným ptaním modelu.
 */

import { transferTermsError, type TransferTerms } from "@okresni-masina/shared";
import type { AiCoachProfile } from "./profile";
import {
  concessionRate,
  isBelowHardFloor,
  maxCounterRounds,
  netSaleValue,
  NO_SALE_COSTS,
  openingAsk,
  reservationPrice,
  stableUnit,
  termsForValue,
  type SaleCosts,
  type SquadImportance,
} from "./valuation";
import type { SellBlockReason } from "./squad";

/** Návrh pod tímto podílem rezervace je urážka: AI neodpovídá protinávrhem, ale odmítne. */
export const INSULT_RATIO = 0.7;
/** Nad limitem obchodů za měsíc chce AI za hráče o tolik víc (nemá chuť dál obchodovat). */
export const OVER_LIMIT_MARKUP = 1.2;
/** Nejmenší krok, o který AI sleví (3 % požadavku), aby jednání nestálo. */
const MIN_STEP_PCT = 0.03;

const ceil100 = (v: number) => Math.ceil(v / 100) * 100;
const floor100 = (v: number) => Math.floor(v / 100) * 100;

export type SellerReplyReason =
  | "blocked"
  | "hard_floor"
  | "insulting"
  | "out_of_patience"
  | "below_reservation"
  | "accept_ask"
  | "accept_reservation"
  | "squeeze"
  | "concede"
  | "loan_needed"
  | "loan_ok"
  | "loan_fee_low"
  /** Vybral model z přípustných možností. */
  | "model"
  /** Pojistka zastavila rozhodnutí pod rezervací (nemá nastat, viz `sellerGuardViolation`). */
  | "guard";

export interface SellerDecisionInput {
  offerId: string;
  offerType: "transfer" | "loan";
  /** Aktuální návrh kupujícího (částka a podmínky). */
  terms: TransferTerms;
  loanDays?: number | null;
  /** Tržní hodnota chtěného hráče. */
  marketValue: number;
  age: number;
  importance: SquadImportance;
  block: SellBlockReason | null;
  profile: AiCoachProfile;
  playerId: string;
  now: Date;
  /** Hodnota hráčů, kteří přijdou na výměnu (viz `swapPlayerValue`). */
  swapValue: number;
  /** Kupuje klub mimo hru: o ceně nejedná, jen ano, nebo ne. */
  virtualBuyer: boolean;
  /** Hodnoty protinávrhů AI tomuto kupujícímu o tomto hráči v okně, od nejstaršího. */
  previousAsks: number[];
  /** Hodnoty předchozích návrhů kupujícího (v okně), od nejstaršího, bez aktuálního. */
  previousBids: number[];
  /** Kolikrát už AI s tímto kupujícím o hráči v okně jednání ukončila. */
  priorBreakOffs: number;
  overDealLimit: boolean;
  /** Cena z inzerátu AI klubu, když je hráč na trhu. */
  listedPrice?: number | null;
  /** Doložka a dluh, které AI klub z prodeje zaplatí (bez nich nic). */
  saleCosts?: SaleCosts;
}

export type SellerDecision =
  | { kind: "accept"; reason: SellerReplyReason; value: number; reservation: number }
  | { kind: "counter"; reason: SellerReplyReason; value: number; reservation: number; ask: number; terms: TransferTerms }
  | { kind: "reject"; reason: SellerReplyReason; value: number; reservation: number; block?: SellBlockReason };

/** Poplatek za hostování, který AI za hráče chce (Kč za celou dobu). */
export function requiredLoanFee(input: { marketValue: number; age: number; importance: SquadImportance; loanDays: number }): number | null {
  if (input.importance === "key") return null;
  const months = Math.max(1, input.loanDays / 30);
  if (input.importance === "rotation") return ceil100(input.marketValue * 0.1 * months);
  // Přebytečný mladý hráč u nás nehraje: hostování ho rozvine a ušetří mzdu.
  if (input.age <= 21) return 0;
  return ceil100(input.marketValue * 0.03 * months);
}

/** Ceny, ze kterých vychází náhradní pravidlo i přípustné možnosti (obojí počítá stejně). */
interface SellerPrices {
  /** Čistá hodnota návrhu pro AI klub (`netSaleValue`). */
  value: number;
  /** Rezervace, nad limitem obchodů s přirážkou. */
  reservation: number;
  /** Cena z inzerátu, když platí (oporu za ni AI nepustí). */
  listed: number | null;
  /** Nejnižší požadavek, který AI tomuto kupujícímu v okně řekla, nebo null. */
  previousAsk: number | null;
  /** Současný požadavek: první požadavek, po protinávrhu nejnižší dřívější, nikdy pod rezervací. */
  currentAsk: number;
}

function sellerPrices(input: SellerDecisionInput): SellerPrices {
  // Čistá hodnota: peníze (splátky diskontované, procenta pro AI nic) a hráči na výměnu,
  // minus to, co AI klub z prodeje odvede (doložka, nedoplacené splátky).
  const value = netSaleValue(input.terms, input.swapValue, input.saleCosts ?? NO_SALE_COSTS);
  const valuation = { marketValue: input.marketValue, importance: input.importance, profile: input.profile, playerId: input.playerId, now: input.now };
  const baseReservation = reservationPrice(valuation);
  const reservation = input.overDealLimit ? ceil100(baseReservation * OVER_LIMIT_MARKUP) : baseReservation;
  // Hráč, který se mezitím stal oporou (zranění, prodeje), za cenu z inzerátu nejde.
  const listed = input.listedPrice && input.listedPrice > 0 && input.importance !== "key" ? input.listedPrice : null;
  const ask0 = Math.max(reservation, listed ?? openingAsk(valuation) * (input.overDealLimit ? OVER_LIMIT_MARKUP : 1));
  // AI se k vyšší ceně nevrací: platí nejnižší požadavek, který už tomuto kupujícímu řekla.
  const previousAsk = input.previousAsks.length > 0 ? Math.min(...input.previousAsks) : null;
  const currentAsk = Math.max(reservation, previousAsk ?? ask0);
  return { value, reservation, listed, previousAsk, currentAsk };
}

/** Kolik protinávrhů AI v jednání ještě snese; kupující, který nepřidal, ubere kolo navíc. */
function counterRoundsLeft(input: SellerDecisionInput, value: number): number {
  const lastBid = input.previousBids.length > 0 ? input.previousBids[input.previousBids.length - 1] : 0;
  const noProgress = lastBid > 0 && value <= lastBid;
  return maxCounterRounds(input.profile) - input.previousAsks.length - input.priorBreakOffs - (noProgress ? 1 : 0);
}

/** Náhradní pravidlo prodávajícího (bez modelu, nebo když model odpoví nesmysl). */
export function decideSellerReply(input: SellerDecisionInput): SellerDecision {
  const { value, reservation, listed, currentAsk } = sellerPrices(input);

  if (input.block) return { kind: "reject", reason: "blocked", value, reservation, block: input.block };

  if (input.offerType === "loan") return decideLoan(input, value, reservation);

  // Pevná pojistka: pod 60 % tržní hodnoty nic, ani se splátkami, procenty nebo výměnou.
  if (isBelowHardFloor(value, input.marketValue)) return { kind: "reject", reason: "hard_floor", value, reservation };

  // Cena z inzerátu platí: kdo ji nabídne (v současné hodnotě), má souhlas. Pod rezervaci ale ne:
  // inzerát mohl zůstat z doby, kdy hráč přebýval, a pod rezervaci AI nikdy neprodá (spec 3.7).
  if (listed && value >= listed && value >= reservation && !input.overDealLimit) return { kind: "accept", reason: "accept_ask", value, reservation };

  if (value >= currentAsk) return { kind: "accept", reason: "accept_ask", value, reservation };

  if (value >= reservation) {
    // Poprvé to AI zkusí ještě přitlačit (víc obchodník), pak bere.
    const firstRound = input.previousAsks.length === 0 && input.priorBreakOffs === 0;
    const squeezeChance = 0.15 + (input.profile.trading / 100) * 0.3;
    if (!input.virtualBuyer && firstRound && stableUnit(`squeeze|${input.offerId}`) < squeezeChance) {
      const ask = Math.max(reservation, ceil100((value + currentAsk) / 2));
      if (ask > value + 100) {
        const terms = counterTerms(ask, input);
        if (terms) return { kind: "counter", reason: "squeeze", value, reservation, ask, terms };
      }
    }
    return { kind: "accept", reason: "accept_reservation", value, reservation };
  }

  if (value < reservation * INSULT_RATIO) return { kind: "reject", reason: "insulting", value, reservation };
  if (input.virtualBuyer) return { kind: "reject", reason: "below_reservation", value, reservation };

  if (counterRoundsLeft(input, value) <= 0) return { kind: "reject", reason: "out_of_patience", value, reservation };

  const step = Math.max(currentAsk * MIN_STEP_PCT, (currentAsk - value) * concessionRate(input.profile));
  const ask = Math.max(reservation, ceil100(currentAsk - step));
  const terms = counterTerms(ask, input);
  if (!terms) return { kind: "reject", reason: "below_reservation", value, reservation };
  return { kind: "counter", reason: "concede", value, reservation, ask, terms };
}

function decideLoan(input: SellerDecisionInput, value: number, reservation: number): SellerDecision {
  const fee = input.terms.amount;
  const required = requiredLoanFee({
    marketValue: input.marketValue, age: input.age, importance: input.importance, loanDays: input.loanDays ?? 30,
  });
  if (required === null) return { kind: "reject", reason: "loan_needed", value, reservation };
  if (fee >= required) return { kind: "accept", reason: "loan_ok", value: fee, reservation: required };
  if (input.virtualBuyer || fee < required * 0.5 || input.previousAsks.length >= maxCounterRounds(input.profile)) {
    return { kind: "reject", reason: "loan_fee_low", value: fee, reservation: required };
  }
  return {
    kind: "counter", reason: "loan_fee_low", value: fee, reservation: required, ask: required,
    terms: { amount: required, upfrontPct: 100, installments: 0, sellOnPct: 0 },
  };
}

/** Protinávrh s požadovanou čistou hodnotou ve struktuře kupujícího; neplatné podmínky → hotově. */
function counterTerms(ask: number, input: SellerDecisionInput): TransferTerms | null {
  const costs = input.saleCosts ?? NO_SALE_COSTS;
  const structured = termsForValue(ask, input.terms, input.swapValue, costs);
  if (!transferTermsError(structured)) return structured;
  const lump = termsForValue(ask, { amount: 0, upfrontPct: 100, installments: 0, sellOnPct: 0 }, input.swapValue, costs);
  // Výměna bez doplatku: nula jde, kladná částka musí být aspoň 100 Kč.
  if (lump.amount === 0 && input.swapValue <= 0) return null;
  return transferTermsError(lump) ? null : lump;
}

export type SellerAction = "accept" | "counter" | "reject";

/** Co kód AI prodávajícímu dovolí (spec 3.7). Model smí vybrat jen z `actions`. */
export interface SellerOptions {
  /** Čistá hodnota návrhu pro AI klub (u hostování poplatek). */
  value: number;
  /** Rezervace (u hostování požadovaný poplatek): pod ni AI nic nepřijme ani nenabídne. */
  reservation: number;
  /** Současný požadavek AI vůči tomuto kupujícímu (u hostování požadovaný poplatek). */
  currentAsk: number;
  /** Nejnižší cena, ke které se AI už zavázala (inzerát, dřívější protinávrh), nebo null. */
  committedAsk: number | null;
  /** Kolik protinávrhů AI ještě snese. */
  roundsLeft: number;
  /** Přípustné akce v pořadí přijmout, protinávrh, odmítnout; odmítnout jde vždy. */
  actions: SellerAction[];
  /** Meze protinávrhu v čisté hodnotě pro AI klub (po stovkách), když je protinávrh přípustný. */
  counter: { min: number; max: number } | null;
  /** Zbyla jediná přípustná možnost: rozhodne kód bez modelu. */
  forced: SellerDecision | null;
}

/**
 * Přípustné akce AI prodávajícího. Přijmout jde jen od rezervace, protinávrh jen klubu ve hře,
 * dokud AI má trpělivost, a jen mezi rezervací (a víc, než kupující nabídl) a současným
 * požadavkem. Nabídku za cenu, ke které se AI zavázala (inzerát, vlastní protinávrh), AI vždy
 * přijme: odmítnout vlastní slovo by bylo podvodem na kupujícím.
 */
export function sellerOptions(input: SellerDecisionInput): SellerOptions {
  const rule = decideSellerReply(input);
  if (input.offerType === "loan") return loanOptions(input, rule);
  const { value, reservation, listed, previousAsk, currentAsk } = sellerPrices(input);
  const roundsLeft = counterRoundsLeft(input, value);
  const commitments = [listed, previousAsk].filter((v): v is number => v !== null);
  const committedAsk = commitments.length > 0 ? Math.min(...commitments) : null;
  const base = { value, reservation, currentAsk, committedAsk, roundsLeft };
  const only = (decision: SellerDecision): SellerOptions => ({ ...base, actions: [decision.kind], counter: null, forced: decision });

  if (input.block) return only({ kind: "reject", reason: "blocked", value, reservation, block: input.block });
  if (isBelowHardFloor(value, input.marketValue)) return only({ kind: "reject", reason: "hard_floor", value, reservation });
  if (committedAsk !== null && value >= Math.max(reservation, committedAsk)) return only({ kind: "accept", reason: "accept_ask", value, reservation });

  const actions: SellerAction[] = [];
  if (value >= reservation) actions.push("accept");
  const min = Math.max(reservation, floor100(value) + 100);
  const max = floor100(currentAsk);
  const counter = !input.virtualBuyer && roundsLeft > 0 && min <= max && counterTerms(min, input) !== null && counterTerms(max, input) !== null
    ? { min, max }
    : null;
  if (counter) actions.push("counter");
  actions.push("reject");
  // Přijmout ani smlouvat nejde (klub mimo hru, došla trpělivost): odmítnutí s důvodem pravidla.
  if (actions.length === 1) return only(rule.kind === "reject" ? rule : { kind: "reject", reason: "below_reservation", value, reservation });
  return { ...base, actions, counter, forced: null };
}

/** Hostování: přijmout od požadovaného poplatku, protinávrh jen přesně na něj. */
function loanOptions(input: SellerDecisionInput, rule: SellerDecision): SellerOptions {
  const fee = input.terms.amount;
  const required = requiredLoanFee({
    marketValue: input.marketValue, age: input.age, importance: input.importance, loanDays: input.loanDays ?? 30,
  });
  const reservation = required ?? 0;
  const roundsLeft = maxCounterRounds(input.profile) - input.previousAsks.length;
  const base = { value: fee, reservation, currentAsk: reservation, committedAsk: null, roundsLeft };
  const only = (decision: SellerDecision): SellerOptions => ({ ...base, actions: [decision.kind], counter: null, forced: decision });

  if (input.block) return only({ kind: "reject", reason: "blocked", value: fee, reservation, block: input.block });
  if (required === null) return only({ kind: "reject", reason: "loan_needed", value: fee, reservation });

  const actions: SellerAction[] = [];
  if (fee >= required) actions.push("accept");
  const counter = !input.virtualBuyer && fee < required && roundsLeft > 0 ? { min: required, max: required } : null;
  if (counter) actions.push("counter");
  actions.push("reject");
  if (actions.length === 1) return only(rule.kind === "reject" ? rule : { kind: "reject", reason: "loan_fee_low", value: fee, reservation });
  return { ...base, actions, counter, forced: null };
}

/** Volba modelu: akce a u protinávrhu částka v čisté hodnotě pro AI klub (po stovkách). */
export interface SellerChoice {
  action: SellerAction;
  amount: number;
}

/**
 * Rozhodnutí z volby modelu, nebo null, když volba není přípustná (akce mimo nabídku,
 * protinávrh mimo meze, podmínky nejdou sestavit). Pak rozhodne náhradní pravidlo.
 */
export function sellerDecisionFromChoice(input: SellerDecisionInput, options: SellerOptions, choice: SellerChoice): SellerDecision | null {
  if (!options.actions.includes(choice.action)) return null;
  const { value, reservation } = options;
  if (choice.action === "accept") return { kind: "accept", reason: "model", value, reservation };
  if (choice.action === "reject") return { kind: "reject", reason: "model", value, reservation };
  const range = options.counter;
  const ask = choice.amount;
  if (!range || !Number.isInteger(ask) || ask % 100 !== 0 || ask < range.min || ask > range.max) return null;
  const terms = input.offerType === "loan"
    ? { amount: ask, upfrontPct: 100, installments: 0, sellOnPct: 0 }
    : counterTerms(ask, input);
  if (!terms) return null;
  return { kind: "counter", reason: "model", value, reservation, ask, terms };
}

/**
 * Poslední pojistka před provedením, ať rozhodl model, pravidlo, nebo kód (spec 3.7): kde
 * zbylo jen odmítnutí (blokovaný hráč, pod 60 % tržní hodnoty), nic jiného neprojde, pod
 * rezervací AI nic nepřijme a protinávrh nikdy nejde pod rezervaci. Vrací důvod porušení, nebo null.
 */
export function sellerGuardViolation(input: SellerDecisionInput, options: SellerOptions, decision: SellerDecision): string | null {
  if (decision.kind === "reject") return null;
  if (options.forced && options.forced.kind === "reject") return `přípustné je jen odmítnutí (${options.forced.reason})`;
  if (decision.kind === "accept") {
    return options.value >= options.reservation ? null : `přijetí pod rezervací (${options.value} < ${options.reservation})`;
  }
  if (input.virtualBuyer) return "s klubem mimo hru se nesmlouvá";
  const counterValue = input.offerType === "loan"
    ? decision.terms.amount
    : netSaleValue(decision.terms, input.swapValue, input.saleCosts ?? NO_SALE_COSTS);
  return counterValue >= options.reservation ? null : `protinávrh pod rezervací (${counterValue} < ${options.reservation})`;
}

export type BuyerReplyReason = "accept_within_max" | "raise" | "no_sell_on" | "too_expensive" | "out_of_patience";

export interface BuyerDecisionInput {
  /** Protinávrh prodávajícího. */
  terms: TransferTerms;
  marketValue: number;
  /** Strop AI v hotovosti (`maxBuyPrice`). */
  maxPrice: number;
  /** Poslední vlastní návrh AI (částka hotově). */
  lastOwnBid: number;
  /** Kolik protinávrhů už AI v jednání poslala. */
  rounds: number;
  profile: AiCoachProfile;
}

export type BuyerDecision =
  | { kind: "accept"; reason: BuyerReplyReason; cost: number }
  | { kind: "counter"; reason: BuyerReplyReason; cost: number; terms: TransferTerms }
  | { kind: "withdraw"; reason: BuyerReplyReason; cost: number };

/**
 * Kupující AI na protinávrh prodávajícího: vejde se do stropu → bere, jinak přidá, nebo odejde.
 *
 * Počítá se celá cena v korunách (splátky nezlevní: strop se nedá obejít rozložením ceny)
 * a procenta z dalšího prodeje AI nedává nikdy. Jinak by šlo hráče AI prodat s doložkou
 * a odkoupit zpátky za polovic, protože doložka by vrátila část ceny prodávajícímu.
 */
export function decideBuyerReply(input: BuyerDecisionInput): BuyerDecision {
  const cost = input.terms.amount;
  const wantsSellOn = input.terms.sellOnPct > 0;
  if (!wantsSellOn && cost <= input.maxPrice) return { kind: "accept", reason: "accept_within_max", cost };
  if (input.rounds >= maxCounterRounds(input.profile)) return { kind: "withdraw", reason: "out_of_patience", cost };
  // Prodávající chce o víc než čtvrtinu nad strop: na to AI nemá, jednání ukončí.
  if (cost > input.maxPrice * 1.25) return { kind: "withdraw", reason: "too_expensive", cost };
  if (wantsSellOn && cost <= input.maxPrice) {
    // Částka by šla, doložka ne: AI nabídne totéž hotově a bez procent.
    const amount = Math.max(100, floor100(cost));
    return { kind: "counter", reason: "no_sell_on", cost, terms: { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 } };
  }
  const eagerness = 0.35 + (input.profile.ambition / 100) * 0.3;
  const raised = floor100(Math.min(input.maxPrice, input.lastOwnBid + (cost - input.lastOwnBid) * eagerness));
  if (raised <= input.lastOwnBid) return { kind: "withdraw", reason: "too_expensive", cost };
  return { kind: "counter", reason: "raise", cost, terms: { amount: raised, upfrontPct: 100, installments: 0, sellOnPct: 0 } };
}
