import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { createRng } from "../generators/rng";
import {
  closeDemandsForArrival, createDemand, demandRatingThreshold, demandSummary, generateClubDemands, listDemands, parseDemandInput, pitchPlayer, withdrawDemand,
} from "./demands";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => { await miniflare.dispose(); });

const runMigration = async (file: string, cut?: string) => {
  let sql = readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
  if (cut) sql = sql.split(cut)[0];
  for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
};

beforeEach(async () => {
  for (const t of ["transfer_demands", "transfer_demand_pitches", "player_promises", "transfer_offers", "messages", "conversations", "players", "teams", "leagues", "club_links"]) {
    await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  await db.prepare("CREATE TABLE leagues (id TEXT PRIMARY KEY, district TEXT, name TEXT)").run();
  await runMigration("0273_club_links.sql");
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, league_id TEXT, parent_team_id TEXT, village_id TEXT)").run();
  await db.prepare(
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nationality TEXT, age INTEGER, position TEXT,
     overall_rating INTEGER, status TEXT, loan_from_team_id TEXT, is_celebrity INTEGER DEFAULT 0, life_context TEXT, personality TEXT, skills TEXT)`,
  ).run();
  await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER, last_message_text TEXT, last_message_at TEXT, created_at TEXT)").run();
  await db.prepare("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)").run();
  await db.prepare(
    `CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, player_id TEXT, from_team_id TEXT, to_team_id TEXT, offer_amount INTEGER, offer_type TEXT,
     status TEXT, message TEXT, virtual_team_data TEXT, player_interest INTEGER, expires_at TEXT, created_at TEXT)`,
  ).run();
  await runMigration("0268_player_promises.sql", "-- Sliby, které už běží");
  await runMigration("0269_transfer_demands.sql");
  await runMigration("0270_transfer_demand_skills.sql");

  await db.prepare("INSERT INTO leagues VALUES ('LP', 'Prachatice', 'Okresní přebor'), ('LP3', 'Prachatice', 'III. třída'), ('LPU', 'Prachatice U21', 'U21'), ('LPR', 'Praha', 'Pražský přebor')").run();
  await db.prepare(
    `INSERT INTO teams VALUES ('A', 'FC Alfa', 'u1', 'LP', NULL, NULL), ('A21', 'FC Alfa U21', 'u1', 'LPU', 'A', NULL),
     ('B', 'SK Beta', 'u2', 'LP3', NULL, NULL), ('C', 'TJ Gama', 'u3', 'LPR', NULL, NULL), ('A2', 'Alfa Praha', 'u1', 'LPR', NULL, NULL)`,
  ).run();
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES
     ('b1', 'B', 'Petr', 'Novák', 24, 'MID', 55), ('b2', 'B', 'Karel', 'Dvořák', 31, 'MID', 40),
     ('b3', 'B', 'Josef', 'Černý', 22, 'FWD', 50), ('b4', 'B', 'Jan', 'Malý', 23, 'MID', 48),
     ('a1', 'A', 'Tomáš', 'Svoboda', 25, 'MID', 52), ('y1', 'A21', 'Adam', 'Mladý', 17, 'MID', 44)`,
  ).run();
});

