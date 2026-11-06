import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { commuteVillage, fillMissingResidences } from "./residence-fill";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const v = await db.prepare("SELECT id, name FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 1").first<{ id: string; name: string }>();
  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation) VALUES ('t1', 'ai', ?, 'Klub', 1000, 50)").bind(v!.id),
    ...[0, 0, 8, 15].map((km, i) => db.prepare(
      "INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, commute_km) VALUES (?, 't1', 'Jan', 'Novák', 25, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active', ?)",
    ).bind(`p${i}`, km)),
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, commute_km, residence) VALUES ('keep', 't1', 'Petr', 'Malý', 25, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active', 5, 'Husinec')"),
  ]);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("bydliště hráčů bez něj", () => {
  it("kdo nedojíždí, bydlí v obci klubu, dojíždějící ve skutečné obci okresu, dojíždění se nemění", async () => {
    const home = await db.prepare("SELECT v.name FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = 't1'").first<{ name: string }>();
    const res = await fillMissingResidences(db);
    expect(res).toEqual({ filled: 4, remaining: 0 });
    const rows = (await db.prepare("SELECT id, residence, commute_km FROM players ORDER BY id").all<{ id: string; residence: string; commute_km: number }>()).results;
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get("p0")!.residence).toBe(home!.name);
    expect(by.get("p1")!.residence).toBe(home!.name);
    const villages = new Set((await db.prepare("SELECT name FROM villages WHERE district = 'Prachatice'").all<{ name: string }>()).results.map((r) => r.name));
    for (const id of ["p2", "p3"]) {
      expect(by.get(id)!.residence).not.toBe(home!.name);
      expect(villages.has(by.get(id)!.residence)).toBe(true);
    }
    expect(by.get("p2")!.commute_km).toBe(8);
    expect(by.get("p3")!.commute_km).toBe(15);
    // Kdo bydliště má, zůstane
    expect(by.get("keep")!.residence).toBe("Husinec");
    // Podruhé nic
    expect(await fillMissingResidences(db)).toEqual({ filled: 0, remaining: 0 });
  });

  it("obec dojíždění sedí na vzdálenost a je pro hráče pořád stejná", () => {
    const home = { id: "h", name: "Domov", lat: 49, lng: 14 };
    const villages = [
      { id: "a", name: "Blízko", lat: 49 + 2 / 111.2, lng: 14, district: "X" },
      { id: "b", name: "Deset", lat: 49 + 10 / 111.2, lng: 14, district: "X" },
      { id: "c", name: "Daleko", lat: 49 + 40 / 111.2, lng: 14, district: "X" },
    ];
    const pick = commuteVillage(home, 10, villages, "hrac-1");
    expect(["Deset", "Blízko", "Daleko"]).toContain(pick);
    expect(commuteVillage(home, 10, villages, "hrac-1")).toBe(pick);
    expect(commuteVillage(home, 0, villages, "hrac-1")).toBe("Domov");
  });
});
