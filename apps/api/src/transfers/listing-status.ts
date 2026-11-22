/**
 * Je hráč na přestupové listině (na prodej nebo na hostování)? Ví to on i kabina: trh je
 * veřejný. Bez toho hráč, kterého trenér dal na prodej, psal po zápase „Řekněte mi rovnou,
 * jestli se se mnou ještě počítá“ a v chatu zapíral, že o tom ví (Študlar, Výškovice, 10/2026).
 */

import { logger } from "../lib/logger";

export interface ActiveListing {
  kind: "transfer" | "loan";
  /** `YYYY-MM-DD`, kdy ho trenér na listinu dal. */
  since: string;
}

export async function loadActiveListing(db: D1Database, playerId: string): Promise<ActiveListing | null> {
  const row = await db.prepare(
    `SELECT COALESCE(deal_type, 'transfer') AS deal_type, created_at FROM transfer_listings
      WHERE player_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
  ).bind(playerId).first<{ deal_type: string | null; created_at: string | null }>()
    .catch((e) => { logger.warn({ module: "listing-status" }, `listina hráče ${playerId}`, e); return null; });
  if (!row) return null;
  return { kind: row.deal_type === "loan" ? "loan" : "transfer", since: (row.created_at ?? "").slice(0, 10) };
}
