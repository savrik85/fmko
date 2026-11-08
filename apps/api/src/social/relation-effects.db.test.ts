/**
 * Socky a vztahy trenérů: vyznění textu (model je tu nahrazený pevnou odpovědí),
 * strop na den, jednorázové započtení a lajk jednou denně.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import {
  applySocialJournalistEffects, applySocialLike, applySocialToneEffects, capDelta, journalistShift, momentText,
  relationTargets, textMentionsClub, type SocialTone, type ToneClassifier,
} from "./relation-effects";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, lat REAL, lng REAL)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT)",
    `CREATE TABLE manager_relations (team_a_id TEXT NOT NULL, team_b_id TEXT NOT NULL, respect INTEGER NOT NULL DEFAULT 0,
      heat INTEGER NOT NULL DEFAULT 0, history TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (team_a_id, team_b_id))`,
    "CREATE TABLE journalists (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, nickname TEXT, style TEXT)",
    `CREATE TABLE journalist_relations (id TEXT PRIMARY KEY, journalist_id TEXT NOT NULL, team_id TEXT NOT NULL,
      sentiment INTEGER NOT NULL DEFAULT 0, duvod TEXT NOT NULL DEFAULT '', updated_at TEXT, UNIQUE(journalist_id, team_id))`,
  ]) await db.prepare(sql).run();
  const migration = readFileSync(resolve(__dirname, "../../migrations/0291_social_relation_effects.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();
  await db.batch([
    // Vesnice daleko od sebe: vztah začíná na nule, bez sousedského napětí.
    db.prepare("INSERT INTO villages VALUES ('v1', 49.0, 14.0), ('v2', 50.5, 15.5)"),
    db.prepare("INSERT INTO teams VALUES ('t-spule', 'AC Jitona Spůle', 'v1'), ('t-kavo', 'FC Kávoviny Vlachovo Březí', 'v2')"),
    db.prepare(`INSERT INTO journalists VALUES
      ('j-ser', 'Jaromír', 'Reindl', NULL, 'seriozni'),
      ('j-bul', 'Řehoř', 'Tesař', 'Fanda', 'bulvar')`),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM manager_relations").run();
  await db.prepare("DELETE FROM social_relation_effects").run();
  await db.prepare("DELETE FROM journalist_relations").run();
});

const always = (tone: SocialTone): ToneClassifier & { calls: number } => {
  const fn = Object.assign(async () => { fn.calls += 1; return tone; }, { calls: 0 });
  return fn;
};

const relation = () => db.prepare("SELECT respect, heat, history FROM manager_relations").first<{ respect: number; heat: number; history: string }>();

const tease = (n: number) => ({
  authorTeamId: "t-spule", authorName: "Zdeněk J.", text: "@FC Kávoviny Vlachovo Březí kdyby ne tak aspoň bude příspěvek do kasy :)",
  sourceKey: `comment:c${n}`, context: "příspěvek trenéra Vladimír K.", targetTeamIds: ["t-kavo"],
});

describe("cíle a strop", () => {
  it("cíl bez autora, bez prázdných, každý klub jednou, nejvýš tři", () => {
    expect(relationTargets("me", ["a", null, "me", "a", "b", undefined, "c", "d"])).toEqual(["a", "b", "c"]);
  });

  it("strop pustí jen to, co ze dne zbývá, a zachová znaménko", () => {
    expect(capDelta(5, 0)).toBe(5);
    expect(capDelta(5, 8)).toBe(2);
    expect(capDelta(-8, 6)).toBe(-4);
    expect(capDelta(4, 10)).toBe(0);
  });

  it("komentář pod článkem míří na klub, jen když ho jmenuje", () => {
    expect(textMentionsClub("Kunraticím to v sobotu nandáme", "Hvězda Kunratice")).toBe(true);
    expect(textMentionsClub("Další bulvární blábol od paní Jelínkové", "Test Klamovka")).toBe(false);
    expect(textMentionsClub("Hvězda zase prohrála", "Hvězda Kunratice")).toBe(false);
    expect(textMentionsClub("Vimperk je letos silnej", "FK Engel Vimperk")).toBe(true);
  });

  it("záznam v historii bez rodu a s ukázkou textu", () => {
    expect(momentText("Zdeněk J.", "Jsme ready!")).toBe("Zdeněk J. v Sockách: „Jsme ready!“");
  });
});

describe("vyznění textu mění vztah", () => {
  it("rýpnutí přidá napětí, vezme kapku respektu a zapíše se do historie", async () => {
    expect(await applySocialToneEffects(db, always("tease"), tease(1))).toBe(1);
    const r = await relation();
    expect(r).toMatchObject({ respect: -1, heat: 5 });
    expect(JSON.parse(r!.history)[0]).toMatchObject({ icon: "😏", text: expect.stringContaining("v Sockách: „@FC Kávoviny") });
  });

  it("stejný komentář se nezapočítá dvakrát a model se podruhé neptá", async () => {
    const cls = always("praise");
    await applySocialToneEffects(db, cls, tease(1));
    await applySocialToneEffects(db, cls, tease(1));
    expect(cls.calls).toBe(1);
    expect(await relation()).toMatchObject({ respect: 4, heat: 0 });
  });

  it("denní strop: urážky za den nepohnou o víc než 10", async () => {
    for (let i = 1; i <= 4; i++) await applySocialToneEffects(db, always("insult"), tease(i));
    expect(await relation()).toMatchObject({ respect: -10, heat: 10 });
  });

  it("neutrální text vztah nemění, ale už se znovu nehodnotí", async () => {
    const cls = always("neutral");
    expect(await applySocialToneEffects(db, cls, tease(1))).toBe(0);
    await applySocialToneEffects(db, cls, tease(1));
    expect(cls.calls).toBe(1);
    expect(await relation()).toBeNull();
  });
});

describe("souběžné žádosti strop neobejdou", () => {
  it("deset urážek naráz zapíše nejvýš strop a vztahem nepohne víc", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => applySocialToneEffects(db, always("insult"), tease(100 + i))));
    const sum = await db.prepare("SELECT SUM(ABS(respect)) AS r, SUM(heat) AS h FROM social_relation_effects").first<{ r: number; h: number }>();
    expect(sum).toEqual({ r: 10, h: 10 });
    // applyRelationEvent čte a zapisuje zvlášť, souběžně se část posunů ztratí; víc než strop ale nikdy.
    const r = await relation();
    expect(Math.abs(r!.respect)).toBeLessThanOrEqual(10);
    expect(r!.heat).toBeLessThanOrEqual(10);
  });

  it("pět lajků naráz je jeden lajk", async () => {
    const like = (key: string) => ({ likerTeamId: "t-spule", likerName: "Zdeněk J.", ownerTeamId: "t-kavo", targetKey: key, snippet: "x" });
    const results = await Promise.all(["post:a", "post:b", "post:c", "post:d", "post:e"].map((k) => applySocialLike(db, like(k))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await relation()).toMatchObject({ respect: 1 });
  });
});

describe("lajk", () => {
  const like = (key: string) => ({ likerTeamId: "t-spule", likerName: "Zdeněk J.", ownerTeamId: "t-kavo", targetKey: key, snippet: "těšíme se do Chluman" });

  it("lajk přidá respekt jednou denně za dvojici, vlastní nic", async () => {
    expect(await applySocialLike(db, like("post:p1"))).toBe(true);
    expect(await applySocialLike(db, like("post:p2"))).toBe(false);
    expect(await applySocialLike(db, { ...like("post:p3"), ownerTeamId: "t-spule" })).toBe(false);
    const r = await relation();
    expect(r).toMatchObject({ respect: 1, heat: 0 });
    expect(JSON.parse(r!.history)[0]).toMatchObject({ icon: "👍", text: "Zdeněk J. dává v Sockách lajk: „těšíme se do Chluman“" });
  });
});

describe("novináři", () => {
  const sentiment = async (id: string) =>
    (await db.prepare("SELECT sentiment, duvod FROM journalist_relations WHERE journalist_id = ? AND team_id = 't-spule'").bind(id).first<{ sentiment: number; duvod: string }>());
  const comment = (n: number, journalistIds: string[]) => ({
    authorTeamId: "t-spule", text: "Hlavně ať o tom nepíše pak zasse Drahomíra :D", sourceKey: `comment:j${n}`,
    context: "Spůle hostí Vimperk v zápase o první místo", journalistIds,
  });

  it("rýpnutí seriózního novináře naštve, bulvárnímu se líbí", async () => {
    expect(journalistShift("tease", "seriozni")).toBe(-3);
    expect(journalistShift("tease", "bulvar")).toBe(2);
    expect(journalistShift("insult", "bulvar")).toBe(-10);
    expect(journalistShift("neutral", null)).toBe(0);
    expect(await applySocialJournalistEffects(db, always("tease"), comment(1, ["j-ser", "j-bul"]))).toBe(2);
    expect((await sentiment("j-ser"))?.sentiment).toBe(-3);
    expect(await sentiment("j-bul")).toMatchObject({ sentiment: 2, duvod: "Socky: „Hlavně ať o tom nepíše pak zasse Drahomíra :D“" });
  });

  it("stejný komentář jen jednou a za den nejvýš strop", async () => {
    const cls = always("insult");
    await applySocialJournalistEffects(db, cls, comment(1, ["j-ser"]));
    await applySocialJournalistEffects(db, cls, comment(1, ["j-ser"]));
    expect(cls.calls).toBe(1);
    await applySocialJournalistEffects(db, cls, comment(2, ["j-ser"]));
    const stored = await db.prepare("SELECT SUM(respect) AS s FROM social_relation_effects WHERE team_a_id = 'j-ser'").first<{ s: number }>();
    expect(stored?.s).toBe(-10);
  });
});
