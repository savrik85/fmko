/** Uložení podoby stadionu k zápasu na skutečné D1 (Miniflare): ligový i pohárový zápas, a chyba zápas nezdrží. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { saveStadiumSnapshot } from "./match-snapshot";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  await db.batch([
    db.prepare("CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, capacity INTEGER, pitch_type TEXT, pitch_moisture INTEGER, stands INTEGER, fence INTEGER, stand_color TEXT)"),
    db.prepare("CREATE TABLE equipment (team_id TEXT PRIMARY KEY, mower INTEGER)"),
    db.prepare("CREATE TABLE stadium_extensions (team_id TEXT, slot TEXT, kind TEXT, level INTEGER)"),
    db.prepare("CREATE TABLE sponsor_contracts (team_id TEXT, sponsor_name TEXT, status TEXT, category TEXT)"),
    // Na mantinelech je jen platná reklama u hřiště, ne hlavní sponzor ani vypršená smlouva.
    db.prepare("INSERT INTO sponsor_contracts (team_id, sponsor_name, status, category) VALUES ('h', 'Pila Novák', 'active', 'banner'), ('h', 'Hlavní', 'active', 'main'), ('h', 'Bývalý', 'expired', 'banner')"),
    db.prepare("CREATE TABLE matches (id TEXT PRIMARY KEY, stadium_snapshot TEXT)"),
    db.prepare("CREATE TABLE cup_matches (id TEXT PRIMARY KEY, stadium_snapshot TEXT)"),
    db.prepare("INSERT INTO stadiums (team_id, capacity, pitch_type, pitch_moisture, stands, fence, stand_color) VALUES ('h', 300, 'natural', 62, 2, 1, '#AA0000')"),
    db.prepare("INSERT INTO equipment (team_id, mower) VALUES ('h', 2)"),
    db.prepare("INSERT INTO stadium_extensions (team_id, slot, kind, level) VALUES ('h', 'corner_ne', 'seats', 1)"),
    db.prepare("INSERT INTO matches (id) VALUES ('m1'), ('m2')"),
    db.prepare("INSERT INTO cup_matches (id) VALUES ('c1')"),
  ]);
}, 60_000);

afterAll(async () => { await mf?.dispose(); });

const stored = async (table: string, id: string) => {
  const row = await db.prepare(`SELECT stadium_snapshot FROM ${table} WHERE id = ?`).bind(id).first<{ stadium_snapshot: string | null }>();
  return row?.stadium_snapshot ? JSON.parse(row.stadium_snapshot) : null;
};

describe("uložení podoby stadionu k zápasu", () => {
  it("ligový zápas dostane stadion domácích i s péčí, která se zapnula", async () => {
    await saveStadiumSnapshot(db, "matches", "m1", "h", "snow_clearing");
    expect(await stored("matches", "m1")).toMatchObject({
      pitchType: "natural", pitchMoisture: 62, mowerLevel: 2, care: "snow_clearing",
      facilities: { stands: 2, fence: 1 }, extensions: [{ slot: "corner_ne", kind: "seats", level: 1 }],
      sponsors: ["Pila Novák"], customization: { standColor: "#AA0000" },
    });
  });

  it("pohárový zápas se ukládá do své tabulky", async () => {
    await saveStadiumSnapshot(db, "cup_matches", "c1", "h", null);
    expect(await stored("cup_matches", "c1")).toMatchObject({ care: null, facilities: { stands: 2 } });
  });

  it("klub bez stadionu nic neuloží a zápas tím nespadne", async () => {
    await expect(saveStadiumSnapshot(db, "matches", "m2", "nobody", null)).resolves.toBeUndefined();
    expect(await stored("matches", "m2")).toBeNull();
  });
});
