import type { MenuBadgesState } from "@/hooks/use-menu-badges";

/**
 * Struktura menu na jednom místě.
 *
 * Postranní menu (desktop) i stránka Více (mobil) dřív držely každá vlastní
 * seznam položek a vlastní pravidla pro odznaky, takže se rozcházely. Skupiny
 * jsou poskládané podle toho, co manažer zrovna dělá, ne podle toho, komu
 * stránka „patří“.
 */

export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  /** Barva dlaždice na stránce Více. */
  color: string;
  /** Další adresy, na kterých je položka aktivní (Mládež: U21 i Akademie). */
  alsoActive?: string[];
  /** Položka je ve spodní liště, na stránce Více by se opakovala. */
  inBottomNav?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    id: "today",
    label: "Dnes",
    items: [
      { href: "/prehled", label: "Domů", icon: "🏠", color: "#2D5F2D", inBottomNav: true },
      { href: "/telefon", label: "Telefon", icon: "📱", color: "#2D5F2D", inBottomNav: true },
      { href: "/zpravodaj", label: "Zpravodaj", icon: "📰", color: "#556B2F" },
    ],
  },
  {
    id: "squad",
    label: "Tým",
    items: [
      { href: "/kadr", label: "Kádr", icon: "👥", color: "#2D5F2D" },
      { href: "/zapas", label: "Sestava", icon: "📋", color: "#2D5F2D", inBottomNav: true },
      // Mládež: U21 a Akademie se přepínají nahoře na stránce (components/players/youth-section-nav.tsx)
      { href: "/u21", label: "Mládež", icon: "🧒", color: "#3D7A3D", alsoActive: ["/akademie"] },
      { href: "/trenink", label: "Tréninky", icon: "🏋️", color: "#3D7A3D" },
      { href: "/zamestnanci", label: "Zaměstnanci", icon: "👔", color: "#4E6B7B" },
      { href: "/prestupy", label: "Přestupy", icon: "🤝", color: "#4A8A4A" },
    ],
  },
  {
    id: "matches",
    label: "Zápasy",
    items: [
      { href: "/liga", label: "Liga", icon: "🏆", color: "#B8860B", inBottomNav: true },
      { href: "/rozpis", label: "Rozpis", icon: "📅", color: "#3D6B5C" },
      { href: "/pohar", label: "Pohár", icon: "🏅", color: "#A0722D" },
      { href: "/turnaj", label: "Turnaj", icon: "⚽", color: "#A3155F" },
      { href: "/salovka", label: "Sálovka", icon: "🥅", color: "#2F5D8A" },
      { href: "/pratelaky", label: "Přáteláky", icon: "🤜", color: "#4A7A5C" },
      { href: "/kalendar", label: "Kalendář", icon: "🗓️", color: "#6B7B3D" },
      { href: "/rozhodci", label: "Rozhodčí", icon: "🧑‍⚖️", color: "#4E4E4E" },
    ],
  },
  {
    id: "office",
    label: "Kancelář",
    items: [
      { href: "/finance", label: "Finance", icon: "💰", color: "#6B8E23" },
      { href: "/sponzori", label: "Sponzoři", icon: "💼", color: "#8B7355" },
      { href: "/vybaveni", label: "Vybavení", icon: "👟", color: "#7B6B4E" },
      { href: "/stadion", label: "Stadion", icon: "🏟️", color: "#5C7A3D" },
      { href: "/muj-klub", label: "Klubový web", icon: "🌐", color: "#153615" },
    ],
  },
  {
    id: "village",
    label: "Vesnice",
    items: [
      { href: "/obec", label: "Obec", icon: "🏘️", color: "#3D6B5C" },
      { href: "/fanousci", label: "Fanoušci", icon: "📣", color: "#8B4513" },
      { href: "/hospoda", label: "Hospoda", icon: "🍺", color: "#8B5A2B" },
      { href: "/udalosti", label: "Události", icon: "🎉", color: "#8B6914" },
      { href: "/incidenty", label: "Incidenty", icon: "🚨", color: "#7A2E2E" },
      { href: "/sazky", label: "Sázky", icon: "🎫", color: "#7A2E2E" },
      { href: "/reputace", label: "Reputace", icon: "⭐", color: "#B8860B" },
      { href: "/soutez", label: "Grémium", icon: "🏛️", color: "#6B5B3D" },
    ],
  },
];

/** Sněm se do menu doplňuje jen ve chvíli, kdy čeká neodevzdaný hlas. */
export const ASSEMBLY_ITEM: MenuItem = { href: "/hlasovani", label: "Sněm", icon: "🗳️", color: "#B8860B" };

/** Osobní a servisní položky: v postranním menu dole, na stránce Více jako „Ostatní“. */
export const MENU_FOOTER_ITEMS: MenuItem[] = [
  { href: "/trener", label: "Profil trenéra", icon: "🧑‍💼", color: "#2D5F2D" },
  { href: "/novinky", label: "Co je nového", icon: "✨", color: "#3D7A3D" },
  { href: "/napoveda", label: "Nápověda", icon: "📖", color: "#2D5F2D" },
  { href: "/nastaveni", label: "Nastavení", icon: "⚙️", color: "#6B6B6B" },
];

export function menuGroupsFor(badges: Pick<MenuBadgesState, "unvotedCount">): MenuGroup[] {
  if (badges.unvotedCount <= 0) return MENU_GROUPS;
  return MENU_GROUPS.map((g) => (g.id === "village" ? { ...g, items: [...g.items, ASSEMBLY_ITEM] } : g));
}

export type MenuBadgeTone = "urgent" | "pending" | "news";

export interface MenuBadge {
  /** Počet; u štítku „Nové“ chybí. */
  count?: number;
  label?: string;
  tone: MenuBadgeTone;
}

export const MENU_BADGE_BG: Record<MenuBadgeTone, string> = {
  urgent: "bg-card-red",
  pending: "bg-amber-500",
  news: "bg-pitch-500",
};

export function menuBadgeFor(href: string, b: MenuBadgesState): MenuBadge | null {
  const counted = (count: number, tone: MenuBadgeTone): MenuBadge | null => (count > 0 ? { count, tone } : null);
  switch (href) {
    case "/telefon": return counted(b.unreadMessages, "urgent");
    case "/prestupy": return counted(b.incomingOffers, "urgent");
    case "/sazky": return counted(b.betsCount, "urgent");
    case "/soutez": return counted(b.gremiumCount, "urgent");
    case "/udalosti": return counted(b.pendingEvents, "pending");
    case "/obec": return counted(b.pendingVillage, "pending");
    case "/hlasovani": return counted(b.unvotedCount, "pending");
    case "/novinky": return b.notesUnseen ? { label: "Nové", tone: "news" } : null;
    default: return null;
  }
}

/** Součet odznaků skupiny; ukazuje se u sbalené skupiny, aby se v ní nic neschovalo. */
export function groupBadgeCount(group: MenuGroup, b: MenuBadgesState): number {
  return group.items.reduce((sum, item) => sum + (menuBadgeFor(item.href, b)?.count ?? 0), 0);
}
