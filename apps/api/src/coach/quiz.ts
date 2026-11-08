/**
 * Závěrečný test trenérské školy: z jakých lekcí se ptá, jak se losuje a jak se hodnotí.
 *
 * Čisté funkce nad obsahem z `course-content` — žádná DB. Správné odpovědi odsud
 * nikdy neodcházejí k hráči dřív, než je test vyhodnocený (viz `reviewFor`).
 */

import type { CourseAttr, CourseKind } from "@okresni-masina/shared";
import { COURSE_CONTENT, PART_TITLES } from "./course-content";
import type { CourseCategory, Lesson, QuizQuestion } from "./course-content/types";

/** Kurz vlastnosti se učí ze skript kategorie, která k vlastnosti patří. */
export const ATTR_CATEGORY: Record<CourseAttr, CourseCategory> = {
  coaching: "trenink",
  tactics: "taktika",
  youth_development: "mladez",
  discipline: "karty",
  motivation: "legendy",
};

export interface CourseRef {
  kind: CourseKind;
  attr: string | null;
  target_licence: number | null;
  /** Díl kurzu vlastnosti. Null (staré kurzy) = 1. díl. U licence se nepoužívá. */
  part?: number | null;
}

const questionById = new Map<string, QuizQuestion>(
  Object.values(COURSE_CONTENT).flatMap((c) => c.questions).map((q) => [q.id, q]),
);
const lessonById = new Map<string, Lesson>(
  Object.values(COURSE_CONTENT).flatMap((c) => c.lessons).map((l) => [l.id, l]),
);

type AttrKind = "attr_basic" | "attr_advanced";

/** Lekce kurzu vlastnosti daného druhu, všechny díly. */
function attrKindLessons(kind: AttrKind, attr: string | null): Lesson[] {
  const category = ATTR_CATEGORY[attr as CourseAttr];
  if (!category) return [];
  const lessons = COURSE_CONTENT[category].lessons;
  // Pokročilý kurz má jen vlastní lekce, látku základního kurzu znovu neprobírá.
  return kind === "attr_basic" ? lessons.filter((l) => l.difficulty <= 2) : lessons.filter((l) => l.difficulty === 3);
}

const partOf = (l: Lesson) => l.part ?? 1;

/** Skripta kurzu: přesně ty lekce, ze kterých se bude v testu ptát. */
export function courseLessons(course: CourseRef): Lesson[] {
  if (course.kind === "licence") {
    return COURSE_CONTENT.obecne.lessons.filter((l) => l.licence === course.target_licence);
  }
  const part = course.part ?? 1;
  return attrKindLessons(course.kind, course.attr).filter((l) => partOf(l) === part);
}

/** Které díly kurz vlastnosti má, vzestupně. */
export function courseParts(kind: AttrKind, attr: string | null): number[] {
  return [...new Set(attrKindLessons(kind, attr).map(partOf))].sort((a, b) => a - b);
}

/** Název dílu, např. „Útočná hra“. */
export function partTitle(kind: AttrKind, attr: string | null, part: number | null | undefined): string {
  const category = ATTR_CATEGORY[attr as CourseAttr];
  return (category && PART_TITLES[category]?.[kind][part ?? 1]) ?? "";
}

/**
 * Od jaké hodnoty vlastnosti škola posílá na který díl: index + 1 = díl.
 * Díly jsou seřazené od lehčího k těžšímu, lepší trenér začíná výš.
 */
export const PART_LEVELS: Record<AttrKind, readonly number[]> = {
  attr_basic: [0, 45, 52, 59],
  attr_advanced: [0, 65],
};

/** Díl, který odpovídá úrovni vlastnosti (bez ohledu na to, co už trenér absolvoval). */
export function partForLevel(kind: AttrKind, value: number, parts: readonly number[]): number {
  const byLevel = PART_LEVELS[kind].filter((from) => value >= from).length;
  return Math.min(Math.max(byLevel, 1), parts[parts.length - 1] ?? 1);
}

export interface TakenPart {
  part: number;
  /** Kdy se trenér na díl přihlásil (ISO). Rozhoduje, který díl je „nejdéle neviděný“. */
  createdAt: string;
}

/**
 * Který díl kurzu škola nabídne. Nejdřív díl podle úrovně vlastnosti, pokud ho trenér
 * ještě neměl, pak nejbližší vyšší neabsolvovaný, pak nejbližší nižší. Když prošel všechny,
 * dostane ten, který viděl nejdávno (u rovnosti ten blíž úrovni). Propadlý díl se počítá
 * jako absolvovaný: na opakování má trenér opravný termín, další kurz má přinést něco nového.
 */
