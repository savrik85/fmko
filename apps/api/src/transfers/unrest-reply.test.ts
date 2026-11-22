/**
 * Odpověď nespokojeného hráče na dohodu: hráč, který se před dvěma minutami s trenérem pohádal,
 * hned nejásá „No tak to je jiná, trenére!“ (31× na produ, conv 237e2f26, 9ad187d6, 8f5296bd).
 */
import { describe, expect, it } from "vitest";
import { unrestOutcomeHint } from "../messaging/ai-player-chat";
import { FALLBACK_REPLIES, GRUDGING_REPLIES, recentThreadEnd } from "./unrest";

const NOW = new Date("2026-08-24T10:00:00Z");
const ended = (tone: string, summary = "Odchází naštvaný, trenér ho odbyl.") =>
  JSON.stringify({ scenario_id: "rejected_offer", awaiting: "done", resolution: { tone, summary } });

describe("jak skončil předchozí rozhovor", () => {
  it("hádka před dvěma minutami se počítá", () => {
    expect(recentThreadEnd(ended("negative"), "2026-08-24T09:58:00Z", NOW)).toMatchObject({ tone: "negative", minutesAgo: 2 });
  });

  it("rozhovor, který běží, je starý nebo bez výsledku, ne", () => {
    expect(recentThreadEnd(JSON.stringify({ awaiting: "coach" }), "2026-08-24T09:58:00Z", NOW)).toBeUndefined();
    expect(recentThreadEnd(ended("negative"), "2026-08-23T08:00:00Z", NOW)).toBeUndefined();
    expect(recentThreadEnd(JSON.stringify({ awaiting: "done", resolution: null }), "2026-08-24T09:58:00Z", NOW)).toBeUndefined();
    expect(recentThreadEnd(null, null, NOW)).toBeUndefined();
    expect(recentThreadEnd("{nečitelné", "2026-08-24T09:58:00Z", NOW)).toBeUndefined();
  });
});

describe("tón odpovědi", () => {
  it("po hádce i uklidněný bere dohodu neochotně, s tím, jak hádka skončila", () => {
    const hint = unrestOutcomeHint("calmed", { tone: "negative", summary: "Odchází naštvaný, trenér ho odbyl.", minutesAgo: 2 });
    expect(hint).toContain("před 2 minutami špatně (Odchází naštvaný, trenér ho odbyl)");
    expect(hint).toContain("neochotně a skřípavě");
    expect(hint).not.toContain("s úlevou nebo vděkem");
  });

  it("bez hádky jako dřív", () => {
    expect(unrestOutcomeHint("calmed")).toContain("s úlevou nebo vděkem");
    expect(unrestOutcomeHint("calmed", { tone: "positive", summary: "", minutesAgo: 5 })).toContain("s úlevou nebo vděkem");
    expect(unrestOutcomeHint("backfired", { tone: "negative", summary: "", minutesAgo: 3 })).toContain("NEUKLIDNILA");
  });

  it("předem napsané odpovědi: aspoň osm na výsledek, po hádce neochotné, bez „No tak to je jiná“", () => {
    for (const pool of [...Object.values(FALLBACK_REPLIES), GRUDGING_REPLIES]) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      for (const t of pool) {
        expect(t).not.toContain("—");
        expect(t).not.toMatch(/to je jiná/i);
      }
    }
  });
});
