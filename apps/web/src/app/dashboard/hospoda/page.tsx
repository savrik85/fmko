"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { SectionLabel, Spinner, type BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { ClubScarf } from "@/components/team/club-scarf";

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
  dailySpecial?: string | null;
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
  cat: "🐈",
  priest: "⛪",
  scout: "🕵️",
  wife_call: "📞",
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

  // Helper: kontrast textu na šále podle světlosti primary barvy
  const isLight = (() => {
    const c = (scarfPrimary || "").replace("#", "");
    if (c.length < 6) return false;
    const r = parseInt(c.slice(0, 2), 16); const g = parseInt(c.slice(2, 4), 16); const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  })();
  const textColor = isLight ? "#222" : "#FFF";

  return (
    <div className="page-container space-y-5">
      {/* Header — klubová šála + nadpis + bar atmosféra (béžová) */}
      <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#F5EDDF" }}>
        <div className="h-1" style={{ background: scarfPrimary }} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-7 px-3 sm:px-6 py-4 sm:py-5">
          {/* Šála: na mobilu full-width 200×60, na desktopu fixed 220×80 */}
          <div className="w-full sm:w-auto">
            <ClubScarf
              primary={scarfPrimary}
              secondary={scarfSecondary}
              pattern={(team?.badge_pattern as BadgePattern) || "shield"}
              initials={badgeInit}
              symbol={team?.badge_symbol}
              className="block sm:hidden h-16 w-full"
            />
            <ClubScarf
              primary={scarfPrimary}
              secondary={scarfSecondary}
              pattern={(team?.badge_pattern as BadgePattern) || "shield"}
              initials={badgeInit}
              symbol={team?.badge_symbol}
              width={460}
              height={110}
              className="hidden sm:block"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading font-[800] text-2xl sm:text-3xl leading-none text-ink">U nás v hospodě</h1>
                <p className="text-sm text-muted mt-1">Kdo tam byl, co se dělo, co to stálo.</p>
              </div>
              <Link href="/dashboard" className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 whitespace-nowrap shrink-0">← Dashboard</Link>
            </div>
          </div>
        </div>
        <div className="h-1" style={{ background: scarfSecondary }} />
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
                  <div className="relative shrink-0">
                    {avatar
                      ? <FaceAvatar faceConfig={avatar} size={64} className={`rounded-full ring-2 ${ringColor} bg-white`} />
                      : <div className={`rounded-full ring-2 ${ringColor} bg-gray-100 flex items-center justify-center font-heading font-bold text-base text-muted`} style={{ width: 64, height: 64 }}>{d.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("")}</div>}
                    <span className="absolute -bottom-1 -right-1 text-xl drop-shadow-sm">{medal}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-sm group-hover:text-pitch-500 truncate">{d.name}</div>
                    <div className="text-xs text-muted">{d.count}× {d.count === 1 ? "večer" : d.count < 5 ? "večery" : "večerů"} v hospodě</div>
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

                {s.dailySpecial && (
                  <div className="mb-3 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 text-[11px] uppercase font-heading tracking-wider text-amber-800 bg-amber-50 border-y border-amber-100">
                    📋 {s.dailySpecial}
                  </div>
                )}

                {s.attendees.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[11px] uppercase text-muted font-heading mb-1.5">V hospodě</div>
                    <div className="flex flex-wrap gap-2">
                      {s.attendees.map((a) => {
                        const avatar = avatarsById[a.playerId];
                        const initials = `${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase();
                        return (
                          <Link
                            key={a.playerId}
                            href={`/dashboard/player/${a.playerId}`}
                            className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs ${a.isVisitor ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" : "bg-gray-50 hover:bg-pitch-50 text-ink"}`}
                          >
                            {avatar
                              ? <FaceAvatar faceConfig={avatar} size={28} className="rounded-full bg-white ring-1 ring-black/5" />
                              : <span className="rounded-full bg-gray-200 ring-1 ring-black/5 flex items-center justify-center text-[10px] font-heading font-bold text-muted shrink-0" style={{ width: 28, height: 28 }}>{initials}</span>}
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
                  <ul className="divide-y divide-gray-100 mt-2">
                    {s.incidents.map((inc, i) => {
                      const playerNameById = (id: string) => {
                        const a = s.attendees.find((x) => x.playerId === id);
                        return a ? `${a.firstName} ${a.lastName}` : "?";
                      };
                      return (
                        <li key={i} className="text-sm py-2 first:pt-0 last:pb-0">
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

