import { describe, expect, it } from "vitest";
import { competitionLabel, mostCommonFormation, nextMeeting } from "./rival-view";

const fixture = (id: string, home: string, away: string, scheduledAt: string, status = "scheduled") => ({
  id, homeTeamId: home, awayTeamId: away, scheduledAt, status, isHome: home === "me",
});

describe("příští vzájemný zápas z rozpisu", () => {
  it("najde nejbližší neodehraný zápas se soupeřem, i když pohár přišel v rozpisu až na konci", () => {
    const schedule = [
      fixture("m1", "me", "rival", "2026-11-01T17:00:00Z", "simulated"),
      fixture("m2", "me", "other", "2026-11-28T17:00:00Z"),
      fixture("m3", "rival", "me", "2026-12-05T17:00:00Z"),
      fixture("cup", "rival", "me", "2026-11-25T11:00:00Z"),
    ];
    expect(nextMeeting(schedule, "rival")?.id).toBe("cup");
  });

  it("bez dalšího zápasu se soupeřem vrátí null", () => {
    expect(nextMeeting([fixture("m1", "me", "rival", "2026-11-01T17:00:00Z", "simulated")], "rival")).toBeNull();
    expect(nextMeeting([], "rival")).toBeNull();
  });
});

describe("popisek soutěže", () => {
  it("liga s kolem, pohár, přátelák a turnaj", () => {
    expect(competitionLabel({ competition: "league", label: "3. kolo" })).toBe("Liga, 3. kolo");
    expect(competitionLabel({ competition: "league", label: null })).toBe("Liga");
    expect(competitionLabel({ competition: "cup", label: "Čtvrtfinále" })).toBe("Pohár, čtvrtfinále");
    expect(competitionLabel({ competition: "friendly", label: null })).toBe("Přátelák");
    expect(competitionLabel({ competition: "tournament", label: "Turnaj P-Mobile, finále" })).toBe("Turnaj P-Mobile, finále");
  });
});

describe("nejčastější rozestavení", () => {
  it("vybere nejčastější, při shodě to novější", () => {
    expect(mostCommonFormation([{ formation: "4-4-2" }, { formation: "4-5-1" }, { formation: "4-4-2" }]))
      .toEqual({ formation: "4-4-2", count: 2 });
    expect(mostCommonFormation([{ formation: "3-5-2" }, { formation: "4-4-2" }])).toEqual({ formation: "3-5-2", count: 1 });
  });

  it("bez zápasů null", () => {
    expect(mostCommonFormation([])).toBeNull();
  });
});
