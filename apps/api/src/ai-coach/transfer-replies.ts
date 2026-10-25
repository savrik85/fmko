/**
 * AI trenér odpovídá na přestupová jednání (spec 3.4 a 3.7).
 *
 * - Nabídky a protinávrhy na hráče AI klubu (přestup, výměna, hostování, odkup z hostování,
 *   nabídky klubů mimo hru) a příhozy na inzeráty AI klubu (z inzerátu vzniká běžná nabídka,
 *   staré `transfer_bids` se vyřídí také).
 * - Protinávrhy prodávajících na vlastní nabídky AI klubu.
 * - Hráči, které kluby nabídly k poptávkám AI klubu.
 *
 * Jako člověk: odpoví s prodlevou 1–20 hodin od posledního tahu (vždy do lhůty nabídky),
 * protinávrhem ustupuje podle trpělivosti a urážlivé nabídky odmítá. Ceny počítá vždy kód
 * (`valuation.ts`, `transfer-decision.ts`), provádí je tytéž služby jako u lidí
 * (`services/transfer-actions.ts`), takže platí stejné lhůty, pauzy, limity i peníze.
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
import { readCoachMode } from "./mode";
import { ensureAiProfile, type AiCoachProfile } from "./profile";
import { analyzeSquad, MAX_SQUAD, type SquadAnalysis, type SquadPosition } from "./squad";
import { decideBuyerReply, decideSellerReply, type SellerDecision } from "./transfer-decision";
import { loadAiClubState, parseDbTime, type AiClubState } from "./transfer-club";
import { maxBuyPrice, openDealLimit, openingBid, presentValue, stableUnit, swapPlayerValue } from "./valuation";

const M = "ai-transfer-replies";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

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

interface RunContext {
  env: Bindings;
  mode: DecisionMode;
  now: Date;
  club: AiClubState;
  /** Hodnota hráčů na výměnu podle nabídky (cache v rámci běhu). */
  swapValues: Map<string, { value: number; players: Array<{ position: string; rating: number }> }>;
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

