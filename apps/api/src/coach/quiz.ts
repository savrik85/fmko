/**
 * Závěrečný test trenérské školy: z jakých lekcí se ptá, jak se losuje a jak se hodnotí.
 *
 * Čisté funkce nad obsahem z `course-content` — žádná DB. Správné odpovědi odsud
 * nikdy neodcházejí k hráči dřív, než je test vyhodnocený (viz `reviewFor`).
 */

import type { CourseAttr, CourseKind } from "@okresni-masina/shared";
import { COURSE_CONTENT } from "./course-content";
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
}

const questionById = new Map<string, QuizQuestion>(
  Object.values(COURSE_CONTENT).flatMap((c) => c.questions).map((q) => [q.id, q]),
);
const lessonById = new Map<string, Lesson>(
  Object.values(COURSE_CONTENT).flatMap((c) => c.lessons).map((l) => [l.id, l]),
);

/** Skripta kurzu: přesně ty lekce, ze kterých se bude v testu ptát. */
export function courseLessons(course: CourseRef): Lesson[] {
  if (course.kind === "licence") {
    return COURSE_CONTENT.obecne.lessons.filter((l) => l.licence === course.target_licence);
  }
  const category = ATTR_CATEGORY[course.attr as CourseAttr];
  if (!category) return [];
  const lessons = COURSE_CONTENT[category].lessons;
  return course.kind === "attr_basic" ? lessons.filter((l) => l.difficulty <= 2) : lessons;
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
