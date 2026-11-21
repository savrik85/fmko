import { describe, expect, it } from "vitest";
import {
  classifyHallReply, firstKnockoutPairs, groupCountFor, knockoutSlots, knockoutStagesFor, nextKnockoutPairs,
  pickHallRoster, pragueTimeToUtc, scheduleGroupStage, slotClock, slotKickoff, splitPot, type RosterCandidate,
} from "./format";
import type { StandingRow } from "../tournament/draw";

const ids = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe("sálovka: formát podle počtu týmů", () => {
  it("skupiny: 4–5 jedna, 6–8 dvě, 9–11 tři, 12–16 čtyři", () => {
    expect([4, 5, 6, 8, 9, 11, 12, 16].map(groupCountFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(() => groupCountFor(3)).toThrow();
    expect(() => groupCountFor(17)).toThrow();
  });

  it("play-off podle počtu skupin", () => {
    expect(knockoutStagesFor(4)).toEqual(["third", "final"]);
    expect(knockoutStagesFor(7)).toEqual(["sf", "third", "final"]);
    expect(knockoutStagesFor(13)).toEqual(["qf", "sf", "third", "final"]);
  });
});

describe("sálovka: časový plán", () => {
  it("nikdo nehraje ve stejném slotu dvakrát a skupina hraje každý s každým", () => {
    const groups = [ids(4, "a"), ids(4, "b"), ids(4, "c"), ids(4, "d")];
    const plan = scheduleGroupStage(groups, 42);
    expect(plan).toHaveLength(24);
    const bySlot = new Map<number, string[]>();
    for (const m of plan) bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m.home, m.away]);
    for (const teams of bySlot.values()) {
      expect(new Set(teams).size).toBe(teams.length);
      expect(teams.length).toBeLessThanOrEqual(4);
    }
    const pairs = new Set(plan.map((m) => [m.home, m.away].sort().join("-")));
    expect(pairs.size).toBe(24);
    expect(plan.every((m) => m.court === 1 || m.court === 2)).toBe(true);
    expect(new Set(plan.map((m) => m.bracketPos)).size).toBe(24);
  });

  it("16 týmů dohraje finále odpoledne (poslední slot do 16:00)", () => {
    const plan = scheduleGroupStage([ids(4, "a"), ids(4, "b"), ids(4, "c"), ids(4, "d")], 7);
    const last = Math.max(...plan.map((m) => m.slot));
    const ko = knockoutSlots(16, last);
    expect(ko.qf).toHaveLength(4);
    expect(ko.sf).toHaveLength(2);
    expect(ko.final[0].slot).toBeGreaterThan(ko.third[0].slot);
    expect(ko.third[0].slot).toBeGreaterThan(ko.sf[0].slot);
    const [h, m] = slotClock(ko.final[0].slot).split(":").map(Number);
    expect(h * 60 + m).toBeLessThanOrEqual(16 * 60);
  });

  it("9:00 v Praze v prosinci je 8:00 UTC, v létě 7:00 UTC", () => {
    expect(slotKickoff("2026-12-27", 0)).toBe("2026-12-27T08:00:00.000Z");
    expect(slotKickoff("2026-12-27", 1)).toBe("2026-12-27T08:25:00.000Z");
    expect(pragueTimeToUtc("2026-07-01", 9 * 60)).toBe("2026-07-01T07:00:00.000Z");
    expect(slotClock(3)).toBe("10:15");
  });
});

const row = (teamId: string, points: number, gf = 0, ga = 0): StandingRow => ({
  teamId, played: 3, won: 0, drawn: 0, lost: 0, goalsFor: gf, goalsAgainst: ga, points,
});

describe("sálovka: play-off", () => {
  it("jedna skupina: finále první dva, o třetí místo další dva", () => {
    const res = firstKnockoutPairs([[row("a", 9), row("b", 6), row("c", 3), row("d", 0)]], []);
    expect(res).toEqual([
      { stage: "third", pairs: [{ home: "c", away: "d" }] },
      { stage: "final", pairs: [{ home: "a", away: "b" }] },
    ]);
  });

  it("dvě skupiny: semifinále křížem A1–B2, B1–A2", () => {
    const res = firstKnockoutPairs([[row("a1", 9), row("a2", 6), row("a3", 0)], [row("b1", 9), row("b2", 4), row("b3", 1)]], []);
    expect(res).toEqual([{ stage: "sf", pairs: [{ home: "a1", away: "b2" }, { home: "b1", away: "a2" }] }]);
  });

  it("tři skupiny: čtvrtfinále s dvěma nejlepšími třetími, nikdo nehraje se svou skupinou", () => {
    const tables = [
      [row("a1", 6, 8, 2), row("a2", 3, 5, 5), row("a3", 3, 4, 6)],
      [row("b1", 6, 7, 3), row("b2", 3, 4, 4), row("b3", 0, 1, 9)],
      [row("c1", 4, 6, 4), row("c2", 4, 5, 4), row("c3", 3, 6, 5)],
    ];
    const [{ stage, pairs }] = firstKnockoutPairs(tables, []);
    expect(stage).toBe("qf");
    expect(pairs).toHaveLength(4);
    const groupOf = (id: string) => id[0];
    for (const p of pairs) expect(groupOf(p.home)).not.toBe(groupOf(p.away));
    expect(pairs.flatMap((p) => [p.home, p.away])).not.toContain("b3");
  });

  it("ze čtvrtfinále semifinále 1.+2. a 3.+4., ze semifinále finále a o třetí místo", () => {
    const qf = nextKnockoutPairs("qf", [
      { bracketPos: 2, winner: "w3", loser: "l3" }, { bracketPos: 0, winner: "w1", loser: "l1" },
      { bracketPos: 3, winner: "w4", loser: "l4" }, { bracketPos: 1, winner: "w2", loser: "l2" },
    ]);
    expect(qf).toEqual([{ stage: "sf", pairs: [{ home: "w1", away: "w2" }, { home: "w3", away: "w4" }] }]);
    const sf = nextKnockoutPairs("sf", [{ bracketPos: 0, winner: "x", loser: "y" }, { bracketPos: 1, winner: "z", loser: "q" }]);
    expect(sf).toEqual([
      { stage: "third", pairs: [{ home: "y", away: "q" }] },
      { stage: "final", pairs: [{ home: "x", away: "z" }] },
    ]);
  });
});

