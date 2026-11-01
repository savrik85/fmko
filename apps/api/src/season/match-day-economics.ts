/**
 * Zápasový účet a zápasové dny v prognóze financí.
 *
 * Prognóza v `/budget` brala jen pravidelné týdenní položky (mzdy, sponzoři, dotace).
 * Vstupné, bufet, tombola, výdaje zápasu, prémie ani autobus v ní nebyly, takže na produ
 * (od 5. 10.) pokrývala zhruba třetinu skutečného výsledku. Klub s vlastním bufetem měl
 * prognózu „bankrot za 7 týdnů“ a ve skutečnosti vydělával 100 tis. měsíčně.
 *
 * Zápasové transakce nesou v `reference_id` id zápasu, takže jdou sečíst za konkrétní
 * zápas. Nákup zboží do bufetu se zápasu nepřiřazuje, rozpočítá se na domácí zápasy.
 */

import { logger } from "../lib/logger";

const M = "match-day-economics";

/** Kolik posledních zápasů tvoří průměr zápasového dne. */
export const MATCH_SAMPLE = 3;
/** Za jak dlouhé období se rozpočítá nákup zboží do bufetu. */
const WHOLESALE_WINDOW_DAYS = 28;

/** Splátka půjčky je dluh, ne ekonomika zápasu: prognóza ji počítá zvlášť. */
const EXCLUDED_TYPES = ["cash_loan_repayment"];

const LABELS: Record<string, string> = {
  match_income: "Vstupné",
  concession_income_self: "Bufet, tržby",
  concession_income_external: "Bufet, pronájem plochy",
  raffle_income: "Tombola",
  match_expense: "Výdaje zápasu",
  match_reward: "Bonusy za výsledek",
  bus_subsidy: "Autobus",
  promotional_campaign: "Propagace",
  vip_income: "VIP lóže",
};

export interface MatchAccountLine {
  label: string;
  amount: number;
  /** Popis z účetnictví (např. „Vstupné: 156 × 44 Kč“). */
  detail: string | null;
}

export interface MatchDayAccount {
  matchId: string;
  opponent: string;
  date: string | null;
  attendance: number | null;
  lines: MatchAccountLine[];
  /** Zboží do bufetu: průměr za poslední čtyři týdny na domácí zápas (odhad, ne přímo zápas). */
  wholesaleEstimate: number;
  total: number;
}

/** Řádky účtu z transakcí jednoho zápasu, sloučené podle typu (popis z první položky). */
export function accountLines(rows: Array<{ type: string; amount: number; description: string | null }>): MatchAccountLine[] {
  const byType = new Map<string, MatchAccountLine>();
  for (const r of rows) {
    if (EXCLUDED_TYPES.includes(r.type)) continue;
    const line = byType.get(r.type);
    if (line) {
      line.amount += r.amount;
      line.detail = null; // víc položek stejného typu: popis jedné by klamal
    } else {
      byType.set(r.type, { label: LABELS[r.type] ?? r.description ?? r.type, amount: r.amount, detail: r.description });
    }
  }
  return [...byType.values()].sort((a, b) => b.amount - a.amount);
}

async function wholesalePerHomeMatch(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE team_id = ?1 AND type = 'concession_wholesale' AND julianday(created_at) > julianday('now') - ${WHOLESALE_WINDOW_DAYS}) AS spent,
       (SELECT COUNT(*) FROM matches
         WHERE home_team_id = ?1 AND status = 'simulated' AND calendar_id IS NOT NULL
           AND julianday(simulated_at) > julianday('now') - ${WHOLESALE_WINDOW_DAYS}) AS homes`,
  ).bind(teamId).first<{ spent: number; homes: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "nákup zboží do bufetu", e); return null; });
  if (!row || row.homes <= 0) return 0;
  return Math.round(row.spent / row.homes);
}

/** Účet posledního domácího zápasu s účetními položkami (liga i přátelák), nebo null. */
export async function lastHomeMatchAccount(db: D1Database, teamId: string): Promise<MatchDayAccount | null> {
  const match = await db.prepare(
    `SELECT m.id, m.attendance, m.simulated_at, t.name AS opponent FROM matches m JOIN teams t ON t.id = m.away_team_id
      WHERE m.home_team_id = ?1 AND m.status = 'simulated'
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.reference_id = m.id AND t.team_id = ?1)
      ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId).first<{ id: string; attendance: number | null; simulated_at: string | null; opponent: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "poslední domácí zápas", e); return null; });
  if (!match) return null;
  const rows = await db.prepare("SELECT type, amount, description FROM transactions WHERE team_id = ? AND reference_id = ?")
    .bind(teamId, match.id).all<{ type: string; amount: number; description: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "transakce zápasu", e); return { results: [] as Array<{ type: string; amount: number; description: string | null }> }; });
  const lines = accountLines(rows.results);
  if (!lines.length) return null;
  const wholesaleEstimate = await wholesalePerHomeMatch(db, teamId);
  const total = lines.reduce((s, l) => s + l.amount, 0) + wholesaleEstimate;
  return { matchId: match.id, opponent: match.opponent, date: match.simulated_at, attendance: match.attendance, lines, wholesaleEstimate, total };
}

