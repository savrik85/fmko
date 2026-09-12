/**
 * Kapacita po sektorech.
 *
 * Bez tohohle bylo uzavření sektoru poloviční trest: ubralo poptávku (ti lidé
 * nepřijdou), ale kapacita stadionu zůstala stejná. Na vyprodaném zápase se
 * tedy nestalo vůbec nic, protože `Math.min(poptávka, kapacita)` narazil na týž
 * strop jako předtím. Zavřít kotel musí zavřít kotel, ne jen odradit jeho lidi.
 *
 * Dělení vychází z toho, co na stadionu stojí: kde je vybudovaný sektor kotle,
 * tam je kotel větší; kde jsou tribuny, roste hlavní tribuna. Zbytek je plocha
 * za brankou, kde se stojí u plotu. Součet vždycky sedí na celkovou kapacitu,
 * aby se dělením nedala kapacita ztratit ani vyrobit.
 */

import type { FanSector } from "../engine/fan-groups";

/** Podíly sektorů podle úrovně vybavení. Index = úroveň `ultras_stand` / `stands`. */
const PODIL_KOTEL = [0.12, 0.18, 0.24, 0.3] as const;
const PODIL_HLAVNI = [0.3, 0.4, 0.48, 0.55] as const;

export type KapacitaSektoru = Record<FanSector, number>;

/**
 * Rozdělí kapacitu na tři sektory.
 *
 * Zaokrouhlovací zbytek padá do sektoru za brankou, takže se součet rovná
 * kapacitě na hlavu přesně.
 */
export function kapacitaSektoru(
  capacity: number,
  facilities: { ultras_stand?: number; stands?: number },
): KapacitaSektoru {
  const celkem = Math.max(0, Math.round(capacity));
  if (celkem === 0) return { kotel: 0, hlavni: 0, za_branou: 0 };

  const ul = Math.max(0, Math.min(3, Math.round(facilities.ultras_stand ?? 0)));
  const st = Math.max(0, Math.min(3, Math.round(facilities.stands ?? 0)));

  const kotel = Math.round(celkem * PODIL_KOTEL[ul]);
  const hlavni = Math.round(celkem * PODIL_HLAVNI[st]);
  // Za brankou je zbytek. Když by vyšel záporný (extrémní kombinace), ubere se
  // z hlavní tribuny, aby součet pořád seděl.
  let zaBrankou = celkem - kotel - hlavni;
  let hlavniUpr = hlavni;
  if (zaBrankou < 0) {
    hlavniUpr = Math.max(0, hlavni + zaBrankou);
    zaBrankou = 0;
  }
  return { kotel, hlavni: hlavniUpr, za_branou: celkem - kotel - hlavniUpr };
}

/**
 * Kapacita, která je na tenhle zápas k dispozici.
 *
 * Uzavřený sektor se z kapacity odečte celý. Vždycky zbude aspoň něco, jinak by
 * se zápas hrál před nulou i tam, kde je zavřená jen část stadionu.
 */
export function dostupnaKapacita(
  capacity: number,
  facilities: { ultras_stand?: number; stands?: number },
  zavrene: readonly FanSector[],
): { kapacita: number; zavrenoMist: number; rozpad: KapacitaSektoru } {
  const rozpad = kapacitaSektoru(capacity, facilities);
  const unikatni = [...new Set(zavrene)];
  const zavrenoMist = unikatni.reduce((s, sek) => s + (rozpad[sek] ?? 0), 0);
  return {
    kapacita: Math.max(0, Math.round(capacity) - zavrenoMist),
    zavrenoMist,
    rozpad,
  };
}

/** Kolik procent sektoru je zaplněno, aby to šlo vykreslit ve 3D scéně. */
export function zaplneniSektoru(
  attendance: number,
  capacity: number,
  facilities: { ultras_stand?: number; stands?: number },
  zavrene: readonly FanSector[],
): Record<FanSector, number> {
  const rozpad = kapacitaSektoru(capacity, facilities);
  const zavreneSet = new Set(zavrene);
  const otevrenaKapacita = (["kotel", "hlavni", "za_branou"] as FanSector[])
    .filter((s) => !zavreneSet.has(s))
    .reduce((sum, s) => sum + rozpad[s], 0);

  const out = { kotel: 0, hlavni: 0, za_branou: 0 } as Record<FanSector, number>;
  if (otevrenaKapacita <= 0) return out;

  // Lidé se rozloží po otevřených sektorech rovnoměrně. Zavřený zůstane prázdný,
  // a to je smysl celé věci: musí to být vidět.
  const pomer = Math.max(0, Math.min(1, attendance / otevrenaKapacita));
  for (const s of ["kotel", "hlavni", "za_branou"] as FanSector[]) {
    out[s] = zavreneSet.has(s) ? 0 : pomer;
  }
  return out;
}
