/**
 * Pokladna soutěže — jediný způsob, jak měnit její zůstatek.
 *
 * ZDROJ PRAVDY JE SUM(competition_ledger.amount). Sloupec balance_cache na
 * competition_governance je jen cache pro rychlé čtení; schůze ho jednou týdně
 * přepočítá, takže případný rozjezd se sám srovná.
 *
 * IDEMPOTENCE stojí výhradně na partial UNIQUE indexu nad reference_id. Fronty
 * doručují „aspoň jednou", takže každý zápis odvozený od zápasu, kola nebo sezóny
 * MUSÍ mít stabilní reference_id — jinak se odměna zaúčtuje dvakrát.
 *
 * Tahle funkce ZÁMĚRNĚ nikdy nehází výjimku kvůli zůstatku. Prázdná pokladna
 * nesmí shodit zpracování kola; záporný stav se řeší až při rolloveru.
 */

import { logger } from "../lib/logger";

const M = "competition-ledger";

export type LedgerType =
  | "subsidy"          // svazová dotace
  | "entry_fee"        // startovné od klubu
  | "sponsor"          // sponzorské plnění
  | "match_bonus"      // prémie za výhru/remízu
  | "referee_fee"      // odměna rozhodčímu
  | "place_reward"     // odměna za konečné umístění
  | "fine_referee"     // pokuta za výroky o rozhodčím
  | "fine_admin"       // svazová administrativní pokuta
  | "sanction"         // pokuta uložená disciplinárkou soutěže
  | "interleague_fee"  // meziligový přestupní poplatek
  | "levy_transfer"    // odvod z přestupu uvnitř soutěže
  | "levy_concession"  // odvod z občerstvení
  | "levy_gate"        // odvod ze vstupného
  | "levy_cup"         // odvod z pohárové odměny
  | "grant"            // dotace, cena nebo půjčka klubu
  | "loan_repaid"      // splátka bezúročné půjčky ze sezónní odměny
  | "deposit"          // kauce za návrh
  | "other";

export interface LedgerEntry {
  leagueId: string;
  seasonNumber: number;
  type: LedgerType;
  /** Kladné = příjem pokladny, záporné = výdaj. */
  amount: number;
  description: string;
  gameDate: string;
  teamId?: string | null;
  /** Stabilní klíč proti dvojímu zaúčtování. Bez něj zápis idempotentní NENÍ. */
  referenceId?: string | null;
}

export interface LedgerResult {
  written: boolean;
  balance: number | null;
}

/**
 * Zapíše pohyb do pokladny. Pořadí kroků je závazné:
 *   1) INSERT OR IGNORE — jediný rozhodčí o idempotenci
 *   2) posun cache
 *   3) doplnění balance_after
 * Když selže krok 2 nebo 3, součet v ledgeru je pořád správně.
 */
export async function recordCompetitionEntry(
  db: D1Database, entry: LedgerEntry,
): Promise<LedgerResult> {
  if (!Number.isFinite(entry.amount) || entry.amount === 0) return { written: false, balance: null };

  const amount = Math.round(entry.amount);
  const id = crypto.randomUUID();

  const ins = await db.prepare(
    `INSERT OR IGNORE INTO competition_ledger
       (id, league_id, season_number, type, amount, description, team_id, game_date, reference_id)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, entry.leagueId, entry.seasonNumber, entry.type, amount,
    entry.description, entry.teamId ?? null, entry.gameDate, entry.referenceId ?? null,
  ).run().catch((e) => {
    logger.warn({ module: M }, `zápis do pokladny ${entry.leagueId} (${entry.type})`, e);
    return null;
  });

  // changes === 0 znamená, že reference_id už v pokladně je — tenhle pohyb je zaúčtovaný.
  if (!ins || (ins.meta?.changes ?? 0) === 0) return { written: false, balance: null };

  const updated = await db.prepare(
    `UPDATE competition_governance
        SET balance_cache = balance_cache + ?, balance_synced_at = ?
      WHERE league_id = ? RETURNING balance_cache`
  ).bind(amount, entry.gameDate, entry.leagueId).first<{ balance_cache: number }>()
    .catch((e) => { logger.warn({ module: M }, `posun cache pokladny ${entry.leagueId}`, e); return null; });

  if (updated) {
    await db.prepare("UPDATE competition_ledger SET balance_after = ? WHERE id = ?")
      .bind(updated.balance_cache, id).run()
      .catch((e) => logger.warn({ module: M }, "doplnění balance_after", e));
  }

  return { written: true, balance: updated?.balance_cache ?? null };
}

/** Autoritativní zůstatek — součet celého ledgeru, ne cache. */
export async function readBalance(db: D1Database, leagueId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM competition_ledger WHERE league_id = ?"
  ).bind(leagueId).first<{ total: number }>()
    .catch((e) => { logger.warn({ module: M }, `součet pokladny ${leagueId}`, e); return null; });
  return row?.total ?? 0;
}

/** Srovná cache podle skutečného součtu. Volá se na každé schůzi. */
export async function recomputeBalance(
  db: D1Database, leagueId: string, gameDate: string,
): Promise<number> {
  const total = await readBalance(db, leagueId);
  await db.prepare(
    "UPDATE competition_governance SET balance_cache = ?, balance_synced_at = ? WHERE league_id = ?"
  ).bind(total, gameDate, leagueId).run()
    .catch((e) => logger.warn({ module: M }, `srovnání cache pokladny ${leagueId}`, e));
  return total;
}

/** Bilance sezóny rozpadlá po typech — pro stránku Pokladna. */
export async function seasonSummary(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<Array<{ type: string; total: number; count: number }>> {
  const rows = await db.prepare(
    `SELECT type, SUM(amount) AS total, COUNT(*) AS count
       FROM competition_ledger WHERE league_id = ? AND season_number = ?
      GROUP BY type ORDER BY total DESC`
  ).bind(leagueId, seasonNumber).all<{ type: string; total: number; count: number }>()
    .catch((e) => { logger.warn({ module: M }, `souhrn pokladny ${leagueId}`, e); return { results: [] }; });
  return rows.results;
}
