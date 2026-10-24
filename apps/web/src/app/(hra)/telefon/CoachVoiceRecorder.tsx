"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";

/**
 * Hlasová odpověď trenéra jako ve WhatsAppu: zelený mikrofon místo šipky, během
 * nahrávání červená tečka s časem, koš a šipka. Šipka nahrávku pošle rovnou,
 * přepis (Whisper na serveru) se ukáže pod hlasovkou. Odeslání obstará stránka
 * konverzace přes `onSend`, stejně jako SMS.
 */
export interface CoachVoiceNote {
  audioKey: string;
  durationSec: number;
  peaks?: number[];
  transcript: string;
}

interface CoachVoiceRecorderProps {
  teamId: string;
  convId: string;
  disabled: boolean;
  onSend: (note: CoachVoiceNote) => Promise<void>;
  /** Během nahrávání zabírá lišta nahrávání celý řádek místo pole pro zprávu. */
  onActiveChange: (active: boolean) => void;
  /** Chyba se ukáže tam, kde chyby SMS (nad polem pro zprávu). */
  onError: (message: string | null) => void;
}

type RecState = "idle" | "recording" | "sending";

const MAX_SEC = 60;
const PEAK_BARS = 40;

/** Umí prohlížeč nahrávat? Volat až v prohlížeči (v efektu), ne při renderu na serveru. */
export function isVoiceRecordingSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickMimeType();
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
    .find((t) => MediaRecorder.isTypeSupported(t));
}

/** Obrys nahrávky stejně jako u hlasovek hráčů (voice-message.ts `peaksFromPcm`). */
async function peaksFromBlob(blob: Blob): Promise<number[] | undefined> {
  try {
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    void ctx.close();
    const data = buffer.getChannelData(0);
    const segment = Math.max(1, Math.floor(data.length / PEAK_BARS));
    const rms = Array.from({ length: PEAK_BARS }, (_, b) => {
      let sum = 0;
      const end = Math.min(data.length, (b + 1) * segment);
      for (let i = b * segment; i < end; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / Math.max(1, end - b * segment));
    });
    const top = Math.max(...rms) || 1;
    return rms.map((r) => Math.round(Math.sqrt(r / top) * 100) / 100);
  } catch (e) {
    console.warn("obrys hlasové odpovědi:", e);
    return undefined;
  }
}

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M3.4 20.4 21 12 3.4 3.6 3.39 10.1 15 12l-11.61 1.9.01 6.5z" />
    </svg>
  );
}

export function CoachVoiceRecorder({ teamId, convId, disabled, onSend, onActiveChange, onError }: CoachVoiceRecorderProps) {
  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const sendOnStopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => { onActiveChange(state !== "idle"); }, [state, onActiveChange]);


  async function uploadAndSend(blob: Blob, durationSec: number) {
    setState("sending");
    try {
      const [res, peaks] = await Promise.all([
        apiFetch<{ audioKey: string; transcript: string; durationSec: number }>(
          `/api/teams/${teamId}/conversations/${convId}/voice-note?durationSec=${durationSec}`,
          { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob },
        ),
        peaksFromBlob(blob),
      ]);
      await onSend({ ...res, peaks });
    } catch (e) {
      console.error("odeslání hlasové odpovědi:", e);
      onError(e instanceof Error && e.message ? e.message : "Hlasovku se nepodařilo odeslat.");
    }
    setState("idle");
  }

  async function start() {
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      sendOnStopRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        if (!sendOnStopRef.current) { setState("idle"); return; }
        const durationSec = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        void uploadAndSend(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType }), durationSec);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setState("recording");
      timerRef.current = setInterval(() => {
        const sec = Math.round((Date.now() - startedRef.current) / 1000);
        setElapsed(sec);
        // Po minutě se nahrávka odešle sama, jako když trenér dojde na konec.
        if (sec >= MAX_SEC) { sendOnStopRef.current = true; recorder.stop(); }
      }, 250);
    } catch (e) {
      console.error("mikrofon:", e);
      onError("Mikrofon není povolený. Povol ho v prohlížeči a zkus to znovu.");
    }
  }

  function stop(send: boolean) {
    sendOnStopRef.current = send;
    recorderRef.current?.stop();
  }

  if (state === "recording" || state === "sending") {
    return (
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => stop(false)}
          disabled={state === "sending"}
          aria-label="Zahodit nahrávku"
          className="w-10 h-10 shrink-0 flex items-center justify-center text-[#54656F] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3.5 0v8H15v-8h-1.5z" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-white rounded-full px-4 h-11">
          {state === "sending" ? (
            <span className="text-sm text-[#667781] flex items-center gap-2"><Spinner size="sm" /> Odesílám hlasovku…</span>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-[#F15C6D] animate-pulse shrink-0" aria-hidden />
              <span className="text-base tabular-nums text-[#111B21]">{formatTime(elapsed)}</span>
              <span className="text-sm text-[#667781] truncate">Nahrávám…</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => stop(true)}
          disabled={state === "sending"}
          aria-label="Odeslat hlasovku"
          className="w-11 h-11 shrink-0 rounded-full bg-[#00A884] text-white flex items-center justify-center disabled:opacity-60"
        >
          <SendIcon />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label="Nahrát hlasovou odpověď"
      className="w-11 h-11 shrink-0 rounded-full bg-[#00A884] text-white flex items-center justify-center disabled:opacity-40"
    >
      <MicIcon />
    </button>
  );
}
