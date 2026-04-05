"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import Link from "next/link";
import { Spinner, SectionLabel } from "@/components/ui";

type TrainingType = "conditioning" | "technique" | "tactics" | "match_practice";
type TrainingApproach = "strict" | "balanced" | "relaxed";

const TRAINING_TYPES: Array<{ key: TrainingType; label: string; icon: string; desc: string; skills: string }> = [
  { key: "conditioning", label: "Kondice", icon: "🏃", desc: "Fyzická příprava", skills: "Výdrž, Rychlost, Síla" },
  { key: "technique", label: "Technika", icon: "⚽", desc: "Práce s míčem", skills: "Technika, Střelba, Kreativita, Standardky" },
  { key: "tactics", label: "Taktika", icon: "🧠", desc: "Herní systém", skills: "Přihrávky, Obrana, Přehled + Chemie" },
  { key: "match_practice", label: "Zápasová praxe", icon: "🎯", desc: "Modelové situace", skills: "Střelba, Hlavičky, Brankář" },
];

const APPROACHES: Array<{ key: TrainingApproach; label: string; desc: string }> = [
  { key: "strict", label: "Přísný", desc: "+docházka, ale hrozí pokles morálky u nedisciplinovaných" },
  { key: "balanced", label: "Vyrovnaný", desc: "Standardní přístup bez extrémů" },
  { key: "relaxed", label: "Pohoda", desc: "Nižší docházka, ale lepší nálada v kabině" },
];

interface TrainingResult {
  attendance: Array<{ playerId?: string; playerName: string; attended: boolean; reason?: string }>;
  improvements: Array<{ playerId?: string; playerName: string; attribute: string; change: number }>;
  teamChemistry: number;
  attendedCount: number;
  totalCount: number;
}

const ATTR_LABELS: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba",
  passing: "Přihrávky", heading: "Hlavičky", defense: "Obrana",
  stamina: "Výdrž", strength: "Síla", goalkeeping: "Brankář",
  vision: "Přehled", creativity: "Kreativita", setPieces: "Standardky",
};

const ATTR_EMOJI: Record<string, string> = {
  speed: "\u26A1", technique: "\u26BD", shooting: "\uD83C\uDFAF",
  passing: "\uD83D\uDCD0", heading: "\uD83D\uDDE3\uFE0F", defense: "\uD83D\uDEE1\uFE0F",
  stamina: "\uD83E\uDEC1", strength: "\uD83D\uDCAA", goalkeeping: "\uD83E\uDDE4",
  vision: "\uD83D\uDC41\uFE0F", creativity: "\uD83C\uDFA8", setPieces: "\uD83C\uDFAA",
};

interface TrainingStats {
  totalImprovements: number;
  totalDeclines: number;
  trainingSessions: number;
  topImprovers: Array<{ playerId: string; name: string; totalGains: number; topAttribute: string }>;
  skillBreakdown: Array<{ attribute: string; gains: number; losses: number }>;
  attendanceTop: Array<{ playerId: string; name: string; attended: number; total: number; pct: number }>;
  attendanceBottom: Array<{ playerId: string; name: string; attended: number; total: number; pct: number }>;
}

