import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { simulateMatch } from "../engine/simulation";
import { createRng } from "../generators/rng";
import { createPlayer, createTeam } from "../engine/test-helpers/lineup";
import type { EquipmentMods, MatchPlayer, MatchResult, TeamSetup } from "../engine/types";
import { postMatchPlayers, postMatchPlayerStatements } from "./post-match-players";

/**
 * Předzápasové úpravy morálky platí jen pro simulaci.
 *
 * Match runner před výkopem přičítá šatny a kotel, domácí výhodu z fanoušků (až +10),
 * motivaci trenéra (+1 až +6) a hostům pod kotlem za brankou odečítá zastrašení (až −6).
 * Zápis po zápase dřív uložil výslednou morálku i s tím vším, takže domácí s kotlem
 * stoupali v morálce každé domácí kolo a hosté pod kotlem trvale ztráceli.
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

beforeEach(async () => {
  await db.exec("DELETE FROM players");
  await db.exec("DELETE FROM condition_log");
});

async function insertPlayer(id: string, teamId: string, morale: number) {
  await db.prepare("INSERT INTO players VALUES (?, ?, ?)")
    .bind(id, teamId, JSON.stringify({ condition: 100, morale })).run();
}

async function moraleOf(id: string): Promise<number> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(id).first<{ life_context: string }>();
  return JSON.parse(row!.life_context).morale;
}

type Participants = Pick<MatchResult, "homeParticipants" | "awayParticipants" | "kickoffCondition" | "kickoffMorale">;

/** Výsledek zápasu jen s tím, co potřebuje zápis: kdo hrál, s čím šel do zápasu a s čím skončil. */
function fakeResult(home: MatchPlayer[], away: MatchPlayer[], kickoffMorale: Record<number, number>): Participants {
  const kickoffCondition: Record<number, number> = {};
  for (const p of [...home, ...away]) kickoffCondition[p.id] = 100;
  return { homeParticipants: home, awayParticipants: away, kickoffCondition, kickoffMorale };
}

async function persist(result: Participants) {
  const played = postMatchPlayers(result,
    { teamId: "home", idMap: new Map([...result.homeParticipants].map((p) => [p.id, `p${p.id}`])) },
    { teamId: "away", idMap: new Map([...result.awayParticipants].map((p) => [p.id, `p${p.id}`])) });
  await db.batch(postMatchPlayerStatements(db, played, { source: "match", description: "Zápas" }));
}

function withMorale(id: number, morale: number): MatchPlayer {
  return { ...createPlayer(id, "MID"), morale, condition: 90 };
}

describe("uložená morálka po zápase", () => {
  it("domácím zůstane jen změna z průběhu zápasu, ne bonus kotle, fanoušků a trenéra", async () => {
    await insertPlayer("p1", "home", 50);
    // Výkop: 50 + 16 předzápasového bonusu. Dva góly v průběhu zápasu: +4.
    await persist(fakeResult([withMorale(1, 70)], [], { 1: 66 }));
    expect(await moraleOf("p1")).toBe(54);
  });

  it("hostům pod kotlem zůstane jen změna z průběhu zápasu, zastrašení ne", async () => {
    await insertPlayer("p2", "away", 50);
    // Výkop: 50 − 6 zastrašení. Inkasované góly: −5.
    await persist(fakeResult([], [withMorale(2, 39)], { 2: 44 }));
    expect(await moraleOf("p2")).toBe(45);
  });

  it("incidentní postih (neprávem obviněný) se nepropíše", async () => {
    await insertPlayer("p3", "home", 60);
    // Výkop: 60 − 8 za obvinění, v zápase +2.
    await persist(fakeResult([withMorale(3, 54)], [], { 3: 52 }));
    expect(await moraleOf("p3")).toBe(62);
  });

  it("změna se přičte k morálce v DB, nepřepíše, co po zápase připsalo derby nebo místní senzace", async () => {
    // Načteno 50, mezitím místní senzace +5 celému kádru (village-processor).
    await insertPlayer("p4", "home", 55);
    await persist(fakeResult([withMorale(4, 70)], [], { 4: 66 }));
    expect(await moraleOf("p4")).toBe(59);
  });

  it("uložená morálka zůstane v mezích 0–100", async () => {
    await insertPlayer("p5", "home", 98);
    await insertPlayer("p6", "away", 2);
    await persist(fakeResult([withMorale(5, 80)], [withMorale(6, 30)], { 5: 75, 6: 35 }));
    expect(await moraleOf("p5")).toBe(100);
    expect(await moraleOf("p6")).toBe(0);
  });
});

