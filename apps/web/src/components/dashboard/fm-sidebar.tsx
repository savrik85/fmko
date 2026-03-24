"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";

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
  { href: "/dashboard/squad", label: "Kádr", icon: "\u{1F465}", group: "club" },
  { href: "/dashboard/training", label: "Tréninky", icon: "\u{1F3CB}", group: "club" },
  { href: "/dashboard/transfers", label: "Přestupy", icon: "\u{1F91D}", group: "club" },
  { href: "/dashboard/finances", label: "Finance", icon: "\u{1F4B0}", group: "club" },
  { href: "/dashboard/sponsors", label: "Sponzoři", icon: "\u{1F4BC}", group: "club" },
  { href: "/dashboard/equipment", label: "Vybavení", icon: "\u{1F45F}", group: "club" },
  { href: "/dashboard/stadium", label: "Stadion", icon: "\u{1F3DF}", group: "club" },
  { href: "/dashboard/events", label: "Události", icon: "\u{1F389}", group: "club" },
  { href: "/dashboard/match", label: "Zápas", icon: "\u26BD", group: "league" },
  { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}", group: "league" },
  { href: "/dashboard/table", label: "Tabulka", icon: "\u{1F4CA}", group: "league" },
  { href: "/dashboard/schedule", label: "Rozpis", icon: "\u{1F4C5}", group: "league" },
  { href: "/dashboard/calendar", label: "Kalendář", icon: "\u{1F5D3}", group: "league" },
];

const GROUP_LABELS: Record<string, string> = {
  main: "",
  club: "Klub",
  league: "Soutěž",
};

export function FMSidebar() {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();
  const { teamId, logout } = useTeam();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/squad" || (href.startsWith("/dashboard/team/") && teamId)) {
      return pathname.startsWith("/dashboard/squad") || pathname.startsWith("/dashboard/team/") || pathname.startsWith("/dashboard/player/");
    }
    return pathname.startsWith(href);
  };

  const items = NAV_ITEMS.map((item) =>
    item.href === "/dashboard/squad" && teamId
      ? { ...item, href: `/dashboard/team/${teamId}` }
      : item
  );

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
                        <span className="text-[13px] font-medium whitespace-nowrap leading-none">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-white/5 p-1.5">
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
