import { describe, expect, it } from "vitest";
import type { MatchPlayer } from "../engine/types";
import { decideMatch } from "./match";
import {
  assembleLineup, fallbackMatchDecision, pickEleven, renderMatchPrompt, slotRatings, validateMatchDecision,
  type MatchContext, type Slot, type SquadPlayer,
} from "./match-decision";
import { generateAiProfile, type AiCoachProfile } from "./profile";

function enginePlayer(i: number, position: Slot, level: number): MatchPlayer {
  const gk = position === "GK";
  return {
    id: i, firstName: `Jan${i}`, lastName: `Novák${i}`, nickname: null, position,
    speed: level, technique: level, shooting: position === "FWD" ? level + 8 : level - 5, passing: level,
    heading: level, defense: position === "DEF" ? level + 8 : level - 8, goalkeeping: gk ? level + 15 : 10,
    stamina: level, strength: level, vision: level, creativity: level, setPieces: i === 9 ? 70 : level,
    discipline: 50, alcohol: 30, temper: 40, leadership: i === 5 ? 80 : 30 + (i % 7) * 4, workRate: 50, aggression: 50,
    consistency: 50, clutch: 50, experience: 40, age: 20 + (i % 15),
    preferredFoot: "right", preferredSide: "center", condition: 100, morale: 50,
  };
}

const POSITIONS: Slot[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD", "MID", "DEF"];

function squad(overrides: Partial<Record<number, Partial<SquadPlayer>>> = {}): SquadPlayer[] {
  return POSITIONS.map((pos, idx) => {
    const i = idx + 1;
    const level = 60 - idx;
    const engine = enginePlayer(i, pos, level);
    const base: SquadPlayer = {
      key: `P${i}`, id: `player-${i}`, name: `Jan${i} Novák${i}`, position: pos, age: engine.age ?? 25, rating: level,
      condition: 100, morale: 50, form: 6.5, appearances: 3, leadership: engine.leadership, aggression: 50,
      setPieces: engine.setPieces, shooting: engine.shooting, oneYellowFromBan: false, slotRating: slotRatings(engine), engine,
    };
    return { ...base, ...(overrides[i] ?? {}) };
  });
}

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("team-test", null), ...over };
}

function context(over: Partial<MatchContext> = {}, squadOver: Partial<Record<number, Partial<SquadPlayer>>> = {}): MatchContext {
  return {
    teamId: "team-test",
    teamName: "Sokol Zkušební",
    fixture: { kind: "league", calendarId: "cal-1", isHome: true, opponentName: "Slavoj Soupeř", label: "round 3", isDerby: false, stake: 0 },
    own: { position: 5, teams: 14, points: 9, form: "WDLWW", strength: 52 },
    opponent: { position: 7, form: "LLWDW", strength: 50, bigClub: false },
    refereeStrictness: 50,
    weather: "cloudy",
    pitchCondition: 70,
    daysToNextMatch: 3,
    familiarity: { "4-4-2": 80 },
    profile: profile(),
    squad: squad(squadOver),
    unavailable: [{ key: "P21", id: "player-21", name: "Zraněný Hráč", position: "MID", reason: "injured" }],
    currentRoles: { penaltyTakerId: null, freekickTakerId: null },
    lastLineup: null,
    ...over,
  };
}

function squadIds(ctx: MatchContext): Set<string> {
  return new Set([...ctx.squad.map((p) => p.id), ...ctx.unavailable.map((p) => p.id)]);
}

function expectLegalLineup(ctx: MatchContext, lineup: ReturnType<typeof assembleLineup>) {
  expect(lineup.players).toHaveLength(11);
  expect(lineup.players.filter((p) => p.matchPosition === "GK")).toHaveLength(1);
  expect(new Set(lineup.players.map((p) => p.playerId)).size).toBe(11);
  const available = new Set(ctx.squad.map((p) => p.id));
  for (const p of lineup.players) expect(available.has(p.playerId)).toBe(true);
  expect(lineup.bench.length).toBeLessThanOrEqual(7);
  for (const b of lineup.bench) expect(lineup.players.some((p) => p.playerId === b)).toBe(false);
  if (lineup.captainId) expect(lineup.players.some((p) => p.playerId === lineup.captainId)).toBe(true);
}

