import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { simulateMatch } from "../engine/simulation";
import { createRng } from "../generators/rng";
import { createTeam } from "../engine/test-helpers/lineup";
import type { MatchResult, TeamSetup } from "../engine/types";
import { postMatchPlayers, postMatchPlayerStatements } from "./post-match-players";

/**
 * Zápis po zápase pro každého, kdo nastoupil.
 *
 * Na produ v kole 1. 10. měl záznam o únavě 371 z 372 hráčů, kteří odehráli 90 minut,
 * a 0 ze 70 vystřídaných. Runnery procházely jen konečnou jedenáctku a střídající
 * neměli v condition_log nic, protože kondici před zápasem znala jen základní sestava.
 */

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, life_context TEXT)");
  await db.exec(
    "CREATE TABLE condition_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, team_id TEXT NOT NULL, old_value INTEGER NOT NULL, new_value INTEGER NOT NULL, delta INTEGER NOT NULL, source TEXT NOT NULL, description TEXT, game_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
});

afterAll(async () => {
  await miniflare.dispose();
});

/** Engine ID → DB ID pro tým, jak to dělá buildMatchPlayers. */
function idMapOf(team: TeamSetup): Map<number, string> {
  return new Map([...team.lineup, ...team.subs].map((p) => [p.id, `p${p.id}`]));
}

async function seed(teamId: string, team: TeamSetup) {
  await db.batch([...team.lineup, ...team.subs].map((p) =>
    db.prepare("INSERT INTO players VALUES (?, ?, ?)").bind(`p${p.id}`, teamId, JSON.stringify({ condition: 100, morale: 50 })),
  ));
}

async function lifeOf(id: number): Promise<{ condition: number; morale: number }> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(`p${id}`).first<{ life_context: string }>();
  return JSON.parse(row!.life_context);
}

async function logOf(id: number) {
  return (await db.prepare("SELECT team_id, old_value, new_value, source FROM condition_log WHERE player_id = ?")
    .bind(`p${id}`).all<{ team_id: string; old_value: number; new_value: number; source: string }>()).results;
}

describe("zápis kondice a morálky po zápase", () => {
  let home: TeamSetup;
  let away: TeamSetup;
  let subbedOff: number;
  let subIn: number;
  let unused: number;
  let result: MatchResult;

  beforeEach(async () => {
    await db.exec("DELETE FROM players");
    await db.exec("DELETE FROM condition_log");
    home = createTeam(1, "Domácí");
    away = createTeam(2, "Hosté");
    subbedOff = home.lineup[9].id;
    subIn = home.subs[2].id;
    unused = home.subs[0].id;
    home.plan = [
      { id: "s1", fromMinute: 60, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: subbedOff, inPlayerId: subIn } },
    ];
    await seed("home", home);
    await seed("away", away);
    const homeIds = idMapOf(home);
    const awayIds = idMapOf(away);
    result = simulateMatch(createRng(4242), { home, away, weather: "sunny", isHomeAdvantage: false });
    const played = postMatchPlayers(result, { teamId: "home", idMap: homeIds }, { teamId: "away", idMap: awayIds });
    await db.batch(postMatchPlayerStatements(db, played, { source: "match", description: "Zápas" }));
  });

  it("vystřídaný hráč odejde ze zápasu unavený a má záznam v condition_log", async () => {
    expect(result.homeLineup.some((p) => p.id === subbedOff)).toBe(false);
    const life = await lifeOf(subbedOff);
    expect(life.condition).toBeLessThan(100);
    const log = await logOf(subbedOff);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ team_id: "home", old_value: 100, new_value: life.condition, source: "match" });
  });

  it("střídající z lavičky má záznam v condition_log s kondicí před zápasem", async () => {
    const life = await lifeOf(subIn);
    expect(life.condition).toBeLessThan(100);
    const log = await logOf(subIn);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ old_value: 100, new_value: life.condition });
  });

  it("kdo dohrál, dostane únavu jako dřív", async () => {
    const stayer = home.lineup[1].id;
    expect((await lifeOf(stayer)).condition).toBeLessThan(100);
    expect(await logOf(stayer)).toHaveLength(1);
  });

  it("náhradník, který nenastoupil, zůstane beze změny", async () => {
    expect(await lifeOf(unused)).toEqual({ condition: 100, morale: 50 });
    expect(await logOf(unused)).toHaveLength(0);
  });

  it("každý z výsledku zápasu, kdo nastoupil, má záznam", async () => {
    const appeared = [...result.homeParticipants, ...result.awayParticipants];
    // 22 v základu + plánované střídání (a případně další, které udělal asistent)
    expect(appeared.length).toBeGreaterThanOrEqual(23);
    for (const p of appeared) {
      expect(await logOf(p.id), `hráč ${p.id}`).toHaveLength(1);
    }
  });
});

describe("velkoklub v poháru", () => {
  it("bez týmu v players se jeho hráči nezapisují", () => {
    const home = createTeam(1, "Domácí");
    const away = createTeam(2, "Velkoklub");
    const r = simulateMatch(createRng(7), { home, away, weather: "sunny", isHomeAdvantage: false });
    const played = postMatchPlayers(r, { teamId: "home", idMap: idMapOf(home) }, { teamId: null, idMap: idMapOf(away) });
    expect(played.every((p) => p.teamId === "home")).toBe(true);
    expect(played.length).toBe(r.homeParticipants.length);
  });
});

/**
 * Únavu po zápase zapisují čtyři runnery. Kdo z nich obejde sdílený zápis a projde
 * zase jen `result.homeLineup`, pošle vystřídané ze zápasu odpočaté.
 */
const RUNNERS = [
  { label: "ligový", file: "multiplayer/match-runner.ts" },
  { label: "pohárový", file: "cup/cup.ts" },
  { label: "přátelácký", file: "multiplayer/friendly-runner.ts" },
  { label: "turnajový", file: "tournament/match.ts" },
];

describe.each(RUNNERS)("$label runner", ({ file }) => {
  const source = readFileSync(join(__dirname, "..", file), "utf-8");

  it("zapisuje kondici a morálku přes sdílený zápis všech, kdo nastoupili", () => {
    expect(source.includes("postMatchPlayers(")).toBe(true);
    expect(source.includes("postMatchPlayerStatements(")).toBe(true);
  });

  it("neprochází pro zápis jen konečnou jedenáctku", () => {
    expect(/\.\.\.result\.homeLineup|\.\.\.homePost\b/.test(source)).toBe(false);
  });
});
