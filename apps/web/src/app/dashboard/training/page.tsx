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

      {/* Training type selection */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Zaměření tréninku</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TRAINING_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setType(t.key); setDirty(true); }}
              className={`p-3 rounded-xl text-center transition-all border-2 ${
                type === t.key
                  ? "border-pitch-500 bg-pitch-500/5"
                  : "border-transparent bg-surface hover:border-pitch-500/20"
              }`}
            >
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className="font-heading font-bold text-sm">{t.label}</div>
              <div className="text-xs text-muted mt-0.5">{t.skills}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Approach + sessions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5">
          <SectionLabel>Přístup</SectionLabel>
          <div className="space-y-2">
            {APPROACHES.map((a) => (
              <button
                key={a.key}
                onClick={() => { setApproach(a.key); setDirty(true); }}
                className={`w-full p-3 rounded-xl text-left transition-all border-2 ${
                  approach === a.key
                    ? "border-pitch-500 bg-pitch-500/5"
                    : "border-transparent bg-surface hover:border-pitch-500/20"
                }`}
              >
                <div className="font-heading font-bold text-sm">{a.label}</div>
                <div className="text-xs text-muted mt-0.5">{a.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <SectionLabel>Tréninky za týden</SectionLabel>
          <div className="flex gap-3 mt-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => { setSessions(n); setDirty(true); }}
                className={`flex-1 py-4 rounded-xl text-center font-heading font-bold text-2xl transition-all border-2 ${
                  sessions === n
                    ? "border-pitch-500 bg-pitch-500/5 text-pitch-500"
                    : "border-transparent bg-surface text-muted hover:border-pitch-500/20"
                }`}
              >
                {n}x
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-3 text-center">
            Víc tréninků = rychlejší zlepšení, ale horší docházka
          </p>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Výsledek tréninku</SectionLabel>

          {/* Summary bar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-pitch-400 rounded-full transition-all"
                style={{ width: `${(result.attendedCount / result.totalCount) * 100}%` }}
              />
            </div>
            <span className="text-sm font-heading font-bold text-pitch-500 tabular-nums shrink-0">
              {result.attendedCount}/{result.totalCount} na tréninku
            </span>
          </div>

          {/* Improvements */}
          {result.improvements.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-muted font-heading uppercase mb-2">Zlepšení</div>
              <div className="space-y-1">
                {result.improvements.filter((i) => i.change > 0).map((imp, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-pitch-400 font-bold">+{imp.change}</span>
                    <PlayerLink id={imp.playerId} name={imp.playerName} playerMap={playerMap} />
                    <span className="text-muted">{ATTR_LABELS[imp.attribute] ?? imp.attribute}</span>
                  </div>
                ))}
                {result.improvements.filter((i) => i.change < 0).map((imp, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-card-red font-bold">{imp.change}</span>
                    <PlayerLink id={imp.playerId} name={imp.playerName} playerMap={playerMap} />
                    <span className="text-muted">{ATTR_LABELS[imp.attribute] ?? imp.attribute}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.teamChemistry > 0 && (
            <div className="text-sm text-pitch-500 font-medium mb-3">
              Chemie týmu +{result.teamChemistry}
            </div>
          )}

          {/* Attendance detail */}
          <details className="group">
            <summary className="text-xs text-muted font-heading uppercase cursor-pointer hover:text-ink transition-colors">
              Docházka &middot; {result.attendance.filter((a) => !a.attended).length} chybělo
            </summary>
            <div className="mt-2 space-y-1">
              {result.attendance.filter((a) => !a.attended).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1">
                  <span className="text-card-red text-xs">&#10005;</span>
                  <PlayerLink id={a.playerId} name={a.playerName} playerMap={playerMap} />
                  <span className="text-muted italic text-xs">{a.reason}</span>
                </div>
              ))}
              {result.attendance.filter((a) => !a.attended).length === 0 && (
                <p className="text-sm text-pitch-500">Plná docházka!</p>
              )}
            </div>
          </details>
        </div>
      )}

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
