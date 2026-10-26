/**
 * Nabídky místních hráčů AI klubů na skutečné D1 (Miniflare, všechny migrace).
 *
 * AI klub dostane nabídku od denního kroku stejně jako člověk, jen bez SMS. Jednou za herní den
 * o ní rozhodne model: podepsat stejnou službou jako člověk (hráč, smlouva, registrace), nebo
 * odmítnout. Nesmysl modelu nahradí pravidlo podle povahy, plnou soupisku a prázdnou kasu hlídá
 * kód bez modelu. V režimu shadow se jen zapíše deník. AI klubu se nic nepíše.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { generatePlayerOffer, receivesPlayerOffers } from "../events/player-offers";
import { createRng } from "../generators/rng";
import { gameRouter } from "../routes/game";
import { COACH_MODEL } from "./llm";
import { handlePlayerOffers } from "./player-offers";
import { generateAiProfile, type AiCoachProfile } from "./profile";

let mf: Miniflare;
let db: D1Database;
let baseEnv: Bindings;

/** 19:30 v Praze: po hodině, kdy se klub na nabídky dívá (9–19), a ještě přes den. */
const NOW = new Date("2026-11-02T18:30:00.000Z");
const GAME_DAY = "2026-11-02";
const GAME_DATE = `${GAME_DAY}T16:00:00.000Z`;
const EXPIRES = "2026-11-06T16:00:00.000Z";
const VILLAGE = { region_code: "Prachatice", category: "obec" as const, population: 500, district: "Prachatice" };

const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({
  ...generateAiProfile("player-offer-test", null), thrift: 40, youthFocus: 40, favouriteFormations: ["4-4-2"], ...over,
});

/** Kádr 18 hráčů áčka: záloha s jasnou jedničkou (MID 60), útok 47/45/42/40. */
const SQUAD: Array<[string, string, number, number]> = [
  ["gk1", "GK", 50, 28], ["gk2", "GK", 42, 31],
  ["def1", "DEF", 48, 26], ["def2", "DEF", 46, 27], ["def3", "DEF", 45, 25], ["def4", "DEF", 44, 29], ["def5", "DEF", 42, 30], ["def6", "DEF", 40, 31],
  ["mid1", "MID", 60, 24], ["mid2", "MID", 45, 26], ["mid3", "MID", 44, 27], ["mid4", "MID", 43, 28], ["mid5", "MID", 41, 30], ["mid6", "MID", 40, 32],
  ["fwd1", "FWD", 47, 26], ["fwd2", "FWD", 45, 27], ["fwd3", "FWD", 42, 29], ["fwd4", "FWD", 40, 30],
];

const AI_CLUBS = ["ai-1", "ai-2", "ai-3", "ai-4", "ai-5", "ai-6"];

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function budgetOf(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
}

async function offerStatus(offerId: string): Promise<string | null> {
  return (await db.prepare("SELECT status FROM player_offers WHERE id = ?").bind(offerId).first<{ status: string }>())?.status ?? null;
}

async function decisionsOf(teamId: string) {
  return (await db.prepare(
    "SELECT kind, mode, model, context_ref, actions, executed, used_fallback, error, tokens_in, tokens_out FROM ai_coach_decisions WHERE team_id = ? ORDER BY created_at, rowid",
  ).bind(teamId).all<{
    kind: string; mode: string; model: string | null; context_ref: string; actions: string; executed: string | null;
    used_fallback: number; error: string | null; tokens_in: number | null; tokens_out: number | null;
  }>()).results;
}

/** AI klubu se nepíše: žádná konverzace, zpráva ani oznámení. */
async function textsTo(teamId: string): Promise<number> {
  return await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ?", teamId)
    + await count("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ?", teamId)
    + await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", teamId);
}

interface FakeInput {
  messages: Array<{ content: string }>;
  response_format?: { json_schema: { schema: { properties: { decisions: { items: { properties: { offer: { enum: string[] } } } } } } } };
}

