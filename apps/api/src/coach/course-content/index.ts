/**
 * Obsah trenérské školy po kategoriích. Jen server — viz `types.ts`.
 *
 * Kurz vlastnosti má víc dílů: 1. díl jsou původní skripta v souborech kategorií,
 * další díly jsou v `parts/`. Díl se pozná podle `Lesson.part` (bez hodnoty = 1).
 */
import type { CategoryContent, CourseCategory, PartTitles } from "./types";
import { TRENINK } from "./trenink";
import { TAKTIKA } from "./taktika";
import { MLADEZ } from "./mladez";
import { KARTY } from "./karty";
import { LEGENDY } from "./legendy";
import { OBECNE } from "./obecne";
import { COACHING_PARTS, COACHING_PART_TITLES } from "./parts/coaching";
import { TACTICS_PARTS, TACTICS_PART_TITLES } from "./parts/tactics";
import { YOUTH_DEVELOPMENT_PARTS, YOUTH_DEVELOPMENT_PART_TITLES } from "./parts/youth-development";
import { DISCIPLINE_PARTS, DISCIPLINE_PART_TITLES } from "./parts/discipline";
import { MOTIVATION_PARTS, MOTIVATION_PART_TITLES } from "./parts/motivation";

function merge(base: CategoryContent, extra: CategoryContent): CategoryContent {
  return { lessons: [...base.lessons, ...extra.lessons], questions: [...base.questions, ...extra.questions] };
}

export const COURSE_CONTENT: Record<CourseCategory, CategoryContent> = {
  trenink: merge(TRENINK, COACHING_PARTS),
  taktika: merge(TAKTIKA, TACTICS_PARTS),
  mladez: merge(MLADEZ, YOUTH_DEVELOPMENT_PARTS),
  karty: merge(KARTY, DISCIPLINE_PARTS),
  legendy: merge(LEGENDY, MOTIVATION_PARTS),
  obecne: OBECNE,
};

/** Kategorie kurzů vlastností (bez licenčních skript). */
export const ATTRIBUTE_CATEGORIES: CourseCategory[] = ["trenink", "taktika", "mladez", "karty", "legendy"];

function withFirstPart(first: { attr_basic: string; attr_advanced: string }, rest: PartTitles): PartTitles {
  return {
    attr_basic: { 1: first.attr_basic, ...rest.attr_basic },
    attr_advanced: { 1: first.attr_advanced, ...rest.attr_advanced },
  };
}

/** Názvy dílů kurzů vlastností. 1. díl = původní skripta. */
export const PART_TITLES: Partial<Record<CourseCategory, PartTitles>> = {
  trenink: withFirstPart({ attr_basic: "Základy tréninku", attr_advanced: "Periodizace a kondice" }, COACHING_PART_TITLES),
  taktika: withFirstPart({ attr_basic: "Základy taktiky", attr_advanced: "Presink a systémy" }, TACTICS_PART_TITLES),
  mladez: withFirstPart({ attr_basic: "Děti a malé formy", attr_advanced: "Dlouhodobý rozvoj" }, YOUTH_DEVELOPMENT_PART_TITLES),
  karty: withFirstPart({ attr_basic: "Fauly a tresty", attr_advanced: "Sporné situace" }, DISCIPLINE_PART_TITLES),
  legendy: withFirstPart({ attr_basic: "Slavné večery", attr_advanced: "Trenéři a zázraky" }, MOTIVATION_PART_TITLES),
};
