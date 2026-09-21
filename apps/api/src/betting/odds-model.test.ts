import { describe, it, expect } from "vitest";
import {
  BASE_HOME_GOALS, BASE_AWAY_GOALS, DISPERSION_C, MARGIN, MIN_ODDS_X100, MAX_ODDS_X100,
  expectedGoals, formAdjustment, goalDistribution, outcomeProbabilities, totalsProbabilities,
  doubleChanceProbabilities,
  goalLevel, LEVEL_MIN, LEVEL_MAX, LEVEL_HALF_LIFE_ROUNDS,
  scorerShares, availability, scorerProbability, MAX_SHARE, type ScorerInput,
  applyMargin, toOddsX100, marketOdds, singleSideOdds, combineOddsX100, capPayout,
} from "./odds-model";

/**
 * Referenční data: 747 odehraných ligových zápasů prales-db-test (stav 2026-08).
 * Na nich je nafitovaný TVAR modelu a odpovídají úrovni gólů 1.
 * Dotaz na přeměření je v hlavičce odds-model.ts.
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

/**
 * Produkce: 175 zápasů s vypsanými kurzy, 23. 8. až 21. 9. 2026, tři soutěže.
 * Úplně jiná úroveň gólů než referenční data, proto se na ní ověřuje, že tvar
 * modelu drží i tam. Remízy za sezónu od června po soutěžích.
 *
 *   góly:      2,651 doma · 2,229 venku · 4,88 celkem
 *   linie:     over 2,5 = 81,14 % · 3,5 = 63,43 % · 6,5 = 24,00 %
 *   remízy:    Budějovice 3,21 gólu → 25,0 % · Prachatice 5,13 gólu → 13,8 %
 */
const PRODUKCE = {
  doma: 2.651, venku: 2.229, celkem: 4.88,
  over25: 0.8114, over35: 0.6343, over65: 0.24,
  budejovice: { goly: 3.21, remizy: 0.25 },
  prachatice: { goly: 5.13, remizy: 0.138 },
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
    expect(vyrovnany.home / vyrovnany.away).toBeCloseTo(1.177, 2);
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
    // Strop drží λ v mezích, které engine vůbec umí vyrobit — nejvyšší
    // naměřený průměr při rozdílu +12 byl 3,13 gólu.
    expect(l.home).toBeLessThan(5.0);
    expect(l.away).toBeGreaterThan(0.5);
  });

  it("model odpovídá naměřenému poměru gólů podle síly sestavy", () => {
    // Naměřeno na odehraných zápasech (rozdíl top-11 síly → log poměru gólů):
    //   +3 → +0,543 · +6 → +0,945
    // Model má být na horní hraně: favorita spíš přecenit než podcenit, protože
    // podcenění je jediná chyba, ze které dokáže sázející systematicky těžit.
    const pomer = (rozdil: number) => {
      const l = expectedGoals({ strength: 30 + rozdil, form: 0 }, { strength: 30, form: 0 });
      return Math.log(l.home / l.away) - Math.log(BASE_HOME_GOALS / BASE_AWAY_GOALS);
    };
    expect(pomer(3)).toBeGreaterThan(0.45);
    expect(pomer(3)).toBeLessThan(0.70);
    expect(pomer(6)).toBeGreaterThan(0.90);
    expect(pomer(6)).toBeLessThan(1.30);
  });

  it("široký kádr nesmí dělat z týmu outsidera", () => {
    // Vlachovo Březí (31 hráčů) vs Čkyně (21) na produkci: podle celého kádru
    // 40,3 vs 45,9 (Březí outsider), podle sestavy 51,4 vs 50,9 (Březí mírně
    // lepší). Tabulka dávala za pravdu sestavě — 18 bodů proti 11.
    const podleSestavy = expectedGoals({ strength: 51.36, form: 0 }, { strength: 50.91, form: 0 });
    const o = outcomeProbabilities(podleSestavy);
    expect(o.home).toBeGreaterThan(o.away);   // domácí favorit, jak má být

    const podleKadru = expectedGoals({ strength: 40.32, form: 0 }, { strength: 45.86, form: 0 });
    const spatne = outcomeProbabilities(podleKadru);
    expect(spatne.away).toBeGreaterThan(spatne.home);  // tohle dělal starý model
  });

  it("forma hýbe kurzem míň než rozdíl kádrů", () => {
    expect(formAdjustment(3.0)).toBeCloseTo(1.8, 10);   // samé výhry, strop
    expect(formAdjustment(0)).toBeCloseTo(-1.8, 10);    // samé prohry, podlaha
    expect(formAdjustment(1.5)).toBeCloseTo(0, 10);     // průměr, bez korekce
  });
});

