import { logger } from "../lib/logger";
import { CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, type ProductKey } from "./concession-catalog";

/**
 * Fans processor — satisfaction delta a self-concession prodej.
 *
 * Core pure funkce + DB helpery pro update fans entity po zápase.
 * Volá se z finance-processor.processMatchDayFinances().
 */

export interface FansState {
  satisfaction: number;
  loyalty: number;
  expected_performance: number;
  base_ticket_price: number;
}

export interface ManagerInput {
  reputation: number;
  motivation: number;
}

export interface SoldProductInput {
  key: ProductKey;
  qualityLevel: number;
  sellPrice: number;
  sold: number;
  stockLeft: number;
  soldOut: boolean;
}

export interface MatchSatisfactionInput {
  result: "win" | "draw" | "loss";
  fans: FansState;
  opponentReputation: number;
  /** Efektivní cena vstupného (po facility + satisfaction mul) */
  effectiveTicketPrice: number;
  /** Village base ticket price (reference pro "normální" vstupné) */
  villageBaseTicketPrice: number;
  concessionMode: "external" | "self";
  soldProducts: SoldProductInput[];
  manager?: ManagerInput;
}

export interface MatchSatisfactionResult {
  delta: number;
  reasons: string[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Spočítá delta spokojenosti fanoušků po zápase. Pure funkce, testovatelná bez DB.
 */
export function computeMatchSatisfactionDelta(input: MatchSatisfactionInput): MatchSatisfactionResult {
  const reasons: string[] = [];
  let delta = 0;

  // 1. Výsledek
  if (input.result === "win") {
    delta += 6;
    reasons.push("Výhra +6");
  } else if (input.result === "draw") {
    reasons.push("Remíza 0");
  } else {
    delta -= 5;
    reasons.push("Prohra -5");
  }

  // 2. Očekávání vs realita (opponentReputation vs fans.expected_performance)
  const expDiff = input.opponentReputation - input.fans.expected_performance;
  if (input.result === "win" && expDiff > 10) {
    const bonus = Math.round(expDiff / 10);
    delta += bonus;
    reasons.push(`Výhra nad silnějším +${bonus}`);
  }
  if (input.result === "loss" && expDiff < -10) {
    const penalty = Math.round(expDiff / 10); // záporné číslo
    delta += penalty;
    reasons.push(`Prohra s outsiderem ${penalty}`);
  }

  // 3. Cena vstupného
  if (input.villageBaseTicketPrice > 0) {
    const ratio = input.effectiveTicketPrice / input.villageBaseTicketPrice;
    if (ratio > 1.2) {
      delta -= 2;
      reasons.push("Drahé vstupné -2");
    } else if (ratio < 0.8) {
      delta += 1;
      reasons.push("Levné vstupné +1");
    }
  }

  // 4. Občerstvení — jen self mode má dopad na satisfaction
  if (input.concessionMode === "self") {
    for (const p of input.soldProducts) {
      const catalog = CONCESSION_CATALOG[p.key];
      if (!catalog) continue;
      const tier = catalog.tiers[p.qualityLevel];
      if (!tier || tier.wholesalePrice === 0) continue;

      const priceRatio = p.sellPrice / tier.wholesalePrice;
      const label = catalog.label.toLowerCase();

      // Kvalitní a férové ceny = +1
      if (p.qualityLevel >= 2 && priceRatio <= 1.8) {
        delta += 1;
        reasons.push(`Kvalitní ${label} +1`);
      }
      // Nízká kvalita a přepálená cena = -2
      if (p.qualityLevel <= 1 && priceRatio > 2.0) {
        delta -= 2;
        reasons.push(`Předražená ${label} -2`);
      }
      // Došlé zásoby = -2
      if (p.soldOut && p.sold > 0) {
        delta -= 2;
        reasons.push(`Došlo ${label} -2`);
      }
    }
  }

  // 5. Trenér
  if (input.manager) {
    const mgrBoost = Math.round(
      (input.manager.reputation - 50) * 0.03 + (input.manager.motivation - 50) * 0.02,
    );
    if (mgrBoost !== 0) {
      delta += mgrBoost;
      reasons.push(`Trenér ${mgrBoost > 0 ? "+" : ""}${mgrBoost}`);
    }
  }

  return { delta: clamp(delta, -15, 15), reasons };
}

export interface ConcessionProductRow {
  key: ProductKey;
  qualityLevel: number;
  sellPrice: number;
  stockQuantity: number;
}

export interface ConcessionSaleResult {
  totalRevenue: number;
  products: SoldProductInput[];
}

/**
 * Spočítá prodej na domácím zápase ve self módu.
 * Pure — nemění DB, jen vrací čísla. Volající provede UPDATE.
 */
export function computeSelfConcessionMatch(
  attendance: number,
  satisfaction: number,
  products: ConcessionProductRow[],
): ConcessionSaleResult {
  // satisfaction mul pro poptávku: 0.7 (nespokojení) -> 1.3 (nadšení)
  const satMul = 0.7 + (clamp(satisfaction, 0, 100) / 100) * 0.6;
  const sold: SoldProductInput[] = [];
  let totalRevenue = 0;

  for (const p of products) {
    const catalog = CONCESSION_CATALOG[p.key];
    if (!catalog || p.qualityLevel <= 0) {
      sold.push({
        key: p.key,
        qualityLevel: p.qualityLevel,
        sellPrice: p.sellPrice,
        sold: 0,
        stockLeft: p.stockQuantity,
        soldOut: false,
      });
      continue;
    }

    const tier = catalog.tiers[p.qualityLevel];
    if (!tier) continue;

    // Price elasticity: ratio current/default; if cheaper than default → vyšší demand, pokud dražší → nižší
    const defaultPrice = tier.defaultSellPrice;
    const priceRatio = defaultPrice > 0 ? p.sellPrice / defaultPrice : 1;
    // priceFactor = 1 při priceRatio=1, klesá když priceRatio > 1
    // např. priceRatio=1.5, elasticity=0.6 → 1 - 0.5 * 0.6 = 0.7
    const priceFactor = Math.max(0.1, 1 - (priceRatio - 1) * catalog.priceElasticity);

    // Quality boost: vyšší quality → mírně víc demand (lidé chtějí "to dobré")
    const qualityBoost = 1 + (p.qualityLevel - 1) * 0.1; // L1=1.0, L2=1.1, L3=1.2

    const demand = Math.round(
      attendance * catalog.baseDemandRate * satMul * priceFactor * qualityBoost,
    );
    const actualSold = Math.max(0, Math.min(demand, p.stockQuantity));
    const revenue = actualSold * p.sellPrice;

    totalRevenue += revenue;
    sold.push({
      key: p.key,
      qualityLevel: p.qualityLevel,
      sellPrice: p.sellPrice,
      sold: actualSold,
      stockLeft: p.stockQuantity - actualSold,
      soldOut: actualSold > 0 && actualSold >= p.stockQuantity && demand > p.stockQuantity,
    });
  }

  return { totalRevenue, products: sold };
}

/**
 * DB helper — vytvoří default fans row + default concession_products, pokud ještě neexistují.
 */
export async function ensureFansRow(
  db: D1Database,
  teamId: string,
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM fans WHERE team_id = ?")
    .bind(teamId)
    .first<{ id: string }>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "ensureFansRow select", e);
      return null;
    });

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO fans (id, team_id, satisfaction, loyalty, expected_performance, base_ticket_price) VALUES (?, ?, 50, 50, 50, 0)",
      )
      .bind(crypto.randomUUID(), teamId)
      .run()
      .catch((e) => logger.warn({ module: "fans-processor" }, "ensureFansRow insert", e));
  }

  // Default concession_products — quality 1, sell_price = default
  const productCount = await db
    .prepare("SELECT COUNT(*) as cnt FROM concession_products WHERE team_id = ?")
    .bind(teamId)
    .first<{ cnt: number }>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "concession count", e);
      return { cnt: 0 };
    });

  if ((productCount?.cnt ?? 0) < CONCESSION_PRODUCT_KEYS.length) {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const catalog = CONCESSION_CATALOG[key];
      const tier = catalog.tiers[1]; // default L1
      await db
        .prepare(
          "INSERT OR IGNORE INTO concession_products (id, team_id, product_key, quality_level, sell_price, stock_quantity) VALUES (?, ?, ?, 1, ?, 0)",
        )
        .bind(crypto.randomUUID(), teamId, key, tier.defaultSellPrice)
        .run()
        .catch((e) => logger.warn({ module: "fans-processor" }, `insert ${key}`, e));
    }
  }
}

