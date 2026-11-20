/**
 * Hymna a hlídač provozu, když u Suna dochází kredit (skutečná D1 přes Miniflare,
 * všechny migrace, skutečná routa POST /api/teams/:id/club/anthem/generate).
 *
 * Suno je podvržené: odpovídá zůstatkem kreditu a na zadání buď taskId, nebo
 * odmítnutím s HTTP 200 a `code` v těle, jak to dělá doopravdy.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { teamsRouter } from "../routes/teams";
import { createSession } from "../auth/session";
import { runWatchdog } from "./watchdog";
import { anthemRejectedMessage, readSunoTaskReply, SUNO_CREDIT_ALARM } from "./suno";
import type { Bindings } from "../index";

const TEAM_ID = "team-anthem";
const USER_ID = "user-anthem";
const SUNO = "https://api.sunoapi.org/";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/teams", teamsRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;

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
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  env = {
    DB: db,
    SESSION_KV: await mf.getKVNamespace("SESSION_KV"),
    CACHE_KV: await mf.getKVNamespace("CACHE_KV"),
    SUNO_API_KEY: "suno-test-key",
    API_BASE_URL: "https://api.example.test",
  } as unknown as Bindings;
  await db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(USER_ID, "anthem@example.test").run();
  await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, game_date) VALUES (?, ?, 'p06', 'SK Hymna', 50000, '2026-11-20')")
    .bind(TEAM_ID, USER_ID).run();
  token = await createSession(env.SESSION_KV, USER_ID, "anthem@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface FakeSuno {
  credit: number | "error";
  generate?: unknown;
}

/** Podvrhne Suno. Ostatní požadavky (Miniflare) jdou dál beze změny. Vrací volané adresy Suna. */
function fakeSuno(fake: FakeSuno): string[] {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(SUNO)) return realFetch(input, init);
    calls.push(url);
    if (url.includes("/generate/credit")) {
      return fake.credit === "error"
        ? new Response("chyba", { status: 500 })
        : Response.json({ code: 200, msg: "success", data: fake.credit });
    }
    return Response.json(fake.generate);
  });
  return calls;
}

/** Zachytí logy, ať se dá ověřit, že odmítnutí není tiché. */
function captureLogs(): string[] {
  const lines: string[] = [];
  const keep = (msg: unknown) => { lines.push(String(msg)); };
  vi.spyOn(console, "warn").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  return lines;
}

