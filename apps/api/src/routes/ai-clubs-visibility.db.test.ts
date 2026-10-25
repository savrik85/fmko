/**
 * AI klub se hráčům ukazuje jako každý jiný klub. Jediný rozdíl je štítek „(AI)“
 * za jménem trenéra, který web přidá podle příznaku `coachIsAi`.
 *
 * Skutečná D1 (Miniflare, všechny migrace): soupiska ligy pro šipky na profilu klubu,
 * profil trenéra, síň slávy a klubový web, který dřív hledal trenéra přes
 * `t.user_id = m.user_id` a AI klubu tak ukázal trenéra úplně jiného AI klubu.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { teamsRouter } from "./teams";
import { clubWebsiteRouter } from "./club-website";
import { gameRouter } from "./game";
import competitionRouter from "./competition";
import type { Bindings } from "../index";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/teams", teamsRouter);
app.route("/api/teams", clubWebsiteRouter);
app.route("/api", gameRouter);
app.route("/api", competitionRouter);

let mf: Miniflare;
let env: Bindings;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  const db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }

  const villages = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 4")
    .all<{ id: string }>();
  const [humanVillage, aiVillageB, aiVillageC, otherVillage] = villages.results.map((v) => v.id);

  await db.batch([
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-test', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name) VALUES ('league-test', 'season-test', 'Prachatice', 'Okresní přebor Prachatice')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('league-other', 'season-test', 'Prachatice', 'III. třída Prachatice', 'okresni_soutez')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, league_id) VALUES ('team-human', 'user-human', ?, 'SK Lidé', 'league-test')").bind(humanVillage),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, league_id) VALUES ('team-ai-b', 'ai', ?, 'TJ Stroje', 'league-test')").bind(aiVillageB),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, league_id) VALUES ('team-ai-c', 'ai', ?, 'Sokol Automat', 'league-test')").bind(aiVillageC),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, league_id) VALUES ('team-ai-other', 'ai', ?, 'FK Jinde', 'league-other')").bind(otherVillage),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, team_type, parent_team_id) VALUES ('team-ai-b-u21', 'ai', ?, 'TJ Stroje U21', 'u21', 'team-ai-b')").bind(aiVillageB),
    // Trenér cizího AI klubu je v tabulce první: starý dotaz přes user_id by vzal právě jeho.
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-ai-other', 'ai', 'team-ai-other', 'Otakar Odjinud', 'hospodsky', '{}')"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-human', 'user-human', 'team-human', 'Karel Lidský', 'hospodsky', '{}')"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-ai-b', 'ai', 'team-ai-b', 'Bohumil Strojový', 'byvaly_hrac', '{}')"),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES ('mgr-ai-c', 'ai', 'team-ai-c', 'Cyril Automat', 'mistni_ucitel', '{}')"),
    db.prepare("INSERT INTO matches (id, league_id, home_team_id, away_team_id, round, status) VALUES ('match-next', 'league-test', 'team-ai-b', 'team-human', 1, 'scheduled')"),
  ]);
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

async function getJson(path: string): Promise<any> {
  const res = await app.request(path, {}, env);
  expect(res.status).toBe(200);
  return res.json();
}

describe("AI kluby v soupisce ligy", () => {
  it("šipky na profilu klubu procházejí celou ligu včetně AI klubů, cizí liga ne", async () => {
    const teams = await getJson("/api/teams/team-human/league-teams") as Array<{ id: string }>;
    expect(teams.map((t) => t.id).sort()).toEqual(["team-ai-b", "team-ai-c", "team-human"]);
  });

  it("soupiska ligy jde otevřít i z AI klubu", async () => {
    const teams = await getJson("/api/teams/team-ai-c/league-teams") as Array<{ id: string }>;
    expect(teams).toHaveLength(3);
  });
});

describe("příznak coachIsAi u jména trenéra", () => {
  it("profil trenéra AI klubu má coachIsAi, lidský ne", async () => {
    const ai = await getJson("/api/teams/team-ai-b/manager");
    expect(ai.name).toBe("Bohumil Strojový");
    expect(ai.coachIsAi).toBe(true);
    const human = await getJson("/api/teams/team-human/manager");
    expect(human.name).toBe("Karel Lidský");
    expect(human.coachIsAi).toBe(false);
  });

  it("U21 AI klubu vlastního trenéra nemá a otevřením profilu žádný nevznikne (jako U21 lidského klubu)", async () => {
    expect(await getJson("/api/teams/team-ai-b-u21/manager")).toBeNull();
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM managers WHERE team_id = 'team-ai-b-u21'").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("síň slávy ukazuje AI kluby s příznakem u trenéra", async () => {
    const { entries } = await getJson("/api/hall-of-fame") as {
      entries: Array<{ teamId: string; managerName: string | null; coachIsAi: boolean }>;
    };
    const ai = entries.find((e) => e.teamId === "team-ai-b");
    expect(ai?.managerName).toBe("Bohumil Strojový");
    expect(ai?.coachIsAi).toBe(true);
    expect(entries.find((e) => e.teamId === "team-human")?.coachIsAi).toBe(false);
  });
});

describe("soutěž: disciplinárka nabízí AI kluby s příznakem u trenéra", () => {
  it("kluby soutěže mají u jména trenéra coachIsAi podle jeho řádku v managers", async () => {
    const { targets } = await getJson("/api/competition/league-test/discipline") as {
      targets: Array<{ teamId: string; managerName: string | null; coachIsAi: boolean }>;
    };
    const ai = targets.find((t) => t.teamId === "team-ai-b");
    expect(ai?.managerName).toBe("Bohumil Strojový");
    expect(ai?.coachIsAi).toBe(true);
    expect(targets.find((t) => t.teamId === "team-human")?.coachIsAi).toBe(false);
  });
});

describe("klubový web ukazuje trenéra právě tohohle klubu", () => {
  it("hlavní stránka webu AI klubu: jeho vlastní AI trenér, ne trenér jiného AI klubu", async () => {
    const data = await getJson("/api/teams/team-ai-b/website");
    expect(data.manager?.name).toBe("Bohumil Strojový");
    expect(data.manager?.coachIsAi).toBe(true);
  });

  it("hlavní stránka webu lidského klubu: lidský trenér bez příznaku", async () => {
    const data = await getJson("/api/teams/team-human/website");
    expect(data.manager?.name).toBe("Karel Lidský");
    expect(data.manager?.coachIsAi).toBe(false);
  });

  it("podstránka trenéra AI klubu", async () => {
    const page = await getJson("/api/teams/team-ai-c/website/coach");
    expect(page.coach?.name).toBe("Cyril Automat");
    expect(page.coach?.coachIsAi).toBe(true);
  });

  it("zpravodaj k zápasu: u obou týmů trenér daného klubu", async () => {
    const page = await getJson("/api/teams/team-human/website/program");
    expect(page.home?.id).toBe("team-ai-b");
    expect(page.home?.coachName).toBe("Bohumil Strojový");
    expect(page.home?.coachIsAi).toBe(true);
    expect(page.away?.coachName).toBe("Karel Lidský");
    expect(page.away?.coachIsAi).toBe(false);
  });
});
