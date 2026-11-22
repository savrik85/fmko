/**
 * Docházka den před zápasem v kabině zápasu: věty hráčů se v jedné kabině neopakují.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateAttendanceMessage } from "./message-generator";

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
