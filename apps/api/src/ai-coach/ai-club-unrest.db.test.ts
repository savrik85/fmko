/**
 * Truc hráčů AI klubů podle stejných pravidel jako u lidí (spec AI klubů 3.2), na skutečné D1
 * (Miniflare, všechny migrace): odmítnutá nebo propadlá nabídka AI klub stojí nespokojeného
 * hráče, denní krok trucu běží i AI klubům (útlum, předstírané zranění, sliby) a slíbené místo
 * v sestavě AI trenér dodrží, takže slib projde kontrolou. AI klubu se nic nepíše; lidem
 * se nic nemění.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

// Zájem hráče o přestup řeší vlastní testy; tady stačí, že hráč „velmi chce“ kvůli penězům.
const interest = vi.hoisted(() => ({
  computeInterestForOffer: vi.fn(async () => ({ level: 3 as const, score: 85, factors: [{ label: "Balík peněz", delta: 22 }] })),
}));
vi.mock("../transfers/player-interest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../transfers/player-interest")>()),
  computeInterestForOffer: interest.computeInterestForOffer,
}));

import { rejectTransferOffer } from "../services/transfer-actions";
import { expireIdleOffers } from "../transfers/offer-expiry";
import { processTransferUnrest } from "../transfers/offer-rejection-impact";
import { prepareAiLineup } from "./match";
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
const FUTURE = new Date(NOW.getTime() + 2 * DAY_MS).toISOString();

/** Kádr áčka: 18 hráčů, `weak` (MID 20) se do základu jinak nedostane. */
const SQUAD: Array<[string, string, number, number]> = [
  ["gk1", "GK", 50, 28], ["gk2", "GK", 42, 31],
  ["def1", "DEF", 48, 26], ["def2", "DEF", 46, 27], ["def3", "DEF", 45, 25], ["def4", "DEF", 44, 29], ["def5", "DEF", 42, 30], ["def6", "DEF", 40, 31],
  ["mid1", "MID", 55, 24], ["mid2", "MID", 47, 26], ["mid3", "MID", 44, 27], ["mid4", "MID", 43, 28], ["mid5", "MID", 41, 30], ["weak", "MID", 20, 23],
  ["fwd1", "FWD", 49, 26], ["fwd2", "FWD", 45, 27], ["fwd3", "FWD", 39, 29], ["fwd4", "FWD", 38, 30],
];
const BASE_LIFE = { condition: 100, morale: 50 };
const PERSONALITY = { discipline: 50, leadership: 30, aggression: 50, workRate: 50, temper: 40 };

const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({
  ...generateAiProfile("ai-club-unrest", null), thrift: 30, patience: 70, trading: 20, youthFocus: 30, favouriteFormations: ["4-4-2"], ...over,
});

function playerInsert(id: string, teamId: string, position: string, rating: number, age: number): D1PreparedStatement {
  const skills = {
    speed: rating, technique: rating, shooting: rating, passing: rating, heading: rating, defense: rating,
    goalkeeping: position === "GK" ? rating + 10 : 10, vision: rating, creativity: rating, setPieces: rating, experience: 40,
  };
  return db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage)
     VALUES (?, ?, 'Hráč', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
  ).bind(id, teamId, id, age, position, rating, JSON.stringify(skills), JSON.stringify({ stamina: rating, strength: rating }),
    JSON.stringify(PERSONALITY), JSON.stringify(BASE_LIFE), 10 + rating * 4);
}

function unhappy(level: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...BASE_LIFE,
    transferUnrest: {
      level, reason: "rejected_offer", teamName: "SV Grafenau", since: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
      reasons: ["money"], deals: [],
      offer: { amount: 40_000, fromTeamId: "virtual_ai", virtualTeamData: GRAFENAU, at: new Date(NOW.getTime() - DAY_MS).toISOString() },
      ...over,
    },
  };
}

async function setLife(playerId: string, life: Record<string, unknown>): Promise<void> {
  await db.prepare("UPDATE players SET life_context = ? WHERE id = ?").bind(JSON.stringify(life), playerId).run();
}

async function lifeOf(playerId: string): Promise<Record<string, any>> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string }>();
  return JSON.parse(row!.life_context);
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

/** Všechno, co by AI klub dostal do telefonu nebo do oznámení. */
async function textsTo(teamId: string): Promise<number> {
  return await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ?", teamId)
    + await count("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ?", teamId)
    + await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = ?", teamId);
}

async function messagesTo(teamId: string): Promise<string[]> {
  return (await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? ORDER BY m.rowid")
    .bind(teamId).all<{ body: string }>()).results.map((r) => r.body);
}

