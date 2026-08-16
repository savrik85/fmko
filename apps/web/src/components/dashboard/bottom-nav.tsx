"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { hasUnseenNotes } from "@/data/release-notes";

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

export function BottomNav() {
  const pathname = usePathname();
  const { teamId, token } = useTeam();
  const schodek = useSchodekViewportu();
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
        background: "var(--color-chrome)",
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
      <div className="flex justify-around items-center h-12 px-2">
        {items.map((item) => {
          // Větev pro položku „Kádr" tu byla i poté, co ji z lišty vyhodili —
          // nikdy se nevyhodnotila. Kádr je dnes pod Více.
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
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
    </nav>
  );
}
