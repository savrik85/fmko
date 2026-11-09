/**
 * Věk pro áčko: hráč mladší 15 let se přestupem, hostováním, výměnou ani podpisem do áčka
 * nedostane. Jde do U21 klubu, a když ji klub nemá, obchod neprojde.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: async () => undefined }));
vi.mock("../players/squad-numbers", () => ({ ensureSquadNumbers: async () => undefined }));
vi.mock("../transfers/demands", () => ({ closeDemandsForArrival: async () => undefined }));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));
vi.mock("../community/web-push", () => ({ sendWebPushToPlayerWatchers: async () => undefined }));
vi.mock("../services/achievements", () => ({ checkTransferAchievements: async () => undefined, checkFreeAgentSigningAchievements: async () => undefined }));
vi.mock("../transfers/player-interest", () => ({ computeInterestForOffer: async () => null, loadCoachStandings: async () => new Map() }));
vi.mock("../transfers/player-agency", () => ({ evaluateSigningChance: () => ({ accepted: true, chance: 1, factors: [] }) }));
vi.mock("../transfers/registration-window", () => ({ registrationLockError: async () => null }));
vi.mock("../transfers/promises", () => ({ remindTransferPromise: async () => undefined, clearUnrestAfterTransfer: async () => undefined }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { acceptTransferOffer, createTransferOffer, signFreeAgent } from "../services/transfer-actions";
import { SENIOR_MIN_AGE } from "../academy/rules";
import { placeInSeniorSquad } from "./senior-age";

describe("věk pro áčko při příchodu hráče", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    // Kluk pod 15 let v dorostu prodávajícího a dospělý hráč v jeho áčku.
    await insertTestPlayer(t.db, { id: "kid", teamId: "seller-u21", age: SENIOR_MIN_AGE - 1, rating: 30 });
    await insertTestPlayer(t.db, { id: "adult", teamId: "seller-a", age: 24 });
  });

  const teamOf = async (playerId: string) =>
    (await t.db.prepare("SELECT team_id FROM players WHERE id = ?").bind(playerId).first<{ team_id: string }>())?.team_id;

  it("placeInSeniorSquad: od 15 let áčko, mladší U21, bez U21 chyba", async () => {
    expect(await placeInSeniorSquad(t.db, "buyer-a", SENIOR_MIN_AGE)).toEqual({ ok: true, teamId: "buyer-a", squad: "senior" });
    expect(await placeInSeniorSquad(t.db, "buyer-a", SENIOR_MIN_AGE - 1)).toEqual({ ok: true, teamId: "buyer-u21", squad: "u21" });
    expect(await placeInSeniorSquad(t.db, "third-a", SENIOR_MIN_AGE - 1)).toMatchObject({ ok: false });
  });

  it("nabídka na kluka pod 15 let míří do U21 kupujícího, i když klient chtěl áčko", async () => {
    const res = await createTransferOffer(t.env, "buyer-a", { playerId: "kid", amount: 5000 });
    expect(res).toMatchObject({ ok: true });
    expect(await t.db.prepare("SELECT target_squad FROM transfer_offers WHERE player_id = 'kid'").first()).toEqual({ target_squad: "u21" });
  });

  it("klub bez U21 na kluka pod 15 let nabídnout nemůže, přestup ani hostování", async () => {
    expect(await createTransferOffer(t.env, "third-a", { playerId: "kid", amount: 5000 })).toMatchObject({ ok: false, status: 400 });
    expect(await createTransferOffer(t.env, "third-a", { playerId: "kid", amount: 0, offerType: "loan", loanDuration: 30 })).toMatchObject({ ok: false, status: 400 });
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM transfer_offers").first()).toEqual({ n: 0 });
  });

  it("na dospělého hráče nabídne klub bez U21 jako dřív", async () => {
    expect(await createTransferOffer(t.env, "third-a", { playerId: "adult", amount: 30_000 })).toMatchObject({ ok: true });
    expect(await t.db.prepare("SELECT target_squad FROM transfer_offers WHERE player_id = 'adult'").first()).toEqual({ target_squad: "senior" });
  });

  it("přijetí staré nabídky do áčka pošle kluka do U21 kupujícího", async () => {
    await insertTestOffer(t.db, { id: "old", playerId: "kid", from: "buyer-a", to: "seller-u21", amount: 5000, targetSquad: "senior" });
    expect(await acceptTransferOffer(t.env, "seller-a", "old")).toMatchObject({ ok: true });
    expect(await teamOf("kid")).toBe("buyer-u21");
    expect(await t.db.prepare("SELECT team_id FROM player_contracts WHERE player_id = 'kid' AND is_active = 1").first()).toEqual({ team_id: "buyer-u21" });
  });

  it("přijetí staré nabídky klubu bez U21 neprojde a nic se nepohne", async () => {
    await insertTestOffer(t.db, { id: "old", playerId: "kid", from: "third-a", to: "seller-u21", amount: 5000, targetSquad: "senior" });
    expect(await acceptTransferOffer(t.env, "seller-a", "old")).toMatchObject({ ok: false, status: 400 });
    expect(await teamOf("kid")).toBe("seller-u21");
    expect(await t.db.prepare("SELECT status FROM transfer_offers WHERE id = 'old'").first()).toEqual({ status: "pending" });
    expect(await t.db.prepare("SELECT budget FROM teams WHERE id = 'third-a'").first()).toEqual({ budget: 500_000 });
  });

  it("hostování kluka pod 15 let skončí v U21 hostitele a hostování platí", async () => {
    await insertTestOffer(t.db, { id: "loan", playerId: "kid", from: "buyer-a", to: "seller-u21", amount: 0, offerType: "loan", loanDuration: 30 });
    expect(await acceptTransferOffer(t.env, "seller-a", "loan")).toMatchObject({ ok: true });
    expect(await t.db.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = 'kid'").first())
      .toEqual({ team_id: "buyer-u21", loan_from_team_id: "seller-u21" });
  });

  it("hostování dospělého jde do áčka hostitele jako dřív", async () => {
    await insertTestOffer(t.db, { id: "loan", playerId: "adult", from: "buyer-a", to: "seller-a", amount: 0, offerType: "loan", loanDuration: 30 });
    expect(await acceptTransferOffer(t.env, "seller-a", "loan")).toMatchObject({ ok: true });
    expect(await teamOf("adult")).toBe("buyer-a");
  });

  it("hráč pod 15 let na výměnu jde do U21 prodávajícího", async () => {
    await insertTestPlayer(t.db, { id: "swap-kid", teamId: "buyer-u21", age: SENIOR_MIN_AGE - 1, rating: 30 });
    await insertTestOffer(t.db, { id: "swap", playerId: "adult", from: "buyer-a", to: "seller-a", amount: 10_000 });
    await t.db.prepare("INSERT INTO transfer_offer_swap_players (offer_id, player_id, sort_order) VALUES ('swap', 'swap-kid', 0)").run();

    expect(await acceptTransferOffer(t.env, "seller-a", "swap")).toMatchObject({ ok: true });
    expect(await teamOf("adult")).toBe("buyer-a");
    expect(await teamOf("swap-kid")).toBe("seller-u21");
    expect(await t.db.prepare("SELECT team_id FROM player_contracts WHERE player_id = 'swap-kid' AND is_active = 1").first()).toEqual({ team_id: "seller-u21" });
  });

  it("výměnu s klukem pod 15 let klubu bez U21 nabídnout nejde", async () => {
    await insertTestPlayer(t.db, { id: "swap-kid", teamId: "buyer-u21", age: SENIOR_MIN_AGE - 1, rating: 30 });
    await insertTestPlayer(t.db, { id: "third-star", teamId: "third-a", age: 24 });
    const res = await createTransferOffer(t.env, "buyer-a", { playerId: "third-star", amount: 10_000, offeredPlayerIds: ["swap-kid"] });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("volný hráč pod 15 let jde po podpisu do U21, klub bez U21 ho nepodepíše", async () => {
    await t.db.prepare(`INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage)
      VALUES ('fa-kid', 'Test', 'Tomáš', 'Mladý', ?, 'MID', 30, 50)`).bind(SENIOR_MIN_AGE - 1).run();

    expect(await signFreeAgent(t.env, "third-a", "fa-kid", 50)).toMatchObject({ ok: false, status: 400 });
    expect(await t.db.prepare("SELECT id FROM free_agents WHERE id = 'fa-kid'").first()).not.toBeNull();

    const res = await signFreeAgent(t.env, "buyer-a", "fa-kid", 50);
    expect(res).toMatchObject({ ok: true, success: true });
    expect(await teamOf(res.ok ? res.playerId ?? "" : "")).toBe("buyer-u21");
  });
});
