"use client";

import { useState, useEffect, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner, Button, PositionBadge, BadgePreview, JerseyPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

type Pos = "GK" | "DEF" | "MID" | "FWD";

const FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2"] as const;
const TACTICS = [
  { key: "offensive", label: "Útočná", icon: "⚔️" },
  { key: "balanced", label: "Vyrovnaná", icon: "⚖️" },
  { key: "defensive", label: "Defenzivní", icon: "🛡️" },
  { key: "long_ball", label: "Nakopávané", icon: "🏈" },
] as const;

// Vertikální hřiště — GK dole, FWD nahoře. Souřadnice v % (x=0-100, y=0-100)
const POSITIONS: Record<string, Array<{ pos: Pos; x: number; y: number }>> = {
  "4-4-2": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 18, y: 72 }, { pos: "DEF", x: 39, y: 72 }, { pos: "DEF", x: 61, y: 72 }, { pos: "DEF", x: 82, y: 72 },
    { pos: "MID", x: 18, y: 45 }, { pos: "MID", x: 39, y: 45 }, { pos: "MID", x: 61, y: 45 }, { pos: "MID", x: 82, y: 45 },
    { pos: "FWD", x: 36, y: 18 }, { pos: "FWD", x: 64, y: 18 },
  ],
  "4-3-3": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 18, y: 72 }, { pos: "DEF", x: 39, y: 72 }, { pos: "DEF", x: 61, y: 72 }, { pos: "DEF", x: 82, y: 72 },
    { pos: "MID", x: 28, y: 48 }, { pos: "MID", x: 50, y: 45 }, { pos: "MID", x: 72, y: 48 },
    { pos: "FWD", x: 22, y: 18 }, { pos: "FWD", x: 50, y: 15 }, { pos: "FWD", x: 78, y: 18 },
  ],
  "3-5-2": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 28, y: 72 }, { pos: "DEF", x: 50, y: 72 }, { pos: "DEF", x: 72, y: 72 },
    { pos: "MID", x: 12, y: 48 }, { pos: "MID", x: 30, y: 45 }, { pos: "MID", x: 50, y: 42 }, { pos: "MID", x: 70, y: 45 }, { pos: "MID", x: 88, y: 48 },
    { pos: "FWD", x: 36, y: 18 }, { pos: "FWD", x: 64, y: 18 },
  ],
  "4-5-1": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 18, y: 72 }, { pos: "DEF", x: 39, y: 72 }, { pos: "DEF", x: 61, y: 72 }, { pos: "DEF", x: 82, y: 72 },
    { pos: "MID", x: 12, y: 45 }, { pos: "MID", x: 30, y: 42 }, { pos: "MID", x: 50, y: 40 }, { pos: "MID", x: 70, y: 42 }, { pos: "MID", x: 88, y: 45 },
    { pos: "FWD", x: 50, y: 15 },
  ],
  "5-3-2": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 12, y: 72 }, { pos: "DEF", x: 30, y: 72 }, { pos: "DEF", x: 50, y: 72 }, { pos: "DEF", x: 70, y: 72 }, { pos: "DEF", x: 88, y: 72 },
    { pos: "MID", x: 28, y: 45 }, { pos: "MID", x: 50, y: 42 }, { pos: "MID", x: 72, y: 45 },
    { pos: "FWD", x: 36, y: 18 }, { pos: "FWD", x: 64, y: 18 },
  ],
};

const POS_BG: Record<string, string> = { GK: "bg-gold-500", DEF: "bg-blue-500", MID: "bg-pitch-500", FWD: "bg-card-red" };

function attrC(v: number): string {
  if (v >= 70) return "text-pitch-500 font-bold";
  if (v >= 50) return "text-pitch-700";
  if (v >= 30) return "text-ink";
  return "text-muted";
}
function condC(v: number): string {
  if (v >= 80) return "text-pitch-500";
  if (v >= 50) return "text-gold-600";
  return "text-card-red";
}
function moraleIcon(v: number): string {
  if (v >= 80) return "😊";
  if (v >= 60) return "🙂";
  if (v >= 40) return "😐";
  if (v >= 20) return "😞";
  return "😡";
}

