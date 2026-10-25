/**
 * Nákup AI klubu od klubu mimo hru na skutečné D1 (Miniflare, všechny migrace): jednání
 * stejnou službou jako člověk, strop ceny, úkol pro skauta a zamlžený odhad z hlášení.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { generateAiProfile } from "./profile";
import {
  loadScoutReportCandidates, maybeStartScoutTask, negotiateOutsidePurchase, outsideCandidateFromListing,
} from "./outside-buy";

let mf: Miniflare;
let db: D1Database;

const AI_CLUB = "ai-buyer";
const LEAGUE = "l-op";
const START_BUDGET = 200_000;
const GAME_DATE = "2026-10-26T16:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

const SKILLS = {
  speed: 40, technique: 45, shooting: 42, passing: 44, heading: 38, defense: 35, goalkeeping: 10,
  stamina: 50, strength: 45, vision: 40, creativity: 41, setPieces: 30,
};

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  // `transfer_listings.rejected_by` má produkce, ale žádná migrace ho nezakládá (přidán ručně).
  const hasRejectedBy = await db.prepare("SELECT 1 FROM pragma_table_info('transfer_listings') WHERE name = 'rejected_by'").first();
  if (!hasRejectedBy) await db.exec("ALTER TABLE transfer_listings ADD COLUMN rejected_by TEXT");
}, 120_000);

afterAll(async () => { await mf.dispose(); });

function virtualPlayer(position: string, rating: number) {
  return {
    firstName: "Marek", lastName: `Mimo${position}`, age: 25, position, overallRating: rating,
    skills: SKILLS, physical: { height: 180, weight: 78, preferredFoot: "right" },
    personality: { workRate: 70, loyalty: 55, alcohol: 20, temper: 40, leadership: 50, discipline: 60 },
    weeklyWage: 200, fromTeam: "TJ Mimo hru", fromCity: "Netolice", fromDistrict: "Prachatice",
  };
}

async function insertListing(id: string, position: string, rating: number, askingPrice: number) {
  await db.prepare(
    `INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at, is_ai_listing, ai_player_data)
     VALUES (?, 'virtual_ai', 'virtual_ai', ?, ?, 'active', ?, 1, ?)`,
  ).bind(id, askingPrice, LEAGUE, FUTURE, JSON.stringify(virtualPlayer(position, rating))).run();
}

async function listingRow(id: string): Promise<Record<string, unknown>> {
  return (await db.prepare("SELECT * FROM transfer_listings WHERE id = ?").bind(id).first<Record<string, unknown>>())!;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(AI_CLUB).first<{ budget: number }>())!.budget;
}

async function squadSize(): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ?").bind(AI_CLUB).first<{ n: number }>())!.n;
}

/**
 * Úklid mezi testy: nákup zapíše hráče, smlouvu, transakce, zprávy i novinky, takže se mažou
 * všechny tabulky s vazbou na tým, hráče nebo jednání, v několika průchodech kvůli cizím klíčům.
 */
