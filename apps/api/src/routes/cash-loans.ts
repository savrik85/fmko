import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { recordTransaction, countRemainingMatchDays } from "../season/finance-processor";

export const cashLoansRouter = new Hono<{ Bindings: Bindings }>();

const MIN_PRINCIPAL = 3_000;
const MAX_PRINCIPAL = 40_000;
const INTEREST_RATE = 0.15;

interface CashLoan {
  id: string;
  team_id: string;
  season_id: string;
  principal: number;
  interest_rate: number;
  total_to_repay: number;
  remaining: number;
  total_installments: number;
  installments_paid: number;
  per_match_installment: number;
  status: string;
  taken_game_date: string;
  taken_at: string;
  paid_off_at: string | null;
}

function mapLoan(row: CashLoan) {
  return {
    id: row.id,
    principal: row.principal,
    interestRate: row.interest_rate,
    totalToRepay: row.total_to_repay,
    remaining: row.remaining,
    totalInstallments: row.total_installments,
    installmentsPaid: row.installments_paid,
    installmentsRemaining: row.total_installments - row.installments_paid,
    perMatchInstallment: row.per_match_installment,
    status: row.status,
    takenGameDate: row.taken_game_date,
    takenAt: row.taken_at,
    paidOffAt: row.paid_off_at,
  };
}

/**
 * GET /api/teams/:teamId/cash-loans
 * Vrací aktivní půjčku, historii, eligibilitu (limit, už braná v sezóně, zbývající zápasy).
 */
cashLoansRouter.get("/teams/:teamId/cash-loans", async (c) => {
  const teamId = c.req.param("teamId");

  const [activeRow, historyResult, remainingInfo, teamRow] = await Promise.all([
    c.env.DB.prepare(
      "SELECT * FROM cash_loans WHERE team_id = ? AND status = 'active' LIMIT 1"
    ).bind(teamId).first<CashLoan>().catch((e) => { logger.warn({ module: "cash-loans" }, "load active loan", e); return null; }),
    c.env.DB.prepare(
      "SELECT * FROM cash_loans WHERE team_id = ? ORDER BY taken_at DESC LIMIT 20"
    ).bind(teamId).all<CashLoan>().catch((e) => { logger.warn({ module: "cash-loans" }, "load loan history", e); return { results: [] as CashLoan[] }; }),
    countRemainingMatchDays(c.env.DB, teamId),
    c.env.DB.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>()
      .catch((e) => { logger.warn({ module: "cash-loans" }, "load team budget", e); return null; }),
  ]);

  const takenThisSeason = remainingInfo.seasonId
    ? await c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM cash_loans WHERE team_id = ? AND season_id = ?"
      ).bind(teamId, remainingInfo.seasonId).first<{ cnt: number }>()
        .catch((e) => { logger.warn({ module: "cash-loans" }, "count season loans", e); return { cnt: 0 }; })
    : { cnt: 0 };

  const activeLoan = activeRow ? mapLoan(activeRow) : null;
  const hasActive = !!activeLoan;
  const alreadyTakenInSeason = (takenThisSeason?.cnt ?? 0) > 0;
  const remainingMatches = remainingInfo.remainingMatches;

  const eligible = !hasActive && !alreadyTakenInSeason && remainingMatches >= 3 && !!remainingInfo.seasonId;
  let ineligibleReason: string | null = null;
  if (hasActive) ineligibleReason = "Již máš aktivní půjčku — nejdřív ji splať.";
  else if (alreadyTakenInSeason) ineligibleReason = "Půjčku lze vzít jednou za sezónu. Další možnost příští sezónu.";
  else if (!remainingInfo.seasonId) ineligibleReason = "Není aktivní sezóna.";
  else if (remainingMatches < 3) ineligibleReason = `Zbývá jen ${remainingMatches} zápasových dní — musíš stihnout aspoň 3 splátky.`;

  return c.json({
    eligible,
    ineligibleReason,
    active: activeLoan,
    history: (historyResult.results ?? []).map(mapLoan),
    rules: {
      minPrincipal: MIN_PRINCIPAL,
      maxPrincipal: MAX_PRINCIPAL,
      interestRate: INTEREST_RATE,
    },
    remainingMatches,
    currentBudget: teamRow?.budget ?? 0,
  });
});

