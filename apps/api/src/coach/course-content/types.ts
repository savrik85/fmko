/**
 * Obsah trenérské školy: skripta (lekce) a otázky závěrečných testů.
 *
 * ŽIJE JEN NA SERVERU. Správné odpovědi nesmí do `packages/shared` ani do webu —
 * prohlížeč dostane otázky bez nich a hodnotí server.
 *
 * Pravidla obsahu:
 * - každá otázka se dá zodpovědět z textu své lekce (`lessonId`), nic navíc,
 * - fakta musí sedět (pravidla IFAB / FAČR, historie); nejistou věc raději vynechat,
 * - v textech žádná dlouhá pomlčka (—), píše se čeština s háčky a čárkami,
 * - okresní humor ano, ale fakta nesmí utonout ve vtipech.
 */

/** Kategorie odpovídá vlastnosti trenéra; `obecne` jsou licenční skripta. */
export type CourseCategory = "trenink" | "taktika" | "mladez" | "karty" | "legendy" | "obecne";

export type Difficulty = 1 | 2 | 3;

export interface Lesson {
  /** Stabilní id, nikdy se nerecykluje (např. "taktika-ofsajd"). */
  id: string;
  category: CourseCategory;
  /** 1–2 = základní kurz, 3 = jen pokročilý kurz. U `obecne` se nepoužívá, rozhoduje `licence`. */
  difficulty: Difficulty;
  /** Jen pro `obecne`: pro kterou licenci je lekce (1 = C, 2 = UEFA B, 3 = UEFA A, 4 = UEFA Pro). */
  licence?: 1 | 2 | 3 | 4;
  /**
   * Díl kurzu vlastnosti. Bez hodnoty = 1. díl (původní skripta). Každý díl má vlastní lekce
   * a otázky, trenér dostane díl podle úrovně vlastnosti a toho, co už absolvoval.
   */
  part?: number;
  title: string;
  /**
   * Text lekce, 150–300 slov. Odstavce oddělené prázdným řádkem, `**tučně**` pro klíčové
   * pojmy, řádek začínající „- " je odrážka. Nic dalšího se nevykresluje.
   */
  body: string;
}

export interface QuizQuestion {
  /** Stabilní id, nikdy se nerecykluje (např. "taktika-ofsajd-1"). */
  id: string;
  lessonId: string;
  text: string;
  /** Přesně čtyři různé možnosti. Pořadí se při testu míchá. */
  options: [string, string, string, string];
  /** Index správné možnosti v `options`. */
  correct: 0 | 1 | 2 | 3;
  /** Proč je to správně, jednou dvěma větami. Ukazuje se po testu. */
  explain: string;
}

export interface CategoryContent {
  lessons: Lesson[];
  questions: QuizQuestion[];
}

/** Názvy dílů kurzu vlastnosti: číslo dílu → krátký název (např. „Útočná hra“). */
export interface PartTitles {
  attr_basic: Record<number, string>;
  attr_advanced: Record<number, string>;
}
