"use client";

/**
 * Záložka AI kluby: režim AI trenérů po oblastech, převzetí opuštěných klubů, AI kluby
 * v tabulce (povaha trenéra a ruční úloha v kartě pod ní) a deník rozhodnutí
 * s odůvodněním (anglicky, jen pro admina).
 * API: apps/api/src/routes/admin-ai-coach.ts, apps/api/src/routes/admin-ai-clubs.ts
 */

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { TACTIC_INFO, type TacticKey } from "@/lib/tactic-info";
import {
  clubList, COACH_AREAS, COACH_MODES, formatTime, KIND_LABELS, relativeTime,
  type CoachArea, type CoachMode, type CoachStatus,
} from "./ai-coach-shared";

type CoachTask = "match" | "weekly" | "hourly";
type DecisionFilter = "all" | "errors" | "fallback";

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

const TRAITS: Array<{ key: keyof CoachProfile; label: string }> = [
  { key: "ambition", label: "ambice" },
  { key: "thrift", label: "šetrnost" },
  { key: "youthFocus", label: "mládež" },
  { key: "risk", label: "riziko" },
  { key: "trading", label: "obchod" },
  { key: "building", label: "stavění" },
  { key: "patience", label: "trpělivost" },
];

const TASKS: Array<{ key: CoachTask; label: string }> = [
  { key: "match", label: "Sestava na dnešek" },
  { key: "weekly", label: "Týdenní správa" },
  { key: "hourly", label: "Hodinová práce" },
];

const DECISION_FILTERS: Array<{ key: DecisionFilter; label: string }> = [
  { key: "all", label: "Vše" },
  { key: "errors", label: "Chyby" },
  { key: "fallback", label: "Bez modelu" },
];

function chipClass(active: boolean): string {
  return `px-3 py-1.5 rounded-soft text-sm font-heading disabled:opacity-50 ${active ? "bg-pitch-500 text-white font-bold" : "bg-gray-100 hover:bg-gray-200"}`;
}