const input = (over: Partial<Record<string, unknown>> = {}) => {
  const r = parseDemandInput({ position: "MID", ageMin: 18, ageMax: 28, role: "starter", maxPrice: 40000, note: "Hledáme záložníka", ...over });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("zadání poptávky", () => {
  it("kontroluje post, věk, cenu a délku poznámky", () => {
    expect(parseDemandInput({ position: "XX", ageMin: 18, ageMax: 25, role: "starter" }).ok).toBe(false);
    expect(parseDemandInput({ position: "MID", ageMin: 26, ageMax: 25, role: "starter" }).ok).toBe(false);
    expect(parseDemandInput({ position: "MID", ageMin: 12, ageMax: 25, role: "starter" }).ok).toBe(false);
    expect(parseDemandInput({ position: "MID", ageMin: 18, ageMax: 25, role: "boss" }).ok).toBe(false);
    expect(parseDemandInput({ position: "MID", ageMin: 18, ageMax: 25, role: "squad", maxPrice: -5 }).ok).toBe(false);
    expect(parseDemandInput({ position: "MID", ageMin: 18, ageMax: 25, role: "squad", note: "x".repeat(141) }).ok).toBe(false);
    const ok = parseDemandInput({ position: "MID", ageMin: 18, ageMax: 25, role: "squad", maxPrice: "", note: "  a   b " });
    expect(ok).toEqual({ ok: true, value: { position: "MID", ageMin: 18, ageMax: 25, role: "squad", maxPrice: null, note: "a b", minRating: null, skills: [] } });
    const base = { position: "MID", ageMin: 18, ageMax: 25, role: "squad" };
    expect(parseDemandInput({ ...base, minRating: 99 }).ok).toBe(false);
    expect(parseDemandInput({ ...base, skills: [{ skill: "flying", min: 50 }] }).ok).toBe(false);
    expect(parseDemandInput({ ...base, skills: [{ skill: "speed", min: 50 }, { skill: "speed", min: 60 }] }).ok).toBe(false);
    expect(parseDemandInput({ ...base, skills: [{ skill: "speed", min: 50 }, { skill: "heading", min: 50 }, { skill: "defense", min: 50 }] }).ok).toBe(false);
    expect(parseDemandInput({ ...base, minRating: "45", skills: [{ skill: "speed", min: "60" }] }))
      .toMatchObject({ ok: true, value: { minRating: 45, skills: [{ skill: "speed", min: 60 }] } });
  });

  it("souhrn bez dlouhé pomlčky", () => {
    expect(demandSummary({ position: "MID", ageMin: 18, ageMax: 25, role: "starter" })).toBe("záložníka do základu (18 až 25 let)");
    expect(demandSummary({ position: "GK", ageMin: 16, ageMax: 20, role: "prospect" })).toBe("mladého brankáře (do 20 let)");
  });

  it("nejvýš 3 najednou, stažená se nepočítá", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await createDemand(db, "A", input());
      if (r.ok) ids.push(r.id);
    }
    expect(ids).toHaveLength(3);
    expect((await createDemand(db, "A", input())).ok).toBe(false);
    expect(await withdrawDemand(db, "B", ids[0])).toBe(false); // cizí poptávku stáhnout nejde
    expect(await withdrawDemand(db, "A", ids[0])).toBe(true);
    expect((await createDemand(db, "A", input())).ok).toBe(true);
  });

  it("poptávka z U21 patří áčku", async () => {
    await createDemand(db, "A21", input());
    const row = await db.prepare("SELECT team_id FROM transfer_demands").first<{ team_id: string }>();
    expect(row?.team_id).toBe("A");
  });
});

describe("seznam poptávek", () => {
  it("cizí manažeři ano, vlastní a týmy téhož majitele ne; štítek odkud", async () => {
    await createDemand(db, "A", input());
    await createDemand(db, "A2", input()); // jiný tým stejného majitele
    await createDemand(db, "C", input());
    const forB = await listDemands(db, "B");
    expect(forB!.managers.map((d) => d.teamName).sort()).toEqual(["Alfa Praha", "FC Alfa", "TJ Gama"]);
    // Stejný okres, jiná soutěž → název soutěže; jiný okres → okres.
    expect(forB!.managers.find((d) => d.teamName === "FC Alfa")!.origin).toBe("Okresní přebor");
    expect(forB!.managers.find((d) => d.teamName === "TJ Gama")!.origin).toBe("Praha");

    const forA = await listDemands(db, "A");
    expect(forA!.mine).toHaveLength(1);
    expect(forA!.managers.map((d) => d.teamName)).toEqual(["TJ Gama"]);
    // Nabídnout může i hráče z U21.
    expect(forA!.pitchable.map((p) => p.id).sort()).toEqual(["a1", "y1"]);
  });
});

