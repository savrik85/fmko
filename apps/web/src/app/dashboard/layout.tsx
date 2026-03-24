"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FMSidebar } from "@/components/dashboard/fm-sidebar";
import { FMTopBar } from "@/components/dashboard/fm-topbar";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { apiFetch } from "@/lib/api";

const DETAIL_PREFIXES = ["/dashboard/player/", "/dashboard/team/", "/dashboard/match/"];
const CUSTOM_HEADER_PAGES = ["/dashboard/liga", "/dashboard/schedule"];

const isDev = process.env.NODE_ENV === "development";

interface TickEvent { type: string; description: string }
interface TickResult { date: string; dayOfWeek: number; isTrainingDay: boolean; events: TickEvent[] }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = DETAIL_PREFIXES.some((p) => pathname.startsWith(p) && pathname !== p.slice(0, -1));
  const hasCustomHeader = CUSTOM_HEADER_PAGES.includes(pathname);

  const [advancing, setAdvancing] = useState(false);
  const [lastResult, setLastResult] = useState<TickResult | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  async function advanceDay(days = 1) {
    setAdvancing(true);
    try {
      const res = await apiFetch<{ ok: boolean; daysAdvanced: number; results: TickResult[] }>(
        "/api/game/advance-day",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) },
      );
      if (res.results.length > 0) {
        setLastResult(res.results[res.results.length - 1]);
        setShowPanel(true);
      }
    } catch (e) {
      console.error("Advance day failed:", e);
    }
    setAdvancing(false);
  }

  const DAY_NAMES = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

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
        <div className="fixed bottom-24 sm:bottom-4 right-4 z-50 flex flex-col items-end gap-2">
          {showPanel && lastResult && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-72 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading font-bold text-pitch-600">
                  {DAY_NAMES[lastResult.dayOfWeek]} {lastResult.isTrainingDay ? "(trénink)" : "(volno)"}
                </span>
                <button onClick={() => setShowPanel(false)} className="text-muted hover:text-ink">x</button>
              </div>
              <div className="space-y-1">
                {lastResult.events.map((ev, i) => (
                  <div key={i} className="text-xs text-muted">
                    <span className="font-bold text-ink">{ev.type}:</span> {ev.description}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={() => advanceDay(1)}
              disabled={advancing}
              className="bg-pitch-600 hover:bg-pitch-700 text-white font-heading font-bold text-sm px-4 py-2 rounded-xl shadow-lg transition-colors disabled:opacity-50"
            >
              {advancing ? "..." : "+1 den"}
            </button>
            <button
              onClick={() => advanceDay(7)}
              disabled={advancing}
              className="bg-pitch-600/80 hover:bg-pitch-700 text-white font-heading font-bold text-sm px-3 py-2 rounded-xl shadow-lg transition-colors disabled:opacity-50"
            >
              +7
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
