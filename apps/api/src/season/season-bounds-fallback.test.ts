import { describe, expect, it } from "vitest";
import { resolveWeatherForDate } from "./season-weather";

/**
 * Hranice sezóny plní jedině rollover (`season-rollover.ts`), takže čerstvě
 * naseedovaný svět má `teams.season_start/season_end` prázdné. Bez zálohy z
 * kalendáře by taková liga neměla počasí VŮBEC — ani v hlavičce, ani v
 * předpovědi u zápasu, ani v poptávce bufetu. Právě tohle se stalo na lokále
 * (2026-08-25): `currentWeather` vracelo null a hlavička počasí neukázala.
 */

type Radek = Record<string, unknown> | null;

/** Minimální D1: podle vzoru v SQL vrátí připravený řádek. */
function fakeDb(pravidla: Array<{ vzor: RegExp; radek: Radek }>): D1Database {
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    first: async () => pravidla.find((p) => p.vzor.test(sql))?.radek ?? null,
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

const KALENDAR = {
  prvni: "2026-08-31T16:00:00.000Z",
  posledni: "2026-12-18T17:00:00.000Z",
};

describe("hranice sezóny", () => {
  it("bere je z teams, když je rollover vyplnil", async () => {
    const db = fakeDb([
      { vzor: /FROM teams/, radek: { season_start: "2026-08-24T16:00:00.000Z", season_end: KALENDAR.posledni } },
    ]);
    const w = await resolveWeatherForDate(db, "2026-09-10T16:00:00.000Z");
    expect(w).not.toBeNull();
    expect(typeof w?.temperature).toBe("number");
  });

  it("spadne na kalendář, když teams hranice nemá", async () => {
    const db = fakeDb([
      { vzor: /FROM teams/, radek: null },
      { vzor: /FROM season_calendar/, radek: { prvni: KALENDAR.prvni, posledni: KALENDAR.posledni } },
    ]);
    const w = await resolveWeatherForDate(db, "2026-09-10T16:00:00.000Z");
    expect(w).not.toBeNull();
  });

  it("záloha drží stejný oblouk jako rollover — začátek i konec sezóny je léto, půlka zima", async () => {
    const db = fakeDb([
      { vzor: /FROM teams/, radek: null },
      { vzor: /FROM season_calendar/, radek: { prvni: KALENDAR.prvni, posledni: KALENDAR.posledni } },
    ]);
    // Start je týden před prvním kolem, stejně jako ho klade rollover.
    const zacatek = await resolveWeatherForDate(db, "2026-08-24T16:00:00.000Z");
    const pulka = await resolveWeatherForDate(db, "2026-10-21T16:00:00.000Z");
    const konec = await resolveWeatherForDate(db, "2026-12-18T17:00:00.000Z");
    expect(zacatek!.temperature).toBeGreaterThan(20);
    expect(pulka!.temperature).toBeLessThan(0);
    expect(konec!.temperature).toBeGreaterThan(20);
  });

  it("bez kalendáře i bez teams vrací null a nic nespadne", async () => {
    const db = fakeDb([]);
    expect(await resolveWeatherForDate(db, "2026-09-10T16:00:00.000Z")).toBeNull();
  });

  it("prázdný kalendář (MIN/MAX vrátí NULL) taky nespadne", async () => {
    const db = fakeDb([
      { vzor: /FROM teams/, radek: null },
      { vzor: /FROM season_calendar/, radek: { prvni: null, posledni: null } },
    ]);
    expect(await resolveWeatherForDate(db, "2026-09-10T16:00:00.000Z")).toBeNull();
  });
});
