/**
 * Nespokojení hráči AI klubů na skutečné D1 (Miniflare, všechny migrace).
 *
 * AI trenér řeší truc stejnou službou jako člověk (`performUnrestAction`), jen bez textů:
 * model vybere dohodu z nabídky, kód ji zkontroluje a provede, nesmysl nahradí pravidlo
 * podle povahy. Jednou za herní den, v režimu shadow jen zápis do deníku, lidské kluby
 * nechá být a AI klubu nic nepíše.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { marketValue } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { performUnrestAction } from "../transfers/unrest";
import { HOURLY_HOOKS } from "./hourly-hooks";
import { COACH_MODEL } from "./llm";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { resolveUnhappyPlayers } from "./unhappy-players";

let mf: Miniflare;
let db: D1Database;
let baseEnv: Bindings;

const DAY_MS = 86_400_000;
/** 12:30 v Praze: přes den, kdy trenér s hráči jedná. */
const NOW = new Date("2026-11-02T11:30:00.000Z");
const GAME_DAY = "2026-11-02";
const GRAFENAU = JSON.stringify({ name: "SV Grafenau", rating: 60, country: "DE" });

const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({
  ...generateAiProfile("unrest-test", null), thrift: 30, patience: 30, trading: 20, youthFocus: 30, favouriteFormations: ["4-4-2"], ...over,
});

/** Kádr 18 hráčů: hvězda `star` (MID 60) je opora, `spare` (FWD 40) přebývá. */
const SQUAD: Array<[string, string, number, number]> = [
  ["gk1", "GK", 50, 28], ["gk2", "GK", 42, 31],
  ["def1", "DEF", 48, 26], ["def2", "DEF", 46, 27], ["def3", "DEF", 45, 25], ["def4", "DEF", 44, 29], ["def5", "DEF", 42, 30], ["def6", "DEF", 40, 31],
  ["star", "MID", 60, 24], ["mid2", "MID", 45, 26], ["mid3", "MID", 44, 27], ["mid4", "MID", 43, 28], ["mid5", "MID", 41, 30], ["mid6", "MID", 40, 32],
  ["fwd1", "FWD", 47, 26], ["fwd2", "FWD", 45, 27], ["fwd3", "FWD", 42, 29], ["spare", "FWD", 40, 30],
];

const AI_CLUBS = ["ai-1", "ai-2", "ai-3", "ai-4", "ai-5", "ai-6", "ai-7"];

function unhappy(level: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    morale: 50,
    transferUnrest: {
      level, reason: "rejected_offer", teamName: "SV Grafenau", since: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
      reasons: ["money"], deals: [],
      offer: { amount: 40_000, fromTeamId: "virtual_ai", virtualTeamData: GRAFENAU, at: new Date(NOW.getTime() - DAY_MS).toISOString() },
      ...over,
    },
  };
}

async function setUnrest(playerId: string, lifeContext: Record<string, unknown>): Promise<void> {
  await db.prepare("UPDATE players SET life_context = ? WHERE id = ?").bind(JSON.stringify(lifeContext), playerId).run();
}

async function lifeOf(playerId: string): Promise<Record<string, any> | null> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string }>();
  return row ? JSON.parse(row.life_context) : null;
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

