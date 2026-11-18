/**
 * „Jsem v práci, ozvu se pak“ bylo 14 % odpovědí hráčů, i na krádež nebo nabídku
 * (rozbor SMS z produ 2026-11-18). Na vážnou věc a podruhé za den hráč odpoví hned.
 */
import { describe, expect, it } from "vitest";
import { mustAnswerNow } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const p = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "p", firstName: "Jan", lastName: "Test", age: 25, position: "MID", morale: 50, condition: 90, coachRelationship: 50,
  discipline: 50, patriotism: 50, alcohol: 50, temper: 50, leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 90, recentRatingAvg: 6.5, isCelebrity: false, ...o,
});

describe("odpověz hned", () => {
  it("obyčejný pokec smí počkat", () => expect(mustAnswerNow(p())).toBe(false));
  it("vážné téma, nabídka, incident nebo už jednou odložil = hned", () => {
    expect(mustAnswerNow(p({ seriousTopic: true }))).toBe(true);
    expect(mustAnswerNow(p({ recentlyPostponed: true }))).toBe(true);
    expect(mustAnswerNow(p({ pendingOffers: [{ club: "Krumlov", interest: 2 } as never] }))).toBe(true);
    expect(mustAnswerNow(p({ znalostiIncidentu: [{} as never] }))).toBe(true);
  });
});
