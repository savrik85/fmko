/**
 * Grémium okresu: Okresní přebor a III. třída téhož okresu mají jedno grémium,
 * které sedí u přeboru. Vedení, sankce a vyškrtnutí sudích jsou společné,
 * pokladna je per soutěž. Běží nad skutečnou SQLite se skutečnými migracemi
 * samosprávy (0150, 0151); falešná D1 by spojení soutěží přes `leagues` nepoznala.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { DEFAULT_RULES } from "./defaults";
import { issueSanction, refundSanction } from "./discipline";
import { readBalance } from "./ledger";
import { applyRefereeBan, bannedIds } from "./referee-bans";
import { applyRefereePause, pausedIds } from "./referee-roster";
import { validateProposal } from "./proposals";
import { applyGovernanceRollover } from "./rollover";
import {
  countHumanClubs, districtLeagueIds, governingLeagueId, listVoters, loadRules,
  loadTreasuryRules, meetsThreshold, treasuryOpen,
} from "./rules";
import { computeTransferLevies } from "./transfer-levy";

let mf: Miniflare;
let db: D1Database;

const PREBOR = "L-prebor";
const SOUTEZ = "L-soutez";
const OTHER_PREBOR = "L-jinde";
const NEW_SEASON = 4;
const START = "2026-07-01T10:00:00.000Z";

async function runMigration(file: string) {
  const sql = readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8");
  for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");

  // Sazebník se zakládá ze všech polí DEFAULT_RULES (rollover.ts), migrace 0150
  // jich má jen část. Tabulka se proto skládá z katalogu, ať test drží krok.
  const ruleCols = Object.keys(DEFAULT_RULES).map((f) => `${f} REAL NOT NULL DEFAULT 0`).join(", ");
  await db.prepare(
    `CREATE TABLE competition_rules (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL,
       ${ruleCols}, subsidy_total INTEGER NOT NULL DEFAULT 0, source_proposals TEXT,
       created_at TEXT, UNIQUE(league_id, season_number))`,
  ).run();
  await runMigration("0150_competition_governance.sql");
  await runMigration("0151_competition_elections.sql");

  for (const sql of [
    "ALTER TABLE competition_sanctions ADD COLUMN reference_id TEXT",
    "ALTER TABLE competition_sanctions ADD COLUMN bet_ban_until_gw INTEGER",
    `CREATE TABLE competition_referee_suspensions (id TEXT PRIMARY KEY, league_id TEXT, referee_id TEXT,
       season_number INTEGER, from_week INTEGER, until_week INTEGER, reason TEXT, issued_by_team_id TEXT, game_date TEXT)`,
    `CREATE TABLE leagues (id TEXT PRIMARY KEY, season_id TEXT, district TEXT, name TEXT, level TEXT,
       status TEXT DEFAULT 'active', league_type TEXT DEFAULT 'senior')`,
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, team_type TEXT DEFAULT 'senior',
       parent_team_id TEXT, league_id TEXT, budget INTEGER DEFAULT 100000, created_at TEXT DEFAULT '2026-01-01')`,
    `CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER,
       description TEXT, reference_id TEXT, game_date TEXT)`,
    `CREATE TABLE season_end_progress (league_id TEXT NOT NULL, season_number INTEGER NOT NULL, phase TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending', cursor TEXT, data TEXT, updated_at TEXT,
       PRIMARY KEY (league_id, season_number, phase))`,
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, game_week INTEGER,
       status TEXT, scheduled_at TEXT)`,
    `CREATE TABLE referee_team_relations (id TEXT PRIMARY KEY, referee_id TEXT, team_id TEXT, sentiment INTEGER,
       duvod TEXT, UNIQUE(referee_id, team_id))`,
    `INSERT INTO leagues (id, season_id, district, name, level) VALUES
       ('${PREBOR}', 's4', 'Prachatice', 'Okresní přebor Prachatice', 'okresni_prebor'),
       ('${SOUTEZ}', 's4', 'Prachatice', 'III. třída Prachatice', 'okresni_soutez'),
       ('${OTHER_PREBOR}', 's4', 'Strakonice', 'Okresní přebor Strakonice', 'okresni_prebor')`,
    // Přebor má 3 lidské kluby, III. třída 2: sám by práh pěti nesplnil ani jeden.
    `INSERT INTO teams (id, name, user_id, league_id) VALUES
       ('p1', 'Přebor 1', 'u1', '${PREBOR}'), ('p2', 'Přebor 2', 'u2', '${PREBOR}'), ('p3', 'Přebor 3', 'u3', '${PREBOR}'),
       ('p4', 'Přebor AI', 'ai', '${PREBOR}'),
       ('s1', 'Třída 1', 'u4', '${SOUTEZ}'), ('s2', 'Třída 2', 'u5', '${SOUTEZ}'), ('s3', 'Třída AI', 'ai', '${SOUTEZ}'),
       ('x1', 'Strakonice 1', 'u6', '${OTHER_PREBOR}')`,
    // U21 sdílí user_id s áčkem a hlasovat nesmí.
    `INSERT INTO teams (id, name, user_id, team_type, parent_team_id, league_id) VALUES
       ('p1-u21', 'Přebor 1 U21', 'u1', 'u21', 'p1', '${PREBOR}')`,
    `INSERT INTO season_calendar (id, league_id, season_number, game_week, status, scheduled_at) VALUES
       ('cp', '${PREBOR}', ${NEW_SEASON}, 1, 'scheduled', '2026-07-06T16:00:00.000Z'),
       ('cs', '${SOUTEZ}', ${NEW_SEASON}, 1, 'scheduled', '2026-07-08T16:00:00.000Z'),
       ('cx', '${OTHER_PREBOR}', ${NEW_SEASON}, 1, 'scheduled', '2026-07-06T16:00:00.000Z')`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await mf.dispose();
});

describe("grémium okresu", () => {
  it("III. třídu vede přebor téhož okresu, přebor sám sebe", async () => {
    expect(await governingLeagueId(db, SOUTEZ)).toBe(PREBOR);
    expect(await governingLeagueId(db, PREBOR)).toBe(PREBOR);
    expect(await governingLeagueId(db, OTHER_PREBOR)).toBe(OTHER_PREBOR);
    expect(await districtLeagueIds(db, SOUTEZ)).toEqual([PREBOR, SOUTEZ]);
  });

  it("soutěž bez řádku v leagues vede sama sebe", async () => {
    expect(await governingLeagueId(db, "neznama")).toBe("neznama");
  });

  it("volí kluby obou soutěží, U21 a AI ne", async () => {
    const voters = (await listVoters(db, SOUTEZ)).sort();
    expect(voters).toEqual(["p1", "p2", "p3", "s1", "s2"]);
    expect((await listVoters(db, PREBOR)).sort()).toEqual(voters);
  });

  it("práh pěti lidských klubů se počítá za celý okres", async () => {
    expect(await countHumanClubs(db, PREBOR)).toBe(5);
    expect(await meetsThreshold(db, SOUTEZ)).toBe(true);
    expect(await meetsThreshold(db, OTHER_PREBOR)).toBe(false);
  });

  it("rollover dá sazebník a volby jen přeboru, pokladnu a startovné oběma", async () => {
    // Před rolloverem nemá III. třída otevřenou pokladnu, takže z ní nic neplatí.
    expect(await loadTreasuryRules(db, SOUTEZ, NEW_SEASON)).toBeNull();

    const out = await applyGovernanceRollover(db, NEW_SEASON, START);
    expect(out.enabled).toBe(2);

    const rules = await db.prepare("SELECT league_id FROM competition_rules WHERE season_number = ?")
      .bind(NEW_SEASON).all<{ league_id: string }>();
    expect(rules.results.map((r) => r.league_id)).toEqual([PREBOR]);

    const elections = await db.prepare("SELECT DISTINCT league_id FROM competition_elections")
      .all<{ league_id: string }>();
    expect(elections.results.map((r) => r.league_id)).toEqual([PREBOR]);

    // Sazebník je společný, pokladny jsou dvě.
    expect(await loadRules(db, SOUTEZ, NEW_SEASON)).not.toBeNull();
    expect(await loadTreasuryRules(db, SOUTEZ, NEW_SEASON)).not.toBeNull();
    expect(await treasuryOpen(db, SOUTEZ)).toBe(true);

    const subsidies = await db.prepare(
      "SELECT league_id FROM competition_ledger WHERE type = 'subsidy' ORDER BY league_id",
    ).all<{ league_id: string }>();
    expect(subsidies.results.map((r) => r.league_id)).toEqual([PREBOR, SOUTEZ]);

    const fee = await db.prepare(
      "SELECT league_id FROM competition_ledger WHERE type = 'entry_fee' AND team_id = 's1'",
    ).first<{ league_id: string }>();
    expect(fee?.league_id).toBe(SOUTEZ);

    // Strakonice práh nesplňují, samosprávu nedostaly.
    const other = await db.prepare("SELECT 1 FROM competition_governance WHERE league_id = ?")
      .bind(OTHER_PREBOR).first();
    expect(other).toBeNull();
  });

  it("pokuta za zápas III. třídy patří grémiu přeboru, peníze pokladně III. třídy", async () => {
    const before = await readBalance(db, SOUTEZ);
    const preborBefore = await readBalance(db, PREBOR);

    const id = await issueSanction(db, {
      leagueId: SOUTEZ, seasonNumber: NEW_SEASON, teamId: "s1", amount: 2000,
      kind: "fan_disorder", reason: "výtržnost kotle", evidence: null,
      issuedBy: "rule", issuedByTeamId: null, proposalId: null, gameDate: START,
      referenceId: "faninc-test",
    });
    expect(id).toBeTruthy();

    const sanction = await db.prepare("SELECT league_id FROM competition_sanctions WHERE id = ?")
      .bind(id).first<{ league_id: string }>();
    expect(sanction?.league_id).toBe(PREBOR);
    expect(await readBalance(db, SOUTEZ)).toBe(before + 2000);
    expect(await readBalance(db, PREBOR)).toBe(preborBefore);

    // Vrácení po odvolání jde z té pokladny, kam pokuta přitekla.
    expect(await refundSanction(db, id as string, START)).toBe(true);
    expect(await readBalance(db, SOUTEZ)).toBe(before);
    expect(await readBalance(db, PREBOR)).toBe(preborBefore);
  });

  it("sudí vyškrtnutý za zápas přeboru nepíská ani III. třídu", async () => {
    await applyRefereeBan(db, {
      leagueId: PREBOR, seasonNumber: NEW_SEASON, refereeId: "ref-1",
      reason: "karty na počkání", source: "komise", proposalId: null, gameDate: START,
    });
    expect((await bannedIds(db, SOUTEZ, NEW_SEASON)).has("ref-1")).toBe(true);
    expect((await bannedIds(db, PREBOR, NEW_SEASON)).has("ref-1")).toBe(true);
    // Jiný okres má vlastní grémium.
    expect((await bannedIds(db, OTHER_PREBOR, NEW_SEASON)).has("ref-1")).toBe(false);

    const row = await db.prepare("SELECT league_id FROM competition_referee_bans WHERE referee_id = 'ref-1'")
      .first<{ league_id: string }>();
    expect(row?.league_id).toBe(PREBOR);
  });

  it("stopka zapsaná přes III. třídu platí i v přeboru", async () => {
    await applyRefereePause(db, {
      leagueId: SOUTEZ, seasonNumber: NEW_SEASON, refereeId: "ref-2", fromWeek: 2,
      reason: "pozdě na zápas", issuedByTeamId: "s1", gameDate: START,
    });
    expect((await pausedIds(db, PREBOR, NEW_SEASON, 3)).has("ref-2")).toBe(true);
    expect((await pausedIds(db, SOUTEZ, NEW_SEASON, 3)).has("ref-2")).toBe(true);
  });

  it("zvýšení sazby musí ufinancovat každá pokladna okresu, ne jen přeborová", async () => {
    const base = {
      db, leagueId: PREBOR, level: "okresni_prebor", seasonNumber: NEW_SEASON,
      currentRules: { ...DEFAULT_RULES } as never, balance: 0, kind: "win_bonus", value: 3000,
    };
    const rich = { name: "Okresní přebor Prachatice", level: "okresni_prebor", teams: 14, balance: 5_000_000 };
    const poor = { name: "III. třída Prachatice", level: "okresni_soutez", teams: 12, balance: 0 };

    expect((await validateProposal({ ...base, treasuries: [rich] })).ok).toBe(true);
    const both = await validateProposal({ ...base, treasuries: [rich, poor] });
    expect(both.ok).toBe(false);
    expect(both.ok ? "" : both.error).toContain("III. třída Prachatice");
  });

  it("přestup mezi přeborem a III. třídou téhož okresu není meziligový", async () => {
    const inside = await computeTransferLevies(db, {
      buyerLeagueId: SOUTEZ, sellerLeagueId: PREBOR, amount: 100_000, isLoan: false,
    });
    expect(inside.adminFee).toBe(0);

    const cross = await computeTransferLevies(db, {
      buyerLeagueId: OTHER_PREBOR, sellerLeagueId: PREBOR, amount: 100_000, isLoan: false,
    });
    expect(cross.adminFee).toBe(100_000 * DEFAULT_RULES.interleague_fee_pct / 100);
  });
});
