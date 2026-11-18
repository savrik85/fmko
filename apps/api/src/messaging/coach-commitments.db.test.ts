/**
 * Sliby z SMS nad skutečnou D1 (Miniflare): zápis, vyhodnocení po zápase, vyplacení
 * tlačítkem, porušení zamítnutím nabídky a lhůta peněz.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import {
  breakReleaseCommitment, cancelCommitment, fulfilMoneyCommitment, recordInquiryTask, respondToCoachInvite, listCommitments, loadCommitmentMemory, recordCommitment, settleCoachCommitments,
} from "./coach-commitments";

let miniflare: Miniflare;
let db: D1Database;

const T0 = new Date("2026-11-10T10:00:00Z");
const lineup = (starters: string[], subs: string[] = []) =>
  JSON.stringify({ starters: starters.map((id) => ({ id, position: id === "p1" ? "FWD" : "MID" })), subs: subs.map((id) => ({ id })) });

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  const migration = readFileSync(new URL("../../migrations/0316_coach_commitments.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "").replace(/\n/g, " ");
  await db.exec(migration);
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, budget INTEGER, game_date TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, nationality TEXT, position TEXT, weekly_wage INTEGER, life_context TEXT, coach_relationship INTEGER, loan_from_team_id TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, status TEXT, simulated_at TEXT, home_lineup_data TEXT, away_lineup_data TEXT)",
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, minutes_played INTEGER)",
    "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
    "CREATE UNIQUE INDEX idx_ref ON coach_relation_log(reference_id) WHERE reference_id IS NOT NULL",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "ALTER TABLE players ADD COLUMN personality TEXT",
    "ALTER TABLE players ADD COLUMN age INTEGER",
    "ALTER TABLE players ADD COLUMN status TEXT",
    "CREATE TABLE club_incident_knowledge (incident_id TEXT, player_id TEXT, team_id TEXT, role TEXT, willingness INTEGER, interrogation TEXT)",
    "ALTER TABLE matches ADD COLUMN home_score INTEGER",
    "ALTER TABLE matches ADD COLUMN away_score INTEGER",
    "ALTER TABLE match_player_stats ADD COLUMN goals INTEGER",
    "ALTER TABLE match_player_stats ADD COLUMN assists INTEGER",
  ]) await db.prepare(sql).run();
  // Odložené zprávy (poděkování po pozvání) a sloupec v teams, který migrace přidává.
  await db.exec(readFileSync(new URL("../../migrations/0275_player_follow_ups.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "").replace(/\n/g, " "));
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["coach_commitments", "teams", "players", "matches", "match_player_stats", "injuries", "conversations", "messages", "coach_relation_log", "transactions", "player_follow_ups", "club_incident_knowledge"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, parent_team_id, budget, game_date) VALUES ('club', 'TJ Dvory', 'u1', NULL, 5000, '2026-11-10'), ('rival', 'SK Lhota', 'u2', NULL, 0, '2026-11-10')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, nickname, avatar, nationality, position, weekly_wage, life_context, coach_relationship, loan_from_team_id) VALUES
      ('p1', 'club', 'Filip', 'Pešek', NULL, NULL, 'CZ', 'MID', 400, '{"morale":50}', 50, NULL),
      ('p2', 'club', 'Jan', 'Mikeš', NULL, NULL, 'CZ', 'GK', 300, '{"morale":50}', 50, NULL)`),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('c1', 'club', 'player', 'Filip Pešek', 'p1', '2026-11-01')"),
  ]);
});

const status = async (id: string) => (await db.prepare("SELECT status FROM coach_commitments WHERE id = ?").bind(id).first<{ status: string }>())?.status;
const morale = async (pid: string) => (await db.prepare("SELECT json_extract(life_context, '$.morale') AS m FROM players WHERE id = ?").bind(pid).first<{ m: number }>())?.m;
const smsTo = async (pid: string) => (await db.prepare(
  "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.participant_id = ? AND m.sender_type = 'player'",
).bind(pid).all<{ body: string }>()).results.map((r) => r.body);

const record = (kind: Parameters<typeof recordCommitment>[1]["detected"], text = "zítra hraješ") =>
  recordCommitment(db, { clubTeamId: "club", playerId: "p1", convId: "c1", coachMessage: text, detected: kind, playerFirstName: "Filip", weeklyWage: 400, now: T0 });

describe("slib sestavy z SMS", () => {
  it("začal v příštím zápase: dodržel, hráč poděkuje a vztah se zlepší", async () => {
    const id = await record({ kind: "start_next" });
    expect(await settleCoachCommitments(db, new Date("2026-11-11T10:00:00Z"))).toBe(0);
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, away_lineup_data) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, NULL)").bind(lineup(["p1"])).run();
    expect(await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"))).toBe(1);
    expect(await status(id)).toBe("kept");
    expect((await smsTo("p1"))[0]).toMatch(/dodržel/);
    const log = await db.prepare("SELECT source, delta FROM coach_relation_log WHERE player_id = 'p1'").first<{ source: string; delta: number }>();
    expect(log).toEqual({ source: "promise", delta: 4 });
    expect(await morale("p1")).toBe(53);
  });

  it("seděl na lavičce: porušil, hráč se ozve a nálada klesne", async () => {
    const id = await record({ kind: "start_next" });
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, away_lineup_data) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, NULL)").bind(lineup(["p2"], ["p1"])).run();
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect((await smsTo("p1"))[0]).toMatch(/základ|od začátku/);
    expect(await morale("p1")).toBe(44);
  });

  it("zraněného trenér postavit nemohl: slib jen vyprší", async () => {
    const id = await record({ kind: "start_next" });
    await db.batch([
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, away_lineup_data) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, NULL)").bind(lineup(["p2"])),
      db.prepare("INSERT INTO injuries VALUES ('p1', 5)"),
    ]);
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    expect(await status(id)).toBe("expired");
    expect(await smsTo("p1")).toEqual([]);
  });

  it("pozice: začal v útoku, jak trenér slíbil", async () => {
    const id = await record({ kind: "position", position: "FWD" }, "v neděli půjdeš do útoku");
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, away_lineup_data) VALUES ('m1', 'rival', 'club', 'simulated', '2026-11-12T17:05:00Z', NULL, ?)").bind(lineup(["p1"])).run();
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    expect(await status(id)).toBe("kept");
  });

  it("druhý stejný slib nahradí první a hráč ho zná v paměti", async () => {
    const first = await record({ kind: "start_next" });
    const second = await record({ kind: "start_next" }, "fakt, zítra jdeš od začátku");
    expect(await status(first)).toBe("expired");
    expect(await status(second)).toBe("active");
    const mem = await loadCommitmentMemory(db, "p1", T0);
    expect(mem.map((m) => m.kind)).toEqual(["start_next"]);
    expect((await listCommitments(db, "p1", "club"))[0]).toMatchObject({ text: "Místo v základu v příštím zápase", status: "active", quote: "fakt, zítra jdeš od začátku" });
  });
});

describe("„To nebyl slib“", () => {
  it("do hodiny slib zmizí i z profilu, pak už ne", async () => {
    const id = await record({ kind: "start_next" });
    const note = await db.prepare("SELECT body FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system'").first<{ body: string }>();
    expect(note?.body).toBe("📝 Filip si slib zapamatoval: místo v základu v příštím zápase.");
    expect(await cancelCommitment(db, { teamId: "rival", commitmentId: id, now: T0 })).toMatchObject({ ok: false, status: 404 });
    expect(await cancelCommitment(db, { teamId: "club", commitmentId: id, now: new Date(T0.getTime() + 30 * 60_000) })).toEqual({ ok: true });
    expect(await status(id)).toBe("cancelled");
    expect(await listCommitments(db, "p1", "club")).toEqual([]);
    const meta = await db.prepare("SELECT metadata FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system'").first<{ metadata: string }>();
    expect(JSON.parse(meta?.metadata ?? "{}")).toMatchObject({ cancelled: true });

    const late = await record({ kind: "start_next" });
    expect(await cancelCommitment(db, { teamId: "club", commitmentId: late, now: new Date(T0.getTime() + 2 * 3600_000) })).toMatchObject({ ok: false, status: 409 });
    expect(await status(late)).toBe("active");
  });
});

describe("peníze z SMS jen tlačítkem", () => {
  it("prémie: pod zprávou tlačítko, vyplacení strhne kasu a slib je dodržený", async () => {
    const id = await record({ kind: "bonus", amount: 1000 }, "tady máš tisícovku prémii");
    const btn = await db.prepare("SELECT body, metadata FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system'").first<{ body: string; metadata: string }>();
    expect(btn?.body).toMatch(/prémii 1\s000 Kč/);
    expect(JSON.parse(btn?.metadata ?? "{}")).toMatchObject({ type: "coach_commitment", commitmentId: id, done: false });

    const res = await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 });
    expect(res).toMatchObject({ ok: true });
    expect((await db.prepare("SELECT budget FROM teams WHERE id = 'club'").first<{ budget: number }>())?.budget).toBe(4000);
    expect(await status(id)).toBe("kept");
    const after = await db.prepare("SELECT metadata FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system'").first<{ metadata: string }>();
    expect(JSON.parse(after?.metadata ?? "{}")).toMatchObject({ done: true });
    // Podruhé už ne.
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 })).toMatchObject({ ok: false, status: 409 });
  });

  it("cizí klub slib nevyplatí, na prázdnou kasu nic", async () => {
    const id = await record({ kind: "bonus", amount: 9000 });
    expect(await fulfilMoneyCommitment(db, { teamId: "rival", commitmentId: id, now: T0 })).toMatchObject({ ok: false, status: 404 });
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 })).toMatchObject({ ok: false, status: 400 });
    expect(await status(id)).toBe("active");
  });

  it("zvýšení odměn zapíše novou týdenní odměnu", async () => {
    const id = await record({ kind: "wage", percent: 20 }, "od příštího týdne ti přidám pětinu");
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 })).toMatchObject({ ok: true, effect: "Týdenní odměna 400 → 480 Kč" });
    expect((await db.prepare("SELECT weekly_wage FROM players WHERE id = 'p1'").first<{ weekly_wage: number }>())?.weekly_wage).toBe(480);
    // Popis ve vztahu nese podmínky slibu (dřív „o 0 %“, detaily se nepředaly).
    expect((await db.prepare("SELECT description FROM coach_relation_log WHERE player_id = 'p1'").first<{ description: string }>())?.description)
      .toBe("Dodržel jsi slib: vyšší odměny (o 20 %)");
  });

  it("nevyplacená prémie: po 3 dnech připomínka, po týdnu porušeno", async () => {
    const id = await record({ kind: "bonus", amount: 500 });
    await settleCoachCommitments(db, new Date("2026-11-14T10:00:00Z"));
    expect(await smsTo("p1")).toHaveLength(1);
    await settleCoachCommitments(db, new Date("2026-11-15T10:00:00Z"));
    expect(await smsTo("p1")).toHaveLength(1);
    await settleCoachCommitments(db, new Date("2026-11-18T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect(await smsTo("p1")).toHaveLength(2);
  });
});

describe("slib odchodu", () => {
  it("zamítnutá nabídka slib poruší, odchod z klubu ho splní", async () => {
    const id = await record({ kind: "release_offer" }, "když přijde další nabídka, pustím tě");
    expect(await breakReleaseCommitment(db, "p1", T0)).toBe(true);
    expect(await status(id)).toBe("broken");
    expect((await smsTo("p1"))[0]).toMatch(/pustíte/);

    const kept = await record({ kind: "release_offer" });
    await db.prepare("UPDATE players SET team_id = 'rival' WHERE id = 'p1'").run();
    await settleCoachCommitments(db, new Date("2026-11-12T10:00:00Z"));
    expect(await status(kept)).toBe("kept");
  });
});

describe("sázka a pozvání", () => {
  it("sázka vyjde: hráč se připomene, tlačítko Zaplatit, zaplacení strhne basu", async () => {
    const id = await record({ kind: "bet", condition: "goal", reward: "keg" }, "dej gól a platím basu");
    await db.batch([
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, home_score, away_score) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, 2, 0)").bind(lineup(["p1"])),
      db.prepare("INSERT INTO match_player_stats (match_id, player_id, minutes_played, goals, assists) VALUES ('m1', 'p1', 90, 1, 0)"),
    ]);
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    expect(await status(id)).toBe("active");
    expect((await smsTo("p1"))[0]).toMatch(/gól/i);
    const btn = await db.prepare("SELECT body, metadata FROM messages WHERE sender_type = 'system' AND json_extract(metadata, '$.type') = 'coach_commitment'").first<{ body: string; metadata: string }>();
    expect(btn?.body).toMatch(/sázka vyšla, dá gól\. Basa 500 Kč/);
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: new Date("2026-11-13T12:00:00Z") })).toMatchObject({ ok: true });
    expect(await status(id)).toBe("kept");
    expect((await db.prepare("SELECT budget FROM teams WHERE id = 'club'").first<{ budget: number }>())?.budget).toBe(4500);
  });

  it("sázka nevyjde: hráč to vezme s humorem a sázka propadne", async () => {
    const id = await record({ kind: "bet", condition: "goal", reward: "keg" });
    await db.batch([
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, home_score, away_score) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, 0, 0)").bind(lineup(["p1"])),
      db.prepare("INSERT INTO match_player_stats (match_id, player_id, minutes_played, goals, assists) VALUES ('m1', 'p1', 90, 0, 0)"),
    ]);
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    expect(await status(id)).toBe("expired");
    expect(await smsTo("p1")).toHaveLength(1);
    // Nevyhraná sázka se zaplatit nedá.
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id })).toMatchObject({ ok: false });
  });

  it("vyhraná nezaplacená sázka je po 5 dnech porušená", async () => {
    const id = await record({ kind: "bet", condition: "win", reward: "round" });
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, home_score, away_score) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, 3, 1)").bind(lineup(["p2"])).run();
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    await settleCoachCommitments(db, new Date("2026-11-19T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect(await morale("p1")).toBe(45);
  });

  it("pozvání na schůzku: kývl, naplánuje se poděkování; odmítl, propadne", async () => {
    const yes = await record({ kind: "invite_talk" }, "stav se zítra po tréninku");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_type = 'system'").first<{ n: number }>()).toEqual({ n: 0 });
    expect(await respondToCoachInvite(db, { teamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Filip", commitmentId: yes, kind: "invite_talk", accepted: true, now: T0 })).toBe(true);
    expect(await status(yes)).toBe("kept");
    const fu = await db.prepare("SELECT kind, json_extract(payload, '$.invite') AS invite FROM player_follow_ups").first<{ kind: string; invite: string }>();
    expect(fu).toEqual({ kind: "after_invite", invite: "coach_talk" });

    const no = await record({ kind: "invite_pub" }, "pojď na pivo");
    expect(await respondToCoachInvite(db, { teamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Filip", commitmentId: no, kind: "invite_pub", accepted: false, now: T0 })).toBe(false);
    expect(await status(no)).toBe("expired");
  });
});

describe("vztah se nedá koupit", () => {
  const relLogs = async () => (await db.prepare("SELECT COUNT(*) AS n FROM coach_relation_log WHERE player_id = 'p1'").first<{ n: number }>())?.n;

  it("druhá prémie do 14 dní a prémie pod týdenní odměnu vztah nezmění", async () => {
    const small = await record({ kind: "bonus", amount: 200 }, "tady máš dvě stovky");
    await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: small, now: T0 });
    expect(await relLogs()).toBe(0);
    const big = await record({ kind: "bonus", amount: 1000 });
    await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: big, now: T0 });
    expect(await relLogs()).toBe(1);
    const again = await record({ kind: "bonus", amount: 1000 });
    await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: again, now: new Date(T0.getTime() + 2 * 86400000) });
    expect(await relLogs()).toBe(1);
    expect(await status(again)).toBe("kept");
  });

  it("druhé pozvání do týdne: hráč přijde, ale poděkování se neplánuje", async () => {
    const first = await record({ kind: "invite_talk" });
    expect(await respondToCoachInvite(db, { teamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Filip", commitmentId: first, kind: "invite_talk", accepted: true, now: T0 })).toBe(true);
    await db.prepare("UPDATE player_follow_ups SET done_at = ?").bind(T0.toISOString()).run();
    const second = await record({ kind: "invite_talk" });
    expect(await respondToCoachInvite(db, { teamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Filip", commitmentId: second, kind: "invite_talk", accepted: true, now: new Date(T0.getTime() + 86400000) })).toBe(false);
    expect(await status(second)).toBe("kept");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM player_follow_ups").first<{ n: number }>())?.n).toBe(1);
  });

  it("vyhranou sázku ani pozvání zrušit nejde, ani přímým voláním", async () => {
    const bet = await record({ kind: "bet", condition: "goal", reward: "keg" });
    await db.prepare("UPDATE coach_commitments SET details = json_set(details, '$.won', json('true')) WHERE id = ?").bind(bet).run();
    expect(await cancelCommitment(db, { teamId: "club", commitmentId: bet, now: T0 })).toMatchObject({ ok: false, status: 409 });
    const inv = await record({ kind: "invite_pub" });
    expect(await cancelCommitment(db, { teamId: "club", commitmentId: inv, now: T0 })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("sázka celé kabiny", () => {
  it("vyhráli jsme: připomene se v kabině, zaplacení zlepší náladu všem", async () => {
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('k1', 'club', 'squad_group', 'Kabina', '2026-11-01')").run();
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "k1", coachMessage: "Když vyhrajeme, basa je na mě",
      detected: { kind: "bet", condition: "win", reward: "keg", squad: true }, playerFirstName: "Jan", now: T0,
    });
    const note = await db.prepare("SELECT body FROM messages WHERE conversation_id = 'k1' AND sender_type = 'system'").first<{ body: string }>();
    expect(note?.body).toBe("📝 Kabina si sázku zapamatovala: když tým vyhraje, trenér platí basu.");
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at, home_lineup_data, home_score, away_score) VALUES ('m1', 'club', 'rival', 'simulated', '2026-11-12T17:05:00Z', ?, 2, 1)").bind(lineup(["p1"])).run();
    await settleCoachCommitments(db, new Date("2026-11-13T10:00:00Z"));
    const inSquad = (await db.prepare("SELECT body FROM messages WHERE conversation_id = 'k1' AND sender_type = 'player'").all<{ body: string }>()).results;
    expect(inSquad).toHaveLength(1);
    // Soukromá SMS nepřišla, sázka je věc kabiny.
    expect(await smsTo("p2")).toEqual([]);
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: new Date("2026-11-13T12:00:00Z") })).toMatchObject({ ok: true });
    expect(await morale("p1")).toBe(53);
    expect(await morale("p2")).toBe(53);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM coach_relation_log").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("pokuta a úkol „poptej se“", () => {
  it("pokuta bez částky = týdenní odměna, udělí se tlačítkem a zhorší vztah", async () => {
    const id = await record({ kind: "fine" }, "strhnu ti to z výplaty");
    const btn = await db.prepare("SELECT body FROM messages WHERE sender_type = 'system'").first<{ body: string }>();
    expect(btn?.body).toBe("⚖️ Filip: pokuta 400 Kč. Udělit ji musíš sám, peníze půjdou do kasy.");
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 })).toMatchObject({ ok: true, effect: "Pokuta 400 Kč udělena" });
    expect((await db.prepare("SELECT budget FROM teams WHERE id = 'club'").first<{ budget: number }>())?.budget).toBe(5400);
    expect((await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = 'p1'").first<{ delta: number }>())?.delta).toBe(-5);
    expect(await morale("p1")).toBe(46);
    expect(await smsTo("p1")).toHaveLength(1);
  });

  it("neudělená pokuta tiše propadne", async () => {
    const id = await record({ kind: "fine", amount: 300 });
    await settleCoachCommitments(db, new Date("2026-11-14T10:00:00Z"));
    expect(await status(id)).toBe("expired");
    expect(await smsTo("p1")).toEqual([]);
  });

  it("poptá se: druhý den jméno toho, kdo ví víc; pachatel nikoho neprozradí", async () => {
    await db.batch([
      db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc', 'p2', 'club', 'svedek', 70, NULL)"),
      db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc2', 'p1', 'club', 'pachatel', 0, NULL)"),
      db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc2', 'p2', 'club', 'svedek', 70, NULL)"),
    ]);
    const asked = await recordInquiryTask(db, { teamId: "club", convId: "c1", playerId: "p1", incidentId: "inc", coachMessage: "zkus se poptat", now: T0 });
    expect(await recordInquiryTask(db, { teamId: "club", convId: "c1", playerId: "p1", incidentId: "inc", coachMessage: "znova", now: T0 })).toBeNull();
    await settleCoachCommitments(db, new Date(T0.getTime() + 2 * 3600_000));
    expect(await smsTo("p1")).toEqual([]);
    await settleCoachCommitments(db, new Date(T0.getTime() + 25 * 3600_000));
    expect(await status(asked!)).toBe("kept");
    expect((await smsTo("p1"))[0]).toContain("Jan Mikeš");

    await recordInquiryTask(db, { teamId: "club", convId: "c1", playerId: "p1", incidentId: "inc2", coachMessage: "zjisti to", now: T0 });
    await settleCoachCommitments(db, new Date(T0.getTime() + 25 * 3600_000));
    expect((await smsTo("p1"))[1]).not.toContain("Mikeš");
  });
});

describe("pokuta netiskne peníze", () => {
  it("strop odměny a 1 000 Kč, jednomu hráči jednou za týden, klubu třikrát", async () => {
    const big = await record({ kind: "fine", amount: 20000 }, "pokuta 20 000");
    const btn = await db.prepare("SELECT body FROM messages WHERE sender_type = 'system'").first<{ body: string }>();
    expect(btn?.body).toContain("pokuta 400 Kč");
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: big, now: T0 })).toMatchObject({ ok: true });
    const again = await record({ kind: "fine", amount: 300 });
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: again, now: T0 })).toMatchObject({ ok: false, status: 409 });
    expect((await db.prepare("SELECT budget FROM teams WHERE id = 'club'").first<{ budget: number }>())?.budget).toBe(5400);
  });
});
