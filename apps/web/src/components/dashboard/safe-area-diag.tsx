"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

/**
 * Diagnostika rozměrů pro PWA. Zapíná se `?diag=1`, jinak nerenderuje nic.
 *
 * Layoutové chyby v nainstalované PWA nejdou spolehlivě odečíst ze
 * screenshotu — čísla se musí změřit na tom konkrétním zařízení. V prohlížeči
 * jsou safe-area insety nulové, takže se problém vůbec neprojeví.
 */
function DiagInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [radky, setRadky] = useState<string[]>([]);
  const zapnuto = params.get("diag") === "1";

  useEffect(() => {
    if (!zapnuto) return;
    const zmer = () => {
      const de = document.documentElement;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;" +
        "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);" +
        "padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const insetTop = cs.paddingTop;
      const insetBottom = cs.paddingBottom;
      probe.remove();

      const nav = document.querySelector("nav.on-dark") as HTMLElement | null;
      const navR = nav?.getBoundingClientRect();
      const navCs = nav ? getComputedStyle(nav) : null;
      const vnitrek = nav?.firstElementChild?.getBoundingClientRect();
      const main = document.querySelector("main");
      const shell = document.querySelector(".h-dvh") as HTMLElement | null;

      setRadky([
        `inner ${innerWidth}×${innerHeight}  screen ${screen.width}×${screen.height}  dpr ${devicePixelRatio}`,
        `visualViewport ${Math.round(visualViewport?.height ?? 0)}  dvh-shell ${shell ? Math.round(shell.getBoundingClientRect().height) : "—"}`,
        `inset  top ${insetTop}  bottom ${insetBottom}`,
        `doc scrollH ${de.scrollHeight}  clientH ${de.clientHeight}  PRESCROLL ${de.scrollHeight - de.clientHeight}`,
        nav && navR
          ? `NAV top ${Math.round(navR.top)}  h ${Math.round(navR.height)}  bottom ${Math.round(navR.bottom)}`
          : "NAV nenalezena",
        navCs ? `NAV padBottom ${navCs.paddingBottom}  minH ${navCs.minHeight}  pos ${navCs.position}` : "",
        vnitrek ? `NAV vnitrek h ${Math.round(vnitrek.height)} (ceka se 64)` : "",
        navR ? `MEZERA POD NAV ${Math.round(innerHeight - navR.bottom)} px` : "",
        main ? `main pb ${getComputedStyle(main).paddingBottom}` : "",
        `body pad ${getComputedStyle(document.body).padding}`,
      ].filter(Boolean));
    };
    zmer();
    const t = setInterval(zmer, 1000);
    window.addEventListener("resize", zmer);
    return () => { clearInterval(t); window.removeEventListener("resize", zmer); };
  }, [zapnuto, pathname]);

  if (!zapnuto) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[300] bg-black/85 text-lime-300 p-2 pointer-events-none"
      style={{ font: "600 12px/1.45 ui-monospace,monospace", paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)" }}
    >
      {radky.map((r, i) => <div key={i}>{r}</div>)}
    </div>
  );
}

export function SafeAreaDiag() {
  return <Suspense fallback={null}><DiagInner /></Suspense>;
}
