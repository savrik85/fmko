"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Domů",
  "/dashboard/squad": "Kádr",
  "/dashboard/match": "Sestava",
  "/dashboard/friendly": "Přáteláky",
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
  "/dashboard/settings": "Nastavení",
  "/dashboard/admin": "Administrace",
  "/dashboard/schedule": "Rozpis zápasů",
  "/dashboard/calendar": "Kalendář",
};

export function FMTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { teamName, budget, season, seasonDay, seasonTotal, nextMatch } = useTeam();

  let title = PAGE_TITLES[pathname] ?? "";
  if (!title) {
    if (pathname.startsWith("/dashboard/player/")) title = "Profil hráče";
    else if (pathname.startsWith("/dashboard/team/")) title = "Profil týmu";
    else if (pathname.startsWith("/dashboard/match/")) title = "Výsledek zápasu";
    else if (pathname.startsWith("/dashboard/phone/")) title = "Konverzace";
  }

  return (
    <header
      className="h-14 flex items-center pl-3 pr-4 sm:px-5 gap-3 sm:gap-4 shrink-0"
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
          onClick={() => { try { window.history.forward(); } catch (e) { console.error("history forward:", e); } }}
          className="w-8 h-8 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Vpřed"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div className="w-px h-5 bg-white/10" />

      {/* Page title */}
      <div className="flex-1 min-w-0 flex items-baseline gap-3">
        <span className="text-white font-heading font-bold text-lg sm:text-xl truncate">{title}</span>
        {teamName && (
          <span className="text-white/30 text-sm font-heading truncate hidden sm:inline">{teamName}</span>
        )}
      </div>

      {/* Right side info */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0 text-xs sm:text-sm font-heading overflow-hidden">
        {budget != null && (
          <span className="text-white/60 tabular-nums whitespace-nowrap">{"💰"} {budget.toLocaleString("cs")} {"Kč"}</span>
        )}
        {nextMatch && (
          <span className="text-white/60 whitespace-nowrap truncate">
            {"⚽"} {nextMatch.isFriendly && <span className="text-amber-400 text-xs mr-1 hidden sm:inline">přátelák</span>}
            <span className="text-white font-bold">{nextMatch.opponent}</span>
            {" · "}
            {nextMatch.isFriendly ? (
              <span className="text-amber-400 font-bold hidden sm:inline">sestava!</span>
            ) : nextMatch.daysUntil === 0 ? (
              <span className="text-pitch-400 font-bold">{"dnes!"}</span>
            ) : nextMatch.daysUntil === 1 ? (
              <span className="text-pitch-400">{"zítra"}</span>
            ) : (
              <span>{"za"} {nextMatch.daysUntil} {"dní"}</span>
            )}
          </span>
        )}
        {season != null && (
          <span className="text-white/40 whitespace-nowrap hidden sm:inline">
            {"📅"} {"Sezóna"} {season}{seasonDay != null && seasonTotal != null && seasonTotal > 0 ? ` · den ${seasonDay}/${seasonTotal}` : ""}
          </span>
        )}
      </div>

    </header>
  );
}

function MatchCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Match cron at 18:00 CET (17:00 UTC)
  const today = new Date(now);
  const matchTime = new Date(today);
  matchTime.setHours(18, 0, 0, 0);
  const diff = matchTime.getTime() - now;

  if (diff <= 0) {
    return <span className="text-pitch-400 font-bold">výkop brzy!</span>;
  }

  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  return (
    <span className="text-pitch-400 font-bold tabular-nums">
      výkop za {hours > 0 ? `${hours}h ` : ""}{mins}min
    </span>
  );
}

