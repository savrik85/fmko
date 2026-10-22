/**
 * Skrytý talent — JEDINÉ místo, kde se rozhoduje, co který stupeň znamená.
 *
 * Karta hráče psala „rozvíjí se pomalu" / „učí se bleskově" podle svých vlastních prahů,
 * zatímco trénink talent počítal úplně jinak — jako drobný násobek pravděpodobnosti
 * (`1 + talent/200`). Ta pravděpodobnost je u dorostence stejně vysoká, že se o strop
 * opře, takže se násobek ztratil. Naměřeno skutečným denním tickem nad kopií produkce,
 * hráči do 21 let:
 *
 *     rozvíjí se pomalu   talent  9,4   55,96 bodu   1,00×
 *     průměrné tempo      talent 26,5   58,90 bodu   1,05×
 *     učí se rychle       talent 39,8   57,82 bodu   1,03×
 *     učí se bleskově     talent 83,0   68,00 bodu   1,22×
 *
 * Mezi „pomalu" a „rychle" byla tři procenta. Karta tedy slibovala rozdíl, který ve hře
 * neexistoval. Náprava má dvě části: prahy jsou tady jedny pro text i pro mechaniku,
 * a talent nezvedá pravděpodobnost (ta se stejně opře o strop), ale POČET POKUSŮ za
 * trénink — těch se nic nezastropuje.
 *
 * Prahy odpovídají tomu, co generátor umí. `generateHiddenTalent` vrací `rng.int(0, base+30)`,
 * kde base je 10 pro vesnici až 25 pro město, tedy nejvýš 40 až 55. Práh nejvyššího stupně
 * proto míří nad tenhle rozsah schválně: dosáhnou na něj jen „klenoty" (7% náhoda
 * v generátoru dorostu), zkrachovalé hvězdy a odchovanci z dobře placené akademie.
 */

export type StupenTalentu = "pomalu" | "prumerne" | "rychle" | "bleskove";

export const PRAH_BLESKOVE = 61;
export const PRAH_RYCHLE = 36;
export const PRAH_PRUMERNE = 16;

export function stupenTalentu(talent: number): StupenTalentu {
  if (talent >= PRAH_BLESKOVE) return "bleskove";
  if (talent >= PRAH_RYCHLE) return "rychle";
  if (talent >= PRAH_PRUMERNE) return "prumerne";
  return "pomalu";
}

/** Text na kartě hráče. Popisuje tempo učení, ne strop — kam hráč dojde, určuje `skills_max`. */
export function slovneTempoRozvoje(talent: number): string {
  switch (stupenTalentu(talent)) {
    case "bleskove": return "učí se bleskově";
    case "rychle": return "učí se rychle";
    case "prumerne": return "průměrné tempo";
    default: return "rozvíjí se pomalu";
  }
}

/**
 * Kolik pokusů o zlepšení navíc (nebo míň) hráč za trénink dostane.
 *
 * Záměrně je to celé číslo pokusů, ne procento: pokusy se sčítají a nemají strop,
 * takže se rozdíl v tréninku opravdu projeví. Průměrný hráč zůstává na základu podle
 * věku — mění se jen konce rozdělení.
 */
export function pokusuZaTalent(talent: number): number {
  switch (stupenTalentu(talent)) {
    case "bleskove": return 2;
    case "rychle": return 1;
    case "prumerne": return 0;
    default: return -1;
  }
}

/** Do kolika let platí dorostové tempo podle talentu (stejně jako odchod z dorostu ve 22). */
export const YOUTH_TALENT_AGE = 22;

/**
 * Pokusy o zlepšení za trénink pro hráče do 21 let. U mladých rozhoduje talent víc než
 * u dospělých: dřív měli základ 6 pokusů a talent jen −1 až +2, takže kluk, který se
 * „rozvíjí pomalu", rostl skoro jako klenot. Naměřeno nad kopií produkce 2026-10-20,
 * růst hodnocení za sezónu u lidských klubů: pomalu +4,2, průměrně +6,0, rychle +5,7,
 * bleskově +8,0. S tímhle počtem pokusů vychází +2,6 / +4,1 / +4,9 / +8,0.
 */
export function youthAttempts(talent: number): number {
  switch (stupenTalentu(talent)) {
    case "bleskove": return 8;
    case "rychle": return 6;
    case "prumerne": return 4;
    default: return 3;
  }
}
