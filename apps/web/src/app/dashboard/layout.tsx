"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { Napoveda } from "@/components/ui/napoveda";
import { useTeam } from "@/context/team-context";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { teamId, isAdmin } = useTeam();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);
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

  return (
    <div className="min-h-screen flex bg-paper overflow-x-hidden">
      <FMSidebar />

      <div className="flex-1 flex flex-col min-w-0 pb-20 sm:pb-0">
        <FMTopBar />
        {!isDetailPage && !hasCustomHeader && <PageHeader />}
        <main className="flex-1">{children}</main>
      </div>

      <BottomNav />
      <Napoveda />
    </div>
  );
}
