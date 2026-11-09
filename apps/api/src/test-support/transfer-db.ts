/**
 * Společná testovací databáze pro přestupy (Miniflare + SQLite): schéma tabulek, na které
 * sahají služby v `services/transfer-actions.ts`, a pár pomocníků na zakládání řádků.
 * Jen pro testy (`*.db.test.ts`), produkční kód ji nenačítá.
 */
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

export const TEST_GAME_DATE = "2026-10-20T12:00:00.000Z";
export const TEST_FUTURE = "2099-08-30T12:00:00.000Z";

const SCHEMA = `
  CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, size TEXT NOT NULL DEFAULT 'village');
  CREATE TABLE club_links (team_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, note TEXT, created_at TEXT);
  CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, monthly_amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE village_team_favor (team_id TEXT NOT NULL, official_id TEXT, favor INTEGER NOT NULL DEFAULT 50);
  CREATE TABLE leagues (id TEXT PRIMARY KEY, district TEXT NOT NULL, league_type TEXT NOT NULL DEFAULT 'senior', name TEXT, level INTEGER, parent_league_id TEXT);
  CREATE TABLE teams (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior',
    name TEXT NOT NULL, budget INTEGER NOT NULL DEFAULT 0, game_date TEXT, league_id TEXT, village_id TEXT,
    primary_color TEXT NOT NULL DEFAULT '#225522', secondary_color TEXT NOT NULL DEFAULT '#ffffff',
    badge_pattern TEXT, badge_symbol TEXT, badge_initials TEXT, badge_primary_color TEXT, badge_secondary_color TEXT,
    reputation INTEGER NOT NULL DEFAULT 50
  );
  CREATE TABLE managers (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, backstory TEXT, avatar TEXT, age INTEGER,
    coaching INTEGER, motivation INTEGER, tactics INTEGER, youth_development INTEGER, discipline INTEGER, reputation INTEGER,
    user_id TEXT, created_at TEXT
  );
  CREATE TABLE players (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
    age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL,
    skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}',
    life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', weekly_wage INTEGER NOT NULL DEFAULT 0,
    squad_number INTEGER, loan_from_team_id TEXT, loan_until TEXT, parent_club_id TEXT,
    next_match_return INTEGER NOT NULL DEFAULT 0, suspended_matches INTEGER DEFAULT 0, residence TEXT, commute_km INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', hidden_talent REAL DEFAULT 0, nationality TEXT NOT NULL DEFAULT 'CZ',
    is_celebrity INTEGER DEFAULT 0, skills_max TEXT NOT NULL DEFAULT '{}', coach_relationship INTEGER, raised_by_team_id TEXT
  );
  CREATE TABLE free_agents (
    id TEXT PRIMARY KEY, district TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
    age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL DEFAULT 50,
    skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}',
    life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', hidden_talent REAL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '', weekly_wage INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'generated',
    released_from_team_id TEXT, village_id TEXT, rejected_by TEXT NOT NULL DEFAULT '[]', expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), is_celebrity INTEGER DEFAULT 0,
    nationality TEXT NOT NULL DEFAULT 'CZ', skills_max TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE scout_reports (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, free_agent_id TEXT, status TEXT NOT NULL DEFAULT 'active', resolved_at TEXT);
  CREATE TABLE player_watchlist (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, player_id TEXT NOT NULL, created_at TEXT);
  CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, created_at TEXT);
  CREATE TABLE transfer_offers (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, to_team_id TEXT NOT NULL,
    offer_amount INTEGER NOT NULL, counter_amount INTEGER, message TEXT, reject_message TEXT,
    status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT, offer_type TEXT NOT NULL DEFAULT 'transfer', loan_duration INTEGER, last_action_by TEXT,
    offered_player_id TEXT, target_squad TEXT NOT NULL DEFAULT 'senior', player_interest INTEGER, virtual_team_data TEXT,
    upfront_pct INTEGER NOT NULL DEFAULT 100, installments INTEGER NOT NULL DEFAULT 0, sell_on_pct INTEGER NOT NULL DEFAULT 0,
    loan_playing_time TEXT, listing_id TEXT, cooldown_waived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transfer_offer_events (
    id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, team_id TEXT NOT NULL, event_type TEXT NOT NULL, amount INTEGER, message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), upfront_pct INTEGER, installments INTEGER, sell_on_pct INTEGER
  );
  CREATE TABLE player_contracts (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, season_id TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')), left_at TEXT, join_type TEXT NOT NULL, leave_type TEXT,
    fee INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL,
    description TEXT NOT NULL, reference_id TEXT, game_date TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE transfer_installments (
    id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
    buyer_team_id TEXT NOT NULL, seller_team_id TEXT NOT NULL, seller_name TEXT, total_amount INTEGER NOT NULL,
    upfront_amount INTEGER NOT NULL, installment_amount INTEGER NOT NULL, installments_total INTEGER NOT NULL,
    installments_paid INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', created_game_date TEXT, last_paid_game_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT
  );
  CREATE TABLE sell_on_clauses (
    id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
    beneficiary_team_id TEXT NOT NULL, owner_team_id TEXT NOT NULL, pct INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', paid_amount INTEGER, paid_offer_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
  );
  CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, days_remaining INTEGER NOT NULL DEFAULT 0, is_fake INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE transfer_listings (
    id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, asking_price INTEGER NOT NULL, league_id TEXT,
    status TEXT NOT NULL DEFAULT 'active', expires_at TEXT, is_ai_listing INTEGER NOT NULL DEFAULT 0, ai_player_data TEXT, rejected_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), deal_type TEXT NOT NULL DEFAULT 'transfer', loan_days INTEGER, loan_playing_time TEXT
  );
  CREATE TABLE transfer_bids (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, team_id TEXT NOT NULL, amount INTEGER NOT NULL, counter_amount INTEGER,
    last_action_by TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL, scheduled_at TEXT);
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
    unread_count INTEGER NOT NULL DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT
  );
  CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_type TEXT NOT NULL, sender_name TEXT NOT NULL, body TEXT NOT NULL, metadata TEXT, sent_at TEXT);
  CREATE TABLE departed_players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, age INTEGER, position TEXT, overall_rating INTEGER, avatar TEXT);
  CREATE TABLE transfer_offer_swap_players (offer_id TEXT NOT NULL, player_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (offer_id, player_id));
  CREATE TABLE team_achievements (team_id TEXT NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT NOT NULL, tier TEXT, meta TEXT, PRIMARY KEY (team_id, achievement_key));
  CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT, absences TEXT, simulated_at TEXT);
  CREATE TABLE match_player_stats (id TEXT, match_id TEXT, player_id TEXT, team_id TEXT, started INTEGER, minutes_played INTEGER, goals INTEGER DEFAULT 0, assists INTEGER DEFAULT 0, yellow_cards INTEGER DEFAULT 0, red_cards INTEGER DEFAULT 0, rating REAL)
`;

