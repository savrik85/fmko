/**
 * Reakce na trest a šablony z tlačítka nad skutečnou D1 (Miniflare): hráč, který na věc
 * v rozhovoru před chvílí odpověděl, nedostane druhou reakci ze šablony.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const fx = vi.hoisted(() => ({ sendEventSms: vi.fn(async () => ({ convId: "c1", body: "", aiGenerated: true })) }));
vi.mock("../messaging/event-sms", () => ({ sendEventSms: fx.sendEventSms }));

import { ADVANCE_TALK_RE, aiReplyCoveredIt } from "./button-sms";
import { sendPunishmentReaction } from "./punishment-reaction";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB") as unknown as D1Database;
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, coach_relationship INTEGER, life_context TEXT, personality TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, participant_id TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "conversations", "messages"]) await db.prepare(`DELETE FROM ${t}`).run();
  fx.sendEventSms.mockClear();
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('club', 'u1'), ('ai', 'ai')"),
    db.prepare(`INSERT INTO players VALUES ('turek', 40, '{"morale":45}', '{"temper":70}')`),
    db.prepare("INSERT INTO conversations VALUES ('c1', 'club', 'player', 'turek')"),
  ]);
});

const AI = JSON.stringify({ ai_generated: true, scenario_id: "coach_initiated", turn: 1 });
const msg = (id: string, who: "user" | "player", body: string, at: string, metadata: string | null = null) =>
  db.prepare("INSERT INTO messages VALUES (?, 'c1', ?, ?, ?, ?)").bind(id, who, body, metadata, at).run();
const punish = (now: string, kind: "srazka" | "pokuta" = "srazka") => sendPunishmentReaction(db, undefined, {
  teamId: "club", incidentId: "inc-vitrina", kind, amount: 776, matches: null, offence: "Poháry z vitríny",
  player: { id: "turek", firstName: "Radek", lastName: "Turek" }, now: new Date(now),
});

describe("reakce na trest", () => {
  it("Turek 23. 10.: na „Zaplatíš si to!“ odepsal před dvěma minutami, druhá reakce nepřijde", async () => {
    await msg("m1", "user", "Kecy. Zaplatíš si to!", "2026-10-23T06:24:10.000Z");
    await msg("m2", "player", "Trenére, fakt kecy? Takže myslíš, že ty poháry se zaplatí samy?", "2026-10-23T06:24:30.000Z", AI);
    expect(await punish("2026-10-23T06:26:00Z")).toBe("covered");
    expect(fx.sendEventSms).not.toHaveBeenCalled();
  });

  it("Turek 13. 10.: „Seru na to!“ bez řeči o trestu, reakce přijde a navazuje vzdorně", async () => {
    await msg("m1", "user", "Jak myslíš. Mohl jsi tam odpoledne po práci zajít a vyřešit to", "2026-10-13T05:02:00.000Z");
    await msg("m2", "player", "Trenére, fakt? Mám dělat přesčasy kvůli rozbitým sprchám? Seru na to! 😠", "2026-10-13T05:02:30.000Z", AI);
    expect(await punish("2026-10-13T05:07:00Z", "pokuta")).toBe("sent");
    const req = (fx.sendEventSms.mock.calls[0] as unknown[])[2] as { instruction: string; fallback: readonly string[]; metadata: Record<string, unknown>; scenarioId: string };
    expect(req.instruction).toContain("že na to sereš");
    expect(req.metadata).toMatchObject({ type: "incident", incidentId: "inc-vitrina", punishment: "pokuta", stance: "defiant" });
    expect(req.scenarioId).toBe("punishment_reaction");
    expect(req.fallback.join(" ")).not.toContain("Zasloužil jsem si to");
  });

  it("odpověď starší než deset minut reakci nezastaví", async () => {
    await msg("m1", "user", "Strhnu ti to z výplaty.", "2026-10-23T06:00:00.000Z");
    await msg("m2", "player", "Klidně.", "2026-10-23T06:00:30.000Z", AI);
    expect(await punish("2026-10-23T06:30:00Z")).toBe("sent");
  });

  it("AI klubu se nepíše", async () => {
    expect(await sendPunishmentReaction(db, undefined, {
      teamId: "ai", incidentId: "i", kind: "pokuta", amount: 1, matches: null, offence: "x", player: { id: "turek", firstName: "R", lastName: "T" },
    })).toBe("skipped");
  });
});

describe("dvojí poděkování za zálohu (Filip Němec, 31. 10.)", () => {
  it("v rozhovoru o záloze poděkoval před pár vteřinami: šablona z tlačítka se nepošle", async () => {
    await msg("m1", "user", "Ahoj, muzes 👍", "2026-10-31T10:59:12.365Z");
    await msg("m2", "player", "Fakt moc díky, trenére, strašně mi to pomůže! 🙏", "2026-10-31T10:59:21.307Z",
      JSON.stringify({ ai_generated: true, scenario_id: "zadost_o_zalohu", turn: 2, final: true }));
    expect(await aiReplyCoveredIt(db, { teamId: "club", playerId: "turek", scenarioIds: ["zadost_o_zalohu"], coachRe: ADVANCE_TALK_RE, now: new Date("2026-10-31T10:59:21Z") })).toBe(true);
  });

  it("odpověď o něčem jiném nebo šablona bez modelu se nepočítá", async () => {
    await msg("m1", "user", "Jak bylo na pile?", "2026-10-31T10:55:00.000Z");
    await msg("m2", "player", "Dobrý, trenére.", "2026-10-31T10:55:20.000Z", AI);
    await msg("m3", "player", "Trenére, dostal jsem se do problémů s penězi.", "2026-10-31T10:56:00.000Z", JSON.stringify({ type: "incident" }));
    expect(await aiReplyCoveredIt(db, { teamId: "club", playerId: "turek", scenarioIds: ["zadost_o_zalohu"], coachRe: ADVANCE_TALK_RE, now: new Date("2026-10-31T10:59:21Z") })).toBe(false);
  });
});
