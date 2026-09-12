/**
 * Kontrola chorálu od modelu.
 *
 * Tohle je jediná pojistka mezi modelem a stadionem. Chorál, který projde,
 * visí u klubu měsíce a hráč ho vidí pokaždé, takže se radši zahodí i něco
 * použitelného, než by prošel patvar.
 */
import { describe, it, expect } from "vitest";
import {
  zkontrolujChoral, promptChoralu, vzorecPro, MAX_DELKA_CHORALU, ZADANI_TEMATU,
  STAVBA_CHORALU, VZORCE_KOTLU,
} from "./fan-chant-inspirace";

describe("co projde", () => {
  it("obyčejný chorál projde", () => {
    const v = zkontrolujChoral("KOLMAN, KOLMAN, ty jsi náš!");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.text).toBe("KOLMAN, KOLMAN, ty jsi náš!");
  });

  it("obalení uvozovkami a odrážkou se sloupne", () => {
    for (const raw of ['"Jedeme dál, jedeme dál!"', "- Jedeme dál, jedeme dál!", "„Jedeme dál, jedeme dál!“", "1. Jedeme dál, jedeme dál!"]) {
      const v = zkontrolujChoral(raw);
      expect(v.ok, raw).toBe(true);
      if (v.ok) expect(v.text).toBe("Jedeme dál, jedeme dál!");
    }
  });

  it("dvouřádkový chorál se spojí, komentář za ním se zahodí", () => {
    // Model chorály běžně píše na dva řádky a první pak končí čárkou. Brát
    // jen první řádek zahazovalo 39 z 50 hotových odpovědí jako „useknuté".
    const v = zkontrolujChoral("Kdo neskáče, není náš,\nhej hej!");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.text).toBe("Kdo neskáče, není náš, hej hej!");

    const s = zkontrolujChoral("\n\nHej, hej, jedem!\nDalší nápad: něco jiného");
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.text).toBe("Hej, hej, jedem!");
  });

  it("chybějící mezera za čárkou se doplní", () => {
    const v = zkontrolujChoral("Hej,hej,Buk!");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.text).toBe("Hej, hej, Buk!");
  });

  it("příjmení na Č, Š nebo Ž se kontroluje taky", () => {
    // `\\b` v JS je jen ASCII, takže před „Š" žádnou hranici nenajde a tahle
    // příjmení dřív kontrolou propadla bez povšimnutí.
    expect(zkontrolujChoral("Kdo nemá rád Šopeka, ať jde domů!", { jmena: ["Petr Šopek"] }).ok).toBe(false);
    expect(zkontrolujChoral("Dík Černému za ten gól!", { jmena: ["Filip Černý"] }).ok).toBe(false);
    expect(zkontrolujChoral("ŠOPEK, ty jsi náš!", { jmena: ["Petr Šopek"] }).ok).toBe(true);
  });
});

describe("co se zahodí", () => {
  it("prázdná odpověď", () => {
    expect(zkontrolujChoral(null).ok).toBe(false);
    expect(zkontrolujChoral("").ok).toBe(false);
    expect(zkontrolujChoral("   ").ok).toBe(false);
  });

  it("moc krátké a moc dlouhé", () => {
    expect(zkontrolujChoral("Hej").ok).toBe(false);
    expect(zkontrolujChoral("A".repeat(MAX_DELKA_CHORALU + 1)).ok).toBe(false);
  });

  it("model místo chorálu komentuje", () => {
    for (const raw of ["Chorál by mohl znít takto: hej hej", "Návrh: Jedeme dál", "Zde je chorál pro váš klub"]) {
      expect(zkontrolujChoral(raw).ok, raw).toBe(false);
    }
  });

  it("kotel nezpívá tabulku", () => {
    expect(zkontrolujChoral("Máme 42 bodů a jedeme dál!").ok).toBe(false);
  });

  it("opakování projde, litanie ne", () => {
    // Skandované opakování je jádro žánru, čtyři věty jsou v pořádku.
    expect(zkontrolujChoral("Kdo je náš? Dvory! Kdo je náš? Dvory!").ok).toBe(true);
    expect(zkontrolujChoral("Jedem. Jedem. Jedem. A zas. A ještě!").ok).toBe(false);
  });

  it("OHNUTÉ PŘÍJMENÍ neprojde, to je ta nejviditelnější chyba", () => {
    const jmena = ["Jan Kolman"];
    for (const spatne of [
      "Kdo nemá rád Kolmana, ať jde domů!",
      "Dík Kolmanovi za ten gól!",
      "S Kolmanem to zvládneme!",
    ]) {
      expect(zkontrolujChoral(spatne, { jmena }).ok, spatne).toBe(false);
    }
    // První pád projde.
    expect(zkontrolujChoral("KOLMAN, ty jsi náš!", { jmena }).ok).toBe(true);
  });

  it("krátká příjmení kontrolu nerozhodí", () => {
    // „Rod“ + „a“ by chytlo i neškodná slova, proto se pod tři znaky nekontroluje.
    expect(zkontrolujChoral("ROD, ROD, hej hej!", { jmena: ["Petr Rod"] }).ok).toBe(true);
  });
});

