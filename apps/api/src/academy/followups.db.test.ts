/**
 * Zbývající opravy akademie z kompletní kontroly (Miniflare D1 se všemi migracemi):
 * roční účinky úrovně podle týdnů sezóny, strop 24 žáků i při souběhu náboru a dne otevřených
 * dveří, syn trenéra po zrušení akademie a po změně majitele, SMS o lákání a plat v dorostu.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import {
  foundYouthTeam, closeYouthTeam, setYouthCoach, setAcademyLevel, weeklyAcademy, seasonEndAcademy, recruitDay, openDay,
  poachAction, loadAcademyView, ensureCoachSon, type ProspectRow,
} from "./service";
import { coachSonAge, seasonLevelEffects, MAX_SQUAD } from "./rules";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function prospects(teamId: string): Promise<ProspectRow[]> {
  return (await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = 'active' ORDER BY id").bind(teamId).all<ProspectRow>()).results;
}

async function sms(teamId: string, like: string): Promise<string | null> {
  const row = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? AND m.body LIKE ?")
    .bind(teamId, like).first<{ body: string }>();
  return row?.body ?? null;
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const big = await db.prepare("SELECT id, lat, lng FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 1").first<{ id: string; lat: number; lng: number }>();
  const near = await db.prepare(
    `SELECT id FROM villages WHERE district = 'Prachatice' AND id != ? AND lat IS NOT NULL AND population > 800
      ORDER BY ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) LIMIT 1`,
  ).bind(big!.id, big!.lat, big!.lat, big!.lng, big!.lng).first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-a', 'a@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-b', 'b@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg', 'season-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('big', 'u-a', ?, 'Jiskra', 100000, 50, ?, 'lg')").bind(big!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('small', 'u-b', ?, 'Sokol', 100000, 50, ?, 'lg')").bind(near!.id, GAME_DATE),
    // Lákající klub má dorost: slib „místo v dorostu“ platí
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id, parent_team_id, team_type) VALUES ('big-u21', 'u-a', ?, 'Jiskra U21', 0, 50, ?, 'lg', 'big', 'u21')").bind(big!.id, GAME_DATE),
  ]);
  expect((await foundYouthTeam(db, createRng(1), "big", GAME_DATE)).ok).toBe(true);
  expect((await foundYouthTeam(db, createRng(2), "small", GAME_DATE)).ok).toBe(true);
  await setYouthCoach(db, "big", { type: "parent" });
  await setYouthCoach(db, "small", { type: "parent" });
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("úroveň akademie", () => {
  it("roční účinky podle týdnů sezóny: přepnutí na ambiciózní před létem skoro nic nedá", () => {
    const flip = seasonLevelEffects(JSON.stringify({ standard: 14 }), "ambitious");
    const all = seasonLevelEffects(JSON.stringify({ ambitious: 14 }), "ambitious");
    expect(flip.quit).toBeCloseTo(-0.05 / 15, 5);
    expect(all.quit).toBeCloseTo(-0.05, 5);
    expect(flip.attract).toBeLessThan(1.03);
    expect(flip.poachBonus).toBe(1);
    // Začátek sezóny (žádný týden za sebou): platí současná úroveň
    expect(seasonLevelEffects(null, "modest").quit).toBeCloseTo(0.06, 5);
    expect(seasonLevelEffects("rozbité", "standard").quit).toBe(0);
  });

  it("týdenní uzávěrka počítá týdny úrovně, konec sezóny je vynuluje", async () => {
    await setAcademyLevel(db, "big", "standard");
    for (let i = 0; i < 3; i++) await weeklyAcademy(db, "big", GAME_DATE, 1);
    await setAcademyLevel(db, "big", "ambitious");
    await weeklyAcademy(db, "big", GAME_DATE, 1);
    const row = await db.prepare("SELECT academy_level_weeks FROM teams WHERE id = 'big'").first<{ academy_level_weeks: string }>();
    expect(JSON.parse(row!.academy_level_weeks)).toEqual({ standard: 3, ambitious: 1 });
    await setAcademyLevel(db, "big", "standard");
    await seasonEndAcademy(db, createRng(3), "big", GAME_DATE);
    const after = await db.prepare("SELECT academy_level_weeks FROM teams WHERE id = 'big'").first<{ academy_level_weeks: string | null }>();
    expect(after!.academy_level_weeks).toBeNull();
  });
});

describe("strop družstva", () => {
  it("souběžný nábor a den otevřených dveří u klubu s 23 žáky nevytvoří 25", async () => {
    let reachedCap = false;
    for (let seed = 100; seed < 130; seed++) {
      // Zpátky na 23 žáků a obě akce zase volné
      const kids = await prospects("big");
      if (kids.length > 23) {
        const extra = kids.filter((k) => !k.coach_son).slice(0, kids.length - 23).map((k) => k.id);
        await db.prepare(`UPDATE youth_prospects SET status = 'quit' WHERE id IN (${extra.map(() => "?").join(",")})`).bind(...extra).run();
      }
      while ((await prospects("big")).length < 23) {
        await db.prepare("UPDATE teams SET academy_recruit_day_season = NULL, academy_recruit_day_on = NULL WHERE id = 'big'").run();
        await recruitDay(db, createRng(seed * 7 + (await prospects("big")).length), "big", GAME_DATE);
      }
      await db.prepare("UPDATE teams SET academy_recruit_day_season = NULL, academy_recruit_day_on = NULL, academy_open_day_season = NULL, budget = 100000 WHERE id = 'big'").run();
      await Promise.all([
        recruitDay(db, createRng(seed), "big", GAME_DATE),
        openDay(db, createRng(seed + 1000), "big", GAME_DATE),
      ]);
      const n = (await prospects("big")).length;
      expect(n).toBeLessThanOrEqual(MAX_SQUAD);
      if (n === MAX_SQUAD) reachedCap = true;
    }
    expect(reachedCap).toBe(true);
  }, 120_000);
});

describe("syn trenéra", () => {
  const sonManager = (age: number, sonAge: number, prefix: string) =>
    Array.from({ length: 20000 }, (_, i) => `${prefix}-${i}`).find((id) => coachSonAge(id, age) === sonAge)!;

  it("po zrušení a novém založení akademie se vrátí stejný kluk", async () => {
    const v = await db.prepare("SELECT village_id FROM teams WHERE id = 'small'").first<{ village_id: string }>();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('family', 'u-a', ?, 'Rodinný', 100000, 50, ?, 'lg')").bind(v!.village_id, GAME_DATE).run();
    await db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, age) VALUES (?, 'u-a', 'family', 'Josef Kopecký', '', '{}', 42)").bind(sonManager(42, 12, "dad")).run();
    expect((await foundYouthTeam(db, createRng(40), "family", GAME_DATE)).ok).toBe(true);
    const son = await db.prepare("SELECT first_name, coach_son_of FROM youth_prospects WHERE team_id = 'family' AND coach_son = 1 AND status = 'active'").first<{ first_name: string; coach_son_of: string }>();
    expect(son!.coach_son_of).toBe(sonManager(42, 12, "dad"));

    expect((await closeYouthTeam(db, "family", GAME_DATE)).ok).toBe(true);
    const gone = await db.prepare("SELECT coach_son, status FROM youth_prospects WHERE team_id = 'family' AND first_name = ? AND last_name = 'Kopecký'").bind(son!.first_name).first<{ coach_son: number; status: string }>();
    expect(gone).toMatchObject({ coach_son: 2, status: "quit" });

    await db.prepare("UPDATE teams SET academy_founded_season = NULL WHERE id = 'family'").run();
    expect((await foundYouthTeam(db, createRng(41), "family", GAME_DATE)).ok).toBe(true);
    const back = (await db.prepare("SELECT first_name, last_name FROM youth_prospects WHERE team_id = 'family' AND coach_son = 1 AND status = 'active'").all<{ first_name: string; last_name: string }>()).results;
    expect(back).toEqual([{ first_name: son!.first_name, last_name: "Kopecký" }]);
    // Další konec sezóny ani další volání ho nezdvojí
    expect(await ensureCoachSon(db, createRng(42), "family", GAME_DATE)).toBeNull();
  });

  it("nový majitel klubu má svého syna, starý zůstává", async () => {
    await db.prepare("UPDATE managers SET team_id = NULL WHERE team_id = 'family'").run();
    await db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, age) VALUES (?, 'u-b', 'family', 'Karel Vondra', '', '{}', 45)").bind(sonManager(45, 11, "new")).run();
    const name = await ensureCoachSon(db, createRng(43), "family", GAME_DATE);
    expect(name).toMatch(/ Vondra$/);
    const sons = (await db.prepare("SELECT last_name FROM youth_prospects WHERE team_id = 'family' AND coach_son = 1 AND status = 'active' ORDER BY last_name").all<{ last_name: string }>()).results;
    expect(sons.map((s) => s.last_name)).toEqual(["Kopecký", "Vondra"]);
    expect(await ensureCoachSon(db, createRng(44), "family", GAME_DATE)).toBeNull();
  });
});

describe("lákání a plat v dorostu", () => {
  it("klub, kterému žáka lákají, dostane SMS i při slibu a při prvních penězích na kopačky", async () => {
    const [a, b] = (await prospects("small")).filter((k) => !k.coach_son);
    expect((await poachAction(db, createRng(50), "big", a.id, "promise", GAME_DATE)).ok).toBe(true);
    expect(await sms("small", `%${a.first_name} ${a.last_name}%`)).toMatch(/^Lákají tvého žáka: .+ Klub z obce .+ slíbil jeho rodičům místo ve svém dorostu\./);
    expect((await poachAction(db, createRng(51), "big", b.id, "boots", GAME_DATE)).ok).toBe(true);
    const boots = await sms("small", `%${b.first_name} ${b.last_name}%`);
    expect(boots).toMatch(/kopačky|Za jeho rodiči byl/);
  });

  it("u žáka, kterého jde dát do dorostu, je vidět plat", async () => {
    const kids = (await prospects("big")).filter((k) => !k.coach_son);
    await db.prepare("UPDATE youth_prospects SET age = 13 WHERE id = ?").bind(kids[0].id).run();
    await db.prepare("UPDATE youth_prospects SET age = 12 WHERE id = ?").bind(kids[1].id).run();
    const view = await loadAcademyView(db, "big");
    const older = view!.prospects.find((p) => p.id === kids[0].id)!;
    const younger = view!.prospects.find((p) => p.id === kids[1].id)!;
    expect(older.canPlayUp).toBe(true);
    expect(older.graduateWage).toBeGreaterThan(0);
    expect(younger.graduateWage).toBeNull();
  });
});

describe("záporný rozpočet v létě", () => {
  it("vlastní čtrnáctiletý postoupí do dorostu i při mínusu a registrace se strhne", async () => {
    const kid = (await prospects("big")).find((k) => !k.coach_son)!;
    // Jména se losují: jmenovec mezi kluky, kteří skončili, by shodil kontrolu SMS níž.
    kid.first_name = "Xaver";
    kid.last_name = "Unikátní";
    await db.prepare("UPDATE youth_prospects SET first_name = ?, last_name = ? WHERE id = ?").bind(kid.first_name, kid.last_name, kid.id).run();
    await db.prepare("UPDATE youth_prospects SET age = 14, aged_season = NULL WHERE id = ?").bind(kid.id).run();
    await db.prepare("UPDATE youth_prospects SET aged_season = 3 WHERE team_id = 'big' AND id != ?").bind(kid.id).run();
    await db.prepare("UPDATE teams SET budget = -1000 WHERE id = 'big'").run();
    await seasonEndAcademy(db, createRng(60), "big", GAME_DATE);
    const row = await db.prepare("SELECT p.status, pl.team_id FROM youth_prospects p LEFT JOIN players pl ON pl.id = p.player_id WHERE p.id = ?").bind(kid.id).first<{ status: string; team_id: string | null }>();
    expect(row).toMatchObject({ status: "promoted", team_id: "big-u21" });
    const fee = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'big' AND description = ?").bind(`Registrace: ${kid.first_name} ${kid.last_name}`).first<{ amount: number }>();
    expect(fee!.amount).toBe(-500);
    const summary = await sms("big", `%Do dorostu postoupili: %${kid.first_name} ${kid.last_name}%`);
    expect(summary).not.toBeNull();
    expect(await sms("big", `%Skončili: %${kid.first_name} ${kid.last_name}%`)).toBeNull();
  });

  it("ruční „Dát do dorostu“ při mínusu odmítne předem a hráč nevznikne", async () => {
    const { promoteProspect } = await import("./service");
    const kid = (await prospects("big")).find((k) => !k.coach_son)!;
    await db.prepare("UPDATE youth_prospects SET age = 13, joined_at = '2026-01-01' WHERE id = ?").bind(kid.id).run();
    const players = async () => (await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = 'big-u21'").first<{ n: number }>())!.n;
    const before = await players();
    const res = await promoteProspect(db, "big", kid.id);
    expect(res.ok).toBe(false);
    expect(await players()).toBe(before);
    expect((await prospects("big")).some((k) => k.id === kid.id)).toBe(true);
  });

  it("lákající klub bez peněz na odstupné žáka nedostane, žák zůstává a nikdo nic neplatí", async () => {
    const poach = await db.prepare("SELECT id, prospect_id FROM youth_poach WHERE to_team_id = 'big' AND status = 'active' LIMIT 1").first<{ id: string; prospect_id: string }>();
    await db.prepare("UPDATE youth_poach SET interest = 90 WHERE id = ?").bind(poach!.id).run();
    // Místo v družstvu je: přestup by neprošel jen kvůli penězům
    await db.prepare("UPDATE youth_prospects SET status = 'quit' WHERE id IN (SELECT id FROM youth_prospects WHERE team_id = 'big' AND status = 'active' AND coach_son = 0 LIMIT 3)").run();
    await db.prepare("UPDATE teams SET budget = -1000 WHERE id = 'big'").run();
    await seasonEndAcademy(db, createRng(61), "small", GAME_DATE);
    const kid = await db.prepare("SELECT team_id, first_name, last_name FROM youth_prospects WHERE id = ?").bind(poach!.prospect_id).first<{ team_id: string; first_name: string; last_name: string }>();
    expect(kid!.team_id).toBe("small");
    const st = await db.prepare("SELECT status FROM youth_poach WHERE id = ?").bind(poach!.id).first<{ status: string }>();
    expect(st!.status).toBe("failed");
    const income = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE description LIKE 'Odstupné za žáka%'").first<{ n: number }>();
    expect(income!.n).toBe(0);
    expect(await sms("big", `%${kid!.first_name} ${kid!.last_name}%nemáme peníze%`)).not.toBeNull();
    const left = await db.prepare("SELECT COUNT(*) AS n FROM youth_poach WHERE from_team_id = 'small' AND status = 'active'").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});
