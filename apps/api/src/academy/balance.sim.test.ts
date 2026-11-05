/**
 * Herní simulace akademie (nástroj pro ladění čísel): tři kluby různé velikosti obce a různé
 * trenéry, šest sezón po 15 týdnech. Měří příchody, odchody, postupy do U21, kvalitu
 * odchovanců a náklady. Spuštění: ACADEMY_SIM=1 SIM_OUT=/cesta/vystup.txt npx vitest run src/academy/balance.sim.test.ts
 * (bez ACADEMY_SIM se přeskočí, ať nebrzdí běžné testy).
 */
import { afterAll, beforeAll, describe, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { foundYouthTeam, setYouthCoach, weeklyAcademy, seasonEndAcademy, recruitDay, setAcademyLevel } from "./service";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

interface Club { id: string; label: string; pop: number; coach: "volunteer" | "parent" | "staff"; recruit: boolean; level: "modest" | "standard" | "ambitious" }
const clubs: Club[] = [];

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u', 'u@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('sim', 50, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg', 'sim', 'Prachatice', 'OP', 'okresni_prebor')"),
  ]);
  const pick = async (lo: number, hi: number) => db.prepare("SELECT id, population FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL AND population BETWEEN ? AND ? ORDER BY population LIMIT 1").bind(lo, hi).first<{ id: string; population: number }>();
  const specs: [string, number, number, Club["coach"], boolean, Club["level"]][] = [
    ["osada+táta", 100, 500, "parent", false, "standard"],
    ["obec+dobrovolník", 1200, 2000, "volunteer", false, "standard"],
    ["obec+trenér skromná", 2001, 3500, "staff", false, "modest"],
    ["obec+trenér běžná", 2001, 3500, "staff", false, "standard"],
    ["obec+trenér ambiciózní", 2001, 3500, "staff", false, "ambitious"],
    ["městys+trenér+nábor ambiciózní", 3501, 9000, "staff", true, "ambitious"],
    ["obec+dobrovolník+nábor běžná", 2001, 3500, "volunteer", true, "standard"],
    ["obec+táta+nábor běžná", 2001, 3500, "parent", true, "standard"],
    ["obec+trenér+nábor běžná", 2001, 3500, "staff", true, "standard"],
  ];
  let i = 0;
  for (const [label, lo, hi, coach, recruit, level] of specs) {
    const v = await pick(lo, hi);
    if (!v) continue;
    const id = `c${i++}`;
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES (?, 'ai', ?, ?, 1000000, 50, ?, 'lg')").bind(id, v.id, label, GAME_DATE).run();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, parent_team_id, team_type) VALUES (?, 'ai', ?, ?, 0, 50, ?, ?, 'u21')").bind(`${id}-u21`, v.id, `${label} U21`, GAME_DATE, id).run();
    await db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
      VALUES (?, ?, 'Pepa', 'Starý', 32, 'MID', 40, '{}', '{}', '{"leadership":55}', '{}', '{}', 'active')`).bind(`${id}-vet`, id).run();
    if (coach === "staff") {
      await db.prepare(`INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, gender, age, coaching, medicine, maintenance, judgement, communication, work_rate, charm, weekly_wage, signing_fee, avatar, description)
        VALUES (?, 'Prachatice', ?, 'trener_mladeze', 'trener_mladeze', 'Karel', 'Trenér', 'm', 45, 12, 5, 5, 12, 12, 10, 8, 250, 1000, '{}', '')`).bind(`${id}-staff`, id).run();
    }
    clubs.push({ id, label, pop: v.population, coach, recruit, level });
  }
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe.skipIf(!process.env.ACADEMY_SIM)("bilance akademie", () => {
  it("šest sezón", async () => {
    const rng = createRng(Number(process.env.SIM_SEED ?? 20261104));
    for (const c of clubs) {
      await foundYouthTeam(db, rng, c.id, GAME_DATE);
      await setYouthCoach(db, c.id, c.coach === "volunteer" ? { type: "volunteer", playerId: `${c.id}-vet` } : { type: c.coach });
      await setAcademyLevel(db, c.id, c.level);
    }
    const rows: string[] = [];
    for (let season = 1; season <= 6; season++) {
      await db.prepare("UPDATE seasons SET number = ? WHERE id = 'sim'").bind(50 + season).run();
      for (const c of clubs) {
        if (c.recruit) await recruitDay(db, rng, c.id, GAME_DATE);
        for (let w = 0; w < 15; w++) await weeklyAcademy(db, c.id, GAME_DATE, 1);
        await seasonEndAcademy(db, rng, c.id, GAME_DATE);
        // Táta odešel s klukem: vezmi dalšího tátu (jako by hráč reagoval na SMS)
        const t = await db.prepare("SELECT academy_coach_type FROM teams WHERE id = ?").bind(c.id).first<{ academy_coach_type: string | null }>();
        if (!t?.academy_coach_type) await setYouthCoach(db, c.id, { type: c.coach === "volunteer" ? "volunteer" : c.coach, playerId: `${c.id}-vet` });
      }
    }
    for (const c of clubs) {
      const all = (await db.prepare("SELECT status, COUNT(*) AS n FROM youth_prospects WHERE team_id = ? GROUP BY status").bind(c.id).all<{ status: string; n: number }>()).results;
      const by = Object.fromEntries(all.map((r) => [r.status, r.n]));
      const grads = (await db.prepare("SELECT overall_rating AS r, hidden_talent AS t, skills_max AS sm, age FROM players WHERE raised_by_team_id = ?").bind(c.id).all<{ r: number; t: number; sm: string; age: number }>()).results;
      const caps = grads.map((g) => {
        const m = JSON.parse(g.sm) as Record<string, { maxPotential: number }>;
        const v = Object.entries(m).filter(([k]) => k !== "experience").map(([, x]) => x.maxPotential);
        return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
      });
      const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);
      const cost = (await db.prepare("SELECT -SUM(amount) AS s FROM transactions WHERE team_id = ? AND type = 'youth_academy'").bind(c.id).first<{ s: number }>())?.s ?? 0;
      const gems = grads.filter((g) => g.t >= 70).length;
      const stars = caps.filter((x) => x >= 70).length;
      rows.push(`${c.label} (${c.pop} obyv., ${c.coach}): aktivní ${by.active ?? 0}, do U21 ${by.promoted ?? 0}, skončili ${by.quit ?? 0}; odchovanci ${grads.length} za 6 sezón = ${(grads.length / 6).toFixed(1)}/sezónu, hodnocení ${avg(grads.map((g) => g.r))} (ve ${avg(grads.map((g) => g.age))} letech), talent ${avg(grads.map((g) => g.t))}, strop ${avg(caps)}, klenoty ${gems}, strop 70+ ${stars}; náklad ${cost.toLocaleString("cs")} Kč = ${Math.round(cost / 6).toLocaleString("cs")}/sezónu, ${grads.length ? Math.round(cost / grads.length).toLocaleString("cs") : "-"} Kč/odchovance`);
    }
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.SIM_OUT ?? "academy-sim.txt", rows.join("\n") + "\n");
  }, 600_000);
});
