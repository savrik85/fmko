/**
 * Doplňkové trhy sázkové kanceláře: handicap, přesný počet gólů v pásmu,
 * oba týmy dají gól, góly jednoho týmu a výsledek s počtem gólů.
 *
 * Čisté funkce, žádné I/O. Všechno se počítá ze STEJNÝCH rozdělení gólů jako
 * výsledek 1/X/2 a počet gólů (goalDistribution v odds-model.ts): góly každého
 * týmu jsou nezávislé negativně binomické, společné rozdělení skóre je jejich
 * součin. Trhy se tak nemůžou dostat do sporu: handicap −0,5 je přesně výhra,
 * pásma gólů jsou přesně rozdíly gólových linií a výsledek s góly se po sečtení
 * přes góly vrátí na 1/X/2.
 *
 * Kódy výběrů jsou součástí smlouvy s podanými tikety (bet_selections.selection
 * je kopie). Měnit je znamená rozbít vyhodnocení už vsazených tipů.
 */

import { goalDistribution, totalsProbabilities, type Lambdas } from "./odds-model";

/** Všechny trhy kanceláře. Stejný seznam hlídá CHECK v bet_odds (0259). */
export const BET_MARKETS = [
  "1x2", "dchance", "totals", "scorer",
  "handicap", "goals_band", "btts", "team_totals", "result_total",
] as const;
export type BetMarket = (typeof BET_MARKETS)[number];

/** Linie handicapu. Půlgólové, takže sázka nemůže skončit nerozhodně. */
export const HANDICAP_LINES = [1.5, 2.5] as const;

/** Linie gólů jednoho týmu. */
export const TEAM_TOTAL_LINES = [1.5, 2.5] as const;

export type Side = "home" | "away";

// ── Kódy výběrů ─────────────────────────────────────────────────────────────

/** Linie v kódu výběru: 2,5 → '25'. Stejně jako u trhu totals ('over25'). */
export function lineTag(line: number): string {
  return String(Math.round(line * 10));
}

/** Opak lineTag: '25' → 2,5. Vrací null u poškozeného kódu. */
export function parseLineTag(tag: string): number | null {
  if (!/^\d+$/.test(tag)) return null;
  return Number(tag) / 10;
}

/** Linie s desetinnou čárkou pro popisky: 2.5 → '2,5'. */
export function lineText(line: number): string {
  return line.toFixed(1).replace(".", ",");
}

/**
 * Handicap. 'home_m15' = domácí s handicapem −1,5 (vyhrají o 2 a víc),
 * 'away_p15' = hosté s +1,5 (neprohrají o víc než 1 gól).
 */
export function handicapCode(side: Side, sign: "m" | "p", line: number): string {
  return `${side}_${sign}${lineTag(line)}`;
}

export function parseHandicap(selection: string): { side: Side; sign: "m" | "p"; line: number } | null {
  const m = /^(home|away)_(m|p)(\d+)$/.exec(selection);
  if (!m) return null;
  const line = parseLineTag(m[3]);
  return line === null ? null : { side: m[1] as Side, sign: m[2] as "m" | "p", line };
}

/** Pásma celkového počtu gólů. `max` null = a víc. */
export const GOAL_BANDS = [
  { code: "goals_0_1", min: 0, max: 1, label: "Padne 0 až 1 gól" },
  { code: "goals_2_3", min: 2, max: 3, label: "Padne 2 až 3 góly" },
  { code: "goals_4_5", min: 4, max: 5, label: "Padne 4 až 5 gólů" },
  { code: "goals_6_plus", min: 6, max: null, label: "Padne 6 a víc gólů" },
] as const;

export function parseGoalBand(selection: string): { min: number; max: number | null } | null {
  const band = GOAL_BANDS.find((b) => b.code === selection);
  return band ? { min: band.min, max: band.max } : null;
}

export const BTTS_YES = "btts_yes";
export const BTTS_NO = "btts_no";

/** Góly týmu: 'home_over15', 'away_under25'. */
export function teamTotalCode(side: Side, dir: "over" | "under", line: number): string {
  return `${side}_${dir}${lineTag(line)}`;
}

export function parseTeamTotal(selection: string): { side: Side; dir: "over" | "under"; line: number } | null {
  const m = /^(home|away)_(over|under)(\d+)$/.exec(selection);
  if (!m) return null;
  const line = parseLineTag(m[3]);
  return line === null ? null : { side: m[1] as Side, dir: m[2] as "over" | "under", line };
}

/**
 * Výsledek a počet gólů: '1_over35' = domácí vyhrají a padne víc než 3,5 gólu.
 * Linie je v kódu, protože se vybírá pro každý zápas zvlášť (mainTotalLine)
 * a přes noc se může posunout. Podaný tip si ji nese s sebou.
 */
export function resultTotalCode(outcome: "1" | "X" | "2", dir: "over" | "under", line: number): string {
  return `${outcome}_${dir}${lineTag(line)}`;
}

export function parseResultTotal(selection: string): { outcome: "1" | "X" | "2"; dir: "over" | "under"; line: number } | null {
  const m = /^(1|X|2)_(over|under)(\d+)$/.exec(selection);
  if (!m) return null;
  const line = parseLineTag(m[3]);
  return line === null ? null : { outcome: m[1] as "1" | "X" | "2", dir: m[2] as "over" | "under", line };
}

// ── Pravděpodobnosti ────────────────────────────────────────────────────────

