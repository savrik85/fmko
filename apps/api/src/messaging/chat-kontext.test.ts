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

describe("čas je vždycky pražský", () => {
  // Worker běží v UTC, hráč žije v Praze. V zimě je rozdíl hodina, v létě dvě,
  // a kdyby se to počítalo ze serverového času, hráč by v létě chodil spát
  // o hodinu dřív.
  it("zimní čas: 22:00 v Praze je 21:00 UTC", () => {
    expect(kontextCasu(new Date("2027-01-05T21:00:00Z"), "denni").hodina).toBe(22);
  });

  it("letní čas: 22:00 v Praze je 20:00 UTC", () => {
    expect(kontextCasu(new Date("2026-09-19T20:00:00Z"), "denni").hodina).toBe(22);
  });

  it("v létě i v zimě jde ve 22:00 spát stejně", () => {
    expect(kontextCasu(new Date("2027-01-05T21:00:00Z"), "denni").situace).toBe("spi");
    expect(kontextCasu(new Date("2026-09-19T20:00:00Z"), "denni").situace).toBe("spi");
  });

  it("den v týdnu sedí i přes půlnoc UTC", () => {
    // 2026-09-19 je sobota; ve 23:30 UTC je v Praze už neděle 1:30.
    expect(kontextCasu(new Date("2026-09-19T23:30:00Z"), "denni").den).toBe("neděle");
  });
});

describe("kdo si dává", () => {
  /** Notorik, kterého najdeš večer u piva. */
  const PIJAK = 90;
  const ABSTINENT = 20;

  it("kdo nepije, ten v deset večer spí", () => {
    const k = kontextCasu(kdy(2, 22), "denni", 1, ABSTINENT);
    expect(k.situace).toBe("spi");
    expect(k.podnapilost).toBe(0);
  });

  it("piják v deset večer nespí, ale pije", () => {
    // Přes seedy: aspoň někdo z nich musí být u piva, jinak by mechanika
    // nikdy nenaskočila a hráči by dál psali, že spí.
    const pijici = [...Array(12).keys()].filter(
      (seed) => kontextCasu(kdy(2, 22), "denni", seed, PIJAK).situace === "pije",
    );
    expect(pijici.length).toBeGreaterThan(5);
  });

  it("večer se to stupňuje", () => {
    const seed = [...Array(20).keys()].find(
      (x) => kontextCasu(kdy(5, 18), "denni", x, PIJAK).situace === "pije",
    )!;
    const v18 = kontextCasu(kdy(5, 18), "denni", seed, PIJAK);
    const v21 = kontextCasu(kdy(5, 21), "denni", seed, PIJAK);
    const v23 = kontextCasu(kdy(5, 23), "denni", seed, PIJAK);
    expect(v18.podnapilost).toBeLessThan(v21.podnapilost);
    expect(v21.podnapilost).toBeLessThanOrEqual(v23.podnapilost);
    expect(v23.podnapilost).toBe(3);
  });

  it("kdo pije opravdu hodně, rozjede se dřív", () => {
    const seed = [...Array(20).keys()].find(
      (x) => kontextCasu(kdy(5, 19), "denni", x, 100).situace === "pije"
        && kontextCasu(kdy(5, 19), "denni", x, 65).situace === "pije",
    );
    if (seed === undefined) return;
    expect(kontextCasu(kdy(5, 19), "denni", seed, 100).podnapilost)
      .toBeGreaterThan(kontextCasu(kdy(5, 19), "denni", seed, 65).podnapilost);
  });

  it("během jednoho večera neskáče mezi pivem a postelí", () => {
    for (let seed = 0; seed < 8; seed++) {
      const v20 = kontextCasu(kdy(3, 20), "denni", seed, PIJAK);
      const v23 = kontextCasu(kdy(3, 23), "denni", seed, PIJAK);
      expect(v20.situace).toBe(v23.situace);
      if (v20.situace === "pije") expect(v20.kdePije).toBe(v23.kdePije);
    }
  });

  it("ze šichty se na pivo neodchází", () => {
    // Barman v deset večer stojí za pípou, i když sám pije rád.
    for (let seed = 0; seed < 8; seed++) {
      expect(kontextCasu(kdy(2, 22), "vecerni", seed, PIJAK).situace).toBe("prace");
    }
  });

  it("v poledne se nepije, ani notorik", () => {
    for (let seed = 0; seed < 8; seed++) {
      expect(kontextCasu(kdy(2, 12), "denni", seed, PIJAK).situace).not.toBe("pije");
    }
  });

  it("pije se v hospodě i doma", () => {
    const mista = new Set<string | null>();
    for (let seed = 0; seed < 40; seed++) {
      for (const den of [2, 5, 6]) {
        const k = kontextCasu(kdy(den, 21), "denni", seed, PIJAK);
        if (k.situace === "pije") mista.add(k.kdePije);
      }
    }
    expect(mista).toContain("hospoda");
    expect(mista).toContain("doma");
  });
});

describe("jak opilost zní", () => {
  const PIJAK = 90;
  const vecer = (hodina: number, seed: number) => kontextCasu(kdy(5, hodina), "denni", seed, PIJAK);
  const seedUPiva = [...Array(20).keys()].find((x) => vecer(18, x).situace === "pije")!;

  it("z kraje večera má čistou hlavu", () => {
    const t = popisSituace(vecer(18, seedUPiva), "Zedník", []);
    expect(t).toContain("druhého piva");
    expect(t).not.toContain("opilý");
  });

  it("pozdě večer dostane příkaz psát opile", () => {
    const t = popisSituace(vecer(23, seedUPiva), "Zedník", []);
    expect(t).toContain("opilý");
    expect(t).toMatch(/překlepy/);
    expect(t).toContain("malá písmena");
  });

  it("opilému se uvolní i emoji", () => {
    expect(pravidloEmoji(44, 30, 3)).toContain("bez míry");
    expect(pravidloEmoji(44, 30, 0)).toContain("skoro nepoužívej");
  });

  it("opilý píše déle než střízlivý", () => {
    const zaklad = { znaku: 90, situace: "pije" as const, discipline: 50, temper: 50 };
    expect(zpozdeniOdpovedi({ ...zaklad, podnapilost: 3 }))
      .toBeGreaterThan(zpozdeniOdpovedi({ ...zaklad, podnapilost: 0 }));
  });

  it("ani opilý nepřeteče limit běhu na pozadí", () => {
    for (const znaku of [0, 200, 5000]) {
      expect(zpozdeniOdpovedi({ znaku, situace: "pije", discipline: 0, temper: 0, podnapilost: 3 }))
        .toBeLessThanOrEqual(MAX_ZPOZDENI_MS);
    }
  });
});
