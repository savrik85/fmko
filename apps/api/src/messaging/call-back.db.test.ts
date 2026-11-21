/**
 * Zavolat zpátky (F9) na skutečné D1 (Miniflare, všechny migrace včetně 0324).
 *
 * Hlídá se hlavně peněženka a opakování: hovor stojí 6 Kč jednou, druhý hovor týž den
 * ani dvojklik nic nestrhnou a nepošlou druhou hlasovku. K tomu důvod podle stavu hráče,
 * AI vypnutá, starší hovor bez id hráče a vlákna sponzora a vůdce kotle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { recordVoiceMessage } from "./voice-message";
import { callBackMissedCall, callBackReplyVoice, loadCallBackState, type CallBackEnv } from "./call-back";
import { tikHovoru } from "./missed-calls";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const RIVAL = "rival-club";
const LEAGUE = "l-1";
const DAY = "2026-11-21";
/** Sobota 14:30 v Praze: nikdo nespí ani nepije. */
const AFTERNOON = new Date("2026-11-21T13:30:00.000Z");
/** Sobota 3:00 v Praze. */
const NIGHT = new Date("2026-11-21T02:00:00.000Z");

const UNHAPPY = "p-unhappy";
const INJURED = "p-injured";
const CALM = "p-calm";

function env(extra: Partial<CallBackEnv> = {}): CallBackEnv {
  return { CACHE_KV: kv, ...extra };
}

/** Falešné nahrávání hlasovky (Gemini TTS v testu nejede): počítá volání. */
function fakeRecorder(result: "voice" | "none" = "voice") {
  const calls: Array<Parameters<typeof recordVoiceMessage>[2]> = [];
  const fn: typeof recordVoiceMessage = async (_db, _env, opts) => {
    calls.push(opts);
    if (result === "none") return null;
    return {
      meta: { type: "voice", audioKey: `voice/${opts.messageId}.wav`, durationSec: 9, peaks: [0.5], voice: "Charon" },
      transcript: opts.body,
    };
  };
  return { calls, fn };
}

/** Falešný Workers AI: vrátí pevný text a pamatuje si prompty. */
function fakeAi(answer: string) {
  const prompts: string[] = [];
  return {
    prompts,
    AI: {
      run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
        prompts.push(input.messages.map((m) => m.content).join("\n"));
        return { response: answer };
      },
    } as unknown as Ai,
  };
}

async function credit(): Promise<number> {
  return (await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(HUMAN).first<{ phone_credit: number | null }>())?.phone_credit ?? NaN;
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function insertCall(id: string, caller: string, name: string, playerId: string | null = null, day = DAY): Promise<void> {
  await db.prepare(
    `INSERT INTO missed_calls (id, team_id, volajici, jmeno, duvod, pocet, game_date, player_id)
     VALUES (?, ?, ?, ?, 'Volal dvakrát.', 2, ?, ?)`,
  ).bind(id, HUMAN, caller, name, `${day}T16:00:00.000Z`, playerId).run();
}

async function playerMessages(playerId: string): Promise<Array<{ body: string; metadata: string | null }>> {
  return (await db.prepare(
    `SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.participant_id = ? AND m.sender_type = 'player' ORDER BY m.sent_at, m.rowid`,
  ).bind(HUMAN, playerId).all<{ body: string; metadata: string | null }>()).results;
}

async function threadState(playerId: string): Promise<Record<string, unknown> | null> {
  const row = await db.prepare(
    "SELECT ai_thread_active, ai_thread_state FROM conversations WHERE team_id = ? AND participant_id = ?",
  ).bind(HUMAN, playerId).first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  if (!row || row.ai_thread_active !== 1 || !row.ai_thread_state) return null;
  return JSON.parse(row.ai_thread_state) as Record<string, unknown>;
}

/** Prohry po sobě (forma klubu pro hovory a sponzora). */
async function losses(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await db.prepare(
      `INSERT INTO matches (id, league_id, home_team_id, away_team_id, status, home_score, away_score, simulated_at)
       VALUES (?, ?, ?, ?, 'simulated', 0, 2, ?)`,
    ).bind(`loss-${i}`, LEAGUE, HUMAN, RIVAL, `2026-11-${String(10 + i).padStart(2, "0")}T16:00:00.000Z`).run();
  }
}

