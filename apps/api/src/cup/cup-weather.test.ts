import { describe, expect, it } from "vitest";
import { cupTieWeather, loadRoundMatches } from "./cup";

/**
 * Pohár si počasí nelosuje — bere počasí dne, stejné jako liga a stejné jako
 * předpověď u zápasu (`season-weather.ts`).
 *
 * Regrese z 2026-08-29: dotaz na zápasy kola nevybíral `scheduled_at`, ale
 * simulace ho o pár řádků níž četla. Vyšlo `undefined`, `resolveWeatherForDate`
 * vrátilo null a všech 11 pohárových zápasů dostalo fallback "cloudy" — den
 * přitom měl sníh. Předpověď ukazovala sníh, zápas se odehrál na suchu.
 * Typecheck to nechytil, protože `.catch()` degradoval řádky na `any`.
 */

type Radek = Record<string, unknown>;

/**
 * Minimální D1, které se chová jako to skutečné: **vrátí jen sloupce, které
 * SELECT opravdu jmenuje.** Právě na tomhle bug stál — dotaz sloupec nevybral,
 * kód ho četl a dostal undefined.
 */
function fakeDb(pravidla: Array<{ vzor: RegExp; radky: Radek[] }>): D1Database {
  const stmt = (sql: string) => {
    const vybrane = sql.slice(sql.search(/SELECT/i) + 6, sql.search(/\sFROM\s/i))
      .split(",")
      .map((s) => s.trim().split(/\s+AS\s+/i).pop()!.split(".").pop()!.trim());
    const hvezdicka = vybrane.includes("*");
    const projekce = (r: Radek) => hvezdicka ? r
      : Object.fromEntries(Object.entries(r).filter(([k]) => vybrane.includes(k)));
    const radky = () => (pravidla.find((p) => p.vzor.test(sql))?.radky ?? []).map(projekce);
    return {
      bind: () => stmt(sql),
      all: async () => ({ results: radky() }),
      first: async () => radky()[0] ?? null,
    };
  };
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

const HRANICE = { season_start: "2026-07-04T16:00:00.000Z", season_end: "2026-11-02T17:00:00.000Z" };
/** Půlka sezóny = zima. Tenhle den měl na produkci sníh, pohár dostal "cloudy". */
const DEN_ZAPASU = "2026-08-29T16:00:00.000Z";

const cupDb = (radky: Radek[]) => fakeDb([
  { vzor: /FROM cup_matches/, radky },
  { vzor: /FROM teams/, radky: [HRANICE] },
]);

describe("počasí pohárového kola", () => {
  it("zápasy kola nesou termín — bez něj se počasí dne nedá zjistit", async () => {
    const db = cupDb([{
      id: "m1", bracket_pos: 1, home_cup_team_id: "h", away_cup_team_id: "a", scheduled_at: DEN_ZAPASU,
    }]);
    const zapasy = await loadRoundMatches(db, "cup-1", 4, 48);
    expect(zapasy[0].scheduled_at).toBe(DEN_ZAPASU);
  });

  it("bere počasí dne, ne vlastní losování", async () => {
    const db = cupDb([]);
    expect(await cupTieWeather(db, DEN_ZAPASU, "m1")).toBe("snow");
  });

  it("celé kolo má jedno počasí — hraje se ve stejném okrese v jeden den", async () => {
    const db = cupDb([]);
    const kolo = await Promise.all(["m1", "m2", "m3"].map((id) => cupTieWeather(db, DEN_ZAPASU, id)));
    expect(new Set(kolo).size).toBe(1);
  });

  it("bez termínu spadne na zataženo a nespadne", async () => {
    const db = cupDb([]);
    expect(await cupTieWeather(db, null, "m1")).toBe("cloudy");
    expect(await cupTieWeather(db, undefined, "m1")).toBe("cloudy");
  });

  it("bez hranic sezóny taky spadne na zataženo", async () => {
    const db = fakeDb([]);
    expect(await cupTieWeather(db, DEN_ZAPASU, "m1")).toBe("cloudy");
  });
});
