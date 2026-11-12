/**
 * Automatická sestava (U21 a áčko bez uložené sestavy) se před zápasem postaví z hráčů,
 * kteří opravdu nastoupí. Na produ 3.–12. 11. 2026 hrálo v U21 mimo svou pozici 5,7 %
 * hráčů v základu: automat držel 4-4-2 a díry po zraněných plnil kýmkoli.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { buildMatchPlayers, createAutoLineup } from "./match-runner";

let miniflare: Miniflare;
let db: D1Database;
const TEAM = "u21-club";
const SKILLS = { speed: 40, technique: 40, shooting: 40, passing: 40, heading: 40, defense: 40, stamina: 40, strength: 40, vision: 40, creativity: 40, setPieces: 40, goalkeeping: 20 };

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  const village = await db.prepare("SELECT id FROM villages LIMIT 1").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, team_type, game_date) VALUES (?, 'ai', ?, 'Jiskra U21', 50000, 50, 'u21', '2026-11-12T16:00:00.000Z')")
      .bind(TEAM, village!.id),
  ]);
}, 180_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM lineups"),
    db.prepare("DELETE FROM injuries"),
    db.prepare("DELETE FROM players"),
  ]);
});

async function addPlayers(spec: Record<string, number[]>) {
  const statements = Object.entries(spec).flatMap(([position, ratings]) => ratings.map((rating, i) =>
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Jan', ?, 19, ?, ?, ?, ?, ?, ?, '{}', 'active')`,
    ).bind(
      `${position}-${i}`, TEAM, `${position}${i}`, position, rating, JSON.stringify(SKILLS),
      JSON.stringify({ height: 180, weight: 75, preferredFoot: "right" }), JSON.stringify({ workRate: 60 }),
      JSON.stringify({ morale: 60, condition: 90 }),
    )));
  await db.batch(statements);
}
const injure = (playerId: string) => db.prepare(
  "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total) VALUES (?, ?, ?, 'sval', 'natažený sval', 'lehke', 5, 5)",
).bind(`inj-${playerId}`, playerId, TEAM).run();

async function playedLineup() {
  await createAutoLineup(db, TEAM, "cal-1");
  const row = await db.prepare("SELECT formation, players_data, is_auto FROM lineups WHERE team_id = ? AND calendar_id = 'cal-1'")
    .bind(TEAM).first<{ formation: string; players_data: string; is_auto: number }>();
  const built = await buildMatchPlayers(db, TEAM, row!.players_data, 0, { autoFormation: row!.formation });
  const starters = built.players.slice(0, 11).map((p) => ({ id: built.idMap.get(p.id)!, natural: p.position, slot: p.matchPosition ?? p.position }));
  return { row: row!, built, starters };
}

describe("automatická sestava před zápasem", () => {
  it("uloží formaci, do které kádr sedí, ne pevnou 4-4-2", async () => {
    await addPlayers({ GK: [40], DEF: [50, 48, 46, 44, 42], MID: [55, 52, 50], FWD: [60, 58] });
    const { row, starters, built } = await playedLineup();
    expect(row).toMatchObject({ formation: "5-3-2", is_auto: 1 });
    expect(built.formation).toBe("5-3-2");
    expect(starters).toHaveLength(11);
    expect(starters.filter((p) => p.natural !== p.slot)).toEqual([]);
  });

  it("po zranění přestaví formaci z dostupných, místo aby díru zaplnil hráčem z jiné řady", async () => {
    // Na 4-4-2 kádr přesně sedí. Zraní se záložník: zbylí hráči dají 5-3-2 s každým na svém místě.
    await addPlayers({ GK: [40, 30], DEF: [50, 48, 46, 44, 43], MID: [55, 52, 51, 49], FWD: [60, 58] });
    await injure("MID-2");
    const { row, built, starters } = await playedLineup();
    expect(row.formation).toBe("4-4-2");
    expect(built.formation).toBe("5-3-2");
    expect(starters.some((p) => p.id === "MID-2")).toBe(false);
    expect(starters.filter((p) => p.natural !== p.slot)).toEqual([]);
    // Náhradní brankář zůstává na lavičce.
    expect(starters.filter((p) => p.natural === "GK")).toEqual([{ id: "GK-0", natural: "GK", slot: "GK" }]);
  });

  it("sestavu od trenéra runner nepřestavuje: bez příznaku automatu zůstává, jak je uložená", async () => {
    await addPlayers({ GK: [40], DEF: [50, 48, 46, 44, 42], MID: [55, 52, 50], FWD: [60, 58] });
    // Trenér schválně postavil pátého obránce do zálohy ve 4-4-2.
    const picks = [
      { playerId: "GK-0", matchPosition: "GK" },
      ...["DEF-0", "DEF-1", "DEF-2", "DEF-3"].map((playerId) => ({ playerId, matchPosition: "DEF" })),
      ...["MID-0", "MID-1", "MID-2", "DEF-4"].map((playerId) => ({ playerId, matchPosition: "MID" })),
      ...["FWD-0", "FWD-1"].map((playerId) => ({ playerId, matchPosition: "FWD" })),
    ];
    const built = await buildMatchPlayers(db, TEAM, JSON.stringify(picks), 0, {});
    expect(built.formation).toBeNull();
    const moved = built.players.slice(0, 11).find((p) => built.idMap.get(p.id) === "DEF-4");
    expect(moved?.matchPosition).toBe("MID");
  });
});
