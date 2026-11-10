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
import { BTTS_YES } from "./markets";

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
// 2026-10-11: engine podle rolí, STRENGTH_K 0,085 a úroveň gólů jen z kol nového
// enginu (engine-transition.ts) — hlídá se jen to, co od té doby běží.
// 2026-10-26: úroveň gólů se smršťuje k přehrání (LEVEL_PRIOR_MATCHES). Lístek na první
// kolo sezóny 3 (po 26. 10.) přepíše denní tick ten den ráno už novým modelem.
// 2026-10-30: úroveň gólů jen z kol aktuální sezóny, zvlášť pro domácí a hosty,
// a prior přeměřený na sezóně 3 (AI kluby v Budějovicích, výhoda domácích v Praze).
// 2026-11-10: přefit na sezóně 3. Vliv síly 0,085 → 0,035, poměr bází domácí : hosté
// 1,18 → 1,49, klubová výhoda domácích ze stejného vzorce jako engine a síla bez
// zraněných a podle uložené sestavy. POZOR: je to den po napsání opravy. Když se
// nasadí později, posunout na den nasazení, jinak hlídač bude soudit staré kurzy.
export const MODEL_SINCE = "2026-11-10";

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
  /** Pravděpodobnost, kterou tipu dával model (bet_odds.probability). Pro kalibraci po pásmech. */
  probability?: number;
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
  // Doplňkové trhy taky po stranách: díra bývá na favoritovi, nebo na outsiderovi.
  if (market === "handicap") return /_m\d+$/.test(selection) ? "handicap výhra o víc" : "handicap neprohra o víc";
  if (market === "goals_band") return "pásmo gólů";
  if (market === "btts") return selection === BTTS_YES ? "oba dají gól: ano" : "oba dají gól: ne";
  if (market === "team_totals") return /_over\d+$/.test(selection) ? "víc gólů týmu" : "míň gólů týmu";
  if (market === "result_total") return "výsledek a góly";
  return market;
}

const SELECTION_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "1x2": { "1": "výsledek: domácí", "X": "výsledek: remíza", "2": "výsledek: hosté" },
  dchance: { "1X": "dvojtip: domácí neprohrají", "12": "dvojtip: nebude remíza", "X2": "dvojtip: hosté neprohrají" },
};

/**
 * Skupina po výběru u trhů, kde má zápas od každého výběru jeden kurz. Jinde null:
 * gólové linie a handicapy mají na zápas víc kurzů, které spolu padají a stojí,
 * a počítat je jako nezávislé tipy by dělalo plané poplachy.
 */
function selectionGroup(market: string, selection: string): string | null {
  if (market === "btts") return marketGroup(market, selection);
  return SELECTION_LABELS[market]?.[selection] ?? null;
}

/** Kurzová pásma pro kalibraci: horní mez kurzu v setinách a popis. */
export const ODDS_BANDS: ReadonlyArray<{ below: number; label: string }> = [
  { below: 150, label: "kurz do 1,5" },
  { below: 200, label: "kurz 1,5 až 2" },
  { below: 300, label: "kurz 2 až 3" },
  { below: 500, label: "kurz 3 až 5" },
  { below: Infinity, label: "kurz 5 a víc" },
];

export function oddsBand(oddsX100: number): string {
  return (ODDS_BANDS.find((b) => oddsX100 < b.below) ?? ODDS_BANDS[ODDS_BANDS.length - 1]).label;
}

/** Pod tolik tipů se pásmo neposuzuje. */
export const BAND_MIN_N = 30;

/**
 * O kolik směrodatných chyb se musí počet výher lišit od toho, co čekal model.
 *
 * Přísnější než CALIBRATION_Z: pásem je kolem čtyřiceti a dívá se na ně každý den.
 * Díru ze sezóny 3 to chytí s rezervou: domácí s kurzem 5 a víc vyhráli 11 z 39
 * proti očekávaným 3,5 (4,2 chyby), hosté s kurzem do 1,5 vyhráli 23 ze 45 proti
 * očekávaným 35,5 (−4,7 chyby).
 */
export const BAND_Z = 3.5;