describe("nabídnutí hráče manažerovi", () => {
  it("hlídá post a věk, pošle zprávu do telefonu, dvakrát stejného ne, nejvýš 2", async () => {
    const d = await createDemand(db, "A", input({ ageMax: 30 }));
    if (!d.ok) throw new Error();
    const rng = createRng(1);
    expect(await pitchPlayer(db, "B", d.id, "b3", rng)).toMatchObject({ ok: false }); // útočník
    expect(await pitchPlayer(db, "B", d.id, "b2", rng)).toMatchObject({ ok: false }); // 31 let
    expect(await pitchPlayer(db, "B", d.id, "a1", rng)).toMatchObject({ ok: false }); // cizí hráč
    expect(await pitchPlayer(db, "A", d.id, "a1", rng)).toMatchObject({ ok: false }); // vlastní poptávka
    expect(await pitchPlayer(db, "B", d.id, "b1", rng)).toMatchObject({ ok: true, status: "pitched" });
    expect(await pitchPlayer(db, "B", d.id, "b1", rng)).toMatchObject({ ok: false });
    expect(await pitchPlayer(db, "B", d.id, "b4", rng)).toMatchObject({ ok: true });

    const sms = await db.prepare("SELECT m.body, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = 'A'").all<{ body: string; metadata: string }>();
    expect(sms.results).toHaveLength(2);
    expect(sms.results[0].body).toContain("SK Beta ti k poptávce na záložníka do základu (18 až 30 let) nabízí hráče Petr Novák (24 let)");
    expect(JSON.parse(sms.results[0].metadata)).toMatchObject({ type: "demand", demandId: d.id });

    const forA = await listDemands(db, "A");
    expect(forA!.mine[0].pitches.map((p) => p.playerName).sort()).toEqual(["Jan Malý", "Petr Novák"]);
    const forB = await listDemands(db, "B");
    expect(forB!.managers[0].myPitches).toHaveLength(2);
  });

  it("klubu se stejným majitelem (propojení od admina) hráče nenabídne", async () => {
    await db.prepare("INSERT INTO club_links (team_id, group_id) VALUES ('A', 'g'), ('B', 'g')").run();
    const d = await createDemand(db, "A", input());
    if (!d.ok) throw new Error();
    const res = await pitchPlayer(db, "B", d.id, "b1", createRng(1));
    expect(res).toMatchObject({ ok: false });
    expect(res.ok ? "" : res.error).toContain("stejným majitelem");
  });

  it("tři hráči najednou: strop 2 platí i při souběhu", async () => {
    const d = await createDemand(db, "A", input({ ageMax: 35 }));
    if (!d.ok) throw new Error();
    const res = await Promise.all(["b1", "b2", "b4"].map((pid, i) => pitchPlayer(db, "B", d.id, pid, createRng(10 + i))));
    expect(res.filter((r) => r.ok)).toHaveLength(2);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM transfer_demand_pitches").first<{ n: number }>())?.n).toBe(2);
  });

  it("hodnocení a dovednosti: projde jen hráč, který je splní; klub mimo hru práh nevyzradí", async () => {
    await db.prepare("UPDATE players SET skills = ? WHERE id = 'b1'").bind(JSON.stringify({ speed: 70, heading: 40 })).run();
    await db.prepare("UPDATE players SET skills = ? WHERE id = 'b4'").bind(JSON.stringify({ speed: 50, heading: 60 })).run();
    const d = await createDemand(db, "A", input({ minRating: 50, skills: [{ skill: "speed", min: 60 }] }));
    if (!d.ok) throw new Error();
    const rng = createRng(20);
    expect(await pitchPlayer(db, "B", d.id, "b4", rng)).toMatchObject({ ok: false, error: "Hráč nemá hodnocení 50+." }); // 48
    await db.prepare("UPDATE players SET overall_rating = 52 WHERE id = 'b4'").run();
    expect(await pitchPlayer(db, "B", d.id, "b4", rng)).toMatchObject({ ok: false, error: "Hráč nemá Rychlost 60+." });
    expect(await pitchPlayer(db, "B", d.id, "b1", rng)).toMatchObject({ ok: true, status: "pitched" });

    const forB = await listDemands(db, "B");
    expect(forB!.managers[0]).toMatchObject({ minRating: 50, skills: [{ skill: "speed", label: "Rychlost", min: 60 }] });
    expect(forB!.pitchable.find((p) => p.id === "b1")).toMatchObject({ rating: 55, skills: { speed: 70, heading: 40 } });
    expect(forB!.skillOptions.map((o) => o.label)).toContain("Hlavičky");

    await db.prepare(
      `INSERT INTO transfer_demands (id, team_id, club_data, district, position, age_min, age_max, role, max_price, min_rating, status, expires_at, created_at)
       VALUES ('club', NULL, '{"name":"TJ Písek","rating":46}', 'Prachatice', 'MID', 18, 30, 'starter', 30000, 53, 'active', ?, ?)`,
    ).bind(new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString()).run();
    expect((await listDemands(db, "B"))!.clubs[0].minRating).toBeNull();
  });

  it("manažer si nabídnutého hráče koupil: poptávka se zavře všem", async () => {
    const d = await createDemand(db, "A", input());
    if (!d.ok) throw new Error();
    await pitchPlayer(db, "B", d.id, "b1", createRng(30));
    // Přestup jiného hráče poptávku nezavře.
    expect(await closeDemandsForArrival(db, "b4", "A")).toBe(0);
    // Nabídnutý hráč přišel do U21 kupce: pořád jeho klub.
    expect(await closeDemandsForArrival(db, "b1", "A21")).toBe(1);
    expect((await listDemands(db, "A"))!.mine).toHaveLength(0);
    expect((await listDemands(db, "B"))!.managers).toHaveLength(0);
  });

  it("stažená poptávka už hráče nebere", async () => {
    const d = await createDemand(db, "A", input());
    if (!d.ok) throw new Error();
    await withdrawDemand(db, "A", d.id);
    expect(await pitchPlayer(db, "B", d.id, "b1", createRng(2))).toMatchObject({ ok: false, error: "Poptávka už neplatí." });
  });
});

