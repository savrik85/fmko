/**
 * Vypořádání tiketů, když kolo nedohraje: tiket se vypořádá, jakmile jsou rozhodnuté
 * jeho zápasy, neodehraný zápas se po 48 hodinách anuluje a opakované vypořádání
 * nevyplatí dvakrát.
 *
 * Běží nad skutečnou SQLite (Miniflare) s tabulkami sázek ze skutečné migrace.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const sent = vi.hoisted(() => ({ sms: [] as string[] }));
vi.mock("../competition/rules", () => ({ resolveRules: async () => ({ bet_max_payout: 100_000 }) }));
vi.mock("../messaging/system-sms", () => ({
  sendSystemSMS: async (_db: unknown, _teamId: string, _role: string, body: string) => { sent.sms.push(body); },
}));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));

import { legState, settleOpenRounds, settleRound, VOID_AFTER_HOURS } from "./settle";

let mf: Miniflare;
let db: D1Database;

const SCHEDULED_AT = "2026-11-09T17:00:00.000Z";
const HOUR = 3_600_000;
const at = (hoursAfter: number) => new Date(SCHEDULED_AT).getTime() + hoursAfter * HOUR;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, budget INTEGER, game_date TEXT, league_id TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, status TEXT, scheduled_at TEXT, league_id TEXT)",
    "CREATE TABLE match_player_stats (id TEXT PRIMARY KEY, match_id TEXT, player_id TEXT, goals INTEGER)",
    "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, created_at TEXT)",
  ]) await db.prepare(sql).run();
  const strip = (file: string) => readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8").replace(/--.*$/gm, "");
  for (const stmt of strip("0157_sazkova_kancelar.sql").split(";").map((x) => x.trim())
    .filter((x) => /^CREATE TABLE IF NOT EXISTS bet_(tickets|selections)\b/.test(x))) {
    await db.prepare(stmt).run();
  }
  for (const stmt of strip("0034_transactions.sql").split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
});

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  sent.sms.length = 0;
  for (const t of ["bet_selections", "bet_tickets", "transactions", "teams", "matches", "season_calendar", "match_player_stats", "news"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  // Kolo po pádu: m1 a m2 odehrané (2:0 a 1:1), m3 zůstal neodehraný.
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('me', 'Sázkař', 1000, '2026-11-09T12:00:00.000Z', 'L1'), ('h', 'Domácí', 0, '2026-11-09T12:00:00.000Z', 'L1')"),
    db.prepare("INSERT INTO season_calendar VALUES ('cal-1', 'lineup_locked', ?, 'L1')").bind(SCHEDULED_AT),
    db.prepare("INSERT INTO matches VALUES ('m1', 'cal-1', 'h', 'a', 2, 0, 'simulated'), ('m2', 'cal-1', 'h', 'a', 1, 1, 'simulated'), ('m3', 'cal-1', 'h', 'a', NULL, NULL, 'scheduled')"),
    db.prepare("INSERT INTO match_player_stats VALUES ('s1', 'm1', 'striker', 1), ('s2', 'm2', 'other', 0)"),
  ]);
});

/** Otevřený tiket za 100 Kč s tipem „1" (kurz 2,00) na každý ze zadaných zápasů. */
async function openTicket(id: string, matchIds: string[], selection = "1"): Promise<void> {
  await db.prepare(
    `INSERT INTO bet_tickets (id, team_id, league_id, season_number, calendar_id, stake, levy, total_odds_x100, potential_payout, capped, status, placed_game_date)
     VALUES (?, 'me', 'L1', 3, 'cal-1', 100, 0, ?, ?, 0, 'open', '2026-11-09')`,
  ).bind(id, 100 * 2 ** matchIds.length, 100 * 2 ** matchIds.length).run();
  for (const m of matchIds) {
    await db.prepare(
      "INSERT INTO bet_selections (id, ticket_id, match_id, market, selection, odds_x100, label) VALUES (?, ?, ?, '1x2', ?, 200, 'tip')",
    ).bind(`${id}-${m}`, id, m, selection).run();
  }
}

const ticketOf = (id: string) => db.prepare("SELECT status, payout FROM bet_tickets WHERE id = ?").bind(id).first<{ status: string; payout: number }>();
const budget = async () => (await db.prepare("SELECT budget FROM teams WHERE id = 'me'").first<{ budget: number }>())!.budget;
const transactions = async () => (await db.prepare("SELECT type, amount, balance_after, reference_id FROM transactions ORDER BY rowid").all()).results;

