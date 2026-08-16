"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Diagnostika rozměrů pro PWA. DOČASNÉ — po vyřešení spodní lišty smazat
 * (komponentu, dlaždici v /dashboard/more a řádek v layoutu).
 *
 * Layoutové chyby v nainstalované PWA nejdou spolehlivě odečíst ze
 * screenshotu — čísla se musí změřit na tom konkrétním zařízení. V prohlížeči
 * jsou safe-area insety nulové, takže se problém vůbec neprojeví.
 *
 * Zapíná se `?diag=1`, vypíná `?diag=0`. Stav si drží v localStorage, aby
 * přežil přechod na jinou stránku — v PWA není adresní řádek, kam by se
 * parametr dal napsat znovu.
 */
const KLIC = "prales_diag";

function DiagInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [zapnuto, setZapnuto] = useState(false);
  const [radky, setRadky] = useState<string[]>([]);
  const [zkopirovano, setZkopirovano] = useState(false);

  useEffect(() => {
    const p = params.get("diag");
    if (p === "1") localStorage.setItem(KLIC, "1");
    if (p === "0") localStorage.removeItem(KLIC);
    setZapnuto(localStorage.getItem(KLIC) === "1");
  }, [params]);

  useEffect(() => {
    if (!zapnuto) return;
    const zmer = () => {
      const de = document.documentElement;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;" +
        "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const insetTop = cs.paddingTop;
      const insetBottom = cs.paddingBottom;
      probe.remove();

      const nav = document.querySelector("nav.on-dark") as HTMLElement | null;
      const navR = nav?.getBoundingClientRect();
      const navCs = nav ? getComputedStyle(nav) : null;
      const vnitrek = nav?.firstElementChild?.getBoundingClientRect();
      const shell = document.querySelector(".h-dvh") as HTMLElement | null;
      const main = document.querySelector("main");

      setRadky([
        `inner ${innerWidth}x${innerHeight} screen ${screen.width}x${screen.height} dpr ${devicePixelRatio}`,
        `visualVP ${Math.round(visualViewport?.height ?? 0)} shell ${shell ? Math.round(shell.getBoundingClientRect().height) : "-"}`,
        `inset top ${insetTop} bottom ${insetBottom}`,
        `doc scrollH ${de.scrollHeight} clientH ${de.clientHeight} PRESCROLL ${de.scrollHeight - de.clientHeight}`,
        navR ? `NAV top ${Math.round(navR.top)} h ${Math.round(navR.height)} bottom ${Math.round(navR.bottom)}` : "NAV nenalezena",
        navCs ? `NAV padBottom ${navCs.paddingBottom} pos ${navCs.position}` : "",
        vnitrek ? `NAV vnitrek h ${Math.round(vnitrek.height)} (ceka se 64)` : "",
        navR ? `>> MEZERA POD NAV ${Math.round(innerHeight - navR.bottom)} px <<` : "",
        main ? `main pb ${getComputedStyle(main).paddingBottom}` : "",
        `body pad ${getComputedStyle(document.body).padding} | ${pathname}`,
      ].filter(Boolean));
    };
    zmer();
    const t = setInterval(zmer, 1000);
    window.addEventListener("resize", zmer);
    return () => { clearInterval(t); window.removeEventListener("resize", zmer); };
  }, [zapnuto, pathname]);

  const kopiruj = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(radky.join("\n"));
      setZkopirovano(true);
      setTimeout(() => setZkopirovano(false), 2000);
    } catch (e) {
      console.error("kopirovani diagnostiky:", e);
    }
  }, [radky]);

  if (!zapnuto) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[300] bg-black/90 text-lime-300 px-2 pb-2"
      style={{ font: "600 12px/1.45 ui-monospace,monospace", paddingTop: "calc(env(safe-area-inset-top,0px) + 6px)" }}
    >
      {radky.map((r, i) => <div key={i}>{r}</div>)}
      <div className="flex gap-2 mt-2">
        <button
          onClick={kopiruj}
          className="flex-1 bg-lime-300 text-black rounded px-3 py-2 font-bold"
        >
          {zkopirovano ? "Zkopírováno ✓" : "Zkopírovat"}
        </button>
        <button
          onClick={() => { localStorage.removeItem(KLIC); setZapnuto(false); }}
          className="bg-white/20 text-white rounded px-3 py-2 font-bold"
        >
          Vypnout
        </button>
      </div>
    </div>
  );
}

export function SafeAreaDiag() {
  return <Suspense fallback={null}><DiagInner /></Suspense>;
}
