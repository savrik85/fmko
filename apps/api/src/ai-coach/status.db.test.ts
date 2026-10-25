/**
 * Stav AI trenérů pro přehled administrace nad skutečnou D1 (Miniflare): souhrn rozhodnutí
 * za 24 hodin a 7 dní, poslední chyby, kluby v mínusu, AI kluby bez ligy a převzetí klubů.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { TAKEOVER_SWITCH_KEY } from "../ai-clubs/abandoned";
import type { Bindings } from "../index";
import { runWatchdog } from "../lib/watchdog";
import { loadCoachStatus } from "./status";
import { COACH_MODE_KEY } from "./mode";

let miniflare: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const NOW = new Date();
const DAY_MS = 86_400_000;

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

/** Stejný formát jako výchozí hodnota `created_at` v deníku (bez milisekund). */
function agoLog(days: number): string {
  return ago(days).replace(/\.\d{3}Z$/, "Z");
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  kv = (await miniflare.getKVNamespace("CACHE_KV")) as unknown as KVNamespace;
  const schema = [
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE users (id TEXT PRIMARY KEY, last_activity_at TEXT, last_login_at TEXT, created_at TEXT)",
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT, team_type TEXT,
      budget INTEGER, ai_since TEXT, ai_former_user_id TEXT)`,
  ];
  for (const sql of schema) await db.prepare(sql).run();
  // Deník přesně z migrace 0276.
  const migration = readFileSync(resolve(__dirname, "../../migrations/0276_ai_clubs.sql"), "utf8");
  for (const stmt of migration.split(";").map((x) => x.trim()).filter((x) => /^CREATE/i.test(x.replace(/^--.*$/gm, "").trim()))) {
    await db.prepare(stmt.replace(/^--.*$/gm, "").trim()).run();
  }

  const team = db.prepare(
    "INSERT INTO teams (id, name, user_id, parent_team_id, league_id, team_type, budget, ai_since, ai_former_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const user = db.prepare("INSERT INTO users (id, last_activity_at, created_at) VALUES (?, ?, ?)");
  const decision = db.prepare(
    "INSERT INTO ai_coach_decisions (id, team_id, kind, mode, used_fallback, error, tokens_in, tokens_out, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  await db.batch([
    db.prepare("INSERT INTO leagues VALUES ('lg1', 'Okresní přebor Praha'), ('lg2', 'III. třída Prachatice')"),
    team.bind("ai-1", "Sokol Lhota", "ai", null, "lg1", "senior", 120000, null, null),
    team.bind("ai-2", "Slavoj Ves", "ai", null, "lg1", "senior", -4500, null, null),
    team.bind("ai-3", "Tatran Buk", "ai", null, "lg2", "senior", 80000, null, null),
    team.bind("ai-3-u21", "Tatran Buk U21", "ai", "ai-3", "lg2", "u21", 0, null, null),
    // Klub ze smazané ligy (na testingu po starých pokusech): nehraje, jen dostává úlohy.
    team.bind("ai-orphan", "Lokomotiva Troja", "ai", null, "gone", "senior", 50000, null, null),
    // Převzatý před dvěma dny.
    team.bind("ai-taken", "FK Převzatý", "ai", null, "lg1", "senior", 30000, ago(2), "u-old"),
    team.bind("h-waiting", "SK Opuštěný", "u-waiting", null, "lg1", "senior", 20000, null, null),
    team.bind("h-soon", "SK Brzy", "u-soon", null, "lg2", "senior", 20000, null, null),
    team.bind("h-active", "SK Aktivní", "u-active", null, "lg2", "senior", 20000, null, null),
    user.bind("u-waiting", ago(50), ago(400)),
    user.bind("u-soon", ago(40), ago(400)),
    user.bind("u-active", ago(10), ago(400)),
    user.bind("u-old", ago(60), ago(400)),
    decision.bind("d1", "ai-1", "match", "on", 0, null, 1000, 200, 4000, agoLog(0.1)),
    decision.bind("d2", "ai-1", "match", "on", 1, "Grammar error: unsatisfiable schema", 900, 0, 2000, agoLog(0.2)),
    decision.bind("d3", "ai-2", "transfer_market", "on", 0, null, 500, 100, null, agoLog(0.5)),
    // Bez modelu (off) je náhradní pravidlo záměr, nepočítá se jako výpadek.
    decision.bind("d4", "ai-3", "weekly", "off", 1, null, null, null, null, agoLog(0.6)),
    decision.bind("d5", "ai-3", "weekly", "on", 1, "timeout", null, null, 30000, agoLog(3)),
    decision.bind("d6", "ai-2", "match", "on", 1, "stará chyba", null, null, null, agoLog(8)),
    // Přátelák bez modelu (výpadek) je náhradní pravidlo jako každé jiné.
    decision.bind("d7", "ai-3", "friendly_offer", "on", 1, "timeout", null, null, null, agoLog(0.3)),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("stav AI trenérů pro přehled administrace", () => {
  it("shrne rozhodnutí za 24 hodin a 7 dní, chyby, kluby v mínusu a kluby bez ligy", async () => {
    const s = await loadCoachStatus(db, kv, NOW);

    expect(s.modes).toEqual({ match: "on", weekly: "on", market: "on" });
    // U21 se nepočítá, klub ze smazané ligy zvlášť.
    expect(s.clubs.total).toBe(5);
    expect(s.clubs.byLeague).toEqual([
      { league: "Okresní přebor Praha", count: 3 },
      { league: "III. třída Prachatice", count: 1 },
    ]);
    expect(s.clubs.orphaned).toBe(1);
    expect(s.clubs.inDebt).toEqual([{ teamId: "ai-2", name: "Slavoj Ves", budget: -4500 }]);

    expect(s.last24h.decisions).toBe(5);
    // Model měl rozhodnout všechno kromě týdne v režimu off (d4).
    expect(s.last24h.modelDecisions).toBe(4);
    expect(s.last24h.fallback).toBe(2);
    expect(s.last24h.errors).toBe(2);
    expect(s.last24h.avgLatencyMs).toBe(3000);
    expect(s.last24h.tokensIn).toBe(2400);
    expect(s.last24h.tokensOut).toBe(300);
    expect(s.last24h.byKind[0]).toEqual({ kind: "match", decisions: 2, fallback: 1, errors: 1 });
    expect(s.last24h.byKind.find((k) => k.kind === "friendly_offer")).toEqual({ kind: "friendly_offer", decisions: 1, fallback: 1, errors: 1 });

    expect(s.last7d).toEqual({ decisions: 6, fallback: 3, errors: 3 });
    expect(s.lastDecisionAt).toBe(agoLog(0.1));
    // Chyby za 7 dní od nejnovější, osm dní stará už ne.
    expect(s.recentErrors.map((e) => e.id)).toEqual(["d2", "d7", "d5"]);
    expect(s.recentErrors[0]).toMatchObject({ teamName: "Sokol Lhota", kind: "match" });
  });

  it("ukáže, kdo na převzetí čeká, kdo přijde na řadu do týdne a koho AI nedávno převzala", async () => {
    const s = await loadCoachStatus(db, kv, NOW);
    expect(s.takeover.enabled).toBe(true);
    expect(s.takeover.brake).toBe(5);
    expect(s.takeover.waitingCount).toBe(1);
    expect(s.takeover.waiting).toEqual([{ teamId: "h-waiting", name: "SK Opuštěný" }]);
    expect(s.takeover.soon).toEqual([{ teamId: "h-soon", name: "SK Brzy" }]);
    expect(s.takeover.recent.map((r) => r.teamId)).toEqual(["ai-taken"]);
  });

  it("přepínače v KV: vypnuté převzetí a režim po oblastech", async () => {
    await kv.put(TAKEOVER_SWITCH_KEY, "off");
    await kv.put(COACH_MODE_KEY, JSON.stringify({ match: "on", weekly: "shadow", market: "off" }));
    try {
      const s = await loadCoachStatus(db, kv, NOW);
      expect(s.takeover.enabled).toBe(false);
      expect(s.modes).toEqual({ match: "on", weekly: "shadow", market: "off" });
    } finally {
      await kv.delete(TAKEOVER_SWITCH_KEY);
      await kv.delete(COACH_MODE_KEY);
    }
  });

  it("hlídač ohlásí, když přes třetinu rozhodnutí za 24 h rozhodne náhradní pravidlo", async () => {
    const env = { DB: db, CACHE_KV: kv } as unknown as Bindings;
    const insert = db.prepare("INSERT INTO ai_coach_decisions (id, team_id, kind, mode, used_fallback, created_at) VALUES (?, 'ai-1', 'match', 'on', 0, ?)");
    // S d1 až d3 a d7 je to dvanáct rozhodnutí, bez modelu dvě (d2, d7).
    await db.batch(Array.from({ length: 8 }, (_, i) => insert.bind(`wm${i}`, agoLog(0.05))));
    try {
      expect((await runWatchdog(env)).problemy.map((p) => p.kod)).not.toContain("ai_coach_fallback");
      await db.prepare("UPDATE ai_coach_decisions SET used_fallback = 1 WHERE id IN ('wm0', 'wm1', 'wm2')").run();
      const problem = (await runWatchdog(env)).problemy.find((p) => p.kod === "ai_coach_fallback");
      expect(problem?.hodnota).toBe("5 z 12 rozhodnutí za 24 h");
    } finally {
      await db.prepare("DELETE FROM ai_coach_decisions WHERE id LIKE 'wm%'").run();
    }
  });
});
