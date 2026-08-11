import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  MAX_LEVEL,
  cumulativeInvestment,
  getBazarPriceBand,
  getPawnQuote,
  getRepairCost,
  getSellOptions,
  shopCostFromLevel,
} from "./equipment-generator";

/**
 * Ekonomika druhotného trhu s vybavením.
 *
 * Tyhle testy nehlídají konkrétní čísla — ta se budou ladit. Hlídají vlastnosti,
 * na kterých stojí obrana proti tvorbě peněz z ničeho. Když někdo šáhne na sazby
 * nebo na ceny v UPGRADE_COSTS, musí to spadnout tady, ne až v produkční ekonomice.
 */

const LEVELS = [1, 2, 3] as const;
const CONDITIONS = [0, 5, 20, 50, 70, 100] as const;

/** Jediné místo, kde hra tvoří peníze z ničeho, je zastavárna. Všechny smyčky do ní musí být ztrátové. */
describe("bazar a zastavárna — ochrana proti tvorbě peněz", () => {
  it("spodní mez bazaru se rovná výkupu zastavárny při stavu 100 %", () => {
    // Kdyby mez klesala se stavem, jde koupit ojetý kus levně, opravit za level*500
    // a zastavit za plnou cenu. Tenhle invariant to zavírá algebraicky.
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        expect(getBazarPriceBand(cat, lv, 100).min, `${cat} Lv${lv}`).toBe(getPawnQuote(cat, lv, 100));
      }
    }
  });

  it("spodní mez bazaru nezávisí na stavu", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        const mins = CONDITIONS.map((c) => getBazarPriceBand(cat, lv, c).min);
        expect(new Set(mins).size, `${cat} Lv${lv} má proměnlivou spodní mez`).toBe(1);
      }
    }
  });

  it("koupit v bazaru za minimum, opravit a zastavit je vždycky ztráta", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        const buyAtMin = getBazarPriceBand(cat, lv, 5).min;
        const repairCost = getRepairCost(cat, lv, 5);
        const payoutAfterRepair = getPawnQuote(cat, lv, 100);
        expect(payoutAfterRepair - buyAtMin - repairCost, `${cat} Lv${lv}`).toBeLessThan(0);
      }
    }
  });

  it("koupit v obchodě a hned zastavit je vždycky ztráta", () => {
    // Po upgradu je stav vždy 100 %, takže výkup je maximální možný.
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        const paid = shopCostFromLevel(cat, lv - 1, lv);
        expect(getPawnQuote(cat, lv, 100), `${CATEGORY_LABELS[cat]} Lv${lv}`).toBeLessThan(paid);
      }
    }
  });

  it("zastavárna nikdy nedá víc než nejnižší cena v bazaru", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        for (const c of CONDITIONS) {
          expect(getPawnQuote(cat, lv, c), `${cat} Lv${lv} @${c}`).toBeLessThanOrEqual(getBazarPriceBand(cat, lv, c).min);
        }
      }
    }
  });
});

