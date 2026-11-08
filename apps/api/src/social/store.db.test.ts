/**
 * Socky nad skutečnou D1 (Miniflare): skládání zdi, hlasy fanoušků pod výsledky,
 * vyplavání živé diskuse, skrývání a oznámení.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import {
  addMute, insertManagerComment, insertPost, insertPersonaComment, loadComments, loadFeed,
  loadFeedItem, loadViewer, resolveTarget, toggleLike,
} from "./store";
import { notifyComment } from "./notify";
import type { Viewer } from "./feed-model";

let miniflare: Miniflare;
let db: D1Database;
let me: Viewer;

const daysAgo = (n: number, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};
/** Starý tvar času v tabulce news ("YYYY-MM-DD HH:MM:SS"). */
const legacy = (iso: string) => iso.replace("T", " ").replace("Z", "");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, league_id TEXT)",
    "CREATE TABLE managers (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, name TEXT, avatar TEXT, created_at TEXT)",
    `CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, team_id TEXT, type TEXT NOT NULL, headline TEXT NOT NULL,
      body TEXT NOT NULL, game_week INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), journalist_id TEXT, season_number INTEGER)`,
    "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, round INTEGER)",
    `CREATE TABLE fan_posts (id TEXT PRIMARY KEY, reference_id TEXT, team_id TEXT NOT NULL, author_name TEXT NOT NULL,
      author_handle TEXT NOT NULL, author_kind TEXT NOT NULL DEFAULT 'fanousek', author_avatar TEXT, group_id TEXT,
      body TEXT NOT NULL, tone TEXT, likes INTEGER, topic TEXT, game_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
    "CREATE UNIQUE INDEX idx_fan_posts_ref ON fan_posts(reference_id) WHERE reference_id IS NOT NULL",
    `CREATE TABLE notifications (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, action_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ]) await db.prepare(sql).run();

  const migration = readFileSync(resolve(__dirname, "../../migrations/0288_social_feed.sql"), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();

  await db.batch([
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Schwan liga', 'Prachatice'), ('l2', 'Přebor Prahy', 'Praha')"),
    db.prepare(`INSERT INTO teams VALUES
      ('t-me', 'AC Jitona Spůle', 'u-me', 'l1'),
      ('t-other', 'FK Engel Vimperk', 'u-other', 'l1'),
      ('t-ai', 'FK Madeta Volary', 'ai', 'l1'),
      ('t-praha', 'AC ČEZ Klamovka', 'u-praha', 'l2')`),
    db.prepare(`INSERT INTO managers VALUES
      ('m1', 't-me', 'u-me', 'Zdeněk J.', NULL, '2026-01-01'),
      ('m2', 't-other', 'u-other', 'Petr K.', NULL, '2026-01-01'),
      ('m3', 't-ai', 'ai', 'AI trenér', NULL, '2026-01-01'),
      ('m4', 't-praha', 'u-praha', 'Martin H.', NULL, '2026-01-01')`),
  ]);
  me = (await loadViewer(db, "t-me"))!;
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  for (const t of ["news", "matches", "fan_posts", "notifications", "social_posts", "social_comments", "social_likes", "social_mutes", "social_reports"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

async function addNews(id: string, type: string, headline: string, body: string, createdAt: string, extra: { league?: string; team?: string | null; week?: number } = {}) {
  await db.prepare("INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, extra.league ?? "l1", extra.team ?? null, type, headline, body, extra.week ?? null, createdAt).run();
}

describe("zeď", () => {
  it("sloučí přestupy okresu a dne, vlastní přestup a příspěvek manažera nechá zvlášť", async () => {
    await addNews("tr1", "transfer", "Přestup! Jan Novák míří z FK A do FK B", "…", legacy(daysAgo(0, 8)));
    await addNews("tr2", "transfer", "Petr Malý posílí kádr FK Engel Vimperk", "…", daysAgo(0, 9));
    await addNews("tr3", "transfer", "Ondřej Šťastný posílí kádr AC Jitona Spůle", "…", daysAgo(0, 9));
    await addNews("tr4", "transfer", "Hostování: Radek Mareš zamířil do FC GRW", "…", daysAgo(0, 9), { league: "l2" });
    await addNews("promo", "promotion", "Přijďte na zápas", "…", daysAgo(0, 9));
    await insertPost(db, (await loadViewer(db, "t-other"))!, "Kdo jede v sobotu do Spůle?");

    const { items } = await loadFeed(db, me);
    const keys = items.map((i) => i.key);
    expect(keys[0]).toMatch(/^post:/);
    expect(keys).toContain("news:tr3");
    expect(keys).not.toContain("news:promo");
    const prachatice = items.find((i) => i.key.startsWith("bundle:transfers:Prachatice:"))!;
    expect(prachatice.lines).toEqual(["Petr Malý posílí kádr FK Engel Vimperk", "Jan Novák míří z FK A do FK B"]);
    expect(items.some((i) => i.key.startsWith("bundle:transfers:Praha:"))).toBe(true);
    expect(items[0].authorName).toBe("Petr K.");
    expect(items[0].teamName).toBe("FK Engel Vimperk");
  });

  it("stránky na sebe navazují a starší obsah se najde", async () => {
    await addNews("new", "interview", "Nový rozhovor", "{}", daysAgo(0));
    await addNews("old", "interview", "Starý rozhovor", "{}", daysAgo(3));
    const first = await loadFeed(db, me);
    expect(first.items.map((i) => i.key)).toEqual(["news:new"]);
    expect(first.nextBefore).not.toBeNull();
    const second = await loadFeed(db, me, first.nextBefore);
    expect(second.items.map((i) => i.key)).toEqual(["news:old"]);
  });

  it("starý článek, pod kterým se dnes diskutuje, je na první stránce nahoře", async () => {
    // Čerstvý článek je ze včerejška: dnešních 9:00 by brzy ráno bylo v budoucnosti
    // a předběhlo by komentář napsaný teď.
    await addNews("fresh", "interview", "Čerstvý rozhovor", "{}", daysAgo(1, 9));
    await addNews("hot", "interview", "Rozhovor z předvčera", "{}", daysAgo(2, 9));
    await insertManagerComment(db, (await loadViewer(db, "t-other"))!, "news:hot", "Tohle si vyžere!", null);
    const { items } = await loadFeed(db, me);
    expect(items[0].key).toBe("news:hot");
    expect(items[0].commentCount).toBe(1);
    expect(items[0].comments[0].body).toBe("Tohle si vyžere!");
    expect(items[0].comments[0].authorLabel).toBe("FK Engel Vimperk");
  });

  it("skrytý okres a klub zmizí, vlastní příspěvek zůstane", async () => {
    await addNews("praha", "interview", "Pražský rozhovor", "{}", daysAgo(0), { league: "l2" });
    await addNews("vimperk", "interview", "Rozhovor Vimperka", "{}", daysAgo(0), { team: "t-other" });
    await insertPost(db, me, "Můj příspěvek");
    await addMute(db, me.userId, { kind: "district", value: "Praha" }, "okres Praha");
    await addMute(db, me.userId, { kind: "team", value: "t-other" }, "klub FK Engel Vimperk");
    await addMute(db, me.userId, { kind: "district", value: "Prachatice" }, "okres Prachatice");
    const { items } = await loadFeed(db, me);
    expect(items.map((i) => i.kind)).toEqual(["post"]);
  });
});

describe("hlasy fanoušků pod výsledky kola", () => {
  it("vezme příspěvky fanoušků ze zápasů kola, každý text jednou, od každého klubu napřed jeden", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches VALUES ('m-1', 'l1', 5), ('m-2', 'l1', 5), ('m-3', 'l1', 4)"),
      db.prepare(`INSERT INTO fan_posts (id, reference_id, team_id, author_name, author_handle, author_kind, body, game_date, created_at) VALUES
        ('f1', 'zap-m-1-kotel', 't-me', 'Franta', '@f', 'vudce', 'Tři body doma!', '2026-11-07', '2026-11-07T16:10:00Z'),
        ('f2', 'zap-m-1-rodiny', 't-me', 'Jana', '@j', 'fanousek', 'Krásný zápas', '2026-11-07', '2026-11-07T16:11:00Z'),
        ('f3', 'riv-m-1-t-other', 't-other', 'Rival', '@r', 'rival', 'Příště vás sundáme', '2026-11-07', '2026-11-07T16:12:00Z'),
        ('f4', 'riv-m-1-t-me', 't-me', 'Rival', '@r', 'rival', 'Příště vás sundáme', '2026-11-07', '2026-11-07T16:12:00Z'),
        ('f5', 'zap-m-3-kotel', 't-me', 'Minule', '@m', 'vudce', 'Z jiného kola', '2026-11-07', '2026-11-07T16:13:00Z'),
        ('f6', 'zap-m-10-kotel', 't-me', 'Podobné id', '@p', 'vudce', 'Zápas m-10, ne m-1', '2026-11-07', '2026-11-07T16:13:00Z')`),
    ]);
    await addNews("res", "round_results", "5. kolo: přehled výsledků", "FK A porazil FK B 2:0. FK C remizoval s FK D 1:1.", daysAgo(0), { week: 5 });

    const comments = await loadComments(db, "news:res", me);
    expect(comments.map((c) => c.body)).toEqual(["Tři body doma!", "Krásný zápas", "Příště vás sundáme"]);
    expect(comments[0].authorLabel).toBe("fandí AC Jitona Spůle");

    const { items } = await loadFeed(db, me);
    const res = items.find((i) => i.key === "news:res")!;
    expect(res.lines).toEqual(["FK A porazil FK B 2:0", "FK C remizoval s FK D 1:1"]);
    expect(res.commentCount).toBe(3);
    expect(res.comments).toHaveLength(2);
  });
});

describe("komentáře, lajky, oznámení", () => {
  it("lajk se přepíná", async () => {
    await addNews("i1", "interview", "Rozhovor", "{}", daysAgo(0));
    expect(await toggleLike(db, me.userId, "news:i1")).toEqual({ liked: true, count: 1 });
    expect(await toggleLike(db, "u-other", "news:i1")).toEqual({ liked: true, count: 2 });
    expect(await toggleLike(db, me.userId, "news:i1")).toEqual({ liked: false, count: 1 });
  });

  it("smazaný příspěvek není cíl a komentáře fanouška nese popisek", async () => {
    const id = await insertPost(db, me, "Ahoj");
    expect((await resolveTarget(db, `post:${id}`))?.ownerIsHuman).toBe(true);
    await insertPersonaComment(db, { key: `post:${id}`, authorKind: "fan", teamId: "t-me", personaId: "fl-1", authorName: "Franta", authorAvatar: null, replyToId: null, body: "Jedem!" });
    const [c] = await loadComments(db, `post:${id}`, me);
    expect(c.authorLabel).toBe("fandí AC Jitona Spůle");
    await db.prepare("UPDATE social_posts SET deleted_at = 'x' WHERE id = ?").bind(id).run();
    expect(await resolveTarget(db, `post:${id}`)).toBeNull();
    expect(await loadFeedItem(db, me, `post:${id}`)).toBeNull();
  });

  it("oznámení jen lidskému klubu, ne sobě, a k jedné diskusi jen jedno nepřečtené", async () => {
    const env = { DB: db, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" };
    const base = { key: "post:x", actorName: "Petr K.", body: "Souhlas", title: "příspěvek", push: false };
    await notifyComment(env, { ...base, recipientTeamId: "t-me", actorTeamId: "t-other" });
    await notifyComment(env, { ...base, recipientTeamId: "t-me", actorTeamId: "t-other" });
    await notifyComment(env, { ...base, recipientTeamId: "t-me", actorTeamId: "t-me" });
    await notifyComment(env, { ...base, recipientTeamId: "t-ai", actorTeamId: "t-other" });
    const rows = await db.prepare("SELECT team_id, action_url, title FROM notifications").all<{ team_id: string; action_url: string; title: string }>();
    expect(rows.results).toEqual([{ team_id: "t-me", action_url: "/telefon?socky=post%3Ax", title: "Socky: nový komentář" }]);
  });

  it("souhrn přestupů z odkazu v oznámení obsahuje i přestup vlastního klubu", async () => {
    const date = daysAgo(1).slice(0, 10);
    await addNews("a", "transfer", "Ondřej Šťastný posílí kádr AC Jitona Spůle", "…", daysAgo(1));
    await addNews("b", "transfer", "Petr Malý posílí kádr FK C", "…", daysAgo(1));
    const item = await loadFeedItem(db, me, `bundle:transfers:Prachatice:${date}`);
    expect(item?.lines).toHaveLength(2);
  });
});