describe("poptávky klubů mimo hru", () => {
  it("vzniknou v okrese, nejvýš 3, každý klub jednu", async () => {
    const rng = createRng(7);
    for (let i = 0; i < 6; i++) await generateClubDemands(db, "Prachatice", rng, { force: true });
    const rows = await db.prepare("SELECT club_data, min_rating, max_price, district, age_min, age_max FROM transfer_demands").all<{ club_data: string; min_rating: number; max_price: number; district: string; age_min: number; age_max: number }>();
    expect(rows.results).toHaveLength(3);
    expect(new Set(rows.results.map((r) => JSON.parse(r.club_data).name)).size).toBe(3);
    for (const r of rows.results) {
      expect(r.district).toBe("Prachatice");
      expect(r.max_price).toBeGreaterThan(0);
      expect(r.age_min).toBeLessThanOrEqual(r.age_max);
    }
    // Vidí je tým z okresu (i z III. třídy), ne z Prahy.
    expect((await listDemands(db, "B"))!.clubs).toHaveLength(3);
    expect((await listDemands(db, "C"))!.clubs).toHaveLength(0);
  });

  const clubDemand = async (minRating: number, maxPrice: number | null = 30000) => {
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO transfer_demands (id, team_id, club_data, district, position, age_min, age_max, role, max_price, min_rating, status, expires_at, created_at)
       VALUES (?, NULL, ?, 'Prachatice', 'MID', 18, 30, 'starter', ?, ?, 'active', ?, ?)`,
    ).bind(id, JSON.stringify({ name: "TJ Písek", city: "Písek", district: "Písek", rating: 46 }), maxPrice, minRating,
      new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString()).run();
    return id;
  };

  it("slabšího hráče odmítne slovy, dobrého koupí a poptávka se zavře", async () => {
    const id = await clubDemand(52);
    const rng = createRng(3);
    const weak = await pitchPlayer(db, "B", id, "b4", rng); // 48
    expect(weak).toMatchObject({ ok: true, status: "declined" });
    if (weak.ok) expect(weak.message).not.toMatch(/\d/);

    const good = await pitchPlayer(db, "B", id, "b1", rng); // 55
    expect(good).toMatchObject({ ok: true, status: "accepted" });
    const offer = await db.prepare("SELECT from_team_id, to_team_id, offer_amount, status, virtual_team_data FROM transfer_offers").first<{ from_team_id: string; to_team_id: string; offer_amount: number; status: string; virtual_team_data: string }>();
    expect(offer).toMatchObject({ from_team_id: "virtual_ai", to_team_id: "B", status: "pending" });
    expect(offer!.offer_amount).toBeLessThanOrEqual(30000);
    expect(JSON.parse(offer!.virtual_team_data)).toMatchObject({ name: "TJ Písek", demandId: id });
    expect((await db.prepare("SELECT status FROM transfer_demands WHERE id = ?").bind(id).first<{ status: string }>())?.status).toBe("filled");

    // Obsazenou poptávku už nikdo další neobslouží a vidí ji jen ten, komu klub poslal nabídku.
    expect(await pitchPlayer(db, "A", id, "a1", rng)).toMatchObject({ ok: false, error: "Poptávka už neplatí." });
    const forB = (await listDemands(db, "B"))!.clubs;
    expect(forB).toHaveLength(1);
    expect(forB[0]).toMatchObject({ filled: true, clubName: "TJ Písek" });
    expect(forB[0].myPitches.map((p) => p.status).sort()).toEqual(["accepted", "declined"]);
    expect((await listDemands(db, "A"))!.clubs).toHaveLength(0);

    // Po rozhodnutí o nabídce (přestup proběhl) zmizí i jemu.
    await db.prepare("UPDATE transfer_offers SET status = 'accepted'").run();
    expect((await listDemands(db, "B"))!.clubs).toHaveLength(0);
  });

  it("dva souběžní zájemci: klub pošle jen jednu nabídku", async () => {
    const id = await clubDemand(50);
    const [a, b] = await Promise.all([
      pitchPlayer(db, "A", id, "a1", createRng(5)),
      pitchPlayer(db, "B", id, "b1", createRng(6)),
    ]);
    expect([a, b].filter((r) => r.ok && r.status === "accepted")).toHaveLength(1);
    expect([a, b].filter((r) => !r.ok)).toHaveLength(1);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM transfer_offers").first<{ n: number }>())?.n).toBe(1);
  });

  it("z jiného okresu klubu hráče nenabídneš", async () => {
    const id = await clubDemand(30);
    await db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES ('c1', 'C', 'Pavel', 'Kos', 24, 'MID', 60)").run();
    expect(await pitchPlayer(db, "C", id, "c1", createRng(4))).toMatchObject({ ok: false });
  });

  it("práh síly z kádrů okresu: do základu výš než do kádru", async () => {
    const values = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58];
    for (const [i, r] of values.entries()) {
      await db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES (?, 'A', 'X', 'Y', 25, 'DEF', ?)").bind(`d${i}`, r).run();
    }
    const starter = await demandRatingThreshold(db, "Prachatice", "DEF", "starter", 46);
    const squad = await demandRatingThreshold(db, "Prachatice", "DEF", "squad", 46);
    expect(starter).toBeGreaterThan(squad);
    expect(starter).toBe(52);
    // Málo dat → podle síly klubu.
    expect(await demandRatingThreshold(db, "Prachatice", "GK", "starter", 46)).toBe(46);
    // Slabé kádry okresu: klub nechce hráče o moc slabšího, než je sám.
    expect(await demandRatingThreshold(db, "Prachatice", "DEF", "starter", 62)).toBe(56);
    expect(await demandRatingThreshold(db, "Prachatice", "DEF", "squad", 62)).toBe(50);
  });
});