/** Hodnota hráčů na výměnu pro AI klub a jejich posty (pro minimum kádru a náhradu opory). */
async function swapValueOf(ctx: RunContext, offerId: string, analysis: SquadAnalysis): Promise<{ value: number; players: Array<{ position: string; rating: number }> }> {
  const cached = ctx.swapValues.get(offerId);
  if (cached) return cached;
  const rows = await ctx.env.DB.prepare(
    `SELECT p.position, p.overall_rating, p.age FROM transfer_offer_swap_players s JOIN players p ON p.id = s.player_id
      WHERE s.offer_id = ? ORDER BY s.sort_order`,
  ).bind(offerId).all<{ position: string; overall_rating: number; age: number }>();
  let value = 0;
  for (const r of rows.results) {
    value += swapPlayerValue({
      marketValue: marketValue(r.overall_rating, r.age, r.position),
      useful: analysis.isUseful({ position: r.position, rating: r.overall_rating, age: r.age }),
    });
  }
  const out = { value, players: rows.results.map((r) => ({ position: r.position, rating: r.overall_rating })) };
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
  args: { playerId: string; buyerClubTeamId: string; marketValue: number; currentOfferId: string; analysis: SquadAnalysis },
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
    const value = presentValue(termsOf(r, r.amount ?? 0), args.marketValue) + swap.value;
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

async function log(ctx: RunContext, entry: { contextRef: string; inputSummary: string; actions: unknown; executed: unknown; error?: string | null }): Promise<void> {
  await logDecision(ctx.env.DB, {
    teamId: ctx.club.teamId, kind: "transfer_reply", mode: ctx.mode, model: "rules",
    contextRef: entry.contextRef, inputSummary: entry.inputSummary, actions: entry.actions, executed: entry.executed,
    usedFallback: false, error: entry.error ?? null,
  });
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

/** Provede rozhodnutí prodávajícího přes služby. V režimu shadow nic neprovede. */
async function executeSellerDecision(ctx: RunContext, offer: OfferRow, decision: SellerDecision, swapValue: number): Promise<{ executed: string; error?: string }> {
  if (ctx.mode === "shadow") return { executed: "shadow" };
  const { env, club } = ctx;
  if (decision.kind === "accept") {
    const res = await acceptTransferOffer(env, club.teamId, offer.id);
    if (res.ok) return { executed: "accepted" };
    // Přijetí neprošlo (kupující nemá peníze, hráč mezitím odešel): odmítnout, ať nabídka nevisí.
    const rej = await rejectTransferOffer(env, club.teamId, offer.id);
    return { executed: rej.ok ? "rejected_after_failed_accept" : "failed", error: res.error };
  }
  if (decision.kind === "counter") {
    const t = decision.terms;
    const res = await counterTransferOffer(env, club.teamId, offer.id, {
      amount: t.amount, upfrontPct: t.upfrontPct, installments: t.installments, sellOnPct: t.sellOnPct,
    });
    if (res.ok) return { executed: "countered" };
    // Splátky by kupující neutáhl nebo nesedí podmínky: stejná hodnota hotově.
    if (t.installments > 0 || t.sellOnPct > 0) {
      const lump: TransferTerms = { amount: ceil100(Math.max(0, decision.ask - swapValue)), upfrontPct: 100, installments: 0, sellOnPct: 0 };
      if (!transferTermsError(lump) && (lump.amount > 0 || swapValue > 0)) {
        const retry = await counterTransferOffer(env, club.teamId, offer.id, { ...lump });
        if (retry.ok) return { executed: "countered_lump_sum" };
      }
    }
    const rej = await rejectTransferOffer(env, club.teamId, offer.id);
    return { executed: rej.ok ? "rejected_after_failed_counter" : "failed", error: res.error };
  }
  const rej = await rejectTransferOffer(env, club.teamId, offer.id);
  return rej.ok ? { executed: "rejected" } : { executed: "failed", error: rej.error };
}

/** AI klub je prodávající (nebo vlastník hostovaného hráče) a je na tahu. */
async function replyAsSeller(ctx: RunContext, offer: OfferRow, buyerClubTeamId: string): Promise<boolean> {
  const db = ctx.env.DB;
  const { club } = ctx;
  const player = await loadPlayer(db, offer.player_id);
  if (!player) {
    const res = ctx.mode === "shadow" ? null : await rejectTransferOffer(ctx.env, club.teamId, offer.id);
    await log(ctx, { contextRef: offer.id, inputSummary: `player ${offer.player_id} missing`, actions: { kind: "reject", reason: "player_missing" }, executed: res?.ok ? "rejected" : "shadow" });
    return true;
  }
  const mv = playerValue(player);
  // Hráč půjčený jinam (odkup z hostování) v kádru teď není: posoudí se, jako by se vrátil.
  const analysis = club.members.some((m) => m.id === player.id)
    ? club.analysis
    : analyzeSquad([...club.members, {
      id: player.id, position: player.position as SquadPosition, rating: player.overall_rating, age: player.age,
      rosterTeamId: club.teamId, isU21Roster: false, loanedIn: false, injured: false,
    }], club.profile);
  const importance = analysis.importanceOf(player.id);
  const swap = await swapValueOf(ctx, offer.id, analysis);
  const block = analysis.sellBlock(player.id, swap.players);
  const history = await negotiationHistory(ctx, { playerId: player.id, buyerClubTeamId, marketValue: mv, currentOfferId: offer.id, analysis });
  const listing = await db.prepare("SELECT asking_price FROM transfer_listings WHERE player_id = ? AND team_id = ? AND status = 'active'")
    .bind(player.id, club.teamId).first<{ asking_price: number }>()
    .catch((e) => { logger.warn({ module: M }, `inzerát hráče ${player.id}`, e); return null; });

  const decision = decideSellerReply({
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
  });
  const result = await executeSellerDecision(ctx, offer, decision, swap.value);
  if (result.executed === "accepted" && importance === "key" && offer.offer_type !== "loan") await planReplacement(ctx, player);
  await log(ctx, {
    contextRef: offer.id,
    inputSummary: summarizeSeller(player, importance, decision, offer),
    actions: decision, executed: result.executed, error: result.error,
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
    if (kind === "accept") {
      const res = await acceptTransferOffer(ctx.env, club.teamId, offer.id);
      if (res.ok) return { executed: "accepted" };
      const w = await withdrawTransferOffer(ctx.env, club.teamId, offer.id);
      return { executed: w.ok ? "withdrawn_after_failed_accept" : "failed", error: res.error };
    }
    if (kind === "counter" && terms) {
      const res = await counterTransferOffer(ctx.env, club.teamId, offer.id, { ...terms });
      if (res.ok) return { executed: "countered" };
      const w = await withdrawTransferOffer(ctx.env, club.teamId, offer.id);
      return { executed: w.ok ? "withdrawn_after_failed_counter" : "failed", error: res.error };
    }
    const w = await withdrawTransferOffer(ctx.env, club.teamId, offer.id);
    return w.ok ? { executed: "withdrawn" } : { executed: "failed", error: w.error };
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
    const decision = decideSellerReply({
      offerId: bid.id, offerType: "transfer", terms: { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 },
      marketValue: mv, age: player.age, importance: club.analysis.importanceOf(player.id), block: club.analysis.sellBlock(player.id),
      profile: club.profile, playerId: player.id, now: ctx.now, swapValue: 0, virtualBuyer: false,
      previousAsks: bid.last_action_by === club.teamId && bid.counter_amount ? [bid.counter_amount] : [],
      previousBids: [], priorBreakOffs: 0, overDealLimit: club.overDealLimit, listedPrice: bid.asking_price,
    });
    let executed = "shadow";
    let error: string | undefined;
    if (ctx.mode !== "shadow") {
      const res = decision.kind === "accept" ? await acceptListingBid(ctx.env, club.teamId, bid.id)
        : decision.kind === "counter" ? await counterListingBid(ctx.env, club.teamId, bid.id, { amount: ceil100(decision.ask) })
        : await rejectListingBid(ctx.env, club.teamId, bid.id);
      executed = res.ok ? decision.kind : "failed";
      if (!res.ok) {
        error = res.error;
        if (decision.kind !== "reject") await rejectListingBid(ctx.env, club.teamId, bid.id);
      }
    }
    await log(ctx, { contextRef: bid.id, inputSummary: `legacy bid ${amount} on ${player.position} ${player.overall_rating}`, actions: decision, executed, error });
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
 * Režim přepínače `market`: `shadow` jen zapíše deník, `on` i `off` provádějí (rozhodnutí
 * o přestupech dělá vždy kód, model se tu nevolá).
 */
export async function replyToTransferOffers(env: Bindings, teamId: string, now: Date = new Date(), profileArg?: AiCoachProfile): Promise<number> {
  const db = env.DB;
  // Hodinová úloha běží u každého AI klubu: bez rozjednaných věcí se kádr ani nenačítá.
  if (!(await hasOpenNegotiations(db, teamId))) return 0;
  const mode = await readCoachMode(env.CACHE_KV, "market");
  const profile = profileArg ?? await ensureAiProfile(db, teamId);
  let club = await loadAiClubState(db, teamId, profile, now);
  if (!club) return 0;
  const ctx: RunContext = { env, mode, now, club, swapValues: new Map() };
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
