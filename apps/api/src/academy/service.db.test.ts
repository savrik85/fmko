/**
 * Žáci nad skutečným schématem (všechny migrace v Miniflare D1): založení družstva, trenér,
 * týdenní růst, kategorie výš, letní postup do dorostu, odstupné při odchodu z klubu bez dorostu.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { acceptPlayerOffer, publicOfferDetails } from "../services/player-offer-actions";
import { promotePlayerFromU21 } from "../services/u21-moves";
import {
  foundYouthTeam, closeYouthTeam, setYouthCoach, loadCoachOptions, weeklyAcademy, recommendPlayUp, promoteProspect,
  seasonEndAcademy, dailyAcademy, loadAcademyView, seedFromLegacy, volunteerCoachId, recruitDay, type ProspectRow,
} from "./service";

let mf: Miniflare;
let db: D1Database;
const GAME_DATE = "2026-11-02T05:00:00.000Z";

async function prospects(teamId: string, status = "active"): Promise<ProspectRow[]> {
  return (await db.prepare("SELECT * FROM youth_prospects WHERE team_id = ? AND status = ? ORDER BY age DESC, id").bind(teamId, status).all<ProspectRow>()).results;
}

async function addPlayer(id: string, teamId: string, age: number, leadership: number): Promise<void> {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
     VALUES (?, ?, 'Pepa', ?, ?, 'MID', 40, '{}', '{}', ?, '{}', '{}', 'active')`,
  ).bind(id, teamId, `Hráč${id}`, age, JSON.stringify({ leadership })).run();
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL ORDER BY population DESC LIMIT 4").all<{ id: string }>()).results;
  const small = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL AND population BETWEEN 1500 AND 4000 ORDER BY population LIMIT 1").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-h', 'h@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-n', 'n@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg', 'season-3', 'Prachatice', 'Okresní přebor', 'okresni_prebor')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('club', 'u-h', ?, 'Jiskra', 100000, 50, ?, 'lg')").bind(villages[0].id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, parent_team_id, team_type) VALUES ('club-u21', 'u-h', ?, 'Jiskra U21', 0, 50, ?, 'club', 'u21')").bind(villages[0].id, GAME_DATE),
    // Klub bez dorostu a soused s dorostem, kam jeho čtrnáctiletí odejdou
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, league_id) VALUES ('nou21', 'u-n', ?, 'Sokol', 100000, 50, ?, 'lg')").bind(small!.id, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, youth_investment) VALUES ('legacy', 'ai', ?, 'Slavoj', 100000, 50, ?, 'high')").bind(villages[2].id, GAME_DATE),
  ]);
  await addPlayer("vet", "club", 31, 80);
  await addPlayer("kid", "club", 22, 90);
  await addPlayer("vet2", "legacy", 33, 60);
}, 180_000);

afterAll(async () => { await mf?.dispose(); });

describe("nabídka hráče pro web", () => {
  it("kluk z dorostu: jen pásmo talentu, přesné číslo ani stropy ne", () => {
    const offer = (talent: number, prospectId: string | null = null, source = "youth") => publicOfferDetails({
      source, prospect_id: prospectId,
      personality: JSON.stringify({ discipline: 50, hiddenTalent: talent }),
      life_context: JSON.stringify({ morale: 50, skillsMax: { speed: { current: 20, maxPotential: 60 } } }),
    });
    expect(offer(35)).toEqual({ personality: { discipline: 50 }, lifeContext: { morale: 50 }, talentBand: "high" });
    expect(offer(18).talentBand).toBe("medium");
    expect(offer(17).talentBand).toBe("low");
    // Žák z akademie a dospělý z hospody pásmo nemají
    expect(offer(90, "prospect-1").talentBand).toBeNull();
    expect(offer(90, null, "pub").talentBand).toBeNull();
    expect(publicOfferDetails({ source: "pub", prospect_id: null, personality: "{", life_context: null })).toEqual({ personality: {}, lifeContext: {}, talentBand: null });
  });
});

describe("družstvo žáků", () => {
  it("založení přivede kluky 11–14 let hned, podruhé založit nejde", async () => {
    const res = await foundYouthTeam(db, createRng(1), "club", GAME_DATE);
    expect(res.ok).toBe(true);
    const kids = await prospects("club");
    expect(kids.length).toBeGreaterThanOrEqual(8);
    expect(new Set(kids.map((k) => k.age))).toEqual(new Set([11, 12, 13, 14]));
    expect((await foundYouthTeam(db, createRng(2), "club", GAME_DATE)).ok).toBe(false);
  });

  it("dobrovolník z áčka jen od 28 let; vybraný chodí méně na trénink", async () => {
    const options = await loadCoachOptions(db, "club");
    expect(options.volunteers.map((v) => v.playerId)).toEqual(["vet"]);
    expect(options.parent).not.toBeNull();
    expect((await setYouthCoach(db, "club", { type: "volunteer", playerId: "kid" })).ok).toBe(false);
    expect((await setYouthCoach(db, "club", { type: "staff" })).ok).toBe(false);
    expect((await setYouthCoach(db, "club", { type: "volunteer", playerId: "vet" })).ok).toBe(true);
    expect(await volunteerCoachId(db, "club")).toBe("vet");
  });

  it("týden zaplatí provoz a kluky posune", async () => {
    const before = (await prospects("club"))[0];
    await weeklyAcademy(db, "club", GAME_DATE, 1);
    const after = (await prospects("club")).find((p) => p.id === before.id)!;
    expect(after.progress_current).toBeGreaterThan(before.progress_current);
    const tx = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'club' AND type = 'youth_academy' ORDER BY rowid DESC LIMIT 1").first<{ amount: number }>();
    // 300 Kč základ + 50 Kč za každého kluka
    expect(tx!.amount).toBe(-(300 + 50 * (await prospects("club")).length));
  });

  it("pohled ukazuje trenéra, kluky a kolik jich v létě postoupí", async () => {
    const view = await loadAcademyView(db, "club");
    expect(view!.founded).toBe(true);
    expect(view!.coach.type).toBe("volunteer");
    expect(view!.nextSummer).toBe((await prospects("club")).filter((p) => p.age === 14).length);
  });

  it("odhad talentu se přepnutím trenéra tam a zpátky nemění a drží se v mezích chyby", async () => {
    const estimates = async () => new Map((await loadAcademyView(db, "club"))!.prospects.map((p) => [p.id, p.potential?.estimate ?? null]));
    const first = await estimates();
    expect(await estimates()).toEqual(first);
    // Táta místo hráče áčka: oba odhadují bez úsudku trenéra mládeže, takže vidí totéž
    expect((await setYouthCoach(db, "club", { type: "parent" })).ok).toBe(true);
    expect(await estimates()).toEqual(first);
    expect((await setYouthCoach(db, "club", { type: "volunteer", playerId: "vet" })).ok).toBe(true);
    expect(await estimates()).toEqual(first);
    for (const p of await prospects("club")) {
      expect(Math.abs((first.get(p.id) ?? 0) - p.hidden_talent)).toBeLessThanOrEqual((16 - p.age) * 5);
    }
    // Příští sezónu trenér odhaduje znovu
    await db.prepare("UPDATE seasons SET number = 4 WHERE id = 'season-3'").run();
    const next = await estimates();
    await db.prepare("UPDATE seasons SET number = 3 WHERE id = 'season-3'").run();
    expect([...next.values()]).not.toEqual([...first.values()]);
  });

  it("čerstvě založená akademie: do dorostu smí žák až po 4 týdnech u žáků", async () => {
    const kid = (await prospects("club")).find((k) => k.age === 13)!;
    const blocked = await promoteProspect(db, "club", kid.id);
    expect(blocked).toMatchObject({ ok: false, status: 409, error: "U žáků musí být aspoň 4 týdny" });
    expect(await recommendPlayUp(db, "club", kid.id, GAME_DATE)).toMatchObject({ ok: false, status: 409, error: "U žáků musí být aspoň 4 týdny" });
    // Ani denní tick ho nedoporučí dřív, i když jeho den přišel
    await db.prepare("UPDATE youth_prospects SET next_offer_on = '2026-11-01' WHERE id = ?").bind(kid.id).run();
    expect((await dailyAcademy(db, "club", GAME_DATE)).offered).toBe(0);
    await db.prepare("UPDATE youth_prospects SET next_offer_on = NULL WHERE id = ?").bind(kid.id).run();
    expect((await prospects("club")).some((k) => k.id === kid.id)).toBe(true);
    expect((await loadAcademyView(db, "club"))!.prospects.find((k) => k.id === kid.id)!.playUpFrom).toBe("2026-11-30");
    // 27 dní nestačí, 28 ano
    await db.prepare("UPDATE youth_prospects SET joined_at = '2026-10-06' WHERE id = ?").bind(kid.id).run();
    expect((await promoteProspect(db, "club", kid.id)).ok).toBe(false);
    await db.prepare("UPDATE youth_prospects SET joined_at = '2026-10-05' WHERE team_id = 'club'").run();
    expect((await loadAcademyView(db, "club"))!.prospects.find((k) => k.id === kid.id)!.playUpFrom).toBeNull();
  });

  it("dvanáctiletého o kategorii výš nejde, třináctiletého ano a přijetí ho dá do U21", async () => {
    const kids = await prospects("club");
    const young = kids.find((k) => k.age <= 12)!;
    expect((await recommendPlayUp(db, "club", young.id, GAME_DATE)).ok).toBe(false);
    const older = kids.find((k) => k.age === 13)!;
    const offer = await recommendPlayUp(db, "club", older.id, GAME_DATE);
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    // Nabídka nese skrytý talent a stropy v DB, ale do odpovědi pro hráče nejdou
    const row = await db.prepare("SELECT source, prospect_id, personality, life_context FROM player_offers WHERE id = ?").bind(offer.offerId)
      .first<{ source: string; prospect_id: string; personality: string; life_context: string }>();
    expect(JSON.parse(row!.personality).hiddenTalent).toBe(older.hidden_talent);
    expect(Object.keys(JSON.parse(row!.life_context).skillsMax).length).toBeGreaterThan(5);
    const shown = publicOfferDetails(row!);
    expect(JSON.stringify(shown)).not.toMatch(/hiddenTalent|skillsMax|maxPotential/);
    expect(shown.talentBand).toBeNull();
    expect(shown.personality.patriotism).toBeTypeOf("number");
    const res = await acceptPlayerOffer(db, "club", offer.offerId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Přijetí je dál čte z DB: hráč má talent žáka i stropy rozvoje
    const hidden = await db.prepare("SELECT hidden_talent, skills_max FROM players WHERE id = ?").bind(res.playerId).first<{ hidden_talent: number; skills_max: string }>();
    expect(hidden!.hidden_talent).toBe(older.hidden_talent);
    expect(JSON.parse(hidden!.skills_max).speed.maxPotential).toBeGreaterThan(0);
    const player = await db.prepare("SELECT team_id, raised_by_team_id, age FROM players WHERE id = ?").bind(res.playerId).first();
    expect(player).toEqual({ team_id: "club-u21", raised_by_team_id: "club", age: 13 });
    // Čerstvý odchovanec: značka, podle které v nejbližším létě nedospívá; skryté stropy v life_context nejsou
    const ctx = await db.prepare("SELECT json_extract(life_context, '$.freshAcademyGraduate') AS fresh, json_extract(life_context, '$.skillsMax') AS caps FROM players WHERE id = ?")
      .bind(res.playerId).first<{ fresh: number | null; caps: string | null }>();
    expect(ctx).toEqual({ fresh: 1, caps: null });
  });

  it("dvě souběžná vytažení stejného kluka založí jen jednoho hráče", async () => {
    const kid = (await prospects("club")).find((k) => k.age >= 13)!;
    const results = await Promise.all([promoteProspect(db, "club", kid.id), promoteProspect(db, "club", kid.id)]);
    expect(results.filter((r) => r.ok).length).toBe(1);
    const n = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE first_name = ? AND last_name = ? AND raised_by_team_id = 'club'")
      .bind(kid.first_name, kid.last_name).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("denní tick doporučí kluka, jehož den přišel, jen jednou", async () => {
    const kid = (await prospects("club")).find((k) => k.age >= 13) ?? (await prospects("club"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 13, next_offer_on = '2026-11-01' WHERE id = ?").bind(kid.id).run();
    expect((await dailyAcademy(db, "club", GAME_DATE)).offered).toBe(1);
    expect((await dailyAcademy(db, "club", GAME_DATE)).offered).toBe(0);
  });

  it("konec sezóny: čtrnáctiletí do U21, ostatní o rok starší, noví jedenáctiletí, SMS", async () => {
    await db.prepare("UPDATE youth_prospects SET commitment = 95 WHERE team_id = 'club' AND status = 'active'").run();
    const before = await prospects("club");
    const oldest = before.filter((p) => p.age === 14);
    await seasonEndAcademy(db, createRng(9), "club", GAME_DATE);
    for (const p of oldest) {
      const row = await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(p.id).first<{ status: string }>();
      expect(row!.status).toBe("promoted");
    }
    const now = await prospects("club");
    for (const p of before.filter((x) => x.age < 14)) {
      const row = now.find((x) => x.id === p.id);
      if (row) expect(row.age).toBe(p.age + 1);
    }
    expect(now.some((p) => p.age === 11)).toBe(true);
    const sms = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'club' AND c.title = 'Žáci' ORDER BY m.rowid DESC LIMIT 1").first<{ body: string }>();
    expect(sms!.body).toContain("Konec sezóny u žáků");
  });

  it("klub bez dorostu: čtrnáctiletí jdou do nejbližšího klubu s dorostem, klub dostane odstupné", async () => {
    expect((await foundYouthTeam(db, createRng(4), "nou21", GAME_DATE)).ok).toBe(true);
    await setYouthCoach(db, "nou21", { type: "parent" });
    let oldest = (await prospects("nou21")).filter((p) => p.age === 14);
    if (oldest.length === 0) {
      const any = (await prospects("nou21"))[0];
      await db.prepare("UPDATE youth_prospects SET age = 14 WHERE id = ?").bind(any.id).run();
      oldest = [{ ...any, age: 14 }];
    }
    await seasonEndAcademy(db, createRng(5), "nou21", GAME_DATE);
    // Soused ho nemusí vzít: dostane nabídku, odstupné se zatím neplatí
    const offer = await db.prepare("SELECT id FROM player_offers WHERE team_id = 'club' AND status = 'pending' AND prospect_id = ?")
      .bind(oldest[0].id).first<{ id: string }>();
    expect(offer).not.toBeNull();
    const before = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 'nou21' AND type = 'transfer_income'").first<{ n: number }>();
    expect(before!.n).toBe(0);
    const res = await acceptPlayerOffer(db, "club", offer!.id);
    expect(res.ok).toBe(true);
    const player = await db.prepare("SELECT team_id, raised_by_team_id FROM players WHERE first_name = ? AND last_name = ?")
      .bind(oldest[0].first_name, oldest[0].last_name).first();
    expect(player).toEqual({ team_id: "club-u21", raised_by_team_id: "nou21" });
    const fee = await db.prepare("SELECT SUM(amount) AS s FROM transactions WHERE team_id = 'nou21' AND type = 'transfer_income'").first<{ s: number }>();
    expect(fee!.s).toBe(8_000);
    const paid = await db.prepare("SELECT SUM(amount) AS s FROM transactions WHERE team_id = 'club' AND type = 'transfer_fee'").first<{ s: number }>();
    expect(paid!.s).toBe(-8_000);
  });

  it("FAČR: z U21 do áčka až od 15 let, klub bez dorostu kluka o kategorii výš nepošle", async () => {
    const young = await db.prepare("SELECT id, age FROM players WHERE team_id = 'club-u21' AND age < 15 LIMIT 1").first<{ id: string; age: number }>();
    expect(young).not.toBeNull();
    const blocked = await promotePlayerFromU21(db, "club", young!.id);
    expect(blocked.ok).toBe(false);
    await db.prepare("UPDATE players SET age = 15 WHERE id = ?").bind(young!.id).run();
    expect((await promotePlayerFromU21(db, "club", young!.id)).ok).toBe(true);

    const kid = (await prospects("nou21")).find((k) => k.age >= 13) ?? (await prospects("nou21"))[0];
    await db.prepare("UPDATE youth_prospects SET age = 13 WHERE id = ?").bind(kid.id).run();
    expect((await promoteProspect(db, "nou21", kid.id)).ok).toBe(false);
    expect((await recommendPlayUp(db, "nou21", kid.id, GAME_DATE)).ok).toBe(false);
    const still = await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ status: string }>();
    expect(still!.status).toBe("active");
  });

  it("čtrnáctiletý z klubu bez dorostu, kterého soused nevzal, nezůstane viset", async () => {
    // Nabídka propadla bez přijetí (soused odmítl nebo mlčel): kluk v 'leaving' bez nabídky
    await db.prepare("UPDATE player_offers SET status = 'rejected' WHERE status = 'pending' AND prospect_id IN (SELECT id FROM youth_prospects WHERE team_id = 'nou21' AND status = 'leaving')").run();
    const kid = (await prospects("nou21"))[0];
    await db.prepare("UPDATE youth_prospects SET status = 'leaving' WHERE id = ?").bind(kid.id).run();
    await dailyAcademy(db, "nou21", GAME_DATE);
    const row = await db.prepare("SELECT status FROM youth_prospects WHERE id = ?").bind(kid.id).first<{ status: string }>();
    expect(row!.status).toBe("quit");
  });

  it("zrušení: kluci končí a založit znovu jde až příští sezónu", async () => {
    const res = await closeYouthTeam(db, "nou21", GAME_DATE);
    expect(res.ok).toBe(true);
    expect((await prospects("nou21")).length).toBe(0);
    const again = await foundYouthTeam(db, createRng(6), "nou21", GAME_DATE);
    expect(again.ok).toBe(false);
    expect((await prospects("nou21")).length).toBe(0);
  });

  it("přechod ze staré velkorysé akademie: žáci hned, s dobrovolníkem, podruhé nic", async () => {
    const first = await seedFromLegacy(db, "legacy", GAME_DATE);
    expect(first.created).toBeGreaterThan(0);
    const team = await db.prepare("SELECT academy_upkeep, academy_coach_type, academy_coach_player_id FROM teams WHERE id = 'legacy'").first();
    expect(team).toEqual({ academy_upkeep: 1, academy_coach_type: "volunteer", academy_coach_player_id: "vet2" });
    const older = (await prospects("legacy")).filter((p) => p.age >= 13);
    expect(older.every((p) => p.progress_current > 0)).toBe(true);
    expect((await seedFromLegacy(db, "legacy", GAME_DATE)).created).toBe(0);
  });

  it("přechod v osadě: klub, co do akademie platil, dostane aspoň minimum žáků a brankáře", async () => {
    const hamlet = await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' AND lat IS NOT NULL AND population < 250 ORDER BY population LIMIT 1").first<{ id: string }>();
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date, youth_investment) VALUES ('hamlet', 'ai', ?, 'Družstevník', 500, 50, ?, 'medium')").bind(hamlet!.id, GAME_DATE).run();
    const res = await seedFromLegacy(db, "hamlet", GAME_DATE);
    const kids = await prospects("hamlet");
    expect(res.created).toBeGreaterThanOrEqual(6);
    expect(kids.length).toBe(res.created);
    expect(kids.some((k) => k.position === "GK")).toBe(true);
    // Bez hráčů áčka vede žáky táta, ne potichu dosazený trenér mládeže
    expect((await db.prepare("SELECT academy_coach_type AS t FROM teams WHERE id = 'hamlet'").first<{ t: string }>())?.t).toBe("parent");
    // Rozpočet 500 Kč na sezónu akademie nestačí: stránka varuje
    const view = await loadAcademyView(db, "hamlet");
    expect(view!.budgetWarning).not.toBeNull();
    expect(view!.budgetWarning!.weeks).toBe(0);
    expect((await loadAcademyView(db, "club"))!.budgetWarning).toBeNull();
  });

  it("stránka akademie nečeká na desítky dotazů za sebou (každý dotaz na D1 je cesta po síti)", { timeout: 30_000 }, async () => {
    // Každý dotaz zpomalený o 100 ms: měří se, kolikrát za sebou se čeká na databázi, ne rychlost
    // procesoru (CI je pomalejší). Se 42 dotazy za sebou to dřív trvalo přes 4 s, teď ~7 vln.
    const DELAY = 100;
    let queries = 0;
    const slow = (st: D1PreparedStatement): D1PreparedStatement => new Proxy(st, {
      get(target, prop) {
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop === "bind") return (...a: unknown[]) => slow((v as (...x: unknown[]) => D1PreparedStatement).apply(target, a));
        if (prop === "first" || prop === "all" || prop === "run") {
          return async (...a: unknown[]) => { queries++; await new Promise((r) => setTimeout(r, DELAY)); return (v as (...x: unknown[]) => unknown).apply(target, a); };
        }
        return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(target) : v;
      },
    });
    const slowDb = new Proxy(db, {
      get(target, prop) {
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        if (prop === "prepare") return (sql: string) => slow((v as (q: string) => D1PreparedStatement).call(target, sql));
        return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(target) : v;
      },
    }) as D1Database;
    await loadAcademyView(slowDb, "club"); // mezipaměť příjmení okresu
    queries = 0;
    const t0 = Date.now();
    const view = await loadAcademyView(slowDb, "club");
    const ms = Date.now() - t0;
    expect(view!.founded).toBe(true);
    expect(queries).toBeLessThanOrEqual(30);
    expect(ms).toBeLessThan(15 * DELAY);
  });

  it("pod 9 žáky jde nábor opakovat jednou za týden, od 9 jednou za sezónu", async () => {
    // Osada z předchozího testu: 6 žáků, táta jako trenér
    await db.prepare("UPDATE teams SET budget = 100000 WHERE id = 'hamlet'").run();
    const at = (d: number) => new Date(Date.parse(GAME_DATE) + d * 86_400_000).toISOString();
    expect((await recruitDay(db, createRng(31), "hamlet", at(0))).ok).toBe(true);
    const again = await recruitDay(db, createRng(32), "hamlet", at(3));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain("7 dnech");
    const view = await loadAcademyView(db, "hamlet");
    expect(view!.recruitDay.repeatable).toBe((await prospects("hamlet")).length < 9);
    if (view!.recruitDay.repeatable) expect(view!.recruitDay.nextOn).not.toBeNull();
    // Po týdnu znovu (dokud je pod 9)
    if ((await prospects("hamlet")).length < 9) expect((await recruitDay(db, createRng(33), "hamlet", at(7))).ok).toBe(true);
    // Doplnit na 9 a víc: platí jednou za sezónu, a ta už je spotřebovaná
    const missing = 9 - (await prospects("hamlet")).length;
    for (let i = 0; i < missing; i++) {
      await db.prepare(
        `INSERT INTO youth_prospects (id, team_id, first_name, last_name, age, position, home_village_id, identity_seed, hidden_talent, gem_cap,
           progress_current, progress_cap, estimate_offset, traits, commitment, status, joined_at)
         SELECT ?, 'hamlet', 'Test', 'Žák', 12, 'MID', village_id, ?, 20, 0, 0, 0, 0, '[]', 70, 'active', ? FROM teams WHERE id = 'hamlet'`,
      ).bind(`fill-${i}`, 1000 + i, GAME_DATE).run();
    }
    expect((await loadAcademyView(db, "hamlet"))!.recruitDay.repeatable).toBe(false);
    const season = await recruitDay(db, createRng(34), "hamlet", at(20));
    expect(season.ok).toBe(false);
    if (!season.ok) expect(season.error).toContain("letos");
  });
});
