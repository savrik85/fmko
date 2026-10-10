/**
 * Vyhodnocení jednoho výběru na tiketu. Čistá funkce, žádné I/O.
 */

import {
  BTTS_YES, BTTS_NO, parseHandicap, parseGoalBand, parseTeamTotal, parseResultTotal,
} from "./markets";

export type SelectionResult = "won" | "lost" | "void";

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Kdo v zápase nastoupil a kolik dal gólů.
 *
 * Klíčem je ID hráče. Chybějící klíč znamená, že hráč VŮBEC nenastoupil —
 * match_player_stats má i střídající a i hráče s nulou, takže je ten test
 * spolehlivý (naměřeno 22,9 řádku na zápas).
 */
export type Appearances = Map<string, number>;

/**
 * Vyhodnotí jeden výběr.
 *
 * Pravidlo VOID u nenastoupivšího střelce není vstřícnost, ale nutnost: hra má
 * bohatou mechaniku absencí (kocovina, žně, zranění, stopky) a cizí sestavu
 * hráč před zápasem nevidí. Kdyby absence znamenala prohru, byl by trh na
 * střelce čirý hazard bez informace. Skutečné sázkovky to řeší stejně.
 */
export function gradeSelection(
  market: string, selection: string, result: MatchResult, apps: Appearances,
): SelectionResult {
  const total = result.homeScore + result.awayScore;

  if (market === "1x2") {
    const vysledek = result.homeScore > result.awayScore ? "1"
      : result.homeScore === result.awayScore ? "X" : "2";
    return selection === vysledek ? "won" : "lost";
  }

  if (market === "dchance") {
    const vyhraliDomaci = result.homeScore > result.awayScore;
    const remiza = result.homeScore === result.awayScore;
    if (selection === "1X") return vyhraliDomaci || remiza ? "won" : "lost";
    if (selection === "X2") return !vyhraliDomaci || remiza ? "won" : "lost";
    if (selection === "12") return remiza ? "lost" : "won";
    return "void";
  }

  if (market === "totals") {
    const line = parseLine(selection);
    if (line === null) return "void";
    if (selection.startsWith("over")) return total > line ? "won" : "lost";
    if (selection.startsWith("under")) return total < line ? "won" : "lost";
    return "void";
  }

  if (market === "scorer") {
    const goals = apps.get(selection);
    if (goals === undefined) return "void";   // vůbec nenastoupil
    return goals > 0 ? "won" : "lost";
  }

  // Doplňkové trhy (markets.ts). Všechny linie jsou půlgólové, takže žádný
  // z nich nemůže skončit nerozhodně a vrácení vkladu je jen pro poškozený kód.
  if (market === "handicap") {
    const h = parseHandicap(selection);
    if (!h) return "void";
    // Rozdíl skóre z pohledu sázeného týmu.
    const diff = h.side === "home" ? result.homeScore - result.awayScore : result.awayScore - result.homeScore;
    // −1,5: vyhrát o víc než 1,5, tedy o 2 a víc. +1,5: neprohrát o víc než 1.
    const won = h.sign === "m" ? diff > h.line : diff > -h.line;
    return won ? "won" : "lost";
  }

  if (market === "goals_band") {
    const band = parseGoalBand(selection);
    if (!band) return "void";
    return total >= band.min && (band.max === null || total <= band.max) ? "won" : "lost";
  }

  if (market === "btts") {
    const both = result.homeScore > 0 && result.awayScore > 0;
    if (selection === BTTS_YES) return both ? "won" : "lost";
    if (selection === BTTS_NO) return both ? "lost" : "won";
    return "void";
  }

  if (market === "team_totals") {
    const t = parseTeamTotal(selection);
    if (!t) return "void";
    const goals = t.side === "home" ? result.homeScore : result.awayScore;
    return (t.dir === "over" ? goals > t.line : goals < t.line) ? "won" : "lost";
  }

  if (market === "result_total") {
    const rt = parseResultTotal(selection);
    if (!rt) return "void";
    const outcome = result.homeScore > result.awayScore ? "1"
      : result.homeScore === result.awayScore ? "X" : "2";
    const goalsOk = rt.dir === "over" ? total > rt.line : total < rt.line;
    return outcome === rt.outcome && goalsOk ? "won" : "lost";
  }

  // Neznámý trh nemůže prohrát tiket — radši vrátit vklad než potrestat hráče
  // za chybu na naší straně.
  return "void";
}

/**
 * Linie z kódu výběru: 'over25' → 2.5, 'under65' → 6.5.
 * Linie jsou vždy půlgólové, takže výběr nemůže skončit remízou na trhu.
 */
function parseLine(selection: string): number | null {
  const cislice = selection.replace(/^(over|under)/, "");
  if (!/^\d+$/.test(cislice)) return null;
  const n = Number(cislice);
  // '25' znamená 2,5 — poslední číslice je desetina.
  return n / 10;
}

export interface TicketOutcome {
  status: "won" | "lost" | "void";
  /** Kurz po vyřazení anulovaných noh, v setinách. */
  effectiveOddsX100: number;
}

/**
 * Výsledek celého tiketu z výsledků jeho noh.
 *
 * Anulovaná noha se počítá kurzem 1,00 — sníží výplatu, ale tiket nezabije.
 * Když jsou anulované všechny, vrací se vklad.
 */
export function gradeTicket(
  legs: Array<{ result: SelectionResult; oddsX100: number }>,
): TicketOutcome {
  if (legs.length === 0) return { status: "void", effectiveOddsX100: 100 };
  if (legs.some((l) => l.result === "lost")) return { status: "lost", effectiveOddsX100: 0 };

  const zive = legs.filter((l) => l.result === "won");
  if (zive.length === 0) return { status: "void", effectiveOddsX100: 100 };

  const product = zive.reduce((acc, l) => (acc * l.oddsX100) / 100, 1);
  return { status: "won", effectiveOddsX100: Math.max(100, Math.floor(product * 100)) };
}
