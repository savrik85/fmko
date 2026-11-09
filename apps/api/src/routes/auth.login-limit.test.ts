/**
 * Přihlášení šlo zkoušet bez omezení. Pokusy se počítají atomicky v D1 (migrace 0295):
 * tvrdý blok na dvojici (e-mail, adresa) a na adresu, celkové počítadlo e-mailu jen
 * proti hádání rozloženému přes mnoho adres. Cizí člověk tím majiteli účet nezamkne.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { hashPassword } from "../auth/password";
import {
  bumpCounters, counterKey, judgeLogin,
  LOGIN_EMAIL_MAX, LOGIN_IP_MAX, LOGIN_PAIR_MAX, LOGIN_WINDOW_SECONDS,
} from "../auth/attempt-limiter";
import { authRouter } from "./auth";

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations", "0295_rate_limit_counters.sql");
const PASSWORD = "Spravne123";
const EMAIL = "trener@example.com";
const OWNER_IP = "203.0.113.7";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

/** Rozdělí migraci na příkazy bez komentářů, D1 `prepare` bere jeden příkaz. */
function statements(sql: string): string[] {
  return sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((part) => part.trim()).filter(Boolean);
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  for (const sql of [
    ...statements(readFileSync(MIGRATION, "utf8")),
    "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, last_login_at TEXT)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, village_id TEXT, name TEXT, primary_color TEXT, secondary_color TEXT, badge_pattern TEXT, game_date TEXT, budget INTEGER, league_id TEXT, season_start TEXT, season_end TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT)",
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT)",
  ]) {
    await db.prepare(sql).run();
  }
  await db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u1', ?, ?)").bind(EMAIL, await hashPassword(PASSWORD)).run();
  env = { DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM rate_limit_counters").run();
});

afterEach(() => {
  vi.useRealTimers();
});

async function login(password: string, opts: { email?: string; ip?: string | null; bindings?: Bindings } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.ip !== null) headers["CF-Connecting-IP"] = opts.ip ?? OWNER_IP;
  return authRouter.request("/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: opts.email ?? EMAIL, password }),
  }, opts.bindings ?? env);
}

async function counterRows(): Promise<Array<{ key: string; count: number }>> {
  return (await db.prepare("SELECT key, count FROM rate_limit_counters ORDER BY key").all<{ key: string; count: number }>()).results;
}

describe("atomické počítadlo v D1", () => {
  it("souběžné pokusy se sečtou všechny, žádný se nepřepíše", async () => {
    const key = await counterKey("test", "x");
    const results = await Promise.all(Array.from({ length: 25 }, () => bumpCounters(db, [key], 900)));
    expect(results.map((r) => r.get(key)).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect((await counterRows())[0].count).toBe(25);
  });

  it("po uplynutí okna počítá znovu od jedné", async () => {
    const key = await counterKey("test", "window");
    const start = Date.parse("2026-11-09T18:00:00Z");
    await bumpCounters(db, [key], 900, start);
    expect((await bumpCounters(db, [key], 900, start + 899_000)).get(key)).toBe(2);
    expect((await bumpCounters(db, [key], 900, start + 901_000)).get(key)).toBe(1);
  });

  it("víc klíčů připíše jedním dotazem a vrátí stav každého", async () => {
    const [a, b] = [await counterKey("test", "a"), await counterKey("test", "b")];
    await bumpCounters(db, [a], 900);
    const counts = await bumpCounters(db, [a, b], 900);
    expect([counts.get(a), counts.get(b)]).toEqual([2, 1]);
  });

  it("v tabulce není e-mail ani adresa v čitelné podobě", async () => {
    await login("Spatne123");
    const rows = await counterRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.key).not.toContain("trener");
      expect(row.key).not.toContain(OWNER_IP);
    }
  });
});

