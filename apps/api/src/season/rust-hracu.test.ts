/**
 * Rychlost rozvoje hráčů — tři pravidla, na kterých stojí, aby se dal dorostenec vytrénovat.
 *
 * Všechna tři vznikla z měření skutečným denním tickem nad kopií produkční databáze,
 * ne z odhadu. Před nimi rostl dorostenec 0,5 bodu hodnocení za sezónu, což znamenalo,
 * že se na základní sestavu áčka nedostal nikdy.
 */
import { describe, it, expect } from "vitest";
import {
  simulateTraining, ageGrowthMod, TRAINING_EFFECTS, POCET_POKUSU_DO_VEKU,
  type TrainingPlayer,
} from "./training";
import { createRng } from "../generators/rng";
import { ratingWeightsFor } from "@okresni-masina/shared";
import { stupenTalentu, slovneTempoRozvoje, pokusuZaTalent } from "../skills/talent";

const ATR = ["speed","technique","shooting","passing","heading","defense","goalkeeping",
             "stamina","strength","vision","creativity","setPieces"] as const;

function hrac(vek: number, pozice = "MID", stropy = 90, talent = 30): TrainingPlayer {
  const p: Record<string, unknown> = {
    firstName: "T", lastName: "T", age: vek, position: pozice,
    occupation: "Zedník", bodyType: "athletic", avatarConfig: {},
    preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 60, injuryProneness: 10,
    discipline: 80, patriotism: 50, alcohol: 5, temper: 30,
    leadership: 20, workRate: 80, aggression: 40, consistency: 60, clutch: 50,
    hiddenTalent: talent, skillCaps: Object.fromEntries(ATR.map((a) => [a, stropy])),
  };
  for (const a of ATR) p[a] = 30;
  return p as unknown as TrainingPlayer;
}

/** Kolik zlepšení hráč nasbírá za daný počet tréninků. */
function odtrenuj(kadr: TrainingPlayer[], dni: number, typ = "tactics", seed = 42): number[] {
  const rng = createRng(seed);
  const zisky = new Array(kadr.length).fill(0);
  for (let d = 0; d < dni; d++) {
    const v = simulateTraining(rng, kadr, { sessionsPerWeek: 3, type: typ, approach: "balanced" } as never);
    for (const z of v.improvements) {
      const rec = kadr[z.playerIndex] as unknown as Record<string, number>;
      if (typeof rec[z.attribute] === "number") rec[z.attribute] += z.change;
      zisky[z.playerIndex] += z.change;
    }
  }
  return zisky;
}


/** Kolik bodů nasbírá osmnáctiletý s daným talentem za sezónu, když klub střídá typy tréninku. */
function sezona(talent: number): number {
  const TYPY = ["conditioning", "technique", "tactics", "match_practice"];
  const kadr = [hrac(18, "MID", 90, talent), ...Array.from({ length: 14 }, () => hrac(25))];
  const rng = createRng(5);
  let zisk = 0;
  for (let d = 0; d < 90; d++) {
    const v = simulateTraining(rng, kadr, { sessionsPerWeek: 3, type: TYPY[d % TYPY.length], approach: "balanced" } as never);
    for (const z of v.improvements) {
      const rec = kadr[z.playerIndex] as unknown as Record<string, number>;
      if (typeof rec[z.attribute] === "number") rec[z.attribute] += z.change;
      if (z.playerIndex === 0) zisk += z.change;
    }
  }
  return zisk;
}

describe("mladí mají dva pokusy o zlepšení na trénink", () => {
  it("hranice je 28 let — produktivní věk fotbalisty, ne konec dorostu", () => {
    expect(POCET_POKUSU_DO_VEKU).toBe(28);
  });

  it("dvacetiletý nasbírá výrazně víc než třicetiletý", () => {
    const mlady = odtrenuj([hrac(20), ...Array.from({ length: 15 }, () => hrac(25))], 60)[0];
    const stary = odtrenuj([hrac(30), ...Array.from({ length: 15 }, () => hrac(25))], 60)[0];
    expect(mlady).toBeGreaterThan(stary * 1.5);
  });

  it("sedmadvacetiletý na tom je pořád lépe než devětadvacetiletý", () => {
    // Produktivní věk konči na 27; kdyby hranice zůstala na 22, oba by byli stejně
    const a = odtrenuj([hrac(27), ...Array.from({ length: 15 }, () => hrac(25))], 60)[0];
    const b = odtrenuj([hrac(29), ...Array.from({ length: 15 }, () => hrac(25))], 60)[0];
    expect(a).toBeGreaterThan(b);
  });
});

