import type { Weather } from "../engine/types";

/**
 * Provoz péče o trávník — co se v daném počasí zapíná a co to stojí.
 *
 * Vybavení samo o sobě nic nedělá: topné kabely se musí zapnout a někdo za tu
 * elektřinu zaplatí. Bez provozních nákladů by po jednorázovém nákupu vyhřívání
 * bylo počasí navždy vyřešené zadarmo — a rozhodnutí „zaplatím, nebo to risknu"
 * by ve hře vůbec nevzniklo.
 */

/** Co se dá v daném počasí objednat. */
export type PitchService = "heating" | "irrigation" | "snow_clearing";

/**
 * Režim péče o hřiště.
 * - `auto` — co je potřeba, to se zapne, a klub to zaplatí. Nastav a nestarej se.
 * - `manual` — nic se nezapne samo; na každý zápas se péče objednává zvlášť.
 * - `off` — nezapíná se nic. Ušetříš, ale hřiště si to vybere.
 */
export type PitchCareMode = "auto" | "manual" | "off";

export const PITCH_CARE_MODES: PitchCareMode[] = ["auto", "manual", "off"];

export const PITCH_CARE_MODE_LABEL: Record<PitchCareMode, string> = {
  auto: "Automaticky",
  manual: "Ručně na každý zápas",
  off: "Nezapínat",
};

/**
 * Cena provozu na jeden zápas podle úrovně zařízení.
 *
 * Vyšší úroveň hřeje/zalévá větší plochu, takže i víc stojí — nákup dražšího
 * zařízení tedy není jen jednorázový výdaj, ale i vyšší provoz. Index = úroveň.
 */
export const HEATING_COST_PER_MATCH = [0, 900, 2_000, 3_800];
export const IRRIGATION_COST_PER_MATCH = [0, 250, 600, 1_200];

/**
 * Úklid sněhu je služba, ne zařízení — dá se objednat i bez vyhřívání.
 * Dražší než provoz vyhřívání na jeden zápas: platí se parta lidí s lopatami.
 */
export const SNOW_CLEARING_COST = 4_500;

/** Jakou péči si dané počasí žádá. Zataženo a vítr nic nepotřebují. */
export function serviceForWeather(weather: Weather | null | undefined): PitchService | null {
  switch (weather) {
    case "snow": return "heating";
    case "rain": return "heating";
    case "sunny": return "irrigation";
    default: return null;
  }
}

/** Cena provozu daného zařízení na jeden zápas. Bez zařízení nula. */
export function serviceCost(service: PitchService, level: number): number {
  const lv = Math.max(0, Math.min(3, Math.floor(level)));
  switch (service) {
    case "heating": return HEATING_COST_PER_MATCH[lv] ?? 0;
    case "irrigation": return IRRIGATION_COST_PER_MATCH[lv] ?? 0;
    case "snow_clearing": return SNOW_CLEARING_COST;
  }
}

export interface PitchCareDecisionInput {
  weather: Weather | null | undefined;
  mode: PitchCareMode;
  /** Úrovně zařízení z vybavení klubu (0–3). */
  heatingLevel: number;
  irrigationLevel: number;
  /** Ruční objednávka na tenhle zápas — v režimu `manual` jediná cesta, jak péči zapnout. */
  orderedThisMatch: boolean;
  /** Objednaný úklid sněhu na tenhle zápas. Funguje i bez vyhřívání. */
  snowClearingOrdered: boolean;
  budget: number;
}

export interface PitchCareDecision {
  /** Co se reálně zapnulo. */
  service: PitchService | null;
  /** Kolik se za to strhne. */
  cost: number;
  /** Proč se nic nezapnulo — pro zápis do zápasu i pro hlášku manažerovi. */
  skipped: "not_needed" | "no_equipment" | "mode_off" | "not_ordered" | "no_money" | null;
}

/**
 * Rozhodne, co se před zápasem zapne a co to bude stát. Čistá funkce — o zápis
 * do DB ani o strhávání peněz se nestará, aby šla otestovat bez databáze.
 *
 * Úklid sněhu má přednost: je to jednorázová objednávka na konkrétní zápas,
 * takže když si ho manažer zaplatil, nemá smysl k tomu ještě topit.
 */
export function decidePitchCare(input: PitchCareDecisionInput): PitchCareDecision {
  const needed = serviceForWeather(input.weather);
  if (!needed) return { service: null, cost: 0, skipped: "not_needed" };

  if (input.weather === "snow" && input.snowClearingOrdered) {
    const cost = serviceCost("snow_clearing", 0);
    if (input.budget < cost) return { service: null, cost: 0, skipped: "no_money" };
    return { service: "snow_clearing", cost, skipped: null };
  }

  const level = needed === "heating" ? input.heatingLevel : input.irrigationLevel;
  if (level <= 0) return { service: null, cost: 0, skipped: "no_equipment" };

  if (input.mode === "off") return { service: null, cost: 0, skipped: "mode_off" };
  if (input.mode === "manual" && !input.orderedThisMatch) {
    return { service: null, cost: 0, skipped: "not_ordered" };
  }

  const cost = serviceCost(needed, level);
  if (input.budget < cost) return { service: null, cost: 0, skipped: "no_money" };

  return { service: needed, cost, skipped: null };
}

/**
 * Účinnost péče, která se reálně zapnula (0–1) — tlumí navýšení opotřebení z počasí.
 *
 * Úklid sněhu neumí to, co vyhřívání: lopatami se sníh shrne, ale rozbředlý
 * podklad pod ním zůstane. Proto jen částečný účinek.
 */
export function careEffectiveness(
  decision: PitchCareDecision,
  heatingMod: number,
  irrigationMod: number,
): { heatingMod: number; irrigationMod: number } {
  if (decision.service === "heating") return { heatingMod, irrigationMod: 0 };
  if (decision.service === "irrigation") return { heatingMod: 0, irrigationMod };
  if (decision.service === "snow_clearing") return { heatingMod: 0.6, irrigationMod: 0 };
  return { heatingMod: 0, irrigationMod: 0 };
}
