"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule"];

const isDev = process.env.NODE_ENV === "development";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);
  const [advancing, setAdvancing] = useState(false);

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

      {isDev && (
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
