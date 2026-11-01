import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { maintainU21Pitches, U21_PITCH_TARGET } from "./u21-groundskeeper";

/**
 * U21 hřiště nikdo neudržoval: denní tick ubíral, opravy mířily na áčko.
 * Na produ (11-01) U21 hrála na trávníku kolem 37, áčka kolem 68.
 */
describe("správce U21 hřiště", () => {
  let miniflare: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    db = await miniflare.getD1Database("DB");
    await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, team_type TEXT)").run();
    await db.prepare("CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, pitch_condition INTEGER, pitch_type TEXT)").run();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  beforeEach(async () => {
    await db.prepare("DELETE FROM teams").run();
    await db.prepare("DELETE FROM stadiums").run();
  });

  async function team(id: string, type: string, pitch: number, surface: string | null = "natural") {
    await db.prepare("INSERT INTO teams VALUES (?, ?)").bind(id, type).run();
    await db.prepare("INSERT INTO stadiums VALUES (?, ?, ?)").bind(id, pitch, surface).run();
  }

  async function pitch(id: string): Promise<number> {
    const r = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?").bind(id).first<{ pitch_condition: number }>();
    return r!.pitch_condition;
  }

  it("zanedbané U21 hřiště denně spraví o 3 body, áčka se nedotkne", async () => {
    await team("u21", "u21", 37);
    await team("hybrid", "u21", 50, "hybrid");
    await team("senior", "senior", 37);

    expect(await maintainU21Pitches(db)).toBe(2);
    expect(await pitch("u21")).toBe(40);
    expect(await pitch("hybrid")).toBe(53);
    expect(await pitch("senior")).toBe(37);
  });

  it("nad udržovaný stav nejde a lepší trávník nesráží", async () => {
    await team("almost", "u21", 69);
    await team("good", "u21", 85);

    expect(await maintainU21Pitches(db)).toBe(1);
    expect(await pitch("almost")).toBe(U21_PITCH_TARGET);
    expect(await pitch("good")).toBe(85);
  });

  it("umělá tráva se nespravuje, bez typu se bere jako přírodní", async () => {
    await team("plastic", "u21", 40, "artificial");
    await team("unknown", "u21", 40, null);

    await maintainU21Pitches(db);
    expect(await pitch("plastic")).toBe(40);
    expect(await pitch("unknown")).toBe(43);
  });

  it("za dva týdny dožene zanedbané hřiště na udržovaný stav", async () => {
    await team("u21", "u21", 37);
    for (let day = 0; day < 14; day++) await maintainU21Pitches(db);
    expect(await pitch("u21")).toBe(U21_PITCH_TARGET);
  });
});
