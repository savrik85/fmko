/**
 * Kurz zaměstnance: kontrola „už je na kurzu“ je součástí zápisu a platí se až po něm.
 * Dřív dva souběžné požadavky (dvojklik) prošly oba a kurz se zaplatil dvakrát.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { startStaffCourse } from "./staff";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function fees(): Promise<number[]> {
  const res = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'club' AND type = 'course_fee' ORDER BY rowid").all<{ amount: number }>();
  return res.results.map((r) => r.amount);
}

/** Každá role smí být v klubu jen jednou. */
async function addStaff(id: string, role: string, coaching: number): Promise<void> {
  await db.prepare(
    `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, coaching, weekly_wage, signing_fee, avatar)
     VALUES (?, 'Prachatice', 'club', ?, ?, 'Karel', ?, 40, ?, 500, 1000, '{}')`,
  ).bind(id, role, role, `Novák${id}`, coaching).run();
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
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('club', 'u-1', ?, 'Jiskra', 200000, 50, ?)").bind(village!.id, GAME_DATE),
  ]);
  await addStaff("s-1", "asistent", 8);
  await addStaff("s-2", "maser", 8);
  await addStaff("s-3", "lekar", 20);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("kurz zaměstnance", () => {
  it("dva souběžné požadavky zaplatí kurz jen jednou", async () => {
    const results = await Promise.all([
      startStaffCourse(db, "club", "s-1", "coaching"),
      startStaffCourse(db, "club", "s-1", "coaching"),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    const failed = results.find((r) => !r.ok);
    expect(failed).toMatchObject({ ok: false, status: 409, error: "Zaměstnanec už je na kurzu." });
    // (5 + 8) × 1400 Kč, jednou
    expect(await fees()).toEqual([-18200]);
    const row = await db.prepare("SELECT course_attribute, course_points, course_weeks_remaining FROM staff_members WHERE id = 's-1'").first();
    expect(row).toEqual({ course_attribute: "coaching", course_points: 3, course_weeks_remaining: 4 });
  });

  it("další kurz téhož zaměstnance (i jiného atributu) neprojde a nic nestojí", async () => {
    expect(await startStaffCourse(db, "club", "s-1", "medicine")).toMatchObject({ ok: false, status: 409 });
    expect(await fees()).toEqual([-18200]);
  });

  it("jiný zaměstnanec na kurz může, neplatný atribut a maximum ne", async () => {
    expect((await startStaffCourse(db, "club", "s-2", "coaching")).ok).toBe(true);
    expect(await fees()).toEqual([-18200, -18200]);
    expect(await startStaffCourse(db, "club", "s-3", "weekly_wage")).toMatchObject({ ok: false, status: 400 });
    expect(await startStaffCourse(db, "club", "s-3", "coaching")).toMatchObject({ ok: false, status: 400 });
    expect(await startStaffCourse(db, "club", "nobody", "coaching")).toMatchObject({ ok: false, status: 404 });
    expect(await fees()).toEqual([-18200, -18200]);
  });

  it("bez peněz kurz nezačne", async () => {
    await db.prepare("UPDATE teams SET budget = 100 WHERE id = 'club'").run();
    await addStaff("s-4", "psycholog", 8);
    expect((await startStaffCourse(db, "club", "s-4", "coaching")).ok).toBe(false);
    const row = await db.prepare("SELECT course_attribute FROM staff_members WHERE id = 's-4'").first<{ course_attribute: string | null }>();
    expect(row!.course_attribute).toBeNull();
  });
});
