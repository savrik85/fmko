"use client";

import { useState } from "react";

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
        // User canceled or not supported — fallback to clipboard
        console.warn("share canceled:", e);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("clipboard copy failed:", e);
      alert("Zkopíruj URL ručně: " + url);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-heading font-bold ${textClass} ${bgClass} backdrop-blur transition-all hover:scale-[1.02] shadow-sm active:scale-95`}
      title="Sdílet klubový web na sociálních sítích nebo zkopírovat odkaz"
    >
      <span>🔗</span>
      <span>{copied ? "Zkopírováno!" : "Sdílet web"}</span>
    </button>
  );
}
