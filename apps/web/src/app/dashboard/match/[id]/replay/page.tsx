"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface MatchEvent { minute: number; type: string; playerId: number; playerName: string; teamId: number; description: string; detail?: string; }
interface MatchData {
  id: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number; round: number | null;
  events: MatchEvent[]; commentary: string[];
  home_name: string; away_name: string; home_color: string; away_color: string;
  home_secondary: string; away_secondary: string; home_badge: string; away_badge: string;
}

type Speed = "live" | "fast" | "instant";
const SPEED_MS: Record<Speed, number> = { live: 3500, fast: 600, instant: 0 };
function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

/* ── Zone from event: 0=home defense, 1=midfield, 2=home attack ── */
function getZone(event: MatchEvent | null): number {
  if (!event) return 1;
  const isHome = event.teamId === 1;
  switch (event.type) {
    case "goal": return isHome ? 2 : 0;
    case "chance": return isHome ? 2 : 0;
    case "foul": return 1;
    case "card": return 1;
    case "injury": return 1;
    case "substitution": return 1;
    case "special":
      if (event.detail === "possession") return isHome ? 2 : 0;
      return 1;
    default: return 1;
  }
}

/* ── Ball X position on pitch (0-100%) ── */
function getBallX(event: MatchEvent | null): number {
  if (!event) return 50;
  const isHome = event.teamId === 1;
  const jitter = (event.minute * 7 + event.playerId * 3) % 15;
  switch (event.type) {
    case "goal": return isHome ? 88 + jitter % 5 : 7 + jitter % 5;
    case "chance": return isHome ? 72 + jitter : 13 + jitter;
    case "foul": return isHome ? 55 + jitter : 30 + jitter;
    case "card": return isHome ? 55 + jitter : 30 + jitter;
    case "special":
      if (event.detail === "possession") return isHome ? 62 + jitter : 23 + jitter;
      return 42 + jitter;
    default: return 45 + jitter % 10;
  }
}

/* ── Stat Bar ── */
function StatBar({ label, home, away, hc, ac }: { label: string; home: number; away: number; hc: string; ac: string }) {
  const total = home + away || 1;
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right font-heading font-bold text-base tabular-nums" style={{ color: `color-mix(in srgb, ${hc} 50%, white)` }}>{home}</span>
      <div className="flex-1 flex h-2.5 rounded-full overflow-hidden bg-white/10">
        <div className="h-full transition-all duration-700 rounded-l-full" style={{ width: `${(home / total) * 100}%`, backgroundColor: `color-mix(in srgb, ${hc} 60%, white)` }} />
        <div className="flex-1" />
        <div className="h-full transition-all duration-700 rounded-r-full" style={{ width: `${(away / total) * 100}%`, backgroundColor: `color-mix(in srgb, ${ac} 60%, white)` }} />
      </div>
      <span className="w-8 text-left font-heading font-bold text-base tabular-nums" style={{ color: `color-mix(in srgb, ${ac} 50%, white)` }}>{away}</span>
      <span className="w-16 text-white/40 text-base font-heading uppercase">{label}</span>
    </div>
  );
}

