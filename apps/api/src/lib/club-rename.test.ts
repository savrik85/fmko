/**
 * Přejmenování klubu nad skutečnou D1 (Miniflare). Název A-týmu má kopie v poháru, v U21
 * a v adrese klubového webu. Dřív je srovnávala jen změna zkratky; ruční přejmenování
 * a výpověď sponzora manažerem měnily jen `teams.name`, podpis sponzora a výpověď
 * sponzorem zapomněly na starou adresu webu a ruční název mohl být stejný jako cizí.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bindings } from "../index";
import { gameRouter } from "../routes/game";
import clubPrefixRouter from "../routes/club-prefix";
import { applyMainSponsorRename } from "../sponsors/signing";
import { terminateContractBySponsor } from "../sponsors/promise-resolve";
import { clubNameTaken, MAX_SLUG_ALIASES, renameClub } from "./club-rename";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

const TOKEN = "owner-token";

const SCHEMA = `
  CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER NOT NULL, status TEXT NOT NULL);
  CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE teams (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, user_id TEXT, village_id TEXT, league_id TEXT,
    team_type TEXT NOT NULL DEFAULT 'senior', parent_team_id TEXT, budget INTEGER NOT NULL DEFAULT 0,
    reputation INTEGER NOT NULL DEFAULT 50, game_date TEXT, season_start TEXT, season_end TEXT,
    last_main_sponsor_change_season INTEGER, prefix_changed_season INTEGER, sleeve_sponsor_id INTEGER, stadium_name TEXT
  );
  CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT NOT NULL, team_id TEXT, name TEXT NOT NULL);
  CREATE TABLE team_websites (team_id TEXT PRIMARY KEY, custom_slug TEXT);
  CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, created_at TEXT);
  CREATE TABLE sponsor_contracts (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, sponsor_id INTEGER, sponsor_name TEXT NOT NULL, category TEXT,
    status TEXT NOT NULL, early_termination_fee INTEGER NOT NULL DEFAULT 0, seasons_total INTEGER NOT NULL DEFAULT 1,
    seasons_remaining INTEGER NOT NULL DEFAULT 1, signing_bonus INTEGER, paid_construction TEXT, negotiation_id TEXT
  );
  CREATE TABLE sponsor_promises (
    id TEXT PRIMARY KEY, contract_id TEXT, team_id TEXT, sponsor_id INTEGER, kind TEXT, params TEXT, season INTEGER,
    penalty INTEGER, status TEXT
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT,
    reference_id TEXT, game_date TEXT
  );
  CREATE TABLE reputation_log (
    team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT,
    description TEXT, reference_id TEXT UNIQUE, game_date TEXT
  );
  CREATE TABLE club_events (
    id TEXT PRIMARY KEY, reference_id TEXT UNIQUE, team_id TEXT, kind TEXT, payload TEXT, severity REAL, game_date TEXT
  );
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER,
    last_message_text TEXT, last_message_at TEXT, created_at TEXT
  );
  CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, sent_at TEXT);
  CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT)
`;

/** Staré adresy odkazují na teams (cizí klíč z migrace), mažou se první. */
const TABLES = [
  "team_website_slug_aliases", "seasons", "villages", "teams", "cup_teams", "team_websites", "news", "sponsor_contracts",
  "sponsor_promises", "transactions", "reputation_log", "club_events", "conversations", "messages",
];

async function runSql(sql: string): Promise<void> {
  const statements = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  await runSql(SCHEMA);
  // Tabulka starých adres webu ze skutečné migrace (výchozí created_at, primární klíč slug).
  await runSql(readFileSync(join(__dirname, "..", "..", "migrations", "0247_klubovy_web_adresy_anketa.sql"), "utf8"));
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  await sessionKv.put(`session:${TOKEN}`, JSON.stringify({
    userId: "u1", email: "owner@test.local", teamId: "t1", createdAt: "2026-10-01T00:00:00.000Z",
  }));
  env = {
    DB: db,
    SESSION_KV: sessionKv,
    CACHE_KV: await miniflare.getKVNamespace("CACHE_KV"),
  } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

/** Klub t1 z Lhoty s U21 a místem v poháru; soupeř t2 SK Čkyně. */
async function seedClub(name: string): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, village_id, league_id, budget) VALUES ('t1', ?, 'u1', 'v-lhota', 'l1', 100000)").bind(name),
    db.prepare("INSERT INTO teams (id, name, village_id, league_id, team_type, parent_team_id) VALUES ('t1-u21', ?, 'v-lhota', 'l-u21', 'u21', 't1')").bind(`${name} U21`),
    db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name) VALUES ('ct1', 'cup3', 't1', ?)").bind(name),
  ]);
}

