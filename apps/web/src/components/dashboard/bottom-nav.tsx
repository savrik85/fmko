"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Domů", icon: "\u{1F3DF}" },
  { href: "/dashboard/squad", label: "Kádr", icon: "\u{1F465}" },
  { href: "/dashboard/match", label: "Zápas", icon: "\u26BD" },
  { href: "/dashboard/table", label: "Tabulka", icon: "\u{1F4CA}" },
  { href: "/dashboard/more", label: "Více", icon: "\u2699" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 sm:hidden pb-safe">
      <div className="flex justify-around items-center h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-[56px] ${
                isActive
                  ? "text-pitch-500"
                  : "text-muted hover:text-pitch-500"
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
