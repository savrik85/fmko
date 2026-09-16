/**
 * Texty na zdi.
 *
 * Hlídá to, kvůli čemu tahle vrstva vznikla: aby fanoušek nečetl tutéž větu
 * dvakrát pod jiným jménem.
 */
import { describe, it, expect } from "vitest";
import {
  vyberText, doplnText, lajky, goluTvar,
  PRISPEVKY_K_UDALOSTEM, PRISPEVKY_K_ZAPASU, PRISPEVKY_KE_STRELBE,
  PRISPEVKY_K_VYTRZNOSTEM, PRISPEVKY_K_TAKTICE, PRISPEVKY_K_OBLIBENCUM,
  PRISPEVKY_K_RIVALITE,
} from "./fan-posts";

describe("výběr textu", () => {
  const texty = ["První.", "Druhá.", "Třetí."];

  it("nesáhne po tom, co už na zdi visí", () => {
    const t = vyberText(texty, {}, new Set(["První.", "Druhá."]), 0);
    expect(t).toBe("Třetí.");
  });

  it("když jsou všechny varianty pryč, radši nenapíše nic", () => {
    expect(vyberText(texty, {}, new Set(texty), 0.5)).toBeNull();
  });

  it("stejný hod dá stejný text, aby šel běh zopakovat", () => {
    expect(vyberText(texty, {}, new Set(), 0.42)).toBe(vyberText(texty, {}, new Set(), 0.42));
  });

  it("různé hody rozprostřou celý pool", () => {
    const videne = new Set<string>();
    for (const roll of [0, 0.34, 0.67, 0.99]) videne.add(vyberText(texty, {}, new Set(), roll)!);
    expect(videne.size).toBe(3);
  });

  it("doplní detaily z payloadu", () => {
    expect(vyberText(["Tak {co} jde.", "x"], { co: "Novák" }, new Set(), 0)).toBe("Tak Novák jde.");
  });
});

describe("katalog šablon", () => {
  const vsechny = [
    ...Object.values(PRISPEVKY_K_UDALOSTEM).flat(),
    ...Object.values(PRISPEVKY_K_VYTRZNOSTEM).flat(),
    ...Object.values(PRISPEVKY_K_ZAPASU).flat(),
    ...Object.values(PRISPEVKY_K_OBLIBENCUM).flat(),
    ...Object.values(PRISPEVKY_K_TAKTICE).flat(),
    ...Object.values(PRISPEVKY_KE_STRELBE).flat(),
    ...PRISPEVKY_K_RIVALITE,
  ].filter((s) => s !== undefined);

  it("každý blok má dost vět, aby se dvě party netrefily do stejné", () => {
    // K jedné události se ozývají až tři party. Pod čtyřmi variantami to
    // dřív dávalo na zeď dvojníky.
    for (const s of vsechny) expect(s.texty.length).toBeGreaterThanOrEqual(4);
  });

  it("v jednom bloku nejsou dvě stejné věty", () => {
    for (const s of vsechny) expect(new Set(s.texty).size).toBe(s.texty.length);
  });

  it("žádná dlouhá pomlčka, je z ní poznat stroj", () => {
    for (const s of vsechny) for (const t of s.texty) expect(t).not.toContain("—");
  });
});

describe("čeština v šablonách", () => {
  // Události, kde {co} je jméno hráče, a oblíbenci, kde je jméno v {kdo}.
  // Skloňovat neumíme, takže jméno smí stát jen v prvním pádě.
  const jmenne = [
    ...(PRISPEVKY_K_UDALOSTEM.prodej_opory ?? []),
    ...(PRISPEVKY_K_UDALOSTEM.odchod_legendy ?? []),
    ...(PRISPEVKY_K_UDALOSTEM.posila ?? []),
    ...(PRISPEVKY_K_UDALOSTEM.propusteni ?? []),
    ...Object.values(PRISPEVKY_K_OBLIBENCUM).flat(),
  ];
  const PREDLOZKA = /(?:^|\s)(s|se|od|k|ke|pro|proti|u|bez|vedle|kolem|naproti|do|za|na|o|po|před)\s+\{(co|kdo)\}/;

  it("jméno hráče nestojí za předložkou", () => {
    const spatne = jmenne.flatMap((s) => s.texty.filter((t) => PREDLOZKA.test(t)));
    expect(spatne).toEqual([]);
  });

  it("počet gólů dostane správný tvar", () => {
    expect(goluTvar(1)).toBe("1 gól");
    expect(goluTvar(3)).toBe("3 góly");
    expect(goluTvar(5)).toBe("5 gólů");
    expect(goluTvar(34)).toBe("34 gólů");
  });

  it("šablony o střelbě si slovo góly nelepí samy", () => {
    for (const s of Object.values(PRISPEVKY_KE_STRELBE).flat()) {
      for (const t of s.texty) expect(t).not.toMatch(/\{co\} gól/);
    }
  });
});

describe("lajky", () => {
  it("naštvaná parta lajkuje naštvané příspěvky víc", () => {
    const zloba = lajky({ size: 200, tone: "negativni", mood: 10, roll: 0.5 });
    const klid = lajky({ size: 200, tone: "negativni", mood: 90, roll: 0.5 });
    expect(zloba).toBeGreaterThan(klid);
  });

  it("chybějící klíč po sobě nenechá slovo undefined", () => {
    expect(doplnText("Tak {co} jde.", {})).toBe("Tak jde.");
  });
});
