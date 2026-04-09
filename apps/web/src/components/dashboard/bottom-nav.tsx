"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export function BottomNav() {
  const pathname = usePathname();
  const { teamId } = useTeam();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!teamId) return;
    const fetchUnread = () => {
      apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`)
        .then((convs) => setUnreadMessages(convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0)))
        .catch(() => { /* ignore */ });
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [teamId, pathname]);

  const items = [
    { href: "/dashboard", label: "Domů", icon: "\u{1F3DF}" },
    { href: "/dashboard/phone", label: "Zprávy", icon: "\u{1F4F1}", badge: unreadMessages },
    { href: "/dashboard/match", label: "Sestava", icon: "\u{1F4CB}" },
    { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}" },
    { href: "/dashboard/more", label: "Více", icon: "\u2699" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden" style={{ background: "#1e2d1e", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex justify-around items-center h-14 px-2">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
            (item.label === "Kádr" && (pathname.startsWith("/dashboard/team") || pathname.startsWith("/dashboard/squad")));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] ${
                isActive
                  ? "text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
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
