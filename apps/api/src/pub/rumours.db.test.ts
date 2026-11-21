/**
 * Drby o přestupech (F10) na skutečné D1 (Miniflare, všechny migrace): signály z databáze,
 * SMS hospodského s volbou, odpověď přes Telefon (tlačítko i volný text), článek ve Zpravodaji
 * se SMS od redakce, uklidnění, lhůta, tip na trh a napojení na hospodu. Model se nepoužívá
 * nikde, takže všechno běží jako s vypnutou AI.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { sendSystemSMS } from "../messaging/system-sms";
import { messagingRouter } from "../routes/messaging";
import { createCoachLedSession, generatePubSessionsForAllTeams } from "../season/pub";
import { RUMOUR_HYPE_PCT, type RumourRng } from "./rumours";
import { handleRumourReply, loadRumourHype, loadRumourWorld, transferRumourForPub } from "./rumours-db";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let sessions: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const AI_CLUB = "ai-club";
const RIVAL = "rival-club";
const LEAGUE = "l-1";
const DAY = "2026-11-23";
const KEEPER = "Hospodský";
const NEWS_DESK = "Redakce Zpravodaje";

/** Náhoda ze seznamu dokola: [šance, výběr signálu, klam, šablona…]. */
function seqRng(values: number[]): RumourRng {
  let i = 0;
  const random = () => values[i++ % values.length];
  return { random, pick: <T>(arr: readonly T[]) => arr[Math.floor(random() * arr.length)] };
}
/** Drb projde, je pravdivý a vezme první signál. */
const TRUE_RUMOUR = () => seqRng([0, 0, 0.9, 0]);
/** Drb projde a hospodský si to splete. */
const FALSE_RUMOUR = () => seqRng([0, 0, 0, 0]);

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function addPlayer(id: string, teamId: string, first: string, last: string, position: string, rating: number, lc: Record<string, unknown> = {}) {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
     VALUES (?, ?, ?, ?, 26, ?, ?, '{}', '{}', '{"alcohol":60}', ?, '{}', 500, 'active')`,
  ).bind(id, teamId, first, last, position, rating, JSON.stringify({ morale: 50, condition: 90, ...lc })).run();
}

async function addScout(clubId: string, playerId: string, status = "active", closedAt: string | null = null) {
  await db.prepare(
    `INSERT INTO scout_assignments (id, team_id, staff_id, age_min, age_max, radius_km, weekly_cost, weeks_total, started_game_date, assignment_type, target_player_id, status, closed_at)
     VALUES (?, ?, 'st-1', 16, 40, 30, 500, 1, ?, 'player', ?, ?, ?)`,
  ).bind(`sa-${clubId}-${playerId}`, clubId, DAY, playerId, status, closedAt).run();
}

async function addWeeklyPlan(clubId: string, plan: Record<string, unknown>, at = `${DAY}T06:00:00Z`) {
  await db.prepare(
    "INSERT INTO ai_coach_decisions (id, team_id, kind, mode, actions, used_fallback, created_at) VALUES (?, ?, 'weekly', 'on', ?, 0, ?)",
  ).bind(crypto.randomUUID(), clubId, JSON.stringify({ transferPlan: plan, at }), at).run();
}

async function lifeContext(playerId: string): Promise<Record<string, unknown>> {
  const r = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string }>();
  return JSON.parse(r!.life_context);
}

async function keeperConv() {
  return db.prepare("SELECT id, participant_id, ai_thread_active, ai_thread_state FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(HUMAN, KEEPER).first<{ id: string; participant_id: string | null; ai_thread_active: number; ai_thread_state: string | null }>();
}

async function systemMessages(title: string) {
  return (await db.prepare(
    `SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.title = ? ORDER BY m.sent_at, m.rowid`,
  ).bind(HUMAN, title).all<{ body: string; metadata: string | null }>()).results;
}

async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "season_calendar", "players", "managers", "teams", "leagues", "seasons"])];
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
  const hasActivity = await db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'last_activity_at'").first();
  if (!hasActivity) await db.exec("ALTER TABLE users ADD COLUMN last_activity_at TEXT");
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 3").all<{ id: string }>()).results.map((r) => r.id);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x'), ('u-rival', 'rival@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', 80000, ?, 'senior', ?)")
      .bind(HUMAN, villages[0], LEAGUE, DAY),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', 80000, ?, 'senior', ?)")
      .bind(AI_CLUB, villages[1], LEAGUE, DAY),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-rival', ?, 'SK Vimperk', 80000, ?, 'senior', ?)")
      .bind(RIVAL, villages[2], LEAGUE, DAY),
  ]);
  await addPlayer("own-mid", HUMAN, "Josef", "Novák", "MID", 48);
  await addPlayer("own-fwd", HUMAN, "Karel", "Dvořák", "FWD", 44);
  await addPlayer("own-def", HUMAN, "Petr", "Kolář", "DEF", 40);
  await addPlayer("rival-gk", AI_CLUB, "Jan", "Hájek", "GK", 45);
  await addPlayer("rival-def", AI_CLUB, "Tomáš", "Černý", "DEF", 41);
  await addPlayer("rival-mid", RIVAL, "Lukáš", "Veselý", "MID", 47);
});

const pubCtx = (over: Partial<{ gameDate: string; coach: boolean; localAttendees: number }> = {}) =>
  ({ teamId: HUMAN, gameDate: DAY, coach: false, localAttendees: 3, ...over });

describe("žádný drb bez signálu ani klamu", () => {
  it("klub bez signálu drb nedostane, ani když hospodský lže a šance vždy projde", async () => {
    expect(await transferRumourForPub(db, pubCtx({ coach: true }), { rng: FALSE_RUMOUR() })).toBeNull();
    for (let d = 1; d <= 20; d++) {
      expect(await transferRumourForPub(db, pubCtx({ gameDate: `2026-12-${String(d).padStart(2, "0")}`, coach: true }))).toBeNull();
    }
    expect(await count("SELECT COUNT(*) AS n FROM pub_rumours")).toBe(0);
    expect(await systemMessages(KEEPER)).toHaveLength(0);
  }, 60_000);

  it("bez nikoho z klubu u stolu a bez trenéra drb nikdo neuslyší", async () => {
    await addScout(RIVAL, "own-mid");
    expect(await transferRumourForPub(db, pubCtx({ localAttendees: 0 }), { rng: TRUE_RUMOUR() })).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM pub_rumours")).toBe(0);
  }, 60_000);
});

describe("signály z databáze", () => {
  it("cizí skaut, pondělní kurz AI klubu, nedoručená nabídka, prodej a nespokojenost; neexistující hráči se zahodí", async () => {
    await addScout(RIVAL, "own-mid");
    // Skaut, který skončil před měsícem, už se neprobírá; vlastní U21 se nepočítá.
    await addScout(AI_CLUB, "own-def", "finished", "2026-10-20T10:00:00Z");
    await addWeeklyPlan(AI_CLUB, { stance: "buy", focus: ["FWD"], sellIds: ["rival-gk", "f-ghost", "rival-mid"] });
    await db.prepare(
      "INSERT INTO ai_coach_decisions (id, team_id, kind, mode, actions, executed, used_fallback, created_at) VALUES ('d-m', ?, 'transfer_market', 'on', ?, ?, 0, ?)",
    ).bind(
      AI_CLUB,
      JSON.stringify([{ kind: "offer", playerId: "own-def" }, { kind: "offer", playerId: "own-mid" }]),
      JSON.stringify([{ kind: "offer", result: "failed" }, { kind: "offer", result: "sent" }]),
      `${DAY}T09:00:00Z`,
    ).run();
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.transferUnrest', json(?)) WHERE id = 'rival-mid'")
      .bind(JSON.stringify({ level: 55 })).run();

    const loaded = await loadRumourWorld(db, HUMAN, DAY);
    expect(loaded).not.toBeNull();
    const keys = loaded!.world.signals.map((s) => `${s.kind}|${s.playerId}|${s.clubId}`).sort();
    expect(keys).toEqual([
      `ai_interest|own-fwd|${AI_CLUB}`, // pondělní kurz: shánějí útočníka, nejlepší útočník
      `ai_interest|own-def|${AI_CLUB}`, // nabídka, která nedorazila
      `ai_sell|rival-gk|${AI_CLUB}`, // f-ghost neexistuje, rival-mid hraje jinde
      `scout|own-mid|${RIVAL}`,
      `unhappy|rival-mid|${RIVAL}`,
    ].sort());
  }, 60_000);

  it("AI klub ani U21 drby nedostávají", async () => {
    expect(await loadRumourWorld(db, AI_CLUB, DAY)).toBeNull();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, parent_team_id, game_date) VALUES ('u21', 'u-human', ?, 'Jiskra Husinec U21', 0, ?, 'u21', ?, ?)")
      .bind(villages[0], LEAGUE, HUMAN, DAY).run();
    expect(await loadRumourWorld(db, "u21", DAY)).toBeNull();
  }, 60_000);
});

describe("drb o vlastním hráči: SMS hospodského s volbou", () => {
  it("cizí skaut dá drb s tlačítky ve vlákně hospodského; opakovaný běh nepřidá drb ani SMS", async () => {
    // Hospodský už dřív psal (incident): drb musí přijít do stejného vlákna.
    await sendSystemSMS(db, HUMAN, KEEPER, "🍺 Starší zpráva od hospodského.");
    await addScout(RIVAL, "own-mid");

    const inc = await transferRumourForPub(db, pubCtx(), { rng: TRUE_RUMOUR() });
    expect(inc?.type).toBe("transfer_rumour");
    expect(inc?.text).toContain("Josef Novák");
    expect(inc?.text).toContain("SK Vimperk");

    const row = await db.prepare("SELECT * FROM pub_rumours WHERE team_id = ?").bind(HUMAN).first<Record<string, unknown>>();
    expect(row).toMatchObject({ subject: "own", signal: "scout", player_id: "own-mid", club_team_id: RIVAL, is_true: 1, status: "pending", expires_on: "2026-11-25", season_number: 3 });

    const conv = await keeperConv();
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ? AND title = ?", HUMAN, KEEPER)).toBe(1);
    expect(conv).toMatchObject({ participant_id: `pk-${HUMAN}`, ai_thread_active: 1 });
    expect(row!.conv_id).toBe(conv!.id);
    const msgs = await systemMessages(KEEPER);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].body).toContain("Josef Novák");
    expect(msgs[1].body).not.toMatch(/[—–]/);
    const meta = JSON.parse(msgs[1].metadata!);
    expect(meta).toMatchObject({ type: "pub_rumour", rumourId: row!.id });
    expect(meta.options.map((o: { id: string }) => o.id)).toEqual(["publish", "calm"]);

    // Druhý běh téhož dne (fronta, dvojí cron) i návštěva s trenérem: stejný drb, žádná další SMS.
    const again = await transferRumourForPub(db, pubCtx(), { rng: TRUE_RUMOUR() });
    const coach = await transferRumourForPub(db, pubCtx({ coach: true }), { rng: FALSE_RUMOUR() });
    expect(again?.text).toBe(inc?.text);
    expect(coach?.text).toBe(inc?.text);
    expect(await count("SELECT COUNT(*) AS n FROM pub_rumours")).toBe(1);
    expect(await systemMessages(KEEPER)).toHaveLength(2);

    // Další den o vlastním hráči nic, dokud trenér nerozhodne.
    expect(await transferRumourForPub(db, pubCtx({ gameDate: "2026-11-24" }), { rng: TRUE_RUMOUR() })).toBeNull();

    // Ostatní SMS hospodského dál chodí do stejného vlákna.
    await sendSystemSMS(db, HUMAN, KEEPER, "🍺 Další zpráva.");
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ? AND title = ?", HUMAN, KEEPER)).toBe(1);
  }, 60_000);

  it("spletený drb mluví o skutečném hráči a klubu, jen to nesedí", async () => {
    await addScout(RIVAL, "own-mid");
    await transferRumourForPub(db, pubCtx(), { rng: FALSE_RUMOUR() });
    const row = await db.prepare("SELECT player_id, club_team_id, is_true, text FROM pub_rumours").first<{ player_id: string; club_team_id: string; is_true: number; text: string }>();
    expect(row?.is_true).toBe(0);
    expect(`${row?.player_id}|${row?.club_team_id}`).not.toBe(`own-mid|${RIVAL}`);
    expect(["own-mid", "own-fwd", "own-def"]).toContain(row?.player_id);
    expect([AI_CLUB, RIVAL]).toContain(row?.club_team_id);
  }, 60_000);
});

describe("odpověď přes Telefon", () => {
  async function pendingRumour() {
    await addScout(RIVAL, "own-mid");
    await transferRumourForPub(db, pubCtx(), { rng: TRUE_RUMOUR() });
    return (await keeperConv())!;
  }

  function http() {
    const env = { DB: db, CACHE_KV: kv, SESSION_KV: sessions } as unknown as Bindings;
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext;
    return {
      get: async (convId: string, token: string) => (await app.request(`/api/teams/${HUMAN}/conversations/${convId}`, { headers: { Authorization: `Bearer ${token}` } }, env, ctx)).json() as Promise<Record<string, unknown>>,
      post: (convId: string, token: string, body: Record<string, unknown>) => app.request(`/api/teams/${HUMAN}/conversations/${convId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }, env, ctx),
    };
  }

  it("tlačítko Pustit do novin: článek ve vlastní rubrice, SMS od redakce s tlačítkem, nálada a cena; druhé kliknutí nic nezopakuje", async () => {
    const conv = await pendingRumour();
    const token = await createSession(sessions, "u-human", "human@example.test", HUMAN);
    const h = http();
    expect(await h.get(conv.id, token)).toMatchObject({ canReply: true, channel: "imessage" });

    const res = await h.post(conv.id, token, { body: "Pusť to dál, ať to napíšou do Zpravodaje.", optionId: "publish" });
    expect(res.status).toBe(200);

    const news = (await db.prepare("SELECT id, league_id, team_id, type, headline, body, season_number FROM news WHERE type = 'transfer_rumour'").all<Record<string, string>>()).results;
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ league_id: LEAGUE, team_id: HUMAN, season_number: 3 });
    expect(news[0].headline).toContain("Josef Novák");
    expect(`${news[0].headline} ${news[0].body}`).toContain("SK Vimperk");
    expect(`${news[0].headline} ${news[0].body}`).not.toMatch(/[—–]/);

    const desk = await systemMessages(NEWS_DESK);
    expect(desk).toHaveLength(1);
    expect(JSON.parse(desk[0].metadata!)).toEqual({ type: "guide", href: `/zpravodaj?article=${news[0].id}`, label: "Otevřít Zpravodaj", newsId: news[0].id });

    const lc = await lifeContext("own-mid");
    expect(lc.morale).toBe(45);
    expect(lc.rumourHype).toEqual({ until: "2026-12-14", pct: RUMOUR_HYPE_PCT });
    expect((await loadRumourHype(db, ["own-mid", "own-fwd"], DAY)).get("own-mid")).toBeCloseTo(1 + RUMOUR_HYPE_PCT);
    expect((await loadRumourHype(db, ["own-mid"], "2026-12-15")).size).toBe(0);

    expect(await db.prepare("SELECT status, news_id FROM pub_rumours").first()).toMatchObject({ status: "published", news_id: news[0].id });
    expect((await keeperConv())?.ai_thread_active).toBe(0);
    const keeper = await systemMessages(KEEPER);
    expect(keeper.at(-1)?.body).toMatch(/Zpravodaj/);
    expect(await h.get(conv.id, token)).toMatchObject({ canReply: false });

    // Druhé kliknutí: vlákno už nečeká, server odmítne a nic se nezopakuje.
    const second = await h.post(conv.id, token, { body: "Pusť to dál, ať to napíšou do Zpravodaje.", optionId: "publish" });
    expect(second.status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'transfer_rumour'")).toBe(1);
    expect(await systemMessages(NEWS_DESK)).toHaveLength(1);
    expect((await lifeContext("own-mid")).morale).toBe(45);
  }, 60_000);

  it("dvě odpovědi naráz (dvojklik, souběžné požadavky): jeden dopad, jedna SMS od redakce", async () => {
    const conv = await pendingRumour();
    await Promise.all([
      handleRumourReply(db, conv.id, HUMAN, "pusť to", "publish"),
      handleRumourReply(db, conv.id, HUMAN, "pusť to", "publish"),
    ]);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'transfer_rumour'")).toBe(1);
    expect(await systemMessages(NEWS_DESK)).toHaveLength(1);
    expect((await lifeContext("own-mid")).morale).toBe(45);
    const keeper = (await systemMessages(KEEPER)).map((m) => m.body);
    expect(keeper.filter((b) => b.includes("vyřízený"))).toHaveLength(1);
  }, 60_000);

  it("volný text s vulgaritou a překlepy: hráče uklidní, hráč napíše, žádný článek", async () => {
    const conv = await pendingRumour();
    await handleRumourReply(db, conv.id, HUMAN, "Do prdele, nikomu to neříkej prosimtě, s Pepou si promluvim sám zejtra po tréninku", null);

    expect(await db.prepare("SELECT status FROM pub_rumours").first()).toEqual({ status: "calmed" });
    const lc = await lifeContext("own-mid");
    expect(lc.morale).toBe(52);
    expect(lc.rumourCalm).toEqual({ until: "2026-12-23", teamId: HUMAN });
    expect(lc.rumourHype).toBeUndefined();
    expect(await count("SELECT COUNT(*) AS n FROM news")).toBe(0);
    const playerSms = await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = 'own-mid'",
    ).bind(HUMAN).all<{ body: string }>();
    expect(playerSms.results).toHaveLength(1);
    expect((await keeperConv())?.ai_thread_active).toBe(0);
  }, 60_000);

  it("nejasná odpověď: hospodský se zeptá znovu a drb dál čeká", async () => {
    const conv = await pendingRumour();
    await handleRumourReply(db, conv.id, HUMAN, "a kolik stojí to pivo?", null);
    expect(await db.prepare("SELECT status FROM pub_rumours").first()).toEqual({ status: "pending" });
    expect((await systemMessages(KEEPER)).at(-1)?.body).toMatch(/novin.*promluvíš/);
    expect((await keeperConv())?.ai_thread_active).toBe(1);
  }, 60_000);

  it("hráč mezitím odešel: nic se nezapíše a hospodský to řekne", async () => {
    const conv = await pendingRumour();
    await db.prepare("UPDATE players SET team_id = ? WHERE id = 'own-mid'").bind(RIVAL).run();
    await handleRumourReply(db, conv.id, HUMAN, "", "publish");
    expect(await db.prepare("SELECT status FROM pub_rumours").first()).toEqual({ status: "expired" });
    expect(await count("SELECT COUNT(*) AS n FROM news")).toBe(0);
    expect((await lifeContext("own-mid")).morale).toBe(50);
    expect((await keeperConv())?.ai_thread_active).toBe(0);
  }, 60_000);
});

