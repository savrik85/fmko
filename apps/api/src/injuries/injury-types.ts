/**
 * Překlad popisu zranění ze zápasu na typ v `injuries.type`.
 *
 * Proč zvlášť: tabulka existovala DVAKRÁT, v `cup/cup.ts` a v `multiplayer/match-runner.ts`,
 * v obou kopiích stejně špatně. Čekala „bolest kolene", zatímco zápas posílá „koleno",
 * a znala šest popisů, které engine nikdy nevyrobil. Tři z pěti zranění tak spadly na
 * obecný typ a v datech za celou historii hry vznikly jen dva druhy zranění z pěti možných.
 *
 * Seznam popisů drží `POPISY_ZRANENI` v enginu, povolené typy `CHECK` na sloupci
 * `injuries.type` (migrace 0173). Že to všechno pořád sedí dohromady, hlídá
 * `injury-types.test.ts` — jinak se stejná past nastraží znovu.
 */

import { POPISY_ZRANENI } from "../engine/simulation";

/** Typ pro každý popis, který zápas umí vyrobit. Klíče musí pokrýt `POPISY_ZRANENI`. */
export const TYP_PODLE_POPISU: Record<(typeof POPISY_ZRANENI)[number], string> = {
  "natažený sval": "sval",
  "podvrtnutý kotník": "kotnik",
  // Křeč je svalová záležitost, ne samostatná diagnóza.
  "křeče": "sval",
  "koleno": "koleno",
  // Naraženina nepojmenovává část těla, takže obecné zranění.
  "naraženina": "obecne",
};

/** Typ zranění podle popisu. Neznámý popis spadne na `obecne`, ať se zápis nikdy neztratí. */
export function typZraneniZPopisu(popis: string | undefined): string {
  return TYP_PODLE_POPISU[popis as (typeof POPISY_ZRANENI)[number]] ?? "obecne";
}
