/**
 * Omluvenky z kabiny platí přednostně před losem.
 *
 * Chlumany 2026-11-08: ráno se do skupiny omluvili Horváth, Linhart („Došel mi benzín
 * uprostřed lesa“), Hrách a Kuneš. Odpoledne přišel hráč na hostování, los se posunul
 * a sestava ukazovala jako omluvené Horvátha, Veselého (s Linhartovou výmluvou),
 * Rokůska, Szabóa a Gažiho.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { recordedExcuses, settleAbsences, type AbsencePlayerInfo } from "./match-absences";

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
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  ]) await db.prepare(sql).run();
  const meta = (response: string, timing: string) => JSON.stringify({ type: "attendance", response, timing, calendarId: "cal-today" });
  const msg = (id: string, sender: string, body: string, response: string, timing: string) =>
    db.prepare("INSERT INTO messages VALUES (?, 'g-today', 'player', ?, ?, ?, ?)").bind(id, sender, body, meta(response, timing), `2026-11-0${timing === "day_before" ? 7 : 8} 03:1${id.slice(-1)}:00`);
  await db.batch([
    db.prepare("INSERT INTO conversations VALUES ('g-today', 't-chl', 'squad_group', '⚽ vs FK Dřevostroj Radhostice')"),
    msg("m1", "linhart", "Ano, těším se", "yes", "day_before"),
    msg("m2", "vesely", "Jasně, budu tam", "yes", "day_before"),
    msg("m3", "horvath", "Kluci slavili narozky, já dneska slavím s postelí", "no", "match_day"),
    msg("m4", "linhart", "Došel mi benzín uprostřed lesa, jdu pěšky na pumpu", "no", "match_day"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const info = (smsText: string, category = "personal"): AbsencePlayerInfo => ({ reason: "Osobní", category, emoji: "🙈", smsText });

describe("omluvenky z kabiny mají přednost před losem", () => {
  it("načte „ne“ k tomu kolu, „ano“ nepočítá", async () => {
    const r = await recordedExcuses(db, "t-chl", "cal-today");
    expect([...(r ?? new Map())]).toEqual([
      ["horvath", "Kluci slavili narozky, já dneska slavím s postelí"],
      ["linhart", "Došel mi benzín uprostřed lesa, jdu pěšky na pumpu"],
    ]);
  });

  it("ke kolu bez zpráv vrátí null a platí los", async () => {
    expect(await recordedExcuses(db, "t-chl", "cal-jine")).toBeNull();
    const generated = new Map([["vesely", info("Mám směnu")]]);
    expect(settleAbsences(generated, null, ["vesely"])).toEqual(generated);
  });

  it("posunutý los po příchodu hráče na hostování omluvenky nepřehodí", async () => {
    // Po hostování los přidělil Linhartovu výmluvu Veselému a omluvil i Rokůska.
    const shifted = new Map([
      ["horvath", info("Kluci slavili narozky, já dneska slavím s postelí")],
      ["vesely", info("Došel mi benzín uprostřed lesa, jdu pěšky na pumpu", "commute")],
      ["rokusek", info("Kámoš slavil osmnáctiny ve Vimperku")],
      ["soud", info("Jsem u soudu", "incident")],
    ]);
    const recorded = await recordedExcuses(db, "t-chl", "cal-today");
    const settled = settleAbsences(shifted, recorded, ["horvath", "vesely", "linhart", "rokusek", "soud", "hostujici"]);
    expect([...settled.keys()].sort()).toEqual(["horvath", "linhart", "soud"]);
    // Text i druh omluvenky jdou s tím, kdo ji napsal.
    expect(settled.get("linhart")).toEqual(info("Došel mi benzín uprostřed lesa, jdu pěšky na pumpu", "commute"));
  });

  it("omluvenka, kterou los už nezná, dostane obecný popis", () => {
    const settled = settleAbsences(new Map(), new Map([["kunes", "Bereme si štěně z útulku"]]), ["kunes"]);
    expect(settled.get("kunes")).toEqual({ reason: "Omluvenka", category: "personal", emoji: "📩", smsText: "Bereme si štěně z útulku" });
  });
});
