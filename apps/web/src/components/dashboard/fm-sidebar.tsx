"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { useMenuBadges } from "@/hooks/use-menu-badges";
import {
  MENU_BADGE_BG,
  MENU_FOOTER_ITEMS,
  groupBadgeCount,
  menuBadgeFor,
  menuGroupsFor,
  type MenuItem,
} from "@/lib/menu-structure";

const COLLAPSED_GROUPS_KEY = "menu-collapsed-groups";
/** Odznak s počtem: pevná výška, kulatý i u jedné číslice, číslo vždy na středu. */
const MENU_BADGE = "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-white text-micro font-bold leading-none tabular-nums tracking-normal normal-case shrink-0";
/** Stejný strop jako ve spodní liště na mobilu: „530“ vedle „99+“ vypadalo jako dvě různá čísla. */
const capCount = (count: number | undefined) => (count != null && count > 99 ? "99+" : count);

const ADMIN_ITEM: MenuItem = { href: "/admin", label: "Admin", icon: "🛠️", color: "#8B4513" };

function readCollapsedGroups(): string[] {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch (e) {
    console.warn("read collapsed menu groups:", e);
    return [];
  }
}

export function FMSidebar() {
  const [expanded, setExpanded] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const badges = useMenuBadges();
  const pathname = usePathname();
  const { teamId, isAdmin, logout } = useTeam();

  const navRef = useRef<HTMLElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  // Až po připojení: na serveru localStorage není a první vykreslení musí sedět.
  useEffect(() => { setCollapsedGroups(readCollapsedGroups()); }, []);

  const updateScrollHint = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    setMoreBelow(nav.scrollHeight - nav.scrollTop - nav.clientHeight > 8);
  }, []);

  // Výška obsahu se mění sbalením skupiny, zúžením menu i změnou okna.
  useEffect(() => {
    updateScrollHint();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [updateScrollHint, collapsedGroups, expanded, badges.unvotedCount, isAdmin]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((current) => {
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
      try {
        window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn("save collapsed menu groups:", e);
      }
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/prehled") return pathname === "/prehled";
    // Vlastní profil trenéra žije pod /manazer/{teamId}, skripta a test pod /trener/…
    if (href === "/trener") return pathname.startsWith("/trener") || (!!teamId && pathname === `/manazer/${teamId}`);
    if (href === "/kadr") {
      return pathname.startsWith("/kadr") || pathname.startsWith("/tym/") || pathname.startsWith("/hrac/");
    }
    // „/zapas“ je Sestava; „/zapasovy-den“ k ní nepatří.
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const isItemActive = (item: MenuItem) => isActive(item.href) || (item.alsoActive ?? []).some((h) => pathname.startsWith(h));

  const groups = menuGroupsFor(badges);
  const footerItems = isAdmin ? [...MENU_FOOTER_ITEMS, ADMIN_ITEM] : MENU_FOOTER_ITEMS;

  const renderItem = (item: MenuItem) => {
    const active = isItemActive(item);
    const badge = menuBadgeFor(item.href, badges);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={!expanded ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center gap-2.5 mx-1 my-px rounded transition-colors duration-100 ${
          expanded ? "px-2.5 py-1.5" : "px-0 py-1.5 justify-center"
        } ${active ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/5"}`}
      >
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-green-400" />}
        <span className="text-sm shrink-0 w-5 text-center leading-none">{item.icon}</span>
        {expanded && <span className="text-[13px] font-medium whitespace-nowrap leading-none flex-1 min-w-0 truncate">{item.label}</span>}
        {badge && expanded && (
          <span className={`${MENU_BADGE} ${MENU_BADGE_BG[badge.tone]}`}>
            {badge.label ?? capCount(badge.count)}
          </span>
        )}
        {badge && !expanded && (
          <span className={`absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full ${MENU_BADGE_BG[badge.tone]}`} />
        )}
      </Link>
    );
  };

  return (
    <>
      <aside
        className={`on-dark hidden sm:flex flex-col fixed left-0 top-0 bottom-0 z-40 transition-all duration-200 ${
          expanded ? "w-48" : "w-12"
        }`}
        style={{ background: "#141e14" }}
      >
        <div className="h-14 flex items-center shrink-0 px-3" style={{ background: "#0f170f" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Zúžit menu" : "Rozšířit menu"}
            className="w-7 h-7 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors text-sm shrink-0"
          >
            {expanded ? "◀" : "▶"}
          </button>
          {expanded && (
            <span className="ml-3 text-white/80 font-heading font-bold text-sm tracking-wider uppercase whitespace-nowrap">
              Prales
            </span>
          )}
        </div>

        {/* Jedna rolovací plocha pro celé menu včetně servisních položek. Dřív
            byly dole přišpendlené a na nižším displeji ukrojily skupinám místo. */}
        <div className="relative flex-1 min-h-0">
          <nav ref={navRef} onScroll={updateScrollHint} className="sidebar-scroll h-full overflow-y-auto py-1">
            {groups.map((group, index) => {
              // Zúžené menu ukazuje jen ikony; sbalování skupin by v něm položky schovalo beze stopy.
              const collapsed = expanded && collapsedGroups.includes(group.id);
              const hiddenCount = collapsed ? groupBadgeCount(group, badges) : 0;
              const holdsActive = group.items.some(isItemActive);
              return (
                <div key={group.id}>
                  {expanded ? (
                    <button
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={!collapsed}
                      className={`w-full flex items-center gap-1.5 px-3 pt-3 pb-1 text-micro font-heading font-bold uppercase tracking-widest transition-colors ${
                        collapsed && holdsActive ? "text-green-400" : "text-white/45 hover:text-white/80"
                      }`}
                    >
                      <span className="flex-1 text-left">{group.label}</span>
                      {hiddenCount > 0 && (
                        <span className={`${MENU_BADGE} bg-card-red`}>{capCount(hiddenCount)}</span>
                      )}
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
                        className={`shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}>
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : (
                    index > 0 && <div className="mx-2.5 my-1 border-t border-white/10" />
                  )}
                  {!collapsed && group.items.map(renderItem)}
                </div>
              );
            })}

            <div className="border-t border-white/10 mt-2 pt-1.5 pb-1">
              {footerItems.map(renderItem)}
              <button
                onClick={logout}
                title={!expanded ? "Odhlásit" : undefined}
                className={`flex items-center gap-2.5 mx-1 my-px rounded text-white/55 hover:text-white hover:bg-white/5 transition-colors w-[calc(100%-0.5rem)] ${
                  expanded ? "px-2.5 py-1.5" : "px-0 py-1.5 justify-center"
                }`}
              >
                <span className="text-sm shrink-0 w-5 text-center leading-none">🚪</span>
                {expanded && <span className="text-[13px] font-medium leading-none">Odhlásit</span>}
              </button>
            </div>
          </nav>

          {/* Menu pokračuje pod okrajem: ztmavení a šipka, na kterou se dá kliknout. */}
          {moreBelow && (
            <button
              onClick={() => navRef.current?.scrollBy({ top: 240, behavior: "smooth" })}
              aria-label="Další položky menu"
              className="absolute inset-x-0 bottom-0 h-12 flex items-end justify-center pb-1 text-white"
              style={{ background: "linear-gradient(180deg, rgba(20,30,20,0) 0%, #141e14 70%)" }}
            >
              <span className="flex items-center gap-1 text-micro font-heading font-bold uppercase tracking-wider bg-white/15 rounded-full px-2.5 py-1">
                {expanded && "Další"}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </aside>

      <div className={`hidden sm:block shrink-0 transition-all duration-200 ${expanded ? "w-48" : "w-12"}`} />
    </>
  );
}
