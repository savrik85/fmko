import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { applyEventEffects } from "./event-effects";
import { mapRowToMatchPlayer } from "../engine/lineup-loader";

/**
 * Letní soustředění „+5 vytrvalost pro všechny" dřív psalo do `skills.stamina`, jenže
 * zápasový engine i profil čtou výdrž z `physical`. Klub zaplatil 8 000 Kč a na hřišti
 * se nezměnilo nic. Pražská varianta měla typ `stamina`, který nikdo neobsloužil vůbec.
 */

let miniflare: Miniflare;
let db: D1Database;

const GAME_DATE = "2026-10-22T16:00:00.000Z";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.prepare(
    `CREATE TABLE players (
      id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      nickname TEXT, position TEXT NOT NULL, skills TEXT NOT NULL, personality TEXT NOT NULL,
      life_context TEXT NOT NULL, physical TEXT)`,
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM players").run();
});

async function addPlayer(id: string, teamId: string, stamina: { skills?: number; physical?: number | null }) {
  const skills: Record<string, number> = { speed: 50, technique: 50, shooting: 50, passing: 50, heading: 50, defense: 50 };
  if (stamina.skills !== undefined) skills.stamina = stamina.skills;
  const physical = stamina.physical === null
    ? null
    : JSON.stringify({ ...(stamina.physical !== undefined ? { stamina: stamina.physical } : {}), strength: 55 });
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, position, skills, personality, life_context, physical)
     VALUES (?, ?, 'Pepa', 'Vytrvalý', 'MID', ?, '{}', '{"condition":100,"morale":50}', ?)`,
  ).bind(id, teamId, JSON.stringify(skills), physical).run();
}

async function staminaOf(id: string) {
  const row = await db.prepare("SELECT skills, physical FROM players WHERE id = ?").bind(id)
    .first<{ skills: string; physical: string | null }>();
  return {
    skills: (JSON.parse(row!.skills) as { stamina?: number }).stamina,
    physical: row!.physical ? (JSON.parse(row!.physical) as { stamina?: number }).stamina : undefined,
  };
}

const camp = (type: string, value: number) => [{ type, value, description: `+${value} vytrvalost` }];

describe("letní soustředění zvedne výdrž, kterou čte zápas", () => {
  it("kompletní soustředění: +5 do physical i skills", async () => {
    await addPlayer("p1", "club", { skills: 60, physical: 60 });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    expect(await staminaOf("p1")).toEqual({ skills: 65, physical: 65 });
  });

  it("pražská varianta s typem stamina funguje stejně", async () => {
    await addPlayer("p1", "club", { skills: 40, physical: 40 });
    await applyEventEffects(db, "club", camp("stamina", 2), "Víkendový kemp", GAME_DATE);
    expect(await staminaOf("p1")).toEqual({ skills: 42, physical: 42 });
  });

  it("zápasový engine dostane výdrž i se soustředěním", async () => {
    await addPlayer("p1", "club", { skills: 60, physical: 60 });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    const row = await db.prepare("SELECT * FROM players WHERE id = 'p1'").first<Parameters<typeof mapRowToMatchPlayer>[0]>();
    expect(mapRowToMatchPlayer(row!).stamina).toBe(65);
  });

  it("vychází se z physical, kde výdrž drží pravdu, a obě kopie se srovnají", async () => {
    await addPlayer("p1", "club", { skills: 64, physical: 70 });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    expect(await staminaOf("p1")).toEqual({ skills: 75, physical: 75 });
  });

  it("škála končí na 100", async () => {
    await addPlayer("p1", "club", { skills: 98, physical: 98 });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    expect(await staminaOf("p1")).toEqual({ skills: 100, physical: 100 });
  });

  it("hráč bez physical dostane výdrž ze skills zvednutou v obou kopiích", async () => {
    await addPlayer("p1", "club", { skills: 50, physical: null });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    expect(await staminaOf("p1")).toEqual({ skills: 55, physical: 55 });
  });

  it("cizí klub se nemění", async () => {
    await addPlayer("p1", "club", { skills: 60, physical: 60 });
    await addPlayer("p2", "other", { skills: 60, physical: 60 });
    await applyEventEffects(db, "club", camp("stamina_boost", 5), "Kompletní soustředění", GAME_DATE);
    expect(await staminaOf("p2")).toEqual({ skills: 60, physical: 60 });
  });
});
