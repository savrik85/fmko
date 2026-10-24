import { afterEach, describe, expect, it, vi } from "vitest";
import { BANNER_READ_PROMPT, bannerTextMatches, colorName, generateUltrasPhoto, ultrasPhotoKey, ultrasPhotoPrompt } from "./ultras-photo";

const BANNER = {
  ultrasText: "RADŠI KELÍMKY NA TRÁVNÍKU NEŽ LEMRY VE VÝBORU",
  bannerColor: "#A0432C", textColor: "#ffffff", primaryColor: "#920c32", secondaryColor: "#1A1A1A", level: 2,
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("fotky plachet kotle", () => {
  it("barvy plachty a šál slovy, hex model nechápe", () => {
    expect(colorName("#920c32")).toBe("burgundy");
    expect(colorName("#1A1A1A")).toBe("black");
    expect(colorName("#ffffff")).toBe("white");
    expect(colorName("#1D4ED8")).toBe("blue");
    expect(colorName("#2D5F2D")).toBe("dark green");
  });

  it("zadání nese přesný nápis, barvy a bez stadionu", () => {
    const p = ultrasPhotoPrompt(BANNER);
    expect(p).toContain(`read exactly "${BANNER.ultrasText}"`);
    expect(p).toContain("burgundy and black scarves");
    expect(p).toContain("no stadium stands");
    expect(p).toContain("plain burgundy and black flags without any emblem");
  });

  it("háčky nápisu se modelu popíšou, jinak je maluje jako čárky", () => {
    expect(ultrasPhotoPrompt({ ...BANNER, ultrasText: "KOVÁČIK. NÁŠ KLUK." })).toContain("Czech letters painted carefully: Č, Š have a small v-shaped caron above");
    expect(ultrasPhotoPrompt({ ...BANNER, ultrasText: "Už teď" })).toContain("Czech letters painted carefully: Ž, Ď have");
    expect(ultrasPhotoPrompt({ ...BANNER, ultrasText: "ROD VEN!" })).not.toContain("caron");
  });

  it("nápis stejné barvy jako plachta se namaluje čitelně", () => {
    expect(ultrasPhotoPrompt({ ...BANNER, bannerColor: "#3B6B8C", textColor: "#3B6B8C" })).toContain("blue cloth banner hand-painted with uneven white brush letters");
    expect(ultrasPhotoPrompt({ ...BANNER, bannerColor: "#ffffff", textColor: "#fafafa" })).toContain("white cloth banner hand-painted with uneven black brush letters");
  });

  it("nápis sedí i s jinými mezerami a interpunkcí, ale ne bez háčků", () => {
    expect(bannerTextMatches("JEDINĚ HORNÍ SPŮLE!", "Jedině horní Spůle")).toBe(true);
    expect(bannerTextMatches("JEDINĚ HORNÍ SPŮLE!", "JEDINÉ HORNÍ SPÓLE!")).toBe(false);
  });

  it("háček zapsaný samostatným znaménkem se nezahodí", () => {
    // Gemini tak přepsalo chybné plachty: háček nad Y místo čárky, háček navíc nad V.
    expect(bannerTextMatches("VE VÝBORU", "VE VY\u030CBORU")).toBe(false);
    expect(bannerTextMatches("VE VÝBORU", "VE V\u030CÝBORU")).toBe(false);
    // Správný nápis v rozložené podobě (Y + čárka) sedí.
    expect(bannerTextMatches("VE VÝBORU", "VE VY\u0301BORU")).toBe(true);
  });

  it("když Gemini přečte jiný nápis, zkusí jiný seed a vezme až ten správný", async () => {
    const reads = ["JEDINÉ HORNÍ SPÓLE!", "JEDINĚ HORNÍ SPŮLE!"];
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: reads.shift() }] } }],
    })));
    vi.stubGlobal("fetch", fetchMock);
    const seeds: string[] = [];
    const ai = {
      run: async (_m: string, input: { multipart: { body: ReadableStream; contentType: string } }) => {
        const form = await new Response(input.multipart.body, { headers: { "content-type": input.multipart.contentType } }).formData();
        seeds.push(String(form.get("seed")));
        return { image: btoa("jpeg") };
      },
    } as unknown as Ai;
    const stored: string[] = [];
    const bucket = { put: async (key: string) => { stored.push(key); return { key }; } } as unknown as R2Bucket;
    const id = await generateUltrasPhoto(ai, bucket, { ...BANNER, ultrasText: "JEDINĚ HORNÍ SPŮLE!" }, "abc", 3, "klic", 0);
    expect(id).toBe("abc");
    expect(seeds.length).toBe(2);
    expect(stored).toEqual([ultrasPhotoKey("abc")]);
    // Bez zákazu opravovat Gemini čte, co na plachtě být má, ne co tam je.
    expect(String(fetchMock.mock.calls[0][1].body)).toContain(BANNER_READ_PROMPT);
    expect(BANNER_READ_PROMPT).toContain("Neopravuj pravopis");
  });

  it("když nápis nesedí ani na čtvrtý pokus, fotka není a zůstane kreslená plachta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "NĚCO JINÉHO" }] } }],
    }))));
    const ai = { run: async () => ({ image: btoa("jpeg") }) } as unknown as Ai;
    const bucket = { put: async () => ({}) } as unknown as R2Bucket;
    expect(await generateUltrasPhoto(ai, bucket, BANNER, "x", 1, "klic", 0)).toBeNull();
  });

  it("bez klíče se nápis nekontroluje a bere se první fotka", async () => {
    const ai = { run: async () => ({ image: btoa("jpeg") }) } as unknown as Ai;
    const bucket = { put: async () => ({}) } as unknown as R2Bucket;
    expect(await generateUltrasPhoto(ai, bucket, BANNER, "y", 1, undefined, 0)).toBe("y");
  });
});
