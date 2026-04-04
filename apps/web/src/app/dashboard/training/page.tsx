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

export default function TrainingPage() {
  const { teamId } = useTeam();
  const [type, setType] = useState<TrainingType>("conditioning");
  const [approach, setApproach] = useState<TrainingApproach>("balanced");
  const [sessions, setSessions] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [playerMap, setPlayerMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<{ type: TrainingType; approach: TrainingApproach; sessionsPerWeek: number; lastResult: TrainingResult | null }>(
        `/api/teams/${teamId}/training`
      ),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
    ]).then(([data, players]) => {
      setType(data.type);
      setApproach(data.approach);
      setSessions(data.sessionsPerWeek);
      setResult(data.lastResult);
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

      {/* Results */}
      {result && (() => {
        const pct = result.totalCount > 0 ? (result.attendedCount / result.totalCount) * 100 : 0;
        const circumference = 2 * Math.PI * 42;
        const strokeDash = (pct / 100) * circumference;
        const absentList = result.attendance.filter((a) => !a.attended);
        const positiveImps = result.improvements.filter((i) => i.change > 0);
        const negativeImps = result.improvements.filter((i) => i.change < 0);
        const trainingLabel = TRAINING_TYPES.find((t) => t.key === type);

        return (
          <div className="card p-4 sm:p-5 space-y-5">
            <SectionLabel>Výsledek tréninku</SectionLabel>

            {/* ── Attendance ring + info ── */}
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-100" />
                  <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" strokeLinecap="round"
                    className="text-pitch-400 transition-all duration-700"
                    style={{ strokeDasharray: `${strokeDash} ${circumference}` }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-heading font-[800] text-xl tabular-nums leading-none">{result.attendedCount}</span>
                  <span className="text-[10px] text-muted leading-tight">/{result.totalCount}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-heading font-bold text-base">
                  {trainingLabel?.icon} {trainingLabel?.label ?? "Trénink"}
                </div>
                <div className="text-sm text-muted mt-0.5">
                  {(result as any).day ? <span className="capitalize">{(result as any).day}</span> : "Poslední trénink"}
                </div>
                {pct === 100 && (
                  <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-600 text-xs font-heading font-bold">
                    Plná docházka
                  </div>
                )}
                {pct < 100 && absentList.length > 0 && (
                  <div className="text-xs text-muted mt-1.5">
                    {absentList.length} chyběl{absentList.length === 1 ? "" : absentList.length < 5 ? "i" : "o"}
                  </div>
                )}
              </div>
            </div>

            {/* ── Improvements — pull cards ── */}
            {positiveImps.length > 0 || negativeImps.length > 0 ? (
              <div>
                <div className="text-xs text-muted font-heading uppercase mb-2 tracking-wide">Zlepšení</div>
                <div className="space-y-1.5">
                  {positiveImps.map((imp, idx) => (
                    <div key={`p${idx}`} className="flex items-center gap-3 rounded-lg bg-pitch-50/60 border border-pitch-100 px-3 py-2">
                      <span className="font-heading font-[800] text-lg text-pitch-500 tabular-nums w-8 text-center shrink-0">+{imp.change}</span>
                      <div className="flex-1 min-w-0">
                        <PlayerLink id={imp.playerId} name={imp.playerName} playerMap={playerMap} />
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm text-pitch-600 shrink-0">
                        <span>{ATTR_EMOJI[imp.attribute] ?? ""}</span>
                        <span className="font-heading font-bold text-xs">{ATTR_LABELS[imp.attribute] ?? imp.attribute}</span>
                      </span>
                    </div>
                  ))}
                  {negativeImps.map((imp, idx) => (
                    <div key={`n${idx}`} className="flex items-center gap-3 rounded-lg bg-red-50/60 border border-red-100 px-3 py-2">
                      <span className="font-heading font-[800] text-lg text-card-red tabular-nums w-8 text-center shrink-0">{imp.change}</span>
                      <div className="flex-1 min-w-0">
                        <PlayerLink id={imp.playerId} name={imp.playerName} playerMap={playerMap} />
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm text-card-red shrink-0">
                        <span>{ATTR_EMOJI[imp.attribute] ?? ""}</span>
                        <span className="font-heading font-bold text-xs">{ATTR_LABELS[imp.attribute] ?? imp.attribute}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-3 text-sm text-muted italic">
                Dnes bez zlepšení — zítra to přijde!
              </div>
            )}

            {/* ── Team chemistry ── */}
            {result.teamChemistry > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pitch-50 text-pitch-600 font-heading font-bold text-sm">
                <span>🤝</span> Chemie +{result.teamChemistry}
              </div>
            )}

            {/* ── Absence list — always visible ── */}
            {absentList.length > 0 && (
              <div>
                <div className="text-xs text-muted font-heading uppercase mb-2 tracking-wide">Chyběli</div>
                <div className="space-y-1">
                  {absentList.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
                      <span className="w-2 h-2 rounded-full bg-card-red mt-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <PlayerLink id={a.playerId} name={a.playerName} playerMap={playerMap} />
                        {a.reason && (
                          <div className="text-xs text-muted italic mt-0.5">&bdquo;{a.reason}&ldquo;</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {absentList.length === 0 && pct === 100 && (
              <div className="text-center text-sm text-pitch-500 font-heading font-bold py-1">
                Nikdo nechyběl!
              </div>
            )}
          </div>
        );
      })()}

      {/* Save footer — always at bottom of page */}
      <div className="pt-2">
        <button
          onClick={savePlan}
          disabled={!dirty || saving}
          className={`btn btn-lg w-full ${dirty ? "btn-primary" : "btn-ghost"}`}
        >
          {saving ? "Ukládám..." : dirty ? "Uložit změny" : "Vše uloženo"}
        </button>
        <p className="text-xs text-muted mt-2 text-center">
          Tréninky probíhají automaticky Po-Pá. Výsledky se zobrazí výše.
        </p>
      </div>
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
