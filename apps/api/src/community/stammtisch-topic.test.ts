import { describe, expect, it } from "vitest";
import { normalizeStammtischTopic, stammtischInviteText } from "./relation-texts";

describe("téma posezení s trenéry", () => {
  it("prázdné nebo jen mezery znamená bez tématu", () => {
    expect(normalizeStammtischTopic(undefined)).toBeNull();
    expect(normalizeStammtischTopic(42)).toBeNull();
    expect(normalizeStammtischTopic("   \n ")).toBeNull();
  });

  it("srazí řádky a mezery do jednoho řádku", () => {
    expect(normalizeStammtischTopic("  Kdo letos\n\nspadne?  ")).toBe("Kdo letos spadne?");
  });

  it("pozvánka bez tématu zůstává jako dřív", () => {
    expect(stammtischInviteText("Jan Novák", "Sokol Lhota", null))
      .toBe("Trenér Jan Novák (Sokol Lhota) tě zve dnes večer na posezení s trenéry. Přijmi nebo odmítni ve své hospodě.");
  });

  it("téma se v pozvánce objeví v uvozovkách", () => {
    expect(stammtischInviteText("Jan Novák", "Sokol Lhota", "Kdo letos spadne?"))
      .toBe("Trenér Jan Novák (Sokol Lhota) tě zve dnes večer na posezení s trenéry. Téma: „Kdo letos spadne?“. Přijmi nebo odmítni ve své hospodě.");
  });
});
