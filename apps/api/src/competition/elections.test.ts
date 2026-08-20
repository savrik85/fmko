import { describe, expect, it } from "vitest";
import { electionNote } from "./officials";

const vitez = (votes: number) =>
  ({ managerName: "Lukáš Kučera", teamName: "SK Braník", votes });

describe("věta o výsledku volby", () => {
  it("napíše jméno zvoleného i poměr hlasů", () => {
    expect(electionNote(vitez(3), 5, 0)).toBe("Zvolen Lukáš Kučera (SK Braník) — 3 z 5 hlasů.");
  });

  it("jediný hlas skloňuje", () => {
    expect(electionNote(vitez(1), 1, 0)).toBe("Zvolen Lukáš Kučera (SK Braník) — 1 z 1 hlasu.");
  });

  it("hlásí propadlé hlasy po odstoupení kandidáta", () => {
    // Bez tohohle by čísla v zápisu nesouhlasila s tím, kolik klubů hlasovalo.
    expect(electionNote(vitez(2), 3, 1))
      .toBe("Zvolen Lukáš Kučera (SK Braník) — 2 z 3 hlasů. 1 hlas propadl — kandidát odstoupil.");
    expect(electionNote(vitez(2), 3, 3)).toContain("3 hlasy propadly");
    expect(electionNote(vitez(2), 3, 7)).toContain("7 hlasů propadlo");
  });

  it("bez kandidáta zůstane funkce neobsazená", () => {
    expect(electionNote(null, 0, 0)).toBe("Nikdo nekandidoval — funkce zůstává neobsazená.");
  });

  it("odstoupili-li všichni, řekne to na rovinu", () => {
    expect(electionNote(null, 0, 4)).toContain("všichni kandidáti odstoupili");
  });

  it("klub bez trenéra se podepíše aspoň názvem", () => {
    expect(electionNote({ managerName: null, teamName: "SK Braník", votes: 2 }, 2, 0))
      .toBe("Zvolen SK Braník — 2 z 2 hlasů.");
  });
});