describe("lhůta: drb bez odpovědi vyšumí", () => {
  it("třetí den po lhůtě se drb uzavře, vlákno přestane čekat a pozdní odpověď nic neudělá", async () => {
    await addScout(RIVAL, "own-mid");
    await transferRumourForPub(db, pubCtx(), { rng: TRUE_RUMOUR() });
    const conv = (await keeperConv())!;

    // Poslední den lhůty se nic neděje.
    await transferRumourForPub(db, pubCtx({ gameDate: "2026-11-25", localAttendees: 0 }));
    expect(await db.prepare("SELECT status FROM pub_rumours").first()).toEqual({ status: "pending" });

    await transferRumourForPub(db, pubCtx({ gameDate: "2026-11-26", localAttendees: 0 }));
    expect(await db.prepare("SELECT status FROM pub_rumours").first()).toEqual({ status: "expired" });
    expect((await keeperConv())?.ai_thread_active).toBe(0);
    expect((await systemMessages(KEEPER)).at(-1)?.body).toMatch(/vyšuměl/);

    // Opakovaný běh téhož dne: žádná další zpráva.
    const before = (await systemMessages(KEEPER)).length;
    await transferRumourForPub(db, pubCtx({ gameDate: "2026-11-26", localAttendees: 0 }));
    expect(await systemMessages(KEEPER)).toHaveLength(before);

    await handleRumourReply(db, conv.id, HUMAN, "pusť to do novin", null);
    expect(await count("SELECT COUNT(*) AS n FROM news")).toBe(0);
    expect((await lifeContext("own-mid")).morale).toBe(50);
  }, 60_000);
});

