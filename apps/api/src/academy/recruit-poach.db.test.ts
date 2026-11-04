/**
 * Kde vzít nové kluky (Miniflare D1 se všemi migracemi): náborový den, kluci z okolních obcí
 * bez akademie a přetahování nadějných žáků mezi kluby s letním přestupem za odstupné.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { foundYouthTeam, setYouthCoach, recruitDay, seasonEndAcademy, poachAction, defendPoach, loadAcademyView, type ProspectRow } from "./service";

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

  it("v létě kluk se zájmem přestoupí za odstupné, bez zájmu zůstane", async () => {
    const [kid, second] = await prospects("small");
    await poachAction(db, createRng(7), "big", kid.id, "promise", GAME_DATE);
    await poachAction(db, createRng(7), "big", kid.id, "boots", GAME_DATE);
    // Druhého kluka jeho klub ubrání: zájem pod hranicí
    const incoming = (await loadAcademyView(db, "small"))!.poach!.incoming;
    const other = incoming.find((y) => y.name === `${second.first_name} ${second.last_name}`);
    if (other) expect((await defendPoach(db, "small", other.poachId)).ok).toBe(true);
    await db.prepare("UPDATE youth_poach SET interest = 80 WHERE prospect_id = ?").bind(kid.id).run();
    await db.prepare("UPDATE youth_poach SET interest = 10 WHERE prospect_id = ?").bind(second.id).run();

    await seasonEndAcademy(db, createRng(8), "small", GAME_DATE);
    const moved = await db.prepare("SELECT team_id FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ team_id: string }>();
    expect(moved!.team_id).toBe("big");
    const stayed = await db.prepare("SELECT team_id FROM youth_prospects WHERE id = ?").bind(second.id).first<{ team_id: string }>();
    expect(stayed!.team_id).toBe("small");
    const fee = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'small' AND type = 'transfer_income'").first<{ amount: number }>();
    expect(fee!.amount).toBeGreaterThanOrEqual(6_500);
    // Rok ho nikdo přetahovat nemůže
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id, academy_upkeep) SELECT 'third', 'u-b', village_id, 'Slavoj', 100000, 50, game_date, 'lg', 1 FROM teams WHERE id = 'small'").run();
    expect((await poachAction(db, createRng(9), "third", kid.id, "invite", GAME_DATE)).ok).toBe(false);
  });
});
