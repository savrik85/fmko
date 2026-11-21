/**
 * Brigáda přes kabinu (F1, plán 2026-11-20): rozpoznání výzvy, čas, odměna pivem,
 * kdo přijde a co z toho vzejde. Bez databáze; zápis a vyhodnocení jsou v .db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.hoisted(() => {
  class GeminiUnavailableError extends Error {}
  return { askModelJson: vi.fn(), GeminiUnavailableError };
});
vi.mock("./ai-player-chat", () => ({
  askModelJson: chat.askModelJson,
  COACH_TEXT_RULE: "pravidlo",
  coachQuote: (text: string) => `<<<${text}>>>`,
  GeminiUnavailableError: chat.GeminiUnavailableError,
}));

import {
  brigadeAttendanceChance, brigadeHint, brigadeOutcome, brigadeQuoteHoldsUp, brigadeWhenText, detectBrigadeCall,
  looksLikeBrigadeCall, parseBrigadeTime, promisesBeer,
} from "./squad-brigade";

/** Středa 25. 11. 2026, 9:00 v Praze. */
const WED = new Date("2026-11-25T08:00:00Z");

const CALLS = [
  "Kluci v sobotu v 9 sraz na hřišti s lopatama, napadlo půl metru sněhu a v neděli hrajem doma. Kdo přijde, má ode mě pivo 🍺",
  "pánove zejtra rano brigada na hristi, je tam bordel jak v tanku, kdo dorazi dostane basu",
  "Hoši potřebuju vás v pátek odpoledne na hřišti, musíme odklidit sníh ať to v sobotu neni kluziště a nikdo si nezláme haxnu",
  "zitra v deset odklizime snih z hriste, kdo muze at prijde, pak jdem na jedno",
  "Ve středu po práci brigáda u kabin, natřem zábradlí a uklidíme kolem hřiště. Pivo platím já, tak nekňučte",
  "Kdo přijde v sobotu ráno na brigádu? Potřebuju aspoň šest chlapů s lopatou, jinak to neodházíme",
  // Podmiňovací způsob není minulost.
  "Bylo by fajn, kdyby v neděli dopoledne přišlo aspoň šest lidí, ať to hřiště uklidíme do kupy, aby bylo na zápas hratelný",
];

const NOT_CALLS = [
  // Minulý čas, poděkování.
  "Brigáda na sprchy byla super, díky všem co přišli, takhle to má vypadat",
  "Minulej tejden jsme odhazovali snih celý dopoledne a stejne se nehralo, to byla zase fraska",
  "Lhota měla včera brigádu na hřišti a mají to tam jak koberec, to bysme taky měli někdy udělat",
  // Sázka o basu, žádná práce.
  "kdyz v nedeli vyhrajem, platim basu, to si piste za usi",
  "Vsadím se s váma o basu, že v sobotu ani jeden z vás nedá gól",
  // Brigáda jako práce, ne v klubu.
  "Hele kdo z vás má přes zimu brigádu? Ptá se mě kamarád z pily, shání lidi",
  // Jen počasí, vágní nápad, uklidnění.
  "Napadl sníh, tak se na zápas pořádně oblečte, ať pak nenastydnete jak minule",
  "Někdy na jaře bysme mohli udělat brigádu, až bude tepleji",
  "Uklidni se Pepo, v neděli to bude dobrý, nehroť to",
];

beforeEach(() => {
  chat.askModelJson.mockReset();
});

describe("předběžné síto", () => {
  it("pustí každou výzvu k brigádě", () => {
    for (const text of CALLS) expect(brigadeHint(text), text).toBe(true);
  });

  it("sázku, počasí ani uklidňování modelu neposílá", () => {
    for (const text of [NOT_CALLS[3], NOT_CALLS[4], NOT_CALLS[6], NOT_CALLS[8]]) expect(brigadeHint(text), text).toBe(false);
  });
});

describe("pravidlo, když model nejede", () => {
  it("pozná výzvu s časem i v hovorové češtině a s překlepy", () => {
    for (const text of CALLS) expect(looksLikeBrigadeCall(text), text).toBe(true);
  });

  it("minulost, sázku, cizí brigádu ani vágní nápad výzvou nebere", () => {
    for (const text of NOT_CALLS) expect(looksLikeBrigadeCall(text), text).toBe(false);
  });
});

