"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { canvasToBlob } from "@/lib/share-screenshot";

const JPEG_QUALITY = 0.9;

type ShareNavigator = Navigator & { canShare?: (data: ShareData) => boolean };

/**
 * Fotka stránky ke sdílení: náhled a volby Sdílet (systémová nabídka telefonu:
 * WhatsApp, Messenger, Uložit obrázek…), Kopírovat a Stáhnout.
 *
 * Do schránky jde PNG: Safari i Chrome berou do schránky jen PNG, JPEG odmítnou.
 * Sdílení a stažení dostane menší JPEG.
 */
export function ShareScreenshotDialog({
  canvas,
  error,
  fileName,
  shareText,
  onClose,
}: {
  /** `null`, když se fotka nepovedla; pak se ukáže `error`. */
  canvas: HTMLCanvasElement | null;
  error?: string;
  /** Bez přípony, např. „prales-kadr“. */
  fileName: string;
  /** Text ke sdílení, s odkazem na pozvánku klubu. */
  shareText: string;
  onClose: () => void;
}) {
  const [jpeg, setJpeg] = useState<{ blob: Blob; url: string } | null>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Obrázky se připraví hned při otevření: schránka v Safari musí dostat obrázek
  // v rámci ťuknutí, čekání na převod by ťuknutí „spotřebovalo“.
  useEffect(() => {
    if (!canvas) return;
    let url: string | null = null;
    let cancelled = false;
    canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setJpeg({ blob, url });
      })
      .catch((e) => {
        console.error("Fotka ke sdílení (JPEG):", e);
        setStatus("Fotku se nepodařilo připravit.");
      });
    canvasToBlob(canvas, "image/png")
      .then((blob) => { if (!cancelled) setPng(blob); })
      .catch((e) => console.error("Fotka ke sdílení (PNG):", e));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [canvas]);

  const file = jpeg ? new File([jpeg.blob], `${fileName}.jpg`, { type: "image/jpeg" }) : null;
  const nav = typeof navigator !== "undefined" ? (navigator as ShareNavigator) : null;
  const canShare = Boolean(file && nav?.canShare?.({ files: [file] }));
  const canCopy = Boolean(png && nav?.clipboard?.write && typeof ClipboardItem !== "undefined");

  const share = async () => {
    if (!file || !nav) return;
    try {
      await nav.share({ files: [file], text: shareText });
      setStatus(null);
    } catch (e) {
      // Zavřená nabídka sdílení není chyba.
      if (e instanceof Error && e.name === "AbortError") return;
      console.error("Sdílení fotky stránky:", e);
      setStatus("Sdílení se nepovedlo, zkus Stáhnout.");
    }
  };

  const copy = async () => {
    if (!png || !nav) return;
    try {
      await nav.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setStatus("Fotka je ve schránce, stačí ji vložit.");
    } catch (e) {
      console.error("Kopírování fotky stránky:", e);
      setStatus("Kopírování se nepovedlo, zkus Stáhnout.");
    }
  };

  const button = "flex-1 min-w-[96px] h-11 rounded-control font-heading font-bold text-sm transition-colors disabled:opacity-50";

  return (
    <Sheet open onClose={onClose} title="Fotka stránky" maxWidth="520px" centered>
      <div data-capture-ignore className="px-5 pb-6 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading font-bold text-lg text-ink">Fotka stránky</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 -mr-2 -mt-1 rounded-control text-gray-600 hover:bg-gray-100"
            aria-label="Zavřít"
          >
            {"✕"}
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-700">
          Dole je pruh s klubem a adresou hry. Pošli ji kamarádům nebo ji ulož.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {canShare && (
            <button type="button" onClick={share} className={`${button} bg-pitch-500 hover:bg-pitch-600 text-white`}>
              Sdílet
            </button>
          )}
          {canCopy && (
            <button type="button" onClick={copy} className={`${button} border border-gray-300 bg-white hover:bg-gray-50 text-ink`}>
              Kopírovat
            </button>
          )}
          {jpeg && (
            <a
              href={jpeg.url}
              download={`${fileName}.jpg`}
              className={`${button} inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-ink`}
            >
              Stáhnout
            </a>
          )}
        </div>
        {status && <p className="mt-2 text-sm text-gray-700" role="status">{status}</p>}
        <div className="mt-4 max-h-[45vh] overflow-y-auto overscroll-contain rounded-card border border-gray-300 bg-white">
          {!canvas ? (
            <p className="px-3 py-6 text-center text-sm text-card-red">
              Fotku se nepodařilo udělat: {error ?? "neznámá chyba"}
            </p>
          ) : jpeg ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ho neumí
            <img src={jpeg.url} alt="Fotka stránky" className="w-full h-auto" />
          ) : (
            <p className="px-3 py-6 text-center text-sm text-gray-600">Připravuju fotku…</p>
          )}
        </div>

      </div>
    </Sheet>
  );
}
