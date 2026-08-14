/**
 * Balanční test tvrdosti hry.
 *
 * Nejdůležitější test je „přehození znaménka": proti benevolentnímu sudímu se
 * tvrdá hra musí vyplácet, proti přísnému ne. Kdyby vycházela pořád, volba by
 * fakticky neexistovala a hrálo by se vždycky naostro.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { NEUTRAL_REFEREE, type RefereeProfile } from "./referee";
import {
  HARDNESS_MODS, calcHardnessFit, benefitScale, careFactor, susceptibility,
  grit, decideAiHardness, hardEff, type Hardness,
} from "./hardness";
import type { MatchPlayer, TeamSetup } from "./types";

const SLOW = 120_000;

interface PlayerOverrides {
  aggression?: number;
  strength?: number;
  consistency?: number;
  leadership?: number;
  temper?: number;
  discipline?: number;
}

function mkPlayer(id: number, position: MatchPlayer["position"], level: number, o: PlayerOverrides = {}): MatchPlayer {
  const v = Math.max(5, Math.min(100, Math.round(level)));
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: v, technique: v, shooting: v, passing: v, heading: v, defense: v,
    goalkeeping: v, stamina: v, strength: o.strength ?? v, vision: v, creativity: v, setPieces: v,
    discipline: o.discipline ?? 50, alcohol: 30, temper: o.temper ?? 40, leadership: o.leadership ?? 30,
    workRate: 50, aggression: o.aggression ?? 40, consistency: o.consistency ?? 50, clutch: 50,
    injuryProneness: 50, preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 50,
  };
}

function mkTeam(teamId: number, idBase: number, level: number, hardness: Hardness, o: PlayerOverrides = {}): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level, o)];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF", level, o));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID", level, o));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD", level, o));
  const subs = [
    mkPlayer(idBase + 11, "GK", level, o), mkPlayer(idBase + 12, "DEF", level, o),
    mkPlayer(idBase + 13, "MID", level, o), mkPlayer(idBase + 14, "FWD", level, o),
    mkPlayer(idBase + 15, "MID", level, o),
  ];
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2", hardness };
}

const REF: Record<string, RefereeProfile> = {
  benevolentni: { ...NEUTRAL_REFEREE, strictness: 25, cardHappiness: 25, advantage: 85, experience: 70 },
  neutralni: NEUTRAL_REFEREE,
  prisny: { ...NEUTRAL_REFEREE, strictness: 88, cardHappiness: 85, advantage: 12, experience: 70 },
};

interface Totals {
  matches: number;
  homeGoals: number; awayGoals: number;
  homeFouls: number; homeYellow: number; homeRed: number;
  injuries: number; homeInjuries: number;
}

function run(
  matches: number,
  homeHardness: Hardness,
  referee: RefereeProfile,
  seedBase: number,
  opts: { homeAttrs?: PlayerOverrides; awayAttrs?: PlayerOverrides; awayHardness?: Hardness } = {},
): Totals {
  const t: Totals = {
    matches, homeGoals: 0, awayGoals: 0,
    homeFouls: 0, homeYellow: 0, homeRed: 0, injuries: 0, homeInjuries: 0,
  };
  for (let i = 0; i < matches; i++) {
    const home = mkTeam(1, 1, 50, homeHardness, opts.homeAttrs);
    const away = mkTeam(2, 100, 50, opts.awayHardness ?? "normal", opts.awayAttrs);
    const r = simulateMatch(createRng(seedBase + i), {
      home, away, weather: "sunny", isHomeAdvantage: true, referee,
    });
    t.homeGoals += r.homeScore;
    t.awayGoals += r.awayScore;
    for (const e of r.events) {
      if (e.type === "foul" && e.teamId === 1) t.homeFouls++;
      if (e.type === "card" && e.teamId === 1) { e.detail === "red" ? t.homeRed++ : t.homeYellow++; }
      if (e.type === "injury") { t.injuries++; if (e.teamId === 1) t.homeInjuries++; }
    }
  }
  return t;
}

/** Rozdíl skóre domácích na zápas — jediná metrika, která shrnuje zisk i ztrátu. */
const gd = (t: Totals) => (t.homeGoals - t.awayGoals) / t.matches;
const per = (n: number, t: Totals) => n / t.matches;

const N = 2500;