export default function TrainingPage() {
  const { teamId } = useTeam();
  const [type, setType] = useState<TrainingType>("conditioning");
  const [approach, setApproach] = useState<TrainingApproach>("balanced");
  const [sessions, setSessions] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [dirty, setDirty] = useState(false);
  const [playerMap, setPlayerMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<{ type: TrainingType; approach: TrainingApproach; sessionsPerWeek: number; lastResult: TrainingResult | null }>(
        `/api/teams/${teamId}/training`
      ),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<TrainingStats>(`/api/teams/${teamId}/training-stats`).catch(() => null),
    ]).then(([data, players, statsData]) => {
      setType(data.type);
      setApproach(data.approach);
      setSessions(data.sessionsPerWeek);
      setResult(data.lastResult);
      setStats(statsData);
      // Build name → id map for linking (covers old results without playerId)
      const map = new Map<string, string>();
      for (const p of players) {
        map.set(`${p.first_name} ${p.last_name}`, p.id);
      }
      setPlayerMap(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  const savePlan = async () => {
    if (!teamId || saving) return;
    setSaving(true);
    await apiFetch(`/api/teams/${teamId}/training`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, approach, sessionsPerWeek: sessions }),
    });
    setDirty(false);
    setSaving(false);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  return (
    <div className="page-container space-y-5">

      {/* Training settings */}
      <div className="card p-4 sm:p-5 space-y-4">
        <SectionLabel>Tréninkový plán</SectionLabel>

        {/* Type — 2x2 mobile, 4 cols desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TRAINING_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setType(t.key); setDirty(true); }}
              className={`flex items-center gap-2 p-2.5 rounded-xl transition-all border-2 ${
                type === t.key
                  ? "border-pitch-500 bg-pitch-50/50"
                  : "border-transparent bg-gray-50 hover:border-pitch-500/20"
              }`}
            >
              <span className="text-xl shrink-0">{t.icon}</span>
              <div className="text-left min-w-0">
                <div className="font-heading font-bold text-sm leading-tight">{t.label}</div>
                <div className="text-[10px] text-muted leading-tight truncate">{t.skills}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Info about selected type + approach */}
        <div className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2 space-y-1">
          <div><span className="font-heading font-bold text-ink">{TRAINING_TYPES.find((t) => t.key === type)?.label}:</span> {TRAINING_TYPES.find((t) => t.key === type)?.desc}. Zlepšuje {TRAINING_TYPES.find((t) => t.key === type)?.skills}.</div>
          <div><span className="font-heading font-bold text-ink">{APPROACHES.find((a) => a.key === approach)?.label}:</span> {APPROACHES.find((a) => a.key === approach)?.desc}.</div>
          <div>Tréninky probíhají automaticky Po–Pá. Víc tréninků = rychlejší růst, ale horší docházka a únava.</div>
        </div>

        {/* Approach + Sessions — side by side */}
        <div className="flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1.5">Přístup</div>
            <div className="flex rounded-xl bg-gray-50 p-0.5">
              {APPROACHES.map((a) => (
                <button
                  key={a.key}
                  onClick={() => { setApproach(a.key); setDirty(true); }}
                  className={`flex-1 py-2 rounded-lg text-center transition-all text-sm font-heading font-bold ${
                    approach === a.key
                      ? "bg-white shadow-sm text-pitch-600"
                      : "text-muted hover:text-ink"
                  }`}
                  title={a.desc}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="shrink-0">
            <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1.5">Týdně</div>
            <div className="flex rounded-xl bg-gray-50 p-0.5">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => { setSessions(n); setDirty(true); }}
                  className={`w-10 py-2 rounded-lg text-center font-heading font-bold text-sm transition-all ${
                    sessions === n
                      ? "bg-white shadow-sm text-pitch-600"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save — right after settings, always visible */}
      <div>
        <button
          onClick={savePlan}
          disabled={!dirty || saving}
          className={`btn btn-lg w-full ${dirty ? "btn-primary" : "btn-ghost"}`}
        >
          {saving ? "Ukládám..." : dirty ? "Uložit změny taktiky" : "Vše uloženo"}
        </button>
      </div>

      {/* Results */}
      {result && (() => {
        const pct = result.totalCount > 0 ? (result.attendedCount / result.totalCount) * 100 : 0;
        const absentList = result.attendance.filter((a) => !a.attended);
        const trainingLabel = TRAINING_TYPES.find((t) => t.key === type);

        // Group improvements by player
        const grouped = new Map<string, { playerId?: string; attrs: Array<{ attribute: string; change: number }> }>();
        for (const imp of result.improvements) {
          const existing = grouped.get(imp.playerName);
          if (existing) {
            existing.attrs.push({ attribute: imp.attribute, change: imp.change });
          } else {
            grouped.set(imp.playerName, { playerId: imp.playerId, attrs: [{ attribute: imp.attribute, change: imp.change }] });
          }
        }
        const groupedPositive = [...grouped.entries()].filter(([, v]) => v.attrs.some((a) => a.change > 0));
        const groupedNegative = [...grouped.entries()].filter(([, v]) => v.attrs.every((a) => a.change < 0));
        const totalUpgrades = result.improvements.filter((i) => i.change > 0).length;

        return (
          <>
            {/* ── Last training header ── */}
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-pitch-500 flex items-center justify-center text-white text-base shrink-0">
                  {trainingLabel?.icon ?? "🏃"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading font-bold text-sm">{trainingLabel?.label ?? "Trénink"}</span>
                    {(result as any).day && <span className="text-xs text-muted capitalize">{(result as any).day}</span>}
                    <span className="text-xs text-muted">·</span>
                    <span className="font-heading font-bold text-sm tabular-nums">
                      <span className="text-pitch-500">{result.attendedCount}</span>
                      <span className="text-muted font-normal">/{result.totalCount}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {totalUpgrades > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-600 text-[11px] font-heading font-bold">+{totalUpgrades} zlepšení</span>
                    )}
                    {result.teamChemistry > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-600 text-[11px] font-heading font-bold">🤝 +{result.teamChemistry} chemie</span>
                    )}
                    {absentList.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-card-red text-[11px] font-heading font-bold">{absentList.length} chyběl{absentList.length === 1 ? "" : absentList.length < 5 ? "i" : "o"}</span>
                    )}
                    {pct === 100 && (
                      <span className="px-1.5 py-0.5 rounded bg-gold-300/20 text-gold-600 text-[11px] font-heading font-bold">Plná účast</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-pitch-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* ── Improvements — own card, collapsible ── */}
            {(groupedPositive.length > 0 || groupedNegative.length > 0) && (
              <details className="card group">
                <summary className="cursor-pointer select-none flex items-center gap-2 p-3 sm:p-4 font-heading font-bold text-sm text-pitch-600 hover:text-pitch-500 transition-colors">
                  <span className="text-[10px] text-muted group-open:rotate-90 transition-transform">&#9654;</span>
                  Zlepšení ({totalUpgrades})
                  {groupedNegative.length > 0 && <span className="text-card-red font-normal text-xs ml-1">· {groupedNegative.length} pokles</span>}
                </summary>
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-0.5">
                  {groupedPositive.map(([name, data]) => (
                    <div key={name} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                      <span className="font-heading font-[800] text-pitch-500 text-sm tabular-nums w-7 text-center shrink-0">
                        +{data.attrs.reduce((s, a) => s + Math.max(0, a.change), 0)}
                      </span>
                      <span className="text-sm"><PlayerLink id={data.playerId} name={name} playerMap={playerMap} /></span>
                      <div className="flex flex-wrap gap-1.5 ml-auto shrink-0">
                        {data.attrs.filter((a) => a.change > 0).map((a, i) => (
                          <span key={i} className="text-xs text-pitch-600">{ATTR_EMOJI[a.attribute] ?? ""} {ATTR_LABELS[a.attribute] ?? a.attribute}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {groupedNegative.map(([name, data]) => (
                    <div key={name} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                      <span className="font-heading font-[800] text-card-red text-sm tabular-nums w-7 text-center shrink-0">
                        {data.attrs.reduce((s, a) => s + a.change, 0)}
                      </span>
                      <span className="text-sm"><PlayerLink id={data.playerId} name={name} playerMap={playerMap} /></span>
                      <div className="flex flex-wrap gap-1.5 ml-auto shrink-0">
                        {data.attrs.map((a, i) => (
                          <span key={i} className="text-xs text-card-red">{ATTR_EMOJI[a.attribute] ?? ""} {ATTR_LABELS[a.attribute] ?? a.attribute}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {result.improvements.length === 0 && (
              <div className="card p-3 sm:p-4 text-sm text-muted italic">Dnes bez zlepšení</div>
            )}

            {/* ── Absences — own card, collapsible ── */}
            {absentList.length > 0 && (
              <details className="card group">
                <summary className="cursor-pointer select-none flex items-center gap-2 p-3 sm:p-4 font-heading font-bold text-sm text-card-red hover:text-red-600 transition-colors">
                  <span className="text-[10px] text-muted group-open:rotate-90 transition-transform">&#9654;</span>
                  Omluvenky ({absentList.length})
                </summary>
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-0.5">
                  {absentList.map((a, i) => (
                    <div key={i} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                      <span className="text-card-red text-xs shrink-0">&#10005;</span>
                      <span className="text-sm"><PlayerLink id={a.playerId} name={a.playerName} playerMap={playerMap} /></span>
                      {a.reason && <span className="text-xs text-muted italic">&mdash; {a.reason}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        );
      })()}

      {/* ═══ Training Stats Dashboard ═══ */}
      {stats && (stats.totalImprovements > 0 || stats.trainingSessions > 0) && (
        <>
          {/* Stat boxes */}
          <div className="grid grid-cols-3 gap-2">
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{stats.totalImprovements}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Zlepšení</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{stats.totalDeclines}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Poklesů</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums">{stats.trainingSessions}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Tréninků</div>
            </div>
          </div>

          {/* Top improvers + Skill breakdown side by side on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Top improvers */}
            {stats.topImprovers.length > 0 && (
              <div className="card p-4 sm:p-5">
                <SectionLabel>Nejvíc se zlepšili</SectionLabel>
                <div className="space-y-1.5">
                  {stats.topImprovers.map((p, i) => {
                    const maxGains = stats.topImprovers[0]?.totalGains ?? 1;
                    return (
                      <div key={p.playerId} className="flex items-center gap-2">
                        <span className="text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <Link href={`/dashboard/player/${p.playerId}`} className="text-sm font-heading font-bold hover:text-pitch-500 transition-colors truncate block">
                            {p.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full bg-pitch-400 rounded-full" style={{ width: `${(p.totalGains / maxGains) * 100}%` }} />
                            </div>
                            <span className="font-heading font-bold text-xs text-pitch-500 tabular-nums shrink-0">+{p.totalGains}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Skill breakdown */}
            {stats.skillBreakdown.length > 0 && (
              <div className="card p-4 sm:p-5">
                <SectionLabel>Podle atributů</SectionLabel>
                <div className="space-y-1.5">
                  {stats.skillBreakdown.filter((s) => s.gains > 0).slice(0, 8).map((s) => {
                    const maxGains = stats.skillBreakdown[0]?.gains ?? 1;
                    return (
                      <div key={s.attribute} className="flex items-center gap-2">
                        <span className="text-sm w-5 shrink-0">{ATTR_EMOJI[s.attribute] ?? ""}</span>
                        <span className="text-xs font-heading font-bold w-16 shrink-0 truncate">{ATTR_LABELS[s.attribute] ?? s.attribute}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-pitch-300 rounded-full" style={{ width: `${(s.gains / maxGains) * 100}%` }} />
                        </div>
                        <span className="font-heading font-bold text-xs tabular-nums text-pitch-500 w-6 text-right shrink-0">+{s.gains}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Attendance top/bottom */}
          {(stats.attendanceTop.length > 0 || stats.attendanceBottom.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.attendanceTop.length > 0 && (
                <div className="card p-4 sm:p-5">
                  <SectionLabel>Nejlepší docházka</SectionLabel>
                  <div className="space-y-1">
                    {stats.attendanceTop.map((p, i) => (
                      <div key={p.playerId} className="flex items-center gap-2 py-1">
                        <span className="text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                        <Link href={`/dashboard/player/${p.playerId}`} className="text-sm font-heading font-bold hover:text-pitch-500 transition-colors truncate flex-1 min-w-0">
                          {p.name}
                        </Link>
                        <span className="text-xs text-muted tabular-nums shrink-0">{p.attended}/{p.total}</span>
                        <span className={`font-heading font-bold text-xs tabular-nums w-9 text-right shrink-0 ${
                          p.pct >= 80 ? "text-pitch-500" : p.pct >= 50 ? "text-gold-600" : "text-card-red"
                        }`}>{p.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.attendanceBottom.length > 0 && (
                <div className="card p-4 sm:p-5">
                  <SectionLabel>Nejhorší docházka</SectionLabel>
                  <div className="space-y-1">
                    {stats.attendanceBottom.map((p, i) => (
                      <div key={p.playerId} className="flex items-center gap-2 py-1">
                        <span className="text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                        <Link href={`/dashboard/player/${p.playerId}`} className="text-sm font-heading font-bold hover:text-pitch-500 transition-colors truncate flex-1 min-w-0">
                          {p.name}
                        </Link>
                        <span className="text-xs text-muted tabular-nums shrink-0">{p.attended}/{p.total}</span>
                        <span className={`font-heading font-bold text-xs tabular-nums w-9 text-right shrink-0 ${
                          p.pct >= 80 ? "text-pitch-500" : p.pct >= 50 ? "text-gold-600" : "text-card-red"
                        }`}>{p.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted text-center">
        Tréninky probíhají automaticky Po–Pá
      </p>
    </div>
  );
}

function PlayerLink({ id, name, playerMap }: { id?: string; name: string; playerMap: Map<string, string> }) {
  const resolvedId = id || playerMap.get(name);
  if (!resolvedId) return <span className="font-medium">{name}</span>;
  return (
    <Link href={`/dashboard/player/${resolvedId}`} className="font-medium hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
      {name}
    </Link>
  );
}
