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

  it("z víceřádkové odpovědi se bere první řádek", () => {
    const v = zkontrolujChoral("\n\nHej, hej, jedem!\nDalší nápad: něco jiného");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.text).toBe("Hej, hej, jedem!");
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

  it("víc než dvě věty se nedají skandovat", () => {
    expect(zkontrolujChoral("Jedem. Jedem. Jedem. A ještě jednou!").ok).toBe(false);
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
    expect(zkontrolujChoral("Kde jsou záchodů? Kde?", { musiObsahovat: "záchody" }).ok).toBe(true);
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
