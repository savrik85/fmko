/**
 * Omluvenky z kabiny pro osobní chat s hráčem.
 *
 * Linhart (Chlumany 2026-11-08) ráno napsal do skupiny „⚽ vs FK Dřevostroj Radhostice“
 * „Došel mi benzín uprostřed lesa“ a v osobním chatu pak trenérovi tvrdil, že je doma a fit.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

// Skutečný důvod omluvenky bere chat z losu (týž výpočet jako sestava); los tu stojí na pár řádcích.
vi.mock("../events/match-absences", async (orig) => ({
  ...(await orig<typeof import("../events/match-absences")>()),
  getAbsentPlayersMap: vi.fn(async (_db: unknown, _teamId: string, ctx: { matchKey: string }) => ctx.matchKey === "cal-today"
    ? new Map([
      ["linhart", { reason: "Doprava", category: "commute", emoji: "⛽", smsText: "Došel mi benzín uprostřed lesa, jdu pěšky na pumpu" }],
      ["vesely", { reason: "Kocovina", category: "hangover", emoji: "🍺", smsText: "Strejda slavil padesát" }],
    ])
    : new Map([["kratochvil", { reason: "Omluvenka", category: "personal", emoji: "📩", smsText: "Mám doktora" }]])),
}));

import { getAbsentPlayersMap } from "../events/match-absences";
import { loadUpcomingAbsences } from "./ai-player-spawn";

let miniflare: Miniflare;
let db: D1Database;
const now = new Date("2026-11-08T11:00:00Z");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, game_date TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, status TEXT, created_at TEXT)",
  ]) await db.prepare(sql).run();

  const meta = (response: string, timing: string, calendarId: string) =>
    JSON.stringify({ type: "attendance", response, timing, calendarId });
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('t-chl', '2026-11-08T16:00:00.000Z')"),
    db.prepare(`INSERT INTO season_calendar VALUES
      ('cal-today', '2026-11-08T17:00:00.000Z', 'scheduled'),
      ('cal-tomorrow', '2026-11-09T17:00:00.000Z', 'scheduled'),
      ('cal-played', '2026-11-07T17:00:00.000Z', 'simulated')`),
    db.prepare(`INSERT INTO conversations VALUES
      ('g-today', 't-chl', 'squad_group', '⚽ vs FK Dřevostroj Radhostice'),
      ('g-played', 't-chl', 'squad_group', '⚽ vs SK Lhenice'),
      ('g-old', 't-chl', 'squad_group', '⚽ vs FK Volary'),
      ('p-linhart', 't-chl', 'player', 'Patrick Linhart')`),
    db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m1", "g-today", "linhart", "Ano, těším se", meta("yes", "day_before", "cal-today"), "2026-11-07 03:15:37"),
    db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m2", "g-today", "linhart", "Došel mi benzín uprostřed lesa, jdu pěšky na pumpu", meta("no", "match_day", "cal-today"), "2026-11-08 03:14:45"),
    db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m3", "g-played", "rybar", "Mám svatbu", meta("no", "day_before", "cal-played"), "2026-11-06 03:10:00"),
    // Stará skupina, která se po zápase nesmazala: omluvenka z minulého kola.
    db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m4", "g-old", "novak", "Jsem na horách", meta("no", "day_before", "cal-tomorrow"), "2026-10-20T03:10:00Z"),
    db.prepare("INSERT INTO messages VALUES (?, ?, 'user', ?, ?, ?, ?)")
      .bind("m5", "p-linhart", null, "Ať pro tebe sjedou do toho lesa", null, "2026-11-08T11:06:00Z"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("omluvenky z kabiny", () => {
  it("osobní chat zná ranní omluvenku na dnešní zápas i se soupeřem", async () => {
    const map = await loadUpcomingAbsences(db, "t-chl", now);
    expect(map?.get("linhart")).toEqual({
      reason: "Doprava", text: "Došel mi benzín uprostřed lesa, jdu pěšky na pumpu", when: "dnes", opponent: "FK Dřevostroj Radhostice",
    });
    // Los se ptá na týž zápas, ke kterému omluvenka patří (ligové kolo, ne přátelák).
    expect(vi.mocked(getAbsentPlayersMap).mock.calls.some(([, team, ctx]) => team === "t-chl" && ctx.matchKey === "cal-today" && !ctx.isFriendly)).toBe(true);
  });

  it("omluvenka k odehranému zápasu ani stará zpráva z nesmazané skupiny neplatí", async () => {
    const map = await loadUpcomingAbsences(db, "t-chl", now);
    expect(map?.has("rybar")).toBe(false);
    expect(map?.has("novak")).toBe(false);
    expect([...(map?.keys() ?? [])]).toEqual(["linhart"]);
  });

  it("omluvenka den předem je na zítřek, jiný tým nic nevidí", async () => {
    await db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m6", "g-today", "kratochvil", "Mám doktora", JSON.stringify({ response: "no", timing: "day_before", calendarId: "cal-tomorrow" }), "2026-11-08T03:12:00Z")
      .run();
    expect((await loadUpcomingAbsences(db, "t-chl", now))?.get("kratochvil")?.when).toBe("zítra");
    expect(await loadUpcomingAbsences(db, "t-jiny", now)).toBeUndefined();
  });

  it("omluvenka, kterou los nezná, skutečný důvod nemá: hráč zná jen svou výmluvu", async () => {
    expect((await loadUpcomingAbsences(db, "t-chl", now))?.get("kratochvil")?.reason).toBe("");
  });

  it("trenér ho v SMS přemluvil („přijdu“ ze slibu do kabiny): omluvenka v chatu už neplatí", async () => {
    // Přibyl / Jelínek (E2E 22. 11.): slib „přijdu“ zapíše do kabiny zápasu odpověď „yes“ s timing pledge.
    await db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m7", "g-today", "vesely", "Strejda slavil padesát", JSON.stringify({ type: "attendance", response: "no", timing: "match_day", calendarId: "cal-today" }), "2026-11-08T03:16:00Z").run();
    expect((await loadUpcomingAbsences(db, "t-chl", now))?.has("vesely")).toBe(true);
    await db.prepare("INSERT INTO messages VALUES (?, ?, 'player', ?, ?, ?, ?)")
      .bind("m8", "g-today", "vesely", "Trenér mě ukecal, přijdu.", JSON.stringify({ type: "attendance", response: "yes", timing: "pledge", calendarId: "cal-today" }), "2026-11-08T10:40:00Z").run();
    expect((await loadUpcomingAbsences(db, "t-chl", now))?.has("vesely")).toBe(false);
  });
});
