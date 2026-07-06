"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { hasUnseenNotes } from "@/data/release-notes";

type SectionKey = "pinned" | "tym" | "prestupy" | "klub" | "penize" | "soutez" | "ostatni";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  section: SectionKey;
  isNew?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Domů", icon: "\u{1F3E0}", section: "pinned" },
  { href: "/dashboard/phone", label: "Zprávy", icon: "\u{1F4F1}", section: "pinned" },
  { href: "/dashboard/news", label: "Zpravodaj", icon: "\u{1F4F0}", section: "pinned" },
  { href: "/dashboard/novinky", label: "Co je nového", icon: "✨", section: "ostatni" },
  { href: "/dashboard/invite", label: "Pozvi kamar\u00E1da", icon: "\u2709\uFE0F", section: "ostatni" },
  { href: "/dashboard/klub", label: "Klub", icon: "\u{1F3DB}\uFE0F", section: "klub" },
  { href: "/dashboard/obec", label: "Obec", icon: "\u{1F3D8}\uFE0F", section: "klub" },
  { href: "/dashboard/squad", label: "Kádr", icon: "\u{1F465}", section: "tym" },
  { href: "/dashboard/u21", label: "U21", icon: "\u{1F9D2}", section: "tym" },
  { href: "/dashboard/training", label: "Tréninky", icon: "\u{1F3CB}", section: "tym" },
  { href: "/dashboard/zamestnanci", label: "Zaměstnanci", icon: "\u{1F454}", section: "tym", isNew: true },
  { href: "/dashboard/transfers", label: "Přestupy", icon: "\u{1F91D}", section: "prestupy" },
  { href: "/dashboard/watchlist", label: "Sledovaní", icon: "\u{2B50}", section: "prestupy" },
  { href: "/dashboard/finances", label: "Finance", icon: "\u{1F4B0}", section: "penize" },
  { href: "/dashboard/sponsors", label: "Sponzoři", icon: "\u{1F4BC}", section: "penize" },
  { href: "/dashboard/equipment", label: "Vybavení", icon: "\u{1F45F}", section: "klub" },
  { href: "/dashboard/stadium", label: "Stadion", icon: "\u{1F3DF}", section: "klub" },
  { href: "/dashboard/fans", label: "Fanoušci", icon: "\u{1F4E3}", section: "klub" },
  { href: "/dashboard/events", label: "Události", icon: "\u{1F389}", section: "klub" },
  { href: "/dashboard/hospoda", label: "Hospoda", icon: "\u{1F37A}", section: "klub" },
  { href: "/dashboard/match", label: "Sestava", icon: "\u{1F4CB}", section: "tym" },
  { href: "/dashboard/schedule", label: "Rozpis", icon: "\u{1F4C5}", section: "soutez" },
  { href: "/dashboard/friendly", label: "Přáteláky", icon: "\u{1F91C}", section: "soutez" },
  { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}", section: "soutez" },
  { href: "/dashboard/pohar", label: "Pohár", icon: "\u{1F3C5}", section: "soutez", isNew: true },
  { href: "/dashboard/calendar", label: "Kalendář", icon: "\u{1F5D3}", section: "soutez" },
  { href: "/dashboard/napoveda", label: "Nápověda", icon: "\u{1F4D6}", section: "ostatni" },
  // Sněm dočasně skryt z menu — dostupný přes přímou URL /dashboard/hlasovani.
];

const SECTIONS: { key: Exclude<SectionKey, "pinned">; label: string }[] = [
  { key: "tym", label: "Tým" },
  { key: "prestupy", label: "Přestupy" },
  { key: "klub", label: "Klub" },
  { key: "penize", label: "Peníze" },
  { key: "soutez", label: "Soutěž" },
  { key: "ostatni", label: "Ostatní" },
];