function ModeCard({ modes, onChange, busy }: { modes: Record<CoachArea, CoachMode> | null; onChange: (area: CoachArea | "all", mode: CoachMode) => void; busy: boolean }) {
  return (
    <div className="card p-4">
      <SectionLabel>🎛️ Režim AI trenérů</SectionLabel>
      <div className="divide-y divide-gray-100">
        {COACH_AREAS.map((a) => (
          <div key={a.key} className="py-2.5 first:pt-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-heading font-bold text-base">{a.label}</div>
              <div className="text-sm text-muted">{a.note}</div>
            </div>
            <div role="group" aria-label={`Režim: ${a.label}`} className="flex flex-wrap gap-1.5 shrink-0">
              {COACH_MODES.map((m) => (
                <button key={m.key} disabled={busy} aria-pressed={modes?.[a.key] === m.key}
                  onClick={() => onChange(a.key, m.key)} className={chipClass(modes?.[a.key] === m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
        <span className="text-sm text-muted mr-1">Všechno najednou:</span>
        {COACH_MODES.map((m) => (
          <button key={m.key} disabled={busy} onClick={() => onChange("all", m.key)} className={chipClass(false)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted mt-3">
        Bez modelu rozhoduje náhradní pravidlo podle povahy trenéra a provede se. Nanečisto model rozhoduje
        a zapisuje do deníku, ale nic se neprovede. Zapnuto: rozhoduje model, při výpadku náhradní pravidlo.
      </p>
    </div>
  );
}

function ClubLinks({ clubs }: { clubs: Array<{ teamId: string; name: string }> }) {
  return (
    <>
      {clubs.map((c, i) => (
        <span key={c.teamId}>
          {i > 0 && ", "}
          <Link href={`/tym/${c.teamId}`} className="font-bold hover:underline">{c.name}</Link>
        </span>
      ))}
    </>
  );
}

function TakeoverCard({ status, onDone }: { status: CoachStatus | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!status) return <div className="card p-4 text-sm text-muted">Načítám převzetí klubů…</div>;
  const t = status.takeover;
  const overBrake = t.waitingCount > t.brake;

  const takeOver = async () => {
    const names = clubList(t.waiting, 10);
    const warning = overBrake
      ? `Klubů je ${t.waitingCount}, víc než brzda ${t.brake}. Tolik naráz bývá chyba ve sledování aktivity, ne hromadný odchod hráčů. Zkontroluj seznam.`
      : "Vlastníci se ke klubu můžou vrátit, dokud se nepřihlásí nováček.";
    if (!confirm(`Převzít ${t.waitingCount} opuštěných klubů AI trenérem?\n\n${names}\n\n${warning}`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await apiFetch<{ taken: number }>(`/api/admin/ai-clubs/takeover${overBrake ? "?force=1" : ""}`, { method: "POST" });
      setMessage(`Převzato ${r.taken} klubů.`);
      onDone();
    } catch (e) {
      console.error("ruční převzetí klubů:", e);
      setMessage(`Převzetí selhalo: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <SectionLabel>🏚️ Převzetí opuštěných klubů</SectionLabel>
      <p className="text-sm text-muted">
        Klub převezme AI trenér, když se vlastník 45 dní nepřihlásil. Noční převzetí je{" "}
        <span className="font-bold text-ink">{t.enabled ? "zapnuté" : "vypnuté (ai_club_takeover = off)"}</span>.
        Víc než {t.brake} klubů naráz se samo nepřevezme a čeká na potvrzení tady.
      </p>
      <div className="text-sm space-y-1.5">
        <div>
          <span className="text-muted">Čeká na převzetí ({t.waitingCount}):</span>{" "}
          {t.waiting.length > 0 ? <ClubLinks clubs={t.waiting} /> : "nikdo"}
          {t.waitingCount > t.waiting.length && <span className="text-muted"> a další {t.waitingCount - t.waiting.length}</span>}
        </div>
        <div>
          <span className="text-muted">Do týdne ({t.soon.length}):</span>{" "}
          {t.soon.length > 0 ? <ClubLinks clubs={t.soon} /> : "nikdo"}
        </div>
        <div>
          <span className="text-muted">Převzato za 7 dní ({t.recent.length}):</span>{" "}
          {t.recent.length > 0 ? t.recent.map((c, i) => (
            <span key={c.teamId}>
              {i > 0 && ", "}
              <Link href={`/tym/${c.teamId}`} className="font-bold hover:underline">{c.name}</Link>
              <span className="text-muted"> ({formatTime(c.since)})</span>
            </span>
          )) : "nikdo"}
        </div>
      </div>
      {overBrake && (
        <div className="text-sm font-bold text-card-red">Brzda drží: klubů je víc než {t.brake}, noční převzetí je přeskočí.</div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={takeOver} disabled={busy || t.waitingCount === 0}
          className="px-4 py-2 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm disabled:opacity-50">
          {busy ? "Převádím…" : "Převzít teď"}
        </button>
        {message && <span className="text-sm font-bold text-pitch-600">{message}</span>}
      </div>
    </div>
  );
}

function ClubsCard({ data, selected, onSelect, onRan }: { data: ClubsResponse | null; selected: string | null; onSelect: (teamId: string) => void; onRan: () => void }) {
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const clubs = data?.clubs ?? [];
  const leagues = useMemo(() => [...new Set(clubs.map((c) => c.league ?? "bez ligy"))].sort((a, b) => a.localeCompare(b, "cs")), [clubs]);
  const q = query.trim().toLocaleLowerCase("cs");
  const shown = clubs.filter((c) => (!league || (c.league ?? "bez ligy") === league)
    && (!q || c.name.toLocaleLowerCase("cs").includes(q) || (c.coachName ?? "").toLocaleLowerCase("cs").includes(q)));
  const t = data?.totals;
  const fallbackShare = t && t.decisions7d > 0 ? Math.round((t.fallback7d / t.decisions7d) * 100) : null;

  return (
    <div className="card p-4">
      <SectionLabel>{`🧑‍🏫 AI kluby${data ? ` (${clubs.length})` : ""}`}</SectionLabel>
      {t && (
        <div className="text-sm text-muted mb-3">
          Za 7 dní {t.decisions7d} rozhodnutí, bez modelu {t.fallback7d}{fallbackShare !== null ? ` (${fallbackShare} %)` : ""}, chyby {t.errors7d}
          {t.avgLatencyMs !== null ? ` · průměr ${(t.avgLatencyMs / 1000).toFixed(1)} s` : ""} · model <span className="font-mono break-all">{data?.model}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row mb-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat klub nebo trenéra"
          className="w-full sm:flex-1 border border-gray-200 rounded-soft px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-pitch-400"
          aria-label="Hledat klub nebo trenéra" />
        <select value={league} onChange={(e) => setLeague(e.target.value)} className="select w-full sm:w-64" aria-label="Liga">
          <option value="">Všechny ligy</option>
          {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      {!data && <div className="text-sm text-muted">Načítám…</div>}
      {data && shown.length === 0 && <div className="text-sm text-muted">Žádný klub neodpovídá.</div>}
      {shown.length > 0 && (
        <div className="overflow-x-auto table-scroll -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2 pl-4 pr-2 text-micro font-heading font-bold text-muted uppercase">Klub</th>
                <th className="py-2 px-2 text-micro font-heading font-bold text-muted uppercase hidden md:table-cell">Liga</th>
                <th className="py-2 px-2 text-micro font-heading font-bold text-muted uppercase text-right">Rozpočet</th>
                <th className="py-2 px-2 text-micro font-heading font-bold text-muted uppercase text-right" title="Rozhodnutí za 7 dní">7 dní</th>
                <th className="py-2 px-2 text-micro font-heading font-bold text-muted uppercase hidden lg:table-cell">Poslední</th>
                <th className="py-2 pl-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const isSelected = selected === c.teamId;
                return (
                  <Fragment key={c.teamId}>
                  <tr className={`border-b border-gray-50 ${isSelected ? "bg-pitch-50" : "hover:bg-gray-50/50"}`}>
                    <td className="py-2 pl-4 pr-2">
                      <Link href={`/tym/${c.teamId}`} className="font-heading font-bold text-base hover:underline">{c.name}</Link>
                      <div className="text-sm text-muted md:hidden">{c.league ?? "bez ligy"}</div>
                    </td>
                    <td className="py-2 px-2 text-muted hidden md:table-cell">{c.league ?? "bez ligy"}</td>
                    <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${c.budget < 0 ? "text-card-red font-bold" : ""}`}>
                      {c.budget.toLocaleString("cs")} Kč
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                      {c.decisions7d}
                      {c.fallback7d > 0 && <span className="text-muted"> / {c.fallback7d}</span>}
                    </td>
                    <td className="py-2 px-2 text-muted whitespace-nowrap hidden lg:table-cell">{relativeTime(c.lastDecisionAt)}</td>
                    <td className="py-2 pl-2 pr-4 text-right">
                      <button onClick={() => onSelect(c.teamId)} aria-pressed={isSelected}
                        className="text-sm text-pitch-600 underline whitespace-nowrap py-1">
                        {isSelected ? "Zavřít" : "Detail"}
                      </button>
                    </td>
                  </tr>
                  {isSelected && (
                    <tr className="border-b border-gray-200 bg-pitch-50/40">
                      <td colSpan={6} className="px-4 pt-2 pb-4">
                        <ClubDetail club={c} onRan={onRan} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted mt-2">Sloupec 7 dní: rozhodnutí / z toho bez modelu. Detail ukáže povahu trenéra, spustí úlohu a zúží deník na klub.</p>
    </div>
  );
}

function ClubDetail({ club, onRan }: { club: CoachClub; onRan: () => void }) {
  const [task, setTask] = useState<CoachTask>("match");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const p = club.profile;

  const run = async () => {
    if (!dryRun && !confirm("Spustit úlohu AI trenéra naostro? Provede se jako z cronu (sestava, nákupy, nábor).")) return;
    setBusy(true);
    setOutput("Běží… (model může přemýšlet i dvě minuty)");
    try {
      const r = await apiFetch<unknown>(`/api/admin/ai-coach/run?teamId=${encodeURIComponent(club.teamId)}&task=${task}${dryRun ? "&dryRun=1" : ""}`, { method: "POST" });
      setOutput(JSON.stringify(r, null, 2));
      onRan();
    } catch (e) {
      console.error("ruční úloha AI trenéra:", e);
      setOutput(`Chyba: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-muted">
          Trenér {club.coachName ?? "zatím neuložen"}{club.profileStored ? "" : " · povaha neuložená"} · reputace klubu {club.reputation}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="text-sm font-bold mb-1.5">Povaha trenéra</div>
          <div className="flex flex-wrap gap-1.5">
            {TRAITS.map((t) => (
              <span key={t.key} className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">
                {t.label} <span className="font-bold">{p[t.key] as number}</span>
              </span>
            ))}
          </div>
          <div className="text-sm mt-2">
            Oblíbená taktika {TACTIC_INFO[p.favouriteTactic as TacticKey]?.label ?? p.favouriteTactic}, rozestavení {p.favouriteFormations.join(", ")}
          </div>
          <div className="text-sm text-muted mt-1">
            Za 7 dní {club.decisions7d} rozhodnutí, bez modelu {club.fallback7d}× · poslední {relativeTime(club.lastDecisionAt)}
          </div>
        </div>
        <div>
          <div className="text-sm font-bold mb-1.5">Spustit úlohu</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TASKS.map((t) => (
              <button key={t.key} onClick={() => setTask(t.key)} aria-pressed={task === t.key} className={chipClass(task === t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Nanečisto (jen rozhodnout a zapsat do deníku)
          </label>
          <button onClick={run} disabled={busy}
            className="px-4 py-2 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm disabled:opacity-50">
            {busy ? "Běží…" : "Spustit"}
          </button>
        </div>
      </div>
      {output && (
        <pre className="bg-gray-50 rounded-soft p-2 text-sm overflow-x-auto whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto">{output}</pre>
      )}
    </div>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm text-muted">{formatTime(d.createdAt)}</span>
        <Link href={`/tym/${d.teamId}`} className="font-heading font-bold text-base hover:underline">{d.teamName ?? d.teamId.slice(0, 8)}</Link>
        <span className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">{KIND_LABELS[d.kind] ?? d.kind}</span>
        {d.mode !== "on" && <span className="text-sm px-2 py-0.5 rounded-soft bg-gray-100">{d.mode === "shadow" ? "nanečisto" : "bez modelu"}</span>}
        <span className={`text-sm px-2 py-0.5 rounded-soft ${d.usedFallback ? "bg-gold-100 text-gold-700" : "bg-pitch-50 text-pitch-700"}`}>
          {d.usedFallback ? "náhradní pravidlo" : "model"}
        </span>
        {d.latencyMs !== null && <span className="text-sm text-muted">{(d.latencyMs / 1000).toFixed(1)} s</span>}
      </div>
      {d.error && <div className="text-sm mt-1 text-card-red break-words">{d.error}</div>}
      {d.reasoning && <div className={`text-sm mt-1 italic break-words ${open ? "" : "line-clamp-2"}`}>{d.reasoning}</div>}
      <button onClick={() => setOpen((o) => !o)} className="text-sm text-pitch-600 mt-1 underline">
        {open ? "Skrýt podrobnosti" : "Podrobnosti"}
      </button>
      {open && (
        <pre className="mt-2 bg-gray-50 rounded-soft p-2 text-sm overflow-x-auto whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto">
          {JSON.stringify({ executed: d.executed, decision: d.actions, model: d.model, context: d.contextRef }, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function AiCoachSection() {
  const [modes, setModes] = useState<Record<CoachArea, CoachMode> | null>(null);
  const [clubs, setClubs] = useState<ClubsResponse | null>(null);
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);

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
  const loadStatus = () => {
    apiFetch<CoachStatus>("/api/admin/ai-coach/status")
      .then(setStatus)
      .catch((e) => console.error("stav AI trenérů:", e));
  };
  const loadDecisions = () => {
    const params = new URLSearchParams({ limit: "40" });
    if (selected) params.set("teamId", selected);
    if (filter !== "all") params.set("only", filter);
    if (kind) params.set("kind", kind);
    apiFetch<{ decisions: Decision[] }>(`/api/admin/ai-coach/decisions?${params}`)
      .then((r) => setDecisions(r.decisions))
      .catch((e) => console.error("deník AI trenérů:", e));
  };

  useEffect(() => { loadModes(); loadClubs(); loadStatus(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDecisions(); }, [selected, filter, kind]);

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

  const selectedClub = clubs?.clubs.find((c) => c.teamId === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        <ModeCard modes={modes} onChange={changeMode} busy={busy} />
        <TakeoverCard status={status} onDone={() => { loadStatus(); loadClubs(); }} />
      </div>

      <ClubsCard data={clubs} selected={selected} onSelect={(id) => setSelected((s) => (s === id ? null : id))}
        onRan={() => { loadDecisions(); loadClubs(); }} />

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <SectionLabel>{`📝 Deník rozhodnutí${selectedClub ? `: ${selectedClub.name}` : ""}`}</SectionLabel>
          {selectedClub && (
            <button onClick={() => setSelected(null)} className="text-sm text-pitch-600 underline">Všechny kluby</button>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <div role="group" aria-label="Filtr deníku" className="flex flex-wrap gap-1.5">
            {DECISION_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={chipClass(filter === f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="select w-full sm:w-56" aria-label="Druh rozhodnutí">
            <option value="">Všechny druhy</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {decisions === null && <div className="text-sm text-muted">Načítám…</div>}
        {decisions && decisions.length === 0 && <div className="text-sm text-muted">Nic takového v deníku není.</div>}
        {decisions && decisions.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {decisions.map((d) => <DecisionRow key={d.id} d={d} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
