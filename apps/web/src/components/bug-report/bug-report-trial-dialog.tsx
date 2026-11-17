"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import type { CaptureResult } from "@/lib/page-capture";

const ENGINE_LABELS = ["A", "B"] as const;

/**
 * Zkouška focení stránky (fáze 1 nahlášení chyby): dva snímky stejné stránky
 * ze dvou knihoven pod sebou, s časem a velikostí. Autor na iPhonu vybere,
 * který víc odpovídá stránce. Nic se neodesílá.
 */
export function BugReportTrialDialog({
  results,
  onClose,
}: {
  results: CaptureResult[];
  onClose: () => void;
}) {
  const urls = useMemo(
    () => results.map((r) => (r.blob ? URL.createObjectURL(r.blob) : null)),
    [results],
  );
  useEffect(() => () => urls.forEach((url) => { if (url) URL.revokeObjectURL(url); }), [urls]);

  const [zoomed, setZoomed] = useState<number | null>(null);

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
          Hlášení se zatím neodesílá. Porovnej, který snímek víc odpovídá stránce. Ťuknutím snímek zvětšíš.
        </p>

        <div className="mt-4 space-y-5">
          {results.map((result, i) => {
            const url = urls[i];
            const isZoomed = zoomed === i;
            return (
              <figure key={result.engine}>
                <figcaption className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="font-heading font-bold text-ink">Snímek {ENGINE_LABELS[i] ?? i + 1}</span>
                  <span className="text-gray-600 tabular-nums">
                    {result.ms} ms
                    {result.blob && <> · {Math.round(result.blob.size / 1024)} kB</>}
                  </span>
                </figcaption>
                {url ? (
                  <button
                    type="button"
                    onClick={() => setZoomed(isZoomed ? null : i)}
                    className="block w-full rounded-card overflow-hidden border border-gray-300 bg-white"
                    aria-label={isZoomed ? "Zmenšit snímek" : "Zvětšit snímek"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ho neumí */}
                    <img
                      src={url}
                      alt={`Snímek ${ENGINE_LABELS[i] ?? i + 1}`}
                      className={isZoomed ? "w-full h-auto" : "w-full h-56 object-cover object-top"}
                    />
                  </button>
                ) : (
                  <p className="rounded-card border border-card-red/40 bg-red-50 px-3 py-2 text-sm text-card-red">
                    Snímek se nepodařilo udělat: {result.error ?? "neznámá chyba"}
                  </p>
                )}
              </figure>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
