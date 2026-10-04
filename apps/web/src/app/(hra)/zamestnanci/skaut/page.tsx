"use client";

/**
 * Skaut: úkol (koho a kde hledat) a hlášení, která posílá (spec 2026-10-04).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { ScoutReportSheet, daysLeft, type ScoutReport } from "@/components/scouting/ScoutReportSheet";
import { ratingText } from "@/components/scouting/WillingnessBadge";
import {
  SCOUT_POSITION_LABELS, SCOUT_POSITIONS, SCOUT_REPORT_STATUS_LABELS, SCOUT_YOUTH_AGE_MAX, type ScoutPosition,
} from "@okresni-masina/shared";

interface Assignment {
  id: string;
  position: ScoutPosition | null;
  age_min: number;
  age_max: number;
  radius_km: number;
  weekly_cost: number;
  weeks_total: number;
  weeks_worked: number;
  reports_sent: number;
  clubs_visited: number;
  revisit_report_id: string | null;
}

interface ScoutData {
  scout: { id: string; name: string; eff: number } | null;
  assignment: Assignment | null;
  lastAssignment: (Assignment & { status: string; end_reason: string | null }) | null;
  options: {
    radiusTiers: Array<{ km: number; label: string; weeklyCost: number }>;
    weeks: number[];
    ageMin: number;
    ageMax: number;
    youthAgeMax: number;
  };
  reports: ScoutReport[];
  pastReports: ScoutReport[];
}

const kc = (v: number) => `${v.toLocaleString("cs")} Kč`;

/** České tvary počtu: 1 klub, 2–4 kluby, 5+ klubů. */
function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function ReportRow({ r, onOpen }: { r: ScoutReport; onOpen: () => void }) {
  const live = r.status === "active" || r.status === "negotiating";
  return (
    <button onClick={onOpen} className="card p-3 w-full text-left flex items-center gap-3 hover:bg-pitch-50/40 transition-colors">
      {Object.keys(r.avatar ?? {}).length > 0
        ? <FaceAvatar faceConfig={r.avatar} size={40} className="rounded-full shrink-0" />
        : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-heading font-bold text-base">{r.firstName} {r.lastName}</span>
          <PositionBadge position={r.position as "GK" | "DEF" | "MID" | "FWD"} />
          <span className="text-sm text-muted">{r.age} let</span>
          <span className="text-sm font-heading font-bold tabular-nums">{ratingText(r.ratingLo, r.ratingHi)}</span>
        </div>
        <div className="text-sm text-muted truncate">
          {r.source === "free_agent" ? `Volný hráč · okres ${r.district}` : r.clubName} · {r.distanceKm} km
        </div>
        <div className="text-sm font-heading font-bold text-muted">
          {r.status === "active" ? `Platí ještě ${daysLeft(r.expiresAt)} d` : SCOUT_REPORT_STATUS_LABELS[r.status]}
        </div>
      </div>
      <span className={`shrink-0 ${live ? "text-pitch-500" : "text-muted"}`}>→</span>
    </button>
  );
}

export default function ScoutPage() {
  const { teamId } = useTeam();
  const { confirm, dialog } = useConfirm({ sheet: true });
  const [data, setData] = useState<ScoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Formulář úkolu
  const [position, setPosition] = useState<ScoutPosition | null>(null);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(30);
  const [radius, setRadius] = useState(30);
  const [weeks, setWeeks] = useState(4);

  const load = useCallback(async () => {
    if (!teamId) return;
    try {
      setData(await apiFetch<ScoutData>(`/api/teams/${teamId}/scout`));
    } catch (e) {
      console.error("Načtení skauta selhalo:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("hlaseni");
    if (id) setOpenReport(id);
  }, []);

  if (loading && !data) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;
  if (!data || !teamId) return <div className="p-6 text-center text-muted">Skauta se nepodařilo načíst.</div>;

  const tier = data.options.radiusTiers.find((t) => t.km === radius) ?? data.options.radiusTiers[0];
  const youth = ageMax <= SCOUT_YOUTH_AGE_MAX;
  const a = data.assignment;

  const start = async () => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position, ageMin, ageMax, radiusKm: radius, weeks }),
    }), "Úkol se nepodařilo zadat")) await load();
  };

  const stop = async () => {
    const ok = await confirm({ title: "Ukončit úkol?", description: "Skaut se vrátí domů. Za odjeté týdny se peníze nevracejí, hlášení ti zůstanou.", confirmLabel: "Ukončit", variant: "danger" });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment`, { method: "DELETE" }), "Úkol se nepodařilo ukončit")) await load();
  };

  const chip = (active: boolean) =>
    `px-3 py-2 rounded-soft text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <Link href="/zamestnanci" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500">← Zaměstnanci</Link>

      {!data.scout ? (
        <div className="card p-6 text-center space-y-3">
          <div className="font-heading font-bold text-lg">Nemáš skauta</div>
          <p className="text-sm text-muted">Skaut jezdí po okolí a hledá hráče do tvého kádru. Najmi ho v Zaměstnancích.</p>
          <Link href="/zamestnanci?tab=market" className="btn btn-primary inline-block">Najmout skauta</Link>
        </div>
      ) : (
        <div className="card p-4 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted font-heading uppercase tracking-wider">Skaut</div>
              <div className="font-heading font-bold text-lg truncate">{data.scout.name}</div>
            </div>
            <div className="font-heading font-bold text-xl tabular-nums shrink-0">{data.scout.eff}<span className="text-sm text-muted">/20</span></div>
          </div>
          <div className="text-sm text-muted">Čím lepší skaut, tím víc klubů objede a tím přesněji hráče odhadne.</div>
        </div>
      )}

      {data.scout && a && (
        <div className="card p-4 space-y-3">
          <SectionLabel>Na úkolu</SectionLabel>
          <div className="text-base">
            <span className="font-heading font-bold">{a.position ? SCOUT_POSITION_LABELS[a.position] : "Kdokoli"}</span>
            , {a.age_min}–{a.age_max} let, okruh {a.radius_km} km
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
              <div className="font-heading font-bold text-lg tabular-nums">{a.weeks_worked}/{a.weeks_total}</div>
              <div className="text-sm text-muted">týdnů</div>
            </div>
            <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
              <div className="font-heading font-bold text-lg tabular-nums">{a.clubs_visited}</div>
              <div className="text-sm text-muted">klubů</div>
            </div>
            <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
              <div className="font-heading font-bold text-lg tabular-nums">{a.reports_sent}</div>
              <div className="text-sm text-muted">hlášení</div>
            </div>
          </div>
          <div className="text-sm text-muted">
            Jezdí každý týden a v pondělí ti napíše. Cestovné {kc(a.weekly_cost)} týdně se strhává v pondělí.
            {a.age_max <= SCOUT_YOUTH_AGE_MAX ? " Mladé hlásí podle toho, kam to můžou dotáhnout." : ""}
          </div>
          <button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors">
            Ukončit úkol
          </button>
        </div>
      )}

      {data.scout && !a && (
        <div className="card p-4 space-y-4">
          <SectionLabel>Nový úkol</SectionLabel>
          {data.lastAssignment?.status === "finished" && (
            <div className="text-sm text-muted">Poslední úkol je hotový: {plural(data.lastAssignment.clubs_visited, "klub", "kluby", "klubů")}, {data.lastAssignment.reports_sent} hlášení.</div>
          )}

          <div>
            <div className="text-sm text-muted font-heading uppercase mb-1.5">Koho hledat</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(position === null)} onClick={() => setPosition(null)}>Kdokoli</button>
              {SCOUT_POSITIONS.map((p) => (
                <button key={p} type="button" className={chip(position === p)} onClick={() => setPosition(p)}>{SCOUT_POSITION_LABELS[p]}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted font-heading uppercase mb-1.5">Věk</div>
            <div className="flex items-center gap-2">
              <select value={ageMin} onChange={(e) => { const v = Number(e.target.value); setAgeMin(v); if (v > ageMax) setAgeMax(v); }}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-base font-heading font-bold">
                {Array.from({ length: data.options.ageMax - data.options.ageMin + 1 }, (_, i) => data.options.ageMin + i).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="text-muted">až</span>
              <select value={ageMax} onChange={(e) => { const v = Number(e.target.value); setAgeMax(v); if (v < ageMin) setAgeMin(v); }}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-base font-heading font-bold">
                {Array.from({ length: data.options.ageMax - data.options.ageMin + 1 }, (_, i) => data.options.ageMin + i).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="text-muted">let</span>
            </div>
            {youth && <div className="text-sm text-pitch-600 mt-1.5">Do {SCOUT_YOUTH_AGE_MAX} let skaut hledá podle toho, kam to kluci můžou dotáhnout, ne podle dnešní formy.</div>}
          </div>

          <div>
            <div className="text-sm text-muted font-heading uppercase mb-1.5">Kam jezdit</div>
            <div className="grid grid-cols-3 gap-2">
              {data.options.radiusTiers.map((t) => (
                <button key={t.km} type="button" onClick={() => setRadius(t.km)}
                  className={`rounded-xl border-2 p-3 text-center transition-colors ${radius === t.km ? "border-pitch-500 bg-pitch-50" : "border-gray-100 bg-white hover:border-gray-200"}`}>
                  <div className="font-heading font-bold text-lg tabular-nums">{t.km} km</div>
                  <div className="text-sm text-muted">{t.km <= 15 ? "okolí" : t.km <= 30 ? "sousední okresy" : "daleko"}</div>
                </button>
              ))}
            </div>
            <div className="text-sm text-muted mt-1.5">Cestovné {kc(tier.weeklyCost)} týdně. Čím dál, tím víc klubů, ale hráčům se nechce tak daleko dojíždět.</div>
          </div>

          <div>
            <div className="text-sm text-muted font-heading uppercase mb-1.5">Jak dlouho</div>
            <div className="flex flex-wrap gap-2">
              {data.options.weeks.map((w) => (
                <button key={w} type="button" className={chip(weeks === w)} onClick={() => setWeeks(w)}>{plural(w, "týden", "týdny", "týdnů")}</button>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white/70 border border-gray-100 px-3 py-2 text-sm">
            Celkem až <span className="font-heading font-bold tabular-nums">{kc(tier.weeklyCost * weeks)}</span> za cestovné.
            Každý týden objede pár klubů a pošle nejvýš jedno hlášení. Když nikoho nenajde, napíše ti to.
          </div>

          <button onClick={start} className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
            Poslat skauta
          </button>
        </div>
      )}

      <div>
        <SectionLabel>Hlášení ({data.reports.length})</SectionLabel>
        {data.reports.length === 0 ? (
          <div className="card p-5 text-center text-muted text-sm">
            {data.scout ? "Zatím nic. Skaut píše v pondělí." : "Bez skauta žádná hlášení."}
          </div>
        ) : (
          <div className="space-y-2">
            {data.reports.map((r) => <ReportRow key={r.id} r={r} onOpen={() => setOpenReport(r.id)} />)}
          </div>
        )}
      </div>

      {data.pastReports.length > 0 && (
        <div>
          <button onClick={() => setShowPast((v) => !v)} className="text-sm font-heading font-bold text-muted hover:text-ink">
            Starší hlášení ({data.pastReports.length}) {showPast ? "▲" : "▼"}
          </button>
          {showPast && (
            <div className="space-y-2 mt-2">
              {data.pastReports.map((r) => <ReportRow key={r.id} r={r} onOpen={() => setOpenReport(r.id)} />)}
            </div>
          )}
        </div>
      )}

      {openReport && (
        <ScoutReportSheet teamId={teamId} reportId={openReport} onClose={() => setOpenReport(null)} onChanged={load} />
      )}
      {dialog}
    </div>
  );
}
