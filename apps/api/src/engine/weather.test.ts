import { describe, it, expect } from "vitest";
import { simulateMatch, WEATHER_MODS, calcGoalProb } from "./simulation";
import type { MatchPlayer, TeamSetup, Weather } from "./types";
import { generateCommentary } from "./commentary";
import { createRng } from "../generators/rng";

function createPlayer(id: number, pos: "GK" | "DEF" | "MID" | "FWD", skill = 50): MatchPlayer {
  return {
    id,
    firstName: "Jan",
    lastName: `Hráč${id}`,
    nickname: null,
    position: pos,
    matchPosition: pos,
    speed: skill,
    technique: skill,
    shooting: skill,
    passing: skill,
    heading: skill,
    defense: skill,
    goalkeeping: pos === "GK" ? skill : 10,
    stamina: 60,
    strength: skill,
    vision: skill,
    creativity: skill,
    setPieces: skill,
    discipline: 50,
    alcohol: 10,
    temper: 50,
    leadership: 50,
    workRate: 50,
    aggression: 50,
    consistency: 50,
    clutch: 50,
    injuryProneness: 50,
    preferredFoot: "right",
    preferredSide: "any",
    condition: 100,
    morale: 50,
  };
}

function createTeam(teamId: number, name: string, skill = 50, weatherResist = 0): TeamSetup {
  const lineup: MatchPlayer[] = [
    createPlayer(teamId * 100 + 1, "GK", skill),
    createPlayer(teamId * 100 + 2, "DEF", skill),
    createPlayer(teamId * 100 + 3, "DEF", skill),
    createPlayer(teamId * 100 + 4, "DEF", skill),
    createPlayer(teamId * 100 + 5, "DEF", skill),
    createPlayer(teamId * 100 + 6, "MID", skill),
    createPlayer(teamId * 100 + 7, "MID", skill),
    createPlayer(teamId * 100 + 8, "MID", skill),
    createPlayer(teamId * 100 + 9, "MID", skill),
    createPlayer(teamId * 100 + 10, "FWD", skill),
    createPlayer(teamId * 100 + 11, "FWD", skill),
  ];

  return {
    teamId,
    teamName: name,
    lineup,
    subs: [
      createPlayer(teamId * 100 + 12, "DEF", skill),
      createPlayer(teamId * 100 + 13, "MID", skill),
      createPlayer(teamId * 100 + 14, "FWD", skill),
    ],
    tactic: "balanced",
    formation: "4-4-2",
    weatherResist,
  };
}

