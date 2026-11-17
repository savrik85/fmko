"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { NotificationTitle } from "@/components/dashboard/notification-title";
import { PageHeaderProvider } from "@/context/page-header-context";
import { AnnouncementDialog } from "@/components/dashboard/announcement-dialog";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teamId, isAdmin } = useTeam();
  // Přehrávání záznamu zápasu — skrýt horní lištu, stav konta by prozrazoval výsledek.
  const isReplay = pathname.includes("/zaznam");
  // Check for unseen match — redirect to match-day screen (skip on replay pages)
  useEffect(() => {
    if (!teamId) return;
    if (pathname.includes("/zaznam")) return; // don't redirect away from replay
    apiFetch<{ matchId: string } | null>(`/api/teams/${teamId}/unseen-match`)
      .then((data) => {
        if (data && data.matchId) {
          window.location.replace(`/zapasovy-den/${data.matchId}`);
          return;
        }
        // Žádný nezhlédnutý zápas → přehled konce sezóny, jinak uvítání do nové sezóny.
        apiFetch<{ recap: unknown | null }>(`/api/teams/${teamId}/season-recap`)
          .then((r) => {
            if (r && r.recap) { window.location.replace("/konec-sezony"); return; }
            apiFetch<{ seasonNumber: number } | null>(`/api/teams/${teamId}/season-welcome`)
              .then((w) => { if (w) window.location.replace("/nova-sezona"); })
              .catch((e) => console.error("fetch season-welcome:", e));
          })
          .catch((e) => console.error("fetch season-recap:", e));
      })
      .catch((e) => console.error("fetch unseen-match:", e));
  }, [teamId, pathname]);

  // Podklad obalu je barva rámu, ne papír: `.h-dvh` má na mobilu padding-top
  // pro status bar a v tom odsazení prosvítalo béžové pozadí jako světlý pruh
  // nad zelenou lištou. Obsah uvnitř má papír vlastní (bg-paper na <main>).
  return (
    <PageHeaderProvider>
    <div className="app-shell h-dvh flex bg-[var(--color-chrome)] overflow-hidden">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!isReplay && <FMTopBar />}
        {/* Přehrávání zápasu horní lištu skrývá — bez ní by obsah lezl pod
            status bar, protože odsazení nese právě ona. */}
        {isReplay && (
          <div className="shrink-0" style={{ height: "env(safe-area-inset-top, 0px)", background: "var(--color-chrome)" }} />
        )}
{/* no-scrollbar: `main` je scrollovací plocha a klasický posuvník si
            ukrajoval 15 px šířky. Hlavička stránky uvnitř pak končila 15 px
            před pravým okrajem, kdežto horní lišta nad ní šla až ke kraji -
            vypadalo to jako zúžená hlavička se světlým proužkem vpravo.
            Na dotyku je posuvník překryvný, takže se tam nic neztrácí. */}
        <main className="flex-1 overflow-y-auto no-scrollbar pb-20 sm:pb-0 bg-paper">
          {/* Hlavičku stránky (znak, název, pozice v lize) nese horní lišta;
              samostatný pruh pod ní bral na mobilu dalších 42 px. */}
          {children}
        </main>
      </div>

      {/* Vyplní spodní safe-area (home indikátor v PWA) barvou spodní lišty —
          jinak pod lištou prosvítá béžové pozadí a lišta působí odtrženě od kraje.
          Jen mobil (sm:hidden), z-40 (pod lištou z-50). */}
      <div
        aria-hidden
        className="app-bottom-safe-area sm:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none"
        style={{ height: "env(safe-area-inset-bottom, 0px)", background: "var(--color-chrome)" }}
      />
      <BottomNav />
      <NotificationTitle />
      {/* Jednorázové oznámení všem manažerům — při přehrávání zápasu neruší. */}
      {!isReplay && <AnnouncementDialog />}
    </div>
    </PageHeaderProvider>
  );
}
