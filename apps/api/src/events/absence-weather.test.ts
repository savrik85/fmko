import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateAbsences, type PlayerForAbsence } from "./absence";

const KADR: PlayerForAbsence[] = Array.from({ length: 40 }, (_, i) => ({
  firstName: "Hráč", lastName: `Č${i}`, age: 20 + (i % 25),
  occupation: ["Zedník", "Traktorista", "Účetní", "Student", "Hospodský"][i % 5],
  discipline: 5 + (i % 40), patriotism: 40, alcohol: 55, temper: 45,
  morale: 40, stamina: 65, injuryProneness: 45, commuteKm: 3 + (i % 15),
}));

const vsechnyTexty = (weather?: "sunny" | "rain" | "snow" | "wind" | "cloudy") => {
  const out = new Set<string>();
  for (let seed = 1; seed <= 400; seed++) {
    for (const a of generateAbsences(createRng(seed), KADR, { timing: "match_day", district: "Prachatice", weather })) {
      out.add(a.smsText);
    }
  }
  return out;
};

/**
 * Výmluvy vázané na počasí se smí objevit jen za něj. Do 2026-08 tahle vazba
 * neexistovala a „Na Zadově sníh, řetězy nemám" mohlo přijít v červenci.
 */
describe("obecné výmluvy podle počasí", () => {
  const zaSnehu = vsechnyTexty("snow");
  const zaSlunce = vsechnyTexty("sunny");
  const bezPocasi = vsechnyTexty(undefined);

  it("sněhové výmluvy chodí ve sněhu", () => {
    expect([...zaSnehu].some((t) => t.includes("vánici") || t.includes("zrcadlo") || t.includes("pod nulou"))).toBe(true);
  });

  it("sněhové výmluvy nikdy nechodí za slunce", () => {
    for (const t of ["V týhle vánici nikam nejedu, sotva vidím na kapotu", "Na Zadově sníh, řetězy nemám a ten kopec prostě nevyjedu"]) {
      expect(zaSlunce.has(t), t).toBe(false);
    }
  });

  it("výmluvy na vedro chodí jen za slunce", () => {
    const vedro = "V tomhle vedru se uběhat nedám, jdu radši k vodě";
    expect(zaSlunce.has(vedro)).toBe(true);
    expect(zaSnehu.has(vedro)).toBe(false);
  });

  it("bez známého počasí se povětrnostní výmluvy vynechají úplně", () => {
    for (const t of ["V týhle vánici nikam nejedu, sotva vidím na kapotu", "V tomhle vedru se uběhat nedám, jdu radši k vodě"]) {
      expect(bezPocasi.has(t), t).toBe(false);
    }
  });

  it("i bez počasí se pořád generují normální výmluvy", () => {
    expect(bezPocasi.size).toBeGreaterThan(15);
  });

  it("počasí nemění POČET absencí, jen jejich text", () => {
    // Kdyby počasí hýbalo pravděpodobností, rozešla by se SMS se simulací
    // u zápasů, kde se počasí nepodařilo odvodit.
    const pocet = (w?: "snow" | "sunny") => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        n += generateAbsences(createRng(seed), KADR, { timing: "match_day", weather: w }).length;
      }
      return n;
    };
    expect(pocet("snow")).toBe(pocet(undefined));
    expect(pocet("sunny")).toBe(pocet(undefined));
  });
});
