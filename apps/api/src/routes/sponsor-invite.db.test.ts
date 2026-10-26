/**
 * Pozvání majitele firmy na domácí zápas přes routu POST /teams/:teamId/sponsor-owners/:sponsorId/invite
 * na skutečné D1 (Miniflare, všechny migrace). Zamyká chování routy, ať se po přesunu logiky do
 * služby sdílené s AI trenérem (sponsors/invitations.ts) nic nezmění: odpověď, zápis pozvání,
 * dárek z rozpočtu, náklonnost, VIP lóže v šanci a všechny chybové stavy.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../index";
import { DEFAULT_FAVOR, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost } from "../sponsors/favor-math";
import { sponsorsRouter } from "./sponsors";

let mf: Miniflare;
let db: D1Database;
let env: Bindings;

const TEAM = "human";
const PATRIOT = 91001;
const BUSINESSMAN = 91002;
const ELSEWHERE = 91003;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
/** Nejbližší domácí zápas za 3 dny, další za 6 dní (zve se jen na nejbližší). */
const NEXT_MATCH_AT = `${day(3)}T16:00:00.000Z`;
const LATER_MATCH_AT = `${day(6)}T16:00:00.000Z`;

function invite(sponsorId: number | string, body: unknown, token: string | null = "tok-human"): Promise<Response> {
  return Promise.resolve(sponsorsRouter.request(
    `/teams/${TEAM}/sponsor-owners/${sponsorId}/invite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    },
    env,
  ));
}

async function favorOf(sponsorId: number): Promise<number> {
  const row = await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?").bind(sponsorId, TEAM)
    .first<{ favor: number }>();
  return row?.favor ?? DEFAULT_FAVOR;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(TEAM).first<{ budget: number }>())?.budget ?? NaN;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV"],
  });
  db = await mf.getD1Database("DB");
  const sessions = (await mf.getKVNamespace("SESSION_KV")) as unknown as KVNamespace;
  env = { DB: db, SESSION_KV: sessions } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  const now = new Date().toISOString();
  await sessions.put("session:tok-human", JSON.stringify({ userId: "u-human", email: "h@x", teamId: TEAM, createdAt: now, renewedAt: now }));

  const village = (id: string, district: string) =>
    db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES (?, ?, ?, 'JC', 900, 'village', 49.0, 14.0)")
      .bind(id, `Obec ${id}`, district);
  const team = (id: string, userId: string, villageId: string, name: string) =>
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES (?, ?, ?, ?, 50000, 50, 'lg-inv', ?)")
      .bind(id, userId, villageId, name, `${day(0)}T05:00:00.000Z`);
  const firm = (id: number, name: string, type: string, district: string) =>
    db.prepare(
      `INSERT INTO district_sponsors (id, district, name, type, monthly_min, monthly_max, win_bonus_min, win_bonus_max)
       VALUES (?, ?, ?, ?, 2000, 8000, 100, 500)`,
    ).bind(id, district, name, type);
  const owner = (sponsorId: number, first: string, last: string, personality: string) =>
    db.prepare("INSERT INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality) VALUES (?, ?, ?, 50, '{}', ?)")
      .bind(sponsorId, first, last, personality);
  const fixture = (id: string, home: string, at: string) => [
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, 'lg-inv', 3, 5, 'thursday', ?, 'scheduled')")
      .bind(`cal-${id}`, at),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES (?, 'lg-inv', ?, ?, 'away', 'scheduled')")
      .bind(id, `cal-${id}`, home),
  ];
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'h@x', 'x'), ('u-rival', 'r@x', 'x'), ('u-away', 'a@x', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES ('lg-inv', 'season-3', 'Pozvánkov', 'Okresní přebor', 'okresni_prebor')"),
    village("v-human", "Pozvánkov"), village("v-rival", "Pozvánkov"), village("v-away", "Pozvánkov"),
    team(TEAM, "u-human", "v-human", "Slavoj Pozvánkov"), team("rival", "u-rival", "v-rival", "Sokol Soused"),
    team("away", "u-away", "v-away", "Hosté"),
    // Lóže úrovně 2 na stojících tribunách: zvedne šanci, že majitel přijme.
    db.prepare("INSERT INTO stadiums (id, team_id, stands, vip_box) VALUES ('st-human', ?, 1, 2)").bind(TEAM),
    firm(PATRIOT, "Pekárna Kubát", "bakery", "Pozvánkov"), firm(BUSINESSMAN, "Pivovar Pozvánkov", "brewery", "Pozvánkov"),
    firm(ELSEWHERE, "Pila Jinde", "woodwork", "Jinde"),
    owner(PATRIOT, "Karel", "Kubát", "patriot"), owner(BUSINESSMAN, "Josef", "Sládek", "businessman"), owner(ELSEWHERE, "Petr", "Dřevo", "fan"),
    ...fixture("m-next", TEAM, NEXT_MATCH_AT), ...fixture("m-later", TEAM, LATER_MATCH_AT), ...fixture("m-rival", "rival", NEXT_MATCH_AT),
  ]);
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM sponsor_invitations"),
    db.prepare("DELETE FROM sponsor_team_favor"),
    db.prepare("DELETE FROM sponsor_favor_log"),
    db.prepare("DELETE FROM transactions"),
    db.prepare("UPDATE teams SET budget = 50000"),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST .../sponsor-owners/:sponsorId/invite", () => {
  it("přijaté pozvání: odpověď, zápis pozvání, dárek z rozpočtu, náklonnost; šance počítá s lóží", async () => {
    // Šum −0,1, hod 0: majitel přijme.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = await invite(PATRIOT, { matchId: "m-next" });

    expect(res.status).toBe(200);
    const giftCost = invitationGiftCost(DEFAULT_FAVOR);
    const probability = invitationAcceptance({ favor: DEFAULT_FAVOR, personality: "patriot", recentLosses: 0, noise: -0.1, vipBoxLevel: 2 });
    expect(await res.json()).toEqual({
      status: "accepted", giftCost, probability: Math.round(probability * 100) / 100, rejectReason: null,
      favor: DEFAULT_FAVOR + invitationAcceptedDelta("patriot"),
    });
    const row = await db.prepare("SELECT team_id, match_id, match_day, status, gift_cost, reject_reason FROM sponsor_invitations WHERE sponsor_id = ?")
      .bind(PATRIOT).first();
    expect(row).toEqual({ team_id: TEAM, match_id: "m-next", match_day: NEXT_MATCH_AT.slice(0, 10), status: "accepted", gift_cost: giftCost, reject_reason: null });
    expect(await budget()).toBe(50000 - giftCost);
    const tx = await db.prepare("SELECT type, amount, description FROM transactions WHERE team_id = ?").bind(TEAM).all();
    expect(tx.results).toEqual([{ type: "event", amount: -giftCost, description: "Pozvání Karel Kubát na zápas" }]);
    expect(await favorOf(PATRIOT)).toBe(DEFAULT_FAVOR + invitationAcceptedDelta("patriot"));
  }, 60_000);

  it("odmítnuté pozvání: důvod podle povahy, dárek zaplacený, náklonnost beze změny", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const res = await invite(BUSINESSMAN, { matchId: "m-next" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "declined", rejectReason: "Pošlete mi termíny na další měsíc, ozvu se.", favor: DEFAULT_FAVOR });
    expect(await budget()).toBe(50000 - invitationGiftCost(DEFAULT_FAVOR));
    const row = await db.prepare("SELECT status, reject_reason FROM sponsor_invitations WHERE sponsor_id = ?").bind(BUSINESSMAN).first();
    expect(row).toEqual({ status: "declined", reject_reason: "Pošlete mi termíny na další měsíc, ozvu se." });
  }, 60_000);

  it("chybové stavy zůstávají stejné", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(await invite(PATRIOT, {}).then(async (r) => [r.status, await r.json()]))
      .toEqual([400, { error: "Chybí sponzor nebo zápas" }]);
    expect(await invite("abc", { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([400, { error: "Chybí sponzor nebo zápas" }]);
    expect(await invite(99999, { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([404, { error: "Sponzor nenalezen" }]);
    expect(await invite(ELSEWHERE, { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([400, { error: "Zvát jde jen firmy z vlastního okresu" }]);
    expect(await invite(PATRIOT, { matchId: "m-later" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([400, { error: "Zvát jde jen na nejbližší domácí zápas" }]);
    expect(await invite(PATRIOT, { matchId: "m-next" }, null).then(async (r) => [r.status, await r.json()]))
      .toEqual([401, { error: "Nepřihlášen" }]);

    // Druhé pozvání stejného majitele na stejný zápas.
    expect((await invite(PATRIOT, { matchId: "m-next" })).status).toBe(200);
    expect(await invite(PATRIOT, { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([409, { error: "Tohohle majitele už na ten zápas zvát nejde" }]);

    // Majitel ten den už přijal pozvání jiného klubu.
    await db.prepare(
      "INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost) VALUES ('si-rival', ?, 'rival', 'm-rival', ?, 'accepted', 600)",
    ).bind(BUSINESSMAN, NEXT_MATCH_AT.slice(0, 10)).run();
    expect(await invite(BUSINESSMAN, { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([409, { error: "Majitel už ten den přijal pozvání jiného klubu" }]);
    expect(await budget()).toBe(50000 - invitationGiftCost(DEFAULT_FAVOR));
  }, 60_000);

  it("na dárek nejsou peníze: 400 a nic se nezapíše", async () => {
    await db.prepare("UPDATE teams SET budget = 100 WHERE id = ?").bind(TEAM).run();
    expect(await invite(PATRIOT, { matchId: "m-next" }).then(async (r) => [r.status, await r.json()]))
      .toEqual([400, { error: "Na dárek nemáš peníze" }]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM sponsor_invitations").first<{ n: number }>())?.n).toBe(0);
  }, 60_000);
});
