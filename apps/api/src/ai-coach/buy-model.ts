/**
 * Model při práci AI klubu na trhu (spec 3.5 a 3.7): model navrhuje, kód hlídá.
 *
 * - `decideByModel`: společný postup pro všechna rozhodnutí na trhu (inzeráty, nabídky
 *   k poptávkám, skaut, nouzový podpis volného hráče, výběr hráče, jednání) se sdíleným
 *   limitem volání za běh a souhrnem pro deník (`MarketTrace`).
 * - Výběr: z užšího výběru, který sestavil kód (transfer-market.ts), model vybere hráče
 *   a částku v rozpětí, hostování a jeho délku, poptávku, nebo nic.
 * - Jednání: na požadavek prodávajícího model vybere přijmout, přihodit (částku v mezích,
 *   které spočítal kód), nebo odejít.
 *
 * Kód meze hlídá (`validateBuyPick`, `buyNegotiationBounds`): nad strop `maxBuyPrice` AI nikdy
 * nezaplatí, procenta z dalšího prodeje nikdy nedá a počet protinávrhů má strop. Bez modelu
 * (výpadek, překročený čas, režim off, chybějící binding, neplatná odpověď) rozhodne pravidlo
 * volajícího: pořadí kandidátů v transfer-market.ts, u klubu mimo hru `outside-buy.ts`,
 * u klubu ve hře `decideBuyerReply` (transfer-decision.ts).
 */

import type { TransferTerms } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import {
  BUY_SYSTEM_PROMPT, buyNegotiationBounds, buyNegotiationSchema, buyPickSchema, CASH_TERMS, hasBuyChoice, negotiationActions,
  renderBuyNegotiationPrompt, renderBuyPickPrompt, validateBuyNegotiation, validateBuyPick,
  type AskTerms, type BuyNegotiationContext, type BuyNegotiationDecision, type BuyPickContext, type BuyPickDecision, type BuySeller,
} from "./buy-decision";
import { logDecision, type DecisionMode } from "./decision-log";
import { callCoachModel, COACH_MODEL } from "./llm";
import type { AiCoachProfile } from "./profile";
import { decideBuyerReply, type BuyerDecision } from "./transfer-decision";
import { maxCounterRounds } from "./valuation";

/** Na jeden tah v jednání model nemá přemýšlet dlouho: hodinová úloha nesmí stát. */
export const BUY_MODEL_TIMEOUT_MS = 60_000;

/** Kdo rozhodl: model, náhradní pravidlo (výpadek, off, neplatná odpověď), nebo kód (jediná možnost). */
export type DecidedBy = "model" | "fallback" | "guard";

export interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  prompt: string | null;
}

export const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null, prompt: null };

export interface ModelUse {
  /** Smí rozhodovat model (režim není off)? */
  useModel: boolean;
  /** Binding Workers AI; bez něj rozhoduje pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání, admin). */
  model?: string;
  /**
   * Kolik volání modelu v běhu ještě zbývá (sdílí ho výběr hráče i jednání). Hodinová úloha
   * nesmí kvůli dlouhému smlouvání překročit čas fronty: po vyčerpání rozhoduje pravidlo.
   */
  budget?: { left: number };
}

/** Smí se teď zavolat model? Když došel limit volání za běh, vrátí důvod pro deník. */
function modelBlocked(use: ModelUse): string | null {
  if (use.budget && use.budget.left <= 0) return "došel limit volání modelu za běh";
  if (use.budget) use.budget.left--;
  return null;
}