describe("sálovka: bank", () => {
  it("rozdělí přesně celý bank, zbytek dostane vítěz", () => {
    expect(splitPot(16000)).toEqual([8000, 4800, 3200]);
    const odd = splitPot(7000 + 333);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(7333);
    expect(odd[0]).toBeGreaterThan(odd[1]);
    expect(odd[1]).toBeGreaterThan(odd[2]);
  });
});

describe("sálovka: odpověď trenéra na pozvánku", () => {
  it.each([
    "Jasně, hlásíme se!",
    "jo jdem do toho, kluci se těší jak malí na ježíška",
    "Přihlašte nás, startovný zaplatíme",
    "urcite, pocitejte s nama",
    "Ok",
    "No jasně že jo, sem s tím, hrajem",
  ])("přihláška: %s", (text) => {
    expect(classifyHallReply(text)).toBe("register");
  });

  it.each([
    "Ne",
    "letos ne, půlka kabiny je na horách",
    "Nepřihlašujte nás, nemáme lidi",
    "jo bylo by to fajn ale nemůžem, svátky jsou svátky",
    "odhlašte nás prosím",
    "Bez nás, kluci by se tam akorát zrušili",
  ])("odmítnutí: %s", (text) => {
    expect(classifyHallReply(text)).toBe("decline");
  });

  it.each(["Kolik to stojí?", "Kdy přesně se hraje?", ""])("nejasné: %s", (text) => {
    expect(classifyHallReply(text)).toBeNull();
  });

  it("slova obsahující „ne“ nejsou odmítnutí", () => {
    expect(classifyHallReply("Jasně, neděle nám sedí")).toBe("register");
  });
});

const cand = (id: string, position: RosterCandidate["position"], rating: number, goalkeeping = 20): RosterCandidate => ({ id, position, rating, goalkeeping });

describe("sálovka: soupiska", () => {
  const squad = [
    cand("gk1", "GK", 60, 70), cand("gk2", "GK", 55, 65),
    cand("d1", "DEF", 64), cand("d2", "DEF", 58), cand("d3", "DEF", 50),
    cand("m1", "MID", 66), cand("m2", "MID", 52),
    cand("f1", "FWD", 70), cand("f2", "FWD", 61), cand("f3", "FWD", 49),
    cand("m3", "MID", 40),
  ];

  it("bez výběru jede nejlepší brankář, 2-1-2 a čtyři na lavičce s náhradním brankářem", () => {
    const r = pickHallRoster(squad, null);
    expect(r.lineup.map((p) => `${p.slot}:${p.id}`)).toEqual(["GK:gk1", "DEF:d1", "DEF:d2", "MID:m1", "FWD:f1", "FWD:f2"]);
    expect(r.subs).toHaveLength(4);
    expect(r.subs[0].id).toBe("gk2");
  });

  it("výběr trenéra platí, i když vynechá lepší hráče", () => {
    const chosen = ["gk2", "d3", "d2", "m2", "f3", "m3", "f1"];
    const r = pickHallRoster(squad, chosen);
    expect(r.lineup.map((p) => p.id)).toContain("gk2");
    expect(r.lineup.map((p) => p.id)).not.toContain("m1");
    expect([...r.lineup, ...r.subs].every((p) => chosen.includes(p.id))).toBe(true);
  });

  it("když z výběru zbude míň než šest, doplní se nejlepšími ostatními", () => {
    const available = squad.filter((p) => !["d3", "m2", "f3"].includes(p.id));
    const r = pickHallRoster(available, ["gk2", "d3", "m2", "f3", "m3"]);
    expect(r.lineup).toHaveLength(6);
  });

  it("bez brankáře chytá ten, kdo chytá nejlíp", () => {
    const r = pickHallRoster(squad.filter((p) => p.position !== "GK").map((p) => (p.id === "d3" ? { ...p, goalkeeping: 45 } : p)), null);
    expect(r.lineup[0]).toMatchObject({ id: "d3", slot: "GK" });
  });

  it("méně než pět hráčů = kontumace", () => {
    expect(pickHallRoster(squad.slice(0, 4), null).lineup).toHaveLength(0);
  });
});
