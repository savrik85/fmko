"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMenuBadges } from "@/hooks/use-menu-badges";

/**
 * O kolik je layoutový viewport kratší než displej.
 *
 * Naměřeno na zařízení: `innerHeight` 797, `screen.height` 844. Rozdíl 47 px.
 * `position: fixed; bottom: 0` se ukotví na 797, ale plocha, kterou dokument
 * vybarvuje, sahá až do 844 — pod lištou proto zůstával béžový pruh v barvě
 * `--color-paper`. Že je béžový, a ne bílý, je důkaz, že ho kreslí náš
 * dokument; iOS by tuhle barvu nevymyslel.
 *
 * Lišta se proto posune o ten rozdíl níž (`bottom: -47px`) a stejnou hodnotu
 * dostane jako spodní odsazení, takže popisky zůstanou, kde byly, a zelená
 * se protáhne až ke spodní hraně displeje.
 *
 * Když viewport sedí (innerHeight == screen.height), vrací 0 a nic se nemění.
 */
function useSchodekViewportu(): number {
  const [schodek, setSchodek] = useState(0);
  useEffect(() => {
    const zmer = () => {
      // Jen na výšku — na šířku se rozměry takhle porovnávat nedají.
      const naVysku = window.innerHeight > window.innerWidth;
      if (!naVysku || !window.screen?.height) { setSchodek(0); return; }
      // V nainstalované aplikaci sahá obal hry přes `100lvh` až ke spodní hraně
      // displeje (globals.css, .app-shell) a lišta leží u jeho spodku. Schodek
      // se tam neřeší a lišta si nechává místo na systémovou čárku.
      const fullHeightShell =
        window.matchMedia("(display-mode: standalone) and (max-width: 639px)").matches &&
        typeof CSS !== "undefined" && CSS.supports("height", "100lvh");
      if (fullHeightShell) { setSchodek(0); return; }
      const rozdil = Math.round(window.screen.height - window.innerHeight);
      // Nad 200 px už to nebude safe-area, ale něco jiného (klávesnice apod.).
      setSchodek(rozdil > 4 && rozdil < 200 ? rozdil : 0);
    };
    zmer();
    window.addEventListener("resize", zmer);
    window.addEventListener("orientationchange", zmer);
    return () => {
      window.removeEventListener("resize", zmer);
      window.removeEventListener("orientationchange", zmer);
    };
  }, []);
  return schodek;
}

/**
 * Klepnutí na záložku, na které už hráč je, posune obsah nahoru (jako v nativních
 * aplikacích). Scrolluje <main> z herního layoutu, okno se neposouvá.
 */
function scrollMainToTop() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("main")?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export function BottomNav() {
  const pathname = usePathname();
  const schodek = useSchodekViewportu();
  const badges = useMenuBadges();
  const navRef = useRef<HTMLElement | null>(null);

  // Skutečná výška lišty pro stránky, které mají sahat až k ní (Telefon). Mění se se
  // safe-area a schodkem, pevné odsazení `pb-20` v layoutu nechávalo nad lištou mezeru.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--bottom-nav-h", `${nav.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => { observer.disconnect(); root.style.removeProperty("--bottom-nav-h"); };
  }, []);

  const items: { href: string; label: string; icon: React.ReactNode; badge?: number }[] = [
    { href: "/prehled", label: "Domů", icon: <><path d="M3 11l9-7 9 7v9H3z" /><path d="M9 20v-6h6v6" /></> },
    { href: "/telefon", label: "Telefon", icon: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>, badge: badges.unreadMessages },
    { href: "/zapas", label: "Sestava", icon: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4M9 10h6M9 14h6" /></> },
    { href: "/liga", label: "Liga", icon: <path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4c0 3 1.5 4.5 3.5 5M17 6h3c0 3-1.5 4.5-3.5 5M12 14v4M8.5 20.5h7" /> },
    // Všechny podnotifikace (grémium, sázky, přestupy, novinky, sněm) se sčítají do Více
    { href: "/vice", label: "Více", icon: <path d="M4 7h16M4 12h16M4 17h16" />, badge: badges.moreBadgeCount },
  ];


  return (
    <nav
      ref={navRef}
      className="app-bottom-nav fixed bottom-0 left-0 right-0 z-[var(--z-nav)] sm:hidden rounded-t-[18px] border-t border-gray-300 shadow-[0_-10px_26px_-6px_rgba(26,23,20,0.42)]"
      style={{
        // Světlá lišta: spodek splyne s obsahem a místo pod ikonami nepůsobí
        // jako zelený blok. Kde hráč je, ukazuje zelená vyplněná ikona na pilulce.
        background: "var(--color-surface)",
        // Lišta zůstává ukotvená na spodku viewportu. Posouvat ji níž
        // (`bottom: -47px`) nejde — `fixed` prvky se na iOS ořežou na
        // layoutový viewport, takže se tím jen odřízly popisky. Zelenou pod
        // hranicí kreslí `body`, které má barvu rámu.
        bottom: 0,
        // Když je pod viewportem schodek, leží home indikátor v něm a odsazení
        // uvnitř lišty by ho rezervovalo podruhé — obsah by plaval vysoko.
        paddingBottom: schodek ? "0px" : "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Vizuální lišta je obsah + schodek pod viewportem (u tebe 47 px).
          Při 56 px obsahu vycházela na 103 px a ikony seděly v horní třetině.
          48 px dá 95 px celkem, což je blízko nativní liště. */}
      <div className="flex justify-around items-center h-[58px] px-2">
        {items.map((item) => {
          // Větev pro položku „Kádr" tu byla i poté, co ji z lišty vyhodili —
          // nikdy se nevyhodnotila. Kádr je dnes pod Více.
          const isActive = pathname === item.href ||
            (item.href !== "/prehled" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => {
                // Podstránka (třeba konverzace v Telefonu) normálně přejde na začátek záložky.
                if (pathname !== item.href) return;
                scrollMainToTop();
                // Stejná adresa: navigace by nic nezměnila. S parametry (?tab=…) se dál
                // přejde na výchozí pohled záložky jako dřív.
                if (!window.location.search && !window.location.hash) e.preventDefault();
              }}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 rounded-soft transition-colors min-w-[56px] ${
                isActive
                  ? "text-pitch-500 font-semibold"
                  : "text-gray-600 hover:text-ink"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Aktivní záložka: ikona vyplněná zeleným nádechem na světle zelené pilulce. */}
              <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${isActive ? "bg-pitch-100" : ""}`}>
                <svg
                  width="22" height="22" viewBox="0 0 24 24"
                  fill={isActive ? "currentColor" : "none"} fillOpacity={0.22}
                  stroke="currentColor" strokeWidth={isActive ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  {item.icon}
                </svg>
              </span>
              <span className="text-micro leading-none">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="absolute top-0 right-2 bg-card-red text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
