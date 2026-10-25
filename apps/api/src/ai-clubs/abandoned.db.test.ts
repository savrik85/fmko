/**
 * Opuštěné kluby, návrat vlastníka a nová registrace přes AI klub na skutečné D1
 * (Miniflare, všechny migrace, skutečná routa POST /api/teams).
 *
 * - klub, jehož vlastník je 45 dní neaktivní, převezme AI trenér (44 dní ještě ne),
 *   propojení klubů téhož vlastníka zůstává,
 * - nováček dostane přednostně původní AI klub, převzatý lidský až po 90 dnech nečinnosti,
 * - přepsání AI klubu uklidí všechno nové (zaměstnanci zpět do poolu, nabídky, inzeráty,
 *   poptávky, přáteláky, deník AI trenéra) a nesmaže hráče, kterého koupil jiný klub,
 * - bývalý vlastník se ke klubu vrátí i se svým trenérem.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { teamsRouter } from "../routes/teams";
import { createSession, getSession } from "../auth/session";
import { resolveDistrictSlot } from "../league/district-leagues";
import { findAbandonedClubs, isTakeoverEnabled, runAbandonedClubTakeover, takeOverAbandonedClub } from "./abandoned";
import { pickOverwritableAiTeam } from "./overwrite";
import { findReclaimableClub } from "./reclaim";
import type { Bindings } from "../index";

const DISTRICT = "Prachatice";
const DAY_MS = 86_400_000;
const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/teams", teamsRouter);

let db: D1Database;
let env: Bindings;

// Založení týmu pouští práci na pozadí, která doběhne až po odpovědi. Instance se proto
// ruší až na konci souboru (stejně jako v league/district-leagues.db.test.ts).
const instances: Miniflare[] = [];
afterAll(async () => {
  for (const instance of instances) await instance.dispose();
});

async function freshDb(): Promise<void> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  instances.push(mf);
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  // Na produkci tyhle sloupce jsou (přidané ručně), v migracích chybí.
  await db.exec("ALTER TABLE users ADD COLUMN last_activity_at TEXT");
  await db.exec("ALTER TABLE teams ADD COLUMN training_days TEXT");
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

async function addUser(userId: string, activeDaysAgo: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(userId, `${userId}@example.test`).run();
  await db.prepare("UPDATE users SET last_activity_at = ? WHERE id = ?").bind(daysAgo(activeDaysAgo), userId).run();
}

async function districtVillages(): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM villages WHERE district = ? ORDER BY id").bind(DISTRICT).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

async function freeVillage(): Promise<string> {
  const row = await db.prepare(
    "SELECT id FROM villages WHERE district = ? AND id NOT IN (SELECT village_id FROM teams) ORDER BY id LIMIT 1",
  ).bind(DISTRICT).first<{ id: string }>();
  return row!.id;
}

async function createTeam(userId: string, villageId: string, name: string) {
  await addUser(userId, 0);
  const token = await createSession(env.SESSION_KV, userId, `${userId}@example.test`, null);
  const res = await app.request("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ villageId, name, managerName: `Trenér ${name}`, managerBackstory: "hospodsky" }),
  }, env);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

/** Založí přebor zakladatelem a vrátí id ligy, zakladatelova klubu a AI klubů. */
async function foundLeague(): Promise<{ leagueId: string; founderTeam: string; aiTeams: string[] }> {
  const villages = await districtVillages();
  const founder = await createTeam("founder", villages[0], "SK Zakladatel");
  expect(founder.status).toBe(201);
  const leagueId = founder.body.leagueId as string;
  const ai = await db.prepare("SELECT id FROM teams WHERE league_id = ? AND user_id = 'ai' ORDER BY id").bind(leagueId).all<{ id: string }>();
  return { leagueId, founderTeam: founder.body.id as string, aiTeams: ai.results.map((r) => r.id) };
}

