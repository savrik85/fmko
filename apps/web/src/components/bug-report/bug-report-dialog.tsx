"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
import { collectDiagnostics } from "@/lib/client-diagnostics";
import type { CaptureResult } from "@/lib/page-capture";

/**
 * Nahlášení chyby: fotka stránky (nebo vlastní screen z galerie), nepovinný komentář
 * a technické podrobnosti, které hráč nevidí. Odejde do administrace (Hlášení),
 * odpověď autora přijde hráči jako SMS do Telefonu.
 */
export function BugReportDialog({
  capture,
  teamId,
  extraContext,
  onClose,
}: {
  /** Fotka stránky; `null` nebo bez obrázku, když se focení nepovedlo. */
  capture: CaptureResult | null;
  teamId: string | null;
  /** Navíc do podrobností, např. chyba z chybové stránky. */
  extraContext?: Record<string, unknown>;
  onClose: () => void;
}) {
  const [ownImage, setOwnImage] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const image: Blob | null = ownImage ?? capture?.blob ?? null;
  const url = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const send = async () => {
    if (!image && !comment.trim()) {
      setError("Přidej screen nebo napiš, co se stalo.");
      return;
    }
    setState("sending");
    setError(null);
    const form = new FormData();
    if (image) form.append("image", image, ownImage?.name ?? "stranka.jpg");
    form.append("comment", comment.trim());
    form.append("pageUrl", `${window.location.pathname}${window.location.search}`);
    if (teamId) form.append("teamId", teamId);
    form.append("context", JSON.stringify(collectDiagnostics({
      ...extraContext,
      ...(capture ? { capture: { ms: capture.ms, truncated: capture.truncated, error: capture.error ?? null } } : {}),
      ownImage: ownImage != null,
    })));
    try {
      await apiFetch<{ id: string }>("/api/bug-reports", { method: "POST", body: form });
      setState("sent");
    } catch (e) {
      console.error("Odeslání hlášení chyby:", e);
      setError(e instanceof Error && e.message !== "API error" ? e.message : "Hlášení se nepodařilo odeslat, zkus to znovu.");
      setState("idle");
    }
  };

  return (
    <Sheet open onClose={onClose} title="Nahlásit chybu" closeOnBackdrop={false} maxWidth="520px">
      <div data-capture-ignore className="px-5 pb-6 pt-2 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading font-bold text-lg text-ink">Nahlásit chybu</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 -mr-2 -mt-1 rounded-control text-gray-600 hover:bg-gray-100"
            aria-label="Zavřít"
          >
            {"✕"}
          </button>
        </div>

        {state === "sent" ? (
          <>
            <p className="mt-3 text-sm text-gray-700">
              Díky, hlášení dorazilo. Odpověď ti přijde jako SMS do Telefonu.
            </p>
            <button type="button" onClick={onClose} className="btn btn-primary btn-md w-full mt-5">Zavřít</button>
          </>
        ) : (
          <>
            <div className="mt-3 max-h-[35vh] overflow-y-auto overscroll-contain rounded-card border border-gray-300 bg-white">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ho neumí
                <img src={url} alt="Screen k hlášení" className="w-full h-auto" />
              ) : (
                <p className="px-3 py-6 text-center text-sm text-gray-600">
                  {capture?.error ? "Stránku se nepodařilo vyfotit. " : ""}Přilož screen z galerie, nebo jen popiš, co se stalo.
                </p>
              )}
            </div>
            {capture?.truncated && !ownImage && (
              <p className="mt-1.5 text-xs text-gray-600">Stránka je hodně dlouhá, fotka ukazuje jen okolí místa, kde jsi byl.</p>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-2 text-sm font-semibold text-pitch-600 hover:underline"
            >
              {ownImage ? "Vybrat jiný screen" : "Přiložit vlastní screen"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setOwnImage(e.target.files?.[0] ?? null)}
            />

            <label htmlFor="bug-report-comment" className="block mt-4 text-sm font-semibold text-ink">
              Co se stalo? <span className="font-normal text-gray-600">(nepovinné)</span>
            </label>
            <textarea
              id="bug-report-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Třeba: kliknul jsem na Uložit a nic se nestalo."
              className="mt-1 w-full rounded-control border border-gray-300 bg-white px-3 py-2 text-sm text-ink"
            />

            {error && <p className="mt-2 text-sm text-card-red" role="alert">{error}</p>}
            <button
              type="button"
              onClick={send}
              disabled={state === "sending"}
              className="btn btn-primary btn-md w-full mt-4"
            >
              {state === "sending" ? "Odesílám…" : "Odeslat"}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
