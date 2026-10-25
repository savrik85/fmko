/**
 * Přáteláky s AI kluby na skutečné D1 (Miniflare, všechny migrace).
 *
 * Člověk smí AI klub vyzvat stejně jako lidský, AI trenér výzvu vyřídí stejnými službami
 * jako člověk (s lidskou prodlevou, podle povahy) a občas sám vypíše nabídku termínu.
 * AI klubu se nepíše: SMS ani notifikace pro něj nevznikají.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { friendliesRouter } from "../routes/friendlies";
import { createSession } from "../auth/session";
import { addDays } from "../multiplayer/friendlies";
import { sendChallenge } from "../multiplayer/friendly-actions";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  friendlySpendLimit, maxFriendlyStake, maybeOfferFriendly, replyDue, respondToFriendlyChallenges,
} from "./friendlies";
import type { Bindings } from "../index";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", friendliesRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;

const TODAY = "2026-11-02";
/** 20:30 v Praze: pozdější než každá hodina odpovědi (8–20). */
const EVENING = new Date("2026-11-02T19:30:00.000Z");
/** 12:30 v Praze: přes den, kdy trenér vypisuje nabídky. */
const NOON = new Date("2026-11-02T11:30:00.000Z");

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("test-team", null), ...over };
}

async function setGameDay(day: string): Promise<void> {
  await db.prepare("UPDATE teams SET game_date = ?").bind(`${day}T16:00:00.000Z`).run();
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

async function messagesOf(teamId: string): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? ORDER BY m.sent_at, m.id",
  ).bind(teamId).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }

  const villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 6").all<{ id: string }>()).results;
  const team = (id: string, user: string, village: string, name: string, budget: number) =>
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, game_date) VALUES (?, ?, ?, ?, ?, 'league-1', ?)")
      .bind(id, user, village, name, budget, `${TODAY}T16:00:00.000Z`);
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x'), ('u-other', 'other@example.test', 'x')"),
    team("human", "u-human", villages[0].id, "Jiskra Husinec", 50_000),
    team("other", "u-other", villages[1].id, "Sokol Lhenice", 50_000),
    team("ai-1", "ai", villages[2].id, "TJ Netolice", 60_000),
    team("ai-2", "ai", villages[3].id, "SK Stachy", 60_000),
    team("ai-3", "ai", villages[4].id, "FK Zdíkov", 60_000),
  ]);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

describe("povaha AI trenéra u přáteláků", () => {
  it("šetrný trenér sází málo, odvážný a rozhazovačný víc, vždy po krocích sázky", () => {
    expect(maxFriendlyStake({ thrift: 90, risk: 20 })).toBe(500);
    expect(maxFriendlyStake({ thrift: 100, risk: 100 })).toBe(0);
    expect(maxFriendlyStake({ thrift: 10, risk: 90 })).toBe(8500);
    expect(maxFriendlyStake({ thrift: 50, risk: 50 }) % 500).toBe(0);
    expect(friendlySpendLimit(100_000, { thrift: 100 })).toBe(5_000);
    expect(friendlySpendLimit(-5_000, { thrift: 0 })).toBe(0);
  });

  it("odpověď ne hned po odeslání, ale vždy do termínu", () => {
    // Hraje se zítra: odpoví hned.
    expect(replyDue({ today: TODAY, sentDay: TODAY, matchDate: addDays(TODAY, 1), hour: 9, replyHour: 18 })).toBe(true);
    // Odeslaná dnes na pozdější den: počká do zítřka.
    expect(replyDue({ today: TODAY, sentDay: TODAY, matchDate: addDays(TODAY, 5), hour: 20, replyHour: 8 })).toBe(false);
    // Starší výzva: od své hodiny odpovědi.
    expect(replyDue({ today: TODAY, sentDay: addDays(TODAY, -1), matchDate: addDays(TODAY, 4), hour: 10, replyHour: 14 })).toBe(false);
    expect(replyDue({ today: TODAY, sentDay: addDays(TODAY, -1), matchDate: addDays(TODAY, 4), hour: 14, replyHour: 14 })).toBe(true);
  });
});

