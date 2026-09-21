"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { useMenuBadges } from "@/hooks/use-menu-badges";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  group: "main" | "club" | "league";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/prehled", label: "Domů", icon: "\u{1F3E0}", group: "main" },
  { href: "/telefon", label: "Telefon", icon: "\u{1F4F1}", group: "main" },
  { href: "/zpravodaj", label: "Zpravodaj", icon: "\u{1F4F0}", group: "main" },
  { href: "/novinky", label: "Co je nového", icon: "✨", group: "main" },
  { href: "/muj-klub", label: "Klub", icon: "\u{1F3DB}\uFE0F", group: "club" },
  { href: "/obec", label: "Obec", icon: "\u{1F3D8}\uFE0F", group: "club" },
  { href: "/reputace", label: "Reputace", icon: "\u2B50", group: "club" },
  { href: "/kadr", label: "Kádr", icon: "\u{1F465}", group: "club" },
  { href: "/u21", label: "U21", icon: "\u{1F9D2}", group: "club" },
  { href: "/trenink", label: "Tréninky", icon: "\u{1F3CB}", group: "club" },
  { href: "/zamestnanci", label: "Zaměstnanci", icon: "\u{1F454}", group: "club" },
  { href: "/prestupy", label: "Přestupy", icon: "\u{1F91D}", group: "club" },
  { href: "/sledovani", label: "Sledovaní", icon: "\u{2B50}", group: "club" },
  { href: "/sazky", label: "Sázky", icon: "\u{1F3AB}", group: "club" },
  { href: "/finance", label: "Finance", icon: "\u{1F4B0}", group: "club" },
  { href: "/sponzori", label: "Sponzoři", icon: "\u{1F4BC}", group: "club" },
  { href: "/vybaveni", label: "Vybavení", icon: "\u{1F45F}", group: "club" },
  { href: "/stadion", label: "Stadion", icon: "\u{1F3DF}", group: "club" },
  { href: "/fanousci", label: "Fanoušci", icon: "\u{1F4E3}", group: "club" },
  { href: "/udalosti", label: "Události", icon: "\u{1F389}", group: "club" },
  { href: "/hospoda", label: "Hospoda", icon: "\u{1F37A}", group: "club" },
  { href: "/incidenty", label: "Incidenty", icon: "\u{1F6A8}", group: "club" },
  { href: "/zapas", label: "Sestava", icon: "\u{1F4CB}", group: "league" },
  { href: "/rozpis", label: "Rozpis", icon: "\u{1F4C5}", group: "league" },
  { href: "/pratelaky", label: "Přáteláky", icon: "\u{1F91C}", group: "league" },
  { href: "/liga", label: "Liga", icon: "\u{1F3C6}", group: "league" },
  { href: "/rozhodci", label: "Rozhodčí", icon: "\u{1F9D1}\u200D\u2696\uFE0F", group: "league" },
  { href: "/soutez", label: "Grémium", icon: "\u{1F3DB}\uFE0F", group: "league" },
  { href: "/pohar", label: "Pohár", icon: "\u{1F3C5}", group: "league" },
  { href: "/kalendar", label: "Kalendář", icon: "\u{1F5D3}", group: "league" },
  { href: "/napoveda", label: "Nápověda", icon: "\u{1F4D6}", group: "league" },
  // Sněm dočasně skryt z menu — dostupný přes přímou URL /hlasovani.
];

const GROUP_LABELS: Record<string, string> = {
  main: "",
  club: "Klub",
  league: "Soutěž",
};

export function FMSidebar() {
  const [expanded, setExpanded] = useState(true);
  const badges = useMenuBadges();
  const pathname = usePathname();
  const { teamId, isAdmin, logout } = useTeam();

  const {
    unreadMessages,
    incomingOffers,
    unvotedCount,
    notesUnseen,
    gremiumCount,
    betsCount,
  } = badges;

  const isActive = (href: string) => {
    if (href === "/prehled") return pathname === "/prehled";
    if (href === "/kadr" || (href.startsWith("/tym/") && teamId)) {
      return pathname.startsWith("/kadr") || pathname.startsWith("/tym/") || pathname.startsWith("/hrac/");
    }
    return pathname.startsWith(href);
  };

  const baseItems = isAdmin
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: "⚙️", group: "main" as const }]
    : NAV_ITEMS;

  const items = unvotedCount > 0
    ? [...baseItems, { href: "/hlasovani", label: "Sněm", icon: "🗳️", group: "league" as const }]
    : baseItems;

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
              Prales
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
                  <div className="px-3 pt-3 pb-1 text-micro font-heading font-bold text-white/20 uppercase tracking-widest">
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
                      {!expanded && item.href === "/novinky" && notesUnseen && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-green-400" />
                      )}
                      {!expanded && item.href === "/telefon" && unreadMessages > 0 && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-card-red" />
                      )}
                      {!expanded && item.href === "/prestupy" && incomingOffers > 0 && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-card-red" />
                      )}
                      {!expanded && item.href === "/soutez" && gremiumCount > 0 && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-card-red" />
                      )}
                      {!expanded && item.href === "/sazky" && betsCount > 0 && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-card-red" />
                      )}
                      {!expanded && item.href === "/hlasovani" && unvotedCount > 0 && (
                        <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                      )}
                      {expanded && (
                        <span className="text-[13px] font-medium whitespace-nowrap leading-none">
                          {item.label}
                          {item.href === "/novinky" && notesUnseen && (
                            <span className="ml-1.5 bg-pitch-500 text-white text-micro font-bold px-1.5 py-0.5 rounded-full">Nové</span>
                          )}
                          {item.href === "/telefon" && unreadMessages > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-micro font-bold px-1.5 py-0.5 rounded-full">{unreadMessages}</span>
                          )}
                          {item.href === "/prestupy" && incomingOffers > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-micro font-bold px-1.5 py-0.5 rounded-full">{incomingOffers}</span>
                          )}
                          {item.href === "/hlasovani" && unvotedCount > 0 && (
                            <span className="ml-1.5 bg-amber-500 text-white text-micro font-bold px-1.5 py-0.5 rounded-full">{unvotedCount}</span>
                          )}
                          {item.href === "/soutez" && gremiumCount > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-micro font-bold px-1.5 py-0.5 rounded-full">{gremiumCount}</span>
                          )}
                          {item.href === "/sazky" && betsCount > 0 && (
                            <span className="ml-1.5 bg-card-red text-white text-micro font-bold px-1.5 py-0.5 rounded-full">{betsCount}</span>
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
          <Link href="/nastaveni" title={!expanded ? "Nastavení" : undefined}
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
