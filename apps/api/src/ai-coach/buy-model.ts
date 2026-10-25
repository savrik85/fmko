/**
 * Model při nákupu hráče (spec 3.5 a 3.7): model navrhuje, kód hlídá.
 *
 * - Výběr: z užšího výběru, který sestavil kód (transfer-market.ts), model vybere hráče
 *   a částku v rozpětí, hostování, poptávku, nebo nic.
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
  BUY_SYSTEM_PROMPT, buyNegotiationBounds, buyNegotiationSchema, buyPickSchema, hasBuyChoice, negotiationActions,
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

export interface PickOutcome {
  decision: BuyPickDecision;
  by: DecidedBy;
  trace: ModelTrace;
}

/**
 * Výběr hráče na post (nebo hostování, poptávka, nic). Když zbývá jen „nic“, model se neptá.
 * Nikdy nehází: chyba nebo neplatná odpověď modelu znamená pravidlo `rule`.
 */
export async function decideBuyPick(ctx: BuyPickContext, rule: () => BuyPickDecision, use: ModelUse): Promise<PickOutcome> {
  if (!hasBuyChoice(ctx)) return { decision: { kind: "none", reason: "no_options" }, by: "guard", trace: NO_TRACE };
  if (!use.useModel || !use.ai?.AI) return { decision: rule(), by: "fallback", trace: NO_TRACE };
  const blocked = modelBlocked(use);
  if (blocked) return { decision: rule(), by: "fallback", trace: { ...NO_TRACE, error: blocked } };
  const prompt = renderBuyPickPrompt(ctx);
  const res = await callCoachModel(use.ai, {
    system: BUY_SYSTEM_PROMPT, user: prompt, maxTokens: 400,
    schema: { name: "buy_pick", schema: buyPickSchema(ctx) }, model: use.model, timeoutMs: BUY_MODEL_TIMEOUT_MS,
  });
  const trace = traceOf(res, prompt);
  const parsed = res.json ? validateBuyPick(res.json, ctx) : null;
  if (!parsed) return { decision: rule(), by: "fallback", trace: { ...trace, error: trace.error ?? "neplatná odpověď modelu" } };
  return { decision: parsed, by: "model", trace };
}

export interface NegotiationOutcome {
  decision: BuyNegotiationDecision;
  by: DecidedBy;
  trace: ModelTrace;
}

/**
 * Rozhodne jeden tah AI kupujícího. Jediná přípustná možnost (odejít) se modelu nepředkládá.
 * Nikdy nehází: chyba modelu znamená náhradní pravidlo.
 */
export async function decideBuyNegotiation(
  ctx: BuyNegotiationContext, fallback: () => BuyNegotiationDecision, use: ModelUse,
): Promise<NegotiationOutcome> {
  if (negotiationActions(ctx).length === 1) {
    return { decision: { kind: "withdraw", reason: "only_option" }, by: "guard", trace: NO_TRACE };
  }
  if (!use.useModel || !use.ai?.AI) return { decision: fallback(), by: "fallback", trace: NO_TRACE };
  const blocked = modelBlocked(use);
  if (blocked) return { decision: fallback(), by: "fallback", trace: { ...NO_TRACE, error: blocked } };
  const prompt = renderBuyNegotiationPrompt(ctx);
  const res = await callCoachModel(use.ai, {
    system: BUY_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
    schema: { name: "buy_negotiation", schema: buyNegotiationSchema(ctx) }, model: use.model, timeoutMs: BUY_MODEL_TIMEOUT_MS,
  });
  const trace = traceOf(res, prompt);
  const parsed = res.json ? validateBuyNegotiation(res.json, ctx) : null;
  if (!parsed) return { decision: fallback(), by: "fallback", trace: { ...trace, error: trace.error ?? "neplatná odpověď modelu" } };
  return { decision: parsed, by: "model", trace };
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
  /** Strop AI v hotovosti (`maxBuyPrice` po meziligovém poplatku). */
  maxPrice: number;
  /** Vlastní návrhy AI v jednání od prvního (poslední = `lastOwnBid` pravidla). */
  ownBids: number[];
  /** Kolik protinávrhů už AI v jednání poslala. */
  rounds: number;
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
  return {
    ...buyNegotiationBounds({ ask: input.terms.amount, sellOnPct: input.terms.sellOnPct, maxPrice: input.maxPrice, lastOwnBid, countersLeft }),
    teamName: input.teamName, profile: input.profile, spendable: input.spendable, player: input.player, seller: input.seller,
    listedPrice: input.listedPrice, ownBids: input.ownBids, ask: input.terms.amount, askTerms, maxPrice: input.maxPrice, countersLeft,
  };
}

/**
 * Odpověď AI kupujícího na protinávrh klubu ve hře (pro `replyAsBuyer` v transfer-replies.ts).
 * Vrací rozhodnutí ve tvaru `decideBuyerReply`: model vybírá v mezích kódu, pravidlo
 * `decideBuyerReply` rozhoduje bez modelu. Přijetí nad strop ani s procenty z dalšího prodeje
 * nikdy neprojde.
 */
export async function decideBuyerReplyByModel(input: BuyerReplyInput, use: ModelUse): Promise<BuyerReplyOutcome> {
  const ctx = buyerReplyContext(input);
  const cost = input.terms.amount;
  const lastOwnBid = input.ownBids.length > 0 ? input.ownBids[input.ownBids.length - 1] : 0;
  const rule = decideBuyerReply({
    terms: input.terms, marketValue: input.player.estimatedValue, maxPrice: input.maxPrice, lastOwnBid, rounds: input.rounds, profile: input.profile,
  });
  const outcome = await decideBuyNegotiation(ctx, () => {
    if (rule.kind === "counter") return { kind: "counter", amount: rule.terms.amount, reason: rule.reason };
    return { kind: rule.kind, reason: rule.reason };
  }, use);
  if (outcome.by === "guard") {
    // Jediná možnost je odejít: došly protinávrhy, nebo pod strop už nejde přidat.
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