let wipedTables: string[] = [];

async function wipe(): Promise<void> {
  await db.batch([db.prepare("PRAGMA defer_foreign_keys = true"), ...wipedTables.map((t) => db.prepare(`DELETE FROM ${t}`))]);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id', 'league_id', 'sponsor_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers', 'matches')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  wipedTables = [...new Set([...linked, "matches", "players", "managers", "teams", "leagues", "seasons"])];
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await kv.delete("ai_provider");
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', 50000, ?, 'senior', ?)")
      .bind(HUMAN, villages[0], LEAGUE, `${DAY}T16:00:00.000Z`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', 50000, ?, 'senior', ?)")
      .bind(RIVAL, villages[1], LEAGUE, `${DAY}T16:00:00.000Z`),
  ]);
  const insert = db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status, coach_relationship)
     VALUES (?, ?, ?, ?, 28, 'MID', 40, '{}', '{}', ?, ?, '{}', 1000, 'active', 50)`,
  );
  const personality = JSON.stringify({ leadership: 30, discipline: 50, temper: 40, alcohol: 20, patriotism: 50 });
  await db.batch([
    insert.bind(UNHAPPY, HUMAN, "Pepa", "Naštvaný", personality,
      JSON.stringify({ morale: 25, condition: 100, occupation: "Zedník", transferUnrest: { level: 60, teamName: "TJ Netolice" } })),
    insert.bind(INJURED, HUMAN, "Franta", "Kulhavý", personality, JSON.stringify({ morale: 60, condition: 90, occupation: "Zedník" })),
    insert.bind(CALM, HUMAN, "Jan", "Klidný", personality, JSON.stringify({ morale: 70, condition: 100, occupation: "Zedník" })),
    db.prepare(
      `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total)
       VALUES ('inj-1', ?, ?, 'sval', 'Natažený sval', 'lehke', 6, 10)`,
    ).bind(INJURED, HUMAN),
  ]);
});

describe("zmeškaný hovor si pamatuje, který hráč volal", () => {
  it("tikHovoru uloží id hráče s nejhorší náladou", async () => {
    await losses(2);
    await tikHovoru(db, HUMAN, [], `${DAY}T16:00:00.000Z`);
    const row = await db.prepare("SELECT jmeno, player_id FROM missed_calls WHERE team_id = ? AND volajici = 'hrac'")
      .bind(HUMAN).first<{ jmeno: string; player_id: string | null }>();
    expect(row).toEqual({ jmeno: "Pepa Naštvaný", player_id: UNHAPPY });
  });
});

describe("zavolat zpátky hráči", () => {
  it("strhne 6 Kč, hráč pošle hlasovku podle svého stavu a otevře se vlákno", async () => {
    await insertCall("call-unhappy", "hrac", "Pepa Naštvaný", UNHAPPY);
    const rec = fakeRecorder();
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn });

    expect(r).toMatchObject({ ok: true, kind: "voice" });
    expect(await credit()).toBe(30);
    // Hlasovka mimo týdenní strop, s vlastním limitem.
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].force).toBe(true);
    const msgs = await playerMessages(UNHAPPY);
    expect(msgs).toHaveLength(1);
    const meta = JSON.parse(msgs[0].metadata ?? "{}") as Record<string, unknown>;
    expect(meta).toMatchObject({ type: "voice", call_back: "unrest", scenario_id: "call_back_unrest" });
    // Truc po přestupu: hráč zmíní klub, kam chtěl (bez AI hotová věta).
    expect(msgs[0].body).toContain("TJ Netolice");
    const state = await threadState(UNHAPPY);
    expect(state).toMatchObject({ scenario_id: "call_back_unrest", awaiting: "coach", casual: true, call_back: { reason: "unrest", voicesLeft: 1 } });
    // Hovor je odbavený: v seznamu svítí jako vyřízený a dnešní zpětný hovor je pryč.
    const list = await loadCallBackState(db, HUMAN);
    expect(list.usedToday).toBe(true);
    expect(list.calls.get("call-unhappy")).toMatchObject({ outcome: "voice" });
  });

  it("AI vypnutá: zraněný hráč volal kvůli zranění, místo hlasovky přijde SMS a nic nespadne", async () => {
    await kv.put("ai_provider", "off");
    await insertCall("call-injured", "hrac", "Franta Kulhavý", INJURED);
    const rec = fakeRecorder("none");
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-injured", now: AFTERNOON }, { recordVoice: rec.fn });

    expect(r).toMatchObject({ ok: true, kind: "sms" });
    expect(await credit()).toBe(30);
    const msgs = await playerMessages(INJURED);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("natažený sval");
    expect(msgs[0].body).not.toMatch(/[—–]/);
    expect(await threadState(INJURED)).toMatchObject({ scenario_id: "call_back_injury", call_back: { reason: "injury", voicesLeft: 2 } });
  });

  it("s modelem napíše hlasovku model podle důvodu z hry", async () => {
    await kv.put("ai_provider", "workers-ai");
    const ai = fakeAi("Trenére, ten sval pořád bolí, ale makám na tom.");
    await insertCall("call-injured", "hrac", "Franta Kulhavý", INJURED);
    const rec = fakeRecorder();
    const r = await callBackMissedCall(db, env({ AI: ai.AI }), { teamId: HUMAN, callId: "call-injured", now: AFTERNOON }, { recordVoice: rec.fn });

    expect(r.ok).toBe(true);
    expect(ai.prompts[0]).toContain("Volal jsi kvůli svému zranění");
    expect((await playerMessages(INJURED))[0].body).toBe("Trenére, ten sval pořád bolí, ale makám na tom.");
    expect(rec.calls[0].body).toBe("Trenére, ten sval pořád bolí, ale makám na tom.");
  });

  it("druhý hovor týž den se odmítne a kredit se nestrhne", async () => {
    await insertCall("call-unhappy", "hrac", "Pepa Naštvaný", UNHAPPY);
    // Hráč volá nejvýš jednou za den, druhý zmeškaný hovor je ze včerejška.
    await insertCall("call-injured", "hrac", "Franta Kulhavý", INJURED, "2026-11-20");
    const rec = fakeRecorder();
    const first = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn });
    const second = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-injured", now: AFTERNOON }, { recordVoice: rec.fn });
    const again = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, code: "already_today" });
    expect(again).toMatchObject({ ok: false, code: "already_called" });
    expect(await credit()).toBe(30);
    expect(rec.calls).toHaveLength(1);
    expect(await playerMessages(INJURED)).toHaveLength(0);
  });

  it("dvojklik: dva souběžné požadavky zaplatí a pošlou hlasovku jen jednou", async () => {
    await insertCall("call-unhappy", "hrac", "Pepa Naštvaný", UNHAPPY);
    const rec = fakeRecorder();
    const results = await Promise.all([
      callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn }),
      callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(await credit()).toBe(30);
    expect(rec.calls).toHaveLength(1);
    expect(await playerMessages(UNHAPPY)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM missed_call_callbacks WHERE team_id = ?", HUMAN)).toBe(1);
  });

  it("starší hovor bez player_id najde hráče podle jména", async () => {
    await insertCall("call-legacy", "hrac", "Franta Kulhavý", null);
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-legacy", now: AFTERNOON }, { recordVoice: fakeRecorder("none").fn });
    expect(r.ok).toBe(true);
    expect(await threadState(INJURED)).toMatchObject({ call_back: { reason: "injury" } });
  });

  it("starší hovor bez player_id na hráče, který v klubu není, nespadne a nic nestojí", async () => {
    await insertCall("call-gone", "hrac", "Karel Odešel", null);
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-gone", now: AFTERNOON }, { recordVoice: fakeRecorder().fn });
    expect(r).toMatchObject({ ok: false, code: "unreachable" });
    expect(await count("SELECT COUNT(*) AS n FROM missed_call_callbacks WHERE team_id = ?", HUMAN)).toBe(0);
    expect((await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(HUMAN).first<{ phone_credit: number | null }>())?.phone_credit ?? 36).toBe(36);
  });

  it("bez kreditu se nevolá a dnešní hovor zůstává volný", async () => {
    await db.prepare("UPDATE teams SET phone_credit = 4, phone_credit_date = ? WHERE id = ?").bind(DAY, HUMAN).run();
    await insertCall("call-unhappy", "hrac", "Pepa Naštvaný", UNHAPPY);
    const rec = fakeRecorder();
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn });
    expect(r).toMatchObject({ ok: false, code: "no_credit" });
    expect(await credit()).toBe(4);
    expect(rec.calls).toHaveLength(0);

    await db.prepare("UPDATE teams SET phone_credit = 36 WHERE id = ?").bind(HUMAN).run();
    const later = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: rec.fn });
    expect(later.ok).toBe(true);
    expect(await credit()).toBe(30);
  });

  it("v noci hráč spí: hovor se nespojí a nic nestojí", async () => {
    await insertCall("call-calm", "hrac", "Jan Klidný", CALM);
    const rec = fakeRecorder();
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-calm", now: NIGHT }, { recordVoice: rec.fn });
    expect(r).toMatchObject({ ok: false, code: "asleep" });
    expect(rec.calls).toHaveLength(0);
    expect(await count("SELECT COUNT(*) AS n FROM missed_call_callbacks WHERE team_id = ?", HUMAN)).toBe(0);
  });

  it("starostovi ani redakci se zpátky volat nedá", async () => {
    await insertCall("call-mayor", "starosta", "Starosta obce");
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-mayor", now: AFTERNOON });
    expect(r).toMatchObject({ ok: false, code: "not_callable" });
    expect(await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "missing-call", now: AFTERNOON })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("rozepsané vlákno s hráčem se nepřepíše, hlasovka do něj jen přibude", async () => {
    await db.prepare(
      `INSERT INTO conversations (id, team_id, type, title, participant_id, pinned, unread_count, last_message_text, last_message_at, created_at, ai_thread_active, ai_thread_state)
       VALUES ('conv-busy', ?, 'player', 'Pepa Naštvaný', ?, 0, 0, 'x', '2026-11-21T10:00:00Z', '2026-11-21T10:00:00Z', 1, ?)`,
    ).bind(HUMAN, UNHAPPY, JSON.stringify({ scenario_id: "bench_complaint", awaiting: "coach", player_id: UNHAPPY })).run();
    await insertCall("call-unhappy", "hrac", "Pepa Naštvaný", UNHAPPY);
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-unhappy", now: AFTERNOON }, { recordVoice: fakeRecorder().fn });
    expect(r).toMatchObject({ ok: true, conversationId: "conv-busy" });
    expect(await threadState(UNHAPPY)).toMatchObject({ scenario_id: "bench_complaint" });
    expect(await playerMessages(UNHAPPY)).toHaveLength(1);
  });
});

describe("druhá hlasovka ve vlákně", () => {
  it("v odpovědi hráče jde ještě jedna hlasovka, pak už jen SMS", async () => {
    const rec = fakeRecorder();
    const player = {
      id: CALM, firstName: "Jan", lastName: "Klidný", age: 28, position: "MID" as const, morale: 70, condition: 100,
      coachRelationship: 50, discipline: 50, patriotism: 50, alcohol: 20, temper: 40, leadership: 30, workRate: 50,
      aggression: 40, recentMinutes: 300, recentRatingAvg: 6.5, isCelebrity: false, occupation: "Zedník",
    };
    const base = { teamId: HUMAN, body: "No jo, trenére, díky.", scene: "x", player, playerRow: { life_context: "{}" }, now: AFTERNOON };
    const second = await callBackReplyVoice(db, env(), { ...base, messageId: "m-2", state: { reason: "chat", voicesLeft: 1 } }, { recordVoice: rec.fn, random: () => 0 });
    expect(second?.state.voicesLeft).toBe(0);
    expect(rec.calls[0].force).toBe(true);
    const third = await callBackReplyVoice(db, env(), { ...base, messageId: "m-3", state: second!.state }, { recordVoice: rec.fn, random: () => 0 });
    expect(third).toBeNull();
    expect(rec.calls).toHaveLength(1);
  });

  it("když odpověď trvá dlouho, hlasovka se nenamlouvá a jde SMS", async () => {
    const rec = fakeRecorder();
    const player = {
      id: CALM, firstName: "Jan", lastName: "Klidný", age: 28, position: "MID" as const, morale: 70, condition: 100,
      coachRelationship: 50, discipline: 50, patriotism: 50, alcohol: 20, temper: 40, leadership: 30, workRate: 50,
      aggression: 40, recentMinutes: 300, recentRatingAvg: 6.5, isCelebrity: false,
    };
    const late = await callBackReplyVoice(db, env(), {
      teamId: HUMAN, body: "Jo.", scene: "x", player, playerRow: {}, messageId: "m-4",
      state: { reason: "chat", voicesLeft: 1 }, startedAt: Date.now() - 20_000,
    }, { recordVoice: rec.fn, random: () => 0 });
    expect(late).toBeNull();
    expect(rec.calls).toHaveLength(0);
  });
});

describe("zpětný hovor sponzorovi a vůdci kotle", () => {
  it("sponzor po sérii proher napíše do svého vlákna, o co šlo", async () => {
    await losses(3);
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
         VALUES (990001, 'Prachatice', 'Mlékárna Testov', 'mlekarna', 1000, 5000, 100, 500)`,
      ),
      db.prepare(
        `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, status, category, sponsor_id)
         VALUES ('sc-1', ?, 'Mlékárna Testov', 'mlekarna', 3000, 'active', 'main', 990001)`,
      ).bind(HUMAN),
    ]);
    await insertCall("call-sponsor", "sponzor", "Mlékárna Testov");
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-sponsor", now: AFTERNOON });

    expect(r).toMatchObject({ ok: true, kind: "thread" });
    expect(await credit()).toBe(30);
    const msg = await db.prepare(
      `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.team_id = ? AND c.participant_id = 'so-990001' AND m.sender_type = 'system'`,
    ).bind(HUMAN).first<{ body: string }>();
    expect(msg?.body).toMatch(/prohr/);
  });

  it("vůdce kotle otevře své vlákno a čeká na odpověď trenéra", async () => {
    await db.batch([
      db.prepare("INSERT INTO fan_groups (id, team_id, kind, name, mood, heat) VALUES ('fg-1', ?, 'kotel', 'Husinec Boys', 30, 75)").bind(HUMAN),
      db.prepare(
        `INSERT INTO fan_leaders (id, group_id, team_id, first_name, last_name, age, occupation, archetype, avatar)
         VALUES ('fl-1', 'fg-1', ?, 'Josef', 'Vlček', 41, 'Řezník', 'stary_kapo', '{}')`,
      ).bind(HUMAN),
    ]);
    await insertCall("call-kotel", "kotel", "Josef Vlček");
    const r = await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-kotel", now: AFTERNOON });

    expect(r).toMatchObject({ ok: true, kind: "thread" });
    const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE team_id = ? AND participant_id = 'fl-1'")
      .bind(HUMAN).first<{ ai_thread_active: number; ai_thread_state: string }>();
    expect(conv?.ai_thread_active).toBe(1);
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ kind: "fan_leader", awaiting: "coach", tema: "call_back" });
  });

  it("sponzorovi v noci nikdo nebere a nic to nestojí", async () => {
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
         VALUES (990001, 'Prachatice', 'Mlékárna Testov', 'mlekarna', 1000, 5000, 100, 500)`,
      ),
      db.prepare(
        `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, status, category, sponsor_id)
         VALUES ('sc-1', ?, 'Mlékárna Testov', 'mlekarna', 3000, 'active', 'main', 990001)`,
      ).bind(HUMAN),
    ]);
    await insertCall("call-sponsor", "sponzor", "Mlékárna Testov");
    expect(await callBackMissedCall(db, env(), { teamId: HUMAN, callId: "call-sponsor", now: NIGHT })).toMatchObject({ ok: false, code: "asleep" });
  });
});
