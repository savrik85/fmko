/**
 * Skloňování názvů soutěží.
 *
 * Název je proměnná — po přijetí sponzora se z „Okresního přeboru Prachatice"
 * stane „Gambrinus liga". Věty, které ho obsahují, ho proto musí umět ohnout,
 * jinak v novinách stojí „článek o kole Gambrinus liga".
 *
 * Tvarů je jen pár a jsou to vlastní jména, ne obecná čeština — vystačíme si
 * s tabulkou, žádný morfologický analyzátor.
 */

/** 2. pád: „grémium Přeboru Prahy", „o kole okresního přeboru". */
export function druhyPad(name: string): string {
  if (/\bliga$/.test(name)) return name.replace(/liga$/, "ligy");
  return name
    .replace("Okresní přebor", "okresního přeboru")
    .replace("Okresní soutěž", "okresní soutěže")
    .replace("Přebor Prahy", "Přeboru Prahy");
}

/** 6. pád: „v Přeboru Prahy", „v Gambrinus lize". */
export function sestyPad(name: string): string {
  if (/\bliga$/.test(name)) return name.replace(/liga$/, "lize");
  return name
    .replace("Okresní přebor", "okresním přeboru")
    .replace("Okresní soutěž", "okresní soutěži")
    .replace("Přebor Prahy", "Přeboru Prahy");
}
