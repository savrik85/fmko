import { beforeEach, describe, expect, it, vi } from "vitest";

const generateUltrasPhoto = vi.fn();
vi.mock("./ultras-photo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ultras-photo")>()),
  generateUltrasPhoto: (...args: unknown[]) => generateUltrasPhoto(...args),
}));

import { addUltrasPhotos, type UltrasPhoto } from "./ultras-report";
import { ULTRAS_PHOTOS_PER_REPORT } from "./ultras-photo";

function photo(teamId: string, ultrasText: string, extra: Partial<UltrasPhoto> = {}): UltrasPhoto {
  return {
    teamId, teamName: `Klub ${teamId}`, ultrasText, bannerColor: "#A0432C", textColor: "#ffffff",
    level: 2, attendance: 180, capacity: 300, fillPct: 60, caption: "kotel řval", ...extra,
  };
}

const ai = {} as Ai;
const bucket = {} as R2Bucket;

beforeEach(() => {
  generateUltrasPhoto.mockReset();
  generateUltrasPhoto.mockImplementation(async (_ai, _bucket, _banner, id: string) => id);
});

describe("fotky plachet v reportu kotle", () => {
  it("fotí nanejvýš strop kola, prázdné a už vyfocené přeskočí", async () => {
    const photos = [
      photo("t0", "   "),
      photo("t1", "PRALES NEBO NIC", { photoId: "stara" }),
      ...Array.from({ length: ULTRAS_PHOTOS_PER_REPORT + 1 }, (_, i) => photo(`n${i}`, `NÁPIS ${i}`)),
    ];
    const added = await addUltrasPhotos(ai, bucket, photos, [], "klic");
    expect(added).toBe(ULTRAS_PHOTOS_PER_REPORT);
    expect(photos[0].photoId).toBeUndefined();
    expect(photos[1].photoId).toBe("stara");
    expect(photos.at(-1)?.photoId).toBeUndefined();
    expect(generateUltrasPhoto).toHaveBeenCalledTimes(ULTRAS_PHOTOS_PER_REPORT);
  });

  it("šály mají barvy domácího klubu, bez klubu barvy plachty", async () => {
    const photos = [photo("t1", "JEDINĚ SPŮLE!"), photo("t2", "DO TOHO")];
    await addUltrasPhotos(ai, bucket, photos, [{ homeTeamId: "t1", primaryColor: "#920c32", secondaryColor: "#1A1A1A" }]);
    expect(generateUltrasPhoto.mock.calls[0][2]).toMatchObject({ ultrasText: "JEDINĚ SPŮLE!", primaryColor: "#920c32", secondaryColor: "#1A1A1A", level: 2 });
    expect(generateUltrasPhoto.mock.calls[1][2]).toMatchObject({ primaryColor: "#A0432C", secondaryColor: "#ffffff" });
  });

  it("každá fotka má vlastní seed, stejná plachta příští kolo nedá tutéž fotku", async () => {
    await addUltrasPhotos(ai, bucket, [photo("t1", "JEDINĚ SPŮLE!")], []);
    await addUltrasPhotos(ai, bucket, [photo("t1", "JEDINĚ SPŮLE!")], []);
    const [first, second] = generateUltrasPhoto.mock.calls;
    expect(first[3]).not.toBe(second[3]);
    expect(first[4]).not.toBe(second[4]);
  });

  it("když generování fotky spadne chybou, report nespadne a ostatní kotle se fotí dál", async () => {
    generateUltrasPhoto.mockImplementation(async (_ai, _bucket, banner: { ultrasText: string }, id: string) => {
      if (banner.ultrasText === "DO TOHO") throw new Error("neplatná odpověď modelu");
      return id;
    });
    const photos = [photo("t1", "JEDINĚ SPŮLE!"), photo("t2", "DO TOHO"), photo("t3", "VAŘÍME")];
    expect(await addUltrasPhotos(ai, bucket, photos, [])).toBe(2);
    expect(photos.map((p) => Boolean(p.photoId))).toEqual([true, false, true]);
  });

  it("nepovedená fotka nechá kreslenou plachtu, ostatní kotle se fotí dál", async () => {
    generateUltrasPhoto.mockImplementation(async (_ai, _bucket, banner: { ultrasText: string }, id: string) =>
      banner.ultrasText === "DO TOHO" ? null : id);
    const photos = [photo("t1", "JEDINĚ SPŮLE!"), photo("t2", "DO TOHO"), photo("t3", "VAŘÍME"), photo("t4", "NAVÍC")];
    expect(await addUltrasPhotos(ai, bucket, photos, [])).toBe(3);
    expect(photos[1].photoId).toBeUndefined();
    expect(photos[3].photoId).toBeDefined();
  });
});
