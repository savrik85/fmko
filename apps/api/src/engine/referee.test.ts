/**
 * Balanční test rozhodčích.
 *
 * Hlídá dvě věci naráz: (1) že neutrální sudí drží čísla, na kterých stojí
 * `set-pieces.test.ts`, a (2) že se archetypy od sebe měřitelně liší — jinak by
 * byla celá delegace kosmetika a volba tvrdosti hry ve fázi 2 by neměla o co opřít.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import {
  NEUTRAL_REFEREE, REFEREE_ARCHETYPES, gradeReferee, planRefereeError,
  matchErrorChance, penaltyZone, severeFoulProb, advantageProb,
  type RefereeProfile, type RefereeArchetype,
} from "./referee";
import type { MatchPlayer, TeamSetup } from "./types";

function mkPlayer(id: number, position: MatchPlayer["position"], level: number): MatchPlayer {
  const v = Math.max(5, Math.min(100, Math.round(level)));
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: v, technique: v, shooting: v, passing: v, heading: v, defense: v,
    goalkeeping: v, stamina: v, strength: v, vision: v, creativity: v, setPieces: v,
    discipline: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50,
    aggression: 40, consistency: 50, clutch: 50, injuryProneness: 50,
    preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 50,
  };
}

function mkTeam(teamId: number, idBase: number, level: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level)];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF", level));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID", level));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD", level));
  const subs = [
    mkPlayer(idBase + 11, "GK", level), mkPlayer(idBase + 12, "DEF", level),
    mkPlayer(idBase + 13, "MID", level), mkPlayer(idBase + 14, "FWD", level),
    mkPlayer(idBase + 15, "MID", level),
  ];
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2" };
}

/** Profil z archetypu — střed každého deklarovaného rozsahu, ať je test deterministický. */
function fromArchetype(key: RefereeArchetype): RefereeProfile {
  const a = REFEREE_ARCHETYPES[key];
  const mid = (r: readonly [number, number]) => Math.round((r[0] + r[1]) / 2);
  return {
    id: key, name: a.label, archetype: key,
    strictness: mid(a.strictness),
    cardHappiness: mid(a.cardHappiness),
    experience: mid(a.experience),
    homeBias: mid(a.homeBias),
    advantage: mid(a.advantage),
    fitness: mid(a.fitness),
  };
}

interface Totals {
  matches: number; goals: number; openPlayGoals: number;
  fouls: number; yellow: number; red: number; penalties: number;
  incidents: number; maxIncidentsInMatch: number; disallowed: number;
  homePenalties: number; awayPenalties: number; gradeSum: number;
}

function runSeason(matches: number, referee: RefereeProfile | undefined, seedBase = 1000, level = 50): Totals {
  const t: Totals = {
    matches, goals: 0, openPlayGoals: 0, fouls: 0, yellow: 0, red: 0, penalties: 0,
    incidents: 0, maxIncidentsInMatch: 0, disallowed: 0,
    homePenalties: 0, awayPenalties: 0, gradeSum: 0,
  };

  for (let i = 0; i < matches; i++) {
    const rng = createRng(seedBase + i);
    const result = simulateMatch(rng, {
      home: mkTeam(1, 1, level), away: mkTeam(2, 100, level),
      weather: "sunny", isHomeAdvantage: true, referee,
    });
    t.goals += result.homeScore + result.awayScore;
    t.gradeSum += result.refereeGrade;
    t.incidents += result.refereeIncidents.length;
    t.maxIncidentsInMatch = Math.max(t.maxIncidentsInMatch, result.refereeIncidents.length);
    t.disallowed += result.refereeIncidents.filter((x) => x.kind === "neuznany_gol").length;

    for (const e of result.events) {
      switch (e.type) {
        case "goal": if ((e.source ?? "open_play") === "open_play") t.openPlayGoals++; break;
        case "foul": t.fouls++; break;
        case "card": e.detail === "red" ? t.red++ : t.yellow++; break;
        case "penalty":
          t.penalties++;
          if (e.teamId === 1) t.homePenalties++; else t.awayPenalties++;
          break;
      }
    }
  }
  return t;
}

const N = 3000;

/** Balanční testy pouští tisíce simulací — výchozích 5 s na CI runneru nestačí. */
const SLOW = 120_000;

