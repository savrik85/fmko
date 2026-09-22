/**
 * Obsah trenérské školy po kategoriích. Jen server — viz `types.ts`.
 */
import type { CategoryContent, CourseCategory } from "./types";
import { TRENINK } from "./trenink";
import { TAKTIKA } from "./taktika";
import { MLADEZ } from "./mladez";
import { KARTY } from "./karty";
import { LEGENDY } from "./legendy";
import { OBECNE } from "./obecne";

export const COURSE_CONTENT: Record<CourseCategory, CategoryContent> = {
  trenink: TRENINK,
  taktika: TAKTIKA,
  mladez: MLADEZ,
  karty: KARTY,
  legendy: LEGENDY,
  obecne: OBECNE,
};

/** Kategorie kurzů vlastností (bez licenčních skript). */
export const ATTRIBUTE_CATEGORIES: CourseCategory[] = ["trenink", "taktika", "mladez", "karty", "legendy"];
