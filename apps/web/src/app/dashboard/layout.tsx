"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { NotificationTitle } from "@/components/dashboard/notification-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { Napoveda } from "@/components/ui/napoveda";
import { AnnouncementDialog } from "@/components/dashboard/announcement-dialog";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/", "/dashboard/pohar/tym/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule", "/dashboard/pohar"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teamId, isAdmin } = useTeam();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);
  // Přehrávání záznamu zápasu — skrýt horní lištu, stav konta by prozrazoval výsledek.
  const isReplay = pathname.includes("/replay");
  // Check for unseen match — redirect to match-day screen (skip on replay pages)
  useEffect(() => {
    if (!teamId) return;
    if (pathname.includes("/replay")) return; // don't redirect away from replay
    apiFetch<{ matchId: string } | null>(`/api/teams/${teamId}/unseen-match`)
      .then((data) => {
        if (data && data.matchId) {
          window.location.replace(`/match-day/${data.matchId}`);
          return;
        }
        // Žádný nezhlédnutý zápas → přehled konce sezóny, jinak uvítání do nové sezóny.
        apiFetch<{ recap: unknown | null }>(`/api/teams/${teamId}/season-recap`)
          .then((r) => {
            if (r && r.recap) { window.location.replace("/season-end"); return; }
            apiFetch<{ seasonNumber: number } | null>(`/api/teams/${teamId}/season-welcome`)
              .then((w) => { if (w) window.location.replace("/nova-sezona"); })
              .catch((e) => console.error("fetch season-welcome:", e));
          })
          .catch((e) => console.error("fetch season-recap:", e));
      })
      .catch((e) => console.error("fetch unseen-match:", e));
  }, [teamId, pathname]);

  return (
    <div className="h-dvh flex bg-paper overflow-hidden">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!isReplay && <FMTopBar />}
        <main className="flex-1 overflow-y-auto pb-20 sm:pb-0">
          {/* Plná hlavička jen na Domů. Na podstránkách nesla pořád dokola název
              týmu a pozici v lize — informaci, kterou hráč zná — a brala 87 px
              z 844px displeje. Kompaktní varianta místo toho říká, kde je. */}
          {!isDetailPage && !hasCustomHeader && <PageHeader compact={pathname !== "/dashboard"} />}
          {children}
        </main>
      </div>

      {/* Vyplní spodní safe-area (home indikátor v PWA) barvou spodní lišty —
          jinak pod lištou prosvítá béžové pozadí a lišta působí odtrženě od kraje.
          Jen mobil (sm:hidden), z-40 (pod lištou z-50). */}
      <div
        aria-hidden
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none"
        style={{ height: "env(safe-area-inset-bottom, 0px)", background: "#1e2d1e" }}
      />
      <BottomNav />
      <Napoveda />
      <NotificationTitle />
      {/* Jednorázové oznámení všem manažerům — při přehrávání zápasu neruší. */}
      {!isReplay && <AnnouncementDialog />}
    </div>
  );
}