describe("zadání pro model", () => {
  it("nese fakta, zadání tématu i pravidla stavby", () => {
    const p = promptChoralu({
      tema: "oblibenec",
      fakta: ["Miláček kotle se jmenuje Jan Kolman."],
      klub: "FK Duplex Břevnov",
      okres: "Praha",
    });
    expect(p).toContain("Jan Kolman");
    expect(p).toContain("FK Duplex Břevnov");
    expect(p).toContain(ZADANI_TEMATU.oblibenec.slice(0, 30));
    expect(p).toContain(STAVBA_CHORALU[0]);
    expect(p).toContain("PRVNÍM PÁDĚ");
  });

  it("bez okresu se nic nerozbije", () => {
    const p = promptChoralu({ tema: "vzdor", fakta: ["Nálada je na dně."], klub: "Sokol" });
    expect(p).toContain("Sokol");
    expect(p).not.toContain("undefined");
  });

  it("každé téma má své zadání", () => {
    for (const t of Object.keys(ZADANI_TEMATU) as Array<keyof typeof ZADANI_TEMATU>) {
      expect(ZADANI_TEMATU[t].length).toBeGreaterThan(20);
    }
  });
});

describe("nedopsaný text", () => {
  it("chorál končící čárkou se zahodí", () => {
    // Přesně tohle model vrátil při stropu 80 tokenů.
    expect(zkontrolujChoral("Hej, hej, Břevnove, my tu budem,").ok).toBe(false);
    expect(zkontrolujChoral("Braníku, my tu budem -").ok).toBe(false);
  });

  it("chorál končící spojkou se zahodí", () => {
    expect(zkontrolujChoral("My tu budem a").ok).toBe(false);
    expect(zkontrolujChoral("My tu budem, ale!").ok).toBe(false);
  });

  it("normální interpunkce projde", () => {
    expect(zkontrolujChoral("My tu budem, hej hej!").ok).toBe(true);
  });
});

describe("model nesmí uhnout od tématu", () => {
  it("stížnost bez té věci se zahodí", () => {
    // Skutečný výstup modelu na zadání „chybí záchody".
    const v = zkontrolujChoral("Hej, Hot Peppers, do toho!", { musiObsahovat: "záchody" });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.duvod).toContain("záchody");
  });

  it("ohnuté povinné slovo projde, kmen stačí", () => {
    expect(zkontrolujChoral("Chceme víc záchodů, hej hej!", { musiObsahovat: "záchody" }).ok).toBe(true);
    expect(zkontrolujChoral("Hej, Braníku, hej!", { musiObsahovat: "SK Braník" }).ok).toBe(true);
  });

  it("diakritika není podmínka shody", () => {
    expect(zkontrolujChoral("Hej, ZACHODY, hej!", { musiObsahovat: "záchody" }).ok).toBe(true);
  });

  it("víceslovné zadání se hlídá nejdelším slovem", () => {
    expect(zkontrolujChoral("Chceme střechu nad hlavu!", { musiObsahovat: "střechu nad hlavou" }).ok).toBe(true);
    expect(zkontrolujChoral("Hej hej, do toho!", { musiObsahovat: "střechu nad hlavou" }).ok).toBe(false);
  });
});

