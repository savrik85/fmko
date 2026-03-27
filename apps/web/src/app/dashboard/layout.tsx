"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { useTeam } from "@/context/team-context";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teamId, isAdmin } = useTeam();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);
  const [advancing, setAdvancing] = useState(false);
  // Check for unseen match — redirect to match-day screen (skip on replay pages)
  useEffect(() => {
    if (!teamId) return;
    if (pathname.includes("/replay")) return; // don't redirect away from replay
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    fetch(`${API}/api/teams/${teamId}/unseen-match`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.matchId) {
          window.location.replace(`/match-day/${data.matchId}`);
        }
      })
      .catch(() => {});
  }, [teamId, pathname]);

  async function advanceDay() {
    if (advancing) return;
    setAdvancing(true);
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
    await fetch(`${API}/api/game/advance-day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex bg-paper">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-0">
        <FMTopBar />
        {!isDetailPage && !hasCustomHeader && <PageHeader />}
        <main className="flex-1">{children}</main>
      </div>

      <BottomNav />

      {isAdmin && (
        <button
          onClick={advanceDay}
          disabled={advancing}
          className="fixed bottom-24 sm:bottom-4 right-4 z-50 bg-pitch-600 hover:bg-pitch-700 text-white font-heading font-bold text-sm px-4 py-2 rounded-xl shadow-lg transition-colors disabled:opacity-50"
        >
          {advancing ? "..." : "+1 den"}
        </button>
      )}
    </div>
  );
}
