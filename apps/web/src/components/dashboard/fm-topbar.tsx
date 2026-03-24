"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Domů",
  "/dashboard/squad": "Kádr",
  "/dashboard/match": "Zápas",
  "/dashboard/training": "Tréninky",
  "/dashboard/transfers": "Přestupy",
  "/dashboard/finances": "Finance",
  "/dashboard/sponsors": "Sponzoři",
  "/dashboard/equipment": "Vybavení",
  "/dashboard/stadium": "Stadion",
  "/dashboard/events": "Události",
  "/dashboard/news": "Zpravodaj",
  "/dashboard/phone": "Zprávy",
  "/dashboard/liga": "Liga",
  "/dashboard/schedule": "Rozpis zápasů",
  "/dashboard/calendar": "Kalendář",
};

export function FMTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { teamName, season, seasonDay, seasonTotal } = useTeam();

  let title = PAGE_TITLES[pathname] ?? "";
  if (!title) {
    if (pathname.startsWith("/dashboard/player/")) title = "Profil hráče";
    else if (pathname.startsWith("/dashboard/team/")) title = "Profil týmu";
    else if (pathname.startsWith("/dashboard/match/")) title = "Výsledek zápasu";
    else if (pathname.startsWith("/dashboard/phone/")) title = "Konverzace";
  }

  return (
    <header
      className="h-14 flex items-center px-5 gap-4 shrink-0"
      style={{ background: "#1e2d1e" }}
    >
      {/* Back / Forward */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Zpět"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          onClick={() => { try { window.history.forward(); } catch {} }}
          className="w-8 h-8 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Vpřed"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-white/10" />

      {/* Page title */}
      <div className="flex-1 min-w-0 flex items-baseline gap-3">
        <span className="text-white font-heading font-bold text-lg sm:text-xl truncate">{title}</span>
        {teamName && (
          <span className="text-white/30 text-sm font-heading truncate hidden sm:inline">{teamName}</span>
        )}
      </div>

      {/* Season + day */}
      {season != null && (
        <div className="text-right shrink-0 bg-white/5 rounded-lg px-4 py-1.5">
          <div className="text-white font-heading font-bold text-sm">Sezóna {season}</div>
          {seasonDay != null && seasonTotal != null && (
            <div className="text-white/50 text-sm font-heading">Den {seasonDay}/{seasonTotal}</div>
          )}
        </div>
      )}

    </header>
  );
}
