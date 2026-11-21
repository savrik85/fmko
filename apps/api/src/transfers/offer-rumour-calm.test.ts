/**
 * Drb z hospody (pub/rumours.ts): hráč, kterého trenér včas uklidnil, se po odmítnuté
 * nabídce zlobí míň. Platí jen v klubu, kde s ním trenér mluvil, a jen do data.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const fx = vi.hoisted(() => ({
  computeInterestForOffer: vi.fn(async () => ({ level: 3, score: 85, factors: [{ label: "Lepší klub", delta: 20 }] })),
}));
vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: vi.fn(async () => "conv"), sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("./player-interest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./player-interest")>()),
  computeInterestForOffer: fx.computeInterestForOffer,
}));

import { applyOfferRejectionImpact } from "./offer-rejection-impact";
import { RUMOUR_CALM_UNREST_CUT } from "../pub/rumours";

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
  await db.prepare("INSERT INTO teams VALUES ('home-club', 'FK STS Čkyně', NULL), ('buyer-club', 'FK FORPSI Čkyně', NULL)").run();
});

const DAY_MS = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);

async function unrestAfterRejection(lc: Record<string, unknown>): Promise<number> {
  await db.prepare("INSERT INTO players VALUES ('p1', 'David', 'Novák', NULL, NULL, 'home-club', NULL, '{\"temper\":40}', ?, 60)")
    .bind(JSON.stringify({ morale: 60, ...lc })).run();
  await applyOfferRejectionImpact(db, { id: "o1", player_id: "p1", from_team_id: "buyer-club", to_team_id: "home-club", offer_amount: 40000, offer_type: "transfer" }, "reject");
  const row = await db.prepare("SELECT life_context FROM players WHERE id = 'p1'").first<{ life_context: string }>();
  return JSON.parse(row!.life_context).transferUnrest.level as number;
}

describe("uklidnění po drbu z hospody", () => {
  it("bez uklidnění plná nespokojenost", async () => {
    expect(await unrestAfterRejection({})).toBe(55);
  });

  it("uklidněný hráč se zlobí o polovinu míň", async () => {
    expect(await unrestAfterRejection({ rumourCalm: { until: inDays(10), teamId: "home-club" } }))
      .toBe(Math.round(55 * (1 - RUMOUR_CALM_UNREST_CUT)));
  });

  it("uklidnění z jiného klubu neplatí", async () => {
    expect(await unrestAfterRejection({ rumourCalm: { until: inDays(10), teamId: "buyer-club" } })).toBe(55);
  });

  it("po datu uklidnění neplatí", async () => {
    expect(await unrestAfterRejection({ rumourCalm: { until: inDays(-1), teamId: "home-club" } })).toBe(55);
  });
});
