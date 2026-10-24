/**
 * Kauzy pro redaktory a vztah redaktora ke klubu.
 *
 * Hlídá dvě věci, kvůli kterým redaktoři byli „se všemi zadobře": vztah nesmí
 * od běžných vstřícných odpovědí vyšplhat na maximum a výběr kauz se nesmí
 * točit pořád kolem téže.
 */
import { describe, it, expect } from "vitest";
import { pickScandals, type Scandal } from "./press-scandals";
import { nextSentiment, vztahKeKlubuText } from "./journalists";
import { buildFallbackQuestions } from "./post-match-questions";
import type { PostMatchContext } from "./post-match-context";

const scandalPool: Scandal[] = [
  { ref: "pub:1", kind: "pub", fact: "V hospodě se mezi lidmi vypráví: „Petr Malý vypil 9 piv, rekord večera.\"", names: ["Petr Malý"], weight: 3 },
  { ref: "pub:2", kind: "pub", fact: "V hospodě se mezi lidmi vypráví: „Jan Kos dostal facku.\"", names: ["Jan Kos"], weight: 6 },
  { ref: "sanction:1", kind: "sanction", fact: "Disciplinárka klubu napařila pokutu 6 300 Kč za házení předmětů.", names: [], weight: 4 },
  { ref: "debt:1", kind: "debt", fact: "Klub je na účtu v minusu.", names: [], weight: 5 },
  { ref: "own_words:1", kind: "own_words", fact: "Před zápasem trenér řekl…", names: [], weight: 6 },
];

describe("výběr kauz", () => {
  it("nikdy nevybere dvě kauzy stejného druhu", () => {
    for (let i = 0; i < 50; i++) {
      const v = pickScandals(scandalPool, { style: "bulvar", count: 2, seed: `s${i}` });
      expect(v).toHaveLength(2);
      expect(v[0].kind).not.toBe(v[1].kind);
    }
  });

  it("vynechá kauzy z posledních rozhovorů", () => {
    const used = new Set(["pub:1", "pub:2", "debt:1"]);
    for (let i = 0; i < 30; i++) {
      const v = pickScandals(scandalPool, { style: "bulvar", count: 3, seed: `s${i}`, usedRefs: used });
      for (const k of v) expect(used.has(k.ref)).toBe(false);
    }
  });

  it("stejný seed dá stejné kauzy", () => {
    const a = pickScandals(scandalPool, { style: "vycurany", count: 2, seed: "tym|kolo|pre_match" });
    const b = pickScandals(scandalPool, { style: "vycurany", count: 2, seed: "tym|kolo|pre_match" });
    expect(a).toEqual(b);
  });

  it("bez kauz nevrátí nic a nespadne", () => {
    expect(pickScandals([], { style: "bulvar", count: 2, seed: "x" })).toEqual([]);
    expect(pickScandals(scandalPool, { style: null, count: 0, seed: "x" })).toEqual([]);
  });

  it("bulvár sahá po hospodě častěji než seriózní", () => {
    const pubCount = (style: "bulvar" | "seriozni") => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        if (pickScandals(scandalPool, { style, count: 1, seed: `k${i}` })[0].kind === "pub") n++;
      }
      return n;
    };
    expect(pubCount("bulvar")).toBeGreaterThan(pubCount("seriozni") * 2);
  });
});

describe("vztah redaktora ke klubu", () => {
  it("od běžných vstřícných odpovědí nevyšplhá na maximum", () => {
    // Dřív +15 za rozhovor znamenalo +100 po sedmi kolech.
    let s = 0;
    for (let i = 0; i < 60; i++) s = nextSentiment(s, 15);
    expect(s).toBeLessThan(60);
    expect(s).toBeGreaterThan(30);
  });

  it("slušná odpověď za pár bodů drží vztah nízko", () => {
    let s = 0;
    for (let i = 0; i < 60; i++) s = nextSentiment(s, 3);
    expect(s).toBeLessThan(25);
  });

  it("oblíbenec ze staré éry postupně klesá", () => {
    let s = 100;
    for (let i = 0; i < 10; i++) s = nextSentiment(s, 3);
    expect(s).toBeLessThan(40);
  });

  it("pokažený vztah se dá napravit, posun k nule platí celý", () => {
    expect(nextSentiment(-60, 20)).toBe(Math.round(-60 * 0.85 + 20));
  });

  it("drží se v rozsahu −100 až 100", () => {
    expect(nextSentiment(100, 25)).toBeLessThanOrEqual(100);
    expect(nextSentiment(-100, -25)).toBeGreaterThanOrEqual(-100);
  });

  it("ani oblíbenec nedostane jen příjemné otázky", () => {
    expect(vztahKeKlubuText(90)).not.toContain("obcházíš");
    expect(vztahKeKlubuText(90)).toContain("nepříjemnou");
    expect(vztahKeKlubuText(40)).toContain("kauze");
  });
});

const baseCtx: PostMatchContext = {
  matchId: "m1", teamId: "t1", teamName: "Sokol Lhota", opponentName: "Jiskra Dolní",
  opponentManagerName: null, ownManagerName: "Karel Novák",
  ownScore: 0, oppScore: 4, outcome: "loss",
  ownCards: 1, oppCards: 1, ownReds: 0, oppReds: 0, ownPenalties: 0, oppPenalties: 0,
  hardness: "normal",
  refereeName: "Jan Vopička", refereeTrait: "pouští hodně výhod",
  incident: null, opponentStatement: null, scorers: [], gameWeek: 7,
};

describe("kauza v pozápasovém rozhovoru", () => {
  const scandal = { ref: "sanction:1", fact: "Disciplinárka klubu napařila pokutu 6 300 Kč za házení předmětů.", names: [] };

  it("kauza nahradí obecnou otázku na soupeře", () => {
    const q = buildFallbackQuestions({ ...baseCtx, scandal });
    expect(q.map((x) => x.key)).toEqual(["vysledek", "rozhodci", "scandal"]);
    const k = q.find((x) => x.key === "scandal")!;
    expect(k.question).toContain("6 300 Kč");
    expect(k.ref).toBe("sanction:1");
    expect(k.question.trim().endsWith("?")).toBe(true);
  });

  it("citát soupeře zůstane i vedle kauzy", () => {
    const q = buildFallbackQuestions({
      ...baseCtx, scandal, opponentStatement: { quote: "Ti by neuhlídali ani balón.", tone: "provoke" },
    });
    expect(q.map((x) => x.key)).toEqual(["vysledek", "rozhodci", "scandal", "vyrok_soupere"]);
  });

  it("bez kauzy zůstává dosavadní trojice", () => {
    const q = buildFallbackQuestions(baseCtx);
    expect(q.map((x) => x.key)).toEqual(["vysledek", "rozhodci", "vyrok_soupere"]);
  });

  it("u výprasku se občas zeptá i nepříjemně", () => {
    const questions = new Set<string>();
    for (let i = 0; i < 80; i++) {
      questions.add(buildFallbackQuestions({ ...baseCtx, matchId: `m${i}` })[0].question);
    }
    expect([...questions].some((o) => o.includes("omluvu") || o.includes("vinu"))).toBe(true);
  });
});