describe("tvrdost hry — agregáty", () => {
  const fair = run(N, "fair", REF.neutralni, 40000);
  const normal = run(N, "normal", REF.neutralni, 40000);
  const hard = run(N, "hard", REF.neutralni, 40000);

  it("vypíše rozpad (diagnostika)", () => {
    const rows: Array<[string, Totals]> = [["Na férovku", fair], ["Normálně", normal], ["Do těla", hard]];
    console.log("\n" + rows.map(([l, t]) =>
      `${l.padEnd(12)} fauly ${per(t.homeFouls, t).toFixed(2).padStart(5)}` +
      ` | žluté ${per(t.homeYellow, t).toFixed(2).padStart(4)}` +
      ` | červené ${per(t.homeRed, t).toFixed(3).padStart(5)}` +
      ` | vlastní zranění ${per(t.homeInjuries, t).toFixed(2)}` +
      ` | dal ${per(t.homeGoals, t).toFixed(2)} dostal ${per(t.awayGoals, t).toFixed(2)}` +
      ` | rozdíl ${gd(t) >= 0 ? "+" : ""}${gd(t).toFixed(2)}`,
    ).join("\n"));
    expect(normal.matches).toBe(N);
  }, SLOW);

  it("fauly škálují podle tvrdosti", () => {
    const ratio = (a: Totals) => per(a.homeFouls, a) / per(normal.homeFouls, normal);
    expect(ratio(hard)).toBeGreaterThan(1.30);
    expect(ratio(hard)).toBeLessThan(1.60);
    expect(ratio(fair)).toBeGreaterThan(0.60);
    expect(ratio(fair)).toBeLessThan(0.80);
  }, SLOW);

  it("tvrdá hra znatelně zvyšuje karty, férová je snižuje", () => {
    const cards = (t: Totals) => per(t.homeYellow + t.homeRed, t);
    expect(cards(hard)).toBeGreaterThan(cards(normal) * 1.5);
    expect(cards(fair)).toBeLessThan(cards(normal) * 0.75);
    expect(hard.homeRed).toBeGreaterThan(fair.homeRed * 2);
  }, SLOW);

  it("tvrdá hra reálně ubere soupeři góly", () => {
    const conceded = (t: Totals) => per(t.awayGoals, t);
    expect(conceded(normal) - conceded(hard)).toBeGreaterThan(0.08);
  }, SLOW);

  it("tvrdá hra zraňuje víc soupeře než vlastní hráče", () => {
    const soupereva = (t: Totals) => per(t.injuries - t.homeInjuries, t);
    // Obě strany platí, ale zákroky odnese hlavně ten, kdo je schytává.
    expect(soupereva(hard)).toBeGreaterThan(soupereva(normal));
    expect(per(hard.homeInjuries, hard)).toBeGreaterThan(per(fair.homeInjuries, fair));
    expect(soupereva(hard) - soupereva(normal))
      .toBeGreaterThan(per(hard.homeInjuries, hard) - per(normal.homeInjuries, normal));
    // Férová hra soupeře naopak šetří.
    expect(soupereva(fair)).toBeLessThan(soupereva(normal));
    // Ani nejhorší kombinace nesmí ze zápasu udělat lazaret.
    const oboji = run(1200, "hard", REF.neutralni, 41000, { awayHardness: "hard" });
    expect(per(oboji.injuries, oboji)).toBeLessThan(1.6);
  }, SLOW);

  it("férová hra je gólově skoro neutrální — platí se za pojistku, ne za výkon", () => {
    expect(Math.abs(gd(fair) - gd(normal))).toBeLessThan(0.20);
  }, SLOW);
});

