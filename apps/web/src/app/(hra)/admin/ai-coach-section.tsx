"use client";

/**
 * Admin AI trenérů: přepínač režimu po oblastech, povaha trenéra každého AI klubu,
 * poslední rozhodnutí s odůvodněním (anglicky, jen pro admina) a ruční spuštění úlohy.
 * API: apps/api/src/routes/admin-ai-coach.ts
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

type CoachMode = "off" | "shadow" | "on";
type CoachArea = "match" | "weekly" | "market";
type CoachTask = "match" | "weekly" | "hourly";

interface CoachProfile {
  ambition: number;
  thrift: number;
  youthFocus: number;
  risk: number;
  trading: number;
  building: number;
  patience: number;
  favouriteTactic: string;
  favouriteFormations: string[];
}

interface CoachClub {
  teamId: string;
  name: string;
  league: string | null;
  coachName: string | null;
  budget: number;
  reputation: number;
  profile: CoachProfile;
  profileStored: boolean;
  decisions7d: number;
  fallback7d: number;
  lastDecisionAt: string | null;
}

interface ClubsResponse {
  model: string;
  totals: { decisions7d: number; fallback7d: number; errors7d: number; avgLatencyMs: number | null };
  clubs: CoachClub[];
}

interface Decision {
  id: string;
  teamId: string;
  teamName: string | null;
  kind: string;
  mode: string;
  model: string | null;
  contextRef: string | null;
  reasoning: string | null;
  actions: unknown;
  executed: unknown;
  usedFallback: boolean;
  error: string | null;
  latencyMs: number | null;
  tokensOut: number | null;
  createdAt: string;
}

const AREAS: Array<{ key: CoachArea; label: string; note: string }> = [
  { key: "match", label: "Zápas", note: "sestava, taktika, tvrdost, pokyny" },
  { key: "weekly", label: "Týdenní správa", note: "trénink, stadion, vybavení, zaměstnanci" },
  { key: "market", label: "Trh", note: "přestupy a nabídky" },
];

const MODES: Array<{ key: CoachMode; label: string }> = [
  { key: "off", label: "Bez modelu" },
  { key: "shadow", label: "Nanečisto" },
  { key: "on", label: "Zapnuto" },
];

const KIND_LABELS: Record<string, string> = {
  match: "zápas",
  weekly: "týden",
  transfer_reply: "nabídka",
  transfer_market: "trh",
  friendly: "přátelák",
};

const TRAITS: Array<{ key: keyof CoachProfile; label: string }> = [
  { key: "ambition", label: "ambice" },
  { key: "thrift", label: "šetrnost" },
  { key: "youthFocus", label: "mládež" },
  { key: "risk", label: "riziko" },
  { key: "trading", label: "obchod" },
  { key: "building", label: "stavění" },
  { key: "patience", label: "trpělivost" },
];

function formatTime(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("cs", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ModeSwitch({ modes, onChange, busy }: { modes: Record<CoachArea, CoachMode> | null; onChange: (area: CoachArea | "all", mode: CoachMode) => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      {AREAS.map((a) => (
        <div key={a.key}>
          <div className="text-sm font-bold">{a.label}</div>
          <div className="text-sm text-muted mb-1">{a.note}</div>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                disabled={busy}
                onClick={() => onChange(a.key, m.key)}
                className={`px-3 py-1.5 rounded-soft text-sm font-heading disabled:opacity-50 ${
                  modes?.[a.key] === m.key ? "bg-pitch-500 text-white font-bold" : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="text-sm text-muted self-center">Všechno najednou:</span>
        {MODES.map((m) => (
          <button key={m.key} disabled={busy} onClick={() => onChange("all", m.key)}
            className="px-3 py-1.5 rounded-soft text-sm font-heading bg-gray-100 hover:bg-gray-200 disabled:opacity-50">
            {m.label}
          </button>
        ))}
      </div>
      <div className="text-sm text-muted">
        Bez modelu rozhoduje náhradní pravidlo podle povahy trenéra a provede se. Nanečisto model rozhoduje
        a zapisuje do deníku, ale nic se neprovede. Zapnuto: rozhoduje model, při výpadku náhradní pravidlo.
      </div>
    </div>
  );
}

function ClubCard({ club, selected, onSelect }: { club: CoachClub; selected: boolean; onSelect: () => void }) {
  const p = club.profile;
  return (
    <button onClick={onSelect}
      className={`w-full text-left rounded-soft border p-3 transition-colors ${selected ? "border-pitch-500 bg-pitch-50" : "border-line bg-white hover:bg-gray-50"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-heading font-bold text-base truncate">{club.name}</span>
        <span className="text-sm text-muted shrink-0">{club.budget.toLocaleString("cs")} Kč</span>
      </div>
      <div className="text-sm text-muted truncate">
        {club.league ?? "bez ligy"} · {club.coachName ?? "trenér zatím neuložen"}{club.profileStored ? "" : " · povaha neuložená"}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {TRAITS.map((t) => (
          <span key={t.key} className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">
            {t.label} <span className="font-bold">{p[t.key] as number}</span>
          </span>
        ))}
      </div>
      <div className="text-sm mt-2">
        {p.favouriteTactic} · {p.favouriteFormations.join(", ")}
        <span className="text-muted"> · 7 dní: {club.decisions7d} rozhodnutí, náhradní pravidlo {club.fallback7d}×</span>
      </div>
    </button>
  );
}

function DecisionCard({ d }: { d: Decision }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-soft border border-line bg-white p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm text-muted">{formatTime(d.createdAt)}</span>
        <span className="font-heading font-bold text-base">{d.teamName ?? d.teamId.slice(0, 8)}</span>
        <span className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">{KIND_LABELS[d.kind] ?? d.kind}</span>
        <span className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">{d.mode}</span>
        <span className={`text-sm px-2 py-0.5 rounded-soft ${d.usedFallback ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
          {d.usedFallback ? "náhradní pravidlo" : "model"}
        </span>
        {d.latencyMs !== null && <span className="text-sm text-muted">{(d.latencyMs / 1000).toFixed(1)} s</span>}
      </div>
      {d.reasoning && <div className="text-sm mt-1.5 italic break-words">{d.reasoning}</div>}
      {d.error && <div className="text-sm mt-1 text-card-red break-words">{d.error}</div>}
      <button onClick={() => setOpen((o) => !o)} className="text-sm text-pitch-600 mt-1.5 underline">
        {open ? "Skrýt podrobnosti" : "Podrobnosti"}
      </button>
      {open && (
        <pre className="mt-2 bg-gray-50 rounded-soft p-2 text-sm overflow-x-auto whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto">
          {JSON.stringify({ executed: d.executed, decision: d.actions, model: d.model, context: d.contextRef }, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AiCoachSection() {
  const [modes, setModes] = useState<Record<CoachArea, CoachMode> | null>(null);
  const [clubs, setClubs] = useState<ClubsResponse | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState<CoachTask>("match");
  const [dryRun, setDryRun] = useState(true);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  const loadModes = () => {
    apiFetch<{ modes: Record<CoachArea, CoachMode> }>("/api/admin/ai-coach/mode")
      .then((r) => setModes(r.modes))
      .catch((e) => console.error("režim AI trenérů:", e));
  };
  const loadClubs = () => {
    apiFetch<ClubsResponse>("/api/admin/ai-coach/clubs")
      .then(setClubs)
      .catch((e) => console.error("AI kluby:", e));
  };
  const loadDecisions = (teamId: string | null) => {
    const q = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
    apiFetch<{ decisions: Decision[] }>(`/api/admin/ai-coach/decisions?limit=30${q}`)
      .then((r) => setDecisions(r.decisions))
      .catch((e) => console.error("deník AI trenérů:", e));
  };

  useEffect(() => { loadModes(); loadClubs(); }, []);
  useEffect(() => { loadDecisions(selected); }, [selected]);

  const changeMode = async (area: CoachArea | "all", mode: CoachMode) => {
    setBusy(true);
    try {
      const body = area === "all" ? { mode } : { [area]: mode };
      const r = await apiFetch<{ modes: Record<CoachArea, CoachMode> }>("/api/admin/ai-coach/mode", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setModes(r.modes);
    } catch (e) {
      console.error("změna režimu AI trenérů:", e);
      alert("Režim se nepodařilo změnit.");
    } finally {
      setBusy(false);
    }
  };

  const runTask = async () => {
    if (!selected) return;
    if (!dryRun && !confirm("Spustit úlohu AI trenéra naostro? Provede se jako z cronu (sestava, nákupy, nábor).")) return;
    setBusy(true);
    setRunOutput("Běží… (model může přemýšlet i dvě minuty)");
    try {
      const r = await apiFetch<unknown>(`/api/admin/ai-coach/run?teamId=${encodeURIComponent(selected)}&task=${task}${dryRun ? "&dryRun=1" : ""}`, { method: "POST" });
      setRunOutput(JSON.stringify(r, null, 2));
      loadDecisions(selected);
      loadClubs();
    } catch (e) {
      console.error("ruční úloha AI trenéra:", e);
      setRunOutput(`Chyba: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const totals = clubs?.totals;
  const fallbackShare = totals && totals.decisions7d > 0 ? Math.round((totals.fallback7d / totals.decisions7d) * 100) : null;

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <SectionLabel>🤖 Režim AI trenérů</SectionLabel>
        <ModeSwitch modes={modes} onChange={changeMode} busy={busy} />
      </div>

      <div className="card p-4">
        <SectionLabel>📈 Za posledních 7 dní</SectionLabel>
        {totals ? (
          <div className="text-sm space-y-1">
            <div>Model: <span className="font-mono break-all">{clubs?.model}</span></div>
            <div>Rozhodnutí s modelem: <span className="font-bold">{totals.decisions7d}</span>, náhradní pravidlo: <span className="font-bold">{totals.fallback7d}</span>{fallbackShare !== null ? ` (${fallbackShare} %)` : ""}, chyby: <span className="font-bold">{totals.errors7d}</span></div>
            <div>Průměrná doba rozhodnutí: {totals.avgLatencyMs !== null ? `${(totals.avgLatencyMs / 1000).toFixed(1)} s` : "zatím nic"}</div>
          </div>
        ) : <div className="text-sm text-muted">Načítám…</div>}
      </div>

      <div className="card p-4">
        <SectionLabel>🧑‍🏫 AI kluby a povaha trenérů</SectionLabel>
        <div className="text-sm text-muted mb-2">Klepnutím vybereš klub: deník níž se zúží na něj a jde pro něj spustit úloha.</div>
        <div className="space-y-2">
          {(clubs?.clubs ?? []).map((club) => (
            <ClubCard key={club.teamId} club={club} selected={selected === club.teamId}
              onSelect={() => setSelected((s) => (s === club.teamId ? null : club.teamId))} />
          ))}
          {clubs && clubs.clubs.length === 0 && <div className="text-sm text-muted">Žádné AI kluby.</div>}
        </div>
      </div>

      {selected && (
        <div className="card p-4">
          <SectionLabel>▶️ Spustit úlohu</SectionLabel>
          <div className="flex flex-wrap gap-2 mb-2">
            {(["match", "weekly", "hourly"] as const).map((t) => (
              <button key={t} onClick={() => setTask(t)}
                className={`px-3 py-1.5 rounded-soft text-sm font-heading ${task === t ? "bg-pitch-500 text-white font-bold" : "bg-gray-100 hover:bg-gray-200"}`}>
                {t === "match" ? "Sestava na dnešek" : t === "weekly" ? "Týdenní správa" : "Hodinová práce"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Nanečisto (jen rozhodnout a zapsat do deníku)
          </label>
          <button onClick={runTask} disabled={busy}
            className="px-4 py-2 rounded-soft bg-pitch-500 text-white font-heading font-bold text-base disabled:opacity-50">
            Spustit
          </button>
          {runOutput && (
            <pre className="mt-3 bg-gray-50 rounded-soft p-2 text-sm overflow-x-auto whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto">{runOutput}</pre>
          )}
        </div>
      )}

      <div className="card p-4">
        <SectionLabel>📝 Poslední rozhodnutí{selected ? " vybraného klubu" : ""}</SectionLabel>
        <div className="space-y-2">
          {decisions.map((d) => <DecisionCard key={d.id} d={d} />)}
          {decisions.length === 0 && <div className="text-sm text-muted">Deník je zatím prázdný.</div>}
        </div>
      </div>
    </div>
  );
}
