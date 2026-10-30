import { afterEach, describe, expect, it, vi } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import {
  VOICES_BY_AGE,
  VOICE_MESSAGES_PER_WEEK,
  ageGroup,
  buildVoicePrompt,
  drunkSpeech,
  withoutCoachAddress,
  durationSecFromPcm,
  mixAmbience,
  pickAmbience,
  pcmToWav,
  peaksFromPcm,
  pickPlayerVoice,
  recordVoiceMessage,
  rerecordVoiceMessagesDrunk,
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
    get: async () => null,
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
      "Šééfe... Kurva. tady Pepa. Hele, sorry, že volám takhle pozdě, ale ten zápas, co? Tři jedna! Hehehe. "
      + "My tu u Ježka ještě sedíme, Tonda platí rundu... Ehm... Hele, zejtra na trénink dorazím asi trochu pozdějc, jo, ty vole? "
      + "Ale v pondělí jsem fit, fakt fakt. Vy jste nejlepší trenér v okrese. Fakt... fakt. Dobrou... dobrou.",
    );
  });

  it("krátká zpráva: oslovení trenére vypadne, přibude ehm a dvě nadávky", () => {
    expect(drunkSpeech("Trenére, vyhráli jsme! Tonda je borec.")).toBe("Vyyhráli jsme! Hehehe. Kurva fix. Ehm... Tonda je borec, do píči.");
  });

  it("oslovení trenére z opilé řeči mizí bez zbytků čárek", () => {
    expect(withoutCoachAddress("Trenére, makám.")).toBe("Makám.");
    expect(spokenText("ale… *škyt* pojď na jedno 🍺")).toBe("ale… pojď na jedno");
    expect(withoutCoachAddress("Čau trenére, chci hrát.")).toBe("Čau, chci hrát.");
    expect(withoutCoachAddress("Víte, trenére, já nevím.")).toBe("Víte, já nevím.");
    expect(withoutCoachAddress("Díky, trenére!")).toBe("Díky!");
  });

  it("pokyny pro hlas jsou bez českého popisu situace, ten model četl nahlas", () => {
    const prompt = buildVoicePrompt({ firstName: "Pepa", age: 31, scene: "Hráč se ozývá sám.", nationality: "CZ", voice: { name: "Algenib", trait: "x" }, transcript: "Ahoj.", drunk: true });
    expect(prompt.split("#### TRANSCRIPT")[0]).not.toContain("Hráč se ozývá");
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
    expect(body.contents[0].parts[0].text.split("#### TRANSCRIPT\n")[1]).toBe("Třii jedna! Hehehe. Do píči. Ehm... Dobrou, kurva.");
    expect(recorded?.transcript).toBe("Třii jedna! Hehehe. Do píči. Ehm... Dobrou, kurva.");
  });
});

describe("přehrání odeslaných hlasovek opile", () => {
  it("stejný hráč a hlas, opilý text do TTS i přepisu, nahrávka přepsaná na stejném klíči", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ttsResponse(pcm(3)));
    vi.stubGlobal("fetch", fetchMock);
    const db = new FalesnaD1([
      { sql: /FROM messages m JOIN players p/, all: [{
        id: "m1", conversation_id: "c1", body: "Trenére, v pondělí chci hrát. Fakt.",
        metadata: JSON.stringify({ type: "voice", audioKey: "voice/m1.wav", durationSec: 10, peaks: [], voice: "Orus", scenario_id: "x" }),
        first_name: "Marek", age: 22, nationality: "CZ", life_context: JSON.stringify({ voice: { name: "Orus", trait: "speaks fast" } }),
      }] },
      { sql: /SELECT COUNT\(\*\) AS n FROM messages/, first: { n: 0 } },
    ]);
    const bucket = r2();

    const r = await rerecordVoiceMessagesDrunk(jakoD1(db), { GEMINI_API_KEY: "k", SEED_DATA: bucket }, { scenarioId: "x", scene: "Vztah.", limit: 3 });

    expect(r).toEqual({ done: [{ messageId: "m1", player: "Marek", durationSec: 3 }], failed: [], left: 0 });
    expect(bucket.stored.has("voice/m1.wav")).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Orus");
    expect(body.contents[0].parts[0].text).toContain("slurred");
    const update = db.davky.flat().find((d) => /UPDATE messages SET body/.test(d.sql));
    expect(update?.params[0]).toBe("V poondělí chci hrát. Do píči. Ehm... Fakt, kurva.");
  });
});

