/**
 * AI klub a domácí pomezní (F15): volí model, kód hlídá meze, bez modelu rozhodne pravidlo.
 */
import { describe, expect, it } from "vitest";
import type { MatchPlayer } from "../engine/types";
import { LINESMAN_BIAS_LIMIT } from "../referees/linesman";
import {
  assembleLineup, fallbackMatchDecision, matchDecisionSchema, renderMatchPrompt, slotRatings, validateMatchDecision,
  type MatchContext, type Slot, type SquadPlayer,
} from "./match-decision";
import { generateAiProfile, type AiCoachProfile } from "./profile";

function enginePlayer(i: number, position: Slot, level: number): MatchPlayer {
  return {
    id: i, firstName: `Jan${i}`, lastName: `Novák${i}`, nickname: null, position,
    speed: level, technique: level, shooting: level, passing: level, heading: level,
    defense: level, goalkeeping: position === "GK" ? level + 15 : 10,
    stamina: level, strength: level, vision: level, creativity: level, setPieces: level,
    discipline: 50, alcohol: 30, temper: 40, leadership: 30 + i, workRate: 50, aggression: 50,
    consistency: 50, clutch: 50, experience: 40, age: 22 + (i % 10),
    preferredFoot: "right", preferredSide: "center", condition: 100, morale: 50,
  };
}

const POSITIONS: Slot[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "DEF"];

function squad(): SquadPlayer[] {
  return POSITIONS.map((pos, idx) => {
    const i = idx + 1;
    const engine = enginePlayer(i, pos, 60 - idx);
    return {
      key: `P${i}`, id: `player-${i}`, name: `Jan${i} Novák${i}`, position: pos, age: engine.age ?? 25, rating: 60 - idx,
      condition: 100, morale: 50, form: 6.5, appearances: 3, leadership: engine.leadership, aggression: 50,
      setPieces: engine.setPieces, shooting: engine.shooting, oneYellowFromBan: false, slotRating: slotRatings(engine), engine,
    };
  });
}

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("team-test", null), ...over };
}

const CANDIDATES: NonNullable<MatchContext["linesman"]>["candidates"] = [
  { key: "L1", kind: "fan_leader", id: "fl-1", name: "Pepa Bubeník", note: "fan leader of Prales Boys" },
  { key: "L2", kind: "player", id: "player-21", name: "Zraněný Hráč", note: "injured player" },
];

function context(over: Partial<MatchContext> = {}): MatchContext {
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
    squad: squad(),
    unavailable: [{ key: "P21", id: "player-21", name: "Zraněný Hráč", position: "MID", reason: "injured" }],
    currentRoles: { penaltyTakerId: null, freekickTakerId: null },
    lastLineup: null,
    linesman: { candidates: CANDIDATES, homerUses: 0, limit: LINESMAN_BIAS_LIMIT },
    ...over,
  };
}

function squadIds(ctx: MatchContext): Set<string> {
  return new Set([...ctx.squad.map((p) => p.id), ...ctx.unavailable.map((p) => p.id)]);
}

function modelAnswer(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P3", rest: [], mustStart: [],
    penaltyTaker: "P13", freekickTaker: "P8", plan: [], reasoning: "test", linesman: "L1", linesmanStyle: "homer", ...over,
  };
}

