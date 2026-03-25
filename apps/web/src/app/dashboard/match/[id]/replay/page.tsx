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
  attendance: number | null; stadium_name: string | null; pitch_condition: number | null; weather: string | null;
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
      <span className="w-16 text-white/50 text-base font-heading font-bold uppercase">{label}</span>
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
  const [flash, setFlash] = useState<"goal" | "card" | "chance" | "attacking" | "injury" | null>(null);
  const [flashEvent, setFlashEvent] = useState<MatchEvent | null>(null);
  const animating = useRef(false);
  const [tick, setTick] = useState(0);
  const prevBallX = useRef(50);

  const [stadiumInfo, setStadiumInfo] = useState<{ name: string; pitchCondition: number } | null>(null);

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
        attendance: (r.attendance as number) ?? null, stadium_name: (r.stadium_name as string) ?? null,
        pitch_condition: (r.pitch_condition as number) ?? null, weather: (r.weather as string) ?? null,
      });
      setLoading(false);
      // Fetch stadium info from home team
      const homeId = (r.home_team_id as string);
      apiFetch<Record<string, unknown>>(`/api/teams/${homeId}`).then((team) => {
        setStadiumInfo({
          name: (team.stadium_name as string) ?? (team.name as string) + " stadion",
          pitchCondition: (r.pitch_condition as number) ?? 50,
        });
      }).catch(() => {});
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
    if (!match || finished || htPause || animating.current) return;
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
    // Use ref-based timeout to avoid cleanup issues
    const isShot = next.type === "goal" || next.type === "chance";
    const isDramatic = next.type === "card" || next.type === "injury";

    if (isShot || isDramatic) {
      animating.current = true;

      if (isShot) {
        setFlash("attacking");
        setFlashEvent(next);
        const atkDur = speed === "fast" ? 1800 : 3500;
        setTimeout(() => {
          if (next.type === "goal") {
            if (next.teamId === 1) setHg((s) => s + 1); else setAg((s) => s + 1);
            setFlash("goal");
            setIdx((i) => i + 1);
            setTimeout(() => { setFlash(null); setFlashEvent(null); animating.current = false; setTick((t) => t + 1); }, 6000);
          } else {
            setFlash("chance");
            setIdx((i) => i + 1);
            setTimeout(() => { setFlash(null); setFlashEvent(null); animating.current = false; setTick((t) => t + 1); }, 3000);
          }
        }, atkDur);
      } else {
        setFlashEvent(next);
        setFlash(next.type === "card" ? "card" : "injury");
        setIdx((i) => i + 1);
        const dur = speed === "fast" ? 1500 : 2500;
        setTimeout(() => { setFlash(null); setFlashEvent(null); animating.current = false; setTick((t) => t + 1); }, dur);
      }
      return; // No cleanup — timeouts are fire-and-forget
    }

    const t = setTimeout(() => { setIdx((i) => i + 1); }, SPEED_MS[speed]);
    return () => clearTimeout(t);
  }, [match, idx, speed, finished, htPause, htDone, tick, markSeen]);

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
        {/* Match info bar */}
        <div className="flex items-center justify-center gap-5 px-4 py-2 text-white/60 text-sm font-heading" style={{ background: "#060d06" }}>
          {(match.stadium_name || stadiumInfo?.name) && <span>{match.stadium_name || stadiumInfo?.name}</span>}
          {match.attendance != null && <span>{match.attendance} diváků</span>}
          {(match.pitch_condition ?? stadiumInfo?.pitchCondition) != null && (
            <span>Hřiště: {(match.pitch_condition ?? stadiumInfo?.pitchCondition ?? 50) >= 70 ? "výborné" : (match.pitch_condition ?? stadiumInfo?.pitchCondition ?? 50) >= 40 ? "průměrné" : "špatné"}</span>
          )}
          {match.weather && (
            <span>{match.weather === "sunny" ? "☀️" : match.weather === "cloudy" ? "☁️" : match.weather === "rain" ? "🌧️" : match.weather === "wind" ? "💨" : "❄️"} {match.weather === "sunny" ? "Slunečno" : match.weather === "cloudy" ? "Zataženo" : match.weather === "rain" ? "Déšť" : match.weather === "wind" ? "Vítr" : "Sníh"}</span>
          )}
        </div>
        {/* Progress bar */}
        {!finished && <div className="h-[2px] bg-white/5"><div className="h-full transition-all duration-1000" style={{ width: `${(curMin / 90) * 100}%`, background: `linear-gradient(90deg, ${hc}, ${ac})` }} /></div>}
      </div>



      {/* ═══ PITCH VISUALIZATION (bet365/Sportradar style) ═══ */}
      <div className="rounded-b-xl overflow-hidden relative" style={{ background: "#1a2a1a" }}>
        {/* Pitch area */}
        <div className="relative mx-3 my-3" style={{ aspectRatio: "2.2/1" }}>
          {/* Dark pitch with subtle lines */}
          <svg viewBox="0 0 100 45" className="absolute inset-0 w-full h-full">
            {/* Pitch background — color reflects pitch condition (lighter = better visible) */}
            <rect width="100" height="45" rx="1" fill={
              match.pitch_condition != null
                ? match.pitch_condition >= 70 ? "#2d7a2d"
                  : match.pitch_condition >= 40 ? "#5a7a30"
                  : "#7a6a2a"
                : "#2d7a2d"
            } />
            {/* Pitch wear patches — worse condition = more patches */}
            {match.pitch_condition != null && match.pitch_condition < 80 && (
              <g>
                {Array.from({ length: Math.round((100 - (match.pitch_condition ?? 70)) / 5) }, (_, i) => {
                  const x = 8 + ((i * 37 + 13) % 84);
                  const y = 5 + ((i * 23 + 7) % 35);
                  const w = 3 + (i % 4) * 2;
                  const h = 2 + (i % 3) * 1.5;
                  const isDry = match.pitch_condition! < 40;
                  return (
                    <ellipse key={i} cx={x} cy={y} rx={w} ry={h}
                      fill={isDry ? "#8b7b3a" : "#4a6a25"}
                      opacity={isDry ? 0.4 : 0.25}
                    />
                  );
                })}
              </g>
            )}

            {/* Subtle field lines */}
            <g stroke="#fff" strokeWidth="0.3" fill="none" opacity="0.4">
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
                x={flash === "attacking" && flashEvent ? (flashEvent.teamId === 1 ? 66 : 2) : zone === 0 ? 2 : zone === 1 ? 34 : 66}
                y="2" width="32" height="41" rx="0.5"
                fill="#ffffff"
                opacity={flash === "attacking" ? "0.08" : "0.03"}
                style={{ transition: "x 0.4s ease-out, fill 0.3s, opacity 0.3s" }}
              />
            )}

            {/* ATTACKING: pulsing danger zone near goal */}
            {flash === "attacking" && flashEvent && (
              <rect
                x={cur.teamId === 1 ? 82 : 2} y="8" width="16" height="29" rx="0.5"
                fill={activeTeamColor} opacity="0.15"
              >
                <animate attributeName="opacity" values="0.05;0.25;0.05" dur="0.5s" repeatCount="indefinite" />
              </rect>
            )}

            {/* Shot line for chances/goals */}
            {(flash === "chance" || flash === "goal") && flashEvent && (
              <line
                x1={getBallX(flashEvent)} y1={12 + (flashEvent.minute % 20)}
                x2={flashEvent.teamId === 1 ? 98 : 2} y2="22.5"
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
                  cx={flash === "attacking" && flashEvent ? (flashEvent.teamId === 1 ? 90 : 10) : ballX}
                  cy={flash === "attacking" ? 22.5 : 10 + (curMin * 7 + (cur?.playerId ?? 0) * 3) % 25}
                  r="1.2"
                  fill="#fff" opacity="0.9"
                  style={{ transition: flash === "attacking" ? "cx 0.4s ease-in, cy 0.4s ease-in" : "cx 0.8s ease-out, cy 0.8s ease-out" }}
                >
                  <animate attributeName="r" values="1;1.5;1" dur="1.5s" repeatCount="indefinite" />
                </circle>
                {/* Glow */}
                <circle
                  cx={flash === "attacking" && flashEvent ? (flashEvent.teamId === 1 ? 90 : 10) : ballX}
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

          {/* Team color side bars */}
          <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l" style={{ backgroundColor: hc }} />
          <div className="absolute right-0 top-0 bottom-0 w-2 rounded-r" style={{ backgroundColor: ac }} />

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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md" style={{ background: "rgba(220, 40, 40, 0.12)" }}>
              <div className="font-heading font-[900] text-5xl sm:text-6xl text-white tracking-widest drop-shadow-[0_0_20px_rgba(220,40,40,0.6)]" style={{ animation: "fadeIn 0.2s ease-out" }}>
                MIMO!
              </div>
            </div>
          )}

          {/* CARD overlay */}
          {flash === "card" && flashEvent && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md" style={{ background: flashEvent.detail === "red" ? "rgba(220, 40, 40, 0.15)" : "rgba(245, 197, 66, 0.15)" }}>
              <div className="text-center">
                <div className="font-heading font-[900] text-5xl sm:text-6xl tracking-widest drop-shadow-lg" style={{ color: flashEvent.detail === "red" ? "#ff4444" : "#F5C542", animation: "goalTextPulse 0.5s ease-in-out 2" }}>
                  {flashEvent.detail === "red" ? "ČERVENÁ!" : "ŽLUTÁ!"}
                </div>
                <div className="font-heading font-bold text-white/80 text-xl mt-1">{flashEvent.playerName}</div>
              </div>
            </div>
          )}

          {/* INJURY overlay */}
          {flash === "injury" && flashEvent && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md" style={{ background: "rgba(220, 80, 40, 0.12)" }}>
              <div className="text-center">
                <div className="font-heading font-[900] text-4xl sm:text-5xl text-red-400 tracking-widest drop-shadow-lg" style={{ animation: "fadeIn 0.3s ease-out" }}>
                  ZRANĚNÍ!
                </div>
                <div className="font-heading font-bold text-white/80 text-xl mt-1">{flashEvent.playerName}</div>
              </div>
            </div>
          )}

          {/* ATTACKING overlay */}
          {flash === "attacking" && flashEvent && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-md" style={{ animation: "attackPulse 0.5s ease-in-out infinite" }}>
              <div className="font-heading font-[900] text-5xl sm:text-7xl text-orange-400 tracking-widest drop-shadow-[0_0_30px_rgba(249,115,22,0.6)]" style={{ animation: "goalTextPulse 0.6s ease-in-out infinite" }}>
                ŠANCE!
              </div>
            </div>
          )}
        </div>

        {/* Team labels under pitch */}
        <div className="flex justify-between px-4 pt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: hc }} />
            <span className="font-heading font-bold text-white text-sm">{match.home_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-white text-sm">{match.away_name}</span>
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: ac }} />
          </div>
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
        : flash === "card" ? "ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(245,197,66,0.2)]"
        : flash === "injury" ? "ring-2 ring-red-400 shadow-[0_0_15px_rgba(220,80,40,0.2)]"
        : flash === "chance" ? "ring-1 ring-red-400/50"
        : ""
      }`}>
        <div className={`flex items-stretch min-h-[56px] transition-colors duration-300 ${
          flash === "goal" ? "bg-green-50"
          : flash === "attacking" ? "bg-orange-50"
          : flash === "card" ? "bg-yellow-50"
          : flash === "injury" ? "bg-red-50"
          : flash === "chance" ? "bg-red-50/50"
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

      {/* ═══ KEY EVENTS TIMELINE — bottom ═══ */}
      {vis.some((e) => e.type === "goal" || e.type === "card" || e.type === "injury") && (
        <div className="card rounded-xl overflow-hidden px-4 py-2">
          {vis.filter((e) => e.type === "goal" || e.type === "card" || e.type === "injury").map((e, i) => {
            const isHome = e.teamId === 1;
            const icon = e.type === "goal" ? "\u26BD" : e.type === "card" ? (e.detail === "red" ? "\u{1F7E5}" : "\u{1F7E8}") : "\u{1F3E5}";
            const color = e.type === "goal" ? "text-green-700 font-bold" : e.type === "card" ? (e.detail === "red" ? "text-red-600" : "text-yellow-600") : "text-red-500";
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-base font-heading">
                <div className="flex-1 text-right">{isHome && <span className={color}>{e.playerName} {icon}</span>}</div>
                <div className="w-12 text-center tabular-nums text-muted text-sm shrink-0">{e.minute}&apos;</div>
                <div className="flex-1 text-left">{!isHome && <span className={color}>{icon} {e.playerName}</span>}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Post-match actions */}
      {finished && (
        <div className="flex justify-center py-6">
          <button onClick={() => router.push("/dashboard")} className="btn btn-primary btn-lg text-lg px-10">Pokračovat</button>
        </div>
      )}
    </div>
  );
}
