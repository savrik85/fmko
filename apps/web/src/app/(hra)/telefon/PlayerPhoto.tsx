"use client";

import { useEffect, useState } from "react";
import { apiFetchBlob } from "@/lib/api";

/**
 * Fotka, kterou hráč poslal se zprávou (`messages.metadata.type = "photo"`), jako
 * obrázek ve WhatsAppu: přes celou šířku bubliny, klepnutím na celou obrazovku.
 * Stahuje se s přihlášením (`/photos/:messageId`), cizí fotky nejdou otevřít.
 */
interface PlayerPhotoProps {
  teamId: string;
  messageId: string;
  /** Co na fotce je, česky. Pro čtečky obrazovky a když se fotka nenačte. */
  alt: string;
}

export function PlayerPhoto({ teamId, messageId, alt }: PlayerPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    apiFetchBlob(`/api/teams/${teamId}/photos/${messageId}`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        console.error("fotka ze zprávy:", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [teamId, messageId]);

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        aria-label="Zvětšit fotku"
        className="block -mx-1.5 -mt-0.5 mb-1 w-[240px] max-w-[calc(100%+0.75rem)] rounded-md overflow-hidden bg-[#DDE3E6]"
      >
        {url ? (
          <img src={url} alt={alt} className="block w-full h-auto max-h-[320px] object-cover" />
        ) : failed ? (
          <span className="block px-3 py-6 text-sm text-[#667781]">📷 Fotku se nepodařilo načíst ({alt}).</span>
        ) : (
          <span className="block w-full h-[240px] animate-pulse" aria-hidden />
        )}
      </button>
      {open && url && (
        <div
          role="dialog"
          aria-label="Fotka"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={url} alt={alt} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
