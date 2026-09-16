/**
 * Typy klubových incidentů (docs/superpowers/specs/2026-09-16-incidenty-design.md).
 * Jen typy, žádná logika.
 */

export type KategorieIncidentu = "kradez" | "poskozeni" | "zivotni" | "pozitivni";
export type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";
export type TypPachatele = "hrac" | "cizi" | "zamestnanec" | "nikdo";

/** Jedna skutečná škoda. Incident jich může mít víc (gril i stánek). */
export type Ztrata =
  | { typ: "vybaveni"; kategorie: string; uroven: number; stav: number; urovniDolu: number }
  | { typ: "vybaveni_stav"; kategorie: string; stavPred: number; stavPo: number }
  | { typ: "stadion"; zarizeni: string; urovni: number; damageId?: string }
  | { typ: "travnik"; pred: number; po: number };

export interface HracKlubu {
  id: string;
  /** „Franta Novák", vždy 1. pád. */
  jmeno: string;
  alkohol: number;
  disciplina: number;
  vernost: number;
  temperament: number;
  vztahKTrenerovi: number;
  transferUnrest: number;
}

export interface StavKlubu {
  teamId: string;
  leagueId: string | null;
  seasonNumber: number;
  /** Herní datum ISO, tvar `teams.game_date`. */
  gameDate: string;
  /** `YYYY-MM-DD` herního dne. */
  den: string;
  /** Úrovně i stavy vybavení: `balls`, `balls_condition`, … */
  vybaveni: Record<string, number>;
  /** Úrovně zařízení stadionu a `pitch_condition`. */
  stadion: Record<string, number>;
  /** Aktivní hráči klubu. */
  kadr: HracKlubu[];
  /** Soutěžní zápas předchozího herního dne, `null` když se nehrálo. */
  vcera: { vyhra: boolean; cervenaKarta: string[] } | null;
  /** Hráči klubu (ne hosté, ne trenér), kteří byli předchozí den v hospodě. */
  hospodaVcera: string[];
  odehranychZapasu: number;
  /** Klub hraje soutěžní zápas dnes nebo zítra. Dodávka se pak nesmí změnit (omluvenky vs. zápas). */
  zapasDnesNeboZitra: boolean;
  /** Otevřené krádeže a poškození (`otevreny` nebo `policie`). */
  otevreneProblemy: number;
  /** kind → `YYYY-MM-DD` posledního výskytu v aktuální sezóně. */
  posledniVyskyt: Record<string, string>;
}

export interface NavrhIncidentu {
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: 1 | 2 | 3;
  culpritType: TypPachatele;
  culpritPlayerId: string | null;
  culpritRevealed: boolean;
  ztraty: Ztrata[];
  text: string;
}
