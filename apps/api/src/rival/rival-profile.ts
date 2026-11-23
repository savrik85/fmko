/**
 * Profil soupeře (záložka Soupeř na profilu týmu): výpočty bez databáze.
 * Načtení z D1 je v `rival-profile-data.ts`.
 */

import { logger } from "../lib/logger";

export type Outcome = "W" | "D" | "L";

/** Výsledek z pohledu prvního týmu. Pohár rozhodnutý na penalty je remíza, jak se to ve statistikách počítá. */
export function outcome(myScore: number, rivalScore: number): Outcome {
  return myScore > rivalScore ? "W" : myScore < rivalScore ? "L" : "D";
}

export interface RecordLine {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

const emptyRecord = (): RecordLine => ({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });

function addResult(r: RecordLine, myScore: number, rivalScore: number): void {
  r.played++;
  r.goalsFor += myScore;
  r.goalsAgainst += rivalScore;
  const o = outcome(myScore, rivalScore);
  if (o === "W") r.wins++;
  else if (o === "L") r.losses++;
  else r.draws++;
}

export function summarizeHeadToHead(matches: ReadonlyArray<{ myScore: number; rivalScore: number }>): RecordLine {
  const r = emptyRecord();
  for (const m of matches) addResult(r, m.myScore, m.rivalScore);
  return r;
}

/** Šest čtvrthodin: 1–15, 16–30, 31–45 (+ nastavení), 46–60, 61–75, 76–90 (+ nastavení). */
export const PERIOD_COUNT = 6;

export function periodIndex(minute: number): number {
  if (minute <= 45) return Math.max(0, Math.min(2, Math.floor((minute - 1) / 15)));
  return Math.min(5, 3 + Math.floor((minute - 46) / 15));
}

export interface GoalPeriods {
  scored: number[];
  conceded: number[];
}

interface MatchEvent {
  minute?: number;
  type?: string;
  /** Strana v zápase: 1 domácí, 2 hosté. */
  teamId?: number | string;
}

/** Góly jednoho zápasu po čtvrthodinách z pohledu strany `side` (1 domácí, 2 hosté). */
export function goalPeriods(events: ReadonlyArray<MatchEvent | null>, side: 1 | 2): GoalPeriods {
  const scored = new Array<number>(PERIOD_COUNT).fill(0);
  const conceded = new Array<number>(PERIOD_COUNT).fill(0);
  for (const e of events) {
    if (!e || e.type !== "goal" || typeof e.minute !== "number") continue;
    const team = Number(e.teamId);
    if (team !== 1 && team !== 2) continue;
    (team === side ? scored : conceded)[periodIndex(e.minute)]++;
  }
  return { scored, conceded };
}

export interface SeasonRecord {
  total: RecordLine;
  home: RecordLine;
  away: RecordLine;
  /** Posledních pět zápasů, nejnovější první. */
  form: Outcome[];
}

interface PlayedMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

/** Bilance týmu ze zápasů seřazených od nejstaršího. */
export function recordFor(matches: ReadonlyArray<PlayedMatch>, teamId: string): SeasonRecord {
  const total = emptyRecord();
  const home = emptyRecord();
  const away = emptyRecord();
  const results: Outcome[] = [];
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const my = isHome ? m.homeScore : m.awayScore;
    const their = isHome ? m.awayScore : m.homeScore;
    addResult(total, my, their);
    addResult(isHome ? home : away, my, their);
    results.push(outcome(my, their));
  }
  return { total, home, away, form: results.slice(-5).reverse() };
}

export interface LineAverages {
  overall: number | null;
  GK: number | null;
  DEF: number | null;
  MID: number | null;
  FWD: number | null;
}

const avg = (values: number[]): number | null =>
  values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;

/** Průměrné hodnocení po postech, stejně jako karta Další zápas. */
export function lineAverages(players: ReadonlyArray<{ position: string; rating: number }>): LineAverages {
  const of = (pos: string) => players.filter((p) => p.position === pos).map((p) => p.rating);
  return {
    overall: avg(players.map((p) => p.rating)),
    GK: avg(of("GK")),
    DEF: avg(of("DEF")),
    MID: avg(of("MID")),
    FWD: avg(of("FWD")),
  };
}

/** Rozestavení a taktika ze sestavy uložené u zápasu (`home_lineup_data` / `away_lineup_data`). */
export function lineupTactics(raw: string | null): { formation: string; tactic: string | null } | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { formation?: unknown; tactic?: unknown };
    if (typeof data.formation !== "string" || !data.formation) return null;
    return { formation: data.formation, tactic: typeof data.tactic === "string" ? data.tactic : null };
  } catch (e) {
    logger.warn({ module: "rival-profile" }, "rozbitá sestava u zápasu", e);
    return null;
  }
}
