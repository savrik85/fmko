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
    { href: "/dashboard", label: "Domů", icon: "🏟" },
    { href: "/dashboard/phone", label: "Zprávy", icon: "📱", badge: unreadMessages },
    { href: "/dashboard/match", label: "Sestava", icon: "📋" },
    { href: "/dashboard/liga", label: "Liga", icon: "🏆" },
    { href: "/dashboard/more", label: "Více", icon: "⚙" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden" style={{ background: "#1e2d1e", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex justify-around items-center h-12 px-2">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
            (item.label === "Kádr" && (pathname.startsWith("/dashboard/team") || pathname.startsWith("/dashboard/squad")));
          return (
            <Link
              key={item.label}
              href={item.href}
              style={{ minHeight: "unset" }}
              className={`relative flex flex-col items-center justify-center gap-0 py-0.5 px-3 rounded-lg transition-colors min-w-[48px] ${
                isActive
                  ? "text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="text-[9px] font-medium leading-tight">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="absolute -top-0.5 right-1 bg-card-red text-white text-[8px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center">
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
