import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

/**
 * Pohárové kolo přes frontu: cron jen pošle zprávy, zpráva odehraje malou dávku a pošle další.
 * `maybeAdvanceCup` je tu nahrazený: odehraje tolik zápasů, kolik mu rozpočet dovolí.
 */
const advanceCalls: Array<{ maxChunks?: number; fullEngineBudget?: number; deadlineMs?: number }> = [];
let playPerCall = 5;

vi.mock("./cup", () => ({
  maybeAdvanceCup: async (db: D1Database, _env: unknown, opts: { maxChunks?: number; fullEngineBudget?: number; deadlineMs?: number }) => {
    advanceCalls.push(opts);
    const n = Math.min(playPerCall, opts.fullEngineBudget ?? 99);
    await db.prepare(
      "UPDATE cup_matches SET status = 'simulated' WHERE id IN (SELECT id FROM cup_matches WHERE status = 'scheduled' ORDER BY bracket_pos LIMIT ?)",
    ).bind(n).run();
    return 1;
  },
}));

describe("pohárové kolo přes frontu", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  const CUP = "cup-s3";
  const sent: Array<{ body: { kind: string; hop: number }; delaySeconds?: number }> = [];
  const queue = { send: async (body: never, opts?: { delaySeconds?: number }) => { sent.push({ body, delaySeconds: opts?.delaySeconds }); } };
  const env = () => ({ DB: db, MATCH_QUEUE: queue }) as never;

  beforeAll(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    db = await miniflare.getD1Database("DB");
    for (const sql of [
      "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
      "CREATE TABLE teams (id TEXT PRIMARY KEY, game_date TEXT)",
      "CREATE TABLE cup_competitions (id TEXT PRIMARY KEY, season_number INTEGER, status TEXT, total_rounds INTEGER, current_round INTEGER)",
      "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT)",
      "CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, round INTEGER, bracket_pos INTEGER, home_cup_team_id TEXT, away_cup_team_id TEXT, scheduled_at TEXT, status TEXT)",
    ]) await db.prepare(sql).run();
  });

  afterAll(async () => { await miniflare.dispose(); });

  /** 1. kolo: `watched` zápasů se skutečným klubem, `power` zápasů dvou hostů. */
  async function seed(watched: number, power: number, gameDate = "2026-11-14T16:00:00.000Z") {
    for (const t of ["seasons", "teams", "cup_competitions", "cup_teams", "cup_matches"]) await db.prepare(`DELETE FROM ${t}`).run();
    const stmts: D1PreparedStatement[] = [
      db.prepare("INSERT INTO seasons VALUES ('s3', 3, 'active')"),
      db.prepare("INSERT INTO teams VALUES ('t1', ?)").bind(gameDate),
      db.prepare("INSERT INTO cup_competitions VALUES (?, 3, 'active', 6, 1)").bind(CUP),
    ];
    for (let i = 0; i < watched + power; i++) {
      const real = i < watched;
      stmts.push(db.prepare("INSERT INTO cup_teams VALUES (?, ?, ?)").bind(`h${i}`, CUP, real ? `team${i}` : null));
      stmts.push(db.prepare("INSERT INTO cup_teams VALUES (?, ?, NULL)").bind(`a${i}`, CUP));
      stmts.push(db.prepare("INSERT INTO cup_matches VALUES (?, ?, 1, ?, ?, ?, '2026-11-14T16:00:00.000Z', 'scheduled')").bind(`m${i}`, CUP, i, `h${i}`, `a${i}`));
    }
    await db.batch(stmts);
  }

  beforeEach(() => { sent.length = 0; advanceCalls.length = 0; playPerCall = 5; });

  it("kolo se 32 zápasy skutečných klubů: cron pošle dva řetězy a sám nic nehraje", async () => {
    await seed(32, 0);
    const { enqueueCupTick, dueCupRound } = await import("./cup-queue");
    expect(await dueCupRound(db)).toEqual({ cupId: CUP, round: 1, remaining: 32, watched: 32 });
    expect(await enqueueCupTick(env())).toBe(2);
    expect(sent.map((s) => s.body)).toEqual([expect.objectContaining({ kind: "cup_round", hop: 0 }), expect.objectContaining({ kind: "cup_round", hop: 0 })]);
    expect(sent[1].delaySeconds).toBeGreaterThan(0);
    expect(advanceCalls).toHaveLength(0);
  });

  it("kolo bez skutečných klubů do fronty nejde (silová simulace zůstává v cronu)", async () => {
    await seed(0, 10);
    const { enqueueCupTick } = await import("./cup-queue");
    expect(await enqueueCupTick(env())).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("kolo s termínem v budoucnu se nehraje", async () => {
    await seed(8, 0, "2026-11-13T16:00:00.000Z");
    const { enqueueCupTick, processCupChunk } = await import("./cup-queue");
    expect(await enqueueCupTick(env())).toBe(0);
    expect(await processCupChunk(env(), 0)).toEqual({ status: "no-round", played: 0, remaining: 0 });
    expect(advanceCalls).toHaveLength(0);
  });

  it("zpráva odehraje dávku s rozpočtem a časem a pošle další, dokud něco zbývá", async () => {
    await seed(12, 0);
    const { processCupChunk, CUP_QUEUE_FULL_ENGINE_BUDGET } = await import("./cup-queue");
    const first = await processCupChunk(env(), 0);
    expect(first).toEqual({ status: "done", played: 5, remaining: 7 });
    expect(advanceCalls[0]).toMatchObject({ maxChunks: 1, fullEngineBudget: CUP_QUEUE_FULL_ENGINE_BUDGET });
    expect(advanceCalls[0].deadlineMs).toBeGreaterThan(Date.now());
    expect(sent).toEqual([{ body: expect.objectContaining({ kind: "cup_round", hop: 1 }), delaySeconds: undefined }]);

    await processCupChunk(env(), 1);
    const last = await processCupChunk(env(), 2);
    expect(last).toEqual({ status: "done", played: 2, remaining: 0 });
    // Po poslední dávce už další zpráva nevzniká.
    expect(sent).toHaveLength(2);
  });

  it("dávka, která nic neodehrála, zkusí další až za chvíli", async () => {
    await seed(6, 0);
    playPerCall = 0;
    const { processCupChunk } = await import("./cup-queue");
    expect(await processCupChunk(env(), 3)).toEqual({ status: "idle", played: 0, remaining: 6 });
    expect(sent[0].delaySeconds).toBeGreaterThanOrEqual(60);
  });

  it("řetěz se po stropu článků zastaví", async () => {
    await seed(6, 0);
    playPerCall = 0;
    const { processCupChunk, CUP_QUEUE_MAX_HOPS } = await import("./cup-queue");
    await processCupChunk(env(), CUP_QUEUE_MAX_HOPS - 1);
    expect(sent).toHaveLength(0);
  });
});
