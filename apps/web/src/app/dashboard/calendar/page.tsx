"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface UpcomingEvent {
  type: "match" | "training" | "seasonal";
  date: string;
  title: string;
  subtitle?: string;
  status?: string;
  isHome?: boolean;
}

interface SeasonInfo {
  season: number;
  currentDay: number;
  totalDays: number;
  upcoming: UpcomingEvent[];
  gameDate: string;
}

const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTH_NAMES = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

export default function CalendarPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<SeasonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState<Date | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<SeasonInfo>(`/api/teams/${teamId}/season-info`)
      .then((d) => {
        setData(d);
        setViewMonth(new Date(d.gameDate || d.upcoming[0]?.date || new Date()));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !viewMonth) return <div className="page-container">Data nenalezena.</div>;

  const progress = Math.round((data.currentDay / data.totalDays) * 100);
  const gameDate = new Date(data.gameDate || new Date());
  const todayKey = `${gameDate.getUTCFullYear()}-${gameDate.getUTCMonth()}-${gameDate.getUTCDate()}`;

  // Index events by date key
  const eventsByDay = new Map<string, UpcomingEvent[]>();
  for (const ev of data.upcoming) {
    const d = new Date(ev.date);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(ev);
  }

  // Build calendar grid for viewMonth
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0, Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  return (
    <div className="page-container space-y-4">

      {/* Season progress — compact */}
      <div className="card px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-heading font-bold">Sezóna {data.season}</span>
          <span className="font-heading font-bold tabular-nums text-pitch-600">Den {data.currentDay}/{data.totalDays}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-pitch-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Month navigation */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-pitch-800">
          <button onClick={prevMonth} className="text-white/60 hover:text-white text-lg font-bold px-2">‹</button>
          <span className="font-heading font-bold text-white text-base capitalize">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="text-white/60 hover:text-white text-lg font-bold px-2">›</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center py-2 text-xs font-heading font-bold text-muted uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: rows * 7 }, (_, i) => {
            const dayNum = i - startOffset + 1;
            const isValid = dayNum >= 1 && dayNum <= lastDay.getDate();
            if (!isValid) return <div key={i} className="min-h-[80px] bg-gray-50/30 border-b border-r border-gray-50" />;

            const dateKey = `${year}-${month}-${dayNum}`;
            const isToday = dateKey === todayKey;
            const events = eventsByDay.get(dateKey) ?? [];
            const match = events.find((e) => e.type === "match");
            const hasTraining = events.some((e) => e.type === "training");
            const dow = (i % 7);
            const isWeekend = dow >= 5;

            return (
              <div key={i} className={`min-h-[80px] border-b border-r border-gray-50 px-1.5 py-1 ${isToday ? "bg-pitch-50 ring-2 ring-inset ring-pitch-400" : isWeekend ? "bg-gray-50/40" : ""}`}>
                {/* Day number */}
                <div className={`text-right text-sm tabular-nums mb-1 ${isToday ? "font-bold text-pitch-600" : "text-muted"}`}>
                  {dayNum}
                </div>
                {/* Events */}
                {match && (
                  <div className={`text-[11px] font-heading font-bold leading-tight px-1.5 py-1 rounded truncate ${
                    match.status && match.status !== "Naplánováno"
                      ? "bg-pitch-100 text-pitch-700"
                      : "bg-pitch-500 text-white"
                  }`}>
                    ⚽ {match.title.replace(/^\d+\. kolo — /, "")}
                    {match.status && match.status !== "Naplánováno" && (
                      <span className="ml-1 font-[800]">{match.status}</span>
                    )}
                  </div>
                )}
                {hasTraining && !match && (() => {
                  const tr = events.find((e) => e.type === "training");
                  return (
                    <div className="text-[11px] font-heading leading-tight px-1.5 py-1 rounded bg-amber-50 text-amber-700 truncate">
                      🏋️ {tr?.title?.replace("Trénink — ", "") ?? "Trénink"}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted px-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-pitch-500" /> Zápas</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-pitch-100" /> Odehráno</span>
        <span className="flex items-center gap-1">🏋️ Trénink</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-1 ring-pitch-400 bg-pitch-50" /> Dnes</span>
      </div>
    </div>
  );
}
