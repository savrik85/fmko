import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { dopisDoHospody, zachovanePribehy } from "./pub";

describe("příhody o incidentech v hospodě", () => {
  it("návštěva s trenérem převezme z dnešní session jen příhody o incidentech", () => {
    const raw = JSON.stringify([
      { type: "story", playerIds: [], text: "Historka.", effects: [] },
      { type: "chlubi_se", playerIds: ["p"], text: "Chlubil se.", effects: [], incidentId: "inc-1" },
      { type: "drby_o_incidentu", playerIds: ["s"], text: "Bez incidentu.", effects: [] },
    ]);
    expect(zachovanePribehy(raw).map((p) => p.type)).toEqual(["chlubi_se"]);
    expect(zachovanePribehy("rozbité")).toEqual([]);
    expect(zachovanePribehy(undefined)).toEqual([]);
  });

  it("admin dopíše příhodu do dnešní hospody, přisadí hosty a posune vztah k trenérovi", async () => {
    const pepa = { playerId: "s", firstName: "Pepa", lastName: "Kos", alcohol: 80, teamId: "tym-a", isVisitor: false };
    const karel = { playerId: "k", firstName: "Karel", lastName: "Vrba", alcohol: 40, teamId: "tym-a", isVisitor: false };
    const db = new FalesnaD1([
      { sql: /SELECT attendees, incidents FROM pub_sessions/, first: { attendees: JSON.stringify([pepa]), incidents: "[]" } },
      { sql: /FROM players WHERE id IN/, all: [{ id: "k", team_id: "tym-a", cond: 80, morale: 50 }] },
    ]);
    await dopisDoHospody(jakoD1(db), "tym-a", "2026-09-16", [pepa, karel], [{
      type: "stezuje_si_na_trenera", playerIds: ["s", "k"], text: "Stěžoval si.", incidentId: "inc-1",
      effects: [{ playerId: "k", type: "vztah", delta: -3, label: "−3 vztah k trenérovi" }],
    }]);
    const update = db.dotazy.find((d) => /UPDATE pub_sessions SET attendees/.test(d.sql));
    expect((JSON.parse(String(update?.params[0])) as Array<{ playerId: string }>).map((a) => a.playerId)).toEqual(["s", "k"]);
    expect((JSON.parse(String(update?.params[1])) as Array<{ type: string }>).map((i) => i.type)).toEqual(["stezuje_si_na_trenera"]);
    const vztah = db.davky.flat().find((d) => /coach_relationship/.test(d.sql));
    expect(vztah?.params).toEqual([-3, "k"]);
  });
});
