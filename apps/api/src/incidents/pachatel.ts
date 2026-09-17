/**
 * Kdo za incidentem stojí (spec Část 5a).
 *
 * Čisté funkce bez DB. Hráč krade nebo ničí podle povahy; pod prahem váhy
 * se nestane pachatelem nikdy. Zloděje zvenku odrazuje plot, osvětlení
 * a zabezpečení areálu, na hráče s klíčem od kabiny to nepůsobí.
 */

import type { Rng } from "../generators/rng";
import { PRAH_VAHY_PACHATELE, VAHA_RECIDIVY, VAHA_DLUHU, VAHA_ODMITNUTE_ZALOHY } from "./nastaveni";
import type { HracKlubu } from "./typy";

export function vahaPachatele(h: HracKlubu): number {
  return (h.alkohol / 100) * 1.0
    + ((100 - h.disciplina) / 100) * 1.2
    + ((100 - h.vernost) / 100) * 0.8
    + ((100 - h.vztahKTrenerovi) / 100) * 0.6
    + (h.transferUnrest / 100) * 0.5
    + (h.dluhy ? VAHA_DLUHU : 0)
    + (h.dluhy && h.zalohaOdmitnuta ? VAHA_ODMITNUTE_ZALOHY : 0)
    + (h.recidivista ? VAHA_RECIDIVY : 0);
}

/** Vážený výběr pachatele z kandidátů nad prahem. `null`, když nikdo práh nepřekročí. */
export function vyberHrace(kandidati: HracKlubu[], rng: Rng): HracKlubu | null {
  const vahy: Record<string, number> = {};
  for (const h of kandidati) {
    const v = vahaPachatele(h);
    // +0,1, aby i hráč těsně nad prahem měl nenulovou váhu.
    if (v >= PRAH_VAHY_PACHATELE) vahy[h.id] = v - PRAH_VAHY_PACHATELE + 0.1;
  }
  if (Object.keys(vahy).length === 0) return null;
  const id = rng.weighted(vahy);
  return kandidati.find((h) => h.id === id) ?? null;
}

const PLOT = [1, 0.85, 0.7, 0.6];
const SVETLA = [1, 0.9, 0.85, 0.8];

function index(uroven: number | undefined): number {
  return Math.max(0, Math.min(3, Math.round(uroven ?? 0)));
}

/**
 * Šance, že pokus zvenku uspěje. `theftRiskMul` z `efektyZabezpeceni`;
 * tam, kde zabezpečení nehraje roli (krádež samotných kamer, vandal), se předává 1.
 */
export function sanceUspechuZvenku(stadion: Record<string, number>, theftRiskMul: number): number {
  return PLOT[index(stadion.fence)] * SVETLA[index(stadion.lighting)] * theftRiskMul;
}
