import { describe, it, expect } from "vitest";
import {
  BASE_HOME_GOALS, BASE_AWAY_GOALS, DISPERSION_C, MARGIN, MIN_ODDS_X100, MAX_ODDS_X100,
  expectedGoals, formAdjustment, goalDistribution, outcomeProbabilities, totalsProbabilities,
  scorerShares, availability, scorerProbability,
  applyMargin, toOddsX100, marketOdds, singleSideOdds, combineOddsX100, capPayout,
} from "./odds-model";

/**
 * Kalibrace je změřená na 747 odehraných ligových zápasech prales-db-test
 * (stav 2026-08). Dotaz na přeměření je v hlavičce odds-model.ts.
 *
 *   góly:      1,842 doma · 1,590 venku · 3,432 celkem · rozptyl 4,752
 *   výsledky:  321 / 160 / 266  =  42,97 % / 21,42 % / 35,61 %
 *   linie:     over 1,5 = 80,32 % · 2,5 = 61,45 % · 3,5 = 43,64 % · 4,5 = 27,98 %
 */
const NAMERENO = {
  doma: 1.842, venku: 1.590, celkem: 3.432,
  over15: 0.8032, over25: 0.6145, over35: 0.4364, over45: 0.2798,
  vyhraDoma: 0.4297, remiza: 0.2142, vyhraVenku: 0.3561,
} as const;

/** Vyrovnaný zápas — obě mužstva stejně silná, oba bez formy. */
const vyrovnany = expectedGoals({ strength: 30, form: 0 }, { strength: 30, form: 0 });

describe("očekávané góly", () => {
  it("při shodné síle vyjdou přesně základní hodnoty", () => {
    expect(vyrovnany.home).toBeCloseTo(BASE_HOME_GOALS, 10);
    expect(vyrovnany.away).toBeCloseTo(BASE_AWAY_GOALS, 10);
  });

  it("domácí výhoda je zabudovaná v rozdílu bází, ne ve zvláštním členu", () => {
    expect(vyrovnany.home).toBeGreaterThan(vyrovnany.away);
    expect(vyrovnany.home / vyrovnany.away).toBeCloseTo(1.157, 2);
  });

  it("silnější tým dá víc a dostane míň", () => {
    const l = expectedGoals({ strength: 36, form: 0 }, { strength: 30, form: 0 });
    expect(l.home).toBeGreaterThan(vyrovnany.home);
    expect(l.away).toBeLessThan(vyrovnany.away);
  });

  it("prohození sil zrcadlí λ přes domácí výhodu", () => {
    const a = expectedGoals({ strength: 34, form: 0 }, { strength: 28, form: 0 });
    const b = expectedGoals({ strength: 28, form: 0 }, { strength: 34, form: 0 });
    // Silnější tým dostane tentýž násobek své báze, ať hraje doma nebo venku.
    expect(a.home / BASE_HOME_GOALS).toBeCloseTo(b.away / BASE_AWAY_GOALS, 10);
    expect(a.away / BASE_AWAY_GOALS).toBeCloseTo(b.home / BASE_HOME_GOALS, 10);
  });

  it("rozdíl sil je zastropovaný, extrém nevyrobí nesmyslná λ", () => {
    const l = expectedGoals({ strength: 90, form: 0 }, { strength: 10, form: 0 });
    expect(l.home).toBeLessThan(4.0);
    expect(l.away).toBeGreaterThan(0.7);
  });

  it("forma hýbe kurzem míň než rozdíl kádrů", () => {
    expect(formAdjustment(3.0)).toBeCloseTo(1.8, 10);   // samé výhry, strop
    expect(formAdjustment(0)).toBeCloseTo(-1.8, 10);    // samé prohry, podlaha
    expect(formAdjustment(1.5)).toBeCloseTo(0, 10);     // průměr, bez korekce
  });
});

