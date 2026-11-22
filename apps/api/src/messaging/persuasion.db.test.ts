/**
 * Přemlouvání omluveného hráče přes skutečnou routu zprávy trenéra (D1 se všemi migracemi):
 * jestli kývne, rozhodne hra, model dostane pevný pokyn a slib „přijdu“ se zapíše přímo.
 *
 * Přetest 3 (22. 11.): u lehkých důvodů prošlo jen 1 z 10 pokusů. Veselý s kocovinou 0/3 („Bez tebe
 * nemáme útok, fakt tě potřebuju…“ → „To není možný. 🤕“), Filip s leností 0/2.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(),
}));
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));
// Kdykoli smí, nechá hráč trenéra na přečteno: na přemlouvání s rozhodnutím hry ale odpoví.
vi.mock("./left-on-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./left-on-read")>()),
  leftOnReadChance: () => 1,
  readDelayMs: () => 0,
}));

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import { PERSUADED_ATTEND_REPLIES, PERSUADED_SKIP_REPLIES, applyPersuasion, persuasionChance, persuasionRoll, replyStance } from "./persuasion";
import { absenceEase } from "./attendance-pledge";
import type { Bindings } from "../index";

const TEAM = "team-persuade";
const RIVAL = "team-rival";
const CAL = "cal-hradcany";
const KABINA = "kabina-zapas";
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
/** Ukázněný kluk s dobrým vztahem: výmluva bez důvodu se rozmluvit dá (ease 3). */
const PERSONALITY = { discipline: 70, temper: 30 };
const RELATION = 65;
const VESELY_1 = "Honzo, četl jsem to v kabině. Těžká hlava do zítřejšího večera přejde, zápas je až v šest. Bez tebe nemáme útok, fakt tě potřebuju. Dneska hodně vody a zítra přijď, jo?";
const VESELY_2 = "Chápu. Tak jinak: zítra v pět tě vyzvednu autem, začneš na lavičce a rozchodíš se. Do večera budeš v pohodě. Kluci na tebe čekaj. Tak co, přijdeš nakonec?";

/** Hráč, kterého hra přemluví na první pokus (`yes`), nebo ne (`no`). Stejný los jako persuasion.ts. */
function playerFor(outcome: "yes" | "no", prefix: string): string {
  const ease = absenceEase({ reason: "", text: "" }, { discipline: PERSONALITY.discipline, coachRelationship: RELATION })!;
  const chance = persuasionChance({ ease, attempt: 1, offer: false });
  for (let i = 0; i < 200; i++) {
    const id = `${prefix}-${i}`;
    if ((persuasionRoll(id, `match:${CAL}`, 1) < chance) === (outcome === "yes")) return id;
  }
  throw new Error("žádný hráč");
}
const VESELY = playerFor("yes", "p-vesely");
const FILIP = playerFor("no", "p-filip");
const PRIBYL = "p-pribyl";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;
let background: Promise<unknown>[] = [];

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-persuade', 'persuade@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s4', 4, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name) VALUES ('L1', 's4', 'Prachatice', 'Okresní přebor')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date, league_id) VALUES (?, 'user-persuade', 'p06', 'AC Jitona Spůle', 50000, ?, 'L1')")
      .bind(TEAM, `${TODAY}T16:00:00.000Z`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date, league_id) VALUES (?, 'ai', 'p06', 'FK Löffler Hradčany', 0, ?, 'L1')")
      .bind(RIVAL, `${TODAY}T16:00:00.000Z`),
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, 'L1', 4, 12, 'monday', ?, 'scheduled')")
      .bind(CAL, `${TOMORROW}T17:00:00.000Z`),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES ('m-1', 'L1', ?, ?, ?, 'scheduled')").bind(CAL, RIVAL, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title) VALUES (?, ?, 'squad_group', '⚽ vs FK Löffler Hradčany')").bind(KABINA, TEAM),
    ...[[VESELY, "Jan", "Veselý", "včera jsem to v hospodě přehnal, zítra nedám. Hlava jak střep."],
      [FILIP, "Filip", "Pospíšil", "Zítra to pustím, nechce se mi tam trmácet."],
      [PRIBYL, "Aleš", "Přibyl", "zítra je pohřeb dědy, nemůžu"]].flatMap(([id, first, last, excuse]) => [
      db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, coach_relationship)
         VALUES (?, ?, ?, ?, 27, 'FWD', 40, '{}', '{}', ?, '{}', '{}', 'active', ?)`,
      ).bind(id, TEAM, first, last, JSON.stringify(PERSONALITY), RELATION),
      db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', ?, ?)").bind(`conv-${id}`, TEAM, `${first} ${last}`, id),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'player', ?, ?, ?, ?, ?)`,
      ).bind(`exc-${id}`, KABINA, id, `${first} ${last}`, excuse,
        JSON.stringify({ type: "attendance", response: "no", calendarId: CAL }), new Date(Date.now() - 3600_000).toISOString()),
    ]),
  ]);
  token = await createSession(env.SESSION_KV, "user-persuade", "persuade@example.test", null);
}, 120_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  background = [];
  vi.mocked(generateText).mockReset();
  vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
    if (String(prompt).includes("KONKRÉTNÍ slib")) return JSON.stringify({ kind: "none", quote: "" });
    // Model se drží omluvenky a příznak docházky nevrací: o výsledku rozhoduje hra.
    return JSON.stringify({ body: "Tak jo, trenére.", conversation_complete: false });
  });
  await db.batch([
    db.prepare("DELETE FROM messages WHERE id NOT LIKE 'exc-%'"),
    db.prepare("DELETE FROM player_follow_ups"),
    db.prepare("DELETE FROM coach_commitments"),
    db.prepare("UPDATE players SET life_context = '{}'"),
    db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL"),
    db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(TODAY, TEAM),
  ]);
});

