"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { SectionLabel, Spinner, BadgePreview, type BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

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
  coach_led_visit: "🧑‍🏫",
  coach_led_one: "🧑‍🏫",
};

function effectColor(ef: PubEffect): string {
  if (ef.type === "injury" || ef.type === "hangover") return "text-card-red";
  if (ef.delta != null && ef.delta < 0) return "text-card-red";
  if (ef.delta != null && ef.delta > 0) return "text-pitch-500";
  return "text-muted";
}

export default function HospodaPage() {
  const { teamId } = useTeam();
  const [sessions, setSessions] = useState<PubSession[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [avatarsById, setAvatarsById] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<{ sessions: PubSession[] }>(`/api/teams/${teamId}/pub-sessions?limit=30`).catch((e) => { console.error("pub-sessions fetch:", e); return { sessions: [] as PubSession[] }; }),
      apiFetch<Team>(`/api/teams/${teamId}`).catch((e) => { console.error("team fetch:", e); return null; }),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`).catch((e) => { console.error("players fetch:", e); return [] as Player[]; }),
    ]).then(([s, t, players]) => {
      setSessions(s.sessions);
      setTeam(t);
      const map: Record<string, Record<string, unknown>> = {};
      for (const p of players) map[p.id] = p.avatar as Record<string, unknown>;
      setAvatarsById(map);
      setLoading(false);
    });
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
    .slice(0, 3);

  const scarfPrimary = team?.badge_primary_color || team?.primary_color || "#2D5F2D";
  const scarfSecondary = team?.badge_secondary_color || team?.secondary_color || "#FFF";
  const badgeInit = team?.badge_initials || (team?.name ?? "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Klubová šála */}
            <div className="relative w-32 h-14 shrink-0">
              <div className="absolute inset-0 rounded-full overflow-hidden ring-1 ring-black/10 shadow-sm flex flex-col">
                <div className="flex-1" style={{ background: scarfPrimary }} />
                <div className="flex-1" style={{ background: scarfSecondary }} />
                <div className="flex-1" style={{ background: scarfPrimary }} />
              </div>
              <div className="absolute -left-1.5 top-1.5 bottom-1.5 flex flex-col gap-[1px]">
                {[scarfPrimary, scarfSecondary, scarfPrimary].map((c, i) => (
                  <div key={i} className="w-1.5 flex-1 rounded-l" style={{ background: c }} />
                ))}
              </div>
              <div className="absolute -right-1.5 top-1.5 bottom-1.5 flex flex-col gap-[1px]">
                {[scarfSecondary, scarfPrimary, scarfSecondary].map((c, i) => (
                  <div key={i} className="w-1.5 flex-1 rounded-r" style={{ background: c }} />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <BadgePreview
                  primary={scarfPrimary}
                  secondary={scarfSecondary}
                  pattern={(team?.badge_pattern as BadgePattern) || "shield"}
                  initials={badgeInit}
                  symbol={team?.badge_symbol}
                  size={44}
                />
              </div>
            </div>
            <div>
              <h1 className="font-heading font-[800] text-2xl leading-none">U nás v hospodě</h1>
              <p className="text-sm text-muted mt-1">Kdo tam byl, co se dělo, co to stálo.</p>
            </div>
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

      {/* Síň slávy štamgastů */}
      {topDrinkers.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Síň slávy štamgastů</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
            {topDrinkers.map((d, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              const ringColor = i === 0 ? "ring-amber-400" : i === 1 ? "ring-gray-300" : "ring-orange-400";
              const avatar = avatarsById[d.id];
              return (
                <Link key={d.id} href={`/dashboard/player/${d.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-pitch-50/50 transition-colors group">
                  <div className={`relative shrink-0 rounded-full ring-2 ${ringColor} overflow-hidden bg-white`} style={{ width: 56, height: 56 }}>
                    {avatar ? <FaceAvatar faceConfig={avatar} size={56} /> : <div className="w-full h-full flex items-center justify-center text-xs text-muted">?</div>}
                    <span className="absolute -bottom-0.5 -right-0.5 text-lg">{medal}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-sm group-hover:text-pitch-500 truncate">{d.name}</div>
                    <div className="text-xs text-muted">{d.count}× {d.count === 1 ? "večer" : d.count < 5 ? "večery" : "večerů"} u Pralesa</div>
                  </div>
                </Link>
              );
            })}
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
                  <div className="mb-3">
                    <div className="text-[11px] uppercase text-muted font-heading mb-1.5">V hospodě</div>
                    <div className="flex flex-wrap gap-2">
                      {s.attendees.map((a) => {
                        const avatar = avatarsById[a.playerId];
                        return (
                          <Link
                            key={a.playerId}
                            href={a.isVisitor ? "#" : `/dashboard/player/${a.playerId}`}
                            className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs ${a.isVisitor ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-gray-50 hover:bg-pitch-50 text-ink"}`}
                          >
                            <div className="shrink-0 rounded-full overflow-hidden bg-white" style={{ width: 24, height: 24 }}>
                              {avatar ? <FaceAvatar faceConfig={avatar} size={24} /> : null}
                            </div>
                            <span className="font-heading font-bold whitespace-nowrap">
                              {a.firstName} {a.lastName}
                            </span>
                            {a.isVisitor && <span className="text-[9px] text-amber-700">({a.fromTeamName})</span>}
                          </Link>
                        );
                      })}
                    </div>
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
                            <div className="ml-7 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                              {inc.effects.map((ef, ei) => (
                                <span key={ei} className={effectColor(ef)}>
                                  <span className="text-muted">{playerNameById(ef.playerId)}:</span> <span className="font-heading font-bold">{ef.label}</span>
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
