/** Škoda incidentu jako věta pro UI. Čisté funkce. */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import type { Ztrata } from "./typy";

export function popisZtraty(z: Ztrata): string {
  switch (z.typ) {
    case "vybaveni": {
      const nazev = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
      return z.urovniDolu >= z.uroven
        ? `Přišli jste o vybavení: ${nazev} (úroveň ${z.uroven})`
        : `${nazev}: úroveň ${z.uroven} → ${z.uroven - z.urovniDolu}`;
    }
    case "vybaveni_stav":
      return `${CATEGORY_LABELS[z.kategorie] ?? z.kategorie}: stav ${z.stavPred} % → ${z.stavPo} %`;
    case "stadion":
      return `Rozbité zařízení: ${FACILITY_LABELS[z.zarizeni] ?? z.zarizeni} (o ${z.urovni} ${z.urovni === 1 ? "úroveň" : "úrovně"})`;
    case "travnik":
      return `Trávník: stav ${z.pred} % → ${z.po} %`;
    case "penize":
      return `Ukradená hotovost: ${z.castka.toLocaleString("cs")} Kč`;
  }
}

export function nactiZtraty(raw: unknown): Ztrata[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Ztrata[]) : [];
  } catch (e) {
    logger.warn({ module: "incidents-popis" }, "nečitelný JSON škody incidentu", e);
    return [];
  }
}
