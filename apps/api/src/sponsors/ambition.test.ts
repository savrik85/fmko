/**
 * Očekávané místo a ambice slibů (čisté funkce).
 */
import { describe, expect, it } from "vitest";
import {
  attendanceAmbition, cupRoundAmbition, expectedPosition, expectedWinsPerSeason, leaguePositionAmbition,
  MONTHS_PER_SEASON, noRelegationAmbition, promotionAmbition, sponsorChance,
} from "./ambition";

describe("expectedPosition", () => {
  const strengths = [
    { teamId: "a", strength: 50 }, { teamId: "b", strength: 60 }, { teamId: "c", strength: 40 },
  ];
  it("pořadí podle síly nejlepší jedenáctky", () => {
    expect(expectedPosition(strengths, "b")).toBe(1);
    expect(expectedPosition(strengths, "a")).toBe(2);
    expect(expectedPosition(strengths, "c")).toBe(3);
  });
  it("shodná síla: stabilně podle id", () => {
    const tie = [{ teamId: "z", strength: 50 }, { teamId: "m", strength: 50 }];
    expect(expectedPosition(tie, "m")).toBe(1);
    expect(expectedPosition(tie, "z")).toBe(2);
  });
  it("klub mimo seznam dostane střed tabulky", () => {
    expect(expectedPosition(strengths, "x")).toBe(2);
    expect(expectedPosition([], "x")).toBe(1);
  });
});

describe("ambice", () => {
  it("umístění: cíl nad očekáváním je ambicióznější", () => {
    expect(leaguePositionAmbition(8, 3, 14)).toBeCloseTo(1 + (5 / 14) * 2, 6);
    expect(leaguePositionAmbition(7, 7, 14)).toBe(1);
  });
  it("umístění: ořez 0,3 až 2", () => {
    expect(leaguePositionAmbition(1, 14, 14)).toBe(0.3);
    expect(leaguePositionAmbition(14, 1, 14)).toBe(2);
  });
  it("postup = umístění do 2. místa", () => {
    expect(promotionAmbition(2, 14)).toBe(1);
    expect(promotionAmbition(9, 14)).toBe(2);
  });
  it("nesestup: vyšší, když je klub v ohrožení", () => {
    expect(noRelegationAmbition(14, 14)).toBeCloseTo(1 + (2 / 14) * 2, 6);
    expect(noRelegationAmbition(5, 14)).toBe(0.3);
  });
  it("pohár podle kola", () => {
    expect(cupRoundAmbition(1, 7)).toBe(0.3);
    expect(cupRoundAmbition(4, 7)).toBeCloseTo(0.3 + 1.7 * 3 / 6, 6);
    expect(cupRoundAmbition(7, 7)).toBe(2);
  });
  it("návštěva podle poměru k minulé sezóně, ořez 0,67 až 1,33", () => {
    expect(attendanceAmbition(200, 200)).toBe(1);
    expect(attendanceAmbition(400, 200)).toBe(1.33);
    expect(attendanceAmbition(50, 200)).toBe(0.67);
    expect(attendanceAmbition(100, 0)).toBe(1.33);
  });
});

describe("sponsorChance", () => {
  it("vysoká ambice = nízká šance", () => {
    expect(sponsorChance(0.3)).toBeCloseTo(0.78, 6);
    expect(sponsorChance(1)).toBeCloseTo(0.5, 6);
    expect(sponsorChance(2)).toBeCloseTo(0.1, 6);
  });
});

describe("expectedWinsPerSeason", () => {
  it("favorit vyhraje víc, outsider míň, 26 zápasů ve 14členné lize", () => {
    expect(expectedWinsPerSeason(1, 14)).toBeCloseTo(26 * 0.55, 6);
    expect(expectedWinsPerSeason(14, 14)).toBeCloseTo(26 * 0.2, 6);
  });
  it("sezóna má 16/4,3 měsíce", () => {
    expect(MONTHS_PER_SEASON).toBeCloseTo(3.7209, 4);
  });
});
