"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";

/**
 * Hlasová odpověď trenéra: nahrát, nechat přepsat (Whisper na serveru), zkontrolovat
 * přepis a odeslat. Odeslání obstará stránka konverzace přes `onSend`, stejně jako SMS.
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
  /** Během nahrávání a kontroly přepisu zabírá recorder celý řádek místo pole pro SMS. */
  onActiveChange: (active: boolean) => void;
  /** Chyba se ukáže tam, kde chyby SMS (nad polem pro zprávu). */
  onError: (message: string | null) => void;
}

type RecState = "idle" | "recording" | "uploading" | "preview" | "sending";

const MAX_SEC = 60;
const PEAK_BARS = 40;

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

export function CoachVoiceRecorder({ teamId, convId, disabled, onSend, onActiveChange, onError }: CoachVoiceRecorderProps) {
  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<CoachVoiceNote | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => { onActiveChange(state !== "idle"); }, [state, onActiveChange]);

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickMimeType();
  if (!supported) return null;

  async function upload(blob: Blob, durationSec: number) {
    setState("uploading");
    try {
      const [res, peaks] = await Promise.all([
        apiFetch<{ audioKey: string; transcript: string; durationSec: number }>(
          `/api/teams/${teamId}/conversations/${convId}/voice-note?durationSec=${durationSec}`,
          { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob },
        ),
        peaksFromBlob(blob),
      ]);
      setNote({ ...res, peaks });
      setState("preview");
    } catch (e) {
      console.error("nahrání hlasové odpovědi:", e);
      onError(e instanceof Error && e.message ? e.message : "Nahrávku se nepodařilo zpracovat.");
      setState("idle");
    }
  }

  async function start() {
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        if (cancelledRef.current) { setState("idle"); return; }
        const durationSec = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        void upload(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType }), durationSec);
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setState("recording");
      timerRef.current = setInterval(() => {
        const sec = Math.round((Date.now() - startedRef.current) / 1000);
        setElapsed(sec);
        if (sec >= MAX_SEC) recorder.stop();
      }, 250);
    } catch (e) {
      console.error("mikrofon:", e);
      onError("Mikrofon není povolený. Povol ho v prohlížeči a zkus to znovu.");
    }
  }

  function stop(cancel: boolean) {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
  }

  async function send() {
    if (!note) return;
    setState("sending");
    try {
      await onSend(note);
      setNote(null);
      setState("idle");
    } catch (e) {
      console.error("odeslání hlasové odpovědi:", e);
      onError(e instanceof Error && e.message ? e.message : "Hlasovku se nepodařilo odeslat.");
      setState("preview");
    }
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 w-full">
        <span className="w-2.5 h-2.5 rounded-full bg-card-red animate-pulse shrink-0" aria-hidden />
        <span className="text-sm tabular-nums flex-1">Nahrávám {formatTime(elapsed)}</span>
        <button type="button" onClick={() => stop(true)} className="text-sm text-muted px-2 py-1">Zrušit</button>
        <button type="button" onClick={() => stop(false)} className="text-sm font-heading font-bold text-white bg-pitch-500 rounded-full px-3 py-1.5">
          Hotovo
        </button>
      </div>
    );
  }

  if (state === "uploading") {
    return (
      <div className="flex items-center gap-2 w-full text-sm text-muted">
        <Spinner size="sm" /> Přepisuju nahrávku…
      </div>
    );
  }

  if ((state === "preview" || state === "sending") && note) {
    return (
      <div className="w-full">
        <p className="text-sm text-muted mb-1">🎤 {formatTime(note.durationSec)} · takhle ti to rozumí:</p>
        <p className="text-sm bg-gray-100 rounded-xl px-3 py-2 mb-1.5 whitespace-pre-wrap">{note.transcript}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setNote(null); setState("idle"); }} disabled={state === "sending"} className="text-sm text-muted px-2 py-1">
            Zahodit
          </button>
          <button type="button" onClick={send} disabled={state === "sending"} className="text-sm font-heading font-bold text-white bg-pitch-500 rounded-full px-3 py-1.5 disabled:opacity-50">
            {state === "sending" ? "Odesílám…" : "Odeslat hlasovku"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label="Nahrát hlasovou odpověď"
      className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-40 text-base self-end mb-1"
    >
      🎤
    </button>
  );
}
