"use client";

import { useEffect, useRef, useState } from "react";
import { showError } from "@/lib/api";

export function ShareButton({
  url,
  title,
  textClass,
  bgClass,
}: {
  url: string;
  title: string;
  textClass: string;
  bgClass: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          url,
          title: `${title} · Oficiální klubový web`,
          text: `Mrkni na oficiální klubový web týmu ${title} na Pralesu! Sestavy, výsledky, stadion a vstupenky.`,
        });
        return;
      } catch (e) {
        // Zavřené sdílecí okno není chyba a nemá se tvářit jako „Zkopírováno"
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.warn("sdílení selhalo, zkouším schránku:", e);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("kopírování odkazu selhalo:", e);
      showError("Odkaz se nepodařilo zkopírovat", `Zkopíruj si ho ručně: ${url}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-heading font-bold ${textClass} ${bgClass} backdrop-blur transition-all hover:scale-[1.02] shadow-sm active:scale-95`}
      title="Sdílet klubový web na sociálních sítích nebo zkopírovat odkaz"
    >
      <span aria-hidden="true">🔗</span>
      <span>{copied ? "Zkopírováno!" : "Sdílet"}</span>
    </button>
  );
}
