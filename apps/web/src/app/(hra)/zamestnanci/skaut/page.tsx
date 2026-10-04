"use client";

/**
 * Skaut: úkoly (oblastní hledání, sledování soupeře, hráči) a hlášení.
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
  SCOUT_POSITION_LABELS, SCOUT_POSITIONS, SCOUT_REPORT_STATUS_LABELS, SCOUT_YOUTH_AGE_MAX,
  SCOUT_LEAGUE_WEEKLY_COST, type ScoutPosition, type ScoutAssignmentType,
} from "@okresni-masina/shared";

interface Assignment {
  id: string;
  staff_id?: string | null;
  assignment_type?: ScoutAssignmentType;
  target_player_id?: string | null;
  target_team_id?: string | null;
  target_match_id?: string | null;
  target_league_id?: string | null;
  targetPlayerName?: string | null;
  targetTeamName?: string | null;
  targetLeagueName?: string | null;
  result_data?: string | null;
  position: ScoutPosition | null;
  /** Posty, které skaut hledá; null = kdokoli. */
  positions: ScoutPosition[] | null;
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

interface ScoutItem {
  id: string;
  name: string;
  avatar?: Record<string, unknown>;
  eff: number;
  assignment: Assignment | null;
}

interface OpponentItem {
  id: string;
  name: string;
  city: string | null;
}

interface ScoutData {
  scout: { id: string; name: string; eff: number } | null;
  assignment: Assignment | null;
  scouts?: ScoutItem[];
  opponents?: OpponentItem[];
  leagues?: {
    senior: { id: string; name: string } | null;
    u21: { id: string; name: string } | null;
  };
  maxScouts?: number;
  coachLicence?: number;
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

/** Obličej skauta; bez avataru šedý kruh, ať se nic nerozjede. */
function ScoutFace({ avatar, size }: { avatar?: Record<string, unknown>; size: number }) {
  return avatar && Object.keys(avatar).length > 2
    ? <FaceAvatar faceConfig={avatar} size={size} className="rounded-full shrink-0 bg-white" />
    : <div className="rounded-full bg-gray-100 shrink-0" style={{ width: size, height: size }} />;
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
  const [selectedScoutId, setSelectedScoutId] = useState<string | null>(null);
  const [missionTab, setMissionTab] = useState<"u21_league" | "league" | "area" | "match">("u21_league");
  const [targetTeamId, setTargetTeamId] = useState<string>("");

  // Formulář úkolu - hledání
  // Prázdný výběr = kdokoli.
  const [positions, setPositions] = useState<ScoutPosition[]>([]);
  const togglePosition = (p: ScoutPosition) =>
    setPositions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(30);
  const [radius, setRadius] = useState(30);
  const [weeks, setWeeks] = useState(4);

  const load = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch<ScoutData>(`/api/teams/${teamId}/scout`);
      setData(res);
      if (res.opponents && res.opponents.length > 0 && !targetTeamId) {
        setTargetTeamId(res.opponents[0].id);
      }
      if (!res.leagues?.u21 && missionTab === "u21_league") {
        setMissionTab(res.leagues?.senior ? "league" : "area");
      }
    } catch (e) {
      console.error("Načtení skauta selhalo:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId, targetTeamId, missionTab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sid = urlParams.get("scoutId");
    if (sid) setSelectedScoutId(sid);
    const rep = urlParams.get("hlaseni");
    if (rep) setOpenReport(rep);
  }, []);

  if (loading && !data) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;
  if (!data || !teamId) return <div className="p-6 text-center text-muted">Skauta se nepodařilo načíst.</div>;

  const scoutsList: ScoutItem[] = data.scouts && data.scouts.length > 0
    ? data.scouts
    : (data.scout ? [{ id: data.scout.id, name: data.scout.name, eff: data.scout.eff, assignment: data.assignment }] : []);

  const currentScout = scoutsList.find((s) => s.id === selectedScoutId) ?? scoutsList[0] ?? null;
  const a = currentScout?.assignment ?? null;

