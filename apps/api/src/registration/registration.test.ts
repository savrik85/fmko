import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { registrationRouter, hashActivationToken } from "../routes/registration";
import { authRouter } from "../routes/auth";
import { teamsRouter } from "../routes/teams";
import { districtAccess, appointFounder } from "./district-access";
import { createSession, getSession } from "../auth/session";
import { verifyPassword } from "../auth/password";
import type { Bindings } from "../index";

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let adminToken: string;
let memberToken: string;
const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/registration", registrationRouter);
app.route("/auth", authRouter);
app.route("/api/teams", teamsRouter);
async function sql(source: string) {
  for (const statement of source.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
}
function call(path: string, body?: unknown, token?: string) {
  return app.request(path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env);
}
async function request(email = "founder@example.test", district = "Beroun") {
  const res = await call("/api/registration/requests", { name: "Petr Novák", email, district });
  expect(res.status).toBe(201);
  return (await db.prepare("SELECT id FROM league_requests WHERE email = ?").bind(email).first<{ id: string }>())!.id;
}
async function approve(id: string) {
  const res = await call(`/api/registration/admin/requests/${id}/approve`, { dataReady: true }, adminToken);
  expect(res.status).toBe(200);
  return await res.json() as { activationToken: string };
}
async function activate(token: string) {
  const res = await call("/api/registration/activate", { token, password: "BezpecneHeslo1" });
  expect(res.status).toBe(201);
  return await res.json() as { token: string; user: { id: string; email: string } };
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"] });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  await sql(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT, is_admin INTEGER DEFAULT 0);
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, village_id TEXT, name TEXT, league_id TEXT, game_date TEXT, team_type TEXT);
    CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER);
    CREATE TABLE leagues (id TEXT PRIMARY KEY, season_id TEXT);
    CREATE TABLE district_surnames (district TEXT, surname TEXT);
    CREATE TABLE district_sponsors (district TEXT, name TEXT);
    INSERT INTO villages VALUES ('legacy-village', 'Kladno', 'Kladno');
    INSERT INTO teams VALUES ('legacy-team', 'legacy-user', 'legacy-village', 'SK Kladno', NULL, NULL, NULL);`);
  await sql(readFileSync(new URL("../../migrations/0225_district_registration.sql", import.meta.url), "utf8"));
  await sql(readFileSync(new URL("../../migrations/0151_competition_elections.sql", import.meta.url), "utf8"));
  await sql(`CREATE TABLE competition_officials (id TEXT PRIMARY KEY, league_id TEXT, role TEXT, team_id TEXT, season_number INTEGER, elected_game_date TEXT, status TEXT DEFAULT 'active');
    CREATE UNIQUE INDEX official_active ON competition_officials(league_id, role, season_number) WHERE status IN ('active','suspended');`);
  adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
  memberToken = await createSession(env.SESSION_KV, "member", "member@example.test", null);
});
afterAll(async () => { await mf?.dispose(); });
beforeEach(async () => {
  await sql(`DELETE FROM league_requests; DELETE FROM users; DELETE FROM competition_officials; DELETE FROM competition_elections;
    DELETE FROM teams WHERE id <> 'legacy-team'; DELETE FROM leagues; DELETE FROM seasons;
    DELETE FROM district_surnames; DELETE FROM district_sponsors;
    DELETE FROM district_registrations WHERE district NOT IN ('Praha','Prachatice','Kladno');
    INSERT INTO users (id,email,password_hash,is_admin) VALUES ('admin','admin@example.test','unused',1), ('member','member@example.test','unused',0);
    INSERT OR IGNORE INTO villages VALUES ('beroun-village','Beroun','Beroun'), ('praha-village','Praha','Praha');
    INSERT INTO district_surnames VALUES ('Beroun','Novák'), ('Praha','Novotný');
    INSERT INTO district_sponsors VALUES ('Beroun','Místní autodílna'), ('Praha','Místní sponzor');`);
});

describe("registrace okresu", () => {
  it("nabízí všech 77 okresů včetně těch bez herních dat a zachová rozehrané okresy", async () => {
    const res = await call("/api/registration/districts");
    const data = await res.json() as Array<{ name: string; status: string; founderFree: boolean }>;
    expect(data).toHaveLength(77);
    expect(data).toContainEqual({ name: "Praha-východ", status: "available", founderFree: false });
    expect(data).toContainEqual({ name: "Kladno", status: "ready", founderFree: false });
    expect(data).toContainEqual({ name: "Prachatice", status: "ready", founderFree: true });
  });
  it("uloží tři údaje bez založení účtu či přihlášení a zarezervuje zakladatele", async () => {
    const id = await request();
    expect(await db.prepare("SELECT id FROM users WHERE email = 'founder@example.test'").first()).toBeNull();
    expect(await db.prepare("SELECT status, founder_request_id FROM district_registrations WHERE district='Beroun'").first()).toEqual({ status: "preparing", founder_request_id: id });
  });
  it("duplicita e-mailu nepřepíše žádost a nevytvoří nový okres", async () => {
    await request();
    const res = await call("/api/registration/requests", { name: "Někdo jiný", email: " FOUNDER@example.test ", district: "Benešov" });
    expect(res.status).toBe(409);
    expect(await db.prepare("SELECT district FROM district_registrations WHERE district = 'Benešov'").first()).toBeNull();
    expect(await db.prepare("SELECT name FROM league_requests").first()).toEqual({ name: "Petr Novák" });
  });
  it("další zájemce stejného okresu nepřebere zakladateli rezervaci", async () => {
    const founder = await request(); await request("friend@example.test");
    expect(await db.prepare("SELECT founder_request_id FROM district_registrations WHERE district='Beroun'").first()).toEqual({ founder_request_id: founder });
  });
  it("odmítne neplatné vstupy i starou registraci bez schváleného okresu", async () => {
    for (const body of [null, {}, { name: "Petr", email: "ne-email", district: "Praha" }, { name: "Petr", email: "a@b.cz", district: "Mars" }]) {
      expect((await call("/api/registration/requests", body)).status).toBe(400);
    }
    expect((await call("/auth/register", { email: "a@b.cz", password: "Heslo123" })).status).toBe(403);
  });
  it("seznam kontaktů a schválení jsou dostupné jen správci", async () => {
    const id = await request();
    expect((await call("/api/registration/admin/requests")).status).toBe(401);
    expect((await call("/api/registration/admin/requests", undefined, memberToken)).status).toBe(403);
    expect((await call(`/api/registration/admin/requests/${id}/approve`, { dataReady: true }, memberToken)).status).toBe(403);
  });
  it("bez potvrzení a místních dat správce okres neotevře", async () => {
    const id = await request();
    expect((await call(`/api/registration/admin/requests/${id}/approve`, {}, adminToken)).status).toBe(400);
    await sql("DELETE FROM district_sponsors WHERE district='Beroun'");
    expect((await call(`/api/registration/admin/requests/${id}/approve`, { dataReady: true }, adminToken)).status).toBe(409);
    expect(await districtAccess(db, "Beroun", "member")).toContain("připravujeme");
  });
  it("aktivace spotřebuje hashovaný token jednou, uloží heslo a omezí účet na jeho okres", async () => {
    const id = await request(); const { activationToken } = await approve(id);
    expect((await db.prepare("SELECT activation_hash FROM league_requests WHERE id=?").bind(id).first())?.activation_hash).toBe(await hashActivationToken(activationToken));
    const result = await activate(activationToken);
    const user = await db.prepare("SELECT password_hash, registration_district FROM users WHERE id = ?").bind(result.user.id).first<{ password_hash: string; registration_district: string }>();
    expect(user?.registration_district).toBe("Beroun"); expect(await verifyPassword("BezpecneHeslo1", user!.password_hash)).toBe(true);
    expect((await getSession(env.SESSION_KV, result.token))?.userId).toBe(result.user.id);
    expect(await districtAccess(db, "Beroun", result.user.id)).toBeNull();
    expect(await districtAccess(db, "Praha", result.user.id)).toContain("vybraném okrese");
    expect((await call("/api/registration/activate", { token: activationToken, password: "BezpecneHeslo1" })).status).toBe(410);
  });
  it("expirace i nové vygenerování zneplatní starý odkaz", async () => {
    const id = await request(); const first = await approve(id); const second = await approve(id);
    expect((await call("/api/registration/activation", { token: first.activationToken })).status).toBe(410);
    await db.prepare("UPDATE league_requests SET activation_expires_at = '2000-01-01' WHERE id = ?").bind(id).run();
    expect((await call("/api/registration/activate", { token: second.activationToken, password: "BezpecneHeslo1" })).status).toBe(410);
  });
  it("souběžná aktivace založí právě jeden účet a vrátí jen jednu session", async () => {
    const id = await request(); const { activationToken } = await approve(id);
    const results = await Promise.all([1, 2].map(() => call("/api/registration/activate", { token: activationToken, password: "BezpecneHeslo1" })));
    expect(results.map(r => r.status).sort()).toEqual([201, 410]);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE email='founder@example.test'").first())?.count).toBe(1);
  });
  it("přímé API založení týmu odmítne nepřipravený i jiný okres", async () => {
    await request();
    expect((await call("/api/teams", { name: "SK Test", villageId: "beroun-village" }, memberToken)).status).toBe(403);
    const row = await db.prepare("SELECT id FROM league_requests").first<{ id: string }>();
    const { activationToken } = await approve(row!.id); const founder = await activate(activationToken);
    expect((await call("/api/teams", { name: "SK Test", villageId: "praha-village" }, founder.token)).status).toBe(403);
  });
  it("kamarádi počkají na první klub; zakladatel dostane právě jeden mandát", async () => {
    const id = await request(); const { activationToken } = await approve(id); const founder = await activate(activationToken);
    expect(await districtAccess(db, "Beroun", "member")).toContain("Nejprve");
    await sql("INSERT INTO seasons VALUES ('s1', 1); INSERT INTO leagues VALUES ('l1','s1');");
    await db.prepare("INSERT INTO teams (id,user_id,village_id,league_id,game_date) VALUES ('t1',?,'beroun-village','l1','2026-09-26')").bind(founder.user.id).run();
    await appointFounder(db, founder.user.id, "t1"); await appointFounder(db, founder.user.id, "t1");
    expect((await db.prepare("SELECT role, team_id FROM competition_officials").all()).results).toEqual([{ role: "predseda", team_id: "t1" }]);
    expect(await districtAccess(db, "Beroun", "member")).toBeNull();
    await sql("UPDATE competition_officials SET status='resigned'");
    await appointFounder(db, founder.user.id, "t1");
    expect((await db.prepare("SELECT status FROM competition_officials").first())?.status).toBe("resigned");
  });
  it("připojení do již připravené ligy nepřidělí předsednictví", async () => {
    const id = await request("join@example.test", "Praha"); const { activationToken } = await approve(id); const member = await activate(activationToken);
    const info = await db.prepare("SELECT founder_request_id FROM district_registrations WHERE district='Praha'").first();
    expect(info?.founder_request_id).toBeNull();
    await appointFounder(db, member.user.id, "any-team");
    expect((await db.prepare("SELECT COUNT(*) AS count FROM competition_officials").first())?.count).toBe(0);
  });
});

describe("okamžitá registrace do připraveného okresu", () => {
  const join = (email: string, district = "Beroun", password = "BezpecneHeslo1") =>
    call("/api/registration/join", { name: "Jan Hráč", email, password, district });
  async function openBeroun() { await sql("INSERT INTO district_registrations (district, status, ready_at) VALUES ('Beroun','ready','2026-09-29T00:00:00Z')"); }

  it("nepřipravený okres pošle na žádost a nic nezaloží", async () => {
    const res = await join("a@example.test");
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe("district_not_ready");
    expect(await db.prepare("SELECT 1 FROM users WHERE email='a@example.test'").first()).toBeNull();
  });
  it("založí účet se session a prvního hráče prázdného okresu udělá zakladatelem", async () => {
    await openBeroun();
    const res = await join("first@example.test");
    expect(res.status).toBe(201);
    const body = await res.json() as { token: string; user: { id: string } };
    expect((await getSession(env.SESSION_KV, body.token))?.userId).toBe(body.user.id);
    const user = await db.prepare("SELECT password_hash, registration_district FROM users WHERE id = ?").bind(body.user.id).first<{ password_hash: string; registration_district: string }>();
    expect(user?.registration_district).toBe("Beroun");
    expect(await verifyPassword("BezpecneHeslo1", user!.password_hash)).toBe(true);
    const founder = await db.prepare("SELECT r.user_id FROM district_registrations d JOIN league_requests r ON r.id = d.founder_request_id WHERE d.district='Beroun'").first();
    expect(founder?.user_id).toBe(body.user.id);
    expect(await districtAccess(db, "Beroun", body.user.id)).toBeNull();
    expect(await districtAccess(db, "Beroun", "member")).toContain("Nejprve");
    expect((await join("second@example.test")).status).toBe(201);
    expect((await db.prepare("SELECT r.email FROM district_registrations d JOIN league_requests r ON r.id = d.founder_request_id WHERE d.district='Beroun'").first())?.email).toBe("first@example.test");
  });
  it("zakladatel, který klub nezaloží, blokuje okres jen dvě hodiny", async () => {
    await openBeroun();
    expect((await join("first@example.test")).status).toBe(201);
    await sql("UPDATE league_requests SET activated_at = '2000-01-01T00:00:00Z'");
    expect(await districtAccess(db, "Beroun", "member")).toBeNull();
  });
  it("rozehraný okres zakladatele nedostane", async () => {
    await openBeroun();
    await sql("INSERT INTO teams (id,user_id,village_id,name) VALUES ('human-team','someone','beroun-village','SK Beroun')");
    expect((await join("late@example.test")).status).toBe(201);
    expect((await db.prepare("SELECT founder_request_id FROM district_registrations WHERE district='Beroun'").first())?.founder_request_id).toBeNull();
  });
  it("odmítne slabé heslo, existující účet i žádost vedenou pro jiný okres", async () => {
    await openBeroun();
    expect((await join("weak@example.test", "Beroun", "heslo")).status).toBe(400);
    expect((await join("member@example.test")).status).toBe(409);
    await request("other@example.test", "Benešov");
    expect((await join("other@example.test")).status).toBe(409);
  });
  it("dřívější žádost se stejným e-mailem převezme i s rezervací zakladatele", async () => {
    const id = await request("early@example.test");
    await sql("UPDATE district_registrations SET status = 'ready' WHERE district = 'Beroun'");
    const res = await join("early@example.test");
    expect(res.status).toBe(201);
    expect(await db.prepare("SELECT status, user_id IS NOT NULL AS has_user FROM league_requests WHERE id = ?").bind(id).first()).toEqual({ status: "activated", has_user: 1 });
    expect((await db.prepare("SELECT COUNT(*) AS count FROM league_requests").first())?.count).toBe(1);
  });
  it("migrace otevře Strakonice, Písek a Český Krumlov", async () => {
    await sql(readFileSync(new URL("../../migrations/0231_open_south_districts.sql", import.meta.url), "utf8"));
    const rows = (await db.prepare("SELECT district, status FROM district_registrations WHERE district IN ('Strakonice','Písek','Český Krumlov') ORDER BY district").all()).results;
    expect(rows).toEqual([{ district: "Písek", status: "ready" }, { district: "Strakonice", status: "ready" }, { district: "Český Krumlov", status: "ready" }]);
  });
});
