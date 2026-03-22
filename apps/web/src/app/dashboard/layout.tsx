"use client";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { useTeam } from "@/context/team-context";
import { Button } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email, teamId, teamName, logout } = useTeam();

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      {/* Desktop sidebar */}
      <aside className="hidden sm:fixed sm:flex sm:flex-col sm:left-0 sm:top-0 sm:bottom-0 sm:w-56 sidebar sm:text-white sm:p-4">
        <div className="text-h2 text-white mb-8 mt-2">Prales</div>
        <nav className="space-y-1 flex-1">
          <a href="/dashboard" className="sidebar-link"><span className="text-lg">{"\u{1F3DF}"}</span><span>Domů</span></a>
          <a href={teamId ? `/dashboard/team/${teamId}` : "/dashboard/squad"} className="sidebar-link"><span className="text-lg">{"\u{1F465}"}</span><span>Kádr</span></a>
          <a href="/dashboard/match" className="sidebar-link"><span className="text-lg">{"\u26BD"}</span><span>Zápas</span></a>
          <a href="/dashboard/table" className="sidebar-link"><span className="text-lg">{"\u{1F4CA}"}</span><span>Tabulka</span></a>
        </nav>

        <div className="border-t border-white/10 pt-3 mt-3">
          {teamName && <div className="text-xs text-white/50 truncate mb-1">{teamName}</div>}
          {email && <div className="text-xs text-white/40 truncate mb-2">{email}</div>}
          <Button variant="ghost" size="sm" onClick={logout} className="w-full text-white/50 hover:text-white">
            {"\u{1F6AA}"} Odhlásit se
          </Button>
        </div>
      </aside>

      <main className="sm:ml-56">{children}</main>
      <BottomNav />
    </div>
  );
}
