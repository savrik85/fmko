import { describe, expect, it } from "vitest";
import { resolveWeatherForMatchKey } from "./season-weather";

/**
 * Počasí zápasu, ať leží kdekoli.
 *
 * `resolveRoundWeather` umí jen ligu — hledá termín v `season_calendar` podle
 * id. Jenže absence se generují i pro pohár (klíč je `cup_matches.id`) a pro
 * přátelák (klíč je `matches.id`), takže tam vracelo null a hráči se ve sněhu
 * neomlouvali: v lize déšť lidi doma udrží, v poháru pršet nemohlo.
 *
 * Počasí je vlastnost dne, takže stačí najít termín — v které tabulce zápas
 * bydlí, je věc účetnictví, ne meteorologie.
 */

type Radek = Record<string, unknown>;

function fakeDb(pravidla: Array<{ vzor: RegExp; radek: Radek | null }>): D1Database {
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    first: async () => pravidla.find((p) => p.vzor.test(sql))?.radek ?? null,
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

const HRANICE = { season_start: "2026-07-04T16:00:00.000Z", season_end: "2026-11-02T17:00:00.000Z" };
/** Půlka sezóny — zima. Tenhle den má sníh, takže se pozná od prázdné hodnoty. */
const DEN = "2026-08-29T16:00:00.000Z";

const db = (kde: "liga" | "pohar" | "pratelak" | "nikde") => fakeDb([
  { vzor: /FROM teams/, radek: HRANICE },
  { vzor: /FROM season_calendar WHERE id/, radek: kde === "liga" ? { scheduled_at: DEN } : null },
  { vzor: /FROM cup_matches WHERE id/, radek: kde === "pohar" ? { scheduled_at: DEN } : null },
  { vzor: /FROM matches WHERE id/, radek: kde === "pratelak" ? { created_at: DEN } : null },
]);

describe("počasí podle klíče zápasu", () => {
  it("ligové kolo — termín z kalendáře", async () => {
    expect((await resolveWeatherForMatchKey(db("liga"), "cal-1"))?.weather).toBe("snow");
  });

  it("pohárový zápas — termín z cup_matches", async () => {
    expect((await resolveWeatherForMatchKey(db("pohar"), "cup-1"))?.weather).toBe("snow");
  });

  it("přátelák — termín z matches", async () => {
    expect((await resolveWeatherForMatchKey(db("pratelak"), "fr-1"))?.weather).toBe("snow");
  });

  it("všechny tři cesty dávají témuž dni totéž počasí", async () => {
    const vsude = await Promise.all(
      (["liga", "pohar", "pratelak"] as const).map((kde) => resolveWeatherForMatchKey(db(kde), "x")),
    );
    expect(new Set(vsude.map((w) => w?.weather)).size).toBe(1);
  });

  it("neznámý klíč vrací null, ne vymyšlené počasí", async () => {
    expect(await resolveWeatherForMatchKey(db("nikde"), "neznamy")).toBeNull();
  });
});