describe("tvrdost hry — na čem záleží", () => {
  it("PŘEHOZENÍ ZNAMÉNKA: proti benevolentnímu se vyplatí, proti přísnému ne", () => {
    const zisk = (ref: RefereeProfile, seed: number) =>
      gd(run(N, "hard", ref, seed)) - gd(run(N, "normal", ref, seed));

    const uBenevolentniho = zisk(REF.benevolentni, 42000);
    const uPrisneho = zisk(REF.prisny, 43000);

    console.log(`\nzisk z tvrdé hry: benevolentní ${uBenevolentniho >= 0 ? "+" : ""}${uBenevolentniho.toFixed(3)}` +
      ` · přísný ${uPrisneho >= 0 ? "+" : ""}${uPrisneho.toFixed(3)}`);

    expect(uBenevolentniho).toBeGreaterThan(0.10);
    expect(uBenevolentniho - uPrisneho).toBeGreaterThan(0.15);
  }, SLOW);

  it("KÁDR ROZHODUJE: agresivní tým z tvrdé hry vytěží víc než technický", () => {
    // Měří se RELATIVNÍ pokles inkasovaných gólů, ne rozdíl skóre. Dřevorubci mají
    // díky síle a agresivitě lepší obranu už na startu, takže v absolutních číslech
    // by test porovnával výchozí úroveň, ne užitek z tvrdé hry — a u velmi silné
    // obrany navíc naráží šance soupeře na spodní strop.
    // Pozor na škály: strength je skill (reálný průměr ~20), agrese povaha 0–100.
    const drevorubci: PlayerOverrides = { aggression: 85, strength: 40 };
    const technici: PlayerOverrides = { aggression: 20, strength: 10 };

    const relativniZisk = (attrs: PlayerOverrides, seed: number) => {
      const normal = per(run(N, "normal", REF.benevolentni, seed, { homeAttrs: attrs }).awayGoals, { matches: N } as Totals);
      const hard = per(run(N, "hard", REF.benevolentni, seed, { homeAttrs: attrs }).awayGoals, { matches: N } as Totals);
      return (normal - hard) / normal;
    };

    const ziskD = relativniZisk(drevorubci, 44000);
    const ziskT = relativniZisk(technici, 44000);

    console.log(`\nrelativní pokles inkasovaných: dřevorubci ${(ziskD * 100).toFixed(1)} % · technici ${(ziskT * 100).toFixed(1)} %`);
    expect(ziskD).toBeGreaterThan(ziskT);
    expect(ziskD).toBeGreaterThan(0.05);
  }, SLOW);

  it("RIZIKO SE NEŠKÁLUJE: technický kádr dostane za tvrdou hru stejně karet", () => {
    const technici: PlayerOverrides = { aggression: 20 };
    const drevorubci: PlayerOverrides = { aggression: 85 };
    const t = run(1500, "hard", REF.neutralni, 45000, { homeAttrs: technici });
    const d = run(1500, "hard", REF.neutralni, 45000, { homeAttrs: drevorubci });
    // Technici nemají o poznání míň karet — z toho, že tvrdou hru neumí, jim
    // slevu nikdo nedá. (Drobný rozdíl přes výběr faulujícího je v pořádku.)
    expect(per(t.homeYellow, t)).toBeGreaterThan(per(d.homeYellow, d) * 0.75);
  }, SLOW);

  it("ZASTRAŠENÍ: měkký soupeř ztratí víc než otrlý", () => {
    // strength je skill (reálný průměr ~20, max ~80), zbytek povaha 0–100.
    const mekky: PlayerOverrides = { strength: 8, aggression: 20, consistency: 30, leadership: 20 };
    const otrly: PlayerOverrides = { strength: 45, aggression: 85, consistency: 85, leadership: 80 };

    const ztrataMekkeho = per(run(N, "normal", REF.benevolentni, 46000, { awayAttrs: mekky }).awayGoals, { matches: N } as Totals)
      - per(run(N, "hard", REF.benevolentni, 46000, { awayAttrs: mekky }).awayGoals, { matches: N } as Totals);
    const ztrataOtrleho = per(run(N, "normal", REF.benevolentni, 46000, { awayAttrs: otrly }).awayGoals, { matches: N } as Totals)
      - per(run(N, "hard", REF.benevolentni, 46000, { awayAttrs: otrly }).awayGoals, { matches: N } as Totals);

    console.log(`\nztráta gólů proti tvrdé hře: měkký ${ztrataMekkeho.toFixed(3)} · otrlý ${ztrataOtrleho.toFixed(3)}`);
    expect(ztrataMekkeho).toBeGreaterThan(ztrataOtrleho);
  }, SLOW);

  it("STROP DIVOKOSTI: ani tvrdá hra u nejpřísnějšího sudího zápas nerozvrátí", () => {
    const t = run(1500, "hard", REF.prisny, 47000, { awayHardness: "hard" });
    expect(per(t.homeYellow + t.homeRed, t)).toBeLessThan(4.0);
    expect(per(t.homeRed, t)).toBeLessThan(0.45);
  }, SLOW);
});