interface AvailablePlayer {
  id: string; firstName: string; lastName: string; position: string;
  overallRating: number; age: number; condition: number; morale: number;
  squadNumber?: number;
  speed?: number; technique?: number; shooting?: number; passing?: number;
  heading?: number; defense?: number; goalkeeping?: number; stamina?: number;
  absent?: boolean; absenceReason?: string | null; absenceSms?: string | null; absenceEmoji?: string | null;
  relationships?: Array<{ otherPlayerId: string; type: string }>;
}

const REL_EMOJI: Record<string, string> = {
  brothers: "👨‍👦", father_son: "👴", in_laws: "🤝", classmates: "🎓",
  coworkers: "💼", neighbors: "🏠", drinking_buddies: "🍻", rivals: "⚔️", mentor_pupil: "📚",
};
const REL_LABEL: Record<string, string> = {
  brothers: "Bratři", father_son: "Otec a syn", in_laws: "Příbuzní", classmates: "Spolužáci",
  coworkers: "Kolegové", neighbors: "Sousedi", drinking_buddies: "Kamarádi", rivals: "Rivalové", mentor_pupil: "Mentor",
};

interface NextMatchInfo {
  matchId: string; calendarId: string; gameWeek: number; scheduledAt: string;
  isHome: boolean; homeName: string; awayName: string; homeColor: string; awayColor: string;
}

interface UpcomingMatch {
  calendarId: string; gameWeek: number; scheduledAt: string;
  opponentName: string; isHome: boolean; hasLineup: boolean;
}

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

export default function MatchPageWrapper() {
  return <Suspense><MatchPage /></Suspense>;
}

