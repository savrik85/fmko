import { describe, it, expect } from "vitest";
import {
  marketReturns, bandCalibration, oddsBand, CALIBRATION_MIN_N, BAND_MIN_N, BAND_Z, type GradedOffer,
} from "./calibration";

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

  it("výsledek se sleduje i po výběrech, celek chybu na „1“ a „2“ vyruší", () => {
    // „1“ vrací 1,30 Kč, „2“ 0,60 Kč: trh jako celek je pod korunou a poplach nespustí.
    const home = offers(400, 300, 0.4325, { market: "1x2", selection: "1" });
    const away = offers(400, 300, 0.2, { market: "1x2", selection: "2" });
    const all = marketReturns([...home, ...away]);
    expect(trh(all, "výsledek").overpriced).toBe(false);
    expect(trh(all, "výsledek: domácí").overpriced).toBe(true);
    expect(trh(all, "výsledek: hosté").overpriced).toBe(false);
  });

  it("trh s jedinou skupinou se nepočítá dvakrát", () => {
    const all = marketReturns(offers(60, 180, 0.5, { market: "btts", selection: "btts_yes" }));
    expect(all.filter((m) => m.label === "oba dají gól: ano")).toHaveLength(1);
    expect(trh(all, "oba dají gól: ano").n).toBe(60);
  });
});

/** `n` tipů s kurzem `oddsX100`, z nichž vyšel podíl `wonShare`. */
function offers(n: number, oddsX100: number, wonShare: number, extra: Partial<GradedOffer> = {}): GradedOffer[] {
  const wins = Math.round(n * wonShare);
  return Array.from({ length: n }, (_, i) => ({
    leagueId: "l1", leagueName: "Přebor Prahy",
    market: "1x2", selection: "1", oddsX100,
    result: i < wins ? "won" as const : "lost" as const,
    ...extra,
  }));
}

const band = (rows: ReturnType<typeof bandCalibration>, label: string) => rows.find((b) => b.label === label)!;

describe("kalibrace po výběrech a kurzových pásmech", () => {
  it("kurz se řadí do pásma podle dolní hranice", () => {
    expect(oddsBand(105)).toBe("kurz do 1,5");
    expect(oddsBand(149)).toBe("kurz do 1,5");
    expect(oddsBand(150)).toBe("kurz 1,5 až 2");
    expect(oddsBand(299)).toBe("kurz 2 až 3");
    expect(oddsBand(300)).toBe("kurz 3 až 5");
    expect(oddsBand(500)).toBe("kurz 5 a víc");
    expect(oddsBand(1500)).toBe("kurz 5 a víc");
  });

  it("díru ze sezóny 3 pozná: domácí outsider s kurzem 5 a víc vyhrál 11 z 39", () => {
    // Model dával 9 %, čekal tedy 3,5 výhry. Návratnost 3,5 Kč za korunu.
    const rows = bandCalibration(offers(39, 1240, 11 / 39, { probability: 0.09 }));
    const b = band(rows, "výsledek: domácí · kurz 5 a víc");
    expect(b.n).toBe(39);
    expect(b.wins).toBe(11);
    expect(b.expectedWins).toBeCloseTo(3.51, 2);
    expect(b.z).toBeGreaterThan(4);
    expect(b.meanReturn).toBeCloseTo(3.5, 1);
    expect(b.miscalibrated).toBe(true);
    // Návratnost sama by to neřekla: 39 tipů je pod hranicí a rozptyl u kurzu 12 obrovský.
    expect(trh(marketReturns(offers(39, 1240, 11 / 39)), "výsledek: domácí").overpriced).toBe(false);
  });

  it("hlásí i přeceněného favorita: hosté s kurzem do 1,5 vyhráli 23 ze 45", () => {
    const rows = bandCalibration(offers(45, 135, 23 / 45, { selection: "2", probability: 0.79 }));
    const b = band(rows, "výsledek: hosté · kurz do 1,5");
    expect(b.z).toBeLessThan(-4);
    expect(b.miscalibrated).toBe(true);
  });

  it("pásmo, které sedí, nehlásí, ani když zrovna vydělává", () => {
    // 12 výher z 60 při čekaných 9: 1,1 chyby, návratnost nad korunou je náhoda.
    const b = band(bandCalibration(offers(60, 620, 0.2, { probability: 0.15 })), "výsledek: domácí · kurz 5 a víc");
    expect(b.meanReturn).toBeGreaterThan(1);
    expect(b.miscalibrated).toBe(false);
  });

  it("málo tipů se neposuzuje", () => {
    const b = band(bandCalibration(offers(BAND_MIN_N - 1, 1200, 0.5, { probability: 0.08 })), "výsledek: domácí · kurz 5 a víc");
    expect(b.z).toBeGreaterThan(BAND_Z);
    expect(b.miscalibrated).toBe(false);
  });

  it("stejný výběr v různých pásmech se nemíchá", () => {
    const rows = bandCalibration([
      ...offers(40, 130, 0.8, { probability: 0.8 }),
      ...offers(40, 700, 0.1, { probability: 0.1 }),
    ]);
    expect(band(rows, "výsledek: domácí · kurz do 1,5").n).toBe(40);
    expect(band(rows, "výsledek: domácí · kurz 5 a víc").n).toBe(40);
  });

  it("gólové linie a handicapy se po pásmech nehodnotí, na zápas jich je víc a nejsou nezávislé", () => {
    const rows = bandCalibration([
      ...offers(100, 800, 0.5, { market: "totals", selection: "over65", probability: 0.1 }),
      ...offers(100, 800, 0.5, { market: "handicap", selection: "home_m15", probability: 0.1 }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("anulovaný tip a tip bez uložené pravděpodobnosti se přeskočí", () => {
    const rows = bandCalibration([
      ...offers(40, 200, 0.5, { probability: 0.5 }),
      ...offers(10, 200, 0, { probability: 0.5, result: "void" }),
      ...offers(10, 200, 0.5),
    ]);
    expect(band(rows, "výsledek: domácí · kurz 2 až 3").n).toBe(40);
  });

  it("dvojtip a oba dají gól mají vlastní skupiny", () => {
    const rows = bandCalibration([
      ...offers(40, 160, 0.6, { market: "dchance", selection: "1X", probability: 0.6 }),
      ...offers(40, 160, 0.6, { market: "btts", selection: "btts_yes", probability: 0.6 }),
    ]);
    expect(band(rows, "dvojtip: domácí neprohrají · kurz 1,5 až 2").n).toBe(40);
    expect(band(rows, "oba dají gól: ano · kurz 1,5 až 2").n).toBe(40);
  });
});
