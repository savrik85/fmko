import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import {
  activePromisesForClub, activeTransferPromise, clearUnrestAfterTransfer, listPromises, promiseInsert, promiseText, resolvePromises,
  settleDepartedPromises,
} from "./promises";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["player_promises", "players", "teams", "injuries"]) await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, parent_team_id TEXT)").run();
  await db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, life_context TEXT)").run();
  await db.prepare("CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, days_remaining INTEGER, is_fake INTEGER NOT NULL DEFAULT 0)").run();
  // Skutečná migrace (bez doplnění starých slibů, které potřebuje plná tabulka hráčů).
  const migration = readFileSync(new URL("../../migrations/0268_player_promises.sql", import.meta.url), "utf8").split("-- Sliby, které už běží")[0];
  for (const stmt of migration.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  await db.prepare("INSERT INTO teams VALUES ('A', NULL), ('A21', 'A'), ('B', NULL)").run();
  await db.prepare("INSERT INTO players VALUES ('p1', 'A', 'Jan', 'Novák', '{}'), ('p2', 'A21', 'Petr', 'Svoboda', '{}'), ('p3', 'B', 'Karel', 'Černý', '{}')").run();
});

const promise = (playerId: string, type: "minutes" | "transfer" | "release", extra: { offerId?: string; club?: string; madeAt?: string } = {}) =>
  promiseInsert(db, { clubTeamId: "A", playerId, type, madeAt: extra.madeAt ?? "2026-10-19T10:00:00Z", deadline: "2026-11-09T10:00:00Z", offerId: extra.offerId, club: extra.club }).run();

describe("sliby hráčům", () => {
  it("nový slib běží, vyhodnocení ho uzavře a hráč ho má v historii", async () => {
    await promise("p1", "minutes");
    expect((await listPromises(db, "p1", "A")).map((p) => p.status)).toEqual(["active"]);
    await resolvePromises(db, "p1", ["minutes"], "kept");
    const [p] = await listPromises(db, "p1", "A");
    expect(p.status).toBe("kept");
    expect(p.resolvedAt).not.toBeNull();
  });

  it("v kádru: běžící sliby hráčů klubu i z U21, jen ty běžící", async () => {
    await promise("p1", "transfer");
    await promise("p2", "minutes");
    await resolvePromises(db, "p1", ["transfer"], "broken");
    await promise("p1", "minutes", { madeAt: "2026-10-20T10:00:00Z" });
    const active = await activePromisesForClub(db, "A");
    expect([...active.keys()].sort()).toEqual(["p1", "p2"]);
    expect(active.get("p1")).toBe("Místo v základu ve 2 ze 3 příštích zápasů");
  });

  it("hráč odešel: slib prodeje splněn, slib sestavy vypršel; kdo zůstal, běží dál", async () => {
    await promise("p1", "transfer");
    await promise("p3", "minutes"); // p3 je v cizím klubu B → pro klub A odešel
    await promise("p2", "minutes"); // p2 je v U21 klubu A → pořád doma
    await db.prepare("UPDATE players SET team_id = 'B' WHERE id = 'p1'").run();
    expect(await settleDepartedPromises(db)).toBe(2);
    expect((await listPromises(db, "p1", "A"))[0].status).toBe("kept");
    expect((await listPromises(db, "p3", "A"))[0].status).toBe("expired");
    expect((await listPromises(db, "p2", "A"))[0].status).toBe("active");
  });

  it("slib prodeje a „pustit ho“ jde najít pro varování u nabídky", async () => {
    await promise("p1", "release", { offerId: "o1", club: "SV Grafenau" });
    const p = await activeTransferPromise(db, "p1");
    expect(p?.type).toBe("release");
    expect(promiseText(p!)).toContain("Přijmout nabídku od SV Grafenau");
    expect(await activeTransferPromise(db, "p2")).toBeNull();
  });

  it("texty slibů bez herních čísel, jen podmínky", () => {
    expect(promiseText({ type: "transfer", deadline: "2026-11-18T10:00:00Z", club: null })).toMatch(/^Pustit ho při další dobré nabídce \(do 18\. ?11\.\)$/);
    expect(promiseText({ type: "minutes", deadline: null, club: null })).not.toMatch(/\/100|→/);
  });
});

