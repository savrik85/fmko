/**
 * Nákup od klubu mimo hru (spec 3.7): AI klub jedná stejnou službou jako člověk
 * (`startAiNegotiation`, `counterAiNegotiation`, `signAiNegotiation` v transfers/ai-negotiation.ts).
 *
 * Zdrojem je inzerát klubu mimo hru na trhu své ligy, nebo hlášení vlastního skauta. U inzerátu
 * vidí AI totéž co člověk (hodnocení z inzerátu), u hlášení jen zamlžený odhad: bere jeho střed,
 * ne skutečnou hodnotu hráče. Strop ceny počítá kód (`maxBuyPrice`), AI nad něj nikdy nejde.
 *
 * Na protinávrh klubu rozhodne model (buy-model.ts): podepsat do stropu, přihodit v mezích
 * (víc než minule, méně než klub chce, nejvýš strop, nejvýš dvakrát), nebo odejít. Bez modelu
 * platí pravidlo: protinávrh do stropu podepíše, nad strop jednou nabídne strop, jinak odejde.
 *
 * Skauta pošle AI na úkol sama, když má skauta bez práce a v kádru díru (nebo pondělní kurz
 * „kupovat“), stejným zadáním jako člověk (`createScoutAssignment`, platí se cestovné).
 */

import {
  marketValue, SCOUT_AGE_MAX, SCOUT_AGE_MIN, SCOUT_POSITIONS, SCOUT_RADIUS_TIERS, scoutWeeklyCost, type TransferTerms,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import {
  counterAiNegotiation, signAiNegotiation, startAiNegotiation, withdrawAiNegotiation,
} from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { createScoutAssignment, loadActiveAssignment, loadTeamScouts } from "../scouting/scout-work";
import {
  buyNegotiationBounds, CASH_TERMS,
  type BuyNegotiationContext, type BuyNegotiationDecision, type NegotiationBounds,
} from "./buy-decision";
import { decideBuyNegotiation, logNegotiationDecision, type ModelUse } from "./buy-model";
import type { DecisionMode } from "./decision-log";
import type { AiClubState } from "./transfer-club";

const M = "ai-outside-buy";
/** Kolikrát AI v jednání nejvýš přihodí (pravidlo jednou, na svůj strop). */
export const MAX_OUTSIDE_COUNTERS = 2;

export interface OutsideCandidate {
  source: "listing" | "scout_report";
  sourceId: string;
  position: string;
  age: number;
  /** Hodnocení, jak ho vidí i člověk: z inzerátu, u hlášení střed odhadu skauta. */
  rating: number;
  /** Hlášení skauta: rozsah odhadu, jak ho vidí i člověk (u inzerátu null). */
  ratingRange: { lo: number; hi: number } | null;
  /** Cena z inzerátu, u hlášení skautův odhad ceny (může chybět). */
  askingPrice: number | null;
}

export type OutsideBuyResult =
  | { result: "signed"; amount: number }
  | { result: "refused" | "broken_off" | "too_expensive" | "failed"; detail: string };

/** Inzerát klubu mimo hru (řádek z `findVisibleListings`) jako kandidát. */
export function outsideCandidateFromListing(l: Record<string, unknown>): OutsideCandidate | null {
  if (!l.is_ai_listing || typeof l.id !== "string") return null;
  let player: Partial<VirtualPlayerData> | null = null;
  try {
    player = JSON.parse(String(l.ai_player_data ?? "null")) as Partial<VirtualPlayerData> | null;
  } catch (e) {
    logger.warn({ module: M }, `inzerát ${l.id}: nečitelná data hráče`, e);
    return null;
  }
  if (!player || typeof player.position !== "string" || typeof player.overallRating !== "number" || typeof player.age !== "number") return null;
  return {
    source: "listing", sourceId: l.id, position: player.position, age: player.age, rating: player.overallRating,
    ratingRange: null, askingPrice: Number(l.asking_price) || null,
  };
}

/** Platná hlášení vlastního skauta o hráčích klubů mimo hru. */
export async function loadScoutReportCandidates(db: D1Database, teamId: string, now: Date): Promise<OutsideCandidate[]> {
  const rows = await db.prepare(
    `SELECT id, position, age, rating_lo, rating_hi, ask_hint FROM scout_reports
      WHERE team_id = ? AND status = 'active' AND source = 'village_club' AND expires_at > ?`,
  ).bind(teamId, now.toISOString()).all<{ id: string; position: string | null; age: number | null; rating_lo: number | null; rating_hi: number | null; ask_hint: number | null }>()
    .catch((e) => {
      logger.warn({ module: M }, `hlášení skauta klubu ${teamId}`, e);
      return { results: [] as Array<{ id: string; position: string | null; age: number | null; rating_lo: number | null; rating_hi: number | null; ask_hint: number | null }> };
    });
  const out: OutsideCandidate[] = [];
  for (const r of rows.results) {
    if (!r.position || r.age === null || r.rating_lo === null || r.rating_hi === null) continue;
    out.push({
      source: "scout_report", sourceId: r.id, position: r.position, age: r.age,
      rating: Math.round((r.rating_lo + r.rating_hi) / 2), ratingRange: { lo: r.rating_lo, hi: r.rating_hi },
      askingPrice: r.ask_hint && r.ask_hint > 0 ? r.ask_hint : null,
    });
  }
  return out;
}

function cash(amount: number): TransferTerms {
  return { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 };
}

/**
 * Pravidlo bez modelu: protinávrh klubu do stropu podepsat, nad strop jednou nabídnout svůj
 * strop, a když už strop padl (nebo protinávrhy došly), odejít.
 */
export function outsideRuleDecision(input: { ask: number; maxPrice: number; lastOwnBid: number; bounds: NegotiationBounds }): BuyNegotiationDecision {
  if (input.bounds.canAccept) return { kind: "accept", reason: "within_max" };
  if (input.lastOwnBid < input.maxPrice && input.bounds.counter && input.maxPrice <= input.bounds.counter.max) {
    return { kind: "counter", amount: input.maxPrice, reason: "offer_max" };
  }
  return { kind: "withdraw", reason: "too_expensive" };
}

export interface OutsideNegotiationOptions extends ModelUse {
  /** Režim přepínače `market` pro deník (jednání běží jen v `on` a `off`, nanečisto se nejedná). */
  mode?: DecisionMode;
}

/**
 * Jednání s klubem mimo hru do stropu `maxPrice`. Odpověď klubu přijde hned (deliverNow),
 * takže celé jednání proběhne v jednom běhu trhu. Na každý protinávrh klubu rozhodne model
 * v mezích kódu (bez modelu pravidlo), každý tah se zapíše do deníku (`transfer_negotiation`).
 */
export async function negotiateOutsidePurchase(
  db: D1Database, club: Pick<AiClubState, "teamId" | "name" | "profile" | "spendable">, cand: OutsideCandidate,
  opening: number, maxPrice: number, now: Date, opts: OutsideNegotiationOptions = { useModel: false },
): Promise<OutsideBuyResult> {
  const buyer = club.teamId;
  const start = await startAiNegotiation(db, { buyerClubTeamId: buyer, source: cand.source, sourceId: cand.sourceId, terms: cash(opening), now });
  if (!start.ok) return { result: "failed", detail: start.error };
  if (start.existing) return { result: "failed", detail: "o hráče už jednání běží" };
  const negotiationId = start.negotiationId;
  const mode = opts.mode ?? "on";
  const player = {
    position: cand.position, age: cand.age, rating: cand.rating, ratingRange: cand.ratingRange,
    estimatedValue: marketValue(cand.rating, cand.age, cand.position),
  };
  const bids = [opening];

  const sign = async (amount: number): Promise<OutsideBuyResult> => {
    const signed = await signAiNegotiation(db, undefined, { negotiationId, buyerClubTeamId: buyer, now });
    if (!signed.ok) return { result: "failed", detail: signed.error };
    if (signed.signed) return { result: "signed", amount };
    return { result: "refused", detail: signed.explanation };
  };
  const withdraw = async (): Promise<void> => {
    const w = await withdrawAiNegotiation(db, { negotiationId, buyerClubTeamId: buyer, now });
    if (!w.ok) logger.warn({ module: M, teamId: buyer }, `stažení jednání ${negotiationId}: ${w.error}`);
  };

  for (let round = 0; round <= MAX_OUTSIDE_COUNTERS; round++) {
    const row = await db.prepare(
      "SELECT status, last_action_by, pending_reply, amount FROM ai_negotiations WHERE id = ?",
    ).bind(negotiationId).first<{ status: string; last_action_by: string; pending_reply: string | null; amount: number }>();
    if (!row) return { result: "failed", detail: "jednání zmizelo" };
    // Klub kývl na vlastní návrh AI: podpis (rozhodne ještě hráč).
    if (row.status === "agreed") return sign(row.amount);
    const clubAnswered = row.status === "open" && row.last_action_by === "club" && !row.pending_reply;
    if (!clubAnswered) return { result: row.status === "broken_off" ? "broken_off" : "failed", detail: `jednání ${row.status}` };

    // Klub chce víc: podepsat, přihodit, nebo odejít. Meze počítá kód, vybírá model.
    const lastOwnBid = bids[bids.length - 1];
    const bounds = buyNegotiationBounds({
      ask: row.amount, sellOnPct: 0, maxPrice, lastOwnBid, countersLeft: MAX_OUTSIDE_COUNTERS - (bids.length - 1),
    });
    const ctx: BuyNegotiationContext = {
      ...bounds, teamName: club.name, profile: club.profile, spendable: club.spendable, player, seller: "outside",
      listedPrice: cand.source === "listing" ? cand.askingPrice : null, ownBids: [...bids], ask: row.amount, askTerms: CASH_TERMS,
      maxPrice, countersLeft: MAX_OUTSIDE_COUNTERS - (bids.length - 1),
    };
    const outcome = await decideBuyNegotiation(ctx, () => outsideRuleDecision({ ask: row.amount, maxPrice, lastOwnBid, bounds }), opts);
    const d = outcome.decision;
    const log = (executed: unknown) => logNegotiationDecision(db, { teamId: buyer, mode, contextRef: negotiationId, ctx, outcome, executed });

    if (d.kind === "accept") {
      const res = await sign(row.amount);
      await log(res);
      return res;
    }
    if (d.kind === "withdraw") {
      await withdraw();
      await log({ result: "withdrawn" });
      return { result: "too_expensive", detail: `klub chce ${row.amount}, strop ${maxPrice}` };
    }
    const counter = await counterAiNegotiation(db, { negotiationId, buyerClubTeamId: buyer, terms: cash(d.amount), now });
    await log(counter.ok ? { result: "countered", amount: d.amount } : { result: "failed", error: counter.error });
    if (!counter.ok) {
      await withdraw();
      return { result: "failed", detail: counter.error };
    }
    bids.push(d.amount);
  }
  return { result: "failed", detail: "jednání se nedokončilo" };
}

/** Okruh podle povahy: ambiciózní jezdí dál, šetrný jen po okolí (cestovné za týden). */
export function scoutRadiusFor(profile: AiClubState["profile"]): 15 | 30 | 50 {
  if (profile.thrift >= 70) return 15;
  if (profile.ambition >= 70) return 50;
  return 30;
}

/** Věk hledaného hráče: mládežník hledá do 21 let (skaut pak hlásí podle potenciálu). */
export function scoutAgesFor(profile: AiClubState["profile"]): { ageMin: number; ageMax: number } {
  return profile.youthFocus >= 65
    ? { ageMin: Math.max(SCOUT_AGE_MIN, 17), ageMax: 21 }
    : { ageMin: Math.max(SCOUT_AGE_MIN, 19), ageMax: Math.min(SCOUT_AGE_MAX, 31) };
}

/** Jak dlouho skaut AI klubu na úkolu jezdí (týdny, cestovné se platí každý týden). */
export const SCOUT_TASK_WEEKS = 2;

export interface ScoutSituation {
  /** Skaut bez úkolu (první podle nástupu), nebo null. */
  freeScoutId: string | null;
  /** Posty, které už některý skaut hledá: druhého na totéž AI neposílá. */
  busy: Set<string>;
}

/** Skauti klubu: kdo je bez úkolu a na které posty už někdo jede. */
export async function loadScoutSituation(db: D1Database, teamId: string): Promise<{ ok: true; situation: ScoutSituation } | { ok: false; reason: string }> {
  const scouts = await loadTeamScouts(db, teamId);
  if (scouts.length === 0) return { ok: false, reason: "bez skauta" };
  let freeScoutId: string | null = null;
  const busy = new Set<string>();
  for (const s of scouts) {
    const active = await loadActiveAssignment(db, teamId, s.id)
      .catch((e) => { logger.warn({ module: M, teamId }, "úkol skauta", e); return undefined; });
    if (active === undefined) return { ok: false, reason: "úkoly skautů nejdou načíst" };
    if (!active) {
      if (!freeScoutId) freeScoutId = s.id;
      continue;
    }
    if (active.position) busy.add(active.position);
    for (const p of SCOUT_POSITIONS) if ((active.positions ?? "").includes(`"${p}"`)) busy.add(p);
  }
  return { ok: true, situation: { freeScoutId, busy } };
}

/** Okruhy, na jejichž cestovné za celý úkol stačí peníze nad rezervou. */
export function affordableScoutRadii(spendable: number, weeks = SCOUT_TASK_WEEKS): Array<{ km: number; weeklyCost: number }> {
  return SCOUT_RADIUS_TIERS.filter((t) => spendable >= t.weeklyCost * weeks).map((t) => ({ km: t.km, weeklyCost: t.weeklyCost }));
}

/** Pošle skauta na úkol stejným zadáním jako člověk (`createScoutAssignment`). */
export async function startScoutTask(
  db: D1Database, teamId: string, scoutId: string,
  task: { position: string; radiusKm: number; ageMin: number; ageMax: number }, gameDate: string,
): Promise<{ started: true; position: string; radiusKm: number } | { started: false; reason: string }> {
  const res = await createScoutAssignment(db, {
    teamId, staffId: scoutId, positions: [task.position], ageMin: task.ageMin, ageMax: task.ageMax,
    radiusKm: task.radiusKm, weeks: SCOUT_TASK_WEEKS, gameDate,
  });
  if (!res.ok) return { started: false, reason: res.error };
  return { started: true, position: task.position, radiusKm: task.radiusKm };
}

/**
 * Pravidlo bez modelu: skaut bez práce dostane úkol na post, kde klub hledá posilu, okruh a věk
 * podle povahy. Dva týdny, cestovné musí pokrýt peníze nad rezervou. Vrací post, na který skaut
 * vyjel, nebo důvod, proč ne.
 */
export async function maybeStartScoutTask(
  db: D1Database, club: Pick<AiClubState, "teamId" | "profile" | "spendable">, position: string, gameDate: string,
): Promise<{ started: true; position: string; radiusKm: number } | { started: false; reason: string }> {
  const loaded = await loadScoutSituation(db, club.teamId);
  if (!loaded.ok) return { started: false, reason: loaded.reason };
  if (loaded.situation.busy.has(position)) return { started: false, reason: "skaut už post hledá" };
  const scoutId = loaded.situation.freeScoutId;
  if (!scoutId) return { started: false, reason: "všichni skauti pracují" };
  const radiusKm = scoutRadiusFor(club.profile);
  const weeklyCost = scoutWeeklyCost(radiusKm) ?? 0;
  if (club.spendable < weeklyCost * SCOUT_TASK_WEEKS) return { started: false, reason: "na cestovné nejsou peníze nad rezervou" };
  return startScoutTask(db, club.teamId, scoutId, { position, radiusKm, ...scoutAgesFor(club.profile) }, gameDate);
}
