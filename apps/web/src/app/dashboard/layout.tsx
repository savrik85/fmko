import { BottomNav } from "@/components/dashboard/bottom-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden sm:fixed sm:block sm:left-0 sm:top-0 sm:bottom-0 sm:w-56 sm:bg-pitch-600 sm:text-white sm:p-4">
        <div className="font-heading text-xl font-bold mb-8 mt-2">Okresní Mašina</div>
        <nav className="space-y-1">
          <SidebarLink href="/dashboard" label="Domů" icon={"\u{1F3DF}"} />
          <SidebarLink href="/dashboard/squad" label="Kádr" icon={"\u{1F465}"} />
          <SidebarLink href="/dashboard/match" label="Zápas" icon={"\u26BD"} />
          <SidebarLink href="/dashboard/table" label="Tabulka" icon={"\u{1F4CA}"} />
          <SidebarLink href="/dashboard/training" label="Tréninky" icon={"\u{1F3CB}"} />
          <SidebarLink href="/dashboard/budget" label="Rozpočet" icon={"\u{1F4B0}"} />
          <SidebarLink href="/dashboard/youth" label="Mládež" icon={"\u{1F476}"} />
        </nav>
      </aside>

      {/* Main content */}
      <main className="sm:ml-56">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  );
}

function SidebarLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm"
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </a>
  );
}
