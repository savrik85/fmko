/**
 * Zápas s výsledkem, jehož následky nedoběhly (běh spadl uprostřed zpracování), dřív nikdo
 * nehledal. Pojistka ho teď najde podle chybějící značky a pustí na něj opravu.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const repairedIds: string[] = [];
vi.mock("../multiplayer/match-aftermath-repair", () => ({
  repairMatchAftermath: async (_db: unknown, matchId: string) => {
    repairedIds.push(matchId);
    return matchId === "half-with-stats" ? { ok: false, reason: "zápas už statistiky má" } : { ok: true };
  },
}));

import { repairHalfProcessedMatches } from "./league-round";

let miniflare: Miniflare;
let db: D1Database;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19) + "Z";

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY)").run();
  await db.prepare("CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, status TEXT, simulated_at TEXT, aftermath_done_at TEXT)").run();
  await db.batch([
    db.prepare("INSERT INTO season_calendar VALUES ('cal')"),
    // Od tohoto zápasu se značka zapisuje.
    db.prepare("INSERT INTO matches VALUES ('first-marked', 'cal', 'simulated', ?, ?)").bind(ago(3000), ago(3000)),
    db.prepare("INSERT INTO matches VALUES ('before-feature', 'cal', 'simulated', ?, NULL)").bind(ago(4000)),
    db.prepare("INSERT INTO matches VALUES ('half', 'cal', 'simulated', ?, NULL)").bind(ago(60)),
    db.prepare("INSERT INTO matches VALUES ('half-with-stats', 'cal', 'simulated', ?, NULL)").bind(ago(50)),
    db.prepare("INSERT INTO matches VALUES ('in-progress', 'cal', 'simulated', ?, NULL)").bind(ago(2)),
    db.prepare("INSERT INTO matches VALUES ('healthy', 'cal', 'simulated', ?, ?)").bind(ago(60), ago(59)),
    db.prepare("INSERT INTO matches VALUES ('friendly', NULL, 'simulated', ?, NULL)").bind(ago(60)),
    db.prepare("INSERT INTO matches VALUES ('unplayed', 'cal', 'lineups_open', NULL, NULL)"),
  ]);
});

afterAll(async () => { await miniflare.dispose(); });

describe("napůl zpracované zápasy", () => {
  it("opraví jen ligové zápasy bez značky, starší čtvrt hodiny a z doby, kdy se značka už zapisuje", async () => {
    const out = await repairHalfProcessedMatches(db);
    expect(repairedIds).toEqual(["half", "half-with-stats"]);
    expect(out).toEqual([
      { matchId: "half", repaired: true, reason: undefined },
      { matchId: "half-with-stats", repaired: false, reason: "zápas už statistiky má" },
    ]);
  });

  it("druhý běh už nic nezkouší", async () => {
    repairedIds.length = 0;
    expect(await repairHalfProcessedMatches(db)).toEqual([]);
    expect(repairedIds).toEqual([]);
  });
});