/** Udělá z AI klubu lidský (i s U21 a trenérem), vlastník byl naposledy aktivní před `activeDaysAgo` dny. */
async function makeHuman(teamId: string, userId: string, activeDaysAgo: number, coachName = `Trenér ${userId}`): Promise<void> {
  await addUser(userId, activeDaysAgo);
  await db.batch([
    db.prepare("UPDATE teams SET user_id = ? WHERE id = ? OR parent_team_id = ?").bind(userId, teamId, teamId),
    db.prepare("DELETE FROM managers WHERE team_id = ?").bind(teamId),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar) VALUES (?, ?, ?, ?, 'hospodsky', '{}')")
      .bind(`coach-${userId}`, userId, teamId, coachName),
  ]);
}

/** Moduly převzetí, návratu a přepsání: žádný jejich krok nesmí tiše spadnout (chyby jen logují). */
const WATCHED_MODULES = ["abandoned-clubs", "reclaim-club", "owner-activity", "ai-club-overwrite", "remove-player", "complete-club", "ai-coach-profile", "ai-manager"];

async function withLogs<T>(fn: () => Promise<T>): Promise<{ result: T; problems: string[] }> {
  const logged: string[] = [];
  const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg: unknown) => { logged.push(String(msg)); });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((msg: unknown) => { logged.push(String(msg)); });
  try {
    const result = await fn();
    return { result, problems: logged.filter((l) => WATCHED_MODULES.some((m) => l.includes(`"mod":"${m}"`))) };
  } finally {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

async function messagesOf(teamId: string): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ?",
  ).bind(teamId).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

describe("převzetí opuštěného klubu AI trenérem", () => {
  it("46 dní bez aktivity převezme, 44 ne; propojení i lidský trenér zůstávají; podruhé nic", async () => {
    await freshDb();
    const { founderTeam, aiTeams } = await foundLeague();
    const [goneTeam, recentTeam] = aiTeams;
    await makeHuman(goneTeam, "u-gone", 46, "Josef Odešlý");
    await makeHuman(recentTeam, "u-recent", 44);
    // Vlastník opuštěného klubu má i druhý, aktivní klub (dva účty, admin je propojil).
    await db.prepare("INSERT INTO club_links (team_id, group_id) VALUES (?, 'g-owner'), (?, 'g-owner')").bind(goneTeam, founderTeam).run();

    expect((await findAbandonedClubs(db, new Date())).map((c) => c.teamId)).toEqual([goneTeam]);
    const takeover = await withLogs(() => runAbandonedClubTakeover(db, new Date()));
    expect(takeover.problems).toEqual([]);
    expect(takeover.result).toBe(1);

    const gone = await db.prepare("SELECT user_id, ai_since, ai_former_user_id FROM teams WHERE id = ?").bind(goneTeam)
      .first<{ user_id: string; ai_since: string | null; ai_former_user_id: string | null }>();
    expect(gone?.user_id).toBe("ai");
    expect(gone?.ai_former_user_id).toBe("u-gone");
    expect(gone?.ai_since).not.toBeNull();
    // U21 jde s áčkem.
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE parent_team_id = ? AND user_id = 'ai' AND ai_former_user_id = 'u-gone'", goneTeam)).toBe(1);
    // Lidský trenér je odpojený, ale uložený; klub vede AI trenér s povahou.
    const human = await db.prepare("SELECT team_id FROM managers WHERE id = 'coach-u-gone'").first<{ team_id: string | null }>();
    expect(human).toEqual({ team_id: null });
    const aiCoach = await db.prepare("SELECT user_id, ai_profile FROM managers WHERE team_id = ?").bind(goneTeam).first<{ user_id: string; ai_profile: string | null }>();
    expect(aiCoach?.user_id).toBe("ai");
    expect(JSON.parse(aiCoach!.ai_profile!).version).toBe(1);
    // Propojení s klubem téhož vlastníka platí dál.
    expect(await count("SELECT COUNT(*) AS n FROM club_links WHERE group_id = 'g-owner'")).toBe(2);

    // 44 dní: ještě ne. Zakladatel (aktivní): ne.
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ? AND user_id = 'u-recent'", recentTeam)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ? AND user_id = 'founder'", founderTeam)).toBe(1);

    // Druhý běh nic nezmění.
    expect(await runAbandonedClubTakeover(db, new Date())).toBe(0);
    // Přepínač v KV: bez klíče zapnuto, "off" vypne.
    expect(await isTakeoverEnabled(env.CACHE_KV)).toBe(true);
    await env.CACHE_KV.put("ai_club_takeover", "off");
    expect(await isTakeoverEnabled(env.CACHE_KV)).toBe(false);
    // Vlastník se mezitím přihlásil: převzetí neproběhne, i když ho někdo zavolá přímo.
    await makeHuman(recentTeam, "u-recent", 0);
    expect(await takeOverAbandonedClub(db, recentTeam, new Date())).toBe(false);
  }, 180_000);
});

