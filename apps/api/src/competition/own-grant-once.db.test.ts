/**
 * Pravidlo grémia „žádost o dotaci jen jednou za sezónu“ (přání uživatele 2026-11-21).
 * Když platí, klub smí v sezóně podat jen jednu žádost o dotaci pro vlastní klub;
 * stažená žádost se nepočítá. Bez pravidla se žádá jako dřív.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { DEFAULT_RULES, PROPOSAL_KINDS, type CompetitionRules } from "./defaults";
import { isSelfGrant, ownGrantRequestBlocked } from "./grants";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB") as unknown as D1Database;
  await db.prepare(
    `CREATE TABLE competition_proposals (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, kind TEXT, payload TEXT,
       proposed_by_team_id TEXT, target_team_id TEXT, status TEXT NOT NULL DEFAULT 'open')`,
  ).run();
}, 30_000);
afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => { await db.prepare("DELETE FROM competition_proposals").run(); });

const rules = (on: number): CompetitionRules => ({ ...DEFAULT_RULES, grant_once_per_season: on } as CompetitionRules);
const request = (id: string, o: { team?: string; season?: number; status?: string; request?: boolean } = {}) => db.prepare(
  "INSERT INTO competition_proposals (id, league_id, season_number, kind, payload, proposed_by_team_id, status) VALUES (?, 'l', ?, 'grant', ?, ?, ?)",
).bind(id, o.season ?? 3, JSON.stringify({ grantKind: "equipment", amount: 20000, ...(o.request === false ? {} : { request: true }) }), o.team ?? "club", o.status ?? "rejected").run();

describe("žádost o dotaci jen jednou za sezónu", () => {
  it("je to návrh grémia, přepínač u generálního sekretáře, výchozí vypnuto", () => {
    expect(DEFAULT_RULES.grant_once_per_season).toBe(0);
    expect(PROPOSAL_KINDS.grant_once_per_season).toMatchObject({ rulesField: "grant_once_per_season", unit: "switch", gesce: "hospodarska", min: 0, max: 1 });
  });

  it("bez pravidla žádá klub kolikrát chce", async () => {
    await request("p1");
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(0) })).toBeNull();
  });

  it("s pravidlem druhá žádost v sezóně neprojde, i když první neprošla", async () => {
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(1) })).toBeNull();
    await request("p1", { status: "rejected" });
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(1) })).toMatch(/jednou za sezónu/);
  });

  it("stažená žádost, cizí klub, loňská sezóna a dotace pro ostatní se nepočítají", async () => {
    await request("p1", { status: "withdrawn" });
    await request("p2", { team: "jiny" });
    await request("p3", { season: 2 });
    await request("p4", { request: false });
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(1) })).toBeNull();
  });

  it("návrh s penězi pro vlastní klub je žádost, i když se tak nepodá (bezpečnostní kontrola)", () => {
    expect(isSelfGrant("club", { forOwnClub: true, kind: "equipment", targetTeamId: "club" })).toBe(true);
    expect(isSelfGrant("club", { forOwnClub: false, kind: "travel", targetTeamId: "club" })).toBe(true);
    expect(isSelfGrant("club", { forOwnClub: false, kind: "award", targetTeamId: "club" })).toBe(true);
    // Bezúročná půjčka není dotace, vrací se.
    expect(isSelfGrant("club", { forOwnClub: false, kind: "loan", targetTeamId: "club" })).toBe(false);
    expect(isSelfGrant("club", { forOwnClub: false, kind: "travel", targetTeamId: "jiny" })).toBe(false);
    expect(isSelfGrant("club", { forOwnClub: false, kind: "equipment", targetTeamId: null })).toBe(false);
  });

  it("příspěvek na cestovné pro sebe se do limitu počítá, půjčka pro sebe ne", async () => {
    await db.prepare(
      "INSERT INTO competition_proposals (id, league_id, season_number, kind, payload, proposed_by_team_id, target_team_id, status) VALUES ('l1', 'l', 3, 'grant', ?, 'club', 'club', 'rejected')",
    ).bind(JSON.stringify({ grantKind: "loan", amount: 20000, targetTeamId: "club" })).run();
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(1) })).toBeNull();
    await db.prepare(
      "INSERT INTO competition_proposals (id, league_id, season_number, kind, payload, proposed_by_team_id, target_team_id, status) VALUES ('t1', 'l', 3, 'grant', ?, 'club', 'club', 'passed')",
    ).bind(JSON.stringify({ grantKind: "travel", amount: 20000, targetTeamId: "club" })).run();
    expect(await ownGrantRequestBlocked(db, { teamId: "club", seasonNumber: 3, rules: rules(1) })).toMatch(/jednou za sezónu/);
  });
});