async function send(playerId: string, text: string) {
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/conv-${playerId}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
  }, env, ctx as unknown as ExecutionContext);
  expect(res.status).toBe(200);
  await Promise.allSettled(background);
  background = [];
}

const conv = async (playerId: string) => (await db.prepare(
  "SELECT sender_type, body FROM messages WHERE conversation_id = ? ORDER BY julianday(sent_at), rowid",
).bind(`conv-${playerId}`).all<{ sender_type: string; body: string }>()).results;
const life = async (playerId: string) => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string }>())!.life_context);
const replyPrompts = () => vi.mocked(generateText).mock.calls.map((c) => String(c[1])).filter((p) => !p.includes("KONKRÉTNÍ slib"));

describe("přemlouvání omluveného hráče rozhoduje hra", () => {
  it("Veselý: hra rozhodla „přijde“, model to dostane natvrdo a slib přepíše omluvenku", async () => {
    await send(VESELY, VESELY_1);
    expect(replyPrompts().at(-1)).toContain("Rozhodl ses: PŘIJDEŠ, řekni to jasně");
    const lines = await conv(VESELY);
    expect(lines.map((m) => m.sender_type)).toEqual(["user", "player", "system"]);
    expect(lines[2].body).toMatch(/^📝 Jan slíbil, že přijde na zápas/);
    expect((await life(VESELY)).matchPledge).toMatchObject({ intent: "attend", matchKey: CAL });
    // V kabině zápasu je jeho „přijdu“ a omluvenka neplatí.
    const kabina = await db.prepare(
      "SELECT json_extract(metadata, '$.response') AS r FROM messages WHERE conversation_id = ? AND sender_id = ? ORDER BY julianday(sent_at) DESC LIMIT 1",
    ).bind(KABINA, VESELY).first<{ r: string }>();
    expect(kabina?.r).toBe("yes");
  }, 60_000);

  it("Filip: hra rozhodla „nepřijde“, model se vymluví; další pokus má větší šanci a počítá se", async () => {
    await send(FILIP, "Filipe, zítra tě v Hradčanech potřebuju. Přijď, jo?");
    expect(replyPrompts().at(-1)).toContain("rozhodl ses: NEPŘIJDEŠ, vymluv se po svém");
    expect((await conv(FILIP)).filter((m) => m.sender_type === "player")).toHaveLength(1);
    expect((await life(FILIP)).persuasion).toMatchObject({ key: `match:${CAL}`, attempts: 1, decided: "skip" });
    expect((await life(FILIP)).matchPledge).toBeUndefined();
    await send(FILIP, VESELY_2);
    const second = (await life(FILIP)).persuasion;
    expect(second.attempts).toBe(2);
    const ease = absenceEase({ reason: "", text: "" }, { discipline: PERSONALITY.discipline, coachRelationship: RELATION })!;
    expect(persuasionChance({ ease, attempt: 2, offer: true })).toBeGreaterThan(persuasionChance({ ease, attempt: 1, offer: false }));
    const expected = persuasionRoll(FILIP, `match:${CAL}`, 2) < persuasionChance({ ease, attempt: 2, offer: true }) ? "attend" : "skip";
    expect(second.decided).toBe(expected);
  }, 60_000);

  it("Přibyl: pohřeb se nepřemlouvá, rozhodnutí ani slib nevznikne", async () => {
    await send(PRIBYL, "Aleši, upřímnou soustrast. Zápas je až v šest, nešlo by to po pohřbu ještě stihnout? Moc tě potřebuju.");
    expect((await life(PRIBYL)).persuasion).toBeUndefined();
    expect((await life(PRIBYL)).matchPledge).toBeUndefined();
  }, 60_000);
});