async function generateAnthem() {
  const res = await app.request(`/api/teams/${TEAM_ID}/club/anthem/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Hymna", lyrics: "[Sloka 1]\nJedeme dál", style: "Stadium rock" }),
  }, env);
  return { status: res.status, body: await res.json() as { error?: string; taskId?: string; attemptsUsed?: number } };
}

async function attemptsAndRows(): Promise<{ attempts: number; rows: number }> {
  const team = await db.prepare("SELECT COALESCE(anthem_attempts_used, 0) AS n FROM teams WHERE id = ?").bind(TEAM_ID).first<{ n: number }>();
  const rows = await db.prepare("SELECT COUNT(*) AS n FROM team_anthems WHERE team_id = ?").bind(TEAM_ID).first<{ n: number }>();
  return { attempts: team?.n ?? -1, rows: rows?.n ?? -1 };
}

describe("čtení odpovědi Suna", () => {
  it("odmítnutí s HTTP 200 dá kód a důvod, přijetí taskId", () => {
    expect(readSunoTaskReply({ code: 429, msg: "credits insufficient", data: null }))
      .toEqual({ taskId: null, code: 429, msg: "credits insufficient" });
    expect(readSunoTaskReply({ code: 200, msg: "success", data: { taskId: "t-1" } }))
      .toEqual({ taskId: "t-1", code: 200, msg: "success" });
    expect(readSunoTaskReply(null)).toEqual({ taskId: null, code: null, msg: null });
    expect(readSunoTaskReply({ data: { taskId: "" } }).taskId).toBeNull();
  });

  it("hláška pro manažera říká, že se pokus nepočítá, a nikde nemluví o Sunu", () => {
    for (const code of [null, 400, 413, 429, 430, 455, 500]) {
      const msg = anthemRejectedMessage(code);
      expect(msg).toMatch(/pokus se ti nepočítá/i);
      expect(msg).not.toMatch(/suno|task|—/i);
    }
    expect(anthemRejectedMessage(413)).toContain("Zkrať");
  });
});

describe("generace hymny, když dochází kredit", () => {
  it("málo kreditu: Suno se vůbec nevolá, pokus zůstane a chyba je v logu", async () => {
    const calls = fakeSuno({ credit: 10 });
    const logs = captureLogs();
    const res = await generateAnthem();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(anthemRejectedMessage(null));
    expect(calls.filter((u) => !u.includes("/credit"))).toEqual([]);
    expect(await attemptsAndRows()).toEqual({ attempts: 0, rows: 0 });
    expect(logs.some((l) => l.includes("zbývá 10 kreditů"))).toBe(true);
  });

  it("Suno zadání odmítne s HTTP 200: srozumitelná hláška, kód v logu, pokus zůstane", async () => {
    fakeSuno({ credit: 500, generate: { code: 429, msg: "The current credits are insufficient", data: null } });
    const logs = captureLogs();
    const res = await generateAnthem();
    expect(res.status).toBe(502);
    expect(res.body.error).toBe(anthemRejectedMessage(429));
    expect(await attemptsAndRows()).toEqual({ attempts: 0, rows: 0 });
    expect(logs.some((l) => l.includes("code 429") && l.includes("credits are insufficient"))).toBe(true);
  });

  it("příliš dlouhý text (413) poradí zkrátit", async () => {
    fakeSuno({ credit: 500, generate: { code: 413, msg: "prompt too long", data: null } });
    captureLogs();
    const res = await generateAnthem();
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("Zkrať");
  });

  it("zůstatek se nedá přečíst: zadání se zkusí a přijatá hymna spotřebuje pokus", async () => {
    const calls = fakeSuno({ credit: "error", generate: { code: 200, msg: "success", data: { taskId: "task-ok" } } });
    captureLogs();
    const res = await generateAnthem();
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe("task-ok");
    expect(res.body.attemptsUsed).toBe(1);
    expect(calls.some((u) => u.endsWith("/api/v1/generate"))).toBe(true);
    expect(await attemptsAndRows()).toEqual({ attempts: 1, rows: 1 });
  });
});

describe("hlídač provozu a kredit u Suna", () => {
  it(`pod ${SUNO_CREDIT_ALARM} kredity hlásí, od ${SUNO_CREDIT_ALARM} ne, bez klíče se neptá`, async () => {
    captureLogs();
    fakeSuno({ credit: SUNO_CREDIT_ALARM - 1 });
    const low = await runWatchdog(env);
    const problem = low.problemy.find((p) => p.kod === "suno_kredit");
    expect(problem?.hodnota).toBe(`${SUNO_CREDIT_ALARM - 1} kreditů, jedna generace stojí 12`);
    vi.restoreAllMocks();

    captureLogs();
    fakeSuno({ credit: SUNO_CREDIT_ALARM });
    expect((await runWatchdog(env)).problemy.map((p) => p.kod)).not.toContain("suno_kredit");
    vi.restoreAllMocks();

    captureLogs();
    fakeSuno({ credit: "error" });
    expect((await runWatchdog(env)).problemy.map((p) => p.kod)).not.toContain("suno_kredit");
    vi.restoreAllMocks();

    captureLogs();
    const calls = fakeSuno({ credit: 0 });
    const noKey = await runWatchdog({ ...env, SUNO_API_KEY: undefined } as Bindings);
    expect(noKey.problemy.map((p) => p.kod)).not.toContain("suno_kredit");
    expect(calls).toEqual([]);
  }, 60_000);
});
