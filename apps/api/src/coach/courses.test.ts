/**
 * Trenérská škola: nabídka kurzů a losování/hodnocení testu (čisté funkce, bez DB).
 */
import { describe, it, expect } from "vitest";
import { buildOffers } from "./courses";
import {
  courseLessons, courseParts, courseQuestionPool, drawExam, gradeExam, partForLevel, pickCoursePart, publicQuestions,
  reviewFor,
} from "./quiz";

const mgr = (over: Partial<Parameters<typeof buildOffers>[0]> = {}) => ({
  id: "m1",
  coaching: 50,
  motivation: 50,
  tactics: 50,
  youth_development: 50,
  discipline: 50,
  reputation: 40,
  licence_level: 1,
  licence_source: "derived",
  licence_obtained_at: null,
  ...over,
});

describe("nabídka kurzů", () => {
  it("základní kurz jde, pokročilý chce UEFA B", () => {
    const offers = buildOffers(mgr(), { attr: 0, licence: 0 }, false);
    const basic = offers.find((o) => o.kind === "attr_basic" && o.attr === "tactics")!;
    const adv = offers.find((o) => o.kind === "attr_advanced" && o.attr === "tactics")!;
    expect(basic.available).toBe(true);
    expect(basic.points).toBe(3);
    expect(adv.available).toBe(false);
    expect(adv.blockers.join(" ")).toContain("UEFA B");
  });

  it("vlastnost na stropu licence kurz nepustí a body neslibuje", () => {
    const offers = buildOffers(mgr({ coaching: 70 }), { attr: 0, licence: 0 }, false);
    const o = offers.find((x) => x.kind === "attr_basic" && x.attr === "coaching")!;
    expect(o.available).toBe(false);
    expect(o.points).toBe(0);
    expect(o.blockers.join(" ")).toContain("stropu");
    // Kousek pod stropem: jen zbytek do stropu.
    const near = buildOffers(mgr({ coaching: 69 }), { attr: 0, licence: 0 }, false)
      .find((x) => x.kind === "attr_basic" && x.attr === "coaching")!;
    expect(near.points).toBe(1);
  });

  it("licenční kurz hlídá reputaci a jeden za sezónu", () => {
    const low = buildOffers(mgr({ reputation: 30 }), { attr: 0, licence: 0 }, false).find((o) => o.kind === "licence")!;
    expect(low.targetLicence).toBe(2);
    expect(low.available).toBe(false);
    expect(low.blockers.join(" ")).toContain("35");
    const used = buildOffers(mgr({ reputation: 50 }), { attr: 0, licence: 1 }, false).find((o) => o.kind === "licence")!;
    expect(used.available).toBe(false);
    const ok = buildOffers(mgr({ reputation: 50 }), { attr: 0, licence: 0 }, false).find((o) => o.kind === "licence")!;
    expect(ok.available).toBe(true);
    expect(ok.price).toBe(60_000);
  });

  it("UEFA Pro už další licenci nenabízí", () => {
    expect(buildOffers(mgr({ licence_level: 4 }), { attr: 0, licence: 0 }, false).some((o) => o.kind === "licence")).toBe(false);
  });

  it("běžící kurz a sezónní limit blokují všechno", () => {
    expect(buildOffers(mgr(), { attr: 0, licence: 0 }, true).every((o) => !o.available)).toBe(true);
    const limited = buildOffers(mgr(), { attr: 3, licence: 0 }, false);
    expect(limited.filter((o) => o.kind !== "licence").every((o) => !o.available)).toBe(true);
  });

  it("každý nabízený kurz má skripta a dost otázek na test", () => {
    for (const o of buildOffers(mgr({ licence_level: 2, reputation: 60 }), { attr: 0, licence: 0 }, false)) {
      const ref = { kind: o.kind, attr: o.attr, target_licence: o.targetLicence, part: o.part };
      expect(courseLessons(ref).length, o.title).toBeGreaterThan(0);
      expect(courseQuestionPool(ref).length, o.title).toBeGreaterThanOrEqual(o.exam.questions);
    }
  });
});

