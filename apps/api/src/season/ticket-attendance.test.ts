import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ticketPriceAttendanceFactor } from "./finance-processor";

/**
 * Pravidlo majitele hry: do obvyklé ceny obce přijdou všichni jako dřív, nad ní lidí
 * ubývá a od trojnásobku nepřijde nikdo. Dřív cena do návštěvy nevstupovala vůbec,
 * takže vstupné 500 Kč znamenalo šestnáctkrát vyšší tržbu za pouhé −2 spokojenosti.
 */
describe("ticketPriceAttendanceFactor", () => {
  it("bez vlastní ceny (0 = sazba obce) přijdou všichni", () => {
    expect(ticketPriceAttendanceFactor(0, 30)).toBe(1);
  });

  it("do obvyklé ceny obce přijdou všichni, levnější vstupné nikoho nepřidá", () => {
    expect(ticketPriceAttendanceFactor(30, 30)).toBe(1);
    expect(ticketPriceAttendanceFactor(10, 30)).toBe(1);
  });

  it("nad obvyklou cenou lidí ubývá", () => {
    expect(ticketPriceAttendanceFactor(36, 30)).toBeCloseTo(0.9, 10);
    expect(ticketPriceAttendanceFactor(45, 30)).toBeCloseTo(0.75, 10);
    expect(ticketPriceAttendanceFactor(60, 30)).toBeCloseTo(0.5, 10);
    expect(ticketPriceAttendanceFactor(80, 40)).toBeCloseTo(0.5, 10);
  });

  it("od trojnásobku nepřijde nikdo", () => {
    expect(ticketPriceAttendanceFactor(90, 30)).toBe(0);
    expect(ticketPriceAttendanceFactor(60, 20)).toBe(0);
    expect(ticketPriceAttendanceFactor(500, 50)).toBe(0);
  });

  it("bez sazby obce cenu nehodnotí", () => {
    expect(ticketPriceAttendanceFactor(100, 0)).toBe(1);
  });
});

/**
 * Návštěvu s placeným vstupným počítají tři cesty: liga, domácí pohár a přátelák
 * (u přáteláku se vstupné vybírá taky, viz processMatchDayFinances). Když jedna
 * z nich cenu vynechá, přemrštěné vstupné se přesune tam.
 */
const RUNNERS = [
  { label: "ligový", file: "multiplayer/match-runner.ts" },
  { label: "pohárový", file: "cup/cup.ts" },
  { label: "přátelácký", file: "multiplayer/friendly-runner.ts" },
];

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf-8");

describe.each(RUNNERS)("$label runner počítá s cenou vstupného", ({ file }) => {
  it("návštěvu násobí faktorem ceny vstupného", () => {
    expect(/ticketPriceAttendanceFactor|loadTicketAttendanceFactor/.test(source(file))).toBe(true);
  });
});