export function pickCoursePart(parts: readonly number[], levelPart: number, taken: readonly TakenPart[]): number {
  if (parts.length === 0) return 1;
  const lastTaken = new Map<number, string>();
  for (const t of taken) {
    const prev = lastTaken.get(t.part);
    if (!prev || t.createdAt > prev) lastTaken.set(t.part, t.createdAt);
  }
  const fresh = parts.filter((p) => !lastTaken.has(p));
  const up = fresh.filter((p) => p >= levelPart);
  if (up.length > 0) return up[0];
  const down = fresh.filter((p) => p < levelPart);
  if (down.length > 0) return down[down.length - 1];
  return [...parts].sort((a, b) => {
    const byAge = (lastTaken.get(a) ?? "").localeCompare(lastTaken.get(b) ?? "");
    return byAge !== 0 ? byAge : Math.abs(a - levelPart) - Math.abs(b - levelPart);
  })[0];
}

export function courseQuestionPool(course: CourseRef): QuizQuestion[] {
  const lessonIds = new Set(courseLessons(course).map((l) => l.id));
  return [...questionById.values()].filter((q) => lessonIds.has(q.lessonId));
}

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface DrawnExam {
  questionIds: string[];
  /** Pro každou otázku pořadí možností: optionOrders[i][zobrazená] = index v původním poli. */
  optionOrders: number[][];
}

/**
 * Vylosuje test. Otázky z prvního pokusu (`exclude`) přijdou na řadu jen tehdy,
 * když jinak nestačí; ze zbytku mají přednost ty, které klub ještě neviděl (`seen`).
 */
export function drawExam(
  pool: QuizQuestion[],
  count: number,
  exclude: ReadonlySet<string>,
  seen: ReadonlySet<string>,
  random: Random = Math.random,
): DrawnExam {
  const fresh = shuffle(pool.filter((q) => !exclude.has(q.id) && !seen.has(q.id)), random);
  const seenOnly = shuffle(pool.filter((q) => !exclude.has(q.id) && seen.has(q.id)), random);
  const excluded = shuffle(pool.filter((q) => exclude.has(q.id)), random);
  const picked = [...fresh, ...seenOnly, ...excluded].slice(0, count);
  return {
    questionIds: picked.map((q) => q.id),
    optionOrders: picked.map(() => shuffle([0, 1, 2, 3], random)),
  };
}

export interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
}

/** Otázka tak, jak ji vidí hráč: bez správné odpovědi, možnosti v zamíchaném pořadí. */
export function publicQuestions(exam: DrawnExam): PublicQuestion[] {
  return exam.questionIds.map((id, i) => {
    const q = questionById.get(id);
    if (!q) return { id, text: "Otázka už v sadě není.", options: ["–", "–", "–", "–"] };
    return { id, text: q.text, options: exam.optionOrders[i].map((o) => q.options[o]) };
  });
}

/** Počet správných odpovědí. `answers[i]` je zvolená možnost v zobrazeném pořadí, −1 = nic. */
export function gradeExam(exam: DrawnExam, answers: number[]): number {
  let score = 0;
  exam.questionIds.forEach((id, i) => {
    const q = questionById.get(id);
    const chosen = answers[i] ?? -1;
    if (q && chosen >= 0 && exam.optionOrders[i][chosen] === q.correct) score++;
  });
  return score;
}

export interface ReviewItem {
  id: string;
  text: string;
  options: string[];
  chosen: number;
  isCorrect: boolean;
  /** Správná možnost v zobrazeném pořadí. Null, dokud se odpovědi neodhalují. */
  correct: number | null;
  explain: string | null;
  lessonTitle: string | null;
}

/**
 * Rozbor po testu. Po prvním neúspěchu se ukáže jen, co bylo špatně, ne správná
 * odpověď — jinak by opravný termín byl jen opsání rozboru. Odhaluje se, až když
 * trenér prošel, nebo když kurz definitivně propadl.
 */
export function reviewFor(exam: DrawnExam, answers: number[], reveal: boolean): ReviewItem[] {
  return exam.questionIds.map((id, i) => {
    const q = questionById.get(id);
    const order = exam.optionOrders[i];
    const chosen = answers[i] ?? -1;
    if (!q) {
      return { id, text: "Otázka už v sadě není.", options: [], chosen, isCorrect: false, correct: null, explain: null, lessonTitle: null };
    }
    const correct = order.indexOf(q.correct);
    return {
      id,
      text: q.text,
      options: order.map((o) => q.options[o]),
      chosen,
      isCorrect: chosen === correct,
      correct: reveal ? correct : null,
      explain: reveal ? q.explain : null,
      lessonTitle: lessonById.get(q.lessonId)?.title ?? null,
    };
  });
}
