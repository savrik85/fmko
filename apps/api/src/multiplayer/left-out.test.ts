import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import {
  weakestComparableSub, moraleLoss, pickComplainer, complaintText, nthTime,
  isSulking, sulkChance, SULK_TRAINING_REASONS,
  type LeftOutPlayer, type BenchPlayer,
} from "./left-out";
import { simulateAttendance } from "../season/training";

type Rng = ReturnType<typeof createRng>;
const fixedRng = (value: number): Rng => ({ random: () => value } as unknown as Rng);

const player = (over: Partial<LeftOutPlayer> = {}): LeftOutPlayer => ({
  id: "p1", lastName: "Hodina", position: "FWD", overallRating: 45, temper: 50, discipline: 50, previousStreak: 0, ...over,
});
const bench: BenchPlayer[] = [
  { lastName: "Sedláček", position: "GK", overallRating: 11 },
  { lastName: "Hložek", position: "FWD", overallRating: 29 },
  { lastName: "Jelínek", position: "DEF", overallRating: 31 },
];

describe("weakestComparableSub", () => {
  it("hráč v poli se nesrovnává s rezervním brankářem", () => {
    expect(weakestComparableSub(player(), bench)?.lastName).toBe("Hložek");
  });
  it("brankář se srovnává jen s brankáři", () => {
    expect(weakestComparableSub(player({ position: "GK" }), bench)?.lastName).toBe("Sedláček");
    expect(weakestComparableSub(player({ position: "GK" }), bench.filter((b) => b.position !== "GK"))).toBeNull();
  });
});

describe("moraleLoss", () => {
  it("základ 3, víc když jel slabší a když nejel víckrát po sobě", () => {
    expect(moraleLoss(player({ overallRating: 30 }), bench)).toBe(3);
    expect(moraleLoss(player({ overallRating: 45 }), bench)).toBe(5);
    expect(moraleLoss(player({ overallRating: 45, previousStreak: 2 }), bench)).toBe(7);
  });

  it("trenér-motivátor zklamání zmírní, lajdák zhorší, aspoň bod to stojí vždy", () => {
    const p = player({ overallRating: 45, previousStreak: 2 });
    expect(moraleLoss(p, bench, 40)).toBe(7);
    expect(moraleLoss(p, bench, 99)).toBe(4);
    expect(moraleLoss(p, bench, 10)).toBe(8);
    expect(moraleLoss(player({ overallRating: 30 }), bench, 99)).toBeGreaterThanOrEqual(1);
  });
});

describe("pickComplainer", () => {
  it("napíše nejvýš jeden, a to ten nejnaštvanější", () => {
    const out = pickComplainer([
      player({ id: "a", lastName: "Černý", overallRating: 30 }),
      player({ id: "b", lastName: "Hodina", overallRating: 45 }),
    ], bench, fixedRng(0));
    expect(out?.player.id).toBe("b");
    expect(out?.reason).toBe("skipped_for_weaker");
    expect(out?.weaker?.lastName).toBe("Hložek");
  });
  it("když padne kostka, nenapíše nikdo", () => {
    expect(pickComplainer([player()], bench, fixedRng(0.99))).toBeNull();
  });
  it("bez křivdy, ale opakovaně doma → stížnost na sérii", () => {
    const out = pickComplainer([player({ overallRating: 30, previousStreak: 2 })], bench, fixedRng(0));
    expect(out?.reason).toBe("streak");
    expect(out?.streak).toBe(3);
  });
  it("prázdný seznam → nikdo", () => {
    expect(pickComplainer([], bench, fixedRng(0))).toBeNull();
  });
});

describe("complaintText", () => {
  const allTexts = (rngValues: number[]) => rngValues.flatMap((v) => [
    complaintText({ reason: "skipped_for_weaker", weaker: bench[1], streak: 1 }, fixedRng(v)),
    complaintText({ reason: "streak", weaker: null, streak: 3 }, fixedRng(v)),
    complaintText({ reason: "generic", weaker: null, streak: 1 }, fixedRng(v)),
  ]);

  it("žádné dlouhé pomlčky a jméno slabšího v textu", () => {
    const texts = allTexts([0, 0.2, 0.4, 0.6, 0.8, 0.99]);
    for (const t of texts) expect(t).not.toContain("—");
    expect(complaintText({ reason: "skipped_for_weaker", weaker: bench[1], streak: 1 }, fixedRng(0))).toContain("Hložek");
  });
  it("série používá řadovou číslovku", () => {
    expect(complaintText({ reason: "streak", weaker: null, streak: 3 }, fixedRng(0))).toContain("potřetí");
    expect(nthTime(12)).toBe("po několikáté");
  });
  it("stejnou větu dvakrát po sobě nepošle", () => {
    const first = complaintText({ reason: "generic", weaker: null, streak: 1 }, fixedRng(0));
    const second = complaintText({ reason: "generic", weaker: null, streak: 1 }, fixedRng(0), first);
    expect(second).not.toBe(first);
  });
});

describe("truc po nenominaci", () => {
  it("trucuje do posledního dne včetně, pak už ne", () => {
    const sulk = { since: "2026-09-10", until: "2026-09-17", matchId: "m1" };
    expect(isSulking(sulk, "2026-09-17T05:00:00.000Z")).toBe(true);
    expect(isSulking(sulk, "2026-09-18")).toBe(false);
    expect(isSulking(null, "2026-09-10")).toBe(false);
    expect(isSulking({ since: "2026-09-10" }, "2026-09-10")).toBe(false);
  });

  it("cholerik přeskočený slabším trucuje spíš než disciplinovaný kliďas", () => {
    const soso = sulkChance(player({ temper: 50 }), { reason: "generic", streak: 1 });
    expect(sulkChance(player({ temper: 50 }), { reason: "generic", streak: 1 }, 99)).toBeLessThan(soso);
    const hot = sulkChance(player({ temper: 80 }), { reason: "skipped_for_weaker", streak: 2 });
    const calm = sulkChance(player({ temper: 20, discipline: 90 }), { reason: "generic", streak: 1 });
    expect(hot).toBeGreaterThan(0.8);
    expect(calm).toBeLessThan(0.1);
  });

  it("trucující hráč na trénink většinou nepřijde a má vlastní výmluvu", () => {
    const base = { discipline: 90, age: 25, alcohol: 20, morale: 70, isCelebrity: false };
    const squad = Array.from({ length: 200 }, () => ({ ...base, leftOutSulk: true })) as never[];
    const attendance = simulateAttendance(createRng(42), squad, "balanced");
    const attended = attendance.filter((d) => d.attended).length;
    expect(attended).toBeLessThan(70);
    for (const d of attendance.filter((x) => !x.attended)) expect(SULK_TRAINING_REASONS).toContain(d.reason);

    const withoutSulk = simulateAttendance(createRng(42), Array.from({ length: 200 }, () => ({ ...base })) as never[], "balanced");
    expect(withoutSulk.filter((d) => d.attended).length).toBeGreaterThan(attended);
  });
});
