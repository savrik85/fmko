/**
 * Rozhodnutí AI trenéra v přestupovém jednání. Čisté funkce bez databáze: stejný vstup
 * dá vždy stejné rozhodnutí, nikdo není zvýhodněný (lidský ani AI kupující).
 *
 * Prodávající AI (spec 3.7): nabídka nad požadavkem projde, mírně pod rezervací přijde
 * protinávrh a postupné ustupování podle trpělivosti, hluboko pod rezervací odmítnutí.
 * Pod 60 % tržní hodnoty nikdy nic. Kola smlouvání se počítají přes všechna jednání téhož
 * kupujícího o témže hráči ve 14denním okně, takže stažením a novou nabídkou se AI
 * „nevynuluje“.
 */

import { transferTermsError, type TransferTerms } from "@okresni-masina/shared";
import type { AiCoachProfile } from "./profile";
import {
  concessionRate,
  isBelowHardFloor,
  maxCounterRounds,
  openingAsk,
  presentCost,
  presentValue,
  reservationPrice,
  stableUnit,
  termsForValue,
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
  | "loan_fee_low";

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

export function decideSellerReply(input: SellerDecisionInput): SellerDecision {
  const value = presentValue(input.terms, input.marketValue) + input.swapValue;
  const baseReservation = reservationPrice({
    marketValue: input.marketValue, importance: input.importance, profile: input.profile, playerId: input.playerId, now: input.now,
  });
  const reservation = input.overDealLimit ? ceil100(baseReservation * OVER_LIMIT_MARKUP) : baseReservation;

  if (input.block) return { kind: "reject", reason: "blocked", value, reservation, block: input.block };

  if (input.offerType === "loan") return decideLoan(input, value, reservation);

  // Pevná pojistka: pod 60 % tržní hodnoty nic, ani se splátkami nebo výměnou. Počítá se jen
  // jistá část: procenta z dalšího prodeje jsou jen naděje, pojistku obejít nesmí.
  const guaranteed = presentValue({ ...input.terms, sellOnPct: 0 }, input.marketValue) + input.swapValue;
  if (isBelowHardFloor(guaranteed, input.marketValue)) return { kind: "reject", reason: "hard_floor", value, reservation };

  // Hráč, který se mezitím stal oporou (zranění, prodeje), za cenu z inzerátu nejde.
  const listed = input.listedPrice && input.listedPrice > 0 && input.importance !== "key" ? input.listedPrice : null;
  // Cena z inzerátu platí: kdo ji nabídne (v současné hodnotě), má souhlas.
  if (listed && value >= listed && !input.overDealLimit) return { kind: "accept", reason: "accept_ask", value, reservation };

  const ask0 = Math.max(reservation, listed ?? openingAsk({
    marketValue: input.marketValue, importance: input.importance, profile: input.profile, playerId: input.playerId, now: input.now,
  }) * (input.overDealLimit ? OVER_LIMIT_MARKUP : 1));
  // AI se k vyšší ceně nevrací: platí nejnižší požadavek, který už tomuto kupujícímu řekla.
  const currentAsk = Math.max(reservation, input.previousAsks.length > 0 ? Math.min(...input.previousAsks) : ask0);

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

  const lastBid = input.previousBids.length > 0 ? input.previousBids[input.previousBids.length - 1] : 0;
  const noProgress = lastBid > 0 && value <= lastBid;
  const roundsLeft = maxCounterRounds(input.profile) - input.previousAsks.length - input.priorBreakOffs - (noProgress ? 1 : 0);
  if (roundsLeft <= 0) return { kind: "reject", reason: "out_of_patience", value, reservation };

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

/** Protinávrh s požadovanou hodnotou ve struktuře kupujícího; neplatné podmínky → hotově. */
function counterTerms(ask: number, input: SellerDecisionInput): TransferTerms | null {
  const structured = termsForValue(ask, input.terms, input.marketValue, input.swapValue);
  if (!transferTermsError(structured)) return structured;
  const lump: TransferTerms = { amount: ceil100(Math.max(0, ask - input.swapValue)), upfrontPct: 100, installments: 0, sellOnPct: 0 };
  // Výměna bez doplatku: nula jde, kladná částka musí být aspoň 100 Kč.
  if (lump.amount === 0 && input.swapValue <= 0) return null;
  return transferTermsError(lump) ? null : lump;
}

export type BuyerReplyReason = "accept_within_max" | "raise" | "too_expensive" | "out_of_patience";

export interface BuyerDecisionInput {
  /** Protinávrh prodávajícího. */
  terms: TransferTerms;
  marketValue: number;
  /** Strop AI v současné hodnotě nákladu (`maxBuyPrice`). */
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

/** Kupující AI na protinávrh prodávajícího: vejde se do stropu → bere, jinak přidá, nebo odejde. */
export function decideBuyerReply(input: BuyerDecisionInput): BuyerDecision {
  const cost = presentCost(input.terms, input.marketValue);
  if (cost <= input.maxPrice) return { kind: "accept", reason: "accept_within_max", cost };
  if (input.rounds >= maxCounterRounds(input.profile)) return { kind: "withdraw", reason: "out_of_patience", cost };
  // Prodávající chce o víc než čtvrtinu nad strop: na to AI nemá, jednání ukončí.
  if (cost > input.maxPrice * 1.25) return { kind: "withdraw", reason: "too_expensive", cost };
  const eagerness = 0.35 + (input.profile.ambition / 100) * 0.3;
  const raised = floor100(Math.min(input.maxPrice, input.lastOwnBid + (cost - input.lastOwnBid) * eagerness));
  if (raised <= input.lastOwnBid) return { kind: "withdraw", reason: "too_expensive", cost };
  return { kind: "counter", reason: "raise", cost, terms: { amount: raised, upfrontPct: 100, installments: 0, sellOnPct: 0 } };
}
