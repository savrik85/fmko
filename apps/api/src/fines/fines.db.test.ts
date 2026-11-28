/**
 * Sazebník pokut nad skutečnou D1 (Miniflare): schválení kapitánem, zápis pokut z tréninku
 * a zápasu, opakování, zátěž, vnucení, prominutí a SMS pokuta za totéž.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { CLASSIC_FINE_SCHEDULE, type FineScheduleItemInput } from "@okresni-masina/shared";
import { imposeSchedule, proposeSchedule } from "./captain";
import { applyMatchFines, applyTrainingFines } from "./detect";
import { forgiveFine, insistOnFine } from "./actions";
import { recordSmsFine, scheduleDuplicateOf } from "./sms-fine";
import { reactionFacts, type PendingFine } from "./reaction";
import { PLAYER_PROFILE_SQL, profileFromRow } from "./store";

let miniflare: Miniflare;
let db: D1Database;

const item = (o: Partial<FineScheduleItemInput>): FineScheduleItemInput => ({
  itemKey: "training_missed", conditionKey: "slacking", valueKind: "czk", amountCzk: 50, repeatMode: "flat", scope: "senior", ...o,
});
// Středa 2026-11-25: sazebník platí od pondělí 2026-11-30.
const PROPOSED = "2026-11-25";
const IN_EFFECT = "2026-12-01";

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT, league_id TEXT, captain_id TEXT, game_date TEXT, last_training_result TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, nationality TEXT, age INTEGER, weekly_wage INTEGER, coach_relationship INTEGER, life_context TEXT, personality TEXT, status TEXT, suspended_matches INTEGER DEFAULT 0)",
    "CREATE TABLE seasons (id TEXT, number INTEGER, status TEXT)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT, pinned INTEGER)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
  ]) await db.prepare(sql).run();
  await db.exec(readFileSync(new URL("../../migrations/0340_fine_schedule.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "").replace(/\n/g, " "));
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const personality = (o: Record<string, number>) => JSON.stringify({ discipline: 50, patriotism: 50, alcohol: 30, temper: 40, leadership: 40, ...o });

beforeEach(async () => {
  for (const t of ["teams", "players", "seasons", "coach_relation_log", "conversations", "messages", "fine_schedules", "fine_schedule_items", "fines"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO seasons VALUES ('s1', 1, 'active')"),
    db.prepare("INSERT INTO teams (id, name, user_id, team_type, league_id, captain_id, game_date) VALUES ('club', 'TJ Dvory', 'u1', NULL, 'L1', 'cap', ?)").bind(IN_EFFECT),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, weekly_wage, coach_relationship, life_context, personality) VALUES
      ('cap', 'club', 'Karel', 'Kapitán', 30, 200, 65, '{"morale":50,"occupation":"Zedník"}', ?),
      ('p1', 'club', 'Filip', 'Pešek', 28, 150, 50, '{"morale":50,"occupation":"Opravář"}', ?),
      ('kid', 'club', 'Tomáš', 'Mladý', 18, 50, 50, '{"morale":50,"occupation":"Student"}', ?),
      ('stu', 'club', 'Petr', 'Učeň', 20, 60, 50, '{"morale":50,"occupation":"Učeň"}', ?)`)
      .bind(personality({ leadership: 80 }), personality({}), personality({}), personality({ temper: 80, patriotism: 30 })),
  ]);
});

const fines = async () => (await db.prepare("SELECT player_id, item_key, amount_czk, status, fact FROM fines ORDER BY created_at, rowid").all<Record<string, unknown>>()).results;
const fund = async () => (await db.prepare("SELECT fine_fund_balance AS f FROM teams WHERE id = 'club'").first<{ f: number }>())?.f;

async function approveClassic() {
  const r = await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [...CLASSIC_FINE_SCHEDULE] });
  expect(r).toMatchObject({ ok: true, outcome: "approved" });
}

describe("schválení a platnost", () => {
  it("Klasiku kapitán schválí, platí až od pondělí", async () => {
    await approveClassic();
    const row = await db.prepare("SELECT status, origin, effective_from FROM fine_schedules").first<Record<string, unknown>>();
    expect(row).toMatchObject({ status: "active", origin: "approved", effective_from: "2026-11-30" });
    const before = await applyTrainingFines(db, "club", PROPOSED, [{ playerId: "p1", attended: false, reason: "Říkal, že zapomněl" }]);
    expect(before).toEqual([]);
  });

  it("tvrdý sazebník kapitán odmítne, vnucený platí jako diktát", async () => {
    const r = await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [item({ conditionKey: "any", amountCzk: 500 })] });
    expect(r).toMatchObject({ ok: true, outcome: "rejected" });
    expect((await db.prepare("SELECT status FROM fine_schedules").first<{ status: string }>())?.status).toBe("none");
    expect(await imposeSchedule(db, undefined, { teamId: "club", day: PROPOSED })).toMatchObject({ ok: true, outcome: "imposed" });
    const row = await db.prepare("SELECT status, origin, squad_stage FROM fine_schedules").first<Record<string, unknown>>();
    expect(row).toMatchObject({ status: "active", origin: "imposed" });
    expect(row?.squad_stage).toBeGreaterThanOrEqual(1);
    const capRel = await db.prepare("SELECT coach_relationship AS r FROM players WHERE id = 'cap'").first<{ r: number }>();
    expect(capRel?.r).toBe(59);
  });

  it("změny sazebníku se počítají za sezónu, v nové začínají od nuly", async () => {
    await approveClassic();
    // Minulá sezóna: pět změn.
    await db.prepare("UPDATE fine_schedules SET changes_season = 5, season_number = 0").run();
    await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [item({ conditionKey: "any", amountCzk: 500 })] });
    await imposeSchedule(db, undefined, { teamId: "club", day: PROPOSED });
    expect(await db.prepare("SELECT changes_season, season_number FROM fine_schedules").first()).toEqual({ changes_season: 1, season_number: 1 });
  });

  it("zmírnění platí hned a kapitána se neptá", async () => {
    await approveClassic();
    const softer = CLASSIC_FINE_SCHEDULE.map((i) => ({ ...i, amountCzk: i.valueKind === "czk" ? 20 : i.amountCzk }));
    expect(await proposeSchedule(db, undefined, { teamId: "club", day: IN_EFFECT, items: softer })).toMatchObject({ ok: true, outcome: "activated_softening" });
  });
});

describe("pokuty z tréninku", () => {
  it("flákání a hospoda ano, práce a volno od trenéra ne, jeden prohřešek jednou", async () => {
    await approveClassic();
    const att = [
      { playerId: "p1", attended: false, reason: "Zaspěl, prý měl budík na pět" },
      { playerId: "cap", attended: false, reason: "Páteční hospoda se protáhla" },
      { playerId: "stu", attended: false, reason: "Šéf ho nepustil dřív, prý urgentní zakázka" },
      { playerId: "kid", attended: false, reason: "Říkal, že zapomněl" },
      { playerId: "stu", attended: false, reason: "Dal jsi mu volno, odpočívá", restByCoach: true },
    ];
    const recorded = await applyTrainingFines(db, "club", IN_EFFECT, att);
    // Mladý do 19 let nepatří pod „Jen dospělí“.
    expect(recorded.map((f) => f.playerId).sort()).toEqual(["cap", "p1"]);
    expect(await applyTrainingFines(db, "club", IN_EFFECT, att)).toEqual([]);
    expect(await fund()).toBe(100);
  });

  it("od druhého prohřešku dvojnásobek", async () => {
    await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [item({ repeatMode: "double_from_second" })] });
    await applyTrainingFines(db, "club", IN_EFFECT, [{ playerId: "p1", attended: false, reason: "Říkal, že zapomněl" }]);
    await applyTrainingFines(db, "club", "2026-12-03", [{ playerId: "p1", attended: false, reason: "Zaspěl, prý měl budík na pět" }]);
    expect((await fines()).map((f) => f.amount_czk)).toEqual([50, 100]);
  });

  it("přetížený učeň odmítne platit a dluží", async () => {
    await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [item({ amountCzk: 200 })] });
    await imposeSchedule(db, undefined, { teamId: "club", day: PROPOSED });
    const days = ["2026-12-01", "2026-12-03", "2026-12-05"];
    for (const d of days) await applyTrainingFines(db, "club", d, [{ playerId: "stu", attended: false, reason: "Říkal, že zapomněl" }]);
    const statuses = (await fines()).map((f) => f.status);
    expect(statuses[0]).toBe("paid");
    expect(statuses.at(-1)).toBe("refused");
  });
});

describe("pokuty ze zápasu", () => {
  it("žlutá za protesty, červená za druhou žlutou, kocovina; stávkující a faul ne", async () => {
    await proposeSchedule(db, undefined, { teamId: "club", day: PROPOSED, items: [
      item({ itemKey: "yellow_card", conditionKey: "dissent" }),
      item({ itemKey: "red_card", conditionKey: "second_yellow", amountCzk: 100 }),
      item({ itemKey: "match_excuse", conditionKey: "hangover", amountCzk: 100 }),
    ] });
    await imposeSchedule(db, undefined, { teamId: "club", day: PROPOSED });
    const idMap = new Map([[1, "p1"], [2, "cap"], [3, "stu"]]);
    await db.prepare("INSERT INTO conversations (id, team_id, type, title) VALUES ('k', 'club', 'squad_group', 'Kabina')").run();
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, metadata) VALUES ('m1', 'k', 'player', 'kid', 'Nehraju', ?)")
      .bind(JSON.stringify({ type: "attendance", response: "no", timing: "match_day", calendarId: "cal1", strike: true })).run();
    const recorded = await applyMatchFines(db, {
      matchId: "m1", calendarId: "cal1", day: IN_EFFECT,
      sides: [{ side: 1, teamId: "club", isHuman: true, opponentName: "SK Lhota", idMap }],
      events: [
        { type: "card", detail: "yellow", description: "Žlutá karta za protesty pro Filip Pešek", playerId: 1, teamId: 1, minute: 20 },
        { type: "card", detail: "yellow", description: "Žlutá karta pro Karel Kapitán", playerId: 2, teamId: 1, minute: 30 },
        { type: "card", detail: "red", description: "Druhá žlutá a červená pro Karel Kapitán!", playerId: 2, teamId: 1, minute: 70 },
        { type: "card", detail: "yellow", description: "Žlutá karta za protesty pro soupeře", playerId: 1, teamId: 2, minute: 75 },
      ],
      absences: [
        { playerId: "stu", reason: "Kocovina", teamId: "club" },
        { playerId: "kid", reason: "Omluvenka", teamId: "club" },
      ],
    });
    expect(recorded.map((f) => `${f.playerId}:${f.itemKey}`).sort()).toEqual(["cap:red_card", "p1:yellow_card", "stu:match_excuse"]);
    const facts = (await fines()).map((f) => f.fact as string);
    expect(facts.some((f) => f.includes("soupeř SK Lhota"))).toBe(true);
  });
});

describe("prominutí, trvání a SMS pokuta", () => {
  it("prominutí vrátí peníze z pokladničky, trvání dluh zaplatí", async () => {
    await approveClassic();
    const [f] = await applyTrainingFines(db, "club", IN_EFFECT, [{ playerId: "p1", attended: false, reason: "Říkal, že zapomněl" }]);
    expect(await fund()).toBe(50);
    expect(await forgiveFine(db, { teamId: "club", fineId: f.id, day: IN_EFFECT })).toMatchObject({ ok: true });
    expect(await fund()).toBe(0);
    await db.prepare("INSERT INTO fines (id, team_id, player_id, item_key, source, source_ref, value_kind, amount_czk, czk_equivalent, status, in_schedule, game_date) VALUES ('r1', 'club', 'stu', 'training_missed', 'auto', 'x', 'czk', 50, 50, 'refused', 1, ?)").bind(IN_EFFECT).run();
    expect(await insistOnFine(db, { teamId: "club", fineId: "r1", day: IN_EFFECT })).toMatchObject({ ok: true });
    expect(await fund()).toBe(50);
  });

  it("SMS pokuta jde do pokladničky i bez sazebníku, prominutí ji vrátí", async () => {
    await recordSmsFine(db, { teamId: "club", playerId: "p1", commitmentId: "c1", amount: 300, quote: "Pokuta 300", day: IN_EFFECT });
    expect(await fund()).toBe(300);
    // Totéž udělení podruhé se nezapíše a volající se to dozví.
    await expect(recordSmsFine(db, { teamId: "club", playerId: "p1", commitmentId: "c1", amount: 300, quote: "Pokuta 300", day: IN_EFFECT })).rejects.toThrow();
    expect(await fund()).toBe(300);
    const f = await db.prepare("SELECT id FROM fines WHERE source = 'sms'").first<{ id: string }>();
    expect(await forgiveFine(db, { teamId: "club", fineId: f!.id, day: IN_EFFECT })).toMatchObject({ ok: true, message: "Prominuto." });
    expect(await fund()).toBe(0);
  });

  it("SMS pokuta klukovi z U21 téhož klubu jde do pokladničky áčka", async () => {
    await db.batch([
      db.prepare("INSERT INTO teams (id, name, user_id, parent_team_id, team_type) VALUES ('club-u21', 'TJ Dvory U21', 'u1', 'club', 'u21')"),
      db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, weekly_wage, coach_relationship, life_context, personality) VALUES ('junior', 'club-u21', 'Ondra', 'Malý', 17, 0, 50, '{}', ?)").bind(personality({})),
    ]);
    await recordSmsFine(db, { teamId: "club", playerId: "junior", commitmentId: "c2", amount: 100, quote: null, day: IN_EFFECT });
    expect(await fund()).toBe(100);
    // Cizí hráč ne.
    await db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age) VALUES ('alien', 'other', 'Cizí', 'Hráč', 25)").run();
    await expect(recordSmsFine(db, { teamId: "club", playerId: "alien", commitmentId: "c3", amount: 100, quote: null, day: IN_EFFECT })).rejects.toThrow();
    expect(await fund()).toBe(100);
  });

  it("SMS pokuta za trénink, který už zaplatil podle sazebníku, je zdvojená", async () => {
    await approveClassic();
    await applyTrainingFines(db, "club", IN_EFFECT, [{ playerId: "p1", attended: false, reason: "Říkal, že zapomněl" }]);
    expect(await scheduleDuplicateOf(db, { teamId: "club", playerId: "p1", quote: "Za ten trénink dostaneš pokutu 300", day: IN_EFFECT })).toContain("Na tréninku chyběl");
    expect(await scheduleDuplicateOf(db, { teamId: "club", playerId: "p1", quote: "Za tu žlutou platíš", day: IN_EFFECT })).toBeNull();
  });

  it("SMS pokuta za trénink, na kterém byl: ohradí se", async () => {
    await db.prepare("UPDATE teams SET last_training_result = ? WHERE id = 'club'")
      .bind(JSON.stringify({ attendance: [{ playerId: "p1", attended: true }] })).run();
    const fine: PendingFine = {
      id: "f", teamId: "club", playerId: "p1", itemKey: null, conditionKey: null, source: "sms", valueKind: "czk", amountCzk: 300,
      status: "paid", fact: "Trenér ti v SMS napsal: „Za včerejší trénink máš pokutu 300“", inSchedule: false, gameDate: IN_EFFECT,
    };
    const row = await db.prepare(`${PLAYER_PROFILE_SQL} WHERE id = 'p1'`).first<Record<string, unknown>>();
    const facts = await reactionFacts(db, [fine], profileFromRow(row!), IN_EFFECT);
    expect(facts.attendedLastTraining).toBe(true);
    expect(facts.stance).toBe("objects");
  });
});
