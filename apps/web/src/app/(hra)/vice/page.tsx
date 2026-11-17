"use client";

import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { useMenuBadges, MenuBadgesState } from "@/hooks/use-menu-badges";
import { MenuLineIcon } from "@/components/dashboard/menu-line-icons";
import { MENU_BADGE_BG, MENU_FOOTER_ITEMS, menuBadgeFor, menuGroupsFor, type MenuItem } from "@/lib/menu-structure";

interface Section {
  title: string;
  items: MenuItem[];
}

interface PendingAlert {
  id: string;
  href: string;
  icon: string;
  title: string;
  count?: number;
  isNew?: boolean;
  description: string;
  color: string;
}

type TileBadge =
  | { type: "count"; count: number; bg?: string }
  | { type: "tag"; label: string; bg?: string };

const INSTALL_ITEM: MenuItem = { href: "/aplikace", icon: "📲", label: "Nainstaluj", color: "#153615" };

/**
 * Dlaždice podle stejných skupin jako postranní menu. Položky ze spodní lišty
 * se neopakují; ze skupiny Dnes tak zbyde jen Zpravodaj, který jde do Ostatních.
 */
function buildSections(badges: MenuBadgesState): Section[] {
  const sections: Section[] = [];
  const rest: MenuItem[] = [];
  for (const group of menuGroupsFor(badges)) {
    const items = group.items.filter((item) => !item.inBottomNav);
    if (group.id === "today") rest.push(...items);
    else sections.push({ title: group.label, items });
  }
  const [coachProfile, ...service] = MENU_FOOTER_ITEMS;
  sections.push({ title: "Ostatní", items: [...rest, coachProfile, ...service.slice(0, 2), INSTALL_ITEM, ...service.slice(2)] });
  return sections;
}

function getTileBadge(href: string, badges: MenuBadgesState): TileBadge | null {
  const badge = menuBadgeFor(href, badges);
  if (!badge) return null;
  const bg = MENU_BADGE_BG[badge.tone];
  return badge.count != null ? { type: "count", count: badge.count, bg } : { type: "tag", label: badge.label ?? "", bg };
}

const ADMIN_ITEM: MenuItem = { href: "/admin", icon: "🛠️", label: "Administrace", color: "#8B4513" };

/**
 * Skupina menu: bílý čtvereček se zelenou kreslenou ikonou, název pod ním,
 * po čtyřech v řadě. Ikony mají stejný rukopis jako spodní lišta.
 * Odznak sedí na rohu čtverečku, takže název má celou šířku sloupce.
 */