describe("vliv počasí na simulaci", () => {
  it("WEATHER_MODS obsahuje definice pro všech 5 typů počasí", () => {
    const weathers: Weather[] = ["sunny", "cloudy", "rain", "wind", "snow"];
    for (const w of weathers) {
      const mod = WEATHER_MODS[w];
      expect(mod).toBeDefined();
      expect(mod.conditionDrainMod).toBeGreaterThanOrEqual(1.0);
      expect(mod.gkHandlingMod).toBeLessThanOrEqual(1.0);
      expect(mod.injuryMod).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("sníh způsobuje vyšší úbytek kondice než zataženo bez zimní výbavy", () => {
    const N = 40;
    let cloudyFinalCond = 0;
    let snowFinalCond = 0;

    for (let i = 0; i < N; i++) {
      const rng1 = createRng(1000 + i);
      const homeCloudy = createTeam(1, "TJ Sokol");
      const awayCloudy = createTeam(2, "SK Lhota");
      simulateMatch(rng1, { home: homeCloudy, away: awayCloudy, weather: "cloudy", isHomeAdvantage: false });
      cloudyFinalCond += homeCloudy.lineup.reduce((s, p) => s + p.condition, 0) / homeCloudy.lineup.length;

      const rng2 = createRng(1000 + i);
      const homeSnow = createTeam(1, "TJ Sokol");
      const awaySnow = createTeam(2, "SK Lhota");
      simulateMatch(rng2, { home: homeSnow, away: awaySnow, weather: "snow", isHomeAdvantage: false });
      snowFinalCond += homeSnow.lineup.reduce((s, p) => s + p.condition, 0) / homeSnow.lineup.length;
    }

    const avgCloudy = cloudyFinalCond / N;
    const avgSnow = snowFinalCond / N;

    // Hráči na sněhu by měli být znatelně vyčerpanější (nižší zbývající kondice)
    expect(avgSnow).toBeLessThan(avgCloudy);
  });

  it("zimní výbava (weatherResist) tlumí úbytek kondice na sněhu", () => {
    const N = 40;
    let noGearFinalCond = 0;
    let gearFinalCond = 0;

    for (let i = 0; i < N; i++) {
      const rng1 = createRng(2000 + i);
      const homeNoGear = createTeam(1, "TJ Sokol", 50, 0);
      const awayNoGear = createTeam(2, "SK Lhota", 50, 0);
      simulateMatch(rng1, { home: homeNoGear, away: awayNoGear, weather: "snow", isHomeAdvantage: false });
      noGearFinalCond += homeNoGear.lineup.reduce((s, p) => s + p.condition, 0) / homeNoGear.lineup.length;

      const rng2 = createRng(2000 + i);
      const homeGear = createTeam(1, "TJ Sokol", 50, 0.40); // 40% zimní resistence
      const awayGear = createTeam(2, "SK Lhota", 50, 0.40);
      simulateMatch(rng2, { home: homeGear, away: awayGear, weather: "snow", isHomeAdvantage: false });
      gearFinalCond += homeGear.lineup.reduce((s, p) => s + p.condition, 0) / homeGear.lineup.length;
    }

    const avgNoGear = noGearFinalCond / N;
    const avgGear = gearFinalCond / N;

    // Tým se zimní výbavou má po zápase na sněhu vyšší průměrnou kondici
    expect(avgGear).toBeGreaterThan(avgNoGear);
  });

  it("v dešti a na sněhu vznikají dorážky (scramble) a vyražené kluzké míče", () => {
    const N = 100;
    let spillsAndScrambles = 0;

    for (let i = 0; i < N; i++) {
      const rng = createRng(3000 + i);
      const home = createTeam(1, "TJ Sokol", 55);
      const away = createTeam(2, "SK Lhota", 55);
      const res = simulateMatch(rng, { home, away, weather: "snow", isHomeAdvantage: false });
      const matchSpills = res.events.filter((e) => e.source === "scramble" || (e.detail === "save" && e.description.includes("kluzký")));
      spillsAndScrambles += matchSpills.length;
    }

    // Za 100 zápasů na sněhu by se mělo objevit desítky vyražených kluzkých míčů či dorážek
    expect(spillsAndScrambles).toBeGreaterThan(5);
  });

  it("komentářový systém správně formátuje hlášky o počasí", () => {
    const rng = createRng(42);
    const slipCommentary = generateCommentary(
      rng,
      {
        minute: 23,
        type: "special",
        playerId: 102,
        playerName: "Josef Novák",
        teamId: 1,
        description: "Josef Novák na zasněženém terénu nečekaně podklouzl!",
        detail: "weather_slip",
      },
      "TJ Sokol",
      "SK Lhota",
      0,
      0
    );

    expect(slipCommentary).toContain("podklouzl");

    const puddleCommentary = generateCommentary(
      rng,
      {
        minute: 37,
        type: "special",
        playerId: 106,
        playerName: "Karel Dvořák",
        teamId: 1,
        description: "Přihrávka do běhu se zastavila v hluboké kaluži na vápně!",
        detail: "weather_puddle",
      },
      "TJ Sokol",
      "SK Lhota",
      1,
      0
    );

    expect(puddleCommentary).toContain("kaluži");
  });

  it("zimní výbava (weatherResist) snižuje počet podklouznutí na sněhu", () => {
    const N = 200;
    let noGearSlips = 0;
    let gearSlips = 0;

    for (let i = 0; i < N; i++) {
      const rng1 = createRng(4000 + i);
      const h1 = createTeam(1, "TJ Sokol", 50, 0);
      const a1 = createTeam(2, "SK Lhota", 50, 0);
      const res1 = simulateMatch(rng1, { home: h1, away: a1, weather: "snow", isHomeAdvantage: false });
      noGearSlips += res1.events.filter((e) => e.detail === "weather_slip").length;

      const rng2 = createRng(4000 + i);
      const h2 = createTeam(1, "TJ Sokol", 50, 0.70); // 70% zimní resistence
      const a2 = createTeam(2, "SK Lhota", 50, 0.70);
      const res2 = simulateMatch(rng2, { home: h2, away: a2, weather: "snow", isHomeAdvantage: false });
      gearSlips += res2.events.filter((e) => e.detail === "weather_slip").length;
    }

    expect(noGearSlips).toBeGreaterThan(gearSlips);
  });

  it("v dešti na podmáčeném trávníku vznikají loužové incidenty", () => {
    const N = 100;
    let puddles = 0;

    for (let i = 0; i < N; i++) {
      const rng = createRng(5000 + i);
      const h = createTeam(1, "TJ Sokol", 50);
      const a = createTeam(2, "SK Lhota", 50);
      const res = simulateMatch(rng, { home: h, away: a, weather: "rain", pitchCondition: 40, isHomeAdvantage: false });
      puddles += res.events.filter((e) => e.detail === "weather_puddle").length;
    }

    expect(puddles).toBeGreaterThan(0);
  });
});

describe("jistota rukou brankáře podle počasí", () => {
  /**
   * gkHandlingMod už jednou tiše umřel: hodnoty ve WEATHER_MODS zůstaly naladěné,
   * ale nikdo je nečetl a v dešti se chytalo stejně jako v suchu. Tenhle test hlídá,
   * že číslo skutečně vstupuje do gólové pravděpodobnosti.
   */
  function goalProbWith(handling: number): number {
    const attacker = createPlayer(1, "FWD", 60);
    const gk = createPlayer(2, "GK", 60);
    return calcGoalProb(createRng(99), attacker, gk, 55, 40, 0, handling);
  }

  it("kluzký míč zvedá šanci na gól — hodnota se opravdu čte", () => {
    const sucho = goalProbWith(1.0);
    const dest = goalProbWith(WEATHER_MODS.rain.gkHandlingMod);
    const snih = goalProbWith(WEATHER_MODS.snow.gkHandlingMod);

    expect(dest).toBeGreaterThan(sucho);
    expect(snih).toBeGreaterThan(dest);
  });

  it("v suchu je výchozí hodnota neutrální", () => {
    expect(goalProbWith(WEATHER_MODS.sunny.gkHandlingMod)).toBe(goalProbWith(1.0));
  });

  it("zimní výbava postih brankáři tlumí", () => {
    const N = 200;
    let bezVybavy = 0;
    let sVybavou = 0;

    for (let i = 0; i < N; i++) {
      const r1 = simulateMatch(createRng(6000 + i), {
        home: createTeam(1, "TJ Sokol", 50, 0), away: createTeam(2, "SK Lhota", 50, 0),
        weather: "snow", isHomeAdvantage: false,
      });
      bezVybavy += r1.events.filter((e) => e.detail === "save" && e.description.includes("kluzký")).length;

      const r2 = simulateMatch(createRng(6000 + i), {
        home: createTeam(1, "TJ Sokol", 50, 0.45), away: createTeam(2, "SK Lhota", 50, 0.45),
        weather: "snow", isHomeAdvantage: false,
      });
      sVybavou += r2.events.filter((e) => e.detail === "save" && e.description.includes("kluzký")).length;
    }

    expect(bezVybavy).toBeGreaterThan(sVybavou);
  });
});
