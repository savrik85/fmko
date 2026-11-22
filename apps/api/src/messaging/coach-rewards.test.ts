import { describe, expect, it } from "vitest";
import {
  REWARD_BROKEN_SMS, REWARD_KEPT_SMS, REWARD_REMINDER_SMS, WEIGHT_FAILED_SMS, WEIGHT_FORFEIT_KABINA, WEIGHT_SAVED_SMS, WEIGHT_WON_SMS,
  parseReward, parseWeightTarget, realisticKg, rewardDetailsOf, rewardLabel, rewardPrice, rewardPromptLine, rewardSummary, rewardText, weightDealDetails, weightDealNote, weightGoalMet,
} from "./coach-rewards";
import { COMMITMENT_HINT_RE, parseDetection } from "./coach-commitments";

describe("dohoda o hubnutí z odpovědi modelu", () => {
  it("„když neshodíš 5 kilo za 2 týdny, platíš pivo všem“: sázka hráče bez odměny", () => {
    expect(parseWeightTarget({ kg: 5, days: 14, reward: "none", forfeit: true })).toEqual({ days: 14, reward: "none", kg: 5, forfeit: true });
  });
  it("„1000 Kč, když zhubneš na normální váhu“: bez kil, výchozí dva týdny", () => {
    expect(parseWeightTarget({ kg: null, days: null, reward: "money", amount: 1000 })).toEqual({ days: 14, reward: "money", amount: 1000 });
  });
  it("nesmysly a dohoda bez odměny i sázky neprojdou, termín se ořízne", () => {
    expect(parseWeightTarget({ kg: 5, reward: "none" })).toBeNull();
    expect(parseWeightTarget({ kg: 50, reward: "keg" })).toBeNull();
    expect(parseWeightTarget({ kg: 3, reward: "money", amount: 50 })).toBeNull();
    expect(parseWeightTarget({ kg: 3, days: 90, reward: "bottle" })?.days).toBe(30);
    expect(parseWeightTarget({ kg: 3, days: 2, reward: "bottle" })?.days).toBe(7);
  });
  it("odměna za službu: flaška, peníze s částkou", () => {
    expect(parseReward({ reward: "bottle" })).toEqual({ reward: "bottle" });
    expect(parseReward({ reward: "money", amount: 500 })).toEqual({ reward: "money", amount: 500 });
    expect(parseReward({ reward: "money" })).toBeNull();
    expect(parseReward({ reward: "none" })).toBeNull();
  });
  it("detekce: podmínka k dohodě patří a síto ji pustí", () => {
    const msg = "Tak 5 kilo za 2 tejdny? Když shodíš 5 kilo, dám ti litr.";
    expect(COMMITMENT_HINT_RE.test("Zkus prosim, koupim ti valkýro ruma")).toBe(true);
    expect(parseDetection({ kind: "weight_target", quote: "Když shodíš 5 kilo, dám ti litr", kg: 5, days: 14, reward: "money", amount: 1000 }, "MID", msg))
      .toEqual({ kind: "weight_target", kg: 5, days: 14, forfeit: undefined, rewardType: "money", amount: 1000 });
    expect(parseDetection({ kind: "reward", quote: "koupim ti valkýro ruma", reward: "bottle" }, "MID", "Zkus prosim, koupim ti valkýro ruma"))
      .toEqual({ kind: "reward", rewardType: "bottle" });
  });
});

