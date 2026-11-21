/**
 * Brigáda přes kabinu nad skutečnou D1 (Miniflare): zápis z kabiny, jedna za týden,
 * vyhodnocení v `settleCoachCommitments` (sníh a 6 lidí, kondice hřiště, polovičatý výsledek,
 * chabé výmluvy), spotřeba v `applyPitchWear`, AI klub a opakovaný běh.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const chat = vi.hoisted(() => {
  class GeminiUnavailableError extends Error {}
  return { askModelJson: vi.fn(), GeminiUnavailableError };
});
vi.mock("./ai-player-chat", () => ({
  askModelJson: chat.askModelJson,
  COACH_TEXT_RULE: "pravidlo",
  coachQuote: (text: string) => `<<<${text}>>>`,
  GeminiUnavailableError: chat.GeminiUnavailableError,
}));

import { cancelCommitment, settleCoachCommitments } from "./coach-commitments";
import { handleSquadBrigade, loadBrigadeOutlook, scheduleClubBrigade } from "./squad-brigade";
import { applyPitchWear } from "../stadium/pitch-wear";
import { weatherForDay, winternessForDate } from "../season/season-weather";

let miniflare: Miniflare;
let db: D1Database;

const sql = (file: string) => readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8")
  .replace(/--[^\n]*/g, "").replace(/\n/g, " ");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec(sql("0316_coach_commitments.sql"));
  for (const statement of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, budget INTEGER, game_date TEXT, captain_id TEXT, village_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, position TEXT, weekly_wage INTEGER, personality TEXT, life_context TEXT, coach_relationship INTEGER, status TEXT, loan_from_team_id TEXT)",
    "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, status TEXT, calendar_id TEXT, simulated_at TEXT, home_lineup_data TEXT, away_lineup_data TEXT, home_score INTEGER, away_score INTEGER)",
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, minutes_played INTEGER, goals INTEGER, assists INTEGER)",
    "CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, pitch_condition INTEGER, pitch_type TEXT, pitch_care_mode TEXT NOT NULL DEFAULT 'auto', pitch_care_ordered INTEGER NOT NULL DEFAULT 0, pitch_snow_clearing_ordered INTEGER NOT NULL DEFAULT 0, pitch_moisture INTEGER)",
    "CREATE TABLE equipment (id TEXT, team_id TEXT, pitch_heating INTEGER)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "CREATE TABLE village_history (id TEXT PRIMARY KEY, village_id TEXT NOT NULL, team_id TEXT, official_id TEXT, event_type TEXT NOT NULL, description TEXT NOT NULL, impact TEXT, game_date TEXT NOT NULL, created_at TEXT)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
  ]) await db.prepare(statement).run();
  await db.exec(sql("0319_brigade.sql"));
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

/** Den, kdy podle jediného zdroje počasí (season-weather.ts) sněží, a den, kdy ne. */
const weatherOn = (day: string) => weatherForDay(`${day}T17:00:00.000Z`, winternessForDate(`${day}T17:00:00.000Z`)).weather;
function findDay(snow: boolean): string {
  for (let i = 1; i < 90; i++) {
    const day = new Date(Date.UTC(2026, 11, i)).toISOString().slice(0, 10);
    if ((weatherOn(day) === "snow") === snow) return day;
  }
  throw new Error("v zimě nenalezen vhodný den");
}
const SNOW_DAY = findDay(true);
const DRY_DAY = findDay(false);
const dayBefore = (day: string, hour: number) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000 + hour * 3_600_000);

interface PlayerSpec { id: string; rel?: number; discipline?: number; hangover?: boolean; injured?: boolean; team?: string }

