// Spouští se z kořene repa: npx vitest run --root apps/web src/components/ui/loading-quips.test.ts
import { describe, expect, it } from "vitest";
import { BALL_DELAY_MS, LOADING_QUIPS, QUIP_DELAY_MS, QUIP_INTERVAL_MS, SLOW_LOADING_MS, loadingPhase, quipAt } from "./loading-quips";

describe("fáze načítání", () => {
  it("rychlé načtení do 300 ms neukáže nic", () => {
    expect(loadingPhase(0)).toBe("hidden");
    expect(loadingPhase(299)).toBe("hidden");
  });

  it("od 300 ms skáče míč, ještě bez hlášky", () => {
    expect(BALL_DELAY_MS).toBe(300);
    expect(loadingPhase(300)).toBe("ball");
    expect(loadingPhase(1499)).toBe("ball");
  });

  it("od 1,5 s do 10 s je pod míčem hláška", () => {
    expect(QUIP_DELAY_MS).toBe(1500);
    expect(loadingPhase(1500)).toBe("quip");
    expect(loadingPhase(9999)).toBe("quip");
  });

  it("od 10 s místo hlášky vysvětlení a možnost zkusit znovu, napořád", () => {
    expect(SLOW_LOADING_MS).toBe(10000);
    expect(loadingPhase(10000)).toBe("slow");
    expect(loadingPhase(600000)).toBe("slow");
  });
});

describe("střídání hlášek", () => {
  it("první hláška je ta, kterou určil náhodný začátek", () => {
    expect(quipAt(0, 1500)).toBe(LOADING_QUIPS[0]);
    expect(quipAt(5, 1500)).toBe(LOADING_QUIPS[5]);
  });

  it("po 2,6 s přijde další", () => {
    expect(QUIP_INTERVAL_MS).toBe(2600);
    expect(quipAt(0, 1500 + 2599)).toBe(LOADING_QUIPS[0]);
    expect(quipAt(0, 1500 + 2600)).toBe(LOADING_QUIPS[1]);
  });

  it("za poslední jde zase první", () => {
    expect(quipAt(LOADING_QUIPS.length - 1, 1500 + 2600)).toBe(LOADING_QUIPS[0]);
  });
});

describe("texty hlášek", () => {
  it("je jich 14 a žádná se neopakuje", () => {
    expect(LOADING_QUIPS).toHaveLength(14);
    expect(new Set(LOADING_QUIPS).size).toBe(LOADING_QUIPS.length);
  });

  it.each(LOADING_QUIPS.map((quip) => [quip]))("„%s“ končí třemi tečkami, bez dlouhé pomlčky, vejde se na mobil", (quip) => {
    expect(quip.endsWith("…")).toBe(true);
    expect(quip).not.toMatch(/[—–]/);
    expect(quip.length).toBeLessThanOrEqual(34);
  });
});