describe("pojistka citace od modelu", () => {
  it("citace musí ve zprávě být a nesmí mluvit o minulosti", () => {
    expect(brigadeQuoteHoldsUp("Brigáda na sprchy byla super", NOT_CALLS[0])).toBe(false);
    expect(brigadeQuoteHoldsUp("jsme odhazovali snih celý dopoledne", NOT_CALLS[1])).toBe(false);
    expect(brigadeQuoteHoldsUp("v sobotu brigáda na hřišti", "Ahoj kluci, jak se máte?")).toBe(false);
    expect(brigadeQuoteHoldsUp("", CALLS[0])).toBe(false);
    expect(brigadeQuoteHoldsUp(null, CALLS[0])).toBe(false);
  });

  it("sázka o basu ani nápad na jaro výzvou nejsou", () => {
    const text = "Kluci, když vyhrajem, platím basu. Brigádu uděláme někdy na jaře.";
    expect(brigadeQuoteHoldsUp("když vyhrajem, platím basu", text)).toBe(false);
    expect(brigadeQuoteHoldsUp("Brigádu uděláme někdy na jaře", text)).toBe(false);
  });

  it("skutečnou výzvu pustí, i když citace vede přes dvě věty", () => {
    expect(brigadeQuoteHoldsUp("v sobotu v 9 sraz na hřišti s lopatama", CALLS[0])).toBe(true);
    expect(brigadeQuoteHoldsUp("zejtra rano brigada na hristi", CALLS[1])).toBe(true);
    expect(brigadeQuoteHoldsUp("Kdo přijde v sobotu ráno na brigádu? Potřebuju aspoň šest chlapů s lopatou", CALLS[5])).toBe(true);
  });
});

describe("odměna pivem", () => {
  it("pivo, basa, runda nebo „jdem na jedno“", () => {
    expect(promisesBeer(CALLS[0])).toBe(true);
    expect(promisesBeer(CALLS[1])).toBe(true);
    expect(promisesBeer(CALLS[3])).toBe(true);
    expect(promisesBeer(CALLS[4])).toBe(true);
  });

  it("bez zmínky o pivu nic", () => {
    expect(promisesBeer(CALLS[2])).toBe(false);
    expect(promisesBeer(CALLS[5])).toBe(false);
  });
});

