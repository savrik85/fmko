/**
 * AI trenér odpovídá na přestupová jednání (spec 3.4 a 3.7).
 *
 * - Nabídky a protinávrhy na hráče AI klubu (přestup, výměna, hostování, odkup z hostování,
 *   nabídky klubů mimo hru) a příhozy na inzeráty AI klubu (z inzerátu vzniká běžná nabídka,
 *   staré `transfer_bids` se vyřídí také).
 * - Protinávrhy prodávajících na vlastní nabídky AI klubu.
 * - Hráči, které kluby nabídly k poptávkám AI klubu.
 *
 * Jako člověk: odpoví s prodlevou 1–20 hodin od posledního tahu (vždy do lhůty nabídky).
 * Provádějí to tytéž služby jako u lidí (`services/transfer-actions.ts`), takže platí stejné
 * lhůty, pauzy, limity i peníze.
 *
 * Nabídky na hráče AI klubu: model navrhuje, kód hlídá. Ceny, pojistky a přípustné akce počítá
 * vždy kód (`valuation.ts`, `transfer-decision.ts`). Zbyde-li jediná možnost (blokovaný hráč,
 * pod 60 % tržní hodnoty, nabídka za vlastní požadavek, bez prostoru pro protinávrh), rozhodne
 * kód bez modelu. Jinak vybere model (transfer-reply-decision.ts) přijetí, protinávrh v mezích,
 * nebo odmítnutí; při výpadku, nesmyslu, režimu off a bez bindingu AI náhradní pravidlo.
 * Protinávrhy prodávajících na nabídky AI klubu a nabídnuté hráče zatím rozhoduje jen kód.
 */

import type { Bindings } from "../index";
import { marketValue, termsFromRow, transferTermsError, type TransferTerms } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { resolveClubTeamId, resolveOfferClubScope } from "../transfers/offer-club-scope";
import {
  acceptListingBid, acceptTransferOffer, counterListingBid, counterTransferOffer, createTransferOffer, rejectListingBid,
  rejectTransferOffer, withdrawTransferOffer,
} from "../services/transfer-actions";
import { claimCoachTask, releaseCoachTask } from "./claims";
import { logDecision, type DecisionMode } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import { readCoachMode } from "./mode";
import { ensureAiProfile, type AiCoachProfile } from "./profile";
import { analyzeSquad, formationSlots, MAX_SQUAD, TARGET_SENIOR_SQUAD, type SquadAnalysis, type SquadPosition } from "./squad";
import {
  decideBuyerReply, decideSellerReply, sellerDecisionFromChoice, sellerGuardViolation, sellerOptions,
  type SellerDecision, type SellerDecisionInput, type SellerOptions,
} from "./transfer-decision";
import { loadAiClubState, parseDbTime, type AiClubState } from "./transfer-club";
import { loadCommittedPlayerIds, loadSaleCosts, loadSwapPlayersForValue, squadForSale, swapValueFor } from "./transfer-guard";
import type { WeeklyTransferPlan } from "./transfer-market";
import {
  renderTransferReplyPrompt, TRANSFER_REPLY_SYSTEM_PROMPT, transferReplySchema, validateTransferReply, type TransferReplyContext,
} from "./transfer-reply-decision";
import { maxBuyPrice, netSaleValue, NO_SALE_COSTS, openDealLimit, openingBid, stableUnit, termsForValue, type SaleCosts } from "./valuation";

const M = "ai-transfer-replies";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Na odpověď modelu se čeká nejvýš minutu: hodinová úloha nesmí stát. */
const MODEL_TIMEOUT_MS = 60_000;
/**
 * Kolik reálného času smí jeden běh strávit s modelem. Úloha běží ve frontě (strop 15 minut)
 * spolu s trhem a přáteláky; další odpovědi v tom běhu rozhodne náhradní pravidlo.
 */
const MODEL_BUDGET_MS = 6 * 60_000;

/** Prodleva odpovědi v reálných hodinách od posledního tahu protistrany. */
export const MIN_REPLY_HOURS = 1;
export const MAX_REPLY_HOURS = 20;
/** AI odpoví nejpozději tolik hodin před koncem lhůty, i kdyby jinak ještě čekala. */
export const DEADLINE_SAFETY_HOURS = 2;
/** Jak daleko do minulosti AI pamatuje jednání s týmž kupujícím o témže hráči. */
const HISTORY_DAYS = 14;
/** Nejvýš tolik odpovědí za jeden běh (hodinová úloha nemá trvat dlouho). */
const MAX_REPLIES_PER_RUN = 12;

const ceil100 = (v: number) => Math.ceil(v / 100) * 100;

/**
 * Nárok na odpověď podle režimu: rozhodnutí nanečisto (shadow) nesmí po přepnutí na `on`
 * zablokovat skutečnou odpověď na tentýž tah.
 */
export function claimTask(mode: DecisionMode, task: string): string {
  return mode === "shadow" ? `shadow:${task}` : task;
}

/**
 * Za kolik hodin AI odpoví: 1–20 h, pevně pro daný tah (opakovaný běh nic nezmění).
 * Netrpělivý trenér odpovídá rychleji, trpělivý si dá na čas.
 */
export function replyDelayHours(key: string, profile: AiCoachProfile): number {
  const base = MIN_REPLY_HOURS + stableUnit(`reply|${key}`) * (MAX_REPLY_HOURS - MIN_REPLY_HOURS);
  const temper = 0.6 + (profile.patience / 100) * 0.8;
  return Math.max(MIN_REPLY_HOURS, Math.min(MAX_REPLY_HOURS, base * temper));
}

/** Kdy AI odpoví: po prodlevě, ale vždy aspoň DEADLINE_SAFETY_HOURS před koncem lhůty. */
export function replyDueAt(lastActionAt: Date, expiresAt: Date | null, hours: number): Date {
  const due = new Date(lastActionAt.getTime() + hours * HOUR_MS);
  if (!expiresAt) return due;
  const latest = new Date(expiresAt.getTime() - DEADLINE_SAFETY_HOURS * HOUR_MS);
  return due < latest ? due : latest;
}

