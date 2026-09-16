/**
 * Kdy a za jakých okolností hráč odepisuje.
 *
 * Hlídá to, co jde v generovaném textu snadno přehlédnout: že hráč na noční
 * nespí v noci, že se zemědělec v neděli stejně vyhrabe ke kravám a že
 * zpoždění odpovědi nepřeroste přes limit běhu na pozadí.
 */
import { describe, it, expect } from "vitest";
import {
  kontextCasu, domacnost, pravidloEmoji, popisSituace,
  zpozdeniOdpovedi, MAX_ZPOZDENI_MS,
} from "./chat-kontext";

/** Pražský čas v daném dni. Leden kvůli zimnímu času (UTC+1). */
const kdy = (den: number, hodina: number) =>
  new Date(Date.UTC(2027, 0, 3 + den, hodina - 1, 0, 0));

describe("co hráč zrovna dělá", () => {
  it("dělník v úterý v deset ráno stojí v práci, v noci spí", () => {
    expect(kontextCasu(kdy(2, 10), "denni").situace).toBe("prace");
    expect(kontextCasu(kdy(2, 2), "denni").situace).toBe("spi");
    expect(kontextCasu(kdy(2, 18), "denni").situace).toBe("po_praci");
  });

  it("v sobotu dělník do práce nejde", () => {
    const s = kontextCasu(kdy(6, 10), "denni");
    expect(s.jeVikend).toBe(true);
    expect(s.situace).toBe("volno");
  });

  it("zemědělec jde ke kravám i v neděli v šest", () => {
    expect(kontextCasu(kdy(0, 6), "rano").situace).toBe("prace");
    expect(kontextCasu(kdy(0, 22), "rano").situace).toBe("spi");
  });

  it("hospodský v deset večer nalévá a dopoledne spí", () => {
    expect(kontextCasu(kdy(5, 22), "vecerni").situace).toBe("prace");
    expect(kontextCasu(kdy(5, 7), "vecerni").situace).toBe("spi");
  });

  it("kdo má noční, spí přes den", () => {
    // Seed a den se volí tak, aby dnešní směna byla noční.
    let nocni = null;
    for (let seed = 0; seed < 10; seed++) {
      const k = kontextCasu(kdy(2, 10), "smenny", seed);
      if (k.smenaDnes === "noční") { nocni = k; break; }
    }
    expect(nocni).not.toBeNull();
    expect(nocni!.situace).toBe("spi");
  });

  it("směna se mezi načteními nemění", () => {
    const a = kontextCasu(kdy(3, 9), "smenny", 42);
    const b = kontextCasu(kdy(3, 9), "smenny", 42);
    expect(a.smenaDnes).toBe(b.smenaDnes);
  });

  it("student ve tři odpoledne má volno, ve tři ráno spí", () => {
    expect(kontextCasu(kdy(2, 15), "volny").situace).toBe("volno");
    expect(kontextCasu(kdy(2, 3), "volny").situace).toBe("spi");
  });

  it("den v týdnu sedí", () => {
    expect(kontextCasu(kdy(0, 12), "volny").den).toBe("neděle");
    expect(kontextCasu(kdy(1, 12), "volny").den).toBe("pondělí");
  });
});

describe("co se dostane do promptu", () => {
  it("v noci dostane hráč povolení ohnat se, koho vzbudil", () => {
    const t = popisSituace(kontextCasu(kdy(2, 2), "denni"), "Zedník", []);
    expect(t).toContain("SPAL JSI");
    expect(t).toMatch(/psa|kočku/);
    expect(t).toContain("Jména si nevymýšlej");
  });

  it("v práci dostane svou profesní výmluvu", () => {
    const t = popisSituace(kontextCasu(kdy(2, 10), "denni"), "Zedník", ["Míchačka je v půlce"]);
    expect(t).toContain("V PRÁCI");
    expect(t).toContain("Míchačka je v půlce");
  });

  it("směnař se dozví, jakou má dnes směnu", () => {
    const k = kontextCasu(kdy(2, 10), "smenny", 1);
    expect(popisSituace(k, "Hasič", [])).toContain(k.smenaDnes!);
  });

  it("mladí smějí emoji, staří skoro ne", () => {
    expect(pravidloEmoji(19, 40)).toContain("běžně");
    expect(pravidloEmoji(44, 40)).toContain("skoro nepoužívej");
  });

  it("domácnost odpovídá věku", () => {
    expect(domacnost(18)).toContain("rodičů");
    expect(domacnost(31)).toContain("dítě");
    expect(domacnost(50)).toContain("odrostlé");
  });
});

describe("jak dlouho to trvá", () => {
  const zaklad = { znaku: 100, situace: "volno" as const, discipline: 50, temper: 50 };

  it("delší zpráva se píše déle", () => {
    const kratka = zpozdeniOdpovedi({ ...zaklad, znaku: 20 });
    const dlouha = zpozdeniOdpovedi({ ...zaklad, znaku: 180 });
    expect(dlouha).toBeGreaterThan(kratka);
  });

  it("z postele a ze šichty to trvá dýl", () => {
    expect(zpozdeniOdpovedi({ ...zaklad, situace: "spi" }))
      .toBeGreaterThan(zpozdeniOdpovedi(zaklad));
    expect(zpozdeniOdpovedi({ ...zaklad, situace: "prace" }))
      .toBeGreaterThan(zpozdeniOdpovedi(zaklad));
  });

  it("vznětlivý vybuchne dřív než rozvážný", () => {
    expect(zpozdeniOdpovedi({ ...zaklad, temper: 85 }))
      .toBeLessThan(zpozdeniOdpovedi({ ...zaklad, temper: 20 }));
  });

  it("nikdy nepřeroste limit běhu na pozadí ani neodpoví okamžitě", () => {
    for (const znaku of [0, 50, 200, 5000]) {
      for (const situace of ["spi", "prace", "po_praci", "volno"] as const) {
        for (const discipline of [0, 50, 100]) {
          const ms = zpozdeniOdpovedi({ znaku, situace, discipline, temper: 50 });
          expect(ms).toBeLessThanOrEqual(MAX_ZPOZDENI_MS);
          expect(ms).toBeGreaterThanOrEqual(2_000);
        }
      }
    }
  });
});
