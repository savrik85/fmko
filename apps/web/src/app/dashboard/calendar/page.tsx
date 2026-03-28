"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardBody } from "@/components/ui";

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
}

const TYPE_ICONS: Record<string, string> = {
  match: "\u26BD",
  training: "\u{1F3CB}",
  seasonal: "\u{1F389}",
};

const TYPE_COLORS: Record<string, string> = {
  match: "border-l-pitch-500",
  training: "border-l-gold-500",
  seasonal: "border-l-card-red",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("cs", { weekday: "short", day: "numeric", month: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

function daysUntil(iso: string): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diff <= 0) return "Dnes";
  if (diff === 1) return "Zítra";
  return `Za ${diff} dní`;
}

export default function CalendarPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<SeasonInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<SeasonInfo>(`/api/teams/${teamId}/season-info`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data) return <div className="page-container">Data nenalezena.</div>;

  const progress = Math.round((data.currentDay / data.totalDays) * 100);

  // Group events by date
  const grouped = new Map<string, UpcomingEvent[]>();
  for (const ev of data.upcoming) {
    const key = new Date(ev.date).toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "long" });
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ev);
  }

  return (
    <div className="page-container space-y-5">

      {/* Season progress */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-bold text-lg">Sezóna {data.season}</span>
            <span className="font-heading font-bold text-lg tabular-nums text-pitch-600">Den {data.currentDay}/{data.totalDays}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-pitch-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-muted">
            <span>Podzim</span>
            <span>Zima</span>
            <span>Jaro</span>
            <span>Konec</span>
          </div>
        </CardBody>
      </Card>

      {/* Next match highlight */}
      {(() => {
        const nextMatch = data.upcoming.find((e) => e.type === "match" && e.status === "Naplánováno");
        if (!nextMatch) return null;
        return (
          <div className="card overflow-hidden">
            <div className="bg-pitch-800 px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-heading font-bold text-white/80">Příští zápas</span>
              <span className="text-sm font-heading text-white/50">{daysUntil(nextMatch.date)}</span>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-heading font-bold text-base">{nextMatch.title}</div>
                <div className="text-sm text-muted">{nextMatch.subtitle}</div>
              </div>
              <div className="text-right">
                <div className="font-heading font-bold text-sm">{formatDate(nextMatch.date)}</div>
                <div className="text-sm text-muted">{formatTime(nextMatch.date)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Timeline */}
      <div>
        {data.upcoming.length === 0 ? (
          <Card><CardBody><p className="text-center text-muted py-4">Žádné nadcházející události</p></CardBody></Card>
        ) : (
          <div className="card divide-y divide-gray-50">
            {Array.from(grouped.entries()).map(([dateLabel, events]) => {
              const hasMatch = events.some((e) => e.type === "match");
              return (
                <div key={dateLabel} className={`flex items-center gap-3 px-4 ${hasMatch ? "py-3" : "py-1.5"}`}>
                  {/* Date column */}
                  <div className="w-20 shrink-0">
                    <div className={`font-heading ${hasMatch ? "font-bold text-sm text-ink" : "text-xs text-muted"}`}>
                      {dateLabel.split(" ").slice(0, 2).join(" ")}
                    </div>
                  </div>
                  {/* Events */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {events.map((ev, i) => (
                      ev.type === "match" ? (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-sm">⚽</span>
                          <span className="font-heading font-bold text-sm">{ev.title}</span>
                          <span className="text-xs text-muted">{ev.subtitle}</span>
                          {ev.status && ev.status !== "Naplánováno" && (
                            <span className="text-xs font-heading font-bold text-pitch-500 ml-auto">{ev.status}</span>
                          )}
                        </div>
                      ) : (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted">
                          <span>🏋️</span>
                          <span>{ev.title}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
