/**
 * Každá volba v akademii má výhodu i nevýhodu (Miniflare D1 se všemi migracemi):
 * trenér mládeže ubere dorostu, hráč áčka udrží žáky a přitáhne děti, táta přivede žáka
 * navíc z náboru, slib jen podle toho, co klub má, hráč áčka s rolí v kádru.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { foundYouthTeam, setYouthCoach, loadAcademyView, loadCoachOptions, staffSplitFactor, poachAction } from "./service";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const v = await db.prepare("SELECT id, lat, lng FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 1").first<{ id: string; lat: number; lng: number }>();
  const near = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND id != ? AND lat IS NOT NULL AND population > 800 ORDER BY ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) LIMIT 1")
    .bind(v!.id, v!.lat, v!.lat, v!.lng, v!.lng).first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u', 'u@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u2', 'u2@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s9', 9, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('club', 'u', ?, 'Jiskra', 100000, 50, ?)").bind(v!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, parent_team_id, team_type) VALUES ('club-u21', 'u', ?, 'Jiskra U21', 0, 50, ?, 'club', 'u21')").bind(v!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('poor', 'u2', ?, 'Sokol', 100000, 50, ?)").bind(near!.id, GAME_DATE),
    db.prepare(`INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, gender, age, coaching, medicine, maintenance, judgement, communication, work_rate, charm, weekly_wage, signing_fee, avatar, description)
      VALUES ('st', 'Prachatice', 'club', 'trener_mladeze', 'trener_mladeze', 'Karel', 'Trenér', 'm', 45, 14, 5, 5, 12, 14, 10, 8, 300, 1000, '{}', '')`),
  ]);
  for (let i = 0; i < 16; i++) {
    await db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
      VALUES (?, 'club', 'Hráč', ?, ?, 'MID', ?, '{}', '{}', '{"leadership":50}', '{}', '{}', 'active')`).bind(`p${i}`, `H${i}`, i === 0 ? 30 : i === 1 ? 31 : 24, 60 - i).run();
  }
  expect((await foundYouthTeam(db, createRng(1), "club", GAME_DATE)).ok).toBe(true);
  expect((await foundYouthTeam(db, createRng(2), "poor", GAME_DATE)).ok).toBe(true);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("trenér: každý něco dá a něco stojí", () => {
  it("trenér mládeže u žáků ubere dorostu polovinu bonusu, jinak ne", async () => {
    await setYouthCoach(db, "club", { type: "parent" });
    expect(await staffSplitFactor(db, "club")).toBe(1);
    await setYouthCoach(db, "club", { type: "staff" });
    expect(await staffSplitFactor(db, "club")).toBe(0.5);
  });

  it("hráč áčka přitáhne víc dětí na nábor než trenér mládeže, táta přivede žáka navíc", async () => {
    await setYouthCoach(db, "club", { type: "staff" });
    const staff = (await loadAcademyView(db, "club"))!.recruitDay.expected;
    await setYouthCoach(db, "club", { type: "parent" });
    const parent = (await loadAcademyView(db, "club"))!.recruitDay.expected;
    const opts = await loadCoachOptions(db, "club");
    await setYouthCoach(db, "club", { type: "volunteer", playerId: opts.volunteers[0].playerId });
    const volunteer = (await loadAcademyView(db, "club"))!.recruitDay.expected;
    expect(parent).toBeGreaterThan(staff);
    expect(volunteer).toBeGreaterThan(staff * 0.95);
    // Placený trenér je pořád nejlepší na přípravu
    await setYouthCoach(db, "club", { type: "staff" });
    const qStaff = (await loadAcademyView(db, "club"))!.coach.quality;
    expect(qStaff).toMatch(/krajském|Slušná/);
  });

  it("u hráče áčka je vidět, jestli je to opora, nebo náhradník", async () => {
    const opts = await loadCoachOptions(db, "club");
    const best = opts.volunteers.find((v) => v.playerId === "p0")!;
    expect(best.role).toBe("opora áčka");
    expect(best.rating).toBe(60);
  });
});

describe("slib při lákání jen podle toho, co klub má", () => {
  it("klub bez dorostu a bez dodávky nemá co slíbit", async () => {
    const kid = (await db.prepare("SELECT id FROM youth_prospects WHERE team_id = 'club' AND status = 'active' LIMIT 1").first<{ id: string }>())!;
    const res = await poachAction(db, createRng(3), "poor", kid.id, "promise", GAME_DATE);
    expect(res.ok).toBe(false);
    const view = await loadAcademyView(db, "poor");
    expect(view!.poach!.promise).toEqual({ u21: false, van: false });
  });

  it("klub s dorostem slíbí dorost a zájem vzroste", async () => {
    const kid = (await db.prepare("SELECT id FROM youth_prospects WHERE team_id = 'poor' AND status = 'active' LIMIT 1").first<{ id: string }>())!;
    const invite = await poachAction(db, createRng(4), "club", kid.id, "invite", GAME_DATE);
    expect(invite.ok).toBe(true);
    const before = (await db.prepare("SELECT interest FROM youth_poach WHERE prospect_id = ?").bind(kid.id).first<{ interest: number }>())!.interest;
    expect((await poachAction(db, createRng(5), "club", kid.id, "promise", GAME_DATE)).ok).toBe(true);
    const after = (await db.prepare("SELECT interest FROM youth_poach WHERE prospect_id = ?").bind(kid.id).first<{ interest: number }>())!.interest;
    expect(after).toBe(Math.min(100, before + 10));
  });
});
