import { describe, expect, it } from "vitest";
import { managerNameTokens, mentionsManager } from "./public-landing";

describe("titulky na vstupní stránce", () => {
  const tokens = managerNameTokens(["Zdeněk Jungvirt", "Petr Hodouch", null, "Jan"]);
  it("vyřadí titulek se jménem manažera i ve skloňování", () => {
    expect(mentionsManager("Zdeněk Jungvirt si po zápase pustil pusu na špacír", tokens)).toBe(true);
    expect(mentionsManager("„Čkyně? Rozstřílíme je!“ hřímá Hodouch", tokens)).toBe(true);
    expect(mentionsManager("Hodouchovi to nevyšlo", tokens)).toBe(true);
  });
  it("pustí titulek o vymyšlených hráčích a krátká jména nebere", () => {
    expect(tokens).not.toContain("jan");
    expect(mentionsManager("Šesté kolo: Déšť, prázdno a kde je ten kotel?!", tokens)).toBe(false);
  });
});
