/**
 * Nákup od klubu mimo hru (spec 3.7): AI klub jedná stejnou službou jako člověk
 * (`startAiNegotiation`, `counterAiNegotiation`, `signAiNegotiation` v transfers/ai-negotiation.ts).
 *
 * Zdrojem je inzerát klubu mimo hru na trhu své ligy, nebo hlášení vlastního skauta. U inzerátu
 * vidí AI totéž co člověk (hodnocení z inzerátu), u hlášení jen zamlžený odhad: bere jeho střed,
 * ne skutečnou hodnotu hráče. Strop ceny počítá kód (`maxBuyPrice`), AI nad něj nikdy nejde:
 * protinávrh klubu do stropu podepíše, nad strop jednou nabídne svůj strop a jinak jednání ukončí.
 *
 * Skauta pošle AI na úkol sama, když má skauta bez práce a v kádru díru (nebo pondělní kurz
 * „kupovat“), stejným zadáním jako člověk (`createScoutAssignment`, platí se cestovné).
 */

import { SCOUT_AGE_MAX, SCOUT_AGE_MIN, scoutWeeklyCost, type TransferTerms } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import {
  counterAiNegotiation, signAiNegotiation, startAiNegotiation, withdrawAiNegotiation,
} from "../transfers/ai-negotiation";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { createScoutAssignment, loadActiveAssignment, loadTeamScouts } from "../scouting/scout-work";
import type { AiClubState } from "./transfer-club";

const M = "ai-outside-buy";
/** Kolik kol jednání AI zkusí (úvodní návrh, případně jeden protinávrh na svůj strop). */
const MAX_ROUNDS = 3;

export interface OutsideCandidate {
  source: "listing" | "scout_report";
  sourceId: string;
  position: string;
  age: number;
  /** Hodnocení, jak ho vidí i člověk: z inzerátu, u hlášení střed odhadu skauta. */
  rating: number;
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
    askingPrice: Number(l.asking_price) || null,
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
      rating: Math.round((r.rating_lo + r.rating_hi) / 2), askingPrice: r.ask_hint && r.ask_hint > 0 ? r.ask_hint : null,
    });
  }
  return out;
}

function cash(amount: number): TransferTerms {
  return { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 };
}

/**
 * Jednání s klubem mimo hru do stropu `maxPrice`. Odpověď klubu přijde hned (deliverNow),
 * takže celé jednání proběhne v jednom běhu trhu.
 */
export async function negotiateOutsidePurchase(
  db: D1Database, club: Pick<AiClubState, "teamId">, cand: OutsideCandidate, opening: number, maxPrice: number, now: Date,
): Promise<OutsideBuyResult> {
  const buyer = club.teamId;
  const start = await startAiNegotiation(db, { buyerClubTeamId: buyer, source: cand.source, sourceId: cand.sourceId, terms: cash(opening), now });
  if (!start.ok) return { result: "failed", detail: start.error };
  if (start.existing) return { result: "failed", detail: "o hráče už jednání běží" };
  const negotiationId = start.negotiationId;

  let offeredMax = opening >= maxPrice;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const row = await db.prepare(
      "SELECT status, last_action_by, pending_reply, amount FROM ai_negotiations WHERE id = ?",
    ).bind(negotiationId).first<{ status: string; last_action_by: string; pending_reply: string | null; amount: number }>();
    if (!row) return { result: "failed", detail: "jednání zmizelo" };
    const clubAnswered = row.status === "open" && row.last_action_by === "club" && !row.pending_reply;
    // Souhlas klubu, nebo jeho protinávrh do stropu: podpis (rozhodne ještě hráč).
    if (row.status === "agreed" || (clubAnswered && row.amount <= maxPrice)) {
      const signed = await signAiNegotiation(db, undefined, { negotiationId, buyerClubTeamId: buyer, now });
      if (!signed.ok) return { result: "failed", detail: signed.error };
      if (signed.signed) return { result: "signed", amount: row.amount };
      return { result: "refused", detail: signed.explanation };
    }
    if (!clubAnswered) return { result: row.status === "broken_off" ? "broken_off" : "failed", detail: `jednání ${row.status}` };
    if (offeredMax) {
      const w = await withdrawAiNegotiation(db, { negotiationId, buyerClubTeamId: buyer, now });
      if (!w.ok) logger.warn({ module: M, teamId: buyer }, `stažení jednání ${negotiationId}: ${w.error}`);
      return { result: "too_expensive", detail: `klub chce ${row.amount}, strop ${maxPrice}` };
    }
    const counter = await counterAiNegotiation(db, { negotiationId, buyerClubTeamId: buyer, terms: cash(maxPrice), now });
    if (!counter.ok) {
      const w = await withdrawAiNegotiation(db, { negotiationId, buyerClubTeamId: buyer, now });
      if (!w.ok) logger.warn({ module: M, teamId: buyer }, `stažení jednání ${negotiationId}: ${w.error}`);
      return { result: "failed", detail: counter.error };
    }
    offeredMax = true;
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

/**
 * Skaut bez práce dostane úkol na post, kde klub hledá posilu. Dva týdny, cestovné musí
 * pokrýt peníze nad rezervou. Vrací post, na který skaut vyjel, nebo důvod, proč ne.
 */
export async function maybeStartScoutTask(
  db: D1Database, club: Pick<AiClubState, "teamId" | "profile" | "spendable">, position: string, gameDate: string,
): Promise<{ started: true; position: string; radiusKm: number } | { started: false; reason: string }> {
  const scouts = await loadTeamScouts(db, club.teamId);
  if (scouts.length === 0) return { started: false, reason: "bez skauta" };
  // Úkol na tenhle post už jeden skaut má: druhého na totéž neposílat.
  let free: (typeof scouts)[number] | null = null;
  for (const s of scouts) {
    const active = await loadActiveAssignment(db, club.teamId, s.id)
      .catch((e) => { logger.warn({ module: M, teamId: club.teamId }, "úkol skauta", e); return undefined; });
    if (active === undefined) return { started: false, reason: "úkoly skautů nejdou načíst" };
    if (active && (active.position === position || (active.positions ?? "").includes(`"${position}"`))) {
      return { started: false, reason: "skaut už post hledá" };
    }
    if (!active && !free) free = s;
  }
  const scout = free;
  if (!scout) return { started: false, reason: "všichni skauti pracují" };
  const radiusKm = scoutRadiusFor(club.profile);
  const weeks = 2;
  const weeklyCost = scoutWeeklyCost(radiusKm) ?? 0;
  if (club.spendable < weeklyCost * weeks) return { started: false, reason: "na cestovné nejsou peníze nad rezervou" };
  const ages = scoutAgesFor(club.profile);
  const res = await createScoutAssignment(db, {
    teamId: club.teamId, staffId: scout.id, positions: [position], ageMin: ages.ageMin, ageMax: ages.ageMax,
    radiusKm, weeks, gameDate,
  });
  if (!res.ok) return { started: false, reason: res.error };
  return { started: true, position, radiusKm };
}
