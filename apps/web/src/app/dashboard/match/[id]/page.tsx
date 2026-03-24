"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface MatchEvent {
  minute: number;
  type: string;
  playerId: number;
  playerName: string;
  teamId: number;
  description: string;
  detail?: string;
}

interface MatchDetail {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
  home_color: string;
  away_color: string;
  home_secondary: string;
  away_secondary: string;
  home_badge: string;
  away_badge: string;
  home_score: number;
  away_score: number;
  status: string;
  round: number | null;
  events: MatchEvent[];
  commentary: string[];
  simulated_at: string | null;
}

const EVENT_ICONS: Record<string, string> = {
  goal: "\u26BD",
  chance: "\u{1F3AF}",
  card: "\u{1F7E8}",
  foul: "\u{1F6D1}",
  injury: "\u{1F915}",
  substitution: "\u{1F504}",
  special: "\u2B50",
};

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCommentary, setShowCommentary] = useState(false);

  useEffect(() => {
    apiFetch<MatchDetail>(`/api/matches/${matchId}`)
      .then((m) => { setMatch(m); setLoading(false); })
      .catch(() => setLoading(false));
  }, [matchId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  if (!match) return <div className="page-container">Zápas nenalezen.</div>;

  const goals = match.events.filter((e) => e.type === "goal");
  const cards = match.events.filter((e) => e.type === "card");
  const homeGoals = goals.filter((e) => e.teamId === 1);
  const awayGoals = goals.filter((e) => e.teamId === 2);

  return (
    <div className="page-container space-y-5">

      {/* ═══ Back button ═══ */}
      <div className="flex items-center">
        <button onClick={() => router.back()} className="text-muted hover:text-ink text-sm flex items-center gap-1 transition-colors">
          &#8592; Zpět
        </button>
      </div>

      {/* ═══ Score display ═══ */}
      <div>
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 text-right">
            <BadgePreview
              primary={match.home_color || "#2D5F2D"}
              secondary={match.home_secondary || "#FFF"}
              pattern={(match.home_badge as BadgePattern) || "shield"}
              initials={match.home_name?.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() ?? "H"}
              size={40}
            />
            <div className="font-heading font-bold text-sm mt-2">{match.home_name ?? "Domácí"}</div>
          </div>
          <div className="shrink-0 text-center">
            <div className="font-heading font-[800] text-5xl tabular-nums leading-none text-ink">
              {match.home_score} : {match.away_score}
            </div>
            {match.simulated_at && (
              <div className="text-muted text-xs mt-2">
                {new Date(match.simulated_at).toLocaleDateString("cs", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            )}
          </div>
          <div className="flex-1">
            <BadgePreview
              primary={match.away_color || "#2D5F2D"}
              secondary={match.away_secondary || "#FFF"}
              pattern={(match.away_badge as BadgePattern) || "shield"}
              initials={match.away_name?.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() ?? "H"}
              size={40}
            />
            <div className="font-heading font-bold text-sm mt-2">{match.away_name ?? "Hosté"}</div>
          </div>
        </div>
      </div>

      {/* Goals */}
      {goals.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Goly</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              {homeGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted tabular-nums text-xs">{g.minute}&apos;</span>
                  <span className="font-medium">{g.playerName}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted tabular-nums text-xs">{g.minute}&apos;</span>
                  <span className="font-medium">{g.playerName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Key events timeline */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Prubeh zapasu</SectionLabel>
        <div className="space-y-2">
          {match.events
            .filter((e) => e.type === "goal" || e.type === "card" || e.type === "injury" || e.type === "substitution")
            .map((e, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-b-0">
              <span className="shrink-0 text-muted tabular-nums text-sm w-8 text-right">{e.minute}&apos;</span>
              <span className="shrink-0 text-base">{EVENT_ICONS[e.type] ?? ""}</span>
              <div className="min-w-0">
                <span className="text-sm font-medium">{e.playerName}</span>
                <span className="text-sm text-muted ml-1.5">{e.description}</span>
              </div>
            </div>
          ))}
          {match.events.filter((e) => ["goal", "card", "injury", "substitution"].includes(e.type)).length === 0 && (
            <p className="text-sm text-muted">Zadne klicove udalosti.</p>
          )}
        </div>
      </div>

      {/* Commentary toggle */}
      {match.commentary.length > 0 && (
        <div className="card p-4 sm:p-5">
          <button
            onClick={() => setShowCommentary(!showCommentary)}
            className="flex items-center justify-between w-full"
          >
            <SectionLabel>Komentar ({match.commentary.length})</SectionLabel>
            <span className="text-sm text-muted">{showCommentary ? "Skryt" : "Zobrazit"}</span>
          </button>
          {showCommentary && (
            <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
              {match.commentary.map((line, i) => (
                <p key={i} className="text-sm text-ink-light leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
