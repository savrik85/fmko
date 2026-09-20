"use client";

import { useEffect } from "react";
import { useMenuBadges } from "@/hooks/use-menu-badges";

const PREFIX_RE = /^\(\d+\) /;

export function NotificationTitle() {
  const badges = useMenuBadges();

  useEffect(() => {
    const total = badges.unreadMessages + badges.moreBadgeCount;
    const base = document.title.replace(PREFIX_RE, "");
    document.title = total > 0 ? `(${total}) ${base}` : base;

    return () => {
      document.title = document.title.replace(PREFIX_RE, "");
    };
  }, [badges.unreadMessages, badges.moreBadgeCount]);

  return null;
}
