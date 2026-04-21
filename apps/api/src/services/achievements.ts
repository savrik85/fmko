/**
 * Kořaly — vesnické achievementy (trofeje) za hráčovu cestu.
 *
 * Checker se volá po klíčových eventech:
 * - Po odehraném zápase (match-runner) → zápasové milníky, derby
 * - Po transferu (transfers.ts) → koupě/prodej milníky
 * - Po daily-tick → finanční a týdenní milníky
 *
 * Idempotentní: PRIMARY KEY (team_id, achievement_key) zabrání duplicitě.
 */

import { logger } from "../lib/logger";

export interface AchievementDef {
  key: string;
  icon: string;
  title: string;
  desc: string;
  tier: "bronze" | "silver" | "gold";
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Zápasové milníky ──
  { key: "first_win", icon: "🍺", title: "První pivo po výhře", desc: "Vyhrát první ligový zápas", tier: "bronze" },
  { key: "wins_10", icon: "🍻", title: "Hospodská pohoda", desc: "10 vítězství v kariéře", tier: "silver" },
  { key: "wins_50", icon: "🏆", title: "Pohár na polici", desc: "50 vítězství v kariéře", tier: "gold" },
  { key: "win_streak_3", icon: "🌶️", title: "Chuťovka", desc: "3 vítězství v řadě", tier: "bronze" },
  { key: "win_streak_5", icon: "🪓", title: "Drvoštěp", desc: "5 vítězství v řadě", tier: "gold" },
  { key: "big_win", icon: "💥", title: "Demolice", desc: "Vyhrát o 5+ gólů rozdílem", tier: "silver" },
  { key: "hat_trick", icon: "🐗", title: "Zabijačkový šampion", desc: "Nastřílet 5+ gólů v jednom zápase", tier: "gold" },
  { key: "clean_sheet", icon: "🧤", title: "Kluci mají vítr", desc: "Udržet čisté konto", tier: "bronze" },
  { key: "clean_sheets_5", icon: "🔒", title: "Nepropustný", desc: "5 čistých kont v kariéře", tier: "silver" },

  // ── Derby ──
  { key: "derby_first_win", icon: "🏘️", title: "Sousedské derby", desc: "Vyhrát první místní derby", tier: "silver" },
  { key: "derby_streak_3", icon: "🔥", title: "Vesnický král", desc: "Porazit soupeře z vlastní obce 3× v řadě", tier: "gold" },

  // ── Transferové ──
  { key: "first_signing", icon: "✍️", title: "První podpis", desc: "Koupit prvního hráče", tier: "bronze" },
  { key: "celebrity_signing", icon: "🎪", title: "Showman", desc: "Přivést celebritu do týmu", tier: "gold" },
  { key: "released_first", icon: "🔨", title: "Reforma kádru", desc: "Vyhodit prvního hráče", tier: "bronze" },

  // ── Finanční ──
  { key: "budget_500k", icon: "💰", title: "Kufr plný peněz", desc: "Mít na kontě přes 500 000 Kč", tier: "silver" },
  { key: "budget_1m", icon: "🏦", title: "Bankovní baron", desc: "Mít na kontě přes 1 000 000 Kč", tier: "gold" },

  // ── Milníky kariéry ──
  { key: "matches_10", icon: "🎟️", title: "Začátečník", desc: "Odehrát 10 ligových zápasů", tier: "bronze" },
  { key: "matches_50", icon: "🎩", title: "Kouč", desc: "Odehrát 50 ligových zápasů", tier: "silver" },
  { key: "matches_100", icon: "👑", title: "Šéftrenér", desc: "Odehrát 100 ligových zápasů", tier: "gold" },

  // ── Sezónní ──
  { key: "season_finished", icon: "🎂", title: "Výročí sezóny", desc: "Dokončit celou sezónu", tier: "silver" },
  { key: "champion", icon: "🏅", title: "Šampion kraje", desc: "Vyhrát krajský přebor", tier: "gold" },
];

