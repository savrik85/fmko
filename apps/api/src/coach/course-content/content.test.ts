/**
 * Kontrola obsahu trenérské školy. Nehlídá fakta (to je ruční práce), ale všechno,
 * co by rozbilo test: chybějící lekce, duplicitní id, špatný index odpovědi,
 * málo otázek na opravný termín.
 */
import { describe, it, expect } from "vitest";
import { COURSE_CONTENT, ATTRIBUTE_CATEGORIES } from "./index";
import type { CourseCategory } from "./types";

const all = Object.values(COURSE_CONTENT);
const lessons = all.flatMap((c) => c.lessons);
const questions = all.flatMap((c) => c.questions);
const lessonById = new Map(lessons.map((l) => [l.id, l]));

describe("obsah trenérské školy", () => {
  it("id lekcí i otázek jsou unikátní", () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it("lekce patří do své kategorie", () => {
    for (const [cat, content] of Object.entries(COURSE_CONTENT) as Array<[CourseCategory, (typeof COURSE_CONTENT)[CourseCategory]]>) {
      for (const l of content.lessons) expect(l.category, l.id).toBe(cat);
      for (const q of content.questions) expect(lessonById.get(q.lessonId)?.category, q.id).toBe(cat);
    }
  });

  it("každá otázka má existující lekci, čtyři různé možnosti a platný index", () => {
    for (const q of questions) {
      expect(lessonById.has(q.lessonId), q.id).toBe(true);
      expect(q.options, q.id).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.trim().toLowerCase())).size, q.id).toBe(4);
      expect([0, 1, 2, 3], q.id).toContain(q.correct);
      expect(q.text.trim().length, q.id).toBeGreaterThan(10);
      expect(q.explain.trim().length, q.id).toBeGreaterThan(10);
    }
  });

  it("lekce mají rozumnou délku a každá aspoň čtyři otázky", () => {
    for (const l of lessons) {
      const words = l.body.split(/\s+/).filter(Boolean).length;
      expect(words, l.id).toBeGreaterThanOrEqual(120);
      expect(words, l.id).toBeLessThanOrEqual(380);
      expect(questions.filter((q) => q.lessonId === l.id).length, l.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("v textech není dlouhá pomlčka", () => {
    for (const l of lessons) {
      expect(l.title.includes("—") || l.body.includes("—"), l.id).toBe(false);
    }
    for (const q of questions) {
      const texty = [q.text, q.explain, ...q.options].join(" ");
      expect(texty.includes("—"), q.id).toBe(false);
    }
  });

  it("vlastnosti: na základní kurz i opravný termín je dost otázek", () => {
    for (const cat of ATTRIBUTE_CATEGORIES) {
      const c = COURSE_CONTENT[cat];
      const basicLessons = new Set(c.lessons.filter((l) => l.difficulty <= 2).map((l) => l.id));
      const basicPool = c.questions.filter((q) => basicLessons.has(q.lessonId));
      // Základní test 8 otázek + opravný 8 jiných.
      expect(basicPool.length, cat).toBeGreaterThanOrEqual(16);
      // Pokročilý test 10 + opravný 10 ze všech lekcí.
      expect(c.questions.length, cat).toBeGreaterThanOrEqual(24);
      expect(c.lessons.some((l) => l.difficulty === 3), cat).toBe(true);
    }
  });

  it("licence: každý stupeň má vlastní skripta a aspoň 20 otázek", () => {
    const c = COURSE_CONTENT.obecne;
    for (const level of [1, 2, 3, 4] as const) {
      const ids = new Set(c.lessons.filter((l) => l.licence === level).map((l) => l.id));
      expect(ids.size, `licence ${level}`).toBeGreaterThanOrEqual(3);
      expect(c.questions.filter((q) => ids.has(q.lessonId)).length, `licence ${level}`).toBeGreaterThanOrEqual(20);
    }
    for (const l of c.lessons) expect(l.licence, l.id).toBeDefined();
  });
});
