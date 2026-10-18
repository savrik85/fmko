import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generatePlayerSkills, overallRatingFromFlat, talentHeadStart } from "./generator";
import { flattenedNameWeights, generateSquad, pickFirstName, type VillageInfo } from "../generators/player";
import { FIRSTNAMES } from "../data/czech-names";

type SurnameData = Parameters<typeof generateSquad>[2];
type FirstnameData = Parameters<typeof generateSquad>[3];

describe("náskok talentu u hráče, který vzniká starší než dorostenec", () => {
  it("dorostenec v 16 nic, klenot od 19 let +10, od 24 let nic", () => {
    expect(talentHeadStart(16, 85, "village")).toBe(0);
    expect(talentHeadStart(17, 85, "village")).toBe(3);
    expect(talentHeadStart(18, 85, "village")).toBe(7);
    expect(talentHeadStart(19, 85, "village")).toBe(10);
    expect(talentHeadStart(21, 85, "village")).toBe(10);
    expect(talentHeadStart(23, 85, "village")).toBe(10);
    expect(talentHeadStart(24, 85, "village")).toBe(0);
    // Běžný talent obce náskok nemá.
    expect(talentHeadStart(20, 15, "village")).toBe(0);
  });

  it("pevný talent (zkrachovalý talent z ligy) ani cílové hodnocení náskok nedostanou", () => {
    const opts = { position: "MID" as const, age: 20, level: "village" };
    const a = generatePlayerSkills(createRng(5), { ...opts, hiddenTalent: 90 });
    const b = generatePlayerSkills(createRng(5), { ...opts, hiddenTalent: 10 });
    expect(a.rating).toBe(b.rating);
    expect(a.skills).toEqual(b.skills);
  });

  it("hodnocení sedí s dovednostmi a nic nepřeleze strop ani nespadne pod 1", () => {
    const rng = createRng(11);
    for (let i = 0; i < 2000; i++) {
      const age = 16 + (i % 8);
      const position = (["GK", "DEF", "MID", "FWD"] as const)[i % 4];
      const g = generatePlayerSkills(rng, { position, age, level: ["hamlet", "village", "town", "city"][i % 4] });
      expect(overallRatingFromFlat(position, g.skills, { stamina: g.skills.stamina, strength: g.skills.strength }, g.hiddenTalent)).toBe(g.rating);
      for (const [k, v] of Object.entries(g.skills)) {
        if (k === "experience" || (k === "goalkeeping" && position !== "GK")) continue;
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(g.skillsMax[k].maxPotential);
      }
    }
  });
});

describe("pestřejší jména", () => {
  it("váha jména je odmocnina četnosti", () => {
    const flat = flattenedNameWeights({ Jan: 100, Vít: 4 });
    expect(flat.Jan).toBe(10);
    expect(flat["Vít"]).toBe(2);
  });

  it("nejčastější křestní jméno vychází výrazně méně často než podle četnosti", () => {
    const rng = createRng(3);
    const data: FirstnameData = { male: FIRSTNAMES, female: {} };
    let janCount = 0;
    for (let i = 0; i < 3000; i++) if (pickFirstName(rng, data, 25) === "Jan") janCount++;
    expect(janCount / 3000).toBeLessThan(0.05);
  });

  it("v jednom kádru nejsou dva hráči se stejným jménem i příjmením", () => {
    const village: VillageInfo = { region_code: "CZ031", category: "vesnice", population: 500, district: "Prachatice" };
    // Schválně chudá data: jedno příjmení, pár jmen, shody by bez kontroly padaly hned.
    const surnameData: SurnameData = { surnames: { Novák: 1 }, female_forms: {} };
    const firstnameData: FirstnameData = { male: Object.fromEntries(Object.keys(FIRSTNAMES).map((d) => [d, { Jan: 1, Petr: 1, Pavel: 1, Josef: 1, Karel: 1, Tomáš: 1, Jiří: 1, Martin: 1, Lukáš: 1, Jakub: 1, Ondřej: 1, Filip: 1, David: 1, Adam: 1, Matěj: 1, Vojtěch: 1, Michal: 1, Marek: 1, Milan: 1, Václav: 1 }])), female: {} };
    for (let seed = 1; seed <= 20; seed++) {
      const squad = generateSquad(createRng(seed), village, surnameData, firstnameData, 18)
        .filter((p) => p.nationality === "CZ" || p.nationality === undefined);
      const names = squad.map((p) => `${p.firstName} ${p.lastName}`);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
