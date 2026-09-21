import { describe, it, expect } from "vitest";
import { marketReturns, CALIBRATION_MIN_N, type GradedOffer } from "./calibration";

/** `n` tipů s kurzem `kurz`, z nichž vyšel podíl `vyslo`. */
function tipy(n: number, kurz: number, vyslo: number, extra: Partial<GradedOffer> = {}): GradedOffer[] {
  const vyher = Math.round(n * vyslo);
  return Array.from({ length: n }, (_, i) => ({
    leagueId: "l1", leagueName: "Okresní přebor Prachatice",
    market: "totals", selection: "over65", oddsX100: kurz,
    result: i < vyher ? "won" as const : "lost" as const,
    ...extra,
  }));
}

const trh = (vysledky: ReturnType<typeof marketReturns>, label: string) =>
  vysledky.find((m) => m.label === label)!;

describe("hlídání kurzů", () => {
  it("zářijovou díru na vysoké gólové linii pozná", () => {
    // Produkce: „víc než 6,5 gólu" s kurzy kolem 8 vycházelo ve 24 % zápasů.
    const m = trh(marketReturns(tipy(175, 800, 0.24)), "víc gólů");
    expect(m.meanReturn).toBeCloseTo(1.92, 2);
    expect(m.overpriced).toBe(true);
  });

  it("správně nacenený trh s marží nehlásí", () => {
    // Kurz 1,85 na tip, který vychází v 50 % případů: návratnost 0,925.
    const m = trh(marketReturns(tipy(400, 185, 0.5, { market: "1x2", selection: "1" })), "výsledek");
    expect(m.meanReturn).toBeLessThan(1);
    expect(m.overpriced).toBe(false);
  });

  it("šťastná trefa vysokého kurzu na pár tipech poplach nespustí", () => {
    // Jeden tip s kurzem 12 z deseti: návratnost 1,2, ale je to náhoda.
    const m = trh(marketReturns(tipy(10, 1200, 0.1)), "víc gólů");
    expect(m.meanReturn).toBeGreaterThan(1);
    expect(m.overpriced).toBe(false);
  });

  it("málo tipů se neposuzuje, ani když vypadají jednoznačně", () => {
    const m = trh(marketReturns(tipy(CALIBRATION_MIN_N - 1, 300, 0.9)), "víc gólů");
    expect(m.overpriced).toBe(false);
  });

  it("anulovaný střelec se do návratnosti nepočítá", () => {
    const nenastoupil = tipy(100, 300, 0, { market: "scorer", selection: "hrac", result: "void" });
    const hral = tipy(100, 300, 0.3, { market: "scorer", selection: "hrac" });
    const m = trh(marketReturns([...nenastoupil, ...hral]), "střelec");
    expect(m.n).toBe(100);
    expect(m.meanReturn).toBeCloseTo(0.9, 10);
  });

  it("díru v jedné soutěži ukáže i zvlášť, celkový průměr ji nerozředí", () => {
    const prachatice = tipy(200, 800, 0.24);
    const budejovice = tipy(600, 800, 0.09, { leagueId: "l2", leagueName: "Okresní přebor České Budějovice" });
    const vysledky = marketReturns([...prachatice, ...budejovice]);
    expect(trh(vysledky, "víc gólů · Okresní přebor Prachatice").overpriced).toBe(true);
    expect(trh(vysledky, "víc gólů · Okresní přebor České Budějovice").overpriced).toBe(false);
  });

  it("obě strany gólové linie se sledují zvlášť", () => {
    const vysledky = marketReturns([
      ...tipy(100, 150, 0.5),
      ...tipy(100, 150, 0.5, { selection: "under25" }),
    ]);
    expect(trh(vysledky, "víc gólů").n).toBe(100);
    expect(trh(vysledky, "míň gólů").n).toBe(100);
  });
});
