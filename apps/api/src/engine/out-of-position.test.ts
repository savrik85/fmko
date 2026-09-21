/**
 * Sestava bez přirozeného záložníka nebo obránce.
 *
 * Engine dřív hledal záložníky a obránce podle PŘIROZENÉ pozice a průměr
 * z prázdného výběru vyšel NaN. Bez přirozeného záložníka pak vyšlo NaN držení
 * a míč měli hosté všech 90 minut — i když záložníci chyběli jim. Bez
 * přirozeného obránce vyšla NaN pravděpodobnost gólu a tým ze hry, z přímáku
 * ani z brejku nikdy neinkasoval. Na produkci to potkalo zhruba 14 zápasů.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { createTeam } from "./test-helpers/lineup";
import type { MatchPlayer, TeamSetup } from "./types";

const SLOW = 120_000;
const MATCHES = 300;

/** Obsadí všechny sloty `slot` hráči s přirozenou pozicí `natural` (ti v poli pak hrají mimo pozici). */
function withoutNatural(team: TeamSetup, slot: MatchPlayer["position"], natural: MatchPlayer["position"]): TeamSetup {
  for (const p of team.lineup) {
    if ((p.matchPosition ?? p.position) === slot) {
      p.position = natural;
      p.matchPosition = slot;
    }
  }
  return team;
}

function run(build: () => { home: TeamSetup; away: TeamSetup }) {
  let homeGoals = 0, awayGoals = 0, possSum = 0, nanPossession = 0, awayOpenPlay = 0;
  for (let i = 0; i < MATCHES; i++) {
    const { home, away } = build();
    const r = simulateMatch(createRng(7000 + i), { home, away, weather: "cloudy", isHomeAdvantage: true });
    homeGoals += r.homeScore;
    awayGoals += r.awayScore;
    if (Number.isFinite(r.possessionHome)) possSum += r.possessionHome; else nanPossession++;
    awayOpenPlay += r.events.filter((e) => e.type === "goal" && e.teamId === 2 && e.source === "open_play").length;
  }
  return {
    homeGoals: homeGoals / MATCHES,
    awayGoals: awayGoals / MATCHES,
    possessionHome: possSum / Math.max(1, MATCHES - nanPossession),
    nanPossession,
    awayOpenPlay,
  };
}

describe("sestava bez přirozeného záložníka nebo obránce", () => {
  it("domácí bez přirozeného záložníka: držení je číslo a domácí nejsou bez míče", () => {
    const r = run(() => ({ home: withoutNatural(createTeam(1, "H"), "MID", "DEF"), away: createTeam(2, "A") }));
    expect(r.nanPossession).toBe(0);
    // Dřív 0,24 gólu na zápas — domácí se k míči vůbec nedostali.
    expect(r.homeGoals).toBeGreaterThan(1.5);
  }, SLOW);

  it("hosté bez přirozeného záložníka: míč nedostanou zadarmo oni", () => {
    const r = run(() => ({ home: createTeam(1, "H"), away: withoutNatural(createTeam(2, "A"), "MID", "DEF") }));
    expect(r.nanPossession).toBe(0);
    // Dřív hosté drželi míč celý zápas a vyhrávali 3,4 : 0,2.
    expect(r.possessionHome).toBeGreaterThan(50);
    expect(r.homeGoals).toBeGreaterThan(r.awayGoals);
  }, SLOW);

  it("domácí bez přirozeného obránce: dostávají góly i ze hry", () => {
    const r = run(() => ({ home: withoutNatural(createTeam(1, "H"), "DEF", "MID"), away: createTeam(2, "A") }));
    // Dřív hosté ze hry nedali ani jeden gól a v průměru jen 0,69 celkem.
    expect(r.awayOpenPlay).toBeGreaterThan(0);
    expect(r.awayGoals).toBeGreaterThan(1.5);
  }, SLOW);
});
