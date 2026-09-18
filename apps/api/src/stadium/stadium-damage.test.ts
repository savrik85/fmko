import { describe, expect, it } from "vitest";
import { jeOpravitelne, opravZdarma, ROZBITNE, ROZBITNE_ZEVNITR } from "./stadium-damage";

describe("co jde rozbít a opravit", () => {
  it("hráči se dostanou i do kabin, fanoušci ne", () => {
    expect(ROZBITNE_ZEVNITR).toContain("changing_rooms");
    expect(ROZBITNE).not.toContain("changing_rooms");
  });

  it("opravit jde všechno, co jde rozbít, a nic jiného", () => {
    for (const k of [...ROZBITNE, ...ROZBITNE_ZEVNITR]) expect(jeOpravitelne(k)).toBe(true);
    expect(jeOpravitelne("lighting")).toBe(false);
    expect(jeOpravitelne("security")).toBe(false);
  });
});

/**
 * Minimální in-memory D1 — jen tolik SQL, kolik `opravZdarma` potřebuje. Drží stav
 * mezi voláními, aby šlo ověřit idempotenci (druhé volání nesmí nic změnit).
 */
class FakeDb {
  damage = {
    id: "dmg-1", team_id: "t1", facility: "toilets", levels: 1,
    repair_cost: 2000, popis: "test", game_date: "2026-09-18",
    repaired_at: null as string | null,
  };
  stadium: Record<string, number> = { toilets: 1 };

  prepare(sql: string): FakeStmt {
    return new FakeStmt(sql, this);
  }
}

class FakeStmt {
  private params: unknown[] = [];
  constructor(private sql: string, private db: FakeDb) {}

  bind(...params: unknown[]): FakeStmt {
    this.params = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (/FROM stadium_damage/.test(this.sql)) {
      const [id, teamId] = this.params as [string, string];
      if (id === this.db.damage.id && teamId === this.db.damage.team_id) {
        return { ...this.db.damage } as unknown as T;
      }
      return null;
    }
    if (/SELECT toilets AS u FROM stadiums/.test(this.sql)) {
      return { u: this.db.stadium.toilets } as unknown as T;
    }
    return null;
  }

  async run(): Promise<{ meta: { changes: number } }> {
    if (/UPDATE stadium_damage SET repaired_at/.test(this.sql)) {
      const [id] = this.params as [string];
      if (id === this.db.damage.id && this.db.damage.repaired_at === null) {
        this.db.damage.repaired_at = "2026-09-18T12:00:00Z";
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (/UPDATE stadiums SET toilets/.test(this.sql)) {
      const [levels] = this.params as [number];
      this.db.stadium.toilets = Math.min(3, (this.db.stadium.toilets ?? 0) + levels);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

describe("opravZdarma", () => {
  it("opraví poškození zdarma a podruhé nic nezmění", async () => {
    const fake = new FakeDb();
    const db = fake as unknown as D1Database;

    const prvni = await opravZdarma(db, { teamId: "t1", damageId: "dmg-1", gameDate: "2026-09-18" });
    expect(prvni).toMatchObject({ ok: true, cost: 0, novaUroven: 2 });

    const druhy = await opravZdarma(db, { teamId: "t1", damageId: "dmg-1", gameDate: "2026-09-18" });
    expect(druhy).toEqual({ ok: false, duvod: "uz_opraveno" });
    // Druhé volání nesmí úroveň zvednout podruhé.
    expect(fake.stadium.toilets).toBe(2);
  });

  it("neexistující poškození vrátí nenalezeno", async () => {
    const fake = new FakeDb();
    const db = fake as unknown as D1Database;

    const res = await opravZdarma(db, { teamId: "t1", damageId: "neexistuje", gameDate: "2026-09-18" });
    expect(res).toEqual({ ok: false, duvod: "nenalezeno" });
  });
});
