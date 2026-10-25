/**
 * Občerstvení klubu: jedna služba pro manažera (PATCH /teams/:teamId/concession/mode,
 * PATCH /teams/:teamId/concession/products/:key, POST /teams/:teamId/concession/restock)
 * i AI trenéra. Kontroly, meze a ceny žijí jen tady, aby AI nemohla dostat jinou
 * (výhodnější) kontrolu než člověk.
 */

import { logger } from "../lib/logger";
import { CONCESSION_CATALOG, type ProductKey } from "../season/concession-catalog";
import { loadConcessionStock, stockColumn } from "../season/concession-stock";
import { recordTransaction } from "../season/finance-processor";
import type { ServiceError } from "./lineup";

const M = "concessions";

export type ConcessionMode = "external" | "self";

/** Nejvyšší prodejní cena, kterou bufet přijme. */
export const MAX_CONCESSION_PRICE = 1000;
/** Nejvíc kusů na jeden nákup do skladu. */
export const MAX_RESTOCK_QUANTITY = 10_000;

/** Externí provozovatel, nebo vlastní provoz (ten chce aspoň L1 občerstvení na stadionu). */
export async function setConcessionMode(db: D1Database, teamId: string, mode: ConcessionMode): Promise<{ ok: true; mode: ConcessionMode } | ServiceError> {
  if (mode === "self") {
    const stadium = await db.prepare("SELECT refreshments FROM stadiums WHERE team_id = ?")
      .bind(teamId).first<{ refreshments: number }>()
      .catch((e) => { logger.warn({ module: M }, "check refreshments for self mode", e); return null; });
    if ((stadium?.refreshments ?? 0) < 1) {
      return { ok: false, status: 400, error: "Pro vlastní provoz je potřeba alespoň L1 občerstvení ve stadionu" };
    }
  }

  await db.prepare("UPDATE stadiums SET concession_mode = ? WHERE team_id = ?")
    .bind(mode, teamId).run()
    .catch((e) => logger.warn({ module: M }, "update concession mode", e));
  return { ok: true, mode };
}

/** Kvalita (0–3, 0 = nenabízí se) a prodejní cena produktu. Chybějící hodnota zůstane, jak je. */
export async function setConcessionProduct(
  db: D1Database,
  teamId: string,
  key: string,
  body: { qualityLevel?: number; sellPrice?: number },
): Promise<{ ok: true; qualityLevel: number; sellPrice: number } | ServiceError> {
  const catalog = CONCESSION_CATALOG[key as ProductKey];
  if (!catalog) return { ok: false, status: 400, error: "Neznámý produkt" };

  const { ensureFansRow } = await import("../season/fans-processor");
  await ensureFansRow(db, teamId);

  const existing = await db.prepare(
    "SELECT quality_level, sell_price FROM concession_products WHERE team_id = ? AND product_key = ?",
  ).bind(teamId, key).first<{ quality_level: number; sell_price: number }>()
    .catch((e) => { logger.warn({ module: M }, "load concession product", e); return null; });

  const newQuality = body.qualityLevel !== undefined
    ? Math.max(0, Math.min(3, Math.round(body.qualityLevel)))
    : (existing?.quality_level ?? 1);
  const newPrice = body.sellPrice !== undefined
    ? Math.max(0, Math.min(MAX_CONCESSION_PRICE, Math.round(body.sellPrice)))
    : (existing?.sell_price ?? catalog.tiers[newQuality]?.defaultSellPrice ?? 0);

  await db.prepare(
    "UPDATE concession_products SET quality_level = ?, sell_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?",
  ).bind(newQuality, newPrice, teamId, key).run()
    .catch((e) => logger.warn({ module: M }, "update concession product", e));

  return { ok: true, qualityLevel: newQuality, sellPrice: newPrice };
}

/**
 * Nákup do skladu zvolené kvality (strhne nákupní cenu × množství z rozpočtu). Každá kvalita
 * má vlastní sklad (season/concession-stock.ts). `expectedLevel` (AI trenér) nákup odmítne,
 * když se mezitím prodává jiná kvalita, ať zboží neskončí ve skladu, který se neprodává.
 */
export async function restockConcession(
  db: D1Database,
  teamId: string,
  productKey: string,
  rawQuantity: number,
  opts: { expectedLevel?: number } = {},
): Promise<{ ok: true; newStock: number; totalCost: number; level: number; quantity: number } | ServiceError> {
  const catalog = CONCESSION_CATALOG[productKey as ProductKey];
  if (!catalog) return { ok: false, status: 400, error: "Neznámý produkt" };

  const quantity = Math.max(0, Math.min(MAX_RESTOCK_QUANTITY, Math.round(rawQuantity ?? 0)));
  if (quantity <= 0) return { ok: false, status: 400, error: "Množství musí být kladné" };

  // Starý společný sklad se převede při načtení, ať se nový nákup nesečte s nerozděleným.
  const product = (await loadConcessionStock(db, teamId)).find((r) => r.key === productKey);
  if (!product) return { ok: false, status: 404, error: "Produkt nenalezen" };

  const level = product.qualityLevel;
  const tier = catalog.tiers[level];
  const column = stockColumn(level);
  if (!tier || tier.wholesalePrice === 0 || !column) {
    return { ok: false, status: 400, error: "Tento produkt se nenabízí (L0)" };
  }
  if (opts.expectedLevel !== undefined && opts.expectedLevel !== level) {
    return { ok: false, status: 409, error: `Prodává se jiná kvalita (L${level}, ne L${opts.expectedLevel})` };
  }
  const totalCost = tier.wholesalePrice * quantity;

  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>()
    .catch((e) => { logger.warn({ module: M }, "load team budget", e); return null; });
  if (!team) return { ok: false, status: 404, error: "Tým nenalezen" };
  if (team.budget < totalCost) return { ok: false, status: 400, error: "Nedostatek peněz" };

  const gameDate = new Date().toISOString();
  // Formát „Nákup <produkt> (N ks × P Kč)" čte převod starého skladu, neměnit
  await recordTransaction(
    db, teamId, "concession_wholesale", -totalCost,
    `Nákup ${catalog.label} (${quantity} ks × ${tier.wholesalePrice} Kč)`, gameDate,
  );

  const newStock = product.stockByTier[level] + quantity;
  await db.prepare(
    `UPDATE concession_products SET ${column} = ${column} + ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ? AND product_key = ?`,
  ).bind(quantity, teamId, productKey).run()
    .catch((e) => logger.warn({ module: M }, "update stock after restock", e));

  return { ok: true, newStock, totalCost, level, quantity };
}
