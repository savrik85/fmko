/**
 * Poplatky a doložka se nedají obejít hostováním: u odkupu z hostování se meziligový poplatek
 * počítá z ceny odkupu plus poplatku za hostování a z poplatku za hostování jdou procenta
 * z doložky o příštím přestupu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetOf, createTransferTestDb, insertTestOffer, insertTestPlayer, TEST_GAME_DATE, type TransferTestDb } from "../test-support/transfer-db";

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: async () => undefined }));
vi.mock("../players/squad-numbers", () => ({ ensureSquadNumbers: async () => undefined }));
vi.mock("../transfers/demands", () => ({ closeDemandsForArrival: async () => undefined }));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));
vi.mock("../community/web-push", () => ({ sendWebPushToPlayerWatchers: async () => undefined }));
vi.mock("../services/achievements", () => ({ checkTransferAchievements: async () => undefined }));
vi.mock("../transfers/player-interest", () => ({ computeInterestForOffer: async () => null }));
vi.mock("../transfers/registration-window", () => ({ registrationLockError: async () => null }));
vi.mock("../transfers/promises", () => ({ remindTransferPromise: async () => undefined, clearUnrestAfterTransfer: async () => undefined }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { acceptTransferOffer, createTransferOffer } from "../services/transfer-actions";
import { buyoutLoanFee } from "../competition/transfer-levy";

const LOAN_FEE = 40_000;
const BUYOUT = 1_000;
/** Výchozí meziligový poplatek bez samosprávy soutěže. */
const FEE_PCT = 20;

