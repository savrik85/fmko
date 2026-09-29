/**
 * Transparent v kotli.
 *
 * Nejdůležitější vlastnost: NIKDY se neořezává. Useknuté heslo je horší než
 * žádné, takže každá větev musí mít variantu, která se do limitu vejde,
 * i kdyby měl trenér nejdelší příjmení v okrese.
 */
import { describe, it, expect } from "vitest";
import {
  vyberTransparent, mozneTransparenty, prvniCoSeVejde, prijmeni, pouzitelneJmeno, MAX_DELKA_TRANSPARENTU,
  type StavProTransparent,
} from "./fan-banner";

const DLOUHE_JMENO = "Bartoloměj Nejdelšípříjmeníveokrese";

const stav = (o: Partial<StavProTransparent> = {}): StavProTransparent => ({
  naladaKotle: 55,
  heatKotle: 10,
  kampanProtiTreneru: false,
  kampanProtiHraci: null,
  oblibenec: null,
  trener: "Karel Klement",
  rival: null,
  serie: 0,
  golyPoslednich5: 6,
  taktika: null,
  kind: "kotel",
  ...o,
});

/** Všechny stavy, které umí vybrat jinou větev. */
const VETVE: Array<[string, Partial<StavProTransparent>]> = [
  ["kampaň proti trenérovi", { kampanProtiTreneru: true }],
  ["kampaň proti hráči", { kampanProtiHraci: "Josef Vlček" }],
  ["vyhrocená rivalita", { rival: { nazev: "Sokol Zálezly", heat: 80 } }],
  ["naštvaný kotel bez gólů", { heatKotle: 70, golyPoslednich5: 1 }],
  ["naštvaný kotel s góly", { heatKotle: 70, golyPoslednich5: 9 }],
  ["nálada na dně", { naladaKotle: 10 }],
  ["série proher", { serie: -4 }],
  ["série výher", { serie: 4 }],
  ["miláček kotle", { oblibenec: "Adam Kolář", naladaKotle: 70 }],
  ["taktika nakopávaná", { taktika: "long_ball", golyPoslednich5: 2 }],
  ["taktika presink", { taktika: "pressing", naladaKotle: 60 }],
  ["klid", {}],
];

describe("transparent se vždycky vejde", () => {
  it("žádná větev nevrátí prázdno ani přetečení, ani s nejdelším jménem", () => {
    for (const [nazev, over] of VETVE) {
      for (const roll of [0, 0.17, 0.33, 0.5, 0.66, 0.83, 0.99]) {
        for (const dlouha of [false, true]) {
          const s = stav({
            ...over,
            ...(dlouha
              ? {
                trener: DLOUHE_JMENO,
                oblibenec: over.oblibenec ? DLOUHE_JMENO : null,
                kampanProtiHraci: over.kampanProtiHraci ? DLOUHE_JMENO : null,
                rival: over.rival ? { nazev: "Tělovýchovná jednota Nejdelšínázev", heat: 80 } : null,
              }
              : {}),
          });
          const t = vyberTransparent(s, roll);
          expect(t.text.length, `${nazev} (roll ${roll}, dlouhé jméno ${dlouha}): „${t.text}"`)
            .toBeGreaterThan(0);
          expect(t.text.length, `${nazev} (roll ${roll}, dlouhé jméno ${dlouha}): „${t.text}"`)
            .toBeLessThanOrEqual(MAX_DELKA_TRANSPARENTU);
        }
      }
    }
  });

  it("nikdy nekončí useknutým slovem", () => {
    for (const [, over] of VETVE) {
      const t = vyberTransparent(stav({ ...over, trener: DLOUHE_JMENO }), 0.4);
      expect(t.text).not.toMatch(/…$/);
      expect(t.text.trim()).toBe(t.text);
    }
  });

  // Délka se odvozuje z konstanty, ne z napsaného řetězce. Když se limit
  // pohnul z 22 na 40, tyhle testy spadly na tom, že „moc dlouhý" text se
  // najednou vešel, i když na chování funkce se nic nezměnilo.
  const PRESAHUJE = "A".repeat(MAX_DELKA_TRANSPARENTU + 1);
  const AKORAT = "B".repeat(MAX_DELKA_TRANSPARENTU);

  it("prvniCoSeVejde bere první vyhovující, ne první v pořadí", () => {
    expect(prvniCoSeVejde([PRESAHUJE, "KRÁTKÝ"])).toBe("KRÁTKÝ");
    expect(prvniCoSeVejde(["PRVNÍ", "DRUHÝ"])).toBe("PRVNÍ");
    // Přesně na hranici se ještě vejde.
    expect(prvniCoSeVejde([AKORAT, "KRÁTKÝ"])).toBe(AKORAT);
  });

  it("prázdný seznam je chyba katalogu, ne patvar na plachtě", () => {
    expect(prvniCoSeVejde([])).toBe("");
    expect(prvniCoSeVejde([PRESAHUJE])).toBe("");
  });
});

