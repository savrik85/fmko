"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";

export function BottomNav() {
  const pathname = usePathname();
  const { teamId } = useTeam();

  const items = [
    { href: "/dashboard", label: "Domů", icon: "\u{1F3DF}" },
    { href: teamId ? `/dashboard/team/${teamId}` : "/dashboard/squad", label: "Kádr", icon: "\u{1F465}" },
    { href: "/dashboard/match", label: "Zápas", icon: "\u26BD" },
    { href: "/dashboard/liga", label: "Liga", icon: "\u{1F3C6}" },
    { href: "/dashboard/more", label: "Více", icon: "\u2699" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden pb-safe" style={{ background: "#1e2d1e" }}>
      <div className="flex justify-around items-center h-16 px-2">
        {items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
            (item.label === "Kádr" && (pathname.startsWith("/dashboard/team") || pathname.startsWith("/dashboard/squad")));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] ${
                isActive
                  ? "text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
