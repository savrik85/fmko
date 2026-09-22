/**
 * Hlídání kurzů: vyplácí se sázení hráčům?
 *
 * Kurzový model může sedět v testech a na produkci se rozejít s realitou.
 * Přesně to se stalo v září 2026: model byl nafitovaný na testovací databázi
 * (3,4 gólu na zápas), produkce měla 4,9 a „víc než 6,5 gólu" vracelo
 * dvě koruny za vsazenou. Unit testy to z principu nepoznají, pracují
 * s čísly napsanými v kódu.
 *
 * Tady se to měří na tom, co se opravdu stalo. Pro každý kurz vypsaný na
 * odehraný zápas se spočítá, kolik by vrátila koruna vsazená na něj naslepo.
 * Když je průměr víc než 1 a nedá se to svést na náhodu, trh je podhodnocený
 * a hlídač (lib/watchdog.ts) to nahlásí adminům.
 *
 * Kurz v bet_odds je ten poslední před zápasem. Tikety si nesou kurz z doby
 * podání, ten se může o pár setin lišit, na průměru přes stovky tipů to nic
 * nemění.
 */

import { logger } from "../lib/logger";
import { gradeSelection, type SelectionResult } from "./grade";

const M = "betting-calibration";

/** Kolik dní odehraných zápasů se prochází. */
export const CALIBRATION_DAYS = 21;

/**
 * Herní datum, od kterého platí současný kurzový model. Starší kurzy se
 * nehodnotí.
 *
 * Hlídač má říkat, jestli prodělává model, který běží TEĎ. Bez téhle hranice
 * by po opravě ještě tři týdny každé ráno hlásil starou díru, dokud by
 * zápasy se starými kurzy nevypadly z okna. Přesně to se stalo 22. 9. 2026.
 *
 * Při každé změně modelu, která mění kurzy, se posune na den nasazení.
 */
export const MODEL_SINCE = "2026-09-22";

/** Pod tolik vyhodnocených tipů se trh neposuzuje, je to jen šum. */
export const CALIBRATION_MIN_N = 50;

/**
 * O kolik směrodatných chyb musí být návratnost nad korunou, aby to byl poplach.
 *
 * Tři, ne dvě: kontroluje se kolem dvaceti trhů denně a se dvěma by hlídač
 * planě křičel zhruba jednou za týden. Zářijovou díru by to i tak chytilo
 * s velkou rezervou (střelci 5,5, „víc než 6,5" 5,9 chyby).
 */
export const CALIBRATION_Z = 3;

export interface GradedOffer {
  leagueId: string;
  leagueName: string;
  market: string;
  selection: string;
  oddsX100: number;
  result: SelectionResult;
}

export interface MarketReturn {
  /** Čitelný název: „víc gólů" nebo „víc gólů · Okresní přebor Prachatice". */
  label: string;
  /** Vyhodnocených tipů (anulované se nepočítají). */
  n: number;
  /** Kolik v průměru vrátí vsazená koruna. Marže 8 % znamená zhruba 0,93. */
  meanReturn: number;
  /** O kolik směrodatných chyb je návratnost nad 1. */
  z: number;
  /** Návratnost je nad 1 a náhodou to vysvětlit nejde. */
  overpriced: boolean;
}

/** Skupina trhu. Obě strany gólové linie se sledují zvlášť, díra bývá jen na jedné. */
function marketGroup(market: string, selection: string): string {
  if (market === "1x2") return "výsledek";
  if (market === "dchance") return "dvojtip";
  if (market === "scorer") return "střelec";
  if (market === "totals") return selection.startsWith("over") ? "víc gólů" : "míň gólů";
  return market;
}

/**
 * Návratnost každého trhu, celkem i po soutěžích. Čistá funkce.
 *
 * Návratnost jednoho tipu je kurz, když vyšel, jinak nula. Směrodatná chyba
 * průměru se počítá z rozptylu téhož vzorku, takže vzácné tipy s vysokým
 * kurzem potřebují víc dat, než spustí poplach.
 */
export function marketReturns(offers: GradedOffer[]): MarketReturn[] {
  const skupiny = new Map<string, number[]>();
  const pridat = (label: string, r: number) => {
    const arr = skupiny.get(label) ?? [];
    arr.push(r);
    skupiny.set(label, arr);
  };

  for (const o of offers) {
    if (o.result === "void") continue;
    const r = o.result === "won" ? o.oddsX100 / 100 : 0;
    const g = marketGroup(o.market, o.selection);
    pridat(g, r);
    pridat(`${g} · ${o.leagueName}`, r);
  }

  const out: MarketReturn[] = [];
  for (const [label, rs] of skupiny) {
    const n = rs.length;
    const mean = rs.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const se = Math.sqrt(variance / n);
    const z = se > 0 ? (mean - 1) / se : 0;
    out.push({
      label, n, meanReturn: mean, z,
      overpriced: n >= CALIBRATION_MIN_N && mean > 1 && z >= CALIBRATION_Z,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "cs"));
}

/** Kurzy vypsané na zápasy odehrané za posledních CALIBRATION_DAYS dní, vyhodnocené. */
export async function loadGradedOffers(db: D1Database, days = CALIBRATION_DAYS): Promise<GradedOffer[]> {
  const rows = await db.prepare(
    `SELECT o.league_id, l.name AS league_name, o.market, o.selection, o.odds_x100,
            m.home_score, m.away_score,
            s.player_id AS appeared, COALESCE(s.goals, 0) AS goals
       FROM bet_odds o
       JOIN matches m ON m.id = o.match_id
       JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN leagues l ON l.id = o.league_id
       LEFT JOIN match_player_stats s
              ON o.market = 'scorer' AND s.match_id = o.match_id AND s.player_id = o.selection
      WHERE m.status = 'simulated' AND m.home_score IS NOT NULL
        AND sc.scheduled_at >= ?
        AND o.game_date >= ?`
  ).bind(new Date(Date.now() - days * 86_400_000).toISOString(), MODEL_SINCE).all<{
    league_id: string; league_name: string; market: string; selection: string; odds_x100: number;
    home_score: number; away_score: number; appeared: string | null; goals: number;
  }>();

  return rows.results.map((r) => {
    // Střelec potřebuje vědět, jestli hráč nastoupil. Ostatní trhy jen výsledek.
    const apps = new Map<string, number>(r.appeared ? [[r.selection, r.goals]] : []);
    return {
      leagueId: r.league_id,
      leagueName: r.league_name,
      market: r.market,
      selection: r.selection,
      oddsX100: r.odds_x100,
      result: gradeSelection(r.market, r.selection, { homeScore: r.home_score, awayScore: r.away_score }, apps),
    };
  });
}

/** Celá tabulka návratností za poslední období. */
export async function oddsCalibration(db: D1Database, days = CALIBRATION_DAYS): Promise<MarketReturn[]> {
  return marketReturns(await loadGradedOffers(db, days));
}

/** Jen trhy, na kterých kancelář prokazatelně prodělává. Pro hlídač. */
export async function overpricedMarkets(db: D1Database): Promise<MarketReturn[]> {
  const vse = await oddsCalibration(db);
  const drahe = vse.filter((m) => m.overpriced);
  if (drahe.length > 0) {
    logger.warn({ module: M }, `podhodnocené trhy: ${drahe.map((m) => `${m.label} ${m.meanReturn.toFixed(2)}`).join(", ")}`);
  }
  return drahe;
}
