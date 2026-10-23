/**
 * Revize účetnictví klubu — agenda komisaře pro integritu soutěže.
 *
 * Stejně jako kniha sázek a listina přestupů (`integrity.ts`) jen zpřístupní stopu
 * a zvýrazní, co stojí za pohled. Nic nesankcionuje: pokutu navrhuje člověk
 * přes disciplinárku. Revidovaný klub dostane SMS, ať nahlížení do cizích peněz
 * není potají.
 */

import { logger } from "../lib/logger";
import { getDefaultSellPrice, getProductCatalog } from "../season/concession-catalog";
import { listinaPrestupu } from "./integrity";

const M = "competition-club-audit";

/** Jak daleko do minulosti revize sahá (herní dny). Sezóna sama může mít za sebou jen pár dní. */
export const AUDIT_WINDOW_DAYS = 60;

/**
 * Od kolikanásobku mediánu soutěže je tržba bufetu za domácí zápas nápadná.
 * Poměr ke zbytku soutěže, ne pevná částka: návštěvy a ceny se mezi okresy liší.
 */
export const CONCESSION_FLAG_RATIO = 3;

const BETTING_TYPES = ["bet_stake", "bet_win", "bet_levy", "bet_refund", "bet_confiscated"];

export interface LedgerCategory { type: string; income: number; expense: number; count: number }
export interface LedgerItem { type: string; amount: number; description: string; gameDate: string | null }

export interface ClubAudit {
  teamId: string;
  teamName: string;
  budget: number;
  since: string;
  windowDays: number;
  income: number;
  expense: number;
  categories: LedgerCategory[];
  largest: LedgerItem[];
  items: LedgerItem[];
  /** Co stojí za pohled. Není to obvinění, jen zvýraznění. */
  flags: string[];
}

