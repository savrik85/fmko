"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMenuBadges } from "@/hooks/use-menu-badges";

interface ViewportShortfall {
  /** O kolik je okno kratší než displej (0 = sedí). */
  gap: number;
  /** Jednotka `lvh` dosáhne až na spodní hranu displeje, takže se pod okno dá kreslit. */
  reachesScreenBottom: boolean;
}

/**
 * O kolik je okno nainstalované aplikace kratší než displej.
 *
 * iOS 26 s průhledným stavovým řádkem spočítá okno o výšku horního výřezu kratší
 * (naměřeno 812 proti 874, dřív 797 proti 844), ale nechá ho začínat úplně nahoře.
 * `position: fixed; bottom: 0` se proto ukotví nad spodní hranou displeje a pod
 * lištou zbyde prázdný pruh.
 *
 * Zkouška na zařízení (2026-11-17): prvek posunutý pod okno záporným `bottom`,
 * přes `transform` ani s výškou v pixelech se v tom pruhu nevykreslí. Vykreslí se
 * jen `fixed` prvek od horní hrany s výškou v `vh`/`lvh`, které mají plných 874.
 */
function useViewportShortfall(): ViewportShortfall {
  const [shortfall, setShortfall] = useState<ViewportShortfall>({ gap: 0, reachesScreenBottom: false });
  useEffect(() => {
    const measure = () => {
      // Jen na výšku — na šířku se rozměry takhle porovnávat nedají.
      const portrait = window.innerHeight > window.innerWidth;
      if (!portrait || !window.screen?.height) { setShortfall({ gap: 0, reachesScreenBottom: false }); return; }
      const diff = Math.round(window.screen.height - window.innerHeight);
      // Nad 200 px už to nebude výřez, ale něco jiného (klávesnice apod.).
      const gap = diff > 4 && diff < 200 ? diff : 0;
      let reachesScreenBottom = false;
      if (gap > 0) {
        const probe = document.createElement("div");
        probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:0;height:100lvh";
        document.body.appendChild(probe);
        reachesScreenBottom = Math.abs(probe.getBoundingClientRect().height - window.screen.height) <= 2;
        probe.remove();
      }
      setShortfall((prev) =>
        prev.gap === gap && prev.reachesScreenBottom === reachesScreenBottom ? prev : { gap, reachesScreenBottom });
    };
    measure();
    // Hned po startu aplikace vrací iOS `lvh` ještě ve výšce okna (812) a na
    // plných 874 ho opraví až po chvíli, bez události `resize`. Jediné měření
    // při načtení proto vyšlo záporně a lišta zůstala nahoře. Měří se znovu
    // několik vteřin po startu a při každém návratu do aplikace.
    const retries = [250, 500, 1000, 2000, 4000, 8000].map((delay) => window.setTimeout(measure, delay));
    const onVisible = () => { if (document.visibilityState === "visible") measure(); };
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("pageshow", measure);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      retries.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("pageshow", measure);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return shortfall;
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
  const { gap, reachesScreenBottom } = useViewportShortfall();
  // Lišta protažená až ke spodní hraně displeje (viz useViewportShortfall).
  const extended = gap > 0 && reachesScreenBottom;
  const badges = useMenuBadges();
  const barRef = useRef<HTMLDivElement | null>(null);

  // Kolik lišta zabírá ze spodku okna, pro stránky, které mají sahat až k ní (Telefon).
  // U protažené lišty je to míň než její výška: zbytek leží pod hranou okna.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const publish = () => {
      const rect = bar.getBoundingClientRect();
      const covered = rect.height > 0 ? Math.max(0, Math.round(window.innerHeight - rect.top)) : 0;
      root.style.setProperty("--bottom-nav-h", `${covered}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--bottom-nav-h");
    };
  }, [extended]);

  const items = [
    { href: "/prehled", label: "Domů", icon: "🏟" },
    { href: "/telefon", label: "Telefon", icon: "📱", badge: badges.unreadMessages },
    { href: "/zapas", label: "Sestava", icon: "📋" },
    { href: "/liga", label: "Liga", icon: "🏆" },
    // Všechny podnotifikace (grémium, sázky, přestupy, novinky, sněm) se sčítají do Více
    { href: "/vice", label: "Více", icon: "⚙", badge: badges.moreBadgeCount },
  ];

  return (
    <nav
      className={`on-dark fixed left-0 right-0 z-[var(--z-nav)] sm:hidden ${extended ? "pointer-events-none" : ""}`}
      style={
        extended
          // Obal přes celou výšku displeje: jen takhle se dá kreslit pod hranu okna.
          // Sám je průhledný a nechytá dotyky, lišta sedí u jeho spodku.
          ? { top: 0, height: "100lvh" }
          : { bottom: 0 }
      }
    >
      <div
        ref={barRef}
        className={extended ? "absolute inset-x-0 bottom-0 pointer-events-auto" : ""}
        style={{
          background: "var(--color-chrome)",
          // Místo pro systémovou čárku. Když je okno kratší a lišta protáhnout
          // nejde, leží čárka až pod oknem a odsazení by ji rezervovalo podruhé.
          paddingBottom: gap > 0 && !extended ? "0px" : "env(safe-area-inset-bottom, 0px)",
        }}
      >
      <div className="flex justify-around items-center h-12 px-2">
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
                  ? "text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-micro font-medium leading-none">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="absolute top-0 right-2 bg-card-red text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      </div>
    </nav>
  );
}
