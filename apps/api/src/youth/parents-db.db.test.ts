/**
 * Fotbaloví rodiče v U21 na skutečné D1 (Miniflare, všechny migrace): vznik rodičů jen u dorostu
 * lidského klubu, SMS po zápase s prodlevou, příspěvek táty podnikatele až po splnění podmínky,
 * ticho trenéra (rodič se po lhůtě urazí, máma pohrozí Vimperkem) a odpověď přes Telefon.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import type { AiContext } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { replyToParentMessage, tickYouthParents } from "./parents-db";
import { parentCountFor, type ParentArchetype } from "./parents";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let sessions: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const HUMAN_U21 = "human-u21";
const AI_CLUB = "ai-club";
const AI_U21 = "ai-u21";
const LEAGUE = "l-1";
const BUDGET = 80000;

/** Zápasy dorostu v 18:05 v Praze (zima, UTC+1). */
const MATCH_1 = "2026-11-22T17:05:00.000Z";
const MATCH_2 = "2026-11-24T17:05:00.000Z";
const MATCH_3 = "2026-11-26T17:05:00.000Z";
/** Hodinový běh v 18:30 v Praze po druhém zápase: spouštěč se zapíše, SMS ještě ne. */
const TICK = new Date("2026-11-24T17:30:00.000Z");
/** Druhý den dopoledne: SMS už odešla. */
const DELIVER = new Date("2026-11-25T10:30:00.000Z");
/** Po třetím zápase. */
const AFTER_MATCH_3 = new Date("2026-11-26T17:30:00.000Z");
/** Den po doručení: lhůta na odpověď ještě běží. */
const BEFORE_DEADLINE = new Date("2026-11-26T10:30:00.000Z");
/** Lhůta (36 h) vypršela v noci, rodič se urazí v dopoledním běhu. */
const AFTER_DEADLINE = new Date("2026-11-27T09:30:00.000Z");

