/**
 * Skautův tip — koho vůbec stojí za to hlásit a jak se z čísel dělá věta.
 *
 * Měřítkem je kádr trenéra, ne absolutní rating. Průměrný hráč v téhle hře má
 * kolem třiceti, takže „rating 44" sám o sobě neříká nic.
 */
import { describe, it, expect } from "vitest";
import { textTipu, vyberTip, type TipKandidat, type LatkaPostu } from "./staff-tick";

const hrac = (o: Partial<TipKandidat> = {}): TipKandidat => ({
  id: "fa-1", first_name: "Adam", last_name: "Kolář", position: "FWD",
  age: 20, overall_rating: 40, hidden_talent: 35, ...o,
});

/** Kádr testovacího týmu z testovací DB — reálné hodnoty, ne vymyšlené. */
const KADR = new Map<string, LatkaPostu>([
  ["GK", { pocet: 5, prumer: 37, nejlepsi: 54 }],
  ["DEF", { pocet: 3, prumer: 33, nejlepsi: 42 }],
  ["MID", { pocet: 6, prumer: 49, nejlepsi: 59 }],
  ["FWD", { pocet: 4, prumer: 36, nejlepsi: 50 }],
]);

const DOBRY_SKAUT = (2 * 18 + 14) / 3; // úsudek 18, komunikace 14 → práh talentu 13
const MIZERNY_SKAUT = 5;               // → práh talentu 25

describe("koho skaut vytáhne", () => {
  it("brankáře s ratingem 10 nehlásí, i když má velký skrytý talent", () => {
    // Tenhle hráč je v testovací DB doopravdy a starý dotaz ho tipoval.
    const moravec = hrac({ first_name: "David", last_name: "Moravec", position: "GK", age: 22, overall_rating: 10, hidden_talent: 28 });
    expect(vyberTip([moravec], KADR, DOBRY_SKAUT)).toBeNull();
  });

  it("když v okrese nikdo nestojí za řeč, mlčí", () => {
    const stary = hrac({ position: "DEF", age: 37, overall_rating: 31, hidden_talent: 3 });
    expect(vyberTip([stary], KADR, DOBRY_SKAUT)).toBeNull();
  });

  it("prázdný okres nespadne", () => {
    expect(vyberTip([], KADR, DOBRY_SKAUT)).toBeNull();
  });

  it("hráč, co by byl hned nejlepší, má přednost před talentem", () => {
    const vlcek = hrac({ first_name: "Jakub", last_name: "Vlček", position: "DEF", age: 22, overall_rating: 44, hidden_talent: 17 });
    const tip = vyberTip([hrac(), vlcek], KADR, DOBRY_SKAUT);
    expect(tip?.hrac.last_name).toBe("Vlček");
    expect(tip?.duvod).toBe("nejlepsi");
  });

  it("hráč do rotace novinou není — ten by chodil každý týden", () => {
    // Brankář s ratingem 50 při kádru 5 gólmanů, nejlepší 54: nic, co by trenér
    // potřeboval slyšet. Přesně tahle kategorie zaplavovala telefon.
    const beran = hrac({ last_name: "Beran", position: "GK", age: 25, overall_rating: 50, hidden_talent: 31 });
    expect(vyberTip([beran], KADR, DOBRY_SKAUT)).toBeNull();
  });

  it("na postu, kde je trenér sám, se záloha hlásí", () => {
    const tenkyKadr = new Map(KADR);
    tenkyKadr.set("GK", { pocet: 1, prumer: 37, nejlepsi: 37 });
    const beran = hrac({ last_name: "Beran", position: "GK", age: 25, overall_rating: 34, hidden_talent: 0 });
    const tip = vyberTip([beran], tenkyKadr, DOBRY_SKAUT);
    expect(tip?.duvod).toBe("zaloha");
    expect(textTipu(tip!)).toContain("kryl záda");
  });

  it("chybějící post v kádru je nejsilnější důvod", () => {
    const bezBrankaru = new Map(KADR);
    bezBrankaru.delete("GK");
    const slabyGk = hrac({ last_name: "Moravec", position: "GK", overall_rating: 10, hidden_talent: 28 });
    const tip = vyberTip([hrac(), slabyGk], bezBrankaru, DOBRY_SKAUT);
    expect(tip?.hrac.last_name).toBe("Moravec");
    expect(tip?.duvod).toBe("chybi");
  });

  it("mizerný skaut surový talent neuvidí, dobrý ano", () => {
    // Rating pod průměrem útočníků (36), talent 20 → projde jen přes talent.
    const syrovy = hrac({ overall_rating: 30, hidden_talent: 20 });
    expect(vyberTip([syrovy], KADR, DOBRY_SKAUT)?.duvod).toBe("talent");
    expect(vyberTip([syrovy], KADR, MIZERNY_SKAUT)).toBeNull();
  });

  it("koho hlásil minule, toho podruhé nevytáhne", () => {
    const kolar = hrac();
    const vlcek = hrac({ first_name: "Jakub", last_name: "Vlček", position: "DEF", age: 22, overall_rating: 44, hidden_talent: 17 });
    expect(vyberTip([kolar, vlcek], KADR, DOBRY_SKAUT, "🔍 Jakub Vlček — 22 let")?.hrac.last_name).toBe("Kolář");
    expect(vyberTip([kolar], KADR, DOBRY_SKAUT, "🔍 Adam Kolář — 20 let")).toBeNull();
  });

  it("talent musí být mladý — třicátník s talentem není talent", () => {
    const stary = hrac({ age: 30, overall_rating: 30, hidden_talent: 35 });
    expect(vyberTip([stary], KADR, DOBRY_SKAUT)).toBeNull();
  });
});

describe("text tipu", () => {
  const tip = (o: Partial<TipKandidat> = {}, duvod: Parameters<typeof textTipu>[0]["duvod"] = "talent") =>
    textTipu({ hrac: hrac(o), duvod });

  it("vždycky nese jméno, věk, post i rating — bez čísel je tip k ničemu", () => {
    const t = tip();
    expect(t).toContain("Adam Kolář");
    expect(t).toContain("20 let");
    expect(t).toContain("útočník");
    expect(t).toContain("rating 40");
  });

  it("post se překládá do češtiny, ne „(FWD)“", () => {
    expect(tip({ position: "GK" })).toContain("brankář");
    expect(tip({ position: "DEF" })).toContain("obránce");
    expect(tip({ position: "MID" })).toContain("záložník");
  });

  it("neznámý post nespadne na prázdno", () => {
    expect(tip({ position: "XX" })).toContain("XX");
  });

  it("důvod je vztažený ke kádru, ne k absolutnímu číslu", () => {
    expect(tip({}, "nejlepsi")).toContain("nejlepším");
    expect(tip({}, "chybi")).toContain("nemáš v kádru nikoho");
    expect(tip({}, "talent")).toContain("víc, než ukazuje");
    expect(tip({}, "zaloha")).toContain("kryl záda");
  });

  it("věta je hotová a odkáže, kde hráče najít", () => {
    expect(tip().trim()).toMatch(/\.$/);
    expect(tip()).toContain("Přestupech");
  });
});