/**
 * Po zápase uloží satisfaction delta do DB + last match reasons.
 * Zároveň archivuje záznam do fans_match_history pro pozdější zobrazení historie.
 */
export async function applyFansMatchDelta(
  db: D1Database,
  teamId: string,
  delta: number,
  reasons: string[],
  context?: {
    matchId?: string;
    gamedate?: string;
    opponentName?: string;
    result?: "win" | "draw" | "loss";
    attendance?: number;
  },
): Promise<void> {
  // Načíst current satisfaction pro before/after snapshot
  const before = await db
    .prepare("SELECT satisfaction FROM fans WHERE team_id = ?")
    .bind(teamId)
    .first<{ satisfaction: number }>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "load satisfaction before", e);
      return null;
    });
  const satBefore = before?.satisfaction ?? 50;
  const satAfter = Math.max(0, Math.min(100, satBefore + delta));

  await db
    .prepare(
      `UPDATE fans
       SET satisfaction = ?,
           last_match_delta = ?,
           last_match_reasons = ?,
           updated_at = datetime('now')
       WHERE team_id = ?`,
    )
    .bind(satAfter, delta, JSON.stringify(reasons), teamId)
    .run()
    .catch((e) => logger.warn({ module: "fans-processor" }, "apply delta", e));

  // Insert do historie
  await db
    .prepare(
      `INSERT INTO fans_match_history
       (id, team_id, match_id, gamedate, satisfaction_before, satisfaction_after, delta, reasons, opponent_name, result, attendance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      teamId,
      context?.matchId ?? null,
      context?.gamedate ?? new Date().toISOString().slice(0, 10),
      satBefore,
      satAfter,
      delta,
      JSON.stringify(reasons),
      context?.opponentName ?? null,
      context?.result ?? null,
      context?.attendance ?? 0,
    )
    .run()
    .catch((e) => logger.warn({ module: "fans-processor" }, "insert history", e));
}

/**
 * Load fans row + concession mode pro kalkulaci. Vrátí null pokud neexistuje (starší team).
 */
export async function loadFansContext(
  db: D1Database,
  teamId: string,
): Promise<{
  fans: FansState;
  concessionMode: "external" | "self";
  products: ConcessionProductRow[];
} | null> {
  const fansRow = await db
    .prepare(
      "SELECT satisfaction, loyalty, expected_performance, base_ticket_price FROM fans WHERE team_id = ?",
    )
    .bind(teamId)
    .first<FansState>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "load fans", e);
      return null;
    });
  if (!fansRow) return null;

  const modeRow = await db
    .prepare("SELECT concession_mode FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<{ concession_mode: string }>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "load mode", e);
      return null;
    });
  const concessionMode = (modeRow?.concession_mode === "self" ? "self" : "external") as
    | "self"
    | "external";

  const productsResult = await db
    .prepare(
      "SELECT product_key, quality_level, sell_price, stock_quantity FROM concession_products WHERE team_id = ?",
    )
    .bind(teamId)
    .all<{
      product_key: string;
      quality_level: number;
      sell_price: number;
      stock_quantity: number;
    }>()
    .catch((e) => {
      logger.warn({ module: "fans-processor" }, "load products", e);
      return { results: [] };
    });

  const products: ConcessionProductRow[] = productsResult.results.map((r) => ({
    key: r.product_key as ProductKey,
    qualityLevel: r.quality_level,
    sellPrice: r.sell_price,
    stockQuantity: r.stock_quantity,
  }));

  return { fans: fansRow, concessionMode, products };
}
