/**
 * Přestup na splátky a procenta z příštího přestupu (spec 2026-10-03).
 *
 * Peníze jdou přes recordTransaction. Typy transakcí NEJSOU v PURCHASE_TYPES, takže se
 * splátka strhne i do minusu a prodávající dostane peníze vždy. Každý pohyb nejdřív
 * optimisticky zabere řádek dohody nebo doložky, takže dva souběžné běhy nikdy nezaplatí
 * dvakrát.
 */

import { sellOnShare } from "@okresni-masina/shared";
import { recordTransaction } from "../season/finance-processor";
import { logger } from "../lib/logger";

interface ActiveDeal {
  id: string;
  seller_team_id: string;
  player_name: string;
  installment_amount: number;
  installments_total: number;
  installments_paid: number;
  remaining: number;
}

/** Pondělní splátky: kupujícímu se strhne jedna splátka každé aktivní dohody. Vrací počet zaplacených. */
export async function processTransferInstallments(db: D1Database, buyerClubTeamId: string, gameDate: string): Promise<number> {
  const deals = await db.prepare(
    `SELECT id, seller_team_id, player_name, installment_amount, installments_total, installments_paid, remaining
       FROM transfer_installments WHERE buyer_team_id = ? AND status = 'active'`,
  ).bind(buyerClubTeamId).all<ActiveDeal>()
    .catch((e) => { logger.warn({ module: "installments" }, "load active deals", e); return { results: [] as ActiveDeal[] }; });

  let paid = 0;
  for (const d of deals.results) {
    const n = d.installments_paid + 1;
    const isLast = n >= d.installments_total;
    const pay = isLast ? d.remaining : Math.min(d.remaining, d.installment_amount);
    if (pay <= 0) continue;
    const left = d.remaining - pay;

    const claim = await db.prepare(
      `UPDATE transfer_installments SET installments_paid = ?, remaining = ?, status = ?, closed_at = ?
        WHERE id = ? AND installments_paid = ? AND status = 'active'`,
    ).bind(n, left, left <= 0 ? "paid" : "active", left <= 0 ? new Date().toISOString() : null, d.id, d.installments_paid).run()
      .catch((e) => { logger.error({ module: "installments" }, `claim installment ${d.id}`, e); return null; });
    if (!claim || (claim.meta?.changes ?? 0) === 0) continue;

    const desc = `Splátka za ${d.player_name} ${n}/${d.installments_total}`;
    const ref = `inst-${d.id}-${n}`;
    await recordTransaction(db, buyerClubTeamId, "transfer_installment", -pay, desc, gameDate, ref);
    await recordTransaction(db, d.seller_team_id, "transfer_installment_income", pay, desc, gameDate, ref);
    paid++;
  }
  return paid;
}

/**
 * Hráč prodaný dál: zbytek dluhu za něj se hned doplatí původnímu klubu a procenta
 * z příštího přestupu se vyplatí z ceny prodeje. Volá se po dokončení prodeje.
 */
export async function settleOnResale(
  db: D1Database,
  args: { playerId: string; ownerClubTeamId: string; saleAmount: number; saleOfferId: string; gameDate: string },
): Promise<{ settled: number; sellOn: number }> {
  const out = { settled: 0, sellOn: 0 };

  const deal = await db.prepare(
    `SELECT id, seller_team_id, player_name, remaining FROM transfer_installments
      WHERE player_id = ? AND buyer_team_id = ? AND status = 'active' LIMIT 1`,
  ).bind(args.playerId, args.ownerClubTeamId).first<{ id: string; seller_team_id: string; player_name: string; remaining: number }>()
    .catch((e) => { logger.warn({ module: "installments" }, "load deal for resale", e); return null; });
  if (deal && deal.remaining > 0) {
    const claim = await db.prepare(
      "UPDATE transfer_installments SET status = 'settled', remaining = 0, closed_at = ? WHERE id = ? AND status = 'active'",
    ).bind(new Date().toISOString(), deal.id).run()
      .catch((e) => { logger.error({ module: "installments" }, `settle deal ${deal.id}`, e); return null; });
    if (claim && (claim.meta?.changes ?? 0) > 0) {
      const desc = `Doplacení splátek za ${deal.player_name} při dalším prodeji`;
      const ref = `inst-settle-${deal.id}`;
      await recordTransaction(db, args.ownerClubTeamId, "transfer_installment_settlement", -deal.remaining, desc, args.gameDate, ref);
      await recordTransaction(db, deal.seller_team_id, "transfer_installment_settlement_income", deal.remaining, desc, args.gameDate, ref);
      out.settled = deal.remaining;
    }
  }

  const clause = await db.prepare(
    `SELECT id, beneficiary_team_id, player_name, pct FROM sell_on_clauses
      WHERE player_id = ? AND owner_team_id = ? AND status = 'active' LIMIT 1`,
  ).bind(args.playerId, args.ownerClubTeamId).first<{ id: string; beneficiary_team_id: string; player_name: string; pct: number }>()
    .catch((e) => { logger.warn({ module: "installments" }, "load sell-on clause", e); return null; });
  if (clause && args.saleAmount > 0) {
    const share = sellOnShare(args.saleAmount, clause.pct);
    const claim = await db.prepare(
      "UPDATE sell_on_clauses SET status = 'paid', paid_amount = ?, paid_offer_id = ?, resolved_at = ? WHERE id = ? AND status = 'active'",
    ).bind(share, args.saleOfferId, new Date().toISOString(), clause.id).run()
      .catch((e) => { logger.error({ module: "installments" }, `pay sell-on ${clause.id}`, e); return null; });
    if (claim && (claim.meta?.changes ?? 0) > 0 && share > 0) {
      const desc = `${clause.pct} % z prodeje: ${clause.player_name}`;
      const ref = `sellon-${clause.id}`;
      await recordTransaction(db, args.ownerClubTeamId, "sell_on_fee", -share, desc, args.gameDate, ref);
      await recordTransaction(db, clause.beneficiary_team_id, "sell_on_income", share, desc, args.gameDate, ref);
      out.sellOn = share;
    }
  }
  return out;
}

/** Hráč odešel bez peněz (propuštění, konec kariéry, zmizení): procenta propadnou. Splátky běží dál. */
export async function lapseSellOnClauses(db: D1Database, playerId: string): Promise<void> {
  await db.prepare("UPDATE sell_on_clauses SET status = 'lapsed', resolved_at = ? WHERE player_id = ? AND status = 'active'")
    .bind(new Date().toISOString(), playerId).run()
    .catch((e) => logger.warn({ module: "installments" }, "lapse sell-on clauses", e));
}
