/**
 * Přemluvit pachatele, ať to vrátí nebo zaplatí: kdy kývne a co se pak stane.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { isRestitutionRequest, restitutionChance, tryRestitution } from "./restitution";

describe("žádost a šance", () => {
  it("pozná „vrať to“ a „zaplať škodu“", () => {
    expect(isRestitutionRequest("Vrať ty dresy a nebudu to řešit")).toBe(true);
    expect(isRestitutionRequest("Zaplatíš tu škodu na sprchách")).toBe(true);
    expect(isRestitutionRequest("Nevíš něco o té světlici?")).toBe(false);
  });

  it("odhalený, se stopou a s mírností kývne spíš, urážka uškodí", () => {
    const p = { disciplina: 50, temperament: 50, vztahKTrenerovi: 50 };
    const plainChance = restitutionChance(p, { revealed: false, clueOnHim: false, leniency: false, insult: false });
    expect(restitutionChance(p, { revealed: true, clueOnHim: true, leniency: true, insult: false })).toBeGreaterThan(plainChance + 40);
    expect(restitutionChance(p, { revealed: false, clueOnHim: false, leniency: false, insult: true })).toBeLessThan(plainChance);
    expect(restitutionChance({ disciplina: 100, temperament: 0, vztahKTrenerovi: 100 }, { revealed: true, clueOnHim: true, leniency: true, insult: false })).toBe(90);
  });
});

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE club_incidents (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, category TEXT, status TEXT, loss TEXT, culprit_type TEXT, culprit_player_id TEXT, culprit_revealed INTEGER, resolution TEXT, resolution_data TEXT, resolved_on TEXT, game_date TEXT)",
    "CREATE TABLE club_incident_knowledge (incident_id TEXT, player_id TEXT, team_id TEXT, role TEXT, fact TEXT, willingness INTEGER, interrogation TEXT, interrogated_on TEXT, tactics TEXT)",
    "CREATE TABLE club_incident_clues (id TEXT PRIMARY KEY, incident_id TEXT, source TEXT, points_to_player_id TEXT, suspects TEXT, holder_player_id TEXT, strength REAL, police_bonus REAL, text TEXT, found INTEGER, found_on TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, budget INTEGER, user_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER, weekly_wage INTEGER, age INTEGER, status TEXT)",
    "CREATE TABLE equipment (team_id TEXT, balls INTEGER, balls_condition INTEGER)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, created_at TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE relationships (id TEXT, player_a_id TEXT, player_b_id TEXT, type TEXT, strength INTEGER)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  for (const t of ["club_incidents", "club_incident_knowledge", "club_incident_clues", "teams", "players", "equipment", "transactions", "messages", "conversations"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('tym', 1000, 'u1')"),
    // Hodný a poslušný kluk: přemluvit ho jde skoro jistě.
    db.prepare("INSERT INTO players VALUES ('p', 'tym', 'Pepa', 'Průšvih', ?, '{}', 100, 400, 22, 'active')")
      .bind(JSON.stringify({ discipline: 100, temper: 0 })),
    db.prepare("INSERT INTO players VALUES ('n', 'tym', 'Nevinný', 'Hráč', '{}', '{}', 50, 300, 25, 'active')"),
    db.prepare("INSERT INTO equipment VALUES ('tym', 1, 40)"),
  ]);
});

const incident = (o: { category: string; loss: unknown[]; revealed?: number }) => db.batch([
  db.prepare("INSERT INTO club_incidents VALUES ('inc', 'tym', 'kradez_balonu', ?, 'otevreny', ?, 'hrac', 'p', ?, NULL, NULL, NULL, '2026-11-10')")
    .bind(o.category, JSON.stringify(o.loss), o.revealed ?? 1),
  db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc', 'p', 'tym', 'pachatel', 'Vzal jsi balony.', 0, NULL, NULL, NULL)"),
]);

describe("přemluvení pachatele", () => {
  it("krádež: vrátí balony i hotovost, přizná se a incident je vyřešený", async () => {
    await incident({ category: "kradez", loss: [{ typ: "vybaveni", kategorie: "balls", uroven: 3, urovniDolu: 2, stav: 80 }, { typ: "penize", castka: 700 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Pepo, vrať ty balony a nebudu to řešit.", gameDate: "2026-11-12" }))
      .toEqual({ outcome: "returned", amount: 700 });
    expect(await db.prepare("SELECT balls, balls_condition FROM equipment").first()).toEqual({ balls: 3, balls_condition: 80 });
    expect(await db.prepare("SELECT status, resolution FROM club_incidents").first()).toEqual({ status: "uzavreny", resolution: "vratil" });
    expect((await db.prepare("SELECT budget FROM teams").first<{ budget: number }>())?.budget).toBe(1700);
    const k = await db.prepare("SELECT interrogation, fact FROM club_incident_knowledge").first<{ interrogation: string; fact: string }>();
    expect(k?.interrogation).toBe("priznal");
    expect(k?.fact).toContain("všechno vrátil");
    expect((await db.prepare("SELECT body FROM messages").first<{ body: string }>())?.body).toMatch(/^✋ Pepa Průšvih se přiznal/);
    // Podruhé už nic.
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "vrať to", gameDate: "2026-11-12" })).toBeNull();
  });

  it("poškození: zaplatí škodu ze svého, nejvýš čtyři týdenní odměny", async () => {
    await incident({ category: "poskozeni", loss: [{ typ: "stadion", zarizeni: "sprchy", urovni: 1, cena: 5000 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Zaplatíš tu škodu na sprchách.", gameDate: "2026-11-12" }))
      .toEqual({ outcome: "paid", amount: 1600 });
    expect(await db.prepare("SELECT resolution FROM club_incidents").first()).toEqual({ resolution: "nahradil" });
  });

  it("nevinného se to netýká a obyčejná zpráva nic nespustí", async () => {
    await incident({ category: "kradez", loss: [{ typ: "penize", castka: 700 }] });
    expect(await tryRestitution(db, { teamId: "tym", playerId: "n", text: "Vrať to!", gameDate: "2026-11-12" })).toBeNull();
    expect(await tryRestitution(db, { teamId: "tym", playerId: "p", text: "Jak se máš?", gameDate: "2026-11-12" })).toBeNull();
    expect(await db.prepare("SELECT status FROM club_incidents").first()).toEqual({ status: "otevreny" });
  });
});
