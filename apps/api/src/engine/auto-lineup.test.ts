import { describe, expect, it } from "vitest";
import { pickAutoEleven, type AutoLineupPlayer } from "./auto-lineup";

let counter = 0;
function squad(spec: Record<string, number[]>): AutoLineupPlayer[] {
  return Object.entries(spec).flatMap(([position, ratings]) =>
    ratings.map((rating) => ({ id: `${position}-${counter++}`, position, rating })));
}
const offPosition = (players: AutoLineupPlayer[], picks: { playerId: string; matchPosition: string }[]) =>
  picks.filter((p) => players.find((x) => x.id === p.playerId)!.position !== p.matchPosition);
const slots = (picks: { matchPosition: string }[]) =>
  picks.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.matchPosition]: (acc[p.matchPosition] ?? 0) + 1 }), {});

describe("automatická jedenáctka", () => {
  it("s úplným kádrem drží oblíbenou formaci a bere nejlepší hráče každé řady", () => {
    const players = squad({ GK: [40, 30], DEF: [50, 48, 46, 44, 20], MID: [55, 52, 50, 48, 22], FWD: [60, 58, 25] });
    const { formation, picks } = pickAutoEleven(players, "4-4-2");
    expect(formation).toBe("4-4-2");
    expect(slots(picks)).toEqual({ GK: 1, DEF: 4, MID: 4, FWD: 2 });
    expect(offPosition(players, picks)).toEqual([]);
    const ids = new Set(picks.map((p) => p.playerId));
    // Slabší hráči každé řady zůstanou na lavičce.
    expect(players.filter((p) => [20, 22, 25, 30].includes(p.rating)).some((p) => ids.has(p.id))).toBe(false);
  });

  it("kádr, který na 4-4-2 nemá záložníky, postaví do formace, kde všichni hrají na svém", () => {
    const players = squad({ GK: [40], DEF: [50, 48, 46, 44, 42], MID: [55, 52, 50], FWD: [60, 58] });
    const { formation, picks } = pickAutoEleven(players, "4-4-2");
    expect(formation).toBe("5-3-2");
    expect(picks).toHaveLength(11);
    expect(offPosition(players, picks)).toEqual([]);
  });

  it("náhradní brankář nejde do pole, dokud je po ruce kdokoli jiný", () => {
    const players = squad({ GK: [45, 44], DEF: [50, 48, 46, 44], MID: [55, 52, 50], FWD: [60, 58, 30] });
    const { picks } = pickAutoEleven(players, "4-4-2");
    const keepers = players.filter((p) => p.position === "GK").map((p) => p.id);
    expect(picks.filter((p) => keepers.includes(p.playerId))).toEqual([{ playerId: keepers[0], matchPosition: "GK" }]);
    expect(offPosition(players, picks)).toEqual([]);
  });

  it("když na řadu nikdo není, doplní ji ze sousední řady, ne přes celé hřiště", () => {
    // Žádný útočník: do útoku jde záložník, ne obránce ani brankář.
    const players = squad({ GK: [40, 39], DEF: [50, 48, 46, 44, 42, 41], MID: [55, 52, 50, 48, 47, 46], FWD: [] });
    const { picks } = pickAutoEleven(players, "4-4-2");
    const off = offPosition(players, picks);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((p) => p.matchPosition === "FWD" && players.find((x) => x.id === p.playerId)!.position === "MID")).toBe(true);
  });

  it("bez brankáře jde do brány obránce a jedenáctka je úplná", () => {
    const players = squad({ DEF: [50, 48, 46, 44, 42], MID: [55, 52, 50, 48], FWD: [60, 58] });
    const { picks } = pickAutoEleven(players, "4-4-2");
    expect(picks).toHaveLength(11);
    const keeper = picks.find((p) => p.matchPosition === "GK")!;
    expect(players.find((p) => p.id === keeper.playerId)!.position).toBe("DEF");
    expect(offPosition(players, picks)).toHaveLength(1);
  });

  it("s méně než 11 hráči postaví všechny, co má, a nikoho dvakrát", () => {
    const players = squad({ GK: [40], DEF: [50, 48], MID: [55, 52, 50], FWD: [60, 58] });
    const { picks } = pickAutoEleven(players, "4-4-2");
    expect(picks).toHaveLength(8);
    expect(new Set(picks.map((p) => p.playerId)).size).toBe(8);
    expect(offPosition(players, picks)).toEqual([]);
  });

  it("neznámá nebo chybějící oblíbená formace nevadí", () => {
    const players = squad({ GK: [40], DEF: [50, 48, 46, 44], MID: [55, 52, 50, 48], FWD: [60, 58] });
    expect(pickAutoEleven(players, "4-2-3-1").formation).toBe("4-4-2");
    expect(pickAutoEleven(players, null).picks).toHaveLength(11);
    expect(pickAutoEleven([], "4-4-2").picks).toEqual([]);
  });
});
