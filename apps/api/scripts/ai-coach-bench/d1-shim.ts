// D1 nad node:sqlite (jen pro lokální měření nad kopií produkce, nikdy ne vzdálená DB).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite");

type Row = Record<string, unknown>;

function normalize(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  if (!/\?\d/.test(sql)) return { sql, params };
  const out: unknown[] = [];
  const text = sql.replace(/\?(\d+)/g, (_m, n) => {
    out.push(params[Number(n) - 1]);
    return "?";
  });
  return { sql: text, params: out };
}

function clean(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export function openD1(path: string): D1Database {
  const db = new DatabaseSync(path);
  const make = (sql: string, params: unknown[] = []) => {
    const exec = () => {
      const n = normalize(sql, params.map(clean));
      return { stmt: db.prepare(n.sql), params: n.params };
    };
    const isQuery = /^\s*(select|with|pragma)/i.test(sql) || /returning/i.test(sql);
    const api = {
      bind: (...p: unknown[]) => make(sql, p),
      first: async (col?: string) => {
        const { stmt, params: ps } = exec();
        const row = stmt.get(...ps) as Row | undefined;
        if (!row) return null;
        return col ? row[col] ?? null : row;
      },
      all: async () => {
        const { stmt, params: ps } = exec();
        const rows = isQuery ? stmt.all(...ps) as Row[] : (stmt.run(...ps), []);
        return { results: rows, success: true, meta: {} };
      },
      run: async () => {
        const { stmt, params: ps } = exec();
        if (isQuery) {
          const rows = stmt.all(...ps) as Row[];
          return { results: rows, success: true, meta: { changes: rows.length } };
        }
        const r = stmt.run(...ps) as { changes: number; lastInsertRowid: number };
        return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      raw: async () => {
        const { stmt, params: ps } = exec();
        return (stmt.all(...ps) as Row[]).map((r) => Object.values(r));
      },
      __exec: () => (isQuery ? api.all() : api.run()),
    };
    return api;
  };
  return {
    prepare: (sql: string) => make(sql),
    batch: async (stmts: Array<{ __exec: () => Promise<unknown> }>) => {
      const out: unknown[] = [];
      for (const s of stmts) out.push(await s.__exec());
      return out;
    },
    exec: async (sql: string) => { db.exec(sql); return { count: 0, duration: 0 }; },
    dump: async () => new ArrayBuffer(0),
    withSession: () => { throw new Error("not supported"); },
  } as unknown as D1Database;
}
