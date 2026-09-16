/** Fixture pro testy incidentů. Mimo testy se nepoužívá. */
import type { HracKlubu, StavKlubu } from "./typy";

export function hrac(over: Partial<HracKlubu> = {}): HracKlubu {
  return {
    id: "h1", jmeno: "Franta Novák",
    alkohol: 50, disciplina: 50, vernost: 50, temperament: 50,
    vztahKTrenerovi: 50, transferUnrest: 0,
    vudcovstvi: 30, povolani: "", recidivista: false,
    ...over,
  };
}

/** Problémový hráč: jistý kandidát na pachatele. */
export const PROBLEMOVY = hrac({ id: "p", jmeno: "Pepa Průšvih", alkohol: 90, disciplina: 15, vernost: 20, vztahKTrenerovi: 25 });

export function stavKlubu(over: Partial<StavKlubu> = {}): StavKlubu {
  return {
    teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4,
    gameDate: "2026-09-16T16:00:00.000Z", den: "2026-09-16",
    vybaveni: {}, stadion: { pitch_condition: 70 }, kadr: [],
    vcera: null, hospodaVcera: [], odehranychZapasu: 10,
    otevreneProblemy: 0, posledniVyskyt: {}, zapasDnesNeboZitra: false,
    ...over,
  };
}
