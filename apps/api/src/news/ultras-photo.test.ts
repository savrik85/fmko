import { afterEach, describe, expect, it, vi } from "vitest";
import { BANNER_READ_PROMPT, bannerTextMatches, colorName, generateUltrasPhoto, ultrasPhotoKey, ultrasPhotoPrompt, ultrasStandFromStadium } from "./ultras-photo";

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

  it("kotel stojí na své tribuně podle úrovně ve hře, bez tribuny u plotu", () => {
    const prompt = (level: number, roof = 0, cage = 0) => ultrasPhotoPrompt({ ...BANNER, stand: { level, roof, cage } });
    expect(prompt(0)).toContain("behind a low metal fence");
    expect(prompt(0)).toContain("no stadium stands");
    expect(ultrasPhotoPrompt(BANNER)).toContain("no stadium stands");
    expect(prompt(1)).toContain("low concrete terrace steps");
    expect(prompt(2, 1)).toContain("small stand behind the goal under a simple metal roof");
    expect(prompt(3)).toContain("large stand behind the goal, many rows");
    expect(prompt(3)).not.toContain("roof");
    for (const level of [1, 2, 3]) expect(prompt(level)).not.toContain("no stadium stands");
  });

  it("mříž nebo plexi před kotlem, plachta visí z jejich strany hřiště", () => {
    const prompt = (cage: number) => ultrasPhotoPrompt({ ...BANNER, stand: { level: 2, roof: 0, cage } });
    expect(prompt(1)).toContain("metal mesh fence");
    expect(prompt(2)).toContain("plexiglass");
    expect(prompt(0)).not.toMatch(/mesh|plexiglass/);
  });

  it("tribuna kotle ze stadionu: za levou brankou, bez sloupců stran podle tribun celkem", () => {
    expect(ultrasStandFromStadium({ stand_goal_west: 2, stands: 3, roof: 1, cage: null })).toEqual({ level: 2, roof: 1, cage: 0 });
    expect(ultrasStandFromStadium({ stand_goal_west: null, stands: 3 })).toEqual({ level: 3, roof: 0, cage: 0 });
    expect(ultrasStandFromStadium({})).toEqual({ level: 0, roof: 0, cage: 0 });
  });

  it("nápis stejné barvy jako plachta se namaluje čitelně", () => {
    expect(ultrasPhotoPrompt({ ...BANNER, bannerColor: "#3B6B8C", textColor: "#3B6B8C" })).toContain("blue cloth banner hand-painted with uneven white brush letters");
    expect(ultrasPhotoPrompt({ ...BANNER, bannerColor: "#ffffff", textColor: "#fafafa" })).toContain("white cloth banner hand-painted with uneven black brush letters");
  });

  it("nápis sedí i s jinými mezerami a interpunkcí, ale ne bez háčků", () => {
    expect(bannerTextMatches("JEDINĚ HORNÍ SPŮLE!", "Jedině horní Spůle")).toBe(true);
    expect(bannerTextMatches("JEDINĚ HORNÍ SPŮLE!", "JEDINÉ HORNÍ SPÓLE!")).toBe(false);
  });

  it("slepená slova nesedí, zalomení řádku a interpunkce ano", () => {
    expect(bannerTextMatches("BOHDALEC MÁ DÍRU V PRDELI!", "BOHDALEC MÁDÍRU V PRDELI!")).toBe(false);
    expect(bannerTextMatches("BOHDALEC MÁ DÍRU V PRDELI!", "BOHDALEC MÁ\nDÍRU V PRDELI")).toBe(true);
    expect(bannerTextMatches("NIKDO NÁS NEMÁ RÁD. A CO.", "NIKDO NÁS NEMÁ RÁD A CO")).toBe(true);
  });

  it("háček zapsaný samostatným znaménkem se nezahodí", () => {
    // Gemini tak přepsalo chybné plachty: háček nad Y místo čárky, háček navíc nad V.
    expect(bannerTextMatches("VE VÝBORU", "VE VY\u030CBORU")).toBe(false);
    expect(bannerTextMatches("VE VÝBORU", "VE V\u030CÝBORU")).toBe(false);
    // Správný nápis v rozložené podobě (Y + čárka) sedí.
    expect(bannerTextMatches("VE VÝBORU", "VE VY\u0301BORU")).toBe(true);
  });

  it("když Gemini přečte jiný nápis, zkusí jiný seed a vezme až ten správný", async () => {
    const reads = ["JEDINÉ ČKYNĚ!", "JEDINĚ ČKYNĚ!"];
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
    const id = await generateUltrasPhoto(ai, bucket, { ...BANNER, ultrasText: "JEDINĚ ČKYNĚ!" }, "abc", 3, "klic", 0);
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

  it("nápis s Ů se nefotí vůbec, model ho nenamaluje", async () => {
    const run = vi.fn(async () => ({ image: btoa("jpeg") }));
    const ai = { run } as unknown as Ai;
    const bucket = { put: async () => ({}) } as unknown as R2Bucket;
    expect(await generateUltrasPhoto(ai, bucket, { ...BANNER, ultrasText: "ZABIJAK ZŮSTÁVÁ" }, "z", 1, "klic", 0)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("bez klíče se nápis nekontroluje a bere se první fotka", async () => {
    const ai = { run: async () => ({ image: btoa("jpeg") }) } as unknown as Ai;
    const bucket = { put: async () => ({}) } as unknown as R2Bucket;
    expect(await generateUltrasPhoto(ai, bucket, BANNER, "y", 1, undefined, 0)).toBe("y");
  });
});
