"use client";

import { useEffect, useState } from "react";

/**
 * DOČASNÉ: výpis skutečných rozměrů přímo na obrazovce, jen na testu a jen na mobilu.
 *
 * Okraje v nainstalované PWA na iOS nejdou nasimulovat v prohlížeči, takže se
 * příčina čte z čísel na zařízení, ne ze screenshotů. Po opravě okrajů smazat.
 */
function measureInset(side: "top" | "bottom"): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:env(safe-area-inset-${side}, 0px)`;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(height);
}

function measureUnit(unit: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;top:0;height:100${unit}`;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(height);
}

function rectSummary(selector: string): string {
  const el = document.querySelector(selector);
  if (!el) return "není";
  const r = el.getBoundingClientRect();
  return `${Math.round(r.top)}–${Math.round(r.bottom)} (v ${Math.round(r.height)})`;
}

function collectLines(): string[] {
  const vv = window.visualViewport;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const os = navigator.userAgent.match(/(?:iPhone OS|Android) [\d_.]+/)?.[0] ?? "?";
  const version = navigator.userAgent.match(/Version\/[\d.]+/)?.[0] ?? "";
  const main = document.querySelector("main");
  return [
    `okno ${window.innerWidth}×${window.innerHeight}  displej ${window.screen.width}×${window.screen.height}`,
    `vv ${vv ? `${Math.round(vv.height)} top ${Math.round(vv.offsetTop)}` : "není"}  html ${document.documentElement.clientHeight}  dpr ${window.devicePixelRatio}`,
    `vh ${measureUnit("vh")}  lvh ${measureUnit("lvh")}  svh ${measureUnit("svh")}  dvh ${measureUnit("dvh")}`,
    `inset nahoře ${measureInset("top")}  dole ${measureInset("bottom")}`,
    `horní lišta ${rectSummary("header")}`,
    `obsah ${rectSummary("main")}  posun ${main ? Math.round(main.scrollTop) : "?"}`,
    `spodní lišta ${rectSummary("nav.fixed > div")}  obal ${rectSummary("nav.fixed")}`,
    `--bottom-nav-h ${getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h") || "není"}`,
    `PWA ${standalone ? "ano" : "ne"}  ${os} ${version}`,
  ];
}

export function ViewportDiagnostics() {
  const [lines, setLines] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!window.location.hostname.startsWith("test.")) return;
    if (window.innerWidth >= 640) return;
    const refresh = () => setLines(collectLines());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("resize", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  if (!lines || hidden) return null;

  return (
    <button
      type="button"
      onClick={() => setHidden(true)}
      className="fixed left-2 right-2 top-1/2 -translate-y-1/2 z-[var(--z-error)] rounded-soft bg-black/85 text-white text-left font-mono text-[11px] leading-snug p-2"
    >
      {lines.map((line) => (
        <span key={line} className="block">{line}</span>
      ))}
      <span className="block text-white/60 mt-1">{"Diagnostika okrajů. Klepnutím schováš."}</span>
    </button>
  );
}
