/**
 * Kasa pokut kabiny (`teams.fine_fund_balance`). Do rozpočtu klubu se nepřevádí: platí se
 * z ní jen hospoda pro kluky. Útrata jde nejdřív z kasy, co v ní chybí, doplatí klub
 * z rozpočtu. Každá útrata z kasy má řádek ve `fine_fund_spends` (stránka Pokuty).
 */

import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";

const M = "fine-fund";

/** Kolik je v kase pokut týmu (U21 a týmy bez sazebníku mají 0). */
export async function fineFundBalance(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT fine_fund_balance FROM teams WHERE id = ?").bind(teamId)
    .first<{ fine_fund_balance: number | null }>();
  return Math.max(0, row?.fine_fund_balance ?? 0);
}

/** Kolik z ceny musí doplatit klub z rozpočtu, když se nejdřív bere z kasy pokut. */
export async function budgetShareOfSquadPub(db: D1Database, fundTeamId: string, cost: number): Promise<number> {
  return Math.max(0, cost - await fineFundBalance(db, fundTeamId));
}

export interface SquadPubPayment {
  fromFund: number;
  fromBudget: number;
}

/**
 * Zaplatí hospodu pro kabinu: nejdřív z kasy pokut týmu `fundTeamId`, zbytek z rozpočtu
 * klubu `budgetTeamId`. Kasa se odečte jen tehdy, když na to v ní pořád je (souběh dvou
 * útrat nesmí kasu dostat do mínusu): útrata se zapíše a kasa odečte v jedné dávce.
 */
export async function paySquadPub(
  db: D1Database,
  o: { fundTeamId: string; budgetTeamId: string; cost: number; description: string; gameDate: string },
): Promise<SquadPubPayment> {
  const cost = Math.max(0, Math.round(o.cost));
  let fromFund = Math.min(cost, await fineFundBalance(db, o.fundTeamId));
  if (fromFund > 0) {
    const id = crypto.randomUUID();
    const [inserted] = await db.batch([
      db.prepare(
        `INSERT INTO fine_fund_spends (id, team_id, amount_czk, description, game_date)
         SELECT ?, ?, ?, ?, ? WHERE (SELECT fine_fund_balance FROM teams WHERE id = ?) >= ?`,
      ).bind(id, o.fundTeamId, fromFund, o.description, o.gameDate.slice(0, 10), o.fundTeamId, fromFund),
      db.prepare("UPDATE teams SET fine_fund_balance = fine_fund_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM fine_fund_spends WHERE id = ?)")
        .bind(fromFund, o.fundTeamId, id),
    ]);
    if ((inserted.meta?.changes ?? 0) === 0) {
      logger.warn({ module: M, teamId: o.fundTeamId }, `kasa pokut se mezitím změnila, ${o.description} platí klub celé`);
      fromFund = 0;
    }
  }
  const fromBudget = cost - fromFund;
  if (fromBudget > 0) {
    await recordTransaction(db, o.budgetTeamId, "event", -fromBudget,
      fromFund > 0 ? `${o.description} (doplatek ke kase pokut)` : o.description, o.gameDate);
  }
  return { fromFund, fromBudget };
}
