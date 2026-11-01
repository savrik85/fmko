/**
 * „Čím se zápas lámal“: průměrné násobiče, se kterými engine počítal šance týmu.
 *
 * Engine je měl celou dobu (forma, morálka, sehranost, chemie, hřiště a počasí, taktika,
 * tvrdost soupeře, únava), ale nikde je neukazoval. Report „Co rozhodlo o výsledku“
 * tak odhadoval jen z hodnocení a karet a forma byla pro hráče úplně neviditelná.
 *
 * Sběr nepoužívá náhodu, takže výsledky zápasů zůstávají stejné.
 */

import { logger } from "../lib/logger";

/** Průměry násobičů jednoho týmu za zápas, 1 = bez vlivu. */
export interface TeamMatchFactors {
  /** Forma dne (výkyv ±15 % × forma sestavy z posledních zápasů). */
  form: number;
  /** Morálka sestavy v útoku (0,94–1,06). */
  morale: number;
  /** Sehranost formace. */
  familiarity: number;
  /** Chemie kabiny. */
  chemistry: number;
  /** Hra po zemi: počasí, stav a vlhkost trávníku (týká se techniky a přihrávek). */
  ground: number;
  /** Taktika a jak na ni má kádr (útok proti obraně soupeře). */
  tactic: number;
  /** Zastrašení tvrdou hrou soupeře (1 = žádné). */
  intimidation: number;
  /** Kondice útočníků při šancích. */
  condition: number;
}

export const FACTOR_KEYS = ["form", "morale", "familiarity", "chemistry", "ground", "tactic", "intimidation", "condition"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export interface FactorAccumulator {
  n: number;
  sums: Record<FactorKey, number>;
}

export function newAccumulator(): FactorAccumulator {
  return { n: 0, sums: { form: 0, morale: 0, familiarity: 0, chemistry: 0, ground: 0, tactic: 0, intimidation: 0, condition: 0 } };
}

export function addSample(acc: FactorAccumulator, sample: TeamMatchFactors): void {
  acc.n++;
  for (const k of FACTOR_KEYS) acc.sums[k] += sample[k];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function finalizeFactors(acc: FactorAccumulator): TeamMatchFactors {
  const out = {} as TeamMatchFactors;
  for (const k of FACTOR_KEYS) out[k] = acc.n > 0 ? round3(acc.sums[k] / acc.n) : 1;
  return out;
}

const LABELS: Record<FactorKey, string> = {
  form: "Forma",
  morale: "Morálka",
  familiarity: "Sehranost",
  chemistry: "Chemie kabiny",
  ground: "Hřiště a počasí",
  tactic: "Taktika",
  intimidation: "Tvrdost soupeře",
  condition: "Kondice",
};

export interface FactorBreakdownItem {
  key: FactorKey;
  label: string;
  /** Vliv na vlastní útok v procentech (+6 = o 6 % silnější). */
  own: number;
  opp: number;
  /** Kolik to dělalo ve prospěch vlastního týmu (own − opp). */
  edge: number;
}

/** Seřazený rozpis od faktoru, který rozdělil týmy nejvíc. Vynechá téměř nulové. */
export function factorBreakdown(own: TeamMatchFactors, opp: TeamMatchFactors, minEdge = 1): FactorBreakdownItem[] {
  const pct = (v: number) => Math.round((v - 1) * 100);
  return FACTOR_KEYS
    .map((key) => {
      const o = pct(own[key] ?? 1);
      const p = pct(opp[key] ?? 1);
      return { key, label: LABELS[key], own: o, opp: p, edge: o - p };
    })
    // Jen to, co týmy rozdělilo: kondice nebo počasí stejné pro oba nic nerozhodly.
    .filter((x) => Math.abs(x.edge) >= minEdge)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}

/** Uložené JSON → faktory obou týmů, nebo null (starší zápasy, rozbitá data). */
export function parseMatchFactors(raw: unknown): { home: TeamMatchFactors; away: TeamMatchFactors } | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw) as { home?: TeamMatchFactors; away?: TeamMatchFactors };
    if (!v?.home || !v?.away) return null;
    return { home: v.home, away: v.away };
  } catch (e) {
    logger.warn({ module: "match-factors" }, "nečitelné faktory zápasu", e);
    return null;
  }
}
