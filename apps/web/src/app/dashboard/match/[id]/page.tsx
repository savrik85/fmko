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

interface LineupPlayer { id: string; name: string; position: string; naturalPosition: string; rating: number; squadNumber?: number | null }
interface LineupData { starters: LineupPlayer[]; subs: LineupPlayer[]; formation?: string; tactic?: string; captainId?: string | null }

const TACTIC_LABEL: Record<string, string> = {
  offensive: "Útočná", balanced: "Vyrovnaná", defensive: "Defenzivní",
  long_ball: "Nakopávané", possession: "Držení míče", pressing: "Vysoký presink",
};

interface MatchAbsence { teamId?: string; name: string; reason: string; smsText: string }

interface MatchDetail {
  id: string; home_team_id: string; away_team_id: string;
  home_name: string; away_name: string; home_color: string; away_color: string;
  home_secondary: string; away_secondary: string; home_badge: string; away_badge: string;
  home_score: number; away_score: number; status: string; round: number | null;
  events: MatchEvent[]; commentary: string[]; simulated_at: string | null;
  attendance: number | null; stadium_name: string | null;
  pitch_condition: number | null; weather: string | null;
  possession_home?: number | null;
  mom_player_id?: string | null;
  home_lineup_data: LineupData | null; away_lineup_data: LineupData | null;
  player_ratings?: Record<string, number>;
  absences?: MatchAbsence[];
  isLocalDerby?: boolean;
}

// Light/dark color detection — pro adaptivní kontrast u team-color pozadí
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 165;
}

