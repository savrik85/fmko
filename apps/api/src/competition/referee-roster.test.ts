/**
 * Meze zásahů komisaře do delegace.
 *
 * DB je zfejkovaná — testuje se rozhodovací logika, ne SQL. Zajímá nás hlavně to,
 * co komisaři projde a co ne: výměna sudího je pravomoc se zjevným střetem zájmů
 * a drží ji jen tyhle brzdy.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_PAUSES_PER_SEASON, MAX_SWAPS_PER_ROUND, MIN_USABLE_FOR_ROUND, PAUSE_WEEKS,
  canPauseReferee, freeForRound, usableForWeek, type OpenRound,
} from "./referee-roster";

describe("meze stopky", () => {
  it("stopka běží tři kola včetně toho, od kterého se dává", () => {
    expect(PAUSE_WEEKS).toBe(3);
    const fromWeek = 5;
    expect(fromWeek + PAUSE_WEEKS - 1).toBe(7);
  });

  it("na kolo zbyde vždycky víc sudích, než je v okrese zápasů", () => {
    // 7 seniorských + 7 U21 ve stejný den. Minimum musí být nad tím, jinak by
    // jeden sudí pískal dvakrát denně.
    expect(MIN_USABLE_FOR_ROUND).toBeGreaterThan(14);
  });

  it("stopek je za sezónu konečný počet", () => {
    expect(MAX_PAUSES_PER_SEASON).toBeGreaterThan(0);
    expect(MAX_PAUSES_PER_SEASON).toBeLessThan(10);
  });
});

/**
 * D1, která odpovídá podle toho, na co se ptá. Stačí to na `usableForWeek`
 * i `canPauseReferee` — obojí jen sečte pool a odečte bany a stopky.
 */
function poolDb({ pool, bans = [], pauses = [] }: {
  pool: number; bans?: string[]; pauses?: string[];
}): D1Database {
  return {
    prepare: (sql: string) => {
      const stmt = {
        bind: () => stmt,
        first: async () => (sql.includes("FROM referees") ? { n: pool } : null),
        all: async () => {
          if (sql.includes("competition_referee_bans")) {
            return { results: bans.map((id) => ({ referee_id: id })) };
          }
          if (sql.includes("competition_referee_suspensions")) {
            return { results: pauses.map((id) => ({ referee_id: id })) };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1 } }),
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const check = (opts: Parameters<typeof poolDb>[0], refereeId?: string) =>
  canPauseReferee(poolDb(opts), "liga-1", 3, "Prachatice", 5, refereeId);

describe("brzda stopek", () => {
  it("na plné listině stopka projde", async () => {
    const r = await check({ pool: 24 });
    expect(r.ok).toBe(true);
    expect(r.usable).toBe(24);
  });

  it("vyškrtnutí i stopky se odečítají z téhož poolu", async () => {
    const n = await usableForWeek(
      poolDb({ pool: 24, bans: ["a", "b"], pauses: ["c"] }), "liga-1", 3, "Prachatice", 5,
    );
    expect(n).toBe(21);
  });

  it("sudí vyškrtnutý i pozastavený se počítá jednou", async () => {
    // Bez toho by dvojitý zápis ukrojil z listiny dva lidi místo jednoho
    // a brzda by komisaři sedla dřív, než má.
    const n = await usableForWeek(
      poolDb({ pool: 24, bans: ["a"], pauses: ["a"] }), "liga-1", 3, "Prachatice", 5,
    );
    expect(n).toBe(23);
  });

  it("nepustí stopku, když by listina spadla pod minimum", async () => {
    // 24 minus 9 vyškrtnutých = 15, tedy přesně minimum. Šestnáctý by ho prorazil.
    const r = await check({ pool: 24, bans: Array.from({ length: 9 }, (_, i) => `b${i}`) });
    expect(r.usable).toBe(MIN_USABLE_FOR_ROUND);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(String(MIN_USABLE_FOR_ROUND));
  });

  it("těsně nad minimem ještě projde", async () => {
    const r = await check({ pool: 24, bans: Array.from({ length: 8 }, (_, i) => `b${i}`) });
    expect(r.ok).toBe(true);
  });

  it("nedovolí druhou souběžnou stopku témuž sudímu", async () => {
    // Jinak by si komisař tu první zadarmo prodlužoval.
    const r = await check({ pool: 24, pauses: ["ref-7"] }, "ref-7");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("už stopku má");
  });

  it("jinému sudímu stopka projde, i když někdo pozastavený je", async () => {
    const r = await check({ pool: 24, pauses: ["ref-7"] }, "ref-8");
    expect(r.ok).toBe(true);
  });

  it("prázdný okres brzdu nepodleze do záporu", async () => {
    const r = await check({ pool: 0 });
    expect(r.usable).toBe(0);
    expect(r.ok).toBe(false);
  });
});

/**
 * D1 pro `freeForRound` — vrací pool, obsazené sudí toho dne, bany a stopky.
 * Pořadí dotazů je dané implementací, rozlišuje se podle SQL.
 */
function volniDb({ pool, tenDen = [], bans = [], pauses = [] }: {
  pool: string[]; tenDen?: string[]; bans?: string[]; pauses?: string[];
}): D1Database {
  return {
    prepare: (sql: string) => {
      const stmt = {
        bind: () => stmt,
        first: async () => null,
        all: async () => {
          if (sql.includes("FROM referees")) return { results: pool.map((id) => ({ id })) };
          if (sql.includes("FROM matches")) return { results: tenDen.map((rid) => ({ rid })) };
          if (sql.includes("competition_referee_bans")) {
            return { results: bans.map((id) => ({ referee_id: id })) };
          }
          if (sql.includes("competition_referee_suspensions")) {
            return { results: pauses.map((id) => ({ referee_id: id })) };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1 } }),
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const ROUND: OpenRound = {
  calendarId: "cal-1", gameWeek: 6, seasonNumber: 3,
  scheduledAt: "2026-09-06T14:00:00Z", matches: 7,
};

const volni = (o: Parameters<typeof volniDb>[0]) =>
  freeForRound(volniDb(o), "liga-1", 3, "Prachatice", ROUND);

describe("kdo smí nastoupit místo vyměněného", () => {
  const POOL = ["a", "b", "c", "d"];

  it("volný je ten, kdo ten den nikde nepíská", async () => {
    const v = await volni({ pool: POOL, tenDen: ["a", "b"] });
    expect([...v].sort()).toEqual(["c", "d"]);
  });

  it("kdo už má ten den zápas, náhradník být nemůže", async () => {
    // Jinak by po výměně pískal dvakrát denně — trest pro kluby, ne pro něj.
    const v = await volni({ pool: POOL, tenDen: ["c"] });
    expect(v.has("c")).toBe(false);
  });

  it("vyškrtnutý ani pozastavený se nenabídne", async () => {
    const v = await volni({ pool: POOL, bans: ["a"], pauses: ["b"] });
    expect(v.has("a")).toBe(false);
    expect(v.has("b")).toBe(false);
    expect([...v].sort()).toEqual(["c", "d"]);
  });

  it("když jsou všichni obsazení, není z čeho brát", async () => {
    const v = await volni({ pool: POOL, tenDen: POOL });
    expect(v.size).toBe(0);
  });
});

describe("strop výměn v kole", () => {
  it("v kole jde vyměnit jen část zápasů, ne všechny", () => {
    // Kdo přeobsadí všech sedm, neupravuje los — losuje sám.
    expect(MAX_SWAPS_PER_ROUND).toBeGreaterThan(0);
    expect(MAX_SWAPS_PER_ROUND).toBeLessThan(ROUND.matches);
  });
});
