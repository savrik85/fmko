import { describe, expect, it } from "vitest";
import { roundWeatherContext, weatherPromptBlock } from "./weather-context";

/**
 * Zpravodaj o počasí dlouho nevěděl nic. Tenhle modul mu ho podává HOTOVÉ —
 * a hlídá, že si redaktor nevymyslí vlastní: musí sedět s tím, co hráč vidí
 * v předpovědi u zápasu.
 */

function fakeDb(pravidla: Array<{ vzor: RegExp; radek: Record<string, unknown> | null }>): D1Database {
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    first: async () => pravidla.find((p) => p.vzor.test(sql))?.radek ?? null,
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

const HRANICE = { season_start: "2026-08-24T16:00:00.000Z", season_end: "2026-12-18T17:00:00.000Z" };

function db(scheduledAt: string): D1Database {
  return fakeDb([
    { vzor: /FROM season_calendar WHERE id/, radek: { scheduled_at: scheduledAt } },
    { vzor: /FROM teams/, radek: HRANICE },
  ]);
}

describe("počasí kola pro zpravodaj", () => {
  it("vrátí popis i teplotu z jediného zdroje", async () => {
    const ctx = await roundWeatherContext(db("2026-10-21T16:00:00.000Z"), "kolo-1");
    expect(ctx).not.toBeNull();
    expect(ctx!.line).toMatch(/-?\d+ °C/);
    expect(ctx!.line.length).toBeGreaterThan(5);
  });

  it("liják a sníh stojí za zmínku, zataženo ne", async () => {
    // Den se hledá přes týž zdroj, který používá hra — natvrdo psané datum by se
    // rozešlo s obloukem sezóny, jakmile by se pohnuly váhy počasí.
    const { weatherForDay, winternessForDate } = await import("../season/season-weather");
    const den = (iso: string) => weatherForDay(iso, winternessForDate(iso, HRANICE.season_start, HRANICE.season_end)).weather;

    let zajimavy: string | null = null;
    let nudny: string | null = null;
    for (let d = 1; d <= 28 && (!zajimavy || !nudny); d++) {
      const iso = `2026-10-${String(d).padStart(2, "0")}T16:00:00.000Z`;
      const w = den(iso);
      if (!zajimavy && (w === "snow" || w === "rain")) zajimavy = iso;
      if (!nudny && (w === "cloudy" || w === "wind")) nudny = iso;
    }

    expect((await roundWeatherContext(db(zajimavy!), "a"))!.worthMentioning).toBe(true);
    expect((await roundWeatherContext(db(nudny!), "b"))!.worthMentioning).toBe(false);
  });

  it("bez termínu kola nevrací nic — do promptu se pak nepřidá řádek", async () => {
    const prazdna = fakeDb([{ vzor: /FROM season_calendar WHERE id/, radek: null }]);
    expect(await roundWeatherContext(prazdna, "neexistuje")).toBeNull();
  });

  it("blok do promptu vždycky zakazuje vymýšlet si jiné počasí", () => {
    const blok = weatherPromptBlock({ line: "Vytrvalý déšť, bahno, 12 °C", worthMentioning: true });
    expect(blok).toContain("NEVYMÝŠLEJ");
    expect(blok).toContain("Vytrvalý déšť");
    expect(blok).toContain("POČASÍ V KOLE");
  });

  it("v předpovědi je jiný nadpis než v ohlédnutí za kolem", () => {
    const predpoved = weatherPromptBlock({ line: "x, 3 °C", worthMentioning: false }, true);
    expect(predpoved).toContain("PŘEDPOVĚĎ NA KOLO");
  });

  it("bez počasí je blok prázdný a nerozbije prompt", () => {
    expect(weatherPromptBlock(null)).toBe("");
  });
});
