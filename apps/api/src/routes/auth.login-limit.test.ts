/**
 * Přihlášení šlo zkoušet bez omezení. Neúspěchy se teď počítají na e-mail i na adresu,
 * po vyčerpání okna vrací 429 a úspěšné přihlášení počítadlo e-mailu vynuluje.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { hashPassword } from "../auth/password";
import { LOGIN_EMAIL_LIMIT, LOGIN_IP_LIMIT } from "../auth/attempt-limiter";
import { authRouter } from "./auth";

/** KV v paměti, drží `expiration` i `expirationTtl` jako skutečné KV. */
class MemoryKv {
  store = new Map<string, { value: string; expiresAt: number | null }>();
  failPuts = false;

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number; expiration?: number }): Promise<void> {
    if (this.failPuts) throw new Error("KV PUT failed: 429 Too Many Requests");
    const expiresAt = opts?.expiration ? opts.expiration * 1000 : opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const PASSWORD = "Spravne123";
let passwordHash: string;
let cacheKv: MemoryKv;
let sessionKv: MemoryKv;
let env: Bindings;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
  cacheKv = new MemoryKv();
  sessionKv = new MemoryKv();
  const db = new FalesnaD1([
    { sql: /SELECT \* FROM users WHERE email = \?/, first: { id: "u1", email: "trener@example.com", password_hash: passwordHash } },
  ]);
  // Jediný účet v databázi; jiný e-mail falešná D1 vrátí taky, proto se neznámý účet testuje zvlášť.
  env = { DB: jakoD1(db), CACHE_KV: cacheKv, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterEach(() => {
  vi.useRealTimers();
});

async function login(password: string, opts: { email?: string; ip?: string | null; bindings?: Bindings } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.ip !== null) headers["CF-Connecting-IP"] = opts.ip ?? "203.0.113.7";
  return authRouter.request("/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: opts.email ?? "trener@example.com", password }),
  }, opts.bindings ?? env);
}

describe("omezení pokusů o přihlášení", () => {
  it("po deseti špatných heslech na jeden e-mail vrací 429 i pro správné heslo", async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) {
      // Každý pokus z jiné adresy: limit na e-mail musí zabrat sám.
      expect((await login("Spatne123", { ip: `198.51.100.${i}` })).status).toBe(401);
    }
    const blocked = await login(PASSWORD, { ip: "198.51.100.200" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await blocked.json() as { error: string };
    expect(body.error).toContain("Příliš mnoho pokusů");
    expect(body.error).not.toMatch(/[—–]/);
  });

  it("po uplynutí okna se dá přihlásit znovu", async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) await login("Spatne123", { ip: `198.51.100.${i}` });
    expect((await login(PASSWORD)).status).toBe(429);
    vi.advanceTimersByTime(LOGIN_EMAIL_LIMIT.windowSeconds * 1000 + 1000);
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it("úspěšné přihlášení počítadlo e-mailu vynuluje", async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max - 1; i++) await login("Spatne123", { ip: `198.51.100.${i}` });
    expect((await login(PASSWORD, { ip: "198.51.100.200" })).status).toBe(200);
    // Bez vynulování by další chyba byla desátá a účet by se zamkl.
    expect((await login("Spatne123", { ip: "198.51.100.201" })).status).toBe(401);
    expect((await login(PASSWORD, { ip: "198.51.100.202" })).status).toBe(200);
  });

  it("z jedné adresy se nedá zkoušet heslo po jednom na mnoho e-mailů", async () => {
    for (let i = 0; i < LOGIN_IP_LIMIT.max; i++) {
      expect((await login("Spatne123", { email: `hrac${i}@example.com` })).status).toBe(401);
    }
    expect((await login("Spatne123", { email: "dalsi@example.com" })).status).toBe(429);
    // Jiná adresa a jiný e-mail zamčené nejsou.
    expect((await login("Spatne123", { email: "dalsi@example.com", ip: "192.0.2.50" })).status).toBe(401);
  });

  it("bez hlavičky s adresou se limit nepřeskočí: e-mail se počítá dál", async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) {
      expect((await login("Spatne123", { ip: null })).status).toBe(401);
    }
    expect((await login(PASSWORD, { ip: null })).status).toBe(429);
  });

  it("neznámý e-mail se počítá stejně jako špatné heslo", async () => {
    const emptyDb = new FalesnaD1([]);
    const bindings = { ...env, DB: jakoD1(emptyDb) } as Bindings;
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) {
      expect((await login("Spatne123", { email: "nikdo@example.com", ip: `198.51.100.${i}`, bindings })).status).toBe(401);
    }
    expect((await login("Spatne123", { email: "nikdo@example.com", ip: "198.51.100.200", bindings })).status).toBe(429);
  });

  it("velikost písmen a mezery v e-mailu limit neobejdou", async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) {
      const email = i % 2 === 0 ? " Trener@Example.com" : "TRENER@example.com ";
      await login("Spatne123", { email, ip: `198.51.100.${i}` });
    }
    expect((await login(PASSWORD, { ip: "198.51.100.200" })).status).toBe(429);
  });

  it("v klíčích není e-mail ani adresa v čitelné podobě", async () => {
    await login("Spatne123");
    const keys = [...cacheKv.store.keys()];
    expect(keys.length).toBe(2);
    for (const key of keys) {
      expect(key).not.toContain("trener");
      expect(key).not.toContain("203.0.113.7");
    }
  });

  it("výpadek zápisu do KV přihlášení neshodí", async () => {
    cacheKv.failPuts = true;
    expect((await login("Spatne123")).status).toBe(401);
    expect((await login(PASSWORD)).status).toBe(200);
  });
});