describe("tvrdost hry — vzorce", () => {
  it("modifikátory jsou konzistentní: normal je všude neutrální", () => {
    const n = HARDNESS_MODS.normal;
    expect(n.defenseMod).toBe(1);
    expect(n.foulMod).toBe(1);
    expect(n.cardMod).toBe(1);
    expect(n.intimidation).toBe(0);
    expect(n.counterBonus).toBe(0);
  });

  it("neznámá hodnota spadne na normal", () => {
    const lineup = mkTeam(1, 1, 50, "normal").lineup;
    expect(calcHardnessFit(lineup, "rozbite" as Hardness)).toBe(1.0);
  });

  it("fit odměňuje agresivní a silný kádr", () => {
    const drevorubci = mkTeam(1, 1, 50, "hard", { aggression: 85, strength: 40 }).lineup;
    const technici = mkTeam(1, 1, 50, "hard", { aggression: 20, strength: 8 }).lineup;
    expect(calcHardnessFit(drevorubci, "hard")).toBeGreaterThan(calcHardnessFit(technici, "hard"));
    // Opatrnou hru zvládne každý.
    expect(calcHardnessFit(technici, "fair")).toBe(1.0);
  });

  it("benefitScale klesá s přísností sudího a drží meze", () => {
    expect(benefitScale({ ...NEUTRAL_REFEREE, strictness: 0 })).toBeCloseTo(1.45, 2);
    expect(benefitScale({ ...NEUTRAL_REFEREE, strictness: 50 })).toBeCloseTo(1.0, 2);
    expect(benefitScale({ ...NEUTRAL_REFEREE, strictness: 100 })).toBeCloseTo(0.25, 2);
    expect(benefitScale(undefined)).toBeCloseTo(1.0, 2);
  });

  it("careFactor klesá s počtem pokartovaných", () => {
    const lineup = mkTeam(1, 1, 50, "hard").lineup;
    expect(careFactor(lineup, new Set())).toBe(1);
    const half = new Set(lineup.filter((p) => p.position !== "GK").slice(0, 5).map((p) => p.id));
    expect(careFactor(lineup, half)).toBeLessThan(0.6);
    expect(careFactor(lineup, half)).toBeGreaterThan(0.4);
  });

  it("hardEff se drží v mezích i v extrémech", () => {
    const lineup = mkTeam(1, 1, 50, "hard", { aggression: 100, strength: 60 }).lineup;
    const all = new Set(lineup.map((p) => p.id));
    expect(hardEff(lineup, "hard", { ...NEUTRAL_REFEREE, strictness: 0 }, new Set())).toBeLessThanOrEqual(1.45);
    expect(hardEff(lineup, "hard", { ...NEUTRAL_REFEREE, strictness: 100 }, all)).toBeGreaterThanOrEqual(0.15);
  });

  it("otrlost a náchylnost jdou proti sobě", () => {
    const mekky = mkTeam(1, 1, 50, "normal", { strength: 8, aggression: 20, consistency: 20, leadership: 20 }).lineup;
    const otrly = mkTeam(1, 1, 50, "normal", { strength: 45, aggression: 90, consistency: 90, leadership: 90 }).lineup;
    expect(grit(mekky[1])).toBeLessThan(grit(otrly[1]));
    expect(susceptibility(mekky)).toBeGreaterThan(0.8);
    expect(susceptibility(otrly)).toBeLessThan(0.1);
  });
});

describe("volba tvrdosti u AI", () => {
  const base = {
    squadAggression: 45, refStrictness: 50, strengthGap: 0,
    playersOneYellowFromBan: 0, isDerby: false, isU21: false,
  };

  it("je deterministická", () => {
    expect(decideAiHardness(base)).toBe(decideAiHardness(base));
  });

  it("s dorostem se do těla nehraje", () => {
    expect(decideAiHardness({ ...base, squadAggression: 95, refStrictness: 5, isU21: true })).toBe("normal");
  });

  it("agresivní kádr proti benevolentnímu sudímu jde naostro", () => {
    expect(decideAiHardness({ ...base, squadAggression: 70, refStrictness: 20 })).toBe("hard");
  });

  it("proti přísnému sudímu ubere", () => {
    expect(decideAiHardness({ ...base, squadAggression: 45, refStrictness: 95 })).toBe("fair");
  });

  it("hrozící stopky tvrdost tlumí úměrně počtu ohrožených", () => {
    const s = (n: number) => decideAiHardness({ ...base, squadAggression: 62, refStrictness: 30, playersOneYellowFromBan: n });
    expect(s(0)).toBe("hard");
    expect(s(2)).toBe("hard");   // dva ohrožení ještě neodradí
    expect(s(4)).toBe("normal"); // čtyři už ano
  });

  it("většina průměrných kádrů hraje normálně", () => {
    let normalCount = 0;
    const total = 11 * 11;
    for (let agg = 30; agg <= 70; agg += 4) {
      for (let str = 25; str <= 75; str += 5) {
        if (decideAiHardness({ ...base, squadAggression: agg, refStrictness: str }) === "normal") normalCount++;
      }
    }
    expect(normalCount / total).toBeGreaterThan(0.4);
  });
});
