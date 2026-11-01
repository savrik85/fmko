import { describe, expect, it } from "vitest";
import { isMatchTickNow, isRoundRecoveryTickNow, pragueHour, pragueKickoffIso } from "./match-tick-schedule";

describe("pragueHour — hodina v Praze z okamžiku v UTC", () => {
  it("v létě (SELČ) je 16:00 UTC v Praze 18 hodin", () => {
    expect(pragueHour(new Date("2026-10-12T16:00:00Z"))).toBe(18);
  });

  it("po změně času (SEČ, od 25. 10. 2026) je 16:00 UTC v Praze 17 hodin a 17:00 UTC 18 hodin", () => {
    expect(pragueHour(new Date("2026-10-26T16:00:00Z"))).toBe(17);
    expect(pragueHour(new Date("2026-10-26T17:00:00Z"))).toBe(18);
  });
});

describe("isMatchTickNow — kolo se hraje v 18:00 pražského času", () => {
  it("v létě jede zápasový tick v 16:00 a 16:05 UTC", () => {
    expect(isMatchTickNow("0 16 * * *", 18)).toBe(true);
    expect(isMatchTickNow("5 16 * * *", 18)).toBe(true);
  });

  it("v létě se tick v 17:00 UTC (19:00 v Praze) přeskočí", () => {
    expect(isMatchTickNow("0 17 * * *", 19)).toBe(false);
    expect(isMatchTickNow("5 17 * * *", 19)).toBe(false);
  });

  it("v zimě se tick v 16:00 UTC (17:00 v Praze) přeskočí, aby se kolo neodehrálo o hodinu dřív", () => {
    expect(isMatchTickNow("0 16 * * *", 17)).toBe(false);
    expect(isMatchTickNow("5 16 * * *", 17)).toBe(false);
  });

  it("v zimě jede zápasový tick v 17:00 a 17:05 UTC", () => {
    expect(isMatchTickNow("0 17 * * *", 18)).toBe(true);
    expect(isMatchTickNow("5 17 * * *", 18)).toBe(true);
  });

  it("ruční spuštění (bez cronu) jede vždy", () => {
    expect(isMatchTickNow(undefined, 9)).toBe(true);
    expect(isMatchTickNow("", 9)).toBe(true);
  });

  it("jiné crony zápasy nehrají", () => {
    expect(isMatchTickNow("0 3 * * *", 18)).toBe(false);
    expect(isMatchTickNow("20 16 * * *", 18)).toBe(false);
  });

  it("když pražská hodina není známá, jede se postaru v 16:xx UTC a 17:xx se přeskočí", () => {
    expect(isMatchTickNow("0 16 * * *", null)).toBe(true);
    expect(isMatchTickNow("5 16 * * *", null)).toBe(true);
    expect(isMatchTickNow("0 17 * * *", null)).toBe(false);
  });
});

describe("isRoundRecoveryTickNow — dohrání zaseklých kol v 18:20 pražského času", () => {
  it("v létě v 16:20 UTC, v zimě v 17:20 UTC", () => {
    expect(isRoundRecoveryTickNow("20 16 * * *", 18)).toBe(true);
    expect(isRoundRecoveryTickNow("20 17 * * *", 19)).toBe(false);
    expect(isRoundRecoveryTickNow("20 16 * * *", 17)).toBe(false);
    expect(isRoundRecoveryTickNow("20 17 * * *", 18)).toBe(true);
  });

  it("bez známé hodiny jede postaru jen 16:20 UTC", () => {
    expect(isRoundRecoveryTickNow("20 16 * * *", null)).toBe(true);
    expect(isRoundRecoveryTickNow("20 17 * * *", null)).toBe(false);
  });

  it("zápasové crony dohrání nespouští", () => {
    expect(isRoundRecoveryTickNow("0 16 * * *", 18)).toBe(false);
  });
});

describe("pragueKickoffIso — přátelák v 18:00 pražského času", () => {
  it("v zimě 17:00 UTC", () => {
    expect(pragueKickoffIso("2026-11-05")).toBe("2026-11-05T17:00:00.000Z");
  });
  it("v létě 16:00 UTC", () => {
    expect(pragueKickoffIso("2026-07-12")).toBe("2026-07-12T16:00:00.000Z");
  });
  it("nesmysl jako den vrátí dosavadních 16:00 UTC", () => {
    expect(pragueKickoffIso("bez-data")).toBe("bez-dataT16:00:00.000Z");
  });
});

describe("výkop poháru v poledne v Praze", () => {
  it("uložené 16:00 UTC i nové kolo ukáže 12:00 pražského času", async () => {
    const { cupKickoffIso } = await import("./match-tick-schedule");
    expect(cupKickoffIso("2026-11-07T16:00:00.000Z")).toBe("2026-11-07T11:00:00.000Z");
    expect(cupKickoffIso("2026-07-11T16:00:00.000Z")).toBe("2026-07-11T10:00:00.000Z");
    expect(cupKickoffIso(null)).toBeNull();
  });
});