describe("jedenáctka podle formace", () => {
  it("4-3-3 postaví 1 brankáře, 4 obránce, 3 záložníky a 3 útočníky z přirozených postů", () => {
    const { picks } = pickEleven(squad(), "4-3-3");
    const count = (s: Slot) => picks.filter((x) => x.slot === s).length;
    expect([count("GK"), count("DEF"), count("MID"), count("FWD")]).toEqual([1, 4, 3, 3]);
    expect(picks.every((x) => x.player.position === x.slot)).toBe(true);
  });

  it("šetřený hráč nehraje, hráč s přednostní šancí hraje", () => {
    const { picks } = pickEleven(squad(), "4-4-2", { exclude: new Set(["P3"]), include: ["P20"] });
    const keys = picks.map((x) => x.player.key);
    expect(keys).not.toContain("P3");
    expect(keys).toContain("P20");
  });
});

describe("kontrola rozhodnutí modelu", () => {
  const valid = {
    formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P5", rest: [], mustStart: [],
    penaltyTaker: "P9", freekickTaker: "P9", reasoning: "solid",
    plan: [{ fromMinute: 60, when: "losing", byAtLeast: 1, action: "tactic", tactic: "offensive" }],
  };

  it("platné rozhodnutí projde", () => {
    const r = validateMatchDecision(valid, context());
    expect(r.ok).toBe(true);
  });

  it("neexistující hráč shodí celé rozhodnutí", () => {
    expect(validateMatchDecision({ ...valid, captain: "P99" }, context()).ok).toBe(false);
    expect(validateMatchDecision({ ...valid, mustStart: ["P77"] }, context()).ok).toBe(false);
  });

  it("zraněný hráč (mimo dostupné) neprojde", () => {
    expect(validateMatchDecision({ ...valid, mustStart: ["P21"] }, context()).ok).toBe(false);
  });

  it("neznámá formace nebo taktika neprojde", () => {
    expect(validateMatchDecision({ ...valid, formation: "2-3-5" }, context()).ok).toBe(false);
    expect(validateMatchDecision({ ...valid, tactic: "tiki_taka" }, context()).ok).toBe(false);
  });

  it("chybný pokyn na lavičce se jen zahodí", () => {
    const r = validateMatchDecision({ ...valid, plan: [{ fromMinute: 95, when: "losing", action: "tactic", tactic: "offensive" }] }, context());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.decision.plan).toHaveLength(0);
      expect(r.rejected.length).toBeGreaterThan(0);
    }
  });
});