describe("co na plachtě visí", () => {
  it("kampaň za odvolání přebije všechno ostatní", () => {
    const t = vyberTransparent(stav({
      kampanProtiTreneru: true, serie: 5, oblibenec: "Adam Kolář",
      rival: { nazev: "Sokol", heat: 90 },
    }), 0.3);
    expect(t.tone).toBe("proti_treneru");
    expect(t.text).toContain("KLEMENT");
  });

  it("kampaň proti hráči nese jeho příjmení, ne křestní", () => {
    const t = vyberTransparent(stav({ kampanProtiHraci: "Josef Vlček" }), 0.2);
    expect(t.text).toContain("VLČEK");
    expect(t.text).not.toContain("JOSEF");
  });

  it("při sérii výher kotel trenéra velebí", () => {
    const t = vyberTransparent(stav({ serie: 4 }), 0.2);
    expect(t.tone).toBe("pro_trenera");
  });

  it("nakopávaná se kotli nelíbí, presink ano", () => {
    expect(vyberTransparent(stav({ taktika: "long_ball", golyPoslednich5: 2 }), 0.2).tone).toBe("vytka");
    expect(vyberTransparent(stav({ taktika: "pressing", naladaKotle: 60 }), 0.2).tone).toBe("podpora");
  });

  it("bez gólů se kotel ozve na střelbu, ne na náladu", () => {
    // Nezkouší se konkrétní slovo, ale že se sáhne do jiné zásoby než
    // u týmu, který góly dává. Heslo samo se smí přepsat.
    const bezGolu = vyberTransparent(stav({ heatKotle: 70, golyPoslednich5: 0 }), 0);
    const sGoly = vyberTransparent(stav({ heatKotle: 70, golyPoslednich5: 9 }), 0);
    expect(bezGolu.text).not.toBe(sGoly.text);
    expect(bezGolu.tone).toBe("vytka");
  });

  it("každé heslo nese důvod, aby bylo poznat, že to není náhoda", () => {
    for (const [, over] of VETVE) {
      expect(vyberTransparent(stav(over), 0.5).duvod.length).toBeGreaterThan(5);
    }
  });

  it("stejný stav dá stejné heslo, jiný roll smí jiné", () => {
    const s = stav({ heatKotle: 70 });
    expect(vyberTransparent(s, 0.1).text).toBe(vyberTransparent(s, 0.1).text);
  });
});

describe("příjmení", () => {
  it("bere poslední slovo", () => {
    expect(prijmeni("Karel Klement")).toBe("Klement");
    expect(prijmeni("Jan van der Meer")).toBe("Meer");
    expect(prijmeni("Klement")).toBe("Klement");
  });
});

describe("jméno, které se nedá vyvěsit", () => {
  it("příjmení kratší než tři znaky se na plachtu nedostane", () => {
    expect(pouzitelneJmeno("A A")).toBe(false);
    expect(pouzitelneJmeno(null)).toBe(false);
    expect(pouzitelneJmeno("Klement Testovič")).toBe(true);
  });

  it("místo patvaru se vyvěsí bezejmenná varianta", () => {
    // Testovací účty mívají trenéra „A A" a „DÍKY, A" vypadá jako rozbitý text.
    const kampan = vyberTransparent(stav({ kampanProtiTreneru: true, trener: "A A" }), 0.1);
    expect(kampan.text).not.toContain(" A");
    expect(kampan.tone).toBe("proti_treneru");

    const diky = vyberTransparent(stav({ serie: 5, trener: "A A", naladaKotle: 80 }), 0.1);
    expect(diky.text).not.toBe("DÍKY, A");

    const hrac = vyberTransparent(stav({ kampanProtiHraci: "B B" }), 0.1);
    expect(hrac.text).toBe("DOST BYLO");
  });

  it("se skutečným jménem se jméno vyvěsí dál", () => {
    const t = vyberTransparent(stav({ kampanProtiTreneru: true, trener: "Klement Testovič" }), 0.1);
    expect(t.text).toContain("TESTOVIČ");
  });
});

describe("katalog s obcí", () => {
  const klid: StavProTransparent = {
    naladaKotle: 60, heatKotle: 10, kampanProtiTreneru: false, kampanProtiHraci: null,
    oblibenec: null, trener: null, rival: null, serie: 0, golyPoslednich5: 6, taktika: null,
    kind: "kotel", obec: "Čkyně",
  };

  it("nabídne heslo s obcí v prvním pádě", () => {
    const vse = mozneTransparenty(klid);
    expect(vse).toContain("ČKYNĚ, TO JSME MY");
    expect(vse).toContain("ČKYNĚ = DOMOV");
  });

  it("bez obce zůstanou obecná hesla", () => {
    const vse = mozneTransparenty({ ...klid, obec: null });
    expect(vse.some((t) => t.includes("ČKYNĚ"))).toBe(false);
    expect(vse).toContain("TADY JSME DOMA");
  });

  it("v žádné situaci heslo nepřeteče, není prázdné a nemá dlouhou pomlčku", () => {
    const dlouha = "Vlachovo Březí nad Blanicí";
    const situace: Array<Partial<StavProTransparent>> = [
      {}, { obec: dlouha }, { kampanProtiTreneru: true, trener: "Karel Klement" },
      { kampanProtiTreneru: true, trener: "A A" }, { kampanProtiHraci: "Josef Vlček" },
      { rival: { nazev: dlouha, heat: 90 } }, { heatKotle: 70, golyPoslednich5: 0 },
      { heatKotle: 70, golyPoslednich5: 9 }, { serie: -4 }, { serie: 5, trener: "Karel Klement" },
      { oblibenec: "Adam Kolář", naladaKotle: 80 },
      ...["long_ball", "defensive", "possession", "pressing", "offensive"].map((taktika) => ({ taktika, naladaKotle: 60, golyPoslednich5: 3 })),
    ];
    for (const over of situace) {
      for (const t of mozneTransparenty({ ...klid, ...over })) {
        expect(t.length).toBeGreaterThan(0);
        expect(t.length).toBeLessThanOrEqual(MAX_DELKA_TRANSPARENTU);
        expect(t).not.toContain("—");
      }
    }
  });
});