/** Workers AI s připravenou odpovědí: zapisuje prompty a výčet nabídek ze schématu. */
function fakeAi(answer: unknown) {
  const prompts: string[] = [];
  const offerEnums: string[][] = [];
  const ai = {
    run: async (_model: string, input: FakeInput) => {
      prompts.push(input.messages[1].content);
      offerEnums.push(input.response_format?.json_schema.schema.properties.decisions.items.properties.offer.enum ?? []);
      return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return { prompts, offerEnums, env: { ...baseEnv, AI: ai } as unknown as Bindings };
}

/** POST na routu hry, jak ho posílá web (přihlášení přes Bearer token). */
async function postRoute(path: string, token?: string): Promise<Response> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;
  return gameRouter.fetch(new Request(`http://test.local${path}`, { method: "POST", headers }), baseEnv, ctx);
}

/** Čekající nabídka místního hráče, jak ji zakládá denní krok (events/player-offers.ts). */
async function insertOffer(
  id: string, teamId: string,
  o: { source?: string; position: string; rating: number; age: number; wage: number; talent?: number },
): Promise<void> {
  await db.prepare(
    `INSERT INTO player_offers (id, team_id, source, source_name, message, first_name, last_name, age, position, overall_rating,
       skills, physical, personality, life_context, avatar, weekly_wage, expires_at, nationality)
     VALUES (?, ?, ?, 'Hospodský', 'Přišel tady jeden, prý umí kopat.', 'Karel', ?, ?, ?, ?, ?, '{}', ?, '{}', '{}', ?, ?, 'CZ')`,
  ).bind(
    id, teamId, o.source ?? "pub", `Místní-${id}`, o.age, o.position, o.rating, JSON.stringify({ passing: o.rating, speed: o.rating }),
    JSON.stringify({ patriotism: 60, hiddenTalent: o.talent ?? 10 }), o.wage, EXPIRES,
  ).run();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  baseEnv = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }

  const villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 8").all<{ id: string }>()).results;
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
  ];
  const clubs: Array<[string, string]> = [["human", "u-human"], ...AI_CLUBS.map((id) => [id, "ai"] as [string, string])];
  clubs.forEach(([id, user], i) => {
    stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, game_date) VALUES (?, ?, ?, ?, 100000, 'league-1', ?)")
      .bind(id, user, villages[i].id, `Klub ${id}`, GAME_DATE));
    for (const [pid, position, rating, age] of SQUAD) {
      stmts.push(db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage)
         VALUES (?, ?, 'Hráč', ?, ?, ?, ?, '{}', '{}', '{}', '{}', '{}', ?)`,
      ).bind(`${id}-${pid}`, id, pid, age, position, rating, 10 + rating * 4));
    }
  });
  await db.batch(stmts);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

describe("nabídka místního hráče z denního kroku", () => {
  it("AI klub ji dostane stejně jako člověk, jen bez SMS; U21 ne", async () => {
    expect(receivesPlayerOffers({ user_id: "ai", team_type: null, game_date: GAME_DATE, village_district: "Prachatice" })).toBe(true);
    expect(receivesPlayerOffers({ user_id: "u-human", team_type: "senior", game_date: GAME_DATE, village_district: "Prachatice" })).toBe(true);
    expect(receivesPlayerOffers({ user_id: "ai", team_type: "u21", game_date: GAME_DATE, village_district: "Prachatice" })).toBe(false);
    expect(receivesPlayerOffers({ user_id: "ai", team_type: null, game_date: null, village_district: "Prachatice" })).toBe(false);

    const ai = await generatePlayerOffer(db, createRng(7), "ai-1", "Prachatice", VILLAGE, GAME_DATE);
    expect(ai).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM player_offers WHERE team_id = 'ai-1' AND status = 'pending' AND id = ?", ai!.offerId)).toBe(1);
    expect(await textsTo("ai-1")).toBe(0);

    // Člověk dál dostane SMS od toho, kdo hráče přivedl.
    const human = await generatePlayerOffer(db, createRng(7), "human", "Prachatice", VILLAGE, GAME_DATE);
    expect(human).not.toBeNull();
    const sms = (await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'human'",
    ).all<{ body: string }>()).results;
    expect(sms).toHaveLength(1);
    expect(sms[0].body).toContain(human!.playerName);
  }, 60_000);
});

describe("AI trenér a nabídky místních hráčů", () => {
  it("model hráče podepíše stejnou službou jako člověk: hráč v kádru, smlouva, registrace; AI klubu se nic nepíše", async () => {
    await insertOffer("offer-sign", "ai-2", { position: "MID", rating: 46, age: 27, wage: 194 });
    const { prompts, offerEnums, env } = fakeAi({ decisions: [{ offer: "O1", action: "sign", reason: "He strengthens our midfield." }], reasoning: "Thin midfield." });
    const res = await handlePlayerOffers(env, "ai-2", profile(), NOW, { mode: "on", ai: env });

    expect(res.status).toBe("done");
    expect(res.decisions).toEqual([expect.objectContaining({ key: "O1", offerId: "offer-sign", action: "sign", decidedBy: "model" })]);
    expect(res.executed).toEqual([expect.objectContaining({ offerId: "offer-sign", action: "sign", ok: true, playerId: expect.any(String) })]);
    expect(prompts).toHaveLength(1);
    expect(offerEnums[0]).toEqual(["O1"]);
    expect(prompts[0]).toContain("O1: the pub landlord heard of him. MID, age 27, rating 46, weekly wage 194 CZK; the offer expires in 4 days.");
    expect(prompts[0]).toContain("he would be your 2nd best MID");
    expect(prompts[0]).not.toContain("offer-sign");

    const playerId = res.executed[0].playerId!;
    const player = await db.prepare("SELECT team_id, position, overall_rating, weekly_wage, status FROM players WHERE id = ?").bind(playerId)
      .first<{ team_id: string; position: string; overall_rating: number; weekly_wage: number; status: string }>();
    expect(player).toEqual({ team_id: "ai-2", position: "MID", overall_rating: 46, weekly_wage: 194, status: "active" });
    expect(await count("SELECT COUNT(*) AS n FROM player_contracts WHERE player_id = ? AND team_id = 'ai-2' AND join_type = 'pub' AND is_active = 1", playerId)).toBe(1);
    expect(await offerStatus("offer-sign")).toBe("accepted");
    expect(await budgetOf("ai-2")).toBe(99_500);
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 'ai-2' AND type = 'signing_fee' AND amount = -500")).toBe(1);

    const log = await decisionsOf("ai-2");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "player_offer", mode: "on", model: COACH_MODEL, context_ref: GAME_DAY, used_fallback: 0, error: null, tokens_in: 10, tokens_out: 5 });
    expect(JSON.parse(log[0].executed!)).toEqual([expect.objectContaining({ offerId: "offer-sign", ok: true })]);
    expect(await textsTo("ai-2")).toBe(0);

    // Jednou za herní den: další hodina už nic.
    expect((await handlePlayerOffers(env, "ai-2", profile(), new Date(NOW.getTime() + 600_000), { mode: "on", ai: env })).status).toBe("nothing");
    await insertOffer("offer-later", "ai-2", { position: "DEF", rating: 30, age: 35, wage: 130 });
    expect((await handlePlayerOffers(env, "ai-2", profile(), new Date(NOW.getTime() + 900_000), { mode: "on", ai: env })).status).toBe("duplicate");
    expect(prompts).toHaveLength(1);
  }, 60_000);

  it("neplatná odpověď modelu: za každou nabídku rozhodne náhradní pravidlo podle povahy", async () => {
    // Silný záložník (62) by hrál v základu, starý slabý útočník (25) se nehodí.
    await insertOffer("offer-strong", "ai-3", { position: "MID", rating: 62, age: 25, wage: 258 });
    await insertOffer("offer-weak", "ai-3", { source: "recommendation", position: "FWD", rating: 25, age: 36, wage: 110 });
    const { prompts, env } = fakeAi({ decisions: [{ offer: "O7", action: "sign", reason: "x" }, { offer: "O2", action: "buy", reason: "y" }], reasoning: "" });
    const res = await handlePlayerOffers(env, "ai-3", profile(), NOW, { mode: "on", ai: env });

    expect(prompts).toHaveLength(1);
    expect(res.decisions).toEqual([
      expect.objectContaining({ offerId: "offer-strong", action: "sign", decidedBy: "fallback" }),
      expect.objectContaining({ offerId: "offer-weak", action: "decline", decidedBy: "fallback" }),
    ]);
    expect(res.executed).toEqual([
      expect.objectContaining({ offerId: "offer-strong", action: "sign", ok: true }),
      expect.objectContaining({ offerId: "offer-weak", action: "decline", ok: true }),
    ]);
    expect(await offerStatus("offer-strong")).toBe("accepted");
    expect(await offerStatus("offer-weak")).toBe("rejected");
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = 'ai-3'")).toBe(SQUAD.length + 1);

    const [log] = await decisionsOf("ai-3");
    expect(log).toMatchObject({ kind: "player_offer", used_fallback: 1 });
    expect(log.error).toContain("zahozeno");
    expect(log.error).toContain("O2: buy není v nabídce");
    expect(await textsTo("ai-3")).toBe(0);
  }, 60_000);

  it("bez peněz nad rezervou zbývá jen odmítnout: rozhodne kód a model se neptá", async () => {
    await db.prepare("UPDATE teams SET budget = 3000 WHERE id = 'ai-4'").run();
    await insertOffer("offer-broke", "ai-4", { position: "MID", rating: 62, age: 25, wage: 258 });
    const { prompts, env } = fakeAi({ decisions: [{ offer: "O1", action: "sign", reason: "x" }], reasoning: "" });
    const res = await handlePlayerOffers(env, "ai-4", profile(), NOW, { mode: "on", ai: env });

    expect(prompts).toHaveLength(0);
    expect(res.decisions).toEqual([{ key: null, offerId: "offer-broke", action: "decline", reason: "too_expensive", decidedBy: "guard" }]);
    expect(await offerStatus("offer-broke")).toBe("rejected");
    expect(await budgetOf("ai-4")).toBe(3000);
    expect(await decisionsOf("ai-4")).toEqual([expect.objectContaining({ kind: "player_offer", used_fallback: 0, error: null })]);
  }, 60_000);

  it("v režimu shadow rozhodne a zapíše, ale nic neprovede", async () => {
    await insertOffer("offer-shadow", "ai-5", { position: "MID", rating: 50, age: 24, wage: 210 });
    const { prompts, env } = fakeAi({ decisions: [{ offer: "O1", action: "sign", reason: "Good." }], reasoning: "" });
    const res = await handlePlayerOffers(env, "ai-5", profile(), NOW, { mode: "shadow", ai: env });

    expect(prompts).toHaveLength(1);
    expect(res.decisions).toEqual([expect.objectContaining({ action: "sign", decidedBy: "model" })]);
    expect(res.executed).toEqual([]);
    expect(await offerStatus("offer-shadow")).toBe("pending");
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = 'ai-5'")).toBe(SQUAD.length);
    expect(await budgetOf("ai-5")).toBe(100_000);
    expect(await decisionsOf("ai-5")).toEqual([expect.objectContaining({ kind: "player_offer", mode: "shadow", executed: null })]);
  }, 60_000);

  it("ráno ještě ne, lidský klub vůbec ne", async () => {
    await insertOffer("offer-morning", "ai-6", { position: "MID", rating: 50, age: 24, wage: 210 });
    await insertOffer("offer-human", "human", { position: "MID", rating: 50, age: 24, wage: 210 });
    const { prompts, env } = fakeAi({ decisions: [], reasoning: "" });
    // 7:30 v Praze: dřív, než se kterýkoli klub na nabídky podívá (nejdřív v 9).
    expect((await handlePlayerOffers(env, "ai-6", profile(), new Date("2026-11-02T06:30:00.000Z"), { mode: "on", ai: env })).status).toBe("not_yet");
    expect((await handlePlayerOffers(env, "human", profile(), NOW, { mode: "on", ai: env })).status).toBe("not_ai");
    expect(prompts).toHaveLength(0);
    expect(await offerStatus("offer-morning")).toBe("pending");
    expect(await offerStatus("offer-human")).toBe("pending");
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id IN ('ai-6', 'human')")).toBe(0);
  }, 60_000);
});

describe("routa pro člověka po přesunu do služby", () => {
  it("přijetí vrátí hráče pro kartu odhalení a strhne registraci, opakované přijetí 404, odmítnutí projde; bez přihlášení 401", async () => {
    await baseEnv.SESSION_KV.put("session:human-token", JSON.stringify({ userId: "u-human", email: "human@example.test", teamId: "human", createdAt: GAME_DATE }));
    await insertOffer("offer-route-accept", "human", { position: "DEF", rating: 47, age: 26, wage: 198 });
    await insertOffer("offer-route-reject", "human", { position: "FWD", rating: 41, age: 30, wage: 174 });
    const budget = await budgetOf("human");

    expect((await postRoute("/teams/human/player-offers/offer-route-accept/accept")).status).toBe(401);
    expect(await offerStatus("offer-route-accept")).toBe("pending");

    const accepted = await postRoute("/teams/human/player-offers/offer-route-accept/accept", "human-token");
    expect(accepted.status).toBe(200);
    const body = await accepted.json() as { ok: boolean; player: { team_id: string; overall_rating: number; weekly_wage: number; skills: Record<string, number> } };
    expect(body.ok).toBe(true);
    expect(body.player).toMatchObject({ team_id: "human", overall_rating: 47, weekly_wage: 198, skills: { passing: 47, speed: 47 } });
    expect(await offerStatus("offer-route-accept")).toBe("accepted");
    expect(await budgetOf("human")).toBe(budget - 500);

    const again = await postRoute("/teams/human/player-offers/offer-route-accept/accept", "human-token");
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "Nabídka nenalezena" });

    const rejected = await postRoute("/teams/human/player-offers/offer-route-reject/reject", "human-token");
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toEqual({ ok: true });
    expect(await offerStatus("offer-route-reject")).toBe("rejected");
  }, 60_000);
});
