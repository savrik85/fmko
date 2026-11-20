"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/ui";

/**
 * Fotka od trenéra k SMS hráči (API: messaging/coach-photo.ts). Jako ve WhatsAppu:
 * fotoaparát vedle psaní, fotka z galerie nebo rovnou vyfocená, nad psaním náhled
 * a text pod ní je popisek.
 *
 * Prohlížeč fotku zmenší na 1600 px a převede na JPEG. Fotka z mobilu má i 5 MB,
 * takhle odejde kolem půl megabajtu a server nemusí umět HEIC ani otáčení podle EXIF.
 */

/** Delší strana fotky po zmenšení. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

export interface PhotoDraft {
  blob: Blob;
  /** Náhled (object URL). Po odeslání nebo zahození se musí uvolnit. */
  url: string;
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` otočí fotku podle EXIF, jinak by fotka z iPhonu ležela na boku.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      console.warn("createImageBitmap fotku nenačetl, zkouším <img>:", e);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Zmenší fotku na nejvýš MAX_SIDE a převede na JPEG. */
export async function compressPhoto(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!width || !height) throw new Error("Fotka je prázdná.");
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Prohlížeč neumí fotku upravit.");
  // Průhledné PNG by v JPEGu zčernalo.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ("close" in image) image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Fotku se nepodařilo připravit.");
  return blob;
}

/** Tlačítko fotoaparátu. Nabídne galerii i focení (o tom rozhodne mobil). */
export function CoachPhotoButton({ disabled, onPick, onError }: {
  disabled?: boolean;
  onPick: (draft: PhotoDraft) => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onError(null);
    if (!file.type.startsWith("image/")) {
      onError("Tohle není fotka, vyber obrázek.");
      return;
    }
    setPreparing(true);
    try {
      const blob = await compressPhoto(file);
      onPick({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      console.error("příprava fotky:", e);
      onError("Fotku se nepodařilo načíst, zkus jinou.");
    }
    setPreparing(false);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          // Stejnou fotku jde vybrat znovu i po zahození.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || preparing}
        aria-label="Poslat fotku"
        className="w-11 h-11 shrink-0 rounded-full bg-white text-[#54656F] flex items-center justify-center disabled:opacity-40"
      >
        {preparing ? <Spinner size="sm" /> : <CameraIcon />}
      </button>
    </>
  );
}

/** Náhled vybrané fotky nad psaním. Cenu MMS ukazuje řádek s kreditem pod ním. */
export function PhotoDraftBar({ draft, sending, onRemove }: {
  draft: PhotoDraft;
  sending: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl p-2 mb-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- náhled z object URL, next/image ho neumí */}
      <img src={draft.url} alt="Vybraná fotka" className="w-16 h-16 rounded-lg object-cover shrink-0" />
      <div className="flex-1 min-w-0 text-sm text-[#667781]">
        {sending ? (
          <span className="flex items-center gap-2"><Spinner size="sm" /> Odesílám fotku…</span>
        ) : (
          <>
            <span className="block text-[#111B21] font-medium">Fotka</span>
            <span className="block">Text pod ní je popisek, nemusíš psát nic.</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={sending}
        aria-label="Zahodit fotku"
        className="w-10 h-10 shrink-0 flex items-center justify-center text-[#54656F] disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
      <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
    </svg>
  );
}
