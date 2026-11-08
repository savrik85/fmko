/**
 * Kontrola obsahu trenérské školy. Nehlídá fakta (to je ruční práce), ale všechno,
 * co by rozbilo test: chybějící lekce, duplicitní id, špatný index odpovědi,
 * málo otázek na opravný termín.
 */
import { describe, it, expect } from "vitest";
import { COURSE_CONTENT, ATTRIBUTE_CATEGORIES, PART_TITLES } from "./index";
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

  it("vlastnosti: každý díl základního i pokročilého kurzu má dost otázek na test i opravný termín", () => {
    for (const cat of ATTRIBUTE_CATEGORIES) {
      const c = COURSE_CONTENT[cat];
      const titles = PART_TITLES[cat];
      expect(titles, cat).toBeDefined();
      for (const kind of ["attr_basic", "attr_advanced"] as const) {
        const ofKind = c.lessons.filter((l) => (kind === "attr_basic" ? l.difficulty <= 2 : l.difficulty === 3));
        const parts = [...new Set(ofKind.map((l) => l.part ?? 1))].sort((a, b) => a - b);
        // Díly jdou po sobě od jedničky a každý má název.
        expect(parts, `${cat} ${kind}`).toEqual(parts.map((_, i) => i + 1));
        for (const part of parts) {
          const label = `${cat} ${kind} díl ${part}`;
          expect(titles?.[kind][part], label).toBeTruthy();
          const lessonIds = new Set(ofKind.filter((l) => (l.part ?? 1) === part).map((l) => l.id));
          const pool = c.questions.filter((q) => lessonIds.has(q.lessonId));
          expect(lessonIds.size, label).toBeGreaterThanOrEqual(4);
          // Základní test 8 otázek + opravný 8 jiných, pokročilý 10 + 10.
          expect(pool.length, label).toBeGreaterThanOrEqual(kind === "attr_basic" ? 16 : 20);
        }
      }
      // Názvy nepatří k dílu, který neexistuje.
      for (const kind of ["attr_basic", "attr_advanced"] as const) {
        for (const part of Object.keys(titles?.[kind] ?? {}).map(Number)) {
          const exists = c.lessons.some((l) => (l.part ?? 1) === part && (kind === "attr_basic" ? l.difficulty <= 2 : l.difficulty === 3));
          expect(exists, `${cat} ${kind} název dílu ${part}`).toBe(true);
        }
      }
    }
  });

  it("licenční lekce nemají díly", () => {
    for (const l of COURSE_CONTENT.obecne.lessons) expect(l.part, l.id).toBeUndefined();
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
