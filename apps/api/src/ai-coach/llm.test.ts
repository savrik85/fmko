import { describe, expect, it } from "vitest";
import { buildModelInput, callCoachModel, extractModelOutput, parseModelJson } from "./llm";

describe("čtení JSON z odpovědi modelu", () => {
  it("hotový objekt vrátí beze změny", () => {
    expect(parseModelJson({ formation: "4-4-2" })).toEqual({ formation: "4-4-2" });
  });

  it("přečte čistý řetězec i s mezerami a odřádkováním kolem", () => {
    expect(parseModelJson('\n\n {"tactic":"balanced"} \n')).toEqual({ tactic: "balanced" });
  });

  it("přečte blok kódu ```json", () => {
    expect(parseModelJson('Tady je:\n```json\n{"hardness":"fair"}\n```\nhotovo')).toEqual({ hardness: "fair" });
  });

  it("najde první objekt v textu i se složenými závorkami v řetězci", () => {
    expect(parseModelJson('Rozhodnutí: {"reasoning":"a {b} c","plan":[]} a konec')).toEqual({ reasoning: "a {b} c", plan: [] });
  });

  it("smetí, pole a prázdno vrátí null", () => {
    expect(parseModelJson("nevím, co dělat")).toBeNull();
    expect(parseModelJson("[1, 2, 3]")).toBeNull();
    expect(parseModelJson("")).toBeNull();
    expect(parseModelJson(null)).toBeNull();
    expect(parseModelJson('{"nedokončené": ')).toBeNull();
  });
});

describe("tvary odpovědi Workers AI", () => {
  it("OpenAI chat completions: obsah a tokeny, úvaha se nebere", () => {
    const out = extractModelOutput({
      choices: [{ message: { content: '{"a":1}', reasoning: "přemýšlím…", reasoning_content: "přemýšlím…" } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    });
    expect(out.text).toBe('{"a":1}');
    expect(out.tokensIn).toBe(120);
    expect(out.tokensOut).toBe(30);
  });

  it("starý tvar { response } jako řetězec i jako objekt", () => {
    expect(extractModelOutput({ response: '{"b":2}' }).text).toBe('{"b":2}');
    const obj = extractModelOutput({ response: { b: 2 } });
    expect(obj.object).toEqual({ b: 2 });
  });

  it("Responses API: text z výstupní zprávy", () => {
    const out = extractModelOutput({
      output: [
        { type: "reasoning", content: [{ type: "reasoning_text", text: "úvaha" }] },
        { type: "message", content: [{ type: "output_text", text: '{"c":3}' }] },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    expect(out.text).toBe('{"c":3}');
    expect(out.tokensIn).toBe(10);
  });

  it("prázdná zpráva s úvahou vrátí prázdný text (došly tokeny)", () => {
    expect(extractModelOutput({ choices: [{ message: { content: null, reasoning: "dlouhá úvaha" } }] }).text).toBe("");
  });
});

describe("volání modelu", () => {
  const req = { system: "s", user: "u", maxTokens: 100 };

  it("uvažující model dostane rozpočet na úvahu a sílu úvahy, schéma jde do response_format", () => {
    const input = buildModelInput("@cf/openai/gpt-oss-120b", { ...req, schema: { name: "x", schema: { type: "object" } } });
    expect(input.max_tokens).toBeGreaterThan(100);
    expect(input.reasoning_effort).toBe("high");
    expect((input.response_format as { type: string }).type).toBe("json_schema");
  });

  it("vrátí JSON a tokeny", async () => {
    const env = { AI: { run: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) } as unknown as Ai };
    const res = await callCoachModel(env, req);
    expect(res.json).toEqual({ ok: true });
    expect(res.error).toBeUndefined();
    expect(res.tokensOut).toBe(2);
  });

  it("výpadek modelu nehází, vrátí null a důvod", async () => {
    const env = { AI: { run: async () => { throw new Error("8008: Internal server error"); } } as unknown as Ai };
    const res = await callCoachModel(env, req);
    expect(res.json).toBeNull();
    expect(res.error).toContain("8008");
  });

  it("přechodnou chybu platformy jednou zopakuje", async () => {
    let calls = 0;
    const env = {
      AI: {
        run: async () => {
          calls++;
          if (calls === 1) throw new Error("5017: Failed to fetch configuration");
          return { choices: [{ message: { content: '{"ok":1}' } }] };
        },
      } as unknown as Ai,
    };
    const res = await callCoachModel(env, req);
    expect(calls).toBe(2);
    expect(res.json).toEqual({ ok: 1 });
  });

  it("překročený čas vrátí null", async () => {
    const env = { AI: { run: () => new Promise((resolve) => setTimeout(() => resolve({ response: "{}" }), 200)) } as unknown as Ai };
    const res = await callCoachModel(env, { ...req, timeoutMs: 20 });
    expect(res.json).toBeNull();
    expect(res.error).toContain("timeout");
  });

  it("nesmysl místo JSON vrátí null a surový text", async () => {
    const env = { AI: { run: async () => ({ choices: [{ message: { content: "Hrajte srdcem!" } }] }) } as unknown as Ai };
    const res = await callCoachModel(env, req);
    expect(res.json).toBeNull();
    expect(res.raw).toBe("Hrajte srdcem!");
  });

  it("bez bindingu AI nic nevolá", async () => {
    const res = await callCoachModel({ AI: undefined }, req);
    expect(res.json).toBeNull();
    expect(res.error).toBe("chybí binding AI");
  });
});
