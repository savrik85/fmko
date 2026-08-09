"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction, type Player } from "@/lib/api";
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
  rested?: Array<{ playerId: string; playerName: string }>;
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
  // Custom training days (1=Po, 2=Út, 3=St, 4=Čt, 5=Pá). null = použít default podle sessions.
  const [trainingDays, setTrainingDays] = useState<number[] | null>(null);
  // Týdenní plán: den (1=Po … 5=Pá) → typ tréninku. null = jednotný typ pro všechny dny.
  const [trainingPlan, setTrainingPlan] = useState<Record<number, TrainingType> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [dirty, setDirty] = useState(false);
  const [playerMap, setPlayerMap] = useState<Map<string, string>>(new Map());
  const [squad, setSquad] = useState<Player[]>([]);
  const [restIds, setRestIds] = useState<Set<string>>(new Set());
  const [absences, setAbsences] = useState<Array<{ playerId: string; firstName: string; lastName: string; position: string; absence: { reason?: string; category?: string } | null }>>([]);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<{ type: TrainingType; approach: TrainingApproach; sessionsPerWeek: number; trainingDays: number[] | null; trainingPlan: Record<number, TrainingType> | null; restPlayerIds?: string[]; lastResult: TrainingResult | null }>(
        `/api/teams/${teamId}/training`
      ),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<TrainingStats>(`/api/teams/${teamId}/training-stats`).catch((e) => { console.error("training-stats load:", e); return null; }),
      apiFetch<{ absences: Array<{ playerId: string; firstName: string; lastName: string; position: string; absence: { reason?: string; category?: string } | null }> }>(`/api/teams/${teamId}/absences`).catch((e) => { console.error("absences load:", e); return { absences: [] }; }),
    ]).then(([data, players, statsData, absencesData]) => {
      setType(data.type);
      setApproach(data.approach);
      setSessions(data.sessionsPerWeek);
      setTrainingDays(data.trainingDays ?? null);
      setTrainingPlan(data.trainingPlan ?? null);
      setRestIds(new Set(data.restPlayerIds ?? []));
      setResult(data.lastResult);
      setStats(statsData);
      setAbsences(absencesData.absences ?? []);
      // Squad pro výběr volna — jen aktivní hráči (quit netrénují), unavení (nízká kondice) nahoře
      setSquad(
        players
          .filter((p) => !p.status || p.status === "active")
          .sort((a, b) => (a.lifeContext?.condition ?? 100) - (b.lifeContext?.condition ?? 100))
      );
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
    const ok = await apiAction(
      Promise.all([
        apiFetch(`/api/teams/${teamId}/training`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, approach, sessionsPerWeek: sessions, trainingDays, trainingPlan }),
        }),
        apiFetch(`/api/teams/${teamId}/training-rest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerIds: [...restIds] }),
        }),
      ]),
      "Uložení tréninku se nezdařilo"
    );
    if (ok) setDirty(false);
    setSaving(false);
  };

  const toggleRest = (id: string) => {
    setRestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  return (
    <div className="page-container space-y-5">

      {absences.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>🚫 Chybí dnes ({absences.length})</SectionLabel>
          <div className="mt-2 space-y-1.5">
            {absences.map((a) => (
              <div key={a.playerId} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/dashboard/player/${a.playerId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">
                  {a.firstName} {a.lastName}
                </Link>
                <span className="text-muted text-xs flex-1 text-right">{a.absence?.reason ?? "Důvod neuveden"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Training settings */}
      <div className="card p-4 sm:p-5 space-y-4">
        <SectionLabel>Tréninkový plán</SectionLabel>

        {/* Režim: jeden typ pro celý týden, nebo každý den vlastní */}
        <div className="flex gap-1 bg-surface rounded-xl p-1">
          <button
            onClick={() => {
              // Dny z plánu si ponecháme, ať se návratem k jednotnému tréninku nezmění,
              // kdy tým trénuje — změní se jen to, že všechny dny mají stejný typ.
              if (trainingPlan) {
                const days = Object.keys(trainingPlan).map(Number).sort((a, b) => a - b);
                if (days.length > 0) setTrainingDays(days);
              }
              setTrainingPlan(null);
              setDirty(true);
            }}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              !trainingPlan ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            Stejný každý den
          </button>
          <button
            onClick={() => {
              if (trainingPlan) return;
              // Předvyplnit současným typem na dnech, které tým trénuje teď
              const DEFAULT_DAY_MAP: Record<number, number[]> = { 1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
              const days = trainingDays && trainingDays.length > 0 ? trainingDays : (DEFAULT_DAY_MAP[sessions] ?? [2, 4]);
              setTrainingPlan(Object.fromEntries(days.map((d) => [d, type])) as Record<number, TrainingType>);
              setDirty(true);
            }}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              trainingPlan ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            Plán na týden
          </button>
        </div>

        {/* Týdenní plán — každému dni vlastní typ tréninku (nebo volno) */}
        {trainingPlan && (
          <div className="space-y-1.5">
            {[
              { num: 1, full: "Pondělí" }, { num: 2, full: "Úterý" }, { num: 3, full: "Středa" },
              { num: 4, full: "Čtvrtek" }, { num: 5, full: "Pátek" },
            ].map((d) => {
              const val = trainingPlan[d.num] ?? "";
              return (
                <div key={d.num} className="flex items-center gap-2.5">
                  <div className="w-20 shrink-0 font-heading font-bold text-sm">{d.full}</div>
                  <select
                    value={val}
                    onChange={(e) => {
                      const next = { ...trainingPlan };
                      if (e.target.value === "") delete next[d.num];
                      else next[d.num] = e.target.value as TrainingType;
                      setTrainingPlan(next);
                      setDirty(true);
                    }}
                    className={`flex-1 px-2.5 py-2 rounded-lg border-2 bg-white text-sm font-heading transition-colors ${
                      val ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"
                    }`}
                  >
                    <option value="">— volno —</option>
                    {TRAINING_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
            <div className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2 mt-2">
              Každý den se trénuje to, co mu nastavíš. Dny označené jako volno se netrénují a neplatí se za ně.
              {Object.keys(trainingPlan).length === 0 && (
                <span className="block mt-1 text-card-red font-heading font-bold">⚠ Celý týden volno — tým vůbec netrénuje.</span>
              )}
            </div>
          </div>
        )}

        {/* Type — 2x2 mobile, 4 cols desktop */}
        {!trainingPlan && (
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
        )}

        {/* Info about selected type + approach */}
        <div className="text-xs text-muted bg-gray-50 rounded-lg px-3 py-2 space-y-1">
          {!trainingPlan && (
            <div><span className="font-heading font-bold text-ink">{TRAINING_TYPES.find((t) => t.key === type)?.label}:</span> {TRAINING_TYPES.find((t) => t.key === type)?.desc}. Zlepšuje {TRAINING_TYPES.find((t) => t.key === type)?.skills}.</div>
          )}
          <div><span className="font-heading font-bold text-ink">{APPROACHES.find((a) => a.key === approach)?.label}:</span> {APPROACHES.find((a) => a.key === approach)?.desc}.</div>
          <div>Trénuje se automaticky ve vybraných dnech Po–Pá — jeden den, jeden trénink. Víc tréninkových dnů = rychlejší růst, ale vyšší náklady a únava.</div>
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
            <div className="text-[10px] text-muted font-heading uppercase tracking-wide mb-1.5">Dnů týdně</div>
            <div className="flex rounded-xl bg-gray-50 p-0.5">
              {(() => {
                // Kolikrát tým trénuje = kolik má tréninkových dnů. Tlačítka jsou rychlý předvýběr
                // dnů; zvýrazněné je to, které odpovídá skutečnému počtu vybraných dnů.
                const DAY_PRESET: Record<number, number[]> = { 1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
                const current = (trainingDays && trainingDays.length > 0 ? trainingDays : (DAY_PRESET[sessions] ?? [2, 4])).length;
                return [1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setTrainingDays(DAY_PRESET[n]); setSessions(n); setDirty(true); }}
                    className={`w-8 py-2 rounded-lg text-center font-heading font-bold text-sm transition-all ${
                      current === n ? "bg-white shadow-sm text-pitch-600" : "text-muted hover:text-ink"
                    }`}
                  >
                    {n}
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Training days picker — checkboxes Po-Pá. S týdenním plánem se dny berou z něj. */}
        {!trainingPlan && (() => {
          const DEFAULT_DAY_MAP: Record<number, number[]> = { 1: [2], 2: [2, 4], 3: [1, 3, 5] };
          const effectiveDays = trainingDays && trainingDays.length > 0 ? trainingDays : (DEFAULT_DAY_MAP[sessions] ?? [2, 4]);
          const DAY_LABELS = [
            { num: 1, short: "Po", full: "Pondělí" },
            { num: 2, short: "Út", full: "Úterý" },
            { num: 3, short: "St", full: "Středa" },
            { num: 4, short: "Čt", full: "Čtvrtek" },
            { num: 5, short: "Pá", full: "Pátek" },
          ];
          const isCustom = trainingDays && trainingDays.length > 0;
          const toggleDay = (n: number) => {
            const current = effectiveDays;
            const next = current.includes(n)
              ? current.filter((d) => d !== n)
              : [...current, n].sort((a, b) => a - b);
            // null = reset to default; pole = custom (i prázdné se ukládá jako default)
            setTrainingDays(next.length === 0 ? null : next);
            setDirty(true);
          };
          return (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-[10px] text-muted font-heading uppercase tracking-wide">Dny tréninku</div>
                {isCustom ? (
                  <button
                    onClick={() => { setTrainingDays(null); setDirty(true); }}
                    className="text-[10px] text-pitch-600 hover:underline font-heading"
                  >Vrátit na výchozí</button>
                ) : (
                  <span className="text-[10px] text-muted-light font-heading uppercase">Výchozí</span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {DAY_LABELS.map((d) => {
                  const active = effectiveDays.includes(d.num);
                  return (
                    <button
                      key={d.num}
                      onClick={() => toggleDay(d.num)}
                      title={d.full}
                      className={`py-2.5 rounded-lg text-center font-heading font-bold text-sm transition-all border-2 ${
                        active
                          ? "border-pitch-500 bg-pitch-50/60 text-pitch-700"
                          : "border-transparent bg-gray-50 text-muted hover:text-ink"
                      }`}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted leading-relaxed">
                💡 Trénink den před zápasem oslabí hráče (kondice −3 až −5).{" "}
                <strong className="text-pitch-700">Pokud máš zápas dnes nebo zítra, trénink se automaticky přeskočí.</strong>{" "}
                Doporučení: trénovat brzy v týdnu (Po–St), pokud hraješ o víkendu.
              </div>
            </div>
          );
        })()}
      </div>

      {/* Volno z příštího tréninku */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>🌴 Volno z příštího tréninku{restIds.size > 0 ? ` (${restIds.size})` : ""}</SectionLabel>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Vybraní hráči dostanou od trenéra volno — nejbližší trénink vynechají. Neztratí kondici,
          ale ani se nezlepší. Po proběhnutí tréninku se volno automaticky zruší.
        </p>
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
          {squad.map((p) => {
            const checked = restIds.has(p.id);
            // Zraněnému nejde volno dát (netrénuje tak jako tak), ale dřív nastavené jde odvolat
            const locked = !!p.injury && !checked;
            const cond = p.lifeContext?.condition ?? 100;
            return (
              <div
                key={p.id}
                onClick={() => { if (!locked) toggleRest(p.id); }}
                className={`flex items-center gap-3 px-3 py-2 ${locked ? "opacity-40" : "cursor-pointer hover:bg-gray-50"} ${checked ? "bg-pitch-50/40" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggleRest(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-pitch-500 w-4 h-4 shrink-0"
                />
                <Link
                  href={`/dashboard/player/${p.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-heading font-bold text-base hover:text-pitch-500 transition-colors truncate"
                >
                  {p.first_name} {p.last_name}
                </Link>
                <span className="text-sm text-muted shrink-0">{p.position}</span>
                <span className="flex-1" />
                {p.injury ? (
                  <span className="text-sm text-card-red shrink-0">🤕 Zraněný — netrénuje</span>
                ) : (
                  <span className="text-sm text-muted shrink-0">
                    Kondice{" "}
                    <span className={`font-heading font-bold tabular-nums ${cond >= 70 ? "text-pitch-500" : cond >= 40 ? "text-gold-600" : "text-card-red"}`}>
                      {cond}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save — right after settings, always visible */}
      <div>
        <button
          onClick={savePlan}
          disabled={!dirty || saving}
          className={`btn btn-lg w-full ${dirty ? "btn-primary" : "btn-ghost"}`}
        >
          {saving ? "Ukládám..." : dirty ? "Uložit změny tréninku" : "Vše uloženo"}
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
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-1">
                  {(() => {
                    const maxDelta = Math.max(
                      1,
                      ...[...groupedPositive, ...groupedNegative]
                        .flatMap(([, d]) => d.attrs.map((a) => Math.abs(a.change))),
                    );
                    return (
                      <>
                        {groupedPositive.map(([name, data]) => {
                          const posAttrs = data.attrs.filter((a) => a.change > 0).slice(0, 5);
                          const totalGain = data.attrs.reduce((s, a) => s + Math.max(0, a.change), 0);
                          return (
                            <div key={name} className="py-1.5 border-b border-gray-50 last:border-b-0">
                              <div className="flex items-baseline gap-2">
                                <span className="font-heading font-[800] text-pitch-500 text-sm tabular-nums w-7 text-center shrink-0">+{totalGain}</span>
                                <span className="text-sm"><PlayerLink id={data.playerId} name={name} playerMap={playerMap} /></span>
                              </div>
                              <div className="mt-1 ml-9 space-y-1">
                                {posAttrs.map((a, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs w-4 text-center shrink-0">{ATTR_EMOJI[a.attribute] ?? ""}</span>
                                    <span className="text-xs text-pitch-600 w-20 sm:w-24 shrink-0 truncate">{ATTR_LABELS[a.attribute] ?? a.attribute}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">
                                      <div className="h-full bg-pitch-400 rounded-full transition-all duration-700" style={{ width: `${(a.change / maxDelta) * 100}%` }} />
                                    </div>
                                    <span className="font-heading font-bold text-xs tabular-nums text-pitch-500 w-7 text-right shrink-0">+{a.change}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {groupedNegative.map(([name, data]) => {
                          const negAttrs = data.attrs.slice(0, 5);
                          const totalLoss = data.attrs.reduce((s, a) => s + a.change, 0);
                          return (
                            <div key={name} className="py-1.5 border-b border-gray-50 last:border-b-0">
                              <div className="flex items-baseline gap-2">
                                <span className="font-heading font-[800] text-card-red text-sm tabular-nums w-7 text-center shrink-0">{totalLoss}</span>
                                <span className="text-sm"><PlayerLink id={data.playerId} name={name} playerMap={playerMap} /></span>
                              </div>
                              <div className="mt-1 ml-9 space-y-1">
                                {negAttrs.map((a, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs w-4 text-center shrink-0">{ATTR_EMOJI[a.attribute] ?? ""}</span>
                                    <span className="text-xs text-card-red w-20 sm:w-24 shrink-0 truncate">{ATTR_LABELS[a.attribute] ?? a.attribute}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">
                                      <div className="h-full bg-card-red rounded-full transition-all duration-700" style={{ width: `${(Math.abs(a.change) / maxDelta) * 100}%` }} />
                                    </div>
                                    <span className="font-heading font-bold text-xs tabular-nums text-card-red w-7 text-right shrink-0">{a.change}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </details>
            )}

            {result.improvements.length === 0 && (
              <div className="card p-3 sm:p-4 text-sm text-muted italic">Dnes bez zlepšení</div>
            )}

            {/* ── Rested — volno od trenéra ── */}
            {result.rested && result.rested.length > 0 && (
              <div className="card p-3 sm:p-4">
                <div className="font-heading font-bold text-sm text-pitch-600 mb-1.5">
                  🌴 Volno od trenéra ({result.rested.length})
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {result.rested.map((r) => (
                    <PlayerLink key={r.playerId} id={r.playerId} name={r.playerName} playerMap={playerMap} />
                  ))}
                </div>
              </div>
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
