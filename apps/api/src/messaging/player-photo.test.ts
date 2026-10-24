import { describe, expect, it } from "vitest";
import { PHOTO_SCENES, generatePlayerPhoto, historyBody, photoKey, pickPhotoScene, workPhotoScene } from "./player-photo";

describe("fotky od hráčů", () => {
  it("k situaci vybere fotku, která dává smysl", () => {
    expect(pickPhotoScene({ scenarioId: "alcohol_struggle", scenarioCategory: "personal", workplace: null })?.id).toBe("pub_round");
    expect(pickPhotoScene({ scenarioId: "injury_concern", scenarioCategory: "personal", workplace: null })?.id).toBe("injury");
    expect(pickPhotoScene({ scenarioId: "praise_after_win", scenarioCategory: "positive", workplace: null })?.id).toBe("pub_celebration");
    expect(pickPhotoScene({ scenarioId: "bench_complaint", scenarioCategory: "complaint", workplace: "farm" })?.id).toBe("work_farm");
    expect(pickPhotoScene({ scenarioId: "bench_complaint", scenarioCategory: "complaint", workplace: null })).toBeNull();
    // V hospodě v práci (hospodský) se fotka z práce nedělá.
    expect(workPhotoScene("pub")).toBeNull();
  });

  it("žádná fotka nemá nápisy ani obličeje do objektivu", () => {
    for (const scene of Object.values(PHOTO_SCENES)) {
      expect(scene.prompt).toContain("no printed text");
      expect(scene.prompt).toContain("No faces looking at the camera");
    }
  });

  it("hráč si pamatuje, co na fotce poslal", () => {
    expect(historyBody("Trenére, nechceš se stavit?", "stůl v hospodě plný piv a panáků"))
      .toBe("[Fotka: stůl v hospodě plný piv a panáků] Trenére, nechceš se stavit?");
    expect(historyBody("Ahoj", null)).toBe("Ahoj");
  });

  it("při výpadku modelu zkusí jiný seed a fotku uloží jako JPEG", async () => {
    const calls: string[] = [];
    let n = 0;
    const ai = {
      run: async (_model: string, input: { multipart: { body: ReadableStream; contentType: string } }) => {
        const form = await new Response(input.multipart.body, { headers: { "content-type": input.multipart.contentType } }).formData();
        calls.push(String(form.get("seed")));
        if (n++ === 0) throw new Error("AiError: 3043: Internal server error");
        return { image: btoa("jpegdata") };
      },
    } as unknown as Ai;
    const stored = new Map<string, { type?: string }>();
    const bucket = {
      put: async (key: string, _v: unknown, opts?: { httpMetadata?: { contentType?: string } }) => {
        stored.set(key, { type: opts?.httpMetadata?.contentType });
        return { key };
      },
    } as unknown as R2Bucket;
    const key = await generatePlayerPhoto(ai, bucket, PHOTO_SCENES.pub_round, "abc", 5);
    expect(key).toBe(photoKey("abc"));
    expect(stored.get("photos/abc.jpg")?.type).toBe("image/jpeg");
    expect(calls.length).toBe(2);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it("když se fotka nepovede ani napotřetí, vrátí null", async () => {
    const ai = { run: async () => { throw new Error("AiError: 3030: Your output has been flagged"); } } as unknown as Ai;
    const bucket = { put: async () => ({}) } as unknown as R2Bucket;
    expect(await generatePlayerPhoto(ai, bucket, PHOTO_SCENES.injury, "x", 1)).toBeNull();
  });
});
