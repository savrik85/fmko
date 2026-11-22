import { describe, expect, it } from "vitest";
import { addressFormOf, addressRetryRule, historyAddressForm, wrongAddress } from "./address-form";

// Doslovné zprávy z lokálního E2E 22. 11. (retest1.md, Tykání/vykání).
describe("tvar oslovení ve zprávě", () => {
  it.each([
    ["Nic moc, jen si užívám neděli odpoledne. A vy trenére?", "vy"],
    ["Relax, rodina. A vy co děláte, trenére?", "vy"],
    ["Promiňte, trenére, včera jsem byl opilý, ale přiznám se, že jsem vzal to ozvučení ze skladu. Byla to blbost, víte.", "vy"],
    ["Trenére, jste borec, držte palce!", "vy"],
    ["Fakt mě štve, že jste odmítl nabídku z Týna.", "vy"],
    ["Mohl byste mi to vysvětlit?", "vy"],
    ["Měl bys se stavit zapít s námi na tu malou, ne?", "ty"],
    ["To je super, že přijdeš zapít na Kristýnku! Kdy to plánuješ?", "ty"],
    ["Ty víš, že jsem včera trochu ztratil soudnost 😅. Nic jsem neukradl, už jsem ti to říkal.", "ty"],
    ["Díky, trenére, že jsi přišel zapít malýho Josefa!", "ty"],
    ["trenere diky za vsechno jsi fakt dobry trener", "ty"],
    ["Co ty na to?", "ty"],
    ["A ty, trenére?", "ty"],
    ["Říkals, že budu hrát.", "ty"],
  ] as const)("%s → %s", (text, form) => {
    expect(addressFormOf(text)).toBe(form);
  });

  it.each([
    "Ty dresy jsem opravdu vzal, mám je doma.",
    "V úterý dorazím, trenére.",
    "Jsme pátí, ne?",
    "Lukáš je borec, dneska spíš odpočívám.",
    "Náš tým to zvládne, příliš se nebojím.",
    "Kristýna roste jako plevel 🍼",
  ])("bez tvaru: %s", (text) => {
    expect(addressFormOf(text)).toBeNull();
  });
});

describe("tvar z historie hráče", () => {
  it("převažuje vykání (Mráz do 18. 11.), i když jedna zpráva tyká", () => {
    expect(historyAddressForm([
      "Trenére, jste borec, díky!",
      "Držte nám palce v neděli.",
      "Jo, v úterý dorazím.",
      "Měl bys se stavit zapít s námi na tu malou, ne?",
      "Promiňte, že píšu tak pozdě.",
    ])).toBe("vy");
  });

  it("bez zpráv s tvarem nebo při remíze nic (rozhodne věk a id)", () => {
    expect(historyAddressForm([])).toBeNull();
    expect(historyAddressForm(["V úterý dorazím.", "Jsme pátí."])).toBeNull();
    expect(historyAddressForm(["Jste borec.", "Jsi borec."])).toBeNull();
  });

  it("špatný tvar jen u zprávy s opačným tvarem; zpráva bez tvaru je v pořádku", () => {
    expect(wrongAddress("A vy co děláte, trenére?", "ty")).toBe(true);
    expect(wrongAddress("A ty, trenére?", "ty")).toBe(false);
    expect(wrongAddress("V úterý dorazím.", "vy")).toBe(false);
    expect(wrongAddress("A vy co děláte, trenére?", undefined)).toBe(false);
    expect(addressRetryRule("vy")).toContain("VYKÁŠ");
    expect(addressRetryRule("ty")).toContain("TYKÁŠ");
  });
});