type OfferRow = Record<string, unknown> & {
  id: string; player_id: string; from_team_id: string; to_team_id: string; offer_amount: number; counter_amount: number | null;
  status: string; last_action_by: string | null; offer_type: string | null; loan_duration: number | null;
  expires_at: string; created_at: string; upfront_pct: number | null; installments: number | null; sell_on_pct: number | null;
};

interface PlayerRow {
  id: string; first_name: string; last_name: string; position: string; overall_rating: number; age: number;
  team_id: string; loan_from_team_id: string | null; status: string | null;
}

type SwapSummary = ReturnType<typeof swapValueFor>;

interface RunContext {
  env: Bindings;
  mode: DecisionMode;
  now: Date;
  club: AiClubState;
  /** Hodnota hráčů na výměnu podle nabídky (cache v rámci běhu). */
  swapValues: Map<string, SwapSummary>;
  /** Do kdy (reálný čas v ms) se smí v tomto běhu ptát modelu. */
  modelDeadline: number;
  /** Přestupní kurz z pondělní správy; načte se, až když se ptá model (undefined = nenačteno). */
  plan?: WeeklyTransferPlan | null;
}

/** Kdo o odpovědi rozhodl: model, náhradní pravidlo (výpadek, off, nesmysl), nebo kód (jediná možnost). */
type DecidedBy = "model" | "fallback" | "guard";

interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  prompt: string | null;
}

const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null, prompt: null };

/** Rozhodnutí AI prodávajícího s tím, kdo rozhodl a co bylo přípustné. */
interface SaleOutcome {
  decision: SellerDecision;
  by: DecidedBy;
  options: SellerOptions;
  trace: ModelTrace;
  /** Krátké zdůvodnění modelu. */
  reasoning: string | null;
}

/** Co model o nabídce vidí navíc k číslům rozhodnutí (načte se, jen když se model ptá). */
interface SaleFacts {
  player: PlayerRow;
  analysis: SquadAnalysis;
  buyerClubTeamId: string;
  /** Nabídka, ke které můžou patřit hráči na výměnu; starý příhoz žádné nemá. */
  offerId: string | null;
}