const TABLES_TO_CLEAR = [
  "messages", "conversations", "sponsor_contracts", "transfer_installments", "sell_on_clauses", "transactions",
  "transfer_offer_events", "transfer_bids", "transfer_listings", "player_contracts", "transfer_offer_swap_players",
  "transfer_offers", "players", "free_agents", "scout_reports", "player_watchlist", "news", "managers", "teams",
  "villages", "leagues", "seasons", "season_calendar", "departed_players", "team_achievements", "player_promises",
  "injuries", "club_links", "loan_agreements", "matches", "match_player_stats",
];

export interface TransferTestDb {
  miniflare: Miniflare;
  db: D1Database;
  env: Bindings;
  /** Vyprázdní tabulky a založí vesnici, soutěže, sezónu a tři lidské kluby (dva s U21). */
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export interface TestPlayer {
  id: string;
  teamId: string;
  age?: number;
  rating?: number;
  position?: string;
  lifeContext?: Record<string, unknown>;
  loanFrom?: string | null;
  loanUntil?: string | null;
  parentClubId?: string | null;
  nextMatchReturn?: number;
}

export interface TestOffer {
  id: string;
  playerId: string;
  from: string;
  to: string;
  amount: number;
  counterAmount?: number | null;
  status?: string;
  lastActionBy?: string | null;
  expiresAt?: string;
  offerType?: "transfer" | "loan";
  loanDuration?: number | null;
  targetSquad?: "senior" | "u21";
  sellOnPct?: number;
}

async function runStatements(db: D1Database, sql: string): Promise<void> {
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

export async function createTransferTestDb(): Promise<TransferTestDb> {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  const db = await miniflare.getD1Database("DB");
  await runStatements(db, SCHEMA);
  // Sliby hráčům a záznamy hostování přesně podle migrací.
  await runStatements(db, readFileSync(new URL("../../migrations/0268_player_promises.sql", import.meta.url), "utf8")
    .split("-- Sliby, které už běží")[0].replace(/--.*$/gm, ""));
  const loanMigration = readFileSync(new URL("../../migrations/0283_loan_market.sql", import.meta.url), "utf8");
  await runStatements(db, loanMigration.slice(loanMigration.indexOf("CREATE TABLE IF NOT EXISTS loan_agreements")).replace(/--.*$/gm, ""));

  const env = {
    DB: db,
    SESSION_KV: await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace,
    CACHE_KV: await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace,
    GEMINI_API_KEY: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "",
  } as unknown as Bindings;

  const team = (id: string, userId: string, name: string, budget: number, parent: string | null) => db.prepare(
    `INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'village')`,
  ).bind(id, userId, parent, parent ? "u21" : "senior", name, budget, TEST_GAME_DATE, parent ? "league-u21" : "league-a");

  return {
    miniflare, db, env,
    async reset() {
      for (const table of TABLES_TO_CLEAR) await db.prepare(`DELETE FROM ${table}`).run();
      await db.batch([
        db.prepare("INSERT INTO villages (id, name, district, lat, lng) VALUES ('village', 'Testov', 'Test', 49.0, 14.0)"),
        db.prepare("INSERT INTO leagues (id, district, league_type) VALUES ('league-a', 'Test', 'senior'), ('league-b', 'Jinde', 'senior'), ('league-u21', 'Test', 'u21')"),
        db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season', 1, 'active')"),
        db.prepare("INSERT INTO season_calendar (id, league_id, season_number) VALUES ('cal-a', 'league-a', 1), ('cal-b', 'league-b', 1)"),
        team("buyer-a", "user-buyer", "Kupující", 500_000, null),
        team("buyer-u21", "user-buyer", "Kupující U21", 0, "buyer-a"),
        team("seller-a", "user-seller", "Prodávající", 100_000, null),
        team("seller-u21", "user-seller", "Prodávající U21", 0, "seller-a"),
        team("third-a", "user-third", "Třetí klub", 500_000, null),
      ]);
    },
    async dispose() { await miniflare.dispose(); },
  };
}

export async function insertTestPlayer(db: D1Database, p: TestPlayer): Promise<void> {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, life_context, weekly_wage,
       loan_from_team_id, loan_until, parent_club_id, next_match_return, residence)
     VALUES (?, ?, 'Jan', ?, ?, ?, ?, ?, 300, ?, ?, ?, ?, 'Testov')`,
  ).bind(p.id, p.teamId, `Hráč ${p.id}`, p.age ?? 24, p.position ?? "MID", p.rating ?? 55,
    JSON.stringify(p.lifeContext ?? { condition: 100, morale: 50 }), p.loanFrom ?? null, p.loanUntil ?? null,
    p.parentClubId ?? null, p.nextMatchReturn ?? 0).run();
}

export async function insertTestOffer(db: D1Database, o: TestOffer): Promise<void> {
  await db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, counter_amount, status, expires_at,
       offer_type, loan_duration, last_action_by, target_squad, sell_on_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(o.id, o.playerId, o.from, o.to, o.amount, o.counterAmount ?? null, o.status ?? "pending", o.expiresAt ?? TEST_FUTURE,
    o.offerType ?? "transfer", o.loanDuration ?? null, o.lastActionBy === undefined ? o.from : o.lastActionBy,
    o.targetSquad ?? "senior", o.sellOnPct ?? 0).run();
}

export async function budgetOf(db: D1Database, teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())?.budget ?? NaN;
}
