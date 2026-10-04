import { describe, it, expect } from "vitest";
import {
  EXT_KINDS, EXT_SLOTS, EXT_SLOT_DEFS, allowedKinds, extCapacity, extCost, extensionsCapacity,
  getExtensionSlots, requirementOf,
} from "./extension-catalog";
import { legacyStandsToSides } from "./stands-model";

const NO_LOCKS = { reputation: 100, matchesPlayed: 100, season: 10, ignoreProgressLocks: false };

describe("katalog přístaveb", () => {
  it("každý druh má tři úrovně s rostoucí kapacitou a cenou", () => {
    for (const kind of EXT_KINDS) {
      const caps = [1, 2, 3].map((l) => extCapacity(kind, l));
      const costs = [1, 2, 3].map((l) => extCost(kind, l));
      expect(caps[0], kind).toBeGreaterThan(0);
      expect(caps).toEqual([...caps].sort((a, b) => a - b));
      expect(new Set(caps).size, kind).toBe(3);
      expect(costs.every((c) => c > 0), kind).toBe(true);
      expect(costs[2], kind).toBeGreaterThan(costs[0]);
    }
  });

  it("mimo úrovně 1–3 je kapacita i cena nula", () => {
    expect(extCapacity("corner", 0)).toBe(0);
    expect(extCapacity("corner", 4)).toBe(0);
    expect(extCost("corner", 0)).toBe(0);
  });

  it("každé místo má aspoň tři druhy přístavby a každý druh někam patří", () => {
    for (const slot of EXT_SLOTS) expect(allowedKinds(slot).length, slot).toBeGreaterThanOrEqual(3);
    for (const kind of EXT_KINDS) {
      expect(EXT_SLOTS.some((s) => allowedKinds(s).includes(kind)), kind).toBe(true);
    }
  });

  it("celý stadion zůstane v okresním měřítku (základ 200 + tribuny 500 + přístavby ≤ 2 500)", () => {
    // Nejlepší druh do každého místa na úrovni 3.
    const best = EXT_SLOTS.map((slot) => Math.max(...allowedKinds(slot).map((k) => extCapacity(k, 3))));
    const total = 200 + 500 + best.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(2500);
    expect(total).toBeGreaterThan(1500);
  });

  it("extensionsCapacity sečte postavené kusy a ignoruje neznámé druhy", () => {
    const rows = [
      { slot: "ext_main", kind: "length", level: 2 },
      { slot: "corner_main_goal_east", kind: "corner", level: 1 },
      { slot: "ext_opposite", kind: "neexistuje", level: 3 },
    ];
    expect(extensionsCapacity(rows)).toBe(extCapacity("length", 2) + extCapacity("corner", 1));
  });
});