describe("výzva AI klubu", () => {
  it("člověk vyzve AI klub přes routu, AI odpoví až další den a přijme; AI klub nedostane SMS", async () => {
    await setGameDay(TODAY);
    const token = await createSession(env.SESSION_KV, "u-human", "human@example.test", "human");
    const res = await app.request("/api/teams/human/challenge/ai-1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: addDays(TODAY, 4), venue: "challenger", costPayer: "each", stake: 0 }),
    }, env);
    expect(res.status).toBe(200);
    const { challengeId } = await res.json() as { challengeId: string };

    // Přehled nabízí AI klub mezi soupeři.
    const overview = await app.request("/api/teams/human/challenges", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(overview.status).toBe(200);
    const body = await overview.json() as { teams: Array<{ id: string }> };
    expect(body.teams.map((t) => t.id)).toContain("ai-1");

    // Týž den výzvu nechá ležet.
    expect(await respondToFriendlyChallenges(db, "ai-1", profile({ thrift: 40, risk: 50 }), EVENING)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM challenges WHERE id = ? AND status = 'pending'", challengeId)).toBe(1);

    // Druhý den večer přijme: termín volný, bez sázky, náklady malé.
    await setGameDay(addDays(TODAY, 1));
    expect(await respondToFriendlyChallenges(db, "ai-1", profile({ thrift: 40, risk: 50 }), EVENING)).toBe(1);
    const ch = await db.prepare("SELECT status, match_id FROM challenges WHERE id = ?").bind(challengeId).first<{ status: string; match_id: string | null }>();
    expect(ch?.status).toBe("accepted");
    const match = await db.prepare("SELECT home_team_id, away_team_id, status FROM matches WHERE id = ?").bind(ch!.match_id).first<{ home_team_id: string; away_team_id: string; status: string }>();
    expect(match).toEqual({ home_team_id: "human", away_team_id: "ai-1", status: "scheduled" });

    expect((await messagesOf("human")).some((m) => m.includes("TJ Netolice výzvu přijal"))).toBe(true);
    expect(await messagesOf("ai-1")).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = 'ai-1'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = 'human'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE team_id = 'ai-1' AND kind = 'friendly_reply' AND context_ref = ?", challengeId)).toBe(1);
  }, 60_000);

  it("vysokou sázku šetrný trenér odmítne a vyzyvatel dostane zprávu", async () => {
    await setGameDay(TODAY);
    const r = await sendChallenge(db, "other", "ai-2", { date: addDays(TODAY, 1), stake: 5_000 }, { now: NOON });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Hraje se zítra, takže odpoví hned.
    expect(await respondToFriendlyChallenges(db, "ai-2", profile({ thrift: 90, risk: 20 }), NOON)).toBe(1);
    const ch = await db.prepare("SELECT status FROM challenges WHERE id = ?").bind(r.challengeId).first<{ status: string }>();
    expect(ch?.status).toBe("declined");
    expect((await messagesOf("other")).some((m) => m.includes("SK Stachy výzvu na přátelák odmítl"))).toBe(true);
    const budgets = await db.prepare("SELECT id, budget FROM teams WHERE id IN ('other', 'ai-2') ORDER BY id").all<{ id: string; budget: number }>();
    expect(budgets.results).toEqual([{ id: "ai-2", budget: 60_000 }, { id: "other", budget: 50_000 }]);
  }, 60_000);

  it("v režimu shadow nic neprovede a rozhodnutí zapíše jen jednou", async () => {
    await setGameDay(TODAY);
    const r = await sendChallenge(db, "other", "ai-3", { date: addDays(TODAY, 1) }, { now: NOON });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await respondToFriendlyChallenges(db, "ai-3", profile(), NOON, { mode: "shadow" })).toBe(0);
    expect(await respondToFriendlyChallenges(db, "ai-3", profile(), NOON, { mode: "shadow" })).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM challenges WHERE id = ? AND status = 'pending'", r.challengeId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE team_id = 'ai-3' AND mode = 'shadow' AND context_ref = ?", r.challengeId)).toBe(1);
  }, 60_000);
});

describe("nabídka termínu od AI klubu", () => {
  it("vzácně, nejvýš jednou za den a nejvýš jedna otevřená nabídka, podle pravidel nabídek", async () => {
    const bold = profile({ ambition: 100, risk: 100, thrift: 30 });
    let posted = 0;
    let postedOn: string | null = null;
    for (let i = 0; i < 90 && posted === 0; i++) {
      const day = addDays("2026-12-01", i);
      await setGameDay(day);
      if (await maybeOfferFriendly(db, "ai-3", bold, NOON)) { posted++; postedOn = day; }
      // Druhý pokus týž den nic neudělá (nárok na den).
      expect(await maybeOfferFriendly(db, "ai-3", bold, NOON)).toBe(false);
    }
    expect(posted).toBe(1);
    const offers = await db.prepare("SELECT match_date, venue, cost_payer, stake FROM friendly_offers WHERE team_id = 'ai-3'")
      .all<{ match_date: string; venue: string; cost_payer: string; stake: number }>();
    expect(offers.results).toHaveLength(1);
    const offer = offers.results[0];
    expect(offer.match_date >= addDays(postedOn!, 3) && offer.match_date <= addDays(postedOn!, 10)).toBe(true);
    expect(offer.cost_payer).toBe("each");
    expect(offer.stake % 500).toBe(0);

    // S otevřenou nabídkou další nevypíše.
    for (let i = 1; i <= 20; i++) {
      await setGameDay(addDays(postedOn!, i));
      expect(await maybeOfferFriendly(db, "ai-3", bold, NOON)).toBe(false);
    }
    // V noci nevypisuje vůbec.
    await setGameDay("2027-03-01");
    expect(await maybeOfferFriendly(db, "ai-1", bold, new Date("2027-03-01T01:00:00.000Z"))).toBe(false);
  }, 120_000);
});