function traceOf(res: Awaited<ReturnType<typeof callCoachModel>>, prompt: string): ModelTrace {
  return {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
}

export interface DecisionOutcome<T> {
  decision: T;
  by: DecidedBy;
  trace: ModelTrace;
}

/** Jedno rozhodnutí pro model: popis, schéma, kontrola odpovědi a pravidlo bez modelu. */
export interface ModelDecisionSpec<T> {
  /** Název schématu (pozná se podle něj i v deníku a v testech). */
  name: string;
  system: string;
  prompt: () => string;
  schema: () => Record<string, unknown>;
  /** Odpověď modelu jako rozhodnutí, nebo null, když není přípustná. */
  validate: (raw: unknown) => T | null;
  /** Náhradní pravidlo podle povahy (výpadek, off, neplatná odpověď, došel limit volání). */
  rule: () => T;
  maxTokens?: number;
}

/**
 * Model navrhuje, kód hlídá: zeptá se modelu, odpověď zkontroluje a bez modelu nebo při neplatné
 * odpovědi rozhodne pravidlo. Nikdy nehází. Kolik je přípustných možností, hlídá volající: jediná
 * možnost se modelu nepředkládá.
 */
export async function decideByModel<T>(spec: ModelDecisionSpec<T>, use: ModelUse): Promise<DecisionOutcome<T>> {
  if (!use.useModel || !use.ai?.AI) return { decision: spec.rule(), by: "fallback", trace: NO_TRACE };
  const blocked = modelBlocked(use);
  if (blocked) return { decision: spec.rule(), by: "fallback", trace: { ...NO_TRACE, error: blocked } };
  const prompt = spec.prompt();
  const res = await callCoachModel(use.ai, {
    system: spec.system, user: prompt, maxTokens: spec.maxTokens ?? 400,
    schema: { name: spec.name, schema: spec.schema() }, model: use.model, timeoutMs: BUY_MODEL_TIMEOUT_MS,
  });
  const trace = traceOf(res, prompt);
  const parsed = res.json ? spec.validate(res.json) : null;
  if (parsed === null) return { decision: spec.rule(), by: "fallback", trace: { ...trace, error: trace.error ?? "neplatná odpověď modelu" } };
  return { decision: parsed, by: "model", trace };
}

/**
 * Souhrn volání modelu za běh trhu (všechna rozhodnutí kromě tahů v jednání, ty mají vlastní
 * zápis) pro jeden řádek deníku `transfer_market`.
 */
export interface MarketTrace {
  model: string | null;
  raws: string[];
  prompts: string[];
  errors: string[];
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  calls: number;
  /** Rozhodlo aspoň jednou pravidlo místo modelu (výpadek, off, neplatná odpověď, limit volání). */
  usedFallback: boolean;
}

export function newMarketTrace(): MarketTrace {
  return { model: null, raws: [], prompts: [], errors: [], tokensIn: 0, tokensOut: 0, latencyMs: 0, calls: 0, usedFallback: false };
}

/** Přičte rozhodnutí do souhrnu běhu; `step` popisuje v chybách, o které rozhodnutí šlo. */
export function recordDecision(sum: MarketTrace, step: string, by: DecidedBy, t: ModelTrace): void {
  if (by === "fallback") sum.usedFallback = true;
  if (t.error) sum.errors.push(`${step}: ${t.error}`);
  if (!t.model) return;
  sum.model = t.model;
  sum.calls++;
  if (t.raw) sum.raws.push(t.raw);
  if (t.prompt) sum.prompts.push(t.prompt);
  sum.tokensIn += t.tokensIn ?? 0;
  sum.tokensOut += t.tokensOut ?? 0;
  sum.latencyMs += t.latencyMs ?? 0;
}

export type PickOutcome = DecisionOutcome<BuyPickDecision>;

/**
 * Výběr hráče na post (nebo hostování, poptávka, nic). Když zbývá jen „nic“, model se neptá.
 * Nikdy nehází: chyba nebo neplatná odpověď modelu znamená pravidlo `rule`.
 */
export async function decideBuyPick(ctx: BuyPickContext, rule: () => BuyPickDecision, use: ModelUse): Promise<PickOutcome> {
  if (!hasBuyChoice(ctx)) return { decision: { kind: "none", reason: "no_options" }, by: "guard", trace: NO_TRACE };
  return decideByModel({
    name: "buy_pick", system: BUY_SYSTEM_PROMPT, maxTokens: 400,
    prompt: () => renderBuyPickPrompt(ctx), schema: () => buyPickSchema(ctx), validate: (raw) => validateBuyPick(raw, ctx), rule,
  }, use);
}

export type NegotiationOutcome = DecisionOutcome<BuyNegotiationDecision>;

/**
 * Rozhodne jeden tah AI kupujícího. Bez modelu rozhodne kód, když je jen jedna možnost:
 * prodávající chce nejvýš to, co AI sama nabídla (svou cenu AI dodrží, přijme), nebo už zbývá
 * jen odejít. Nikdy nehází: chyba modelu znamená náhradní pravidlo.
 */
export async function decideBuyNegotiation(
  ctx: BuyNegotiationContext, fallback: () => BuyNegotiationDecision, use: ModelUse,
): Promise<NegotiationOutcome> {
  // Svou cenu AI dodrží i tehdy, když se jí mezitím strop posunul (nabídka byla ve stropu, když ji
  // dala). Procenta z dalšího prodeje ale nedá nikdy, ani za vlastní cenu.
  const lastOwnBid = ctx.ownBids.length > 0 ? ctx.ownBids[ctx.ownBids.length - 1] : null;
  if (lastOwnBid !== null && ctx.ask <= lastOwnBid && ctx.askTerms.sellOnPct <= 0) {
    return { decision: { kind: "accept", reason: "own_price" }, by: "guard", trace: NO_TRACE };
  }
  if (negotiationActions(ctx).length === 1) {
    return { decision: { kind: "withdraw", reason: "only_option" }, by: "guard", trace: NO_TRACE };
  }
  return decideByModel({
    name: "buy_negotiation", system: BUY_SYSTEM_PROMPT, maxTokens: 300,
    prompt: () => renderBuyNegotiationPrompt(ctx), schema: () => buyNegotiationSchema(ctx),
    validate: (raw) => validateBuyNegotiation(raw, ctx), rule: fallback,
  }, use);
}

/** Zápis tahu do deníku (`transfer_negotiation`): co model dostal, vrátil, co prošlo a co se provedlo. */
export async function logNegotiationDecision(db: D1Database, entry: {
  teamId: string; mode: DecisionMode; contextRef: string; ctx: BuyNegotiationContext; outcome: NegotiationOutcome; executed: unknown;
}): Promise<void> {
  const { ctx, outcome } = entry;
  const t = outcome.trace;
  await logDecision(db, {
    teamId: entry.teamId, kind: "transfer_negotiation", mode: entry.mode,
    model: t.model ?? (outcome.by === "model" ? COACH_MODEL : "rules"),
    contextRef: entry.contextRef,
    inputSummary: t.prompt ?? `${ctx.player.position} ${ctx.player.rating} age ${ctx.player.age} from ${ctx.seller}: ask=${ctx.ask}`
      + ` sellOn=${ctx.askTerms.sellOnPct} max=${ctx.maxPrice} bids=${ctx.ownBids.join("/") || "-"} countersLeft=${ctx.countersLeft}`,
    rawOutput: t.raw,
    actions: {
      ...outcome.decision, decidedBy: outcome.by, ask: ctx.ask, maxPrice: ctx.maxPrice, ownBids: ctx.ownBids,
      canAccept: ctx.canAccept, counter: ctx.counter,
    },
    executed: entry.executed,
    usedFallback: outcome.by === "fallback",
    error: t.error,
    tokensIn: t.tokensIn, tokensOut: t.tokensOut, latencyMs: t.latencyMs,
  });
}

function cash(amount: number): TransferTerms {
  return { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 };
}

export interface BuyerReplyInput {
  teamName: string;
  profile: AiCoachProfile;
  spendable: number;
  player: BuyNegotiationContext["player"];
  seller: Exclude<BuySeller, "none" | "outside">;
  listedPrice: number | null;
  /** Protinávrh prodávajícího (celá cena a podmínky). */
  terms: TransferTerms;
  /** Strop AI v hotovosti (`maxBuyPrice` po meziligovém poplatku), u hostování strop poplatku (`maxLoanFee`). */
  maxPrice: number;
  /** Vlastní návrhy AI v jednání od prvního (poslední = `lastOwnBid` pravidla); u hostování poplatky. */
  ownBids: number[];
  /** Kolik protinávrhů už AI v jednání poslala. */
  rounds: number;
  /** Hostování, o které AI požádala: délka ve dnech (`terms.amount` je pak poplatek). Přestup = bez něj. */
  loanDays?: number | null;
}

export interface BuyerReplyOutcome extends NegotiationOutcome {
  /** Rozhodnutí ve tvaru `decideBuyerReply`, ať ho volající provede stejně jako dřív. */
  reply: BuyerDecision;
  ctx: BuyNegotiationContext;
}

/** Kontext tahu na protinávrh klubu ve hře (meze stejné jako u pravidla `decideBuyerReply`). */
export function buyerReplyContext(input: BuyerReplyInput): BuyNegotiationContext {
  const lastOwnBid = input.ownBids.length > 0 ? input.ownBids[input.ownBids.length - 1] : 0;
  const countersLeft = Math.max(0, maxCounterRounds(input.profile) - input.rounds);
  const askTerms: AskTerms = { upfrontPct: input.terms.upfrontPct, installments: input.terms.installments, sellOnPct: input.terms.sellOnPct };
  // Hostování: procenta z dalšího prodeje ani splátky u poplatku nejsou.
  const loan = input.loanDays != null;
  const sellOnPct = loan ? 0 : input.terms.sellOnPct;
  return {
    ...buyNegotiationBounds({ ask: input.terms.amount, sellOnPct, maxPrice: input.maxPrice, lastOwnBid, countersLeft }),
    teamName: input.teamName, profile: input.profile, spendable: input.spendable, player: input.player, seller: input.seller,
    listedPrice: input.listedPrice, ownBids: input.ownBids, ask: input.terms.amount, askTerms: loan ? CASH_TERMS : askTerms,
    maxPrice: input.maxPrice, countersLeft, loanDays: loan ? input.loanDays : null,
  };
}

/** Pravidlo u hostování bez modelu: poplatek do stropu zaplatí, jinak žádost stáhne. */
function loanRule(fee: number, maxFee: number): BuyerDecision {
  return fee <= maxFee ? { kind: "accept", reason: "accept_within_max", cost: fee } : { kind: "withdraw", reason: "too_expensive", cost: fee };
}

/**
 * Odpověď AI kupujícího na protinávrh klubu ve hře (pro `replyAsBuyer` v transfer-replies.ts),
 * u přestupu i u hostování, o které AI požádala (`loanDays`, částky jsou poplatek).
 * Vrací rozhodnutí ve tvaru `decideBuyerReply`: model vybírá v mezích kódu, bez modelu rozhodne
 * pravidlo (`decideBuyerReply`, u hostování poplatek do stropu, jinak stáhnout). Přijetí nad
 * strop ani s procenty z dalšího prodeje nikdy neprojde; když prodávající chce nejvýš to, co AI
 * sama nabídla, kód přijme bez modelu.
 */
export async function decideBuyerReplyByModel(input: BuyerReplyInput, use: ModelUse): Promise<BuyerReplyOutcome> {
  const ctx = buyerReplyContext(input);
  const cost = input.terms.amount;
  const lastOwnBid = input.ownBids.length > 0 ? input.ownBids[input.ownBids.length - 1] : 0;
  const rule = input.loanDays != null
    ? loanRule(cost, input.maxPrice)
    : decideBuyerReply({
      terms: input.terms, marketValue: input.player.estimatedValue, maxPrice: input.maxPrice, lastOwnBid, rounds: input.rounds, profile: input.profile,
    });
  const outcome = await decideBuyNegotiation(ctx, () => {
    if (rule.kind === "counter") return { kind: "counter", amount: rule.terms.amount, reason: rule.reason };
    return { kind: rule.kind, reason: rule.reason };
  }, use);
  if (outcome.by === "guard") {
    // Rozhodl kód: svou cenu AI dodrží (přijme), jinak zbývá jen odejít (došly protinávrhy, nebo
    // pod strop už nejde přidat).
    if (outcome.decision.kind === "accept") return { ...outcome, reply: { kind: "accept", reason: "accept_within_max", cost }, ctx };
    return { ...outcome, reply: { kind: "withdraw", reason: ctx.countersLeft === 0 ? "out_of_patience" : "too_expensive", cost }, ctx };
  }
  if (outcome.by === "fallback") return { ...outcome, reply: rule, ctx };
  const d = outcome.decision;
  const reply: BuyerDecision = d.kind === "accept"
    ? { kind: "accept", reason: "accept_within_max", cost }
    : d.kind === "counter"
      ? { kind: "counter", reason: input.terms.sellOnPct > 0 ? "no_sell_on" : "raise", cost, terms: cash(d.amount) }
      : { kind: "withdraw", reason: "too_expensive", cost };
  return { ...outcome, reply, ctx };
}
