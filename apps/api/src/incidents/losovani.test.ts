import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { naCooldownu, vylosujIncident } from "./losovani";
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
      vcera: { vyhra: true, doma: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"],
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