describe("sestava z rozhodnutí", () => {
  it("odpověď modelu s neexistujícím hráčem: rozhodne náhradní pravidlo, sestava je platná", async () => {
    const ctx = context();
    const env = {
      AI: { run: async () => ({ choices: [{ message: { content: JSON.stringify({ formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P42", rest: [], mustStart: [], plan: [], reasoning: "x" }) } }] }) } as unknown as Ai,
    };
    const decided = await decideMatch(env, ctx, { useModel: true });
    expect(decided.used).toBe("fallback");
    expect(decided.error).toContain("P42");
    const lineup = assembleLineup(ctx, decided.decision, squadIds(ctx));
    expectLegalLineup(ctx, lineup);
  });

  it("platná odpověď modelu: formace, kapitán a pokyny se použijí", async () => {
    const ctx = context();
    const env = {
      AI: {
        run: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                formation: "4-3-3", tactic: "pressing", hardness: "fair", captain: "P5", rest: ["P3"], mustStart: ["P20"],
                penaltyTaker: "P15", freekickTaker: "P9", reasoning: "press them",
                plan: [{ fromMinute: 65, when: "tired", below: 40, action: "sub", out: "P15", in: "P18" }],
              }),
            },
          }],
        }),
      } as unknown as Ai,
    };
    const decided = await decideMatch(env, ctx, { useModel: true });
    expect(decided.used).toBe("model");
    const lineup = assembleLineup(ctx, decided.decision, squadIds(ctx));
    expectLegalLineup(ctx, lineup);
    expect(lineup.formation).toBe("4-3-3");
    expect(lineup.players.some((p) => p.playerId === "player-3")).toBe(false);
    expect(lineup.players.some((p) => p.playerId === "player-20")).toBe(true);
    expect(lineup.captainId).toBe("player-5");
    expect(lineup.matchPlan).toHaveLength(1);
    expect(lineup.bench).toContain("player-18");
  });

  it("náhradní pravidlo dá vždy platnou sestavu, i s unavenými a mladými hráči", () => {
    for (const p of [profile({ youthFocus: 90, risk: 10 }), profile({ youthFocus: 10, risk: 95 }), profile()]) {
      for (const kind of ["league", "cup", "friendly"] as const) {
        const ctx = context({ profile: p, fixture: { ...context().fixture, kind } }, { 3: { condition: 35 }, 9: { condition: 40 } });
        const d = fallbackMatchDecision(ctx);
        const lineup = assembleLineup(ctx, d, squadIds(ctx));
        expectLegalLineup(ctx, lineup);
        expect(lineup.matchPlan.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("náhradní pravidlo je deterministické", () => {
    expect(fallbackMatchDecision(context())).toEqual(fallbackMatchDecision(context()));
  });

  it("prompt obsahuje nabídku formací, dostupné hráče a ne zraněné mezi dostupnými", () => {
    const text = renderMatchPrompt(context());
    expect(text).toContain("FORMATION OPTIONS");
    expect(text).toContain("P1 GK");
    expect(text).toContain("UNAVAILABLE (cannot play): P21 MID injured");
  });
});

describe("slib místa v sestavě (nespokojený hráč)", () => {
  it("slíbený hráč hraje od začátku, i když ho model šetří, a stáhnout ho jde až po poločase", () => {
    // P19 (záložník 42) by se do základu jinak nedostal.
    const plain = assembleLineup(context(), fallbackMatchDecision(context()), squadIds(context()));
    expect(plain.players.some((p) => p.playerId === "player-19")).toBe(false);

    const ctx = context({ promisedStarters: ["P19"] });
    const decision = {
      ...fallbackMatchDecision(ctx),
      rest: ["P19"],
      mustStart: [],
      plan: [
        { fromMinute: 30, when: "minute" as const, action: "sub" as const, out: "P19", in: "P13" },
        { fromMinute: 60, when: "minute" as const, action: "sub" as const, out: "P19", in: "P13" },
      ],
    };
    const lineup = assembleLineup(ctx, decision, squadIds(ctx));
    expectLegalLineup(ctx, lineup);
    expect(lineup.players.some((p) => p.playerId === "player-19")).toBe(true);
    expect(lineup.matchPlan.map((r) => r.fromMinute)).toEqual([60]);
    expect(lineup.notes.join(" ")).toContain("slíbený hráč musí odehrát aspoň 45 minut");
    // Náhradní pravidlo slíbeného hráče nešetří a počítá s ním, model o slibu ví z promptu.
    expect(fallbackMatchDecision(ctx).mustStart[0]).toBe("P19");
    expect(renderMatchPrompt(ctx)).toContain("PROMISES: you promised P19 a starting place");
  });
});

describe("kapitán klubu (páska z dohody s nespokojeným hráčem)", () => {
  it("když hraje od začátku, pásku nosí on, ať model chce kohokoli", () => {
    // P3 (obránce 58) hraje v základu, model by kapitánem udělal brankáře P1.
    const ctx = context({ clubCaptain: "P3" });
    const lineup = assembleLineup(ctx, { ...fallbackMatchDecision(ctx), captain: "P1" }, squadIds(ctx));
    expectLegalLineup(ctx, lineup);
    expect(lineup.players.some((p) => p.playerId === "player-3")).toBe(true);
    expect(lineup.captainId).toBe("player-3");
    expect(lineup.notes.join(" ")).toContain("kapitán klubu P3 hraje, pásku nosí on");
    expect(fallbackMatchDecision(ctx).captain).toBe("P3");
    expect(renderMatchPrompt(ctx)).toContain("CAPTAIN: P3 is your club captain.");
  });

  it("když nehraje (šetří se, je zraněný), kapitána vybírá model", () => {
    const ctx = context({ clubCaptain: "P3" });
    const rested = assembleLineup(ctx, { ...fallbackMatchDecision(ctx), rest: ["P3"], captain: "P1" }, squadIds(ctx));
    expect(rested.players.some((p) => p.playerId === "player-3")).toBe(false);
    expect(rested.captainId).toBe("player-1");

    const injured = context({ clubCaptain: "P21" });
    expect(assembleLineup(injured, { ...fallbackMatchDecision(injured), captain: "P1" }, squadIds(injured)).captainId).toBe("player-1");
    expect(renderMatchPrompt(injured)).toContain("CAPTAIN: your club captain P21 cannot play today");
  });
});
