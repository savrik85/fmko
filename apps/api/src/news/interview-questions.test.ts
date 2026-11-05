import { describe, it, expect, vi, afterEach } from "vitest";
import { generateInterviewQuestions } from "./interview-generator";

const ctx = {
  teamName: "Sokol Lčovice", opponentName: "Jiskra Vimperk", isHome: true, lastMatchResult: null, formStr: "VRP",
  leaguePos: 5, leaguePoints: 6, topPlayers: [], injuredStr: null, villageFlavor: "obec", gameWeek: 4,
} as Parameters<typeof generateInterviewQuestions>[1];

const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); });

describe("předzápasové otázky", () => {
  it("když Gemini poprvé selže, zkusí to znovu a otázky vzniknou", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(reply("Jak se cítíte před zápasem s Vimperkem?\nKdo za vás dá gól v neděli?\nCo říkáte na formu soupeře?"));
    vi.stubGlobal("fetch", fetchMock);
    const q = await generateInterviewQuestions("key", ctx);
    expect(q).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Volání má časový limit
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeDefined();
  });

  it("nepoužitelná odpověď (jedna otázka) se taky zkusí znovu, po dvou neúspěších null", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply("Jen jedna dlouhá otázka do rozhovoru?"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateInterviewQuestions("key", ctx)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
