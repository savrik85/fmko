/**
 * Záznam vstupů na trh.
 *
 * Hlídá se hlavně to rozdělení: nové tělo od hry a propuštěnec od manažera
 * se nesmí sečíst dohromady, kvůli tomu vypadal trh přetečený.
 */
import { describe, it, expect } from "vitest";
import { zapisNaTrh } from "./market-log";

interface Zaznam { sql: string; args: unknown[] }

function fakeDb(userId: string | null = null) {
  const zapsane: Zaznam[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              zapsane.push({ sql, args });
              return sql.includes("FROM teams") ? { user_id: userId } : null;
            },
            async run() { zapsane.push({ sql, args }); return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, zapsane };
}

const vlozeni = (z: Zaznam[]) => z.find((r) => r.sql.includes("INSERT INTO market_log"));

describe("zápis vstupu na trh", () => {
  it("vygenerovaný hráč nemá klub a nepočítá se jako od manažera", async () => {
    const { db, zapsane } = fakeDb();
    await zapisNaTrh(db, { district: "Prachatice", origin: "generated" });
    const r = vlozeni(zapsane);
    expect(r).toBeDefined();
    // id, district, origin, team_id, from_human, game_date
    expect(r!.args[1]).toBe("Prachatice");
    expect(r!.args[2]).toBe("generated");
    expect(r!.args[3]).toBeNull();
    expect(r!.args[4]).toBe(0);
  });

  it("propuštěný od živého trenéra se označí jako od manažera", async () => {
    const { db, zapsane } = fakeDb("user-123");
    await zapisNaTrh(db, { district: "Praha", origin: "released", teamId: "t1" });
    const r = vlozeni(zapsane);
    expect(r!.args[2]).toBe("released");
    expect(r!.args[3]).toBe("t1");
    expect(r!.args[4]).toBe(1);
  });

  it("propuštěný od AI se od manažerského odliší", async () => {
    const { db, zapsane } = fakeDb("ai");
    await zapisNaTrh(db, { district: "Praha", origin: "released", teamId: "t2" });
    expect(vlozeni(zapsane)!.args[4]).toBe(0);
  });

  it("celebrita je nové tělo, ne recyklovaný hráč", async () => {
    const { db, zapsane } = fakeDb();
    await zapisNaTrh(db, { district: "Praha", origin: "celebrity" });
    expect(vlozeni(zapsane)!.args[2]).toBe("celebrity");
    expect(vlozeni(zapsane)!.args[4]).toBe(0);
  });

  it("bez okresu to nespadne", async () => {
    const { db, zapsane } = fakeDb();
    await zapisNaTrh(db, { district: null, origin: "generated" });
    expect(vlozeni(zapsane)!.args[1]).toBeNull();
  });
});
