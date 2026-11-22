/**
 * Co hráč ví o sobě: přestupová listina. Študlar (Výškovice) byl od 7. 10. na prodej a 8. 10.
 * trenérovi psal „Zraněný jsem taky nebyl, tak proč mě neberete do hry?“.
 */
import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { marketListingLine, memoryPromptLines } from "./player-memory";

describe("hráč na přestupové listině", () => {
  it("ví, že ho klub chce prodat, a nediví se, že nehraje", () => {
    const line = marketListingLine({ kind: "transfer", since: "2026-10-07" });
    expect(line).toContain("přestupovou listinu (od 7. 10.)");
    expect(line).toContain("klub tě chce prodat");
    expect(line).toContain("netvrď, že nevíš proč");
    expect(line).not.toContain("—");
  });

  it("na hostování jinak než na prodej", () => {
    expect(marketListingLine({ kind: "loan", since: "2026-11-02" })).toContain("na hostování (od 2. 11.)");
  });

  it("jde do promptu jen hráči na listině", () => {
    const base = { coachCommitments: undefined, hearsay: undefined } as unknown as PlayerSnapshot;
    expect(memoryPromptLines(base).some((l) => l.includes("listinu"))).toBe(false);
    expect(memoryPromptLines({ ...base, marketListing: { kind: "transfer", since: "2026-10-07" } }).some((l) => l.includes("listinu"))).toBe(true);
  });
});