describe("tip na trh o cizím hráči", () => {
  it("AI klub chce hráče pustit: tip s tlačítkem na hráče, bez otázky a bez čekání; neexistující hráč nikdy", async () => {
    await addWeeklyPlan(AI_CLUB, { stance: "hold", focus: [], sellIds: ["f-ghost", "rival-gk"] });
    const inc = await transferRumourForPub(db, pubCtx(), { rng: TRUE_RUMOUR() });
    expect(inc?.text).toContain("Jan Hájek");
    expect(inc?.playerIds).toEqual([]);

    const row = await db.prepare("SELECT subject, signal, player_id, club_team_id, status, expires_on FROM pub_rumours").first();
    expect(row).toEqual({ subject: "foreign", signal: "ai_sell", player_id: "rival-gk", club_team_id: AI_CLUB, status: "tip", expires_on: null });
    const msgs = await systemMessages(KEEPER);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Tip od výčepu");
    expect(msgs[0].body).not.toContain("ghost");
    expect(JSON.parse(msgs[0].metadata!)).toEqual({ type: "guide", href: "/hrac/rival-gk", label: "Otevřít hráče" });
    expect((await keeperConv())?.ai_thread_active ?? 0).toBe(0);
  }, 60_000);
});

describe("napojení na hospodu", () => {
  it("večer v hospodě zapíše drb do deníku, návštěva s trenérem ho nezdvojí ani nepošle druhou SMS", async () => {
    await addScout(RIVAL, "own-mid");
    const rng = createRng(42);
    const random = vi.spyOn(Math, "random").mockImplementation(() => rng.random());
    let day: string | null = null;
    try {
      for (let d = 1; d <= 30 && !day; d++) {
        const gameDate = `2026-11-${String(d).padStart(2, "0")}`;
        await generatePubSessionsForAllTeams(db, gameDate);
        if (await count("SELECT COUNT(*) AS n FROM pub_rumours WHERE game_date = ?", gameDate)) day = gameDate;
      }
      expect(day).not.toBeNull();
      const incidentsOf = async () => JSON.parse((await db.prepare("SELECT incidents FROM pub_sessions WHERE team_id = ? AND game_date = ?")
        .bind(HUMAN, day).first<{ incidents: string }>())!.incidents) as Array<{ type: string; text: string }>;
      expect((await incidentsOf()).filter((i) => i.type === "transfer_rumour")).toHaveLength(1);
      const smsBefore = (await systemMessages(KEEPER)).length;
      expect(smsBefore).toBeGreaterThan(0);

      const visit = await createCoachLedSession(db, HUMAN, day!, "all");
      expect(visit.ok).toBe(true);
      expect((await incidentsOf()).filter((i) => i.type === "transfer_rumour")).toHaveLength(1);
      expect(await systemMessages(KEEPER)).toHaveLength(smsBefore);
      expect(await count("SELECT COUNT(*) AS n FROM pub_rumours")).toBe(1);
    } finally {
      random.mockRestore();
    }
  }, 120_000);
});
