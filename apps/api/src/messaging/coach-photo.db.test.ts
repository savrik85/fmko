/**
 * Fotka od trenéra v Telefonu na skutečné D1, KV a R2 (Miniflare, všechny migrace) přes
 * skutečné routy: popis a kontrola modelem při nahrání, odklad, odeslání s MMS cenou,
 * popis v promptu odpovědi hráče, nevhodná fotka neodejde, odmítnutí a vrácení kreditu.
 * Vision model (env.AI) a textový model jsou podvržené.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  isAiEnabled: vi.fn(async () => true),
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({ body: "To je pěkný, trenére!", conversation_complete: true })),
}));
// Hráč „píše“ odpověď podle délky textu, v testu bez čekání.
vi.mock("./chat-kontext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-kontext")>()),
  zpozdeniOdpovedi: () => 0,
}));
// Hráč občas nechá trenéra „na přečteno“ (náhoda). V testu odpoví vždy.
vi.mock("./left-on-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./left-on-read")>()),
  leftOnReadChance: () => 0,
}));

import { Hono } from "hono";
import { generateText } from "../lib/ai-provider";
import { messagingRouter } from "../routes/messaging";
import { createSession } from "../auth/session";
import {
  COACH_PHOTO_PRICE, COACH_PHOTO_UNREADABLE_ALT, COACH_PHOTO_VISION_MODEL, COACH_PHOTOS_PER_DAY,
  isPendingCoachPhotoKey, parseVisionReply,
} from "./coach-photo";
import { refundCoachSms } from "./phone-credit";
import type { Bindings } from "../index";

const TEAM = "team-photo";
const OTHER_TEAM = "team-other";
const PLAYER = "player-photo";
const CONV = "conv-photo";
const SQUAD_CONV = "conv-squad";
const GAME_DATE = "2026-11-20";
const ALT = "Na fotce je nová sekačka na trávu na kraji hřiště.";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", messagingRouter);

let mf: Miniflare;
let db: D1Database;
let bucket: R2Bucket;
let env: Bindings;
let token: string;
let visionReply: unknown;
const visionCalls: Array<{ model: string; input: unknown }> = [];

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
    r2Buckets: ["SEED_DATA"],
  });
  db = await mf.getD1Database("DB");
  bucket = await mf.getR2Bucket("SEED_DATA") as unknown as R2Bucket;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  const ai = {
    run: async (model: string, input: unknown) => {
      visionCalls.push({ model, input });
      return { response: visionReply };
    },
  };
  env = {
    DB: db,
    SESSION_KV: await mf.getKVNamespace("SESSION_KV"),
    CACHE_KV: await mf.getKVNamespace("CACHE_KV"),
    SEED_DATA: bucket,
    AI: ai,
  } as unknown as Bindings;

  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-photo', 'photo@example.test', 'x')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'user-photo', 'p06', 'SK Fotka', 50000, ?)").bind(TEAM, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, 'ai', 'p07', 'TJ Jinde', 50000, ?)").bind(OTHER_TEAM, GAME_DATE),
    db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Franta', 'Novák', 27, 'MID', 40, '{}', '{}', '{}', '{}', '{}', 'active')`,
    ).bind(PLAYER, TEAM),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id) VALUES (?, ?, 'player', 'Franta Novák', ?)").bind(CONV, TEAM, PLAYER),
    db.prepare("INSERT INTO conversations (id, team_id, type, title) VALUES (?, ?, 'squad_group', 'Kabina')").bind(SQUAD_CONV, TEAM),
  ]);
  token = await createSession(env.SESSION_KV, "user-photo", "photo@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  visionReply = { description: ALT, inappropriate: false };
  visionCalls.length = 0;
  vi.mocked(generateText).mockClear();
  await db.prepare("UPDATE teams SET phone_credit = 36, phone_credit_date = ? WHERE id = ?").bind(GAME_DATE, TEAM).run();
  await db.prepare("UPDATE conversations SET ai_thread_active = 0, ai_thread_state = NULL WHERE id = ?").bind(CONV).run();
  await db.prepare("DELETE FROM messages").run();
  for (const key of (await env.CACHE_KV.list({ prefix: "coach_photos:" })).keys) await env.CACHE_KV.delete(key.name);
});

/** Hlavička JPEGu a výplň, stačí na kontrolu formátu. */
function fakeJpeg(bytes = 4000): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set([0xff, 0xd8, 0xff, 0xe0]);
  return out;
}

/**
 * Požadavek přes routu. Úkoly na pozadí (waitUntil) se dokončí před návratem, s `beforeBackground`
 * se dá podívat na stav ještě před nimi.
 */
