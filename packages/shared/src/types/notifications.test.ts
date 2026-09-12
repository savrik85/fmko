/** Rozbor titulku oznámení — jediné místo, kde se emoji z titulku odděluje. */
import { describe, it, expect } from "vitest";
import { rozdelTitulekOznameni, NOTIFIKACE_IKONY } from "./notifications";

describe("titulek oznámení", () => {
  it("vedoucí emoji se stane ikonou a z textu zmizí", () => {
    expect(rozdelTitulekOznameni("🚨 Výtržnosti na stadionu", "event"))
      .toEqual({ ikona: "🚨", text: "Výtržnosti na stadionu" });
  });

  it("bez emoji se použije ikona podle druhu", () => {
    expect(rozdelTitulekOznameni("Zápas skončil", "match_result"))
      .toEqual({ ikona: NOTIFIKACE_IKONY.match_result, text: "Zápas skončil" });
  });

  it("neznámý druh dostane obecnou ikonu, ne prázdno", () => {
    const v = rozdelTitulekOznameni("Něco se stalo", "nesmysl");
    expect(v.ikona.length).toBeGreaterThan(0);
    expect(v.text).toBe("Něco se stalo");
  });

  it("emoji složené z víc znaků se nerozpůlí", () => {
    // Varianta se selektorem i sekvence spojená ZWJ.
    expect(rozdelTitulekOznameni("⚠️ Pozor", "system").ikona).toBe("⚠️");
    expect(rozdelTitulekOznameni("👨‍👩‍👧 Rodiny odcházejí", "event").ikona).toBe("👨‍👩‍👧");
  });

  it("titulek složený jen z emoji zůstane celý, prázdná karta by byla horší", () => {
    expect(rozdelTitulekOznameni("🎉", "event")).toEqual({ ikona: "🎉", text: "🎉" });
  });

  it("emoji uprostřed se nebere, ikona patří jen na začátek", () => {
    const v = rozdelTitulekOznameni("Gól! ⚽ v 90. minutě", "match_result");
    expect(v.text).toBe("Gól! ⚽ v 90. minutě");
    expect(v.ikona).toBe(NOTIFIKACE_IKONY.match_result);
  });
});
