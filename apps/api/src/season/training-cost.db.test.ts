/**
 * Náklad na trénink se strhává jen za trénink, který proběhl. V den zápasu trénink odpadá
 * (daily-tick.ts), takže se za něj ani neplatí: dřív se náklad strhl i tak.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { chargeTrainingCost, teamPlaysOnDay } from "./team-day";

let mf: Miniflare;
let db: D1Database;

/** Úterý a čtvrtek: výchozí rozpis dvou tréninků týdně. */
const TUESDAY = "2026-10-27T03:00:00.000Z";
const WEDNESDAY = "2026-10-28T03:00:00.000Z";
const THURSDAY = "2026-10-29T03:00:00.000Z";
const SATURDAY = "2026-10-31T03:00:00.000Z";

const team = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, user_id: "u-1", training_type: "conditioning", training_sessions: 2, training_days: null, training_plan: null,
  village_size: "village", ...extra,
});

async function costs(teamId: string): Promise<number[]> {
  const res = await db.prepare("SELECT amount FROM transactions WHERE team_id = ? AND type = 'training_cost' ORDER BY rowid").bind(teamId).all<{ amount: number }>();
  return res.results.map((r) => r.amount);
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const village = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' LIMIT 1").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-1', 'a@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg', 'season-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')"),
    ...["home", "away", "idle", "cup"].map((id) => db.prepare(
      "INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES (?, 'u-1', ?, ?, 50000, 50, ?, 'lg')",
    ).bind(id, village!.id, `Klub ${id}`, TUESDAY)),
    // Ligové kolo ve čtvrtek v 18:00 v Praze
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('cal-1', 'lg', 1, 1, 'thursday', '2026-10-29T17:00:00.000Z', 'scheduled')"),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES ('m-1', 'lg', 'cal-1', 1, 'home', 'away', 'scheduled')"),
  ]);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("náklad na trénink", () => {
  it("v tréninkový den bez zápasu se platí", async () => {
    expect(await teamPlaysOnDay(db, "home", "2026-10-27")).toBe(false);
    expect(await chargeTrainingCost(db, team("home"), TUESDAY)).toBe("charged");
    expect(await costs("home")).toEqual([-400]);
  });

  it("v den zápasu trénink odpadá a neplatí se, domácí ani hosté", async () => {
    expect(await teamPlaysOnDay(db, "home", "2026-10-29")).toBe(true);
    expect(await teamPlaysOnDay(db, "away", "2026-10-29")).toBe(true);
    expect(await chargeTrainingCost(db, team("home"), THURSDAY)).toBe("match_day");
    expect(await chargeTrainingCost(db, team("away"), THURSDAY)).toBe("match_day");
    expect(await costs("home")).toEqual([-400]);
    expect(await costs("away")).toEqual([]);
  });

  it("tým, který ten den nehraje, platí dál", async () => {
    expect(await chargeTrainingCost(db, team("idle"), THURSDAY)).toBe("charged");
    expect(await costs("idle")).toEqual([-400]);
  });

  it("mimo tréninkový den a o víkendu se neplatí (víkendový trénink je zdarma jako dřív)", async () => {
    expect(await chargeTrainingCost(db, team("idle"), WEDNESDAY)).toBe("no_training");
    expect(await chargeTrainingCost(db, team("idle", { training_days: "[6]" }), SATURDAY)).toBe("no_training");
    // Lidský klub bez nastaveného tréninku netrénuje
    expect(await chargeTrainingCost(db, team("idle", { training_type: null }), TUESDAY)).toBe("no_training");
    expect(await costs("idle")).toEqual([-400]);
  });

  it("pohárový zápas ruší trénink i platbu stejně jako ligový", async () => {
    await db.batch([
      db.prepare("INSERT INTO cup_competitions (id, season_number, name, total_rounds) VALUES ('cup-1', 1, 'Pohár', 3)"),
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength) VALUES ('ct-1', 'cup-1', 'cup', 'Klub cup', 40)"),
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength) VALUES ('ct-2', 'cup-1', NULL, 'Velkoklub', 70)"),
      db.prepare("INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at) VALUES ('cm-1', 'cup-1', 1, 0, 'ct-1', 'ct-2', '2026-10-27T11:00:00.000Z')"),
    ]);
    expect(await chargeTrainingCost(db, team("cup"), TUESDAY)).toBe("match_day");
    expect(await chargeTrainingCost(db, team("cup"), THURSDAY)).toBe("charged");
    expect(await costs("cup")).toEqual([-400]);
  });
});
