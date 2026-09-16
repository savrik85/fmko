import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { terminZapasu } from "./season-weather";

describe("termín zápasu podle klíče", () => {
  it("najde ligové kolo, pohár i přátelák, jinak null", async () => {
    const liga = new FalesnaD1([{ sql: /FROM season_calendar/, first: { scheduled_at: "2026-09-20T15:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(liga), "cal-1")).toBe("2026-09-20T15:00:00.000Z");

    const pohar = new FalesnaD1([{ sql: /FROM cup_matches/, first: { scheduled_at: "2026-09-21T15:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(pohar), "cup-1")).toBe("2026-09-21T15:00:00.000Z");

    const pratelak = new FalesnaD1([{ sql: /FROM matches WHERE id/, first: { created_at: "2026-09-22T10:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(pratelak), "m-1")).toBe("2026-09-22T10:00:00.000Z");

    expect(await terminZapasu(jakoD1(new FalesnaD1()), "nic")).toBeNull();
    expect(await terminZapasu(jakoD1(new FalesnaD1()), "")).toBeNull();
  });
});
