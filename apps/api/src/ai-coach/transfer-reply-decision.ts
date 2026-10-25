/**
 * Odpověď AI trenéra na nabídku na jeho hráče modelem (spec 3.7). Čisté funkce bez databáze:
 * popis situace pro model, schéma odpovědi a kontrola, že model vybral jen z přípustných možností.
 *
 * Co je počítání, dělá kód (transfer-decision.ts, `sellerOptions`): rezervaci, první požadavek,
 * pojistky, kola smlouvání a z nich přípustné akce s mezemi protinávrhu. Model volí jen mezi
 * nimi (přijmout, protinávrh v mezích, odmítnout) podle povahy, kádru, peněz a týdenního kurzu.
 * Volba mimo nabídku je neplatná a rozhodne náhradní pravidlo.
 *
 * Do popisu nejde žádný text, který píšou lidé (názvy klubů, zpráva k nabídce): model by se
 * jím dal navést. Ani navedený model ale neprodá pod rezervací, to hlídá kód.
 */

import type { TransferTerms } from "@okresni-masina/shared";
import type { AiCoachProfile } from "./profile";
import type { SellerAction, SellerChoice, SellerOptions } from "./transfer-decision";
import type { SaleCosts, SquadImportance } from "./valuation";
import { styleText } from "./weekly-decision";

export interface TransferReplyContext {
  profile: AiCoachProfile;
  budget: number;
  /** Peníze nad rezervou na provoz. */
  spendable: number;
  weeklyCosts: number;
  /** Vlastní hráči áčka (bez hráčů, na které už běží protinávrh AI). */
  squadSize: number;
  targetSquad: number;
  dealsLast30: number;
  dealLimit: number;
  overDealLimit: boolean;
  /** Přestupní kurz z pondělní správy, nebo null. */
  plan: { stance: "buy" | "hold" | "sell"; focus: string[]; chosenToSell: boolean } | null;
  player: {
    position: string;
    age: number;
    rating: number;
    marketValue: number;
    importance: SquadImportance;
    injured: boolean;
    /** Hráč je zrovna na hostování jinde (kupující ho chce odkoupit). */
    onLoanElsewhere: boolean;
    /** Cena z inzerátu AI klubu, nebo null. */
    listedPrice: number | null;
    /** Hodnocení ostatních hráčů áčka na stejném postu, od nejlepšího. */
    samePosition: number[];
    /** Kolik hráčů na postu hraje v základu podle oblíbené formace. */
    starters: number;
    formation: string;
  };
  buyer: {
    managedBy: "human" | "computer" | "outside";
    /** Kupující je ze stejného okresu (null = nevíme, klub mimo hru). */
    sameDistrict: boolean | null;
  };
  offer: {
    type: "transfer" | "loan";
    loanDays: number | null;
    terms: TransferTerms;
    swapPlayers: Array<{ position: string; age: number; rating: number; useful: boolean }>;
  };
  costs: SaleCosts;
  /** Jednání téhož kupujícího o hráči za 14 dní v čisté hodnotě, od nejstaršího. */
  history: { previousAsks: number[]; previousBids: number[]; priorBreakOffs: number };
  options: SellerOptions;
}

export const TRANSFER_REPLY_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "Another club has made an offer for one of your players and it is your turn to answer it.",
  "The game has already computed every price and checked every rule: you can never sell below your minimum price, and every listed option is allowed.",
  "Decide like a sensible real manager with YOUR personality: keep the players your team needs, cash in on players you do not need, and do not give in to lowball offers.",
  "Never favour or punish a club for being run by a human or by the computer.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

const IMPORTANCE_TEXT: Record<SquadImportance, string> = {
  key: "a key starter who is hard to replace",
  rotation: "a regular squad player (starter or first backup)",
  surplus: "surplus, he rarely plays for you",
};

const STANCE_TEXT: Record<"buy" | "hold" | "sell", string> = {
  buy: "buy (strengthen the squad)",
  hold: "hold (no big changes)",
  sell: "sell (cash in on players you do not need)",
};

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