describe("judgeLogin", () => {
  it("drží prahy: desátý pokus dvojice projde, jedenáctý ne", () => {
    expect(judgeLogin({ pair: LOGIN_PAIR_MAX, ip: 1, email: 1 }).verdict).toBe("verify");
    expect(judgeLogin({ pair: LOGIN_PAIR_MAX + 1, ip: 1, email: 1 }).verdict).toBe("blocked");
    expect(judgeLogin({ pair: 1, ip: LOGIN_IP_MAX, email: 1 }).verdict).toBe("verify");
    expect(judgeLogin({ pair: 1, ip: LOGIN_IP_MAX + 1, email: 1 }).verdict).toBe("blocked");
  });

  it("nad prahem e-mailu projde jen adresa bez dřívějšího pokusu", () => {
    expect(judgeLogin({ pair: 1, ip: 1, email: LOGIN_EMAIL_MAX + 100 }).verdict).toBe("verify");
    expect(judgeLogin({ pair: 2, ip: 2, email: LOGIN_EMAIL_MAX + 1 }).verdict).toBe("blocked");
    expect(judgeLogin({ pair: 2, ip: 2, email: LOGIN_EMAIL_MAX }).verdict).toBe("verify");
  });
});

// Desítky přihlášení s PBKDF2 a skutečnou D1: na vytíženém stroji přes výchozích 5 s.
describe("omezení pokusů o přihlášení", { timeout: 60_000 }, () => {
  it("po deseti špatných heslech z jedné adresy vrací 429 i pro správné heslo", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX; i++) expect((await login("Spatne123")).status).toBe(401);
    const blocked = await login(PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await blocked.json() as { error: string };
    expect(body.error).toContain("Příliš mnoho pokusů");
    expect(body.error).not.toMatch(/[—–]/);
  });

  it("pokus se připisuje před ověřením hesla, i ten zablokovaný", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX + 3; i++) await login("Spatne123");
    const pairKey = await counterKey("login-pair", `${EMAIL}|${OWNER_IP}`);
    expect((await counterRows()).find((r) => r.key === pairKey)?.count).toBe(LOGIN_PAIR_MAX + 3);
  });

  it("cizí člověk majiteli účet nezamkne: majitel se ze své adresy přihlásí", async () => {
    // Útočník z jedné adresy vyčerpá svůj limit na e-mail majitele.
    for (let i = 0; i < LOGIN_PAIR_MAX + 5; i++) await login("Spatne123", { ip: "198.51.100.66" });
    expect((await login("Spatne123", { ip: "198.51.100.66" })).status).toBe(429);
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it("rozložené hádání přes mnoho adres: nad 50 pokusů projde jen adresa bez dřívějšího pokusu", async () => {
    // 26 adres po dvou pokusech = 52 pokusů na jeden e-mail, žádná adresa nepřekročí svůj limit.
    for (let i = 0; i < 26; i++) {
      await login("Spatne123", { ip: `198.51.100.${i}` });
      await login("Spatne123", { ip: `198.51.100.${i}` });
    }
    // Adresa, která už hádala, je zablokovaná, i kdyby teď měla správné heslo.
    expect((await login(PASSWORD, { ip: "198.51.100.3" })).status).toBe(429);
    // Majitel z adresy bez neúspěchů se správným heslem projde.
    expect((await login(PASSWORD)).status).toBe(200);
    // Nová adresa útočníka dostane jediný pokus, druhý už ne.
    expect((await login("Spatne123", { ip: "192.0.2.9" })).status).toBe(401);
    expect((await login("Spatne123", { ip: "192.0.2.9" })).status).toBe(429);
  });

  it("z jedné adresy se nedá zkoušet heslo po jednom na mnoho e-mailů", async () => {
    for (let i = 0; i < LOGIN_IP_MAX; i++) {
      expect((await login("Spatne123", { email: `hrac${i}@example.com` })).status).toBe(401);
    }
    expect((await login("Spatne123", { email: "dalsi@example.com" })).status).toBe(429);
    expect((await login("Spatne123", { email: "dalsi@example.com", ip: "192.0.2.50" })).status).toBe(401);
  });

  it("úspěšné přihlášení vynuluje dvojici a adrese se neodečte z limitu", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX - 1; i++) await login("Spatne123");
    expect((await login(PASSWORD)).status).toBe(200);
    // Bez vynulování by další chyba byla jedenáctý pokus dvojice.
    expect((await login("Spatne123")).status).toBe(401);
    expect((await login(PASSWORD)).status).toBe(200);
    const ipKey = await counterKey("login-ip", OWNER_IP);
    // 9 + 1 špatných zůstává, dvě správná přihlášení se adrese nepočítají.
    expect((await counterRows()).find((r) => r.key === ipKey)?.count).toBe(LOGIN_PAIR_MAX);
  });

  it("samá správná přihlášení adresu nezamknou", async () => {
    for (let i = 0; i < LOGIN_IP_MAX + 5; i++) expect((await login(PASSWORD)).status).toBe(200);
  });

  it("po uplynutí okna se dá přihlásit znovu", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
    for (let i = 0; i < LOGIN_PAIR_MAX; i++) await login("Spatne123");
    expect((await login(PASSWORD)).status).toBe(429);
    vi.setSystemTime(new Date(Date.parse("2026-11-09T18:00:00Z") + LOGIN_WINDOW_SECONDS * 1000 + 1000));
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it("bez hlavičky s adresou se limit nepřeskočí", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX; i++) expect((await login("Spatne123", { ip: null })).status).toBe(401);
    expect((await login(PASSWORD, { ip: null })).status).toBe(429);
  });

  it("neznámý e-mail se počítá stejně jako špatné heslo", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX; i++) {
      expect((await login("Spatne123", { email: "nikdo@example.com" })).status).toBe(401);
    }
    expect((await login("Spatne123", { email: "nikdo@example.com" })).status).toBe(429);
  });

  it("velikost písmen a mezery v e-mailu limit neobejdou", async () => {
    for (let i = 0; i < LOGIN_PAIR_MAX; i++) {
      await login("Spatne123", { email: i % 2 === 0 ? " Trener@Example.com" : "TRENER@example.com " });
    }
    expect((await login(PASSWORD)).status).toBe(429);
  });

  it("úspěšné přihlášení uklidí dávno prošlá okna", async () => {
    await db.prepare("INSERT INTO rate_limit_counters (key, count, window_start) VALUES ('old:1', 7, ?)")
      .bind(Math.floor(Date.now() / 1000) - 2 * 60 * 60).run();
    await db.prepare("INSERT INTO rate_limit_counters (key, count, window_start) VALUES ('registration-ip:fresh', 3, ?)")
      .bind(Math.floor(Date.now() / 1000) - 30 * 60).run();
    expect((await login(PASSWORD)).status).toBe(200);
    const keys = (await counterRows()).map((r) => r.key);
    expect(keys).not.toContain("old:1");
    // Hodinové okno registrací ještě běží, úklid přihlášení ho nesmí smazat.
    expect(keys).toContain("registration-ip:fresh");
  });
});

describe("selhání počítadla", () => {
  it("když zápis počítadla selže, pokus se odmítne a heslo se neověřuje", async () => {
    const queries: string[] = [];
    const brokenDb = {
      prepare(sql: string) {
        queries.push(sql);
        if (/rate_limit_counters/.test(sql)) {
          return { bind: () => ({ all: async () => { throw new Error("D1_ERROR: no such table: rate_limit_counters"); } }) };
        }
        return db.prepare(sql);
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database;
    const res = await login(PASSWORD, { bindings: { ...env, DB: brokenDb } as Bindings });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(((await res.json()) as { error: string }).error).toContain("Zkus to prosím za chvíli");
    expect(queries.some((sql) => /FROM users/.test(sql))).toBe(false);
  });
});