describe("vzorec", () => {
  it("stejný seed dá stejný vzorec", () => {
    expect(vzorecPro(7)).toBe(vzorecPro(7));
    expect(VZORCE_KOTLU).toContain(vzorecPro(7));
  });

  it("projde všechny vzorce a zvládne i záporný seed", () => {
    const videno = new Set(Array.from({ length: 60 }, (_, i) => vzorecPro(i)));
    expect(videno.size).toBe(VZORCE_KOTLU.length);
    expect(VZORCE_KOTLU).toContain(vzorecPro(-13));
  });

  it("s vzorcem se do promptu nesype celý seznam", () => {
    const p = promptChoralu({
      tema: "vzdor", fakta: ["Nálada je na dně."], klub: "Sokol", vzorec: VZORCE_KOTLU[2],
    });
    expect(p).toContain(VZORCE_KOTLU[2]);
    expect(p).not.toContain(VZORCE_KOTLU[0]);
  });

  it("povinné slovo se do promptu dostane", () => {
    const p = promptChoralu({
      tema: "vybaveni", fakta: ["Chybí záchody."], klub: "Sokol", povinneSlovo: "záchody",
    });
    expect(p).toContain("MUSÍ zaznít: záchody");
  });
});

describe("chorál proti soupeři mu nesmí fandit", () => {
  it("povzbuzení směrem k soupeři se zahodí", () => {
    // Skutečný výstup modelu na zadání „proti SK Braník".
    expect(zkontrolujChoral("Hej, SK Braník, do toho!", { tema: "rival" }).ok).toBe(false);
    expect(zkontrolujChoral("SK Braník, jedem!", { tema: "rival" }).ok).toBe(false);
  });

  it("posměch projde", () => {
    expect(zkontrolujChoral("Sbalte si to, Braník, a mažte!", { tema: "rival" }).ok).toBe(true);
  });

  it("u ostatních témat je povzbuzení v pořádku", () => {
    expect(zkontrolujChoral("NOVÁK, do toho!", { tema: "oblibenec" }).ok).toBe(true);
    expect(zkontrolujChoral("Hej, hej, jedem!", { tema: "vyhra" }).ok).toBe(true);
  });
});

describe("nezodpovězená otázka", () => {
  it("chorál končící otazníkem se zahodí", () => {
    // Skutečné výstupy modelu na téma „domov".
    expect(zkontrolujChoral("Spůle, Spůle, kde my jsme?").ok).toBe(false);
    expect(zkontrolujChoral("Tvrzice, kde jsme doma?").ok).toBe(false);
  });

  it("otázka s odpovědí projde", () => {
    expect(zkontrolujChoral("Kdo je náš? Kratušín!").ok).toBe(true);
    expect(zkontrolujChoral("Prachatice? Tady jsme doma: Buk!").ok).toBe(true);
  });
});

describe("názvy obcí jen v prvním pádě", () => {
  it("ohnutá obec se zahodí i když je česky správně", () => {
    // „z Dvorů" je spisovné, ale u méně běžných jmen si model patvar vymyslí
    // a ověřit to nejde, takže se drží první pád jako u šablon.
    const v = zkontrolujChoral("Kdo není z Dvorů, ten s námi není!", { nazvyVPrvnimPade: ["Dvory"] });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.duvod).toContain("Dvory");
  });

  it("první pád projde", () => {
    expect(zkontrolujChoral("Dvory, Dvory, jedno srdce!", { nazvyVPrvnimPade: ["Dvory"] }).ok).toBe(true);
    expect(zkontrolujChoral("Ó ó ó, Lipovice, ó ó ó!", { nazvyVPrvnimPade: ["Lipovice"] }).ok).toBe(true);
  });

  it("diakritika a velikost písmen nevadí", () => {
    expect(zkontrolujChoral("KRATUŠÍN, do toho!", { nazvyVPrvnimPade: ["Kratušín"] }).ok).toBe(true);
  });

  it("dvouznakový název se nekontroluje, chytal by půlku slovníku", () => {
    expect(zkontrolujChoral("Aš, Aš, jedno srdce!", { nazvyVPrvnimPade: ["Aš"] }).ok).toBe(true);
  });

  it("nesouvisející slovo se stejným začátkem neprojde jako shoda", () => {
    // „Buku" je ohnuté, musí spadnout.
    expect(zkontrolujChoral("Hej, Buku, hej!", { nazvyVPrvnimPade: ["Buk"] }).ok).toBe(false);
    expect(zkontrolujChoral("Hej, Buk, hej!", { nazvyVPrvnimPade: ["Buk"] }).ok).toBe(true);
  });
});
