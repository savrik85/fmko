/**
 * Hráči na výměnu: kupující k nabídce přidává až MAX_SWAP_PLAYERS vlastních hráčů,
 * kteří jdou opačným směrem. Drží je tabulka `transfer_offer_swap_players`;
 * starý sloupec `transfer_offers.offered_player_id` unesl jen jednoho a nové
 * nabídky do něj nepíšou (migrace 0258 jeho obsah přenesla).
 */

import { resolveClubTeamId } from "./offer-club-scope";
import { logger } from "../lib/logger";

const M = "swap-players";

export const MAX_SWAP_PLAYERS = 2;

export interface SwapPlayerBrief {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  overall_rating: number | null;
  age: number | null;
  avatar: string | null;
}

/**
 * Hráči na výměnu z požadavku. Starší klient posílá jednoho v `offeredPlayerId`,
 * nový seznam v `offeredPlayerIds`.
 */
export function parseSwapPlayerIds(
  body: { offeredPlayerIds?: unknown; offeredPlayerId?: unknown },
): { ids: string[] } | { error: string } {
  const raw: unknown[] = Array.isArray(body.offeredPlayerIds)
    ? body.offeredPlayerIds
    : body.offeredPlayerId ? [body.offeredPlayerId] : [];
  if (raw.some((id) => typeof id !== "string" || id.length === 0)) {
    return { error: "Neplatný hráč na výměnu" };
  }
  const ids = raw as string[];
  if (new Set(ids).size !== ids.length) return { error: "Stejného hráče nejde nabídnout dvakrát" };
  if (ids.length > MAX_SWAP_PLAYERS) {
    return { error: `Na výměnu jde nabídnout nejvýš ${MAX_SWAP_PLAYERS} hráče` };
  }
  return { ids };
}

/** Smí kupující tyhle hráče nabídnout? Vrací první problém, nebo null. */
export async function swapPlayersError(
  db: D1Database,
  ids: string[],
  opts: { buyerClubTeamId: string; targetPlayerId: string },
): Promise<{ status: 400 | 404; error: string } | null> {
  for (const id of ids) {
    if (id === opts.targetPlayerId) return { status: 400, error: "Nelze nabídnout stejného hráče" };
    const swap = await db.prepare("SELECT team_id, loan_from_team_id, next_match_return FROM players WHERE id = ?")
      .bind(id).first<{ team_id: string; loan_from_team_id: string | null; next_match_return: number }>();
    if (!swap) return { status: 404, error: "Hráč na výměnu nenalezen" };
    const swapClubTeamId = await resolveClubTeamId(db, swap.team_id);
    if (swapClubTeamId !== opts.buyerClubTeamId) return { status: 400, error: "Hráč na výměnu není ve tvém klubu" };
    if (swap.loan_from_team_id) return { status: 400, error: "Hráč na výměnu je na hostování, nelze vyměnit" };
    if (swap.next_match_return === 1) return { status: 400, error: "Hráč na výměnu čeká na návrat z U21, nelze ho nabídnout" };
    const injury = await db.prepare("SELECT 1 FROM injuries WHERE player_id = ? AND days_remaining > 0 LIMIT 1")
      .bind(id).first()
      .catch((e) => { logger.warn({ module: M }, "zranění hráče na výměnu", e); return null; });
    if (injury) return { status: 400, error: "Zraněného hráče nelze nabídnout na výměnu" };
  }
  return null;
}

/** Zápis hráčů k nové nabídce. Pořadí drží `sort_order`, ať se vypisují tak, jak je manažer vybral. */
export function insertSwapPlayersStmts(db: D1Database, offerId: string, ids: string[]): D1PreparedStatement[] {
  return ids.map((playerId, i) =>
    db.prepare("INSERT OR IGNORE INTO transfer_offer_swap_players (offer_id, player_id, sort_order) VALUES (?, ?, ?)")
      .bind(offerId, playerId, i));
}

// D1 snese nejvýš 100 parametrů v jednom dotazu.
const CHUNK = 90;

/**
 * Hráči na výměnu k nabídkám. Hráč, který mezitím z databáze odešel,
 * se dohledá v `departed_players`, ať historie výměny nezmizí.
 */
export async function loadSwapPlayers(
  db: D1Database, offerIds: string[],
): Promise<Map<string, SwapPlayerBrief[]>> {
  const out = new Map<string, SwapPlayerBrief[]>();
  const unique = Array.from(new Set(offerIds));
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await db.prepare(
      `SELECT s.offer_id, s.player_id AS id,
              COALESCE(p.first_name, dp.first_name) AS first_name,
              COALESCE(p.last_name, dp.last_name) AS last_name,
              COALESCE(p.position, dp.position) AS position,
              COALESCE(p.overall_rating, dp.overall_rating) AS overall_rating,
              COALESCE(p.age, dp.age) AS age,
              COALESCE(p.avatar, dp.avatar) AS avatar
         FROM transfer_offer_swap_players s
         LEFT JOIN players p ON p.id = s.player_id
         LEFT JOIN departed_players dp ON dp.id = s.player_id
        WHERE s.offer_id IN (${chunk.map(() => "?").join(",")})
        ORDER BY s.offer_id, s.sort_order`,
    ).bind(...chunk).all<SwapPlayerBrief & { offer_id: string }>();
    for (const { offer_id, ...player } of rows.results) {
      const list = out.get(offer_id) ?? [];
      list.push(player);
      out.set(offer_id, list);
    }
  }
  return out;
}

export function swapPlayerName(p: Pick<SwapPlayerBrief, "first_name" | "last_name">): string {
  return p.first_name ? `${p.first_name} ${p.last_name ?? ""}`.trim() : "hráč už v databázi není";
}

/** Výčet po česku: „A", „A a B", „A, B a C". */
export function czechList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}
