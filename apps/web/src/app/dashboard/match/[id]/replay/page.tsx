"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface MatchEvent {
  minute: number;
  type: string;
  playerId: number;
  playerName: string;
  teamId: number;
  description: string;
  detail?: string;
}

interface MatchData {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  round: number | null;
  events: MatchEvent[];
  commentary: string[];
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
}

type Speed = "live" | "fast" | "instant";

const SPEED_DELAYS: Record<Speed, number> = { live: 2500, fast: 400, instant: 0 };
const SPEED_LABELS: Record<Speed, string> = { live: "Živě", fast: "Rychle", instant: "Hned" };

const EVENT_ICONS: Record<string, string> = {
  goal: "⚽", chance: "💨", foul: "💥", card: "🟨",
  injury: "🤕", substitution: "🔄", special: "💬",
};

export default function MatchReplayPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const matchId = params.id as string;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleIdx, setVisibleIdx] = useState(0);
  const [speed, setSpeed] = useState<Speed>("live");
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<Record<string, unknown>>(`/api/matches/${matchId}`).then((raw) => {
      const events = typeof raw.events === "string" ? JSON.parse(raw.events as string) : (raw.events ?? []);
      const commentary = typeof raw.commentary === "string" ? JSON.parse(raw.commentary as string) : (raw.commentary ?? []);
      setMatch({
        id: raw.id as string,
        home_team_id: raw.home_team_id as string,
        away_team_id: raw.away_team_id as string,
        home_score: raw.home_score as number,
        away_score: raw.away_score as number,
        round: raw.round as number | null,
        events: events as MatchEvent[],
        commentary: commentary as string[],
        homeName: raw.home_name as string ?? "Domácí",
        awayName: raw.away_name as string ?? "Hosté",
        homeColor: raw.home_color as string ?? "#2D5F2D",
        awayColor: raw.away_color as string ?? "#1A1A1A",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [matchId]);

  // Auto-advance events
  useEffect(() => {
    if (!match || finished) return;
    if (visibleIdx >= match.events.length) {
      setFinished(true);
      setHomeScore(match.home_score);
      setAwayScore(match.away_score);
      // Mark as seen
      if (teamId) {
        apiFetch(`/api/matches/${matchId}/mark-seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        }).catch(() => {});
      }
      return;
    }

    if (speed === "instant") {
      // Show all at once
      let hs = 0, as_ = 0;
      for (const e of match.events) {
        if (e.type === "goal") {
          if (e.teamId === 1) hs++; else as_++;
        }
      }
      setHomeScore(hs);
      setAwayScore(as_);
      setVisibleIdx(match.events.length);
      setFinished(true);
      if (teamId) {
        apiFetch(`/api/matches/${matchId}/mark-seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        }).catch(() => {});
      }
      return;
    }

    const timer = setTimeout(() => {
      const event = match.events[visibleIdx];
      if (event.type === "goal") {
        if (event.teamId === 1) setHomeScore((s) => s + 1);
        else setAwayScore((s) => s + 1);
      }
      setVisibleIdx((i) => i + 1);
    }, SPEED_DELAYS[speed]);

    return () => clearTimeout(timer);
  }, [match, visibleIdx, speed, finished, matchId, teamId]);

  // Scroll to latest
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [visibleIdx]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!match || match.events.length === 0) {
    return (
      <div className="page-container text-center py-20">
        <p className="text-muted text-lg mb-4">Zápas nemá záznam průběhu.</p>
        <button onClick={() => router.push(`/dashboard/match/${matchId}`)} className="btn btn-primary">Zobrazit výsledek</button>
      </div>
    );
  }

  const currentMinute = visibleIdx > 0 ? match.events[Math.min(visibleIdx - 1, match.events.length - 1)].minute : 0;
  const visibleEvents = match.events.slice(0, visibleIdx);

  return (
    <div className="page-container space-y-4 max-w-3xl mx-auto">
      {/* Scoreboard */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="font-heading font-bold text-lg">{match.homeName}</div>
            <div className="text-xs text-muted">Domácí</div>
          </div>
          <div className="text-center px-6">
            <div className="font-heading font-[800] text-5xl tabular-nums leading-none">
              {homeScore} : {awayScore}
            </div>
            <div className="text-sm text-muted mt-2 font-heading">
              {finished ? "Konec" : `${currentMinute}'`}
            </div>
          </div>
          <div className="text-center flex-1">
            <div className="font-heading font-bold text-lg">{match.awayName}</div>
            <div className="text-xs text-muted">Hosté</div>
          </div>
        </div>
        {match.round && <div className="text-center text-xs text-muted mt-2">{match.round}. kolo</div>}
      </div>

      {/* Speed controls */}
      {!finished && (
        <div className="flex justify-center gap-2">
          {(["live", "fast", "instant"] as Speed[]).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
                speed === s ? "bg-pitch-600 text-white" : "bg-surface text-muted hover:text-ink"
              }`}
            >
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Commentary feed */}
      <div ref={feedRef} className="card p-4 h-[400px] overflow-y-auto space-y-2">
        {visibleEvents.map((event, i) => {
          const isGoal = event.type === "goal";
          const commentaryLine = match.commentary[i] ?? event.description;
          return (
            <div
              key={i}
              className={`flex gap-3 items-start p-2 rounded-lg transition-all ${
                isGoal ? "bg-pitch-500/10 border border-pitch-500/20" : ""
              }`}
            >
              <span className="text-lg shrink-0">{EVENT_ICONS[event.type] ?? "📋"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted font-heading font-bold">{event.minute}'</span>
                <p className={`text-sm ${isGoal ? "font-bold text-pitch-600" : ""}`}>{commentaryLine}</p>
              </div>
            </div>
          );
        })}
        {!finished && visibleIdx > 0 && (
          <div className="flex items-center gap-2 text-muted text-sm p-2">
            <div className="spinner spinner-sm" /> {currentMinute}' hraje se...
          </div>
        )}
      </div>

      {/* Post-match actions */}
      {finished && (
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push(`/dashboard/match/${matchId}`)}
            className="btn btn-primary"
          >
            Detail zápasu
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="btn bg-surface text-muted hover:text-ink"
          >
            Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
