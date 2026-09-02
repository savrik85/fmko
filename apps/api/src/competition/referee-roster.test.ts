/**
 * Pravidla obsazovací listiny a stopek.
 *
 * DB je zfejkovaná — testuje se rozhodovací logika, ne SQL. Zajímá nás hlavně to,
 * co komisaři projde a co ne, protože právě tam je hranice mezi „má pravomoc"
 * a „může si namířit sudího na soupeře".
 */

import { describe, it, expect } from "vitest";
import {
  MAX_PAUSES_PER_SEASON, MIN_USABLE_FOR_ROUND, PAUSE_WEEKS,
  canPauseReferee, saveNominations, usableForWeek, type OpenRound,
} from "./referee-roster";

/** Minimální D1, která spolkne DELETE i batch a nic si nepamatuje. */
function fakeDb(): D1Database {
  const stmt = {
    bind: () => stmt,
    run: async () => ({ meta: { changes: 1 } }),
    all: async () => ({ results: [] }),
    first: async () => null,
  };
  return {
    prepare: () => stmt,
    batch: async (s: unknown[]) => s.map(() => ({ meta: { changes: 1 } })),
  } as unknown as D1Database;
}

const ROUND: OpenRound = {
  calendarId: "cal-1", gameWeek: 5, seasonNumber: 3,
  scheduledAt: "2026-09-06T14:00:00Z", matches: 7,
};

const USABLE = new Set(Array.from({ length: 24 }, (_, i) => `ref-${i}`));

const ulozit = (refereeIds: string[], usable = USABLE) => saveNominations(fakeDb(), {
  leagueId: "liga-1", round: ROUND, refereeIds,
  teamId: "team-1", gameDate: "2026-09-04", usable,
});

describe("obsazovací listina kola", () => {
  it("projde výběr přesně na počet zápasů", async () => {
    const res = await ulozit(["ref-0", "ref-1", "ref-2", "ref-3", "ref-4", "ref-5", "ref-6"]);
    expect(res.ok).toBe(true);
    expect(res.saved).toBe(7);
  });

  it("odmítne míň rozhodčích, než je zápasů", async () => {
    const res = await ulozit(["ref-0", "ref-1", "ref-2"]);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("7 zápasů");
  });

  it("prázdný výběr listinu zruší a kolo se obsadí ze všech", async () => {
    // Tohle NENÍ chyba: komisař si to rozmyslel a vrací delegaci automatu.
    const res = await ulozit([]);
    expect(res.ok).toBe(true);
    expect(res.saved).toBe(0);
  });

  it("nepustí na listinu vyškrtnutého ani pozastaveného sudího", async () => {
    const usable = new Set(["ref-0", "ref-1", "ref-2", "ref-3", "ref-4", "ref-5", "ref-6"]);
    const res = await ulozit(
      ["ref-0", "ref-1", "ref-2", "ref-3", "ref-4", "ref-5", "ref-99"], usable,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("nepatří");
  });

  it("duplicitní jméno se počítá jednou", async () => {
    // Dvakrát nominovaný sudí by měl v losu dvojnásobnou šanci — a komisař by tím
    // obešel to, že párování nedělá on.
    const res = await ulozit([
      "ref-0", "ref-0", "ref-1", "ref-2", "ref-3", "ref-4", "ref-5", "ref-6",
    ]);
    expect(res.ok).toBe(true);
    expect(res.saved).toBe(7);
  });

  it("duplicity nesmí nahradit chybějící lidi", async () => {
    const res = await ulozit(["ref-0", "ref-0", "ref-0", "ref-1", "ref-2", "ref-3", "ref-4"]);
    expect(res.ok).toBe(false);
  });
});

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