beforeEach(async () => {
  for (const table of TABLES) await db.prepare(`DELETE FROM ${table}`).run();
  await runSql(`
    INSERT INTO seasons (id, number, status) VALUES ('s3', 3, 'active');
    INSERT INTO villages (id, name) VALUES ('v-lhota', 'Lhota'), ('v-ckyne', 'Čkyně');
    INSERT INTO teams (id, name, user_id, village_id, league_id) VALUES ('t2', 'SK Čkyně', 'u2', 'v-ckyne', 'l1')
  `);
});

async function names(): Promise<{ senior: string | undefined; u21: string | undefined; cup: string | undefined }> {
  const [senior, u21, cup] = await Promise.all([
    db.prepare("SELECT name FROM teams WHERE id = 't1'").first<{ name: string }>(),
    db.prepare("SELECT name FROM teams WHERE id = 't1-u21'").first<{ name: string }>(),
    db.prepare("SELECT name FROM cup_teams WHERE team_id = 't1'").first<{ name: string }>(),
  ]);
  return { senior: senior?.name, u21: u21?.name, cup: cup?.name };
}

async function aliases(teamId = "t1"): Promise<string[]> {
  const rows = await db.prepare("SELECT slug FROM team_website_slug_aliases WHERE team_id = ? ORDER BY slug")
    .bind(teamId).all<{ slug: string }>();
  return rows.results.map((r) => r.slug);
}