/**
 * POST /api/teams/:teamId/cash-loans
 * Body: { amount: number }
 * Validace: rozsah, žádná aktivní půjčka, žádná v této sezóně, aspoň 3 zbývající zápasové dny.
 */
cashLoansRouter.post("/teams/:teamId/cash-loans", async (c) => {
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ amount?: number }>().catch(() => ({ amount: 0 }));
  const amount = Math.round(body.amount ?? 0);

  if (amount < MIN_PRINCIPAL || amount > MAX_PRINCIPAL) {
    return c.json({
      error: `Částka musí být mezi ${MIN_PRINCIPAL.toLocaleString("cs")} a ${MAX_PRINCIPAL.toLocaleString("cs")} Kč.`,
    }, 400);
  }

  const [existingActive, remainingInfo, teamRow] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id FROM cash_loans WHERE team_id = ? AND status = 'active' LIMIT 1"
    ).bind(teamId).first<{ id: string }>()
      .catch((e) => { logger.warn({ module: "cash-loans" }, "check existing active", e); return null; }),
    countRemainingMatchDays(c.env.DB, teamId),
    c.env.DB.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string }>()
      .catch((e) => { logger.warn({ module: "cash-loans" }, "load team game_date", e); return null; }),
  ]);

  if (existingActive) return c.json({ error: "Již máš aktivní půjčku." }, 400);
  if (!remainingInfo.seasonId) return c.json({ error: "Není aktivní sezóna." }, 400);
  if (remainingInfo.remainingMatches < 3) {
    return c.json({ error: `Zbývá jen ${remainingInfo.remainingMatches} zápasových dní — půjčku lze vzít jen když je ještě aspoň 3 zápasů před koncem sezóny.` }, 400);
  }

  const takenThisSeason = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM cash_loans WHERE team_id = ? AND season_id = ?"
  ).bind(teamId, remainingInfo.seasonId).first<{ cnt: number }>()
    .catch((e) => { logger.warn({ module: "cash-loans" }, "count loans in season", e); return { cnt: 0 }; });

  if ((takenThisSeason?.cnt ?? 0) > 0) {
    return c.json({ error: "Půjčku můžeš vzít pouze jednou za sezónu." }, 400);
  }

  const totalToRepay = Math.round(amount * (1 + INTEREST_RATE));
  const totalInstallments = remainingInfo.remainingMatches;
  const perMatchInstallment = Math.ceil(totalToRepay / totalInstallments);

  const gameDate = teamRow?.game_date ?? new Date().toISOString().slice(0, 10);
  const loanId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO cash_loans
      (id, team_id, season_id, principal, interest_rate, total_to_repay, remaining,
       total_installments, installments_paid, per_match_installment, status, taken_game_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?)`
  ).bind(
    loanId, teamId, remainingInfo.seasonId, amount, INTEREST_RATE, totalToRepay, totalToRepay,
    totalInstallments, perMatchInstallment, gameDate,
  ).run().catch((e) => { logger.error({ module: "cash-loans" }, "insert cash loan failed", e); throw e; });

  await recordTransaction(
    c.env.DB, teamId, "cash_loan_disbursement", amount,
    `Půjčka hotovosti ${amount.toLocaleString("cs")} Kč (úrok 15 %)`,
    gameDate, loanId,
  );

  return c.json({
    ok: true,
    loan: {
      id: loanId,
      principal: amount,
      totalToRepay,
      perMatchInstallment,
      totalInstallments,
      interestRate: INTEREST_RATE,
    },
  });
});
