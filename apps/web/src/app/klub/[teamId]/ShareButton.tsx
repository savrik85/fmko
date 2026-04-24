"use client";

import { useState } from "react";

export function ShareButton({ url, title, textClass, bgClass }: {
  url: string;
  title: string;
  textClass: string;
  bgClass: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title });
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
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-heading font-bold ${textClass} ${bgClass} backdrop-blur transition-all hover:scale-[1.02]`}
    >
      <span>{"\u{1F517}"}</span>
      {copied ? "Zkopírováno!" : "Sdílet"}
    </button>
  );
}
