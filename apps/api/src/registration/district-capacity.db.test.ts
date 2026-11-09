/**
 * Plný a ručně zavřený okres na skutečné D1 (Miniflare, všechny migrace): registrace
 * do něj se odmítne předem, okres ale zůstává v seznamech, a účet zamčený na plný okres
 * si smí vybrat jiný otevřený.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import { LANDING_CACHE_KEY, publicLandingRouter } from "../routes/public-landing";
import { registrationRouter } from "../routes/registration";
import { villagesRouter } from "../routes/villages";
import { districtAccess } from "./district-access";
import { districtCapacity, listOpenDistricts } from "./district-capacity";

const FULL = "Prachatice";
const OPEN = "Strakonice";
const EMPTY = "Písek";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/registration", registrationRouter);
app.route("/api/public", publicLandingRouter);
app.route("/api/villages", villagesRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let adminToken: string;
let memberToken: string;

function call(path: string, body?: unknown, token?: string) {
  return app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, env);
}

async function villageOf(district: string, offset: number): Promise<string> {
  const row = await db.prepare("SELECT id FROM villages WHERE district = ? ORDER BY id LIMIT 1 OFFSET ?").bind(district, offset).first<{ id: string }>();
  return row!.id;
}

async function addTeam(id: string, userId: string, district: string, offset: number, leagueId: string): Promise<void> {
  if (userId !== "ai") {
    await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(userId, `${userId}@example.test`).run();
  }
  await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type) VALUES (?, ?, ?, ?, 50000, ?, 'senior')")
    .bind(id, userId, await villageOf(district, offset), `Klub ${id}`, leagueId).run();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  await db.batch([
    // Migrace zakládají vlastní sezónu; okresy testu hrají v té nejnovější.
    db.prepare("UPDATE seasons SET status = 'finished'"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 99, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('full-top', 's-1', ?, 'Okresní přebor', 'okresni_prebor')").bind(FULL),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('full-low', 's-1', ?, 'III. třída', 'okresni_soutez')").bind(FULL),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('open-top', 's-1', ?, 'Okresní přebor', 'okresni_prebor')").bind(OPEN),
  ]);
  await addTeam("full-1", "h-1", FULL, 0, "full-top");
  await addTeam("full-2", "h-2", FULL, 1, "full-top");
  await addTeam("full-3", "h-3", FULL, 2, "full-low");
  await addTeam("open-1", "h-4", OPEN, 0, "open-top");
  await addTeam("open-2", "h-5", OPEN, 1, "open-top");
  await addTeam("open-ai", "ai", OPEN, 2, "open-top");
  await db.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('admin', 'admin@example.test', 'x', 1), ('member', 'member@example.test', 'x', 0)").run();
  adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
  memberToken = await createSession(env.SESSION_KV, "member", "member@example.test", null);
});

afterAll(async () => { await mf?.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM league_requests"),
    db.prepare("DELETE FROM users WHERE email = 'jan@example.test'"),
    db.prepare("UPDATE users SET registration_district = NULL WHERE id = 'member'"),
    db.prepare("UPDATE district_registrations SET registration_closed = 0, founder_request_id = NULL"),
  ]);
  await env.CACHE_KV.delete(LANDING_CACHE_KEY);
});

describe("kapacita okresu", () => {
  it("okres bez AI klubů v přeboru i III. třídě je plný, okres s AI klubem má volné místo", async () => {
    expect(await districtCapacity(db, FULL)).toEqual({ freeSlots: 0, full: true, manuallyClosed: false });
    expect(await districtCapacity(db, OPEN)).toEqual({ freeSlots: 1, full: false, manuallyClosed: false });
    expect((await districtCapacity(db, EMPTY)).full).toBe(false);
  });

  it("otevřené okresy řadí podle počtu lidských manažerů a plný vynechá", async () => {
    const open = await listOpenDistricts(db);
    expect(open.map((d) => d.name)).not.toContain(FULL);
    expect(open[0]).toMatchObject({ name: OPEN, managers: 2, freeSlots: 1 });
  });
});

describe("registrace do plného okresu", () => {
  it("seznam okresů plný okres nechá, jen ho označí a vrátí počet volných míst", async () => {
    const list = await (await call("/api/registration/districts")).json() as Array<{ name: string; status: string; full: boolean; freeSlots: number | null; managers: number }>;
    expect(list).toHaveLength(77);
    expect(list.find((d) => d.name === FULL)).toMatchObject({ status: "ready", full: true, freeSlots: 0, managers: 3 });
    expect(list.find((d) => d.name === OPEN)).toMatchObject({ status: "ready", full: false, freeSlots: 1, managers: 2 });
  });

  it("join odmítne předem s vlastním kódem, hláškou a nabídkou otevřených okresů a účet nezaloží", async () => {
    const res = await call("/api/registration/join", { name: "Jan Novák", email: "jan@example.test", password: "BezpecneHeslo1", district: FULL });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; message: string; openDistricts: Array<{ name: string }> };
    expect(body.error).toBe("district_full");
    expect(body.message).toBe("Liga v okrese Prachatice je plná.");
    expect(body.openDistricts[0].name).toBe(OPEN);
    expect(await db.prepare("SELECT 1 FROM users WHERE email = 'jan@example.test'").first()).toBeNull();
  });

  it("žádost do plného okresu je čekací listina a nebrání pozdější registraci jinam", async () => {
    const waiting = await call("/api/registration/requests", { name: "Jan Novák", email: "jan@example.test", district: FULL });
    expect(waiting.status).toBe(201);
    expect(await waiting.json()).toEqual({ accepted: true, waitlist: true });
    const row = await db.prepare("SELECT district, status FROM league_requests WHERE email = 'jan@example.test'").first();
    expect(row).toEqual({ district: FULL, status: "pending" });
    // Čekací listina nesmí zarezervovat zakladatele plného okresu.
    expect((await db.prepare("SELECT founder_request_id FROM district_registrations WHERE district = ?").bind(FULL).first<{ founder_request_id: string | null }>())?.founder_request_id).toBeNull();

    const joined = await call("/api/registration/join", { name: "Jan Novák", email: "jan@example.test", password: "BezpecneHeslo1", district: OPEN });
    expect(joined.status).toBe(201);
    expect(await db.prepare("SELECT district, status FROM league_requests WHERE email = 'jan@example.test'").first()).toEqual({ district: OPEN, status: "activated" });
    expect((await db.prepare("SELECT registration_district FROM users WHERE email = 'jan@example.test'").first<{ registration_district: string }>())?.registration_district).toBe(OPEN);
  });

  it("úvodní stránka plný okres ukazuje dál, s příznakem plno", async () => {
    const data = await (await call("/api/public/landing")).json() as { stats: { districts: number; season: number | null }; districts: Array<{ name: string; full: boolean; managers: number; freeSlots: number | null }> };
    // Číslo hrané sezóny pro texty webu (registrace, pozvánka), ať ho nemají napevno.
    expect(data.stats.season).toBe(99);
    expect(data.districts.find((d) => d.name === FULL)).toMatchObject({ full: true, managers: 3, freeSlots: 0 });
    expect(data.districts.find((d) => d.name === OPEN)).toMatchObject({ full: false, freeSlots: 1 });
    expect(data.stats.districts).toBe(data.districts.length);
  });
});

describe("ruční zavření okresu", () => {
  it("smí jen správce, vrací stav před a po a registraci hned zastaví; jde vrátit", async () => {
    expect((await call("/api/registration/admin/districts/close", { district: OPEN, closed: 1 }, memberToken)).status).toBe(403);
    expect((await call("/api/registration/admin/districts/close", { district: OPEN }, adminToken)).status).toBe(400);
    expect((await call("/api/registration/admin/districts/close", { district: "Neexistuje", closed: 1 }, adminToken)).status).toBe(404);

    // Cache úvodní stránky se zavřením smaže.
    await call("/api/public/landing");
    const closed = await call("/api/registration/admin/districts/close", { district: OPEN, closed: 1 }, adminToken);
    expect(closed.status).toBe(200);
    expect(await closed.json()).toEqual({
      district: OPEN,
      before: { status: "ready", registrationClosed: false },
      after: { status: "ready", registrationClosed: true, full: true, freeSlots: 0 },
    });
    expect(await districtCapacity(db, OPEN)).toEqual({ freeSlots: 0, full: true, manuallyClosed: true });
    const landing = await (await call("/api/public/landing")).json() as { districts: Array<{ name: string; full: boolean }> };
    expect(landing.districts.find((d) => d.name === OPEN)?.full).toBe(true);
    const stats = await (await call("/api/villages/stats")).json() as { fullDistricts: string[] };
    expect(stats.fullDistricts).toEqual(expect.arrayContaining([FULL, OPEN]));

    const res = await call("/api/registration/join", { name: "Jan Novák", email: "jan@example.test", password: "BezpecneHeslo1", district: OPEN });
    expect(res.status).toBe(409);
    expect((await res.json() as { message: string }).message).toBe("Liga v okrese Strakonice je plná.");

    const reopened = await call("/api/registration/admin/districts/close?district=Strakonice&closed=0", {}, adminToken);
    expect((await reopened.json() as { after: { registrationClosed: boolean; full: boolean } }).after).toMatchObject({ registrationClosed: false, full: false });
    expect((await call("/api/registration/join", { name: "Jan Novák", email: "jan@example.test", password: "BezpecneHeslo1", district: OPEN })).status).toBe(201);
  });
});

describe("účet zamčený na okres", () => {
  it("na plný okres: klub v něm nezaloží, jiný otevřený okres si vybrat smí", async () => {
    await db.prepare("UPDATE users SET registration_district = ? WHERE id = 'member'").bind(FULL).run();
    expect(await districtAccess(db, FULL, "member")).toContain("Liga v okrese Prachatice je plná.");
    expect(await districtAccess(db, OPEN, "member")).toBeNull();
    const access = await (await call("/api/registration/access", undefined, memberToken)).json() as { district: string; districts: string[]; homeFull: boolean };
    expect(access.homeFull).toBe(true);
    expect(access.districts).not.toContain(FULL);
    // Nejživější otevřený okres je první.
    expect(access.districts[0]).toBe(OPEN);
  });

  it("na otevřený okres: zůstává zamčený na něj", async () => {
    await db.prepare("UPDATE users SET registration_district = ? WHERE id = 'member'").bind(OPEN).run();
    expect(await districtAccess(db, OPEN, "member")).toBeNull();
    expect(await districtAccess(db, EMPTY, "member")).toBe("Svůj tým můžeš založit pouze ve vybraném okrese.");
    const access = await (await call("/api/registration/access", undefined, memberToken)).json() as { districts: string[]; homeFull: boolean };
    expect(access).toMatchObject({ districts: [OPEN], homeFull: false });
  });
});
