import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { nazevIncidentu } from "./katalog";
import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu, NavrhStopy } from "./typy";
import {
  BEZ_ZNALOSTI, HLAVICKA_ZNALOSTI, blokZnalosti, radekDoPromptu, radekZnalosti, vyberZnalosti, znalostiIncidentu,
  type RadekZnalostiDb,
} from "./znalosti";

const DNES = "2026-09-16T16:00:00.000Z";
const SVEDEK = hrac({ id: "s", jmeno: "Jan Svědek" });
const KAMARAD = hrac({ id: "k", jmeno: "Karel Kamarád" });

const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

function stopa(over: Partial<NavrhStopy>): NavrhStopy {
  return { zdroj: "svedek", ukazujeNa: "p", podezreli: null, drzitel: "s", sila: 2, bonusPolicie: 0.1, text: "Stopa.", nalezena: false, ...over };
}

describe("kdo co ví při vzniku incidentu", () => {
  const stav = stavKlubu({ kadr: [PROBLEMOVY, SVEDEK, KAMARAD], gameDate: DNES });

  it("celý kádr zná veřejný text na 14 dní, pachatel pravdu na 60", () => {
    const z = znalostiIncidentu(stav, NAVRH, [], createRng(1));
    expect(z.filter((r) => r.role === "kadr").map((r) => r.playerId)).toEqual(["p", "s", "k"]);
    expect(z.find((r) => r.role === "kadr")).toMatchObject({ fact: NAVRH.text, until: gameExpiry(DNES, 14) });
    const pachatel = z.find((r) => r.role === "pachatel");
    expect(pachatel).toMatchObject({ playerId: "p", until: gameExpiry(DNES, 60) });
    expect(pachatel?.fact).toContain(nazevIncidentu("vloupani_sklad"));
  });

  it("závažný incident si kádr pamatuje 45 dní", () => {
    const z = znalostiIncidentu(stav, { ...NAVRH, severity: 3 }, [], createRng(1));
    expect(z.find((r) => r.role === "kadr")?.until).toBe(gameExpiry(DNES, 45));
  });

  it("svědek, kamarád a rival podle stop, s ochotou podle role", () => {
    const z = znalostiIncidentu(stav, NAVRH, [
      stopa({ zdroj: "svedek", drzitel: "s" }),
      stopa({ zdroj: "kamarad", drzitel: "k" }),
      stopa({ zdroj: "rival", drzitel: "s" }),
    ], createRng(1));
    const svedek = z.find((r) => r.role === "svedek");
    expect(svedek).toMatchObject({ playerId: "s", until: DNES });
    expect(svedek?.fact).toContain("Pepa Průšvih");
    expect(svedek?.ochota).toBeGreaterThanOrEqual(40);
    expect(svedek?.ochota).toBeLessThanOrEqual(70);
    const kamarad = z.find((r) => r.role === "kamarad");
    expect(kamarad?.ochota).toBeGreaterThanOrEqual(10);
    expect(kamarad?.ochota).toBeLessThanOrEqual(25);
    const rival = z.find((r) => r.role === "rival");
    expect(rival?.playerId).toBe("s");
    expect(rival?.ochota).toBeGreaterThanOrEqual(60);
  });

  it("dvě stopy stejného držitele a zdroje dají jednu znalost", () => {
    const z = znalostiIncidentu(stav, NAVRH, [stopa({}), stopa({})], createRng(1));
    expect(z.filter((r) => r.role === "svedek")).toHaveLength(1);
  });

  it("stopy bez držitele znalost nedávají, cizí pachatel jen kádr", () => {
    expect(znalostiIncidentu(stav, NAVRH, [stopa({ zdroj: "kamera", drzitel: null, nalezena: true })], createRng(1)).map((r) => r.role))
      .toEqual(["kadr", "kadr", "kadr", "pachatel"]);
    expect(znalostiIncidentu(stav, { ...NAVRH, culpritType: "cizi", culpritPlayerId: null }, [], createRng(1)).map((r) => r.role))
      .toEqual(["kadr", "kadr", "kadr"]);
  });
});

function radekDb(over: Partial<RadekZnalostiDb> = {}): RadekZnalostiDb {
  return {
    incident_id: "inc-1", role: "kadr", fact: "Ze skladu zmizelo vybavení: Dresy.", interrogation: null,
    kind: "vloupani_sklad", category: "kradez", severity: 1, game_date: "2026-09-13T16:00:00.000Z", status: "otevreny",
    resolution: null, culprit_revealed: 0, culprit_player_id: "p", pachatel_jmeno: null, pachatel_prijmeni: null,
    ...over,
  };
}