describe("nová registrace a převzatý klub", () => {
  it("nováček dostane nejdřív původní AI klub, převzatý lidský až po 90 dnech nečinnosti vlastníka", async () => {
    await freshDb();
    const { leagueId, aiTeams } = await foundLeague();
    const [original, former, ...rest] = aiTeams;
    // Zbylé AI kluby dostanou lidi, ať je výběr jasný.
    for (const [i, id] of rest.entries()) await makeHuman(id, `filler-${i}`, 0);
    await makeHuman(former, "u-former", 50);
    expect(await takeOverAbandonedClub(db, former, new Date())).toBe(true);

    expect(await pickOverwritableAiTeam(db, leagueId, new Date())).toBe(original);
    const first = await createTeam("newcomer-1", await freeVillage(), "FK Nováček");
    expect(first.status).toBe(201);
    expect(first.body.id).toBe(original);

    // Bývalý vlastník je pryč jen 50 dní: klub je chráněný, přebor nemá volné místo.
    const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active'").first<{ id: string }>();
    expect(await pickOverwritableAiTeam(db, leagueId, new Date())).toBeNull();
    const slot = await resolveDistrictSlot(db, DISTRICT, season!.id, null);
    expect(slot.kind === "join" && slot.league.id === leagueId).toBe(false);

    // Po 90 dnech nečinnosti ho nová registrace přepsat smí.
    await addUser("u-former", 91);
    expect(await pickOverwritableAiTeam(db, leagueId, new Date())).toBe(former);
    const second = await createTeam("newcomer-2", await freeVillage(), "TJ Druhý");
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(former);
    const team = await db.prepare("SELECT user_id, ai_since, ai_former_user_id FROM teams WHERE id = ?").bind(former)
      .first<{ user_id: string; ai_since: string | null; ai_former_user_id: string | null }>();
    expect(team).toEqual({ user_id: "newcomer-2", ai_since: null, ai_former_user_id: null });
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE parent_team_id = ? AND user_id = 'newcomer-2' AND ai_former_user_id IS NULL", former)).toBe(1);
    // Návrat už nejde.
    expect(await findReclaimableClub(db, "u-former")).toBeNull();
  }, 240_000);

  it("přepsání AI klubu uklidí všechno nové a nesmaže hráče, kterého koupil jiný klub", async () => {
    await freshDb();
    const { leagueId, founderTeam, aiTeams } = await foundLeague();
    const [target, ...rest] = aiTeams;
    for (const [i, id] of rest.entries()) await makeHuman(id, `filler-${i}`, 0);

    const players = (await db.prepare("SELECT id FROM players WHERE team_id = ? ORDER BY id").bind(target).all<{ id: string }>()).results.map((r) => r.id);
    const [sold, loanedOut, captain, listed, ...others] = players;
    const founderPlayer = (await db.prepare("SELECT id FROM players WHERE team_id = ? ORDER BY id LIMIT 1").bind(founderTeam).first<{ id: string }>())!.id;
    const sponsors = (await db.prepare("SELECT id, name FROM district_sponsors ORDER BY id LIMIT 1").all<{ id: number; name: string }>()).results;
    const gameDate = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(target).first<{ game_date: string }>())!.game_date;
    const friendlyDay = new Date(Date.parse(gameDate) + 5 * DAY_MS).toISOString().slice(0, 10);
    const budgetsBefore = new Map((await db.prepare("SELECT id, budget FROM teams WHERE id IN (?, ?)").bind(founderTeam, target)
      .all<{ id: string; budget: number }>()).results.map((r) => [r.id, r.budget]));

    await db.batch([
      // Hráč, kterého si koupil zakladatel, už AI klubu nepatří.
      db.prepare("UPDATE players SET team_id = ? WHERE id = ?").bind(founderTeam, sold),
      // Hráč AI klubu na hostování u zakladatele, hráč zakladatele na hostování v AI klubu.
      db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = '2027-01-01' WHERE id = ?").bind(founderTeam, target, loanedOut),
      db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = '2027-01-01' WHERE id = ?").bind(target, founderTeam, founderPlayer),
      db.prepare("UPDATE teams SET captain_id = ?, penalty_taker_id = ?, ai_since = '2026-10-01T00:00:00.000Z' WHERE id = ?").bind(captain, captain, target),
      // Zaměstnanec s úkolem.
      db.prepare(`INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, weekly_wage, signing_fee, avatar, hired_at)
                  VALUES ('staff-1', ?, ?, 'asistent', 'asistent', 'Karel', 'Pomocník', 40, 300, 1000, '{}', ?)`).bind(DISTRICT, target, gameDate),
      db.prepare(`INSERT INTO staff_tasks (id, team_id, staff_id, task_type, kind, starts_game_date, ends_game_date, cost_paid)
                  VALUES ('task-1', ?, 'staff-1', 'individual_plan', 'weekly', ?, ?, 500)`).bind(target, gameDate, gameDate),
      // Sponzor se slibem a jednání.
      db.prepare(`INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, status, category, sponsor_id)
                  VALUES ('contract-1', ?, ?, 'pub', 5000, 2, 2, 'active', 'main', ?)`).bind(target, sponsors[0].name, sponsors[0].id),
      db.prepare(`INSERT INTO sponsor_promises (id, contract_id, team_id, sponsor_id, kind, params, season, value_share, reward, penalty)
                  VALUES ('promise-1', 'contract-1', ?, ?, 'league_position', '{"position":3}', 1, 0.1, 0, 1000)`).bind(target, sponsors[0].id),
      db.prepare(`INSERT INTO sponsor_negotiations (id, team_id, sponsor_id, category, wishes, budget_b, patience, expires_game_date)
                  VALUES ('negotiation-1', ?, ?, 'stadium', '[]', 10000, 3, ?)`).bind(target, sponsors[0].id, gameDate),
      // Rozjednané přestupy oběma směry, inzerát, příhoz, poptávka.
      db.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, expires_at) VALUES ('offer-in', ?, ?, ?, 20000, '2027-01-01')")
        .bind(others[0], founderTeam, target),
      db.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, expires_at) VALUES ('offer-out', ?, ?, ?, 15000, '2027-01-01')")
        .bind(founderPlayer, target, founderTeam),
      db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES ('listing-1', ?, ?, 30000, ?, '2027-01-01')")
        .bind(listed, target, leagueId),
      db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES ('listing-founder', ?, ?, 30000, ?, '2027-01-01')")
        .bind(sold, founderTeam, leagueId),
      db.prepare("INSERT INTO transfer_bids (id, listing_id, team_id, amount) VALUES ('bid-1', 'listing-founder', ?, 25000)").bind(target),
      db.prepare(`INSERT INTO transfer_demands (id, team_id, position, age_min, age_max, role, expires_at, created_at)
                  VALUES ('demand-1', ?, 'GK', 18, 30, 'starter', '2027-01-01', ?)`).bind(target, gameDate),
      // Přáteláky: čekající výzva a domluvený zápas se složenou sázkou 1 000 Kč, nabídka termínu.
      db.prepare("INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_date) VALUES ('challenge-pending', ?, ?, 'pending', ?, ?)")
        .bind(founderTeam, target, `${friendlyDay}T16:00:00.000Z`, friendlyDay),
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES ('friendly-match', ?, ?, 'scheduled', ?)")
        .bind(target, founderTeam, `${friendlyDay}T16:00:00.000Z`),
      db.prepare(`INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_date, stake, stake_status, match_id)
                  VALUES ('challenge-accepted', ?, ?, 'accepted', ?, ?, 1000, 'held', 'friendly-match')`)
        .bind(target, founderTeam, `${friendlyDay}T16:00:00.000Z`, friendlyDay),
      db.prepare("UPDATE teams SET budget = budget - 1000 WHERE id IN (?, ?)").bind(founderTeam, target),
      db.prepare("INSERT INTO friendly_offers (id, team_id, match_date) VALUES ('offer-friendly', ?, ?)").bind(target, friendlyDay),
      // Deník a nároky AI trenéra, zařízení bývalého vlastníka.
      db.prepare("INSERT INTO ai_coach_decisions (id, team_id, kind, mode) VALUES ('decision-1', ?, 'weekly', 'on')").bind(target),
      db.prepare("INSERT INTO ai_coach_claims (team_id, task, day) VALUES (?, 'weekly', '2026-10-26')").bind(target),
      db.prepare("INSERT INTO push_subscriptions (id, team_id, endpoint, p256dh, auth) VALUES ('push-1', ?, 'https://push.example/old-owner', 'k', 'a')").bind(target),
    ]);

    const village = await freeVillage();
    const { result: res, problems } = await withLogs(() => createTeam("newcomer", village, "SK Nový Začátek"));
    expect(problems).toEqual([]);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(target);

    // Hráči: nový kádr, nikdo z AI kádru kromě hráče, kterého koupil zakladatel.
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE id = ? AND team_id = ?", sold, founderTeam)).toBe(1);
    const leftovers = await count(`SELECT COUNT(*) AS n FROM players WHERE id IN (${players.map(() => "?").join(",")})`, ...players);
    expect(leftovers).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ?", target)).toBeGreaterThanOrEqual(15);
    // Hostování: hráč zakladatele je doma, hráč AI klubu mezi volnými hráči.
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL", founderPlayer, founderTeam)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM free_agents WHERE released_from_team_id = ? AND source = 'released'", founderTeam)).toBe(1);
    const founderSms = await messagesOf(founderTeam);
    expect(founderSms.some((m) => m.includes("se vrátil z hostování"))).toBe(true);
    expect(founderSms.some((m) => m.includes("dál hostovat nebude"))).toBe(true);
    expect(founderSms.some((m) => m.includes("se nehraje"))).toBe(true);
    // Role v týmu po hráčích AI nezůstaly, příznak AI klubu je pryč.
    expect(await db.prepare("SELECT captain_id, penalty_taker_id, ai_since FROM teams WHERE id = ?").bind(target).first())
      .toEqual({ captain_id: null, penalty_taker_id: null, ai_since: null });

    // Zaměstnanec zpět v poolu, úkol pryč.
    const staff = await db.prepare("SELECT team_id, role, hired_at, listed_until FROM staff_members WHERE id = 'staff-1'")
      .first<{ team_id: string | null; role: string | null; hired_at: string | null; listed_until: string | null }>();
    expect(staff?.team_id).toBeNull();
    expect(staff?.role).toBeNull();
    expect(staff?.hired_at).toBeNull();
    expect(Date.parse(staff!.listed_until!)).toBeGreaterThan(Date.now() + 20 * DAY_MS);
    expect(await count("SELECT COUNT(*) AS n FROM staff_tasks WHERE id = 'task-1'")).toBe(0);

    // Sponzoři, přestupy, poptávky.
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_contracts WHERE team_id = ?", target)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_promises WHERE id = 'promise-1'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sponsor_negotiations WHERE id = 'negotiation-1'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_offers WHERE id IN ('offer-in', 'offer-out') AND status = 'withdrawn'")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_listings WHERE id = 'listing-1' AND status = 'withdrawn'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_listings WHERE id = 'listing-founder' AND status = 'active'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_bids WHERE id = 'bid-1' AND status = 'withdrawn'")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM transfer_demands WHERE id = 'demand-1' AND status = 'withdrawn'")).toBe(1);

    // Přáteláky: výzvy propadly s důvodem, zápas zmizel, sázka se vrátila jen zakladateli.
    expect(await count("SELECT COUNT(*) AS n FROM challenges WHERE id IN ('challenge-pending', 'challenge-accepted') AND status = 'expired' AND cancel_reason IS NOT NULL")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE id = 'friendly-match'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM friendly_offers WHERE id = 'offer-friendly' AND status = 'withdrawn'")).toBe(1);
    const founderBudget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(founderTeam).first<{ budget: number }>();
    expect(founderBudget?.budget).toBe(budgetsBefore.get(founderTeam));

    // Deník AI trenéra, nároky a zařízení bývalého vlastníka.
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE team_id = ?", target)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id = ?", target)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM push_subscriptions WHERE team_id = ?", target)).toBe(0);

    // Nový klub: vlastní trenér, stadion a vybavení od nuly, startovní rozpočet bez peněz po AI.
    const coaches = await db.prepare("SELECT user_id, name FROM managers WHERE team_id = ?").bind(target).all<{ user_id: string; name: string }>();
    expect(coaches.results).toEqual([{ user_id: "newcomer", name: "Trenér SK Nový Začátek" }]);
    expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE team_id = ?", target)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM equipment WHERE team_id = ?", target)).toBe(1);
    const newcomerTeam = await db.prepare("SELECT t.budget, v.size FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?").bind(target)
      .first<{ budget: number; size: string }>();
    const startBudget = newcomerTeam!.size === "small_city" || newcomerTeam!.size === "city" ? 80000
      : newcomerTeam!.size === "town" || newcomerTeam!.size === "village" ? 40000 : 20000;
    expect(newcomerTeam!.budget).toBe(startBudget);
  }, 240_000);
});

