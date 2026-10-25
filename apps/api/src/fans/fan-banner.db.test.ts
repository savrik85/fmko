import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { prepoctiTransparent } from "./fan-banner";
import type { FanGroupRow } from "./fan-group-generator";

let miniflare: Miniflare;
let db: D1Database;

const kotel: FanGroupRow = {
  id: "g1", team_id: "t1", kind: "kotel", name: "Kotel", share: 0.3, size: 40, mood: 60, heat: 20,
  passion: 70, aggression: 30, loyalty: 60, spending: 40, noise: 50, sector: "sever",
  closed_matches: 0, ticket_discount: 0, core: 10, leader_id: null,
};

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT)");
  // Jako skutečné schéma: teams sloupec tactic nemá, taktiku nese sestava.
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, league_id TEXT)");
  await db.exec("CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT, tactic TEXT, submitted_at TEXT, is_auto INTEGER DEFAULT 0)");
  await db.exec("CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, ultras_text TEXT, ultras_text_duvod TEXT, ultras_stand INTEGER)");
  await db.exec("CREATE TABLE fan_campaigns (team_id TEXT, kind TEXT, target_name TEXT, status TEXT)");
  await db.exec("CREATE TABLE fan_group_players (group_id TEXT, player_id TEXT, stance TEXT)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, status TEXT)");
  await db.exec("CREATE TABLE managers (team_id TEXT PRIMARY KEY, name TEXT)");
  await db.exec("CREATE TABLE fan_rivalries (id TEXT, team_a TEXT, team_b TEXT, heat INTEGER, fights INTEGER, incidents INTEGER, last_game_date TEXT, history TEXT)");
  await db.exec("CREATE TABLE matches (home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT)");
  await db.exec("CREATE TABLE ultras_reports (league_id TEXT, photos_json TEXT)");
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Podolí', 'Praha')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'FK Rohlík Podolí', 'v1', 'l1')"),
    db.prepare("INSERT INTO stadiums VALUES ('t1', NULL, NULL, 1)"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const plachta = () => db.prepare("SELECT ultras_text, ultras_text_duvod FROM stadiums WHERE team_id = 't1'")
  .first<{ ultras_text: string; ultras_text_duvod: string }>();

describe("přepočet plachty", () => {
  it("čistá plachta se stejným důvodem visí dál", async () => {
    await prepoctiTransparent(db, "t1", [kotel], "2026-09-28");
    const prvni = await plachta();
    expect(prvni!.ultras_text).toBeTruthy();
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-09-28")).toBeNull();
  });

  it("stará plachta se sponzorem jde dolů i beze změny důvodu", async () => {
    await db.prepare("UPDATE stadiums SET ultras_text = 'FK Rohlík Podolí: my tu budem!' WHERE team_id = 't1'").run();
    const nova = await prepoctiTransparent(db, "t1", [kotel], "2026-09-28");
    expect(nova).not.toBeNull();
    expect((await plachta())!.ultras_text).not.toMatch(/rohl/i);
  });

  it("plachta od modelu mimo katalog jde dolů", async () => {
    await db.prepare("UPDATE stadiums SET ultras_text = 'PODOLÍ JE NAŠE KRVOU, SRDCEM, DUŠÍ' WHERE team_id = 't1'").run();
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-09-28")).not.toBeNull();
    expect((await plachta())!.ultras_text).not.toMatch(/krvou/i);
  });

  it("stará plachta s číslem jde dolů", async () => {
    await db.prepare("UPDATE stadiums SET ultras_text = 'PODOLÍ MÁ 5 VÝHER' WHERE team_id = 't1'").run();
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-09-28")).not.toBeNull();
  });
});

describe("plachta po domácím zápase", () => {
  const report = (texts: Array<{ teamId: string; ultrasText: string }>) =>
    db.prepare("INSERT INTO ultras_reports VALUES ('l1', ?)").bind(JSON.stringify(texts)).run();

  it("dokud na zápase nevisela, nebo visela jiná, zůstává", async () => {
    await prepoctiTransparent(db, "t1", [kotel], "2026-09-29");
    const before = await plachta();
    await report([{ teamId: "t1", ultrasText: "NĚJAKÁ STARŠÍ PLACHTA" }, { teamId: "t2", ultrasText: before!.ultras_text }]);
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-09-29")).toBeNull();
    expect((await plachta())!.ultras_text).toBe(before!.ultras_text);
  });

  it("plachta, která už visela na domácím zápase, se před dalším přemaluje se stejným důvodem", async () => {
    const before = await plachta();
    await report([{ teamId: "t1", ultrasText: before!.ultras_text }]);
    const repainted = await prepoctiTransparent(db, "t1", [kotel], "2026-09-30");
    expect(repainted).not.toBeNull();
    const after = await plachta();
    expect(after!.ultras_text).not.toBe(before!.ultras_text);
    expect(after!.ultras_text_duvod).toBe(before!.ultras_text_duvod);
    // Nová plachta na zápase ještě nevisela, takže druhý den visí dál.
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-10-01")).toBeNull();
  });
});

describe("plachta k taktice", () => {
  it("kotel soudí taktiku z poslední sestavy: nakopávaný fotbal bez gólů dostane výtku", async () => {
    const kotelT9 = { ...kotel, id: "g9", team_id: "t9" };
    await db.batch([
      db.prepare("INSERT INTO villages VALUES ('v9', 'Lhenice', 'Prachatice')"),
      db.prepare("INSERT INTO teams VALUES ('t9', 'SK Lhenice', 'v9', 'l9')"),
      db.prepare("INSERT INTO stadiums VALUES ('t9', NULL, NULL, 1)"),
      // Starší sestava hrála presink, poslední nakopávané míče: platí poslední.
      db.prepare("INSERT INTO lineups VALUES ('lu-old', 't9', 'pressing', '2026-09-20T10:00:00Z', 0)"),
      db.prepare("INSERT INTO lineups VALUES ('lu-new', 't9', 'long_ball', '2026-09-27T10:00:00Z', 1)"),
    ]);
    await prepoctiTransparent(db, "t9", [kotelT9], "2026-09-28");
    const row = await db.prepare("SELECT ultras_text, ultras_text_duvod FROM stadiums WHERE team_id = 't9'")
      .first<{ ultras_text: string; ultras_text_duvod: string }>();
    expect(row).toEqual({ ultras_text: "ŽÁDNÝ KECY, MAKAT!", ultras_text_duvod: "Kotel nesnáší nakopávaný fotbal." });
  });
});
