"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export function BottomNav() {
  const pathname = usePathname();
  const { teamId } = useTeam();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ id: string; unread_count: number }[]>(`/api/teams/${teamId}/conversations`)
      .then((convs) => {
        const total = convs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
        setUnread(total);
      })
      .catch(() => {});
  }, [teamId, pathname]);

  const items = [
    { href: "/dashboard", label: "Dom\u016F", icon: "\u{1F3E0}" },
    { href: "/dashboard/phone", label: "Zpr\u00E1vy", icon: "\u{1F4F1}", badge: unread },
    { href: "/dashboard/match", label: "Z\u00E1pas", icon: "\u26BD" },
    { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}" },
    { href: "/dashboard/more", label: "V\u00EDce", icon: "\u2699\uFE0F" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 sm:hidden pb-safe">
      <div className="flex justify-around items-center h-16 px-2">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[48px] ${
                isActive
                  ? "text-pitch-500"
                  : "text-muted hover:text-pitch-500"
              }`}
            >
              <span className="text-xl relative">
                {item.icon}
                {"badge" in item && (item as any).badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-card-red text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                    {(item as any).badge > 99 ? "99+" : (item as any).badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
