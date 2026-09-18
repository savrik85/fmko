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
  | { typ: "stadion"; zarizeni: string; urovni: number; damageId?: string; /** Cena opravy v Kč v okamžiku škody. */ cena?: number }
  | { typ: "travnik"; pred: number; po: number }
  /** Ukradená hotovost (spec 4a). `zdrojZapasId` u kasy a tomboly říká, ze kterého zápasu tržba byla. */
  | { typ: "penize"; castka: number; zdrojZapasId?: string };

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
  /** `personality.leadership`, pro oblíbenost v kabině (spec 7c). */
  vudcovstvi: number;
  /** `life_context.occupation`, např. „Policista". */
  povolani: string;
  /** Pachatel incidentu uzavřeného v posledních 60 dnech (spec 5a). */
  recidivista: boolean;
  /** Věk hráče. Situace mají věkové podmínky (spec 4c). */
  vek: number;
  /** Má aktivní situaci `dluhy` (spec 5a). */
  dluhy: boolean;
  /** Trenér mu odmítl zálohu (spec 5a, 7c). */
  zalohaOdmitnuta: boolean;
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
  vcera: {
    vyhra: boolean;
    doma: boolean;
    cervenaKarta: string[];
    /** Id včerejšího zápasu, ke kterému se váže tržba (spec 4a). */
    zapasId: string | null;
    /** Kolik včerejší domácí zápas vydělal na občerstvení a na tombole. Bez zápasu nula. */
    trzby: { kasa: number; tombola: number };
  } | null;
  /** Jestli tomuhle klubu letos už jednou utekl hráč s penězi (spec 4a, max. 1× za sezónu). */
  utekLetos: boolean;
  /** Hráči klubu (ne hosté, ne trenér), kteří byli předchozí den v hospodě. */
  hospodaVcera: string[];
  odehranychZapasu: number;
  /** Klub hraje soutěžní zápas dnes nebo zítra. Dodávka se pak nesmí změnit (omluvenky vs. zápas). */
  zapasDnesNeboZitra: boolean;
  /** Otevřené krádeže a poškození (`otevreny` nebo `policie`). */
  otevreneProblemy: number;
  /** kind → `YYYY-MM-DD` posledního výskytu v aktuální sezóně. */
  posledniVyskyt: Record<string, string>;
  /** Rozpočet klubu v Kč. */
  rozpocet: number;
  /** Aktivní životní situace: hráč.id → kind. */
  situace: ReadonlyMap<string, string>;
}

export interface NavrhIncidentu {
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: 1 | 2 | 3;
  culpritType: TypPachatele;
  culpritPlayerId: string | null;
  culpritRevealed: boolean;
  /** Koho se životní situace týká (spec 4c). U krádeží a poškození `null`. */
  subjectPlayerId?: string | null;
  /** Kolik herních dní situace potrvá. Zapíše se jako `ends_on`. */
  dniTrvani?: number;
  ztraty: Ztrata[];
  text: string;
}

export type ZdrojStopy =
  | "kamera" | "spravce" | "soused" | "svedek" | "kamarad" | "rival" | "hospoda" | "bazar" | "policie" | "priznani";

/**
 * Stopa před zápisem do `club_incident_clues` (spec 5b).
 * Stopy nelžou: `ukazujeNa` i `podezreli` vždy obsahují skutečného pachatele.
 */
export interface NavrhStopy {
  zdroj: ZdrojStopy;
  ukazujeNa: string | null;
  podezreli: string[] | null;
  /** Hráč, od kterého se stopa dá získat výslechem (fáze 4). */
  drzitel: string | null;
  sila: 1 | 2 | 3;
  /** O kolik zvedne šanci policie, když je nalezená. */
  bonusPolicie: number;
  text: string;
  nalezena: boolean;
}

export interface Stopa extends NavrhStopy {
  id: string;
}

export type VysledekObvineni = "priznal" | "usvedcen" | "zapira";

export interface Obvineni {
  playerId: string;
  jmeno: string;
  /** `YYYY-MM-DD` herního dne. */
  den: string;
  vysledek: VysledekObvineni;
}

export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyradit" | "vyhodit" | "policie" | "nechat_byt";
