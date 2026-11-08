import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { pickScandals, socialScandals } from "./press-scandals";

/**
 * Kauzy ze Socek: rýpnutí a urážky mezi kluby a do Zpravodaje, jak je vyhodnotil model.
 * Uznání kauza není, smazaný text se nepoužije, staré věci (po týdnu) taky ne.
 */
let miniflare: Miniflare;
let db: D1Database;
const now = new Date("2026-11-08T20:00:00Z");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT)",
    `CREATE TABLE social_posts (id TEXT PRIMARY KEY, user_id TEXT, team_id TEXT, body TEXT, created_at TEXT, deleted_at TEXT, removed_at TEXT, mentions TEXT)`,
    `CREATE TABLE social_comments (id TEXT PRIMARY KEY, target_key TEXT, author_kind TEXT, user_id TEXT, team_id TEXT, persona_id TEXT,
      author_name TEXT, author_avatar TEXT, reply_to_id TEXT, body TEXT, created_at TEXT, deleted_at TEXT, removed_at TEXT, mentions TEXT)`,
  ]) await db.prepare(sql).run();
  const migration = readFileSync(resolve(__dirname, "../../migrations/0291_social_relation_effects.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();

  const effect = (id: string, a: string, b: string, actor: string, source: string, kind: string, created: string) =>
    db.prepare("INSERT INTO social_relation_effects (id, team_a_id, team_b_id, actor_team_id, source_key, kind, respect, heat, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)")
      .bind(id, a, b, actor, source, kind, created);
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('t-spule', 'AC Jitona Spůle'), ('t-kavo', 'FC Kávoviny Vlachovo Březí'), ('t-vim', 'FK Engel Vimperk')"),
    db.prepare("INSERT INTO social_posts (id, team_id, body, created_at) VALUES ('p1', 't-spule', '@FK Engel Vimperk zítra vás rozstřílíme. Jsme ready!', '2026-11-07T10:00:00Z')"),
    db.prepare("INSERT INTO social_posts (id, team_id, body, created_at) VALUES ('p2', 't-spule', '@FC Kávoviny Vlachovo Březí gratulace, zasloužené', '2026-11-07T11:00:00Z')"),
    db.prepare("INSERT INTO social_comments (id, team_id, author_kind, body, created_at) VALUES ('c1', 't-kavo', 'manager', 'Spůle hraje jak dorost, banda nemehel', '2026-11-08T09:00:00Z')"),
    db.prepare("INSERT INTO social_comments (id, team_id, author_kind, body, created_at) VALUES ('c2', 't-spule', 'manager', 'Hlavně ať o tom nepíše zase Drahomíra :D', '2026-11-08T09:30:00Z')"),
    db.prepare("INSERT INTO social_comments (id, team_id, author_kind, body, created_at, deleted_at) VALUES ('c3', 't-spule', 'manager', 'smazané', '2026-11-08T09:40:00Z', 'x')"),
    db.prepare("INSERT INTO social_posts (id, team_id, body, created_at) VALUES ('p3', 't-spule', '@FK Engel Vimperk staré rýpnutí', '2026-10-20T10:00:00Z')"),
    effect("e1", "t-spule", "t-vim", "t-spule", "post:p1", "tease", "2026-11-07T10:00:05Z"),
    effect("e2", "t-kavo", "t-spule", "t-spule", "post:p2", "praise", "2026-11-07T11:00:05Z"),
    effect("e3", "t-kavo", "t-spule", "t-kavo", "comment:c1", "insult", "2026-11-08T09:00:05Z"),
    effect("e4", "j-dra", "t-spule", "t-spule", "comment:c2", "journalist_tease", "2026-11-08T09:30:05Z"),
    effect("e5", "t-spule", "t-vim", "t-spule", "comment:c3", "insult", "2026-11-08T09:40:05Z"),
    effect("e6", "t-spule", "t-vim", "t-spule", "post:p3", "tease", "2026-10-20T10:00:05Z"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("kauzy ze Socek", () => {
  it("rýpnutí trenéra, urážka od soupeře i rýpnutí do Zpravodaje; uznání, smazané a staré ne", async () => {
    const s = await socialScandals(db, "t-spule", now);
    expect(s.map((x) => x.ref).sort()).toEqual(["socky:comment:c1", "socky:comment:c2", "socky:post:p1"]);
    expect(s.find((x) => x.ref === "socky:post:p1")).toMatchObject({
      kind: "socky", names: ["FK Engel Vimperk"], weight: 4,
      fact: "Trenér v Sockách napsal na adresu klubu FK Engel Vimperk: „@FK Engel Vimperk zítra vás rozstřílíme.“",
    });
    expect(s.find((x) => x.ref === "socky:comment:c1")).toMatchObject({
      names: ["FC Kávoviny Vlachovo Březí"], weight: 5,
      fact: expect.stringContaining("Trenér klubu FC Kávoviny Vlachovo Březí si v Sockách vzal na mušku tenhle klub"),
    });
    expect(s.find((x) => x.ref === "socky:comment:c2")?.fact).toContain("pod článkem Zpravodaje");
  });

  it("soupeř, kterého trenér urazil, má kauzu z druhé strany; rýpnutí do Zpravodaje jen u autora", async () => {
    const kavo = await socialScandals(db, "t-kavo", now);
    expect(kavo.map((x) => x.ref)).toEqual(["socky:comment:c1"]);
    expect(kavo[0].fact).toContain("Trenér v Sockách napsal na adresu klubu AC Jitona Spůle");
  });

  it("bulvár po Sockách sáhne radši než seriózní redaktor", async () => {
    const pool = await socialScandals(db, "t-spule", now);
    const other = { ref: "buy:x", kind: "purchase" as const, fact: "Nákup.", names: [], weight: 4 };
    let tabloid = 0;
    let serious = 0;
    for (let i = 0; i < 200; i++) {
      if (pickScandals([...pool, other], { style: "bulvar", count: 1, seed: `s${i}` })[0]?.kind === "socky") tabloid++;
      if (pickScandals([...pool, other], { style: "seriozni", count: 1, seed: `s${i}` })[0]?.kind === "socky") serious++;
    }
    expect(tabloid).toBeGreaterThan(serious);
  });
});