describe("truc a sliby po trvalém přestupu", () => {
  const PLEDGE_TRANSFER = { type: "transfer", madeAt: "2026-10-20T06:25:49Z", deadline: "2026-11-19T06:25:49Z" };
  const PLEDGE_MINUTES = { type: "minutes", madeAt: "2026-10-21T08:00:00Z", deadline: "2026-11-11T08:00:00Z" };
  const unrestWith = (pledge: object) => ({
    level: 45, reason: "rejected_offer", teamName: "FK Engel Vimperk", since: "2026-10-19T10:00:52Z",
    pledge, reasons: ["money", "better_club"], deals: [{ id: "promise_transfer", at: "2026-10-20T06:25:49Z" }],
  });
  const lifeContextOf = async (playerId: string) =>
    JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(playerId).first<{ life_context: string }>())!.life_context);
  const statusesOf = async (playerId: string, clubTeamId: string) =>
    Object.fromEntries((await listPromises(db, playerId, clubTeamId)).map((p) => [p.type, p.status]));
  const moveTo = (playerId: string, teamId: string) =>
    db.prepare("UPDATE players SET team_id = ? WHERE id = ?").bind(teamId, playerId).run();

  it("truc i slib starého klubu zůstanou doma, jeho sliby se uzavřou jako u odešlého hráče", async () => {
    await db.prepare("UPDATE players SET life_context = ? WHERE id = 'p1'")
      .bind(JSON.stringify({ morale: 61, transferUnrest: unrestWith(PLEDGE_TRANSFER) })).run();
    await promise("p1", "transfer");
    await promise("p1", "minutes", { madeAt: "2026-10-18T10:00:00Z" });

    await moveTo("p1", "B");
    await clearUnrestAfterTransfer(db, "p1", "B");

    expect(await lifeContextOf("p1")).toEqual({ morale: 61 });
    expect(await statusesOf("p1", "A")).toEqual({ transfer: "kept", minutes: "expired" });
    expect((await listPromises(db, "p1", "A")).every((p) => p.resolvedAt)).toBe(true);
    // Nový klub nemá co připomínat ani hlídat.
    expect(await activeTransferPromise(db, "p1")).toBeNull();
  });

  it("odkup z hostování: slib, který dal sám nový klub, platí dál, truc kmenového klubu ne", async () => {
    // p3 patřil klubu B, hostoval v A a trenér A mu slíbil místo v sestavě. Teď ho A koupil do U21.
    await db.prepare("UPDATE players SET life_context = ? WHERE id = 'p3'")
      .bind(JSON.stringify({ morale: 40, transferUnrest: unrestWith(PLEDGE_MINUTES) })).run();
    await promiseInsert(db, { clubTeamId: "B", playerId: "p3", type: "transfer", madeAt: "2026-10-01T10:00:00Z", deadline: "2026-10-31T10:00:00Z" }).run();
    await promiseInsert(db, { clubTeamId: "A", playerId: "p3", type: "minutes", madeAt: PLEDGE_MINUTES.madeAt, deadline: PLEDGE_MINUTES.deadline }).run();

    await moveTo("p3", "A21");
    await clearUnrestAfterTransfer(db, "p3", "A21");

    expect(await lifeContextOf("p3")).toEqual({ morale: 40, transferUnrest: { level: 0, pledge: PLEDGE_MINUTES } });
    expect(await statusesOf("p3", "A")).toEqual({ minutes: "active" });
    expect(await statusesOf("p3", "B")).toEqual({ transfer: "kept" });
  });

  it("slib starého klubu nový klub nepřebere, i když sám slíbil něco jiného", async () => {
    await db.prepare("UPDATE players SET life_context = ? WHERE id = 'p3'")
      .bind(JSON.stringify({ transferUnrest: unrestWith(PLEDGE_TRANSFER) })).run();
    await promiseInsert(db, { clubTeamId: "B", playerId: "p3", type: "transfer", madeAt: PLEDGE_TRANSFER.madeAt, deadline: PLEDGE_TRANSFER.deadline }).run();
    await promiseInsert(db, { clubTeamId: "A", playerId: "p3", type: "minutes", madeAt: "2026-10-22T10:00:00Z", deadline: "2026-11-12T10:00:00Z" }).run();

    await moveTo("p3", "A");
    await clearUnrestAfterTransfer(db, "p3", "A");

    expect(await lifeContextOf("p3")).toEqual({});
    expect(await statusesOf("p3", "B")).toEqual({ transfer: "kept" });
    // Vlastní sliby nového klubu se neuzavírají.
    expect(await statusesOf("p3", "A")).toEqual({ minutes: "active" });
  });

  it("předstírané zranění s trucem končí, skutečné zůstává", async () => {
    await db.prepare("UPDATE players SET life_context = ? WHERE id = 'p1'")
      .bind(JSON.stringify({ transferUnrest: { level: 70, fakeInjuryUsed: true } })).run();
    await db.prepare("INSERT INTO injuries (id, player_id, days_remaining, is_fake) VALUES ('fake', 'p1', 9, 1), ('real', 'p1', 4, 0)").run();

    await moveTo("p1", "B");
    await clearUnrestAfterTransfer(db, "p1", "B");

    const left = await db.prepare("SELECT id FROM injuries WHERE player_id = 'p1'").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["real"]);
  });

  it("hráč bez trucu a slibů: nic se nemění", async () => {
    await db.prepare("UPDATE players SET life_context = ? WHERE id = 'p1'").bind(JSON.stringify({ morale: 55, condition: 90 })).run();
    await moveTo("p1", "B");
    await clearUnrestAfterTransfer(db, "p1", "B");
    expect(await lifeContextOf("p1")).toEqual({ morale: 55, condition: 90 });
  });
});