function numbers(values: number[]): string {
  return values.map((v) => Math.round(v).toLocaleString("en-US")).join(", ");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function clubLines(ctx: TransferReplyContext): string[] {
  const p = ctx.profile;
  const plan = ctx.plan
    ? `${STANCE_TEXT[ctx.plan.stance]}${ctx.plan.focus.length ? `; positions to strengthen: ${ctx.plan.focus.join(", ")}` : ""}${ctx.plan.chosenToSell ? "; you picked this player to sell" : ""}`
    : "none set";
  return [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, patience ${p.patience}, trading ${p.trading}, risk ${p.risk}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB: budget ${czk(ctx.budget)}, of which ${czk(ctx.spendable)} is above the reserve you keep for running costs (about ${czk(ctx.weeklyCosts)} a week). A-team squad ${ctx.squadSize} players, you want about ${ctx.targetSquad}. Transfers in the last 30 days: ${ctx.dealsLast30}, your monthly limit ${ctx.dealLimit}.`,
    `TRANSFER COURSE this week: ${plan}.`,
  ];
}

function playerLine(ctx: TransferReplyContext): string {
  const pl = ctx.player;
  const notes = [`for you ${IMPORTANCE_TEXT[pl.importance]}`];
  if (pl.injured) notes.push("injured now");
  if (pl.onLoanElsewhere) notes.push("now on loan at another club");
  const others = pl.samePosition.length > 0
    ? `Other ${pl.position} in your A-team: ${pl.samePosition.slice(0, 8).join(", ")}`
    : `No other ${pl.position} in your A-team`;
  return `PLAYER: ${pl.position}, age ${pl.age}, rating ${pl.rating}, market value ${czk(pl.marketValue)}; ${notes.join("; ")}. ${others}; your ${pl.formation} starts ${pl.starters}.`;
}

function offerLine(ctx: TransferReplyContext): string {
  const b = ctx.buyer;
  const who = b.managedBy === "outside"
    ? "a club outside the game; it does not negotiate, it only takes yes or no"
    : `a club run by ${b.managedBy === "human" ? "a human manager" : "a computer coach"}${b.sameDistrict === true ? ", from your district" : b.sameDistrict === false ? ", from another district" : ""}`;
  const o = ctx.offer;
  if (o.type === "loan") return `OFFER from ${who}: loan for ${plural(o.loanDays ?? 30, "day")}, loan fee ${czk(o.terms.amount)}.`;
  const t = o.terms;
  const parts = [`permanent transfer for ${czk(t.amount)}`];
  parts.push(t.installments > 0 ? `${t.upfrontPct} % upfront and the rest in ${t.installments} weekly instalments` : "paid at once");
  if (t.sellOnPct > 0) parts.push(`plus ${t.sellOnPct} % of a future sale (counts as nothing for you: the buyer decides whether he ever sells him)`);
  if (o.swapPlayers.length > 0) {
    const swaps = o.swapPlayers.map((p) => `${p.position} age ${p.age} rating ${p.rating} (${p.useful ? "would play for you" : "would not play for you"})`);
    parts.push(`plus in exchange ${swaps.join("; ")}`);
  }
  return `OFFER from ${who}: ${parts.join(", ")}.`;
}

function worthLine(ctx: TransferReplyContext): string {
  const o = ctx.options;
  const notes: string[] = [];
  if (ctx.offer.terms.installments > 0) notes.push("instalments discounted for waiting and risk");
  if (ctx.offer.swapPlayers.length > 0) notes.push("players in exchange counted at what they are worth to you");
  if (ctx.costs.sellOnPct > 0) notes.push(`minus the ${ctx.costs.sellOnPct} % of the sale you owe a former club`);
  if (ctx.costs.remainingDebt > 0) notes.push(`minus ${czk(ctx.costs.remainingDebt)} you still owe for him`);
  const share = o.reservation > 0 ? `, ${Math.round((o.value / o.reservation) * 100)} % of your minimum` : "";
  return `Worth to your club now: ${czk(o.value)}${share}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`;
}

function pricesLine(ctx: TransferReplyContext): string {
  const o = ctx.options;
  if (ctx.offer.type === "loan") return `PRICES set by the game: your loan fee for him for this period is ${czk(o.reservation)}.`;
  let text = `PRICES set by the game: your minimum ${czk(o.reservation)} (you can never sell below it); your current asking price ${czk(o.currentAsk)}.`;
  if (ctx.player.listedPrice) text += ` He is on your transfer list for ${czk(ctx.player.listedPrice)}.`;
  if (ctx.overDealLimit) text += " You have reached your monthly limit of transfers, so the prices include 20 % extra.";
  return text;
}

function historyLine(ctx: TransferReplyContext): string | null {
  if (ctx.buyer.managedBy === "outside") return null;
  const h = ctx.history;
  const parts: string[] = [];
  if (h.previousBids.length > 0) parts.push(`their earlier offers were worth ${numbers(h.previousBids)} CZK`);
  if (h.previousAsks.length > 0) parts.push(`you asked ${numbers(h.previousAsks)} CZK`);
  if (h.priorBreakOffs > 0) parts.push(`you already ended talks with them ${plural(h.priorBreakOffs, "time")}`);
  return `TALKS with this club about him in the last 14 days: ${parts.length > 0 ? parts.join("; ") : "this is their first offer"}.`;
}

function optionLine(ctx: TransferReplyContext, action: SellerAction): string {
  const loan = ctx.offer.type === "loan";
  const o = ctx.options;
  if (action === "accept") return `- "accept": ${loan ? "lend him for this fee" : "sell him for this offer"}.`;
  if (action === "reject") {
    return `- "reject": ${ctx.buyer.managedBy === "outside" ? "turn the offer down" : "end the talks; this club cannot make another offer for him for 10 days"}.`;
  }
  const range = o.counter;
  const amount = !range ? "a higher amount"
    : range.min === range.max ? `exactly ${czk(range.min)}`
      : `${czk(range.min)} to ${czk(range.max)} in whole hundreds`;
  const plan = loan ? "" : " (value to your club; the game turns it into their payment plan)";
  return `- "counter": ask for ${amount}${plan}; you have patience for ${plural(o.roundsLeft, "more counter-offer")}.`;
}

export function renderTransferReplyPrompt(ctx: TransferReplyContext): string {
  const o = ctx.options;
  const amount = o.counter
    ? `your counter-offer in CZK, a whole hundred from ${o.counter.min} to ${o.counter.max} (if you accept or reject, put ${o.counter.min})`
    : "0";
  const lines = [
    ...clubLines(ctx),
    "",
    playerLine(ctx),
    offerLine(ctx),
    ...(ctx.offer.type === "transfer" ? [worthLine(ctx)] : []),
    pricesLine(ctx),
    historyLine(ctx),
    "",
    "OPTIONS:",
    ...o.actions.map((a) => optionLine(ctx, a)),
    "",
    `Return {"action": ${o.actions.map((a) => `"${a}"`).join(" or ")}, "amount": ${amount}, "reason": "one short English sentence"}.`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Schéma odpovědi: akce jen z přípustných (nikdy prázdný výčet), částka v mezích protinávrhu. */
export function transferReplySchema(options: SellerOptions): Record<string, unknown> {
  const actions: SellerAction[] = options.actions.length > 0 ? [...options.actions] : ["reject"];
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: actions },
      amount: options.counter
        ? { type: "integer", minimum: options.counter.min, maximum: options.counter.max }
        : { type: "integer" },
      reason: { type: "string" },
    },
    required: ["action", "amount", "reason"],
    additionalProperties: false,
  };
}

export type TransferReplyCheck =
  | { ok: true; choice: SellerChoice; reason: string }
  | { ok: false; error: string };

function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Model smí vybrat jen přípustnou akci a protinávrh jen v mezích (zaokrouhlí se na stovky).
 * Jinak chyba a rozhodne náhradní pravidlo.
 */
export function validateTransferReply(raw: unknown, options: SellerOptions): TransferReplyCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "odpověď není objekt" };
  const r = raw as Record<string, unknown>;
  const action = (typeof r.action === "string" ? r.action.trim().toLowerCase() : "") as SellerAction;
  if (!options.actions.includes(action)) {
    return { ok: false, error: `nepřípustná akce ${JSON.stringify(r.action ?? null)}, přípustné jsou ${options.actions.join(", ")}` };
  }
  const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "";
  if (action !== "counter") return { ok: true, choice: { action, amount: 0 }, reason };
  const range = options.counter;
  const parsed = parseAmount(r.amount);
  if (!range || parsed === null) return { ok: false, error: `protinávrh bez platné částky (${JSON.stringify(r.amount ?? null)})` };
  const amount = Math.round(parsed / 100) * 100;
  if (amount < range.min || amount > range.max) {
    return { ok: false, error: `protinávrh ${amount} Kč mimo meze ${range.min} až ${range.max} Kč` };
  }
  return { ok: true, choice: { action, amount }, reason };
}
