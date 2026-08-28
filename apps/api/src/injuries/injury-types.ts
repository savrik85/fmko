/**
 * Překlad popisu zranění na typ v `injuries.type` a jeho závažnost.
 *
 * Proč zvlášť: tabulka existovala DVAKRÁT, v `cup/cup.ts` a v `multiplayer/match-runner.ts`,
 * v obou kopiích stejně špatně. Čekala „bolest kolene", zatímco zápas posílá „koleno",
 * a znala popisy, které zápas nikdy nevyrobil. Tři z pěti zranění tak spadly na obecný typ
 * a v datech za celou historii hry vznikly jen dva druhy zranění z deseti možných.
 *
 * Zranění vznikají ze DVOU zdrojů s vlastní sadou popisů:
 *   `POPISY_ZRANENI` (engine/simulation.ts)      — ze zápasu
 *   `POPISY_ZRANENI_TRENINK` (events/between-rounds.ts) — z tréninku mezi koly
 *
 * Povolené typy drží `CHECK` na sloupci `injuries.type` (migrace 0173). Že to všechno
 * pořád sedí dohromady, hlídá `injury-types.test.ts` — jinak se past nastraží znovu.
 */

import { POPISY_ZRANENI } from "../engine/simulation";
import { POPISY_ZRANENI_TRENINK } from "../events/between-rounds";

/** Každý popis, který hra umí vyrobit — ze zápasu i z tréninku. */
export type PopisZraneni =
  | (typeof POPISY_ZRANENI)[number]
  | (typeof POPISY_ZRANENI_TRENINK)[number];

/** Typ pro každý popis. Klíče musí pokrýt obě sady popisů, mrtvý klíč tu nemá co dělat. */
export const TYP_PODLE_POPISU: Record<PopisZraneni, string> = {
  // ze zápasu
  "natažený sval": "sval",
  "podvrtnutý kotník": "kotnik",
  // Křeč je svalová záležitost, ne samostatná diagnóza.
  "křeče": "sval",
  "koleno": "koleno",
  // Naraženina nepojmenovává část těla, takže obecné zranění.
  "naraženina": "obecne",
  // z tréninku mezi koly
  "naražené žebro": "zebra",
  // Palec nemá vlastní typ a zakládat ho kvůli jedné události nemá smysl.
  "pohmožděný palec": "obecne",
  "bolest kolene": "koleno",
};

/** Typ zranění podle popisu. Neznámý popis spadne na `obecne`, ať se zápis nikdy neztratí. */
export function typZraneniZPopisu(popis: string | undefined): string {
  return TYP_PODLE_POPISU[popis as PopisZraneni] ?? "obecne";
}

/**
 * Závažnost podle délky absence. Sloupec `severity` má vlastní `CHECK`, takže sem nesmí
 * spadnout nic jiného — a počítala se na třech místech zvlášť, což je přesně ten způsob,
 * jakým se tahle část kódu už jednou rozešla.
 */
export function zavaznostZeDnu(dnu: number): "lehke" | "stredni" | "tezke" {
  if (dnu <= 7) return "lehke";
  if (dnu <= 14) return "stredni";
  return "tezke";
}
