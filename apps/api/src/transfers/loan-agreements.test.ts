import { describe, expect, it } from "vitest";
import { checkPlayingTime, fromPreposition, playingTimeSummary, recallRefund, type LoanMatchLine } from "./loan-agreements";

function line(over: Partial<LoanMatchLine> = {}): LoanMatchLine {
  return {
    matchId: crypto.randomUUID(), playedAt: "2026-11-01T17:00:00Z", opponentName: "Soupeř", home: true,
    goalsFor: 1, goalsAgainst: 0, available: true, absenceReason: null,
    started: false, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, rating: null, ...over,
  };
}
const start = () => line({ started: true, minutes: 90, rating: 6.5 });
const sub = () => line({ started: false, minutes: 20, rating: 6.0 });
const bench = () => line();
const injured = () => line({ available: false, absenceReason: "Zranění" });

describe("podmínka hraní u hostování", () => {
  it("bez podmínky se nic nehodnotí", () => {
    expect(checkPlayingTime("none", [bench(), bench(), bench()]).state).toBe("none");
  });

  it("v základu: dva starty z dvou, třetí zápas rozhodne, proto varování", () => {
    expect(checkPlayingTime("starter", [start(), start()]).state).toBe("at_risk");
  });

  it("v základu: jeden zápas se ještě nehodnotí ani nevaruje", () => {
    expect(checkPlayingTime("starter", [bench()]).state).toBe("pending");
  });

  it("v základu: 3 ze 4 je splněno, ale další lavička by podmínku shodila", () => {
    const c = checkPlayingTime("starter", [start(), start(), start(), bench()]);
    expect(c.state).toBe("at_risk");
    expect(c.fulfilled).toBe(3);
    expect(c.eligible).toBe(4);
  });

  it("v základu: 4 ze 4 je v pořádku", () => {
    expect(checkPlayingTime("starter", [start(), start(), start(), start()]).state).toBe("ok");
  });

  it("v základu: 1 ze 3 je porušení", () => {
    expect(checkPlayingTime("starter", [start(), bench(), bench()]).state).toBe("breached");
  });

  it("střídání se do základu nepočítá, do pravidelného nastupování ano", () => {
    const lines = [sub(), sub(), sub()];
    expect(checkPlayingTime("starter", lines).state).toBe("breached");
    expect(checkPlayingTime("regular", lines).state).toBe("ok");
  });

  it("zápasy, kdy hráč chyběl, se nepočítají", () => {
    const c = checkPlayingTime("starter", [start(), injured(), injured(), bench(), start()]);
    expect(c.eligible).toBe(3);
    expect(c.fulfilled).toBe(2);
    expect(c.state).toBe("breached");
    expect(checkPlayingTime("starter", [start(), injured(), injured(), start(), start()]).state).toBe("ok");
  });

  it("pravidelně: polovina zápasů stačí", () => {
    expect(checkPlayingTime("regular", [sub(), bench(), sub(), bench()]).state).toBe("at_risk");
    expect(checkPlayingTime("regular", [sub(), bench(), bench(), bench()]).state).toBe("breached");
  });

  it("popis stavu je s čísly zápasů", () => {
    expect(playingTimeSummary(checkPlayingTime("starter", [start(), start(), start(), bench()]))).toBe("V základu 3 ze 4 zápasů");
    expect(playingTimeSummary(checkPlayingTime("regular", [sub()]))).toBe("Nastoupil 1 z 1 zápasu");
  });

  it("předložka před číslem", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 45].map(fromPreposition)).toEqual(["z", "z", "z", "ze", "z", "ze", "ze", "z", "ze", "z", "ze"]);
  });
});

describe("vrácení poplatku při stažení z hostování", () => {
  const a = { fee: 10_000, started_at: "2026-11-01T16:00:00.000Z", until: "2026-12-31T16:00:00.000Z" };

  it("při porušení podmínky se nic nevrací", () => {
    expect(recallRefund(a, "2026-11-11T16:00:00.000Z", true)).toBe(0);
  });

  it("jinak poměrná část za zbývající dny", () => {
    expect(recallRefund(a, "2026-12-01T16:00:00.000Z", false)).toBe(5000);
  });

  it("hostování zdarma nevrací nic", () => {
    expect(recallRefund({ ...a, fee: 0 }, "2026-11-11T16:00:00.000Z", false)).toBe(0);
  });
});