const BY_KEY: Record<string, AchievementDef> = {};
for (const a of ACHIEVEMENTS) BY_KEY[a.key] = a;

/**
 * Odemkne achievement (pokud ještě nemá). Idempotentní.
 * Vrací true pokud je to čerstvě odemčené.
 */
async function award(db: D1Database, teamId: string, key: string, meta?: Record<string, unknown>): Promise<boolean> {
  const def = BY_KEY[key];
  if (!def) {
    logger.warn({ module: "achievements" }, `unknown achievement key: ${key}`);
    return false;
  }
  const res = await db.prepare(
    "INSERT OR IGNORE INTO team_achievements (team_id, achievement_key, earned_at, tier, meta) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, ?)"
  ).bind(teamId, key, def.tier, meta ? JSON.stringify(meta) : null).run()
    .catch((e) => { logger.warn({ module: "achievements" }, `award ${key} failed`, e); return null; });

  if (res && res.meta.changes > 0) {
    logger.info({ module: "achievements" }, `team ${teamId} unlocked ${key} (${def.title})`);
    return true;
  }
  return false;
}

/** Spočítá stats z odehraných ligových zápasů — výhry, čistá konta, forma. */
async function getMatchStats(db: D1Database, teamId: string): Promise<{
  wins: number;
  matches: number;
  cleanSheets: number;
  currentWinStreak: number;
  currentDerbyWinStreak: number;
  biggestWin: number; // rozdíl gólů v nejvyšší výhře
  topScoreInMatch: number; // nejvíc gólů týmu v jednom zápase
}> {
  const rows = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            ht.village_id as home_vid, at.village_id as away_vid, m.simulated_at
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE m.status = 'simulated' AND (m.home_team_id = ? OR m.away_team_id = ?)
     ORDER BY m.simulated_at ASC`
  ).bind(teamId, teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "achievements" }, "getMatchStats", e); return { results: [] as Record<string, unknown>[] }; });

  let wins = 0, cleanSheets = 0, biggestWin = 0, topScoreInMatch = 0;
  let streak = 0, derbyStreak = 0;
  let currentStreak = 0, currentDerbyStreak = 0;

  for (const r of rows.results) {
    const isHome = r.home_team_id === teamId;
    const own = (isHome ? r.home_score : r.away_score) as number;
    const opp = (isHome ? r.away_score : r.home_score) as number;
    const isDerby = !!r.home_vid && r.home_vid === r.away_vid;

    if (own > topScoreInMatch) topScoreInMatch = own;

    if (own > opp) {
      wins++;
      const diff = own - opp;
      if (diff > biggestWin) biggestWin = diff;
      currentStreak++;
      if (isDerby) currentDerbyStreak++;
      if (currentStreak > streak) streak = currentStreak;
      if (currentDerbyStreak > derbyStreak) derbyStreak = currentDerbyStreak;
    } else {
      currentStreak = 0;
      if (isDerby) currentDerbyStreak = 0;
    }
    if (opp === 0) cleanSheets++;
  }

  return {
    wins,
    matches: rows.results.length,
    cleanSheets,
    currentWinStreak: currentStreak,
    currentDerbyWinStreak: currentDerbyStreak,
    biggestWin,
    topScoreInMatch,
  };
}

/**
 * Checker po simulaci zápasu.
 * teamId = tým, pro kterého kontrolujeme (každý zápas kontroluje oba).
 * matchOutcome = detaily právě odehraného zápasu (aby šel detekovat např. "zrovna jsme vyhráli 5:0").
 */
export async function checkMatchAchievements(
  db: D1Database,
  teamId: string,
  matchOutcome: { own: number; opp: number; isDerby: boolean },
): Promise<string[]> {
  const unlocked: string[] = [];
  const push = (key: string) => { unlocked.push(key); };

  const stats = await getMatchStats(db, teamId);

  // Jednorázové milníky na základě stavu
  if (stats.wins >= 1 && await award(db, teamId, "first_win")) push("first_win");
  if (stats.wins >= 10 && await award(db, teamId, "wins_10")) push("wins_10");
  if (stats.wins >= 50 && await award(db, teamId, "wins_50")) push("wins_50");
  if (stats.currentWinStreak >= 3 && await award(db, teamId, "win_streak_3")) push("win_streak_3");
  if (stats.currentWinStreak >= 5 && await award(db, teamId, "win_streak_5")) push("win_streak_5");
  if (stats.biggestWin >= 5 && await award(db, teamId, "big_win")) push("big_win");
  if (stats.topScoreInMatch >= 5 && await award(db, teamId, "hat_trick")) push("hat_trick");
  if (stats.cleanSheets >= 1 && await award(db, teamId, "clean_sheet")) push("clean_sheet");
  if (stats.cleanSheets >= 5 && await award(db, teamId, "clean_sheets_5")) push("clean_sheets_5");
  if (stats.matches >= 10 && await award(db, teamId, "matches_10")) push("matches_10");
  if (stats.matches >= 50 && await award(db, teamId, "matches_50")) push("matches_50");
  if (stats.matches >= 100 && await award(db, teamId, "matches_100")) push("matches_100");

  // Derby výhra
  if (matchOutcome.isDerby && matchOutcome.own > matchOutcome.opp) {
    if (await award(db, teamId, "derby_first_win")) push("derby_first_win");
    if (stats.currentDerbyWinStreak >= 3 && await award(db, teamId, "derby_streak_3")) push("derby_streak_3");
  }

  return unlocked;
}

/** Po přestupu — nový hráč do týmu. */
export async function checkTransferAchievements(
  db: D1Database,
  buyerTeamId: string,
  playerInfo: { isCelebrity: boolean },
): Promise<string[]> {
  const unlocked: string[] = [];
  if (await award(db, buyerTeamId, "first_signing")) unlocked.push("first_signing");
  if (playerInfo.isCelebrity && await award(db, buyerTeamId, "celebrity_signing")) unlocked.push("celebrity_signing");
  return unlocked;
}

/** Po release (uvolnění) hráče. */
export async function checkReleaseAchievements(db: D1Database, teamId: string): Promise<string[]> {
  const unlocked: string[] = [];
  if (await award(db, teamId, "released_first")) unlocked.push("released_first");
  return unlocked;
}

/** Po daily-tick — finance. */
export async function checkFinanceAchievements(db: D1Database, teamId: string, budget: number): Promise<string[]> {
  const unlocked: string[] = [];
  if (budget >= 500_000 && await award(db, teamId, "budget_500k")) unlocked.push("budget_500k");
  if (budget >= 1_000_000 && await award(db, teamId, "budget_1m")) unlocked.push("budget_1m");
  return unlocked;
}

/**
 * Backfill — projít historii týmu a odemknout všechny achievementy kterých už
 * dosáhl. Bezpečně idempotentní (INSERT OR IGNORE).
 * Pokrývá: zápasové milníky, derby, finance, transferové (podle DB stavu).
 */
export async function backfillTeamAchievements(db: D1Database, teamId: string): Promise<string[]> {
  const unlocked: string[] = [];
  const push = (key: string) => { unlocked.push(key); };

  // ── Zápasové ──
  const stats = await getMatchStats(db, teamId);
  if (stats.wins >= 1 && await award(db, teamId, "first_win")) push("first_win");
  if (stats.wins >= 10 && await award(db, teamId, "wins_10")) push("wins_10");
  if (stats.wins >= 50 && await award(db, teamId, "wins_50")) push("wins_50");
  if (stats.currentWinStreak >= 3 && await award(db, teamId, "win_streak_3")) push("win_streak_3");
  if (stats.currentWinStreak >= 5 && await award(db, teamId, "win_streak_5")) push("win_streak_5");
  if (stats.biggestWin >= 5 && await award(db, teamId, "big_win")) push("big_win");
  if (stats.topScoreInMatch >= 5 && await award(db, teamId, "hat_trick")) push("hat_trick");
  if (stats.cleanSheets >= 1 && await award(db, teamId, "clean_sheet")) push("clean_sheet");
  if (stats.cleanSheets >= 5 && await award(db, teamId, "clean_sheets_5")) push("clean_sheets_5");
  if (stats.matches >= 10 && await award(db, teamId, "matches_10")) push("matches_10");
  if (stats.matches >= 50 && await award(db, teamId, "matches_50")) push("matches_50");
  if (stats.matches >= 100 && await award(db, teamId, "matches_100")) push("matches_100");

  // ── Derby ──
  const derbyRow = await db.prepare(
    `SELECT COUNT(*) as wins FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE m.status = 'simulated'
       AND ht.village_id = at.village_id AND ht.village_id IS NOT NULL
       AND ((m.home_team_id = ? AND m.home_score > m.away_score)
         OR (m.away_team_id = ? AND m.away_score > m.home_score))`
  ).bind(teamId, teamId).first<{ wins: number }>()
    .catch((e) => { logger.warn({ module: "achievements" }, "backfill derby count", e); return null; });
  if ((derbyRow?.wins ?? 0) >= 1 && await award(db, teamId, "derby_first_win")) push("derby_first_win");
  if (stats.currentDerbyWinStreak >= 3 && await award(db, teamId, "derby_streak_3")) push("derby_streak_3");

  // ── Finance ──
  const budgetRow = await db.prepare("SELECT budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number }>().catch((e) => { logger.warn({ module: "achievements" }, "backfill budget", e); return null; });
  if (budgetRow) {
    if (budgetRow.budget >= 500_000 && await award(db, teamId, "budget_500k")) push("budget_500k");
    if (budgetRow.budget >= 1_000_000 && await award(db, teamId, "budget_1m")) push("budget_1m");
  }

  // ── Transferové (z player_contracts historie) ──
  const signingRow = await db.prepare(
    "SELECT COUNT(*) as n FROM player_contracts WHERE team_id = ? AND join_type = 'transfer'"
  ).bind(teamId).first<{ n: number }>().catch((e) => { logger.warn({ module: "achievements" }, "backfill signings", e); return null; });
  if ((signingRow?.n ?? 0) >= 1 && await award(db, teamId, "first_signing")) push("first_signing");

  const celebRow = await db.prepare(
    `SELECT COUNT(*) as n FROM player_contracts pc
     JOIN players p ON p.id = pc.player_id
     WHERE pc.team_id = ? AND pc.join_type = 'transfer' AND p.is_celebrity = 1`
  ).bind(teamId).first<{ n: number }>().catch((e) => { logger.warn({ module: "achievements" }, "backfill celeb", e); return null; });
  if ((celebRow?.n ?? 0) >= 1 && await award(db, teamId, "celebrity_signing")) push("celebrity_signing");

  const releasedRow = await db.prepare(
    "SELECT COUNT(*) as n FROM player_contracts WHERE team_id = ? AND leave_type = 'released'"
  ).bind(teamId).first<{ n: number }>().catch((e) => { logger.warn({ module: "achievements" }, "backfill released", e); return null; });
  if ((releasedRow?.n ?? 0) >= 1 && await award(db, teamId, "released_first")) push("released_first");

  return unlocked;
}

/** Načíst všechny získané achievementy týmu. */
export async function getTeamAchievements(db: D1Database, teamId: string): Promise<Array<{
  key: string;
  earnedAt: string;
  def: AchievementDef | null;
}>> {
  const rows = await db.prepare(
    "SELECT achievement_key, earned_at FROM team_achievements WHERE team_id = ? ORDER BY earned_at DESC"
  ).bind(teamId).all<{ achievement_key: string; earned_at: string }>()
    .catch((e) => { logger.warn({ module: "achievements" }, "getTeamAchievements", e); return { results: [] as { achievement_key: string; earned_at: string }[] }; });

  return rows.results.map((r) => ({
    key: r.achievement_key,
    earnedAt: r.earned_at,
    def: BY_KEY[r.achievement_key] ?? null,
  }));
}