describe("morálka při výkopu", () => {
  it("nese i bonus z vybavení, který engine přičte až uvnitř simulace", () => {
    const home = createTeam(1, "Domácí");
    const equipment: EquipmentMods = {
      techniqueMod: 0, gkBonus: 0, injurySeverityMod: 0, conditionDrainMod: 0, moraleMod: 5,
    };
    const starter = home.lineup[5].id;
    const bench = home.subs[0].id;
    const r = simulateMatch(createRng(3), {
      home, away: createTeam(2, "Hosté"), weather: "sunny", isHomeAdvantage: false, homeEquipment: equipment,
    });
    expect(r.kickoffMorale[starter]).toBe(55);
    // Lavičce engine bonus z vybavení nepřičítá.
    expect(r.kickoffMorale[bench]).toBe(50);
  });
});

describe("celý zápas", () => {
  it("předzápasový bonus +16 se do uložené morálky nepropíše nikomu, kdo nastoupil", async () => {
    const home: TeamSetup = createTeam(1, "Domácí");
    const away: TeamSetup = createTeam(2, "Hosté");
    home.plan = [
      { id: "s1", fromMinute: 55, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId: home.lineup[9].id, inPlayerId: home.subs[2].id } },
    ];
    for (const p of [...home.lineup, ...home.subs, ...away.lineup, ...away.subs]) {
      await insertPlayer(`p${p.id}`, p.id < 200 ? "home" : "away", 50);
    }
    const homeIds = new Map([...home.lineup, ...home.subs].map((p) => [p.id, `p${p.id}`]));
    const awayIds = new Map([...away.lineup, ...away.subs].map((p) => [p.id, `p${p.id}`]));
    // Jako match runner: šatny + kotel, domácí výhoda a trenér, i lavičce.
    for (const p of [...home.lineup, ...home.subs]) p.morale += 16;

    const r = simulateMatch(createRng(4242), { home, away, weather: "sunny", isHomeAdvantage: true });
    const played = postMatchPlayers(r, { teamId: "home", idMap: homeIds }, { teamId: "away", idMap: awayIds });
    await db.batch(postMatchPlayerStatements(db, played, { source: "match", description: "Zápas" }));

    expect(r.homeParticipants.length).toBeGreaterThanOrEqual(12);
    for (const p of r.homeParticipants) {
      expect(r.kickoffMorale[p.id], `hráč ${p.id}`).toBe(66);
      // Dřív se uložilo p.morale, tedy i s bonusem +16.
      expect(await moraleOf(`p${p.id}`), `hráč ${p.id}`).toBe(Math.max(0, Math.min(100, p.morale - 16)));
    }
    for (const p of r.awayParticipants) {
      expect(await moraleOf(`p${p.id}`), `hráč ${p.id}`).toBe(Math.max(0, Math.min(100, p.morale)));
    }
  });
});

/** Žádný runner nesmí morálku po zápase zapsat natvrdo hodnotou z paměti, i s předzápasovými úpravami. */
const RUNNERS = ["multiplayer/match-runner.ts", "cup/cup.ts", "multiplayer/friendly-runner.ts", "tournament/match.ts"];

describe.each(RUNNERS)("%s", (file) => {
  it("zapisuje morálku jen jako změnu k uložené hodnotě", () => {
    const source = readFileSync(join(__dirname, "..", file), "utf-8");
    expect(/'\$\.morale', \?/.test(source)).toBe(false);
  });
});