  const tier = data.options.radiusTiers.find((t) => t.km === radius) ?? data.options.radiusTiers[0];
  const youth = ageMax <= SCOUT_YOUTH_AGE_MAX;

  const startLeague = async (type: "u21_league" | "league") => {
    if (!currentScout) return;
    const leagueObj = type === "u21_league" ? data.leagues?.u21 : data.leagues?.senior;
    if (!leagueObj) return;

    const leagueName = leagueObj.name;
    const isU21 = type === "u21_league";
    const totalCost = SCOUT_LEAGUE_WEEKLY_COST * weeks;

    const ok = await confirm({
      title: isU21 ? "Vyslat skauta na U21 ligu?" : "Vyslat skauta na naši ligu?",
      description: `${currentScout.name} bude objíždět zápasy soutěže ${leagueName} a hledat ${isU21 ? "mladé talenty soupeřů" : "vytipované hráče"}.`,
      details: [
        { label: "Soutěž", value: leagueName, color: "text-ink font-bold" },
        { label: "Délka mise", value: `${weeks} ${plural(weeks, "týden", "týdny", "týdnů")}`, color: "text-ink" },
        { label: "Cestovné", value: `${kc(SCOUT_LEAGUE_WEEKLY_COST)} / týden`, color: "text-card-red" },
        { label: "Celkem za misi", value: kc(totalCost), color: "text-ink font-bold" },
        { label: "Hlášení", value: "Každé pondělí (nejvýš 1 hlášení)", color: "text-pitch-600 font-bold" },
      ],
      confirmLabel: `Vyslat skauta na ${weeks} ${plural(weeks, "týden", "týdny", "týdnů")}`,
    });
    if (!ok) return;

    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: currentScout.id,
        assignmentType: type,
        targetLeagueId: leagueObj.id,
        positions,
        weeks,
      }),
    }), "Úkol se nepodařilo zadat")) await load();
  };

  const startArea = async () => {
    if (!currentScout) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: currentScout.id,
        assignmentType: "area",
        positions,
        ageMin,
        ageMax,
        radiusKm: radius,
        weeks,
      }),
    }), "Úkol se nepodařilo zadat")) await load();
  };

  const startMatch = async () => {
    if (!currentScout || !targetTeamId) return;
    const opp = data.opponents?.find((o) => o.id === targetTeamId);
    const ok = await confirm({
      title: "Vyslat skauta na rozbor soupeře?",
      description: `${currentScout.name} provede taktickou analýzu týmu ${opp?.name ?? "soupeře"}.`,
      details: [
        { label: "Cena", value: "−500 Kč", color: "text-card-red" },
        { label: "Doba mise", value: "2 dny", color: "text-ink" },
        { label: "Zápasový bonus", value: "+2 technika, +3 morálka", color: "text-pitch-600 font-bold" },
      ],
      confirmLabel: "Vyslat (500 Kč)",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: currentScout.id,
        assignmentType: "match",
        targetTeamId,
      }),
    }), "Úkol se nepodařilo zadat")) await load();
  };

  const stop = async () => {
    if (!currentScout) return;
    const ok = await confirm({
      title: "Ukončit úkol?",
      description: "Skaut se vrátí domů. Za odjeté období se peníze nevracejí, dosavadní hlášení ti zůstanou.",
      confirmLabel: "Ukončit",
      variant: "danger",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/assignment?staffId=${currentScout.id}`, { method: "DELETE" }), "Úkol se nepodařilo ukončit")) await load();
  };

  const chip = (active: boolean) =>
    `px-3 py-2 rounded-soft text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/zamestnanci" className="inline-flex items-center gap-1 text-sm font-heading font-bold text-muted hover:text-pitch-500">
          ← Zaměstnanci
        </Link>
        {scoutsList.length > 0 && (
          <div className="text-xs text-muted font-heading">
            Skautů v klubu: <strong>{scoutsList.length}/{data.maxScouts ?? 2}</strong>
          </div>
        )}
      </div>

      {scoutsList.length === 0 ? (
        <div className="card p-6 text-center space-y-3">
          <div className="font-heading font-bold text-lg">Nemáš žádného skauta</div>
          <p className="text-sm text-muted">Skaut jezdí po okolí, hledá hráče a analyzuje soupeře. Najmi ho v Zaměstnancích.</p>
          <Link href="/zamestnanci?tab=market" className="btn btn-primary inline-block">Najmout skauta</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Přepínač mezi skauty při více než jednom skautovi */}
          {scoutsList.length > 1 && (
            <div className="space-y-1.5">
              <div className="text-micro uppercase font-heading font-bold text-muted tracking-wide">
                Vyber skauta ({scoutsList.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {scoutsList.map((s) => {
                  const isSel = s.id === currentScout?.id;
                  const hasAsgn = !!s.assignment;
                  let statusLabel = "Volný";
                  if (s.assignment) {
                    if (s.assignment.assignment_type === "player") {
                      statusLabel = `Hráč: ${s.assignment.targetPlayerName ?? "v terénu"}`;
                    } else if (s.assignment.assignment_type === "match") {
                      statusLabel = `Soupeř: ${s.assignment.targetTeamName ?? "rozbor"}`;
                    } else if (s.assignment.assignment_type === "u21_league") {
                      statusLabel = `U21 liga (${s.assignment.weeks_worked}/${s.assignment.weeks_total} týd)`;
                    } else if (s.assignment.assignment_type === "league") {
                      statusLabel = `Naše liga (${s.assignment.weeks_worked}/${s.assignment.weeks_total} týd)`;
                    } else {
                      statusLabel = `Oblast (${s.assignment.weeks_worked}/${s.assignment.weeks_total} týd)`;
                    }
                  }
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedScoutId(s.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                        isSel
                          ? "border-pitch-500 bg-pitch-50/50 shadow-xs"
                          : "border-gray-100 bg-white hover:border-gray-200"
                      }`}
                    >
                      <ScoutFace avatar={s.avatar} size={40} />
                      <div className="min-w-0 flex-1 ml-2.5">
                        <div className="font-heading font-bold text-base truncate">{s.name}</div>
                        <div className={`text-xs font-heading ${hasAsgn ? "text-pitch-600 font-bold" : "text-muted"}`}>
                          {hasAsgn ? "● " : "○ "}{statusLabel}
                        </div>
                      </div>
                      <div className="font-heading font-bold text-lg tabular-nums shrink-0 ml-2">
                        {s.eff}<span className="text-xs text-muted">/20</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hlavička aktuálního skauta (pokud je jen jeden) */}
          {scoutsList.length === 1 && currentScout && (
            <div className="card p-4 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <ScoutFace avatar={currentScout.avatar} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted font-heading uppercase tracking-wider">Skaut</div>
                  <div className="font-heading font-bold text-lg truncate">{currentScout.name}</div>
                </div>
                <div className="font-heading font-bold text-xl tabular-nums shrink-0">{currentScout.eff}<span className="text-sm text-muted">/20</span></div>
              </div>
              <div className="text-sm text-muted">Čím lepší skaut, tím víc klubů objede a tím přesněji hráče i soupeře odhadne.</div>
            </div>
          )}
        </div>
      )}

      {currentScout && a && (
        <div className="card p-4 space-y-3">
          {a.assignment_type === "u21_league" || a.assignment_type === "league" ? (
            <>
              <div className="flex items-center justify-between">
                <SectionLabel>
                  {a.assignment_type === "u21_league" ? "Na úkolu: Skautování U21 ligy" : "Na úkolu: Skautování naší ligy"}
                </SectionLabel>
                <span className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-0.5 rounded">
                  {a.assignment_type === "u21_league" ? "🌟 U21 liga" : "🏆 Naše liga"}
                </span>
              </div>
              <div className="text-base font-heading font-bold">
                Soutěž: {a.targetLeagueName ?? (a.assignment_type === "u21_league" ? "Dorostenecká U21 liga" : "Ligová soutěž")}
              </div>
              <div className="text-sm">
                <span className="text-muted">Hledá: </span>
                <span className="font-heading font-bold">
                  {a.positions && a.positions.length > 0 ? a.positions.map((p) => SCOUT_POSITION_LABELS[p]).join(", ") : "Všechny posty"}
                </span>
                {a.assignment_type === "u21_league" && <span className="text-muted"> (dorostenci 16–21 let)</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
                  <div className="font-heading font-bold text-lg tabular-nums">{a.weeks_worked}/{a.weeks_total}</div>
                  <div className="text-sm text-muted">týdnů</div>
                </div>
                <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
                  <div className="font-heading font-bold text-lg tabular-nums">{a.clubs_visited}</div>
                  <div className="text-sm text-muted">týmů shlédnuto</div>
                </div>
                <div className="rounded-xl bg-white/70 border border-gray-100 p-2">
                  <div className="font-heading font-bold text-lg tabular-nums">{a.reports_sent}</div>
                  <div className="text-sm text-muted">hlášení</div>
                </div>
              </div>
              <div className="text-sm text-muted">
                {a.assignment_type === "u21_league"
                  ? "Skaut jezdí na zápasy U21 ligy a v pondělí pošle zprávu o největším talentu soupeřů včetně odhadu jeho stropu a ceny."
                  : "Skaut jezdí na ligové zápasy soupeřů a v pondělí pošle zprávu o vybraném hráči včetně odhadu formy a ceny."}
                {" "}Cestovné {kc(a.weekly_cost || SCOUT_LEAGUE_WEEKLY_COST)} týdně se strhává v pondělí.
              </div>
              <button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors">
                Ukončit úkol
              </button>
            </>
          ) : a.assignment_type === "player" ? (
            <>
              <div className="flex items-center justify-between">
                <SectionLabel>Na úkolu: Sledování hráče</SectionLabel>
                <span className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-0.5 rounded">V terénu</span>
              </div>
              <div className="text-base font-heading font-bold">
                Cíl: {a.targetPlayerName ?? "Konkrétní hráč"}
              </div>
              <div className="text-sm text-muted">
                Skaut detailně analyzuje výkony a skryté vlastnosti tohoto hráče. Mise trvá 2 dny. Po jejím dokončení dorazí zpráva s odhalenými atributy a charakterem hráče.
              </div>
              <button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors">
                Ukončit úkol
              </button>
            </>
          ) : a.assignment_type === "match" ? (
            <>
              <div className="flex items-center justify-between">
                <SectionLabel>Na úkolu: Taktický rozbor soupeře</SectionLabel>
                <span className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-0.5 rounded">Taktická příprava</span>
              </div>
              <div className="text-base font-heading font-bold">
                Soupeř: {a.targetTeamName ?? "Ligový tým"}
              </div>
              <div className="text-sm text-muted">
                Skaut sleduje hru a rozestavení soupeře. Připravuje taktické pokyny, které tvému týmu poskytnou bonus (+2 k technice, +3 k morálce) pro vzájemný zápas na 14 dní.
              </div>
              <button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 text-red-700 bg-white hover:bg-red-50 transition-colors">
                Ukončit úkol
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <SectionLabel>{a.age_max <= SCOUT_YOUTH_AGE_MAX ? "Na úkolu: Talenty U21" : "Na úkolu: Oblastní hledání"}</SectionLabel>
                <span className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-0.5 rounded">
                  {a.age_max <= SCOUT_YOUTH_AGE_MAX ? "🌟 Talenty U21" : "V terénu"}
                </span>
              </div>
              <div className="text-base">
                <span className="font-heading font-bold">
                  {a.positions && a.positions.length > 0 ? a.positions.map((p) => SCOUT_POSITION_LABELS[p]).join(", ") : "Kdokoli"}
                </span>
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
            </>
          )}
        </div>
      )}

      {currentScout && !a && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Nový úkol pro: {currentScout.name}</SectionLabel>
            <span className="text-xs bg-gray-100 text-muted font-heading font-bold px-2 py-0.5 rounded">Volný</span>
          </div>

          {/* Přepínač typu mise */}
          <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
            <button
              type="button"
              onClick={() => { setMissionTab("u21_league"); setPositions([]); }}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-all ${
                missionTab === "u21_league"
                  ? "bg-pitch-500 text-white shadow-xs"
                  : "bg-surface text-muted hover:text-ink"
              }`}
            >
              🌟 U21 liga {data.leagues?.u21 ? `(${data.leagues.u21.name})` : ""}
            </button>
            <button
              type="button"
              onClick={() => { setMissionTab("league"); setPositions([]); }}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-all ${
                missionTab === "league"
                  ? "bg-pitch-500 text-white shadow-xs"
                  : "bg-surface text-muted hover:text-ink"
              }`}
            >
              🏆 Naše liga {data.leagues?.senior ? `(${data.leagues.senior.name})` : ""}
            </button>
            <button
              type="button"
              onClick={() => { setMissionTab("area"); setAgeMin(18); setAgeMax(32); }}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-all ${
                missionTab === "area"
                  ? "bg-pitch-500 text-white shadow-xs"
                  : "bg-surface text-muted hover:text-ink"
              }`}
            >
              🌍 Okolní vesnice
            </button>
            <button
              type="button"
              onClick={() => setMissionTab("match")}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-all ${
                missionTab === "match"
                  ? "bg-pitch-500 text-white shadow-xs"
                  : "bg-surface text-muted hover:text-ink"
              }`}
            >
              ⚽ Sledování soupeře
            </button>
          </div>

          {missionTab === "u21_league" && (
            <div className="space-y-4">
              {data.leagues?.u21 ? (
                <>
                  <div className="p-3.5 rounded-xl bg-pitch-50 border border-pitch-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-heading font-bold text-pitch-700">Dorostenecká soutěž</span>
                      <span className="text-xs bg-pitch-500 text-white font-heading font-bold px-2 py-0.5 rounded">Reální mladíci</span>
                    </div>
                    <div className="font-heading font-bold text-base text-ink">
                      {data.leagues.u21.name}
                    </div>
                    <p className="text-sm text-pitch-900">
                      Skaut objíždí zápasy a tréninky soupeřů v naší dorostenecké U21 lize. Sleduje reálné mladé hráče do 21 let a hodnotí jejich <strong>strop a potenciál růstu</strong>. V pondělí pošle zprávu o největším talentu s odhadem ceny a ochoty jednat o přestupu.
                    </p>
                  </div>

                  <div>
                    <div className="text-sm text-muted font-heading uppercase mb-1.5">Koho hledat</div>
                    <div className="text-sm text-muted mb-1.5">Můžeš zaškrtnout víc postů nebo nechat všechny.</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={chip(positions.length === 0)} onClick={() => setPositions([])}>Všechny posty</button>
                      {SCOUT_POSITIONS.map((p) => (
                        <button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} onClick={() => togglePosition(p)}>
                          {positions.includes(p) ? "✓ " : ""}{SCOUT_POSITION_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted font-heading uppercase mb-1.5">Jak dlouho sledovat soutěž</div>
                    <div className="flex flex-wrap gap-2">
                      {data.options.weeks.map((w) => (
                        <button key={w} type="button" className={chip(weeks === w)} onClick={() => setWeeks(w)}>
                          {plural(w, "týden", "týdny", "týdnů")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/70 border border-gray-100 p-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Cestovné za týden:</span>
                      <span className="font-heading font-bold tabular-nums text-ink">{kc(SCOUT_LEAGUE_WEEKLY_COST)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <span className="text-muted">Celkem za {weeks} {plural(weeks, "týden", "týdny", "týdnů")}:</span>
                      <span className="font-heading font-bold tabular-nums text-ink">{kc(SCOUT_LEAGUE_WEEKLY_COST * weeks)}</span>
                    </div>
                    <div className="text-xs text-muted pt-1">
                      Cestovné se strhává postupně každé pondělí ({kc(SCOUT_LEAGUE_WEEKLY_COST)} / týden) při odeslání hlášení.
                    </div>
                  </div>

                  <button
                    onClick={() => startLeague("u21_league")}
                    className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors shadow-xs"
                  >
                    Vyslat skauta na U21 ligu ({kc(SCOUT_LEAGUE_WEEKLY_COST * weeks)})
                  </button>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-surface text-center space-y-2">
                  <div className="font-heading font-bold text-base">Klub zatím nehraje žádnou U21 soutěž</div>
                  <p className="text-sm text-muted">
                    Pro skautování U21 ligy potřebuje klub zařazení dorosteneckého týmu do ligové soutěže. Zkus zatím hledání v okolních vesnicích nebo naši seniorskou ligu.
                  </p>
                </div>
              )}
            </div>
          )}

          {missionTab === "league" && (
            <div className="space-y-4">
              {data.leagues?.senior ? (
                <>
                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-heading font-bold text-amber-800">Soutěž dospělých</span>
                      <span className="text-xs bg-amber-600 text-white font-heading font-bold px-2 py-0.5 rounded">Ligoví soupeři</span>
                    </div>
                    <div className="font-heading font-bold text-base text-ink">
                      {data.leagues.senior.name}
                    </div>
                    <p className="text-sm text-amber-950">
                      Skaut objíždí zápasy naší soutěže a sleduje hráče v kádrech soupeřů. Vytipuje nejlepší posily, odhadne jejich kvalitu, formu, pořizovací cenu a ochotu přestoupit.
                    </p>
                  </div>

                  <div>
                    <div className="text-sm text-muted font-heading uppercase mb-1.5">Koho hledat</div>
                    <div className="text-sm text-muted mb-1.5">Můžeš zaškrtnout víc postů nebo nechat všechny.</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={chip(positions.length === 0)} onClick={() => setPositions([])}>Všechny posty</button>
                      {SCOUT_POSITIONS.map((p) => (
                        <button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} onClick={() => togglePosition(p)}>
                          {positions.includes(p) ? "✓ " : ""}{SCOUT_POSITION_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted font-heading uppercase mb-1.5">Jak dlouho sledovat soutěž</div>
                    <div className="flex flex-wrap gap-2">
                      {data.options.weeks.map((w) => (
                        <button key={w} type="button" className={chip(weeks === w)} onClick={() => setWeeks(w)}>
                          {plural(w, "týden", "týdny", "týdnů")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/70 border border-gray-100 p-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Cestovné za týden:</span>
                      <span className="font-heading font-bold tabular-nums text-ink">{kc(SCOUT_LEAGUE_WEEKLY_COST)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <span className="text-muted">Celkem za {weeks} {plural(weeks, "týden", "týdny", "týdnů")}:</span>
                      <span className="font-heading font-bold tabular-nums text-ink">{kc(SCOUT_LEAGUE_WEEKLY_COST * weeks)}</span>
                    </div>
                    <div className="text-xs text-muted pt-1">
                      Cestovné se strhává postupně každé pondělí ({kc(SCOUT_LEAGUE_WEEKLY_COST)} / týden) při odeslání hlášení.
                    </div>
                  </div>

                  <button
                    onClick={() => startLeague("league")}
                    className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors shadow-xs"
                  >
                    Vyslat skauta na naši ligu ({kc(SCOUT_LEAGUE_WEEKLY_COST * weeks)})
                  </button>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-surface text-center space-y-2">
                  <div className="font-heading font-bold text-base">Klub nemá přiřazenou ligovou soutěž</div>
                  <p className="text-sm text-muted">
                    Zkus zatím oblastní hledání v okolních vesnicích.
                  </p>
                </div>
              )}
            </div>
          )}

          {missionTab === "area" && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted font-heading uppercase mb-1.5">Koho hledat</div>
                <div className="text-sm text-muted mb-1.5">Můžeš zaškrtnout víc postů.</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(positions.length === 0)} onClick={() => setPositions([])}>Kdokoli</button>
                  {SCOUT_POSITIONS.map((p) => (
                    <button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} onClick={() => togglePosition(p)}>
                      {positions.includes(p) ? "✓ " : ""}{SCOUT_POSITION_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm text-muted font-heading uppercase">Věk hráčů</div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setAgeMin(16); setAgeMax(21); }}
                      className={`text-xs px-2.5 py-1 rounded-lg font-heading font-bold border transition-colors ${
                        ageMax <= 21
                          ? "bg-pitch-500 text-white border-pitch-500 shadow-xs"
                          : "bg-white text-ink border-gray-200 hover:border-pitch-300"
                      }`}
                    >
                      🌟 Jen talenty U21 (16–21)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAgeMin(16); setAgeMax(35); }}
                      className={`text-xs px-2.5 py-1 rounded-lg font-heading font-bold border transition-colors ${
                        ageMin === 16 && ageMax === 35
                          ? "bg-pitch-500 text-white border-pitch-500 shadow-xs"
                          : "bg-white text-ink border-gray-200 hover:border-pitch-300"
                      }`}
                    >
                      Všichni (16–35)
                    </button>
                  </div>
                </div>
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
                {youth ? (
                  <div className="p-3 rounded-xl bg-pitch-50 border border-pitch-200/80 text-sm text-pitch-900 mt-2 flex items-start gap-2.5">
                    <span className="text-lg leading-none">🌟</span>
                    <div>
                      <strong className="font-heading font-bold">Aktivní režim talentů U21:</strong> Skaut v terénu posuzuje mladé hráče podle toho, <em>kam to můžou dotáhnout</em> (podle stropu a potenciálu), ne podle dnešní formy dospělého fotbalu. V hlášení odhadne jejich strop.
                    </div>
                  </div>
                ) : null}
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

              <button onClick={startArea} className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                {youth ? "Poslat skauta hledat talenty (U21)" : "Poslat skauta hledat hráče"}
              </button>
            </div>
          )}

          {missionTab === "match" && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted font-heading uppercase mb-1.5">Vyber soupeře z ligy</div>
                {data.opponents && data.opponents.length > 0 ? (
                  <select
                    value={targetTeamId}
                    onChange={(e) => setTargetTeamId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-base font-heading font-bold text-ink"
                  >
                    {data.opponents.map((opp) => (
                      <option key={opp.id} value={opp.id}>
                        {opp.name} {opp.city ? `(${opp.city})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-muted bg-surface p-3 rounded-xl">
                    V lize zatím nejsou žádní soupeři k dispozici.
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white/70 border border-gray-100 p-3 space-y-2 text-sm">
                <div className="font-heading font-bold text-ink">Co skaut zjistí:</div>
                <ul className="list-disc list-inside space-y-1 text-muted">
                  <li>Rozestavení soupeře a jeho hlavní taktický styl</li>
                  <li>Klíčového hráče, na kterého je potřeba si dát pozor</li>
                  <li>Slabé místo v defenzivě či sestavě</li>
                </ul>
                <div className="text-pitch-700 font-heading font-bold pt-1">
                  ★ Zápasový bonus: +2 k technice a +3 k morálce tvého týmu proti tomuto soupeři po dobu 14 dní.
                </div>
              </div>

              <div className="rounded-xl bg-white/70 border border-gray-100 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-muted">Náklady mise:</span>
                <span className="font-heading font-bold tabular-nums text-ink">500 Kč (doba 2 dny)</span>
              </div>

              <button
                onClick={startMatch}
                disabled={!targetTeamId}
                className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Vyslat na rozbor soupeře (500 Kč)
              </button>
            </div>
          )}

          <div className="text-xs text-muted bg-surface/60 p-2.5 rounded-lg">
            💡 <strong>Hledáš konkrétního hráče?</strong> Otevři profil daného hráče kdekoli ve hře a klikni na tlačítko <strong>Poslat skauta</strong>.
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Hlášení ({data.reports.length})</SectionLabel>
        {data.reports.length === 0 ? (
          <div className="card p-5 text-center text-muted text-sm">
            {scoutsList.length > 0 ? "Zatím nic. Skaut píše v pondělí." : "Bez skauta žádná hlášení."}
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
