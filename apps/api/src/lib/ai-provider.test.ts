/**
 * Vrstva nad modelem.
 *
 * Hlídá hlavně tvar odpovědi z Workers AI. Ten se liší podle toho, co model
 * vrátí, a když se na něj sáhne jako na string, spadne celé volání na
 * TypeError. Volající to pak nepozná od výpadku modelu: chat s hráči kvůli
 * tomu na testingu mlčel, protože odpověď hráče chodí jako JSON.
 */
import { describe, it, expect, vi } from "vitest";
import { generateText } from "./ai-provider";

/** Workers AI binding, který vrátí, co dostane. */
const ai = (response: unknown) => ({ run: vi.fn().mockResolvedValue({ response }) });

const ctx = (response: unknown) => ({
  provider: "workers-ai" as const,
  ai: ai(response) as never,
  geminiApiKey: undefined,
  gatewayUrl: undefined,
});

describe("odpověď z Workers AI", () => {
  it("prostý text projde a ořízne se", () => {
    return expect(generateText(ctx("  ahoj trenére  "), "x")).resolves.toBe("ahoj trenére");
  });

  it("hotový objekt se nerozbije, ale poskládá zpátky na JSON", async () => {
    const out = await generateText(ctx({ body: "Mám to koleno blbý", conversation_complete: false }), "x");
    expect(out).not.toBeNull();
    expect(JSON.parse(out!)).toEqual({ body: "Mám to koleno blbý", conversation_complete: false });
  });

  it("pole taky projde, ne každý model vrací objekt", async () => {
    const out = await generateText(ctx([{ text: "a" }]), "x");
    expect(JSON.parse(out!)).toEqual([{ text: "a" }]);
  });

  it("prázdná a chybějící odpověď je null, ne pád", async () => {
    expect(await generateText(ctx(""), "x")).toBeNull();
    expect(await generateText(ctx(undefined), "x")).toBeNull();
    expect(await generateText(ctx(null), "x")).toBeNull();
  });

  it("číslo ani jiný divný tvar volání neshodí", async () => {
    expect(await generateText(ctx(42), "x")).toBeNull();
  });

  it("když binding chybí, negeneruje se, ale nepadá to", async () => {
    const out = await generateText(
      { provider: "workers-ai", ai: undefined, geminiApiKey: undefined, gatewayUrl: undefined },
      "x",
    );
    expect(out).toBeNull();
  });

  it("vypnuté generování vrací null bez volání modelu", async () => {
    const binding = ai("nemělo by se zavolat");
    const out = await generateText(
      { provider: "off", ai: binding as never, geminiApiKey: undefined, gatewayUrl: undefined },
      "x",
    );
    expect(out).toBeNull();
    expect(binding.run).not.toHaveBeenCalled();
  });

  it("pád samotného volání se spolkne do null, ne do výjimky", async () => {
    const binding = { run: vi.fn().mockRejectedValue(new Error("503")) };
    const out = await generateText(
      { provider: "workers-ai", ai: binding as never, geminiApiKey: undefined, gatewayUrl: undefined },
      "x",
    );
    expect(out).toBeNull();
  });
});