function MenuSection({ title, items, badges }: { title: string; items: MenuItem[]; badges: MenuBadgesState }) {
  return (
    <section className="mb-6">
      <h2 className="px-1 mb-2.5 text-xs font-heading font-bold text-muted uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {items.map((item) => {
          const badge = getTileBadge(item.href, badges);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1.5 min-w-0 active:scale-95 transition-transform"
            >
              <span className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-[26px] leading-none bg-surface text-pitch-500 shadow-[0_1px_2px_rgba(35,40,31,0.12),0_0_0_1px_rgba(35,40,31,0.05)]">
                <MenuLineIcon href={item.href} fallback={item.icon} />
                {badge && badge.type === "count" && badge.count > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 ${badge.bg ?? "bg-card-red"} text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center border-2 border-paper`}>
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                )}
                {badge && badge.type === "tag" && (
                  <span className={`absolute -top-1.5 -right-2.5 ${badge.bg ?? "bg-pitch-500"} text-white text-[9px] font-bold h-5 px-1.5 rounded-full flex items-center border-2 border-paper`}>
                    {badge.label}
                  </span>
                )}
              </span>
              <span className="w-full text-[11px] font-medium text-ink text-center leading-tight break-words">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function MorePage() {
  const { logout, isAdmin } = useTeam();
  const badges = useMenuBadges();

  const pendingAlerts: PendingAlert[] = [];

  if (badges.incomingOffers > 0) {
    pendingAlerts.push({
      id: "transfers",
      href: "/prestupy?tab=offers",
      icon: "🤝",
      title: "Přestupy",
      count: badges.incomingOffers,
      description:
        badges.incomingOffers === 1
          ? "1 nová nabídka na tvého hráče"
          : `${badges.incomingOffers} nové nabídky na tvé hráče`,
      color: "#4A8A4A",
    });
  }

  if (badges.gremiumCount > 0) {
    let desc = `${badges.gremiumCount} nových událostí v grémiu`;
    if (badges.gremiumToVote > 0 && badges.gremiumUnseenMeetings > 0) {
      desc = `${badges.gremiumToVote} neodevzdaných hlasů a nový zápis ze schůze`;
    } else if (badges.gremiumToVote > 0) {
      desc =
        badges.gremiumToVote === 1
          ? "1 neodevzdaný hlas před zasedáním grémia"
          : `${badges.gremiumToVote} neodevzdaných hlasů před zasedáním grémia`;
    } else if (badges.gremiumUnseenMeetings > 0) {
      desc =
        badges.gremiumUnseenMeetings === 1
          ? "1 nově vyhodnocené zasedání grémia"
          : `${badges.gremiumUnseenMeetings} nově vyhodnocených zasedání grémia`;
    }

    pendingAlerts.push({
      id: "gremium",
      href: "/soutez",
      icon: "🏛️",
      title: "Grémium soutěže",
      count: badges.gremiumCount,
      description: desc,
      color: "#6B5B3D",
    });
  }

  if (badges.betsCount > 0) {
    pendingAlerts.push({
      id: "bets",
      href: "/sazky",
      icon: "🎫",
      title: "Sázková kancelář",
      count: badges.betsCount,
      description:
        badges.betsCount === 1
          ? "1 nově vyhodnocený sázkový tiket"
          : `${badges.betsCount} nově vyhodnocených sázkových tiketů`,
      color: "#7A2E2E",
    });
  }

  if (badges.unvotedCount > 0) {
    pendingAlerts.push({
      id: "votes",
      href: "/hlasovani",
      icon: "🗳️",
      title: "Sněm ligy",
      count: badges.unvotedCount,
      description:
        badges.unvotedCount === 1
          ? "1 otevřené hlasování čeká na tvůj hlas"
          : `${badges.unvotedCount} otevřených hlasování čeká na tvůj hlas`,
      color: "#B8860B",
    });
  }

  if (badges.notesUnseen) {
    pendingAlerts.push({
      id: "notes",
      href: "/novinky",
      icon: "✨",
      title: "Co je nového",
      isNew: true,
      description: "Nové funkce, vylepšení a novinky ve hře",
      color: "#3D7A3D",
    });
  }

  const totalAlertCount = pendingAlerts.reduce((sum, a) => sum + (a.count ?? 1), 0);

  const sections = buildSections(badges);

  return (
    <div className="page-container pb-24">
      {/* Sekce s přehledem notifikací, které vyžadují pozornost */}
      {pendingAlerts.length > 0 && (
        <section aria-label="Upozornění vyžadující pozornost" className="mb-6">
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2.5 px-0.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-card-red" />
              </span>
              <h2 className="text-xs font-heading font-bold uppercase tracking-wider text-ink">
                Čeká na tvou pozornost ({totalAlertCount})
              </h2>
            </div>

            <div className="space-y-2">
              {pendingAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-surface-elevated border border-line transition-all active:scale-[0.99] shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: `${alert.color}26` }}
                      aria-hidden="true"
                    >
                      {alert.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-heading font-bold text-ink truncate">
                          {alert.title}
                        </span>
                        {alert.count != null && alert.count > 0 && (
                          <span className="bg-card-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                            {alert.count}
                          </span>
                        )}
                        {alert.isNew && (
                          <span className="bg-pitch-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                            Nové
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-tight truncate mt-0.5">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-heading font-bold text-pitch-600 shrink-0 flex items-center gap-1 pl-1">
                    Otevřít →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {sections.map((section) => (
        <MenuSection key={section.title} title={section.title} items={section.items} badges={badges} />
      ))}

      {/* Administrace — jen pro adminy */}
      {isAdmin && <MenuSection title="Správa" items={[ADMIN_ITEM]} badges={badges} />}

      <button
        onClick={logout}
        className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hover:bg-red-100 transition-colors"
      >
        🚪 Odhlásit se
      </button>
    </div>
  );
}
