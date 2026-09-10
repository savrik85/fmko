/** České tvary v hlášeních o partách — u dvou se mění i sloveso. */
import { describe, it, expect } from "vitest";
import { odesloLidi, zavrenoNaZapasy, pripadu } from "./fan-groups";

describe("české tvary číslovek", () => {
  it("odchod fanoušků skloňuje podstatné jméno i sloveso", () => {
    expect(odesloLidi(1)).toBe("Odešel jeden člověk.");
    expect(odesloLidi(2)).toBe("Odešli 2 lidé.");
    expect(odesloLidi(4)).toBe("Odešli 4 lidé.");
    expect(odesloLidi(5)).toBe("Odešlo 5 lidí.");
    expect(odesloLidi(21)).toBe("Odešlo 21 lidí.");
  });

  it("uzavření sektoru", () => {
    expect(zavrenoNaZapasy(1)).toBe("jeden zápas");
    expect(zavrenoNaZapasy(2)).toBe("2 zápasy");
    expect(zavrenoNaZapasy(5)).toBe("5 zápasů");
  });

  it("počet případů", () => {
    expect(pripadu(1)).toBe("poslední případ");
    expect(pripadu(3)).toBe("poslední 3 případy");
    expect(pripadu(10)).toBe("posledních 10 případů");
  });
});