/**
 * Společné rozdělení skóre: grid[h][a] = P(domácí dají h, hosté a).
 * Stejná mřížka jako v outcomeProbabilities, jen se vrací celá.
 */
export function scoreGrid(l: Lambdas): number[][] {
  const dh = goalDistribution(l.home);
  const da = goalDistribution(l.away);
  return dh.map((ph) => da.map((pa) => ph * pa));
}

/** Součet pravděpodobností skóre, která splňují podmínku. */
function sumGrid(grid: number[][], pred: (h: number, a: number) => boolean): number {
  let s = 0;
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      if (pred(h, a)) s += grid[h][a];
    }
  }
  return s;
}

export interface HandicapProbs {
  /** Domácí vyhrají o víc než `line` (−line). */
  homeMinus: number;
  /** Hosté neprohrají o víc než `line` − 0,5 (+line). Doplněk homeMinus. */
  awayPlus: number;
  /** Hosté vyhrají o víc než `line`. */
  awayMinus: number;
  /** Domácí neprohrají o víc než `line` − 0,5. Doplněk awayMinus. */
  homePlus: number;
}

/**
 * Handicap na půlgólové linii. Dvě dvoucestné sázky: domácí −line proti
 * hostům +line a obráceně. Při linii 0,5 je homeMinus přesně výhra domácích.
 */
export function handicapProbabilities(l: Lambdas, line: number): HandicapProbs {
  const grid = scoreGrid(l);
  const homeMinus = sumGrid(grid, (h, a) => h - a > line);
  const awayMinus = sumGrid(grid, (h, a) => a - h > line);
  return { homeMinus, awayPlus: 1 - homeMinus, awayMinus, homePlus: 1 - awayMinus };
}

/**
 * Pásma celkového počtu gólů ve stejném pořadí jako GOAL_BANDS.
 *
 * Z TÉHOŽ rozdělení součtu gólů jako trh totals (totalsProbabilities), takže
 * pásmo 0 až 1 je na desetinná místa totéž co „míň než 1,5 gólu". Součet je 1.
 */
export function goalBandProbabilities(l: Lambdas): number[] {
  const dist = goalDistribution(l.home + l.away);
  return GOAL_BANDS.map((b) => {
    let p = 0;
    for (let k = b.min; k < dist.length && (b.max === null || k <= b.max); k++) p += dist[k];
    return p;
  });
}

/**
 * Oba týmy dají gól. Góly týmů jsou v modelu nezávislé, takže je to součin
 * pravděpodobností, že se trefí každý z nich.
 */
export function bothTeamsScoreProbability(l: Lambdas): number {
  const dh = goalDistribution(l.home);
  const da = goalDistribution(l.away);
  return (1 - dh[0]) * (1 - da[0]);
}

/** Góly jednoho týmu nad / pod půlgólovou linií. */
export function teamTotalProbabilities(mu: number, line: number): { over: number; under: number } {
  const dist = goalDistribution(mu);
  let under = 0;
  for (let k = 0; k < dist.length && k < line; k++) under += dist[k];
  return { over: 1 - under, under };
}

export interface ResultTotalProbs {
  homeOver: number; homeUnder: number;
  drawOver: number; drawUnder: number;
  awayOver: number; awayUnder: number;
}

/**
 * Výsledek 1/X/2 krát víc / míň gólů než linie. Šest možností, které se
 * navzájem vylučují a dají dohromady 1.
 */
export function resultTotalProbabilities(l: Lambdas, line: number): ResultTotalProbs {
  const grid = scoreGrid(l);
  const out: ResultTotalProbs = { homeOver: 0, homeUnder: 0, drawOver: 0, drawUnder: 0, awayOver: 0, awayUnder: 0 };
  for (let h = 0; h < grid.length; h++) {
    for (let a = 0; a < grid[h].length; a++) {
      const p = grid[h][a];
      const over = h + a > line;
      if (h > a) { if (over) out.homeOver += p; else out.homeUnder += p; }
      else if (h === a) { if (over) out.drawOver += p; else out.drawUnder += p; }
      else { if (over) out.awayOver += p; else out.awayUnder += p; }
    }
  }
  return out;
}

/**
 * Hlavní gólová linie zápasu: ta z nabízených, na které je „víc" a „míň"
 * nejblíž půl na půl. V běžné soutěži 3,5, v gólové 4,5 nebo 5,5.
 * Při shodě vyhrává nižší linie, aby výběr byl deterministický.
 */
export function mainTotalLine(l: Lambdas, lines: readonly number[]): number {
  let best = lines[0];
  let bestGap = Infinity;
  for (const line of lines) {
    const gap = Math.abs(totalsProbabilities(l, line).over - 0.5);
    if (gap < bestGap - 1e-12) { best = line; bestGap = gap; }
  }
  return best;
}

// ── Popisky ─────────────────────────────────────────────────────────────────

/** „1 gól", „2 góly", „5 gólů". */
export function goalsWord(n: number): string {
  if (n === 1) return "gól";
  if (n >= 2 && n <= 4) return "góly";
  return "gólů";
}

/**
 * Popisek handicapu z pohledu sázejícího.
 * −1,5 → „Sokol vyhraje o 2 a víc", +1,5 → „Lhota neprohraje o víc než 1 gól".
 */
export function handicapLabel(team: string, sign: "m" | "p", line: number): string {
  if (sign === "m") return `${team} vyhraje o ${Math.ceil(line)} a víc`;
  const n = Math.floor(line);
  return `${team} neprohraje o víc než ${n} ${goalsWord(n)}`;
}
