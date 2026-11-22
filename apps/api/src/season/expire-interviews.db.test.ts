/**
 * Úklid nevyřízených předzápasových rozhovorů po kole nad skutečnou D1 (Miniflare).
 * Produkční D1 odmítá vzor LIKE delší než 50 bajtů. Starý úklid mazal přes
 * `metadata LIKE '%"interviewId":"<uuid>"%'` (54 bajtů), dotaz vždy spadl a žádost
 * o rozhovor visela v telefonu trenéra i po zápase (prod 11/2026: 68 ze 71).
 * Miniflare ve vitestu limit nemá, proto ho test napodobí obalem nad databází.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { cleanupExpiredInterviewRequests, expirePreMatchInterviews } from "./league-round";

let miniflare: Miniflare;
let db: D1Database;

const LIKE_PATTERN_LIMIT = 50;

/** Databáze, která se chová jako produkční D1: dlouhý vzor LIKE shodí dotaz. */
function withLikeLimit(inner: D1Database): D1Database {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop !== "prepare") return Reflect.get(target, prop, receiver);
      return (sql: string) => {
        const stmt = target.prepare(sql);
        if (!/\bLIKE\b/i.test(sql)) return stmt;
        const origBind = stmt.bind.bind(stmt);
        (stmt as { bind: (...v: unknown[]) => D1PreparedStatement }).bind = (...values: unknown[]) => {
          const tooLong = values.some((v) => typeof v === "string" && new TextEncoder().encode(v).length > LIKE_PATTERN_LIMIT);
          if (tooLong) {
            const failing = origBind(...values);
            const fail = () => Promise.reject(new Error("D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR"));
            return Object.assign(failing, { run: fail, all: fail, first: fail });
          }
          return origBind(...values);
        };
        return stmt;
      };
    },
  });
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE coach_interviews (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, match_calendar_id TEXT, status TEXT, kind TEXT)");
  await db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, unread_count INTEGER NOT NULL DEFAULT 0, last_message_text TEXT, last_message_at TEXT)");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER NOT NULL DEFAULT 0)");
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const ROUND = "cal-round-8";
const OTHER_ROUND = "cal-round-9";
const INTERVIEW_ID = "3f1c2b9e-7a44-4b8e-9d21-5c6e8f0a1b2c";
const OTHER_INTERVIEW_ID = "8d2e4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a";

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM coach_interviews"),
    db.prepare("DELETE FROM conversations"),
    db.prepare("DELETE FROM messages"),
    db.prepare(`INSERT INTO coach_interviews (id, team_id, match_calendar_id, status, kind) VALUES
      ('${INTERVIEW_ID}', 'club', '${ROUND}', 'pending', 'pre_match'),
      ('${OTHER_INTERVIEW_ID}', 'club', '${OTHER_ROUND}', 'pending', 'pre_match')`),
    db.prepare(`INSERT INTO conversations (id, team_id, type, title, unread_count, last_message_text, last_message_at) VALUES
      ('conv-news', 'club', 'system', 'Zpravodaj', 2, '📰 Redaktor Zpravodaje se chce zeptat před zápasem s Volary.', '2026-11-21T08:00:00Z')`),
    db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read) VALUES
      ('m-old', 'conv-news', 'system', 'Redakce Zpravodaje', 'Vyšel článek o zápase.', '{"type":"article"}', '2026-11-20T08:00:00Z', 1),
      ('m-req', 'conv-news', 'system', 'Redakce Zpravodaje', '📰 Redaktor Zpravodaje se chce zeptat před zápasem s Volary.', '{"type":"interview_request","interviewId":"${INTERVIEW_ID}"}', '2026-11-21T08:00:00Z', 0),
      ('m-next', 'conv-news', 'system', 'Redakce Zpravodaje', '📰 Redaktor se chce zeptat před dalším zápasem.', '{"type":"interview_request","interviewId":"${OTHER_INTERVIEW_ID}"}', '2026-11-21T07:00:00Z', 0)`),
  ]);
});

describe("úklid nevyřízených předzápasových rozhovorů po kole", () => {
  it("na databázi s limitem vzoru LIKE (jako produkční D1) žádost z telefonu opravdu zmizí", async () => {
    const n = await expirePreMatchInterviews(withLikeLimit(db), ROUND);
    expect(n).toBe(1);
    const left = await db.prepare("SELECT id FROM messages ORDER BY id").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["m-next", "m-old"]);
    const status = await db.prepare("SELECT id, status FROM coach_interviews ORDER BY id").all<{ id: string; status: string }>();
    expect(status.results).toEqual([
      { id: INTERVIEW_ID, status: "expired" },
      { id: OTHER_INTERVIEW_ID, status: "pending" },
    ]);
  });

  it("smazaná nepřečtená žádost nenechá svítit nepřečtenou zprávu a náhled konverzace se vrátí na předchozí zprávu", async () => {
    await expirePreMatchInterviews(withLikeLimit(db), ROUND);
    const conv = await db.prepare("SELECT unread_count, last_message_text, last_message_at FROM conversations WHERE id = 'conv-news'")
      .first<{ unread_count: number; last_message_text: string; last_message_at: string }>();
    expect(conv).toEqual({
      unread_count: 1,
      last_message_text: "📰 Redaktor se chce zeptat před dalším zápasem.",
      last_message_at: "2026-11-21T07:00:00Z",
    });
  });

  it("cizí tým ani přečtená žádost počítadlo nepokazí", async () => {
    await db.batch([
      db.prepare("UPDATE messages SET read = 1 WHERE id = 'm-req'"),
      db.prepare("UPDATE conversations SET unread_count = 1"),
      db.prepare(`INSERT INTO conversations (id, team_id, type, title, unread_count) VALUES ('conv-rival', 'rival', 'system', 'Zpravodaj', 0)`),
    ]);
    await expirePreMatchInterviews(withLikeLimit(db), ROUND);
    const conv = await db.prepare("SELECT unread_count FROM conversations WHERE id = 'conv-news'").first<{ unread_count: number }>();
    expect(conv?.unread_count).toBe(1);
  });
});

describe("jednorázový úklid žádostí, které visely od května", () => {
  beforeEach(async () => {
    // Stav z produ: rozhovor už propadl (status expired), žádost v telefonu zůstala.
    await db.batch([
      db.prepare(`UPDATE coach_interviews SET status = 'expired' WHERE id = '${INTERVIEW_ID}'`),
      db.prepare(`INSERT INTO coach_interviews (id, team_id, match_calendar_id, status, kind) VALUES
        ('iv-rival', 'rival', '${ROUND}', 'expired', 'pre_match'),
        ('iv-answered', 'club', 'cal-round-7', 'answered', 'pre_match')`),
      db.prepare(`INSERT INTO conversations (id, team_id, type, title, unread_count) VALUES ('conv-rival', 'rival', 'system', 'Zpravodaj', 1)`),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at, read) VALUES
        ('m-rival', 'conv-rival', 'system', 'Redakce Zpravodaje', 'žádost', '{"type":"interview_request","interviewId":"iv-rival"}', '2026-11-21T08:00:00Z', 0),
        ('m-answered', 'conv-news', 'system', 'Redakce Zpravodaje', 'zodpovězená', '{"type":"interview_request","interviewId":"iv-answered"}', '2026-11-14T08:00:00Z', 1)`),
    ]);
  });

  it("náhled nic nesmaže, jen spočítá propadlé žádosti", async () => {
    const r = await cleanupExpiredInterviewRequests(withLikeLimit(db), { limit: 100, dryRun: true });
    expect(r).toEqual({ interviews: 2, messages: 2, unread: 2, remaining: 2 });
    const count = await db.prepare("SELECT COUNT(*) AS c FROM messages").first<{ c: number }>();
    expect(count?.c).toBe(5);
  });

  it("smaže jen žádosti k propadlým rozhovorům, po dávkách, a opraví nepřečtené", async () => {
    const first = await cleanupExpiredInterviewRequests(withLikeLimit(db), { limit: 1, dryRun: false });
    expect(first.interviews).toBe(1);
    expect(first.remaining).toBe(1);
    const second = await cleanupExpiredInterviewRequests(withLikeLimit(db), { limit: 100, dryRun: false });
    expect(second.remaining).toBe(0);
    const left = await db.prepare("SELECT id FROM messages ORDER BY id").all<{ id: string }>();
    // Zůstane článek, žádost k ještě běžícímu rozhovoru i k zodpovězenému.
    expect(left.results.map((r) => r.id)).toEqual(["m-answered", "m-next", "m-old"]);
    const unread = await db.prepare("SELECT id, unread_count FROM conversations ORDER BY id").all<{ id: string; unread_count: number }>();
    expect(unread.results).toEqual([{ id: "conv-news", unread_count: 1 }, { id: "conv-rival", unread_count: 0 }]);
  });
});
