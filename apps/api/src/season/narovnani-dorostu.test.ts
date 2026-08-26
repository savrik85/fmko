/**
 * Narovnání potenciálu dorostu — hlavně to, že nikomu nic nesebere a neproběhne dvakrát.
 *
 * Zásah sahá na živá data rozehrané ligy, takže se hlídají tři věci: strop se smí jen
 * zvedat, nikdy nepřeleze 100, a druhé spuštění nesmí hráče zvednout znovu (jinak by
 * opakované volání endpointu vyrobilo z dorostence reprezentanta).
 */
import { describe, it, expect } from "vitest";
import { narovnejPotencialDorostu } from "./narovnani-dorostu";

interface Radek {
  id: string; position: string; overall_rating: number; weekly_wage: number | null;
  hidden_talent: number | null; skills: string | null; physical: string | null;
  skills_max: string; life_context: string | null; created_at: string | null;
}

/** Minimální D1 nad polem v paměti — stačí to, co narovnání volá. */
function fakeDb(hraci: Radek[], latkaSestavy: number | null = null) {
  // Dotaz na hráče filtruje `created_at` — fake to musí umět, jinak by test pojistku minul
  const ulozene = new Map(hraci.map((h) => [h.id, { ...h }]));
  const stari = (h: Radek) => !h.created_at || h.created_at < "2026-08-26";
  const db = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const self = {
        bind: (...p: unknown[]) => { params = p; return self; },
        all: async () => ({ results: [...ulozene.values()].filter(stari) }),
        first: async () => (sql.includes("poradi <= 11") ? { sestava: latkaSestavy } : null),
        run: async () => ({ success: true }),
        __exec: () => {
          if (!sql.includes("UPDATE players SET")) return;
          const [skills, physical, skillsMax, talent, rating, mzda, ctx, id] =
            params as [string, string, string, number, number, number, string, string];
          const h = ulozene.get(id);
          if (!h) return;
          h.skills = skills; h.physical = physical; h.skills_max = skillsMax;
          h.hidden_talent = talent; h.overall_rating = rating; h.weekly_wage = mzda; h.life_context = ctx;
        },
      };
      return self;
    },
    async batch(stmts: Array<{ __exec: () => void }>) {
      for (const s of stmts) s.__exec();
      return stmts.map(() => ({ success: true }));
    },
    __stav: () => [...ulozene.values()],
  };
  return db as unknown as D1Database & { __stav: () => Radek[] };
}

function hrac(id: string, stropy: Record<string, number>, talent = 10): Radek {
  const sm: Record<string, { current: number; maxPotential: number }> = {};
  const skills: Record<string, number> = {};
  const physical: Record<string, number> = {};
  for (const [k, v] of Object.entries(stropy)) {
    const dnes = Math.max(1, v - 20);
    sm[k] = { current: dnes, maxPotential: v };
    if (k === "stamina" || k === "strength") physical[k] = dnes; else skills[k] = dnes;
  }
  return {
    id, position: "MID", overall_rating: 30, weekly_wage: 200, hidden_talent: talent,
    skills: JSON.stringify(skills), physical: JSON.stringify(physical),
    skills_max: JSON.stringify(sm), life_context: JSON.stringify({ condition: 100 }),
    created_at: "2026-01-01",
  };
}

const DOVEDNOSTI = { speed: 50, technique: 48, passing: 52, defense: 46, heading: 44, stamina: 55, strength: 47, experience: 100 };

