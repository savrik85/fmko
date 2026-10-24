"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * Fotka, kterou hráč poslal se zprávou (`messages.metadata.type = "photo"`), jako
 * obrázek ve WhatsAppu: přes celou šířku bubliny, klepnutím na celou obrazovku.
 *
 * Obyčejný odkaz na náhodné id fotky (`/api/player-photos/:id`). Dřív se fotka stahovala
 * s přihlášením do paměti prohlížeče (blob), a takový obrázek nahrávka v PostHogu
 * nepřehraje, ukázala místo fotky rozbitou ikonku (2026-10-24).
 */
interface PlayerPhotoProps {
  /** Klíč fotky z metadat zprávy, `photos/<id>.jpg`. */
  photoKey: string;
  /** Co na fotce je, česky. Pro čtečky obrazovky a když se fotka nenačte. */
  alt: string;
}

/** Id fotky z klíče `photos/<id>.jpg`, nebo null, když klíč nesedí. */
function photoIdFromKey(photoKey: string): string | null {
  const match = /^photos\/([0-9a-f-]{36})\.jpg$/.exec(photoKey);
  return match ? match[1] : null;
}

export function PlayerPhoto({ photoKey, alt }: PlayerPhotoProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const id = photoIdFromKey(photoKey);
  const src = id ? `${API_BASE}/api/player-photos/${id}` : null;

  return (
    <>
      <button
        type="button"
        onClick={() => src && !failed && setOpen(true)}
        aria-label="Zvětšit fotku"
        className="block -mx-1.5 -mt-0.5 mb-1 w-[240px] max-w-[calc(100%+0.75rem)] rounded-md overflow-hidden bg-[#DDE3E6]"
      >
        {src && !failed ? (
          // Než se fotka načte, drží místo šedá plocha tlačítka.
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => {
              console.error("fotka ze zprávy se nenačetla:", src);
              setFailed(true);
            }}
            className={`block w-full h-auto max-h-[320px] object-cover ${loaded ? "" : "min-h-[240px]"}`}
          />
        ) : (
          <span className="block px-3 py-6 text-sm text-[#667781]">📷 Fotku se nepodařilo načíst ({alt}).</span>
        )}
      </button>
      {open && src && (
        <div
          role="dialog"
          aria-label="Fotka"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
