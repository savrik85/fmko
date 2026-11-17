"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import type { CaptureResult } from "@/lib/page-capture";

/**
 * Zkouška focení celé stránky (fáze 1 nahlášení chyby): snímek s časem
 * a velikostí, aby šel na iPhonu porovnat se stránkou. Nic se neodesílá.
 */
export function BugReportTrialDialog({
  result,
  onClose,
}: {
  result: CaptureResult;
  onClose: () => void;
}) {
  const url = useMemo(() => (result.blob ? URL.createObjectURL(result.blob) : null), [result]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const [zoomed, setZoomed] = useState(false);

  return (
    <Sheet open onClose={onClose} title="Zkouška focení stránky" closeOnBackdrop={false} maxWidth="520px">
      <div data-capture-ignore className="px-5 pb-6 pt-2 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading font-bold text-lg text-ink">Zkouška focení stránky</h2>
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
          Hlášení se zatím neodesílá. Zkontroluj, jestli snímek odpovídá stránce. Ťuknutím ho zvětšíš.
        </p>

        <figure className="mt-4">
          <figcaption className="flex items-baseline justify-between text-sm mb-1.5">
            <span className="font-heading font-bold text-ink">Celá stránka</span>
            <span className="text-gray-600 tabular-nums">
              {result.ms} ms
              {result.blob && <> · {Math.round(result.blob.size / 1024)} kB</>}
            </span>
          </figcaption>
          {url ? (
            <button
              type="button"
              onClick={() => setZoomed(!zoomed)}
              className="block w-full rounded-card overflow-hidden border border-gray-300 bg-white"
              aria-label={zoomed ? "Zmenšit snímek" : "Zvětšit snímek"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ho neumí */}
              <img
                src={url}
                alt="Snímek celé stránky"
                className={zoomed ? "w-full h-auto" : "w-full h-72 object-cover object-top"}
              />
            </button>
          ) : (
            <p className="rounded-card border border-card-red/40 bg-red-50 px-3 py-2 text-sm text-card-red">
              Snímek se nepodařilo udělat: {result.error ?? "neznámá chyba"}
            </p>
          )}
          {result.truncated && (
            <p className="mt-1.5 text-xs text-gray-600">
              Stránka je hodně dlouhá, snímek ukazuje jen okolí místa, kde jsi byl.
            </p>
          )}
        </figure>
      </div>
    </Sheet>
  );
}
