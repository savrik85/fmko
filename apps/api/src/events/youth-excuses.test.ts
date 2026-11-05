import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { generateAbsences, type PlayerForAbsence } from "./absence";
import { pickYouthExcuse, pickYouthTrainingReason } from "./youth-excuses";
import { simulateAttendance } from "../season/training";

const base: PlayerForAbsence = {
  firstName: "Jan", lastName: "Novák", age: 17, occupation: "Student", discipline: 10, patriotism: 50,
  alcohol: 20, temper: 50, morale: 20, stamina: 50, injuryProneness: 30,
};

describe("omluvenky mladých", () => {
  it("diskotéka ve městě okresu, ne pro třináctiletého", () => {
    const rng = createRng(1);
    const texts = new Set<string>();
    for (let i = 0; i < 300; i++) texts.add(pickYouthExcuse(rng, 17, "match_day", "Prachatice", new Set())!.text);
    expect([...texts].some((t) => /diskoték.* (v Prachaticích|ve Vimperku|v Netolicích|ve Volarech)/.test(t))).toBe(true);
    for (let i = 0; i < 300; i++) {
      const e = pickYouthExcuse(rng, 13, "any", "Prachatice", new Set());
      expect(e?.text ?? "").not.toMatch(/diskoték|osmnáctiny|taneční/);
    }
  });

  it("v Praze jiná místa, bez okresu „ve městě“", () => {
    const rng = createRng(2);
    for (let i = 0; i < 100; i++) expect(pickYouthTrainingReason(rng, 16, "Okres X")).not.toMatch(/\{town\}/);
  });

  it("šestnáctiletý se nevymlouvá na manželku ani na kocovinu", () => {
    const squad = Array.from({ length: 200 }, (_, i) => ({ ...base, age: 15, firstName: `J${i}` }));
    const res = generateAbsences(createRng(3), squad, { district: "Prachatice" });
    expect(res.length).toBeGreaterThan(10);
    for (const a of res) {
      expect(a.smsText).not.toMatch(/[Mm]anželk|[Žž]enská|dcer|[Tt]chýn/);
      expect(a.category).not.toBe("hangover");
    }
    expect(res.some((a) => /taneční|škol|matik|chalup|řidičák|výlet/.test(a.smsText))).toBe(true);
  });

  it("trénink: mladý má taneční nebo školu, ne rodinu", () => {
    const squad = Array.from({ length: 300 }, () => ({ age: 16, discipline: 5, occupation: "Student" })) as unknown as Parameters<typeof simulateAttendance>[1];
    const att = simulateAttendance(createRng(4), squad, "balanced" as Parameters<typeof simulateAttendance>[2], undefined, 0, 40, undefined, undefined, "Prachatice");
    const reasons = att.filter((a) => !a.attended).map((a) => a.reason ?? "");
    expect(reasons.length).toBeGreaterThan(20);
    for (const r of reasons) expect(r).not.toMatch(/[Žž]en[ěa]|[Mm]anželk|[Dd]cer|[Tt]chýn|povýšení/);
    expect(reasons.some((r) => /taneční/.test(r))).toBe(true);
  });
});
