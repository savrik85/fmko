"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { hasUnseenNotes } from "@/data/release-notes";

/**
 * Sahá viewport až na spodek displeje?
 *
 * Na starších instalacích PWA na ploše iOS neuplatní `viewport-fit=cover`,
 * i když je v HTML — konfiguraci si zapamatuje při přidání ikony. Webview pak
 * dostane výšku `obrazovka − horní inset` (naměřeno 797 proti 844) a pod ním
 * zůstane mrtvý pruh, který kreslí `background_color` z manifestu.
 *
 * V takovém stavu už home indikátor leží v tom mrtvém pruhu, ne nad obsahem.
 * Rezervovat na něj ještě `env(safe-area-inset-bottom)` uvnitř lišty znamená
 * počítat ho dvakrát — popisky pak plavaly 81 px nad spodkem displeje.
 *
 * Když je instalace v pořádku (innerHeight == screen.height), vrací true
 * a chování zůstává beze změny.
 */
function usePokryvaSpodek(): boolean {
  const [pokryva, setPokryva] = useState(true);
  useEffect(() => {
    const zmer = () => {
      // Jen na výšku — na šířku se rozměry porovnávat nedají.
      const naVysku = window.innerHeight > window.innerWidth;
      if (!naVysku || !window.screen?.height) { setPokryva(true); return; }
      setPokryva(window.innerHeight >= window.screen.height - 4);
    };
    zmer();
    window.addEventListener("resize", zmer);
    window.addEventListener("orientationchange", zmer);
    return () => {
      window.removeEventListener("resize", zmer);
      window.removeEventListener("orientationchange", zmer);
    };
  }, []);
  return pokryva;
}

export function BottomNav() {
  const pathname = usePathname();
  const { teamId, token } = useTeam();
  const pokryvaSpodek = usePokryvaSpodek();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unvotedCount, setUnvotedCount] = useState(0);
  const [notesUnseen, setNotesUnseen] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    const fetchUnread = () => {
      apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`)
        .then((convs) => setUnreadMessages(convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0)))
        .catch((e) => console.error("fetch conversations:", e));
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      apiFetch<Array<{ status: string; my_answer: string | null }>>("/api/votes", { headers })
        .then((votes) => setUnvotedCount(votes.filter((v) => v.status === "open" && v.my_answer === null).length))
        .catch((e) => console.error("fetch votes:", e));
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [teamId, token, pathname]);

  // Badge „Nové" u novinek — přehodnotit při každé navigaci (stránka Novinky ho maže)
  useEffect(() => {
    setNotesUnseen(hasUnseenNotes());
  }, [pathname]);

  const items = [
    { href: "/dashboard", label: "Domů", icon: "🏟" },
    { href: "/dashboard/phone", label: "Zprávy", icon: "📱", badge: unreadMessages },
    { href: "/dashboard/match", label: "Sestava", icon: "📋" },
    { href: "/dashboard/liga", label: "Liga", icon: "🏆" },
    // Novinky se schovávají pod Více, takže se musí připočíst sem — jinak by
    // hráč na mobilu neměl jak poznat, že něco nového vyšlo.
    { href: "/dashboard/more", label: "Více", icon: "⚙", badge: unvotedCount + (notesUnseen ? 1 : 0) },
  ];

  return (
    <nav
      className="on-dark fixed bottom-0 left-0 right-0 z-[var(--z-nav)] sm:hidden"
      style={{
        background: "#1e2d1e",
        paddingBottom: pokryvaSpodek ? "env(safe-area-inset-bottom, 0px)" : "0px",
      }}
    >
      <div className="flex justify-around items-center h-16 px-2">
        {items.map((item) => {
          // Větev pro položku „Kádr" tu byla i poté, co ji z lišty vyhodili —
          // nikdy se nevyhodnotila. Kádr je dnes pod Více.
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-soft transition-colors min-w-[56px] ${
                isActive
                  ? "text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-micro font-medium">{item.label}</span>
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