describe("stav tipu podle zápasu", () => {
  const played = { status: "simulated", home_score: 2, away_score: 0 };
  it("odehraný zápas se hodnotí, i po lhůtě", () => {
    expect(legState(played, false)).toBe("played");
    expect(legState(played, true)).toBe("played");
  });
  it("neodehraný zápas čeká a po lhůtě se anuluje", () => {
    const scheduled = { status: "scheduled", home_score: null, away_score: null };
    expect(legState(scheduled, false)).toBe("waiting");
    expect(legState(scheduled, true)).toBe("void");
    expect(legState({ ...scheduled, status: "lineups_open" }, false)).toBe("waiting");
  });
  it("zrušený nebo smazaný zápas se anuluje hned", () => {
    expect(legState({ status: "cancelled", home_score: null, away_score: null }, false)).toBe("void");
    expect(legState(undefined, false)).toBe("void");
    expect(legState({ status: "simulated", home_score: null, away_score: null }, false)).toBe("void");
  });
});

describe("vypořádání při neodehraném zápase", () => {
  it("tiket jen z odehraných zápasů se vypořádá hned, i když kolo nedohrálo", async () => {
    await openTicket("won", ["m1"]);
    await openTicket("lost", ["m2"]);
    const res = await settleRound(db, "cal-1", at(1));
    expect(res).toEqual({ tickets: 2, paidOut: 200 });
    expect(await ticketOf("won")).toEqual({ status: "won", payout: 200 });
    expect(await ticketOf("lost")).toEqual({ status: "lost", payout: 0 });
    expect(await budget()).toBe(1200);
    expect(await transactions()).toEqual([{ type: "bet_win", amount: 200, balance_after: 1200, reference_id: "bet-payout-won" }]);
  });

  it("tiket s neodehraným zápasem počká, přesně do 48 hodin po termínu", async () => {
    await openTicket("combo", ["m1", "m3"]);
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 0, paidOut: 0 });
    expect(await settleRound(db, "cal-1", at(VOID_AFTER_HOURS) - 1)).toEqual({ tickets: 0, paidOut: 0 });
    expect(await ticketOf("combo")).toEqual({ status: "open", payout: 0 });
    expect(await budget()).toBe(1000);

    // Po lhůtě se neodehraný zápas počítá kurzem 1,00: z 4,00 zbyde 2,00.
    expect(await settleRound(db, "cal-1", at(VOID_AFTER_HOURS))).toEqual({ tickets: 1, paidOut: 200 });
    expect(await ticketOf("combo")).toEqual({ status: "won", payout: 200 });
    const legs = await db.prepare("SELECT match_id, result FROM bet_selections WHERE ticket_id = 'combo' ORDER BY match_id").all();
    expect(legs.results).toEqual([{ match_id: "m1", result: "won" }, { match_id: "m3", result: "void" }]);
    expect(sent.sms[0]).toContain("zápas se neodehrál a kurz o něj klesl");
  });

  it("zápas dohraný před lhůtou se vyhodnotí normálně", async () => {
    await openTicket("combo", ["m1", "m3"]);
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 0, paidOut: 0 });
    await db.prepare("UPDATE matches SET status = 'simulated', home_score = 3, away_score = 1 WHERE id = 'm3'").run();
    expect(await settleRound(db, "cal-1", at(20))).toEqual({ tickets: 1, paidOut: 400 });
    expect(await ticketOf("combo")).toEqual({ status: "won", payout: 400 });
  });

  it("prohraný tip rozhodne tiket až s ostatními zápasy, ne dřív", async () => {
    // m2 skončil remízou, tip „1" je prohraný, ale tiket čeká na m3 jako každý jiný.
    await openTicket("combo", ["m2", "m3"]);
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 0, paidOut: 0 });
    expect(await settleRound(db, "cal-1", at(49))).toEqual({ tickets: 1, paidOut: 0 });
    expect(await ticketOf("combo")).toEqual({ status: "lost", payout: 0 });
    expect(await budget()).toBe(1000);
  });

  it("tiket jen z neodehraných zápasů vrátí vklad", async () => {
    await openTicket("void", ["m3"]);
    expect(await settleRound(db, "cal-1", at(49))).toEqual({ tickets: 1, paidOut: 100 });
    expect(await ticketOf("void")).toEqual({ status: "void", payout: 100 });
    expect(await budget()).toBe(1100);
    expect(await transactions()).toEqual([{ type: "bet_refund", amount: 100, balance_after: 1100, reference_id: "bet-payout-void" }]);
    expect(sent.sms[0]).toContain("zápas se neodehrál");
    expect(sent.sms[0]).not.toMatch(/[—–]/);
  });

  it("zrušený zápas se anuluje hned, na lhůtu se nečeká", async () => {
    await db.prepare("UPDATE matches SET status = 'cancelled' WHERE id = 'm3'").run();
    await openTicket("combo", ["m1", "m3"]);
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 1, paidOut: 200 });
  });

  it("opakované vypořádání nevyplatí podruhé", async () => {
    await openTicket("won", ["m1"]);
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 1, paidOut: 200 });
    expect(await settleRound(db, "cal-1", at(2))).toEqual({ tickets: 0, paidOut: 0 });
    expect(await settleRound(db, "cal-1", at(60))).toEqual({ tickets: 0, paidOut: 0 });
    expect(await budget()).toBe(1200);
    expect(await transactions()).toHaveLength(1);
    expect(sent.sms).toHaveLength(1);
  });

  it("dva souběžné běhy vyplatí jednou", async () => {
    await openTicket("won", ["m1"]);
    await openTicket("refund", ["m3"]);
    const runs = await Promise.all([1, 2, 3].map(() => settleRound(db, "cal-1", at(49))));
    expect(runs.reduce((sum, r) => sum + r.tickets, 0)).toBe(2);
    expect(runs.reduce((sum, r) => sum + r.paidOut, 0)).toBe(300);
    expect(await budget()).toBe(1300);
    expect(await transactions()).toHaveLength(2);
  });

  it("tiket vypořádaný jiným během se nevyplatí, ani když ho tenhle běh načetl jako otevřený", async () => {
    await openTicket("won", ["m1"]);
    // Jiný běh tiket uzavře těsně před transakcí tohohle běhu.
    const racing = new Proxy(db, {
      get(target, prop) {
        if (prop === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            await target.prepare("UPDATE bet_tickets SET status = 'won', payout = 200 WHERE id = 'won'").run();
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(await settleRound(racing, "cal-1", at(1))).toEqual({ tickets: 0, paidOut: 0 });
    expect(await budget()).toBe(1000);
    expect(await transactions()).toHaveLength(0);
    const leg = await db.prepare("SELECT result FROM bet_selections WHERE ticket_id = 'won'").first<{ result: string }>();
    expect(leg?.result).toBe("pending");
  });

  it("střelec na zápase, kterému se ještě nedopsaly statistiky, počká", async () => {
    await db.prepare("DELETE FROM match_player_stats WHERE match_id = 'm1'").run();
    await db.prepare(
      `INSERT INTO bet_tickets (id, team_id, league_id, season_number, calendar_id, stake, levy, total_odds_x100, potential_payout, capped, status, placed_game_date)
       VALUES ('scorer', 'me', 'L1', 3, 'cal-1', 100, 0, 300, 300, 0, 'open', '2026-11-09')`,
    ).run();
    await db.prepare("INSERT INTO bet_selections (id, ticket_id, match_id, market, selection, odds_x100, label) VALUES ('sc-1', 'scorer', 'm1', 'scorer', 'striker', 300, 'Střelec')").run();
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 0, paidOut: 0 });
    await db.prepare("INSERT INTO match_player_stats VALUES ('s1', 'm1', 'striker', 1)").run();
    expect(await settleRound(db, "cal-1", at(1))).toEqual({ tickets: 1, paidOut: 300 });
  });

  it("záchranná síť projde i kolo zaseklé po pádu, kolo před termínem nechá být", async () => {
    await openTicket("won", ["m1"]);
    await openTicket("stuck", ["m3"]);
    await db.batch([
      db.prepare("INSERT INTO season_calendar VALUES ('cal-future', 'scheduled', '2026-11-20T17:00:00.000Z', 'L1')"),
      db.prepare("INSERT INTO matches VALUES ('m9', 'cal-future', 'h', 'a', NULL, NULL, 'scheduled')"),
      db.prepare(
        `INSERT INTO bet_tickets (id, team_id, league_id, season_number, calendar_id, stake, levy, total_odds_x100, potential_payout, capped, status, placed_game_date)
         VALUES ('future', 'me', 'L1', 3, 'cal-future', 100, 0, 200, 200, 0, 'open', '2026-11-09')`,
      ),
    ]);
    expect(await settleOpenRounds(db, at(1))).toEqual({ rounds: 1, tickets: 1, paidOut: 200 });
    expect(await settleOpenRounds(db, at(49))).toEqual({ rounds: 1, tickets: 1, paidOut: 100 });
    expect(await ticketOf("future")).toEqual({ status: "open", payout: 0 });
  });

  it("lhůta běží v herním čase klubů, ne v reálném", async () => {
    await openTicket("stuck", ["m3"]);
    // Herní datum je pět hodin před termínem kola: kolo se v herním čase ještě ani nehrálo.
    expect(await settleOpenRounds(db)).toEqual({ rounds: 0, tickets: 0, paidOut: 0 });

    // Den po termínu: kolo se zametá, zápas ale ještě čeká.
    await db.prepare("UPDATE teams SET game_date = '2026-11-10T16:00:00.000Z'").run();
    expect(await settleOpenRounds(db)).toEqual({ rounds: 1, tickets: 0, paidOut: 0 });
    expect(await ticketOf("stuck")).toEqual({ status: "open", payout: 0 });

    // Třetí herní den po termínu (71 hodin): zápas se anuluje a vklad se vrací.
    await db.prepare("UPDATE teams SET game_date = '2026-11-12T16:00:00.000Z'").run();
    expect(await settleOpenRounds(db)).toEqual({ rounds: 1, tickets: 1, paidOut: 100 });
    expect(await ticketOf("stuck")).toEqual({ status: "void", payout: 100 });
  });
});
