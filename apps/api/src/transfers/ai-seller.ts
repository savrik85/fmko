/**
 * Cizí klub jako prodávající: smlouvá nahoru a snaží se z kupujícího dostat co nejvíc
 * (spec 2026-10-04). Čisté funkce bez databáze, stav se ukládá do `ai_negotiations.ai_state`.
 *
 * Klub má skrytou rezervační cenu R, pod kterou neprodá, a požadavek, který postupně
 * snižuje k R. Trpělivost ubírají urážlivé nabídky a přešlapování na místě. Když dojde,
 * klub jednání ukončí.
 *
 * Odkud jsou čísla (spec, tabulka AI prodejce):
 * - násobky R podle postavení hráče: poměr zaplaceno / tržní cena u lidských přestupů
 *   na produkci (medián 1,03, p75 1,35, p90 1,87, n = 22 přestupů za 5 000 Kč a víc od 15. 9.);
 * - inzerát 0,85 požadavku: konečná cena / první protinávrh prodávajícího, p25;
 * - krok protinávrhu 0,93 a šance 0,38 na „ještě přitlačit": tamtéž;
 * - šum e^N(0; 0,25) a pásmo prvního požadavku 1,0–1,35 jsou odhady;
 * - diskont splátek 2,06 % týdně: bankovní půjčka 15 % na ~13 týdnů (competition/defaults.ts),
 *   takže splátky nevyjdou levněji než půjčka a nejde koupit hvězdu za 10 % zálohy.
 */

import { createRng } from "../generators/rng";
import { transferSchedule, transferTermsError, type AiSellerStance, type TransferTerms } from "@okresni-masina/shared";

export const AI_SELLER = {
  listed: { reservationOfAsk: 0.85, patience: 3, concession: 0.4, squeezeChance: 0 },
  poached: { patience: 2, concession: 0.25, squeezeChance: 0.38, askSpreadMin: 1.0, askSpreadMax: 1.35 },
  /** Nejlepší hráč klubu: klub ho pouští nerad a dlouho se nebaví. */
  keyPlayerPatience: 1,
  noiseSd: 0.25,
  /** Nejmenší krok, o který klub sleví (3 % požadavku), aby jednání nestálo. */
  minStepPct: 0.03,
  /** Požadavek / nabídka pod tímto poměrem = blízko, trpělivost se neubírá. */
  closeGap: 1.5,
  /** Od tohoto poměru je nabídka urážka. */
  insultGap: 3,
  weeklyDiscount: 0.0206,
  /** Po tolika návrzích kupujícího pod R klub jednání ukončí. */
  maxRounds: 6,
  /** Klub, který jednání ukončil, se o tomtéž hráči čtrnáct dní nebaví (vzor sponzorů). */
  breakOffCooldownDays: 14,
  /** Platnost souhlasu klubu: tolik hodin má kupující na podpis. */
  agreementHoldHours: 48,
} as const;

export interface AiSellerState {
  stance: AiSellerStance;
  /** Rezervační cena v současné hodnotě (Kč). Kupující ji nikdy nevidí. */
  reservation: number;
  /** Aktuální požadavek klubu v současné hodnotě (Kč). */
  ask: number;
  patience: number;
  /** Kolik návrhů kupujícího klub zpracoval. */
  round: number;
  /** Současná hodnota posledního návrhu kupujícího (0 = zatím žádný). */
  lastBidValue: number;
  keyPlayer: boolean;
  seed: number;
}

export interface AiSellerInit {
  stance: AiSellerStance;
  /** Tržní cena hráče (`marketValue`). */
  marketValue: number;
  /** Cena z inzerátu (jen `listed`). */
  askingPrice?: number;
  /** Pořadí hráče v kádru jeho klubu, 1 = nejlepší (jen `poached`). */
  clubRank?: number;
  seed: number;
  /** Kolikrát už klub s tímhle kupujícím o hráči jednání ukončil. */
  priorBreakOffs?: number;
}

const round100 = (v: number) => Math.round(v / 100) * 100;
const ceil100 = (v: number) => Math.ceil(v / 100) * 100;

