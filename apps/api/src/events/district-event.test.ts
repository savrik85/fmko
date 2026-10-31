import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import {
  classifyEventReply, LIMITS, pickAttendance, promptKeys, sanitizeEventReport, buildEventPrompt,
  type EventPlayer, type EventTeamInput,
} from "./district-event";

function player(id: string, teamId: string, alcohol = 50): EventPlayer {
  return { id, teamId, teamName: `Klub ${teamId}`, firstName: "Jan", lastName: `Novák${id}`, age: 25, position: "MID", alcohol, temper: 50, discipline: 50, leadership: 50 };
}

function team(teamId: string, choice: EventTeamInput["choice"], squad: EventPlayer[]): EventTeamInput {
  return { teamId, teamName: `Klub ${teamId}`, coachName: `Trenér${teamId}`, choice, squad };
}

describe("kdo přijde na okresní akci", () => {
  it("trenér s hráči přivede 3 až 6 kluků, sám jen sebe", () => {
    const squad = Array.from({ length: 15 }, (_, i) => player(`a${i}`, "A"));
    for (let seed = 1; seed < 40; seed++) {
      const a = pickAttendance([team("A", "with_players", squad), team("B", "alone", [player("b1", "B", 10)])], createRng(seed));
      expect(a.coaches.map((c) => c.teamId)).toEqual(["A", "B"]);
      const fromA = a.players.filter((p) => p.teamId === "A").length;
      expect(fromA).toBeGreaterThanOrEqual(3);
      expect(fromA).toBeLessThanOrEqual(6);
      expect(a.players.some((p) => p.teamId === "B")).toBe(false);
    }
  });

  it("bez trenéra přijdou nejvýš dva pijáci", () => {
    const squad = Array.from({ length: 10 }, (_, i) => player(`a${i}`, "A", 90));
    for (let seed = 1; seed < 40; seed++) {
      const a = pickAttendance([team("A", null, squad)], createRng(seed));
      expect(a.coaches).toHaveLength(0);
      expect(a.players.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("odpověď modelu", () => {
  const attendance = {
    coaches: [
      { teamId: "A", teamName: "Klub A", name: "Novák", withPlayers: true },
      { teamId: "B", teamName: "Klub B", name: "Svoboda", withPlayers: false },
    ],
    players: [player("p1", "A"), player("p2", "A"), player("p3", "C")],
  };
  const keys = promptKeys(attendance);

  it("čísla se stáhnou do mezí, zranění a stopky se ořežou", () => {
    const r = sanitizeEventReport({
      headline: "Pouť — jak se patří",
      body: "Byla to jízda.",
      scenes: [
        { text: "Rvačka u kolotoče — krev.", players: [
          { key: "P1", effects: [{ kind: "condition", value: -90 }, { kind: "injury", value: 30 }, { kind: "suspension", value: 1 }] },
          { key: "P2", effects: [{ kind: "injury", value: 2 }, { kind: "suspension", value: 1 }] },
          { key: "P3", effects: [{ kind: "injury", value: 2 }, { kind: "teleport", value: 5 }] },
        ], coaches: [{ a: "C1", b: "C2", respect: -100, heat: 100 }], squad_morale: [{ coach: "C1", delta: 50 }] },
      ],
    }, keys);
    expect(r).not.toBeNull();
    const s = r!.scenes[0];
    expect(s.text).not.toMatch(/[—–]/);
    expect(r!.headline).not.toMatch(/[—–]/);
    const cond = s.effects.find((e) => e.kind === "condition")!;
    expect(cond.value).toBe(LIMITS.condition[0]);
    const injuries = s.effects.filter((e) => e.kind === "injury");
    expect(injuries).toHaveLength(LIMITS.maxInjuries);
    expect(injuries[0].value).toBe(LIMITS.injuryDays[1]);
    expect(s.effects.filter((e) => e.kind === "suspension")).toHaveLength(LIMITS.maxSuspensions);
    expect(s.coachRelations[0]).toMatchObject({ respect: LIMITS.respect[0], heat: LIMITS.heat[1] });
    expect(s.squadMorale[0].delta).toBe(LIMITS.squadMorale[1]);
    expect(s.teamIds.sort()).toEqual(["A", "B", "C"]);
  });

  it("neznámí lidé a prázdné scény se zahodí", () => {
    expect(sanitizeEventReport({ scenes: [{ text: "" }, { players: [] }] }, keys)).toBeNull();
    const r = sanitizeEventReport({ scenes: [{ text: "Novák s Svobodou to zachlastali.", players: [{ key: "P9", effects: [{ kind: "hangover" }] }], coaches: [{ a: "C1", b: "C1", respect: 5 }] }] }, keys);
    expect(r!.scenes[0].effects).toHaveLength(0);
    expect(r!.scenes[0].coachRelations).toHaveLength(0);
    // Kluby se poznají i podle jmen trenérů v textu.
    expect(r!.scenes[0].teamIds.sort()).toEqual(["A", "B"]);
  });

  it("tip na přestup jen do cizího klubu", () => {
    const r = sanitizeEventReport({ scenes: [
      { text: "x", transfer: { player: "P1", coach: "C1" } },
      { text: "y", transfer: { player: "P3", coach: "C1" } },
    ] }, keys);
    expect(r!.scenes[0].transferHint).toBeUndefined();
    expect(r!.scenes[1].transferHint).toEqual({ playerId: "p3", toTeamId: "A" });
  });

  it("zadání pro model nese jen klíče, ne id z databáze", () => {
    const prompt = buildEventPrompt({ title: "Pouť", place: "Vacov", description: "Kolotoče.", district: "Prachatice", keys, coachPairs: [], absentTeams: ["Klub D"] });
    expect(prompt).toContain("C1: trenér Novák");
    expect(prompt).toContain("P3: Jan Novákp3");
    expect(prompt).not.toContain("\"p1\"");
    expect(prompt).toContain("Klub D");
  });
});

describe("odpověď trenéra volným textem", () => {
  it.each([
    ["Ne, nepřijdu", "skip"],
    ["nemůžu, sorry", "skip"],
    ["Jasně, beru kluky", "with_players"],
    ["přijdem celá kabina", "with_players"],
    ["dorazím", "alone"],
  ])("%s → %s", (text, choice) => {
    expect(classifyEventReply(text)).toBe(choice);
  });
});

describe("kdo ve scéně je", () => {
  it("seznam od modelu má přednost před jmény v textu", () => {
    const keys = promptKeys({
      coaches: [{ teamId: "K", teamName: "Kunratice", name: "Novotný", withPlayers: true }],
      players: [player("x1", "B"), { ...player("x2", "B"), lastName: "Novotný" }],
    });
    const r = sanitizeEventReport({ scenes: [{ text: "Vlasák dal trenéru Novotnému srdce.", who: ["C1"] }] }, keys);
    expect(r!.scenes[0].teamIds).toEqual(["K"]);
  });
});
