/**
 * Hrozící čin z opileckých řečí po lhůtě (spec 9a). Čisté funkce.
 */

import { logger } from "../lib/logger";
import { HROZI_PROMLUVA, HROZI_PROMLUVA_VZTAH_DELITEL, HROZI_ZABEZPECENI, HROZI_ZAKLAD } from "./nastaveni";

export interface OkolnostiHroziciho {
  /** Trenér si s hráčem promluvil (`resolution_data.promluvil`). */
  promluvil: boolean;
  vztahKTrenerovi: number;
  kind: string;
  /** Úroveň zabezpečení areálu. */
  zabezpeceni: number;
  /** V den činu je na incidentní absenci nebo zraněný. */
  nepritomen: boolean;
}

/** Šance v procentech (0–100), že hráč ohlášený čin opravdu udělá. */
export function sanceHroziciho(o: OkolnostiHroziciho): number {
  let sance = HROZI_ZAKLAD;
  if (o.promluvil) sance -= HROZI_PROMLUVA + o.vztahKTrenerovi / HROZI_PROMLUVA_VZTAH_DELITEL;
  if (o.kind === "vloupani_sklad" && o.zabezpeceni >= 1) sance -= HROZI_ZABEZPECENI;
  if (o.nepritomen) sance -= 100;
  return Math.max(0, Math.min(100, sance));
}

/** Promluvil si trenér s hráčem? V datech incidentu je den rozhovoru. */
export function promluvil(resolutionData: string | null): boolean {
  if (!resolutionData) return false;
  try {
    const v = JSON.parse(resolutionData) as { promluvil?: unknown };
    return typeof v.promluvil === "string" && v.promluvil !== "";
  } catch (e) {
    logger.warn({ module: "incidents-hrozi" }, "nečitelná data hrozícího činu", e);
    return false;
  }
}