/** Normální rozdělení z rovnoměrného (Box–Muller). */
function normal(random: () => number): number {
  const u = Math.max(1e-9, random());
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Násobek tržní ceny podle toho, jak moc klub hráče potřebuje. */
export function rankMultiplier(clubRank: number): number {
  if (clubRank <= 1) return 1.87;
  if (clubRank <= 11) return 1.35;
  return 1.03;
}

export function initAiSellerState(init: AiSellerInit): AiSellerState {
  const rng = createRng(init.seed);
  const noise = Math.exp(normal(rng.random) * AI_SELLER.noiseSd);
  const prior = Math.max(0, init.priorBreakOffs ?? 0);

  if (init.stance === "listed") {
    // Cena z inzerátu platí přesně: kdo nabídne inzerovanou cenu, má souhlas hned.
    const ask = Math.max(500, Math.round(init.askingPrice ?? init.marketValue));
    const reservation = Math.min(ask, Math.max(500, round100(ask * AI_SELLER.listed.reservationOfAsk * noise)));
    return {
      stance: "listed", reservation, ask,
      patience: Math.max(1, AI_SELLER.listed.patience - prior),
      round: 0, lastBidValue: 0, keyPlayer: false, seed: init.seed,
    };
  }

  const rank = Math.max(1, init.clubRank ?? 12);
  const reservation = Math.max(500, round100(init.marketValue * rankMultiplier(rank) * noise));
  const spread = AI_SELLER.poached.askSpreadMin
    + rng.random() * (AI_SELLER.poached.askSpreadMax - AI_SELLER.poached.askSpreadMin);
  const ask = Math.max(reservation, round100(reservation * spread));
  const keyPlayer = rank === 1;
  const basePatience = keyPlayer ? AI_SELLER.keyPlayerPatience : AI_SELLER.poached.patience;
  return {
    stance: "poached", reservation, ask,
    patience: Math.max(1, basePatience - prior),
    round: 0, lastBidValue: 0, keyPlayer, seed: init.seed,
  };
}

/**
 * Kolik má návrh pro prodávajícího skutečně cenu: záloha hned, splátky diskontované
 * týdenní sazbou. Procenta z dalšího prodeje cizí klub nebere, takže se nepočítají.
 */
export function effectiveBidValue(terms: TransferTerms): number {
  const s = transferSchedule(terms);
  if (s.installments === 0) return terms.amount;
  let value = s.upfront;
  for (let i = 1; i <= s.installments; i++) {
    const payment = i === s.installments ? s.lastInstallment : s.installmentAmount;
    value += payment / Math.pow(1 + AI_SELLER.weeklyDiscount, i);
  }
  return Math.round(value);
}

/**
 * Podmínky protinávrhu: klub drží strukturu kupujícího (záloha, počet splátek) a dopočítá
 * cenu tak, aby měla požadovanou současnou hodnotu. Když to se splátkami nejde, chce vše hned.
 */
export function termsForValue(value: number, structure: TransferTerms): TransferTerms {
  // Hotově přesně požadovaná částka (cena z inzerátu nemusí být kulatá, další kroky jsou po stovkách).
  const lump: TransferTerms = { amount: Math.ceil(value), upfrontPct: 100, installments: 0, sellOnPct: 0 };
  if (structure.installments === 0) return lump;
  const probe = 100_000;
  const factor = effectiveBidValue({ ...structure, amount: probe, sellOnPct: 0 }) / probe;
  if (!(factor > 0)) return lump;
  const terms: TransferTerms = {
    amount: ceil100(value / factor), upfrontPct: structure.upfrontPct, installments: structure.installments, sellOnPct: 0,
  };
  // Zaokrouhlení nahoru se splátkami může vyjít o pár korun pod cílem — doladit po stovkách.
  for (let i = 0; i < 20 && effectiveBidValue(terms) < value; i++) terms.amount += 100;
  return transferTermsError(terms) ? lump : terms;
}

/** Tón odpovědi klubu — vybírá text zprávy. */
export type AiReplyTone = "agree" | "squeeze" | "fair" | "firm" | "insulted" | "repeat" | "final" | "break_off" | "last_round";

export interface AiSellerReply {
  kind: "agree" | "counter" | "break_off";
  tone: AiReplyTone;
  /** Podmínky protinávrhu (jen `counter`). */
  counterTerms?: TransferTerms;
  nextState: AiSellerState;
}

/** Odpověď klubu na návrh kupujícího. Deterministická: stejný stav a návrh = stejná odpověď. */
export function decideAiSellerReply(state: AiSellerState, terms: TransferTerms): AiSellerReply {
  const round = state.round + 1;
  const value = effectiveBidValue(terms);
  const rng = createRng(state.seed + round * 7919);
  const base: AiSellerState = { ...state, round, lastBidValue: value };

  if (value >= state.ask) return { kind: "agree", tone: "agree", nextState: base };

  if (value >= state.reservation) {
    const squeeze = state.stance === "poached" && round === 1 && rng.random() < AI_SELLER.poached.squeezeChance;
    if (!squeeze) return { kind: "agree", tone: "agree", nextState: base };
    // Klub cítí, že kupující chce, a zkusí to ještě jednou v půlce mezi nabídkou a požadavkem.
    const ask = Math.max(state.reservation, round100((value + state.ask) / 2));
    if (ask <= value) return { kind: "agree", tone: "agree", nextState: base };
    return { kind: "counter", tone: "squeeze", counterTerms: termsForValue(ask, terms), nextState: { ...base, ask } };
  }

  const gap = value > 0 ? state.ask / value : Number.POSITIVE_INFINITY;
  const insult = gap >= AI_SELLER.insultGap;
  let patienceLoss = insult ? 2 : gap >= AI_SELLER.closeGap ? 1 : 0;
  const noProgress = state.lastBidValue > 0 && value <= state.lastBidValue;
  if (noProgress) patienceLoss = Math.max(patienceLoss, 1);
  const patience = state.patience - patienceLoss;

  if (patience <= 0 || round >= AI_SELLER.maxRounds) {
    return { kind: "break_off", tone: "break_off", nextState: { ...base, patience: Math.max(0, patience) } };
  }

  if (insult) {
    // Na urážku klub neslevuje, jen zopakuje svou cenu.
    return { kind: "counter", tone: "insulted", counterTerms: termsForValue(state.ask, terms), nextState: { ...base, patience } };
  }

  const concession = state.stance === "listed" ? AI_SELLER.listed.concession : AI_SELLER.poached.concession;
  const step = Math.max(state.ask * AI_SELLER.minStepPct, (state.ask - value) * concession);
  const ask = Math.max(state.reservation, round100(state.ask - step));
  const tone: AiReplyTone = ask <= state.reservation
    ? "final"
    : round === AI_SELLER.maxRounds - 1
      ? "last_round"
      : noProgress ? "repeat" : gap < AI_SELLER.closeGap ? "fair" : "firm";
  return { kind: "counter", tone, counterTerms: termsForValue(ask, terms), nextState: { ...base, ask, patience } };
}