function MatchPage() {
  const { teamId } = useTeam();
  const searchParams = useSearchParams();
  const [nextMatch, setNextMatch] = useState<NextMatchInfo | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([]);
  const [players, setPlayers] = useState<AvailablePlayer[]>([]);
  const [formation, setFormation] = useState("4-4-2");
  const [tactic, setTactic] = useState("balanced");
  const [selected, setSelected] = useState<(string | null)[]>(Array(11).fill(null));
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [swapSource, setSwapSource] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [captainId, setCaptainId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ nextMatch: NextMatchInfo | null; lineup: { formation: string; tactic: string; players: Array<{ playerId: string }> } | null; availablePlayers: AvailablePlayer[]; upcomingMatches?: UpcomingMatch[] }>(
      `/api/teams/${teamId}/next-match`
    ).then((data) => {
      setNextMatch(data.nextMatch);
      setPlayers(data.availablePlayers ?? []);
      setUpcomingMatches(data.upcomingMatches ?? []);
      if (data.lineup && data.lineup.players.length === 11) {
        setFormation(data.lineup.formation);
        setTactic(data.lineup.tactic);
        setSelected(data.lineup.players.map((p) => p.playerId));
      } else { autoFill(data.availablePlayers ?? [], "4-4-2"); }
      // Auto-select captain: highest leadership in starting 11
      const lineup11 = data.lineup?.players.map((p) => p.playerId) ?? [];
      if (lineup11.length === 11) {
        const best = (data.availablePlayers ?? [])
          .filter((p) => lineup11.includes(p.id))
          .sort((a, b) => ((b as any).leadership ?? 30) - ((a as any).leadership ?? 30))[0];
        if (best) setCaptainId(best.id);
      }
      setLoading(false);
      // If calendarId in URL, switch to that match
      const urlCalId = searchParams.get("calendarId");
      if (urlCalId && data.upcomingMatches) {
        const target = data.upcomingMatches.find((um: UpcomingMatch) => um.calendarId === urlCalId);
        if (target && data.nextMatch && target.calendarId !== data.nextMatch.calendarId) {
          setNextMatch((prev) => prev ? {
            ...prev, calendarId: target.calendarId, gameWeek: target.gameWeek, scheduledAt: target.scheduledAt, isHome: target.isHome,
            homeName: target.isHome ? prev.homeName : target.opponentName,
            awayName: target.isHome ? target.opponentName : prev.homeName,
          } : prev);
          apiFetch<{ lineup: { formation: string; tactic: string; players: Array<{ playerId: string }> } | null }>(`/api/teams/${teamId}/lineup/${urlCalId}`)
            .then((ld) => { if (ld.lineup?.players.length === 11) { setFormation(ld.lineup.formation); setTactic(ld.lineup.tactic); setSelected(ld.lineup.players.map((p) => p.playerId)); } setSaved(!!ld.lineup); })
            .catch((e) => console.error("load lineup from URL:", e));
        }
      }
    }).catch((e) => { console.error("Failed to load next match:", e); setLoading(false); });
  }, [teamId]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const autoFill = (pool: AvailablePlayer[], form: string) => {
    const slots = POSITIONS[form] ?? POSITIONS["4-4-2"];
    const used = new Set<string>();
    const avail = pool.filter((p) => !p.absent);
    const sel: (string | null)[] = [];
    for (const slot of slots) {
      const best = avail.filter((p) => !used.has(p.id) && p.position === slot.pos).sort((a, b) => b.overallRating - a.overallRating)[0];
      if (best) { sel.push(best.id); used.add(best.id); }
      else { const any = avail.filter((p) => !used.has(p.id)).sort((a, b) => b.overallRating - a.overallRating)[0]; if (any) { sel.push(any.id); used.add(any.id); } else sel.push(null); }
    }
    setSelected(sel); setSaved(false);
  };

  const saveLineup = async () => {
    if (!teamId || !nextMatch || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const slots = POSITIONS[formation] ?? POSITIONS["4-4-2"];
      const res = await apiFetch<{ ok?: boolean; error?: string }>(`/api/teams/${teamId}/lineup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: nextMatch.calendarId, formation, tactic, captainId, players: selected.map((id, i) => ({ playerId: id!, matchPosition: slots[i].pos })).filter((p) => p.playerId) }),
      });
      if (res.ok) { setSaved(true); }
      else { setSaveError(res.error ?? "Nepodařilo se uložit sestavu"); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Nepodařilo se uložit sestavu";
      setSaveError(msg);
      console.error("Failed to save lineup:", e);
    }
    setSaving(false);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!nextMatch) return (
    <div className="page-container"><div className="card p-8 text-center">
      <p className="font-heading font-bold text-xl mb-2">Žádný naplánovaný zápas</p>
      <Link href="/dashboard/liga?tab=rozpis" className="btn btn-primary">Zobrazit rozpis</Link>
    </div></div>
  );

  const slots = POSITIONS[formation] ?? POSITIONS["4-4-2"];
  const bench = players.filter((p) => !selected.includes(p.id));
  const absentPlayers = players.filter((p) => p.absent);

  // Relationship summary + chemistry score for selected 11
  const { relSummary, chemistry } = (() => {
    const counts: Record<string, number> = {};
    let chemScore = 50; // base
    const CHEM_BONUS: Record<string, number> = {
      brothers: 5, father_son: 4, mentor_pupil: 4, classmates: 2,
      coworkers: 2, neighbors: 1, drinking_buddies: 2, rivals: -3, in_laws: -1,
    };
    for (const pid of selected) {
      if (!pid) continue;
      const p = players.find((pl) => pl.id === pid);
      if (!p?.relationships) continue;
      for (const r of p.relationships) {
        if (selected.includes(r.otherPlayerId)) {
          counts[r.type] = (counts[r.type] ?? 0) + 1;
        }
      }
    }
    // Each relationship counted twice (A→B + B→A), divide by 2
    const summary = Object.entries(counts).map(([type, count]) => {
      const pairs = Math.floor(count / 2);
      chemScore += pairs * (CHEM_BONUS[type] ?? 0);
      return { type, count: pairs };
    }).filter((r) => r.count > 0);
    return { relSummary: summary, chemistry: Math.max(0, Math.min(100, chemScore)) };
  })();
  const chemColor = chemistry >= 65 ? "text-pitch-500" : chemistry >= 45 ? "text-gold-600" : "text-card-red";
  const chemLabel = chemistry >= 70 ? "Skvělá" : chemistry >= 55 ? "Dobrá" : chemistry >= 40 ? "Průměrná" : "Špatná";

  return (
    <div className="page-container space-y-3">

      {/* ═══ Scrollable match header ═══ */}
      {(() => {
        const currentIdx = upcomingMatches.findIndex((um) => um.calendarId === nextMatch?.calendarId);
        const matchDate = nextMatch.scheduledAt ? new Date(nextMatch.scheduledAt) : null;
        const dateStr = matchDate ? matchDate.toLocaleDateString("cs", { weekday: "short", day: "numeric", month: "numeric" }) : "";
        const now = new Date();
        const daysUntil = matchDate ? Math.max(0, Math.round((matchDate.getTime() - now.getTime()) / 86400000)) : 0;
        const daysLabel = daysUntil === 0 ? "dnes" : daysUntil === 1 ? "zítra" : `za ${daysUntil} dní`;
        const opponentName = nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName;

        const switchToMatch = (um: UpcomingMatch) => {
          setNextMatch((prev) => prev ? {
            ...prev, calendarId: um.calendarId, gameWeek: um.gameWeek, scheduledAt: um.scheduledAt, isHome: um.isHome,
            homeName: um.isHome ? (prev.isHome ? prev.homeName : prev.awayName) : um.opponentName,
            awayName: um.isHome ? um.opponentName : (prev.isHome ? prev.homeName : prev.awayName),
          } : prev);
          if (teamId) {
            apiFetch<{ lineup: { formation: string; tactic: string; players: Array<{ playerId: string }> } | null }>(`/api/teams/${teamId}/lineup/${um.calendarId}`)
              .then((data) => {
                if (data.lineup && data.lineup.players.length === 11) {
                  setFormation(data.lineup.formation); setTactic(data.lineup.tactic); setSelected(data.lineup.players.map((p) => p.playerId));
                }
                setSaved(!!data.lineup);
              })
              .catch((e) => { console.error("load lineup:", e); setSaved(false); });
          }
          setEditSlot(null); setSwapSource(null);
        };

        return (
          <div className="card p-3 flex items-center gap-2">
            <button disabled={currentIdx <= 0} onClick={() => { if (currentIdx > 0) switchToMatch(upcomingMatches[currentIdx - 1]); }}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-lg font-bold">
              ◀
            </button>
            <div className="flex-1 text-center min-w-0">
              <div className="font-heading font-bold text-base truncate">
                vs {opponentName} · <span className="text-pitch-500">{nextMatch.isHome ? "doma" : "venku"}</span> · <span className="text-muted">{daysLabel}</span>
              </div>
              <div className="text-xs text-muted">
                {nextMatch.gameWeek}. kolo · {dateStr}
                {absentPlayers.length > 0 && <span className="ml-2 text-card-red font-heading font-bold">⚠ {absentPlayers.length} nedostupných</span>}
              </div>
            </div>
            <button disabled={currentIdx >= upcomingMatches.length - 1} onClick={() => { if (currentIdx < upcomingMatches.length - 1) switchToMatch(upcomingMatches[currentIdx + 1]); }}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-lg font-bold">
              ▶
            </button>
          </div>
        );
      })()}

      {/* Absent players shown inline in bench table + selector, not as separate card */}

      {/* ═══ Formation + Tactic — one row ═══ */}
      <div className="card p-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1">Formace</div>
            <div className="flex rounded-xl bg-gray-50 p-0.5">
              {FORMATIONS.map((f) => (
                <button key={f} onClick={() => { setFormation(f); autoFill(players, f); }}
                  className={`flex-1 py-1.5 rounded-lg text-center text-xs font-heading font-bold transition-all ${formation === f ? "bg-white shadow-sm text-pitch-600" : "text-muted hover:text-ink"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1">Taktika</div>
            <div className="flex rounded-xl bg-gray-50 p-0.5">
              {TACTICS.map((t) => (
                <button key={t.key} onClick={() => { setTactic(t.key); setSaved(false); }}
                  className={`flex-1 py-1.5 rounded-lg text-center text-xs font-heading font-bold transition-all ${tactic === t.key ? "bg-white shadow-sm text-pitch-600" : "text-muted hover:text-ink"}`}>
                  <span className="hidden sm:inline">{t.icon} </span>{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main layout: pitch left, player list right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ═══ PITCH — kompaktní ═══ */}
        <div>
        {swapSource !== null ? (
          <div className="text-center py-2 mb-1 bg-gold-500/10 rounded-xl">
            <span className="text-sm font-heading font-bold text-gold-600">Klikni na pozici kam chceš hráče přesunout</span>
            <button onClick={() => setSwapSource(null)} className="ml-2 text-sm text-muted hover:text-ink">✕</button>
          </div>
        ) : (
          <p className="text-center text-sm text-ink/50 mb-1">Klik na hráče = prohodit pozice · Dvojklik = vybrat jiného</p>
        )}
        <div className="rounded-xl bg-pitch-400 overflow-hidden" style={{ aspectRatio: "5/6", padding: "2% 5%" }}>
        <div className="relative w-full h-full overflow-visible">
          {/* Pitch markings */}
          <svg viewBox="0 0 68 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Outline */}
            <rect x="4" y="3" width="60" height="94" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.35" />
            {/* Halfway */}
            <line x1="4" y1="50" x2="64" y2="50" stroke="white" strokeWidth="0.3" strokeOpacity="0.35" />
            <circle cx="34" cy="50" r="8" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.25" />
            {/* Penalty areas */}
            <rect x="17" y="3" width="34" height="16" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.2" />
            <rect x="17" y="81" width="34" height="16" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.2" />
            {/* Goal areas */}
            <rect x="24" y="3" width="20" height="6" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.15" />
            <rect x="24" y="91" width="20" height="6" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.15" />
          </svg>

          {/* Player dots */}
          {slots.map((slot, i) => {
            const pid = selected[i];
            const player = pid ? players.find((p) => p.id === pid) : null;
            const isOOP = player && player.position !== slot.pos;
            const num = player?.squadNumber ?? (i + 1);
            const isEditing = editSlot === i;

            const isSwapSource = swapSource === i;
            const isSwapTarget = swapSource !== null && swapSource !== i;

            return (
              <button key={i} onClick={() => {
                if (swapSource !== null && swapSource !== i) {
                  // Swap two players in XI
                  const sel = [...selected];
                  [sel[swapSource], sel[i]] = [sel[i], sel[swapSource]];
                  setSelected(sel); setSwapSource(null); setSaved(false);
                } else if (swapSource === i) {
                  // Deselect swap source, open selector instead
                  setSwapSource(null); setEditSlot(i);
                } else if (selected[i]) {
                  // First click on occupied slot: mark as swap source
                  setSwapSource(i); setEditSlot(null);
                } else {
                  // Empty slot: open selector
                  setEditSlot(isEditing ? null : i); setSwapSource(null);
                }
              }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
                <div className="relative">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-heading font-[800] text-sm sm:text-base shadow-md transition-all ${POS_BG[slot.pos]} ${
                    isEditing ? "scale-125 ring-2 ring-white" : isSwapSource ? "scale-125 ring-2 ring-gold-400 animate-pulse" : isSwapTarget ? "ring-2 ring-white/60" : "group-hover:scale-110"
                  } ${isOOP && !isSwapSource ? "ring-2 ring-gold-400" : ""}`}>
                    {num}
                  </div>
                  {pid === captainId && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gold-500 text-white text-[9px] font-heading font-[800] flex items-center justify-center shadow-sm ring-1 ring-white">C</span>
                  )}
                </div>
                <div className="text-center mt-0.5 leading-tight">
                  <div className="text-xs sm:text-sm font-heading font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    {player?.lastName ?? "—"}{isOOP && " ⚠️"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        </div>
        </div>

        {/* ═══ RIGHT PANEL — player selector or squad list ═══ */}
        <div>
          {/* Desktop selector — inline, replaces XI table */}
          {editSlot !== null && (
            <div className="hidden lg:block card overflow-x-auto mb-3">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="font-heading font-bold text-sm uppercase text-muted">Vybrat hráče — {slots[editSlot].pos}</span>
                <button onClick={() => setEditSlot(null)} className="text-muted hover:text-ink text-lg leading-none">✕</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-muted">
                    <th className="py-1.5 pl-3 w-8 text-center text-xs font-heading">#</th>
                    <th className="py-1.5 text-left text-xs font-heading">Hráč</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Rat</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Rch</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Tch</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Stř</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Obr</th>
                    <th className="py-1.5 text-center text-xs font-heading w-8">Kon</th>
                    <th className="py-1.5 pr-3 text-center text-xs font-heading w-8">Mor</th>
                  </tr>
                </thead>
                <tbody>
                  {players
                    .filter((p) => !selected.includes(p.id) || p.id === selected[editSlot])
                    .sort((a, b) => {
                      if (a.absent && !b.absent) return 1;
                      if (!a.absent && b.absent) return -1;
                      return (a.position === slots[editSlot].pos ? -1 : 1) - (b.position === slots[editSlot].pos ? -1 : 1) || b.overallRating - a.overallRating;
                    })
                    .map((p) => {
                      const isCurrent = p.id === selected[editSlot];
                      const isOOP = p.position !== slots[editSlot].pos;
                      const isAbsent = p.absent;
                      const s = p as any;
                      return (
                        <tr key={p.id}
                          onClick={() => { if (!isAbsent) { const sel = [...selected]; sel[editSlot] = p.id; setSelected(sel); setEditSlot(null); setSaved(false); } }}
                          className={`border-b border-gray-50 last:border-b-0 transition-colors ${
                            isAbsent ? "opacity-35 cursor-not-allowed" : isCurrent ? "bg-pitch-100" : "hover:bg-gray-50 cursor-pointer"
                          } ${isOOP && !isAbsent ? "bg-gold-50/50" : ""}`}>
                          <td className="py-1.5 pl-3 text-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs mx-auto ${POS_BG[p.position]}`}>
                              {p.squadNumber ?? "?"}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            {isAbsent ? (
                              <div>
                                <span className="font-heading font-bold text-sm line-through text-muted">{p.lastName}</span>
                                <div className="text-[10px] text-muted italic">{(p as any).injured ? `Zranění (${(p as any).injuryDays}d)` : ((p as any).absenceSms ?? (p as any).absenceReason ?? "Nedostupný")}</div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="font-heading font-bold text-sm">{isOOP && <span className="text-gold-500 mr-1">⚠️</span>}{p.lastName}</span>
                                  <PositionBadge position={p.position as Pos} />
                                </div>
                                <div className="text-xs text-muted">{p.firstName} · {p.age} let</div>
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 text-center tabular-nums font-heading font-bold">{p.overallRating}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.speed)}`}>{s.speed}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.technique)}`}>{s.technique}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.shooting)}`}>{s.shooting}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.defense)}`}>{s.defense}</td>
                          <td className={`py-1.5 text-center tabular-nums ${condC(p.condition)}`}>{p.condition}%</td>
                          <td className="py-1.5 pr-3 text-center">{moraleIcon(p.morale)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          {/* XI table + bench — always visible */}
          <>
            {/* Starting XI table */}
              <div className="card overflow-x-auto mb-3">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-heading font-bold text-sm uppercase text-muted">Základní sestava</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-muted">
                      <th className="py-1.5 pl-3 w-8 text-center text-xs font-heading" title="Číslo dresu">#</th>
                      <th className="py-1.5 text-left text-xs font-heading">Hráč</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Celkový rating">Rat</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Rychlost">Rch</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Technika">Tch</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Střelba">Stř</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Obrana">Obr</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Kondice">Kon</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Morálka">Mor</th>
                      <th className="py-1.5 pr-3 text-center text-xs font-heading w-8" title="Průměrné hodnocení">Hod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((pid, i) => {
                      const player = pid ? players.find((p) => p.id === pid) : null;
                      if (!player) return null;
                      const isOOP = player.position !== slots[i].pos;
                      const s = player as any;
                      return (
                        <tr key={i} className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer ${isOOP ? "bg-gold-50/50" : ""} ${swapSource === i ? "bg-gold-100 ring-1 ring-gold-400" : ""}`}
                          onClick={() => { setEditSlot(i); setSwapSource(null); }}>
                          <td className="py-1.5 pl-3 text-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs mx-auto ${POS_BG[slots[i].pos]}`}>
                              {player.squadNumber ?? i + 1}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="min-w-0">
                                <span className="font-heading font-bold text-sm leading-tight">{player.lastName}</span>
                                <div className="text-xs text-muted">{player.firstName} · {player.age} let</div>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setCaptainId(captainId === player.id ? null : player.id); setSaved(false); }}
                                className={`shrink-0 w-6 h-6 rounded-full text-[10px] font-heading font-[800] flex items-center justify-center transition-all ${
                                  captainId === player.id ? "bg-gold-500 text-white shadow-sm" : "bg-gray-100 text-muted hover:bg-gold-100 hover:text-gold-600"
                                }`} title="Kapitán">C</button>
                            </div>
                          </td>
                          <td className="py-1.5 text-center tabular-nums font-heading font-bold" title={`Rating: ${player.overallRating}`}>{player.overallRating}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.speed)}`} title={`Rychlost: ${s.speed}`}>{s.speed}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.technique)}`} title={`Technika: ${s.technique}`}>{s.technique}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.shooting)}`} title={`Střelba: ${s.shooting}`}>{s.shooting}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.defense)}`} title={`Obrana: ${s.defense}`}>{s.defense}</td>
                          <td className={`py-1.5 text-center tabular-nums ${condC(player.condition)}`} title={`Kondice: ${player.condition}%`}>{player.condition}%</td>
                          <td className="py-1.5 text-center" title={`Morálka: ${player.morale}%`}>{moraleIcon(player.morale)}</td>
                          <td className="py-1.5 pr-3 text-center tabular-nums font-heading font-bold text-muted" title={`Průměrné hodnocení: ${s.avgRating ? Number(s.avgRating).toFixed(1) : "žádné"}`}>{s.avgRating ? Number(s.avgRating).toFixed(1) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bench */}
              <div className="card overflow-x-auto">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-heading font-bold text-sm uppercase text-muted">Lavička ({bench.length})</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-muted">
                      <th className="py-1.5 pl-3 w-8 text-center text-xs font-heading" title="Číslo dresu">#</th>
                      <th className="py-1.5 text-left text-xs font-heading">Hráč</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Celkový rating">Rat</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Rychlost">Rch</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Technika">Tch</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Střelba">Stř</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Obrana">Obr</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Kondice">Kon</th>
                      <th className="py-1.5 text-center text-xs font-heading w-8" title="Morálka">Mor</th>
                      <th className="py-1.5 pr-3 text-center text-xs font-heading w-8" title="Průměrné hodnocení">Hod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bench.sort((a, b) => {
                      if (a.absent && !b.absent) return 1;
                      if (!a.absent && b.absent) return -1;
                      return b.overallRating - a.overallRating;
                    }).map((p) => {
                      const s = p as any;
                      const isAbsent = p.absent;
                      return (
                        <tr key={p.id}
                          onClick={() => {
                            if (isAbsent) return;
                            if (swapSource !== null) {
                              const sel = [...selected]; sel[swapSource] = p.id; setSelected(sel); setSwapSource(null); setSaved(false);
                            }
                          }}
                          className={`border-b border-gray-50 last:border-b-0 ${isAbsent ? "opacity-35" : ""} ${swapSource !== null && !isAbsent ? "hover:bg-pitch-50 cursor-pointer" : ""}`}>
                          <td className="py-1.5 pl-3 w-8 text-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs mx-auto ${POS_BG[p.position]}`}>
                              {p.squadNumber ?? "?"}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            {isAbsent ? (
                              <div>
                                <span className="font-heading font-bold text-sm leading-tight line-through text-muted">{p.lastName}</span>
                                <div className="text-[10px] text-muted italic">{(p as any).injured ? `Zranění (${(p as any).injuryDays}d)` : ((p as any).absenceSms ?? (p as any).absenceReason ?? "Nedostupný")}</div>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="font-heading font-bold text-sm leading-tight">{p.lastName}</span>
                                  <PositionBadge position={p.position as Pos} />
                                </div>
                                <div className="text-xs text-muted">{p.firstName} · {p.age} let</div>
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 text-center tabular-nums font-heading font-bold" title={`Rating: ${p.overallRating}`}>{p.overallRating}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.speed)}`} title={`Rychlost: ${s.speed}`}>{s.speed}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.technique)}`} title={`Technika: ${s.technique}`}>{s.technique}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.shooting)}`} title={`Střelba: ${s.shooting}`}>{s.shooting}</td>
                          <td className={`py-1.5 text-center tabular-nums ${attrC(s.defense)}`} title={`Obrana: ${s.defense}`}>{s.defense}</td>
                          <td className={`py-1.5 text-center tabular-nums ${condC(p.condition)}`} title={`Kondice: ${p.condition}%`}>{p.condition}%</td>
                          <td className="py-1.5 text-center" title={`Morálka: ${p.morale}%`}>{moraleIcon(p.morale)}</td>
                          <td className="py-1.5 pr-3 text-center tabular-nums font-heading font-bold text-muted" title={`Průměrné hodnocení: ${s.avgRating ? Number(s.avgRating).toFixed(1) : "žádné"}`}>{s.avgRating ? Number(s.avgRating).toFixed(1) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </>
        </div>
      </div>

      {/* ═══ Chemistry + Relationship summary ═══ */}
      <div className="card p-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-center">
            <div className={`font-heading font-[800] text-2xl tabular-nums ${chemColor}`}>{chemistry}</div>
            <div className="text-[9px] text-muted font-heading uppercase">Chemie</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${chemistry >= 65 ? "bg-pitch-400" : chemistry >= 45 ? "bg-gold-400" : "bg-card-red"}`} style={{ width: `${chemistry}%` }} />
              </div>
              <span className={`text-xs font-heading font-bold ${chemColor} shrink-0`}>{chemLabel}</span>
            </div>
            {relSummary.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {relSummary.map((r) => (
                  <span key={r.type} className={`text-[10px] font-heading font-bold px-1.5 py-0.5 rounded ${
                    r.type === "rivals" ? "bg-red-50 text-card-red" : "bg-pitch-50 text-pitch-600"
                  }`}>
                    {REL_EMOJI[r.type]} {r.count}× {REL_LABEL[r.type]?.toLowerCase() ?? r.type}
                  </span>
                ))}
              </div>
            )}
            {relSummary.length === 0 && (
              <div className="text-[10px] text-muted">Žádné aktivní vztahy v sestavě</div>
            )}
          </div>
        </div>
      </div>


      {/* ═══ Save ═══ */}
      <div>
        <button onClick={saveLineup} disabled={saving || selected.some((s) => !s)}
          className={`btn btn-lg w-full ${saved ? "btn-ghost" : "btn-primary"}`}>
          {saving ? "Ukládám..." : saved ? "Sestava uložena ✓" : "Uložit sestavu"}
        </button>
        {saveError && <p className="text-sm text-card-red mt-2 text-center">{saveError}</p>}
      </div>

      {/* ═══ Mobile bottom sheet selector — rendered via portal to escape overflow ═══ */}
      {editSlot !== null && typeof document !== "undefined" && createPortal(
        <div className="lg:hidden">
          <div className="fixed inset-0 z-[9998] bg-black/50" onClick={() => setEditSlot(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-2xl" style={{ maxHeight: "65vh" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="font-heading font-bold text-sm uppercase text-muted">Vybrat — {slots[editSlot].pos}</span>
              <button onClick={() => setEditSlot(null)} className="w-8 h-8 flex items-center justify-center text-muted hover:text-ink text-xl">✕</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(65vh - 48px)" }}>
              {players
                .filter((p) => !selected.includes(p.id) || p.id === selected[editSlot])
                .sort((a, b) => {
                  if (a.absent && !b.absent) return 1;
                  if (!a.absent && b.absent) return -1;
                  return (a.position === slots[editSlot].pos ? -1 : 1) - (b.position === slots[editSlot].pos ? -1 : 1) || b.overallRating - a.overallRating;
                })
                .map((p) => {
                  const isCurrent = p.id === selected[editSlot];
                  const isAbsent = p.absent;
                  return (
                    <button key={p.id} disabled={isAbsent}
                      onClick={() => { const sel = [...selected]; sel[editSlot] = p.id; setSelected(sel); setEditSlot(null); setSaved(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left ${
                        isAbsent ? "opacity-30" : isCurrent ? "bg-pitch-50" : "active:bg-gray-100"
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs shrink-0 ${POS_BG[p.position]}`}>
                        {p.squadNumber ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-heading font-bold text-sm">{p.lastName}</span>
                          <PositionBadge position={p.position as Pos} />
                        </div>
                        <div className="text-xs text-muted">{p.firstName} · {p.overallRating} rat · {p.condition}%</div>
                      </div>
                      <span className="text-sm shrink-0">{moraleIcon(p.morale)}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
