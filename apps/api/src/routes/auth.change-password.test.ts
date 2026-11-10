/**
 * Změna hesla mazala jen token, kterým se měnilo. Relace na jiných zařízeních
 * (i ta, kterou někdo získal se starým heslem) platily dál. Teď končí všechny.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import type { Bindings } from "../index";
import { hashPassword } from "../auth/password";
import { createSession, getSession } from "../auth/session";
import { authRouter } from "./auth";

class MemoryKv {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
  async put(key: string, value: string): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
  async list(opts: { prefix: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    return { keys: [...this.store.keys()].filter((name) => name.startsWith(opts.prefix)).map((name) => ({ name })), list_complete: true };
  }
}

const OLD_PASSWORD = "StareHeslo1";
const NEW_PASSWORD = "NoveHeslo22";
let oldHash: string;
let kv: MemoryKv;
let db: FalesnaD1;
let env: Bindings;

beforeAll(async () => {
  oldHash = await hashPassword(OLD_PASSWORD);
});

beforeEach(() => {
  kv = new MemoryKv();
  db = new FalesnaD1([
    { sql: /SELECT password_hash FROM users WHERE id = \?/, first: { password_hash: oldHash } },
    { sql: /SELECT is_admin FROM users WHERE id = \?/, first: { is_admin: 1 } },
  ]);
  env = { DB: jakoD1(db), SESSION_KV: kv, CACHE_KV: new MemoryKv() } as unknown as Bindings;
});

const asKv = () => kv as unknown as KVNamespace;

async function post(path: string, token: string, body: unknown): Promise<Response> {
  return authRouter.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }, env);
}

describe("změna hesla odhlásí všechna zařízení", () => {
  it("po změně neplatí aktuální token ani token z jiného zařízení", async () => {
    const laptop = await createSession(asKv(), "u1", "u1@example.com", "t1");
    const stolenPhone = await createSession(asKv(), "u1", "u1@example.com", "t1");
    const stranger = await createSession(asKv(), "u2", "u2@example.com", "t2");

    const res = await post("/change-password", laptop, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(db.dotazy.some((d) => /UPDATE users SET password_hash/.test(d.sql))).toBe(true);

    expect(await getSession(asKv(), laptop)).toBeNull();
    expect(await getSession(asKv(), stolenPhone)).toBeNull();
    expect((await getSession(asKv(), stranger))?.userId).toBe("u2");
  });

  it("aktuální token skončí, i když v seznamu relací není (session z doby před seznamem)", async () => {
    await kv.put("session:legacy", JSON.stringify({ userId: "u1", email: "u1@example.com", teamId: "t1", createdAt: new Date().toISOString(), renewedAt: new Date().toISOString() }));
    const res = await post("/change-password", "legacy", { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(await getSession(asKv(), "legacy")).toBeNull();
  });

  it("špatné současné heslo nic nezmění a nikoho neodhlásí", async () => {
    const laptop = await createSession(asKv(), "u1", "u1@example.com", "t1");
    const phone = await createSession(asKv(), "u1", "u1@example.com", "t1");

    const res = await post("/change-password", laptop, { currentPassword: "Spatne12345", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(db.dotazy.some((d) => /UPDATE users/.test(d.sql))).toBe(false);
    expect(await getSession(asKv(), laptop)).not.toBeNull();
    expect(await getSession(asKv(), phone)).not.toBeNull();
  });

  it("admin změnou hesla odhlásí daného uživatele, sebe ne", async () => {
    const admin = await createSession(asKv(), "admin", "admin@example.com", null);
    const victimPhone = await createSession(asKv(), "u1", "u1@example.com", "t1");
    const victimLaptop = await createSession(asKv(), "u1", "u1@example.com", "t1");

    const res = await post("/admin/change-password", admin, { userId: "u1", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(await getSession(asKv(), victimPhone)).toBeNull();
    expect(await getSession(asKv(), victimLaptop)).toBeNull();
    expect((await getSession(asKv(), admin))?.userId).toBe("admin");
  });
});
