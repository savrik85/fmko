/**
 * Pojistky AI klubu jako prodávajícího, společné pro odpověď AI trenéra a pro přijetí jeho
 * protinávrhu kupujícím (`services/transfer-actions.ts`).
 *
 * Protinávrh AI platí tři dny a kupující ho může přijmout kdykoli. Kdyby AI poslala několik
 * protinávrhů najednou (oba brankáři, čtyři hráči z kádru na hraně minima), přijetí všech by
 * kádr rozebralo. Proto:
 * - při odpovědi AI počítá hráče, na které už protinávrh běží, jako prodané,
 * - při přijetí se pojistky zkontrolují znovu nad dnešním kádrem: poslední brankář, minimum
 *   kádru, opora bez náhrady, strop soupisky a 60 % tržní hodnoty po odečtení toho, co AI klub
 *   z prodeje odvede (doložka o procentech, nedoplacené splátky).
 *
 * Dotazy na doložky a dluh schválně bez catch: prodej, který proklouzne kvůli chybě čtení,
 * je horší než chyba.
 */

import { marketValue, type TransferTerms } from "@okresni-masina/shared";
import { ensureAiProfile } from "./profile";
import { analyzeSquad, loadClubSquad, type SellBlockReason, type SquadAnalysis, type SquadMember, type SquadPosition } from "./squad";
import { isBelowHardFloor, netSaleValue, swapPlayerValue, type SaleCosts } from "./valuation";

export interface SwapPlayerForValue {
  position: string;
  rating: number;
  age: number;
}

/** Hráči, kteří k nabídce přijdou na výměnu. */
export async function loadSwapPlayersForValue(db: D1Database, offerId: string): Promise<SwapPlayerForValue[]> {
  const rows = await db.prepare(
    `SELECT p.position, p.overall_rating, p.age FROM transfer_offer_swap_players s JOIN players p ON p.id = s.player_id
      WHERE s.offer_id = ? ORDER BY s.sort_order`,
  ).bind(offerId).all<{ position: string; overall_rating: number; age: number }>();
  return rows.results.map((r) => ({ position: r.position, rating: Number(r.overall_rating) || 0, age: Number(r.age) || 25 }));
}

/** Co hráči na výměnu AI klubu přinesou (`value`), jejich tržní hodnota a posty pro pojistky kádru. */
export function swapValueFor(players: SwapPlayerForValue[], analysis: SquadAnalysis): {
  value: number; marketValue: number; incoming: Array<{ position: string; rating: number }>;
} {
  let value = 0;
  let total = 0;
  for (const p of players) {
    const mv = marketValue(p.rating, p.age, p.position);
    total += mv;
    value += swapPlayerValue({ marketValue: mv, useful: analysis.isUseful(p) });
  }
  return { value, marketValue: total, incoming: players.map((p) => ({ position: p.position, rating: p.rating })) };
}

/** Doložka, kterou AI klub z prodeje hráče zaplatí, a zbytek splátek, který za něj ještě dluží. */
export async function loadSaleCosts(db: D1Database, clubTeamId: string, playerId: string, swapMarketValue: number): Promise<SaleCosts> {
  const clause = await db.prepare(
    "SELECT COALESCE(SUM(pct), 0) AS pct FROM sell_on_clauses WHERE player_id = ? AND owner_team_id = ? AND status = 'active'",
  ).bind(playerId, clubTeamId).first<{ pct: number }>();
  const debt = await db.prepare(
    "SELECT COALESCE(SUM(remaining), 0) AS remaining FROM transfer_installments WHERE player_id = ? AND buyer_team_id = ? AND status = 'active'",
  ).bind(playerId, clubTeamId).first<{ remaining: number }>();
  return { sellOnPct: Number(clause?.pct) || 0, remainingDebt: Number(debt?.remaining) || 0, swapMarketValue };
}

/**
 * Hráči AI klubu, na které už běží protinávrh AI (míček má kupující a může kdykoli přijmout).
 * Pro další odpověď se počítají jako prodaní.
 */
export async function loadCommittedPlayerIds(db: D1Database, clubTeamId: string, exceptOfferId: string): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT DISTINCT player_id FROM transfer_offers
      WHERE status = 'countered' AND last_action_by = ? AND id != ?
        AND to_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
  ).bind(clubTeamId, exceptOfferId, clubTeamId, clubTeamId).all<{ player_id: string }>();
  return new Set(rows.results.map((r) => r.player_id));
}

interface GuardPlayer {
  id: string;
  position: string;
  overall_rating: number;
  age: number;
  team_id: string;
  loan_from_team_id: string | null;
}

/**
 * Kádr pro rozhodnutí o prodeji: bez hráčů s běžícím protinávrhem (kromě toho, o kterého jde)
 * a s hráčem, který je zrovna půjčený jinam (odkup z hostování), na jeho kmenové soupisce.
 */
export function squadForSale(members: SquadMember[], player: GuardPlayer, clubTeamId: string, committed: Set<string>): SquadMember[] {
  const out = members.filter((m) => m.id === player.id || !committed.has(m.id));
  if (!out.some((m) => m.id === player.id)) {
    const rosterTeamId = player.loan_from_team_id ?? player.team_id;
    out.push({
      id: player.id, position: player.position as SquadPosition, rating: Number(player.overall_rating) || 0, age: Number(player.age) || 25,
      rosterTeamId, isU21Roster: rosterTeamId !== clubTeamId, loanedIn: false, injured: false,
    });
  }
  return out;
}

export type AiSellerGuardBlock = SellBlockReason | "hard_floor" | "player_missing";

/**
 * Smí AI klub hráče pustit za tyhle podmínky? Volá se při přijetí protinávrhu AI kupujícím.
 * Vrací důvod, proč ne, nebo null.
 */
export async function aiSellerGuard(db: D1Database, args: {
  sellerClubTeamId: string;
  playerId: string;
  offerId: string;
  terms: TransferTerms;
  offerType: string;
}): Promise<AiSellerGuardBlock | null> {
  const player = await db.prepare(
    "SELECT id, position, overall_rating, age, team_id, loan_from_team_id FROM players WHERE id = ?",
  ).bind(args.playerId).first<GuardPlayer>();
  if (!player) return "player_missing";
  const profile = await ensureAiProfile(db, args.sellerClubTeamId);
  const members = squadForSale(await loadClubSquad(db, args.sellerClubTeamId), player, args.sellerClubTeamId, new Set());
  const analysis = analyzeSquad(members, profile);
  const swap = swapValueFor(await loadSwapPlayersForValue(db, args.offerId), analysis);
  const block = analysis.sellBlock(player.id, swap.incoming);
  if (block) return block;
  if (args.offerType === "loan") return null;
  const mv = marketValue(player.overall_rating, player.age, player.position);
  const costs = await loadSaleCosts(db, args.sellerClubTeamId, player.id, swap.marketValue);
  return isBelowHardFloor(netSaleValue(args.terms, swap.value, costs), mv) ? "hard_floor" : null;
}
