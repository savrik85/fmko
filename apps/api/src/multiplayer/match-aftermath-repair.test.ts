/**
 * Oprava zápasu po pádu běhu: sestavy a události jako u Budvar Spůle – FORPSI Čkyně
 * (2026-11-09), interní čísla domácí 1.., hosté 101.., střídání „X za Y“.
 */
import { describe, expect, it } from "vitest";
import { rebuildFromStored } from "./match-aftermath-repair";
import type { MatchEvent } from "../engine/types";

const player = (id: string, name: string, position = "MID") => ({ id, name, position });
const home = {
  starters: Array.from({ length: 11 }, (_, i) => player(`h${i + 1}`, i === 4 ? "Vojtěch Beneš" : i === 10 ? "Jan Novák" : i === 1 ? "Adam Jelínek" : `Domácí ${i + 1}`, i === 0 ? "GK" : "MID")),
  subs: Array.from({ length: 7 }, (_, i) => player(`hs${i + 1}`, i === 4 ? "Jakub Pouzar" : `Náhradník ${i + 1}`)),
};
const away = {
  starters: Array.from({ length: 11 }, (_, i) => player(`a${i + 1}`, i === 1 ? "Jakub Černý" : i === 10 ? "Tomáš Jelínek" : `Host ${i + 1}`, i === 0 ? "GK" : "DEF")),
  subs: Array.from({ length: 7 }, (_, i) => player(`as${i + 1}`, i === 4 ? "Jan Novák" : `Hostující náhradník ${i + 1}`)),
};
const ev = (e: Partial<MatchEvent> & { minute: number; type: string }) => e as MatchEvent;
const events: MatchEvent[] = [
  ev({ minute: 6, type: "injury", playerId: 111, playerName: "Tomáš Jelínek", teamId: 2, detail: "koleno" }),
  ev({ minute: 6, type: "substitution", playerId: 116, playerName: "Jan Novák", teamId: 2, description: "Střídání: Jan Novák za Tomáš Jelínek" }),
  ev({ minute: 14, type: "goal", playerId: 5, playerName: "Vojtěch Beneš", teamId: 1, detail: "1:0" }),
  ev({ minute: 33, type: "card", playerId: 102, playerName: "Jakub Černý", teamId: 2, detail: "red" }),
  ev({ minute: 65, type: "card", playerId: 11, playerName: "Jan Novák", teamId: 1, detail: "red" }),
  ev({ minute: 75, type: "substitution", playerId: 16, playerName: "Jakub Pouzar", teamId: 1, description: "Taktické střídání: Jakub Pouzar za Adam Jelínek" }),
];

describe("oprava zápasu z uložených dat", () => {
  it("interní čísla sedí na sestavu: domácí od 1, hosté od 101, základ a pak lavička", () => {
    const r = rebuildFromStored(home, away, events);
    expect(r.mismatches).toBe(0);
    expect(r.fullIdMap.get(5)).toBe("h5");
    expect(r.fullIdMap.get(16)).toBe("hs5");
    expect(r.fullIdMap.get(102)).toBe("a2");
    expect(r.fullIdMap.get(116)).toBe("as5");
    expect(r.homeStarterIds).toHaveLength(11);
  });

  it("minuty: střídání a vyloučení ukončí, náhradník naskočí, nevyužitý náhradník nehraje", () => {
    const { playerMinutes } = rebuildFromStored(home, away, events);
    expect(playerMinutes[111]).toEqual({ entered: 0, left: 6 });
    expect(playerMinutes[116]).toEqual({ entered: 6, left: null });
    expect(playerMinutes[102]).toEqual({ entered: 0, left: 33 });
    expect(playerMinutes[11]).toEqual({ entered: 0, left: 65 });
    expect(playerMinutes[2]).toEqual({ entered: 0, left: 75 });
    expect(playerMinutes[16]).toEqual({ entered: 75, left: null });
    expect(playerMinutes[12]).toBeUndefined();
  });

  it("když jméno v události nesedí na sestavu, data se nepoužijí", () => {
    const wrong = [...events, ev({ minute: 80, type: "goal", playerId: 5, playerName: "Někdo Jiný", teamId: 1 })];
    expect(rebuildFromStored(home, away, wrong).mismatches).toBe(1);
  });
});