describe("cena opravy", () => {
  it("roste s hodnotou vybavení, ne jen s úrovní", () => {
    // Dřív stála oprava level × 500, takže dodávka za 335 000 Kč vyšla stejně
    // jako láhve za 16 800 Kč. To je celý smysl téhle změny.
    const van = getRepairCost("team_van", 3, 40);
    const bottles = getRepairCost("water_bottles", 3, 40);
    expect(van).toBeGreaterThan(bottles * 5);
  });

  it("roste s tím, jak je kus sešlý", () => {
    const costs = [90, 70, 40, 10].map((c) => getRepairCost("balls", 3, c));
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
  });

  it("plný stav se neopravuje a nulová úroveň nic nestojí", () => {
    expect(getRepairCost("balls", 3, 100)).toBe(0);
    expect(getRepairCost("balls", 0, 10)).toBe(0);
  });

  it("opravit a zastavit vyjde nanejvýš na nulu", () => {
    // Sazba opravy je schválně rovná tomu, co obnovený stav přidá k výkupu.
    // Kdyby byla nižší, dalo by se donekonečna opravovat a zastavovat se ziskem.
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        for (const c of [5, 20, 50, 80]) {
          const gain = getPawnQuote(cat, lv, 100) - getPawnQuote(cat, lv, c);
          expect(gain - getRepairCost(cat, lv, c), `${cat} Lv${lv} @${c}`).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it("opravit a prodat v bazaru se naopak vyplatí", () => {
    // „Umyj auto, než ho prodáš" — u dražších kusů musí oprava dávat smysl.
    for (const cat of CATEGORIES) {
      const lv = 3;
      const gain = getBazarPriceBand(cat, lv, 100).suggested - getBazarPriceBand(cat, lv, 30).suggested;
      expect(gain, `${cat}`).toBeGreaterThan(getRepairCost(cat, lv, 30));
    }
  });
});

describe("cenové rozpětí", () => {
  it("drží pořadí min ≤ doporučeno ≤ max", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        for (const c of CONDITIONS) {
          const { min, suggested, max } = getBazarPriceBand(cat, lv, c);
          expect(min, `${cat} Lv${lv} @${c}`).toBeLessThanOrEqual(suggested);
          expect(suggested, `${cat} Lv${lv} @${c}`).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("doporučená cena roste se stavem", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        const suggested = CONDITIONS.map((c) => getBazarPriceBand(cat, lv, c).suggested);
        for (let i = 1; i < suggested.length; i++) {
          expect(suggested[i], `${cat} Lv${lv}`).toBeGreaterThanOrEqual(suggested[i - 1]);
        }
      }
    }
  });

  it("horní mez nepřesáhne cenu nového", () => {
    for (const cat of CATEGORIES) {
      for (const lv of LEVELS) {
        expect(getBazarPriceBand(cat, lv, 100).max).toBe(cumulativeInvestment(cat, lv));
      }
    }
  });
});

describe("kumulativní investice", () => {
  it("sčítá jednotlivé upgrady", () => {
    // Míče: 3 000 + 15 000 + 40 000
    expect(cumulativeInvestment("balls", 1)).toBe(3000);
    expect(cumulativeInvestment("balls", 2)).toBe(18000);
    expect(cumulativeInvestment("balls", 3)).toBe(58000);
  });

  it("na levelu 0 je nula a neznámá kategorie nespadne", () => {
    expect(cumulativeInvestment("balls", 0)).toBe(0);
    expect(cumulativeInvestment("neexistuje", 3)).toBe(0);
    expect(getPawnQuote("balls", 0, 100)).toBe(0);
  });

  it("nepřeteče přes maximální level", () => {
    expect(cumulativeInvestment("balls", 99)).toBe(cumulativeInvestment("balls", MAX_LEVEL));
  });

  it("shopCostFromLevel počítá jen zbývající kroky", () => {
    expect(shopCostFromLevel("balls", 1, 3)).toBe(55000); // 15 000 + 40 000
    expect(shopCostFromLevel("balls", 3, 3)).toBe(0);
    expect(shopCostFromLevel("balls", 3, 1)).toBe(0); // nikdy záporné
  });
});

describe("getSellOptions", () => {
  it("vrací jen kategorie, které tým vlastní", () => {
    const levels = { balls: 2, bibs: 0, team_van: 1 };
    const conditions = { balls_condition: 70, bibs_condition: 90, team_van_condition: 100 };
    const options = getSellOptions(levels, conditions);

    expect(options.map((o) => o.category).sort()).toEqual(["balls", "team_van"]);
  });

  it("nese stav i investici pro rozhodnutí hráče", () => {
    const [balls] = getSellOptions({ balls: 3 }, { balls_condition: 70 });

    expect(balls.invested).toBe(58000);
    expect(balls.condition).toBe(70);
    expect(balls.pawnQuote).toBe(getPawnQuote("balls", 3, 70));
    expect(balls.bazarMin).toBeGreaterThan(balls.pawnQuote); // zastavárna je horší volba
  });

  it("chybějící stav bere jako 50, ne jako nulu", () => {
    const [opt] = getSellOptions({ balls: 2 }, {});
    expect(opt.condition).toBe(50);
    expect(opt.pawnQuote).toBeGreaterThan(0);
  });
});