describe("čas brigády (pražský čas)", () => {
  it("den v týdnu a hodina", () => {
    expect(parseBrigadeTime(CALLS[0], WED).toISOString()).toBe("2026-11-28T08:00:00.000Z");
  });

  it("zejtra ráno, zítra v deset", () => {
    expect(parseBrigadeTime(CALLS[1], WED).toISOString()).toBe("2026-11-26T08:00:00.000Z");
    expect(parseBrigadeTime(CALLS[3], WED).toISOString()).toBe("2026-11-26T09:00:00.000Z");
  });

  it("pátek odpoledne a dnešní středa po práci", () => {
    expect(parseBrigadeTime(CALLS[2], WED).toISOString()).toBe("2026-11-27T13:00:00.000Z");
    expect(parseBrigadeTime(CALLS[4], WED).toISOString()).toBe("2026-11-25T15:00:00.000Z");
  });

  it("bez času zítra v deset, v létě podle letního času", () => {
    expect(parseBrigadeTime("Kluci, brigáda na hřišti, vemte lopaty", WED).toISOString()).toBe("2026-11-26T09:00:00.000Z");
    expect(parseBrigadeTime("zítra v 10 brigáda", new Date("2026-07-01T06:00:00Z")).toISOString()).toBe("2026-07-02T08:00:00.000Z");
  });

  it("čas s dvojtečkou i bez předložky", () => {
    expect(parseBrigadeTime("v sobotu 9:30 brigáda na hřišti, lopaty s sebou", WED).toISOString()).toBe("2026-11-28T08:30:00.000Z");
    expect(looksLikeBrigadeCall("Brigáda 9:30 na hřišti, lopaty s sebou")).toBe(true);
  });

  it("„ve dvě“ je odpoledne, ne ve dvě ráno", () => {
    expect(parseBrigadeTime("v sobotu ve dvě brigáda u kabin", WED).toISOString()).toBe("2026-11-28T13:00:00.000Z");
  });

  it("čas, který dnes už minul, je za chvíli, ne v minulosti", () => {
    const at = parseBrigadeTime("dneska v 8 brigáda, hned jak to půjde", WED);
    expect(at.getTime()).toBeGreaterThan(WED.getTime());
    expect(at.getTime() - WED.getTime()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("popis pro kabinu slovy", () => {
    expect(brigadeWhenText(new Date("2026-11-28T08:00:00Z"), WED)).toBe("v sobotu v 9:00");
    expect(brigadeWhenText(new Date("2026-11-26T09:00:00Z"), WED)).toBe("zítra v 10:00");
    expect(brigadeWhenText(new Date("2026-11-25T15:00:00Z"), WED)).toBe("dnes v 16:00");
    expect(brigadeWhenText(new Date("2026-11-27T13:00:00Z"), WED)).not.toMatch(/[—–]/);
  });
});

describe("kdo přijde", () => {
  const base = { coachRelationship: 50, discipline: 50, hangover: false, occupation: null };

  it("lepší vztah k trenérovi a disciplína znamenají vyšší šanci", () => {
    expect(brigadeAttendanceChance({ ...base, coachRelationship: 85 }, false)).toBeGreaterThan(brigadeAttendanceChance(base, false));
    expect(brigadeAttendanceChance({ ...base, coachRelationship: 15 }, false)).toBeLessThan(brigadeAttendanceChance(base, false));
    expect(brigadeAttendanceChance({ ...base, discipline: 90 }, false)).toBeGreaterThan(brigadeAttendanceChance(base, false));
  });

  it("s kocovinou se ráno na hřiště skoro nikdo nedohrabe", () => {
    expect(brigadeAttendanceChance({ ...base, hangover: true }, false)).toBeLessThan(brigadeAttendanceChance(base, false) - 0.2);
  });

  it("směnař přijde méně často než student", () => {
    expect(brigadeAttendanceChance({ ...base, occupation: "Hasič" }, false))
      .toBeLessThan(brigadeAttendanceChance({ ...base, occupation: "Student" }, false));
  });

  it("pivo táhne", () => {
    expect(brigadeAttendanceChance(base, true)).toBeGreaterThan(brigadeAttendanceChance(base, false));
  });

  it("šance zůstane v mezích", () => {
    const best = brigadeAttendanceChance({ coachRelationship: 100, discipline: 100, hangover: false, occupation: "Student" }, true);
    const worst = brigadeAttendanceChance({ coachRelationship: 0, discipline: 0, hangover: true, occupation: "Hasič" }, false);
    expect(best).toBeLessThanOrEqual(0.9);
    expect(worst).toBeGreaterThanOrEqual(0.05);
  });
});

describe("výsledek podle účasti", () => {
  it("šest a víc plná parta, tři až pět polovičatě, míň nic", () => {
    expect(brigadeOutcome(9)).toBe("full");
    expect(brigadeOutcome(6)).toBe("full");
    expect(brigadeOutcome(5)).toBe("partial");
    expect(brigadeOutcome(3)).toBe("partial");
    expect(brigadeOutcome(2)).toBe("flop");
    expect(brigadeOutcome(0)).toBe("flop");
  });
});

describe("rozpoznání výzvy přes model", () => {
  it("model výzvu potvrdí doslovnou citací: čas a pivo určí kód", async () => {
    chat.askModelJson.mockResolvedValue({ kind: "brigade", quote: "v sobotu v 9 sraz na hřišti s lopatama" });
    const call = await detectBrigadeCall({}, CALLS[0], WED);
    expect(call).toMatchObject({ beer: true, via: "model" });
    expect(call?.at.toISOString()).toBe("2026-11-28T08:00:00.000Z");
  });

  it("když se model splete u minulého času, pojistka výzvu zahodí", async () => {
    chat.askModelJson.mockResolvedValue({ kind: "brigade", quote: "Brigáda na sprchy byla super" });
    expect(await detectBrigadeCall({}, NOT_CALLS[0], WED)).toBeNull();
  });

  it("model řekne „none“: pravidlo ho nepřebíjí", async () => {
    chat.askModelJson.mockResolvedValue({ kind: "none", quote: "" });
    expect(await detectBrigadeCall({}, CALLS[1], WED)).toBeNull();
  });

  it("model nejede (AI vypnutá): zaskočí pravidlo", async () => {
    chat.askModelJson.mockRejectedValue(new chat.GeminiUnavailableError("ai_provider = off"));
    const call = await detectBrigadeCall({}, CALLS[3], WED);
    expect(call).toMatchObject({ beer: true, via: "rule" });
    expect(await detectBrigadeCall({}, NOT_CALLS[1], WED)).toBeNull();
  });

  it("model vrátí nesmysl: taky pravidlo", async () => {
    chat.askModelJson.mockResolvedValue(null);
    expect(await detectBrigadeCall({}, CALLS[2], WED)).toMatchObject({ via: "rule", beer: false });
  });

  it("obyčejná zpráva model vůbec nevolá", async () => {
    expect(await detectBrigadeCall({}, "Kluci, zítra v šest trénink, nezapomeňte kopačky", WED)).toBeNull();
    expect(chat.askModelJson).not.toHaveBeenCalled();
  });
});
