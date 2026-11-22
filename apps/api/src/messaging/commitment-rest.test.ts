/**
 * „Šetřím tě na Hradčany. Dám ti volno…“ slib místa v základu není (přetest 3, 22. 11.: zapsalo se
 * 📝 „místo v základu v příštím zápase“ a hráč pak připomínal „vy jste mi něco slíbil“).
 */
import { describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ askModelJson: vi.fn() }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  askModelJson: model.askModelJson,
}));

import { detectCommitment, parseDetection } from "./coach-commitments";

const MESSAGE = "Neber to jako trest, šetřím tě na Hradčany. Dám ti volno, odpočiň si a v neděli tě chci čerstvýho.";

describe("šetření hráče není slib základu", () => {
  it("detekční prompt má protipříklad „šetřím tě na…“", async () => {
    model.askModelJson.mockResolvedValueOnce({ kind: "none", quote: "" });
    await detectCommitment({}, { playerFirstName: "Jan", playerPosition: "MID", coachMessage: MESSAGE });
    const prompt = String(model.askModelJson.mock.calls[0][1]);
    expect(prompt).toContain("„šetřím tě na Hradčany“");
    expect(prompt).toContain("slib základu to není");
  });

  it("i když ho model za slib vezme, věta o šetření nebo volnu slib základu nezapíše", () => {
    expect(parseDetection({ kind: "start_next", quote: "šetřím tě na Hradčany" }, "MID", MESSAGE)).toBeNull();
    expect(parseDetection({ kind: "start_soon", quote: "Dám ti volno" }, "MID", MESSAGE)).toBeNull();
    // Skutečný slib základu dál platí, i když je ve zprávě i volno.
    expect(parseDetection({ kind: "start_next", quote: "zítra hraješ v základu" }, "MID", "Zítra hraješ v základu. Pak máš volno."))
      .toEqual({ kind: "start_next" });
  });
});
