/** Fixture pro testy incidentů. Mimo testy se nepoužívá. */
import type { IncidentRadek } from "./incident-db";
import type { HracKlubu, StavKlubu } from "./typy";

export function hrac(over: Partial<HracKlubu> = {}): HracKlubu {
  return {
    id: "h1", jmeno: "Franta Novák",
    alkohol: 50, disciplina: 50, vernost: 50, temperament: 50,
    vztahKTrenerovi: 50, transferUnrest: 0,
    vudcovstvi: 30, povolani: "", recidivista: false,
    vek: 28, dluhy: false, zalohaOdmitnuta: false,
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
    rozpocet: 100000, situace: new Map(),
    ...over,
  };
}

/** Řádek `club_incidents`: otevřené vloupání, pachatel „p" neodhalen, ukradené dresy úrovně 2. */
export function incidentRadek(over: Partial<IncidentRadek> = {}): IncidentRadek {
  return {
    id: "inc-1", team_id: "tym-a", season_number: 4, kind: "vloupani_sklad", category: "kradez", status: "otevreny",
    severity: 1, game_date: "2026-09-14T16:00:00.000Z", deadline: "2026-09-21T16:00:00.000Z",
    culprit_type: "hrac", culprit_player_id: "p", culprit_revealed: 0, subject_player_id: null, ends_on: null,
    loss: JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]),
    accusations: 0, accused: "[]", police_result_on: null, police_success: null,
    resolution: null, resolution_data: null, text: "Ze skladu zmizelo vybavení: Dresy.", resolved_on: null,
    ...over,
  };
}

/** Řádek `players` s průměrnou povahou a mzdou 100 Kč týdně. */
export function hracRadek(id: string, jmeno: string, prijmeni: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, first_name: jmeno, last_name: prijmeni,
    personality: JSON.stringify({ alcohol: 50, discipline: 50, patriotism: 50, temper: 50, leadership: 30 }),
    life_context: "{}", coach_relationship: 50, weekly_wage: 100,
    ...over,
  };
}
