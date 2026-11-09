/**
 * Podání tiketu je jedna transakce: tiket, tipy i stržení vkladu projdou spolu,
 * nebo vůbec. Souběžné požadavky neobejdou limit tří tiketů na kolo ani zůstatek
 * a po neúspěchu nezůstane žádný napůl podaný tiket.
 *
 * Běží nad skutečnou SQLite (Miniflare) s tabulkami sázek ze skutečné migrace.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const rules = vi.hoisted(() => ({ levy_bet_pct: 0, bet_max_stake: 5_000, bet_max_payout: 100_000, ban_betting: 0 }));
vi.mock("../competition/rules", () => ({ resolveRules: async () => rules }));

import { placeTicket, MAX_TICKETS_PER_ROUND } from "./tickets";

let mf: Miniflare;
let db: D1Database;

const MATCH_IDS = ["m1", "m2", "m3", "m4", "m5", "m6"];

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT, budget INTEGER)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, game_week INTEGER, status TEXT)",
  ]) await db.prepare(sql).run();
  const strip = (file: string) => readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8").replace(/--.*$/gm, "");
  for (const stmt of strip("0157_sazkova_kancelar.sql").split(";").map((x) => x.trim())
    .filter((x) => /^CREATE TABLE IF NOT EXISTS bet_(odds|tickets|selections)\b/.test(x))) {
    await db.prepare(stmt).run();
  }
  for (const file of ["0034_transactions.sql", "0273_club_links.sql"]) {
    for (const stmt of strip(file).split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
});

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  rules.levy_bet_pct = 0;
  for (const t of ["bet_selections", "bet_tickets", "bet_odds", "transactions", "teams", "matches", "season_calendar"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('me', 'Sázkař', 'u1', NULL, 'L1', 10000), ('h', 'Domácí', 'u2', NULL, 'L1', 0), ('a', 'Hosté', 'u3', NULL, 'L1', 0)"),
    db.prepare("INSERT INTO season_calendar VALUES ('cal-1', 5, 'scheduled')"),
    ...MATCH_IDS.map((id) => db.prepare("INSERT INTO matches VALUES (?, 'h', 'a')").bind(id)),
    ...MATCH_IDS.map((id) => db.prepare(
      `INSERT INTO bet_odds (id, match_id, market, selection, odds_x100, probability, label, game_date, calendar_id, league_id, season_number)
       VALUES (?, ?, '1x2', '1', 200, 0.5, 'Domácí', '2026-11-09', 'cal-1', 'L1', 3)`,
    ).bind(`o-${id}`, id)),
  ]);
});

const ticket = (matchId: string, stake = 1000) => ({
  teamId: "me",
  stake,
  selections: [{ matchId, market: "1x2", selection: "1", oddsX100: 200 }],
  gameDate: "2026-11-09T12:00:00.000Z",
});

const count = async (sql: string) => (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
const budget = async () => (await db.prepare("SELECT budget FROM teams WHERE id = 'me'").first<{ budget: number }>())!.budget;

describe("podání tiketu je atomické", () => {
  it("úspěšný tiket: řádek 'open', tip, stržený vklad a zápis v transakcích", async () => {
    const res = await placeTicket(db, ticket("m1"));
    expect(res).toMatchObject({ ok: true, totalOddsX100: 200, payout: 2000, levy: 0 });
    expect(await budget()).toBe(9000);
    const t = await db.prepare("SELECT status, stake FROM bet_tickets").first<{ status: string; stake: number }>();
    expect(t).toEqual({ status: "open", stake: 1000 });
    expect(await count("SELECT COUNT(*) AS n FROM bet_selections")).toBe(1);
    const txn = await db.prepare("SELECT type, amount, balance_after, reference_id FROM transactions").all();
    expect(txn.results).toEqual([
      { type: "bet_stake", amount: -1000, balance_after: 9000, reference_id: `bet-stake-${res.ok ? res.ticketId : ""}` },
    ]);
  });

  it("odvod soutěži odejde ve stejné transakci a zůstatky v knize na sebe navazují", async () => {
    rules.levy_bet_pct = 5;
    const res = await placeTicket(db, ticket("m1"));
    expect(res).toMatchObject({ ok: true, levy: 50 });
    expect(await budget()).toBe(8950);
    const txn = await db.prepare("SELECT type, amount, balance_after FROM transactions ORDER BY balance_after DESC").all();
    expect(txn.results).toEqual([
      { type: "bet_stake", amount: -1000, balance_after: 9000 },
      { type: "bet_levy", amount: -50, balance_after: 8950 },
    ]);
  });

  it("šest souběžných tiketů: projdou právě tři, peníze odejdou jen za ně", async () => {
    const results = await Promise.all(MATCH_IDS.map((id) => placeTicket(db, ticket(id))));
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(MAX_TICKETS_PER_ROUND);
    for (const r of results.filter((x) => !x.ok)) {
      expect(r).toMatchObject({ ok: false, status: 409 });
      expect(r.ok ? "" : r.error).toContain("nejvýš 3 tikety");
    }
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(3);
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets WHERE status <> 'open'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM bet_selections")).toBe(3);
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(3);
    expect(await budget()).toBe(7000);
  });

  it("souběžné tikety nevsadí víc, než je na účtu", async () => {
    await db.prepare("UPDATE teams SET budget = 2500 WHERE id = 'me'").run();
    const results = await Promise.all(["m1", "m2", "m3"].map((id) => placeTicket(db, ticket(id, 1000))));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, status: 400 });
    expect(await budget()).toBe(500);
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(2);
  });

  it("vklad přesně ve výši zůstatku projde, o korunu vyšší ne", async () => {
    await db.prepare("UPDATE teams SET budget = 1000 WHERE id = 'me'").run();
    expect(await placeTicket(db, ticket("m1", 1001))).toMatchObject({ ok: false, status: 400 });
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(0);
    expect(await placeTicket(db, ticket("m1", 1000))).toMatchObject({ ok: true });
    expect(await budget()).toBe(0);
  });

  it("záporný rozpočet: tiket nevznikne a z limitu nic neubere", async () => {
    await db.prepare("UPDATE teams SET budget = -500 WHERE id = 'me'").run();
    const res = await placeTicket(db, ticket("m1", 100));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(res.ok ? "" : res.error).toContain("Záporný rozpočet");
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(0);
    expect(await budget()).toBe(-500);

    // Po vyrovnání rozpočtu jdou podat všechny tři tikety kola.
    await db.prepare("UPDATE teams SET budget = 5000 WHERE id = 'me'").run();
    for (const id of ["m1", "m2", "m3"]) expect(await placeTicket(db, ticket(id))).toMatchObject({ ok: true });
  });

  it("kolo zamčené mezi kontrolou a zápisem: tiket nevznikne a vklad zůstane", async () => {
    // Kontrola stavu kola na začátku projde, zámek přijde těsně před transakcí.
    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            await target.prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE id = 'cal-1'").run();
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const res = await placeTicket(racing, ticket("m1"));
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(res.ok ? "" : res.error).toContain("uzavřené");
    expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM bet_selections")).toBe(0);
    expect(await budget()).toBe(10000);
  });

  it("když zápis tipů spadne, vrátí se celá transakce včetně tiketu a vkladu", async () => {
    await db.prepare("DROP TABLE bet_selections").run();
    try {
      expect(await placeTicket(db, ticket("m1"))).toMatchObject({ ok: false, status: 500 });
      expect(await count("SELECT COUNT(*) AS n FROM bet_tickets")).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM transactions")).toBe(0);
      expect(await budget()).toBe(10000);
    } finally {
      const sql = readFileSync(resolve(__dirname, "../../migrations/0157_sazkova_kancelar.sql"), "utf8").replace(/--.*$/gm, "");
      const stmt = sql.split(";").map((x) => x.trim()).find((x) => /^CREATE TABLE IF NOT EXISTS bet_selections\b/.test(x))!;
      await db.prepare(stmt).run();
    }
  });

  it("anulovaný tiket se do limitu nepočítá", async () => {
    for (const id of ["m1", "m2", "m3"]) expect(await placeTicket(db, ticket(id))).toMatchObject({ ok: true });
    expect(await placeTicket(db, ticket("m4"))).toMatchObject({ ok: false, status: 409 });
    await db.prepare("UPDATE bet_tickets SET status = 'void' WHERE id = (SELECT id FROM bet_tickets LIMIT 1)").run();
    expect(await placeTicket(db, ticket("m4"))).toMatchObject({ ok: true });
  });
});