const radek = (over: Partial<RadekZnalostiDb> = {}, hracId = "s") => radekZnalosti(radekDb(over), hracId, DNES);
const ODHALENY = { culprit_revealed: 1, pachatel_jmeno: "Pepa", pachatel_prijmeni: "Průšvih" };

describe("řádek znalosti z DB", () => {
  it("neodhaleného pachatele nepozná, ani když dotaz vrátí jméno", () => {
    expect(radek({ pachatel_jmeno: "Pepa", pachatel_prijmeni: "Průšvih" }).pachatel).toBeNull();
  });

  it("odhalený pachatel se jmenuje a sám o sobě ví, že je to on", () => {
    expect(radek(ODHALENY).pachatel).toBe("Pepa Průšvih");
    expect(radek(ODHALENY, "p").pachatelJeOn).toBe(true);
    expect(radek(ODHALENY, "s").pachatelJeOn).toBe(false);
  });

  it("počítá herní dny od incidentu", () => {
    expect(radek().predDny).toBe(3);
  });
});

describe("výběr znalostí do promptu", () => {
  it("tajná role mimo téma se do promptu nedostane", () => {
    const radky = [radek(), radek({ role: "svedek", fact: "Viděl jsi hráče: Pepa Průšvih." })];
    expect(vyberZnalosti(radky, null).map((r) => r.role)).toEqual(["kadr"]);
    expect(vyberZnalosti(radky, "jiny-incident").map((r) => r.role)).toEqual(["kadr"]);
    expect(vyberZnalosti(radky, "inc-1").map((r) => r.role)).toEqual(["kadr", "svedek"]);
  });

  it("neprávem obviněný si křivdu nese i mimo téma", () => {
    expect(vyberZnalosti([radek({ role: "obvineny" })], null)).toHaveLength(1);
  });

  it("nejvýš tři incidenty, téma první, pak závažnost", () => {
    const radky = ["a", "b", "c", "d"].map((id, n) => radek({ incident_id: id, severity: n + 1 }));
    expect(vyberZnalosti(radky, "a").map((r) => r.incidentId)).toEqual(["a", "d", "c"]);
  });
});

describe("blok znalostí v promptu", () => {
  it("nenačtené znalosti nepřidají nic, prázdné řeknou, že nic neví", () => {
    expect(blokZnalosti(undefined)).toBe("");
    expect(blokZnalosti([])).toBe(BEZ_ZNALOSTI);
    expect(BEZ_ZNALOSTI).toContain("nikoho neobviňuj");
  });

  it("veřejný řádek: co se stalo, kdy a že se neví kdo", () => {
    const blok = blokZnalosti([radek()]);
    expect(blok.startsWith(HLAVICKA_ZNALOSTI)).toBe(true);
    expect(blok).toContain("Ze skladu zmizelo vybavení: Dresy. Stalo se to před 3 dny. Kdo to byl, se v klubu neví.");
  });

  it("odhalený pachatel: ostatní vědí kdo, on ví, že na to přišli, a jak to dopadlo", () => {
    const uzavreny = { ...ODHALENY, status: "uzavreny", resolution: "pokuta" };
    expect(radekDoPromptu(radek(uzavreny))).toContain("Udělal to Pepa Průšvih. Trenér mu dal pokutu.");
    expect(radekDoPromptu(radek(uzavreny, "p"))).toContain("Přišlo se na to, že jsi to byl ty. Trenér ti dal pokutu.");
  });

  it("šetření policie je v řádku", () => {
    expect(radekDoPromptu(radek({ status: "policie" }))).toContain("Vyšetřuje to policie.");
  });

  it("pokyn podle uloženého výsledku výslechu", () => {
    expect(radekDoPromptu(radek({ role: "svedek", interrogation: "prozradil" }))).toContain("POKYN: Trenérovi to řekni.");
    expect(radekDoPromptu(radek({ role: "kamarad", interrogation: "kryje" }))).toContain("jméno trenérovi neřekni");
    expect(radekDoPromptu(radek({ role: "svedek", interrogation: null }))).toContain("jméno trenérovi neřekni");
    expect(radekDoPromptu(radek({ role: "pachatel", interrogation: null }, "p"))).toContain("POKYN: Zapírej");
    expect(radekDoPromptu(radek({ role: "pachatel", interrogation: "priznal" }, "p"))).toContain("POKYN: Přiznej se");
    expect(radekDoPromptu(radek({ role: "pachatel", culprit_revealed: 1 }, "p"))).toContain("nezapírej");
  });

  it("v bloku není dlouhá pomlčka", () => {
    const vse = blokZnalosti([
      radek(), radek({ role: "svedek" }), radek({ role: "pachatel" }), radek({ status: "uzavreny", resolution: "nevyreseno" }),
    ]);
    expect(vse).not.toContain("—");
  });
});