describe("rozdělení gólů", () => {
  it("je to rozdělení pravděpodobnosti — sečte na 1", () => {
    for (const mu of [0.3, 1.0, 1.84, 3.43, 6.0]) {
      const sum = goalDistribution(mu).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("střední hodnota sedí na zadané λ", () => {
    const dist = goalDistribution(2.5);
    const mean = dist.reduce((acc, p, k) => acc + p * k, 0);
    expect(mean).toBeCloseTo(2.5, 1);
  });

  it("je přerozptýlené — rozptyl je znatelně vyšší než průměr", () => {
    const mu = NAMERENO.celkem;
    const dist = goalDistribution(mu);
    const mean = dist.reduce((acc, p, k) => acc + p * k, 0);
    const varr = dist.reduce((acc, p, k) => acc + p * (k - mean) ** 2, 0);
    // Naměřeno 4,752 / 3,432 = 1,384. Poisson by dal přesně 1,0.
    expect(varr / mean).toBeGreaterThan(1.25);
    expect(varr / mean).toBeCloseTo(1 + mu / (DISPERSION_C * mu), 1);
  });

  it("výsledky sečtou na 1", () => {
    const o = outcomeProbabilities(vyrovnany);
    expect(o.home + o.draw + o.away).toBeCloseTo(1, 10);
  });

  it("obě strany trhu na počet gólů sečtou na 1", () => {
    for (const line of [1.5, 2.5, 3.5, 6.5]) {
      const t = totalsProbabilities(vyrovnany, line);
      expect(t.over + t.under).toBeCloseTo(1, 10);
    }
  });

  it("vyšší linie je vždy méně pravděpodobná", () => {
    const p = [1.5, 2.5, 3.5, 4.5, 6.5].map((l) => totalsProbabilities(vyrovnany, l).over);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeLessThan(p[i - 1]);
  });
});

/**
 * Tohle je nejdůležitější blok celého souboru. Drží model u naměřených dat.
 * Když spadne, engine se změnil a konstanty se musí přefitovat — jinak se
 * marže kanceláře tiše rozplyne a sázení začne být pro hráče výdělečné.
 */
describe("KALIBRACE na odehraných zápasech", () => {
  it("vyrovnaný zápas dá naměřený poměr výsledků", () => {
    const o = outcomeProbabilities(vyrovnany);
    expect(o.home).toBeCloseTo(NAMERENO.vyhraDoma, 1);
    expect(o.draw).toBeCloseTo(NAMERENO.remiza, 1);
    expect(o.away).toBeCloseTo(NAMERENO.vyhraVenku, 1);
  });

  it("linie na počet gólů sedí na naměřené četnosti do dvou procentních bodů", () => {
    const l = { home: NAMERENO.doma, away: NAMERENO.venku };
    const odchylka = (line: number, namereno: number) =>
      Math.abs(totalsProbabilities(l, line).over - namereno);

    // Dva procentní body jsou čtvrtina marže — pod touhle hranicí nemá sázející
    // z nepřesnosti modelu co vytěžit. Poisson je na linii 2,5 vedle o pět bodů.
    expect(odchylka(1.5, NAMERENO.over15)).toBeLessThan(0.02);
    expect(odchylka(2.5, NAMERENO.over25)).toBeLessThan(0.02);
    expect(odchylka(3.5, NAMERENO.over35)).toBeLessThan(0.02);
    expect(odchylka(4.5, NAMERENO.over45)).toBeLessThan(0.02);
  });

  it("Poissonova varianta by na téže linii selhala — proto negativní binomické", () => {
    // P(k) = e^−λ · λ^k / k!  pro λ = 3,432
    const lambda = NAMERENO.celkem;
    let poissonUnder = 0;
    let term = Math.exp(-lambda);
    for (let k = 0; k < 3; k++) {
      poissonUnder += term;
      term = (term * lambda) / (k + 1);
    }
    const poissonOver25 = 1 - poissonUnder;

    // Poisson tvrdí ~66,6 %, skutečnost je 61,45 % — přestřel o víc než 5 bodů,
    // tedy víc, než je celá marže kanceláře (8 %). Kdo by pořád sázel „míň",
    // měl by proti takovým kurzům trvalou výhodu.
    expect(Math.abs(poissonOver25 - NAMERENO.over25)).toBeGreaterThan(0.04);

    // Náš model se strefí do dvou setin.
    const nas = totalsProbabilities({ home: NAMERENO.doma, away: NAMERENO.venku }, 2.5).over;
    expect(Math.abs(nas - NAMERENO.over25)).toBeLessThan(0.02);
  });

  it("trh na výsledek a trh na počet gólů si neprotiřečí", () => {
    // Součet gólů z konvoluce dvou týmů musí dát totéž co jedno rozdělení
    // se sečtenou λ. Drží to volba r = C·λ, díky které je p konstantní.
    const l = { home: 2.1, away: 1.3 };
    const dh = goalDistribution(l.home);
    const da = goalDistribution(l.away);
    let konvoluceUnder25 = 0;
    for (let h = 0; h < dh.length; h++) {
      for (let a = 0; a < da.length; a++) {
        if (h + a < 2.5) konvoluceUnder25 += dh[h] * da[a];
      }
    }
    expect(konvoluceUnder25).toBeCloseTo(totalsProbabilities(l, 2.5).under, 2);
  });
});

describe("střelci", () => {
  const kadr = [
    { playerId: "utocnik", position: "FWD", goals: 0, rating: 30 },
    { playerId: "zaloznik", position: "MID", goals: 0, rating: 30 },
    { playerId: "obrance", position: "DEF", goals: 0, rating: 30 },
    { playerId: "brankar", position: "GK", goals: 0, rating: 30 },
  ];

  it("podíly sečtou na 1", () => {
    const s = scorerShares(kadr, 0);
    const sum = [...s.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("bez odehraných gólů rozhoduje pozice", () => {
    const s = scorerShares(kadr, 0);
    expect(s.get("utocnik")!).toBeGreaterThan(s.get("zaloznik")!);
    expect(s.get("zaloznik")!).toBeGreaterThan(s.get("obrance")!);
    expect(s.get("brankar")!).toBe(0);
  });

  it("skutečné góly nakonec přebijí pozici", () => {
    const stridnik = [
      { playerId: "utocnik", position: "FWD", goals: 1, rating: 30 },
      { playerId: "obrance", position: "DEF", goals: 14, rating: 30 },
    ];
    const s = scorerShares(stridnik, 15);
    expect(s.get("obrance")!).toBeGreaterThan(s.get("utocnik")!);
  });

  it("lepší hráč má vyšší podíl i bez odehraných gólů", () => {
    // Tohle odhalil až běh proti reálným datům: v prvním kole nikdo nemá góly,
    // takže bez vlivu ratingu měli všichni útočníci téhož týmu stejný kurz.
    const dva = [
      { playerId: "hvezda", position: "FWD", goals: 0, rating: 45 },
      { playerId: "benjaminek", position: "FWD", goals: 0, rating: 25 },
    ];
    const s = scorerShares(dva, 0);
    expect(s.get("hvezda")!).toBeGreaterThan(s.get("benjaminek")! * 1.5);
  });

  it("silný záložník ale nepřeskočí slabšího útočníka — post váží víc", () => {
    const dva = [
      { playerId: "utocnik", position: "FWD", goals: 0, rating: 28 },
      { playerId: "zaloznik", position: "MID", goals: 0, rating: 42 },
    ];
    const s = scorerShares(dva, 0);
    expect(s.get("utocnik")!).toBeGreaterThan(s.get("zaloznik")!);
  });

  it("dostupnost má podlahu i strop", () => {
    expect(availability(0, 10)).toBeCloseTo(0.35, 10);  // nehrál vůbec
    expect(availability(10, 10)).toBeCloseTo(0.92, 2);  // hrál všechno
    expect(availability(30, 30)).toBeLessThanOrEqual(0.95);
    expect(availability(0, 0)).toBe(0.6);               // začátek sezóny
  });

  it("pravděpodobnost gólu roste s podílem i se sílou týmu", () => {
    const a = scorerProbability(1.84, 0.25, 0.9);
    const b = scorerProbability(1.84, 0.10, 0.9);
    const c = scorerProbability(3.00, 0.25, 0.9);
    expect(a).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });
});

describe("marže a kurzy", () => {
  it("namaržovaný trh sečte přesně na overround", () => {
    const o = outcomeProbabilities(vyrovnany);
    const sum = applyMargin([o.home, o.draw, o.away]).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1 + MARGIN, 10);
  });

  it("kurzy trhu drží overround mezi 1,08 a 1,10", () => {
    // Zaokrouhlení dolů smí marži jen zvýšit, nikdy snížit.
    for (const sily of [[30, 30], [36, 26], [26, 36], [40, 22]]) {
      const l = expectedGoals({ strength: sily[0], form: 0 }, { strength: sily[1], form: 0 });
      const o = outcomeProbabilities(l);
      const over = marketOdds([o.home, o.draw, o.away])
        .reduce((acc, k) => acc + 100 / k, 0);
      expect(over).toBeGreaterThanOrEqual(1 + MARGIN - 1e-9);
      expect(over).toBeLessThan(1.10);
    }
  });

  it("silnější domácí znamená nižší kurz na 1 a vyšší na 2", () => {
    const kurzy = (rozdil: number) => {
      const l = expectedGoals({ strength: 30 + rozdil, form: 0 }, { strength: 30, form: 0 });
      const o = outcomeProbabilities(l);
      const [k1, , k2] = marketOdds([o.home, o.draw, o.away]);
      return { k1, k2 };
    };
    const slabsi = kurzy(-6), vyrovnane = kurzy(0), silnejsi = kurzy(6);
    expect(silnejsi.k1).toBeLessThan(vyrovnane.k1);
    expect(vyrovnane.k1).toBeLessThan(slabsi.k1);
    expect(silnejsi.k2).toBeGreaterThan(vyrovnane.k2);
  });

  it("kurz nikdy nevypadne z povoleného rozsahu", () => {
    expect(toOddsX100(0.999)).toBeGreaterThanOrEqual(MIN_ODDS_X100);
    expect(toOddsX100(0.0000001)).toBe(MAX_ODDS_X100);
    expect(toOddsX100(0)).toBe(MAX_ODDS_X100);
    const l = expectedGoals({ strength: 90, form: 0 }, { strength: 10, form: 0 });
    const o = outcomeProbabilities(l);
    for (const k of marketOdds([o.home, o.draw, o.away])) {
      expect(k).toBeGreaterThanOrEqual(MIN_ODDS_X100);
      expect(k).toBeLessThanOrEqual(MAX_ODDS_X100);
    }
  });

  it("beznadějný tip má strop kurzu, ne kurz v tisících", () => {
    // Bez podlahy PROB_FLOOR by tip s pravděpodobností 1 % dal kurz 100,00
    // a jediná chyba v modelu by stála kancelář celou sezónu. Podlaha ho stlačí
    // k dvacetinásobku a MAX_ODDS_X100 je poslední pojistka.
    const [k1, , k2] = marketOdds([0.97, 0.02, 0.01]);
    expect(k2).toBe(MAX_ODDS_X100);
    expect(k1).toBeGreaterThanOrEqual(MIN_ODDS_X100);
    expect(k1).toBeLessThan(115);
  });

  it("jednostranný trh na střelce nese stejnou marži jako trojcestný", () => {
    const k = singleSideOdds(0.4);
    // férový kurz 2,50 → s marží 8 % zhruba 2,31
    expect(k).toBeGreaterThan(200);
    expect(k).toBeLessThan(240);
  });

  it("kurz se zaokrouhluje dolů, aby marže neodtékala", () => {
    // 100/0,44 = 227,27 → 227, ne 228
    expect(toOddsX100(0.44)).toBe(227);
  });

  it("akumulátor násobí kurzy", () => {
    expect(combineOddsX100([135, 139])).toBe(187);        // 1,35 × 1,39 = 1,8765
    expect(combineOddsX100([135, 139, 254])).toBe(476);   // × 2,54 = 4,766
    expect(combineOddsX100([])).toBe(100);
    expect(combineOddsX100([200])).toBe(200);
  });

  it("strop výhry seřízne velké tikety a označí je", () => {
    expect(capPayout(1000, 476, 100_000)).toEqual({ payout: 4760, capped: false });
    expect(capPayout(5000, 2500, 100_000)).toEqual({ payout: 100_000, capped: true });
    // Při maximálním vkladu 5 000 Kč se strop 100 000 zapíná od kurzu 20,00
    expect(capPayout(5000, 2000, 100_000).capped).toBe(false);
    expect(capPayout(5000, 2001, 100_000).capped).toBe(true);
  });
});