async function squad(players: PlayerSpec[]): Promise<void> {
  for (const p of players) {
    await db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, position, personality, life_context, coach_relationship, status)
       VALUES (?, ?, ?, 'Novák', 'MID', ?, ?, ?, 'active')`,
    ).bind(p.id, p.team ?? "club", `Hráč${p.id}`, JSON.stringify({ discipline: p.discipline ?? 100 }),
      JSON.stringify({ morale: 50, ...(p.hangover ? { hangover: 1 } : {}) }), p.rel ?? 100).run();
    if (p.injured) await db.prepare("INSERT INTO injuries VALUES (?, 10)").bind(p.id).run();
  }
}
const keen = (n: number, prefix = "k") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));

async function homeMatch(day: string, id = "m1"): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO season_calendar (id, scheduled_at, status) VALUES (?, ?, 'scheduled')").bind(`cal-${id}`, `${day}T17:00:00.000Z`),
    db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, calendar_id) VALUES (?, 'club', 'rival', 'scheduled', ?)").bind(id, `cal-${id}`),
  ]);
}

/** Brigáda s pevným id: los účasti je podle id, takže výsledek je stejný při každém běhu testu. */
async function brigade(id: string, at: Date, o: { beer?: boolean; conv?: string | null; club?: string; rep?: string } = {}): Promise<void> {
  await db.prepare(
    `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     VALUES (?, ?, ?, ?, 'brigade', 'active', ?, ?, 'brigáda', ?)`,
  ).bind(id, o.club ?? "club", o.rep ?? "k1", o.conv === undefined ? "squad-chat" : o.conv, new Date(at.getTime() - 2 * 86_400_000).toISOString(),
    at.toISOString(), JSON.stringify({ at: at.toISOString(), beer: o.beer ?? false, rosterTeamId: o.club ?? "club", source: "kabina" })).run();
}

const one = async <T>(query: string, ...params: unknown[]) => db.prepare(query).bind(...params).first<T>();
const count = async (query: string, ...params: unknown[]) => (await one<{ n: number }>(query, ...params))?.n ?? 0;
const stadium = () => one<{ pitch_condition: number; pitch_snow_clearing_volunteer: number; pitch_snow_clearing_ordered: number }>(
  "SELECT pitch_condition, pitch_snow_clearing_volunteer, pitch_snow_clearing_ordered FROM stadiums WHERE team_id = 'club'");
const morale = async (pid: string) => (await one<{ m: number }>("SELECT json_extract(life_context, '$.morale') AS m FROM players WHERE id = ?", pid))?.m;
const captainMessages = () => db.prepare("SELECT body, metadata FROM messages WHERE conversation_id = 'squad-chat' AND sender_type = 'player'")
  .all<{ body: string; metadata: string }>().then((r) => r.results);

beforeEach(async () => {
  for (const t of ["coach_commitments", "teams", "players", "injuries", "conversations", "messages", "season_calendar", "matches",
    "stadiums", "equipment", "transactions", "village_history", "coach_relation_log"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  chat.askModelJson.mockReset();
  // Výchozí stav testů: AI vypnutá, výzvu rozpozná pravidlo.
  chat.askModelJson.mockRejectedValue(new chat.GeminiUnavailableError("ai_provider = off"));
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, parent_team_id, budget, game_date, captain_id, village_id) VALUES ('club', 'TJ Dvory', 'u1', NULL, 10000, '2026-12-01', 'k1', 'v1'), ('rival', 'SK Lhota', 'u2', NULL, 0, '2026-12-01', NULL, 'v2')"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('squad-chat', 'club', 'squad_group', 'Kabina', '2026-11-01')"),
    db.prepare("INSERT INTO stadiums (team_id, pitch_condition, pitch_type, pitch_moisture) VALUES ('club', 60, 'natural', 50)"),
  ]);
});

const CALL = "Kluci v sobotu v 9 sraz na hřišti s lopatama, napadlo půl metru sněhu a v neděli hrajem doma. Kdo přijde, má ode mě pivo 🍺";
const WED = new Date("2026-11-25T08:00:00Z");
const rep = { id: "k1", firstName: "Hráčk1" };

describe("výzva v kabině", () => {
  it("se zapíše jako brigáda s časem z textu a kabina dostane poznámku", async () => {
    await squad(keen(3));
    const id = await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: WED });
    expect(id).toBeTruthy();
    const row = await one<{ kind: string; due_at: string; details: string; status: string }>("SELECT kind, due_at, details, status FROM coach_commitments WHERE id = ?", id);
    expect(row).toMatchObject({ kind: "brigade", status: "active", due_at: "2026-11-28T08:00:00.000Z" });
    expect(JSON.parse(row!.details)).toMatchObject({ beer: true, rosterTeamId: "club", source: "kabina" });
    const note = await one<{ body: string; metadata: string }>("SELECT body, metadata FROM messages WHERE conversation_id = 'squad-chat' AND sender_type = 'system'");
    expect(note?.body).toBe("📝 Kabina si zapsala brigádu: v sobotu v 9:00, pivo platí trenér.");
    expect(JSON.parse(note!.metadata)).toMatchObject({ type: "coach_commitment_note", commitmentId: id, kind: "brigade" });
  });

  it("vzpomínka na minulou brigádu ani sázka o basu brigádu nezaloží", async () => {
    for (const message of ["Brigáda na sprchy byla super, díky všem co přišli", "kdyz v nedeli vyhrajem, platim basu"]) {
      expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message, representative: rep, now: WED })).toBeNull();
    }
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments")).toBe(0);
  });

  it("druhá brigáda v týdnu se nespustí, kabina se to dozví jednou", async () => {
    const first = await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: WED });
    const later = new Date(WED.getTime() + 3_600_000);
    const other = "zitra v deset odklizime snih z hriste, kdo muze at prijde";
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: other, representative: rep, now: later })).toBeNull();
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: other, representative: rep, now: later })).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'brigade'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE json_extract(metadata, '$.type') = 'brigade_refused'")).toBe(1);
    // Stejná zpráva zpracovaná podruhé (opakovaný běh): žádná další brigáda ani poznámka.
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: later })).toBe(first);
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE sender_type = 'system'")).toBe(2);
  });

  it("dvě výzvy naráz založí jen jednu brigádu", async () => {
    const results = await Promise.all([
      handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: WED }),
      handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: "pánove zejtra rano brigada na hristi", representative: rep, now: WED }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM coach_commitments WHERE kind = 'brigade'")).toBe(1);
  });

  it("zrušená brigáda („to nebyla brigáda“) další nebrání, po týdnu jde svolat znovu", async () => {
    const first = await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: WED });
    expect(await cancelCommitment(db, { teamId: "club", commitmentId: first!, now: new Date(WED.getTime() + 60_000) })).toEqual({ ok: true });
    const second = await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: new Date(WED.getTime() + 120_000) });
    expect(second).toBeTruthy();
    await db.prepare("UPDATE coach_commitments SET status = 'kept' WHERE id = ?").bind(second).run();
    const nextWeek = new Date(WED.getTime() + 8 * 86_400_000);
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: nextWeek })).toBeTruthy();
  });

  it("s modelem: výzvu potvrdí citací, minulý čas pojistka zahodí", async () => {
    chat.askModelJson.mockResolvedValue({ kind: "brigade", quote: "v sobotu v 9 sraz na hřišti s lopatama" });
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: CALL, representative: rep, now: WED })).toBeTruthy();
    await db.prepare("DELETE FROM coach_commitments").run();
    chat.askModelJson.mockResolvedValue({ kind: "brigade", quote: "Brigáda na sprchy byla super" });
    expect(await handleSquadBrigade(db, {}, { teamId: "club", convId: "squad-chat", message: "Brigáda na sprchy byla super, díky všem co přišli", representative: rep, now: WED })).toBeNull();
  });
});

describe("vyhodnocení brigády", () => {
  it("sníh u domácího zápasu a aspoň 6 lidí: sníh se odklidí zdarma s účinností jako firma", async () => {
    await squad(keen(12));
    await homeMatch(SNOW_DAY);
    await brigade("b-snow-1", dayBefore(SNOW_DAY, 9), { beer: true });
    expect(await settleCoachCommitments(db, dayBefore(SNOW_DAY, 8))).toBe(0);
    expect(await settleCoachCommitments(db, dayBefore(SNOW_DAY, 10))).toBe(1);

    const s = await stadium();
    expect(s?.pitch_snow_clearing_volunteer).toBeGreaterThanOrEqual(6);
    expect(s?.pitch_condition).toBe(60);
    const details = JSON.parse((await one<{ details: string }>("SELECT details FROM coach_commitments WHERE id = 'b-snow-1'"))!.details);
    expect(details).toMatchObject({ outcome: "full", snow: true, matchId: "m1" });
    expect(details.attendees).toBe(s?.pitch_snow_clearing_volunteer);

    // Pivo pro brigádníky jednou, na klub, podle počtu lidí.
    const beer = await db.prepare("SELECT amount, type, reference_id FROM transactions").all<{ amount: number; type: string; reference_id: string }>();
    expect(beer.results).toEqual([{ amount: -50 * details.attendees, type: "manager_social", reference_id: "brigade-b-snow-1" }]);

    // Kapitán napíše do kabiny, obec si to zapíše do kroniky.
    const msgs = await captainMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toMatch(/odházený|Sníh je pryč/);
    expect(msgs[0].body).not.toMatch(/[—–]/);
    const chronicle = await one<{ event_type: string; description: string; village_id: string }>("SELECT event_type, description, village_id FROM village_history");
    expect(chronicle).toMatchObject({ event_type: "brigade_completed", village_id: "v1" });
    expect(chronicle?.description).toContain("sníh z hřiště odházený");

    // Zápas: úklid bez poplatku, rozbahnění jako po placené partě (9 bodů bez péče → 6), objednávka spotřebovaná.
    const care = await applyPitchWear(db, "club", "snow", SNOW_DAY);
    expect(care).toMatchObject({ service: "snow_clearing", cost: 0, wear: 6 });
    expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'pitch_repair'")).toBe(0);
    expect(await stadium()).toMatchObject({ pitch_condition: 54, pitch_snow_clearing_volunteer: 0 });
  });

  it("brigádníci mají přednost i před zaplacenou partou: nic se neplatí", async () => {
    await squad(keen(12));
    await homeMatch(SNOW_DAY);
    await brigade("b-snow-1", dayBefore(SNOW_DAY, 9));
    await settleCoachCommitments(db, dayBefore(SNOW_DAY, 10));
    await db.prepare("UPDATE stadiums SET pitch_snow_clearing_ordered = 1 WHERE team_id = 'club'").run();
    expect(await applyPitchWear(db, "club", "snow", SNOW_DAY)).toMatchObject({ service: "snow_clearing", cost: 0 });
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(0);
    expect(await stadium()).toMatchObject({ pitch_snow_clearing_ordered: 0, pitch_snow_clearing_volunteer: 0 });
  });

  it("zápas se sněhem se odehrál dřív, než se brigáda vyhodnotila: jen kondice hřiště, sníh na další zápas nezůstane", async () => {
    await squad(keen(12));
    await homeMatch(SNOW_DAY);
    await db.prepare("UPDATE matches SET status = 'simulated' WHERE id = 'm1'").run();
    await brigade("b-late-1", new Date(`${SNOW_DAY}T13:00:00.000Z`));
    await settleCoachCommitments(db, new Date(Date.parse(`${SNOW_DAY}T13:00:00.000Z`) + 21 * 3_600_000));
    expect(await stadium()).toMatchObject({ pitch_condition: 68, pitch_snow_clearing_volunteer: 0 });
  });

  it("bez sněhu brigáda přidá kondici hřiště", async () => {
    await squad(keen(12));
    await homeMatch(DRY_DAY);
    await brigade("b-dry-1", dayBefore(DRY_DAY, 9));
    await settleCoachCommitments(db, dayBefore(DRY_DAY, 10));
    expect(await stadium()).toMatchObject({ pitch_condition: 68, pitch_snow_clearing_volunteer: 0 });
    expect((await captainMessages())[0].body).toMatch(/Brigáda hotová|Hotovo/);
    // Bez slíbeného piva se nic neplatí.
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(0);
  });

  it("málo lidí znamená polovičatý výsledek", async () => {
    // Pět ochotných, ostatní zranění: přijdou tři až pět.
    await squad([...keen(5), { id: "injured1", injured: true }, { id: "injured2", injured: true }]);
    await brigade("b-few-1", dayBefore(DRY_DAY, 9));
    await settleCoachCommitments(db, dayBefore(DRY_DAY, 10));
    const details = JSON.parse((await one<{ details: string }>("SELECT details FROM coach_commitments WHERE id = 'b-few-1'"))!.details);
    expect(details.outcome).toBe("partial");
    expect(details.attendees).toBeGreaterThanOrEqual(3);
    expect(details.attendees).toBeLessThanOrEqual(5);
    expect((await stadium())?.pitch_condition).toBe(64);
    expect(await count("SELECT COUNT(*) AS n FROM village_history WHERE description LIKE '%napůl%'")).toBe(1);
  });

  it("když nikdo nepřijde, hřiště zůstane, jak bylo, a chabé výmluvy něco stojí", async () => {
    await squad([
      { id: "h1", rel: 0, discipline: 0, hangover: true },
      { id: "h2", rel: 0, discipline: 0, hangover: true },
    ]);
    await homeMatch(SNOW_DAY);
    await brigade("b-flop-1", dayBefore(SNOW_DAY, 9), { rep: "h1" });
    await settleCoachCommitments(db, dayBefore(SNOW_DAY, 10));
    expect(await stadium()).toMatchObject({ pitch_condition: 60, pitch_snow_clearing_volunteer: 0 });
    const details = JSON.parse((await one<{ details: string }>("SELECT details FROM coach_commitments WHERE id = 'b-flop-1'"))!.details);
    expect(details.outcome).toBe("flop");
    // Kocovina je chabá výmluva: kdo nepřišel, má horší náladu (kdo přece jen přišel, lepší).
    const moods = [await morale("h1"), await morale("h2")];
    expect(moods.every((m) => m === 47 || m === 52)).toBe(true);
    expect(moods.filter((m) => m === 47)).toHaveLength(2 - details.attendees);
    expect(details.attendees).toBeLessThan(2);
  });

  it("dvojí vyhodnocení (dvojí cron, souběh) dá jeden efekt a jednu zprávu", async () => {
    await squad(keen(12));
    await brigade("b-twice-1", dayBefore(DRY_DAY, 9), { beer: true });
    const at = dayBefore(DRY_DAY, 10);
    const runs = await Promise.all([settleCoachCommitments(db, at), settleCoachCommitments(db, at)]);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await settleCoachCommitments(db, new Date(at.getTime() + 86_400_000))).toBe(0);
    expect((await stadium())?.pitch_condition).toBe(68);
    expect(await captainMessages()).toHaveLength(1);
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM village_history")).toBe(1);
    expect(await morale("k1")).toBeLessThanOrEqual(52);
  });

  it("AI vypnutá: kapitán napíše bez fotky; se zapnutou AI fotku přiloží", async () => {
    await squad(keen(12));
    await brigade("b-photo-1", dayBefore(DRY_DAY, 9));
    await settleCoachCommitments(db, dayBefore(DRY_DAY, 10), { CACHE_KV: { get: async () => "off" } as unknown as KVNamespace });
    expect(JSON.parse((await captainMessages())[0].metadata).photoKey).toBeUndefined();

    await db.prepare("DELETE FROM messages").run();
    await brigade("b-photo-2", new Date(dayBefore(DRY_DAY, 9).getTime() + 8 * 86_400_000));
    const stored: string[] = [];
    const env = {
      CACHE_KV: { get: async () => "workers-ai" } as unknown as KVNamespace,
      AI: { run: async () => ({ image: btoa("jpeg") }) } as unknown as Ai,
      SEED_DATA: { put: async (key: string) => { stored.push(key); return {}; } } as unknown as R2Bucket,
    };
    await settleCoachCommitments(db, new Date(dayBefore(DRY_DAY, 10).getTime() + 8 * 86_400_000), env);
    const meta = JSON.parse((await captainMessages())[0].metadata);
    expect(meta).toMatchObject({ type: "photo", photoAlt: expect.stringContaining("hrábě") });
    expect(stored).toEqual([meta.photoKey]);
  });
});

describe("AI klub", () => {
  it("brigádu z týdenní správy vyhodnotí bez zpráv, hřiště i kronika platí", async () => {
    await db.prepare("UPDATE teams SET user_id = 'ai' WHERE id = 'club'").run();
    await squad(keen(12));
    await homeMatch(DRY_DAY);
    const outlook = await loadBrigadeOutlook(db, "club", dayBefore(DRY_DAY, 6));
    expect(outlook).toMatchObject({ available: true, snowAtNextHome: false, nextHomeMatchAt: `${DRY_DAY}T17:00:00.000Z` });
    const id = await scheduleClubBrigade(db, { clubTeamId: "club", at: new Date(outlook.dueAt), beer: false, now: dayBefore(DRY_DAY, 6) });
    expect(id).toBeTruthy();
    expect(await scheduleClubBrigade(db, { clubTeamId: "club", at: new Date(outlook.dueAt), beer: false, now: dayBefore(DRY_DAY, 6) })).toBeNull();
    expect((await loadBrigadeOutlook(db, "club", dayBefore(DRY_DAY, 7))).available).toBe(false);

    await settleCoachCommitments(db, new Date(Date.parse(outlook.dueAt) + 3_600_000));
    expect((await stadium())?.pitch_condition).toBe(68);
    expect(await count("SELECT COUNT(*) AS n FROM messages")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM village_history")).toBe(1);
  });

  it("u sněhu navrhne termín den před zápasem dopoledne", async () => {
    await homeMatch(SNOW_DAY);
    const now = new Date(Date.parse(`${SNOW_DAY}T00:00:00Z`) - 3 * 86_400_000);
    const outlook = await loadBrigadeOutlook(db, "club", now);
    expect(outlook.snowAtNextHome).toBe(true);
    // 10:00 v Praze = 9:00 UTC v zimě.
    expect(outlook.dueAt).toBe(new Date(Date.parse(`${SNOW_DAY}T09:00:00Z`) - 86_400_000).toISOString());
  });
});