describe("trénink míří jen na dovednosti, které se počítají do hodnocení", () => {
  it("hráč v poli netrénuje brankaření", () => {
    const kadr = [hrac(24, "MID"), ...Array.from({ length: 10 }, () => hrac(25))];
    const rng = createRng(7);
    for (let d = 0; d < 80; d++) {
      const v = simulateTraining(rng, kadr, { sessionsPerWeek: 3, type: "match_practice", approach: "balanced" } as never);
      for (const z of v.improvements) {
        if (z.playerIndex === 0) expect(z.attribute).not.toBe("goalkeeping");
        const rec = kadr[z.playerIndex] as unknown as Record<string, number>;
        if (typeof rec[z.attribute] === "number") rec[z.attribute] += z.change;
      }
    }
  });

  it("záložník kreativitu i standardky trénuje — nově se mu počítají", () => {
    // Dřív neměly u hráče v poli žádnou váhu, takže polovina technického tréninku
    // mizela naprázdno. Trénovat standardky je pro záložníka legitimní.
    const vahy = ratingWeightsFor("MID");
    expect(vahy.setPieces ?? 0).toBeGreaterThan(0);
    expect(vahy.creativity ?? 0).toBeGreaterThan(0);

    const kadr = [hrac(24, "MID"), ...Array.from({ length: 10 }, () => hrac(25))];
    const rng = createRng(11);
    const trefy = new Set<string>();
    for (let d = 0; d < 80; d++) {
      const v = simulateTraining(rng, kadr, { sessionsPerWeek: 3, type: "technique", approach: "balanced" } as never);
      for (const z of v.improvements) {
        if (z.playerIndex === 0) trefy.add(z.attribute);
        const rec = kadr[z.playerIndex] as unknown as Record<string, number>;
        if (typeof rec[z.attribute] === "number") rec[z.attribute] += z.change;
      }
    }
    expect(trefy.size).toBeGreaterThan(0);
    // brankaření se mu netrénuje dál — to u něj váhu opravdu nemá
    expect([...trefy]).not.toContain("goalkeeping");
  });

  it("brankář naopak kreativitu trénovat smí — u něj váhu má", () => {
    expect(ratingWeightsFor("GK").creativity).toBeGreaterThan(0);
  });
});

describe("výdrž neklesá hráčům, kteří chodí trénovat", () => {
  it("výdrž se dá trénovat víc než jedním typem tréninku", () => {
    const typy = Object.entries(TRAINING_EFFECTS).filter(([, a]) => a.includes("stamina"));
    expect(typy.length).toBeGreaterThanOrEqual(3);
  });

  it("kdo netrénuje, spadne z formy, ale ne pode dno", () => {
    // Lajdák, který skoro nikdy nedorazí, ale začíná s vysokou výdrží.
    // Podlaha je 60 % stropu výdrže (90) = 54 — pod ni absencí spadnout nejde.
    const lajdak = hrac(25);
    const rec = lajdak as unknown as Record<string, number>;
    rec.discipline = 1; rec.workRate = 1; rec.condition = 15; rec.alcohol = 95;
    rec.stamina = 85;
    odtrenuj([lajdak, ...Array.from({ length: 10 }, () => hrac(25))], 300, "technique", 3);
    expect(rec.stamina).toBeLessThan(85);          // z formy vypadl
    expect(rec.stamina).toBeGreaterThanOrEqual(53); // ale ne pode dno
  });
});

describe("věková křivka odpovídá fotbalu", () => {
  it("s věkem se rozvoj jen zpomaluje, nikdy nezrychlí", () => {
    for (let v = 16; v < 44; v++) {
      expect(ageGrowthMod(v + 1)).toBeLessThanOrEqual(ageGrowthMod(v));
    }
  });

  it("dorostenec roste znatelně rychleji než hráč v nejlepších letech", () => {
    expect(ageGrowthMod(17)).toBeGreaterThan(ageGrowthMod(26) * 1.3);
  });

  it("po třicítce a po pětatřicítce to výrazně klesá", () => {
    expect(ageGrowthMod(30)).toBeLessThan(ageGrowthMod(27));
    expect(ageGrowthMod(35)).toBeLessThan(ageGrowthMod(30));
    expect(ageGrowthMod(40)).toBeLessThan(ageGrowthMod(35));
  });
});

describe("talent se v tréninku opravdu pozná", () => {
  it("prahy pro text i pro mechaniku jsou jedny", () => {
    // Karta psala „rozvíjí se pomalu" podle svých prahů, trénink počítal talent úplně
    // jinak — a naměřený rozdíl mezi „pomalu" a „rychle" byl tři procenta.
    expect(stupenTalentu(9)).toBe("pomalu");
    expect(stupenTalentu(26)).toBe("prumerne");
    expect(stupenTalentu(40)).toBe("rychle");
    expect(stupenTalentu(83)).toBe("bleskove");
    expect(slovneTempoRozvoje(9)).toBe("rozvíjí se pomalu");
  });

  it("každý stupeň dostane jiný počet pokusů, ne jiné procento", () => {
    // Procento se u dorostence opře o strop a ztratí se. Pokusy se sčítají.
    expect(pokusuZaTalent(9)).toBeLessThan(pokusuZaTalent(26));
    expect(pokusuZaTalent(26)).toBeLessThan(pokusuZaTalent(40));
    expect(pokusuZaTalent(40)).toBeLessThan(pokusuZaTalent(83));
  });

  it("nadaný dorostenec nasbírá znatelně víc než stejně starý bez talentu", () => {
    // Klub střídá typy tréninku, jinak se pár dovedností rychle opře o zákon klesajícího
    // výnosu a všechny varianty skončí na stejné hodnotě bez ohledu na počet pokusů.
    const pomaly = sezona(9);
    const nadany = sezona(83);
    // Před opravou tu vycházel rozdíl pod pět procent — v rámci šumu.
    expect(nadany).toBeGreaterThan(pomaly * 1.25);
  });

  it("hráč bez talentu se pořád zlepšuje, jen pomaleji", () => {
    expect(sezona(0)).toBeGreaterThan(0);
  });
});
