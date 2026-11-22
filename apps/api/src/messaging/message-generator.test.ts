/**
 * Docházka den před zápasem v kabině zápasu: věty hráčů se v jedné kabině neopakují.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { ATTENDANCE_LATE, ATTENDANCE_NO, ATTENDANCE_YES, dayBeforeSquadLines, generateAttendanceMessage, varyLine } from "./message-generator";

describe("docházka do kabiny zápasu", () => {
  it("patnáct hráčů v jedné kabině: každý jinou větou (dřív los bez paměti z deseti variant)", () => {
    const rng = createRng(7);
    const used = new Set<string>();
    const bodies = Array.from({ length: 15 }, (_, i) => generateAttendanceMessage(`Hráč ${i}`, true, 100, rng, used).body);
    expect(new Set(bodies).size).toBe(15);
    const no = Array.from({ length: 6 }, (_, i) => generateAttendanceMessage(`Omluvený ${i}`, false, 100, rng, used).body);
    expect(new Set(no).size).toBe(6);
  });

  it("bez sady použitých vět se chová jako dřív (stejné semínko, stejná věta)", () => {
    expect(generateAttendanceMessage("A", true, 100, createRng(3)).body).toBe(generateAttendanceMessage("A", true, 100, createRng(3)).body);
  });
});

// final3 Chyba 6 (ticky 2. a 4. 12.): 38 kabin, 763 vět, 24 duplikátů. FC AppYours Čkyně má 31
// hráčů, nikdo se neomluvil, a v kabině bylo 24 různých vět („Jo, dorazím i s kopačkama“ 3×).
describe("kabina den před zápasem: velký kádr bez kopií", () => {
  const squad = (n: number, own: Record<number, string> = {}, absent: ReadonlySet<number> = new Set()) =>
    Array.from({ length: n }, (_, i) => ({ name: `Hráč ${i}`, available: !absent.has(i), condition: 100, ownText: own[i] }));

  it("AppYours: 31 hráčů, všichni přijdou, 31 různých vět", () => {
    const lines = dayBeforeSquadLines(squad(31), createRng(20261204));
    expect(lines).toHaveLength(31);
    expect(new Set(lines).size).toBe(31);
  });

  it("35 hráčů v kádru: věty z poolů stačí, bez obměn", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const lines = dayBeforeSquadLines(squad(35), createRng(seed));
      expect(new Set(lines).size, `seed ${seed}`).toBe(35);
      for (const l of lines) expect([...ATTENDANCE_YES, ...ATTENDANCE_LATE], l).toContain(l);
    }
  });

  it("omluvenky se mezi sebou nehlídaly: dvakrát „Musím do práce, nemůžu přijít“ (Jitona) dostane obměnu", () => {
    const work = "Musím do práce, nemůžu přijít";
    const lines = dayBeforeSquadLines(squad(18, { 3: work, 9: work, 12: "Jo, dorazím i s kopačkama" }, new Set([3, 9])), createRng(42));
    expect(new Set(lines).size).toBe(18);
    expect(lines[3]).toBe(work);
    expect(lines[9]).not.toBe(work);
    expect(lines[9].toLowerCase()).toContain(work.toLowerCase().replace(/\.$/, ""));
    expect(lines[12]).toBe("Jo, dorazím i s kopačkama");
    for (const l of lines) expect(l).not.toContain("—");
  });

  it("stejné semínko, stejné věty; los se volá stejně jako dřív (omluvení se nemění)", () => {
    const own = { 2: "Dneska ne, hlídám děti" };
    expect(dayBeforeSquadLines(squad(31, own, new Set([2])), createRng(9))).toEqual(dayBeforeSquadLines(squad(31, own, new Set([2])), createRng(9)));
    const a = createRng(9);
    dayBeforeSquadLines(squad(31, own, new Set([2])), a);
    const b = createRng(9);
    for (let i = 0; i < 31; i++) generateAttendanceMessage(`Hráč ${i}`, i !== 2, 100, b);
    expect(a.random()).toBe(b.random());
  });

  it("pooly pokryjí 35členný kádr, věty jsou různé a bez dlouhé pomlčky", () => {
    expect(ATTENDANCE_YES.length).toBeGreaterThanOrEqual(36);
    expect(ATTENDANCE_LATE.length).toBeGreaterThanOrEqual(10);
    expect(ATTENDANCE_NO.length).toBeGreaterThanOrEqual(12);
    const all = [...ATTENDANCE_YES, ...ATTENDANCE_LATE, ...ATTENDANCE_NO];
    expect(new Set(all).size).toBe(all.length);
    for (const t of all) expect(t).not.toContain("—");
  });

  it("obměna věty: jiná než všechny zabrané, bez dvojího „trenére“", () => {
    const taken = new Set(["Jo, přijedu"]);
    const v = varyLine("Jo, přijedu", taken);
    expect(taken.has(v)).toBe(false);
    expect(v.toLowerCase()).toContain("přijedu");
    expect(varyLine("Odpustíš, trenére? Mám raut v práci", new Set(["Odpustíš, trenére? Mám raut v práci"])).match(/trenére/gi)).toHaveLength(1);
    expect(varyLine("Jsem tam! 💪", new Set(["Jsem tam! 💪"]))).not.toMatch(/💪,/);
  });
});
