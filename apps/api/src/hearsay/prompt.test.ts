/**
 * Paměť hráče v promptu (plán Task 9): co se o sobě doslechl má přednost, zdroj je slovy,
 * nejvýš tři řádky a nic, co v DB není.
 */
import { describe, expect, it } from "vitest";
import { hearsayPromptLines, type HearsayMemoryLine } from "./prompt";

const aboutMe: HearsayMemoryLine = {
  aboutMe: true, origin: "coach_sms", subjectName: "Rostislav Šmejkal", recipientName: "Radek Šíma",
  quote: "Šmejkal se fláká", kind: "criticism", via: "brothers", fromName: "Radek Šíma", learnedAt: "2026-11-21T10:00:00Z",
};
const aboutOther: HearsayMemoryLine = {
  aboutMe: false, origin: "coach_sms", subjectName: "Patrik Král", recipientName: "Radek Šíma",
  quote: "Král má blbý kecy", kind: "criticism", via: "pub", fromName: "Radek Šíma", learnedAt: "2026-11-21T11:00:00Z",
};

describe("paměť toho, co hráč slyšel", () => {
  it("o sobě má přednost a zdroj je slovy", () => {
    const lines = hearsayPromptLines([aboutOther, aboutMe]);
    expect(lines[0]).toContain("Šmejkal se fláká");
    expect(lines[0]).toContain("Radek Šíma (tvůj brácha)");
    expect(lines[1]).toContain("Král má blbý kecy");
    expect(lines[1]).toContain("v hospodě");
    expect(lines.at(-1)).toMatch(/nevymýšlej/);
  });

  it("před kabinou to ví sám, bez zdroje", () => {
    const [line] = hearsayPromptLines([{ ...aboutMe, via: "squad_chat", fromName: null, recipientName: null }]);
    expect(line).toContain("do kabiny");
    expect(line).toContain("Šmejkal se fláká");
  });

  it("nejvýš tři řádky", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...aboutOther, quote: `věta ${i}` }));
    expect(hearsayPromptLines(many).filter((l) => l.includes("věta"))).toHaveLength(3);
  });

  it("bez znalostí nic", () => {
    expect(hearsayPromptLines(undefined)).toEqual([]);
    expect(hearsayPromptLines([])).toEqual([]);
  });

  it("texty bez dlouhé pomlčky", () => {
    const all = hearsayPromptLines([aboutMe, aboutOther, { ...aboutMe, origin: "captain_change", quote: "Kapitánem je teď David Daniel", kind: "decision_against", recipientName: null }]);
    for (const l of all) expect(l).not.toMatch(/[—–]/);
  });
});
