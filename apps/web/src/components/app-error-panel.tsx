"use client";

import { useEffect, useState } from "react";
import { captureError } from "@/lib/analytics";
import { claimModuleReload, isModuleLoadError } from "@/lib/module-load-error";

/**
 * Česká chybová karta pro error.tsx a global-error.tsx. Bez nich hráč viděl anglické
 * „Application error: a client-side exception has occurred“ na bílé obrazovce.
 *
 * Chyba z nasazení nové verze (viz module-load-error.ts) stránku jednou načte znovu sama.
 * Kdyby to nepomohlo, druhá chyba v téže záložce už jen ukáže kartu s tlačítkem.
 */
export function AppErrorPanel({ error, boundary, showHomeLink = false }: {
  error: Error & { digest?: string };
  /** Která hranice chybu chytila, pro PostHog. */
  boundary: "game" | "global";
  /** Mimo herní obal chybí menu, tak ať je kudy odejít. */
  showHomeLink?: boolean;
}) {
  const moduleError = isModuleLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("chyba na stránce:", error);
    const autoReload = moduleError && claimModuleReload();
    captureError(error, {
      error_boundary: boundary,
      module_load_error: moduleError,
      auto_reload: autoReload,
      digest: error.digest,
    });
    if (autoReload) {
      setReloading(true);
      window.location.reload();
    }
  }, [error, boundary, moduleError]);

  return (
    <div className="card p-6 text-center max-w-md mx-auto">
      <div className="text-5xl mb-3" aria-hidden>{moduleError ? "🔄" : "⚠️"}</div>
      <h2 className="font-heading font-bold text-lg mb-1">
        {moduleError ? "Prales se mezitím aktualizoval" : "Stránka se nenačetla"}
      </h2>
      <p className="text-sm text-muted mb-5" aria-live="polite">
        {reloading
          ? "Načítám novou verzi…"
          : moduleError
            ? "Stránka ještě běžela ve staré verzi. Načti ji znovu a pojede už nová."
            : "Něco se pokazilo. Zkus stránku načíst znovu."}
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          type="button"
          onClick={() => { setReloading(true); window.location.reload(); }}
          disabled={reloading}
          className="btn btn-primary btn-md"
        >
          Načíst znovu
        </button>
        {/* Obyčejný odkaz, ne Link: rozbitá stránka z minulé verze by se při
            přechodu v aplikaci mohla rozbít znovu. */}
        {showHomeLink && (
          <a href="/prehled" className="btn btn-secondary btn-md">Na Přehled</a>
        )}
      </div>
    </div>
  );
}
