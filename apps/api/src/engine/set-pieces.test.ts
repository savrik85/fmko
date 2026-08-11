/**
 * Balanční test standardek.
 *
 * Hlídá, že přepracované standardky (penalty, přímáky, rohy) drží nastavený
 * podíl na gólovosti a že celková gólovost zápasu nevyskočila — tohle je
 * jediné místo, kde se čísla enginu dají chytit dřív, než se rozjedou do ligy.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
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

interface Totals {
  matches: number; goals: number;
  bySource: Record<string, number>;
  corners: number; penalties: number; penaltiesMissed: number;
  directFreekicks: number; crosses: number; fouls: number; events: number;
}

function runSeason(matches: number, level = 50, seedBase = 1000): Totals {
  const t: Totals = {
    matches, goals: 0, bySource: {}, corners: 0, penalties: 0, penaltiesMissed: 0,
    directFreekicks: 0, crosses: 0, fouls: 0, events: 0,
  };

  for (let i = 0; i < matches; i++) {
    const rng = createRng(seedBase + i);
    const result = simulateMatch(rng, {
      home: mkTeam(1, 1, level), away: mkTeam(2, 100, level),
      weather: "sunny", isHomeAdvantage: true,
    });
    t.goals += result.homeScore + result.awayScore;
    t.events += result.events.length;

    for (const e of result.events) {
      switch (e.type) {
        case "goal": {
          const src = e.source ?? "open_play";
          t.bySource[src] = (t.bySource[src] ?? 0) + 1;
          break;
        }
        case "corner": t.corners++; break;
        case "penalty": t.penalties++; break;
        case "freekick": e.detail === "direct" ? t.directFreekicks++ : t.crosses++; break;
        case "foul": t.fouls++; break;
        case "chance":
          if (e.detail === "penalty_missed" || e.detail === "penalty_saved") t.penaltiesMissed++;
          break;
      }
    }
  }
  return t;
}

describe("standardky", () => {
  const t = runSeason(3000);
  const per = (n: number) => n / t.matches;
  const setPieceGoals = (t.bySource.penalty ?? 0) + (t.bySource.freekick ?? 0)
    + (t.bySource.corner ?? 0) + (t.bySource.cross ?? 0);

  it("vypíše rozpad (diagnostika)", () => {
    const rows = [
      ["góly celkem", per(t.goals)], ["  ze hry", per(t.bySource.open_play ?? 0)],
      ["  protiútok", per(t.bySource.counter ?? 0)], ["  penalta", per(t.bySource.penalty ?? 0)],
      ["  přímák", per(t.bySource.freekick ?? 0)], ["  roh", per(t.bySource.corner ?? 0)],
      ["  centr std.", per(t.bySource.cross ?? 0)],
      ["STANDARDKY", per(setPieceGoals)], ["podíl %", (setPieceGoals / t.goals) * 100],
      ["rohy", per(t.corners)], ["penalty", per(t.penalties)],
      ["zahozené pen.", per(t.penaltiesMissed)], ["přímáky", per(t.directFreekicks)],
      ["centry std.", per(t.crosses)], ["fauly", per(t.fouls)], ["událostí", per(t.events)],
    ] as const;
    console.log("\n" + rows.map(([k, v]) => `${k.padEnd(16)} ${v.toFixed(3)}`).join("\n"));
    expect(t.goals).toBeGreaterThan(0);
  });

  // Testovací týmy mají všechny atributy na 50, což dává vyšší gólovost než
  // reálná liga (~3,5) — slabší útočníci reálných týmů proměňují míň. Rozhoduje
  // proto shoda s naměřeným baseline 5,01 gólu ze stavu před přepracováním
  // standardek: přerozdělit góly ano, přidat je ne.
  it("nezvedla celkovou gólovost oproti baseline", () => {
    expect(per(t.goals)).toBeGreaterThan(4.6);
    expect(per(t.goals)).toBeLessThan(5.3);
  });

  it("dává 20–32 % gólů ze standardek", () => {
    const share = setPieceGoals / t.goals;
    expect(share).toBeGreaterThan(0.20);
    expect(share).toBeLessThan(0.32);
  });

  it("nařídí realistický počet penalt s úspěšností kolem 75 %", () => {
    expect(per(t.penalties)).toBeGreaterThan(0.15);
    expect(per(t.penalties)).toBeLessThan(0.40);
    const conversion = (t.penalties - t.penaltiesMissed) / t.penalties;
    expect(conversion).toBeGreaterThan(0.65);
    expect(conversion).toBeLessThan(0.85);
  });

  it("vykope 7–13 rohů na zápas", () => {
    expect(per(t.corners)).toBeGreaterThan(7);
    expect(per(t.corners)).toBeLessThan(13);
  });

  it("gól z přímáku je vzácný, ale existuje", () => {
    expect(t.bySource.freekick ?? 0).toBeGreaterThan(0);
    expect(per(t.bySource.freekick ?? 0)).toBeLessThan(0.30);
  });

  it("silnější tým vykope víc rohů než slabší", () => {
    const weak = runSeason(600, 35, 5000);
    const strong = runSeason(600, 75, 5000);
    expect(strong.corners / strong.matches).toBeGreaterThan(weak.corners / weak.matches);
  });
});

describe("exekutoři standardek", () => {
  /** Kolikrát který hráč domácích kopal danou standardku napříč N zápasy. */
  function takersOf(type: "penalty" | "freekick", setup: (home: TeamSetup) => void): Map<number, number> {
    const takers = new Map<number, number>();
    for (let i = 0; i < 400; i++) {
      const home = mkTeam(1, 1, 50);
      setup(home);
      const result = simulateMatch(createRng(20000 + i), {
        home, away: mkTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false,
      });
      for (const e of result.events) {
        if (e.type === type && e.teamId === 1) takers.set(e.playerId, (takers.get(e.playerId) ?? 0) + 1);
      }
    }
    return takers;
  }

  /** Podíl standardek, které odkopal daný hráč. */
  function shareOf(takers: Map<number, number>, playerId: number): number {
    const total = [...takers.values()].reduce((a, b) => a + b, 0);
    return total === 0 ? 0 : (takers.get(playerId) ?? 0) / total;
  }

  it("respektuje exekutora nastaveného manažerem, i když je nejhorší v týmu", () => {
    // Hráč 11 (FWD) má standardky na dně, ostatní vysoko — bez role by nekopal nikdy
    // Hráč 11 (FWD) má standardky na dně, ostatní vysoko — bez role by nekopal nikdy.
    // Podíl není 100 %, protože se občas zraní nebo je vystřídán.
    const takers = takersOf("penalty", (home) => {
      for (const p of [...home.lineup, ...home.subs]) { p.setPieces = 80; p.stamina = 100; }
      home.lineup.find((p) => p.id === 11)!.setPieces = 10;
      home.penaltyTakerId = 11;
    });
    expect(shareOf(takers, 11)).toBeGreaterThan(0.9);
  });

  it("bez nastavené role kope nejlepší setPieces v sestavě", () => {
    const takers = takersOf("freekick", (home) => {
      for (const p of [...home.lineup, ...home.subs]) { p.setPieces = 30; p.stamina = 100; }
      home.lineup.find((p) => p.id === 7)!.setPieces = 95;
    });
    expect(shareOf(takers, 7)).toBeGreaterThan(0.9);
  });

  it("po vystřídání exekutora převezme standardky někdo jiný", () => {
    // Exekutor s nulovou kondicí je po 60' stažen — od té chvíle musí kopat jiný
    const takers = takersOf("freekick", (home) => {
      for (const p of home.lineup) p.setPieces = 30;
      const taker = home.lineup.find((p) => p.id === 7)!;
      taker.setPieces = 95;
      taker.condition = 1;
      taker.stamina = 1;
      home.freekickTakerId = 7;
    });
    expect(takers.has(7)).toBe(true);
    expect(takers.size).toBeGreaterThan(1);
  });

  it("hlavičkuje po centru někdo jiný než kopající a ten dostane asistenci", () => {
    let checked = 0;
    for (let i = 0; i < 800 && checked < 20; i++) {
      const result = simulateMatch(createRng(30000 + i), {
        home: mkTeam(1, 1, 50), away: mkTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false,
      });
      for (let j = 0; j < result.events.length; j++) {
        const goal = result.events[j];
        if (goal.type !== "goal" || (goal.source !== "corner" && goal.source !== "cross")) continue;
        const kick = result.events.slice(0, j).reverse()
          .find((e) => (e.type === "corner" || e.type === "freekick") && e.teamId === goal.teamId);
        const assist = result.events.slice(j + 1)
          .find((e) => e.type === "assist" && e.minute === goal.minute && e.teamId === goal.teamId);
        expect(kick).toBeDefined();
        expect(goal.playerId).not.toBe(kick!.playerId);
        expect(assist?.playerId).toBe(kick!.playerId);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