describe("úroveň gólů soutěže", () => {
  it("bez odehraných zápasů je úroveň referenční", () => {
    expect(goalLevel([])).toBe(1);
  });

  it("úroveň je poměr skutečných a očekávaných gólů", () => {
    const kolo = Array.from({ length: 7 }, () => ({ goals: 6, expected: 3, roundsAgo: 0 }));
    expect(goalLevel(kolo)).toBeCloseTo(2, 10);
  });

  it("čerstvá kola váží víc, gólů během sezóny přibývá", () => {
    const vzorky = [
      { goals: 6, expected: 3, roundsAgo: 0 },
      { goals: 3, expected: 3, roundsAgo: 2 * LEVEL_HALF_LIFE_ROUNDS },
    ];
    // Prostý průměr by dal 1,5. Starší kolo má čtvrtinovou váhu.
    expect(goalLevel(vzorky)).toBeCloseTo((6 + 0.75) / (3 + 0.75), 10);
    expect(goalLevel(vzorky)).toBeGreaterThan(1.5);
  });

  it("nevyrovnané zápasy úroveň nenafouknou", () => {
    // V Praze se potkávají kádry s top-11 od 27 do 63. Jednoznačný zápas dá
    // víc gólů i při úrovni 1, takže když jich padne přesně tolik, úroveň
    // zůstane 1. Poměr k průměru by ji vyhnal nahoru.
    const l = expectedGoals({ strength: 60, form: 0 }, { strength: 30, form: 0 });
    const golu = l.home + l.away;
    expect(golu).toBeGreaterThan(BASE_HOME_GOALS + BASE_AWAY_GOALS);
    expect(goalLevel([{ goals: golu, expected: golu, roundsAgo: 0 }])).toBeCloseTo(1, 10);
  });

  it("jedno ujeté kolo nevyrobí nesmyslnou úroveň", () => {
    expect(goalLevel([{ goals: 40, expected: 3, roundsAgo: 0 }])).toBe(LEVEL_MAX);
    expect(goalLevel([{ goals: 0, expected: 3, roundsAgo: 0 }])).toBe(LEVEL_MIN);
  });

  it("úroveň násobí góly obou týmů a poměr sil nechává být", () => {
    const zaklad = expectedGoals({ strength: 36, form: 0 }, { strength: 30, form: 0 });
    const vysoka = expectedGoals({ strength: 36, form: 0 }, { strength: 30, form: 0 }, 1.8);
    expect(vysoka.home).toBeCloseTo(zaklad.home * 1.8, 10);
    expect(vysoka.away).toBeCloseTo(zaklad.away * 1.8, 10);
  });
});

