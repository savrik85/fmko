/**
 * Letní příprava dává hráči trvale +2 výdrž a sílu. Dvě věci na tom byly rozbité.
 *
 * Bonus se zapisoval jen do `physical`, jenže hodnocení se počítá z `skills` — hráč tedy
 * viděl v profilu sílu, kterou mu rating nikdy nezapočítal. A strop byl natvrdo 99, takže
 * léto umělo hráče přetlačit nad jeho vlastní potenciál, který mu karta rozvoje slibuje
 * jako hranici.
 */
import { describe, it, expect } from "vitest";
import { pripravFyzickyBonus } from "./season-recap";

/** Nejmenší D1, jaké ta funkce potřebuje: jedno `first()` a zapamatované parametry zápisu. */
function fakeDb(radek: Record<string, unknown>): D1Database {
  return {
    prepare: () => {
      const self = {
        params: [] as unknown[],
        bind: (...params: unknown[]) => { self.params = params; return self; },
        first: async () => radek,
      };
      return self;
    },
  } as unknown as D1Database;
}

function hrac(prepis: Record<string, unknown> = {}) {
  return {
    position: "DEF",
    skills: JSON.stringify({ speed: 40, technique: 30, shooting: 20, passing: 35, heading: 45,
                             defense: 50, vision: 30, creativity: 25, setPieces: 20,
                             experience: 30, stamina: 40, strength: 45 }),
    physical: JSON.stringify({ stamina: 40, strength: 45 }),
    skills_max: JSON.stringify({ stamina: { current: 40, maxPotential: 70 },
                                 strength: { current: 45, maxPotential: 46 } }),
    hidden_talent: 20,
    ...prepis,
  };
}

async function bonus(radek: Record<string, unknown>) {
  const stmts: unknown[] = [];
  await pripravFyzickyBonus(fakeDb(radek), "hrac-1", stmts as never);
  expect(stmts.length).toBe(1);
  const params = (stmts[0] as { params: unknown[] }).params;
  return {
    skills: JSON.parse(params[0] as string),
    physical: JSON.parse(params[1] as string),
    params,
  };
}

describe("letní příprava", () => {
  it("zapíše bonus do OBOU kopií, ne jen do physical", async () => {
    const { skills, physical } = await bonus(hrac());
    expect(physical.stamina).toBe(42);
    expect(skills.stamina).toBe(42);
    expect(skills.stamina).toBe(physical.stamina);
    expect(skills.strength).toBe(physical.strength);
  });

  it("nepřetlačí hráče nad jeho vlastní strop", async () => {
    // Síla má strop 46 a hráč je na 45 — z celého bonusu smí dostat jediný bod.
    const { skills, physical } = await bonus(hrac());
    expect(physical.strength).toBe(46);
    expect(skills.strength).toBe(46);
  });

  it("bez známého stropu spadne na 99, ne na nulu", async () => {
    const { physical } = await bonus(hrac({ skills_max: null }));
    expect(physical.stamina).toBe(42);
    expect(physical.strength).toBe(47);
  });

  it("zvládne i starší tvar skills_max s holým číslem", async () => {
    const { physical } = await bonus(hrac({
      skills_max: JSON.stringify({ stamina: 41, strength: 60 }),
    }));
    expect(physical.stamina).toBe(41); // strop 41 → z 40 jen o bod
    expect(physical.strength).toBe(47);
  });

  it("přepočítá hodnocení", async () => {
    const { params } = await bonus(hrac());
    expect(params).toHaveLength(4); // skills, physical, hodnocení, id
    expect(params[2]).toBeGreaterThan(0);
  });

  it("hráči bez dovedností se hodnocení nedotkne", async () => {
    const { params } = await bonus(hrac({ skills: "{}", physical: "{}", skills_max: null }));
    expect(params.length).toBe(3); // skills, physical, id — rating chybí schválně
  });
});
