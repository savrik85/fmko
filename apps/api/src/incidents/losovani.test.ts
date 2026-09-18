import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { naCooldownu, vylosujIncident, vylosujPozitivni } from "./losovani";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";

const VYBAVENY = { vybaveni: { balls: 2, jerseys: 1 }, kadr: [PROBLEMOVY] };

describe("denní los incidentů", () => {
  it("nový tým je chráněný", () => {
    const s = stavKlubu({ ...VYBAVENY, odehranychZapasu: 2 });
    for (let seed = 1; seed <= 500; seed++) expect(vylosujIncident(s, createRng(seed))).toBeNull();
  });

  it("s otevřeným problémem nevznikne další", () => {
    const s = stavKlubu({ ...VYBAVENY, otevreneProblemy: 1 });
    for (let seed = 1; seed <= 500; seed++) expect(vylosujIncident(s, createRng(seed))).toBeNull();
  });

  it("typ v cooldownu se nevylosuje", () => {
    const s = stavKlubu({ ...VYBAVENY, posledniVyskyt: { vloupani_sklad: "2026-09-11" } });
    for (let seed = 1; seed <= 3000; seed++) expect(vylosujIncident(s, createRng(seed))?.kind).not.toBe("vloupani_sklad");
  });

  it("po rolloveru (herní datum skočí zpět) cooldown neplatí", () => {
    expect(naCooldownu(stavKlubu({ den: "2026-01-10", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(false);
    expect(naCooldownu(stavKlubu({ den: "2026-09-16", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(true);
    expect(naCooldownu(stavKlubu({ den: "2026-09-30", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(false);
  });

  it("náhodný problém přijde zhruba jednou za 25 dní", () => {
    const s = stavKlubu(VYBAVENY);
    let pocet = 0;
    for (let seed = 1; seed <= 4000; seed++) if (vylosujIncident(s, createRng(seed))) pocet++;
    expect(pocet / 4000).toBeGreaterThan(0.02);
    expect(pocet / 4000).toBeLessThan(0.06);
  });

  it("spouštěný incident přijde i bez náhodného losu", () => {
    const s = stavKlubu({
      stadion: { changing_rooms: 1, pitch_condition: 70 },
      kadr: [hrac({ id: "a", alkohol: 70 }), hrac({ id: "b", alkohol: 85 })],
      vcera: { vyhra: true, doma: true, cervenaKarta: [], zapasId: null, trzby: { kasa: 0, tombola: 0 } }, hospodaVcera: ["a", "b"],
    });
    let oslav = 0;
    for (let seed = 1; seed <= 1000; seed++) if (vylosujIncident(s, createRng(seed))?.kind === "oslava_v_kabine") oslav++;
    expect(oslav / 1000).toBeGreaterThan(0.15);
  });

  it("stejný stav a seed dají stejný incident", () => {
    const s = stavKlubu(VYBAVENY);
    for (let seed = 1; seed <= 200; seed++) {
      expect(vylosujIncident(s, createRng(seed))).toEqual(vylosujIncident(s, createRng(seed)));
    }
  });
});

/** Klub s kandidátem na každý pozitivní incident kromě omluvného dopisu. */
const PLNY_POZITIVNI = {
  vybaveni: { team_van: 1, team_van_condition: 40, jerseys: 1 },
  kadr: [
    hrac({ id: "r", jmeno: "Karel Zedník", povolani: "Zedník" }),
    hrac({ id: "m", jmeno: "Milan Mechanik", povolani: "Automechanik" }),
    hrac({ id: "d", jmeno: "Petr Podnikatel", povolani: "Podnikatel" }),
  ],
  poskozeni: [{ id: "dmg-1", zarizeni: "fence" }],
};

describe("denní los pozitivního incidentu", () => {
  it("nový tým je chráněný", () => {
    const s = stavKlubu({ ...PLNY_POZITIVNI, odehranychZapasu: 2 });
    for (let seed = 1; seed <= 500; seed++) expect(vylosujPozitivni(s, createRng(seed))).toBeNull();
  });

  it("otevřený problém pozitivnímu incidentu nevadí: strop se ho netýká", () => {
    const s = stavKlubu({ ...PLNY_POZITIVNI, otevreneProblemy: 1 });
    let pocet = 0;
    for (let seed = 1; seed <= 3000; seed++) if (vylosujPozitivni(s, createRng(seed))) pocet++;
    expect(pocet).toBeGreaterThan(0);
  });

  it("alarm_vyplasil se nikdy nevylosuje samo (vzniká jen jako vedlejší výsledek krádeže)", () => {
    const s = stavKlubu(PLNY_POZITIVNI);
    for (let seed = 1; seed <= 5000; seed++) expect(vylosujPozitivni(s, createRng(seed))?.kind).not.toBe("alarm_vyplasil");
  });

  it("pozitivní incident přijde zhruba jednou za 40 dní", () => {
    const s = stavKlubu(PLNY_POZITIVNI);
    let pocet = 0;
    for (let seed = 1; seed <= 6000; seed++) if (vylosujPozitivni(s, createRng(seed))) pocet++;
    expect(pocet / 6000).toBeGreaterThan(0.015);
    expect(pocet / 6000).toBeLessThan(0.035);
  });

  it("klub bez řemeslníka, bez rozbité dodávky a s dresy na úrovni 3 nedostane žádný z nich", () => {
    // Prázdný kádr navíc vyřadí hrdinu, poctivého nálezce i dárce zaměstnavatele
    // (všichni potřebují aspoň jednoho hráče v kádru) a bez útěku s penězi nepřijde
    // ani omluvný dopis. Jediný kandidát bez podmínky je anonymní obálka - ta je v
    // katalogu záměrně bez závislosti na stavu klubu, takže ji tenhle test nevylučuje.
    const s = stavKlubu({ vybaveni: { jerseys: 3 }, kadr: [] });
    for (let seed = 1; seed <= 5000; seed++) {
      const kind = vylosujPozitivni(s, createRng(seed))?.kind;
      expect(["remeslnik_opravil", "mechanik_dodavka", "dedictvi", "hrdina", "poctivy_nalezce", "dar_zamestnavatele", "omluvny_dopis"]).not.toContain(kind);
    }
  });

  it("stejný stav a seed dají stejný pozitivní incident", () => {
    const s = stavKlubu(PLNY_POZITIVNI);
    for (let seed = 1; seed <= 200; seed++) {
      expect(vylosujPozitivni(s, createRng(seed))).toEqual(vylosujPozitivni(s, createRng(seed)));
    }
  });
});
