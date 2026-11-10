/**
 * Společný čistič dlouhých pomlček: co z nich udělá podle kontextu a že běží
 * na výstupu modelu dřív, než se text kamkoli uloží.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanDashes, cleanDashesDeep } from "./dashes";
import { generateText } from "./ai-provider";
import { callGemini } from "../news/gemini-helper";
import { cleanReply } from "../social/ai-replies";

describe("cleanDashes", () => {
  it("vsuvka mezi slovy je čárka, dlouhá i krátká pomlčka", () => {
    expect(cleanDashes("Přišel — a vyhrál")).toBe("Přišel, a vyhrál");
    expect(cleanDashes("Dvory – to je jiná liga")).toBe("Dvory, to je jiná liga");
    expect(cleanDashes("Trenér ― to se ví ― mlčel")).toBe("Trenér, to se ví, mlčel");
  });

  it("mezi čísly je to spojovník: skóre, rozsah, roky", () => {
    expect(cleanDashes("Vyhráli 3–1 a 2 — 0")).toBe("Vyhráli 3-1 a 2-0");
    expect(cleanDashes("Hráči ve věku 18–21 let, sezóna 2026–2027")).toBe("Hráči ve věku 18-21 let, sezóna 2026-2027");
  });

  it("bez mezer mezi slovy zůstane spojovník", () => {
    expect(cleanDashes("derby Sparta–Slavia")).toBe("derby Sparta-Slavia");
  });

  it("na začátku řádku zmizí (odrážka, uvozovací pomlčka) a odsazení zůstane", () => {
    expect(cleanDashes("— Jedeme dál\n  – a bez řečí")).toBe("Jedeme dál\n  a bez řečí");
  });

  it("po interpunkci a na konci řádku zmizí, čárka se nezdvojí", () => {
    expect(cleanDashes("Vyhráli, — a zaslouženě.")).toBe("Vyhráli, a zaslouženě.");
    expect(cleanDashes("Co na to říct? — Nic.")).toBe("Co na to říct? Nic.");
    expect(cleanDashes("Tak zase příště —\nA další řádek")).toBe("Tak zase příště\nA další řádek");
  });

  it("text bez dlouhých pomlček nechá být, včetně spojovníku a mínusu", () => {
    const text = "Česko-slovenský zápas skončil 2-1, bilance -3.  Dvě mezery i\n\nprázdný řádek zůstanou. ";
    expect(cleanDashes(text)).toBe(text);
  });

  it("JSON od modelu zůstane platný", () => {
    const raw = JSON.stringify({ body: "Vyhráli jsme — konečně", score: "3–1", n: -2 });
    expect(JSON.parse(cleanDashes(raw))).toEqual({ body: "Vyhráli jsme, konečně", score: "3-1", n: -2 });
  });

  it("cleanDashesDeep projde vnořené texty a klíče ani čísla nemění", () => {
    expect(cleanDashesDeep({ "a–b": "x — y", list: ["1–2", { deep: "– začátek" }], n: 5, ok: true, nil: null }))
      .toEqual({ "a–b": "x, y", list: ["1-2", { deep: "začátek" }], n: 5, ok: true, nil: null });
  });
});

describe("čistič běží na výstupu modelu", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("Workers AI: text i objekt přijdou bez dlouhých pomlček", async () => {
    const ai = { run: vi.fn(async () => ({ response: "Dvory přejely Lhotu — 3–0\n— a bylo hotovo" })) };
    expect(await generateText({ provider: "workers-ai", ai: ai as never }, "prompt")).toBe("Dvory přejely Lhotu, 3-0\na bylo hotovo");
    ai.run.mockResolvedValueOnce({ response: { body: "Jdu — fakt" } } as never);
    expect(await generateText({ provider: "workers-ai", ai: ai as never }, "prompt")).toBe('{"body":"Jdu, fakt"}');
  });

  it("Gemini: odpověď přijde bez dlouhých pomlček", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Titulek — s pomlčkou\nTělo – článku." }] } }],
    }), { status: 200 })));
    expect(await callGemini("key", "prompt")).toBe("Titulek, s pomlčkou\nTělo, článku.");
  });

  it("odpověď fanouška v Sockách používá stejný čistič", () => {
    expect(cleanReply("„Trenére — tohle se ti fakt nepovedlo #prales“")).toBe("Trenére, tohle se ti fakt nepovedlo");
    expect(cleanReply("Prohráli jste 0–4, co víc říct")).toBe("Prohráli jste 0-4, co víc říct");
  });
});
