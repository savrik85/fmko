"use client";

import { BottomNav } from "@/components/dashboard/bottom-nav";
import { useTeam } from "@/context/team-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, teamName, logout } = useTeam();

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      {/* Desktop sidebar */}
      <aside className="hidden sm:fixed sm:flex sm:flex-col sm:left-0 sm:top-0 sm:bottom-0 sm:w-56 sm:bg-pitch-600 sm:text-white sm:p-4">
        <div className="font-heading text-xl font-bold mb-8 mt-2">Okresní Mašina</div>
        <nav className="space-y-1 flex-1">
          <SidebarLink href="/dashboard" label="Domů" icon={"\u{1F3DF}"} />
          <SidebarLink href="/dashboard/squad" label="Kádr" icon={"\u{1F465}"} />
          <SidebarLink href="/dashboard/match" label="Zápas" icon={"\u26BD"} />
          <SidebarLink href="/dashboard/table" label="Tabulka" icon={"\u{1F4CA}"} />
        </nav>

        {/* User info + logout */}
        <div className="border-t border-white/10 pt-3 mt-3">
          {teamName && <div className="text-xs text-white/50 truncate mb-1">{teamName}</div>}
          {email && <div className="text-xs text-white/40 truncate mb-2">{email}</div>}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors text-sm w-full"
          >
            <span>&#128682;</span>
            <span>Odhlásit se</span>
          </button>
        </div>
      </aside>

      <main className="sm:ml-56">{children}</main>
      <BottomNav />
    </div>
  );
}

function SidebarLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm">
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </a>
  );
}
