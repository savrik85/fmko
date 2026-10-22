import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { dospejMladeHrace } from "./dospivani";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare(
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER, position TEXT,
     overall_rating INTEGER, hidden_talent INTEGER, skills TEXT, physical TEXT, skills_max TEXT, life_context TEXT, status TEXT, weekly_wage INTEGER)`,
  ).run();
  await db.prepare("CREATE TABLE training_log (player_id TEXT, team_id TEXT, attribute TEXT, old_value INTEGER, new_value INTEGER, change INTEGER, training_type TEXT, game_date TEXT)").run();
  const skills = JSON.stringify({ speed: 30, technique: 30, shooting: 30, passing: 30, heading: 30, defense: 30, vision: 30, creativity: 30, setPieces: 30, stamina: 30, strength: 30, goalkeeping: 5, experience: 5 });
  await db.prepare(
    `INSERT INTO players VALUES ('old', 'U', 'Jan', 'Starší', 18, 'MID', 30, 50, ?, '{}', NULL, '{}', 'active', 60),
                                ('new', 'U', 'Alex', 'Odchovanec', 18, 'MID', 30, 50, ?, '{}', NULL, '{"freshAcademyGraduate":true}', 'active', 60)`,
  ).bind(skills, skills).run();
});
afterAll(async () => { await miniflare.dispose(); });

describe("čerstvý odchovanec z akademie", () => {
  it("v létě, kdy vznikl, nedospívá; ostatní ano", async () => {
    const grown = await dospejMladeHrace(db, "U");
    expect(grown.map((v) => v.playerId)).toEqual(["old"]);
  });
});
