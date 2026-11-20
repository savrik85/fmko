/**
 * Opakování čtení z D1 při výpadku: podvržená databáze, která hází přechodné chyby,
 * a skutečná D1 (Miniflare) pro kontrolu, že obal nic nerozbije (bind, first, batch).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { isReadOnlySql, withDbReadRetry, withReadRetry } from "./d1-read-retry";

const OUTAGE = "D1_ERROR: internal error; reference = 5d47d44unt9ro022tuerluod";

/** Databáze, která na prvních `failures` volání odpoví chybou `message`. */
function flakyDb(failures: number, message = OUTAGE) {
  const calls: string[] = [];
  let left = failures;
  const result = <T>(value: T) => async () => {
    if (left > 0) { left--; throw new Error(message); }
    return value;
  };
  const statement = (sql: string) => ({
    bind: () => statement(sql),
    first: (...args: unknown[]) => { calls.push(`first:${sql}`); return result({ n: 1, args })(); },
    all: () => { calls.push(`all:${sql}`); return result({ results: [{ n: 1 }] })(); },
    raw: () => { calls.push(`raw:${sql}`); return result([[1]])(); },
    run: () => { calls.push(`run:${sql}`); return result({ meta: { changes: 1 } })(); },
  });
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: unknown[]) => { calls.push(`batch:${stmts.length}`); return stmts.map(() => ({ results: [] })); },
    exec: async (sql: string) => { calls.push(`exec:${sql}`); return { count: 1 }; },
  };
  return { db: db as unknown as D1Database, calls };
}

describe("co je čtení", () => {
  it("SELECT a WITH bez zápisu ano, zápisy a nejasné příkazy ne", () => {
    expect(isReadOnlySql("SELECT id FROM teams WHERE id = ?")).toBe(true);
    expect(isReadOnlySql("  -- komentář\n select * from matches")).toBe(true);
    expect(isReadOnlySql("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    expect(isReadOnlySql("SELECT 1 AS x FROM pragma_table_info('users') WHERE name = 'last_activity_at'")).toBe(true);
    expect(isReadOnlySql("UPDATE teams SET budget = 1")).toBe(false);
    expect(isReadOnlySql("INSERT INTO messages (id) VALUES (?)")).toBe(false);
    expect(isReadOnlySql("WITH x AS (SELECT 1) DELETE FROM messages WHERE id IN (SELECT * FROM x)")).toBe(false);
    expect(isReadOnlySql("INSERT INTO t SELECT * FROM u")).toBe(false);
    expect(isReadOnlySql("PRAGMA table_info(users)")).toBe(false);
  });
});

describe("opakování při výpadku", () => {
  it("čtení se po výpadku zopakuje a hráč dostane data", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, calls } = flakyDb(2);
    const wrapped = withReadRetry(db, [0, 0]);
    await expect(wrapped.prepare("SELECT n FROM t WHERE id = ?").bind(1).first()).resolves.toMatchObject({ n: 1 });
    expect(calls).toHaveLength(3);
    vi.restoreAllMocks();
  });

  it("first se sloupcem, all i raw se opakují stejně", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const call of [
      (d: D1Database) => d.prepare("SELECT n FROM t").first("n"),
      (d: D1Database) => d.prepare("SELECT n FROM t").all(),
      (d: D1Database) => d.prepare("SELECT n FROM t").raw(),
    ]) {
      const { db, calls } = flakyDb(1);
      await expect(call(withReadRetry(db, [0, 0]))).resolves.toBeTruthy();
      expect(calls).toHaveLength(2);
    }
    vi.restoreAllMocks();
  });

  it("po vyčerpání pokusů chybu pustí dál (API z ní udělá 503)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, calls } = flakyDb(5);
    await expect(withReadRetry(db, [0, 0]).prepare("SELECT 1").first()).rejects.toThrow(OUTAGE);
    expect(calls).toHaveLength(3);
    vi.restoreAllMocks();
  });

  it("zápis ani batch se neopakují, mohly by se provést dvakrát", async () => {
    const write = flakyDb(1);
    await expect(withReadRetry(write.db, [0, 0]).prepare("UPDATE t SET n = 1").run()).rejects.toThrow(OUTAGE);
    expect(write.calls).toEqual(["run:UPDATE t SET n = 1"]);
  });

  it("chyba v SQL se neopakuje", async () => {
    const { db, calls } = flakyDb(1, "D1_ERROR: no such column: foo: SQLITE_ERROR");
    await expect(withReadRetry(db, [0, 0]).prepare("SELECT foo FROM t").first()).rejects.toThrow("no such column");
    expect(calls).toHaveLength(1);
  });

  it("stejná databáze dostane pokaždé stejný obal (cache podle databáze funguje dál)", () => {
    const { db } = flakyDb(0);
    const a = withDbReadRetry({ DB: db }).DB;
    const b = withDbReadRetry({ DB: db }).DB;
    expect(a).toBe(b);
    expect(a).not.toBe(db);
    expect(withDbReadRetry({ DB: undefined })).toEqual({ DB: undefined });
  });
});

describe("obal nad skutečnou D1", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    db = withReadRetry(await mf.getD1Database("DB"));
    await db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)");
  }, 30_000);

  afterAll(async () => { await mf.dispose(); });

  it("bind, first, all, run i batch fungují jako bez obalu", async () => {
    await db.prepare("INSERT INTO t (id, n) VALUES (?, ?)").bind("a", 1).run();
    const results = await db.batch([
      db.prepare("INSERT INTO t (id, n) VALUES (?, ?)").bind("b", 2),
      db.prepare("SELECT COUNT(*) AS c FROM t"),
    ]);
    expect((results[1].results[0] as { c: number }).c).toBe(2);
    expect(await db.prepare("SELECT n FROM t WHERE id = ?").bind("b").first("n")).toBe(2);
    expect((await db.prepare("SELECT id FROM t ORDER BY id").all<{ id: string }>()).results.map((r) => r.id)).toEqual(["a", "b"]);
    expect(await db.prepare("SELECT id, n FROM t ORDER BY id").raw()).toEqual([["a", 1], ["b", 2]]);
  });
});