describe("cíl a vyhodnocení", () => {
  it("cíl podle skutečné váhy, „na normální váhu“ = shodit na váhu bez postihu", () => {
    expect(weightDealDetails({ kg: 5, reward: "none", forfeit: true }, 96.4, 88)).toEqual({ kg: 5, reward: "none", forfeit: true, startWeight: 96.4, targetWeight: 91.4 });
    expect(weightDealDetails({ reward: "money", amount: 1000 }, 95.2, 90.1)).toMatchObject({ kg: 5.1, startWeight: 95.2, targetWeight: 90.1 });
    expect(weightDealDetails({ reward: "money", amount: 1000 }, 85, 90)).toBeNull();
    expect(weightDealDetails({ kg: 3, reward: "keg" }, null, 90)).toBeNull();
  });
  it("splněno na desetinu kila", () => {
    expect(weightGoalMet({ startWeight: 96.4, kg: 5 }, 91.45)).toEqual({ met: true, lost: 5 });
    expect(weightGoalMet({ startWeight: 96.4, kg: 5 }, 94.9)).toEqual({ met: false, lost: 1.5 });
  });
  it("trenér vidí, kolik se dá reálně shodit (nejvíc ~2 kg za 14 dní na produ)", () => {
    expect(realisticKg(14)).toBe(2);
    expect(realisticKg(30)).toBe(4.5);
    expect(weightDealNote("Ladislav", { kg: 5, reward: "none", forfeit: true, startWeight: 96.4 }, "2026-12-02T19:24:00Z", 14))
      .toBe("📝 Ladislav: když shodí 5 kg, jinak platí kabině pivo (do 2. 12., teď 96,4 kg). Za 14 dní se dá reálně shodit kolem 2 kg. Platí, až hráč kývne.");
  });
  it("Bohuslav (E2E 22. 11.): „Kč“ velkým písmenem, i když začátek věty jde malým", () => {
    const note = weightDealNote("Bohuslav", { kg: 7.2, reward: "money", amount: 1000, startWeight: 90.9 }, "2026-12-06T10:00:00Z", 14);
    expect(note).toContain("když shodí 7,2 kg, trenér mu dá 1\u00a0000 Kč");
    expect(note).not.toContain("kč");
  });
  it("odměna v 1. pádě, u peněz bez zdvojené částky", () => {
    expect(rewardLabel({ reward: "bottle" })).toBe("flaška");
    expect(rewardLabel({ reward: "round" })).toBe("runda");
    expect(rewardLabel({ reward: "keg" })).toBe("basa piva");
    expect(rewardLabel({ reward: "money", amount: 1000 })).toBe("1\u00a0000 Kč");
    expect(rewardSummary({ reward: "bottle" })).toBe("flaška (300 Kč)");
    expect(rewardSummary({ reward: "money", amount: 1000 })).toBe("1\u00a0000 Kč");
  });
  it("ceny a texty", () => {
    expect(rewardPrice({ reward: "bottle" })).toBe(300);
    expect(rewardPrice({ reward: "money", amount: 1000 })).toBe(1000);
    expect(rewardPrice({ reward: "none" })).toBe(0);
    expect(rewardDetailsOf(JSON.stringify({ rewardType: "keg" })).reward).toBe("keg");
    expect(rewardText("reward", { reward: "bottle", incidentId: "i1" })).toBe("Odměnu (flašku), když zjistí, kdo za incidentem stojí");
    expect(rewardText("weight_target", { kg: 5, reward: "money", amount: 1000 })).toMatch(/^Když shodí 5 kg, trenér mu dá 1\s000 Kč$/);
  });
  it("hráč ví, co mu trenér slíbil, a připomene se", () => {
    const d = { kg: 5, reward: "money" as const, amount: 1000, startWeight: 96.4 };
    expect(rewardPromptLine("weight_target", "active", d, "2026-12-02T00:00:00Z")).toContain("Rozhodni se");
    expect(rewardPromptLine("weight_target", "active", { ...d, accepted: true }, "2026-12-02T00:00:00Z", 95)).toContain("teď vážíš 95 kg");
    expect(rewardPromptLine("weight_target", "active", { ...d, accepted: true, won: true, lost: 5.2 }, "x")).toContain("připomeň");
    expect(rewardPromptLine("reward", "active", { reward: "bottle", incidentId: "i1" }, "x")).toContain("když zjistíš");
    expect(rewardPromptLine("reward", "broken", { reward: "bottle" }, "x")).toContain("nedal");
  });
});

describe("pooly", () => {
  it("aspoň osm variant, bez opakování a bez dlouhé pomlčky", () => {
    for (const pool of [WEIGHT_WON_SMS, WEIGHT_FAILED_SMS, WEIGHT_SAVED_SMS, WEIGHT_FORFEIT_KABINA, REWARD_KEPT_SMS, REWARD_BROKEN_SMS, REWARD_REMINDER_SMS]) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(new Set(pool).size).toBe(pool.length);
      for (const t of pool) expect(t).not.toContain("—");
    }
    for (const t of [...WEIGHT_WON_SMS, ...WEIGHT_FAILED_SMS, ...WEIGHT_SAVED_SMS]) expect(t).toContain("{kg}");
  });
});
