/**
 * Žáci nad skutečným schématem (všechny migrace v Miniflare D1): nábor, týdenní růst,
 * nabídka do dorostu, přijetí do U21, puštění na trh a konec sezóny.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { acceptPlayerOffer } from "../services/player-offer-actions";
import {
  recruitClass, weeklyAcademy, createProspectOffer, releaseProspect, seasonEndAcademy, dailyAcademy, setAcademyProgram,
  setRecruitVillages, loadAcademyView, promoteProspect, seedFromLegacy, type ProspectRow,
} from "./service";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function prospects(teamId: string, status = "active"): Promise<ProspectRow[]> {
  return (await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = ? ORDER BY age DESC").bind(teamId, status).all<ProspectRow>()).results;
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  // Největší obec okresu, ať nábor ve vlastní obci určitě někoho přivede
  const town = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 1").first<{ id: string }>();
  const other = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 1 OFFSET 5").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-h', 'h@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, academy_upkeep) VALUES ('club', 'u-h', ?, 'Jiskra', 100000, 50, ?, 1)").bind(town!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, parent_team_id, team_type) VALUES ('club-u21', 'u-h', ?, 'Jiskra U21', 0, 50, ?, 'club', 'u21')").bind(town!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, youth_investment) VALUES ('legacy', 'ai', ?, 'Sokol', 100000, 50, ?, 'high')").bind(other!.id, GAME_DATE),
  ]);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("žáci", () => {
  it("letní nábor přivede dvanáctileté z vlastní obce", async () => {
    const created = await recruitClass(db, createRng(1), "club", GAME_DATE);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((p) => p.age === 12)).toBe(true);
    expect((await prospects("club")).length).toBe(created.length);
  });

  it("nábor jen v obcích do 8 km, za každou další obec se platí", async () => {
    const view = await loadAcademyView(db, "club");
    const near = view!.villages.filter((v) => !v.own).slice(0, 2).map((v) => v.id);
    expect((await setRecruitVillages(db, "club", near)).ok).toBe(true);
    const far = await db.prepare("SELECT id FROM villages WHERE district != 'Prachatice' AND lat IS NOT NULL LIMIT 1").first<{ id: string }>();
    expect((await setRecruitVillages(db, "club", [far!.id])).ok).toBe(false);
  });

  it("týden zaplatí zázemí a kluky posune", async () => {
    await setAcademyProgram(db, "club", { upkeep: true, hall: true });
    const before = (await prospects("club"))[0];
    await weeklyAcademy(db, "club", GAME_DATE, 1);
    const after = (await prospects("club")).find((p) => p.id === before.id)!;
    expect(after.progress_current).toBeGreaterThan(before.progress_current);
    expect(after.progress_cap).toBeGreaterThan(before.progress_cap);
    const tx = await db.prepare("SELECT amount, description FROM transactions WHERE team_id = 'club' AND type = 'youth_academy' ORDER BY rowid DESC LIMIT 1").first<{ amount: number; description: string }>();
    expect(tx!.amount).toBe(-1300);
    expect(tx!.description).toContain("hala");
  });

  it("dvanáctiletého do dorostu vytáhnout nejde", async () => {
    const kid = (await prospects("club"))[0];
    const res = await createProspectOffer(db, "club", kid.id, GAME_DATE, { notify: true });
    expect(res.ok).toBe(false);
  });

  it("patnáctiletého trenér nabídne, přijetí ho dá do U21 jako odchovance", async () => {
    const kid = (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 15, progress_current = 6, progress_cap = 12 WHERE id = ?").bind(kid.id).run();
    const offer = await createProspectOffer(db, "club", kid.id, GAME_DATE, { notify: true });
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    const sms = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'club' AND c.title = 'Žáci'").first<{ body: string }>();
    expect(sms!.body).toContain(kid.last_name);

    const res = await acceptPlayerOffer(db, "club", offer.offerId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const player = await db.prepare("SELECT team_id, raised_by_team_id, age FROM players WHERE id = ?").bind(res.playerId).first<{ team_id: string; raised_by_team_id: string; age: number }>();
    expect(player).toEqual({ team_id: "club-u21", raised_by_team_id: "club", age: 15 });
    const contract = await db.prepare("SELECT join_type, team_id FROM player_contracts WHERE player_id = ?").bind(res.playerId).first<{ join_type: string; team_id: string }>();
    expect(contract).toEqual({ join_type: "youth", team_id: "club-u21" });
    const p = await db.prepare("SELECT status, player_id FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ status: string; player_id: string }>();
    expect(p).toEqual({ status: "promoted", player_id: res.playerId });
  });

  it("ruční vytažení jde stejnou cestou", async () => {
    const kid = (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 15 WHERE id = ?").bind(kid.id).run();
    const res = await promoteProspect(db, "club", kid.id);
    expect(res.ok).toBe(true);
    expect((await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ status: string }>())!.status).toBe("promoted");
  });

  it("dvě souběžná vytažení stejného kluka založí jen jednoho hráče", async () => {
    const extra = await recruitClass(db, createRng(21), "club", GAME_DATE);
    const kid = extra[0] ?? (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 15 WHERE id = ?").bind(kid.id).run();
    const results = await Promise.all([promoteProspect(db, "club", kid.id), promoteProspect(db, "club", kid.id)]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    const players = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE first_name = ? AND last_name = ? AND raised_by_team_id = 'club'")
      .bind(kid.first_name, kid.last_name).first<{ n: number }>();
    expect(players!.n).toBe(1);
  });

  it("nabídku kluka, kterého klub mezitím pustil, už přijmout nejde", async () => {
    const extra = await recruitClass(db, createRng(22), "club", GAME_DATE);
    const kid = extra[0] ?? (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 15 WHERE id = ?").bind(kid.id).run();
    const offer = await createProspectOffer(db, "club", kid.id, GAME_DATE, { notify: false });
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    // Pustit ho zvenku tak, jak by to udělal souběžný požadavek mezi nabídkou a přijetím
    await db.prepare("UPDATE youth_prospects SET status = 'released' WHERE id = ?").bind(kid.id).run();
    const res = await acceptPlayerOffer(db, "club", offer.offerId);
    expect(res.ok).toBe(false);
    expect((await releaseProspect(db, "club", kid.id)).ok).toBe(false);
  });

  it("puštěný patnáctiletý jde na trh jako volný hráč", async () => {
    const kid = (await prospects("club"))[0];
    if (!kid) return;
    await db.prepare("UPDATE youth_prospects SET age = 15 WHERE id = ?").bind(kid.id).run();
    expect((await releaseProspect(db, "club", kid.id)).ok).toBe(true);
    const fa = await db.prepare("SELECT source, released_from_team_id, age FROM free_agents WHERE last_name = ? AND first_name = ?").bind(kid.last_name, kid.first_name).first<{ source: string; released_from_team_id: string; age: number }>();
    expect(fa).toEqual({ source: "released", released_from_team_id: "club", age: 15 });
  });

  it("denní tick nabídne kluka, jehož den přišel, a podruhé ne", async () => {
    const created = await recruitClass(db, createRng(5), "club", GAME_DATE);
    const kid = created[0] ?? (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 15, next_offer_on = '2026-11-01' WHERE id = ?").bind(kid.id).run();
    expect((await dailyAcademy(db, createRng(2), "club", GAME_DATE)).offered).toBe(1);
    expect((await dailyAcademy(db, createRng(2), "club", GAME_DATE)).offered).toBe(0);
    const next = await db.prepare("SELECT next_offer_on FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ next_offer_on: string }>();
    expect(next!.next_offer_on > "2026-11-20").toBe(true);
  });

  it("konec sezóny: šestnáctiletý odejde, ostatní zestárnou, přijde nový ročník", async () => {
    const all = await prospects("club");
    await db.prepare("UPDATE youth_prospects SET age = 16, commitment = 90 WHERE id = ?").bind(all[0].id).run();
    const young = all.filter((p) => p.id !== all[0].id);
    await db.prepare("UPDATE youth_prospects SET commitment = 95 WHERE team_id = 'club' AND status = 'active' AND id != ?").bind(all[0].id).run();
    await seasonEndAcademy(db, createRng(9), "club", GAME_DATE);
    expect((await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(all[0].id).first<{ status: string }>())!.status).toBe("aged_out");
    const now = await prospects("club");
    for (const p of young) {
      const row = now.find((x) => x.id === p.id);
      if (row) expect(row.age).toBe(p.age + 1);
    }
    expect(now.some((p) => p.age === 12)).toBe(true);
    const sms = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'club' AND c.title = 'Žáci' ORDER BY m.rowid DESC LIMIT 1").first<{ body: string }>();
    expect(sms!.body).toContain("Konec sezóny u žáků");
  });

  it("přechod ze staré velkorysé akademie dá rozjetou partu, podruhé nic", async () => {
    const first = await seedFromLegacy(db, "legacy", GAME_DATE);
    expect(first.created).toBe(14);
    const team = await db.prepare("SELECT academy_upkeep, academy_hall, academy_bus FROM teams WHERE id = 'legacy'").first();
    expect(team).toEqual({ academy_upkeep: 1, academy_hall: 1, academy_bus: 1 });
    const older = (await prospects("legacy")).filter((p) => p.age >= 14);
    expect(older.every((p) => p.progress_current > 0)).toBe(true);
    expect((await seedFromLegacy(db, "legacy", GAME_DATE)).created).toBe(0);
  });
});