function offerInsert(id: string, playerId: string, from: string, to: string, expiresAt: string, virtual: string | null = null): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, expires_at, virtual_team_data, created_at)
     VALUES (?, ?, ?, ?, 30000, 'transfer', 'pending', ?, ?, ?)`,
  ).bind(id, playerId, from, to, expiresAt, virtual, new Date(NOW.getTime() - DAY_MS).toISOString());
}

/** Workers AI s jednou připravenou odpovědí (případně podle promptu) a záznamem promptů. */
function fakeAi(answer: unknown | ((prompt: string) => unknown)) {
  const prompts: string[] = [];
  const ai = {
    run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
      const prompt = input.messages[1].content;
      prompts.push(prompt);
      const out = typeof answer === "function" ? (answer as (p: string) => unknown)(prompt) : answer;
      return { choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return { prompts, env: { ...baseEnv, AI: ai } as unknown as Bindings };
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

  const villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results;
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg-1', 'season-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')"),
  ];
  for (const [i, [id, user]] of ([["ai-1", "ai"], ["human", "u-human"]] as const).entries()) {
    stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, game_date) VALUES (?, ?, ?, ?, 100000, 'lg-1', ?)")
      .bind(id, user, villages[i].id, `Klub ${id}`, `${GAME_DAY}T16:00:00.000Z`));
    for (const [pid, position, rating, age] of SQUAD) stmts.push(playerInsert(`${id}-${pid}`, id, position, rating, age));
  }
  for (let i = 1; i <= 3; i++) {
    stmts.push(
      db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, 'lg-1', 3, ?, 'monday', ?, 'scheduled')")
        .bind(`cal-${i}`, i, new Date(NOW.getTime() + i * DAY_MS).toISOString()),
      db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES (?, 'lg-1', ?, 'ai-1', 'human', 'scheduled')")
        .bind(`m-${i}`, `cal-${i}`),
    );
  }
  await db.batch(stmts);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  // Každý test začíná s klidným kádrem a prázdným telefonem (denní krok trucu bere všechny hráče).
  await db.batch([
    db.prepare("UPDATE players SET life_context = ?, coach_relationship = 50").bind(JSON.stringify(BASE_LIFE)),
    db.prepare("DELETE FROM injuries"),
    db.prepare("DELETE FROM messages"),
    db.prepare("DELETE FROM conversations"),
    db.prepare("DELETE FROM notifications"),
    db.prepare("DELETE FROM transfer_offer_events"),
    db.prepare("DELETE FROM transfer_offers"),
    db.prepare("DELETE FROM player_promises"),
    db.prepare("DELETE FROM coach_relation_log"),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("odmítnutá nabídka na hráče AI klubu", () => {
  it("AI klub nabídku odmítne: hráč se naštve jako u člověka, AI klubu se nic nepíše, kupec zprávu dostane", async () => {
    await db.batch([offerInsert("o-reject", "ai-1-mid2", "human", "ai-1", FUTURE)]);
    const res = await rejectTransferOffer(baseEnv, "ai-1", "o-reject");
    expect(res.ok).toBe(true);

    const life = await lifeOf("ai-1-mid2");
    expect(life.transferUnrest).toMatchObject({ level: 55, reason: "rejected_offer", reasons: ["money"], deals: [] });
    expect(life.transferUnrest.offer).toMatchObject({ amount: 30_000, fromTeamId: "human" });
    // −10 × povaha (temper 40 → 0,95), zaokrouhleno.
    expect(life.morale).toBe(41);
    expect(await count("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = 'ai-1-mid2' AND source = 'transfer_rejected'")).toBe(1);
    expect(await textsTo("ai-1")).toBe(0);
    expect((await messagesTo("human")).some((m) => m.includes("odmítl přestup"))).toBe(true);
  }, 60_000);

  it("AI klub nechá nabídku propadnout: mlčení je odmítnutí, taky bez zpráv", async () => {
    await db.batch([offerInsert("o-expire", "ai-1-mid3", "human", "ai-1", new Date(NOW.getTime() - 3_600_000).toISOString())]);
    expect(await expireIdleOffers(baseEnv, NOW)).toBe(1);
    expect((await lifeOf("ai-1-mid3")).transferUnrest).toMatchObject({ level: 55, reasons: ["money"] });
    expect(await textsTo("ai-1")).toBe(0);
  }, 60_000);

  it("u člověka beze změny: odmítnutí přinese SMS hráče a oznámení", async () => {
    await db.batch([offerInsert("o-human", "human-mid2", "virtual_ai", "human", FUTURE, GRAFENAU)]);
    const res = await rejectTransferOffer(baseEnv, "human", "o-human");
    expect(res.ok).toBe(true);
    expect((await lifeOf("human-mid2")).transferUnrest).toMatchObject({ level: 55, reasons: ["money"] });
    expect((await messagesTo("human")).some((m) => m.includes("SV Grafenau"))).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM notifications WHERE team_id = 'human' AND type = 'transfer'")).toBe(1);
  }, 60_000);
});

describe("denní krok trucu", () => {
  it("běží i AI klubům: truc opadá, naštvaný hráč může předstírat zranění, AI klub nedostane SMS; člověk ano", async () => {
    await setLife("ai-1-def2", unhappy(50));
    await setLife("ai-1-def3", unhappy(70));
    await setLife("human-def3", unhappy(70));
    // Předstírané zranění je náhoda (10–30 % denně): tady padne vždy.
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(await processTransferUnrest(db)).toBe(3);

    expect((await lifeOf("ai-1-def2")).transferUnrest.level).toBe(47);
    const faking = await lifeOf("ai-1-def3");
    expect(faking.transferUnrest).toMatchObject({ level: 55, fakeInjuryUsed: true });
    expect(await count("SELECT COUNT(*) AS n FROM injuries WHERE player_id = 'ai-1-def3' AND is_fake = 1 AND days_remaining > 0")).toBe(1);
    expect(await textsTo("ai-1")).toBe(0);
    // Lidský klub dál dostane výmluvu hráče.
    expect(await count("SELECT COUNT(*) AS n FROM injuries WHERE player_id = 'human-def3' AND is_fake = 1")).toBe(1);
    expect((await messagesTo("human")).length).toBe(1);

    // Truc klesl pod 40: zázračné uzdravení, AI klubu opět bez zprávy.
    await setLife("ai-1-def3", { ...faking, transferUnrest: { ...faking.transferUnrest, level: 30 } });
    vi.restoreAllMocks();
    await processTransferUnrest(db);
    expect(await count("SELECT COUNT(*) AS n FROM injuries WHERE player_id = 'ai-1-def3'")).toBe(0);
    expect(await textsTo("ai-1")).toBe(0);
  }, 60_000);
});

describe("slib místa v sestavě od AI trenéra", () => {
  it("AI trenér slíbí místo, jeho sestava slíbeného hráče postaví, i když ho model šetří, a slib projde kontrolou", async () => {
    await setLife("ai-1-weak", unhappy(50, { reasons: ["minutes"] }));
    const unrestModel = fakeAi({ decisions: [{ player: "P1", action: "promise_minutes", reason: "Give him a chance." }], reasoning: "" });
    const decided = await resolveUnhappyPlayers(unrestModel.env, "ai-1", profile(), NOW, { mode: "on", ai: unrestModel.env });
    expect(unrestModel.prompts[0]).toContain('"promise_minutes"');
    expect(unrestModel.prompts[0]).not.toContain('"promise_transfer"');
    expect(decided.executed).toEqual([expect.objectContaining({ action: "promise_minutes", ok: true, level: 25 })]);
    const pledge = (await lifeOf("ai-1-weak")).transferUnrest.pledge;
    expect(pledge).toMatchObject({ type: "minutes", madeAt: NOW.toISOString() });
    expect(await count("SELECT COUNT(*) AS n FROM player_promises WHERE player_id = 'ai-1-weak' AND type = 'minutes' AND status = 'active'")).toBe(1);

    // Model by slabého hráče (P18, nejhorší hodnocení) šetřil: kód ho přesto postaví.
    const matchModel = fakeAi({
      formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P1", rest: ["P18"], mustStart: [],
      penaltyTaker: "P1", freekickTaker: "P1", plan: [], reasoning: "best side",
    });
    for (let i = 1; i <= 3; i++) {
      const lineup = await prepareAiLineup(matchModel.env, "ai-1", { calendarId: `cal-${i}`, kind: "league" });
      expect(lineup.lineupId).not.toBeNull();
      const saved = await db.prepare("SELECT players_data FROM lineups WHERE id = ?").bind(lineup.lineupId).first<{ players_data: string }>();
      const xi = (JSON.parse(saved!.players_data) as Array<{ playerId: string }>).map((p) => p.playerId);
      expect(xi).toHaveLength(11);
      expect(xi).toContain("ai-1-weak");
      // Zápas se odehraje: kdo začal, hrál celý zápas.
      await db.prepare("UPDATE matches SET status = 'simulated', simulated_at = ?, home_score = 1, away_score = 0 WHERE id = ?")
        .bind(new Date(NOW.getTime() + i * DAY_MS).toISOString(), `m-${i}`).run();
      await db.batch(xi.map((playerId) => db.prepare(
        "INSERT INTO match_player_stats (id, match_id, player_id, team_id, minutes_played) VALUES (?, ?, ?, 'ai-1', 90)",
      ).bind(crypto.randomUUID(), `m-${i}`, playerId)));
    }
    expect(matchModel.prompts[0]).toContain("PROMISES: you promised P18 a starting place");

    await processTransferUnrest(db);
    const after = await lifeOf("ai-1-weak");
    expect(after.transferUnrest.pledge).toBeNull();
    // 50 − 25 (slib) − 10 (dodržený slib) − 3 (denní útlum).
    expect(after.transferUnrest.level).toBe(12);
    expect(await count("SELECT COUNT(*) AS n FROM player_promises WHERE player_id = 'ai-1-weak' AND type = 'minutes' AND status = 'kept'")).toBe(1);
    expect(await textsTo("ai-1")).toBe(0);
  }, 120_000);
});
