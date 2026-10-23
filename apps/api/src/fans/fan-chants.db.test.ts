import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { tikChoralu } from "./fan-chants";
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
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, tactic TEXT, league_id TEXT)");
  await db.exec("CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, toilets INTEGER, roof INTEGER, refreshments INTEGER, stands INTEGER, ultras_stand INTEGER, pitch_condition INTEGER)");
  await db.exec("CREATE TABLE fan_campaigns (team_id TEXT, kind TEXT, target_name TEXT, status TEXT)");
  await db.exec("CREATE TABLE fan_group_players (group_id TEXT, player_id TEXT, stance TEXT)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, status TEXT)");
  await db.exec("CREATE TABLE managers (team_id TEXT PRIMARY KEY, name TEXT)");
  await db.exec("CREATE TABLE fan_rivalries (id TEXT, team_a TEXT, team_b TEXT, heat INTEGER, fights INTEGER, incidents INTEGER, last_game_date TEXT, history TEXT)");
  await db.exec("CREATE TABLE matches (home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT)");
  await db.prepare(`CREATE TABLE fan_chants (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, group_id TEXT, kind TEXT NOT NULL,
    text TEXT NOT NULL, duvod TEXT NOT NULL DEFAULT '', sila INTEGER NOT NULL DEFAULT 40, since_game_date TEXT,
    last_game_date TEXT, status TEXT NOT NULL DEFAULT 'zpiva', updated_at TEXT,
    audio_task_id TEXT, audio_a TEXT, audio_b TEXT, audio_vybrana TEXT)`).run();
  await db.exec("CREATE UNIQUE INDEX idx_fan_chants_druh ON fan_chants(team_id, kind) WHERE status = 'zpiva'");
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Podolí', 'Praha')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'SK Podolí', 'v1', NULL, 'l1')"),
    // Stadion bez chyby, ať vzniká jen chorál o miláčkovi.
    db.prepare("INSERT INTO stadiums VALUES ('t1', 1, 1, 1, 1, 1, 80)"),
    db.prepare("INSERT INTO players VALUES ('p1', 'Jakub', 'Kučera', 'active')"),
    db.prepare("INSERT INTO fan_group_players VALUES ('g1', 'p1', 'oblibenec')"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.exec("DELETE FROM fan_chants");
});

const zpivane = () => db.prepare("SELECT * FROM fan_chants WHERE team_id = 't1' AND status = 'zpiva'")
  .all<{ id: string; kind: string; text: string; duvod: string; audio_a: string | null }>();

describe("chorál o miláčkovi kotle", () => {
  it("nový miláček dostane nový chorál, starý i s nahrávkou se zapomene", async () => {
    await db.prepare(
      `INSERT INTO fan_chants (id, team_id, group_id, kind, text, duvod, sila, status, audio_a)
       VALUES ('old', 't1', 'g1', 'oblibenec', 'Robl je náš!', 'Petr Robl je miláček kotle.', 70, 'zpiva', 'r2/robl.mp3')`,
    ).run();

    await tikChoralu(db, "t1", [kotel], "2026-10-23T16:00:00.000Z");

    const stary = await db.prepare("SELECT status, text, audio_a FROM fan_chants WHERE id = 'old'")
      .first<{ status: string; text: string; audio_a: string }>();
    expect(stary).toEqual({ status: "zapomenut", text: "Robl je náš!", audio_a: "r2/robl.mp3" });

    const novy = (await zpivane()).results.find((c) => c.kind === "oblibenec");
    expect(novy?.id).not.toBe("old");
    expect(novy?.duvod).toBe("Jakub Kučera je miláček kotle.");
    expect(novy?.text.toUpperCase()).toContain("KUČERA");
    expect(novy?.audio_a).toBeNull();
  });

  it("stejný miláček: text i nahrávka zůstanou", async () => {
    await db.prepare(
      `INSERT INTO fan_chants (id, team_id, group_id, kind, text, duvod, sila, status, audio_a)
       VALUES ('k', 't1', 'g1', 'oblibenec', 'Kučera, Kučera, hej!', 'Jakub Kučera je miláček kotle.', 70, 'zpiva', 'r2/k.mp3')`,
    ).run();

    await tikChoralu(db, "t1", [kotel], "2026-10-23T16:00:00.000Z");

    const r = (await zpivane()).results.filter((c) => c.kind === "oblibenec");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "k", text: "Kučera, Kučera, hej!", audio_a: "r2/k.mp3" });
  });
});

describe("chorál bez předmětu", () => {
  it("delší série změní jen důvod, text a nahrávka zůstanou", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches VALUES ('t1', 'x', 2, 0, '2026-10-20', '2026-10-20')"),
      db.prepare("INSERT INTO matches VALUES ('t1', 'x', 3, 1, '2026-10-21', '2026-10-21')"),
      db.prepare("INSERT INTO matches VALUES ('t1', 'x', 1, 0, '2026-10-22', '2026-10-22')"),
      db.prepare(
        `INSERT INTO fan_chants (id, team_id, group_id, kind, text, duvod, sila, status, audio_a)
         VALUES ('v', 't1', 'g1', 'vyhra', 'Jedeme dál od AI!', 'Série 2 výher.', 60, 'zpiva', 'r2/v.mp3')`,
      ),
    ]);

    await tikChoralu(db, "t1", [kotel], "2026-10-23T16:00:00.000Z");
    await db.exec("DELETE FROM matches");

    const v = (await zpivane()).results.find((c) => c.kind === "vyhra");
    expect(v).toMatchObject({ id: "v", text: "Jedeme dál od AI!", audio_a: "r2/v.mp3" });
    expect(v?.duvod).toBe("Série 3 výher.");
  });
});
