/**
 * Co hráč v SMS ví o zápasech: jestli v posledním hrál a kdy se hraje příště.
 *
 * Případ ze Spůle (2026-10-29/30): hráč, kterého trenér nedal ani na lavičku,
 * tvrdil „ve Volarech jsem normálně hrál, skončilo to 4:4". Ráno v den zápasu
 * zase, že se hraje až v pondělí.
 */
import { describe, it, expect } from "vitest";
import { buildLastMatchFacts, buildSystemPrompt } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { loadPlayerSnapshot, type LastMatchContext } from "./ai-player-spawn";
import { describeNextMatch } from "./next-match";

const row = (id: string) => ({ id, first_name: "Daniel", last_name: "Nárovec", age: 27, position: "MID", personality: "{}", life_context: "{}" });

const lastMatch = (o: Partial<LastMatchContext> = {}): LastMatchContext => ({
  matchId: "m-1", lastOutcome: "draw", teamStreak: 0,
  squad: { starters: new Set(["starter"]), subs: new Set(["sub"]) },
  stats: new Map([["starter", { player_id: "starter", last_minutes: 90, last_goals: 1 }]]),
  ...o,
});

const player = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "p-1", firstName: "Daniel", lastName: "Nárovec", age: 27, position: "MID",
  morale: 60, condition: 70, coachRelationship: 55,
  discipline: 50, patriotism: 50, alcohol: 50, temper: 50,
  leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 200, recentRatingAvg: 6.5, isCelebrity: false, ...o,
});

describe("účast v posledním zápase", () => {
  it("rozliší základ, lavičku a hráče mimo nominaci", () => {
    expect(loadPlayerSnapshot(row("starter"), lastMatch()).lastMatchSquad).toBe("played");
    expect(loadPlayerSnapshot(row("sub"), lastMatch()).lastMatchSquad).toBe("bench");
    expect(loadPlayerSnapshot(row("outside"), lastMatch()).lastMatchSquad).toBe("out");
  });

  it("bez uložené sestavy ani bez zápasu nic netvrdí", () => {
    expect(loadPlayerSnapshot(row("outside"), lastMatch({ squad: null })).lastMatchSquad).toBeUndefined();
    expect(loadPlayerSnapshot(row("outside"), lastMatch({ lastOutcome: null })).lastMatchSquad).toBeUndefined();
    expect(loadPlayerSnapshot(row("outside")).lastMatchSquad).toBeUndefined();
  });

  it("góly bere ze statistik zápasu", () => {
    const s = loadPlayerSnapshot(row("starter"), lastMatch());
    expect(s.playedLastMatch).toBe(true);
    expect(s.lastMatchGoals).toBe(1);
  });

  it("hráč mimo nominaci ví, že nebyl ani na lavičce", () => {
    const fact = buildLastMatchFacts(player({ lastMatchOutcome: "draw", playedLastMatch: false, lastMatchSquad: "out" }), "remíza 4:4 venku s FK Madeta Volary");
    expect(fact).toContain("remíza 4:4 venku s FK Madeta Volary");
    expect(fact).toContain("NEHRÁL");
    expect(fact).toContain("nebyl jsi ani na lavičce");
    expect(fact).toContain("NIKDY netvrď, že jsi hrál");
  });

  it("na lavičce jen seděl, neznámá nominace lavičku netvrdí", () => {
    expect(buildLastMatchFacts(player({ lastMatchOutcome: "win", playedLastMatch: false, lastMatchSquad: "bench" }))).toContain("seděl na lavičce");
    const unknown = buildLastMatchFacts(player({ lastMatchOutcome: "win", playedLastMatch: false }));
    expect(unknown).toContain("nenastoupil jsi");
    expect(unknown).not.toContain("lavič");
  });

  it("odpověď hráče mimo nominaci má fact v promptu", () => {
    const prompt = buildSystemPrompt(
      player({ lastMatchOutcome: "draw", playedLastMatch: false, lastMatchSquad: "out" }),
      { teamName: "SK Budvar Spůle", lastMatchResult: "remíza 4:4 venku s FK Madeta Volary" },
    );
    expect(prompt).toContain("nebyl jsi ani na lavičce");
  });
});

describe("příští zápas", () => {
  // 29. 10. 2026 je čtvrtek, už zimní čas: 18:00 v Praze = 17:00 UTC (skutečný výkop Volary – Spůle).
  const kickoff = new Date("2026-10-29T17:00:00.000Z");

  it("ráno v den zápasu je to DNES", () => {
    expect(describeNextMatch(kickoff, false, "FK Madeta Volary", new Date("2026-10-29T05:11:00Z")))
      .toBe("DNES (čtvrtek 29. 10.) v 18:00 venku s FK Madeta Volary");
  });

  it("den předem zítra, jinak den v týdnu", () => {
    expect(describeNextMatch(kickoff, true, "Čkyně", new Date("2026-10-28T20:00:00Z"))).toMatch(/^zítra \(čtvrtek 29\. 10\.\) v 18:00 doma s Čkyně$/);
    expect(describeNextMatch(kickoff, true, "Čkyně", new Date("2026-10-26T20:00:00Z"))).toMatch(/^čtvrtek 29\. 10\. v 18:00 doma s Čkyně$/);
  });

  it("pražská půlnoc rozhoduje, ne UTC", () => {
    // 23:30 UTC 28. 10. je už 29. 10. 0:30 v Praze.
    expect(describeNextMatch(kickoff, true, "Čkyně", new Date("2026-10-28T23:30:00Z"))).toMatch(/^DNES/);
  });

  it("prompt zná termín a zakazuje si ho vymýšlet", () => {
    const s = buildSystemPrompt(player(), { teamName: "SK Budvar Spůle", nextMatch: "DNES (čtvrtek 29. 10.) v 18:00 venku s FK Madeta Volary" });
    expect(s).toContain("Příští mistrovský zápas: DNES (čtvrtek 29. 10.) v 18:00 venku s FK Madeta Volary");
    expect(s).toContain("NEVYMÝŠLEJ si, kdy se hraje");
    expect(buildSystemPrompt(player(), { teamName: "SK Budvar Spůle" })).toContain("Termín dalšího zápasu neznáš");
  });
});
