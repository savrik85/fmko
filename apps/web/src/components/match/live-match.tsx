"use client";

import { useState, useEffect } from "react";
import { Spinner } from "@/components/ui";

interface MatchEvent {
  minute: number;
  type: string;
  description: string;
  commentary: string;
  isGoal?: boolean;
}

type PlaySpeed = "live" | "fast" | "instant";

interface Props {
  homeTeam: string;
  awayTeam: string;
  events: MatchEvent[];
  onComplete: (homeScore: number, awayScore: number) => void;
}

export function LiveMatch({ homeTeam, awayTeam, events, onComplete }: Props) {
  const [speed, setSpeed] = useState<PlaySpeed>("live");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  const visibleEvents = speed === "instant" ? events : events.slice(0, currentIndex);
  const isComplete = visibleEvents.length === events.length;
  const currentMinute = visibleEvents.length > 0
    ? visibleEvents[visibleEvents.length - 1].minute
    : 0;

  // Count goals
  useEffect(() => {
    let h = 0, a = 0;
    for (const ev of visibleEvents) {
      if (ev.isGoal && ev.description.includes(homeTeam)) h++;
      else if (ev.isGoal) a++;
    }
    setHomeScore(h);
    setAwayScore(a);
  }, [visibleEvents, homeTeam]);

  // Auto-advance events
  useEffect(() => {
    if (speed === "instant" || isComplete) return;
    const delay = speed === "live" ? 2500 : 400;
    const timer = setTimeout(() => {
      setCurrentIndex((c) => c + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [currentIndex, speed, isComplete]);

  const lastEvent = visibleEvents[visibleEvents.length - 1];

  return (
    <div className="flex flex-col h-full">
      {/* Scoreboard */}
      <div className="bg-pitch-600 text-white p-4">
        <div className="flex items-center justify-center gap-4">
          <div className="text-right flex-1">
            <div className="font-heading font-bold text-lg">{homeTeam}</div>
          </div>
          <div className="font-heading font-extrabold text-4xl tabular-nums px-4">
            {homeScore} : {awayScore}
          </div>
          <div className="text-left flex-1">
            <div className="font-heading font-bold text-lg">{awayTeam}</div>
          </div>
        </div>
        <div className="text-center text-white/60 text-sm mt-1">
          {isComplete ? "Konec zápasu" : `${currentMinute}'`}
        </div>
      </div>

      {/* Speed controls */}
      <div className="bg-pitch-500 px-4 py-2 flex justify-center gap-2">
        {(["live", "fast", "instant"] as PlaySpeed[]).map((s) => (
          <button
            key={s}
            onClick={() => { setSpeed(s); if (s === "instant") setCurrentIndex(events.length); }}
            className={`px-3 py-1 rounded-full text-xs font-heading font-bold transition-colors ${
              speed === s ? "bg-white text-pitch-600" : "text-white/70 hover:text-white"
            }`}
          >
            {s === "live" ? "\u{1F40C} Živě" : s === "fast" ? "\u23E9 Rychle" : "\u26A1 Hned"}
          </button>
        ))}
      </div>

      {/* Commentary feed */}
      <div className="flex-1 overflow-y-auto bg-paper">
        <div className="p-4 space-y-3">
          {[...visibleEvents].reverse().map((event, i) => (
            <div
              key={i}
              className={`flex gap-3 items-start ${event.isGoal ? "bg-pitch-500/5 -mx-2 px-2 py-2 rounded-card" : ""}`}
            >
              <div className={`font-heading font-bold text-sm tabular-nums w-8 text-right shrink-0 ${
                event.isGoal ? "text-pitch-500" : "text-muted"
              }`}>
                {event.minute}&apos;
              </div>
              <div className="flex-1">
                <p className={`text-sm ${event.isGoal ? "font-bold text-pitch-600" : ""}`}>
                  {event.commentary}
                </p>
              </div>
            </div>
          ))}

          {!isComplete && (
            <div className="text-center py-4">
              <Spinner size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* Post-match CTA */}
      {isComplete && (
        <div className="p-4 bg-white border-t border-gray-200">
          <button
            onClick={() => onComplete(homeScore, awayScore)}
            className="w-full py-3 rounded-card bg-pitch-500 text-white font-heading font-bold hover:bg-pitch-400 transition-colors"
          >
            Do hospody!
          </button>
        </div>
      )}
    </div>
  );
}