describe("rozdělení gólů", () => {
  it("je to rozdělení pravděpodobnosti, sečte na 1", () => {
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

  it("je přerozptýlené, rozptyl je znatelně vyšší než průměr", () => {
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

  it("dvojtip sedí na jednotlivé výsledky", () => {
    const o = outcomeProbabilities(vyrovnany);
    const d = doubleChanceProbabilities(vyrovnany);
    expect(d.homeOrDraw).toBeCloseTo(o.home + o.draw, 10);
    expect(d.awayOrDraw).toBeCloseTo(o.away + o.draw, 10);
    expect(d.noDraw).toBeCloseTo(o.home + o.away, 10);
    // Každý výsledek je ve dvou možnostech, takže součet je vždycky přesně 2.
    expect(d.homeOrDraw + d.awayOrDraw + d.noDraw).toBeCloseTo(2, 10);
  });

  it("neprohra je vždy pravděpodobnější než samotná výhra", () => {
    const o = outcomeProbabilities(vyrovnany);
    const d = doubleChanceProbabilities(vyrovnany);
    expect(d.homeOrDraw).toBeGreaterThan(o.home);
    expect(d.awayOrDraw).toBeGreaterThan(o.away);
  });

  it("neprohra favorita má nižší kurz než neprohra outsidera", () => {
    const l = expectedGoals({ strength: 36, form: 0 }, { strength: 28, form: 0 });
    const d = doubleChanceProbabilities(l);
    expect(singleSideOdds(d.homeOrDraw)).toBeLessThan(singleSideOdds(d.awayOrDraw));
    // A pořád nese marži — dvojtip nesmí být levnější cesta k jistotě.
    expect(100 / singleSideOdds(d.homeOrDraw)).toBeGreaterThan(d.homeOrDraw);
  });

  it("vyšší linie je vždy méně pravděpodobná", () => {
    const p = [1.5, 2.5, 3.5, 4.5, 6.5].map((l) => totalsProbabilities(vyrovnany, l).over);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeLessThan(p[i - 1]);
  });
});

/**
 * Drží TVAR modelu u naměřených dat, a to na dvou úplně odlišných sadách:
 * referenční testovací databázi (3,4 gólu na zápas) a produkci (4,9 gólu).
 * Úroveň gólů se tu nekontroluje, ta se měří za běhu (goalLevel) a jestli
 * sedí na skutečnost, hlídá betting/calibration.ts nad odehranými zápasy.
 *
 * Když spadne, engine se změnil a tvar se musí přefitovat.
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

  it("báze je průměr vyrovnaných zápasů, ne celkový průměr", () => {
    // Kdyby se jako báze vzal celkový průměr (1,842 / 1,590), model by tvrdil
    // o KAŽDÉM zápase, že padne 3,43 gólu — jenže vyrovnaný zápas jich má jen
    // 3,22 a zbytek dohánějí nevyrovnané. Sázka na „míň gólů" by pak byla
    // dlouhodobě výdělečná.
    const vyrovnaneNamereno = 1.742 + 1.480;
    expect(BASE_HOME_GOALS + BASE_AWAY_GOALS).toBeCloseTo(vyrovnaneNamereno, 2);
    expect(BASE_HOME_GOALS + BASE_AWAY_GOALS).toBeLessThan(NAMERENO.celkem);
  });

  it("Poissonova varianta by na téže linii selhala, proto negativní binomické", () => {
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

  it("tvar rozdělení drží i na produkci, kde padá o 40 % gólů víc", () => {
    // Referenční průměry vynásobené úrovní produkce. Produkce je směs tří
    // soutěží (3,4 · 6,0 · 6,3 gólu) a tady ji zastupuje jedno λ, proto
    // tolerance čtyři body místo dvou. Kdyby rozptyl na vyšší úrovni neseděl,
    // byla by odchylka na vysoké linii násobně větší.
    const uroven = PRODUKCE.celkem / NAMERENO.celkem;
    const l = { home: NAMERENO.doma * uroven, away: NAMERENO.venku * uroven };
    expect(l.home + l.away).toBeCloseTo(PRODUKCE.celkem, 10);
    expect(Math.abs(totalsProbabilities(l, 2.5).over - PRODUKCE.over25)).toBeLessThan(0.04);
    expect(Math.abs(totalsProbabilities(l, 3.5).over - PRODUKCE.over35)).toBeLessThan(0.04);
    expect(Math.abs(totalsProbabilities(l, 6.5).over - PRODUKCE.over65)).toBeLessThan(0.04);
  });

  it("s úrovní gólů ubývá remíz, jako v soutěžích na produkci", () => {
    // Budějovice (3,2 gólu) mají remízu v každém čtvrtém zápase, Prachatice
    // (5,1 gólu) jen v každém sedmém. Model s jednou úrovní pro všechny dával
    // všude stejně remíz a v průměru to jen náhodou sedělo.
    const remiza = (goly: number) =>
      outcomeProbabilities(expectedGoals({ strength: 40, form: 0 }, { strength: 40, form: 0 }, goly / NAMERENO.celkem)).draw;
    const budejovice = remiza(PRODUKCE.budejovice.goly);
    const prachatice = remiza(PRODUKCE.prachatice.goly);
    expect(budejovice - prachatice).toBeGreaterThan(0.04);
    // Naměřený pokles je 11 bodů. Vyrovnaný zápas ho má menší, nevyrovnané
    // zápasy remíz ubírají, a těch je v silnějších soutěžích víc.
    expect(PRODUKCE.budejovice.remizy - PRODUKCE.prachatice.remizy).toBeGreaterThan(budejovice - prachatice);
  });
});

describe("střelci", () => {
  const hrac = (playerId: string, position: string, extra: Partial<ScorerInput> = {}): ScorerInput =>
    ({ playerId, position, goals: 0, appearances: 0, rating: 30, ...extra });

  /** Běžná sestava v poli: 4-4-2, všichni stejně dobří, bez odehraných zápasů. */
  const sestava = (): ScorerInput[] => [
    hrac("utocnik1", "FWD"), hrac("utocnik2", "FWD"),
    hrac("zaloznik1", "MID"), hrac("zaloznik2", "MID"), hrac("zaloznik3", "MID"), hrac("zaloznik4", "MID"),
    hrac("obrance1", "DEF"), hrac("obrance2", "DEF"), hrac("obrance3", "DEF"), hrac("obrance4", "DEF"),
  ];
  const soucet = (m: Map<string, number>, ids?: string[]) =>
    [...m.entries()].filter(([id]) => !ids || ids.includes(id)).reduce((a, [, v]) => a + v, 0);

  it("bez odehraných gólů si hráči na hřišti rozdělí góly týmu beze zbytku", () => {
    expect(soucet(scorerShares(sestava(), 0))).toBeCloseTo(1, 10);
  });

  it("náhradník svůj podíl dostane, ale hráčům na hřišti ho neubírá", () => {
    // Tip platí jen pro zápas, ve kterém hráč nastoupí. Dřív se góly dělily
    // mezi čtrnáct hráčů kádru a útočník vycházel o třetinu levněji.
    const kadr = [...sestava(), hrac("lavicka1", "FWD", { rating: 25 }), hrac("lavicka2", "MID", { rating: 25 })];
    const s = scorerShares(kadr, 0);
    expect(soucet(s, sestava().map((p) => p.playerId))).toBeCloseTo(1, 10);
    expect(s.get("lavicka1")!).toBeGreaterThan(0);
  });

  it("bez odehraných gólů rozhoduje pozice", () => {
    const s = scorerShares([...sestava(), hrac("brankar", "GK", { rating: 20 })], 0);
    expect(s.get("utocnik1")!).toBeGreaterThan(s.get("zaloznik1")!);
    expect(s.get("zaloznik1")!).toBeGreaterThan(s.get("obrance1")!);
    expect(s.get("brankar")!).toBe(0);
  });

  it("góly se počítají na zápas, ve kterém hráč nastoupil", () => {
    // Pět gólů v pěti startech je jiný střelec než pět gólů ve dvaceti.
    const hraje = scorerShares([...sestava().slice(1), hrac("utocnik1", "FWD", { goals: 5, appearances: 5 })], 2);
    const sedi = scorerShares([...sestava().slice(1), hrac("utocnik1", "FWD", { goals: 5, appearances: 20 })], 2);
    expect(hraje.get("utocnik1")!).toBeGreaterThan(sedi.get("utocnik1")!);
  });

  it("šťastná série z hráče útočníka neudělá", () => {
    // Záložník se třemi góly ve dvou zápasech týmu, který dává 1,5 gólu na zápas,
    // má syrový podíl 100 %. Na lístek se dostávají právě takoví a na série se
    // nedá spolehnout, takže odhad zůstane u toho, co odpovídá záložníkovi.
    const bez = scorerShares(sestava(), 1.5).get("zaloznik1")!;
    const kadr = sestava().map((p) => p.playerId === "zaloznik1" ? { ...p, goals: 3, appearances: 2 } : p);
    const se = scorerShares(kadr, 1.5).get("zaloznik1")!;
    expect(se).toBeGreaterThan(bez);
    expect(se).toBeLessThan(0.2);
  });

  it("skutečné góly nakonec přebijí pozici", () => {
    const kadr = sestava().map((p) =>
      p.playerId === "obrance1" ? { ...p, goals: 30, appearances: 30 }
      : p.playerId === "utocnik1" ? { ...p, goals: 2, appearances: 30 } : p);
    const s = scorerShares(kadr, 2);
    expect(s.get("obrance1")!).toBeGreaterThan(s.get("utocnik1")!);
  });

  it("podíl jednoho hráče má strop", () => {
    const s = scorerShares([hrac("sam", "FWD", { goals: 20, appearances: 5 })], 1);
    expect(s.get("sam")!).toBe(MAX_SHARE);
  });

  it("lepší hráč má vyšší podíl i bez odehraných gólů", () => {
    // Tohle odhalil až běh proti reálným datům: v prvním kole nikdo nemá góly,
    // takže bez vlivu ratingu měli všichni útočníci téhož týmu stejný kurz.
    const s = scorerShares([hrac("hvezda", "FWD", { rating: 45 }), hrac("benjaminek", "FWD", { rating: 25 })], 0);
    expect(s.get("hvezda")!).toBeGreaterThan(s.get("benjaminek")! * 1.5);
  });

  it("silný záložník ale nepřeskočí slabšího útočníka, post váží víc", () => {
    const s = scorerShares([hrac("utocnik", "FWD", { rating: 28 }), hrac("zaloznik", "MID", { rating: 42 })], 0);
    expect(s.get("utocnik")!).toBeGreaterThan(s.get("zaloznik")!);
  });

  it("dostupnost má podlahu i strop", () => {
    expect(availability(0, 10)).toBeCloseTo(0.35, 10);  // nehrál vůbec
    expect(availability(10, 10)).toBeCloseTo(0.92, 2);  // hrál všechno
    expect(availability(30, 30)).toBeLessThanOrEqual(0.95);
    expect(availability(0, 0)).toBe(0.6);               // začátek sezóny
  });

  it("pravděpodobnost gólu roste s podílem i se sílou týmu", () => {
    const a = scorerProbability(1.84, 0.25);
    const b = scorerProbability(1.84, 0.10);
    const c = scorerProbability(3.00, 0.25);
    expect(a).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });

  it("kurz střelce nesmí trestat absenci dvakrát", () => {
    // Nenastoupení tip anuluje (grade.ts), takže kurz vyjadřuje „dá gól, když
    // nastoupí". Kdyby se do něj počítala i dostupnost, byl by o pětinu vyšší,
    // než má být — přesně o to model podceňoval střelce (16,5 % vs 21,2 %).
    const p = scorerProbability(1.74, 0.22);
    const sDostupnosti = 1 - Math.exp(-(1.74 * 0.22 * 0.78));
    expect(p).toBeGreaterThan(sDostupnosti);
    expect(p / sDostupnosti).toBeGreaterThan(1.15);
  });
});

describe("marže a kurzy", () => {
  it("namaržovaný trh sečte přesně na overround", () => {
    const o = outcomeProbabilities(vyrovnany);
    const sum = applyMargin([o.home, o.draw, o.away]).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1 + MARGIN, 10);
  });

  it("kurzy trhu nikdy nespadnou pod plánovanou marži", () => {
    // Zaokrouhlení dolů a strop kurzu smí marži jen zvýšit, nikdy snížit —
    // marže pod 8 % by znamenala, že kancelář prodává pod cenou.
    for (const sily of [[30, 30], [36, 26], [26, 36], [40, 22]]) {
      const l = expectedGoals({ strength: sily[0], form: 0 }, { strength: sily[1], form: 0 });
      const o = outcomeProbabilities(l);
      const over = marketOdds([o.home, o.draw, o.away])
        .reduce((acc, k) => acc + 100 / k, 0);
      expect(over).toBeGreaterThanOrEqual(1 + MARGIN - 1e-9);
      // U velmi nevyrovnaných zápasů zasáhne podlaha pravděpodobnosti
      // a marže vyroste — na hráče to není past, jen se mu nevyplatí sázet
      // jistotu za korunu.
      expect(over).toBeLessThan(1.13);
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
