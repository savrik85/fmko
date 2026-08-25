import { describe, expect, it } from "vitest";
import { pickEarlier, type HomeMatchRef } from "./next-home-match";

const liga = (d: string): HomeMatchRef => ({ id: "l", scheduledAt: d, opponent: "Liga", isCup: false });
const pohar = (d: string): HomeMatchRef => ({ id: "c", scheduledAt: d, opponent: "Pohár", isCup: true });

/**
 * Nejbližší domácí zápas se skládá ze dvou zdrojů — liga (`season_calendar`)
 * a pohár (`cup_matches`) žijí v oddělených tabulkách. Když se sloučí špatně,
 * bufet radí naskladnit na jiný zápas, než jaký se bude hrát.
 */
describe("výběr nejbližšího domácího zápasu", () => {
  it("bere dřívější z ligy a poháru", () => {
    expect(pickEarlier(liga("2026-09-14T16:00:00Z"), pohar("2026-09-12T16:00:00Z"))?.isCup).toBe(true);
    expect(pickEarlier(liga("2026-09-07T16:00:00Z"), pohar("2026-09-12T16:00:00Z"))?.isCup).toBe(false);
  });

  it("zvládne, když jeden ze zdrojů nic nemá", () => {
    expect(pickEarlier(liga("2026-09-07T16:00:00Z"), null)?.isCup).toBe(false);
    expect(pickEarlier(null, pohar("2026-09-12T16:00:00Z"))?.isCup).toBe(true);
    expect(pickEarlier(null, null)).toBeNull();
  });

  it("při shodném termínu dá přednost lize — tam se hraje o body", () => {
    const d = "2026-09-12T16:00:00Z";
    expect(pickEarlier(liga(d), pohar(d))?.isCup).toBe(false);
  });

  it("neplatné datum nesmí vyhrát nad platným", () => {
    expect(pickEarlier({ ...liga("nesmysl") }, pohar("2026-09-12T16:00:00Z"))?.isCup).toBe(true);
    expect(pickEarlier(liga("2026-09-12T16:00:00Z"), { ...pohar("") })?.isCup).toBe(false);
  });

  it("když jsou obě data neplatná, nevrací se nesmysl", () => {
    expect(pickEarlier({ ...liga("nesmysl") }, { ...pohar("") })).toBeNull();
  });
});
