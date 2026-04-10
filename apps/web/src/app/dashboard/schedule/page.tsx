"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PageHeader } from "@/components/ui";
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
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueLoaded, setLeagueLoaded] = useState(false);

  // Load my schedule
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ leagueName: string; season: number; matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`)
      .then((data) => {
        setLeagueName(data.season ? `${data.leagueName} — Sezóna ${data.season}` : data.leagueName);
        setMatches(data.matches);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamId]);

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

  return (
    <>
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
          {upcoming.length > 0 && (
            <div className="mb-6">
              <SectionLabel>Nadcházející</SectionLabel>
              <div className="space-y-2">
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} myTeamId={teamId!} />
                ))}
              </div>
              <div className="mt-4 text-center">
                <Link href="/dashboard/match" className="text-sm font-heading font-bold text-pitch-600 hover:text-pitch-700 transition-colors">
                  Sestava →
                </Link>
              </div>
            </div>
          )}

          {played.length > 0 && (
            <div>
              <SectionLabel>Odehrané</SectionLabel>
              <div className="space-y-2">
                {played.map((m) => (
                  <MatchRow key={m.id} match={m} myTeamId={teamId!} />
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

function MatchRow({ match: m, myTeamId }: { match: ScheduleMatch; myTeamId: string }) {
  const result = matchResult(m);
  const isPlayed = m.status === "simulated";

  // Opponent info for mobile layout
  const opp = m.isHome
    ? { name: m.awayName, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge }
    : { name: m.homeName, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge };
  const oppInitials = opp.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const inner = (
    <div className={`card px-3 py-3 md:px-4 ${isPlayed ? "hover:bg-gray-50 transition-colors" : ""}`}>
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
          <div className="shrink-0 text-xs font-heading font-bold tabular-nums">{formatDate(m.scheduledAt)}</div>
        )}
        {isPlayed && <div className="shrink-0 text-muted text-sm font-heading" aria-hidden="true">→</div>}
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

        {isPlayed && (
          <div className="shrink-0 text-muted text-sm font-heading" aria-hidden="true">→</div>
        )}
      </div>
    </div>
  );

  if (isPlayed) return <Link href={`/dashboard/match/${m.id}`}>{inner}</Link>;
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
