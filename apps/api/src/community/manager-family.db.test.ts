/**
 * Bratři mezi trenéry: profil ukáže bráchu s jeho klubem, Zpravodaj dostane větu
 * o bratrském derby i u dvojice, která spolu nemá jediný záznam ve vztazích.
 *
 * Skutečná D1 (Miniflare, všechny migrace).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { familyOfTeam, familyLineBetweenTeams } from "./manager-family";
import { getRelationPromptContext } from "./manager-relations";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  const village = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 1")
    .first<{ id: string }>();
  const v = village!.id;

  await db.batch([
    ...["user-adam", "user-michal", "user-other"].map((u) =>
      db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(u, `${u}@example.test`)),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name) VALUES ('team-adam', 'user-adam', ?, 'FK Geomapping')").bind(v),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name) VALUES ('team-michal', 'user-michal', ?, 'FC Kávoviny')").bind(v),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, team_type, parent_team_id) VALUES ('team-michal-u21', 'user-michal', ?, 'FC Kávoviny U21', 'u21', 'team-michal')").bind(v),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name) VALUES ('team-other', 'user-other', ?, 'SK Cizí')").bind(v),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-adam', 'user-adam', 'team-adam', 'Adam Novotný', 'hospodsky', '{}')"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-michal', 'user-michal', 'team-michal', 'Michal Novotný', 'hospodsky', '{}')"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-other', 'user-other', 'team-other', 'Karel Cizí', 'hospodsky', '{}')"),
    db.prepare("INSERT INTO manager_family (user_a_id, user_b_id, kind) VALUES ('user-adam', 'user-michal', 'brother')"),
  ]);
}, 60_000);

afterAll(async () => { await mf?.dispose(); });

describe("rodina mezi trenéry", () => {
  it("profil ukáže bráchu s jeho klubem z obou stran, U21 ne", async () => {
    expect(await familyOfTeam(db, "team-adam")).toEqual([
      { kind: "brother", label: "Bratr", managerName: "Michal Novotný", teamId: "team-michal", teamName: "FC Kávoviny" },
    ]);
    expect((await familyOfTeam(db, "team-michal")).map((f) => f.managerName)).toEqual(["Adam Novotný"]);
    expect(await familyOfTeam(db, "team-other")).toEqual([]);
  });

  it("Zpravodaj ví o bratrech, i když spolu kluby nemají žádný vztah", async () => {
    expect(await familyLineBetweenTeams(db, "team-michal", "team-adam"))
      .toBe("Trenéři Michal Novotný a Adam Novotný jsou bratři");
    const ctx = await getRelationPromptContext(db, "team-adam", "team-michal");
    expect(ctx?.family).toBe("Trenéři Adam Novotný a Michal Novotný jsou bratři");
    expect(ctx?.moments).toEqual([]);
  });

  it("cizí dvojice bez vztahu nemá žádný kontext", async () => {
    expect(await familyLineBetweenTeams(db, "team-adam", "team-other")).toBeNull();
    expect(await getRelationPromptContext(db, "team-adam", "team-other")).toBeNull();
  });
});