async function call(path: string, init: RequestInit, beforeBackground?: () => Promise<void>) {
  const background: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { background.push(p); }, passThroughOnException: () => undefined, props: {} };
  const res = await app.request(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  }, env, ctx as unknown as ExecutionContext);
  const body = await res.json() as Record<string, unknown>;
  if (beforeBackground) await beforeBackground();
  // Odpověď hráče se spouští z jiného úkolu na pozadí, proto se čeká, dokud nějaké přibývají.
  for (let done = 0; done < background.length;) {
    const batch = background.slice(done);
    done = background.length;
    await Promise.allSettled(batch);
  }
  return { status: res.status, body };
}

function uploadPhoto(photo: Uint8Array = fakeJpeg(), conv = CONV, contentType = "image/jpeg") {
  return call(`/api/teams/${TEAM}/conversations/${conv}/photo`, {
    method: "POST",
    headers: { "Content-Type": contentType, "Content-Length": String(photo.length) },
    body: photo as unknown as BodyInit,
  });
}

/** Odešle fotku. Vrací i náhled konverzace hned po odeslání, než ho přepíše odpověď hráče. */
async function sendPhoto(photoKey: unknown, text = "", conv = CONV) {
  let preview: string | undefined;
  const res = await call(`/api/teams/${TEAM}/conversations/${conv}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: text, photo: { photoKey } }),
  }, async () => {
    const row = await db.prepare("SELECT last_message_text FROM conversations WHERE id = ?").bind(conv).first<{ last_message_text: string }>();
    preview = row?.last_message_text;
  });
  return { ...res, preview };
}

async function credit(): Promise<number> {
  const row = await db.prepare("SELECT phone_credit FROM teams WHERE id = ?").bind(TEAM).first<{ phone_credit: number }>();
  return row?.phone_credit ?? -1;
}

async function lastCoachMessage() {
  const row = await db.prepare(
    "SELECT body, metadata FROM messages WHERE conversation_id = ? AND sender_type = 'user' ORDER BY sent_at DESC LIMIT 1",
  ).bind(CONV).first<{ body: string; metadata: string }>();
  return { body: row?.body, meta: JSON.parse(row?.metadata ?? "{}") as Record<string, unknown> };
}

const lastPrompt = () => String(vi.mocked(generateText).mock.calls.at(-1)?.[1] ?? "");

describe("odpověď vision modelu", () => {
  it("bere objekt i JSON v bloku kódu, bez popisu nic", () => {
    expect(parseVisionReply({ description: " Gól  na hřišti. ", inappropriate: false }))
      .toEqual({ alt: "Gól na hřišti.", inappropriate: false });
    expect(parseVisionReply("```json\n{\"description\": \"Nahý muž\", \"inappropriate\": true}\n```"))
      .toEqual({ alt: "Nahý muž", inappropriate: true });
    expect(parseVisionReply({ description: "" })).toBeNull();
    expect(parseVisionReply("nevím")).toBeNull();
    expect(parseVisionReply(null)).toBeNull();
    expect(parseVisionReply({ description: "a".repeat(400) })?.alt.length).toBe(280);
  });
});

