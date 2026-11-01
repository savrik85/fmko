import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@okresni-masina/shared";
import { buildMatchSummary } from "./match-summary";

const player = (id: string, position: string) => ({ id, name: id, position, naturalPosition: position, rating: 50 });
const lineup = (prefix: string, hardness = "normal") => ({
  starters: [
    player(`${prefix}-gk`, "GK"),
    ...[1, 2, 3, 4].map((i) => player(`${prefix}-d${i}`, "DEF")),
    ...[1, 2, 3, 4].map((i) => player(`${prefix}-m${i}`, "MID")),
    ...[1, 2].map((i) => player(`${prefix}-f${i}`, "FWD")),
  ],
  subs: [],
  formation: "4-4-2",
  tactic: "balanced",
  hardness,
  captainId: null,
});

// Události z enginu: hráč má id z enginu (číslo), tým 1 = domácí, 2 = hosté.
const card = (teamId: number, playerId: number, red = false): MatchEvent =>
  ({ minute: 30, type: "card", teamId, playerId, playerName: "x", description: "", detail: red ? "red" : "yellow" }) as MatchEvent;

describe("buildMatchSummary: karty podle strany", () => {
  it("tvrdá hra se čtyřmi kartami domácích ukáže daň za karty", () => {
    const summary = buildMatchSummary({
      homeLineupData: lineup("h", "hard"), awayLineupData: lineup("a"), playerRatings: {},
      events: [card(1, 3), card(1, 4), card(1, 7), card(1, 9), card(2, 15)],
      homeScore: 0, awayScore: 1, isOwnHome: true,
    });
    const hardness = summary?.factors.find((f) => f.label === "Tvrdost hry");
    expect(hardness?.description).toBe("Šli jste do těla a sudí to trestal. 4 karty jsou daň, kterou jste zaplatili.");
    expect(hardness?.impact).toBe("MEDIUM_NEGATIVE");
  });

  it("vyloučení soupeře se ukáže jako disciplína ve prospěch hostů", () => {
    const summary = buildMatchSummary({
      homeLineupData: lineup("h"), awayLineupData: lineup("a"), playerRatings: {},
      events: [card(1, 5, true)],
      homeScore: 0, awayScore: 2, isOwnHome: false,
    });
    const discipline = summary?.factors.find((f) => f.type === "discipline");
    expect(discipline?.description).toBe("Soupeř dostal 1 červenou kartu a ty jsi toho využil.");
  });

  it("vlastní vyloučení se počítá vlastnímu týmu", () => {
    const summary = buildMatchSummary({
      homeLineupData: lineup("h"), awayLineupData: lineup("a"), playerRatings: {},
      events: [card(1, 5, true)],
      homeScore: 0, awayScore: 2, isOwnHome: true,
    });
    const discipline = summary?.factors.find((f) => f.type === "discipline");
    expect(discipline?.impact).toBe("HIGH_NEGATIVE");
  });
});