const POS_LABEL: Record<string, string> = {
  GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník",
};

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
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [lineupSort, setLineupSort] = useState<"position" | "rating">("position");

  useEffect(() => {
    apiFetch<MatchDetail & { calendar_id?: string | null }>(`/api/matches/${matchId}`)
      .then((m) => {
        // Pre-match (neodehráno) → redirect na editor sestavy. Tato stránka je jen pro výsledky.
        if (m.status !== "simulated") {
          const calId = (m as any).calendar_id ?? matchId;
          router.replace(`/dashboard/match?calendarId=${calId}`);
          return;
        }
        setMatch(m);
        setLoading(false);
      })
      .catch((e) => { console.error("Failed to load match:", e); setLoading(false); });
  }, [matchId, router]);

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

  // Stats — rozšířené o šance, žluté/červené zvlášť, brankářské zákroky, držení míče
  const eventCount = (teamId: number, type: string, detail?: string) =>
    match.events.filter((e) =>
      e.teamId === teamId && e.type === type && (detail == null || e.detail === detail)
    ).length;

  const st = {
    shots: [
      eventCount(1, "goal") + eventCount(1, "chance"),
      eventCount(2, "goal") + eventCount(2, "chance"),
    ] as [number, number],
    chances: [eventCount(1, "chance"), eventCount(2, "chance")] as [number, number],
    fouls: [eventCount(1, "foul"), eventCount(2, "foul")] as [number, number],
    yellow: [
      match.events.filter((e) => e.teamId === 1 && e.type === "card" && e.detail !== "red").length,
      match.events.filter((e) => e.teamId === 2 && e.type === "card" && e.detail !== "red").length,
    ] as [number, number],
    red: [
      match.events.filter((e) => e.teamId === 1 && e.type === "card" && e.detail === "red").length,
      match.events.filter((e) => e.teamId === 2 && e.type === "card" && e.detail === "red").length,
    ] as [number, number],
    saves: [
      match.events.filter((e) => e.teamId === 1 && e.type === "special" && e.detail === "save").length,
      match.events.filter((e) => e.teamId === 2 && e.type === "special" && e.detail === "save").length,
    ] as [number, number],
  };

  // Possession from DB; fallback na 50/50 pokud chybí (staré zápasy)
  const possHome = match.possession_home ?? 50;
  const possAway = 100 - possHome;

  // ═══ MVP / TOP PLAYERS — z player_ratings ═══
  const ratings = match.player_ratings ?? {};
  const ratingEntries = Object.entries(ratings).map(([id, r]) => ({ id, rating: r as number }));

  // Lineup lookup — najít hráče (jméno, pozice, klub) podle ID
  const allLineupPlayers: Array<LineupPlayer & { teamId: 1 | 2 }> = [
    ...(match.home_lineup_data?.starters ?? []).map((p) => ({ ...p, teamId: 1 as const })),
    ...(match.home_lineup_data?.subs ?? []).map((p) => ({ ...p, teamId: 1 as const })),
    ...(match.away_lineup_data?.starters ?? []).map((p) => ({ ...p, teamId: 2 as const })),
    ...(match.away_lineup_data?.subs ?? []).map((p) => ({ ...p, teamId: 2 as const })),
  ];
  const lookupPlayer = (id: string) => allLineupPlayers.find((p) => p.id === id);

  // Per-player stats z events
  const matchEvents = match.events;
  function statsForPlayer(playerId: string, teamId: 1 | 2) {
    const p = lookupPlayer(playerId);
    if (!p) return { goals: 0, assists: 0, chances: 0, yellow: 0, red: 0 };
    const ev = matchEvents.filter((e) => e.teamId === teamId && e.playerName === p.name);
    return {
      goals: ev.filter((e) => e.type === "goal").length,
      assists: ev.filter((e) => e.type === "assist").length,
      chances: ev.filter((e) => e.type === "chance").length,
      yellow: ev.filter((e) => e.type === "card" && e.detail !== "red").length,
      red: ev.filter((e) => e.type === "card" && e.detail === "red").length,
    };
  }

  function buildHighlight(s: ReturnType<typeof statsForPlayer>): string {
    if (s.red > 0) return "I přes vyloučení dominantní výkon.";
    if (s.goals >= 3) return "Hattrick! Rozhodl zápas naprosto sám.";
    if (s.goals >= 2) return "Dvě branky — nezastavitelný.";
    if (s.goals >= 1 && s.assists >= 1) return "Gól i asistence — kompletní výkon.";
    if (s.goals >= 1) return "Rozhodující trefa.";
    if (s.assists >= 2) return "Dvě asistence — dirigent zápasu.";
    if (s.assists >= 1) return "Klíčová asistence.";
    if (s.chances >= 3) return `Stálé ohrožení obrany — ${s.chances} šancí.`;
    return "Nejlepší výkon zápasu.";
  }

  // Sort entries by rating DESC, take MVP + top 2 per team (mimo MVP)
  const ratedWithTeam = ratingEntries
    .map((e) => ({ ...e, player: lookupPlayer(e.id) }))
    .filter((e) => e.player != null)
    .sort((a, b) => b.rating - a.rating);

  // MVP — preferuj uložený mom_player_id z DB (konstantní napříč zobrazením),
  // jinak fallback na hráče s nejvyšším ratingem (pro starší zápasy bez DB záznamu)
  const mvpFromDb = match.mom_player_id ? ratedWithTeam.find((e) => e.id === match.mom_player_id) : null;
  const mvp = mvpFromDb ?? ratedWithTeam[0] ?? null;

  const topHome = ratedWithTeam
    .filter((e) => e.player!.teamId === 1 && e.id !== mvp?.id)
    .slice(0, 2);
  const topAway = ratedWithTeam
    .filter((e) => e.player!.teamId === 2 && e.id !== mvp?.id)
    .slice(0, 2);

  // Worst — flop zápasu (jen pokud rating < 5.5)
  const flop = [...ratedWithTeam].reverse()[0];
  const showFlop = flop && flop.rating < 5.5;

  // ═══ KEY MOMENTS — top 3-5 events ═══
  const goalEvents = match.events.filter((e) => e.type === "goal");
  const redEvents = match.events.filter((e) => e.type === "card" && e.detail === "red");
  const bigChances = match.events.filter((e) =>
    e.type === "chance" && (e.detail === "břevno" || e.detail === "tyč")
  );
  const keyMoments = [...goalEvents, ...redEvents, ...bigChances]
    .sort((a, b) => a.minute - b.minute)
    .slice(0, 6);

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

        {match.isLocalDerby && (
          <div className="mx-3 sm:mx-4 mt-1 mb-1 px-3 py-1.5 rounded-md text-center font-heading font-[800] text-xs sm:text-sm tracking-wide"
            style={{ background: "linear-gradient(90deg, rgba(220,38,38,0.25), rgba(220,38,38,0.45), rgba(220,38,38,0.25))", color: "#fecaca", border: "1px solid rgba(220,38,38,0.5)" }}>
            🏘️ MÍSTNÍ DERBY
          </div>
        )}

        {/* Score — mobile: stacked badge+name columns with larger names; desktop: horizontal */}
        <div className="flex items-start sm:items-center px-3 sm:px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center sm:gap-3 gap-2 flex-1 min-w-0">
            <BadgePreview primary={hc} secondary={match.home_secondary || "#FFF"} pattern={(match.home_badge as BadgePattern) || "shield"} initials={ini(match.home_name)} size={40} />
            <span className="font-heading font-bold text-white text-xs sm:text-lg text-center sm:text-left break-words leading-tight">{match.home_name}</span>
          </div>
          <div className="text-center shrink-0 px-3 sm:px-6">
            <div className="font-heading font-[800] text-5xl sm:text-6xl tabular-nums leading-none" style={{ textShadow: "0 0 10px rgba(255,255,255,0.2)" }}>
              <span style={{ color: `color-mix(in srgb, ${hc} 60%, white)` }}>{match.home_score}</span>
              <span className="text-white/20 mx-2 sm:mx-3">:</span>
              <span style={{ color: `color-mix(in srgb, ${ac} 60%, white)` }}>{match.away_score}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <span className="text-white/40 text-xs sm:text-sm font-heading">Konec</span>
              {match.round && <span className="text-white/25 text-xs sm:text-sm font-heading">· {match.round}. kolo</span>}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:gap-3 gap-2 flex-1 min-w-0 sm:justify-end">
            <BadgePreview primary={ac} secondary={match.away_secondary || "#FFF"} pattern={(match.away_badge as BadgePattern) || "shield"} initials={ini(match.away_name)} size={40} />
            <span className="font-heading font-bold text-white text-xs sm:text-lg text-center sm:text-right break-words leading-tight sm:order-first">{match.away_name}</span>
          </div>
        </div>

        {/* Match info bar — wrap on mobile */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-white/50 text-xs sm:text-sm font-heading" style={{ background: "#060d06" }}>
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

        {/* Stats bars — rozšířené */}
        <div className="px-6 py-4 space-y-2" style={{ background: "#111" }}>
          <StatBar label="Držení" home={possHome} away={possAway} hc={hc} ac={ac} />
          <StatBar label="Střely" home={st.shots[0]} away={st.shots[1]} hc={hc} ac={ac} />
          <StatBar label="Šance" home={st.chances[0]} away={st.chances[1]} hc={hc} ac={ac} />
          <StatBar label="Fauly" home={st.fouls[0]} away={st.fouls[1]} hc={hc} ac={ac} />
          <StatBar label="ŽK" home={st.yellow[0]} away={st.yellow[1]} hc={hc} ac={ac} />
          {(st.red[0] > 0 || st.red[1] > 0) && (
            <StatBar label="ČK" home={st.red[0]} away={st.red[1]} hc={hc} ac={ac} />
          )}
          <StatBar label="Zákroky" home={st.saves[0]} away={st.saves[1]} hc={hc} ac={ac} />
        </div>
      </div>

      {/* ═══ HRÁČ ZÁPASU (MVP) ═══ */}
      {mvp && mvp.player && (() => {
        const s = statsForPlayer(mvp.id, mvp.player.teamId);
        const teamColor = mvp.player.teamId === 1 ? hc : ac;
        const teamSecondary = mvp.player.teamId === 1 ? (match.home_secondary || "#FFF") : (match.away_secondary || "#FFF");
        const teamBadge = mvp.player.teamId === 1 ? match.home_badge : match.away_badge;
        const teamName = mvp.player.teamId === 1 ? match.home_name : match.away_name;
        const teamId = mvp.player.teamId === 1 ? match.home_team_id : match.away_team_id;
        const lightBg = isLightColor(teamColor);
        const textOnBg = lightBg ? "text-ink" : "text-white";
        const subTextOnBg = lightBg ? "text-ink/65" : "text-white/75";
        return (
          <div className="rounded-xl overflow-hidden border border-gold-500/30 shadow-md" style={{ background: `linear-gradient(135deg, ${teamColor}, color-mix(in srgb, ${teamColor} 70%, black))` }}>
            <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "linear-gradient(90deg, #b8860b, #d4af37)" }}>
              <span className="text-base">🏆</span>
              <span className="font-heading font-[800] text-sm uppercase tracking-wide text-white">Hráč zápasu</span>
            </div>
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="shrink-0">
                <BadgePreview primary={teamColor} secondary={teamSecondary} pattern={(teamBadge as BadgePattern) || "shield"} initials={ini(teamName)} size={56} />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/dashboard/player/${mvp.id}`} className={`block font-heading font-[800] text-xl sm:text-2xl truncate hover:underline ${textOnBg}`}>
                  {mvp.player.name}
                </Link>
                <div className={`text-sm ${subTextOnBg} flex items-center gap-1.5 flex-wrap`}>
                  <Link href={`/dashboard/team/${teamId}`} className="hover:underline font-heading font-bold">{teamName}</Link>
                  <span>·</span>
                  <span>{POS_LABEL[mvp.player.position] ?? mvp.player.position}</span>
                </div>
                <div className={`mt-1.5 text-sm sm:text-base flex items-center gap-2 flex-wrap font-heading ${textOnBg}`}>
                  {s.goals > 0 && <span title={`${s.goals} gól${s.goals > 1 ? "y" : ""}`}>⚽ {s.goals > 1 ? `${s.goals} ` : ""}gól{s.goals > 1 ? "y" : ""}</span>}
                  {s.assists > 0 && <span title={`${s.assists} asistence`}>👟 {s.assists > 1 ? `${s.assists} ` : ""}asistence</span>}
                  {s.chances > 0 && s.goals === 0 && <span>🎯 {s.chances} šanc{s.chances === 1 ? "e" : s.chances < 5 ? "e" : "í"}</span>}
                  {s.yellow > 0 && <span>🟨</span>}
                  {s.red > 0 && <span>🟥</span>}
                </div>
                <div className={`text-xs sm:text-sm italic mt-1 ${subTextOnBg}`}>{buildHighlight(s)}</div>
              </div>
              <div className="shrink-0 flex flex-col items-center justify-center px-3 py-2 rounded-xl bg-white/95 shadow-inner">
                <span className="font-heading font-[800] text-3xl sm:text-4xl tabular-nums text-pitch-700">
                  {mvp.rating.toFixed(1)}
                </span>
                <span className="text-[10px] uppercase tracking-wide font-heading font-bold text-muted">rating</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ NEJLEPŠÍ V TÝMECH ═══ */}
      {(topHome.length > 0 || topAway.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: match.home_name, color: hc, top: topHome, teamId: 1 as const },
            { label: match.away_name, color: ac, top: topAway, teamId: 2 as const },
          ].map(({ label, color, top, teamId }) => (
            <div key={teamId} className="card overflow-hidden">
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-heading font-bold text-xs uppercase tracking-wide text-muted">Top výkony · {label}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {top.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted italic">—</div>
                ) : top.map((entry) => {
                  const s = statsForPlayer(entry.id, teamId);
                  const ratingColor = entry.rating >= 7.5 ? "bg-pitch-100 text-pitch-700"
                    : entry.rating >= 6.5 ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700";
                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/dashboard/player/${entry.id}`} className="block font-heading font-bold text-base hover:text-pitch-500 transition-colors truncate">
                          {entry.player!.name}
                        </Link>
                        <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                          <span>{POS_LABEL[entry.player!.position] ?? entry.player!.position}</span>
                          {s.goals > 0 && <span>· ⚽{s.goals > 1 ? ` ${s.goals}` : ""}</span>}
                          {s.assists > 0 && <span>· 👟{s.assists > 1 ? ` ${s.assists}` : ""}</span>}
                          {s.yellow > 0 && <span>· 🟨</span>}
                          {s.red > 0 && <span>· 🟥</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-md text-sm font-heading font-bold tabular-nums ${ratingColor}`}>
                        {entry.rating.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ KLÍČOVÉ MOMENTY ═══ */}
      {keyMoments.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Klíčové momenty</SectionLabel>
          <div className="space-y-1">
            {keyMoments.map((e, i) => <EventRow key={i} event={e} hc={hc} ac={ac} />)}
          </div>
        </div>
      )}

      {/* ═══ LINEUPS — mobile: stacked, desktop: 2 columns ═══ */}
      {(match.home_lineup_data || match.away_lineup_data) && (
        <div>
          {/* Sort toggle */}
          <div className="flex items-center justify-end gap-1 mb-2">
            <span className="text-xs font-heading uppercase text-muted mr-2">Řadit:</span>
            <button
              onClick={() => setLineupSort("position")}
              className={`px-2.5 py-1 rounded-md text-xs font-heading font-bold transition-colors ${
                lineupSort === "position" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
              }`}
            >Po pozicích</button>
            <button
              onClick={() => setLineupSort("rating")}
              className={`px-2.5 py-1 rounded-md text-xs font-heading font-bold transition-colors ${
                lineupSort === "rating" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
              }`}
            >Dle hodnocení</button>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: match.home_name, data: match.home_lineup_data, color: hc, teamId: 1 },
            { label: match.away_name, data: match.away_lineup_data, color: ac, teamId: 2 },
          ].map(({ label, data, color, teamId }) => {
            if (!data) return null;
            const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as Record<string, number>;
            const sorted = lineupSort === "rating"
              ? [...data.starters].sort((a, b) => (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0))
              : [...data.starters].sort((a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9));
            const posConfig: Record<string, { label: string; bg: string; border: string; text: string }> = {
              GK:  { label: "Brankář", bg: "bg-amber-50",  border: "border-l-amber-400", text: "text-amber-700" },
              DEF: { label: "Obrana",  bg: "bg-blue-50",   border: "border-l-blue-400",   text: "text-blue-700" },
              MID: { label: "Záloha", bg: "bg-emerald-50", border: "border-l-emerald-400", text: "text-emerald-700" },
              FWD: { label: "Útok",   bg: "bg-red-50",     border: "border-l-red-400",    text: "text-red-700" },
            };
            // Při sort=rating jeden flat group bez position headerů; při sort=position rozdělit po pozicích
            const groups: Array<{ pos: string | null; players: LineupPlayer[] }> = lineupSort === "rating"
              ? [{ pos: null, players: sorted }]
              : (() => {
                  const out: Array<{ pos: string; players: LineupPlayer[] }> = [];
                  for (const p of sorted) {
                    const last = out[out.length - 1];
                    if (last && last.pos === p.position) { last.players.push(p); }
                    else { out.push({ pos: p.position, players: [p] }); }
                  }
                  return out;
                })();
            // Per-player stats from events (match by name + teamId)
            const statsFor = (name: string) => {
              const ev = match.events.filter((e) => e.teamId === teamId && e.playerName === name);
              // Sub IN: this player IS the sub (playerName matches and event is substitution)
              const subInEvent = ev.find((e) => e.type === "substitution");
              // Sub OUT: another sub event mentions "za {name}" in description
              const subOutEvent = match.events.find((e) =>
                e.teamId === teamId && e.type === "substitution" && e.description.includes(`za ${name}`)
              );
              return {
                goals: ev.filter((e) => e.type === "goal").length,
                yellow: ev.filter((e) => e.type === "card" && e.detail !== "red").length,
                red: ev.filter((e) => e.type === "card" && e.detail === "red").length,
                subInMin: subInEvent?.minute ?? null,
                subOutMin: subOutEvent?.minute ?? null,
              };
            };
            return (
            <div key={label} className="card overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100" style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, white)` }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-heading font-bold text-sm">{label}</span>
                  {(data.formation || data.tactic) && (
                    <span className="text-[11px] text-muted">
                      {data.formation && <span className="font-heading font-bold mr-2">{data.formation}</span>}
                      {data.tactic && <span>{TACTIC_LABEL[data.tactic] ?? data.tactic}</span>}
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {groups.map((g, gi) => {
                  const cfg = g.pos ? (posConfig[g.pos] ?? posConfig.MID) : null;
                  return (
                    <div key={g.pos ?? `flat-${gi}`}>
                      {cfg && (
                        <div className={`px-3 py-1 ${cfg.bg} ${cfg.text} text-[11px] font-heading font-bold uppercase tracking-wider`}>
                          {cfg.label}
                        </div>
                      )}
                      {g.players.map((p) => {
                        const s = statsFor(p.name);
                        const matchRating = ratings[p.id];
                        const ratingColor = matchRating == null ? "bg-gray-100 text-gray-500"
                          : matchRating >= 7.5 ? "bg-pitch-100 text-pitch-700"
                          : matchRating >= 6.5 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700";
                        const barPct = matchRating == null ? 0 : Math.max(0, Math.min(100, ((matchRating - 1) / 9) * 100));
                        const barColor = matchRating == null ? "#d1d5db"
                          : matchRating >= 7.5 ? "#10b981"
                          : matchRating >= 6.5 ? "#f59e0b"
                          : "#ef4444";
                        const isMvp = mvp?.id === p.id;
                        // Při sort=rating používáme position-color border (z přirozené pozice hráče); při sort=position bere se z group cfg
                        const rowBorderClass = cfg ? cfg.border : (posConfig[p.position] ?? posConfig.MID).border;
                        return (
                        <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 border-l-3 ${rowBorderClass} ${isMvp ? "bg-gold-50/50 ring-1 ring-inset ring-gold-300" : ""}`}>
                          <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[11px] font-heading font-bold flex items-center justify-center tabular-nums">{p.squadNumber ?? "?"}</span>
                          <span className="flex-1 min-w-0 truncate text-base leading-6">
                            {isMvp && <span className="text-sm mr-1 align-middle" title="Hráč zápasu">🏆</span>}
                            {p.id ? (
                              <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold hover:text-pitch-500 transition-colors">{p.name}</Link>
                            ) : (
                              <span className="font-heading font-bold">{p.name}</span>
                            )}
                            {data.captainId && p.id === data.captainId && (
                              <span className="text-gold-600 text-sm ml-1.5 font-bold align-middle" title="Kapitán">©</span>
                            )}
                            {p.position !== p.naturalPosition && (
                              <span className="text-amber-500 text-xs ml-1.5" title={`Přirozená pozice: ${p.naturalPosition}`}>({p.naturalPosition})</span>
                            )}
                            {s.goals > 0 && (
                              <span className="text-sm ml-1.5 align-middle" title={`${s.goals} gól${s.goals > 1 ? "y" : ""}`}>
                                ⚽{s.goals > 1 ? ` ${s.goals}` : ""}
                              </span>
                            )}
                            {s.yellow > 0 && <span className="text-xs ml-1 align-middle" title="Žlutá karta">🟨</span>}
                            {s.red > 0 && <span className="text-xs ml-1 align-middle" title="Červená karta">🟥</span>}
                            {s.subOutMin != null && (
                              <span className="text-[11px] ml-1.5 align-middle text-red-600 font-heading font-bold inline-flex items-center gap-0.5" title={`Vystřídán v ${s.subOutMin}. minutě`}>
                                <span>↑</span><span className="tabular-nums">{s.subOutMin}&apos;</span>
                              </span>
                            )}
                          </span>
                          <div className="shrink-0 w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block" title={matchRating != null ? `Rating ${matchRating.toFixed(1)}/10` : "Bez ratingu"}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                          </div>
                          <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-heading font-bold tabular-nums ${ratingColor}`} title="Hodnocení hráče v zápase">{matchRating != null ? matchRating.toFixed(1) : "—"}</span>
                        </div>
                        );
                      })}
                    </div>
                  );
                })}
                {data.subs.length > 0 && (
                  <div>
                    <div className="px-3 py-1 bg-gray-100 text-[11px] text-muted font-heading font-bold uppercase tracking-wider">Lavička</div>
                    {data.subs.map((p) => {
                      const s = statsFor(p.name);
                      return (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-1 border-l-3 border-l-gray-300 text-muted">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[11px] font-heading font-bold flex items-center justify-center tabular-nums">{p.squadNumber ?? "?"}</span>
                        <span className="flex-1 min-w-0 truncate leading-6">
                          {p.id ? (
                            <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold hover:text-pitch-500 transition-colors">{p.name}</Link>
                          ) : (
                            <span className="font-heading font-bold">{p.name}</span>
                          )}
                          {s.subInMin != null && (
                            <span className="text-[11px] ml-1.5 align-middle text-pitch-600 font-heading font-bold inline-flex items-center gap-0.5" title={`Nastoupil v ${s.subInMin}. minutě`}>
                              <span>↓</span><span className="tabular-nums">{s.subInMin}&apos;</span>
                            </span>
                          )}
                          {s.goals > 0 && <span className="text-sm ml-1.5 align-middle">⚽{s.goals > 1 ? ` ${s.goals}` : ""}</span>}
                          {s.yellow > 0 && <span className="text-xs ml-1 align-middle">🟨</span>}
                          {s.red > 0 && <span className="text-xs ml-1 align-middle">🟥</span>}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
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

      {/* ═══ TIMELINE — celý průběh (collapsible) ═══ */}
      {keyEvents.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowFullTimeline(!showFullTimeline)}
            className="flex items-center justify-between w-full px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <span className="text-xs font-heading font-bold uppercase text-muted">Celý průběh ({keyEvents.length})</span>
            <span className="text-sm font-heading font-bold text-pitch-500">{showFullTimeline ? "Skrýt" : "Zobrazit"}</span>
          </button>
          {showFullTimeline && (
            <div className="px-4 sm:px-5 pb-4 border-t border-gray-100 pt-3">
              {firstHalf.length > 0 && (
                <div>
                  <div className="text-xs font-heading uppercase text-muted mb-2 mt-1">1. poločas</div>
                  {firstHalf.map((e, i) => <EventRow key={i} event={e} hc={hc} ac={ac} />)}
                </div>
              )}
              {firstHalf.length > 0 && secondHalf.length > 0 && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs font-heading text-muted uppercase">Poločas</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              {secondHalf.length > 0 && (
                <div>
                  {firstHalf.length === 0 && <div className="text-xs font-heading uppercase text-muted mb-2 mt-1">2. poločas</div>}
                  {secondHalf.map((e, i) => <EventRow key={i} event={e} hc={hc} ac={ac} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ OMLUVENÍ HRÁČI ═══ */}
      {match.absences && match.absences.length > 0 && (() => {
        const homeAbs = match.absences.filter((a) => a.teamId === match.home_team_id);
        const awayAbs = match.absences.filter((a) => a.teamId === match.away_team_id);
        // Starší data bez teamId — zobraz všechny dohromady
        const legacy = match.absences.filter((a) => !a.teamId);
        return (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Omluvení hráči</SectionLabel>
            {legacy.length > 0 ? (
              <div className="space-y-2">
                {legacy.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xs font-heading font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 shrink-0 mt-0.5">{a.reason}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">{a.name}</div>
                      <div className="text-xs text-muted italic">„{a.smsText}"</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[{ label: match.home_name, color: hc, list: homeAbs }, { label: match.away_name, color: ac, list: awayAbs }].map(({ label, color, list }) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-heading uppercase">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-muted">{label}</span>
                      <span className="text-muted">({list.length})</span>
                    </div>
                    {list.length === 0 ? (
                      <div className="text-xs text-muted italic">Všichni dorazili</div>
                    ) : list.map((a, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[10px] font-heading font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 shrink-0 mt-0.5">{a.reason}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-heading font-bold text-sm">{a.name}</div>
                          <div className="text-xs text-muted italic">„{a.smsText}"</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ ZKLAMÁNÍ ZÁPASU (jen pokud rating < 5.5) ═══ */}
      {showFlop && flop && flop.player && (() => {
        const s = statsForPlayer(flop.id, flop.player.teamId);
        const teamName = flop.player.teamId === 1 ? match.home_name : match.away_name;
        const teamId = flop.player.teamId === 1 ? match.home_team_id : match.away_team_id;
        return (
          <div className="card p-3 sm:p-4 bg-gray-50 border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-base sm:text-lg shrink-0">😞</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-heading font-bold uppercase tracking-wide text-muted">Zklamání zápasu</div>
                <Link href={`/dashboard/player/${flop.id}`} className="block font-heading font-bold text-base hover:text-pitch-500 transition-colors truncate">
                  {flop.player.name}
                </Link>
                <div className="text-xs text-muted">
                  <Link href={`/dashboard/team/${teamId}`} className="hover:underline">{teamName}</Link>
                  <span> · {POS_LABEL[flop.player.position] ?? flop.player.position}</span>
                  {s.red > 0 && <span> · 🟥</span>}
                  {s.yellow > 0 && <span> · 🟨</span>}
                </div>
              </div>
              <span className="shrink-0 px-2 py-1 rounded-md text-sm font-heading font-bold tabular-nums bg-red-100 text-red-700">
                {flop.rating.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })()}

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
            <div className="max-h-[500px] overflow-y-auto border-t border-gray-100 divide-y divide-gray-50">
              {match.commentary.map((line, i) => {
                const m = line.match(/^(\d+)'\s*[—–-]\s*(.+)$/);
                const minute = m?.[1];
                const text = m?.[2] ?? line;
                return (
                  <div key={i} className="flex items-start gap-3 px-4 sm:px-5 py-2.5 hover:bg-gray-50/50 transition-colors">
                    {minute && (
                      <span className="shrink-0 min-w-[2.25rem] text-center inline-flex items-center justify-center h-6 px-1.5 rounded-md bg-pitch-50 text-pitch-700 text-xs font-heading font-bold tabular-nums">
                        {minute}&apos;
                      </span>
                    )}
                    <span className="text-sm text-ink leading-relaxed flex-1">{text}</span>
                  </div>
                );
              })}
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
