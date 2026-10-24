import { describe, expect, it } from "vitest";
import { COACH_VOICE_NOTES_PER_DAY, coachAudioKey, isCoachAudioKey, sanitizePeaks, takeVoiceNoteQuota, trustedTranscript } from "./coach-voice";

describe("hlasová odpověď trenéra", () => {
  it("k zprávě jde připojit jen nahrávka vlastního týmu", () => {
    const key = coachAudioKey("team-1", "abc-123", "webm");
    expect(isCoachAudioKey("team-1", key)).toBe(true);
    expect(isCoachAudioKey("team-2", key)).toBe(false);
    expect(isCoachAudioKey("team-1", "voice/m1.wav")).toBe(false);
    expect(isCoachAudioKey("team-1", "voice/coach/team-1/../x.webm")).toBe(false);
    expect(isCoachAudioKey("team-1", 42)).toBe(false);
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