describe("díly kurzů vlastností", () => {
  const taken = (part: number, day: number) => ({ part, createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z` });

  it("díl podle úrovně: slabší trenér začíná od základů, lepší výš", () => {
    const parts = [1, 2, 3, 4];
    expect(partForLevel("attr_basic", 38, parts)).toBe(1);
    expect(partForLevel("attr_basic", 44, parts)).toBe(1);
    expect(partForLevel("attr_basic", 45, parts)).toBe(2);
    expect(partForLevel("attr_basic", 52, parts)).toBe(3);
    expect(partForLevel("attr_basic", 59, parts)).toBe(4);
    expect(partForLevel("attr_basic", 75, parts)).toBe(4);
    // Kurz s méně díly nepošle na neexistující díl.
    expect(partForLevel("attr_basic", 75, [1, 2])).toBe(2);
    expect(partForLevel("attr_advanced", 64, [1, 2])).toBe(1);
    expect(partForLevel("attr_advanced", 65, [1, 2])).toBe(2);
  });

  it("absolvovaný díl se neopakuje, dokud jsou jiné", () => {
    const parts = [1, 2, 3, 4];
    expect(pickCoursePart(parts, 1, [])).toBe(1);
    expect(pickCoursePart(parts, 1, [taken(1, 1)])).toBe(2);
    expect(pickCoursePart(parts, 2, [taken(1, 1), taken(2, 5)])).toBe(3);
    // Nahoře už nic nového: nejbližší nižší neviděný.
    expect(pickCoursePart(parts, 4, [taken(4, 1)])).toBe(3);
    expect(pickCoursePart(parts, 4, [taken(4, 1), taken(3, 2)])).toBe(2);
    expect(pickCoursePart(parts, 3, [taken(3, 1), taken(4, 2)])).toBe(2);
  });

  it("když prošel všechny díly, dostane ten nejdávnější", () => {
    const parts = [1, 2, 3, 4];
    const all = [taken(1, 1), taken(2, 2), taken(3, 3), taken(4, 4)];
    expect(pickCoursePart(parts, 4, all)).toBe(1);
    // Díl 1 zopakovaný později: na řadě je díl 2.
    expect(pickCoursePart(parts, 4, [...all, taken(1, 9)])).toBe(2);
  });

  it("opakovaný základní kurz dává pokaždé jiná skripta", () => {
    for (const attr of ["coaching", "tactics", "motivation", "youth_development", "discipline"] as const) {
      const parts = courseParts("attr_basic", attr);
      expect(parts.length, attr).toBeGreaterThanOrEqual(4);
      const past: Array<{ kind: string; attr: string; part: number; created_at: string }> = [];
      const seenLessons = new Set<string>();
      for (let i = 0; i < parts.length; i++) {
        const offer = buildOffers(mgr({ [attr]: 40 + i * 3 }), { attr: 0, licence: 0 }, false, past)
          .find((o) => o.kind === "attr_basic" && o.attr === attr)!;
        expect(offer.title, attr).toContain(`${offer.part}. díl`);
        expect(offer.topic, attr).toBeTruthy();
        const lessons = courseLessons({ kind: "attr_basic", attr, target_licence: null, part: offer.part });
        for (const l of lessons) {
          expect(seenLessons.has(l.id), `${attr} ${l.id} podruhé`).toBe(false);
          seenLessons.add(l.id);
        }
        past.push({ kind: "attr_basic", attr, part: offer.part!, created_at: `2026-10-0${i + 1}T10:00:00Z` });
      }
    }
  });

  it("starý kurz bez dílu se počítá jako 1. díl", () => {
    const offer = buildOffers(mgr({ tactics: 40 }), { attr: 0, licence: 0 }, false, [
      { kind: "attr_basic", attr: "tactics", part: null, created_at: "2026-09-30T10:00:00Z" },
    ]).find((o) => o.kind === "attr_basic" && o.attr === "tactics")!;
    expect(offer.part).toBe(2);
  });
});

describe("losování a hodnocení testu", () => {
  const ref = { kind: "attr_basic" as const, attr: "tactics", target_licence: null };
  const pool = courseQuestionPool(ref);
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  it("opravný termín nebere otázky z prvního pokusu, dokud je z čeho brát", () => {
    const first = drawExam(pool, 8, new Set(), new Set(), random);
    const second = drawExam(pool, 8, new Set(first.questionIds), new Set(), random);
    expect(first.questionIds).toHaveLength(8);
    expect(second.questionIds.filter((id) => first.questionIds.includes(id))).toHaveLength(0);
  });

  it("možnosti jsou zamíchané, ale hodnocení sedí", () => {
    const exam = drawExam(pool, 8, new Set(), new Set(), random);
    for (const order of exam.optionOrders) expect([...order].sort()).toEqual([0, 1, 2, 3]);
    const byId = new Map(pool.map((q) => [q.id, q]));
    const allRight = exam.questionIds.map((id, i) => exam.optionOrders[i].indexOf(byId.get(id)!.correct));
    expect(gradeExam(exam, allRight)).toBe(8);
    expect(gradeExam(exam, allRight.map(() => -1))).toBe(0);
  });

  it("hráč nedostane správnou odpověď dřív, než smí", () => {
    const exam = drawExam(pool, 8, new Set(), new Set(), random);
    const shown = JSON.stringify(publicQuestions(exam));
    expect(shown).not.toContain("correct");
    expect(shown).not.toContain("explain");
    const hidden = reviewFor(exam, exam.questionIds.map(() => 0), false);
    expect(hidden.every((r) => r.correct === null && r.explain === null)).toBe(true);
    const revealed = reviewFor(exam, exam.questionIds.map(() => 0), true);
    expect(revealed.every((r) => r.correct !== null && r.explain)).toBe(true);
  });
});
