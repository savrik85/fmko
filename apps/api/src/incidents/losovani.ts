/**
 * Jeden herní den jednoho klubu: nejvýš jeden nový problém (spec Část 4e).
 * Čistá funkce, náhoda jen přes předané `rng`.
 */

import type { Rng } from "../generators/rng";
import { KATALOG } from "./katalog";
import {
  COOLDOWN_TYPU_DNI, MAX_OTEVRENYCH_PROBLEMU, MIN_ODEHRANYCH_ZAPASU,
  SANCE_PROBLEMU_ZA_DEN, SANCE_SPOUSTENYCH,
} from "./nastaveni";
import type { NavrhIncidentu, StavKlubu } from "./typy";

const DEN_MS = 86_400_000;

export function naCooldownu(stav: StavKlubu, kind: string): boolean {
  const posledni = stav.posledniVyskyt[kind];
  if (!posledni) return false;
  const rozdil = (Date.parse(stav.den) - Date.parse(posledni)) / DEN_MS;
  // Záporný rozdíl: herní datum po rolloveru sezóny skočilo zpět, cooldown pak neplatí.
  return rozdil >= 0 && rozdil < COOLDOWN_TYPU_DNI;
}

export function vylosujIncident(stav: StavKlubu, rng: Rng): NavrhIncidentu | null {
  if (stav.odehranychZapasu < MIN_ODEHRANYCH_ZAPASU) return null;
  if (stav.otevreneProblemy >= MAX_OTEVRENYCH_PROBLEMU) return null;

  // Spouštěné (výhra, červená karta) mají přednost a vlastní šanci.
  for (const def of KATALOG) {
    if (!def.spousteny || naCooldownu(stav, def.kind) || !def.muze(stav)) continue;
    if (rng.random() >= (SANCE_SPOUSTENYCH[def.kind] ?? 0)) continue;
    const navrh = def.vytvor(stav, rng);
    if (navrh) return navrh;
  }

  if (rng.random() >= SANCE_PROBLEMU_ZA_DEN) return null;
  const kandidati = KATALOG.filter((d) => !d.spousteny && d.vaha > 0 && !naCooldownu(stav, d.kind) && d.muze(stav));
  if (kandidati.length === 0) return null;
  const kind = rng.weighted(Object.fromEntries(kandidati.map((d) => [d.kind, d.vaha])));
  return kandidati.find((d) => d.kind === kind)?.vytvor(stav, rng) ?? null;
}
