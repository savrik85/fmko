import { afterEach, describe, expect, it, vi } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import {
  VOICES_BY_AGE,
  VOICE_MESSAGES_PER_WEEK,
  ageGroup,
  buildVoicePrompt,
  drunkSpeech,
  durationSecFromPcm,
  pcmToWav,
  peaksFromPcm,
  pickPlayerVoice,
  recordVoiceMessage,
  spokenText,
  voicePreviewText,
} from "./voice-message";

/** PCM 16 bit mono: první polovina ticho, druhá hlasitá. */
function pcm(seconds: number): Uint8Array {
  const samples = 24000 * seconds;
  const out = new Uint8Array(samples * 2);
  const v = new DataView(out.buffer);
  for (let i = samples / 2; i < samples; i++) v.setInt16(i * 2, i % 2 ? 12000 : -12000, true);
  return out;
}

function kv(provider: string | null): KVNamespace {
  return { get: async () => provider } as unknown as KVNamespace;
}

function r2(): R2Bucket & { stored: Map<string, unknown> } {
  const stored = new Map<string, unknown>();
  return {
    stored,
    put: async (key: string, value: unknown) => { stored.set(key, value); return { key }; },
  } as unknown as R2Bucket & { stored: Map<string, unknown> };
}

function ttsResponse(audio: Uint8Array): Response {
  let bin = "";
  for (const b of audio) bin += String.fromCharCode(b);
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: btoa(bin) } }] } }] }));
}

const PLAYER = { id: "p1", firstName: "Martin", age: 24, nationality: "CZ", lifeContext: "{}" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stálý hlas hráče", () => {
  it("podle věku vybírá z odpovídající skupiny hlasů", () => {
    expect(ageGroup(19)).toBe("young");
    expect(ageGroup(27)).toBe("adult");
    expect(ageGroup(35)).toBe("senior");
    expect(VOICES_BY_AGE.young).toContain(pickPlayerVoice("p1", 19).name);
    expect(VOICES_BY_AGE.senior).toContain(pickPlayerVoice("p1", 38).name);
  });

  it("stejný hráč dostane pokaždé stejný hlas i rys", () => {
    expect(pickPlayerVoice("hrac-42", 25)).toEqual(pickPlayerVoice("hrac-42", 25));
  });

  it("uložený hlas má přednost, i když hráč mezitím zestárl", () => {
    const storedVoice = { name: "Orus", trait: "speaks fast" };
    expect(pickPlayerVoice("p1", 34, storedVoice)).toEqual(storedVoice);
  });

  it("neznámý uložený hlas se ignoruje", () => {
    expect(pickPlayerVoice("p1", 34, { name: "Kore", trait: "x" }).name).not.toBe("Kore");
  });
});

describe("text a pokyny pro namluvení", () => {
  it("emoji se nečtou", () => {
    expect(spokenText("Díky, trenére 🙏 jdu na to! ⚽️")).toBe("Díky, trenére jdu na to!");
  });

  it("text ke čtení stojí až za nadpisem, pokyny před ním", () => {
    const prompt = buildVoicePrompt({
      firstName: "Marek", age: 27, scene: "Hráč je naštvaný.", nationality: "SK",
      voice: { name: "Charon", trait: "speaks fast" }, transcript: "Tréner, tu Marek.",
    });
    const [notes, transcript] = prompt.split("#### TRANSCRIPT\n");
    expect(transcript).toBe("Tréner, tu Marek.");
    expect(notes).toContain("speaks fast");
    expect(notes).toContain("Slovak");
  });
});

describe("nahrávka", () => {
  it("WAV má správnou hlavičku a délku dat", () => {
    const wav = pcmToWav(pcm(1));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint32(40, true)).toBe(48000);
    expect(wav.length).toBe(44 + 48000);
  });

  it("obrys: ticho nula, hlasitá část nahoru, 40 sloupců", () => {
    const peaks = peaksFromPcm(pcm(2));
    expect(peaks).toHaveLength(40);
    expect(peaks[0]).toBe(0);
    expect(peaks[39]).toBe(1);
  });

  it("délka a náhled v seznamu", () => {
    expect(durationSecFromPcm(pcm(2))).toBe(2);
    expect(voicePreviewText(20)).toBe("🎤 Hlasová zpráva (0:20)");
    expect(voicePreviewText(75)).toBe("🎤 Hlasová zpráva (1:15)");
  });
});