describe("návrat vlastníka", () => {
  it("bývalý vlastník se vrátí ke klubu i se svým trenérem, AI trenér zmizí", async () => {
    await freshDb();
    const { aiTeams } = await foundLeague();
    const club = aiTeams[0];
    await makeHuman(club, "u-back", 60, "Václav Navrátilec");
    const takeover = await withLogs(() => takeOverAbandonedClub(db, club, new Date()));
    expect(takeover.problems).toEqual([]);
    expect(takeover.result).toBe(true);

    const token = await createSession(env.SESSION_KV, "u-back", "u-back@example.test", club);
    const offerRes = await app.request("/api/teams/reclaim-offer", { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(offerRes.status).toBe(200);
    const offer = await offerRes.json() as { club: { teamId: string; name: string } | null };
    expect(offer.club?.teamId).toBe(club);

    // Kdo klub nikdy neměl, nabídku nedostane.
    expect(await findReclaimableClub(db, "founder")).toBeNull();

    const { result: res, problems } = await withLogs(() => Promise.resolve(app.request("/api/teams/reclaim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ teamId: club }),
    }, env)));
    expect(problems).toEqual([]);
    expect(res.status).toBe(200);
    expect((await res.json() as { id: string }).id).toBe(club);

    const team = await db.prepare("SELECT user_id, ai_since, ai_former_user_id FROM teams WHERE id = ?").bind(club).first();
    expect(team).toEqual({ user_id: "u-back", ai_since: null, ai_former_user_id: null });
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE parent_team_id = ? AND user_id = 'u-back'", club)).toBe(1);
    const coaches = await db.prepare("SELECT id, user_id, name FROM managers WHERE team_id = ?").bind(club).all<{ id: string; user_id: string; name: string }>();
    expect(coaches.results).toEqual([{ id: "coach-u-back", user_id: "u-back", name: "Václav Navrátilec" }]);
    expect((await getSession(env.SESSION_KV, token))?.teamId).toBe(club);

    // Návrat je aktivita: noční převzetí klub hned znovu nevezme.
    expect((await findAbandonedClubs(db, new Date())).map((c) => c.teamId)).not.toContain(club);

    // Podruhé to nejde, nabídka zmizela.
    const again = await app.request("/api/teams/reclaim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ teamId: club }),
    }, env);
    expect(again.status).toBe(409);
    expect(await findReclaimableClub(db, "u-back")).toBeNull();
  }, 180_000);
});