describe("fotka od trenéra hráči", () => {
  it("projde celou cestou: popis při nahrání, odklad, MMS za 5 Kč a hráč na fotku reaguje", async () => {
    const upload = await uploadPhoto();
    expect(upload.status).toBe(200);
    const pendingKey = upload.body.photoKey as string;
    expect(isPendingCoachPhotoKey(TEAM, pendingKey)).toBe(true);
    expect(await bucket.head(pendingKey)).not.toBeNull();
    // Model fotku popsal už při nahrání: na pozadí po odeslání by se s odpovědí hráče nevešel do 30 s.
    expect(visionCalls).toHaveLength(1);

    const sent = await sendPhoto(pendingKey);
    expect(sent.status).toBe(200);
    const finalKey = sent.body.photoKey as string;
    expect(finalKey).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
    expect(await bucket.head(finalKey)).not.toBeNull();
    expect(await bucket.head(pendingKey)).toBeNull();
    expect(await credit()).toBe(36 - COACH_PHOTO_PRICE);

    // Popis doběhl a je u zprávy, odkud ho bere historie konverzace.
    const msg = await lastCoachMessage();
    expect(msg.body).toBe("");
    expect(msg.meta).toMatchObject({ type: "photo", photoKey: finalKey, photoAlt: ALT, creditPrice: COACH_PHOTO_PRICE });
    expect(sent.preview).toBe("📷 Fotka");

    // Model dostal obrázek, hráč odpověděl a v promptu měl popis fotky.
    expect(visionCalls).toHaveLength(1);
    expect(visionCalls[0].model).toBe(COACH_PHOTO_VISION_MODEL);
    expect(JSON.stringify(visionCalls[0].input)).toContain("data:image/jpeg;base64,/9j/");
    expect(lastPrompt()).toContain(`[Fotka: ${ALT}]`);
    const reply = await db.prepare("SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player'").bind(CONV).first<{ body: string }>();
    expect(reply?.body).toBe("To je pěkný, trenére!");
  }, 60_000);

  it("popisek k fotce jde do zprávy i do náhledu konverzace", async () => {
    const upload = await uploadPhoto();
    const sent = await sendPhoto(upload.body.photoKey, "Koukej, co jsme koupili");
    expect(sent.status).toBe(200);
    expect((await lastCoachMessage()).body).toBe("Koukej, co jsme koupili");
    expect(sent.preview).toBe("📷 Koukej, co jsme koupili");
    expect(lastPrompt()).toContain(`[Fotka: ${ALT}] Koukej, co jsme koupili`);
  }, 60_000);

  it("nevhodná fotka neodejde, neuloží se a kredit zůstane", async () => {
    visionReply = "```json\n{\"description\": \"Nahá žena na pláži\", \"inappropriate\": true}\n```";
    const pending = async () => (await bucket.list({ prefix: `photos/coach-pending/${TEAM}/` })).objects.length;
    const before = await pending();
    const upload = await uploadPhoto();
    expect(upload.status).toBe(422);
    expect(upload.body.error).toBe("Tuhle fotku hráči poslat nejde, vyber jinou.");
    expect(await pending()).toBe(before);
    expect(await credit()).toBe(36);
    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
  }, 60_000);

  it("když model fotku nepřečte, zpráva odejde a hráč dostane náhradní popis", async () => {
    visionReply = "Omlouvám se, nevím.";
    const upload = await uploadPhoto();
    expect((await sendPhoto(upload.body.photoKey)).status).toBe(200);
    expect((await lastCoachMessage()).meta.photoAlt).toBe(COACH_PHOTO_UNREADABLE_ALT);
    expect(lastPrompt()).toContain(COACH_PHOTO_UNREADABLE_ALT);
  }, 60_000);

  it("odmítne jiný formát, poškozený soubor, kabinu, cizí fotku a došlý kredit", async () => {
    expect((await uploadPhoto(fakeJpeg(), CONV, "image/png")).status).toBe(415);
    const notJpeg = new Uint8Array(4000).fill(7);
    expect((await uploadPhoto(notJpeg)).status).toBe(400);
    expect((await uploadPhoto(fakeJpeg(), SQUAD_CONV)).status).toBe(400);

    // Fotka nahraná jiným týmem (klíč z cizího odkladu) se připojit nedá.
    const foreignKey = `photos/coach-pending/${OTHER_TEAM}/${crypto.randomUUID()}.jpg`;
    await bucket.put(foreignKey, fakeJpeg());
    const foreign = await sendPhoto(foreignKey);
    expect(foreign.status).toBe(400);
    expect(await credit()).toBe(36);

    // Na SMS (3 Kč) by kredit stačil, na fotku (5 Kč) ne.
    await db.prepare("UPDATE teams SET phone_credit = 4 WHERE id = ?").bind(TEAM).run();
    const poor = await uploadPhoto();
    expect(poor.status).toBe(400);
    expect(poor.body.error).toBe(`Na MMS ti nezbývá kredit, máš 4 Kč a fotka stojí ${COACH_PHOTO_PRICE} Kč. Dobije se zítra ráno.`);
    expect(visionCalls).toHaveLength(0);
  }, 60_000);

  it(`denně projde ${COACH_PHOTOS_PER_DAY} fotek, další ne`, async () => {
    for (let i = 0; i < COACH_PHOTOS_PER_DAY; i++) expect((await uploadPhoto()).status).toBe(200);
    const over = await uploadPhoto();
    expect(over.status).toBe(429);
    expect(over.body.error).toBe("Dnes už jsi poslal fotek dost, zkus to zítra.");
  }, 60_000);

  it("vrácení kreditu za zprávu s fotkou vrátí celých 5 Kč, za SMS dál 3 Kč", async () => {
    const upload = await uploadPhoto();
    await sendPhoto(upload.body.photoKey);
    // Odpověď hráče mezitím přišla, na kredit nemá vliv.
    const before = await credit();
    expect(await refundCoachSms(db, TEAM, CONV, "test")).toBe(true);
    expect(await credit()).toBe(before + COACH_PHOTO_PRICE);
    expect(await refundCoachSms(db, TEAM, CONV, "test")).toBe(false);

    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES ('sms-1', ?, 'user', ?, 'SK Fotka', 'Zdar', strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 second'), 1)",
    ).bind(CONV, TEAM).run();
    await db.prepare("UPDATE teams SET phone_credit = 20 WHERE id = ?").bind(TEAM).run();
    expect(await refundCoachSms(db, TEAM, CONV, "test")).toBe(true);
    expect(await credit()).toBe(23);
  }, 60_000);
});
