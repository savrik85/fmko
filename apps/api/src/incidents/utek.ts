/**
 * Útěk s penězi (spec 4a). Čistá pravidla bez DB: kdo přichází v úvahu a kolik si vezme.
 * Zápis a odchod hráče: `utek-db.ts`.
 *
 * Varovné signály jsou povinné všechny tři. Hráč nesmí zmizet bez toho, aby trenér měl
 * šanci si toho všimnout: dluhy běží aspoň týden, hráč si řekl o zálohu (ať už ji trenér
 * půjčil, nebo odmítl) a v hospodě se o něm mluvilo. Bez nich by to byl trest za nic.
 */

import { UTEK_MAX_VERNOST, UTEK_MIN_DNI_DLUHU, UTEK_MIN_ROZPOCET, UTEK_PODIL, UTEK_STROP_KC } from "./nastaveni";
import type { HracKlubu, StavKlubu } from "./typy";

/** Co už trenér mohl vědět o daném hráči (spec 4a). */
export interface SignalyUteku {
  /** Herní den (`YYYY-MM-DD`), kdy situace `dluhy` začala. */
  dluhyOdeDne: string;
  /** O záloze na mzdu už bylo rozhodnuto, ať trenér půjčil, nebo odmítl. */
  zadalOZalohu: boolean;
  /** V hospodě zaznělo, že hráč pije na sekeru. */
  mluviloSeVHospode: boolean;
}

function dnyMezi(od: string, do_: string): number {
  return Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / 86_400_000);
}

/**
 * Kdo přichází v úvahu na útěk s penězi: všechny tři varovné signály, nízká věrnost klubu
 * a klub, který má co ztratit. Pořadí kádru se nemění, los nad výstupem musí být stabilní.
 */
export function kandidatiUteku(stav: StavKlubu, signaly: ReadonlyMap<string, SignalyUteku>): HracKlubu[] {
  if (stav.rozpocet <= UTEK_MIN_ROZPOCET) return [];
  return stav.kadr.filter((h) => {
    const s = signaly.get(h.id);
    if (!s || !s.zadalOZalohu || !s.mluviloSeVHospode) return false;
    if (h.vernost >= UTEK_MAX_VERNOST) return false;
    return dnyMezi(s.dluhyOdeDne, stav.den) >= UTEK_MIN_DNI_DLUHU;
  });
}

/** Kolik si vezme: desetina rozpočtu, nejvýš strop (spec 4a). Deterministické, žádný los. */
export function castkaUteku(stav: StavKlubu): number {
  return Math.min(Math.round(stav.rozpocet * UTEK_PODIL), UTEK_STROP_KC);
}
