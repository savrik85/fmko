/**
 * Na zprávu o průšvihu, ve kterém je hráč zapletený, hráč odpoví vždy, i když by jinak nechal
 * trenéra „na přečteno“ (left-on-read.ts). Skutečná routa zprávy trenéra nad D1 se všemi migracemi.
 *
 * E2E 22. 11.: Hrdlička (odhalený pachatel, srážka) nechal „Tak co, ukradl jsi ty dresy, nebo ne?“
 * 4× z 8 na přečteno a vlákno se zavřelo se vztahem −10 a morálkou −8. Procházka na „Dáš to klukům
 * zpátky, nebo nic?“ vrátil 31 696 Kč a v chatu neřekl ani slovo.
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
// Kdykoli smí, nechá hráč trenéra na přečteno. Odpověď tak přijde jen tam, kde musí.
vi.mock("./left-on-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./left-on-read")>()),
  leftOnReadChance: () => 1,
  readDelayMs: () => 0,
}));

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { Bindings } from "../index";

const TEAM = "team-must";
const GAME_DATE = "2026-11-22T16:00:00.000Z";
const THIEF = "p-hrdlicka";
const CASH = "p-prochazka";
const OTHER = "p-novak";
const SKLAD = "inc-sklad";
const DRESY = JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 1 }]);
/** Hodný a poslušný kluk: šance, že lup vrátí, je na stropu 90 %. */
const OBEDIENT = JSON.stringify({ discipline: 100, temper: 0, workRate: 100 });

/** Incident kasy, u kterého los Procházky vyjde na vrácení (stejný los jako restitution.ts). */
function cashIncidentId(): string {
  for (let i = 0; i < 200; i++) {
    const id = `inc-kasa-${i}`;
    if (createRng(seedFromString(`restitution|${id}|${CASH}`)).random() * 100 < 90) return id;
  }
  throw new Error("žádný incident s vrácením");
}
const KASA = cashIncidentId();

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;
let background: Promise<unknown>[] = [];

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-must', 'must@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s4', 4, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-must', 'p06', 'Agrokat', 50000, ?)").bind(TEAM, GAME_DATE),
    ...[[THIEF, "Petr", "Hrdlička"], [CASH, "Tomáš", "Procházka"], [OTHER, "Jan", "Novák"]].map(([id, first, last]) => db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status, coach_relationship, weekly_wage)
       VALUES (?, ?, ?, ?, 27, 'MID', 40, '{}', '{}', ?, '{}', '{}', 'active', 100, 400)`,
    ).bind(id, TEAM, first, last, OBEDIENT)),
    ...[THIEF, CASH, OTHER].map((id) => db.prepare(
      "INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', ?, ?)",
    ).bind(`conv-${id}`, TEAM, id, id)),
    // Hrdlička: vloupání do skladu před 17 dny, odhalený, trenér mu strhává ze mzdy.
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, severity, game_date, culprit_type, culprit_player_id,
         culprit_revealed, loss, resolution, resolved_on, text)
       VALUES (?, ?, 4, 'vloupani_sklad', 'kradez', 'uzavreny', 2, '2026-11-05T16:00:00.000Z', 'hrac', ?, 1, ?, 'srazka', '2026-11-06T16:00:00.000Z', 'Vloupání do skladu.')`,
    ).bind(SKLAD, TEAM, THIEF, DRESY),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, until, season_number)
       VALUES (?, ?, ?, 'pachatel', 'Vloupal ses do skladu a vzal dresy.', '2027-01-05', 4)`,
    ).bind(SKLAD, THIEF, TEAM),
    // Procházka: vybraná kasa, usvědčený, incident otevřený.
    db.prepare(
      `INSERT INTO club_incidents (id, team_id, season_number, kind, category, status, severity, game_date, culprit_type, culprit_player_id,
         culprit_revealed, loss, text)
       VALUES (?, ?, 4, 'kasa_obcerstveni', 'kradez', 'otevreny', 2, '2026-11-20T16:00:00.000Z', 'hrac', ?, 1, ?, 'Vybraná kasa.')`,
    ).bind(KASA, TEAM, CASH, JSON.stringify([{ typ: "penize", castka: 31696 }])),
    db.prepare(
      `INSERT INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, until, season_number)
       VALUES (?, ?, ?, 'pachatel', 'Vybral jsi kasu u stánku.', '2027-01-20', 4)`,
    ).bind(KASA, CASH, TEAM),
  ]);
  token = await createSession(env.SESSION_KV, "user-must", "must@example.test", null);
}, 120_000);

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  background = [];
  vi.mocked(generateText).mockReset();
  vi.mocked(generateText).mockImplementation(async (_ctx, prompt) => {
    if (String(prompt).includes("KONKRÉTNÍ slib")) return JSON.stringify({ kind: "none", quote: "" });
    return JSON.stringify({ body: "Jo, trenére, přiznávám to.", conversation_complete: false });
  });
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE.slice(0, 10), TEAM).run();
});

async function send(playerId: string, text: string) {
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(`/api/teams/${TEAM}/conversations/conv-${playerId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: text }),
  }, env, ctx as unknown as ExecutionContext);
  expect(res.status).toBe(200);
  await Promise.allSettled(background);
}

const replies = async (playerId: string) => (await db.prepare(
  "SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at",
).bind(`conv-${playerId}`).all<{ body: string }>()).results.map((r) => r.body);

describe("na průšvih, ve kterém je zapletený, hráč odpoví vždy", () => {
  it("kontrola: na běžnou zprávu nechá trenéra na přečteno", async () => {
    await send(OTHER, "Jak se máš?");
    expect(await replies(OTHER)).toEqual([]);
  }, 60_000);

  it("Procházka: zpráva, po které vrátil lup, dostane odpověď", async () => {
    await send(CASH, "Ptám se znovu. Dáš to klukům zpátky, nebo nic?");
    expect((await db.prepare("SELECT status, resolution FROM club_incidents WHERE id = ?").bind(KASA).first()))
      .toEqual({ status: "uzavreny", resolution: "vratil" });
    expect(await replies(CASH)).toEqual(["Jo, trenére, přiznávám to."]);
  }, 60_000);
});
