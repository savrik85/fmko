/**
 * Druhý život legend na skutečné D1 (Miniflare, všechny migrace): háček za souboji „kdo zůstane“,
 * role v okrese (sudí, vůdce kotle, hospodský, trenér žáků), rozloučení ve Zpravodaji se SMS
 * od redakce, SMS legendy bývalému trenérovi a jeho odpověď přes Telefon.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import type { AiContext } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { ensureReferees } from "../referees/referee-generator";
import { ensureFanGroups } from "../fans/fan-group-generator";
import { decideSeasonDuels, type SeasonDuel } from "./season-duels";
import { loadLegendSnapshot, recordLegendCandidate, replyToLegendMessage, tickLegends } from "./legends-db";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let sessions: KVNamespace;
let villages: string[] = [];

const HUMAN = "human-club";
const AI_CLUB = "ai-club";
const LEAGUE = "l-1";
const NEWS_DESK = "Redakce Zpravodaje";
/** Háček v pondělí ráno, přidělení role dopoledne (11:00 v Praze). */
const HOOK_AT = new Date("2026-11-23T08:00:00.000Z");
const TICK_AT = new Date("2026-11-23T10:00:00.000Z");
/** Pět dní po odchodu: první SMS už je na řadě. */
const LATER = new Date("2026-11-28T10:00:00.000Z");

const REFEREE_TRAITS = { discipline: 92, temper: 10, alcohol: 15, patriotism: 40, leadership: 30, workRate: 50, aggression: 30 };
const COACH_TRAITS = { discipline: 50, temper: 30, alcohol: 15, patriotism: 92, leadership: 95, workRate: 70, aggression: 30 };
const PUB_TRAITS = { discipline: 15, temper: 50, alcohol: 96, patriotism: 40, leadership: 30, workRate: 40, aggression: 40 };
const KOTEL_TRAITS = { discipline: 25, temper: 92, alcohol: 40, patriotism: 96, leadership: 40, workRate: 50, aggression: 85 };

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

async function legend(playerId: string) {
  return db.prepare("SELECT * FROM legends WHERE departed_player_id = ?").bind(playerId).first<Record<string, unknown>>();
}

