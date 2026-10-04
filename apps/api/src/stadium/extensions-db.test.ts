import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExtension, loadExtensions, replaceMobileExtension } from "./extensions-db";
import { extCapacity } from "./extension-catalog";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DROP TABLE IF EXISTS stadium_extensions").run();
  await db.prepare("DROP TABLE IF EXISTS stadiums").run();
  await db.prepare("CREATE TABLE stadiums (id TEXT PRIMARY KEY, team_id TEXT NOT NULL UNIQUE)").run();
  const sql = readFileSync(join(__dirname, "..", "..", "migrations", "0240_pristavby_tribun.sql"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const st of sql.split(/;\n(?=(?:ALTER|CREATE) )/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean)) {
    await db.prepare(st).run();
  }
  await db.prepare("INSERT INTO stadiums (id, team_id) VALUES ('s1','t1')").run();
});

const capacityOf = async () =>
  (await db.prepare("SELECT stand_ext_capacity AS c FROM stadiums WHERE team_id = 't1'").first<{ c: number }>())?.c;

describe("buildExtension", () => {
  it("nová přístavba se zapíše na úroveň 1 a kapacita se přepočítá", async () => {
    expect(await buildExtension(db, "t1", "corner_main_goal_east", "corner", 0)).toBe(true);
    expect(await loadExtensions(db, "t1")).toEqual([{ slot: "corner_main_goal_east", kind: "corner", level: 1 }]);
    expect(await capacityOf()).toBe(extCapacity("corner", 1));
  });

  it("dvojí stavba do stejného místa: druhá prohraje a nic se nezmění", async () => {
    expect(await buildExtension(db, "t1", "ext_main", "length", 0)).toBe(true);
    expect(await buildExtension(db, "t1", "ext_main", "tower", 0)).toBe(false);
    expect(await loadExtensions(db, "t1")).toEqual([{ slot: "ext_main", kind: "length", level: 1 }]);
    expect(await capacityOf()).toBe(extCapacity("length", 1));
  });

  it("vylepšení zvedne úroveň o jedna a dvojí vylepšení prohraje", async () => {
    await buildExtension(db, "t1", "ext_main", "length", 0);
    expect(await buildExtension(db, "t1", "ext_main", "length", 1)).toBe(true);
    expect(await buildExtension(db, "t1", "ext_main", "length", 1)).toBe(false);
    expect((await loadExtensions(db, "t1"))[0].level).toBe(2);
    expect(await capacityOf()).toBe(extCapacity("length", 2));
  });

  it("vylepšení jiného druhu, než v místě stojí, se nezapíše", async () => {
    await buildExtension(db, "t1", "ext_main", "length", 0);
    expect(await buildExtension(db, "t1", "ext_main", "tower", 1)).toBe(false);
  });

  it("kapacita je součet všech míst", async () => {
    await buildExtension(db, "t1", "ext_main", "length", 0);
    await buildExtension(db, "t1", "corner_main_goal_east", "curved_corner", 0);
    expect(await capacityOf()).toBe(extCapacity("length", 1) + extCapacity("curved_corner", 1));
  });
});

describe("replaceMobileExtension", () => {
  it("mobilní tribunku nahradí jinou přístavbou na úrovni 1 a kapacita se přepočítá", async () => {
    await buildExtension(db, "t1", "corner_main_goal_east", "mobile", 0);
    await buildExtension(db, "t1", "corner_main_goal_east", "mobile", 1);
    expect(await replaceMobileExtension(db, "t1", "corner_main_goal_east", "curved_corner", 2)).toBe(true);
    expect(await loadExtensions(db, "t1")).toEqual([{ slot: "corner_main_goal_east", kind: "curved_corner", level: 1 }]);
    expect(await capacityOf()).toBe(extCapacity("curved_corner", 1));
  });

  it("dvojí nahrazení: druhé prohraje a nic se nezmění", async () => {
    await buildExtension(db, "t1", "corner_main_goal_east", "mobile", 0);
    expect(await replaceMobileExtension(db, "t1", "corner_main_goal_east", "corner", 1)).toBe(true);
    expect(await replaceMobileExtension(db, "t1", "corner_main_goal_east", "wing", 1)).toBe(false);
    expect(await loadExtensions(db, "t1")).toEqual([{ slot: "corner_main_goal_east", kind: "corner", level: 1 }]);
  });

  it("nahradit jde jen mobilní tribunku, jiný druh zůstane", async () => {
    await buildExtension(db, "t1", "corner_main_goal_east", "corner", 0);
    expect(await replaceMobileExtension(db, "t1", "corner_main_goal_east", "wing", 1)).toBe(false);
    expect((await loadExtensions(db, "t1"))[0].kind).toBe("corner");
  });

  it("nahrazení špatné úrovně neprojde", async () => {
    await buildExtension(db, "t1", "corner_main_goal_east", "mobile", 0);
    expect(await replaceMobileExtension(db, "t1", "corner_main_goal_east", "corner", 3)).toBe(false);
  });
});
