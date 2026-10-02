/**
 * Sklad občerstvení — zvlášť pro každou kvalitu.
 *
 * Dřív měl produkt jeden společný sklad (`stock_quantity`) a kvalita byla jen nastavení,
 * které šlo přepnout kdykoli. Nakoupilo se pivo za 14 Kč, přepnulo na Plzeň a prodávalo
 * se s poptávkou, spokojeností i odvodem Plzně (na produkci takhle jeden klub ušetřil
 * přes 1,5 milionu). Teď má každá kvalita vlastní sklad a v zápase se prodává jen ta,
 * která je zvolená (`quality_level`).
 */

import { logger } from "../lib/logger";
import { CONCESSION_CATALOG, type ProductKey } from "./concession-catalog";

const M = "concession-stock";

/** Sklad podle kvality, index = úroveň (0 = nenabízí se, vždy 0). */
export type StockByTier = [number, number, number, number];

export interface ConcessionStockRow {
  key: ProductKey;
  qualityLevel: number;
  sellPrice: number;
  stockByTier: StockByTier;
}

const STOCK_COLUMNS = ["", "stock_l1", "stock_l2", "stock_l3"] as const;

/** Sloupec skladu pro úroveň 1–3. Do SQL jde jen hodnota z tohohle seznamu, nikdy vstup. */
export function stockColumn(level: number): "stock_l1" | "stock_l2" | "stock_l3" | null {
  const column = STOCK_COLUMNS[level];
  return column ? column : null;
}

/** Kolik kusů zvolené kvality je na skladě — jen to jde v zápase prodat. */
export function sellableStock(row: Pick<ConcessionStockRow, "qualityLevel" | "stockByTier">): number {
  return row.qualityLevel >= 1 && row.qualityLevel <= 3 ? row.stockByTier[row.qualityLevel] : 0;
}

interface PurchaseRecord {
  quantity: number;
  unitPrice: number;
}

/**
 * Rozdělí starý společný sklad mezi kvality podle nákupů. Na skladě zůstávají naposledy
 * koupené kusy, takže se bere od nejnovějšího nákupu. Cena za kus určuje kvalitu; co se
 * nepodaří přiřadit (nákup bez známé ceny, sklad starší než záznamy), jde do `fallbackLevel`.
 */
export function splitLegacyStock(
  key: ProductKey,
  legacyStock: number,
  purchasesNewestFirst: PurchaseRecord[],
  fallbackLevel: number,
): StockByTier {
  const result: StockByTier = [0, 0, 0, 0];
  const tiers = CONCESSION_CATALOG[key].tiers;
  let remaining = legacyStock;

  for (const purchase of purchasesNewestFirst) {
    if (remaining <= 0) break;
    const level = tiers.findIndex((tier, i) => i > 0 && tier.wholesalePrice === purchase.unitPrice);
    if (level < 1) continue;
    const take = Math.min(remaining, purchase.quantity);
    result[level] += take;
    remaining -= take;
  }

  if (remaining > 0) result[Math.min(3, Math.max(1, fallbackLevel))] += remaining;
  return result;
}

/** Nákupy produktu z účetnictví, od nejnovějšího. Popis: „Nákup Pivo (120 ks × 14 Kč)". */
async function loadPurchases(db: D1Database, teamId: string, key: ProductKey): Promise<PurchaseRecord[]> {
  const label = CONCESSION_CATALOG[key].label;
  const rows = await db.prepare(
    "SELECT description FROM transactions WHERE team_id = ? AND type = 'concession_wholesale' AND description LIKE ? ORDER BY created_at DESC, rowid DESC",
  ).bind(teamId, `Nákup ${label}%`).all<{ description: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load purchases for legacy stock", e); return { results: [] as { description: string }[] }; });

  const purchases: PurchaseRecord[] = [];
  for (const row of rows.results) {
    const match = row.description.match(/\((\d+) ks × (\d+) Kč\)/);
    if (match) purchases.push({ quantity: Number(match[1]), unitPrice: Number(match[2]) });
  }
  return purchases;
}

/**
 * Načte produkty týmu se skladem po kvalitách. Řádek, který má ještě starý společný sklad,
 * rovnou převede (rozdělí podle nákupů a `stock_quantity` vynuluje), takže se převod udělá
 * jednou a sám, bez ručního zásahu do databáze.
 */
export async function loadConcessionStock(db: D1Database, teamId: string): Promise<ConcessionStockRow[]> {
  const result = await db.prepare(
    "SELECT product_key, quality_level, sell_price, stock_quantity, stock_l1, stock_l2, stock_l3 FROM concession_products WHERE team_id = ?",
  ).bind(teamId).all<{
    product_key: string; quality_level: number; sell_price: number;
    stock_quantity: number; stock_l1: number; stock_l2: number; stock_l3: number;
  }>().catch((e) => { logger.warn({ module: M, teamId }, "load concession stock", e); return null; });
  if (!result) return [];

  const rows: ConcessionStockRow[] = [];
  for (const r of result.results) {
    const key = r.product_key as ProductKey;
    if (!CONCESSION_CATALOG[key]) continue;
    const stockByTier: StockByTier = [0, r.stock_l1 ?? 0, r.stock_l2 ?? 0, r.stock_l3 ?? 0];

    if ((r.stock_quantity ?? 0) > 0) {
      const purchases = await loadPurchases(db, teamId, key);
      const legacy = splitLegacyStock(key, r.stock_quantity, purchases, r.quality_level);
      for (let level = 1; level <= 3; level++) stockByTier[level] += legacy[level];
      // Podmínka na stock_quantity hlídá souběh: převede jen ten, kdo starý sklad ještě viděl
      const update = await db.prepare(
        "UPDATE concession_products SET stock_l1 = stock_l1 + ?, stock_l2 = stock_l2 + ?, stock_l3 = stock_l3 + ?, stock_quantity = 0 WHERE team_id = ? AND product_key = ? AND stock_quantity = ?",
      ).bind(legacy[1], legacy[2], legacy[3], teamId, key, r.stock_quantity).run()
        .catch((e) => { logger.warn({ module: M, teamId }, `convert legacy stock ${key}`, e); return null; });
      if (update && update.meta.changes > 0) {
        logger.info({ module: M, teamId }, `starý sklad ${key} (${r.stock_quantity} ks) rozdělen: ${legacy.slice(1).join("/")}`);
      }
    }

    rows.push({ key, qualityLevel: r.quality_level, sellPrice: r.sell_price, stockByTier });
  }
  return rows;
}