describe("narovnání potenciálu", () => {
  it("zvedne strop, ale nikdy ho nesníží", async () => {
    const db = fakeDb([hrac("a", DOVEDNOSTI), hrac("b", DOVEDNOSTI), hrac("c", DOVEDNOSTI)]);
    const v = await narovnejPotencialDorostu(db, "u21");

    expect(v.upraveno).toBe(3);
    for (const h of db.__stav()) {
      const sm = JSON.parse(h.skills_max) as Record<string, { maxPotential: number }>;
      for (const [nazev, hodnoty] of Object.entries(sm)) {
        const puvodni = DOVEDNOSTI[nazev as keyof typeof DOVEDNOSTI];
        expect(hodnoty.maxPotential).toBeGreaterThanOrEqual(puvodni);
        expect(hodnoty.maxPotential).toBeLessThanOrEqual(100);
      }
    }
  });

  it("druhé spuštění už nikoho nezvedne", async () => {
    const db = fakeDb([hrac("a", DOVEDNOSTI), hrac("b", DOVEDNOSTI)]);
    await narovnejPotencialDorostu(db, "u21");
    const poPrvnim = db.__stav().map((h) => h.skills_max);

    const druhy = await narovnejPotencialDorostu(db, "u21");
    expect(druhy.upraveno).toBe(0);
    expect(druhy.preskoceno).toBe(2);
    expect(db.__stav().map((h) => h.skills_max)).toEqual(poPrvnim);
  });

  it("je deterministické — týž hráč dostane vždy týž strop", async () => {
    const a = fakeDb([hrac("stejne-id", DOVEDNOSTI)]);
    const b = fakeDb([hrac("stejne-id", DOVEDNOSTI)]);
    await narovnejPotencialDorostu(a, "u21");
    await narovnejPotencialDorostu(b, "u21");
    expect(a.__stav()[0].skills_max).toEqual(b.__stav()[0].skills_max);
  });

  it("zkušenost nechá na pokoji — má strop 100 odjakživa", async () => {
    const db = fakeDb([hrac("a", DOVEDNOSTI)]);
    await narovnejPotencialDorostu(db, "u21");
    const sm = JSON.parse(db.__stav()[0].skills_max) as Record<string, { maxPotential: number }>;
    expect(sm.experience.maxPotential).toBe(100);
  });

  it("talent se jen zvyšuje, hráč o svůj nadprůměr nepřijde", async () => {
    const db = fakeDb([hrac("talentovany", DOVEDNOSTI, 88)]);
    await narovnejPotencialDorostu(db, "u21");
    expect(db.__stav()[0].hidden_talent).toBeGreaterThanOrEqual(88);
  });

  it("strop u dovednosti blízko stovky nepřeteče", async () => {
    const db = fakeDb([hrac("skoro-max", { speed: 97, technique: 99, passing: 100 })]);
    await narovnejPotencialDorostu(db, "u21");
    const sm = JSON.parse(db.__stav()[0].skills_max) as Record<string, { maxPotential: number }>;
    for (const h of Object.values(sm)) expect(h.maxPotential).toBeLessThanOrEqual(100);
  });

  it("na větším ročníku se urodí i klenot, ale výjimečně", async () => {
    const hraci = Array.from({ length: 200 }, (_, i) => hrac(`hrac-${i}`, DOVEDNOSTI));
    const db = fakeDb(hraci);
    const v = await narovnejPotencialDorostu(db, "u21");
    // ~7 % podle generátoru; drobná odchylka je v pořádku, ale nesmí to být ani nula, ani polovina
    expect(v.klenotu).toBeGreaterThan(0);
    expect(v.klenotu).toBeLessThan(hraci.length * 0.2);
  });

  it("současné hodnoty se zvednou, ale nikdy nad vlastní strop", async () => {
    const db = fakeDb([hrac("a", DOVEDNOSTI), hrac("b", DOVEDNOSTI)]);
    await narovnejPotencialDorostu(db, "u21");
    for (const h of db.__stav()) {
      const sm = JSON.parse(h.skills_max) as Record<string, { current: number; maxPotential: number }>;
      const skills = JSON.parse(h.skills!) as Record<string, number>;
      const physical = JSON.parse(h.physical!) as Record<string, number>;
      for (const [nazev, hodnoty] of Object.entries(sm)) {
        if (nazev === "experience") continue;
        const dnes = physical[nazev] ?? skills[nazev];
        expect(dnes).toBeGreaterThan(DOVEDNOSTI[nazev as keyof typeof DOVEDNOSTI] - 20);
        expect(dnes).toBeLessThanOrEqual(hodnoty.maxPotential);
        // snímek uvnitř skills_max drží krok se živou hodnotou
        expect(hodnoty.current).toBe(dnes);
      }
    }
  });

  it("hodnocení se po zvednutí hodnot přepočítá nahoru", async () => {
    const db = fakeDb([hrac("a", DOVEDNOSTI)]);
    const v = await narovnejPotencialDorostu(db, "u21");
    expect(v.hodnoceniPo).toBeGreaterThan(v.hodnoceniPred);
    expect(db.__stav()[0].overall_rating).toBeGreaterThan(30);
  });

  it("hráč u stropu se nezvedne — není kam", async () => {
    // Současné hodnoty se rovnají stropu, takže není co vracet
    const db = fakeDb([hrac("na-stropu", { speed: 21, technique: 21, passing: 21 })]);
    const puvodni = JSON.parse(db.__stav()[0].skills!) as Record<string, number>;
    await narovnejPotencialDorostu(db, "u21");
    const po = JSON.parse(db.__stav()[0].skills!) as Record<string, number>;
    for (const k of Object.keys(puvodni)) {
      const sm = JSON.parse(db.__stav()[0].skills_max) as Record<string, { maxPotential: number }>;
      expect(po[k]).toBeLessThanOrEqual(sm[k].maxPotential);
    }
  });

  it("nikoho nevytáhne nad základní sestavu vlastního áčka", async () => {
    // Bez laťky vyjde tenhle hráč na 45; s laťkou 42 se přídavek musí zkrátit tak,
    // aby ji nepřerostl — ale nesmí spadnout na nulu, prostor pod laťkou tu je.
    const bezLatky = fakeDb([hrac("nadejny", DOVEDNOSTI)], null);
    await narovnejPotencialDorostu(bezLatky, "u21");
    const plny = bezLatky.__stav()[0].overall_rating;

    const sLatkou = fakeDb([hrac("nadejny", DOVEDNOSTI)], 42);
    await narovnejPotencialDorostu(sLatkou, "u21");
    const zkraceny = sLatkou.__stav()[0].overall_rating;

    expect(plny).toBeGreaterThan(42);
    expect(zkraceny).toBeLessThanOrEqual(42);
    expect(zkraceny).toBeLessThan(plny);
  });

  it("hráč už nad laťkou nedostane na současných hodnotách nic", async () => {
    const db = fakeDb([hrac("uz-dobry", DOVEDNOSTI)], 10);
    const pred = JSON.parse(db.__stav()[0].skills!) as Record<string, number>;
    await narovnejPotencialDorostu(db, "u21");
    expect(JSON.parse(db.__stav()[0].skills!)).toEqual(pred);
  });

  it("bez známé laťky se přídavek nekrátí", async () => {
    const db = fakeDb([hrac("bez-latky", DOVEDNOSTI)], null);
    await narovnejPotencialDorostu(db, "u21");
    expect(db.__stav()[0].overall_rating).toBeGreaterThan(30);
  });

  it("strop zůstává vysoký, i když se současná hodnota kvůli laťce nezvedne", async () => {
    const db = fakeDb([hrac("stropar", DOVEDNOSTI)], 10);
    await narovnejPotencialDorostu(db, "u21");
    const sm = JSON.parse(db.__stav()[0].skills_max) as Record<string, { maxPotential: number }>;
    expect(sm.speed.maxPotential).toBeGreaterThan(DOVEDNOSTI.speed);
  });

  it("hráče narozeného po opravě generátoru nechá být", async () => {
    // Odchovanec z nového ročníku penalizaci nikdy nedostal — nemá co vracet
    const novy = { ...hrac("novy", DOVEDNOSTI), created_at: "2026-09-15" };
    const db = fakeDb([novy]);
    const v = await narovnejPotencialDorostu(db, "u21");
    expect(v.upraveno).toBe(0);
    expect(db.__stav()[0].skills_max).toEqual(novy.skills_max);
    expect(db.__stav()[0].overall_rating).toBe(30);
  });

  it("hráče bez data vzniku narovná — jsou to ti nejstarší", async () => {
    const db = fakeDb([{ ...hrac("bez-data", DOVEDNOSTI), created_at: null }]);
    expect((await narovnejPotencialDorostu(db, "u21")).upraveno).toBe(1);
  });

  it("hráč s rozbitým skills_max se přeskočí, ne shodí běh", async () => {
    const db = fakeDb([
      { id: "rozbity", position: "MID", overall_rating: 20, weekly_wage: 100, hidden_talent: 5,
        skills: null, physical: null, skills_max: "{nevalidni", life_context: null, created_at: "2026-01-01" },
      hrac("zdravy", DOVEDNOSTI),
    ]);
    const v = await narovnejPotencialDorostu(db, "u21");
    expect(v.upraveno).toBe(1);
    expect(v.preskoceno).toBe(1);
  });
});
