/**
 * Prodlužování přihlášení. Session měla pevných 30 dní od vzniku a používáním se
 * neprodlužovala: za měsíc se znovu přihlašovalo 17 z 18 hráčů. Teď ji použití
 * prodlouží na plných 30 dní, nejvýš jednou za den (jeden zápis do KV na hráče a den).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSession, getSession, SESSION_RENEW_AFTER_MS, type Session } from "./session";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

/** KV v paměti: drží lhůtu `expirationTtl` jako skutečné KV a počítá zápisy. */
class MemoryKv {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  puts: Array<{ key: string; value: string; ttl: number | undefined }> = [];
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

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.puts.push({ key, value, ttl: opts?.expirationTtl });
    if (this.failPuts) throw new Error("KV PUT failed: 429 Too Many Requests");
    this.store.set(key, { value, expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const asKv = (kv: MemoryKv) => kv as unknown as KVNamespace;
const START = new Date("2026-10-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session", () => {
  it("nová session: plná lhůta 30 dní a čas prodloužení", async () => {
    const kv = new MemoryKv();
    await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0].ttl).toBe(THIRTY_DAYS_S);
    const stored = JSON.parse(kv.puts[0].value) as Session;
    expect(stored.renewedAt).toBe(START.toISOString());
    expect(stored.createdAt).toBe(START.toISOString());
  });

  it("použití během dne session neprodlužuje (žádný zápis navíc)", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    vi.setSystemTime(START.getTime() + 23 * HOUR);
    expect((await getSession(asKv(kv), token))?.userId).toBe("u1");
    expect(kv.puts).toHaveLength(1);
  });

  it("použití po víc než dni prodlouží session na plných 30 dní, jednou za den", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    const later = START.getTime() + SESSION_RENEW_AFTER_MS + HOUR;
    vi.setSystemTime(later);
    expect((await getSession(asKv(kv), token))?.teamId).toBe("t1");
    expect(kv.puts).toHaveLength(2);
    expect(kv.puts[1].ttl).toBe(THIRTY_DAYS_S);
    expect(JSON.parse(kv.puts[1].value)).toMatchObject({
      userId: "u1", teamId: "t1", createdAt: START.toISOString(), renewedAt: new Date(later).toISOString(),
    });
    vi.setSystemTime(later + 5 * HOUR);
    await getSession(asKv(kv), token);
    expect(kv.puts).toHaveLength(2);
  });

  it("hráč, který hraje každý den, se ani za 40 dní nemusí znovu přihlásit", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    for (let day = 1; day <= 40; day++) {
      vi.setSystemTime(START.getTime() + day * DAY + HOUR);
      expect(await getSession(asKv(kv), token), `den ${day}`).not.toBeNull();
    }
    // Vznik + jedno prodloužení denně.
    expect(kv.puts).toHaveLength(41);
  });

  it("kdo nepřijde 30 dní, je odhlášený", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    vi.setSystemTime(START.getTime() + 30 * DAY + HOUR);
    expect(await getSession(asKv(kv), token)).toBeNull();
  });

  it("starší session bez času prodloužení funguje a prodlouží se", async () => {
    const kv = new MemoryKv();
    const createdAt = new Date(START.getTime() - 10 * DAY).toISOString();
    await kv.put("session:old-token", JSON.stringify({ userId: "u2", email: "u2@example.test", teamId: "t2", createdAt }), {
      expirationTtl: 20 * 24 * 60 * 60,
    });
    const session = await getSession(asKv(kv), "old-token");
    expect(session).toMatchObject({ userId: "u2", teamId: "t2", createdAt });
    expect(kv.puts).toHaveLength(2);
    expect(kv.puts[1].ttl).toBe(THIRTY_DAYS_S);
    expect(JSON.parse(kv.puts[1].value).renewedAt).toBe(START.toISOString());
    // Po 25 dnech by původní lhůta (20 dní) vypršela, prodloužená platí.
    vi.setSystemTime(START.getTime() + 25 * DAY);
    expect(await getSession(asKv(kv), "old-token")).not.toBeNull();
  });

  it("session úplně bez data vzniku se taky prodlouží", async () => {
    const kv = new MemoryKv();
    await kv.put("session:ancient-token", JSON.stringify({ userId: "u3", email: "u3@example.test", teamId: null }));
    expect((await getSession(asKv(kv), "ancient-token"))?.userId).toBe("u3");
    expect(kv.puts).toHaveLength(2);
    expect(kv.puts[1].ttl).toBe(THIRTY_DAYS_S);
  });

  it("souběžné požadavky jedné stránky zapíšou prodloužení jen jednou", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    vi.setSystemTime(START.getTime() + 2 * DAY);
    const sessions = await Promise.all(Array.from({ length: 6 }, () => getSession(asKv(kv), token)));
    expect(sessions.every((s) => s?.userId === "u1")).toBe(true);
    expect(kv.puts).toHaveLength(2);
  });

  it("nepovedený zápis prodloužení neshodí požadavek", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    vi.setSystemTime(START.getTime() + 2 * DAY);
    kv.failPuts = true;
    expect((await getSession(asKv(kv), token))?.userId).toBe("u1");
  });

  it("odhlášená session se už nenačte ani neprodlouží", async () => {
    const kv = new MemoryKv();
    const token = await createSession(asKv(kv), "u1", "u1@example.test", "t1");
    vi.setSystemTime(START.getTime() + 2 * DAY);
    await deleteSession(asKv(kv), token);
    expect(await getSession(asKv(kv), token)).toBeNull();
    expect(kv.puts).toHaveLength(1);
  });
});