function termsOf(offer: { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, amount: number): TransferTerms {
  return termsFromRow(offer, amount);
}

function currentAmount(offer: OfferRow): number {
  return offer.counter_amount != null ? offer.counter_amount : offer.offer_amount;
}

async function loadPlayer(db: D1Database, playerId: string): Promise<PlayerRow | null> {
  return db.prepare(
    "SELECT id, first_name, last_name, position, overall_rating, age, team_id, loan_from_team_id, status FROM players WHERE id = ?",
  ).bind(playerId).first<PlayerRow>();
}

function playerValue(p: { overall_rating: number; age: number; position: string }): number {
  return marketValue(p.overall_rating, p.age, p.position);
}

/**
 * Poslední tah v jednání (událost, jinak vznik nabídky) a klíč stavu jednání. Klíč nese
 * i počet tahů, takže dva tahy v jedné sekundě nesplynou do jednoho nároku na odpověď.
 */
async function lastAction(db: D1Database, offer: OfferRow, now: Date): Promise<{ at: Date; key: string }> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS n, MAX(julianday(created_at)) AS last_jd FROM transfer_offer_events WHERE offer_id = ?",
  ).bind(offer.id).first<{ n: number; last_jd: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední tah nabídky ${offer.id}`, e); return null; });
  const fromEvents = row?.last_jd != null ? new Date(Math.round((row.last_jd - 2440587.5) * DAY_MS)) : null;
  const at = fromEvents ?? parseDbTime(offer.created_at) ?? now;
  return { at, key: `${row?.n ?? 0}|${offer.status}|${offer.last_action_by ?? "-"}|${at.toISOString()}` };
}

/** Hodnota hráčů na výměnu pro AI klub, jejich tržní hodnota a posty (cache v rámci běhu). */
async function swapValueOf(ctx: RunContext, offerId: string, analysis: SquadAnalysis): Promise<SwapSummary> {
  const cached = ctx.swapValues.get(offerId);
  if (cached) return cached;
  const out = swapValueFor(await loadSwapPlayersForValue(ctx.env.DB, offerId), analysis);
  ctx.swapValues.set(offerId, out);
  return out;
}

interface NegotiationHistory {
  previousAsks: number[];
  previousBids: number[];
  priorBreakOffs: number;
}

/**
 * Jednání téhož kupujícího o témže hráči za posledních 14 dní: co AI chtěla, co kupující
 * nabízel a kolikrát už AI jednání ukončila. Nová nabídka po stažení tak AI nevynuluje.
 */
async function negotiationHistory(
  ctx: RunContext,
  args: { playerId: string; buyerClubTeamId: string; currentOfferId: string; analysis: SquadAnalysis; costs: SaleCosts },
): Promise<NegotiationHistory> {
  if (args.buyerClubTeamId === "virtual_ai") return { previousAsks: [], previousBids: [], priorBreakOffs: 0 };
  const since = new Date(ctx.now.getTime() - HISTORY_DAYS * DAY_MS).toISOString();
  const rows = await ctx.env.DB.prepare(
    `SELECT e.offer_id, e.event_type, e.amount, e.upfront_pct, e.installments, e.sell_on_pct,
            COALESCE(t.parent_team_id, t.id, e.team_id) AS club_id
       FROM transfer_offer_events e
       JOIN transfer_offers o ON o.id = e.offer_id
       LEFT JOIN teams t ON t.id = e.team_id
      WHERE o.player_id = ?
        AND o.from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
        AND julianday(e.created_at) >= julianday(?)
      ORDER BY julianday(e.created_at), e.rowid`,
  ).bind(args.playerId, args.buyerClubTeamId, args.buyerClubTeamId, since).all<{
    offer_id: string; event_type: string; amount: number | null; upfront_pct: number | null; installments: number | null;
    sell_on_pct: number | null; club_id: string;
  }>();

  const asks: number[] = [];
  const bids: Array<{ offerId: string; value: number }> = [];
  let breakOffs = 0;
  for (const r of rows.results) {
    const swap = await swapValueOf(ctx, r.offer_id, args.analysis);
    // Stejná čistá hodnota jako v rozhodnutí, ať se požadavky AI porovnávají se stejným metrem.
    const value = netSaleValue(termsOf(r, r.amount ?? 0), swap.value, { ...args.costs, swapMarketValue: swap.marketValue });
    if (r.club_id === ctx.club.teamId) {
      if (r.event_type === "counter") asks.push(value);
      if (r.event_type === "reject" || r.event_type === "withdraw") breakOffs++;
    } else if (r.club_id === args.buyerClubTeamId && (r.event_type === "offer" || r.event_type === "counter")) {
      bids.push({ offerId: r.offer_id, value });
    }
  }
  // Poslední návrh kupujícího v téhle nabídce je ten, na který se odpovídá.
  for (let i = bids.length - 1; i >= 0; i--) {
    if (bids[i].offerId === args.currentOfferId) { bids.splice(i, 1); break; }
  }
  return { previousAsks: asks, previousBids: bids.map((b) => b.value), priorBreakOffs: breakOffs };
}

function summarizeSeller(player: PlayerRow, importance: string, decision: SellerDecision, offer: OfferRow): string {
  return `sell ${player.position} ${player.overall_rating} age ${player.age} (${importance}) `
    + `${offer.offer_type ?? "transfer"} from ${offer.from_team_id}: value=${decision.value} reservation=${decision.reservation}`
    + (decision.kind === "counter" ? ` ask=${decision.ask}` : "");
}

async function log(ctx: RunContext, entry: {
  contextRef: string; inputSummary: string; actions: unknown; executed: unknown; error?: string | null;
  /** Odpověď prodávajícího: kdo rozhodl a stopa modelu. Bez ní jde o pravidla kupujícího („rules“). */
  sale?: Pick<SaleOutcome, "by" | "trace">;
}): Promise<void> {
  const trace = entry.sale?.trace ?? NO_TRACE;
  await logDecision(ctx.env.DB, {
    teamId: ctx.club.teamId, kind: "transfer_reply", mode: ctx.mode, model: entry.sale ? trace.model : "rules",
    contextRef: entry.contextRef,
    inputSummary: trace.prompt ? `${entry.inputSummary}\n\n${trace.prompt}` : entry.inputSummary,
    rawOutput: trace.raw,
    actions: entry.actions, executed: entry.executed,
    usedFallback: entry.sale?.by === "fallback",
    error: [trace.error, entry.error].filter((e): e is string => !!e).join("; ") || null,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });
}

/** Do deníku: rozhodnutí, kdo rozhodl, zdůvodnění modelu a co bylo přípustné. */
function saleActions(sale: SaleOutcome): Record<string, unknown> {
  return {
    ...sale.decision,
    decidedBy: sale.by,
    ...(sale.reasoning ? { reasoning: sale.reasoning } : {}),
    allowed: sale.options.actions,
    counterRange: sale.options.counter,
  };
}

/** Přestupní kurz z pondělní správy, jednou za běh. */
async function weeklyPlan(ctx: RunContext): Promise<WeeklyTransferPlan | null> {
  if (ctx.plan === undefined) {
    // Dynamicky: transfer-market.ts importuje z tohoto modulu, statický import by byl kruh.
    const { loadWeeklyTransferPlan } = await import("./transfer-market");
    ctx.plan = await loadWeeklyTransferPlan(ctx.env.DB, ctx.club.teamId, ctx.now);
  }
  return ctx.plan;
}

/** Kdo kupuje: člověk, jiný AI klub, nebo klub mimo hru, a jestli je z našeho okresu. */
async function describeBuyer(ctx: RunContext, buyerClubTeamId: string): Promise<TransferReplyContext["buyer"]> {
  if (buyerClubTeamId === "virtual_ai") return { managedBy: "outside", sameDistrict: null };
  const row = await ctx.env.DB.prepare(
    "SELECT t.user_id, v.district FROM teams t LEFT JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(buyerClubTeamId).first<{ user_id: string | null; district: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `kupující klub ${buyerClubTeamId}`, e); return null; });
  return {
    managedBy: row?.user_id === "ai" ? "computer" : "human",
    sameDistrict: row?.district && ctx.club.district ? row.district === ctx.club.district : null,
  };
}

/** Stručný popis situace pro model: povaha, peníze, kurz, hráč a jeho post, nabídka, jednání. */
async function saleContext(ctx: RunContext, input: SellerDecisionInput, options: SellerOptions, facts: SaleFacts): Promise<TransferReplyContext> {
  const { club } = ctx;
  const { player, analysis } = facts;
  const plan = await weeklyPlan(ctx);
  const samePosition = analysis.members
    .filter((m) => !m.isU21Roster && m.position === player.position && m.id !== player.id)
    .map((m) => m.rating)
    .sort((a, b) => b - a);
  const slots = formationSlots(analysis.formation) as Record<string, number>;
  const swapPlayers = facts.offerId ? await loadSwapPlayersForValue(ctx.env.DB, facts.offerId) : [];
  return {
    profile: club.profile,
    budget: club.budget,
    spendable: club.spendable,
    weeklyCosts: club.weeklyCosts,
    squadSize: analysis.seniorOwnCount,
    targetSquad: TARGET_SENIOR_SQUAD,
    dealsLast30: club.dealsLast30,
    dealLimit: club.dealLimit,
    overDealLimit: input.overDealLimit,
    plan: plan ? { stance: plan.stance, focus: plan.focus, chosenToSell: plan.sellIds.includes(player.id) } : null,
    player: {
      position: player.position,
      age: player.age,
      rating: player.overall_rating,
      marketValue: input.marketValue,
      importance: input.importance,
      injured: analysis.members.some((m) => m.id === player.id && m.injured),
      onLoanElsewhere: player.loan_from_team_id != null,
      listedPrice: input.listedPrice ?? null,
      samePosition,
      starters: slots[player.position] ?? 0,
      formation: analysis.formation,
    },
    buyer: await describeBuyer(ctx, facts.buyerClubTeamId),
    offer: {
      type: input.offerType,
      loanDays: input.loanDays ?? null,
      terms: input.terms,
      swapPlayers: swapPlayers.map((p) => ({ ...p, useful: analysis.isUseful(p) })),
    },
    costs: input.saleCosts ?? NO_SALE_COSTS,
    history: { previousAsks: input.previousAsks, previousBids: input.previousBids, priorBreakOffs: input.priorBreakOffs },
    options,
  };
}

/** Víc přípustných možností: vybere model, bez něj (nebo při nesmyslu) náhradní pravidlo. */
async function askModel(ctx: RunContext, input: SellerDecisionInput, options: SellerOptions, facts: SaleFacts): Promise<SaleOutcome> {
  const fallback = (trace: ModelTrace): SaleOutcome => ({ decision: decideSellerReply(input), by: "fallback", options, trace, reasoning: null });
  if (ctx.mode === "off") return fallback(NO_TRACE);
  if (!ctx.env.AI) return fallback({ ...NO_TRACE, error: "chybí binding AI" });
  if (Date.now() > ctx.modelDeadline) return fallback({ ...NO_TRACE, error: "čas na model v tomto běhu vyčerpán" });

  const prompt = renderTransferReplyPrompt(await saleContext(ctx, input, options, facts));
  const res = await callCoachModel(ctx.env, {
    system: TRANSFER_REPLY_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
    schema: { name: "transfer_reply", schema: transferReplySchema(options) }, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  if (!res.json) return fallback({ ...trace, error: trace.error ?? "bez odpovědi modelu" });
  const check = validateTransferReply(res.json, options);
  if (!check.ok) return fallback({ ...trace, error: `neplatná odpověď modelu: ${check.error}` });
  const decision = sellerDecisionFromChoice(input, options, check.choice);
  if (!decision) return fallback({ ...trace, error: "neplatná odpověď modelu: protinávrh nejde sestavit" });
  return { decision, by: "model", options, trace, reasoning: check.reason || null };
}

/**
 * Odpověď AI prodávajícího: jediná přípustná možnost rozhodne kód, jinak model a při výpadku
 * pravidlo. Před provedením vždy pojistka: pod rezervaci nic, ať rozhodl kdokoli (spec 3.7).
 */
async function decideSale(ctx: RunContext, input: SellerDecisionInput, facts: SaleFacts): Promise<SaleOutcome> {
  const options = sellerOptions(input);
  const outcome: SaleOutcome = options.forced
    ? { decision: options.forced, by: "guard", options, trace: NO_TRACE, reasoning: null }
    : await askModel(ctx, input, options, facts);
  const violation = sellerGuardViolation(input, options, outcome.decision);
  if (!violation) return outcome;
  // Nemá nastat (odpověď modelu je zkontrolovaná, pravidlo pod rezervaci nejde), ale kdyby: odmítnout.
  logger.error({ module: M }, `odpověď AI klubu ${ctx.club.teamId} na ${input.offerId} porušila pojistku prodeje: ${violation}`);
  return {
    ...outcome,
    decision: { kind: "reject", reason: "guard", value: options.value, reservation: options.reservation },
    trace: { ...outcome.trace, error: [outcome.trace.error, `pojistka: ${violation}`].filter((e): e is string => !!e).join("; ") },
  };
}

/** Když AI pustí oporu, založí poptávku na její post (plán náhrady). */
async function planReplacement(ctx: RunContext, player: PlayerRow): Promise<void> {
  const { createDemand } = await import("../transfers/demands");
  const res = await createDemand(ctx.env.DB, ctx.club.teamId, {
    position: player.position as SquadPosition,
    ageMin: 18, ageMax: 31, role: "starter",
    maxPrice: Math.max(1000, Math.round(playerValue(player) * 1.1 / 1000) * 1000),
    note: null,
    minRating: Math.max(1, player.overall_rating - 6),
    skills: [],
  }).catch((e) => { logger.warn({ module: M }, `poptávka na náhradu ${player.id}`, e); return null; });
  if (res && !res.ok) logger.info({ module: M }, `náhrada za ${player.id} bez poptávky: ${res.error}`);
}

/** Chyba služby, kterou má smysl zkusit znovu příští hodinu (výpadek), ne trest pro protistranu. */
export class RetryLaterError extends Error {}

/**
 * Co dělat, když služba akci AI nepřijala: 500 = zkusit příště (nárok se uvolní), 409/410 =
 * jednání se mezitím pohnulo nebo skončilo (nic), jinak (kupující nemá peníze, hráč už
 * nepatří klubu, propojené kluby) jednání ukončit, ať nabídka nevisí.
 */
function failureOutcome(res: { status: number; error: string }): "retry" | "settled" | "close" {
  if (res.status >= 500) return "retry";
  if (res.status === 409 || res.status === 410) return "settled";
  return "close";
}

/** Provede rozhodnutí prodávajícího přes služby. V režimu shadow nic neprovede. */
async function executeSellerDecision(ctx: RunContext, offer: OfferRow, decision: SellerDecision, swapValue: number, costs: SaleCosts): Promise<{ executed: string; error?: string }> {
  if (ctx.mode === "shadow") return { executed: "shadow" };
  const { env, club } = ctx;
  const closeAfter = async (res: { status: number; error: string }, what: string): Promise<{ executed: string; error?: string }> => {
    const outcome = failureOutcome(res);
    if (outcome === "retry") throw new RetryLaterError(`${what}: ${res.error}`);
    if (outcome === "settled") return { executed: `${what}_settled_meanwhile`, error: res.error };
    const rej = await rejectTransferOffer(env, club.teamId, offer.id);
    return { executed: rej.ok ? `rejected_after_failed_${what}` : "failed", error: res.error };
  };
  if (decision.kind === "accept") {
    const res = await acceptTransferOffer(env, club.teamId, offer.id);
    return res.ok ? { executed: "accepted" } : closeAfter(res, "accept");
  }
  if (decision.kind === "counter") {
    const t = decision.terms;
    const res = await counterTransferOffer(env, club.teamId, offer.id, {
      amount: t.amount, upfrontPct: t.upfrontPct, installments: t.installments, sellOnPct: t.sellOnPct,
    });
    if (res.ok) return { executed: "countered" };
    // Splátky by kupující neutáhl nebo nesedí podmínky: stejná čistá hodnota hotově.
    if (failureOutcome(res) === "close" && t.installments > 0) {
      const lump = termsForValue(decision.ask, { amount: 0, upfrontPct: 100, installments: 0, sellOnPct: t.sellOnPct }, swapValue, costs);
      if (!transferTermsError(lump) && (lump.amount > 0 || swapValue > 0)) {
        const retry = await counterTransferOffer(env, club.teamId, offer.id, { ...lump });
        if (retry.ok) return { executed: "countered_lump_sum" };
      }
    }
    return closeAfter(res, "counter");
  }
  const rej = await rejectTransferOffer(env, club.teamId, offer.id);
  if (rej.ok) return { executed: "rejected" };
  if (failureOutcome(rej) === "retry") throw new RetryLaterError(`reject: ${rej.error}`);
  return { executed: "failed", error: rej.error };
}

/** AI klub je prodávající (nebo vlastník hostovaného hráče) a je na tahu. */
async function replyAsSeller(ctx: RunContext, offer: OfferRow, buyerClubTeamId: string): Promise<boolean> {
  const db = ctx.env.DB;
  const { club } = ctx;
  const player = await loadPlayer(db, offer.player_id);
  if (!player) {
    const res = ctx.mode === "shadow" ? null : await rejectTransferOffer(ctx.env, club.teamId, offer.id);
    const executed = ctx.mode === "shadow" ? "shadow" : res?.ok ? "rejected" : "failed";
    await log(ctx, {
      contextRef: offer.id, inputSummary: `player ${offer.player_id} missing`,
      actions: { kind: "reject", reason: "player_missing", decidedBy: "guard" }, executed, error: res && !res.ok ? res.error : null,
      sale: { by: "guard", trace: NO_TRACE },
    });
    return true;
  }
  const mv = playerValue(player);
  // Hráči, na které už běží protinávrh AI, se počítají jako prodaní: kupující je může přijmout
  // kdykoli a všechny najednou. Hráč půjčený jinam (odkup z hostování) se posoudí na své soupisce.
  const committed = await loadCommittedPlayerIds(db, club.teamId, offer.id);
  const inSquad = club.members.some((m) => m.id === player.id);
  const analysis = inSquad && ![...committed].some((id) => id !== player.id && club.members.some((m) => m.id === id))
    ? club.analysis
    : analyzeSquad(squadForSale(club.members, player, club.teamId, committed), club.profile);
  const importance = analysis.importanceOf(player.id);
  // Prostředky výměny se ocení až nad kádrem po odečtení protinávrhů, ať „užitečný“ sedí.
  ctx.swapValues.clear();
  const swap = await swapValueOf(ctx, offer.id, analysis);
  const block = analysis.sellBlock(player.id, swap.incoming);
  const costs = await loadSaleCosts(db, club.teamId, player.id, swap.marketValue);
  const history = await negotiationHistory(ctx, { playerId: player.id, buyerClubTeamId, currentOfferId: offer.id, analysis, costs });
  const listing = await db.prepare("SELECT asking_price FROM transfer_listings WHERE player_id = ? AND team_id = ? AND status = 'active'")
    .bind(player.id, club.teamId).first<{ asking_price: number }>()
    .catch((e) => { logger.warn({ module: M }, `inzerát hráče ${player.id}`, e); return null; });

  const input: SellerDecisionInput = {
    offerId: offer.id,
    offerType: offer.offer_type === "loan" ? "loan" : "transfer",
    terms: termsOf(offer, currentAmount(offer)),
    loanDays: offer.loan_duration,
    marketValue: mv,
    age: player.age,
    importance,
    block,
    profile: club.profile,
    playerId: player.id,
    now: ctx.now,
    swapValue: swap.value,
    virtualBuyer: buyerClubTeamId === "virtual_ai",
    previousAsks: history.previousAsks,
    previousBids: history.previousBids,
    priorBreakOffs: history.priorBreakOffs,
    overDealLimit: club.overDealLimit,
    listedPrice: listing?.asking_price ?? null,
    saleCosts: costs,
  };
  const sale = await decideSale(ctx, input, { player, analysis, buyerClubTeamId, offerId: offer.id });
  const result = await executeSellerDecision(ctx, offer, sale.decision, swap.value, costs);
  if (result.executed === "accepted" && importance === "key" && offer.offer_type !== "loan") await planReplacement(ctx, player);
  await log(ctx, {
    contextRef: offer.id,
    inputSummary: summarizeSeller(player, importance, sale.decision, offer),
    actions: saleActions(sale), executed: result.executed, error: result.error, sale,
  });
  return true;
}

/** Poplatek, který AI nejvýš zaplatí za hostování (10 % tržní hodnoty měsíčně podle potřeby). */
function maxLoanFee(mv: number, days: number, need: number, spendable: number): number {
  return Math.min(spendable, ceil100(mv * 0.1 * Math.max(1, days / 30) * (0.5 + need)));
}

/** AI klub je kupující a prodávající mu poslal protinávrh. */
async function replyAsBuyer(ctx: RunContext, offer: OfferRow, sellerClubTeamId: string): Promise<boolean> {
  const db = ctx.env.DB;
  const { club } = ctx;
  const player = await loadPlayer(db, offer.player_id);
  const execute = async (kind: "accept" | "counter" | "withdraw", terms?: TransferTerms): Promise<{ executed: string; error?: string }> => {
    if (ctx.mode === "shadow") return { executed: "shadow" };
    const withdrawAfter = async (res: { status: number; error: string }, what: string) => {
      const outcome = failureOutcome(res);
      if (outcome === "retry") throw new RetryLaterError(`${what}: ${res.error}`);
      if (outcome === "settled") return { executed: `${what}_settled_meanwhile`, error: res.error };
      const w = await withdrawTransferOffer(ctx.env, club.teamId, offer.id);
      return { executed: w.ok ? `withdrawn_after_failed_${what}` : "failed", error: res.error };
    };
    if (kind === "accept") {
      const res = await acceptTransferOffer(ctx.env, club.teamId, offer.id);
      return res.ok ? { executed: "accepted" } : withdrawAfter(res, "accept");
    }
    if (kind === "counter" && terms) {
      const res = await counterTransferOffer(ctx.env, club.teamId, offer.id, { ...terms });
      return res.ok ? { executed: "countered" } : withdrawAfter(res, "counter");
    }
    const w = await withdrawTransferOffer(ctx.env, club.teamId, offer.id);
    if (w.ok) return { executed: "withdrawn" };
    if (failureOutcome(w) === "retry") throw new RetryLaterError(`withdraw: ${w.error}`);
    return { executed: "failed", error: w.error };
  };

  if (!player || club.analysis.seniorOwnCount + 1 > MAX_SQUAD) {
    const result = await execute("withdraw");
    await log(ctx, { contextRef: offer.id, inputSummary: `buy ${offer.player_id}: no longer possible`, actions: { kind: "withdraw", reason: player ? "squad_full" : "player_missing" }, executed: result.executed, error: result.error });
    return true;
  }
  const mv = playerValue(player);
  const need = club.analysis.needs.find((n) => n.position === player.position)?.need ?? 0.3;
  const amount = currentAmount(offer);

  if (offer.offer_type === "loan") {
    const maxFee = maxLoanFee(mv, offer.loan_duration ?? 30, need, club.spendable);
    const kind = amount <= maxFee ? "accept" : "withdraw";
    const result = await execute(kind);
    await log(ctx, {
      contextRef: offer.id, inputSummary: `loan ${player.position} ${player.overall_rating} fee=${amount} max=${maxFee}`,
      actions: { kind, reason: kind === "accept" ? "fee_within_max" : "fee_too_high" }, executed: result.executed, error: result.error,
    });
    return true;
  }

  // Meziligový poplatek platí kupující navíc: strop ceny se o něj sníží.
  const { computeTransferLevies } = await import("../competition/transfer-levy");
  const sellerLeague = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(player.loan_from_team_id ?? player.team_id)
    .first<{ league_id: string | null }>().catch((e) => { logger.warn({ module: M }, `liga prodávajícího ${sellerClubTeamId}`, e); return null; });
  const levies = await computeTransferLevies(db, { buyerLeagueId: club.leagueId, sellerLeagueId: sellerLeague?.league_id, amount: 100_000, isLoan: false })
    .catch((e) => { logger.warn({ module: M }, "poplatky z přestupu pro strop ceny", e); return null; });
  const feeShare = levies ? levies.adminFee / 100_000 : 0;
  const maxPrice = Math.floor(maxBuyPrice({
    marketValue: mv, need, profile: club.profile, playerId: player.id, now: ctx.now, spendable: club.spendable,
  }) / (1 + feeShare) / 100) * 100;

  const events = await db.prepare(
    `SELECT e.event_type, e.amount FROM transfer_offer_events e LEFT JOIN teams t ON t.id = e.team_id
      WHERE e.offer_id = ? AND COALESCE(t.parent_team_id, t.id, e.team_id) = ? ORDER BY julianday(e.created_at), e.rowid`,
  ).bind(offer.id, club.teamId).all<{ event_type: string; amount: number | null }>();
  const own = events.results.filter((e) => e.event_type === "offer" || e.event_type === "counter");
  const lastOwnBid = own.length > 0 ? (own[own.length - 1].amount ?? 0) : offer.offer_amount;
  const rounds = events.results.filter((e) => e.event_type === "counter").length;

  const decision = decideBuyerReply({
    terms: termsOf(offer, amount), marketValue: mv, maxPrice, lastOwnBid, rounds, profile: club.profile,
  });
  const result = await execute(decision.kind, decision.kind === "counter" ? decision.terms : undefined);
  await log(ctx, {
    contextRef: offer.id,
    inputSummary: `buy ${player.position} ${player.overall_rating} age ${player.age} from ${sellerClubTeamId}: cost=${decision.cost} max=${maxPrice} last=${lastOwnBid}`,
    actions: decision, executed: result.executed, error: result.error,
  });
  return true;
}

/** Staré příhozy (`transfer_bids`) na inzeráty AI klubu: posoudí se jako nabídka hotově. */
async function replyToLegacyBids(ctx: RunContext, budget: { left: number }): Promise<number> {
  const db = ctx.env.DB;
  const { club } = ctx;
  const rows = await db.prepare(
    `SELECT tb.id, tb.team_id AS buyer_team_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status, tb.created_at,
            tl.player_id, tl.asking_price
       FROM transfer_bids tb JOIN transfer_listings tl ON tl.id = tb.listing_id
      WHERE tl.team_id = ? AND tl.status = 'active' AND tb.status IN ('pending', 'countered')
        AND (tb.last_action_by IS NULL OR tb.last_action_by != ?)
      ORDER BY tb.created_at LIMIT 10`,
  ).bind(club.teamId, club.teamId).all<{
    id: string; buyer_team_id: string; amount: number; counter_amount: number | null; last_action_by: string | null; status: string;
    created_at: string; player_id: string; asking_price: number;
  }>().catch((e) => { logger.warn({ module: M }, "staré příhozy na inzeráty AI klubu", e); return { results: [] }; });

  let handled = 0;
  for (const bid of rows.results) {
    if (budget.left <= 0) break;
    const created = parseDbTime(bid.created_at) ?? ctx.now;
    if (ctx.now < replyDueAt(created, null, replyDelayHours(`bid|${bid.id}|${bid.status}`, club.profile))) continue;
    if (!(await claimCoachTask(db, club.teamId, claimTask(ctx.mode, `transfer_bid:${bid.id}`), `${bid.status}|${bid.counter_amount ?? bid.amount}`))) continue;
    const player = await loadPlayer(db, bid.player_id);
    if (!player) continue;
    const mv = playerValue(player);
    const amount = bid.counter_amount ?? bid.amount;
    const committed = await loadCommittedPlayerIds(db, club.teamId, bid.id);
    const analysis = analyzeSquad(squadForSale(club.members, player, club.teamId, committed), club.profile);
    const costs = await loadSaleCosts(db, club.teamId, player.id, 0);
    const input: SellerDecisionInput = {
      offerId: bid.id, offerType: "transfer", terms: { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 },
      marketValue: mv, age: player.age, importance: analysis.importanceOf(player.id), block: analysis.sellBlock(player.id),
      profile: club.profile, playerId: player.id, now: ctx.now, swapValue: 0, virtualBuyer: false,
      previousAsks: bid.last_action_by === club.teamId && bid.counter_amount ? [bid.counter_amount] : [],
      previousBids: [], priorBreakOffs: 0, overDealLimit: club.overDealLimit, listedPrice: bid.asking_price, saleCosts: costs,
    };
    const sale = await decideSale(ctx, input, { player, analysis, buyerClubTeamId: bid.buyer_team_id, offerId: null });
    const decision = sale.decision;
    let executed = "shadow";
    let error: string | undefined;
    if (ctx.mode !== "shadow") {
      const res = decision.kind === "accept" ? await acceptListingBid(ctx.env, club.teamId, bid.id)
        : decision.kind === "counter" ? await counterListingBid(ctx.env, club.teamId, bid.id, { amount: decision.terms.amount })
        : await rejectListingBid(ctx.env, club.teamId, bid.id);
      executed = res.ok ? decision.kind : "failed";
      if (!res.ok) {
        error = res.error;
        if (decision.kind !== "reject") await rejectListingBid(ctx.env, club.teamId, bid.id);
      }
    }
    await log(ctx, {
      contextRef: bid.id, inputSummary: `legacy bid ${amount} on ${player.position} ${player.overall_rating}`,
      actions: saleActions(sale), executed, error, sale,
    });
    handled++;
    budget.left--;
  }
  return handled;
}

const PITCH_ACCEPT_REPLIES = [
  "Díky, {player} nás zajímá. Nabídku jsme vám poslali.",
  "Tohle by mohlo sedět. Na hráče {player} jsme vám poslali nabídku.",
];
const PITCH_DECLINE_REPLIES = [
  "Díky za tip, ale {player} není hráč, kterého teď hledáme.",
  "Za nabídku díky, na tohle místo chceme jiného hráče.",
];

function pickReply(pool: string[], key: string, playerName: string): string {
  return pool[Math.floor(stableUnit(key) * pool.length) % pool.length].replace("{player}", playerName);
}

/** Hráči, které kluby nabídly k poptávkám AI klubu: AI pošle nabídku, nebo slušně odmítne. */
async function replyToDemandPitches(ctx: RunContext, budget: { left: number }): Promise<number> {
  const db = ctx.env.DB;
  const { club } = ctx;
  const rows = await db.prepare(
    `SELECT dp.id, dp.player_id, dp.team_id AS pitching_team_id, dp.created_at, d.id AS demand_id, d.position, d.age_min, d.age_max,
            d.min_rating, d.max_price
       FROM transfer_demand_pitches dp JOIN transfer_demands d ON d.id = dp.demand_id
      WHERE d.team_id = ? AND d.status = 'active' AND dp.status = 'pitched'
      ORDER BY dp.created_at LIMIT 10`,
  ).bind(club.teamId).all<{
    id: string; player_id: string; pitching_team_id: string; created_at: string; demand_id: string; position: string;
    age_min: number; age_max: number; min_rating: number | null; max_price: number | null;
  }>().catch((e) => { logger.warn({ module: M }, "nabídnutí hráči k poptávkám AI klubu", e); return { results: [] }; });

  let handled = 0;
  for (const pitch of rows.results) {
    if (budget.left <= 0) break;
    const created = parseDbTime(pitch.created_at) ?? ctx.now;
    if (ctx.now < replyDueAt(created, null, replyDelayHours(`pitch|${pitch.id}`, club.profile))) continue;
    // Nabídka na nabídnutého hráče je vlastní obchod: nad limitem obchodů AI počká.
    if (!canOpenDeal(club, await openOutgoingOffers(db, club.teamId))) break;
    if (!(await claimCoachTask(db, club.teamId, claimTask(ctx.mode, `transfer_pitch:${pitch.id}`), "reply"))) continue;

    const player = await loadPlayer(db, pitch.player_id);
    const playerName = player ? `${player.first_name} ${player.last_name}` : "hráč";
    const stillThere = player && !player.loan_from_team_id && (player.status == null || player.status === "active")
      && (await resolveClubTeamId(db, player.team_id)) === pitch.pitching_team_id;
    const fits = !!player && stillThere && player.position === pitch.position
      && player.age >= pitch.age_min && player.age <= pitch.age_max
      && player.overall_rating >= (pitch.min_rating ?? 0);

    let offerId: string | null = null;
    let error: string | null = null;
    let amount = 0;
    if (fits && player) {
      const mv = playerValue(player);
      const need = club.analysis.needs.find((n) => n.position === player.position)?.need ?? 0.4;
      const maxPrice = Math.min(pitch.max_price ?? Number.POSITIVE_INFINITY, maxBuyPrice({
        marketValue: mv, need, profile: club.profile, playerId: player.id, now: ctx.now, spendable: club.spendable,
      }));
      amount = openingBid(maxPrice, mv, club.profile, player.id, ctx.now);
      // Na hráče, na kterého nemá, AI neposílá urážlivou nabídku: radši slušně odmítne.
      if (amount > maxPrice || maxPrice < 500 || maxPrice < mv * 0.9) {
        error = "too_expensive";
      } else if (ctx.mode !== "shadow") {
        const res = await createTransferOffer(ctx.env, club.teamId, { playerId: player.id, amount });
        if (res.ok) offerId = res.offerId;
        else error = res.error;
      }
    }
    const accepted = fits && !error;
    if (ctx.mode !== "shadow" && (accepted ? offerId : true)) {
      const reply = accepted
        ? pickReply(PITCH_ACCEPT_REPLIES, `pitch-accept|${pitch.id}`, playerName)
        : pickReply(PITCH_DECLINE_REPLIES, `pitch-decline|${pitch.id}`, playerName);
      await db.prepare("UPDATE transfer_demand_pitches SET status = ?, reply = ?, offer_id = ? WHERE id = ? AND status = 'pitched'")
        .bind(accepted ? "accepted" : "declined", reply, offerId, pitch.id).run()
        .catch((e) => logger.warn({ module: M }, `odpověď na nabídnutého hráče ${pitch.id}`, e));
    }
    await log(ctx, {
      contextRef: pitch.id,
      inputSummary: `pitch ${player?.position ?? "?"} ${player?.overall_rating ?? "?"} for demand ${pitch.demand_id}: fits=${fits} amount=${amount}`,
      actions: { kind: accepted ? "offer" : "decline", amount },
      executed: ctx.mode === "shadow" ? "shadow" : accepted ? "offered" : "declined",
      error,
    });
    handled++;
    budget.left--;
  }
  return handled;
}

/**
 * Odpovědi AI klubu `teamId` (A-tým) na všechna jednání, ve kterých je na tahu a kde už
 * uplynula lidská prodleva. Vrací počet vyřízených odpovědí.
 *
 * Režim přepínače `market`: `on` o nabídkách na hráče AI klubu rozhoduje model (při výpadku
 * náhradní pravidlo) a provede se, `shadow` rozhodne stejně, ale jen zapíše deník, `off`
 * rozhoduje jen náhradní pravidlo a provede se. Binding AI se bere z `env`.
 */
export async function replyToTransferOffers(env: Bindings, teamId: string, now: Date = new Date(), profileArg?: AiCoachProfile): Promise<number> {
  const db = env.DB;
  // Hodinová úloha běží u každého AI klubu: bez rozjednaných věcí se kádr ani nenačítá.
  if (!(await hasOpenNegotiations(db, teamId))) return 0;
  const mode = await readCoachMode(env.CACHE_KV, "market");
  const profile = profileArg ?? await ensureAiProfile(db, teamId);
  let club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return 0;
  const ctx: RunContext = { env, mode, now, club, swapValues: new Map(), modelDeadline: Date.now() + MODEL_BUDGET_MS };
  const budget = { left: MAX_REPLIES_PER_RUN };

  const offers = await db.prepare(
    `SELECT * FROM transfer_offers
      WHERE status IN ('pending', 'countered')
        AND (to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
          OR from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?))
      ORDER BY julianday(created_at) LIMIT 60`,
  ).bind(teamId, teamId, teamId, teamId).all<OfferRow>();

  let handled = 0;
  for (const offer of offers.results) {
    if (budget.left <= 0) break;
    const scope = await resolveOfferClubScope(db, teamId, offer);
    if (!scope?.role || !scope.onTurn) continue;
    const expiresAt = parseDbTime(offer.expires_at);
    // Propadlou nabídku uzavře denní tick, odpovídat už nejde.
    if (expiresAt && expiresAt <= now) continue;
    const last = await lastAction(db, offer, now);
    const due = replyDueAt(last.at, expiresAt, replyDelayHours(`${offer.id}|${last.key}`, profile));
    if (now < due) continue;

    const task = claimTask(mode, `transfer_reply:${offer.id}`);
    const claimKey = last.key;
    if (!(await claimCoachTask(db, teamId, task, claimKey))) continue;
    try {
      const done = scope.role === "seller"
        ? await replyAsSeller(ctx, offer, scope.buyerClubTeamId)
        : await replyAsBuyer(ctx, offer, scope.sellerClubTeamId);
      if (done) {
        handled++;
        budget.left--;
        // Obchod mohl změnit kádr i peníze: další rozhodnutí počítají s novým stavem.
        const fresh = await loadAiClubState(db, teamId, profile, now);
        if (fresh) { club = fresh; ctx.club = fresh; ctx.swapValues.clear(); }
      }
    } catch (e) {
      logger.error({ module: M }, `odpověď AI klubu ${teamId} na nabídku ${offer.id}`, e);
      await releaseCoachTask(db, teamId, task, claimKey);
    }
  }

  handled += await replyToLegacyBids(ctx, budget);
  handled += await replyToDemandPitches(ctx, budget);
  return handled;
}

/** Má klub rozjednanou nabídku, příhoz nebo nabídnutého hráče? Při chybě čtení raději ano. */
async function hasOpenNegotiations(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM transfer_offers
         WHERE status IN ('pending', 'countered')
           AND (to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
             OR from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)))
     + (SELECT COUNT(*) FROM transfer_demand_pitches dp JOIN transfer_demands d ON d.id = dp.demand_id
         WHERE d.team_id = ? AND d.status = 'active' AND dp.status = 'pitched')
     + (SELECT COUNT(*) FROM transfer_bids tb JOIN transfer_listings tl ON tl.id = tb.listing_id
         WHERE tl.team_id = ? AND tl.status = 'active' AND tb.status IN ('pending', 'countered')) AS n`,
  ).bind(teamId, teamId, teamId, teamId, teamId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `rozjednané přestupy ${teamId}`, e); return { n: 1 }; });
  return (row?.n ?? 0) > 0;
}

/** Hodinová část AI trenéra: odpovědi na nabídky, protinávrhy a nabídnuté hráče. */
export const transferRepliesHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  await replyToTransferOffers(env, teamId, now, profile);
};

/** Kolik vlastních nabídek má AI klub rozjetých (pro limit podle obchodní aktivity). */
export async function openOutgoingOffers(db: D1Database, clubTeamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM transfer_offers
      WHERE status IN ('pending', 'countered') AND from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
  ).bind(clubTeamId, clubTeamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `rozjeté nabídky ${clubTeamId}`, e); return null; });
  return row?.n ?? 0;
}

/** Smí AI klub rozjet další vlastní obchod? */
export function canOpenDeal(club: AiClubState, openOffers: number): boolean {
  return !club.overDealLimit && openOffers < openDealLimit(club.profile);
}