async function budgetOf(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
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

/** Workers AI, který vrací připravené odpovědi (poslední se opakuje) a počítá volání. */
function fakeAi(...answers: unknown[]) {
  const calls: Array<{ model: string; input: { messages: Array<{ content: string }> } }> = [];
  const ai = {
    run: async (model: string, input: { messages: Array<{ content: string }> }) => {
      calls.push({ model, input });
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return { calls, env: { ...baseEnv, AI: ai } as unknown as Bindings };
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
      .bind(id, user, villages[i].id, `Klub ${id}`, `${GAME_DAY}T16:00:00.000Z`));
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

describe("nespokojený hráč AI klubu", () => {
  it("platnou volbu modelu provede služba: prémie z kasy, truc klesne, AI klubu se nic nepíše", async () => {
    await setUnrest("ai-1-star", unhappy(60));
    const { calls, env } = fakeAi({ decisions: [{ player: "P1", action: "bonus", reason: "He is our best player." }], reasoning: "Keep the star." });
    const res = await resolveUnhappyPlayers(env, "ai-1", profile(), NOW, { mode: "on", ai: env });

    expect(res.status).toBe("done");
    expect(res.decisions).toEqual([expect.objectContaining({ key: "P1", playerId: "ai-1-star", action: "bonus", decidedBy: "model" })]);
    expect(res.executed).toEqual([expect.objectContaining({ action: "bonus", ok: true, level: 25 })]);
    expect(calls).toHaveLength(1);
    const prompt = calls[0].input.messages[1].content;
    expect(prompt).toContain('"bonus": one-off bonus of 6,000 CZK');
    expect(prompt).toContain("key player");
    expect(prompt).not.toContain("ai-1-star");

    const life = await lifeOf("ai-1-star");
    expect(life?.transferUnrest.level).toBe(25);
    expect(life?.transferUnrest.deals.map((d: { id: string }) => d.id)).toEqual(["bonus"]);
    expect(life?.transferUnrest.lastActionAt).toBe(NOW.toISOString());
    expect(life?.morale).toBe(55);
    expect(await budgetOf("ai-1")).toBe(94_000);
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 'ai-1' AND type = 'player_bonus' AND amount = -6000")).toBe(1);

    const log = await decisionsOf("ai-1");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "unrest", mode: "on", model: COACH_MODEL, context_ref: GAME_DAY, used_fallback: 0, error: null, tokens_in: 10, tokens_out: 5 });
    expect(JSON.parse(log[0].executed!)).toEqual([expect.objectContaining({ action: "bonus", ok: true })]);
    expect(await textsTo("ai-1")).toBe(0);
  }, 60_000);

  it("dohodu mimo nabídku zahodí a rozhodne náhradní pravidlo podle povahy", async () => {
    await setUnrest("ai-2-star", unhappy(60));
    // Slib prodeje AI trenér dávat nesmí, takže v nabídce není.
    const { env } = fakeAi({ decisions: [{ player: "P1", action: "promise_transfer", reason: "Let him dream." }], reasoning: "" });
    const res = await resolveUnhappyPlayers(env, "ai-2", profile({ thrift: 30 }), NOW, { mode: "on", ai: env });

    // Nešetrný trenér opoře zvedne odměny.
    expect(res.decisions).toEqual([expect.objectContaining({ action: "raise_wage", decidedBy: "fallback" })]);
    expect(res.executed).toEqual([expect.objectContaining({ action: "raise_wage", ok: true })]);
    const row = await db.prepare("SELECT weekly_wage, life_context FROM players WHERE id = 'ai-2-star'").first<{ weekly_wage: number; life_context: string }>();
    expect(row?.weekly_wage).toBe(325);
    expect(JSON.parse(row!.life_context).wageRaisedSeason).toBe(3);
    const log = await decisionsOf("ai-2");
    expect(log[0].used_fallback).toBe(1);
    expect(log[0].error).toContain("promise_transfer není v nabídce");
    expect(await textsTo("ai-2")).toBe(0);
  }, 60_000);

  it("bez bindingu Workers AI rozhodne náhradní pravidlo; skrblík neplatí ani opoře", async () => {
    await setUnrest("ai-6-star", unhappy(60));
    const res = await resolveUnhappyPlayers(baseEnv, "ai-6", profile({ thrift: 90 }), NOW, { mode: "on", ai: baseEnv });
    expect(res.decisions).toEqual([expect.objectContaining({ action: "wait", decidedBy: "fallback" })]);
    expect(res.executed).toEqual([]);
    expect((await lifeOf("ai-6-star"))?.transferUnrest.level).toBe(60);
    const log = await decisionsOf("ai-6");
    expect(log[0]).toMatchObject({ used_fallback: 1, error: "chybí binding AI" });
  }, 60_000);

  it("v režimu shadow rozhodne a zapíše, ale nic neprovede, a to jednou za den", async () => {
    await setUnrest("ai-3-star", unhappy(60));
    const { calls, env } = fakeAi({ decisions: [{ player: "P1", action: "bonus", reason: "Pay him." }], reasoning: "" });
    const res = await resolveUnhappyPlayers(env, "ai-3", profile(), NOW, { mode: "shadow", ai: env });
    expect(res.decisions).toEqual([expect.objectContaining({ action: "bonus", decidedBy: "model" })]);
    expect(res.executed).toEqual([]);
    expect((await lifeOf("ai-3-star"))?.transferUnrest).toMatchObject({ level: 60, deals: [] });
    expect(await budgetOf("ai-3")).toBe(100_000);

    expect((await resolveUnhappyPlayers(env, "ai-3", profile(), NOW, { mode: "shadow", ai: env })).status).toBe("duplicate");
    expect(calls).toHaveLength(1);
    const log = await decisionsOf("ai-3");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ mode: "shadow", executed: null, used_fallback: 0 });
  }, 60_000);

  it("nejvýš jednou za herní den; další den znovu, už bez uzavřené dohody", async () => {
    await setUnrest("ai-4-star", unhappy(80));
    // Druhý nespokojený hráč, se kterým trenér počká: odpoledne by o něm šlo rozhodovat znovu.
    await setUnrest("ai-4-mid2", unhappy(50));
    const { calls, env } = fakeAi(
      { decisions: [{ player: "P1", action: "bonus", reason: "Pay him." }, { player: "P2", action: "wait", reason: "Let it cool." }], reasoning: "" },
      // Druhý den je naštvanější mid2 (50) než hvězda po prémii (45): P1 je teď on.
      { decisions: [{ player: "P1", action: "wait", reason: "Fine." }, { player: "P2", action: "raise_wage", reason: "Still angry." }], reasoning: "" },
    );
    expect((await resolveUnhappyPlayers(env, "ai-4", profile(), NOW, { mode: "on", ai: env })).status).toBe("done");
    expect((await resolveUnhappyPlayers(env, "ai-4", profile(), new Date(NOW.getTime() + 3_600_000), { mode: "on", ai: env })).status).toBe("duplicate");
    expect(calls).toHaveLength(1);
    expect((await lifeOf("ai-4-star"))?.transferUnrest.level).toBe(45);
    expect((await lifeOf("ai-4-mid2"))?.transferUnrest.level).toBe(50);

    const tomorrow = new Date(NOW.getTime() + DAY_MS);
    await db.prepare("UPDATE teams SET game_date = ? WHERE id = 'ai-4'").bind("2026-11-03T16:00:00.000Z").run();
    const res = await resolveUnhappyPlayers(env, "ai-4", profile(), tomorrow, { mode: "on", ai: env });
    expect(res.executed).toEqual([expect.objectContaining({ playerId: "ai-4-star", action: "raise_wage", ok: true, level: 5 })]);
    expect(calls).toHaveLength(2);
    // Prémie už v tomhle truci s hvězdou padla: druhý den ji model u něj v nabídce nemá.
    const starBlock = calls[1].input.messages[1].content.split("\n\n").find((b) => b.includes("Hráč star"));
    expect(starBlock).toContain('"raise_wage"');
    expect(starBlock).not.toContain('"bonus"');
    expect((await lifeOf("ai-4-star"))?.transferUnrest.deals.map((d: { id: string }) => d.id)).toEqual(["bonus", "raise_wage"]);
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id = 'ai-4' AND task = 'unrest'")).toBe(2);
    expect(await decisionsOf("ai-4")).toHaveLength(2);
  }, 60_000);

  it("„pustit ho“ dodrží hned: klub nabídku pošle znovu a AI ji přijme, hráč odchází", async () => {
    const amount = marketValue(40, 30, "FWD");
    await setUnrest("ai-5-spare", unhappy(50, { offer: { amount, fromTeamId: "virtual_ai", virtualTeamData: GRAFENAU, at: new Date(NOW.getTime() - DAY_MS).toISOString() } }));
    const { env } = fakeAi({ decisions: [{ player: "P1", action: "release", reason: "We can do without him." }], reasoning: "" });
    const res = await resolveUnhappyPlayers(env, "ai-5", profile({ trading: 80 }), NOW, { mode: "on", ai: env });

    expect(res.executed).toEqual([expect.objectContaining({ action: "release", ok: true, sold: true })]);
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE id = 'ai-5-spare'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_offers WHERE player_id = 'ai-5-spare' AND from_team_id = 'virtual_ai' AND status = 'accepted' AND offer_amount = ?", amount)).toBe(1);
    expect(await budgetOf("ai-5")).toBe(100_000 + amount);
    expect(await textsTo("ai-5")).toBe(0);
  }, 60_000);

  it("v noci nic, a když dnes s hráčem dohoda už padla, model se neptá a den nezabere", async () => {
    await setUnrest("ai-7-star", unhappy(60, { lastActionAt: new Date(NOW.getTime() - 3_600_000).toISOString() }));
    const { calls, env } = fakeAi({ decisions: [], reasoning: "" });
    expect((await resolveUnhappyPlayers(env, "ai-7", profile(), new Date("2026-11-02T01:30:00.000Z"), { mode: "on", ai: env })).status).toBe("night");
    expect((await resolveUnhappyPlayers(env, "ai-7", profile(), NOW, { mode: "on", ai: env })).status).toBe("nothing");
    expect(calls).toHaveLength(0);
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id = 'ai-7'")).toBe(0);
    expect(await decisionsOf("ai-7")).toHaveLength(0);
  }, 60_000);
});

