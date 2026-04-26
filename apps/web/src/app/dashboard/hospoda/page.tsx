"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { SectionLabel, Spinner } from "@/components/ui";

interface PubAttendee {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  fromTeamName?: string;
}

interface PubEffect {
  playerId: string;
  type: string;
  delta?: number;
  injuryDays?: number;
  label: string;
}

interface PubIncident {
  type: string;
  playerIds: string[];
  text: string;
  effects?: PubEffect[];
}

interface PubSession {
  id: number;
  gameDate: string;
  attendees: PubAttendee[];
  incidents: PubIncident[];
  createdAt: string;
}

const INCIDENT_ICON: Record<string, string> = {
  cross_team_fight: "🥊",
  cross_team_brotherhood: "🍻",
  cross_team_provocation: "👊",
  drink_record: "🍺",
  automat_win: "💰",
  story: "📰",
  lone_drinker: "🪑",
  nobody: "🌙",
};

function effectIcon(type: string, delta?: number): string {
  if (type === "injury") return "🩹";
  if (type === "condition") return "💪";
  if (type === "morale") return "😊";
  return delta != null && delta < 0 ? "↓" : "↑";
}

function effectColor(ef: PubEffect): string {
  if (ef.type === "injury") return "text-card-red";
  if (ef.delta != null && ef.delta < 0) return "text-card-red";
  if (ef.delta != null && ef.delta > 0) return "text-pitch-500";
  return "text-muted";
}

export default function HospodaPage() {
  const { teamId } = useTeam();
  const [sessions, setSessions] = useState<PubSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ sessions: PubSession[] }>(`/api/teams/${teamId}/pub-sessions?limit=30`)
      .then((d) => setSessions(d.sessions))
      .catch((e) => console.error("pub-sessions fetch:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[40vh]"><Spinner /></div>;

  // Aggregate stats
  const totalIncidents = sessions.reduce((s, x) => s + x.incidents.length, 0);
  const fights = sessions.flatMap((s) => s.incidents).filter((i) => i.type === "cross_team_fight").length;
  const visits = sessions.flatMap((s) => s.attendees).filter((a) => a.isVisitor).length;
  const drinkRecords = sessions.flatMap((s) => s.incidents).filter((i) => i.type === "drink_record").length;

  // Top pijani — kolikrát byl v hospodě
  const drinkerCounts = new Map<string, { name: string; count: number }>();
  for (const s of sessions) {
    for (const a of s.attendees) {
      if (a.isVisitor) continue;
      const key = a.playerId;
      const cur = drinkerCounts.get(key) ?? { name: `${a.firstName} ${a.lastName}`, count: 0 };
      cur.count++;
      drinkerCounts.set(key, cur);
    }
  }
  const topDrinkers = [...drinkerCounts.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-heading font-[800] text-2xl">🍺 Hospoda U Pralesa</h1>
            <p className="text-sm text-muted mt-1">Kdo tam byl, co se dělo, co to stálo.</p>
          </div>
          <Link href="/dashboard" className="text-sm text-pitch-500 hover:underline font-heading font-bold">← Dashboard</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-3xl tabular-nums text-ink">{sessions.length}</div>
          <div className="text-xs text-muted uppercase">Večerů</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-3xl tabular-nums text-ink">{totalIncidents}</div>
          <div className="text-xs text-muted uppercase">Příhod</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-3xl tabular-nums text-card-red">{fights}</div>
          <div className="text-xs text-muted uppercase">Rvaček</div>
        </div>
        <div className="card p-4 text-center">
          <div className="font-heading font-[800] text-3xl tabular-nums text-amber-600">{visits}</div>
          <div className="text-xs text-muted uppercase">Hostů</div>
        </div>
      </div>

      {/* Top pijani */}
      {topDrinkers.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Štamgasti</SectionLabel>
          <div className="space-y-1.5">
            {topDrinkers.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3">
                <span className="font-heading font-bold tabular-nums text-muted w-6 text-center">{i + 1}.</span>
                <Link href={`/dashboard/player/${d.id}`} className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 flex-1">
                  {d.name}
                </Link>
                <span className="text-sm text-muted">{d.count}× {d.count === 1 ? "večer" : d.count < 5 ? "večery" : "večerů"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions history */}
      {sessions.length === 0 ? (
        <div className="card p-4 sm:p-5">
          <p className="text-sm text-muted">Zatím žádné hospodské večery — počkej na první daily-tick.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const localCount = s.attendees.filter((a) => !a.isVisitor).length;
            const visitorCount = s.attendees.filter((a) => a.isVisitor).length;
            return (
              <div key={s.id} className="card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="font-heading font-bold text-sm">
                    {new Date(s.gameDate).toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" })} večer
                  </div>
                  <div className="text-[11px] text-muted uppercase font-heading">
                    {localCount} {localCount === 1 ? "místní" : localCount < 5 ? "místní" : "místních"}
                    {visitorCount > 0 && <span className="text-amber-600">, {visitorCount} {visitorCount === 1 ? "host" : "hosté"}</span>}
                  </div>
                </div>

                {s.attendees.length > 0 && (
                  <div className="text-sm mb-2">
                    <span className="text-muted">🪑 </span>
                    {s.attendees.map((a, i) => (
                      <span key={a.playerId}>
                        {i > 0 && ", "}
                        <Link href={a.isVisitor ? "#" : `/dashboard/player/${a.playerId}`} className={`${a.isVisitor ? "text-amber-600 font-heading font-bold" : "font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20"}`}>
                          {a.firstName} {a.lastName}
                        </Link>
                        {a.isVisitor && <span className="text-[10px] text-amber-600 ml-1">({a.fromTeamName})</span>}
                      </span>
                    ))}
                  </div>
                )}

                {s.incidents.length > 0 && (
                  <ul className="space-y-2 mt-2">
                    {s.incidents.map((inc, i) => {
                      const playerNameById = (id: string) => {
                        const a = s.attendees.find((x) => x.playerId === id);
                        return a ? `${a.firstName} ${a.lastName}` : "?";
                      };
                      return (
                        <li key={i} className="text-sm">
                          <div className="flex gap-2 items-start">
                            <span className="shrink-0">{INCIDENT_ICON[inc.type] ?? "•"}</span>
                            <span className="text-ink leading-snug">{inc.text}</span>
                          </div>
                          {inc.effects && inc.effects.length > 0 && (
                            <div className="ml-7 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                              {inc.effects.map((ef, ei) => (
                                <span key={ei} className={`text-[11px] font-heading font-bold ${effectColor(ef)}`}>
                                  {effectIcon(ef.type, ef.delta)} {playerNameById(ef.playerId)}: {ef.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