async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p
                     WHERE p.name IN ('team_id', 'player_id', 'buyer_team_id', 'seller_team_id', 'from_team_id', 'to_team_id', 'negotiation_id', 'assignment_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f
                     WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers', 'staff_members', 'scout_assignments', 'ai_negotiations', 'transfer_listings')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "players", "managers", "teams", "leagues", "seasons"])];
  let lastError = "";
  for (let pass = 0; pass < 6; pass++) {
    const failed: string[] = [];
    for (const t of tables) {
      try {
        await db.prepare(`DELETE FROM ${t}`).run();
      } catch (e) {
        failed.push(t);
        lastError = `${t}: ${String(e)}`;
      }
    }
    if (failed.length === 0) return;
  }
  throw new Error(`úklid testovací databáze se nepovedl: ${lastError}`);
}

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', 'p06', 'Sokol Vlachovo Březí', ?, ?, 'senior', ?)")
      .bind(AI_CLUB, START_BUDGET, LEAGUE, GAME_DATE),
  ]);
  const players: D1PreparedStatement[] = [];
  for (let i = 0; i < 14; i++) {
    players.push(db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
       VALUES (?, ?, 'Jan', ?, 26, ?, 30, ?, '{}', '{}', '{}', '{}', 'active')`,
    ).bind(`p${i}`, AI_CLUB, `Hráč${i}`, ["GK", "DEF", "MID", "FWD"][i % 4], JSON.stringify(SKILLS)));
  }
  await db.batch(players);
});

describe("AI klub kupuje od klubu mimo hru", () => {
  it("inzerát: jedná do stropu stejnou službou jako člověk a nikdy nezaplatí víc než strop", async () => {
    // Hráč se při podpisu rozhoduje seedovaně podle inzerátu: pár inzerátů, ať projde i podpis.
    let signedOnce = false;
    for (let i = 1; i <= 6 && !signedOnce; i++) {
      const id = `vl-fwd-${i}`;
      await insertListing(id, "FWD", 45, 6000);
      const cand = outsideCandidateFromListing(await listingRow(id));
      expect(cand).toMatchObject({ source: "listing", position: "FWD", rating: 45, askingPrice: 6000 });
      const before = { budget: await budget(), squad: await squadSize() };
      const res = await negotiateOutsidePurchase(db, { teamId: AI_CLUB }, cand!, 4500, 7000, new Date());
      expect(["signed", "refused"]).toContain(res.result);
      const neg = await db.prepare("SELECT status FROM ai_negotiations WHERE team_id = ? AND listing_id = ?").bind(AI_CLUB, id).first<{ status: string }>();
      if (res.result === "signed") {
        signedOnce = true;
        expect(res.amount).toBeLessThanOrEqual(7000);
        expect(neg?.status).toBe("signed");
        expect(await budget()).toBe(before.budget - res.amount);
        expect(await squadSize()).toBe(before.squad + 1);
      } else {
        // Hráč odmítl (dojíždění, síla klubu): nic se nezaplatilo ani nepřesunulo.
        expect(neg?.status).toBe("refused");
        expect(await budget()).toBe(before.budget);
        expect(await squadSize()).toBe(before.squad);
      }
    }
    expect(signedOnce).toBe(true);
  });

  it("nad strop jednání ukončí a nic nezaplatí", async () => {
    await insertListing("vl-mid", "MID", 50, 20_000);
    const cand = outsideCandidateFromListing(await listingRow("vl-mid"))!;
    const res = await negotiateOutsidePurchase(db, { teamId: AI_CLUB }, cand, 3000, 3500, new Date());
    expect(["too_expensive", "broken_off"]).toContain(res.result);
    const neg = await db.prepare("SELECT status FROM ai_negotiations WHERE team_id = ?").bind(AI_CLUB).first<{ status: string }>();
    expect(["withdrawn", "broken_off"]).toContain(neg?.status);
    expect(await budget()).toBe(START_BUDGET);
    expect(await squadSize()).toBe(14);
  });

  it("hlášení skauta: AI vidí jen střed odhadu, ne skutečné hodnocení", async () => {
    await db.prepare(
      `INSERT INTO scout_reports (id, team_id, source, club_name, district, distance_km, player_data, first_name, last_name, age, position,
         rating_lo, rating_hi, ask_hint, status, expires_at, created_game_date)
       VALUES ('sr-1', ?, 'village_club', 'TJ Mimo hru', 'Prachatice', 12, ?, 'Marek', 'Skrytý', 24, 'DEF', 40, 50, 9000, 'active', ?, '2026-10-26')`,
    ).bind(AI_CLUB, JSON.stringify(virtualPlayer("DEF", 60)), FUTURE).run();
    const cands = await loadScoutReportCandidates(db, AI_CLUB, new Date());
    expect(cands).toEqual([{ source: "scout_report", sourceId: "sr-1", position: "DEF", age: 24, rating: 45, askingPrice: 9000 }]);
  });

  it("skaut bez práce vyjede na post, kde klub hledá; na stejný post druhý úkol nedostane", async () => {
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, judgement, communication, weekly_wage, signing_fee, avatar, hired_at)
       VALUES ('sc-1', 'Prachatice', ?, 'skaut', 'skaut', 'Karel', 'Skaut', 50, 14, 12, 300, 1000, '{}', '2026-10-01')`,
    ).bind(AI_CLUB).run();
    const profile = generateAiProfile(AI_CLUB, null);
    expect(await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 1000 }, "FWD", "2026-10-26"))
      .toMatchObject({ started: false });
    const started = await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 50_000 }, "FWD", "2026-10-26");
    expect(started).toMatchObject({ started: true, position: "FWD" });
    const task = await db.prepare("SELECT positions, weeks_total, status FROM scout_assignments WHERE team_id = ?").bind(AI_CLUB)
      .first<{ positions: string; weeks_total: number; status: string }>();
    expect(task).toMatchObject({ positions: '["FWD"]', weeks_total: 2, status: "active" });
    expect(await maybeStartScoutTask(db, { teamId: AI_CLUB, profile, spendable: 50_000 }, "FWD", "2026-10-26"))
      .toEqual({ started: false, reason: "skaut už post hledá" });
  });
});
