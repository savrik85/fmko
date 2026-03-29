"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  absent?: boolean; absenceReason?: string | null; absenceSms?: string | null; absenceEmoji?: string | null;
}

interface NextMatchInfo {
  matchId: string; calendarId: string; gameWeek: number; scheduledAt: string;
  isHome: boolean; homeName: string; awayName: string; homeColor: string; awayColor: string;
}

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

export default function MatchPage() {
  const { teamId } = useTeam();
  const [nextMatch, setNextMatch] = useState<NextMatchInfo | null>(null);
  const [players, setPlayers] = useState<AvailablePlayer[]>([]);
  const [formation, setFormation] = useState("4-4-2");
  const [tactic, setTactic] = useState("balanced");
  const [selected, setSelected] = useState<(string | null)[]>(Array(11).fill(null));
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ nextMatch: NextMatchInfo | null; lineup: { formation: string; tactic: string; players: Array<{ playerId: string }> } | null; availablePlayers: AvailablePlayer[] }>(
      `/api/teams/${teamId}/next-match`
    ).then((data) => {
      setNextMatch(data.nextMatch);
      setPlayers(data.availablePlayers ?? []);
      if (data.lineup && data.lineup.players.length === 11) {
        setFormation(data.lineup.formation);
        setTactic(data.lineup.tactic);
        setSelected(data.lineup.players.map((p) => p.playerId));
      } else { autoFill(data.availablePlayers ?? [], "4-4-2"); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  const autoFill = (pool: AvailablePlayer[], form: string) => {
    const slots = POSITIONS[form] ?? POSITIONS["4-4-2"];
    const used = new Set<string>();
    const avail = pool.filter((p) => !p.absent); // skip absent players
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
    const slots = POSITIONS[formation] ?? POSITIONS["4-4-2"];
    await apiFetch(`/api/teams/${teamId}/lineup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId: nextMatch.calendarId, formation, tactic, players: selected.map((id, i) => ({ playerId: id!, matchPosition: slots[i].pos })).filter((p) => p.playerId) }),
    }).catch(() => {});
    setSaving(false); setSaved(true);
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

  return (
    <div className="page-container space-y-4">

      {/* Match header — mobil: jen soupeř, desktop: oba týmy */}
      <div className="card p-4">
        {/* Mobil: kompaktní — soupeř + kolo */}
        <div className="flex items-center justify-center gap-3 sm:hidden">
          <span className="font-heading font-bold text-sm text-muted">vs</span>
          <JerseyPreview primary={nextMatch.isHome ? (nextMatch.awayColor || "#D94032") : (nextMatch.homeColor || "#2D5F2D")} secondary="#FFF" size={36} />
          <BadgePreview primary={nextMatch.isHome ? (nextMatch.awayColor || "#D94032") : (nextMatch.homeColor || "#2D5F2D")} secondary="#FFF" pattern={"shield" as BadgePattern} initials={ini(nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName)} size={32} />
          <span className="font-heading font-bold text-lg">{nextMatch.isHome ? nextMatch.awayName : nextMatch.homeName}</span>
          <span className="text-sm text-muted">· {nextMatch.gameWeek}. kolo</span>
        </div>
        {/* Desktop: plný header */}
        <div className="hidden sm:flex items-center justify-center gap-6">
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className={`font-heading font-bold text-lg text-right ${nextMatch.isHome ? "text-pitch-600" : ""}`}>{nextMatch.homeName}</span>
            <BadgePreview primary={nextMatch.homeColor || "#2D5F2D"} secondary="#FFF" pattern={"shield" as BadgePattern} initials={ini(nextMatch.homeName)} size={28} />
            <JerseyPreview primary={nextMatch.homeColor || "#2D5F2D"} secondary="#FFF" size={32} />
          </div>
          <div className="text-center shrink-0">
            <div className="font-heading font-[800] text-xl text-muted">vs</div>
            <div className="text-sm text-muted">{nextMatch.gameWeek}. kolo</div>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <JerseyPreview primary={nextMatch.awayColor || "#D94032"} secondary="#FFF" size={32} />
            <BadgePreview primary={nextMatch.awayColor || "#D94032"} secondary="#FFF" pattern={"shield" as BadgePattern} initials={ini(nextMatch.awayName)} size={28} />
            <span className={`font-heading font-bold text-lg ${!nextMatch.isHome ? "text-pitch-600" : ""}`}>{nextMatch.awayName}</span>
          </div>
        </div>
      </div>

      {/* Formation + Tactic */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2 sm:justify-center">
        <div className="flex gap-1 bg-surface rounded-xl p-1 justify-between sm:justify-start">
          {FORMATIONS.map((f) => (
            <button key={f} onClick={() => { setFormation(f); autoFill(players, f); }}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${formation === f ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface rounded-xl p-1 justify-between sm:justify-start">
          {TACTICS.map((t) => (
            <button key={t.key} onClick={() => { setTactic(t.key); setSaved(false); }}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${tactic === t.key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Absent players — summary table */}
      {players.filter((p) => p.absent).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <span className="font-heading font-bold text-sm uppercase text-card-red">Nedostupní ({players.filter((p) => p.absent).length})</span>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-50">
              {players.filter((p) => p.absent).map((p) => {
                const reason = (p as any).injured ? `Zranění (${(p as any).injuryDays}d)` : (p.absenceSms ?? p.absenceReason);
                return (
                  <tr key={p.id}>
                    <td className="py-2 pl-4 pr-1 w-8 align-middle"><span>{p.absenceEmoji ?? "❌"}</span></td>
                    <td className="py-2 px-1 align-middle">
                      <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-sm hover:text-pitch-500 transition-colors">{p.firstName} {p.lastName}</Link>
                      <p className="text-sm text-muted sm:hidden">{reason}</p>
                    </td>
                    <td className="py-2 px-1 align-middle hidden sm:table-cell">
                      <span className="text-sm text-muted">{reason}</span>
                    </td>
                    <td className="py-2 pl-1 pr-4 align-middle text-right"><PositionBadge position={p.position as Pos} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Main layout: pitch left, player list right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">

        {/* ═══ PITCH — vertikální, FM style ═══ */}
        <div className="rounded-xl overflow-hidden relative bg-pitch-400" style={{ aspectRatio: "3/4" }}>
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

            return (
              <button key={i} onClick={() => setEditSlot(isEditing ? null : i)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-heading font-[800] text-base shadow-md transition-all ${POS_BG[slot.pos]} ${
                  isEditing ? "scale-125 ring-2 ring-white" : "group-hover:scale-110"
                } ${isOOP ? "ring-2 ring-gold-400" : ""}`}>
                  {num}
                </div>
                <div className="text-center mt-0.5 leading-tight">
                  <div className="text-sm font-heading font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    {player?.lastName ?? "—"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ═══ RIGHT PANEL — player selector or squad list ═══ */}
        <div>
          {editSlot !== null ? (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-heading font-bold text-base">Vybrat hráče — pozice {slots[editSlot].pos}</span>
                <button onClick={() => setEditSlot(null)} className="text-muted hover:text-ink text-lg">✕</button>
              </div>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {players
                  .filter((p) => !selected.includes(p.id) || p.id === selected[editSlot])
                  .sort((a, b) => {
                    // Absent players last
                    if (a.absent && !b.absent) return 1;
                    if (!a.absent && b.absent) return -1;
                    return (a.position === slots[editSlot].pos ? -1 : 1) - (b.position === slots[editSlot].pos ? -1 : 1) || b.overallRating - a.overallRating;
                  })
                  .map((p) => {
                    const isCurrent = p.id === selected[editSlot];
                    const isOOP = p.position !== slots[editSlot].pos;
                    const isAbsent = p.absent;
                    return (
                      <button key={p.id} disabled={isAbsent} onClick={() => {
                        if (isAbsent) return;
                        const s = [...selected]; s[editSlot] = p.id; setSelected(s); setEditSlot(null); setSaved(false);
                      }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isAbsent ? "opacity-40 cursor-not-allowed" : isCurrent ? "bg-pitch-100 ring-1 ring-pitch-400" : "hover:bg-gray-50"
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-heading font-bold text-sm ${POS_BG[p.position]}`}>
                          {p.squadNumber ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-heading font-bold text-base">{p.firstName} {p.lastName}</span>
                          <div className="text-sm text-muted">
                            {isAbsent ? <span className="text-card-red">❌ Nedostupný</span> : `${p.position} · Rat ${p.overallRating} · ${p.age} let`}
                          </div>
                        </div>
                        {isOOP && !isAbsent && <span className="text-gold-500 text-lg shrink-0">⚠️</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
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
                        <tr key={i} className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50 cursor-pointer ${isOOP ? "bg-gold-50/50" : ""}`}
                          onClick={() => setEditSlot(i)}>
                          <td className="py-1.5 pl-3 text-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs mx-auto ${POS_BG[slots[i].pos]}`}>
                              {player.squadNumber ?? i + 1}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            <Link href={`/dashboard/player/${player.id}`} className="font-heading font-bold text-sm leading-tight hover:text-pitch-500 transition-colors">{player.lastName}</Link>
                            <div className="text-xs text-muted">{player.firstName} · {player.age} let</div>
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
                        <tr key={p.id} className={`border-b border-gray-50 last:border-b-0 ${isAbsent ? "opacity-35" : ""}`}>
                          <td className="py-1.5 pl-3 w-8 text-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-heading font-bold text-xs mx-auto ${POS_BG[p.position]}`}>
                              {p.squadNumber ?? "?"}
                            </div>
                          </td>
                          <td className="py-1.5 px-1.5">
                            {isAbsent ? (
                              <div>
                                <span className="font-heading font-bold text-sm leading-tight line-through text-muted">{p.lastName}</span>
                                <div className="text-xs text-card-red">❌ Nedostupný</div>
                              </div>
                            ) : (
                              <>
                                <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-sm leading-tight hover:text-pitch-500 transition-colors">{p.lastName}</Link>
                                <div className="text-xs text-muted">{p.firstName} · {p.age} let</div>
                              </>
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
          )}
        </div>
      </div>

      {/* Save */}
      <div className="pt-2">
        <button onClick={saveLineup} disabled={saving || selected.some((s) => !s)}
          className={`btn btn-lg w-full ${saved ? "btn-ghost" : "btn-primary"}`}>
          {saving ? "Ukládám..." : saved ? "Sestava uložena ✓" : "Uložit sestavu"}
        </button>
        <p className="text-sm text-muted mt-2 text-center">Sestava se použije v příštím automatickém zápase.</p>
      </div>
    </div>
  );
}