describe("poplatky a doložka u hostování a odkupu z něj", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    // Kupující hraje jinou soutěž než prodávající: platí se meziligový poplatek.
    await t.db.prepare("UPDATE teams SET league_id = 'league-b' WHERE id = 'buyer-a'").run();
  });

  /** Hráč prodávajícího hostuje u kupujícího za LOAN_FEE a kupující posílá odkup za BUYOUT. */
  async function loanedPlayerWithBuyoutOffer() {
    await insertTestPlayer(t.db, { id: "loanee", teamId: "buyer-a", loanFrom: "seller-a", loanUntil: "2026-12-31T12:00:00.000Z" });
    await t.db.batch([
      t.db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES ('c-home', 'loanee', 'seller-a', 'season', 'generated', 0, 1)"),
      t.db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES ('c-loan', 'loanee', 'buyer-a', 'season', 'loan', ?, 1)").bind(LOAN_FEE),
    ]);
    await insertTestOffer(t.db, { id: "buyout", playerId: "loanee", from: "buyer-a", to: "seller-a", amount: BUYOUT });
  }
  const clause = (pct: number, playerId = "loanee") => t.db.prepare(
    "INSERT INTO sell_on_clauses (id, offer_id, player_id, player_name, beneficiary_team_id, owner_team_id, pct) VALUES ('clause', 'old-offer', ?, 'Jan Hráč', 'third-a', 'seller-a', ?)",
  ).bind(playerId, pct).run();
  const clauseRow = () => t.db.prepare("SELECT status, paid_amount FROM sell_on_clauses WHERE id = 'clause'").first<{ status: string; paid_amount: number | null }>();

  it("buyoutLoanFee: poplatek za běžící hostování u kupujícího, jinak nula", async () => {
    await loanedPlayerWithBuyoutOffer();
    expect(await buyoutLoanFee(t.db, "loanee", "buyer-a")).toBe(LOAN_FEE);
    expect(await buyoutLoanFee(t.db, "loanee", "buyer-u21")).toBe(LOAN_FEE);
    expect(await buyoutLoanFee(t.db, "loanee", "third-a")).toBe(0);
    await insertTestPlayer(t.db, { id: "plain", teamId: "seller-a" });
    expect(await buyoutLoanFee(t.db, "plain", "buyer-a")).toBe(0);
  });

  it("odkup za korunu po drahém hostování: meziligový poplatek z ceny odkupu i poplatku za hostování", async () => {
    await loanedPlayerWithBuyoutOffer();
    const adminFee = Math.round((BUYOUT + LOAN_FEE) * FEE_PCT / 100);

    expect(await acceptTransferOffer(t.env, "seller-a", "buyout")).toMatchObject({ ok: true });
    expect(await budgetOf(t.db, "buyer-a")).toBe(500_000 - BUYOUT - adminFee);
    expect(await budgetOf(t.db, "seller-a")).toBe(100_000 + BUYOUT);
    expect(await t.db.prepare("SELECT amount FROM transactions WHERE team_id = 'buyer-a' AND type = 'transfer_admin_fee'").first()).toEqual({ amount: -adminFee });
    expect(await t.db.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = 'loanee'").first()).toEqual({ team_id: "buyer-a", loan_from_team_id: null });
  });

  it("běžný přestup mezi soutěžemi platí poplatek jen z ceny, jako dřív", async () => {
    await insertTestPlayer(t.db, { id: "plain", teamId: "seller-a" });
    await insertTestOffer(t.db, { id: "plain-offer", playerId: "plain", from: "buyer-a", to: "seller-a", amount: 30_000 });
    expect(await acceptTransferOffer(t.env, "seller-a", "plain-offer")).toMatchObject({ ok: true });
    expect(await budgetOf(t.db, "buyer-a")).toBe(500_000 - 30_000 - 30_000 * FEE_PCT / 100);
  });

  it("odkup, na který kupující s poplatkem z hostování nemá, nejde ani nabídnout", async () => {
    await loanedPlayerWithBuyoutOffer();
    await t.db.prepare("DELETE FROM transfer_offers").run();
    // Na samotný odkup i poplatek z něj by stačilo, na poplatek z hostování ne.
    await t.db.prepare("UPDATE teams SET budget = 5000 WHERE id = 'buyer-a'").run();
    const res = await createTransferOffer(t.env, "buyer-a", { playerId: "loanee", amount: BUYOUT });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM transfer_offers").first()).toEqual({ n: 0 });
  });

  it("starší hostování (bez vyplacených procent): doložka se při odkupu počítá z ceny i poplatku za hostování", async () => {
    await loanedPlayerWithBuyoutOffer();
    await clause(10);
    expect(await acceptTransferOffer(t.env, "seller-a", "buyout")).toMatchObject({ ok: true });
    expect(await clauseRow()).toEqual({ status: "paid", paid_amount: (BUYOUT + LOAN_FEE) / 10 });
    expect(await budgetOf(t.db, "third-a")).toBe(500_000 + (BUYOUT + LOAN_FEE) / 10);
  });

  it("placené hostování hráče s doložkou: procenta z poplatku jdou hned, doložka běží dál, hostování samo bez poplatku soutěži", async () => {
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a" });
    await clause(20, "star");
    await insertTestOffer(t.db, { id: "loan", playerId: "star", from: "buyer-a", to: "seller-a", amount: LOAN_FEE, offerType: "loan", loanDuration: 30 });

    expect(await acceptTransferOffer(t.env, "seller-a", "loan")).toMatchObject({ ok: true });
    const share = LOAN_FEE * 20 / 100;
    expect(await budgetOf(t.db, "buyer-a")).toBe(500_000 - LOAN_FEE);
    expect(await budgetOf(t.db, "seller-a")).toBe(100_000 + LOAN_FEE - share);
    expect(await budgetOf(t.db, "third-a")).toBe(500_000 + share);
    expect(await clauseRow()).toEqual({ status: "active", paid_amount: null });

    // Odkup za korunu: procenta už jen z ceny odkupu, poplatek za hostování se nepočítá podruhé.
    await insertTestOffer(t.db, { id: "buyout", playerId: "star", from: "buyer-a", to: "seller-a", amount: BUYOUT });
    expect(await acceptTransferOffer(t.env, "seller-a", "buyout")).toMatchObject({ ok: true });
    expect(await clauseRow()).toEqual({ status: "paid", paid_amount: BUYOUT * 20 / 100 });
    expect(await budgetOf(t.db, "third-a")).toBe(500_000 + share + BUYOUT * 20 / 100);
    // Meziligový poplatek z odkupu se ale počítá i z poplatku za hostování.
    expect(await budgetOf(t.db, "buyer-a")).toBe(500_000 - LOAN_FEE - BUYOUT - Math.round((BUYOUT + LOAN_FEE) * FEE_PCT / 100));
  });

  it("hostování zdarma u hráče s doložkou nic nevyplácí", async () => {
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a" });
    await clause(20, "star");
    await insertTestOffer(t.db, { id: "loan", playerId: "star", from: "buyer-a", to: "seller-a", amount: 0, offerType: "loan", loanDuration: 30 });
    expect(await acceptTransferOffer(t.env, "seller-a", "loan")).toMatchObject({ ok: true });
    expect(await budgetOf(t.db, "third-a")).toBe(500_000);
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type IN ('sell_on_fee', 'sell_on_income')").first()).toEqual({ n: 0 });
  });
});