describe("lidský klub", () => {
  it("nespokojeného hráče lidského klubu AI trenér nechá být", async () => {
    const before = unhappy(60);
    await setUnrest("human-star", before);
    const { calls, env } = fakeAi({ decisions: [{ player: "P1", action: "bonus", reason: "x" }], reasoning: "" });
    expect((await resolveUnhappyPlayers(env, "human", profile(), NOW, { mode: "on", ai: env })).status).toBe("not_ai");
    expect(calls).toHaveLength(0);
    expect(await lifeOf("human-star")).toEqual(before);
    expect(await budgetOf("human")).toBe(100_000);
    expect(await decisionsOf("human")).toHaveLength(0);
  }, 60_000);

  it("člověk přes službu dál dostane SMS trenéra i odpověď hráče (bez textů je jen AI)", async () => {
    await db.prepare("UPDATE players SET personality = ? WHERE id = 'human-mid2'").bind(JSON.stringify({ discipline: 80 })).run();
    await setUnrest("human-mid2", unhappy(50));
    const res = await performUnrestAction(db, {}, "human", "human-mid2", "tough_love");
    expect(res).toMatchObject({ ok: true, outcome: "partial", unrestLevel: 35 });
    expect(typeof res.playerReply).toBe("string");
    const texts = (await db.prepare(
      "SELECT m.sender_type, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'human' AND c.participant_id = 'human-mid2' ORDER BY m.sent_at, m.rowid",
    ).all<{ sender_type: string; body: string }>()).results;
    expect(texts.map((t) => t.sender_type)).toEqual(["user", "player"]);
    expect(texts[0].body).toContain("Trucování ti nepomůže");
  }, 60_000);

  it("hodinová úloha řeší nespokojené hráče až po přestupech a přátelácích, pak incidenty a souboje konce sezóny", () => {
    expect(HOURLY_HOOKS.map((h) => h.name)).toEqual(["transfer_replies", "transfer_market", "friendlies", "unrest", "incidents", "season_duels"]);
  });
});