async function call(router: { fetch: (req: Request, env: Bindings, ctx: ExecutionContext) => Response | Promise<Response> },
  method: string, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
  const res = await router.fetch(new Request(`http://test.local${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
  await Promise.all(pending);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

describe("renameClub", () => {
  it("přejmenuje A-tým, pohár i U21 a stará adresa webu dál vede na klub", async () => {
    await seedClub("SK Lhota");
    expect(await renameClub(db, { teamId: "t1", oldName: "SK Lhota", newName: "AC Lhota" })).toBe(true);
    expect(await names()).toEqual({ senior: "AC Lhota", u21: "AC Lhota U21", cup: "AC Lhota" });
    expect(await aliases()).toEqual(["sk-lhota"]);
  });

  it("klub s vlastní adresou webu si adresu ze starého názvu nepamatuje", async () => {
    await seedClub("SK Lhota");
    await db.prepare("INSERT INTO team_websites (team_id, custom_slug) VALUES ('t1', 'fotbal-lhota')").run();
    await renameClub(db, { teamId: "t1", oldName: "SK Lhota", newName: "AC Lhota" });
    expect(await aliases()).toEqual([]);
  });

  it("název se mezitím změnil: nezapíše se nic", async () => {
    await seedClub("SK Lhota");
    expect(await renameClub(db, { teamId: "t1", oldName: "FK Lhota", newName: "AC Lhota" })).toBe(false);
    expect(await names()).toEqual({ senior: "SK Lhota", u21: "SK Lhota U21", cup: "SK Lhota" });
    expect(await aliases()).toEqual([]);
  });

  it("sezónu změny zapíše do sloupce limitu", async () => {
    await seedClub("SK Lhota");
    await renameClub(db, {
      teamId: "t1", oldName: "SK Lhota", newName: "AC Lhota", seasonMark: { column: "last_main_sponsor_change_season", season: 3 },
    });
    const row = await db.prepare("SELECT last_main_sponsor_change_season AS s, prefix_changed_season AS p FROM teams WHERE id = 't1'")
      .first<{ s: number | null; p: number | null }>();
    expect(row).toEqual({ s: 3, p: null });
  });

  it(`pamatuje si nejvýš ${MAX_SLUG_ALIASES} staré adresy, návrat ke staré adrese ji z aliasů vyřadí`, async () => {
    await seedClub("SK A");
    const chain = ["SK A", "SK B", "SK C", "SK D", "SK E"];
    for (let i = 1; i < chain.length; i++) {
      expect(await renameClub(db, { teamId: "t1", oldName: chain[i - 1], newName: chain[i] })).toBe(true);
    }
    expect(await aliases()).toEqual(["sk-b", "sk-c", "sk-d"]);
    // Klub se vrací k názvu SK B: adresa sk-b je zase hlavní, sk-e je nová stará adresa.
    await renameClub(db, { teamId: "t1", oldName: "SK E", newName: "SK B" });
    expect(await aliases()).toEqual(["sk-c", "sk-d", "sk-e"]);
  });

  it("starou adresu, kterou už má jiný klub, nepřebere", async () => {
    await seedClub("SK Lhota");
    await db.prepare("INSERT INTO team_website_slug_aliases (slug, team_id) VALUES ('sk-lhota', 't2')").run();
    await renameClub(db, { teamId: "t1", oldName: "SK Lhota", newName: "AC Lhota" });
    expect(await aliases()).toEqual([]);
    expect(await aliases("t2")).toEqual(["sk-lhota"]);
  });
});

describe("clubNameTaken", () => {
  it("název jiného klubu i s jinou velikostí písmen nebo bez diakritiky", async () => {
    await seedClub("SK Lhota");
    expect(await clubNameTaken(db, "t1", "SK Čkyně")).toBe(true);
    expect(await clubNameTaken(db, "t1", "sk ckyne")).toBe(true);
    expect(await clubNameTaken(db, "t1", "SK Čkyně B")).toBe(false);
  });

  it("vlastní název ani vlastní stará adresa nevadí", async () => {
    await seedClub("SK Lhota");
    await db.prepare("INSERT INTO team_website_slug_aliases (slug, team_id) VALUES ('fk-lhota', 't1')").run();
    expect(await clubNameTaken(db, "t1", "SK Lhota")).toBe(false);
    expect(await clubNameTaken(db, "t1", "FK Lhota")).toBe(false);
  });

  it("vlastní i stará adresa webu jiného klubu je obsazená", async () => {
    await seedClub("SK Lhota");
    await db.batch([
      db.prepare("INSERT INTO team_websites (team_id, custom_slug) VALUES ('t2', 'tygri-ckyne')"),
      db.prepare("INSERT INTO team_website_slug_aliases (slug, team_id) VALUES ('fk-ckyne', 't2')"),
    ]);
    expect(await clubNameTaken(db, "t1", "Tygři Čkyně")).toBe(true);
    expect(await clubNameTaken(db, "t1", "FK Čkyně")).toBe(true);
  });

  it("U21 jiného klubu se nepočítá", async () => {
    await seedClub("SK Lhota");
    expect(await clubNameTaken(db, "t2", "SK Lhota U21")).toBe(false);
  });
});

describe("každé přejmenování srovná pohár, U21 i starou adresu webu", () => {
  it("ruční přejmenování (POST /teams/:id/rename)", async () => {
    await seedClub("SK Lhota");
    const res = await call(gameRouter, "POST", "/teams/t1/rename", { name: "Sokol Lhota" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, newName: "Sokol Lhota" });
    expect(await names()).toEqual({ senior: "Sokol Lhota", u21: "Sokol Lhota U21", cup: "Sokol Lhota" });
    expect(await aliases()).toEqual(["sk-lhota"]);
    const team = await db.prepare("SELECT last_main_sponsor_change_season AS s, reputation FROM teams WHERE id = 't1'")
      .first<{ s: number; reputation: number }>();
    expect(team).toEqual({ s: 3, reputation: 47 });
  });

  it("ruční přejmenování na název jiného klubu: 409 a nezmění se nic", async () => {
    await seedClub("SK Lhota");
    const res = await call(gameRouter, "POST", "/teams/t1/rename", { name: "sk čkyně" });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("Takový název už má jiný klub");
    expect(await names()).toEqual({ senior: "SK Lhota", u21: "SK Lhota U21", cup: "SK Lhota" });
    const team = await db.prepare("SELECT last_main_sponsor_change_season AS s, reputation FROM teams WHERE id = 't1'")
      .first<{ s: number | null; reputation: number }>();
    expect(team).toEqual({ s: null, reputation: 50 });
  });

  it("výpověď hlavního sponzora manažerem (POST /teams/:id/sponsors/terminate)", async () => {
    await seedClub("FK Pivovar Lhota Lhota");
    await db.prepare(
      "INSERT INTO sponsor_contracts (id, team_id, sponsor_id, sponsor_name, category, status) VALUES ('c1', 't1', NULL, 'Pivovar Lhota', 'main', 'active')",
    ).run();
    const res = await call(gameRouter, "POST", "/teams/t1/sponsors/terminate", { category: "main" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, newTeamName: "FK Lhota" });
    expect(await names()).toEqual({ senior: "FK Lhota", u21: "FK Lhota U21", cup: "FK Lhota" });
    expect(await aliases()).toEqual(["fk-pivovar-lhota-lhota"]);
  });

  it("podpis hlavního sponzora (applyMainSponsorRename)", async () => {
    await seedClub("SK Lhota");
    const out = await applyMainSponsorRename(db, "t1", "Pivovar Lhota", 3);
    expect(out).toEqual({ oldName: "SK Lhota", newName: "SK Pivovar Lhota Lhota" });
    expect(await names()).toEqual({ senior: "SK Pivovar Lhota Lhota", u21: "SK Pivovar Lhota Lhota U21", cup: "SK Pivovar Lhota Lhota" });
    expect(await aliases()).toEqual(["sk-lhota"]);
    const team = await db.prepare("SELECT last_main_sponsor_change_season AS s FROM teams WHERE id = 't1'").first<{ s: number }>();
    expect(team?.s).toBe(3);
  });

  it("výpověď sponzorem za nesplněné sliby (terminateContractBySponsor)", async () => {
    await seedClub("FK Pivovar Lhota Lhota");
    await db.prepare(
      "INSERT INTO sponsor_contracts (id, team_id, sponsor_id, sponsor_name, category, status) VALUES ('c1', 't1', 7, 'Pivovar Lhota', 'main', 'active')",
    ).run();
    const ok = await terminateContractBySponsor(db, {
      id: "c1", team_id: "t1", sponsor_id: 7, sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 1,
    }, { gameDate: "2026-10-20T16:00:00.000Z", day: "2026-10-20" });
    expect(ok).toBe(true);
    expect(await names()).toEqual({ senior: "FK Lhota", u21: "FK Lhota U21", cup: "FK Lhota" });
    expect(await aliases()).toEqual(["fk-pivovar-lhota-lhota"]);
  });

  it("zkratka klubu (PATCH /teams/:id/club/prefix)", async () => {
    await seedClub("SK Lhota");
    const res = await call(clubPrefixRouter, "PATCH", "/teams/t1/club/prefix", { prefix: "AC" });
    expect(res.status).toBe(200);
    expect(await names()).toEqual({ senior: "AC Lhota", u21: "AC Lhota U21", cup: "AC Lhota" });
    expect(await aliases()).toEqual(["sk-lhota"]);
  });

  it("zkratka, se kterou by klub měl název jiného klubu: 409", async () => {
    await seedClub("SK Lhota");
    await db.prepare("UPDATE teams SET name = 'AC Lhota' WHERE id = 't2'").run();
    const res = await call(clubPrefixRouter, "PATCH", "/teams/t1/club/prefix", { prefix: "AC" });
    expect(res.status).toBe(409);
    expect(await names()).toEqual({ senior: "SK Lhota", u21: "SK Lhota U21", cup: "SK Lhota" });
  });
});