describe("domácí pomezní AI klubu bez modelu (pravidlo)", () => {
  it("odvážný trenér postaví k čáře nadržujícího vůdce kotle", () => {
    const ctx = context({ profile: profile({ risk: 85 }) });
    const d = fallbackMatchDecision(ctx);
    expect(d.linesman).toEqual({ key: "L1", style: "homer" });
    expect(assembleLineup(ctx, d, squadIds(ctx)).linesman).toEqual({ kind: "fan_leader", id: "fl-1", style: "homer" });
  });

  it("opatrný trenér postaví poctivého pomezního, radši hráče mimo zápas", () => {
    const ctx = context({ profile: profile({ risk: 20 }) });
    expect(fallbackMatchDecision(ctx).linesman).toEqual({ key: "L2", style: "fair" });
  });

  it("pravidlo nenasadí nadržujícího, když by za něj přišla pokuta", () => {
    const ctx = context({ profile: profile({ risk: 95 }), linesman: { candidates: CANDIDATES, homerUses: LINESMAN_BIAS_LIMIT - 1, limit: LINESMAN_BIAS_LIMIT } });
    expect(fallbackMatchDecision(ctx).linesman?.style).toBe("fair");
  });

  it("venku, v poháru a bez kandidátů pomezního neřeší", () => {
    const away = context({ linesman: undefined });
    expect(fallbackMatchDecision(away).linesman).toBeUndefined();
    expect(assembleLineup(away, fallbackMatchDecision(away), squadIds(away)).linesman).toBeUndefined();
    const empty = context({ linesman: { candidates: [], homerUses: 0, limit: LINESMAN_BIAS_LIMIT } });
    expect(fallbackMatchDecision(empty).linesman).toBeNull();
  });
});

describe("domácí pomezní AI klubu přes model", () => {
  it("schéma nabízí pomezního jen domácímu ligovému zápasu s kandidáty", () => {
    const schema = matchDecisionSchema(context()) as { properties: Record<string, { enum?: string[] }>; required: string[] };
    expect(schema.properties.linesman.enum).toEqual(["L1", "L2", "none"]);
    expect(schema.properties.linesmanStyle.enum).toEqual(["fair", "homer"]);
    expect(schema.required).toContain("linesman");
    const away = matchDecisionSchema(context({ linesman: undefined })) as { properties: Record<string, unknown>; required: string[] };
    expect(away.properties.linesman).toBeUndefined();
    expect(away.required).not.toContain("linesman");
  });

  it("prompt vysvětlí pomezního, sankci a kolikrát už letos nadržoval", () => {
    const text = renderMatchPrompt(context({ linesman: { candidates: CANDIDATES, homerUses: 2, limit: LINESMAN_BIAS_LIMIT } }));
    expect(text).toContain("HOME LINESMAN");
    expect(text).toContain("L1");
    expect(text).toContain("2 time");
    expect(renderMatchPrompt(context({ linesman: undefined }))).not.toContain("HOME LINESMAN");
  });

  it("volba modelu projde a sestava nese pomezního", () => {
    const ctx = context();
    const check = validateMatchDecision(modelAnswer(), ctx);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.decision.linesman).toEqual({ key: "L1", style: "homer" });
    expect(assembleLineup(ctx, check.decision, squadIds(ctx)).linesman).toEqual({ kind: "fan_leader", id: "fl-1", style: "homer" });
  });

  it("„none“ znamená bez pomezního, neznámý kandidát se zahodí a rozhodnutí neshodí", () => {
    const none = validateMatchDecision(modelAnswer({ linesman: "none" }), context());
    expect(none.ok && none.decision.linesman).toBeNull();
    const unknown = validateMatchDecision(modelAnswer({ linesman: "L9" }), context());
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.decision.linesman).toBeNull();
    expect(unknown.rejected.some((r) => r.includes("pomezní"))).toBe(true);
    const badStyle = validateMatchDecision(modelAnswer({ linesmanStyle: "bribed" }), context());
    expect(badStyle.ok && badStyle.decision.linesman).toEqual({ key: "L1", style: "fair" });
  });

  it("když model pomezního vynechá, rozhodne pravidlo", () => {
    const ctx = context({ profile: profile({ risk: 20 }) });
    const answer = modelAnswer();
    delete answer.linesman;
    delete answer.linesmanStyle;
    const check = validateMatchDecision(answer, ctx);
    expect(check.ok && check.decision.linesman).toEqual(fallbackMatchDecision(ctx).linesman);
  });

  it("venku model pomezního nevolí, ani když ho pošle", () => {
    const check = validateMatchDecision(modelAnswer(), context({ linesman: undefined }));
    expect(check.ok && check.decision.linesman).toBeUndefined();
  });
});
