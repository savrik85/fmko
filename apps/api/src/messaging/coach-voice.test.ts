import { describe, expect, it } from "vitest";
import {
  COACH_VOICE_NOTES_PER_DAY, attachCoachAudio, cleanupPendingCoachAudio, isPendingCoachAudioKey, pendingCoachAudioKey,
  sanitizePeaks, takeVoiceNoteQuota, trustedTranscript,
} from "./coach-voice";

/** R2 v paměti: put/get/delete/list s časem nahrání. */
function memoryBucket(uploaded: Record<string, Date> = {}) {
  const objects = new Map<string, { body: Uint8Array; uploaded: Date; type?: string }>();
  for (const [key, at] of Object.entries(uploaded)) objects.set(key, { body: new Uint8Array([1, 2, 3]), uploaded: at });
  const bucket = {
    objects,
    get: async (key: string) => {
      const o = objects.get(key);
      return o ? { arrayBuffer: async () => o.body.buffer, httpMetadata: { contentType: o.type } } : null;
    },
    put: async (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => {
      objects.set(key, { body: new Uint8Array(value), uploaded: new Date(), type: opts?.httpMetadata?.contentType });
      return { key };
    },
    delete: async (keys: string | string[]) => { for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k); },
    list: async ({ prefix }: { prefix: string }) => ({
      objects: [...objects.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, uploaded: o.uploaded })),
      truncated: false,
    }),
  };
  return bucket as unknown as R2Bucket & { objects: typeof objects };
}

describe("hlasová odpověď trenéra", () => {
  it("k zprávě jde připojit jen odložená nahrávka vlastního týmu", () => {
    const key = pendingCoachAudioKey("team-1", "abc-123", "webm");
    expect(key).toBe("voice/coach-pending/team-1/abc-123.webm");
    expect(isPendingCoachAudioKey("team-1", key)).toBe(true);
    expect(isPendingCoachAudioKey("team-2", key)).toBe(false);
    expect(isPendingCoachAudioKey("team-1", "voice/coach/team-1/abc-123.webm")).toBe(false);
    expect(isPendingCoachAudioKey("team-1", "voice/coach-pending/team-1/../x.webm")).toBe(false);
    expect(isPendingCoachAudioKey("team-1", 42)).toBe(false);
  });

  it("odeslaná nahrávka se přesune z odkladu k hlasovkám", async () => {
    const bucket = memoryBucket({ "voice/coach-pending/t1/a.webm": new Date() });
    expect(await attachCoachAudio(bucket, "voice/coach-pending/t1/a.webm")).toBe("voice/coach/t1/a.webm");
    expect([...bucket.objects.keys()]).toEqual(["voice/coach/t1/a.webm"]);
    expect(await attachCoachAudio(bucket, "voice/coach-pending/t1/chybi.webm")).toBeNull();
  });

  it("noční úklid smaže jen neodeslané nahrávky starší než den", async () => {
    const now = new Date("2026-10-25T03:00:00Z");
    const bucket = memoryBucket({
      "voice/coach-pending/t1/stara.webm": new Date("2026-10-24T01:00:00Z"),
      "voice/coach-pending/t1/cerstva.webm": new Date("2026-10-25T02:00:00Z"),
      "voice/coach/t1/odeslana.webm": new Date("2026-10-20T01:00:00Z"),
    });
    expect(await cleanupPendingCoachAudio(bucket, now)).toBe(1);
    expect([...bucket.objects.keys()].sort()).toEqual(["voice/coach-pending/t1/cerstva.webm", "voice/coach/t1/odeslana.webm"]);
  });

  it("obrys z prohlížeče bere jen rozumná čísla", () => {
    expect(sanitizePeaks([0.123, 1, 0])).toEqual([0.12, 1, 0]);
    expect(sanitizePeaks([0.5, 2])).toBeUndefined();
    expect(sanitizePeaks("x")).toBeUndefined();
    expect(sanitizePeaks(new Array(65).fill(0.5))).toBeUndefined();
  });

  it("přepis s jistotou projde", () => {
    expect(trustedTranscript({
      text: " Hele, v neděli hraješ od začátku. ",
      transcription_info: { duration_after_vad: 3.2 },
      segments: [{ avg_logprob: -0.3, no_speech_prob: 0.01 }],
    })).toBe("Hele, v neděli hraješ od začátku.");
  });

  it("výplod ticha neodejde", () => {
    // Skutečný výsledek tiché nahrávky z Chromu (2026-10-24).
    expect(trustedTranscript({
      text: " Děkuji.",
      transcription_info: { duration_after_vad: 1.62 },
      segments: [{ avg_logprob: -1.07, no_speech_prob: 0 }],
    })).toBeNull();
    expect(trustedTranscript({ text: "Děkuji za pozornost.", segments: [{ avg_logprob: -0.2, no_speech_prob: 0.1 }] })).toBeNull();
    expect(trustedTranscript({ text: "Ahoj", transcription_info: { duration_after_vad: 0.2 } })).toBeNull();
    expect(trustedTranscript({ text: "  " })).toBeNull();
    expect(trustedTranscript(null)).toBeNull();
  });

  it("denní strop přepisů na tým", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
    } as unknown as KVNamespace;
    const day = new Date("2026-10-24T12:00:00Z");
    for (let i = 0; i < COACH_VOICE_NOTES_PER_DAY; i++) expect(await takeVoiceNoteQuota(kv, "t1", day)).toBe(true);
    expect(await takeVoiceNoteQuota(kv, "t1", day)).toBe(false);
    expect(await takeVoiceNoteQuota(kv, "t2", day)).toBe(true);
    expect(await takeVoiceNoteQuota(kv, "t1", new Date("2026-10-25T12:00:00Z"))).toBe(true);
  });
});
