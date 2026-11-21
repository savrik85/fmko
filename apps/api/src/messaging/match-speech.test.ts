import { describe, expect, it } from "vitest";
import {
  postMoraleDelta, postSpeechInWindow, speechFormShift, speechSummary, tooSimilar,
} from "./match-speech";

describe("proslovy: výpočty", () => {
  it("posun formy dne: před zápasem 0,12 za bod, po zápase 0,05, hodnocení oříznuté na −2 až +3", () => {
    expect(speechFormShift("pre", 3)).toBe(0.36);
    expect(speechFormShift("pre", -2)).toBe(-0.24);
    expect(speechFormShift("pre", 9)).toBe(0.36);
    expect(speechFormShift("post", 3)).toBe(0.15);
    expect(speechFormShift("post", -5)).toBe(-0.1);
  });

  it("nálada kabiny po zápase: 2 body za bod hodnocení", () => {
    expect(postMoraleDelta(3)).toBe(6);
    expect(postMoraleDelta(-2)).toBe(-4);
    expect(postMoraleDelta(0)).toBe(0);
  });

  it("opakované fráze se poznají, jiný proslov ne", () => {
    const a = "Kluci, dneska hrajeme s Lhotou o všechno, makejte jeden za druhého a nikdo nesmí vypustit souboj.";
    expect(tooSimilar(a, `${a} Jdeme na to!`)).toBe(true);
    expect(tooSimilar(a, "Díky za dnešek, obrana držela, Novák to odmakal za dva, takhle se hraje vesnický fotbal.")).toBe(false);
  });

  it("proslov po zápase jen do 12 hodin od konce zápasu", () => {
    const end = "2026-11-21T17:00:00.000Z";
    expect(postSpeechInWindow(end, new Date("2026-11-21T20:00:00Z"))).toBe(true);
    expect(postSpeechInWindow(end, new Date("2026-11-22T04:59:00Z"))).toBe(true);
    expect(postSpeechInWindow(end, new Date("2026-11-22T05:01:00Z"))).toBe(false);
    expect(postSpeechInWindow(end, new Date("2026-11-21T16:00:00Z"))).toBe(false);
  });

  it("detail zápasu: slovy, bez čísel a pomlček", () => {
    for (const kind of ["pre", "post"] as const) {
      for (let s = -2; s <= 3; s++) {
        expect(speechSummary(kind, s)).not.toMatch(/\d|[—–]/);
      }
    }
    expect(speechSummary("pre", 3)).not.toBe(speechSummary("pre", -2));
  });
});

describe("odpověď modelu s hodnocením se znaménkem", () => {
  it("„\"delta\": +2“ se přečte jako 2 (dřív proslov tiše nezabral)", async () => {
    const { tryParseJson } = await import("./ai-player-chat");
    expect(tryParseJson<{ delta: number }>('{"delta": +2, "mood": "Nabudilo je to."}')?.delta).toBe(2);
    expect(tryParseJson<{ delta: number }>('```json\n{"delta": -1, "mood": "x"}\n```')?.delta).toBe(-1);
    expect(tryParseJson<{ mood: string }>('{"delta": 1, "mood": "skóre +2 navíc"}')?.mood).toBe("skóre +2 navíc");
  });
});