export interface MatchDayAverages {
  /** Čistý výsledek průměrného domácího zápasu i se zbožím do bufetu, null bez historie. */
  home: number | null;
  away: number | null;
  homeSample: number;
  awaySample: number;
}

/** Průměr posledních MATCH_SAMPLE domácích a venkovních zápasů z jejich transakcí. */
export async function matchDayAverages(db: D1Database, teamId: string): Promise<MatchDayAverages> {
  const rows = await db.prepare(
    `WITH recent AS (
       SELECT id, home_team_id = ?1 AS is_home,
              ROW_NUMBER() OVER (PARTITION BY home_team_id = ?1 ORDER BY simulated_at DESC) AS rn
         FROM matches
        -- Jen liga: prognóza počítá zbývající ligové zápasy, přáteláky bez bufetu by průměr zkreslily.
        WHERE status = 'simulated' AND calendar_id IS NOT NULL AND (home_team_id = ?1 OR away_team_id = ?1)
     )
     SELECT r.is_home, r.id, COALESCE(SUM(CASE WHEN t.type NOT IN (${EXCLUDED_TYPES.map((x) => `'${x}'`).join(",")}) THEN t.amount END), 0) AS net
       FROM recent r LEFT JOIN transactions t ON t.reference_id = r.id AND t.team_id = ?1
      WHERE r.rn <= ${MATCH_SAMPLE}
      GROUP BY r.is_home, r.id`,
  ).bind(teamId).all<{ is_home: number; id: string; net: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "průměr zápasových dnů", e); return { results: [] as Array<{ is_home: number; id: string; net: number }> }; });
  const homes = rows.results.filter((r) => r.is_home === 1);
  const aways = rows.results.filter((r) => r.is_home !== 1);
  const avg = (xs: Array<{ net: number }>) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.net, 0) / xs.length) : null);
  const wholesale = homes.length ? await wholesalePerHomeMatch(db, teamId) : 0;
  const homeAvg = avg(homes);
  return {
    home: homeAvg === null ? null : homeAvg + wholesale,
    away: avg(aways),
    homeSample: homes.length,
    awaySample: aways.length,
  };
}

/**
 * Pravidelné výdaje, které týdenní model v `/budget` nezná: události, cesty skauta, úkoly
 * zaměstnanců, poplatky soutěži, akademie, posezení s trenéry a pokuty. Průměr za
 * poslední čtyři týdny. Mzdy, údržba, vybavení a trénink jsou v modelu, tady nejsou.
 */
export const OTHER_RUNNING_TYPES = [
  "event", "scout_travel", "staff_task", "competition_fee", "youth_academy", "manager_social",
  "disciplinary_fine", "incident_fine", "incident_deduction", "incident_advance",
] as const;

export async function otherRunningCostsPerWeek(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
      WHERE team_id = ? AND type IN (${OTHER_RUNNING_TYPES.map((t) => `'${t}'`).join(",")})
        AND julianday(created_at) > julianday('now') - ${WHOLESALE_WINDOW_DAYS}`,
  ).bind(teamId).first<{ total: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "ostatní pravidelné výdaje", e); return null; });
  return Math.round((row?.total ?? 0) / (WHOLESALE_WINDOW_DAYS / 7));
}
