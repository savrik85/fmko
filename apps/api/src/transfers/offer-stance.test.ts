import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const fx = vi.hoisted(() => ({
  sendPlayerSMS: vi.fn(async () => "conv"),
  computeInterestForOffer: vi.fn(async () => ({ level: 2, score: 60, factors: [{ label: "Lepší klub", delta: 20 }] })),
}));
vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: fx.sendPlayerSMS, sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("./player-interest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./player-interest")>()),
  computeInterestForOffer: fx.computeInterestForOffer,
}));

import { applyOfferRejectionImpact } from "./offer-rejection-impact";
import { OFFER_STANCE_DAYS, stanceForOffer } from "../messaging/player-memory";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  vi.clearAllMocks();
  for (const t of ["teams", "players", "messages", "conversations", "transfer_offers"]) await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, participant_id TEXT)").run();
  await db.prepare("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, body TEXT, sent_at TEXT)").run();
  await db.prepare("CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, created_at TEXT)").run();
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, parent_team_id TEXT)").run();
  await db.prepare(
    `CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, team_id TEXT,
       loan_from_team_id TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER)`,
  ).run();
  await db.prepare("INSERT INTO teams VALUES ('sts', 'FK STS Čkyně', NULL), ('forpsi', 'FK FORPSI Čkyně', NULL)").run();
});

const offer = { id: "o1", player_id: "p1", from_team_id: "forpsi", to_team_id: "sts", offer_amount: 40000, offer_type: "transfer" };
const withStance = (stance: unknown) => db.prepare(
  "INSERT INTO players VALUES ('p1', 'David', 'Novák', NULL, NULL, 'sts', NULL, '{\"temper\":40}', ?, 60)",
).bind(JSON.stringify({ morale: 60, offerStance: stance })).run();
const lifeContext = async () => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = 'p1'").first<{ life_context: string }>())!.life_context);

describe("co hráč o nabídce řekl v SMS", () => {
  it("kdo velmi chtěl přestoupit, toho SMS nepřemluví úplně: trest zůstane", async () => {
    fx.computeInterestForOffer.mockResolvedValueOnce({ level: 3, score: 85, factors: [{ label: "Lepší klub", delta: 20 }] });
    await withStance({ stance: "stay", at: new Date().toISOString(), offerIds: ["o1"] });
    await applyOfferRejectionImpact(db, offer, "reject");
    expect(fx.sendPlayerSMS).toHaveBeenCalled();
  });

  it("chtěl jít, ale v SMS řekl „odmítněte to“: po odmítnutí se nezlobí ani nepíše výčitku", async () => {
    await withStance({ stance: "stay", at: new Date().toISOString(), offerIds: ["o1"] });
    await applyOfferRejectionImpact(db, offer, "reject");
    const lc = await lifeContext();
    expect(lc.transferUnrest).toBeUndefined();
    expect(lc.offerStance).toBeUndefined();
    expect(lc.morale).toBe(60);
    expect(fx.sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("trenér s ním o nabídce psal: výčitka bez „bez jediného slova“", async () => {
    await withStance({ stance: "leave", at: new Date().toISOString(), offerIds: ["o1"] });
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    await db.prepare("INSERT INTO transfer_offers VALUES ('o1', ?)").bind(new Date(Date.now() - 7200_000).toISOString().replace("T", " ").slice(0, 19)).run();
    await db.prepare("INSERT INTO conversations VALUES ('c1', 'sts', 'p1')").run();
    await db.prepare("INSERT INTO messages VALUES ('m1', 'c1', 'user', 'Rozmysli to', ?)").bind(hourAgo).run();
    await applyOfferRejectionImpact(db, offer, "reject");
    const body = (fx.sendPlayerSMS.mock.calls[0] as unknown[])[3] as string;
    expect(body).toMatch(/o tom mluvili|Psali jsme/);
    expect(body).not.toContain("bez jediného slova");
  });

  it("zpráva trenéra z doby před nabídkou se nepočítá", async () => {
    await withStance({ stance: "leave", at: new Date().toISOString(), offerIds: ["o1"] });
    await db.prepare("INSERT INTO transfer_offers VALUES ('o1', ?)").bind(new Date(Date.now() - 3600_000).toISOString()).run();
    await db.prepare("INSERT INTO conversations VALUES ('c1', 'sts', 'p1')").run();
    await db.prepare("INSERT INTO messages VALUES ('m1', 'c1', 'user', 'Ahoj', ?)").bind(new Date(Date.now() - 7200_000).toISOString()).run();
    await applyOfferRejectionImpact(db, offer, "reject");
    const body = (fx.sendPlayerSMS.mock.calls[0] as unknown[])[3] as string;
    expect(body).not.toMatch(/o tom mluvili|Psali jsme/);
  });

  it("postoj platí týden a jen pro nabídky, o kterých věděl", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    const fresh = { stance: "stay", at: "2026-10-23T10:00:00Z", offerIds: ["o1"] };
    expect(stanceForOffer(fresh, "o1", now)).toBe("stay");
    expect(stanceForOffer(fresh, "o2", now)).toBeNull();
    // Bez nabídky, o které věděl, postoj neplatí (jinak by „zůstávám“ platilo na cokoli).
    expect(stanceForOffer({ ...fresh, offerIds: [] }, "o1", now)).toBeNull();
    expect(stanceForOffer({ ...fresh, at: new Date(now - (OFFER_STANCE_DAYS + 1) * 86400_000).toISOString() }, "o1", now)).toBeNull();
    expect(stanceForOffer({ stance: "maybe", at: fresh.at }, "o1", now)).toBeNull();
    expect(stanceForOffer(undefined, "o1", now)).toBeNull();
  });
});