// Přibyl (E2E 22. 11., final3 Chyba 4): hra rozhodla „přijde“, model napsal „Nezvládnu ani poločas,
// díky za nabídku 😔“, a přesto 📝 a v kabině „Beru zpátky, budu tam.“
describe("odpověď na přemlouvání odpovídá rozhodnutí hry", () => {
  const PRIBYL_TEXT = "Nezvládnu ani poločas, díky za nabídku 😔";
  const modelSays = (...bodies: string[]) => {
    let i = 0;
    vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
      if (String(prompt).includes("KONKRÉTNÍ slib")) return JSON.stringify({ kind: "none", quote: "" });
      const body = bodies[Math.min(i, bodies.length - 1)];
      i++;
      return JSON.stringify({ body, conversation_complete: false });
    });
  };
  const kabinaLine = async (playerId: string) => (await db.prepare(
    "SELECT body, json_extract(metadata, '$.response') AS r FROM messages WHERE conversation_id = ? AND sender_id = ? AND id NOT LIKE 'exc-%' ORDER BY julianday(sent_at) DESC LIMIT 1",
  ).bind(KABINA, playerId).first<{ body: string; r: string }>());

  it("„přijde“, ale model 2× napíše „Nezvládnu ani poločas“: jde předem napsané „přijdu“, slib i kabina sedí", async () => {
    modelSays(PRIBYL_TEXT);
    await send(VESELY, VESELY_1);
    expect(replyPrompts().some((p) => p.includes("POZOR, oprava: rozhodl ses, že PŘIJDEŠ"))).toBe(true);
    const lines = await conv(VESELY);
    const reply = lines.find((m) => m.sender_type === "player")!.body;
    expect(reply).not.toBe(PRIBYL_TEXT);
    expect(PERSUADED_ATTEND_REPLIES).toContain(reply);
    expect(replyStance(reply)).toBe("attend");
    expect(lines.at(-1)?.body).toMatch(/^📝 Jan slíbil, že přijde na zápas/);
    expect((await kabinaLine(VESELY))?.r).toBe("yes");
  }, 60_000);

  it("„přijde“: když druhý pokus sedí, odejde ten", async () => {
    modelSays(PRIBYL_TEXT, "Tak jo, přijedu v pět, děkuju! 😊");
    await send(VESELY, VESELY_1);
    expect((await conv(VESELY)).find((m) => m.sender_type === "player")?.body).toBe("Tak jo, přijedu v pět, děkuju! 😊");
    expect((await life(VESELY)).matchPledge).toMatchObject({ intent: "attend", matchKey: CAL });
  }, 60_000);

  it("„nepřijde“, ale model napíše „Jasně, přijdu“: odejde odmítnutí a slib nevznikne", async () => {
    modelSays("Jasně, přijdu, trenére! Budu tam.");
    await send(FILIP, "Filipe, zítra tě v Hradčanech potřebuju. Přijď, jo?");
    const reply = (await conv(FILIP)).find((m) => m.sender_type === "player")!.body;
    expect(PERSUADED_SKIP_REPLIES).toContain(reply);
    expect(replyStance(reply)).not.toBe("attend");
    expect((await life(FILIP)).matchPledge).toBeUndefined();
  }, 60_000);

  it("slib proti textu odpovědi se nezapíše nikdy", async () => {
    const persuasion = { key: `match:${CAL}`, event: "match" as const, attempts: 1, decided: "attend" as const, at: new Date().toISOString(), convId: `conv-${VESELY}` };
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.persuasion', json(?)) WHERE id = ?").bind(JSON.stringify(persuasion), VESELY).run();
    expect(await applyPersuasion(db, {
      clubTeamId: TEAM, convId: `conv-${VESELY}`, player: { id: VESELY, firstName: "Jan", persuasion }, at: new Date().toISOString(), replyBody: PRIBYL_TEXT,
    })).toBe(false);
    expect((await life(VESELY)).matchPledge).toBeUndefined();
    expect((await life(VESELY)).persuasion.applied).toBe(true);
    expect(await kabinaLine(VESELY)).toBeNull();
  }, 60_000);
});