export interface BandCalibration {
  /** „výsledek: domácí · kurz 5 a víc" */
  label: string;
  n: number;
  /** Kolik tipů vyšlo. */
  wins: number;
  /** Kolik jich mělo vyjít podle modelu (součet pravděpodobností). */
  expectedWins: number;
  /** Kolik v průměru vrátí vsazená koruna. */
  meanReturn: number;
  /** (wins − expectedWins) / směrodatná chyba. Kladné = tip vychází častěji, než model čekal. */
  z: number;
  /** Model se v pásmu prokazatelně plete, jedním nebo druhým směrem. */
  miscalibrated: boolean;
}

/**
 * Kalibrace po výběrech a kurzových pásmech. Čistá funkce.
 *
 * Neměří návratnost, ale porovnává počet výher s tím, co čekal model. Je to
 * mnohem citlivější: u kurzu 12 má návratnost obrovský rozptyl a 39 tipů
 * s návratností 3,5 Kč za korunu ještě nebyl poplach, kdežto 11 výher místo
 * 3,5 je jasná věc.
 *
 * Hlásí se oba směry. Přeceněný favorit sám kancelář nic nestojí, ale proti
 * němu stojí podceněný outsider a jeho pásmo může mít zatím málo tipů.
 */
export function bandCalibration(offers: GradedOffer[]): BandCalibration[] {
  const groups = new Map<string, { n: number; wins: number; expected: number; variance: number; returned: number }>();
  for (const o of offers) {
    if (o.result === "void" || o.probability === undefined) continue;
    const side = selectionGroup(o.market, o.selection);
    if (!side) continue;
    const label = `${side} · ${oddsBand(o.oddsX100)}`;
    const g = groups.get(label) ?? { n: 0, wins: 0, expected: 0, variance: 0, returned: 0 };
    const p = Math.max(0, Math.min(1, o.probability));
    g.n++;
    g.expected += p;
    g.variance += p * (1 - p);
    if (o.result === "won") { g.wins++; g.returned += o.oddsX100 / 100; }
    groups.set(label, g);
  }

  const out: BandCalibration[] = [];
  for (const [label, g] of groups) {
    const z = g.variance > 0 ? (g.wins - g.expected) / Math.sqrt(g.variance) : 0;
    out.push({
      label, n: g.n, wins: g.wins, expectedWins: g.expected, meanReturn: g.returned / g.n, z,
      miscalibrated: g.n >= BAND_MIN_N && Math.abs(z) >= BAND_Z,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "cs"));
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
    // Výsledek a dvojtip i po výběrech. Jako celek se chyby vyruší: v sezóně 3 vracela
    // „1" 176 % a „2" 68 % a trh „výsledek" dohromady vypadal jen lehce ztrátově.
    const side = selectionGroup(o.market, o.selection);
    if (side && side !== g) pridat(side, r);
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
    `SELECT o.league_id, l.name AS league_name, o.market, o.selection, o.odds_x100, o.probability,
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
    probability: number | null;
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
      probability: r.probability ?? undefined,
      result: gradeSelection(r.market, r.selection, { homeScore: r.home_score, awayScore: r.away_score }, apps),
    };
  });
}

export interface CalibrationAlerts {
  /** Trhy, na kterých kancelář prokazatelně prodělává. */
  overpriced: MarketReturn[];
  /** Výběry a kurzová pásma, kde se model rozchází se skutečností. */
  bands: BandCalibration[];
}

/** Všechno, co má hlídač o kurzech nahlásit, z jednoho načtení. */
export async function calibrationAlerts(db: D1Database): Promise<CalibrationAlerts> {
  const offers = await loadGradedOffers(db);
  const overpriced = marketReturns(offers).filter((m) => m.overpriced);
  const bands = bandCalibration(offers).filter((b) => b.miscalibrated);
  if (overpriced.length > 0) {
    logger.warn({ module: M }, `podhodnocené trhy: ${overpriced.map((m) => `${m.label} ${m.meanReturn.toFixed(2)}`).join(", ")}`);
  }
  if (bands.length > 0) {
    logger.warn({ module: M }, `rozkalibrovaná pásma: ${bands.map((b) => `${b.label} ${b.wins}/${b.n} proti ${b.expectedWins.toFixed(1)}`).join(", ")}`);
  }
  return { overpriced, bands };
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
