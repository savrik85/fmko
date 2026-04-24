"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  group: "main" | "club" | "league";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Domů", icon: "\u{1F3E0}", group: "main" },
  { href: "/dashboard/phone", label: "Zprávy", icon: "\u{1F4F1}", group: "main" },
  { href: "/dashboard/news", label: "Zpravodaj", icon: "\u{1F4F0}", group: "main" },
  { href: "/dashboard/invite", label: "Pozvi kamar\u00E1da", icon: "\u2709\uFE0F", group: "main" },
  { href: "/dashboard/squad", label: "Kádr", icon: "\u{1F465}", group: "club" },
  { href: "/dashboard/training", label: "Tréninky", icon: "\u{1F3CB}", group: "club" },
  { href: "/dashboard/transfers", label: "Přestupy", icon: "\u{1F91D}", group: "club" },
  { href: "/dashboard/watchlist", label: "Sledovaní", icon: "\u{2B50}", group: "club" },
  { href: "/dashboard/finances", label: "Finance", icon: "\u{1F4B0}", group: "club" },
  { href: "/dashboard/sponsors", label: "Sponzoři", icon: "\u{1F4BC}", group: "club" },
  { href: "/dashboard/equipment", label: "Vybavení", icon: "\u{1F45F}", group: "club" },
  { href: "/dashboard/stadium", label: "Stadion", icon: "\u{1F3DF}", group: "club" },
  { href: "/dashboard/fans", label: "Fanoušci", icon: "\u{1F4E3}", group: "club" },
  { href: "/dashboard/events", label: "Události", icon: "\u{1F389}", group: "club" },
  { href: "/dashboard/match", label: "Sestava", icon: "\u{1F4CB}", group: "league" },
  { href: "/dashboard/schedule", label: "Rozpis", icon: "\u{1F4C5}", group: "league" },
  { href: "/dashboard/friendly", label: "Přáteláky", icon: "\u{1F91C}", group: "league" },
  { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}", group: "league" },
  { href: "/dashboard/calendar", label: "Kalendář", icon: "\u{1F5D3}", group: "league" },
  { href: "/dashboard/hlasovani", label: "Sněm", icon: "\u{1F5F3}\uFE0F", group: "league" },
];

const GROUP_LABELS: Record<string, string> = {
  main: "",
  club: "Klub",
  league: "Soutěž",
};

export function FMSidebar() {
  const [expanded, setExpanded] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [incomingOffers, setIncomingOffers] = useState(0);
  const [unvotedCount, setUnvotedCount] = useState(0);
  const pathname = usePathname();
  const { teamId, isAdmin, logout, token } = useTeam();

  // Poll unread messages count — refresh on page change too
  useEffect(() => {
    if (!teamId) return;
    const load = () => {
      apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`)
        .then((convs) => setUnreadMessages(convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0)))
        .catch((e) => console.error("fetch conversations:", e));
      apiFetch<{ incoming: unknown[] }>(`/api/teams/${teamId}/offers`)
        .then((o) => setIncomingOffers(o.incoming?.length ?? 0))
        .catch((e) => console.error("fetch offers:", e));
      // Aktivní ankety kde jsem ještě nehlasoval
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      apiFetch<Array<{ status: string; my_answer: string | null }>>("/api/votes", { headers })
        .then((votes) => setUnvotedCount(votes.filter((v) => v.status === "open" && v.my_answer === null).length))
        .catch((e) => console.error("fetch votes:", e));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [teamId, token, pathname]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/squad" || (href.startsWith("/dashboard/team/") && teamId)) {
      return pathname.startsWith("/dashboard/squad") || pathname.startsWith("/dashboard/team/") || pathname.startsWith("/dashboard/player/");
    }
    return pathname.startsWith(href);
  };

  const items = isAdmin
    ? [...NAV_ITEMS, { href: "/dashboard/admin", label: "Admin", icon: "⚙️", group: "main" as const }]
    : NAV_ITEMS;

  const groups = ["main", "club", "league"] as const;

  return (
    <>
      <aside
        className={`hidden sm:flex flex-col fixed left-0 top-0 bottom-0 z-40 transition-all duration-200 ${
          expanded ? "w-48" : "w-12"
        }`}
        style={{ background: "#141e14" }}
      >
        {/* Header */}
        <div className="h-14 flex items-center shrink-0 px-3" style={{ background: "#0f170f" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors text-sm shrink-0"
          >
            {expanded ? "\u25C0" : "\u25B6"}
          </button>
          {expanded && (
            <span className="ml-3 text-white/80 font-heading font-bold text-sm tracking-wider uppercase whitespace-nowrap">
              Prales FM
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1">
          {groups.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            return (
              <div key={group}>
                {expanded && GROUP_LABELS[group] && (
                  <div className="px-3 pt-3 pb-1 text-[9px] font-heading font-bold text-white/20 uppercase tracking-widest">
                    {GROUP_LABELS[group]}
                  </div>
                )}
                {!expanded && group !== "main" && (
                  <div className="mx-2.5 my-1 border-t border-white/5" />
                )}
                {groupItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      title={!expanded ? item.label : undefined}
                      className={`relative flex items-center gap-2.5 mx-1 my-px rounded transition-all duration-100 ${
                        expanded ? "px-2.5 py-1.5" : "px-0 py-1.5 justify-center"
                      } ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/35 hover:text-white/80 hover:bg-white/5"
                      }`}
                    >
                      {/* Active indicator bar */}
                      {active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-green-400" />
                      )}
                      <span className="text-sm shrink-0 w-5 text-center leading-none">{item.icon}</span>
                      {expanded && (
                        <span className="text-[13px] font-medium whitespace-nowrap leading-none">
                          {item.label}
                          {item.href === "/dashboard/phone" && unreadMessages > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadMessages}</span>
                          )}
                          {item.href === "/dashboard/transfers" && incomingOffers > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{incomingOffers}</span>
                          )}
                          {item.href === "/dashboard/hlasovani" && unvotedCount > 0 && (
                            <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unvotedCount}</span>
                          )}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Settings + Logout */}
        <div className="border-t border-white/5 p-1.5">
          <Link href="/dashboard/settings" title={!expanded ? "Nastavení" : undefined}
            className={`flex items-center gap-2.5 w-full rounded text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors ${
              expanded ? "px-2.5 py-1.5" : "px-0 py-1.5 justify-center"
            }`}>
            <span className="text-sm shrink-0 w-5 text-center">{"\u2699\uFE0F"}</span>
            {expanded && <span className="text-sm font-medium">Nastavení</span>}
          </Link>
          <button
            onClick={logout}
            className={`flex items-center gap-2.5 w-full rounded text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors ${
              expanded ? "px-2.5 py-2" : "px-0 py-2 justify-center"
            }`}
          >
            <span className="text-sm shrink-0 w-5 text-center">{"\u{1F6AA}"}</span>
            {expanded && <span className="text-sm font-medium">Odhlásit</span>}
          </button>
        </div>
      </aside>

      <div className={`hidden sm:block shrink-0 transition-all duration-200 ${expanded ? "w-48" : "w-12"}`} />
    </>
  );
}
