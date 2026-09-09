/**
 * Propuštění hráči padají do poolu volných hráčů bez limitu (strop se jich
 * netýká, viz free-agent-pool.test.ts). Jediné, co je z trhu odklízí, je
 * expirace — proto na její délce záleží: při sedmi dnech se v okrese s hodně
 * manažery drželo přes deset odložených hráčů naráz a trh byl nepřehledný.
 */

import { describe, it, expect } from "vitest";
import { removePlayer } from "./remove-player";

interface Recorded { sql: string; params: unknown[] }

const PLAYER_ROW = {
  id: "p1", team_id: "t1", district: "Prachatice",
  first_name: "Jan", last_name: "Novák", nickname: null,
  age: 28, position: "MID", overall_rating: 40,
  skills: "{}", physical: "{}", personality: "{}", life_context: "{}",
  avatar: "{}", hidden_talent: 0, weekly_wage: 200,
  team_name: "FK Test", team_league_id: "l1", team_village_id: "v1",
  is_celebrity: 0, nationality: "CZ", skills_max: "{}",
};

class FakeStatement {
  constructor(private sql: string, private db: FakeD1, private params: unknown[] = []) {}
  bind(...params: unknown[]): FakeStatement {
    const stmt = new FakeStatement(this.sql, this.db, params);
    this.db.recorded.push({ sql: this.sql, params });
    return stmt;
  }
  async first<T>(): Promise<T | null> {
    if (/FROM players p/.test(this.sql)) return PLAYER_ROW as unknown as T;
    if (/FROM seasons/.test(this.sql)) return { number: 4 } as unknown as T;
    return null;
  }
  async run(): Promise<{ meta: { changes: number } }> { return { meta: { changes: 1 } }; }
}

class FakeD1 {
  recorded: Recorded[] = [];
  prepare(sql: string): FakeStatement { return new FakeStatement(sql, this); }
  async batch(stmts: unknown[]): Promise<{ meta: { changes: number } }[]> {
    return stmts.map(() => ({ meta: { changes: 1 } }));
  }
  freeAgentInsert(): Recorded | undefined {
    return this.recorded.find((r) => /INSERT INTO free_agents/.test(r.sql));
  }
}

/** Expirace je jediný ISO timestamp mezi bindnutými parametry. */
function expiryInDays(rec: Recorded): number {
  const iso = rec.params.find((p) => typeof p === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p)) as string;
  return (new Date(iso).getTime() - Date.now()) / 86_400_000;
}

describe("removePlayer — expirace v poolu volných hráčů", () => {
  it("propuštěný hráč zmizí z trhu po 3 dnech", async () => {
    const db = new FakeD1();

    const res = await removePlayer(db as unknown as D1Database, "p1", "released", { toFreeAgent: true });

    expect(res.ok).toBe(true);
    const insert = db.freeAgentInsert();
    expect(insert).toBeDefined();
    expect(insert!.params).toContain("released");
    expect(expiryInDays(insert!)).toBeCloseTo(3, 1);
  });

  it("stejná lhůta platí pro hráče, co skončili sami", async () => {
    const db = new FakeD1();

    await removePlayer(db as unknown as D1Database, "p1", "quit", { toFreeAgent: true });

    const insert = db.freeAgentInsert();
    expect(insert!.params).toContain("quit");
    expect(expiryInDays(insert!)).toBeCloseTo(3, 1);
  });

  it("volající si smí expiraci určit sám", async () => {
    const db = new FakeD1();
    const vlastni = new Date(Date.now() + 10 * 86_400_000).toISOString();

    await removePlayer(db as unknown as D1Database, "p1", "released", { toFreeAgent: true, faExpiresAt: vlastni });

    expect(expiryInDays(db.freeAgentInsert()!)).toBeCloseTo(10, 1);
  });

  it("bez toFreeAgent se do poolu nevkládá nic", async () => {
    const db = new FakeD1();

    await removePlayer(db as unknown as D1Database, "p1", "retired", {});

    expect(db.freeAgentInsert()).toBeUndefined();
  });
});
