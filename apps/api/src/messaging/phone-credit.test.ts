/** Testy předplacenky — zbytek modulu sahá na DB a ověřuje se na testingu. */
import { describe, it, expect } from "vitest";
import { creditWord, DENNI_KREDIT, CENA_SMS } from "./phone-credit";

describe("kredit na telefonu", () => {
  it("denní dobití vyjde na rozumný počet zpráv", () => {
    const zprav = Math.floor(DENNI_KREDIT / CENA_SMS);
    expect(zprav).toBeGreaterThanOrEqual(5);
    expect(zprav).toBeLessThanOrEqual(30);
  });

  it("dobití je dělitelné cenou SMS, jinak zbude koruna, co k ničemu není", () => {
    expect(DENNI_KREDIT % CENA_SMS).toBe(0);
  });

  it("zbytek, co nestačí na jednu SMS, je z pohledu hráče došlý kredit", () => {
    expect(creditWord(0, DENNI_KREDIT)).toBe("Kredit došel");
    expect(creditWord(CENA_SMS - 1, DENNI_KREDIT)).toBe("Kredit došel");
    expect(creditWord(-5, DENNI_KREDIT)).toBe("Kredit došel");
  });

  it("varuje, když zbývá poslední čtvrtina", () => {
    expect(creditWord(CENA_SMS, DENNI_KREDIT)).toBe("Dochází kredit");
    expect(creditWord(DENNI_KREDIT, DENNI_KREDIT)).toBe("Kredit v pořádku");
  });

  it("i s malým dobitím varování přijde, ne až po vyčerpání", () => {
    expect(creditWord(CENA_SMS, CENA_SMS * 2)).toBe("Dochází kredit");
  });
});