describe("rozhodčí — agregáty", () => {
  const neutral = runSeason(N, undefined);

  it("vypíše rozpad podle archetypů (diagnostika)", () => {
    const keys = Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[];
    const rows = [["NEUTRÁL", neutral] as const, ...keys.map((k) => [REFEREE_ARCHETYPES[k].label, runSeason(600, fromArchetype(k), 7000)] as const)];
    const line = (label: string, t: Totals) =>
      `${label.padEnd(18)} fauly ${(t.fouls / t.matches).toFixed(2).padStart(5)}` +
      ` | žluté ${(t.yellow / t.matches).toFixed(2).padStart(4)}` +
      ` | červené ${(t.red / t.matches).toFixed(3).padStart(5)}` +
      ` | penalty ${(t.penalties / t.matches).toFixed(3).padStart(5)}` +
      ` | spory ${(t.incidents / t.matches).toFixed(3).padStart(5)}` +
      ` | góly ${(t.goals / t.matches).toFixed(2).padStart(4)}` +
      ` | známka ${(t.gradeSum / t.matches).toFixed(2)}`;
    console.log("\n" + rows.map(([l, t]) => line(l, t)).join("\n"));
    expect(neutral.goals).toBeGreaterThan(0);
  }, SLOW);

  it("neutrální sudí drží dnešní čísla", () => {
    expect(neutral.fouls / N).toBeGreaterThan(8);
    expect(neutral.fouls / N).toBeLessThan(11);
    expect((neutral.yellow + neutral.red) / N).toBeGreaterThan(1.1);
    expect((neutral.yellow + neutral.red) / N).toBeLessThan(1.9);
    expect(neutral.penalties / N).toBeGreaterThan(0.20);
    expect(neutral.penalties / N).toBeLessThan(0.40);
    expect(neutral.goals / N).toBeGreaterThan(4.6);
    expect(neutral.goals / N).toBeLessThan(5.3);
  });

  it("přísný píská výrazně víc než benevolentní", () => {
    const strict = runSeason(1500, fromArchetype("piskavy_kohout"), 2000);
    const lenient = runSeason(1500, fromArchetype("pohodar"), 2000);
    expect(strict.fouls / strict.matches).toBeGreaterThan((lenient.fouls / lenient.matches) * 1.8);
    expect(strict.fouls / strict.matches).toBeLessThan(20);
    expect(lenient.fouls / lenient.matches).toBeGreaterThan(5.0);
  }, SLOW);

  it("karetní cvok rozdá výrazně víc karet než pohodář", () => {
    const cvok = runSeason(1500, fromArchetype("kartovy_cvok"), 3000);
    const pohodar = runSeason(1500, fromArchetype("pohodar"), 3000);
    const cards = (t: Totals) => (t.yellow + t.red) / t.matches;
    expect(cards(cvok)).toBeGreaterThan(2.0);
    expect(cards(cvok)).toBeLessThan(4.0);
    expect(cards(pohodar)).toBeLessThan(1.1);
    expect(cards(pohodar)).toBeGreaterThan(0.4);
  }, SLOW);

  it("červených je i u nejpřísnějšího málo", () => {
    for (const key of Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[]) {
      const t = runSeason(500, fromArchetype(key), 4000);
      expect(t.red / t.matches, `červené u ${key}`).toBeLessThan(0.32);
    }
  }, SLOW);

  it("penalt je napříč archetypy 0,15–0,50", () => {
    for (const key of Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[]) {
      const t = runSeason(500, fromArchetype(key), 5000);
      expect(t.penalties / t.matches, `penalty u ${key}`).toBeGreaterThan(0.15);
      expect(t.penalties / t.matches, `penalty u ${key}`).toBeLessThan(0.50);
    }
  }, SLOW);

  it("pouštění výhody snižuje počet odpískaných faulů", () => {
    const base = { ...NEUTRAL_REFEREE, strictness: 60 };
    const pusti = runSeason(1500, { ...base, advantage: 90 }, 6000);
    const nepusti = runSeason(1500, { ...base, advantage: 10 }, 6000);
    expect(pusti.fouls / pusti.matches).toBeLessThan(nepusti.fouls / nepusti.matches);
  }, SLOW);
});

describe("rozhodčí — sporné situace", () => {
  it("nikdy nepadne víc než jedna sporná situace v zápase", () => {
    for (const key of Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[]) {
      const t = runSeason(400, fromArchetype(key), 8000);
      expect(t.maxIncidentsInMatch, `${key} má víc než jednu spornou situaci`).toBeLessThanOrEqual(1);
    }
  }, SLOW);

  it("zelenáč chybuje výrazně častěji než veterán", () => {
    const zelenac = runSeason(2000, fromArchetype("zelenac"), 9000);
    const veteran = runSeason(2000, fromArchetype("klidny_veteran"), 9000);
    expect(zelenac.incidents / zelenac.matches).toBeGreaterThan(0.30);
    expect(veteran.incidents / veteran.matches).toBeLessThan(0.22);
    expect(zelenac.incidents / zelenac.matches).toBeGreaterThan((veteran.incidents / veteran.matches) * 2);
  }, SLOW);

  it("neuznané góly reálně ubírají góly ze hry", () => {
    // Chybující sudí musí dát míň gólů ze hry než neomylný — jinak by škrtání gólů
    // bylo jen text a sporná situace by neměla následek.
    const chybujici = runSeason(2500, { ...NEUTRAL_REFEREE, experience: 0 }, 11000);
    const neomylny = runSeason(2500, { ...NEUTRAL_REFEREE, experience: 100 }, 11000);
    expect(chybujici.disallowed).toBeGreaterThan(0);
    expect(chybujici.openPlayGoals / chybujici.matches)
      .toBeLessThan(neomylny.openPlayGoals / neomylny.matches);
  }, SLOW);

  it("stejný seed dá stejné sporné situace", () => {
    const ref = fromArchetype("zelenac");
    const run = () => {
      const out: string[] = [];
      for (let i = 0; i < 60; i++) {
        const r = simulateMatch(createRng(12345 + i), {
          home: mkTeam(1, 1, 50), away: mkTeam(2, 100, 50),
          weather: "sunny", isHomeAdvantage: true, referee: ref,
        });
        out.push(JSON.stringify(r.refereeIncidents));
      }
      return out.join("|");
    };
    expect(run()).toBe(run());
  });

  it("náchylnost k domácímu prostředí posouvá penalty domácím", () => {
    const bias = runSeason(2500, { ...NEUTRAL_REFEREE, homeBias: 92 }, 13000);
    const fer = runSeason(2500, { ...NEUTRAL_REFEREE, homeBias: 50 }, 13000);
    const podil = (t: Totals) => t.homePenalties / Math.max(1, t.homePenalties + t.awayPenalties);
    expect(podil(bias)).toBeGreaterThan(podil(fer) + 0.05);
  }, SLOW);
});