describe("hospoda pod opilou hlasovkou", () => {
  it("začne před hlasem, dozní po něm, okraje prolne a nepřebije hlas", () => {
    const ambience = new Uint8Array(24000 * 2 * 4);
    const av = new DataView(ambience.buffer);
    for (let i = 0; i < ambience.length / 2; i++) av.setInt16(i * 2, i % 2 ? 2000 : -2000, true);
    const out = mixAmbience(pcm(1), ambience, 7);
    const ov = new DataView(out.buffer);
    expect(out.length).toBe((14400 + 24000 + 19200) * 2);
    expect(ov.getInt16(0, true)).toBe(0);
    expect(Math.abs(ov.getInt16(10000 * 2, true))).toBeGreaterThan(0);
    let peak = 0;
    for (let i = 0; i < out.length / 2; i++) peak = Math.max(peak, Math.abs(ov.getInt16(i * 2, true)));
    expect(peak).toBeLessThanOrEqual(32767);
  });

  it("opilá hlasovka s nahrávkou hospody je o předehru a dozvuk delší", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ttsResponse(pcm(2))));
    const ambience = new Uint8Array(24000 * 2 * 10).fill(1);
    const bucket = { ...r2(), get: async () => ({ arrayBuffer: async () => ambience.buffer }) } as unknown as R2Bucket;
    const db = new FalesnaD1([{ sql: /COUNT\(\*\) AS n/, first: { n: 0 } }]);
    const recorded = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: bucket }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "x", body: "Vyhráli jsme! Dobrou.", drunk: true, random: () => 0,
    });
    expect(recorded?.meta.durationSec).toBe(3);
  });
});

describe("zvuk pod každou hlasovkou", () => {
  const base = { drunk: false, drinksAt: null, urban: false, seed: "m1" } as const;

  it("v práci je slyšet pracoviště podle povolání", () => {
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Zemědělec" })).toBe("farm");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Zedník" })).toBe("construction");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Automechanik" })).toBe("workshop");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Řidič autobusu" })).toBe("car");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Hospodský" })).toBe("pub");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Fotbalista" })).toBe("pitch");
  });

  it("povolání bez pracoviště je venku: na vesnici vesnice, v Praze ulice", () => {
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Zahradník" })).toBe("village");
    expect(pickAmbience({ ...base, situation: "prace", occupation: "Metař", urban: true })).toBe("street");
  });

  it("po šichtě doma, opilý vždycky v hospodě, pití doma u televize", () => {
    expect(pickAmbience({ ...base, situation: "po_praci", occupation: "Zedník" })).toBe("home");
    expect(pickAmbience({ ...base, drunk: true, situation: "prace", occupation: "Zedník" })).toBe("pub");
    expect(pickAmbience({ ...base, situation: "pije", drinksAt: "doma" })).toBe("home");
    expect(pickAmbience({ ...base, situation: "pije", drinksAt: "hospoda" })).toBe("pub");
  });

  it("volno je doma nebo venku, podle zprávy", () => {
    const places = new Set(["a", "b", "c", "d", "e", "f"].map((seed) =>
      pickAmbience({ ...base, situation: "volno", occupation: "Student", seed })));
    expect([...places].sort()).toEqual(["home", "village"]);
  });

  it("rána v podkladu nepřeřve hlas", () => {
    const bed = new Uint8Array(24000 * 2 * 4);
    const bv = new DataView(bed.buffer);
    for (let i = 0; i < bed.length / 2; i++) bv.setInt16(i * 2, i % 2 ? 100 : -100, true);
    // Bouchnutí kladiva v předehře, než hráč začne mluvit.
    bv.setInt16(10000 * 2, 30000, true);
    const out = mixAmbience(pcm(1), bed, 0, 0.18);
    expect(Math.abs(new DataView(out.buffer).getInt16(10000 * 2, true))).toBeLessThanOrEqual(6001);
  });

  it("načte podklad podle místa a zapíše ho do metadat, bez nahrávky jde hlas sám", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ttsResponse(pcm(2))));
    const bed = new Uint8Array(24000 * 2 * 10).fill(1);
    const keys: string[] = [];
    const bucket = { ...r2(), get: async (key: string) => { keys.push(key); return { arrayBuffer: async () => bed.buffer }; } } as unknown as R2Bucket;
    const db = new FalesnaD1([{ sql: /COUNT\(\*\) AS n/, first: { n: 0 } }]);
    const farm = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: bucket }, {
      teamId: "t1", messageId: "m1", player: PLAYER, scene: "x", body: "Jsem v kravíně.", ambience: "farm", random: () => 0,
    });
    expect(keys).toEqual(["voice/ambience/farm-24k.pcm"]);
    expect(farm?.meta.ambience).toBe("farm");
    expect(farm?.meta.durationSec).toBe(3);

    const plain = await recordVoiceMessage(jakoD1(db), { GEMINI_API_KEY: "k", CACHE_KV: kv(null), SEED_DATA: r2() }, {
      teamId: "t1", messageId: "m2", player: PLAYER, scene: "x", body: "Jsem v kravíně.", ambience: "farm", random: () => 0,
    });
    expect(plain?.meta.ambience).toBeUndefined();
    expect(plain?.meta.durationSec).toBe(2);
  });
});