describe("pravidla odemykání", () => {
  const slotsOf = (sides: ReturnType<typeof legacyStandsToSides>, built: Array<{ slot: string; kind: string; level: number }> = [], ctx = NO_LOCKS) =>
    getExtensionSlots(sides, built, ctx);
  const option = (slots: ReturnType<typeof slotsOf>, slot: string, kind: string) =>
    slots.find((s) => s.slot === slot)!.options.find((o) => o.kind === kind)!;

  it("bez tribun jde postavit jen to, co tribunu nepotřebuje", () => {
    const s = slotsOf(legacyStandsToSides(0));
    expect(option(s, "ext_goal_east", "terrace").locked).toBe(false);
    expect(option(s, "ext_main", "footbridge").locked).toBe(false);
    expect(option(s, "ext_main", "mobile").locked).toBe(false);
    expect(option(s, "ext_main", "length").locked).toBe(true);
    expect(option(s, "corner_main_goal_east", "corner").locked).toBe(true);
  });

  it("rohová tribuna chce obě sousední strany, zahnutá obě na L2", () => {
    const sides = { ...legacyStandsToSides(0), stand_main: 1, stand_goal_east: 1 };
    const s = slotsOf(sides);
    expect(option(s, "corner_main_goal_east", "corner").locked).toBe(false);
    expect(option(s, "corner_main_goal_east", "curved_corner").locked).toBe(true);
    expect(option(s, "corner_main_goal_west", "corner").locked).toBe(true);
    const l2 = slotsOf({ ...sides, stand_main: 2, stand_goal_east: 2 });
    expect(option(l2, "corner_main_goal_east", "curved_corner").locked).toBe(false);
    expect(option(l2, "corner_main_goal_east", "bridge").locked).toBe(false);
  });

  it("druhé patro a dvojitá tribuna chtějí vlastní stranu na L3", () => {
    const s2 = slotsOf({ ...legacyStandsToSides(0), stand_main: 2 });
    expect(option(s2, "ext_main", "second_tier").locked).toBe(true);
    const s3 = slotsOf({ ...legacyStandsToSides(0), stand_main: 3 });
    expect(option(s3, "ext_main", "second_tier").locked).toBe(false);
    expect(option(s3, "ext_main", "double_stand").locked).toBe(false);
    expect(option(s3, "ext_opposite", "second_tier").locked).toBe(true);
  });

  it("piloty a věž jen na hlavní straně", () => {
    const s = slotsOf(legacyStandsToSides(3));
    expect(allowedKinds("ext_main")).toContain("stilts");
    expect(allowedKinds("ext_opposite")).not.toContain("stilts");
    expect(allowedKinds("ext_goal_west")).not.toContain("tower");
    expect(option(s, "ext_main", "tower").locked).toBe(false);
  });

  it("zámek úrovně podle reputace a zápasů se vypíše a jde lokálně obejít", () => {
    const sides = legacyStandsToSides(3);
    const weak = { reputation: 10, matchesPlayed: 3, season: 1, ignoreProgressLocks: false };
    const o = option(slotsOf(sides, [{ slot: "ext_main", kind: "length", level: 1 }], weak), "ext_main", "length");
    expect(o.level).toBe(2);
    expect(o.locked).toBe(true);
    expect(o.lockReason).toContain("zápasů");
    const bypass = option(slotsOf(sides, [{ slot: "ext_main", kind: "length", level: 1 }], { ...weak, ignoreProgressLocks: true }), "ext_main", "length");
    expect(bypass.locked).toBe(false);
  });

  it("postavené místo nabízí jen vylepšení stejného druhu, na maximu nic", () => {
    const sides = legacyStandsToSides(3);
    const s = slotsOf(sides, [{ slot: "ext_main", kind: "length", level: 1 }, { slot: "ext_opposite", kind: "length", level: 3 }]);
    expect(s.find((x) => x.slot === "ext_main")!.options.map((o) => o.kind)).toEqual(["length"]);
    expect(s.find((x) => x.slot === "ext_opposite")!.options).toEqual([]);
    expect(option(s, "ext_main", "length").capacityGain).toBe(extCapacity("length", 2) - extCapacity("length", 1));
  });

  it("slot definice obsahuje strany pro rohy a pro postranní místa", () => {
    expect(EXT_SLOT_DEFS.corner_main_goal_east.sides).toEqual(["stand_main", "stand_goal_east"]);
    expect(EXT_SLOT_DEFS.ext_main.sides).toEqual(["stand_main"]);
    expect(requirementOf("corner").min).toBe(1);
  });

  it("prodloužená strana a její rohy se vylučují (prodloužení by zasáhlo do rohu)", () => {
    const sides = legacyStandsToSides(3);
    // Prodloužená hlavní strana zamkne oba její rohy, ostatní rohy zůstanou volné.
    const withLength = slotsOf(sides, [{ slot: "ext_main", kind: "length", level: 1 }]);
    for (const slot of ["corner_main_goal_east", "corner_main_goal_west"]) {
      for (const o of withLength.find((x) => x.slot === slot)!.options) {
        expect(o.locked, `${slot}/${o.kind}`).toBe(true);
        expect(o.lockReason).toContain("prodlou");
      }
    }
    expect(option(withLength, "corner_opposite_goal_east", "corner").locked).toBe(false);
    // A naopak: kdo má v rohu přístavbu, nemůže prodloužit tu stranu.
    const withCorner = slotsOf(sides, [{ slot: "corner_main_goal_east", kind: "curved_corner", level: 1 }]);
    expect(option(withCorner, "ext_main", "length").locked).toBe(true);
    expect(option(withCorner, "ext_main", "length").lockReason).toContain("roh");
    expect(option(withCorner, "ext_opposite", "length").locked).toBe(false);
    // Jiné druhy na prodloužené straně rohy nezamykají.
    const second = slotsOf(sides, [{ slot: "ext_main", kind: "second_tier", level: 1 }]);
    expect(option(second, "corner_main_goal_east", "corner").locked).toBe(false);
  });

  it("boční křídlo se vylučuje s točenou tribunou a valem na straně za brankou, kam navazuje", () => {
    const sides = legacyStandsToSides(3);
    // Točená tribuna za levou brankou zamkne křídla v obou jejích rozích.
    const withRound = slotsOf(sides, [{ slot: "ext_goal_west", kind: "round_stand", level: 1 }]);
    for (const slot of ["corner_main_goal_west", "corner_opposite_goal_west"]) {
      const wing = option(withRound, slot, "wing");
      expect(wing.locked, slot).toBe(true);
      expect(wing.lockReason).toContain("křídl");
    }
    expect(option(withRound, "corner_main_goal_east", "wing").locked).toBe(false);
    // Jiné druhy v témže rohu točená tribuna nezamyká.
    expect(option(withRound, "corner_main_goal_west", "curved_corner").locked).toBe(false);
    // A naopak: kdo má v rohu křídlo, nemůže na té straně postavit točenou tribunu ani val.
    const withWing = slotsOf(sides, [{ slot: "corner_main_goal_west", kind: "wing", level: 1 }]);
    expect(option(withWing, "ext_goal_west", "round_stand").locked).toBe(true);
    expect(option(withWing, "ext_goal_west", "terrace").locked).toBe(true);
    expect(option(withWing, "ext_goal_east", "round_stand").locked).toBe(false);
    // Druhé patro na straně za brankou křídlu nevadí.
    expect(option(withWing, "ext_goal_west", "second_tier").locked).toBe(false);
  });
});