async function addPlayer(id: string, teamId: string, age: number, traits: Record<string, number> = {}, joinedSeason = 2, lastName = `Hráč${id}`) {
  await db.batch([
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
       VALUES (?, ?, 'Josef', ?, ?, 'DEF', 40, '{}', '{}', ?, ?, '{"hair":{"id":"short"}}', 500, 'active')`,
    ).bind(id, teamId, lastName, age, JSON.stringify(traits), JSON.stringify({ occupation: "Zedník", morale: 50 })),
    db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, is_active) VALUES (?, ?, ?, ?, 'generated', 1)")
      .bind(`pc-${id}`, id, teamId, `s-${joinedSeason}`),
  ]);
}

/** Odchod přes háček: snímek před smazáním, pak záznam kandidáta (jako decideSeasonDuels). */
async function departAsLegend(id: string, teamId = HUMAN, recapSeason = 2, at = HOOK_AT): Promise<boolean> {
  const snap = await loadLegendSnapshot(db, id, teamId);
  if (!snap) throw new Error(`hráč ${id} nenalezen`);
  await db.prepare("DELETE FROM player_contracts WHERE player_id = ?").bind(id).run();
  await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
  return recordLegendCandidate(db, snap, recapSeason, at);
}

async function redakceMessages(teamId: string) {
  return (await db.prepare(
    `SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.title = ?`,
  ).bind(teamId, NEWS_DESK).all<{ body: string; metadata: string }>()).results;
}

async function legendMessages(teamId: string, playerId: string) {
  return (await db.prepare(
    `SELECT m.body, m.sender_type, c.title, c.participant_avatar FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.participant_id = ? ORDER BY m.sent_at, m.rowid`,
  ).bind(teamId, `ex-${playerId}`).all<{ body: string; sender_type: string; title: string; participant_avatar: string | null }>()).results;
}

async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "legends", "referees", "sponsor_owners", "season_calendar", "players", "managers", "teams", "leagues", "seasons"])];
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
    db.prepare("UPDATE users SET last_activity_at = ? WHERE id = 'u-human'").bind(TICK_AT.toISOString()),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'finished'), ('s-2', 2, 'finished'), ('s-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date, phone_credit, phone_credit_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', 80000, ?, 'senior', '2026-11-23', 36, '2026-11-23')")
      .bind(HUMAN, villages[0], LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', 80000, ?, 'senior', '2026-11-23')")
      .bind(AI_CLUB, villages[1], LEAGUE),
  ]);
});

describe("háček za souboji kdo zůstane", () => {
  it("starší hráč odejde jako legenda, mladý s jednou sezónou ne", async () => {
    await addPlayer("old", HUMAN, 34, {}, 2);
    await addPlayer("young", HUMAN, 23, {}, 2);
    await addPlayer("keep-a", HUMAN, 25, {}, 2);
    await addPlayer("keep-b", HUMAN, 26, {}, 2);
    const p = async (id: string) => {
      const r = await db.prepare("SELECT first_name, last_name, position, age, overall_rating FROM players WHERE id = ?").bind(id)
        .first<{ first_name: string; last_name: string; position: string; age: number; overall_rating: number }>();
      return { playerId: id, name: `${r!.first_name} ${r!.last_name}`, position: r!.position, age: r!.age, overallRating: r!.overall_rating };
    };
    const duels: SeasonDuel[] = [{ a: await p("old"), b: await p("keep-a") }, { a: await p("young"), b: await p("keep-b") }];
    await db.prepare("INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, 2, ?, 0)")
      .bind(HUMAN, JSON.stringify({ departures: [], decision: { duels } })).run();

    const res = await decideSeasonDuels(db, HUMAN, ["old", "young"]);
    expect(res).toEqual({ ok: true, removed: 2 });

    const l = await legend("old");
    expect(l).toMatchObject({ status: "pending", former_team_id: HUMAN, coach_user_id: "u-human", district: "Prachatice", season_number: 2, age: 34, seasons_in_club: 1, first_name: "Josef" });
    expect(await legend("young")).toBeNull();
  }, 60_000);

  it("dvě sezóny v klubu stačí i mladému", async () => {
    await addPlayer("loyal", HUMAN, 24, {}, 1);
    expect(await departAsLegend("loyal", HUMAN, 2)).toBe(true);
    expect(await legend("loyal")).toMatchObject({ seasons_in_club: 2, status: "pending" });
  }, 60_000);

  it("opakovaný háček nevytvoří druhou legendu", async () => {
    await addPlayer("twice", HUMAN, 33);
    const snap = await loadLegendSnapshot(db, "twice", HUMAN);
    expect(await recordLegendCandidate(db, snap!, 2, HOOK_AT)).toBe(true);
    expect(await recordLegendCandidate(db, snap!, 2, HOOK_AT)).toBe(false);
    expect(await count("SELECT COUNT(*) AS n FROM legends WHERE departed_player_id = 'twice'")).toBe(1);
  }, 60_000);
});

describe("role v okrese, rozloučení a SMS od redakce (AI vypnutá)", () => {
  it("pravidlo vybere roli, vznikne článek a SMS od redakce; druhý běh nic nezopakuje", async () => {
    await addPlayer("ref", HUMAN, 33, REFEREE_TRAITS, 1, "Kouba");
    await departAsLegend("ref");

    const first = await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });
    expect(first.assigned).toBe(1);
    const l = await legend("ref");
    expect(l).toMatchObject({ status: "active", role: "referee", decided_by: "rule", entity_id: "ref-lg-ref" });
    expect(await db.prepare("SELECT first_name, last_name, district, status FROM referees WHERE id = 'ref-lg-ref'").first())
      .toEqual({ first_name: "Josef", last_name: "Kouba", district: "Prachatice", status: "active" });

    const news = await db.prepare("SELECT id, league_id, team_id, type, headline, body, season_number FROM news WHERE type = 'legend_farewell'").all<Record<string, unknown>>();
    expect(news.results).toHaveLength(1);
    expect(news.results[0]).toMatchObject({ league_id: LEAGUE, team_id: HUMAN, season_number: 3, id: l!.news_id });
    expect(String(news.results[0].headline)).toContain("Kouba");
    expect(`${news.results[0].headline} ${news.results[0].body}`).not.toMatch(/[—–]/);

    const sms = await redakceMessages(HUMAN);
    expect(sms).toHaveLength(1);
    expect(JSON.parse(sms[0].metadata)).toEqual({
      type: "guide", href: `/zpravodaj?article=${l!.news_id}`, label: "Otevřít Zpravodaj", newsId: l!.news_id,
    });

    const again = await tickLegends(db, { CACHE_KV: kv }, new Date(TICK_AT.getTime() + 3600_000), { ai: null });
    expect(again.assigned).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'legend_farewell'")).toBe(1);
    expect(await redakceMessages(HUMAN)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM referees WHERE id LIKE 'ref-lg-%'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM legends")).toBe(1);
  }, 60_000);

  it("v noci se nic nepřiděluje ani neposílá", async () => {
    await addPlayer("night", HUMAN, 35);
    await departAsLegend("night");
    const r = await tickLegends(db, { CACHE_KV: kv }, new Date("2026-11-23T23:30:00.000Z"), { ai: null });
    expect(r.assigned).toBe(0);
    expect((await legend("night"))?.status).toBe("pending");
  }, 60_000);

  it("klub má za sezónu jednu legendu: tu, co tam byla nejdéle", async () => {
    await addPlayer("veteran", HUMAN, 36, {}, 2);
    await addPlayer("loyal", HUMAN, 31, {}, 1);
    await departAsLegend("veteran");
    await departAsLegend("loyal");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });
    expect((await legend("loyal"))?.status).toBe("active");
    expect((await legend("veteran"))?.status).toBe("skipped");
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'legend_farewell'")).toBe(1);
  }, 60_000);

  it("obsazené místo trenéra žáků se nepřepíše", async () => {
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, weekly_wage, signing_fee, avatar)
       VALUES ('st-existing', 'Prachatice', ?, 'trener_mladeze', 'trener_mladeze', 'Karel', 'Stávající', 50, 300, 1200, '{}')`,
    ).bind(HUMAN).run();
    await addPlayer("coach", HUMAN, 37, COACH_TRAITS, 1);
    await departAsLegend("coach");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });

    const l = await legend("coach");
    expect(l?.status).toBe("active");
    expect(l?.role).not.toBe("youth_coach");
    expect(await db.prepare("SELECT id, first_name, last_name, weekly_wage FROM staff_members WHERE team_id = ? AND role = 'trener_mladeze'").bind(HUMAN).all())
      .toMatchObject({ results: [{ id: "st-existing", first_name: "Karel", last_name: "Stávající", weekly_wage: 300 }] });
  }, 60_000);

  it("volné místo trenéra žáků legenda vezme zadarmo", async () => {
    await addPlayer("coach", HUMAN, 37, COACH_TRAITS, 1);
    await departAsLegend("coach");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });
    expect(await legend("coach")).toMatchObject({ role: "youth_coach", entity_id: "st-lg-coach" });
    expect(await db.prepare("SELECT team_id, role, first_name, weekly_wage, signing_fee FROM staff_members WHERE id = 'st-lg-coach'").first())
      .toEqual({ team_id: HUMAN, role: "trener_mladeze", first_name: "Josef", weekly_wage: 0, signing_fee: 0 });
  }, 60_000);

  it("sudí-legenda nezmění jména ani pořadí stávajících sudích", async () => {
    await ensureReferees(db, "Prachatice");
    const before = (await db.prepare("SELECT id, first_name, last_name, archetype FROM referees WHERE district = 'Prachatice' ORDER BY id").all()).results;
    expect(before.length).toBeGreaterThan(10);

    await addPlayer("ref", HUMAN, 33, REFEREE_TRAITS, 1);
    await departAsLegend("ref");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });

    const after = (await db.prepare("SELECT id, first_name, last_name, archetype FROM referees WHERE district = 'Prachatice' ORDER BY id").all()).results;
    expect(after.filter((r) => r.id !== "ref-lg-ref")).toEqual(before);
    expect(after.map((r) => r.id)).toContain("ref-lg-ref");
    // Listina se tím nepřegeneruje: dál stejní lidé a k nim legenda.
    const pool = await ensureReferees(db, "Prachatice");
    expect(pool.map((r) => r.id).filter((id) => id !== "ref-lg-ref")).toEqual(before.map((r) => r.id));
  }, 60_000);

  it("vůdce kotle: legenda převezme kotel, dosavadní vůdce odchází", async () => {
    const groups = await ensureFanGroups(db, HUMAN);
    const kotel = groups.find((g) => g.kind === "kotel")!;
    const oldLeader = kotel.leader_id!;
    await addPlayer("kotel", HUMAN, 33, KOTEL_TRAITS, 1);
    await departAsLegend("kotel");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });

    expect(await legend("kotel")).toMatchObject({ role: "fan_leader", entity_id: "fl-lg-kotel" });
    expect(await db.prepare("SELECT leader_id FROM fan_groups WHERE id = ?").bind(kotel.id).first()).toEqual({ leader_id: "fl-lg-kotel" });
    expect(await db.prepare("SELECT status FROM fan_leaders WHERE id = ?").bind(oldLeader).first()).toEqual({ status: "retired" });
    expect(await db.prepare("SELECT team_id, group_id, status, first_name FROM fan_leaders WHERE id = 'fl-lg-kotel'").first())
      .toEqual({ team_id: HUMAN, group_id: kotel.id, status: "active", first_name: "Josef" });
  }, 60_000);

  it("hospodský: legenda převezme hospodu v okrese", async () => {
    await addPlayer("pub", HUMAN, 41, PUB_TRAITS, 1, "Pivoňka");
    await departAsLegend("pub");
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });

    const l = await legend("pub");
    expect(l?.role).toBe("pub_owner");
    const sponsorId = Number(l!.entity_id);
    expect(await db.prepare("SELECT district, type FROM district_sponsors WHERE id = ?").bind(sponsorId).first())
      .toEqual({ district: "Prachatice", type: "pub" });
    expect(await db.prepare("SELECT first_name, last_name, age FROM sponsor_owners WHERE sponsor_id = ?").bind(sponsorId).first())
      .toEqual({ first_name: "Josef", last_name: "Pivoňka", age: 41 });
  }, 60_000);

  it("legenda z AI klubu vznikne, ale nikomu nepíše", async () => {
    await addPlayer("ai-old", AI_CLUB, 35, REFEREE_TRAITS, 1);
    await departAsLegend("ai-old", AI_CLUB);
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });
    expect((await legend("ai-old"))?.status).toBe("active");
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null });
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE team_id = ?", AI_CLUB)).toBe(0);
  }, 60_000);
});

