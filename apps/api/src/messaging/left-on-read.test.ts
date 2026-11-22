import { describe, expect, it } from "vitest";
import { coachAskedSinceReply, leftOnReadChance, readDelayMs } from "./left-on-read";

const calm = { closing: false, relationship: 60, coachStreak: 1, atWork: false };

describe("přečteno: šance, že hráč jen přečte", () => {
  it("v klidném rozhovoru skoro nikdy, na konci rozhovoru častěji", () => {
    expect(leftOnReadChance(calm)).toBeCloseTo(0.04);
    expect(leftOnReadChance({ ...calm, closing: true })).toBeCloseTo(0.25);
  });

  it("naštvaný hráč, práce a třetí zpráva za sebou šanci zvednou", () => {
    expect(leftOnReadChance({ ...calm, relationship: 20 })).toBeGreaterThan(leftOnReadChance({ ...calm, relationship: 40 }));
    expect(leftOnReadChance({ ...calm, relationship: 40 })).toBeGreaterThan(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, atWork: true })).toBeGreaterThan(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, coachStreak: 2 })).toBe(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, coachStreak: 3 })).toBeGreaterThan(0.3);
  });

  it("nikdy víc než napůl, aby trenér nepsal do zdi", () => {
    expect(leftOnReadChance({ closing: false, relationship: 5, coachStreak: 6, atWork: true })).toBe(0.5);
    expect(leftOnReadChance({ closing: true, relationship: 5, coachStreak: 6, atWork: true })).toBeLessThanOrEqual(0.5);
  });

  it("na otázku trenéra odpoví, na přečteno ji nechá jen naštvaný (E2E 22. 11.: Kovalčuk, ráno po hospodě)", () => {
    // Kovalčuk (vztah 50) „A kolik tě stály?“ v posledním tahu, Kovář (50) „A kdo podle tebe u nás nejvíc maká?“.
    expect(leftOnReadChance({ ...calm, relationship: 50, closing: true, coachAsked: true })).toBe(0);
    // Zíka (30) uprostřed vlákna „Kolik let už vlastně hraješ fotbal?“, i v práci a po třetí zprávě.
    expect(leftOnReadChance({ ...calm, relationship: 30, coachAsked: true, atWork: true, coachStreak: 3 })).toBe(0);
    // Naštvaný ano, i s otázkou.
    expect(leftOnReadChance({ ...calm, relationship: 20, closing: true, coachAsked: true })).toBeCloseTo(0.2);
    expect(leftOnReadChance({ ...calm, relationship: 20, coachAsked: true, coachStreak: 3 })).toBe(0.5);
    // Bez otázky beze změny.
    expect(leftOnReadChance({ ...calm, relationship: 50, closing: true, coachAsked: false })).toBeCloseTo(0.25);
  });

  it("otázka trenéra od hráčovy poslední odpovědi", () => {
    const player = { sender: "player", body: "Nu, trenér, djakuju za odpověď! Už se těším, až v nich nastoupím do zápasu proti Břevnovu 😊" };
    expect(coachAskedSinceReply([player, { sender: "coach", body: "A kolik tě stály?" }])).toBe(true);
    expect(coachAskedSinceReply([player, { sender: "coach", body: "A jak se má tvoje holka?" }, { sender: "coach", body: "Haló." }])).toBe(true);
    expect(coachAskedSinceReply([player, { sender: "coach", body: "Ivane, to zní dobře, ať ti slouží." }])).toBe(false);
    // Otázka, na kterou už odpověděl, se nepočítá.
    expect(coachAskedSinceReply([{ sender: "coach", body: "Jak se máš?" }, player, { sender: "coach", body: "Tak ať slouží." }])).toBe(false);
  });

  it("přečte za pár vteřin, ne hned", () => {
    expect(readDelayMs(0)).toBe(3000);
    expect(readDelayMs(1)).toBe(15000);
    expect(readDelayMs(7)).toBe(15000);
  });
});
