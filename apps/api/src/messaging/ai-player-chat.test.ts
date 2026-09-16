/**
 * Co model při chatu s hráčem doopravdy dostane.
 *
 * Prompt je jediné místo, kde se rozhoduje, jestli zpráva zní jako od člověka.
 * Testuje se jeho obsah, ne odpověď modelu: ta se lokálně ověřit nedá.
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const hrac = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "p-1", firstName: "Franta", lastName: "Novák", age: 31, position: "MID",
  morale: 60, condition: 70, coachRelationship: 55,
  discipline: 50, patriotism: 50, alcohol: 50, temper: 50,
  leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 200, recentRatingAvg: 6.5, isCelebrity: false,
  occupation: "Zedník", ...o,
});

const tym = { teamName: "TJ Dvory", managerName: "Zdeněk", villageName: "Dvory" };

/** Pražský čas, leden kvůli zimnímu času. */
const kdy = (den: number, hodina: number) =>
  new Date(Date.UTC(2027, 0, 3 + den, hodina - 1, 0, 0));

describe("hráč ví, kolik je hodin", () => {
  it("v noci ho SMS vzbudí a smí se ohnat, koho vzbudil", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(2, 2));
    expect(p).toContain("SPAL JSI");
    expect(p).toMatch(/psa|kočku/);
  });

  it("v pracovní době stojí v práci a má po ruce svou výmluvu", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(2, 9));
    expect(p).toContain("V PRÁCI");
    expect(p).toContain("zedník");
  });

  it("v sobotu odpoledne má volno", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(6, 14));
    expect(p).toContain("volno");
    expect(p).not.toContain("V PRÁCI");
  });

  it("den v týdnu je v promptu", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(1, 18))).toContain("pondělí");
  });

  it("hospodský je v deset večer za pípou, zedník doma", () => {
    expect(buildSystemPrompt(hrac({ occupation: "Hospodský" }), tym, kdy(2, 22))).toContain("V PRÁCI");
    expect(buildSystemPrompt(hrac({ occupation: "Zedník" }), tym, kdy(2, 22))).toContain("SPAL JSI");
  });
});

describe("hráč píše jako člověk", () => {
  it("mladík dostane povolení na emoji, matador ne", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("Emoji používej běžně");
    expect(buildSystemPrompt(hrac({ age: 41 }), tym, kdy(6, 14))).toContain("Emoji skoro nepoužívej");
  });

  it("míč a branka mezi emoji nepatří, je hráč a ne fanoušek", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("nepatří ⚽");
  });

  it("dostane rámec domácnosti podle věku", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("u rodičů");
    expect(buildSystemPrompt(hrac({ age: 50 }), tym, kdy(6, 14))).toContain("odrostlé");
  });

  it("nemá hlásit hodinu v každé zprávě", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 9))).toContain("Nezačínej každou zprávu hlášením");
  });

  it("povaha a stará pravidla zůstala", () => {
    const p = buildSystemPrompt(hrac({ temper: 80 }), tym, kdy(6, 14));
    expect(p).toContain("vysoký temperament");
    expect(p).toContain("trenére");
    expect(p).toContain("Zdeněk");
  });
});
