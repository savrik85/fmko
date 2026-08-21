import { describe, expect, it } from "vitest";
import { electionNote, winnerLabel } from "./officials";

const vitez = (votes: number) => ({ votes });

describe("věta o výsledku volby", () => {
  it("napíše poměr hlasů, ale ne jméno — to se vypisuje zvlášť", () => {
    expect(electionNote(vitez(3), 5, 0)).toBe("Získal 3 z 5 hlasů.");
  });

  it("jediný hlas skloňuje", () => {
    expect(electionNote(vitez(1), 1, 0)).toBe("Získal 1 z 1 hlasu.");
  });

  it("hlásí propadlé hlasy po odstoupení kandidáta", () => {
    // Bez tohohle by čísla v zápisu nesouhlasila s tím, kolik klubů hlasovalo.
    expect(electionNote(vitez(2), 3, 1))
      .toBe("Získal 2 z 3 hlasů. 1 hlas propadl — kandidát odstoupil.");
    expect(electionNote(vitez(2), 3, 3)).toContain("3 hlasy propadly");
    expect(electionNote(vitez(2), 3, 7)).toContain("7 hlasů propadlo");
  });

  it("bez kandidáta zůstane funkce neobsazená", () => {
    expect(electionNote(null, 0, 0)).toBe("Nikdo nekandidoval — funkce zůstává neobsazená.");
  });

  it("odstoupili-li všichni, řekne to na rovinu", () => {
    expect(electionNote(null, 0, 4)).toContain("všichni kandidáti odstoupili");
  });

  it("zvolený se podepíše jménem s klubem, a bez trenéra aspoň klubem", () => {
    expect(winnerLabel("Lukáš Kučera", "SK Braník")).toBe("Lukáš Kučera (SK Braník)");
    expect(winnerLabel(null, "SK Braník")).toBe("SK Braník");
    expect(winnerLabel(null, null)).toBe("neznámý trenér");
  });
});
