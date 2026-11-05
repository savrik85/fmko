/** Měření dotazů loadAcademyView nad kopií produkce (PROD_AUDIT_DB). Jen lokálně, CI přeskočí. */
import { describe, it, beforeAll } from "vitest";
import { writeFileSync } from "node:fs";
import { loadAcademyView } from "./service";

const SRC = process.env.PROD_AUDIT_DB;
let db: D1Database;
const stats = new Map<string, { n: number; ms: number }>();

beforeAll(async () => {
  if (!SRC) return;
  const { openD1 } = await import("../../scripts/ai-coach-bench/d1-shim");
  const raw = openD1(SRC);
  const wrap = (sql: string, st: D1PreparedStatement): D1PreparedStatement => new Proxy(st, {
    get(target, prop) {
      const v = (target as any)[prop];
      if (prop === "bind") return (...a: unknown[]) => wrap(sql, v.apply(target, a));
      if (["first", "all", "run", "raw"].includes(String(prop))) {
        return async (...a: unknown[]) => {
          const t = performance.now();
          try { return await v.apply(target, a); } finally {
            const key = sql.replace(/\s+/g, " ").slice(0, 110);
            const s = stats.get(key) ?? { n: 0, ms: 0 };
            s.n++; s.ms += performance.now() - t; stats.set(key, s);
          }
        };
      }
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  db = new Proxy(raw, { get(t, p) { const v = (t as any)[p]; if (p === "prepare") return (sql: string) => wrap(sql, v.call(t, sql)); return typeof v === "function" ? v.bind(t) : v; } });
});

describe.skipIf(!SRC)("profil stránky akademie", () => {
  it("dotazy jednoho načtení", async () => {
    const team = process.env.PROFILE_TEAM!;
    // Výstup pro několik klubů: porovnání před a po úpravě (PROFILE_SNAPSHOT)
    if (process.env.PROFILE_SNAPSHOT) {
      const ids = (await db.prepare("SELECT id FROM teams WHERE parent_team_id IS NULL AND academy_upkeep = 1 ORDER BY id LIMIT 4").all<{ id: string }>()).results.map((r) => r.id);
      const unfounded = (await db.prepare("SELECT id FROM teams WHERE parent_team_id IS NULL AND academy_upkeep = 0 AND name NOT LIKE 'DELETED%' ORDER BY id LIMIT 1").all<{ id: string }>()).results.map((r) => r.id);
      const out: Record<string, unknown> = {};
      for (const id of [team, ...ids, ...unfounded]) out[id] = await loadAcademyView(db, id);
      writeFileSync(process.env.PROFILE_SNAPSHOT, JSON.stringify(out, null, 1));
      stats.clear();
    }
    const t0 = performance.now();
    await loadAcademyView(db, team);
    const total = performance.now() - t0;
    const rows = [...stats.entries()].sort((a, b) => b[1].ms - a[1].ms);
    const lines = [`celkem ${Math.round(total)} ms, dotazů ${rows.reduce((n, [, s]) => n + s.n, 0)}`, ...rows.slice(0, 30).map(([k, s]) => `${String(s.n).padStart(4)}× ${s.ms.toFixed(0).padStart(6)} ms  ${k}`)];
    writeFileSync(process.env.PROFILE_OUT!, lines.join("\n") + "\n");
  }, 600_000);
});
