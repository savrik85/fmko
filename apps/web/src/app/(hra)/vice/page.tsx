"use client";

import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { useMenuBadges, MenuBadgesState } from "@/hooks/use-menu-badges";

interface MenuItem {
  href: string;
  icon: string;
  label: string;
  color: string;
}

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

const BASE_SECTIONS: Section[] = [
  {
    title: "Klub",
    items: [
      { href: "/trener", icon: "🧑‍💼", label: "Profil trenéra", color: "#2D5F2D" },
      { href: "/muj-klub", icon: "🏛️", label: "Klub", color: "#153615" },
      { href: "/obec", icon: "🏘️", label: "Obec", color: "#3D6B5C" },
      { href: "/reputace", icon: "⭐", label: "Reputace", color: "#B8860B" },
      { href: "/kadr", icon: "👥", label: "Kádr", color: "#2D5F2D" },
      { href: "/u21", icon: "🧒", label: "U21", color: "#3D7A3D" },
      { href: "/trenink", icon: "🏋️", label: "Tréninky", color: "#3D7A3D" },
      { href: "/zamestnanci", icon: "👔", label: "Zaměstnanci", color: "#4E6B7B" },
      { href: "/prestupy", icon: "🤝", label: "Přestupy", color: "#4A8A4A" },
      { href: "/sledovani", icon: "⭐", label: "Sledovaní", color: "#B8860B" },
      { href: "/sazky", icon: "🎫", label: "Sázková kancelář", color: "#7A2E2E" },
      { href: "/finance", icon: "💰", label: "Finance", color: "#6B8E23" },
      { href: "/sponzori", icon: "💼", label: "Sponzoři", color: "#8B7355" },
      { href: "/vybaveni", icon: "👟", label: "Vybavení", color: "#7B6B4E" },
      { href: "/stadion", icon: "🏟️", label: "Stadion", color: "#5C7A3D" },
      { href: "/fanousci", icon: "📢", label: "Fanoušci", color: "#8B4513" },
      { href: "/udalosti", icon: "🎉", label: "Události", color: "#8B6914" },
      { href: "/hospoda", icon: "🍺", label: "Hospoda", color: "#8B5A2B" },
      { href: "/incidenty", icon: "🚨", label: "Incidenty", color: "#7A2E2E" },
    ],
  },
  {
    title: "Soutěž",
    items: [
      { href: "/liga", icon: "🏆", label: "Liga", color: "#B8860B" },
      { href: "/pohar", icon: "🥇", label: "Pohár", color: "#A0722D" },
      { href: "/rozpis", icon: "📅", label: "Rozpis", color: "#3D6B5C" },
      { href: "/pratelaky", icon: "🤛", label: "Přáteláky", color: "#4A7A5C" },
      { href: "/kalendar", icon: "🗓️", label: "Kalendář", color: "#6B7B3D" },
      { href: "/zpravodaj", icon: "📰", label: "Zpravodaj", color: "#556B2F" },
      { href: "/rozhodci", icon: "🧑‍⚖️", label: "Rozhodčí", color: "#4E4E4E" },
      { href: "/soutez", icon: "🏛️", label: "Grémium soutěže", color: "#6B5B3D" },
      // Sněm ligy je dynamicky doplněn, pokud existuje neodevzdaný hlas
    ],
  },
  {
    title: "Ostatní",
    items: [
      { href: "/novinky", icon: "✨", label: "Co je nového", color: "#3D7A3D" },
      { href: "/napoveda", icon: "📖", label: "Nápověda", color: "#2D5F2D" },
      { href: "/aplikace", icon: "📲", label: "Nainstaluj", color: "#153615" },
      { href: "/nastaveni", icon: "⚙️", label: "Nastavení", color: "#6B6B6B" },
    ],
  },
];

function getTileBadge(href: string, badges: MenuBadgesState): TileBadge | null {
  if (href === "/prestupy" && badges.incomingOffers > 0) {
    return { type: "count", count: badges.incomingOffers, bg: "bg-card-red" };
  }
  if (href === "/sazky" && badges.betsCount > 0) {
    return { type: "count", count: badges.betsCount, bg: "bg-card-red" };
  }
  if (href === "/soutez" && badges.gremiumCount > 0) {
    return { type: "count", count: badges.gremiumCount, bg: "bg-card-red" };
  }
  if (href === "/hlasovani" && badges.unvotedCount > 0) {
    return { type: "count", count: badges.unvotedCount, bg: "bg-amber-500" };
  }
  if (href === "/novinky" && badges.notesUnseen) {
    return { type: "tag", label: "Nové", bg: "bg-pitch-500" };
  }
  return null;
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

  const sections = BASE_SECTIONS.map((section) => {
    if (section.title === "Soutěž" && badges.unvotedCount > 0) {
      const alreadyHas = section.items.some((i) => i.href === "/hlasovani");
      if (!alreadyHas) {
        return {
          ...section,
          items: [
            ...section.items,
            { href: "/hlasovani", icon: "🗳️", label: "Sněm", color: "#B8860B" },
          ],
        };
      }
    }
    return section;
  });

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
        <div key={section.title} className="mb-6">
          <p className="text-xs font-heading font-bold text-muted uppercase tracking-wide mb-3 px-1 flex items-center gap-2 after:flex-1 after:h-px after:bg-line">
            {section.title}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {section.items.map((item) => {
              const badge = getTileBadge(item.href, badges);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-transform active:scale-95"
                  /* Sytost 14 % a 24 % — skupiny od sebe jdou rozeznat */
                  style={{ background: `${item.color}24` }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${item.color}3D` }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                  <span className="text-micro font-medium text-ink text-center leading-tight">
                    {item.label}
                  </span>
                  {badge && badge.type === "count" && badge.count > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 ${badge.bg ?? "bg-card-red"} text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-md border-2 border-surface`}
                    >
                      {badge.count > 99 ? "99+" : badge.count}
                    </span>
                  )}
                  {badge && badge.type === "tag" && (
                    <span className="absolute -top-1 -right-1 bg-pitch-500 text-white text-micro font-bold px-1.5 py-0.5 rounded-full shadow-md border-2 border-surface">
                      {badge.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Administrace — jen pro adminy */}
      {isAdmin && (
        <div className="mb-6">
          <p className="text-xs font-heading font-bold text-muted uppercase tracking-wide mb-3 px-1 flex items-center gap-2 after:flex-1 after:h-px after:bg-line">
            Správa
          </p>
          <div className="grid grid-cols-4 gap-2">
            <Link
              href="/admin"
              className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-transform active:scale-95"
              style={{ background: "#8B451324" }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                style={{ background: "#8B45133D" }}
                aria-hidden="true"
              >
                🛠️
              </div>
              <span className="text-micro font-medium text-ink text-center leading-tight">
                Administrace
              </span>
            </Link>
          </div>
        </div>
      )}

      <button
        onClick={logout}
        className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hover:bg-red-100 transition-colors"
      >
        🚪 Odhlásit se
      </button>
    </div>
  );
}