describe("rozhodčí — vzorce", () => {
  it("zóna penalty roste s přísností a drží se v mezích", () => {
    const lo = penaltyZone({ ...NEUTRAL_REFEREE, strictness: 0 }, true);
    const hi = penaltyZone({ ...NEUTRAL_REFEREE, strictness: 100 }, true);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(0.012);
    expect(hi).toBeLessThan(0.075);
  });

  it("frekvence faulů a pouštění výhody jsou monotónní", () => {
    expect(severeFoulProb({ ...NEUTRAL_REFEREE, strictness: 100 }))
      .toBeGreaterThan(severeFoulProb({ ...NEUTRAL_REFEREE, strictness: 0 }));
    expect(advantageProb({ ...NEUTRAL_REFEREE, advantage: 100 }))
      .toBeGreaterThan(advantageProb({ ...NEUTRAL_REFEREE, advantage: 0 }));
  });

  it("šance na chybu klesá se zkušeností", () => {
    expect(matchErrorChance({ ...NEUTRAL_REFEREE, experience: 10 }))
      .toBeGreaterThan(matchErrorChance({ ...NEUTRAL_REFEREE, experience: 90 }));
    expect(matchErrorChance({ ...NEUTRAL_REFEREE, experience: 100 })).toBeLessThan(0.10);
  });

  it("planRefereeError spotřebuje vždy stejný počet hodnot RNG", () => {
    // Bez toho by se stream rozjel podle toho, jestli k chybě došlo, a zápas by
    // přestal být reprodukovatelný ze seedu.
    const after = (r: RefereeProfile) => {
      const rng = createRng(777);
      planRefereeError(rng, r);
      return rng.random();
    };
    expect(after({ ...NEUTRAL_REFEREE, experience: 0 })).toBe(after({ ...NEUTRAL_REFEREE, experience: 100 }));
  });
});

describe("známka rozhodčího", () => {
  const klidnyZapas = { fouls: 9, cards: 1, incidentSeverity: null, lateEventShare: 0.2 } as const;

  it("drží se vždy v rozsahu 1,0–5,0", () => {
    const extremy = [
      { fouls: 0, cards: 0, incidentSeverity: null, lateEventShare: 0 },
      { fouls: 30, cards: 12, incidentSeverity: "high" as const, lateEventShare: 1 },
      { fouls: 20, cards: 0, incidentSeverity: "high" as const, lateEventShare: 1 },
    ];
    for (const r of Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[]) {
      for (const f of extremy) {
        const g = gradeReferee(fromArchetype(r), f);
        expect(g).toBeGreaterThanOrEqual(1.0);
        expect(g).toBeLessThanOrEqual(5.0);
      }
    }
  });

  it("sporná situace známku vždy zhorší", () => {
    const ref = NEUTRAL_REFEREE;
    const bez = gradeReferee(ref, klidnyZapas);
    const sporna = gradeReferee(ref, { ...klidnyZapas, incidentSeverity: "high" });
    expect(sporna).toBeGreaterThan(bez);
    expect(gradeReferee(ref, { ...klidnyZapas, incidentSeverity: "low" })).toBeGreaterThan(bez);
  });

  it("zkušený sudí dostane za stejný zápas lepší známku", () => {
    expect(gradeReferee({ ...NEUTRAL_REFEREE, experience: 90 }, klidnyZapas))
      .toBeLessThan(gradeReferee({ ...NEUTRAL_REFEREE, experience: 20 }, klidnyZapas));
  });

  it("sezónní průměry rozlišují archetypy a drží se v rozumném pásmu", () => {
    const prumer = (key: RefereeArchetype) => {
      const t = runSeason(600, fromArchetype(key), 15000);
      return t.gradeSum / t.matches;
    };
    const veteran = prumer("klidny_veteran");
    const zelenac = prumer("zelenac");
    const kohout = prumer("piskavy_kohout");

    expect(veteran).toBeLessThan(zelenac);
    expect(veteran).toBeLessThan(kohout);
    for (const g of [veteran, zelenac, kohout]) {
      expect(g).toBeGreaterThan(1.3);
      expect(g).toBeLessThan(3.5);
    }
  }, SLOW);
});
