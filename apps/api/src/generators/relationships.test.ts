import { describe, expect, it } from "vitest";
import type { RelationshipType } from "@okresni-masina/shared";
import { createRng } from "./rng";
import { completeGeneratedFamilies, missingFamilyLinks, type GeneratedRelationship } from "./relationships";

const link = (a: string, b: string, type: RelationshipType) => ({ a, b, type });
const fixesOf = (ages: Record<string, number>, links: Array<{ a: string; b: string; type: RelationshipType }>) =>
  missingFamilyLinks(createRng(1), new Map(Object.entries(ages)), links)
    .map((f) => ({ pair: [f.a, f.b].sort().join("+"), type: f.type, replaces: f.replaces }));

describe("rodina v kádru je celá", () => {
  it("bratr bratra je bratr i s rozdílem deseti let (Veselí ve Forpsi Čkyni)", () => {
    const fixes = fixesOf({ lukas: 33, jan: 28, filip: 23 }, [link("jan", "filip", "brothers"), link("lukas", "jan", "brothers")]);
    expect(fixes).toEqual([{ pair: "filip+lukas", type: "brothers", replaces: null }]);
  });

  it("synové jednoho otce jsou bratři", () => {
    const fixes = fixesOf({ pavel: 37, adam: 18, vojta: 17 }, [link("adam", "pavel", "father_son"), link("pavel", "vojta", "father_son")]);
    expect(fixes).toEqual([{ pair: "adam+vojta", type: "brothers", replaces: null }]);
  });

  it("bratr syna je taky syn, i když je otec starší jen o 17 let", () => {
    const fixes = fixesOf({ otec: 44, filip: 25, jan: 27 }, [link("otec", "filip", "father_son"), link("filip", "jan", "brothers")]);
    expect(fixes).toEqual([{ pair: "jan+otec", type: "father_son", replaces: null }]);
  });

  it("jinou vazbu dvojice nahradí rodina, celou rodinu nechá být", () => {
    expect(fixesOf({ a: 30, b: 28, c: 26 }, [link("a", "b", "brothers"), link("b", "c", "brothers"), link("a", "c", "rivals")]))
      .toEqual([{ pair: "a+c", type: "brothers", replaces: "rivals" }]);
    expect(fixesOf({ a: 30, b: 28, c: 26 }, [link("a", "b", "brothers"), link("b", "c", "brothers"), link("a", "c", "brothers")])).toEqual([]);
  });

  it("rodinu, jejíž vazby si odporují, ani hráče mimo kádr nedoplňuje", () => {
    // Bratr je zároveň otcem: z takových dat se rodina poskládat nedá.
    expect(fixesOf({ a: 20, b: 22, c: 45, d: 21 }, [
      link("a", "b", "brothers"), link("b", "c", "father_son"), link("c", "a", "brothers"), link("d", "a", "brothers"),
    ])).toEqual([]);
    // Bratr, který z klubu odešel (není v kádru), rodinu nespojuje.
    expect(fixesOf({ a: 30, c: 26 }, [link("a", "b", "brothers"), link("b", "c", "brothers")])).toEqual([]);
  });

  it("vygenerovaný kádr: doplní vazbu do pole a jinou vazbu dvojice přepíše", () => {
    const rels: GeneratedRelationship[] = [
      { playerAIndex: 0, playerBIndex: 1, type: "father_son", strength: 70 },
      { playerAIndex: 0, playerBIndex: 2, type: "father_son", strength: 70 },
      { playerAIndex: 1, playerBIndex: 3, type: "brothers", strength: 80 },
      { playerAIndex: 2, playerBIndex: 3, type: "classmates", strength: 40 },
    ];
    completeGeneratedFamilies(createRng(2), [{ age: 45 }, { age: 22 }, { age: 20 }, { age: 21 }], rels);
    const typeOf = (a: number, b: number) => rels.filter((r) => [r.playerAIndex, r.playerBIndex].sort().join() === [a, b].sort().join()).map((r) => r.type);
    expect(typeOf(1, 2)).toEqual(["brothers"]);
    expect(typeOf(0, 3)).toEqual(["father_son"]);
    expect(typeOf(2, 3)).toEqual(["brothers"]);
    expect(rels).toHaveLength(6);
  });
});
