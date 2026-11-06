/**
 * Jednoho nadějného žáka láká víc klubů (prod 2026-11-06: Kubička, deset klubů, u dvou
 * „v létě přestoupí“). Přestoupit může jen jednou: nejvýš tři kluby, „přestoupí“ jen
 * u vedoucího, v létě vyhraje nejvyšší zájem a odstupné se platí jednou.
 * K tomu akce akademie bez peněz: stejné pravidlo jako nákupy jinde ve hře.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { foundYouthTeam, setYouthCoach, poachAction, defendPoach, loadAcademyView, seasonEndAcademy, recruitDay, openDay } from "./service";

const GAME_DATE = "2026-11-06T10:00:00.000Z";
let mf: Miniflare;
let db: D1Database;
const LURERS = ["l1", "l2", "l3", "l4"];
let kidId = "";

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const src = await db.prepare("SELECT id, lat, lng FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL AND population > 1500 ORDER BY population LIMIT 1").first<{ id: string; lat: number; lng: number }>();
  const near = (await db.prepare(
    `SELECT id FROM villages WHERE district = 'Prachatice' AND id != ? AND lat IS NOT NULL AND population > 600
      ORDER BY ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) LIMIT 4`,
  ).bind(src!.id, src!.lat, src!.lat, src!.lng, src!.lng).all<{ id: string }>()).results;
  await db.batch([
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg', 'season-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-src', 'src@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('src', 'u-src', ?, 'Zdroj', 100000, 50, ?, 'lg')").bind(src!.id, GAME_DATE),
    ...LURERS.flatMap((id, i) => [
      db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(`u-${id}`, `${id}@example.test`),
      db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES (?, ?, ?, ?, 100000, 50, ?, 'lg')")
        .bind(id, `u-${id}`, near[i].id, `Lákač ${i + 1}`, GAME_DATE),
    ]),
  ]);
  for (const [i, id] of ["src", ...LURERS].entries()) {
    expect((await foundYouthTeam(db, createRng(10 + i), id, GAME_DATE)).ok).toBe(true);
    await setYouthCoach(db, id, { type: "parent" });
  }
  // Jeden opravdu nadějný žák zdrojového klubu, aby ho všichni viděli
  const kid = await db.prepare("SELECT id FROM youth_prospects WHERE team_id = 'src' AND status = 'active' AND coach_son = 0 ORDER BY age DESC LIMIT 1").first<{ id: string }>();
  kidId = kid!.id;
  await db.prepare("UPDATE youth_prospects SET hidden_talent = 85, estimate_offset = 0, age = 13 WHERE id = ?").bind(kidId).run();
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

const targetOf = async (teamId: string) => (await loadAcademyView(db, teamId))!.poach!.targets.find((t) => t.prospectId === kidId)!;
const interestOf = (team: string, value: number) => db.prepare("UPDATE youth_poach SET interest = ? WHERE prospect_id = ? AND to_team_id = ?").bind(value, kidId, team).run();

describe("jednoho žáka láká víc klubů", () => {
  it("nejvýš tři kluby, čtvrtý dostane důvod a stránka mu lákání nenabídne", async () => {
    for (const id of ["l1", "l2", "l3"]) expect((await poachAction(db, createRng(1), id, kidId, "invite", GAME_DATE)).ok).toBe(true);
    const fourth = await poachAction(db, createRng(1), "l4", kidId, "invite", GAME_DATE);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.error).toContain("tři kluby");
    expect((await targetOf("l4")).crowded).toBe(true);
    expect((await targetOf("l1")).crowded).toBe(false);
  });

  it("„v létě přestoupí“ vidí jen vedoucí klub, vlastní klub ví, kdo ho táhne nejvíc", async () => {
    await interestOf("l1", 65);
    await interestOf("l2", 72);
    await interestOf("l3", 40);
    expect((await targetOf("l2")).interest).toBe("chce k vám, v létě přestoupí");
    expect((await targetOf("l1")).interest).toBe("chce k vám, ale víc ho láká jiný klub");
    expect((await targetOf("l3")).interest).toBe("poslouchá, ale drží se svého klubu");
    const incoming = (await loadAcademyView(db, "src"))!.poach!.incoming;
    const by = (club: string) => incoming.find((y) => y.club === club)!.interest;
    expect(by("Lákač 2")).toBe("chce k nim, v létě přestoupí");
    expect(by("Lákač 1")).toBe("chce k nim, ale víc ho táhne Lákač 2");
    expect(incoming.filter((y) => y.interest.includes("v létě přestoupí"))).toHaveLength(1);
  });

  it("rozhovor s rodiči vrátí odpověď podle pořadí", async () => {
    const poach = await db.prepare("SELECT id FROM youth_poach WHERE prospect_id = ? AND to_team_id = 'l1'").bind(kidId).first<{ id: string }>();
    const res = await defendPoach(db, "src", poach!.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.interest).not.toContain("v létě přestoupí");
  });

  it("v létě přestoupí jen jednou, do klubu s nejvyšším zájmem, odstupné jednou", async () => {
    await seasonEndAcademy(db, createRng(5), "src", GAME_DATE);
    const kid = await db.prepare("SELECT team_id FROM youth_prospects WHERE id = ?").bind(kidId).first<{ team_id: string }>();
    expect(kid!.team_id).toBe("l2");
    const statuses = (await db.prepare("SELECT to_team_id, status FROM youth_poach WHERE prospect_id = ? ORDER BY to_team_id").bind(kidId).all<{ to_team_id: string; status: string }>()).results;
    expect(statuses).toEqual([
      { to_team_id: "l1", status: "failed" }, { to_team_id: "l2", status: "done" }, { to_team_id: "l3", status: "failed" },
    ]);
    const fees = (await db.prepare("SELECT team_id, amount FROM transactions WHERE description LIKE 'Odstupné za žáka%' ORDER BY team_id").all<{ team_id: string; amount: number }>()).results;
    expect(fees.map((f) => f.team_id)).toEqual(["l2", "src"]);
    expect(fees[0].amount).toBe(-fees[1].amount);
  });
});

describe("akce akademie bez peněz", () => {
  it("nábor a den otevřených dveří bez peněz neprojdou a nic se nestrhne", async () => {
    await db.prepare("UPDATE teams SET budget = 1000 WHERE id = 'l3'").run();
    const recruit = await recruitDay(db, createRng(2), "l3", GAME_DATE);
    expect(recruit.ok).toBe(false);
    if (!recruit.ok) expect(recruit.error).toContain("Nedostatek prostředků");
    await db.prepare("UPDATE teams SET budget = -50 WHERE id = 'l3'").run();
    const open = await openDay(db, createRng(3), "l3", GAME_DATE);
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.error).toContain("Záporný rozpočet");
    const tx = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 'l3' AND (description LIKE 'Náborový%' OR description LIKE 'Den otevřených%')").first<{ n: number }>();
    expect(tx!.n).toBe(0);
    // Nárok na sezónu se nespotřeboval: s penězi to jde
    await db.prepare("UPDATE teams SET budget = 100000 WHERE id = 'l3'").run();
    expect((await recruitDay(db, createRng(4), "l3", GAME_DATE)).ok).toBe(true);
  });

  it("kopačky v mínusu neprojdou", async () => {
    const kid = await db.prepare("SELECT id FROM youth_prospects WHERE team_id = 'l1' AND status = 'active' AND coach_son = 0 LIMIT 1").first<{ id: string }>();
    await db.prepare("UPDATE teams SET budget = -1 WHERE id = 'l4'").run();
    const res = await poachAction(db, createRng(6), "l4", kid!.id, "boots", GAME_DATE);
    expect(res.ok).toBe(false);
  });
});
