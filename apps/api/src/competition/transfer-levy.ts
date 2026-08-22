/**
 * Poplatky a odvody z přestupů, které plynou do pokladny soutěže.
 *
 * Dvě různé věci:
 *  - **meziligový poplatek** platí KUPUJÍCÍ, když bere hráče z jiné soutěže.
 *    Existoval už dřív jako pevných 20 %, jen mizel do vzduchu; nově má sazbu
 *    v sazebníku a přitéká soutěži kupujícího, která si tím chrání vlastní trh.
 *  - **odvod z přestupu uvnitř soutěže** platí PRODÁVAJÍCÍ z utržené částky.
 *    Výchozí sazba je nula, takže dokud si ho kluby neodhlasují, nic se neděje.
 */

import { logger } from "../lib/logger";
import { DEFAULT_RULES } from "./defaults";
import { recordCompetitionEntry } from "./ledger";
import { loadRules } from "./rules";

const M = "competition-transfer";

export interface TransferLevies {
  /** Sazba meziligového poplatku v procentech (výchozí 20). */
  adminFeePct: number;
  adminFee: number;
  /** Sazba odvodu z přestupu uvnitř soutěže v procentech (výchozí 0). */
  levyPct: number;
  levy: number;
}

async function seasonOf(db: D1Database, leagueId: string): Promise<number | null> {
  const row = await db.prepare(
    "SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?"
  ).bind(leagueId).first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `sezóna ligy ${leagueId}`, e); return null; });
  return row?.n ?? null;
}

/** Je některá strana obchodu v mládežnické soutěži? */
async function jeMladeznicka(
  db: D1Database, a: string | null | undefined, b: string | null | undefined,
): Promise<boolean> {
  const ids = [a, b].filter(Boolean) as string[];
  if (ids.length === 0) return false;
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM leagues
      WHERE id IN (${ids.map(() => "?").join(",")}) AND league_type = 'u21'`
  ).bind(...ids).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "typ soutěže u přestupu", e); return null; });
  return (row?.n ?? 0) > 0;
}

/**
 * Spočítá oba poplatky. Nezapisuje nic — slouží i pro náhled nabídky,
 * aby kupující viděl přesně tu částku, která se mu pak strhne.
 */
export async function computeTransferLevies(db: D1Database, opts: {
  buyerLeagueId: string | null | undefined;
  sellerLeagueId: string | null | undefined;
  amount: number;
  isLoan: boolean;
}): Promise<TransferLevies> {
  const none: TransferLevies = {
    adminFeePct: DEFAULT_RULES.interleague_fee_pct, adminFee: 0,
    levyPct: DEFAULT_RULES.levy_transfer_pct, levy: 0,
  };
  if (opts.isLoan || opts.amount <= 0) return none;

  // Mládežnická soutěž se nepočítá. Meziligový poplatek je od toho, aby se
  // platil přestup mezi SOUTĚŽEMI dospělých — přesun do rezervy nebo z ní je
  // interní věc klubu a soutěž z něj nemá co brát. Bez tohohle se dvacet procent
  // strhávalo i za vlastní odchovance, protože U21 má vlastní ligu.
  const mladez = await jeMladeznicka(db, opts.buyerLeagueId, opts.sellerLeagueId);
  if (mladez) return none;

  const crossLeague = !!(opts.buyerLeagueId && opts.sellerLeagueId
    && opts.buyerLeagueId !== opts.sellerLeagueId);

  if (crossLeague) {
    const season = opts.buyerLeagueId ? await seasonOf(db, opts.buyerLeagueId) : null;
    const rules = opts.buyerLeagueId && season ? await loadRules(db, opts.buyerLeagueId, season) : null;
    const pct = rules?.interleague_fee_pct ?? DEFAULT_RULES.interleague_fee_pct;
    return { ...none, adminFeePct: pct, adminFee: Math.round(opts.amount * pct / 100) };
  }

  // Stejná soutěž — meziligový poplatek se neplatí, může se ale platit odvod.
  const season = opts.sellerLeagueId ? await seasonOf(db, opts.sellerLeagueId) : null;
  const rules = opts.sellerLeagueId && season ? await loadRules(db, opts.sellerLeagueId, season) : null;
  const pct = rules?.levy_transfer_pct ?? DEFAULT_RULES.levy_transfer_pct;
  return { ...none, levyPct: pct, levy: Math.round(opts.amount * pct / 100) };
}

/**
 * Zapíše výnos do pokladny. Klubovou stranu (stržení kupujícímu / prodávajícímu)
 * řeší volající, aby zůstala uvnitř své dávky transakcí.
 *
 * `offerId` v reference_id drží idempotenci — jedna nabídka se přijímá jednou.
 */
export async function recordTransferLevies(db: D1Database, opts: {
  levies: TransferLevies;
  buyerLeagueId: string | null | undefined;
  sellerLeagueId: string | null | undefined;
  buyerTeamId: string;
  sellerTeamId: string;
  offerId: string;
  gameDate: string;
}): Promise<void> {
  const { levies } = opts;

  if (levies.adminFee > 0 && opts.buyerLeagueId) {
    const season = await seasonOf(db, opts.buyerLeagueId);
    if (season) {
      await recordCompetitionEntry(db, {
        leagueId: opts.buyerLeagueId, seasonNumber: season, type: "interleague_fee",
        amount: levies.adminFee, description: "Meziligový přestupní poplatek",
        teamId: opts.buyerTeamId, gameDate: opts.gameDate, referenceId: `ilf-${opts.offerId}`,
      });
    }
  }

  if (levies.levy > 0 && opts.sellerLeagueId) {
    const season = await seasonOf(db, opts.sellerLeagueId);
    if (season) {
      await recordCompetitionEntry(db, {
        leagueId: opts.sellerLeagueId, seasonNumber: season, type: "levy_transfer",
        amount: levies.levy, description: "Odvod z přestupu uvnitř soutěže",
        teamId: opts.sellerTeamId, gameDate: opts.gameDate, referenceId: `ilt-${opts.offerId}`,
      });
    }
  }
}
