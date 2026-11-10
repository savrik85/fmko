/**
 * Moderace Socek nad skutečnou D1 (Miniflare): nahlášení dá vědět adminům, tři nahlášení
 * skryjí příspěvek do rozhodnutí, stažení uklidí citace z historie vztahů a denní
 * limity hlídá sám zápis.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import {
  REPORTS_TO_HIDE, hideIfReported, insertManagerComment, insertPost, insertReport, loadComments, loadViewer,
  openReportCount, removeReported, resolveTarget, restoreAutoHidden,
} from "./store";
import { notifyAdminsOfReport } from "./notify";
import { REMOVED_QUOTE, applySocialLike, applySocialToneEffects, scrubRemovedQuotes, type SocialTone, type ToneClassifier } from "./relation-effects";
import type { Viewer } from "./feed-model";

let miniflare: Miniflare;
let db: D1Database;
let me: Viewer;
let other: Viewer;

const always = (tone: SocialTone): ToneClassifier => async () => tone;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE users (id TEXT PRIMARY KEY, is_admin INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, lat REAL, lng REAL)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, league_id TEXT, parent_team_id TEXT, village_id TEXT)",
    "CREATE TABLE managers (id TEXT PRIMARY KEY, team_id TEXT, user_id TEXT, name TEXT, avatar TEXT, created_at TEXT)",
    `CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, team_id TEXT, type TEXT NOT NULL, headline TEXT NOT NULL,
      body TEXT NOT NULL, game_week INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), journalist_id TEXT, season_number INTEGER)`,
    "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, round INTEGER)",
    `CREATE TABLE notifications (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      body TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, action_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE manager_relations (team_a_id TEXT NOT NULL, team_b_id TEXT NOT NULL, respect INTEGER NOT NULL DEFAULT 0,
      heat INTEGER NOT NULL DEFAULT 0, history TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (team_a_id, team_b_id))`,
    `CREATE TABLE journalist_relations (id TEXT PRIMARY KEY, journalist_id TEXT NOT NULL, team_id TEXT NOT NULL,
      sentiment INTEGER NOT NULL DEFAULT 0, duvod TEXT NOT NULL DEFAULT '', updated_at TEXT, UNIQUE(journalist_id, team_id))`,
  ]) await db.prepare(sql).run();
  for (const file of ["0288_social_feed.sql", "0289_social_mentions.sql", "0291_social_relation_effects.sql"]) {
    const migration = readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8")
      .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    for (const sql of migration) await db.prepare(sql).run();
  }
  await db.batch([
    db.prepare("INSERT INTO users VALUES ('u-me', 0), ('u-other', 0), ('u-admin', 1), ('u-admin2', 1), ('u3', 0), ('u4', 0)"),
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Schwan liga', 'Prachatice')"),
    db.prepare("INSERT INTO villages VALUES ('v1', 49.0, 14.0), ('v2', 50.5, 15.5)"),
    db.prepare(`INSERT INTO teams (id, name, user_id, league_id, parent_team_id, village_id) VALUES
      ('t-me', 'AC Jitona Spůle', 'u-me', 'l1', NULL, 'v1'),
      ('t-other', 'FK Engel Vimperk', 'u-other', 'l1', NULL, 'v2'),
      ('t-admin', 'SK Admin', 'u-admin', 'l1', NULL, NULL),
      ('t-admin-u21', 'SK Admin U21', 'u-admin', 'l1', 't-admin', NULL),
      ('t-admin2', 'TJ Druhý admin', 'u-admin2', 'l1', NULL, NULL)`),
    db.prepare(`INSERT INTO managers VALUES
      ('m1', 't-me', 'u-me', 'Zdeněk J.', NULL, '2026-01-01'),
      ('m2', 't-other', 'u-other', 'Petr K.', NULL, '2026-01-01')`),
  ]);
  me = (await loadViewer(db, "t-me"))!;
  other = (await loadViewer(db, "t-other"))!;
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["notifications", "social_posts", "social_comments", "social_reports", "social_relation_effects", "manager_relations", "journalist_relations"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
});

const removedAt = async (table: string, id: string) =>
  (await db.prepare(`SELECT removed_at FROM ${table} WHERE id = ?`).bind(id).first<{ removed_at: string | null }>())?.removed_at ?? null;

describe("nahlášení", () => {
  it("dvě nahlášení neskryjí, třetí od jiného člověka ano; stejný člověk se počítá jednou", async () => {
    const id = (await insertPost(db, other, "Sprostý příspěvek"))!;
    const key = `post:${id}`;
    expect(await insertReport(db, "u-me", key, null)).toBe(true);
    expect(await insertReport(db, "u-me", key, "znovu")).toBe(false);
    expect(await insertReport(db, "u3", key, null)).toBe(true);
    expect(await openReportCount(db, key)).toBe(REPORTS_TO_HIDE - 1);
    expect(await hideIfReported(db, key)).toBe(false);
    expect(await resolveTarget(db, key)).not.toBeNull();

    await insertReport(db, "u4", key, null);
    expect(await hideIfReported(db, key)).toBe(true);
    expect(await hideIfReported(db, key)).toBe(false);
    expect(await removedAt("social_posts", id)).not.toBeNull();
    expect(await resolveTarget(db, key)).toBeNull();
  });

  it("admin nahlášení zamítne: skrytý komentář se vrátí; po stažení už se nevrací", async () => {
    const postId = (await insertPost(db, me, "Ahoj"))!;
    const comment = (await insertManagerComment(db, other, `post:${postId}`, "Hrubý komentář", null))!;
    const key = `comment:${comment.id}`;
    for (const u of ["u-me", "u3", "u4"]) await insertReport(db, u, key, null);
    expect(await hideIfReported(db, key)).toBe(true);
    expect(await loadComments(db, `post:${postId}`, me)).toHaveLength(0);

    expect(await restoreAutoHidden(db, key)).toBe(true);
    expect(await removedAt("social_comments", comment.id)).toBeNull();
    expect(await loadComments(db, `post:${postId}`, me)).toHaveLength(1);

    // Stažení adminem s vyřízenými nahlášeními je konečné.
    await removeReported(db, key);
    await db.prepare("UPDATE social_reports SET resolved_at = 'x', resolution = 'removed' WHERE target_key = ?").bind(key).run();
    expect(await restoreAutoHidden(db, key)).toBe(false);
    expect(await removedAt("social_comments", comment.id)).not.toBeNull();
  });

  it("pod skrytým příspěvkem se cíl nevyřeší, takže se komentáře nevydají", async () => {
    const postId = (await insertPost(db, other, "Příspěvek"))!;
    await insertManagerComment(db, me, `post:${postId}`, "Komentář pod ním", null);
    expect(await resolveTarget(db, `post:${postId}`)).not.toBeNull();
    await removeReported(db, `post:${postId}`);
    // Route GET /social/comments vrací 404, když resolveTarget vrátí null.
    expect(await resolveTarget(db, `post:${postId}`)).toBeNull();
  });

  it("adminům přijde oznámení na hlavní klub, jedno nepřečtené stačí, skrytí projde vždy", async () => {
    const env = { DB: db } as never;
    const report = { key: "post:p1", body: "Sprostý příspěvek", reports: 1, hidden: false };
    expect(await notifyAdminsOfReport(env, report)).toBe(2);
    expect(await notifyAdminsOfReport(env, { ...report, reports: 2 })).toBe(0);
    expect(await notifyAdminsOfReport(env, { ...report, reports: 3, hidden: true })).toBe(2);
    const rows = await db.prepare("SELECT team_id, type, title, body, action_url FROM notifications ORDER BY team_id, title").all<Record<string, string>>();
    expect(rows.results).toEqual([
      { team_id: "t-admin", type: "system", title: "Socky: nové nahlášení", body: "Příspěvek „Sprostý příspěvek“ někdo nahlásil (celkem 1×).", action_url: "/admin" },
      { team_id: "t-admin", type: "system", title: "Socky: skryto po nahlášeních", body: "Příspěvek „Sprostý příspěvek“ nahlásili 3 lidé a je skrytý, dokud nerozhodneš.", action_url: "/admin" },
      { team_id: "t-admin2", type: "system", title: "Socky: nové nahlášení", body: "Příspěvek „Sprostý příspěvek“ někdo nahlásil (celkem 1×).", action_url: "/admin" },
      { team_id: "t-admin2", type: "system", title: "Socky: skryto po nahlášeních", body: "Příspěvek „Sprostý příspěvek“ nahlásili 3 lidé a je skrytý, dokud nerozhodneš.", action_url: "/admin" },
    ]);
  });
});

describe("stažení uklidí citace z historie vztahů", () => {
  it("záznam o rýpnutí, lajk s citací i důvod u novináře přijdou o text, jiné záznamy zůstanou", async () => {
    const insult = "Vimperk je banda nemehel a jejich trenér neumí počítat do tří";
    await applySocialToneEffects(db, always("insult"), {
      authorTeamId: "t-me", authorName: "Zdeněk J.", text: insult, sourceKey: "post:p1", context: "zeď", targetTeamIds: ["t-other"],
    });
    await applySocialToneEffects(db, always("praise"), {
      authorTeamId: "t-me", authorName: "Zdeněk J.", text: "Gratulace k výhře", sourceKey: "post:p2", context: "zeď", targetTeamIds: ["t-other"],
    });
    await applySocialLike(db, { likerTeamId: "t-admin", likerName: "Admin", ownerTeamId: "t-me", targetKey: "post:p1", snippet: insult });
    await db.prepare("INSERT INTO journalist_relations (id, journalist_id, team_id, sentiment, duvod) VALUES ('jr1', 'j1', 't-me', -10, ?)")
      .bind(`Socky: „${insult}“`.slice(0, 160)).run();

    expect(await scrubRemovedQuotes(db, "t-me", insult)).toBe(3);

    const histories = await db.prepare("SELECT history FROM manager_relations").all<{ history: string }>();
    const texts = histories.results.flatMap((r) => (JSON.parse(r.history) as Array<{ text: string }>).map((m) => m.text));
    expect(texts.some((t) => t.includes("nemehel"))).toBe(false);
    expect(texts).toContain(`Zdeněk J. v Sockách: ${REMOVED_QUOTE}`);
    expect(texts).toContain(`Admin dává v Sockách lajk: ${REMOVED_QUOTE}`);
    expect(texts).toContain("Zdeněk J. v Sockách: „Gratulace k výhře“");
    const jr = await db.prepare("SELECT duvod, sentiment FROM journalist_relations WHERE id = 'jr1'").first<{ duvod: string; sentiment: number }>();
    expect(jr).toEqual({ duvod: `Socky: ${REMOVED_QUOTE}`, sentiment: -10 });
    // Posuny vztahu zůstávají, maže se jen text.
    const rel = await db.prepare("SELECT respect, heat FROM manager_relations WHERE team_a_id = 't-me' AND team_b_id = 't-other'").first<{ respect: number; heat: number }>();
    expect(rel).toEqual({ respect: -6, heat: 6 });
    expect(await scrubRemovedQuotes(db, "t-me", insult)).toBe(0);
  });
});

describe("denní limity v zápisu", () => {
  it("příspěvky: přes limit se nezapíše a souběh ho nepřeleze", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => insertPost(db, me, `Příspěvek ${i}`, [], 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await insertPost(db, me, "Další", [], 3)).toBeNull();
    // Jiný člověk má vlastní limit, bez limitu se zapíše vždy.
    expect(await insertPost(db, other, "Cizí", [], 3)).toEqual(expect.any(String));
    expect(await insertPost(db, me, "Bez limitu")).toEqual(expect.any(String));
  }, 30_000);

  it("komentáře: hraniční hodnota projde, další ne; včerejší se nepočítají", async () => {
    const postId = (await insertPost(db, other, "Příspěvek"))!;
    const key = `post:${postId}`;
    await db.prepare("INSERT INTO social_comments (id, target_key, author_kind, user_id, team_id, author_name, body, created_at) VALUES ('old', ?, 'manager', 'u-me', 't-me', 'Zdeněk J.', 'včera', '2020-01-01T10:00:00Z')")
      .bind(key).run();
    expect(await insertManagerComment(db, me, key, "první", null, [], 2)).not.toBeNull();
    expect(await insertManagerComment(db, me, key, "druhý", null, [], 2)).not.toBeNull();
    expect(await insertManagerComment(db, me, key, "třetí", null, [], 2)).toBeNull();
    expect(await loadComments(db, key, me)).toHaveLength(3);
  });
});
