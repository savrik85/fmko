"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PageHeader, useConfirm } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface ScheduleMatch {
  id: string;
  calendarId: string | null;
  round: number | null;
  status: string;
  homeTeamId: string;
  homeName: string;
  homeColor: string;
  homeSecondary: string;
  homeBadge: string;
  homeScore: number | null;
  awayTeamId: string;
  awayName: string;
  awayColor: string;
  awaySecondary: string;
  awayBadge: string;
  awayScore: number | null;
  scheduledAt: string | null;
  gameWeek: number | null;
  isHome: boolean;
  simulatedAt: string | null;
  promoted?: boolean;
  promotionCost?: number | null;
  promotionBoost?: number | null;
}

interface LeagueRound {
  round: number;
  scheduledAt: string | null;
  matches: Array<{
    id: string;
    status: string;
    homeTeamId: string;
    homeName: string;
    homeColor: string;
    homeSecondary: string;
    homeBadge: string;
    homeScore: number | null;
    awayTeamId: string;
    awayName: string;
    awayColor: string;
    awaySecondary: string;
    awayBadge: string;
    awayScore: number | null;
  }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

function matchResult(m: ScheduleMatch): { label: string; color: string } {
  if (m.status !== "simulated" || m.homeScore == null || m.awayScore == null) {
    return { label: "Naplánováno", color: "text-muted" };
  }
  const myScore = m.isHome ? m.homeScore : m.awayScore;
  const theirScore = m.isHome ? m.awayScore : m.homeScore;
  if (myScore > theirScore) return { label: "V", color: "bg-pitch-400 text-white" };
  if (myScore < theirScore) return { label: "P", color: "bg-card-red text-white" };
  return { label: "R", color: "bg-gold-500 text-white" };
}

type Tab = "my" | "league";

export default function SchedulePage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useState<Tab>("my");
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [promotionPrice, setPromotionPrice] = useState<number | null>(null);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueLoaded, setLeagueLoaded] = useState(false);
  const [acting, setActing] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const loadSchedule = async () => {
    if (!teamId) return;
    const data = await apiFetch<{ leagueName: string; season: number; matches: ScheduleMatch[]; promotionPrice?: number }>(`/api/teams/${teamId}/schedule`);
    setLeagueName(data.season ? `${data.leagueName} — Sezóna ${data.season}` : data.leagueName);
    setMatches(data.matches);
    setPromotionPrice(data.promotionPrice ?? null);
  };

  // Load my schedule
  useEffect(() => {
    if (!teamId) return;
    loadSchedule()
      .then(() => setLoading(false))
      .catch((e) => { console.error("load schedule:", e); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const promoteMatch = async (m: ScheduleMatch) => {
    if (!teamId || acting) return;
    const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";
    const ok = await confirm({
      title: `Propagovat zápas proti ${m.isHome ? m.awayName : m.homeName}?`,
      description: "Vyjde článek ve Zpravodaji a přijde více diváků (+25 %).",
      details: [{ label: "Cena", value: `-${priceStr}`, color: "text-card-red" }],
      confirmLabel: promotionPrice != null ? `Propagovat za ${priceStr}` : "Propagovat",
    });
    if (!ok) return;
    setActing(true);
    const res = await apiFetch<{ ok?: boolean; cost?: number; error?: string }>(
      `/api/teams/${teamId}/matches/${m.id}/promote`,
      { method: "POST" },
    ).catch((e) => { console.error("promote match:", e); return { error: "Chyba při propagaci" }; });
    setActing(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    await loadSchedule();
  };

  // Lazy-load league schedule on tab switch
  useEffect(() => {
    if (tab !== "league" || leagueLoaded || !teamId) return;
    setLeagueLoading(true);
    apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule`)
      .then((data) => {
        setRounds(data.rounds);
        setLeagueLoaded(true);
        setLeagueLoading(false);
      })
      .catch(() => setLeagueLoading(false));
  }, [tab, teamId, leagueLoaded]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const played = matches.filter((m) => m.status === "simulated");
  const upcoming = matches.filter((m) => m.status !== "simulated");
  const upcomingIds = new Set(upcoming.map((m) => m.id));

  const nextHome = upcoming.find((m) => m.isHome);

  return (
    <>
      {confirmDialog}
      <PageHeader name={leagueName || "Rozpis zápasů"} detail={`${played.length} odehráno · ${upcoming.length} zbývá`}>{null}</PageHeader>
    <div className="page-container space-y-5">

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {([["my", "Můj tým"], ["league", "Celá liga"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* My team schedule */}
      {tab === "my" && (
        <>
          {/* Promo banner — nejbližší domácí zápas */}
          {nextHome && (
            <div className="card px-3 py-2.5 sm:p-5 bg-gradient-to-r from-gold-50 to-pitch-50 border border-gold-200">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="text-xl sm:text-3xl shrink-0">📢</div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm sm:text-base leading-tight">
                    {nextHome.promoted ? "Zápas je propagovaný" : "Propagace dalšího zápasu"}
                  </div>
                  <div className="text-xs sm:text-sm text-muted mt-0.5 leading-tight">
                    vs {nextHome.awayName} · {formatDate(nextHome.scheduledAt)}
                    {nextHome.promoted && nextHome.promotionCost
                      ? <span className="hidden sm:inline"> — zaplaceno {nextHome.promotionCost.toLocaleString("cs")} Kč</span>
                      : null}
                  </div>
                </div>
                {!nextHome.promoted ? (
                  <button
                    onClick={() => promoteMatch(nextHome)}
                    disabled={acting}
                    className="shrink-0 py-1.5 px-3 sm:py-2 sm:px-4 rounded-lg text-xs sm:text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-50 transition-colors"
                  >
                    {acting ? "..." : "Propagovat"}
                  </button>
                ) : (
                  <span className="shrink-0 py-1.5 px-3 text-xs font-heading font-bold text-gold-700">
                    ✓
                  </span>
                )}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mb-6">
              <SectionLabel>Nadcházející</SectionLabel>
              <div className="flex flex-col gap-3">
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} myTeamId={teamId!} canEditLineup={upcomingIds.has(m.id)} />
                ))}
              </div>
            </div>
          )}

          {played.length > 0 && (
            <div>
              <SectionLabel>Odehrané</SectionLabel>
              <div className="flex flex-col gap-3">
                {played.map((m) => (
                  <MatchRow key={m.id} match={m} myTeamId={teamId!} canEditLineup={false} />
                ))}
              </div>
            </div>
          )}

          {matches.length === 0 && (
            <div className="card p-8 text-center text-muted">
              <p className="text-lg mb-2">Zatím žádné zápasy</p>
              <p className="text-base">Odehraj první zápas!</p>
            </div>
          )}
        </>
      )}

      {/* League schedule */}
      {tab === "league" && (
        <>
          {leagueLoading && (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          )}
          {!leagueLoading && rounds.length === 0 && (
            <div className="card p-8 text-center text-muted">
              <p className="text-lg">Rozpis ligy není dostupný</p>
            </div>
          )}
          {!leagueLoading && rounds.map((round) => (
            <div key={round.round} className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-heading font-bold text-base text-pitch-600">{round.round}. kolo</span>
                {round.scheduledAt && (
                  <span className="text-sm text-muted">{formatDate(round.scheduledAt)} {formatTime(round.scheduledAt)}</span>
                )}
              </div>
              <div className="space-y-1.5">
                {round.matches.map((m) => (
                  <LeagueMatchRow key={m.id} match={m} myTeamId={teamId!} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
    </>
  );
}

function MatchRow({ match: m, myTeamId, canEditLineup }: { match: ScheduleMatch; myTeamId: string; canEditLineup: boolean }) {
  const result = matchResult(m);
  const isPlayed = m.status === "simulated";

  // Opponent info for mobile layout
  const opp = m.isHome
    ? { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge }
    : { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge };
  const oppInitials = opp.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const isClickable = isPlayed || canEditLineup;
  const linkLabel = isPlayed ? "Přehled" : canEditLineup ? "Sestava" : null;
  const inner = (
    <div className={`card px-3 py-3 md:px-4 shadow-lg ${isClickable ? "hover:bg-gray-50 transition-colors" : ""}`}>
      {/* Mobile layout */}
      <div className="flex md:hidden items-center gap-2">
        <div className="shrink-0 w-6 text-center text-xs text-muted font-heading">
          {m.round ? `${m.round}.` : ""}
        </div>
        <BadgePreview primary={opp.color} secondary={opp.secondary} pattern={opp.badge as BadgePattern}
          initials={oppInitials} size={22} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-heading font-bold truncate">{opp.name}</div>
          <div className="text-[11px] text-muted font-heading">{m.isHome ? "doma" : "venku"}</div>
        </div>
        {isPlayed ? (
          <>
            <div className="shrink-0 font-heading font-[800] text-base tabular-nums">{m.homeScore}:{m.awayScore}</div>
            <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${result.color}`}>
              {result.label}
            </span>
          </>
        ) : (
          <div className="shrink-0 text-right">
            <div className="text-xs font-heading font-bold tabular-nums">{formatDate(m.scheduledAt)}</div>
            <div className="text-[11px] text-muted font-heading tabular-nums">{formatTime(m.scheduledAt)}</div>
          </div>
        )}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-3">
        <div className="shrink-0 w-8 text-center">
          <div className="text-xs text-muted font-heading">{m.round ? `${m.round}.` : ""}</div>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
          <span className={`text-sm font-heading truncate ${m.homeTeamId === myTeamId ? "font-bold" : ""}`}>
            {m.homeName}
          </span>
          <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern}
            initials={m.homeName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
        </div>

        <div className="shrink-0 w-20 text-center">
          {isPlayed ? (
            <div className="font-heading font-[800] text-lg tabular-nums">{m.homeScore} : {m.awayScore}</div>
          ) : (
            <div>
              <div className="text-xs font-heading font-bold">{formatDate(m.scheduledAt)}</div>
              <div className="text-xs text-muted">{formatTime(m.scheduledAt)}</div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern}
            initials={m.awayName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
          <span className={`text-sm font-heading truncate ${m.awayTeamId === myTeamId ? "font-bold" : ""}`}>
            {m.awayName}
          </span>
        </div>

        <div className="shrink-0 w-7">
          {isPlayed && (
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${result.color}`}>
              {result.label}
            </span>
          )}
        </div>
      </div>

      {/* Link centered at bottom — compact, no divider */}
      {linkLabel && (
        <div className="mt-1 text-center">
          <span className="text-xs font-heading font-bold text-pitch-600">{linkLabel} →</span>
        </div>
      )}
    </div>
  );

  if (isPlayed) return <Link href={`/dashboard/match/${m.id}`}>{inner}</Link>;
  if (canEditLineup) {
    return <Link href={m.calendarId ? `/dashboard/match?calendarId=${m.calendarId}` : "/dashboard/match"}>{inner}</Link>;
  }
  return inner;
}

function LeagueMatchRow({ match: m, myTeamId }: {
  match: LeagueRound["matches"][number];
  myTeamId: string;
}) {
  const isPlayed = m.status === "simulated";
  const isMyMatch = m.homeTeamId === myTeamId || m.awayTeamId === myTeamId;

  const inner = (
    <div className={`card flex items-center gap-3 px-4 py-3 ${isMyMatch ? "ring-1 ring-pitch-400/30 bg-pitch-500/[0.03]" : ""} ${isPlayed ? "hover:bg-gray-50 transition-colors" : ""}`}>
      <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
        <span className={`text-sm font-heading truncate ${m.homeTeamId === myTeamId ? "font-bold text-pitch-600" : ""}`}>
          {m.homeName}
        </span>
        <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern}
          initials={m.homeName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
      </div>

      <div className="shrink-0 w-16 text-center">
        {isPlayed ? (
          <span className="font-heading font-[800] text-lg tabular-nums">{m.homeScore} : {m.awayScore}</span>
        ) : (
          <span className="text-xs text-muted font-heading">vs</span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern}
          initials={m.awayName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()} size={22} />
        <span className={`text-sm font-heading truncate ${m.awayTeamId === myTeamId ? "font-bold text-pitch-600" : ""}`}>
          {m.awayName}
        </span>
      </div>
    </div>
  );

  if (isPlayed) return <Link href={`/dashboard/match/${m.id}`}>{inner}</Link>;
  return inner;
}