describe("roli vybírá model", () => {
  it("model zvolí z nabídky, kód to přijme", async () => {
    await addPlayer("ref", HUMAN, 33, REFEREE_TRAITS, 1);
    await departAsLegend("ref");
    const ai = fakeAi((prompt) => prompt.includes("\"role\"")
      ? { role: "pub_owner", reason: "Rád mezi lidmi." }
      : prompt.includes("\"headline\"")
        ? { headline: "Josef Hráčref končí, bude čepovat", body: "Josef Hráčref se loučí s Jiskrou Husinec. ".repeat(4) }
        : { body: "Ahoj trenére." });
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: ai.ctx });
    expect(await legend("ref")).toMatchObject({ role: "pub_owner", decided_by: "model", role_reason: "Rád mezi lidmi." });
    expect(ai.prompts[0]).toContain("33 let");
    expect(ai.prompts[0]).toContain("pub_owner");
    expect(ai.prompts[0]).not.toMatch(/\b92\b/);
    expect(await db.prepare("SELECT headline FROM news WHERE type = 'legend_farewell'").first()).toEqual({ headline: "Josef Hráčref končí, bude čepovat" });
  }, 60_000);

  it("role mimo nabídku: zaskočí pravidlo", async () => {
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, weekly_wage, signing_fee, avatar)
       VALUES ('st-existing', 'Prachatice', ?, 'trener_mladeze', 'trener_mladeze', 'Karel', 'Stávající', 50, 300, 1200, '{}')`,
    ).bind(HUMAN).run();
    await addPlayer("ref", HUMAN, 33, REFEREE_TRAITS, 1);
    await departAsLegend("ref");
    const ai = fakeAi((prompt) => (prompt.includes("\"role\"") ? { role: "youth_coach" } : { headline: "x", body: "y" }));
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: ai.ctx });
    expect(await legend("ref")).toMatchObject({ role: "referee", decided_by: "rule" });
    // Článek z modelu neprošel kontrolou: vyšel náhradní, ne prázdný.
    expect(String((await db.prepare("SELECT headline FROM news WHERE type = 'legend_farewell'").first<{ headline: string }>())?.headline)).toContain("Hráčref");
  }, 60_000);
});

describe("legenda píše bývalému trenérovi", () => {
  async function activeLegend(id = "ref", traits = REFEREE_TRAITS) {
    await addPlayer(id, HUMAN, 33, traits, 1, "Kouba");
    await departAsLegend(id);
    await tickLegends(db, { CACHE_KV: kv }, TICK_AT, { ai: null });
  }

  it("první SMS až po pár dnech a jen jednou", async () => {
    await activeLegend();
    expect(await legendMessages(HUMAN, "ref")).toHaveLength(0);

    const r = await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    expect(r.firstSms).toBe(1);
    const msgs = await legendMessages(HUMAN, "ref");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ sender_type: "system", title: "Josef Kouba" });
    expect(msgs[0].participant_avatar).toContain("hair");
    expect(msgs[0].body).not.toMatch(/[—–]/);

    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    await tickLegends(db, { CACHE_KV: kv }, new Date(LATER.getTime() + 3600_000), { ai: null, rng: () => 0.99 });
    expect(await legendMessages(HUMAN, "ref")).toHaveLength(1);
  }, 60_000);

  it("sudí-legenda ohlásí, že bývalému klubu píská, jednou za zápas", async () => {
    await activeLegend();
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    await db.batch([
      db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES ('cal-1', ?, 3, 5, 'sunday', '2026-11-29T14:00:00.000Z')").bind(LEAGUE),
      db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status, referee_id) VALUES ('m-1', ?, 'cal-1', ?, ?, 'scheduled', 'ref-lg-ref')").bind(LEAGUE, AI_CLUB, HUMAN),
    ]);
    const r = await tickLegends(db, { CACHE_KV: kv }, new Date(LATER.getTime() + 3600_000), { ai: null, rng: () => 0.99 });
    expect(r.whistle).toBe(1);
    const msgs = await legendMessages(HUMAN, "ref");
    expect(msgs).toHaveLength(2);
    expect(msgs[1].body).toContain("pískám");
    expect(msgs[1].body).toContain("TJ Netolice");

    await tickLegends(db, { CACHE_KV: kv }, new Date(LATER.getTime() + 7200_000), { ai: null, rng: () => 0.99 });
    expect(await legendMessages(HUMAN, "ref")).toHaveLength(2);
  }, 60_000);

  it("občasná SMS po delší pauze, ne hned znovu", async () => {
    await activeLegend("pub", PUB_TRAITS);
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    // Hned po první SMS nic, i když kostka padne.
    expect((await tickLegends(db, { CACHE_KV: kv }, new Date(LATER.getTime() + 3 * 3600_000), { ai: null, rng: () => 0 })).sms).toBe(0);

    const muchLater = new Date("2026-12-12T10:00:00.000Z");
    await db.prepare("UPDATE users SET last_activity_at = ? WHERE id = 'u-human'").bind(muchLater.toISOString()).run();
    const r = await tickLegends(db, { CACHE_KV: kv }, muchLater, { ai: null, rng: () => 0 });
    expect(r.sms).toBe(1);
    expect(await legendMessages(HUMAN, "pub")).toHaveLength(2);
    expect((await tickLegends(db, { CACHE_KV: kv }, new Date(muchLater.getTime() + 3600_000), { ai: null, rng: () => 0 })).sms).toBe(0);
    expect(await legendMessages(HUMAN, "pub")).toHaveLength(2);
  }, 60_000);

  it("trenérovi, který klub mezitím opustil, legenda nepíše", async () => {
    await activeLegend();
    await db.prepare("UPDATE teams SET user_id = 'ai' WHERE id = ?").bind(HUMAN).run();
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0 });
    expect(await legendMessages(HUMAN, "ref")).toHaveLength(0);
  }, 60_000);

  it("odpověď na zprávu trenéra: model, a bez modelu připravená věta", async () => {
    await activeLegend();
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    const conv = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND participant_id = 'ex-ref'").bind(HUMAN).first<{ id: string }>();

    const ai = fakeAi(() => ({ body: "Díky trenére — v neděli bez protekce." }));
    expect(await replyToLegendMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId: conv!.id, departedPlayerId: "ref", text: "Pískej nám poctivě, Pepo." }, async () => undefined, ai.ctx)).toBe(true);
    expect(ai.prompts[0]).toContain("Pískej nám poctivě, Pepo.");
    expect(ai.prompts[0]).toContain("rozhodčí");
    let msgs = await legendMessages(HUMAN, "ref");
    expect(msgs.at(-1)?.body).toBe("Díky trenére, v neděli bez protekce.");

    expect(await replyToLegendMessage(db, { CACHE_KV: kv }, { teamId: HUMAN, convId: conv!.id, departedPlayerId: "ref", text: "Ozvi se." }, async () => undefined, null)).toBe(true);
    msgs = await legendMessages(HUMAN, "ref");
    expect(msgs).toHaveLength(3);
    expect(msgs.at(-1)?.body.length).toBeGreaterThan(5);
  }, 60_000);

  it("do vlákna legendy jde psát přes Telefon a legenda odpoví", async () => {
    await activeLegend();
    await tickLegends(db, { CACHE_KV: kv }, LATER, { ai: null, rng: () => 0.99 });
    const conv = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND participant_id = 'ex-ref'").bind(HUMAN).first<{ id: string }>();
    // První SMS přišla dny předem; v testu by měla stejnou sekundu jako zpráva trenéra.
    await db.prepare("UPDATE messages SET sent_at = '2026-11-20T10:00:00Z' WHERE conversation_id = ?").bind(conv!.id).run();
    await kv.put("ai_provider", "workers-ai");
    const env = {
      DB: db, CACHE_KV: kv, SESSION_KV: sessions,
      AI: { run: async () => ({ response: { body: "Jasně, trenére, uvidíme se na hřišti." } }) },
    } as unknown as Bindings;
    const token = await createSession(sessions, "u-human", "human@example.test", HUMAN);

    const detail = await app.request(`/api/teams/${HUMAN}/conversations/${conv!.id}`, { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(await detail.json()).toMatchObject({ canReply: true, channel: "sms" });

    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const background: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
    const res = await app.request(`/api/teams/${HUMAN}/conversations/${conv!.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "Ahoj Pepo" }),
    }, env, ctx as unknown as ExecutionContext);
    expect(res.status).toBe(200);
    for (let done = 0; done < background.length;) {
      const batch = background.slice(done);
      done = background.length;
      await Promise.allSettled(batch);
    }
    random.mockRestore();
    await kv.delete("ai_provider");

    const msgs = await legendMessages(HUMAN, "ref");
    expect(msgs.map((m) => m.sender_type)).toEqual(["system", "user", "system"]);
    expect(msgs[2].body).toBe("Jasně, trenére, uvidíme se na hřišti.");
    // Placená SMS jako u majitele firmy, vlákno po psaní zase v klidu.
    expect((await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(HUMAN).first<{ phone_credit: number }>())?.phone_credit).toBeLessThan(36);
    expect(await db.prepare("SELECT ai_thread_active FROM conversations WHERE id = ?").bind(conv!.id).first()).toEqual({ ai_thread_active: 0 });
  }, 60_000);
});