describe("hlasovka místo SMS", () => {
  it("projde: namluví, uloží do R2 a hráči zapíše stálý hlas", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ttsResponse(pcm(2)));
    vi.stubGlobal("fetch", fetchMock);
    const db = new FalesnaD1([{ sql: /COUNT\(\*\) AS n/, first: { n: 0 } }]);
    const bucket = r2();

    const recorded = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: bucket }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "Lavička.", body: "Trenére, tady Martin 😤", random: () => 0,
    });

    expect(recorded?.meta).toMatchObject({ type: "voice", audioKey: "voice/m1.wav", durationSec: 2 });
    expect(recorded?.meta.peaks).toHaveLength(40);
    expect(recorded?.transcript).toBe("Trenére, tady Martin");
    expect(bucket.stored.has("voice/m1.wav")).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].text.split("#### TRANSCRIPT\n")[1]).toBe("Trenére, tady Martin");
    expect(db.dotazy.some((d) => /json_set\(COALESCE\(life_context/.test(d.sql))).toBe(true);
  });

  it("týdenní strop: další už jde jako SMS", async () => {
    const fetchMock = vi.fn(async () => ttsResponse(pcm(2)));
    vi.stubGlobal("fetch", fetchMock);
    const db = new FalesnaD1([{ sql: /COUNT\(\*\) AS n/, first: { n: VOICE_MESSAGES_PER_WEEK } }]);

    const meta = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: r2() }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "x", body: "Ahoj", random: () => 0,
    });

    expect(meta).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bez Gemini (Workers AI) žádná hlasovka", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const meta = await recordVoiceMessage(jakoD1(new FalesnaD1([])), { GEMINI_API_KEY: "k", CACHE_KV: kv("workers-ai"), SEED_DATA: r2() }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "x", body: "Ahoj", force: true,
    });
    expect(meta).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("když namluvení selže, vrátí null a zpráva odejde jako SMS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 402 })));
    const bucket = r2();
    const meta = await recordVoiceMessage(jakoD1(new FalesnaD1([])), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: bucket }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "x", body: "Ahoj", force: true,
    });
    expect(meta).toBeNull();
    expect(bucket.stored.size).toBe(0);
  });
});

describe("opilá hlasovka", () => {
  const DRUNK_SAMPLE = "Šéfe... tady Pepa. Hele, sorry, že volám takhle pozdě, ale ten zápas, co? Tři jedna! "
    + "My tu u Ježka ještě sedíme, Tonda platí rundu... Hele, zejtra na trénink dorazím asi trochu pozdějc, jo? "
    + "Ale v pondělí jsem fit, fakt. Vy jste nejlepší trenér v okrese. Fakt. Dobrou.";

  it("opilý text jako ve vítězné variantě C: natažená samohláska, hehe, ehm, opakování", () => {
    expect(drunkSpeech(DRUNK_SAMPLE)).toBe(
      "Šééfe... tady Pepa. Hele, sorry, že volám takhle pozdě, ale ten zápas, co? Tři jedna! Hehehe. "
      + "My tu u Ježka ještě sedíme, Tonda platí rundu... Ehm... Hele, zejtra na trénink dorazím asi trochu pozdějc, jo? "
      + "Ale v pondělí jsem fit, fakt fakt. Vy jste nejlepší trenér v okrese. Fakt... fakt. Dobrou... dobrou.",
    );
  });

  it("krátká zpráva: jen natažení a smích, jméno se neopakuje", () => {
    expect(drunkSpeech("Trenére, vyhráli jsme! Tonda je borec.")).toBe("Treenére, vyhráli jsme! Hehehe. Tonda je borec.");
  });

  it("opilé pokyny jen když hráč volá z hospody", () => {
    const base = { firstName: "Pepa", age: 31, scene: "Výhra.", nationality: "CZ", voice: { name: "Algenib", trait: "loud and direct" }, transcript: "Šéfe." };
    expect(buildVoicePrompt({ ...base, drunk: true })).toContain("slurred");
    expect(buildVoicePrompt(base)).not.toContain("slurred");
  });

  it("namluví se opilý text a ten se vrátí jako přepis", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ttsResponse(pcm(2)));
    vi.stubGlobal("fetch", fetchMock);
    const db = new FalesnaD1([{ sql: /COUNT\(\*\) AS n/, first: { n: 0 } }]);
    const recorded = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: r2() }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "Výhra.", body: "Tři jedna! Dobrou.", drunk: true, random: () => 0,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].text.split("#### TRANSCRIPT\n")[1]).toBe("Třii jedna! Hehehe. Dobrou... dobrou.");
    expect(recorded?.transcript).toBe("Třii jedna! Hehehe. Dobrou... dobrou.");
  });
});
