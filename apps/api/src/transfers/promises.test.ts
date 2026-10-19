import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import {
  activePromisesForClub, activeTransferPromise, listPromises, promiseInsert, promiseText, resolvePromises, settleDepartedPromises,
} from "./promises";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["player_promises", "players", "teams"]) await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, parent_team_id TEXT)").run();
  await db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, life_context TEXT)").run();
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