/** Datum (YYYY-MM-DD) o `days` herních dní dřív. */
export function windowStart(gameDate: string, days = AUDIT_WINDOW_DAYS): string {
  const d = new Date(gameDate);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

/** Tržba bufetu na domácí zápas pro každý klub soutěže v okně revize. */
export async function concessionPerMatch(
  db: D1Database, leagueId: string, since: string,
): Promise<Map<string, number>> {
  const rows = await db.prepare(
    `SELECT tx.team_id, SUM(tx.amount) AS total, COUNT(DISTINCT substr(tx.game_date, 1, 10)) AS matches
       FROM transactions tx JOIN teams t ON t.id = tx.team_id
      WHERE t.league_id = ? AND tx.type = 'concession_income_self' AND tx.amount > 0 AND tx.game_date >= ?
      GROUP BY tx.team_id`
  ).bind(leagueId, since).all<{ team_id: string; total: number; matches: number }>()
    .catch((e) => { logger.warn({ module: M }, `tržby bufetu soutěže ${leagueId}`, e); return { results: [] }; });
  const out = new Map<string, number>();
  for (const r of rows.results) {
    if (r.matches > 0) out.set(r.team_id, r.total / r.matches);
  }
  return out;
}

/** Čistý výsledek sázek (výhry a vrácené vklady minus vklady a odvody) pro kluby soutěže. */
export async function bettingNet(
  db: D1Database, leagueId: string, since: string,
): Promise<Map<string, number>> {
  const placeholders = BETTING_TYPES.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT tx.team_id, SUM(tx.amount) AS net
       FROM transactions tx JOIN teams t ON t.id = tx.team_id
      WHERE t.league_id = ? AND tx.type IN (${placeholders}) AND tx.game_date >= ?
      GROUP BY tx.team_id`
  ).bind(leagueId, ...BETTING_TYPES, since).all<{ team_id: string; net: number }>()
    .catch((e) => { logger.warn({ module: M }, `výsledky sázek soutěže ${leagueId}`, e); return { results: [] }; });
  return new Map(rows.results.map((r) => [r.team_id, r.net]));
}

export interface ConcessionPrice { productKey: string; qualityLevel: number; sellPrice: number }

/**
 * Cena, od které podle vzorce poptávky bufetu už nikdo nekoupí: běžná cena
 * × (1 + 1 / elasticita). Pivo 2,25×, klobása 2,67×, svařák 3×, limo 3,5×.
 */
export function noBuyerPrice(productKey: string, qualityLevel: number): number | null {
  const catalog = getProductCatalog(productKey);
  const normal = getDefaultSellPrice(productKey, qualityLevel);
  if (!catalog || normal <= 0 || catalog.priceElasticity <= 0) return null;
  return normal * (1 + 1 / catalog.priceElasticity);
}

/**
 * Příznaky k revizi. Ceny v bufetu se měří vzorcem poptávky, tržby a sázky
 * se poměřují se zbytkem soutěže, přestupy přebírají příznaky z listiny
 * přestupů (týž majitel, cena mimo hodnotu hráče).
 */
export function auditFlags(opts: {
  teamId: string;
  teamName: string;
  concession: Map<string, number>;
  betting: Map<string, number>;
  transferFlags: Array<{ hrac: string; zKlubu: string | null; doKlubu: string; priznaky: string[] }>;
  prices?: ConcessionPrice[];
}): string[] {
  const flags: string[] = [];

  // Tržba za zápas přemrštěnou cenu neprozradí (běžné kluby vyberou 140–190 tisíc
  // na zápas taky), cena ano.
  for (const p of opts.prices ?? []) {
    const limit = noBuyerPrice(p.productKey, p.qualityLevel);
    if (limit == null || p.sellPrice < limit) continue;
    const label = getProductCatalog(p.productKey)?.label ?? p.productKey;
    flags.push(`Bufet: ${label.toLowerCase()} za ${czk(p.sellPrice)}, běžně ${czk(getDefaultSellPrice(p.productKey, p.qualityLevel))}.`);
  }

  const own = opts.concession.get(opts.teamId);
  const others = [...opts.concession.entries()].filter(([id]) => id !== opts.teamId).map(([, v]) => v);
  const leagueMedian = median(others);
  if (own != null && leagueMedian > 0 && own >= CONCESSION_FLAG_RATIO * leagueMedian) {
    const ratio = (own / leagueMedian).toFixed(1).replace(".", ",");
    flags.push(`Bufet vynáší na domácí zápas ${ratio}× víc než ostatní kluby soutěže (${czk(own)} proti ${czk(leagueMedian)}).`);
  }

  const net = opts.betting.get(opts.teamId) ?? 0;
  const best = Math.max(0, ...[...opts.betting.values()]);
  if (net > 0 && net >= best) {
    flags.push(`Na sázkách vydělal nejvíc z celé soutěže: ${czk(net)} čistého.`);
  }

  for (const t of opts.transferFlags) {
    if (t.priznaky.length === 0) continue;
    if (t.zKlubu !== opts.teamName && t.doKlubu !== opts.teamName) continue;
    const route = `${t.zKlubu ?? "volný hráč"} → ${t.doKlubu}`;
    for (const p of t.priznaky) flags.push(`Přestup ${t.hrac} (${route}): ${p}.`);
  }

  return flags;
}

/** Účetnictví klubu za okno revize: souhrn po druzích, největší položky a příznaky. */
export async function loadClubAudit(
  db: D1Database, opts: { leagueId: string; seasonNumber: number; targetTeamId: string; gameDate: string },
): Promise<ClubAudit | null> {
  const team = await db.prepare("SELECT id, name, budget FROM teams WHERE id = ? AND league_id = ?")
    .bind(opts.targetTeamId, opts.leagueId).first<{ id: string; name: string; budget: number }>()
    .catch((e) => { logger.warn({ module: M }, `klub k revizi ${opts.targetTeamId}`, e); return null; });
  if (!team) return null;

  const since = windowStart(opts.gameDate);

  const [categories, largest, items, concession, betting, transfers, prices] = await Promise.all([
    db.prepare(
      `SELECT type,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expense,
              COUNT(*) AS count
         FROM transactions WHERE team_id = ? AND game_date >= ?
        GROUP BY type ORDER BY (income + expense) DESC`
    ).bind(team.id, since).all<LedgerCategory>()
      .catch((e) => { logger.warn({ module: M }, `souhrn účetnictví ${team.id}`, e); return { results: [] as LedgerCategory[] }; }),
    db.prepare(
      `SELECT type, amount, description, game_date FROM transactions
        WHERE team_id = ? AND game_date >= ? ORDER BY ABS(amount) DESC LIMIT 10`
    ).bind(team.id, since).all<{ type: string; amount: number; description: string | null; game_date: string | null }>()
      .catch((e) => { logger.warn({ module: M }, `největší položky ${team.id}`, e); return { results: [] }; }),
    db.prepare(
      `SELECT type, amount, description, game_date FROM transactions
        WHERE team_id = ? AND game_date >= ? ORDER BY game_date DESC, created_at DESC LIMIT 300`
    ).bind(team.id, since).all<{ type: string; amount: number; description: string | null; game_date: string | null }>()
      .catch((e) => { logger.warn({ module: M }, `položky účetnictví ${team.id}`, e); return { results: [] }; }),
    concessionPerMatch(db, opts.leagueId, since),
    bettingNet(db, opts.leagueId, since),
    listinaPrestupu(db, opts.leagueId, opts.seasonNumber),
    db.prepare(
      "SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ? AND quality_level > 0"
    ).bind(team.id).all<{ product_key: string; quality_level: number; sell_price: number }>()
      .catch((e) => { logger.warn({ module: M }, `ceny bufetu ${team.id}`, e); return { results: [] }; }),
  ]);

  const toItem = (r: { type: string; amount: number; description: string | null; game_date: string | null }): LedgerItem =>
    ({ type: r.type, amount: r.amount, description: r.description ?? "", gameDate: r.game_date });

  const cats = categories.results;
  return {
    teamId: team.id,
    teamName: team.name,
    budget: team.budget,
    since,
    windowDays: AUDIT_WINDOW_DAYS,
    income: cats.reduce((s, c) => s + c.income, 0),
    expense: cats.reduce((s, c) => s + c.expense, 0),
    categories: cats,
    largest: largest.results.map(toItem),
    items: items.results.map(toItem),
    flags: auditFlags({
      teamId: team.id, teamName: team.name, concession, betting, transferFlags: transfers,
      prices: prices.results.map((p) => ({ productKey: p.product_key, qualityLevel: p.quality_level, sellPrice: p.sell_price })),
    }),
  };
}

/** Klub, který jde v soutěži revidovat, nebo null. */
export async function findAuditTarget(
  db: D1Database, leagueId: string, targetTeamId: string,
): Promise<{ id: string; name: string } | null> {
  return db.prepare("SELECT id, name FROM teams WHERE id = ? AND league_id = ? AND parent_team_id IS NULL")
    .bind(targetTeamId, leagueId).first<{ id: string; name: string }>();
}

/**
 * Zapíše revizi. Vrací true, když jde o první revizi klubu v sezóně — jen tehdy
 * dostane klub SMS, aby opakované nahlédnutí nespamovalo.
 *
 * Chyba zápisu se NEpolyká: revize bez záznamu by byla nahlédnutí potají,
 * proto se pak účetnictví vůbec nezobrazí.
 */
export async function recordAudit(
  db: D1Database,
  opts: { leagueId: string; seasonNumber: number; targetTeamId: string; auditorTeamId: string; gameDate: string },
): Promise<boolean> {
  const res = await db.prepare(
    `INSERT OR IGNORE INTO competition_audits (league_id, season_number, target_team_id, auditor_team_id, game_date)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(opts.leagueId, opts.seasonNumber, opts.targetTeamId, opts.auditorTeamId, opts.gameDate).run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface AuditTarget { teamId: string; name: string; auditedAt: string | null }

/** Kluby soutěže, které jde revidovat, s datem revize v téhle sezóně. */
export async function listAuditTargets(
  db: D1Database, leagueId: string, seasonNumber: number, auditorTeamId: string,
): Promise<AuditTarget[]> {
  const rows = await db.prepare(
    `SELECT t.id, t.name, a.game_date AS audited_at
       FROM teams t
       LEFT JOIN competition_audits a
         ON a.target_team_id = t.id AND a.league_id = ? AND a.season_number = ?
      WHERE t.league_id = ? AND t.parent_team_id IS NULL AND t.id != ?
        AND t.user_id IS NOT NULL AND t.user_id != 'ai'
      ORDER BY t.name`
  ).bind(leagueId, seasonNumber, leagueId, auditorTeamId).all<{ id: string; name: string; audited_at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `kluby k revizi ${leagueId}`, e); return { results: [] }; });
  return rows.results.map((r) => ({ teamId: r.id, name: r.name, auditedAt: r.audited_at }));
}