export function FMSidebar() {
  const [expanded, setExpanded] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [incomingOffers, setIncomingOffers] = useState(0);
  const [unvotedCount, setUnvotedCount] = useState(0);
  const [notesUnseen, setNotesUnseen] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
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

  // Badge „Nové" u Co je nového — přehodnotit při každé navigaci (stránka Novinky ho maže)
  useEffect(() => {
    setNotesUnseen(hasUnseenNotes());
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/squad" || (href.startsWith("/dashboard/team/") && teamId)) {
      return pathname.startsWith("/dashboard/squad") || pathname.startsWith("/dashboard/team/") || pathname.startsWith("/dashboard/player/");
    }
    return pathname.startsWith(href);
  };

  const items: NavItem[] = isAdmin
    ? [...NAV_ITEMS, { href: "/dashboard/admin", label: "Admin", icon: "⚙️", section: "ostatni" }]
    : NAV_ITEMS;

  const activeSection: SectionKey = items.find((i) => isActive(i.href))?.section ?? "pinned";

  // Sekce s aktivní stránkou se otevře; ruční toggle mezi navigacemi zůstává.
  useEffect(() => { setOpenSection(activeSection); }, [activeSection]);

  // Badge helpers
  const itemCount = (href: string): number =>
    href === "/dashboard/phone" ? unreadMessages
    : href === "/dashboard/transfers" ? incomingOffers
    : href === "/dashboard/hlasovani" ? unvotedCount : 0;
  const itemDot = (item: NavItem): boolean => !!(item.isNew || (item.href === "/dashboard/novinky" && notesUnseen));

  const renderItem = (item: NavItem, indented: boolean) => {
    const active = isActive(item.href);
    const count = itemCount(item.href);
    const dot = itemDot(item);
    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        title={!expanded ? item.label : undefined}
        className={`relative flex items-center gap-2.5 mx-1 my-px rounded transition-all duration-100 ${
          expanded ? (indented ? "pl-7 pr-2.5 py-1.5" : "px-2.5 py-1.5") : "px-0 py-1.5 justify-center"
        } ${active ? "bg-white/10 text-white" : "text-white/35 hover:text-white/80 hover:bg-white/5"}`}
      >
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-green-400" />}
        <span className="text-sm shrink-0 w-5 text-center leading-none">{item.icon}</span>
        {!expanded && (dot || count > 0) && (
          <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-green-400" />
        )}
        {expanded && (
          <span className="flex-1 flex items-center text-[13px] font-medium whitespace-nowrap leading-none">
            {item.label}
            {dot && <span className="ml-1.5 bg-pitch-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">Nové</span>}
            {count > 0 && (
              <span className={`ml-auto ${item.href === "/dashboard/hlasovani" ? "bg-amber-500" : "bg-card-red"} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full`}>{count}</span>
            )}
          </span>
        )}
      </Link>
    );
  };

  const pinnedItems = items.filter((i) => i.section === "pinned");

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
          {/* Pinned (vždy vidět) */}
          {pinnedItems.map((i) => renderItem(i, false))}

          {SECTIONS.map((sec) => {
            const secItems = items.filter((i) => i.section === sec.key);
            if (secItems.length === 0) return null;

            // Rail (sbaleno na ikony): oddělovač + ikony naplocho, bez accordionu
            if (!expanded) {
              return (
                <div key={sec.key}>
                  <div className="mx-2.5 my-1 border-t border-white/5" />
                  {secItems.map((i) => renderItem(i, false))}
                </div>
              );
            }

            const open = openSection === sec.key;
            const hasDot = secItems.some((i) => itemDot(i));
            const totalCount = secItems.reduce((s, i) => s + itemCount(i.href), 0);
            return (
              <div key={sec.key}>
                <button
                  onClick={() => setOpenSection(open ? null : sec.key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 mt-1 text-white/45 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <span className="text-[10px] w-3 text-center text-white/30 leading-none">{open ? "▾" : "▸"}</span>
                  <span className="flex-1 text-left text-[10px] font-heading font-bold uppercase tracking-widest">{sec.label}</span>
                  {!open && (hasDot || totalCount > 0) && (
                    <span className={`w-1.5 h-1.5 rounded-full ${totalCount > 0 ? "bg-card-red" : "bg-green-400"}`} />
                  )}
                </button>
                {open && secItems.map((i) => renderItem(i, true))}
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
