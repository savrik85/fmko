/**
 * Pustí SKUTEČNÝ denní tick (`executeDailyTick`) nad kopií produkční databáze.
 *
 * Žádná náhrada, žádná fixtura — je to ten samý kód, který běží na produkci z cronu.
 * Měří se z `training_log`, tedy tím samým dotazem, jakým se čte skutečnost.
 */
import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { executeDailyTick } from "./daily-tick";

const SCR = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad";
const DB = process.env.TICK_DB ?? `${SCR}/tick.sqlite`;
const DNI = Number(process.env.DNI ?? 40);

function sql(s: string, json = false): string {
  return execFileSync("sqlite3", json ? ["-json", DB, s] : [DB, s],
    { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
}
function dotaz<T>(s: string): T[] {
  const o = sql(s, true);
  return o.trim() ? (JSON.parse(o) as T[]) : [];
}

/** D1 nad sqlite3 z systému — jen to, co tick opravdu volá. */
function d1(): D1Database {
  const priprav = (text: string): any => {
    let params: unknown[] = [];
    const doplnit = () => {
      let i = 0;
      return text.replace(/\?/g, () => {
        const v = params[i++];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "1" : "0";
        return `'${String(v).replace(/'/g, "''")}'`;
      });
    };
    const self: any = {
      bind: (...p: unknown[]) => { params = p; return self; },
      first: async () => (dotaz<Record<string, unknown>>(doplnit())[0] ?? null),
      all: async () => ({ results: dotaz<Record<string, unknown>>(doplnit()), meta: { changes: 0 } }),
      run: async () => {
        const r = dotaz<{ c: number }>(`${doplnit()}; SELECT changes() AS c;`);
        return { success: true, meta: { changes: r[r.length - 1]?.c ?? 0, last_row_id: 0, duration: 0 } };
      },
      raw: async () => [],
      __sql: doplnit,
    };
    return self;
  };
  return {
    prepare: priprav,
    batch: async (stmts: any[]) => {
      const out: any[] = [];
      for (const s of stmts) {
        const r = dotaz<{ c: number }>(`${s.__sql()}; SELECT changes() AS c;`);
        out.push({ success: true, results: [], meta: { changes: r[r.length - 1]?.c ?? 0, last_row_id: 0, duration: 0 } });
      }
      return out;
    },
    exec: async (s: string) => { sql(s); return { count: 0, duration: 0 }; },
  } as unknown as D1Database;
}

/** KV v paměti — tick si jím hlídá, že neběžel dvakrát za den. */
function kv(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

it.skipIf(!existsSync(DB))("skutecny denni tick nad produkcni kopii", async () => {
  const pred = dotaz<{ n: number }>("SELECT COUNT(*) AS n FROM training_log")[0]?.n ?? 0;
  const env = { DB: d1(), CACHE_KV: kv(), SESSION_KV: kv() } as unknown as Parameters<typeof executeDailyTick>[0];

  let chyby = 0;
  for (let den = 0; den < DNI; den++) {
    // Herní čas se posouvá o den — tick si jinak myslí, že už dnes běžel
    sql(`UPDATE game_clock SET offset_days = offset_days + 1 WHERE id = 1`);
    try { await executeDailyTick(env); } catch { chyby++; }
  }

  const po = dotaz<{ n: number }>("SELECT COUNT(*) AS n FROM training_log")[0]?.n ?? 0;
  const nove = dotaz<{
    pasmo: string; hracu: number; zlepseni: number; ubytek: number;
  }>(`SELECT CASE WHEN p.age < 22 THEN 'do 21' WHEN p.age < 25 THEN '22-24'
                 WHEN p.age < 28 THEN '25-27' WHEN p.age < 31 THEN '28-30' ELSE '31+' END AS pasmo,
             COUNT(DISTINCT p.id) AS hracu,
             SUM(CASE WHEN tl.change > 0 THEN tl.change ELSE 0 END) AS zlepseni,
             SUM(CASE WHEN tl.change < 0 THEN -tl.change ELSE 0 END) AS ubytek
        FROM training_log tl JOIN players p ON p.id = tl.player_id
        JOIN teams t ON t.id = p.team_id JOIN teams r ON r.id = COALESCE(t.parent_team_id, t.id)
       WHERE r.user_id != 'ai' AND tl.rowid > ${pred}
       GROUP BY pasmo ORDER BY pasmo`);

  const radky = [
    `SKUTECNY DENNI TICK, ${DNI} hernich dni (~1 sezona), produkcni kopie`,
    `zaznamu v training_log: ${pred} -> ${po}  (+${po - pred}), chyb ticku: ${chyby}`,
    "",
    `${"vek".padEnd(8)}${"hracu".padEnd(8)}${"zlepseni".padEnd(11)}${"ubytek".padEnd(9)}${"cisty zisk/hrace"}`,
  ];
  for (const r of nove) {
    const cisty = (r.zlepseni - r.ubytek) / Math.max(1, r.hracu);
    radky.push(`${r.pasmo.padEnd(8)}${String(r.hracu).padEnd(8)}${String(r.zlepseni).padEnd(11)}${String(r.ubytek).padEnd(9)}${cisty.toFixed(1)} bodu (${(cisty * 0.087).toFixed(2)} hodnoceni)`);
  }
  writeFileSync(process.env.VYSTUP ?? `${SCR}/tick.txt`, radky.join("\n"));
  expect(po).toBeGreaterThan(pred);
}, 1_800_000);
