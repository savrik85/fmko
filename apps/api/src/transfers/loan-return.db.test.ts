/**
 * Hostující hráč v U21 hostitele: do U21 jen trvale, a každý návrat z hostování ho vrátí
 * kmenovému klubu čistého (bez příznaků návratu z U21) a se zavřenou smlouvou hostování.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransferTestDb, insertTestPlayer, TEST_GAME_DATE, type TransferTestDb } from "../test-support/transfer-db";

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: async () => undefined }));
vi.mock("../players/squad-numbers", () => ({ ensureSquadNumbers: async () => undefined }));
vi.mock("../transfers/demands", () => ({ closeDemandsForArrival: async () => undefined }));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { gameRouter } from "../routes/game";
import { sendPlayerToU21 } from "../services/u21-moves";
import { returnNextMatchPlayers } from "../season/u21-return";
import { recallLoan } from "./loan-agreements";
import { closeLoanContractStmt, returnLoanedPlayerStmt } from "./loan-return";

const LOAN_UNTIL = "2026-12-31T12:00:00.000Z";

describe("hostující hráč v U21 hostitele", () => {
  let t: TransferTestDb;

  beforeAll(async () => {
    t = await createTransferTestDb();
    await t.env.SESSION_KV.put("session:buyer-token", JSON.stringify({ userId: "user-buyer", email: "b@test.local", teamId: "buyer-a", createdAt: TEST_GAME_DATE }));
    await t.env.SESSION_KV.put("session:third-token", JSON.stringify({ userId: "user-third", email: "t@test.local", teamId: "third-a", createdAt: TEST_GAME_DATE }));
  });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    // Hráč klubu seller-a hostuje v klubu buyer-a; smlouva hostování je vedená na áčko hostitele.
    await insertTestPlayer(t.db, { id: "loanee", teamId: "buyer-a", age: 19, loanFrom: "seller-a", loanUntil: LOAN_UNTIL });
    await t.db.batch([
      t.db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES ('c-home', 'loanee', 'seller-a', 'season', 'generated', 0, 1)"),
      t.db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES ('c-loan', 'loanee', 'buyer-a', 'season', 'loan', 5000, 1)"),
      t.db.prepare(`INSERT INTO loan_agreements (id, player_id, lender_team_id, borrower_team_id, playing_time, fee, started_at, until, created_at)
        VALUES ('la', 'loanee', 'seller-a', 'buyer-a', 'none', 5000, ?, ?, ?)`).bind(TEST_GAME_DATE, LOAN_UNTIL, TEST_GAME_DATE),
    ]);
  });

  const player = () => t.db.prepare(
    "SELECT team_id, loan_from_team_id, loan_until, parent_club_id, next_match_return FROM players WHERE id = 'loanee'",
  ).first<{ team_id: string; loan_from_team_id: string | null; loan_until: string | null; parent_club_id: string | null; next_match_return: number }>();
  const contract = (id: string) => t.db.prepare("SELECT is_active, leave_type FROM player_contracts WHERE id = ?").bind(id)
    .first<{ is_active: number; leave_type: string | null }>();
  const HOME = { team_id: "seller-a", loan_from_team_id: null, loan_until: null, parent_club_id: null, next_match_return: 0 };

  /** Stav, který šel vyrobit před opravou: hostující hráč poslaný do U21 na jeden zápas. */
  const putInHostU21 = (flags: { nextMatch: boolean }) => t.db.prepare(
    "UPDATE players SET team_id = 'buyer-u21', parent_club_id = ?, next_match_return = ? WHERE id = 'loanee'",
  ).bind(flags.nextMatch ? "buyer-a" : null, flags.nextMatch ? 1 : 0).run();

  it("na jeden zápas hostujícího hráče do U21 poslat nejde", async () => {
    const res = await sendPlayerToU21(t.db, "buyer-a", "loanee", "next_match");
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(await player()).toMatchObject({ team_id: "buyer-a", parent_club_id: null, next_match_return: 0 });
  });

  it("trvale do U21 hostitele jít smí a hostování běží dál", async () => {
    expect(await sendPlayerToU21(t.db, "buyer-a", "loanee", "permanent")).toEqual({ ok: true, mode: "permanent" });
    expect(await player()).toEqual({ team_id: "buyer-u21", loan_from_team_id: "seller-a", loan_until: LOAN_UNTIL, parent_club_id: null, next_match_return: 0 });
  });

  it("vlastního hráče jde na jeden zápas poslat jako dřív", async () => {
    await insertTestPlayer(t.db, { id: "own", teamId: "buyer-a", age: 19 });
    expect(await sendPlayerToU21(t.db, "buyer-a", "own", "next_match")).toEqual({ ok: true, mode: "next_match" });
  });

  it("konec hostování (příkazy denního ticku) vrátí hráče z U21 hostitele čistého a zavře smlouvu", async () => {
    await putInHostU21({ nextMatch: true });
    await returnLoanedPlayerStmt(t.db, "loanee", "seller-a").run();
    await closeLoanContractStmt(t.db, "loanee", TEST_GAME_DATE, "loan_end").run();

    expect(await player()).toEqual(HOME);
    expect(await contract("c-loan")).toEqual({ is_active: 0, leave_type: "loan_end" });
    expect(await contract("c-home")).toEqual({ is_active: 1, leave_type: null });
  });

  it("po návratu z hostování ho zápas U21 nepřesune zpátky k bývalému hostiteli", async () => {
    // Hráč hostoval z U21 kmenového klubu a ta teď hraje: s příznaky by šel do áčka hostitele.
    await t.db.prepare("UPDATE players SET loan_from_team_id = 'seller-u21' WHERE id = 'loanee'").run();
    await putInHostU21({ nextMatch: true });
    await returnLoanedPlayerStmt(t.db, "loanee", "seller-u21").run();
    await t.db.prepare("INSERT INTO season_calendar (id, league_id, season_number) VALUES ('cal-u21', 'league-u21', 1)").run();

    expect(await returnNextMatchPlayers(t.db, "cal-u21")).toBe(0);
    expect((await player())?.team_id).toBe("seller-u21");
  });

  it("stažení půjčujícím (recallLoan) funguje i pro hráče v U21 hostitele", async () => {
    await putInHostU21({ nextMatch: true });
    const res = await recallLoan(t.db, "seller-a", "la");

    expect(res).toMatchObject({ ok: true });
    expect(await player()).toEqual(HOME);
    expect(await contract("c-loan")).toEqual({ is_active: 0, leave_type: "loan_end" });
    expect(await t.db.prepare("SELECT status FROM loan_agreements WHERE id = 'la'").first()).toEqual({ status: "recalled" });
  });

  async function terminate(teamId: string, token: string) {
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil(p: Promise<unknown>) { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await gameRouter.fetch(new Request(`http://test.local/teams/${teamId}/loans/loanee/terminate`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    }), t.env, ctx);
    await Promise.all(pending);
    return res.status;
  }

  it("hostující klub ukončí hostování i u hráče, kterého má v U21", async () => {
    await putInHostU21({ nextMatch: false });
    expect(await terminate("buyer-a", "buyer-token")).toBe(200);

    expect(await player()).toEqual(HOME);
    expect(await contract("c-loan")).toEqual({ is_active: 0, leave_type: "loan_terminated" });
    expect(await contract("c-home")).toEqual({ is_active: 1, leave_type: null });
    expect(await t.db.prepare("SELECT status FROM loan_agreements WHERE id = 'la'").first()).toEqual({ status: "ended" });
    // SMS o ukončení jde áčku hostitele, ne jeho U21 (tu nikdo nečte).
    const inboxes = (await t.db.prepare("SELECT DISTINCT team_id FROM conversations ORDER BY team_id").all<{ team_id: string }>()).results.map((r) => r.team_id);
    expect(inboxes).toEqual(["buyer-a", "seller-a"]);
  });

  it("cizí klub hostování ukončit nesmí", async () => {
    expect(await terminate("third-a", "third-token")).toBe(403);
    expect((await player())?.loan_from_team_id).toBe("seller-a");
  });
});