function fakeAi(answer: (prompt: string) => unknown) {
  const prompts: string[] = [];
  const ctx = {
    provider: "workers-ai",
    ai: {
      run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
        const prompt = input.messages[0]?.content ?? "";
        prompts.push(prompt);
        return { response: answer(prompt) };
      },
    },
  } as unknown as AiContext;
  return { ctx, prompts };
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function addPlayer(id: string, teamId: string, firstName: string, lastName: string) {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
     VALUES (?, ?, ?, ?, 18, 'MID', 35, '{}', '{}', '{}', ?, '{"hair":{"id":"short"}}', 200, 'active')`,
  ).bind(id, teamId, firstName, lastName, JSON.stringify({ morale: 50 })).run();
}

async function addParent(playerId: string, archetype: ParentArchetype, firstName = "Petr", lastName = "Novák") {
  await db.prepare(
    `INSERT INTO youth_parents (id, player_id, team_id, first_name, last_name, avatar, archetype, created_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, '2026-11-20T10:00:00.000Z')`,
  ).bind(`yp-${playerId}`, playerId, HUMAN, firstName, lastName, archetype).run();
}

async function parent(playerId: string) {
  return db.prepare("SELECT * FROM youth_parents WHERE player_id = ?").bind(playerId).first<Record<string, unknown>>();
}

/** Zápas dorostu proti AI dorostu: kdo začínal, kdo kolik odehrál. */
async function addMatch(id: string, simulatedAt: string, o: { home: number; away: number; starters: string[]; subs?: string[]; minutes: Record<string, number> }) {
  const lineup = JSON.stringify({
    starters: o.starters.map((pid) => ({ id: pid, position: "MID" })),
    subs: (o.subs ?? []).map((pid) => ({ id: pid })),
  });
  await db.prepare(
    `INSERT INTO matches (id, home_team_id, away_team_id, home_score, away_score, status, simulated_at, home_lineup_data)
     VALUES (?, ?, ?, ?, ?, 'simulated', ?, ?)`,
  ).bind(id, HUMAN_U21, AI_U21, o.home, o.away, simulatedAt, lineup).run();
  for (const [pid, minutes] of Object.entries(o.minutes)) {
    await db.prepare("INSERT INTO match_player_stats (id, match_id, player_id, team_id, minutes_played) VALUES (?, ?, ?, ?, ?)")
      .bind(`${id}-${pid}`, id, pid, HUMAN_U21, minutes).run();
  }
}

/** Dva zápasy, ve kterých k1 nehrál a k2 ano (prohry, ať nikdo neslaví). */
async function benchTwice() {
  await addMatch("m-1", MATCH_1, { home: 0, away: 1, starters: ["k2"], subs: ["k1"], minutes: { k2: 90 } });
  await addMatch("m-2", MATCH_2, { home: 1, away: 2, starters: ["k2"], subs: ["k1"], minutes: { k2: 90 } });
}

async function parentMessages(playerId: string) {
  return (await db.prepare(
    `SELECT m.body, m.sender_type FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id = ? ORDER BY m.sent_at, m.rowid`,
  ).bind(HUMAN, `yp-${playerId}`).all<{ body: string; sender_type: string }>()).results;
}

async function playerMessages(playerId: string) {
  return (await db.prepare(
    `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = ? ORDER BY m.sent_at, m.rowid`,
  ).bind(HUMAN, playerId).all<{ body: string }>()).results;
}

async function conversationId(playerId: string): Promise<string> {
  const row = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND participant_id = ?").bind(HUMAN, `yp-${playerId}`).first<{ id: string }>();
  if (!row) throw new Error(`vlákno rodiče ${playerId} chybí`);
  return row.id;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(HUMAN).first<{ budget: number }>())!.budget;
}

const tick = (at: Date, opts: { ai?: AiContext | null; rng?: () => number } = {}) =>
  tickYouthParents(db, { CACHE_KV: kv }, at, { ai: null, rng: () => 0.99, ...opts });

let wipeTables: string[] = [];

/**
 * Úklid jednou dávkou s odloženou kontrolou cizích klíčů: jeden požadavek místo stovky
 * (souběžné testy nad Miniflare jinak vyčerpají porty, EADDRNOTAVAIL). Když dávka neprojde,
 * maže se po tabulkách v několika kolech jako v ostatních testech.
 */
async function wipe(): Promise<void> {
  if (wipeTables.length === 0) {
    const linked = (await db.prepare(
      `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
         AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id'))
           OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))`,
    ).all<{ name: string }>()).results.map((r) => r.name);
    wipeTables = [...new Set([...linked, "youth_parents", "coach_commitments", "transactions", "match_player_stats", "matches", "players", "teams", "leagues", "seasons"])];
  }
  const tables = wipeTables;
  try {
    await db.batch([db.prepare("PRAGMA defer_foreign_keys = true"), ...tables.map((t) => db.prepare(`DELETE FROM ${t}`))]);
    return;
  } catch (e) {
    console.warn("úklid jednou dávkou neprošel, mažu po tabulkách:", e);
  }
  let lastError = "";
  for (let pass = 0; pass < 6; pass++) {
    const failed: string[] = [];
    for (const t of tables) {
      try {
        await db.prepare(`DELETE FROM ${t}`).run();
      } catch (e) {
        failed.push(t);
        lastError = `${t}: ${String(e)}`;
      }
    }
    if (failed.length === 0) return;
  }
  throw new Error(`úklid testovací databáze se nepovedl: ${lastError}`);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV", "SESSION_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  sessions = await mf.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  // Sloupec aktivity vznikl na produkci ručně, migrace ho nemají.
  const hasActivity = await db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'last_activity_at'").first();
  if (!hasActivity) await db.exec("ALTER TABLE users ADD COLUMN last_activity_at TEXT");
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x')"),
    db.prepare("UPDATE users SET last_activity_at = ? WHERE id = 'u-human'").bind(TICK.toISOString()),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare(`INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date, phone_credit, phone_credit_date)
                VALUES (?, 'u-human', ?, 'Jiskra Husinec', ?, ?, 'senior', '2026-11-24', 36, '2026-11-24')`).bind(HUMAN, villages[0], BUDGET, LEAGUE),
    db.prepare(`INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, parent_team_id, game_date)
                VALUES (?, 'u-human', ?, 'Jiskra Husinec U21', 0, ?, 'u21', ?, '2026-11-24')`).bind(HUMAN_U21, villages[0], LEAGUE, HUMAN),
    db.prepare(`INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date)
                VALUES (?, 'ai', ?, 'TJ Netolice', 80000, ?, 'senior', '2026-11-24')`).bind(AI_CLUB, villages[1], LEAGUE),
    db.prepare(`INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, parent_team_id, game_date)
                VALUES (?, 'ai', ?, 'TJ Netolice U21', 0, ?, 'u21', ?, '2026-11-24')`).bind(AI_U21, villages[1], LEAGUE, AI_CLUB),
  ]);
});

describe("kdo má rodiče", () => {
  it("rodiče vzniknou jen u hráčů U21 lidského klubu, AI klub je nemá; druhý běh nic nepřidá", async () => {
    const kids = ["k1", "k2", "k3", "k4", "k5"];
    for (const [i, id] of kids.entries()) await addPlayer(id, HUMAN_U21, "Tomáš", `Dorostenec${i}`);
    await addPlayer("a1", HUMAN, "Karel", "Senior");
    await addPlayer("a2", HUMAN, "Pavel", "Senior");
    for (const id of ["x1", "x2", "x3"]) await addPlayer(id, AI_U21, "Jan", "Netolický");

    const first = await tick(TICK);
    const expected = parentCountFor(HUMAN);
    expect(first.created).toBe(expected);
    const rows = (await db.prepare("SELECT player_id, team_id, archetype, last_name FROM youth_parents").all<{ player_id: string; team_id: string; archetype: string; last_name: string }>()).results;
    expect(rows).toHaveLength(expected);
    for (const r of rows) {
      expect(kids).toContain(r.player_id);
      expect(r.team_id).toBe(HUMAN);
    }
    expect(new Set(rows.map((r) => r.archetype)).size).toBe(expected);
    expect(await count("SELECT COUNT(*) AS n FROM youth_parents WHERE player_id IN ('a1', 'a2', 'x1', 'x2', 'x3')")).toBe(0);

    const again = await tick(new Date(TICK.getTime() + 3600_000));
    expect(again.created).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM youth_parents")).toBe(expected);
    // Bez spouštěče nikdo nic nepíše.
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE participant_id LIKE 'yp-%'")).toBe(0);
  }, 60_000);

  it("v noci se nic neděje", async () => {
    await addPlayer("k1", HUMAN_U21, "Tomáš", "Novák");
    const r = await tick(new Date("2026-11-24T23:30:00.000Z"));
    expect(r.created).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM youth_parents")).toBe(0);
  }, 60_000);
});

describe("spouštěče a SMS s prodlevou", () => {
  beforeEach(async () => {
    await addPlayer("k1", HUMAN_U21, "Tomáš", "Novák");
    await addPlayer("k2", HUMAN_U21, "Jakub", "Dvořák");
  });

  it("syn dvakrát po sobě nehrál: táta se ozve s prodlevou a jen jednou", async () => {
    await addParent("k1", "ambitious_father");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();

    const r = await tick(TICK);
    expect(r.triggered).toBe(1);
    const p = await parent("k1");
    expect(p).toMatchObject({ pending_topic: "benched", pending_key: "m-2" });
    expect(Date.parse(String(p!.pending_due_at))).toBeGreaterThan(TICK.getTime());
    expect(await parentMessages("k1")).toHaveLength(0);

    const sent = await tick(DELIVER);
    expect(sent.sent).toBe(1);
    const msgs = await parentMessages("k1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Tomáš");
    expect(msgs[0].body).toContain("Petr Novák");
    expect(msgs[0].body).not.toMatch(/[—–]/);
    expect(await parent("k1")).toMatchObject({ pending_topic: null, sms_count: 1 });
    expect((await parent("k1"))!.awaiting_reply_until).not.toBeNull();

    await tick(new Date(DELIVER.getTime() + 3600_000));
    await tick(new Date(DELIVER.getTime() + 2 * 3600_000));
    expect(await parentMessages("k1")).toHaveLength(1);
    // Tichý rodič hráče, který hrál a prohrál, nepíše.
    expect(await parentMessages("k2")).toHaveLength(0);
  }, 60_000);

  it("výhra: rodič pochválí a odpověď nečeká", async () => {
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await addParent("k1", "ambitious_father");
    await addMatch("m-1", MATCH_2, { home: 3, away: 1, starters: ["k2", "k1"], minutes: { k1: 90, k2: 90 } });

    await tick(TICK, { rng: () => 0 });
    expect(await parent("k2")).toMatchObject({ pending_topic: "win" });
    await tick(DELIVER);
    const msgs = await parentMessages("k2");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Jakub");
    expect((await parent("k2"))!.awaiting_reply_until).toBeNull();
  }, 60_000);

  it("zranění: máma se ozve a čeká na odpověď; lavička se kvůli zranění nepočítá", async () => {
    await addParent("k1", "worried_mother", "Jana", "Nováková");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();
    await db.prepare(
      `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, created_at)
       VALUES ('inj-1', 'k1', ?, 'koleno', 'Natažené koleno', 'stredni', 7, 7, '2026-11-24 15:00:00')`,
    ).bind(HUMAN_U21).run();

    await tick(TICK);
    expect(await parent("k1")).toMatchObject({ pending_topic: "injury", pending_key: "inj-1", last_injury_id: "inj-1", last_match_key: "m-2" });
    await tick(DELIVER);
    const msgs = await parentMessages("k1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Jana Nováková");
    expect((await parent("k1"))!.awaiting_reply_until).not.toBeNull();
  }, 60_000);

  it("SMS napíše model, prompt zná syna i dorost", async () => {
    await addParent("k1", "ambitious_father");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();
    const ai = fakeAi(() => ({ body: "Dobrý den, trenére — tady Petr Novák. Tomáš zase seděl, proč?" }));
    await tick(TICK, { ai: ai.ctx });
    await tick(DELIVER, { ai: ai.ctx });
    const msgs = await parentMessages("k1");
    expect(msgs[0].body).toBe("Dobrý den, trenére, tady Petr Novák. Tomáš zase seděl, proč?");
    expect(ai.prompts.some((p) => p.includes("Tomáš") && p.includes("dorost"))).toBe(true);
  }, 60_000);

  it("klub převzalo AI: rozjetá SMS se nepošle a nikdo se neurazí", async () => {
    await addParent("k1", "worried_mother", "Jana", "Nováková");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();
    await tick(TICK);
    await db.prepare("UPDATE teams SET user_id = 'ai' WHERE id IN (?, ?)").bind(HUMAN, HUMAN_U21).run();
    await tick(DELIVER);
    await tick(AFTER_DEADLINE);
    expect(await parentMessages("k1")).toHaveLength(0);
    expect(await parent("k1")).toMatchObject({ pending_topic: null, offended_at: null });
  }, 60_000);
});

describe("táta podnikatel", () => {
  beforeEach(async () => {
    await addPlayer("k1", HUMAN_U21, "Tomáš", "Novák");
    await addPlayer("k2", HUMAN_U21, "Jakub", "Dvořák");
    await addParent("k1", "sponsor_dad");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();
  });

  /** Nabídka přijde po dvou lavičkách, trenér kývne. Vrací částku a id dohody. */
  async function acceptOffer(text = "Platí, v neděli jde Tomáš od začátku."): Promise<{ amount: number; dealId: string }> {
    await tick(TICK);
    await tick(DELIVER);
    const amount = Number((await parent("k1"))!.deal_offer_amount);
    expect(amount).toBeGreaterThanOrEqual(3000);
    expect((await parentMessages("k1"))[0].body.replace(/\s/g, "")).toContain(`${amount.toLocaleString("cs-CZ").replace(/\s/g, "")}Kč`);
    const convId = await conversationId("k1");
    const at = new Date("2026-11-25T11:00:00.000Z");
    expect(await replyToParentMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId, playerId: "k1", text, now: at }, async () => undefined, null)).toBe(true);
    const deal = await db.prepare("SELECT id, status, details, team_id FROM coach_commitments WHERE kind = 'parent_deal' AND player_id = 'k1'").first<{ id: string; status: string; details: string; team_id: string }>();
    expect(deal).toMatchObject({ status: "active", team_id: HUMAN });
    expect(JSON.parse(deal!.details)).toMatchObject({ amount, parentId: "yp-k1" });
    return { amount, dealId: deal!.id };
  }

  it("příspěvek přijde až po splnění podmínky, a jen jednou", async () => {
    const { amount, dealId } = await acceptOffer();
    expect(await parent("k1")).toMatchObject({ deal_offer_amount: null, awaiting_reply_until: null });
    const reply = (await parentMessages("k1")).at(-1)!;
    expect(reply.body.replace(/\s/g, "")).toContain(`${amount.toLocaleString("cs-CZ").replace(/\s/g, "")}Kč`);

    // Bez zápasu žádné peníze.
    await tick(new Date("2026-11-25T12:30:00.000Z"));
    expect(await budget()).toBe(BUDGET);
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'parent_contribution'")).toBe(0);

    await addMatch("m-3", MATCH_3, { home: 1, away: 1, starters: ["k1", "k2"], minutes: { k1: 90, k2: 90 } });
    await tick(AFTER_MATCH_3);
    expect(await budget()).toBe(BUDGET + amount);
    const tx = await db.prepare("SELECT type, amount, reference_id FROM transactions WHERE team_id = ?").bind(HUMAN).all<{ type: string; amount: number; reference_id: string }>();
    expect(tx.results).toEqual([{ type: "parent_contribution", amount, reference_id: `parent-deal-${dealId}` }]);
    expect((await db.prepare("SELECT status FROM coach_commitments WHERE id = ?").bind(dealId).first<{ status: string }>())!.status).toBe("kept");
    const afterPay = await parentMessages("k1");
    expect(afterPay.at(-1)!.body.replace(/\s/g, "")).toContain(`${amount.toLocaleString("cs-CZ").replace(/\s/g, "")}Kč`);

    // Opakovaný běh: žádná druhá výplata ani SMS.
    await tick(new Date(AFTER_MATCH_3.getTime() + 3600_000));
    await tick(new Date(AFTER_MATCH_3.getTime() + 2 * 3600_000));
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'parent_contribution'")).toBe(1);
    expect(await budget()).toBe(BUDGET + amount);
    expect(await parentMessages("k1")).toHaveLength(afterPay.length);
  }, 60_000);

  it("syn zase nezačal: peníze nepřijdou a táta se ozve", async () => {
    const { dealId } = await acceptOffer();
    await addMatch("m-3", MATCH_3, { home: 1, away: 1, starters: ["k2"], subs: ["k1"], minutes: { k2: 90 } });
    const before = (await parentMessages("k1")).length;
    await tick(AFTER_MATCH_3);
    expect((await db.prepare("SELECT status FROM coach_commitments WHERE id = ?").bind(dealId).first<{ status: string }>())!.status).toBe("broken");
    expect(await budget()).toBe(BUDGET);
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(0);
    const msgs = await parentMessages("k1");
    expect(msgs).toHaveLength(before + 1);
    expect(msgs.at(-1)!.body).not.toMatch(/\d/);
  }, 60_000);

  it("opakované kývnutí nezaloží druhou dohodu", async () => {
    await acceptOffer();
    const convId = await conversationId("k1");
    await replyToParentMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId, playerId: "k1", text: "Jo, platí, beru.", now: new Date("2026-11-25T11:05:00.000Z") }, async () => undefined, null);
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'parent_deal'")).toBe(1);
  }, 60_000);

  it("odmítnutí: nabídka padá, žádná dohoda", async () => {
    await tick(TICK);
    await tick(DELIVER);
    const convId = await conversationId("k1");
    await replyToParentMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId, playerId: "k1", text: "Ne, sestavu si dělám sám a peníze si nechte.", now: new Date("2026-11-25T11:00:00.000Z") }, async () => undefined, null);
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'parent_deal'")).toBe(0);
    expect(await parent("k1")).toMatchObject({ deal_offer_amount: null, mood: "upset" });
  }, 60_000);
});

describe("ticho trenéra", () => {
  beforeEach(async () => {
    await addPlayer("k1", HUMAN_U21, "Tomáš", "Novák");
    await addPlayer("k2", HUMAN_U21, "Jakub", "Dvořák");
    await addParent("k1", "worried_mother", "Jana", "Nováková");
    await addParent("k2", "quiet", "Jiří", "Dvořák");
    await benchTwice();
    await tick(TICK);
    await tick(DELIVER);
    expect(await parentMessages("k1")).toHaveLength(1);
  });

  it("po lhůtě se máma urazí a pohrozí Vimperkem; opakovaný běh nic nezdvojí", async () => {
    await tick(BEFORE_DEADLINE);
    expect((await parent("k1"))!.offended_at).toBeNull();

    const r = await tick(AFTER_DEADLINE);
    expect(r.offended).toBe(1);
    expect(await parent("k1")).toMatchObject({ mood: "offended", awaiting_reply_until: null });
    const msgs = await parentMessages("k1");
    expect(msgs).toHaveLength(2);
    expect(msgs[1].body).toMatch(/Vimperk/);
    const lc = JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = 'k1'").first<{ life_context: string }>())!.life_context);
    expect(lc.transferUnrest.reasons).toContain("parent");
    expect(lc.transferUnrest.level).toBeGreaterThan(0);
    const sonSms = await playerMessages("k1");
    expect(sonSms).toHaveLength(1);
    expect(sonSms[0].body).toMatch(/Vimperk/);

    await tick(new Date(AFTER_DEADLINE.getTime() + 3600_000));
    await tick(new Date(AFTER_DEADLINE.getTime() + 2 * 3600_000));
    expect(await parentMessages("k1")).toHaveLength(2);
    expect(await playerMessages("k1")).toHaveLength(1);
    const lc2 = JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = 'k1'").first<{ life_context: string }>())!.life_context);
    expect(lc2.transferUnrest.level).toBe(lc.transferUnrest.level);
  }, 60_000);

  it("trenér odpověděl včas: nikdo se neurazí", async () => {
    const convId = await conversationId("k1");
    await replyToParentMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId, playerId: "k1", text: "Dobrý den, díky za zprávu, Tomáš dostane šanci.", now: new Date("2026-11-25T12:00:00.000Z") }, async () => undefined, null);
    await tick(AFTER_DEADLINE);
    expect(await parent("k1")).toMatchObject({ offended_at: null, awaiting_reply_until: null });
    expect(await playerMessages("k1")).toHaveLength(0);
  }, 60_000);

  it("hrubá odpověď: máma se urazí hned", async () => {
    const convId = await conversationId("k1");
    await replyToParentMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId, playerId: "k1", text: "Nestarejte se mi do sestavy a neotravujte.", now: new Date("2026-11-25T12:00:00.000Z") }, async () => undefined, null);
    expect((await parent("k1"))!.mood).toBe("offended");
    expect((await parentMessages("k1")).at(-1)!.body).toMatch(/Vimperk/);
    const lc = JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = 'k1'").first<{ life_context: string }>())!.life_context);
    expect(lc.transferUnrest.reasons).toContain("parent");
  }, 60_000);
});

describe("Telefon", () => {
  it("do vlákna rodiče jde psát, stojí kredit a rodič přes model kývne na dohodu", async () => {
    await addPlayer("k1", HUMAN_U21, "Tomáš", "Novák");
    await addParent("k1", "sponsor_dad");
    await db.prepare("UPDATE youth_parents SET deal_offer_amount = 4000, deal_offer_at = ?, sms_count = 1 WHERE id = 'yp-k1'").bind(new Date(Date.now() - 3600_000).toISOString()).run();
    await db.batch([
      db.prepare(`INSERT INTO conversations (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count, last_message_text, last_message_at, created_at)
                  VALUES ('conv-yp', ?, 'system', 'Petr Novák', 'yp-k1', '{}', 0, 0, '', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z')`).bind(HUMAN),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
                  VALUES ('msg-offer', 'conv-yp', 'system', 'yp-k1', 'Petr Novák', 'Trenére, když Tomáš nastoupí od začátku, pošlu klubu 4 000 Kč. Platí?', '2026-11-20T10:00:00Z')`),
    ]);
    await kv.put("ai_provider", "workers-ai");
    const env = {
      DB: db, CACHE_KV: kv, SESSION_KV: sessions,
      AI: { run: async () => ({ response: { body: "Platí, trenére, ruku na to. Pošlu 4 000 Kč.", intent: "accept", tone: "kind" } }) },
    } as unknown as Bindings;
    const token = await createSession(sessions, "u-human", "human@example.test", HUMAN);

    const detail = await app.request(`/api/teams/${HUMAN}/conversations/conv-yp`, { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(await detail.json()).toMatchObject({ canReply: true, channel: "sms" });

    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const background: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
    const res = await app.request(`/api/teams/${HUMAN}/conversations/conv-yp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "Dobře, beru, v neděli jde od začátku." }),
    }, env, ctx as unknown as ExecutionContext);
    expect(res.status).toBe(200);
    for (let done = 0; done < background.length;) {
      const batch = background.slice(done);
      done = background.length;
      await Promise.allSettled(batch);
    }
    random.mockRestore();
    await kv.delete("ai_provider");

    const msgs = await parentMessages("k1");
    expect(msgs.map((m) => m.sender_type)).toEqual(["system", "user", "system"]);
    expect(msgs[2].body).toBe("Platí, trenére, ruku na to. Pošlu 4 000 Kč.");
    expect((await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(HUMAN).first<{ phone_credit: number }>())?.phone_credit).toBeLessThan(36);
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'parent_deal' AND status = 'active'")).toBe(1);
    expect(await db.prepare("SELECT ai_thread_active FROM conversations WHERE id = 'conv-yp'").first()).toEqual({ ai_thread_active: 0 });
  }, 60_000);
});
