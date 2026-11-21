/**
 * Žádost o pátrání („poptej se“) a hráčův slib, že se poptá. Věty trenérů a hráčů jsou
 * ze skutečných SMS na produkci (FK Geomapping a další, 10–11/2026).
 */
import { describe, expect, it } from "vitest";
import { isInquiryRequest, promisesInquiry } from "./interrogation-tactics";

describe("trenér žádá, ať se hráč poptá", () => {
  it.each([
    // podmiňovací a zdvořilé tvary, které dřív úkol nezaložily (Geomapping 19.–20. 11.)
    "Ahoj Tome, měl bych prosbu, nepoptal by ses mi, kdo by mohl vykrást tu kasu?",
    "Hrbe ahoj, mam na tebe prosbu, lidi na tebe daj. Nepoptal by ses mi prosim, kdo mohl vykrast tu kasu?",
    "Poptal by ses kluků, kdo to mohl být?",
    "Nezeptal by ses v hospodě, jestli někdo něco neví?",
    "Mohl by ses zeptat kluků v kabině?",
    "Mohl bys se optat u piva?",
    "Pomůžeš mi s tim? Zkus se zeptat kluků dneska na tréninku",
    "Diky a pripadne se zeptej i v hospode. Děkuju",
    "Nezjistil bys, kdo tam večer byl?",
    "Dej mi vědět, kdybys něco slyšel.",
    "Nastraž uši, jestli se o tom někde nemluví.",
    // tvary, které už fungovaly
    "Šimon to zapírá, tak se mi prosím ještě poptej, nebo alepsoň, kdo by mohl vědět",
    "Ahoj Dušane, jsi jeden z lídrů a potřebuji tvou pomoc. Víš něco o té krádeži? Mohl by ses případně poptat, pokud nic nevíš?",
    "Ahoj Karle, neslyšel jsi něco o té krádeži? Pokud ne, můžeš prosím zkusit něco zjistit a dát mi vědět?",
    "Zkus se nenápadně optat třeba někdo něco rekne",
    "Nevíš, kdo to byl? Zjisti to.",
  ])("%s", (text) => {
    expect(isInquiryRequest(text)).toBe(true);
  });

  it.each([
    // ptá se, co hráč ví, ne ať se poptá
    "Ahoj Dušane, hele neměl bys nějaký tip, kdo by mohl vykrást tu kasu? Nebo kdo by mohl vědět? Šimon to zapírá",
    "Maty, nevíš o někom s těma prachama z občerstvení? Nebo kdo by mohl vědět? Nepovídalo se něco v hospodě?",
    "Někdo ukradl vybavení. Neslyšel jsi něco? Budu rád za každou stopu",
    "Ted se ale chci zeptat jestli neco nevis o tom rozrytem travniku?",
    // ptá se na výsledek, úkol už je
    "tak co, poptal ses?",
    "Zjistil jsi neco?",
    // trenér sám, policie, minulost
    "Poptam se všech známých a jako klub uděláme vše pro to, abys co nejdříve našel práci.",
    "Zavolám policii, třeba něco zjistí.",
    "Mohl si se zeptat!",
    "Dobře, nemyslim to zle, jen jsem se zeptal",
    "Zeptám se tady vás v kabině, co byste říkali, kdyby nastoupil Balog?",
  ])("není žádost: %s", (text) => {
    expect(isInquiryRequest(text)).toBe(false);
  });
});

describe("hráč slíbí, že se poptá", () => {
  it.each([
    "Trenére, mám havárku a spěchám, ale poptám se v šatně, až bude klid. 🔧",
    "Zdar trenére, nevím nic, ale zkusím to zjistit a zítra dám vědět.",
    "Trenére, já o tom nic nevím. Zkusím se poptat kluků a zítra ti dám vědět, teď musím makat. 🤫",
    "Jasný trenére, poptám se kluků u piva a dám vědět, kdyby někdo kecal blbosti.",
    "Zdar trenére, policajta dělat nebudu, ale u piva nastražím uši.",
    "Zeptám se kluků v kabině, jestli někdo něco neviděl.",
    "Zatím ještě nic trenére, zítra na to vlítnu a zjistím, co se dá.",
  ])("%s", (text) => {
    expect(promisesInquiry(text)).toBe(true);
  });

  it.each([
    "Trenére, řekl jsem ti všechno, vyšetřovat nikoho nebudu, kabina by mě sežrala. Zeptej se kluků sám v neděli.",
    "Trenére, vůbec netuším, fakt ne. V hospodě nikdo nic neříkal.",
    "Ptal jsem se, trenére, ale nikdo nic neví.",
    "Nepoptám se nikoho, nejsem práskač.",
    "Zeptám se doma, jestli můžu v neděli.",
  ])("není slib: %s", (text) => {
    expect(promisesInquiry(text)).toBe(false);
  });
});
