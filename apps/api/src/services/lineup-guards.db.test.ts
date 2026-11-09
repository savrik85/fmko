/**
 * Uložení sestavy: neplatná pozice shodila engine a zápas zůstal neodehraný; sestavu šlo
 * měnit i po zamčení kola, dokud zápas nepřišel na řadu.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { saveLineup } from "./lineup";

let miniflare: Miniflare;
let db: D1Database;

const lineup = (calendarId: string, positions: string[]) => ({
  calendarId, formation: "4-4-2", tactic: "balanced",
  players: positions.map((matchPosition, i) => ({ playerId: `p${i}`, matchPosition })),
});
const VALID = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY, status TEXT)").run();
  await db.prepare("INSERT INTO season_calendar VALUES ('locked', 'lineup_locked'), ('played', 'simulated')").run();
});

afterAll(async () => { await miniflare.dispose(); });

describe("uložení sestavy, kontroly před zápisem", () => {
  it("neplatná pozice se odmítne", async () => {
    const positions = [...VALID];
    positions[9] = "LW";
    expect(await saveLineup(db, "t1", lineup("c1", positions))).toEqual({ ok: false, status: 400, error: "Sestava obsahuje neplatnou pozici" });
  });

  it("chybějící pozice se odmítne", async () => {
    const body = lineup("c1", VALID);
    (body.players[3] as { matchPosition?: string }).matchPosition = undefined;
    expect(await saveLineup(db, "t1", body)).toMatchObject({ ok: false, status: 400 });
  });

  it("zamčené i odehrané ligové kolo sestavu nepřijme", async () => {
    expect(await saveLineup(db, "t1", lineup("locked", VALID))).toEqual({ ok: false, status: 409, error: "Kolo se už hraje, sestavu teď změnit nejde." });
    expect(await saveLineup(db, "t1", lineup("played", VALID))).toEqual({ ok: false, status: 409, error: "Kolo je už odehrané, sestavu změnit nejde." });
  });
});
