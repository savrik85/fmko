"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PositionBadge } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface MatchEvent {
  minute: number; type: string; playerId: number; playerName: string;
  teamId: number; description: string; detail?: string;
}

interface LineupPlayer { id: string; name: string; position: string; naturalPosition: string; rating: number }
interface LineupData { starters: LineupPlayer[]; subs: LineupPlayer[] }

interface MatchDetail {
  id: string; home_team_id: string; away_team_id: string;
  home_name: string; away_name: string; home_color: string; away_color: string;
  home_secondary: string; away_secondary: string; home_badge: string; away_badge: string;
  home_score: number; away_score: number; status: string; round: number | null;
  events: MatchEvent[]; commentary: string[]; simulated_at: string | null;
  attendance: number | null; stadium_name: string | null;
  pitch_condition: number | null; weather: string | null;
  home_lineup_data: LineupData | null; away_lineup_data: LineupData | null;
}

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

const WEATHER_LABEL: Record<string, string> = {
  sunny: "☀️ Slunečno", cloudy: "☁️ Zataženo", rain: "🌧️ Déšť", wind: "💨 Vítr", snow: "❄️ Sníh",
};

function StatBar({ label, home, away, hc, ac }: { label: string; home: number; away: number; hc: string; ac: string }) {
  const total = home + away || 1;
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-right font-heading font-bold text-sm tabular-nums text-white/80">{home}</span>
      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-white/10">
        <div className="h-full rounded-l-full" style={{ width: `${(home / total) * 100}%`, backgroundColor: `color-mix(in srgb, ${hc} 60%, white)` }} />
        <div className="flex-1" />
        <div className="h-full rounded-r-full" style={{ width: `${(away / total) * 100}%`, backgroundColor: `color-mix(in srgb, ${ac} 60%, white)` }} />
      </div>
      <span className="w-6 text-left font-heading font-bold text-sm tabular-nums text-white/80">{away}</span>
      <span className="w-14 text-white/40 text-xs font-heading uppercase">{label}</span>
    </div>
  );
}

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
      .catch((e) => { console.error("Failed to load match:", e); setLoading(false); });
  }, [matchId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  if (!match) return <div className="page-container">Zápas nenalezen.</div>;

  const hc = match.home_color || "#2D5F2D";
  const ac = match.away_color || "#D94032";
  const goals = match.events.filter((e) => e.type === "goal");
  const homeGoals = goals.filter((e) => e.teamId === 1);
  const awayGoals = goals.filter((e) => e.teamId === 2);
  const keyEvents = match.events.filter((e) => ["goal", "card", "injury", "substitution"].includes(e.type));
  const firstHalf = keyEvents.filter((e) => e.minute <= 45);
  const secondHalf = keyEvents.filter((e) => e.minute > 45);

  // Stats
  const st = {
    shots: [
      match.events.filter((e) => e.teamId === 1 && (e.type === "goal" || e.type === "chance")).length,
      match.events.filter((e) => e.teamId === 2 && (e.type === "goal" || e.type === "chance")).length,
    ],
    fouls: [
      match.events.filter((e) => e.teamId === 1 && e.type === "foul").length,
      match.events.filter((e) => e.teamId === 2 && e.type === "foul").length,
    ],
    cards: [
      match.events.filter((e) => e.teamId === 1 && e.type === "card").length,
      match.events.filter((e) => e.teamId === 2 && e.type === "card").length,
    ],
  };

  return (
    <div className="max-w-4xl mx-auto px-3 py-2 space-y-3">

      {/* ═══ SCOREBOARD — same dark style as replay ═══ */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#0a0a0a" }}>
        {/* Back button */}
        <div className="flex items-center px-4 pt-3">
          <button onClick={() => router.back()} className="text-white/40 hover:text-white/70 text-sm flex items-center gap-1 transition-colors">
            &#8592; Zpět
          </button>
          {match.status === "simulated" && (
            <button onClick={() => router.push(`/dashboard/match/${matchId}/replay`)}
              className="ml-auto text-sm font-heading font-bold text-pitch-400 hover:text-pitch-300 transition-colors">
              ▶ Přehrát zápas
            </button>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center px-4 py-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <BadgePreview primary={hc} secondary={match.home_secondary || "#FFF"} pattern={(match.home_badge as BadgePattern) || "shield"} initials={ini(match.home_name)} size={44} />
            <span className="font-heading font-bold text-white text-lg truncate">{match.home_name}</span>
          </div>
          <div className="text-center shrink-0 px-6">
            <div className="font-heading font-[800] text-6xl tabular-nums leading-none" style={{ textShadow: "0 0 10px rgba(255,255,255,0.2)" }}>
              <span style={{ color: `color-mix(in srgb, ${hc} 60%, white)` }}>{match.home_score}</span>
              <span className="text-white/20 mx-3">:</span>
              <span style={{ color: `color-mix(in srgb, ${ac} 60%, white)` }}>{match.away_score}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <span className="text-white/40 text-sm font-heading">Konec</span>
              {match.round && <span className="text-white/25 text-sm font-heading">· {match.round}. kolo</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
            <span className="font-heading font-bold text-white text-lg truncate">{match.away_name}</span>
            <BadgePreview primary={ac} secondary={match.away_secondary || "#FFF"} pattern={(match.away_badge as BadgePattern) || "shield"} initials={ini(match.away_name)} size={44} />
          </div>
        </div>

        {/* Match info bar */}
        <div className="flex items-center justify-center gap-5 px-4 py-2 text-white/50 text-sm font-heading" style={{ background: "#060d06" }}>
          {match.stadium_name && <span>{match.stadium_name}</span>}
          {match.attendance != null && <span>{match.attendance} diváků</span>}
          {match.pitch_condition != null && (
            <span>Hřiště: {match.pitch_condition >= 70 ? "výborné" : match.pitch_condition >= 40 ? "průměrné" : "špatné"}</span>
          )}
          {match.weather && <span>{WEATHER_LABEL[match.weather] ?? match.weather}</span>}
          {match.simulated_at && (
            <span>{new Date(match.simulated_at).toLocaleDateString("cs", { day: "numeric", month: "long", year: "numeric" })}</span>
          )}
        </div>

        {/* Stats bars */}
        <div className="px-6 py-4 space-y-2" style={{ background: "#111" }}>
          <StatBar label="Střely" home={st.shots[0]} away={st.shots[1]} hc={hc} ac={ac} />
          <StatBar label="Fauly" home={st.fouls[0]} away={st.fouls[1]} hc={hc} ac={ac} />
          <StatBar label="Karty" home={st.cards[0]} away={st.cards[1]} hc={hc} ac={ac} />
        </div>
      </div>

      {/* ═══ LINEUPS ═══ */}
      {(match.home_lineup_data || match.away_lineup_data) && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: match.home_name, data: match.home_lineup_data, color: hc },
            { label: match.away_name, data: match.away_lineup_data, color: ac },
          ].map(({ label, data, color }) => {
            if (!data) return null;
            const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as Record<string, number>;
            const sorted = [...data.starters].sort((a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9));
            const posConfig: Record<string, { label: string; bg: string; border: string; text: string }> = {
              GK:  { label: "Brankář", bg: "bg-amber-50",  border: "border-l-amber-400", text: "text-amber-700" },
              DEF: { label: "Obrana",  bg: "bg-blue-50",   border: "border-l-blue-400",   text: "text-blue-700" },
              MID: { label: "Záloha", bg: "bg-emerald-50", border: "border-l-emerald-400", text: "text-emerald-700" },
              FWD: { label: "Útok",   bg: "bg-red-50",     border: "border-l-red-400",    text: "text-red-700" },
            };
            const groups: Array<{ pos: string; players: LineupPlayer[] }> = [];
            for (const p of sorted) {
              const last = groups[groups.length - 1];
              if (last && last.pos === p.position) { last.players.push(p); }
              else { groups.push({ pos: p.position, players: [p] }); }
            }
            return (
            <div key={label} className="card overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}>
                <span className="font-heading font-bold text-sm">{label}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {groups.map((g) => {
                  const cfg = posConfig[g.pos] ?? posConfig.MID;
                  return (
                    <div key={g.pos}>
                      <div className={`px-3 py-1 ${cfg.bg} ${cfg.text} text-[11px] font-heading font-bold uppercase tracking-wider`}>
                        {cfg.label}
                      </div>
                      {g.players.map((p) => (
                        <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 border-l-3 ${cfg.border}`}>
                          <span className="shrink-0"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /></span>
                          <span className="flex-1 min-w-0 truncate">
                            {p.id ? (
                              <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-base hover:text-pitch-500 transition-colors">{p.name}</Link>
                            ) : (
                              <span className="font-heading font-bold text-base">{p.name}</span>
                            )}
                            {p.position !== p.naturalPosition && (
                              <span className="text-amber-500 text-xs ml-1.5" title={`Přirozená pozice: ${p.naturalPosition}`}>({p.naturalPosition})</span>
                            )}
                          </span>
                          <span className="text-sm text-muted tabular-nums shrink-0">{p.rating}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {data.subs.length > 0 && (
                  <div>
                    <div className="px-3 py-1 bg-gray-100 text-[11px] text-muted font-heading font-bold uppercase tracking-wider">Lavička</div>
                    {data.subs.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-1 border-l-3 border-l-gray-300 text-muted">
                        <span className="shrink-0"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /></span>
                        <span className="flex-1 min-w-0 truncate">
                          {p.id ? (
                            <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold hover:text-pitch-500 transition-colors">{p.name}</Link>
                          ) : (
                            <span className="font-heading font-bold">{p.name}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ═══ GOALS ═══ */}
      {goals.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Góly</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              {homeGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted tabular-nums w-6 text-right">{g.minute}&apos;</span>
                  <span className="text-sm">⚽</span>
                  <span className="text-sm font-heading font-bold">{g.playerName}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {awayGoals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted tabular-nums w-6 text-right">{g.minute}&apos;</span>
                  <span className="text-sm">⚽</span>
                  <span className="text-sm font-heading font-bold">{g.playerName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TIMELINE ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Průběh zápasu</SectionLabel>

        {keyEvents.length === 0 ? (
          <p className="text-sm text-muted">Žádné klíčové události.</p>
        ) : (
          <div>
            {/* 1st half */}
            {firstHalf.length > 0 && (
              <div>
                <div className="text-xs font-heading uppercase text-muted mb-2 mt-1">1. poločas</div>
                {firstHalf.map((e, i) => <EventRow key={i} event={e} hc={hc} ac={ac} />)}
              </div>
            )}

            {/* Divider */}
            {firstHalf.length > 0 && secondHalf.length > 0 && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-heading text-muted uppercase">Poločas</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}

            {/* 2nd half */}
            {secondHalf.length > 0 && (
              <div>
                {firstHalf.length === 0 && <div className="text-xs font-heading uppercase text-muted mb-2 mt-1">2. poločas</div>}
                {secondHalf.map((e, i) => <EventRow key={i} event={e} hc={hc} ac={ac} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ COMMENTARY ═══ */}
      {match.commentary.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowCommentary(!showCommentary)}
            className="flex items-center justify-between w-full px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-heading font-bold uppercase text-muted">Komentář ({match.commentary.length})</span>
            <span className="text-sm font-heading font-bold text-pitch-500">{showCommentary ? "Skrýt" : "Zobrazit"}</span>
          </button>
          {showCommentary && (
            <div className="px-4 sm:px-5 pb-4 space-y-1.5 max-h-[500px] overflow-y-auto border-t border-gray-100 pt-3">
              {match.commentary.map((line, i) => (
                <p key={i} className="text-sm text-ink leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({ event: e, hc, ac }: { event: MatchEvent; hc: string; ac: string }) {
  const isHome = e.teamId === 1;
  const teamColor = isHome ? hc : ac;

  let icon: string;
  let bgColor: string;
  switch (e.type) {
    case "goal": icon = "⚽"; bgColor = "bg-pitch-50"; break;
    case "card": icon = e.detail === "red" ? "🟥" : "🟨"; bgColor = e.detail === "red" ? "bg-red-50" : "bg-yellow-50"; break;
    case "injury": icon = "🩹"; bgColor = "bg-orange-50"; break;
    case "substitution": icon = "🔄"; bgColor = "bg-blue-50"; break;
    default: icon = ""; bgColor = "";
  }

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-lg mb-1 ${bgColor}`}>
      <span className="text-xs text-muted tabular-nums w-7 text-right font-heading font-bold">{e.minute}&apos;</span>
      <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-heading font-bold">{e.playerName}</span>
        <span className="text-xs text-muted ml-2">{e.description}</span>
      </div>
    </div>
  );
}
