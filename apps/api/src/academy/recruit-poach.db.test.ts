/**
 * Kde vzít nové kluky (Miniflare D1 se všemi migracemi): náborový den, kluci z okolních obcí
 * bez akademie a přetahování nadějných žáků mezi kluby s letním přestupem za odstupné.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { foundYouthTeam, setYouthCoach, recruitDay, openDay, seasonEndAcademy, poachAction, defendPoach, loadAcademyView, setAcademyLevel, weeklyAcademy, type ProspectRow } from "./service";
import { coachSonAge } from "./rules";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function prospects(teamId: string): Promise<ProspectRow[]> {
  return (await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = 'active' ORDER BY id").bind(teamId).all<ProspectRow>()).results;
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  // Dvě blízké obce okresu: větší pro lákající klub, menší pro klub, o jehož kluka jde
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
  ]);
  expect((await foundYouthTeam(db, createRng(1), "big", GAME_DATE)).ok).toBe(true);
  expect((await foundYouthTeam(db, createRng(2), "small", GAME_DATE)).ok).toBe(true);
  await setYouthCoach(db, "big", { type: "parent" });
  await setYouthCoach(db, "small", { type: "parent" });
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("náborový den", () => {
  it("jednou za sezónu, stojí peníze, přivede kluky 11–12 let", async () => {
    const before = (await prospects("big")).length;
    const res = await recruitDay(db, createRng(3), "big", GAME_DATE);
    expect(res.ok).toBe(true);
    const after = await prospects("big");
    expect(after.length).toBe(before + (res.ok ? res.names.length : 0));
    const tx = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'big' AND description LIKE 'Náborový den%'").first<{ amount: number }>();
    expect(tx!.amount).toBe(-1500);
    expect((await recruitDay(db, createRng(4), "big", GAME_DATE)).ok).toBe(false);
  });

  it("den otevřených dveří: zvlášť od náboru, dražší, žáci 11–14 se zápalem a přesnějším odhadem", async () => {
    // Plné družstvo (24): tlačítko se nenabídne, akce by stejně skončila na „víc jich neuživí“
    const full = await loadAcademyView(db, "big");
    if (full!.prospects.length >= 24) expect(full!.openDay.available).toBe(false);
    // Velký klub má po založení plno: pár žáků skončí, ať je pro nováčky místo
    await db.prepare("UPDATE youth_prospects SET status = 'quit' WHERE id IN (SELECT id FROM youth_prospects WHERE team_id = 'big' AND status = 'active' AND coach_son = 0 AND id NOT IN (SELECT COALESCE(academy_coach_prospect_id, '') FROM teams WHERE id = 'big') LIMIT 8)").run();
    const view = await loadAcademyView(db, "big");
    expect(view!.openDay.available).toBe(true);
    expect(view!.openDay.cost).toBe(2500);
    const before = new Set((await prospects("big")).map((p) => p.id));
    // Víc pokusů na čerstvém semínku nejde (jednou za sezónu), proto sezónu posouváme ručně
    let added: ProspectRow[] = [];
    for (let seed = 10; seed < 40 && added.length === 0; seed++) {
      await db.prepare("UPDATE teams SET academy_open_day_season = NULL WHERE id = 'big'").run();
      const res = await openDay(db, createRng(seed), "big", GAME_DATE);
      expect(res.ok ? "ok" : res.error).toBe("ok");
      added = (await prospects("big")).filter((p) => !before.has(p.id));
    }
    expect(added.length).toBeGreaterThan(0);
    for (const p of added) {
      expect(p.age).toBeGreaterThanOrEqual(11);
      expect(p.age).toBeLessThanOrEqual(14);
      expect(p.commitment).toBeGreaterThanOrEqual(55 + 15);
      expect(Math.abs(p.estimate_offset)).toBeLessThanOrEqual(0.5);
      expect(p.aged_season).toBeNull();
    }
    expect((await openDay(db, createRng(99), "big", GAME_DATE)).ok).toBe(false);
    const tx = await db.prepare("SELECT COUNT(*) AS n, MIN(amount) AS a FROM transactions WHERE team_id = 'big' AND description = 'Den otevřených dveří akademie'").first<{ n: number; a: number }>();
    expect(tx!.a).toBe(-2500);
    expect((await loadAcademyView(db, "big"))!.openDay.used).toBe(true);
  });
});

describe("přetahování", () => {
  it("cizí kluk jde lákat, každá akce jednou, jeho klub se o pozvání dozví", async () => {
    const kid = (await prospects("small"))[0];
    const invite = await poachAction(db, createRng(5), "big", kid.id, "invite", GAME_DATE);
    expect(invite.ok).toBe(true);
    expect((await poachAction(db, createRng(5), "big", kid.id, "invite", GAME_DATE)).ok).toBe(false);
    expect((await poachAction(db, createRng(5), "big", kid.id, "bogus", GAME_DATE)).ok).toBe(false);
    const sms = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'small' AND m.body LIKE '%pozvali ho%'").first<{ body: string }>();
    expect(sms).not.toBeNull();
    const view = await loadAcademyView(db, "small");
    expect(view!.poach!.incoming.length).toBe(1);
  });

  it("vlastního kluka nejde lákat a víc než dva cizí za sezónu taky ne", async () => {
    const own = (await prospects("big"))[0];
    expect((await poachAction(db, createRng(6), "big", own.id, "invite", GAME_DATE)).ok).toBe(false);
    const others = (await prospects("small")).slice(1, 3);
    expect((await poachAction(db, createRng(6), "big", others[0].id, "invite", GAME_DATE)).ok).toBe(true);
    expect((await poachAction(db, createRng(6), "big", others[1].id, "invite", GAME_DATE)).ok).toBe(false);
  });

  it("souběžné kliknutí na stejnou akci zájem nezdvojí", async () => {
    const kid = (await prospects("small"))[0];
    const before = await db.prepare("SELECT interest FROM youth_poach WHERE prospect_id = ? AND to_team_id = 'big'").bind(kid.id).first<{ interest: number }>();
    const res = await Promise.all([1, 2, 3].map(() => poachAction(db, createRng(10), "big", kid.id, "boots", GAME_DATE)));
    expect(res.filter((r) => r.ok).length).toBe(1);
    const after = await db.prepare("SELECT interest, actions FROM youth_poach WHERE prospect_id = ? AND to_team_id = 'big'").bind(kid.id).first<{ interest: number; actions: string }>();
    expect(after!.interest).toBe(Math.min(100, before!.interest + 25));
    expect(JSON.parse(after!.actions).filter((a: string) => a === "boots").length).toBe(1);
    // Kopačky se zaplatily jednou, ne třikrát
    const paid = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 'big' AND description LIKE 'Příspěvek rodičům na kopačky%'").first<{ n: number }>();
    expect(paid!.n).toBe(1);
  });

  it("propojené kluby (stejný majitel) si kluky přetahovat nemůžou", async () => {
    const near = await db.prepare("SELECT village_id FROM teams WHERE id = 'small'").first<{ village_id: string }>();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id, academy_upkeep) VALUES ('sister', 'u-b', ?, 'Sestra', 100000, 50, ?, 'lg', 1)").bind(near!.village_id, GAME_DATE).run();
    const kid = (await prospects("small"))[2];
    const res = await poachAction(db, createRng(11), "sister", kid.id, "invite", GAME_DATE);
    expect(res.ok).toBe(false);
  });

  it("v létě kluk se zájmem přestoupí za odstupné, bez zájmu zůstane", async () => {
    const [kid, second] = await prospects("small");
    await poachAction(db, createRng(7), "big", kid.id, "boots", GAME_DATE);
    // Druhého kluka jeho klub ubrání: zájem pod hranicí
    const incoming = (await loadAcademyView(db, "small"))!.poach!.incoming;
    const other = incoming.find((y) => y.name === `${second.first_name} ${second.last_name}`);
    if (other) expect((await defendPoach(db, "small", other.poachId)).ok).toBe(true);
    await db.prepare("UPDATE youth_poach SET interest = 80 WHERE prospect_id = ?").bind(kid.id).run();
    await db.prepare("UPDATE youth_poach SET interest = 10 WHERE prospect_id = ?").bind(second.id).run();

    // Lákající klub má konec sezóny za sebou dřív: přetažený kluk se musí posunout hned
    const bigBefore = await prospects("big");
    await seasonEndAcademy(db, createRng(12), "big", GAME_DATE);
    const bigAfter = await prospects("big");
    const agedOnce = bigAfter.filter((k) => bigBefore.some((b) => b.id === k.id && b.age + 1 === k.age)).length;
    await seasonEndAcademy(db, createRng(8), "small", GAME_DATE);
    const moved = await db.prepare("SELECT team_id FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ team_id: string }>();
    expect(moved!.team_id).toBe("big");
    const stayed = await db.prepare("SELECT team_id FROM youth_prospects WHERE id = ?").bind(second.id).first<{ team_id: string }>();
    expect(stayed!.team_id).toBe("small");
    const fee = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'small' AND type = 'transfer_income'").first<{ amount: number }>();
    expect(fee!.amount).toBeGreaterThanOrEqual(6_500);
    // Přetažený kluk zestárl právě jednou, i když jeho nový klub byl zpracovaný dřív
    const movedRow = await db.prepare("SELECT age, aged_season, status FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ age: number; aged_season: number; status: string }>();
    expect(movedRow!.aged_season).toBe(3);
    if (movedRow!.status === "active") expect(movedRow!.age).toBe(kid.age + 1);
    // Druhý konec sezóny téhož klubu už nikoho nezestárne
    expect(agedOnce).toBeGreaterThan(0);
    const again = await prospects("big");
    await seasonEndAcademy(db, createRng(13), "big", GAME_DATE);
    const twice = await prospects("big");
    for (const k of twice) {
      const prev = again.find((a) => a.id === k.id);
      if (prev) expect(k.age).toBe(prev.age);
    }
    // Rok ho nikdo přetahovat nemůže
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id, academy_upkeep) SELECT 'third', 'u-b', village_id, 'Slavoj', 100000, 50, game_date, 'lg', 1 FROM teams WHERE id = 'small'").run();
    expect((await poachAction(db, createRng(9), "third", kid.id, "invite", GAME_DATE)).ok).toBe(false);
  });
});

describe("úroveň akademie a syn trenéra", () => {
  it("úroveň mění týdenní cenu i růst kluků", async () => {
    expect((await setAcademyLevel(db, "big", "elite")).ok).toBe(false);
    const kids = (await prospects("big")).length;
    expect((await setAcademyLevel(db, "big", "ambitious")).ok).toBe(true);
    const before = (await prospects("big"))[0];
    await weeklyAcademy(db, "big", GAME_DATE, 1);
    const tx = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'big' AND type = 'youth_academy' ORDER BY rowid DESC LIMIT 1").first<{ amount: number }>();
    expect(tx!.amount).toBe(-(500 + 90 * kids));
    const ambitiousStep = (await prospects("big")).find((k) => k.id === before.id)!.progress_current - before.progress_current;
    await setAcademyLevel(db, "big", "modest");
    const mid = (await prospects("big")).find((k) => k.id === before.id)!;
    await weeklyAcademy(db, "big", GAME_DATE, 1);
    const modestStep = (await prospects("big")).find((k) => k.id === before.id)!.progress_current - mid.progress_current;
    expect(ambitiousStep).toBeGreaterThan(modestStep);
  });

  it("syn trenéra přijde při založení, jen jednou, a přetáhnout nejde", async () => {
    // Trenér, jehož syn je teď v žácích (12 let)
    const managerId = Array.from({ length: 500 }, (_, i) => `mgr-${i}`).find((id) => coachSonAge(id, 42) === 12)!;
    const v = await db.prepare("SELECT village_id FROM teams WHERE id = 'small'").first<{ village_id: string }>();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('family', 'u-a', ?, 'Rodinný', 100000, 50, ?, 'lg')").bind(v!.village_id, GAME_DATE).run();
    await db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, age) VALUES (?, 'u-a', 'family', 'Josef Kopecký', '', '{}', 42)").bind(managerId).run();
    expect((await foundYouthTeam(db, createRng(30), "family", GAME_DATE)).ok).toBe(true);
    const son = await db.prepare("SELECT id, last_name, age, commitment FROM youth_prospects WHERE team_id = 'family' AND coach_son = 1").first<{ id: string; last_name: string; age: number; commitment: number }>();
    expect(son).toMatchObject({ last_name: "Kopecký", age: 12, commitment: 95 });
    const view = await loadAcademyView(db, "family");
    expect(view!.prospects.find((p) => p.id === son!.id)!.coachSon).toBe(true);
    // Na konci sezóny se znovu nepřidá
    await setYouthCoach(db, "family", { type: "parent" });
    await seasonEndAcademy(db, createRng(31), "family", GAME_DATE);
    const sons = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE team_id = 'family' AND coach_son = 1").first<{ n: number }>();
    expect(sons!.n).toBe(1);
    expect((await poachAction(db, createRng(32), "big", son!.id, "invite", GAME_DATE)).ok).toBe(false);
  });
});