export default function MatchReplayPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const matchId = params.id as string;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState<Speed>("live");
  const [hg, setHg] = useState(0);
  const [ag, setAg] = useState(0);
  const [finished, setFinished] = useState(false);
  const [htPause, setHtPause] = useState(false);
  const [htDone, setHtDone] = useState(false);
  const [flash, setFlash] = useState<"goal" | "card" | "chance" | "attacking" | null>(null);
  const prevBallX = useRef(50);

  useEffect(() => {
    apiFetch<Record<string, unknown>>(`/api/matches/${matchId}`).then((r) => {
      const ev = typeof r.events === "string" ? JSON.parse(r.events as string) : (r.events ?? []);
      const co = typeof r.commentary === "string" ? JSON.parse(r.commentary as string) : (r.commentary ?? []);
      setMatch({
        id: r.id as string, home_team_id: r.home_team_id as string, away_team_id: r.away_team_id as string,
        home_score: r.home_score as number, away_score: r.away_score as number, round: r.round as number | null,
        events: ev, commentary: co,
        home_name: (r.home_name as string) ?? "Domácí", away_name: (r.away_name as string) ?? "Hosté",
        home_color: (r.home_color as string) ?? "#2D5F2D", away_color: (r.away_color as string) ?? "#D94032",
        home_secondary: (r.home_secondary as string) ?? "#FFF", away_secondary: (r.away_secondary as string) ?? "#FFF",
        home_badge: (r.home_badge as string) ?? "shield", away_badge: (r.away_badge as string) ?? "shield",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [matchId]);

  const markSeen = useCallback(() => {
    if (teamId) apiFetch(`/api/matches/${matchId}/mark-seen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) }).catch(() => {});
  }, [matchId, teamId]);

  const vis = match ? match.events.slice(0, idx) : [];
  const st = {
    hs: vis.filter((e) => e.teamId === 1 && (e.type === "goal" || e.type === "chance")).length,
    as: vis.filter((e) => e.teamId === 2 && (e.type === "goal" || e.type === "chance")).length,
    hf: vis.filter((e) => e.teamId === 1 && e.type === "foul").length,
    af: vis.filter((e) => e.teamId === 2 && e.type === "foul").length,
    hc: vis.filter((e) => e.teamId === 1 && e.type === "card").length,
    ac: vis.filter((e) => e.teamId === 2 && e.type === "card").length,
  };

  const cur = idx > 0 && match ? match.events[idx - 1] : null;
  const curText = cur && match ? (match.commentary[idx - 1] ?? cur.description).replace(/^\d+'\s*—\s*/, "") : "";
  const curMin = cur?.minute ?? 0;
  const ballX = getBallPos_X(cur);
  const zone = getZone(cur);

  function getBallPos_X(event: MatchEvent | null): number {
    const x = getBallX(event);
    return Math.max(5, Math.min(95, x));
  }

  useEffect(() => {
    if (cur) { const t = setTimeout(() => { prevBallX.current = ballX; }, 500); return () => clearTimeout(t); }
  }, [idx, cur, ballX]);

  // Auto-advance
  useEffect(() => {
    if (!match || finished || htPause) return;
    if (idx >= match.events.length) { setFinished(true); setHg(match.home_score); setAg(match.away_score); markSeen(); return; }
    if (speed === "instant") {
      let h = 0, a = 0;
      for (const e of match.events) { if (e.type === "goal") { if (e.teamId === 1) h++; else a++; } }
      setHg(h); setAg(a); setIdx(match.events.length); setFinished(true); markSeen(); return;
    }
    const next = match.events[idx];
    if (next.type === "special" && next.description.includes("Poločas")) { setIdx((i) => i + 1); return; }
    const prev = idx > 0 ? match.events[idx - 1]?.minute ?? 0 : 0;
    if (!htDone && !htPause && prev <= 45 && next.minute > 45) { setHtPause(true); return; }
    // Chances and goals: show "attacking" phase first for drama
    if (next.type === "goal" || next.type === "chance") {
      // Phase 1: ATTACKING — ball rushes toward goal
      setFlash("attacking");
      const attackDur = speed === "fast" ? 1200 : 2500;
      const t = setTimeout(() => {
        // Phase 2: Result
        if (next.type === "goal") {
          if (next.teamId === 1) setHg((s) => s + 1); else setAg((s) => s + 1);
          setFlash("goal");
          setTimeout(() => setFlash(null), 6000);
        } else {
          setFlash("chance");
          setTimeout(() => setFlash(null), 3000);
        }
        setIdx((i) => i + 1);
      }, attackDur);
      return () => clearTimeout(t);
    }

    const delay = SPEED_MS[speed];
    const t = setTimeout(() => {
      if (next.type === "card") { setFlash("card"); setTimeout(() => setFlash(null), 1200); }
      setIdx((i) => i + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [match, idx, speed, finished, htPause, htDone, markSeen]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spinner /></div>;
  if (!match || match.events.length === 0) return (
    <div className="page-container text-center py-20">
      <p className="text-muted text-lg mb-4">Zápas nemá záznam průběhu.</p>
      <button onClick={() => router.push(`/dashboard/match/${matchId}`)} className="btn btn-primary">Zobrazit výsledek</button>
    </div>
  );

  const hc = match.home_color;
  const ac = match.away_color;
  const activeTeamColor = cur ? (cur.teamId === 1 ? hc : ac) : "#666";

  return (
    <div className="max-w-4xl mx-auto px-3 py-2 space-y-1.5">

      {/* ═══ SCOREBOARD ═══ */}
      <div className="rounded-t-xl overflow-hidden" style={{ background: "#0a0a0a" }}>
        <div className="flex items-center px-4 py-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BadgePreview primary={hc} secondary={match.home_secondary} pattern={match.home_badge as BadgePattern} initials={ini(match.home_name)} size={36} />
            <span className="font-heading font-bold text-white text-base sm:text-lg truncate">{match.home_name}</span>
          </div>
          <div className="text-center shrink-0 px-5">
            <div className="font-heading font-[800] text-5xl sm:text-6xl tabular-nums leading-none" style={{ textShadow: "0 0 10px rgba(255,255,255,0.3)" }}>
              <span style={{ color: `color-mix(in srgb, ${hc} 60%, white)` }}>{hg}</span><span className="text-white/20 mx-2">:</span><span style={{ color: `color-mix(in srgb, ${ac} 60%, white)` }}>{ag}</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              {!finished && !htPause && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
              <span className="text-white/50 text-base font-heading font-bold">{finished ? "Konec" : htPause ? "Poločas" : `${curMin}'`}</span>
              {match.round && <span className="text-white/25 text-base font-heading">· {match.round}. kolo</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className="font-heading font-bold text-white text-base sm:text-lg truncate">{match.away_name}</span>
            <BadgePreview primary={ac} secondary={match.away_secondary} pattern={match.away_badge as BadgePattern} initials={ini(match.away_name)} size={36} />
          </div>
        </div>
        {/* Progress bar */}
        {!finished && <div className="h-[2px] bg-white/5"><div className="h-full transition-all duration-1000" style={{ width: `${(curMin / 90) * 100}%`, background: `linear-gradient(90deg, ${hc}, ${ac})` }} /></div>}
      </div>

      {/* ═══ KEY EVENTS TIMELINE — two columns ═══ */}
      {vis.some((e) => e.type === "goal" || e.type === "card" || e.type === "injury") && (
        <div className="overflow-hidden px-4 py-2" style={{ background: "#080f08" }}>
          {vis.filter((e) => e.type === "goal" || e.type === "card" || e.type === "injury").map((e, i) => {
            const isHome = e.teamId === 1;
            const icon = e.type === "goal" ? "\u26BD" : e.type === "card" ? (e.detail === "red" ? "\u{1F7E5}" : "\u{1F7E8}") : "\u{1F3E5}";
            const color = e.type === "goal" ? "text-green-400 font-bold" : e.type === "card" ? (e.detail === "red" ? "text-red-400" : "text-yellow-400") : "text-red-300";
            return (
              <div key={i} className="flex items-center gap-2 py-0.5 text-sm font-heading">
                {/* Home side */}
                <div className="flex-1 text-right">
                  {isHome && <span className={color}>{e.playerName} {icon}</span>}
                </div>
                {/* Minute center */}
                <div className="w-10 text-center tabular-nums text-white/30 text-xs shrink-0">{e.minute}&apos;</div>
                {/* Away side */}
                <div className="flex-1 text-left">
                  {!isHome && <span className={color}>{icon} {e.playerName}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ PITCH VISUALIZATION (bet365/Sportradar style) ═══ */}
      <div className="rounded-b-xl overflow-hidden relative" style={{ background: "#0d1a0d" }}>
        {/* Pitch area */}
        <div className="relative mx-3 my-3" style={{ aspectRatio: "2.2/1" }}>
          {/* Dark pitch with subtle lines */}
          <svg viewBox="0 0 100 45" className="absolute inset-0 w-full h-full">
            {/* Pitch background */}
            <rect width="100" height="45" rx="1" fill="#1a2d1a" />
            {/* Subtle field lines */}
            <g stroke="#2a4a2a" strokeWidth="0.3" fill="none">
              <rect x="2" y="2" width="96" height="41" rx="0.5" />
              <line x1="50" y1="2" x2="50" y2="43" />
              <circle cx="50" cy="22.5" r="8" />
              <rect x="2" y="10" width="14" height="25" />
              <rect x="84" y="10" width="14" height="25" />
              <rect x="2" y="15" width="5" height="15" />
              <rect x="93" y="15" width="5" height="15" />
            </g>

            {/* Active zone highlight */}
            {!finished && (
              <rect
                x={flash === "attacking" && cur ? (cur.teamId === 1 ? 66 : 2) : zone === 0 ? 2 : zone === 1 ? 34 : 66}
                y="2" width="32" height="41" rx="0.5"
                fill="#ffffff"
                opacity={flash === "attacking" ? "0.08" : "0.03"}
                style={{ transition: "x 0.4s ease-out, fill 0.3s, opacity 0.3s" }}
              />
            )}

            {/* ATTACKING: pulsing danger zone near goal */}
            {flash === "attacking" && cur && (
              <rect
                x={cur.teamId === 1 ? 82 : 2} y="8" width="16" height="29" rx="0.5"
                fill={activeTeamColor} opacity="0.15"
              >
                <animate attributeName="opacity" values="0.05;0.25;0.05" dur="0.5s" repeatCount="indefinite" />
              </rect>
            )}

            {/* Shot line for chances/goals */}
            {(flash === "chance" || flash === "goal") && cur && (
              <line
                x1={ballX} y1={12 + (cur.minute % 20)}
                x2={cur.teamId === 1 ? 98 : 2} y2="22.5"
                stroke={flash === "goal" ? "#4ade80" : "#fff"}
                strokeWidth={flash === "goal" ? "0.6" : "0.3"}
                opacity={flash === "goal" ? "0.8" : "0.4"}
                strokeDasharray={flash === "goal" ? "0" : "1 1"}
              >
                <animate attributeName="opacity" values="0.8;0" dur="1s" fill="freeze" />
              </line>
            )}

            {/* GOAL: full pitch flash + text */}
            {flash === "goal" && (
              <g>
                {/* Full pitch green flash */}
                <rect width="100" height="45" rx="1" fill="#4ade80" opacity="0.15">
                  <animate attributeName="opacity" values="0.3;0.05;0.2;0.05;0.15;0" dur="3s" fill="freeze" />
                </rect>
                {/* Goal area burst */}
                {cur && (
                  <circle cx={cur.teamId === 1 ? 95 : 5} cy="22.5" r="5" fill="#4ade80" opacity="0.5">
                    <animate attributeName="r" values="3;15;3" dur="0.6s" repeatCount="3" />
                    <animate attributeName="opacity" values="0.7;0.1;0.7" dur="0.6s" repeatCount="3" />
                  </circle>
                )}
                {/* GOAL text */}
                <text x="50" y="25" textAnchor="middle" fill="#4ade80" fontSize="12" fontWeight="900" fontFamily="var(--font-heading)" opacity="0.9" letterSpacing="3">
                  GÓÓÓL!
                  <animate attributeName="opacity" values="1;0.4;1;0.4;1;0" dur="3.5s" fill="freeze" />
                  <animate attributeName="fontSize" values="10;14;10" dur="0.8s" repeatCount="2" />
                </text>
              </g>
            )}

            {/* Card marker — yellow/red rectangle */}
            {flash === "card" && cur && (
              <g>
                <rect x={ballX - 1.5} y="16" width="3" height="4.5" rx="0.3"
                  fill={cur.detail === "red" ? "#D94032" : "#F5C542"} opacity="0.9">
                  <animate attributeName="opacity" values="1;0.4;1" dur="0.5s" repeatCount="3" />
                </rect>
                <circle cx={ballX} cy="22.5" r="5" fill={cur.detail === "red" ? "#D94032" : "#F5C542"} opacity="0.15">
                  <animate attributeName="r" values="3;8;3" dur="0.8s" repeatCount="2" />
                </circle>
              </g>
            )}

            {/* Injury marker — red cross */}
            {cur && cur.type === "injury" && !flash && (
              <g opacity="0.7">
                <line x1={ballX - 2} y1="22.5" x2={ballX + 2} y2="22.5" stroke="#D94032" strokeWidth="1" />
                <line x1={ballX} y1="20.5" x2={ballX} y2="24.5" stroke="#D94032" strokeWidth="1" />
                <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1s" repeatCount="3" />
              </g>
            )}

            {/* Ball indicator */}
            {!finished && (
              <g>
                <circle
                  cx={flash === "attacking" && cur ? (cur.teamId === 1 ? 90 : 10) : ballX}
                  cy={flash === "attacking" ? 22.5 : 10 + (curMin * 7 + (cur?.playerId ?? 0) * 3) % 25}
                  r="1.2"
                  fill="#fff" opacity="0.9"
                  style={{ transition: flash === "attacking" ? "cx 0.4s ease-in, cy 0.4s ease-in" : "cx 0.8s ease-out, cy 0.8s ease-out" }}
                >
                  <animate attributeName="r" values="1;1.5;1" dur="1.5s" repeatCount="indefinite" />
                </circle>
                {/* Glow */}
                <circle
                  cx={flash === "attacking" && cur ? (cur.teamId === 1 ? 90 : 10) : ballX}
                  cy={flash === "attacking" ? 22.5 : 10 + (curMin * 7 + (cur?.playerId ?? 0) * 3) % 25}
                  r={flash === "attacking" ? 5 : 3}
                  fill={flash === "attacking" ? "#f97316" : "#fff"}
                  opacity={flash === "attacking" ? 0.4 : 0.15}
                  style={{ transition: flash === "attacking" ? "cx 0.4s ease-in, cy 0.4s ease-in" : "cx 0.8s ease-out, cy 0.8s ease-out" }}
                >
                  <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />
                </circle>
              </g>
            )}
          </svg>

          {/* Team name overlays */}
          <div className="absolute left-3 top-1 text-xs font-heading text-white/10 uppercase tracking-widest">{match.home_name.split(" ").pop()}</div>
          <div className="absolute right-3 top-1 text-xs font-heading text-white/10 uppercase tracking-widest">{match.away_name.split(" ").pop()}</div>

          {/* GOAL: full overlay with CSS animation */}
          {flash === "goal" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md overflow-hidden" style={{ animation: "goalFlashBg 5s ease-out forwards" }}>
              <div className="font-heading font-[900] text-6xl sm:text-8xl text-white tracking-widest drop-shadow-[0_0_40px_rgba(74,222,128,0.9)]" style={{ animation: "goalTextPulse 0.7s ease-in-out 5" }}>
                GÓÓÓL!
              </div>
            </div>
          )}

          {/* CHANCE miss overlay */}
          {flash === "chance" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 bg-red-900/10 rounded-md">
              <div className="font-heading font-[800] text-4xl sm:text-5xl text-red-400/60 tracking-widest" style={{ animation: "fadeIn 0.3s ease-out" }}>
                MIMO!
              </div>
            </div>
          )}

          {/* ATTACKING overlay */}
          {flash === "attacking" && (
            <div className="absolute inset-0 pointer-events-none z-10 rounded-md" style={{ animation: "attackPulse 0.5s ease-in-out infinite" }}>
              <div className="absolute inset-y-0 flex items-center" style={{ [cur?.teamId === 1 ? "right" : "left"]: "5%" }}>
                <div className="font-heading font-[900] text-3xl sm:text-5xl text-orange-400/90 tracking-widest drop-shadow-[0_0_20px_rgba(249,115,22,0.5)]">ŠANCE!</div>
              </div>
            </div>
          )}
        </div>

        {/* Stats under pitch */}
        <div className="px-4 pb-3 space-y-1">
          <StatBar label="Střely" home={st.hs} away={st.as} hc={hc} ac={ac} />
          <StatBar label="Fauly" home={st.hf} away={st.af} hc={hc} ac={ac} />
          {(st.hc > 0 || st.ac > 0) && <StatBar label="Karty" home={st.hc} away={st.ac} hc={hc} ac={ac} />}
        </div>
      </div>

      {/* ═══ CONTROLS ═══ */}
      <div className="flex justify-center gap-1.5 py-0.5">
        {!finished && !htPause && (["live", "fast", "instant"] as Speed[]).map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-heading font-bold uppercase tracking-wide transition-all ${
              speed === s ? "text-white shadow-md" : "bg-white/80 text-muted hover:text-ink"
            }`} style={speed === s ? { backgroundColor: hc } : undefined}
          >{s === "live" ? "\u25B6 Živě" : s === "fast" ? "\u25B6\u25B6 Rychle" : "\u25B6\u25B6\u25B6 Konec"}</button>
        ))}
        {htPause && <button onClick={() => { setHtPause(false); setHtDone(true); }} className="px-5 py-1.5 rounded-lg text-sm font-heading font-bold uppercase text-white" style={{ backgroundColor: hc }}>2. poločas {"\u25B6"}</button>}
        {finished && (
          <>
            <button onClick={() => router.push(`/dashboard/match/${matchId}`)} className="px-4 py-1.5 rounded-lg text-sm font-heading font-bold uppercase text-white" style={{ backgroundColor: hc }}>Detail zápasu</button>
            <button onClick={() => router.push("/dashboard")} className="px-4 py-1.5 rounded-lg text-sm font-heading font-bold uppercase bg-white/80 text-muted hover:text-ink">Dashboard</button>
          </>
        )}
      </div>

      {/* ═══ TICKER ═══ */}
      <div className={`rounded-xl overflow-hidden transition-all duration-300 ${
        flash === "goal" ? "ring-2 ring-green-400 shadow-[0_0_30px_rgba(74,222,128,0.3)]"
        : flash === "attacking" ? "ring-1 ring-orange-400/50 shadow-[0_0_15px_rgba(251,146,60,0.15)]"
        : flash === "card" ? "ring-1 ring-yellow-400/50"
        : flash === "chance" ? "ring-1 ring-red-400/30"
        : ""
      }`}>
        <div className={`flex items-stretch min-h-[56px] transition-colors duration-300 ${
          flash === "goal" ? "bg-green-50"
          : flash === "attacking" ? "bg-orange-50"
          : flash === "chance" ? "bg-red-50/30"
          : "bg-white"
        }`}>
          {cur && <div className="w-1.5 shrink-0 transition-colors duration-300" style={{ backgroundColor: flash === "attacking" ? "#f97316" : flash === "goal" ? "#4ade80" : cur.teamId === 1 ? hc : ac }} />}
          <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0" key={flash === "attacking" ? `atk-${idx}` : idx}>
            {flash === "attacking" && cur ? (
              <div className="flex-1 min-w-0 animate-slide-up">
                <span className="font-heading font-[800] text-orange-500 text-xl tracking-wide">ŠANCE! </span>
                <span className="text-lg font-medium text-orange-700/70">{cur.teamId === 1 ? match.home_name : match.away_name} útočí...</span>
              </div>
            ) : cur ? (
              <>
                <span className="font-commentary text-lg text-muted/50 shrink-0 tabular-nums w-10 text-right">{cur.minute}&apos;</span>
                <div className="flex-1 min-w-0 animate-slide-up">
                  {cur.type === "goal" && <span className="font-heading font-[800] text-green-600 text-xl mr-2">GÓÓÓL! </span>}
                  {cur.type === "chance" && <span className="font-heading font-bold text-red-400 mr-1">Mimo! </span>}
                  {cur.type === "card" && <span className="font-heading font-bold text-yellow-500 mr-1">{cur.detail === "red" ? "Červená karta!" : "Žlutá karta!"} </span>}
                  {cur.type === "injury" && <span className="font-heading font-bold text-red-500 mr-1">Zranění! </span>}
                  <span className={`text-lg ${cur.type === "goal" ? "font-bold" : cur.type === "chance" ? "font-medium" : ""}`}>{curText}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted text-sm"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Výkop...</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ END ═══ */}
      {finished && (
        <div className="rounded-xl p-5 text-center animate-slide-up" style={{ background: "#0a0a0a" }}>
          <div className="text-white/30 text-sm font-heading uppercase tracking-widest mb-2">Konec zápasu</div>
          <div className="font-heading font-[800] text-5xl tabular-nums text-white mb-3">
            <span className="text-white">{match.home_score}</span><span className="text-white/20 mx-2">:</span><span className="text-white">{match.away_score}</span>
          </div>
          <div className="flex justify-center gap-6 text-sm text-white/40 font-heading">
            <span>Střely <b className="text-white/60">{st.hs}:{st.as}</b></span>
            <span>Fauly <b className="text-white/60">{st.hf}:{st.af}</b></span>
            <span>Karty <b className="text-white/60">{st.hc}:{st.ac}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
