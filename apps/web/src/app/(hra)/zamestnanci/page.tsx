"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner, Tabs, useTabParam, ListCard, ListRow, ListEmpty, RowIcon, StatusChip } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FaceAvatar } from "@/components/players/face-avatar";
import { StaffTaskBox, type StaffTasksData } from "@/components/staff/StaffTaskBox";
import {
  ROLE_DEFS,
  STAFF_ROLE_ORDER,
  STAFF_ATTRIBUTE_LABELS,
  STAFF_GROUP_LABELS,
  staffAttributeValue,
  staffEffectiveness,
  type StaffRole,
  type StaffAttributeKey,
  type StaffGroup,
  licenceLabel,
  maxScoutsForLicence,
} from "@okresni-masina/shared";

// ── Typy (odpovídají API camelCase) ──
interface CourseQuote { attribute: StaffAttributeKey; points: number; weeks: number; cost: number; }

interface StaffMember {
  id: string;
  teamId: string | null;
  role: StaffRole | null;
  profession: StaffRole;
  firstName: string;
  lastName: string;
  gender: "m" | "f";
  age: number;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  workRate: number;
  charm: number;
  weeklyWage: number;
  signingFee: number;
  avatar: Record<string, unknown>;
  description: string | null;
  courseAttribute: StaffAttributeKey | null;
  coursePoints: number | null;
  courseWeeksRemaining: number | null;
  courses?: CourseQuote[] | null;
  taskCooldownUntil?: string | null;
}

type Tab = "team" | "market";
// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["team", "market"] as const;

const ATTR_ORDER: StaffAttributeKey[] = [
  "coaching", "medicine", "maintenance", "judgement", "communication", "work_rate", "charm",
];
const ATTR_SHORT: Record<StaffAttributeKey, string> = {
  coaching: "Tré", medicine: "Zdr", maintenance: "Údr", judgement: "Úsu",
  communication: "Kom", work_rate: "Pra", charm: "Šar",
};
const GROUP_ORDER: StaffGroup[] = ["trenerske", "zdravi", "provoz", "scouting"];

function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }

function attrColor(v: number): string {
  if (v >= 15) return "text-pitch-400 font-bold";
  if (v >= 11) return "text-pitch-600";
  if (v >= 7) return "text-ink";
  if (v >= 4) return "text-gold-600";
  return "text-card-red";
}

function effClass(v: number): string {
  if (v >= 15) return "text-pitch-500";
  if (v >= 10) return "text-gold-600";
  return "text-muted";
}

function staffWithUpdatedAttr(m: StaffMember, attr: StaffAttributeKey, points: number): StaffMember {
  return {
    ...m,
    coaching: attr === "coaching" ? m.coaching + points : m.coaching,
    medicine: attr === "medicine" ? m.medicine + points : m.medicine,
    maintenance: attr === "maintenance" ? m.maintenance + points : m.maintenance,
    judgement: attr === "judgement" ? m.judgement + points : m.judgement,
    communication: attr === "communication" ? m.communication + points : m.communication,
    workRate: attr === "work_rate" ? m.workRate + points : m.workRate,
    charm: attr === "charm" ? m.charm + points : m.charm,
  };
}

function AttrGrid({
  m,
  role,
  activeCourse,
}: {
  m: StaffMember;
  role?: StaffRole | null;
  activeCourse?: StaffAttributeKey | null;
}) {
  const def = role ? ROLE_DEFS[role] : null;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {ATTR_ORDER.map((a) => {
          const v = staffAttributeValue(m, a);
          const isPrimary = def?.primary === a;
          const isSecondary = def?.secondary === a;
          const isStudying = activeCourse === a;

          return (
            <div
              key={a}
              className={`text-center py-1 px-0.5 rounded-soft transition-all ${
                isPrimary
                  ? "bg-pitch-500/10 border border-pitch-500/40 shadow-xs"
                  : isSecondary
                  ? "bg-gold-500/10 border border-gold-500/40 shadow-xs"
                  : "bg-surface/40 border border-transparent opacity-65 hover:opacity-100"
              } ${isStudying ? "ring-2 ring-gold-400" : ""}`}
            >
              <div className="h-3.5 flex items-center justify-center">
                {isPrimary ? (
                  <span
                    className="text-[9px] font-heading font-black text-pitch-700 bg-pitch-500/20 px-1 rounded-xs leading-none"
                    title="Klíčový atribut pro roli (2× váha)"
                  >
                    2×
                  </span>
                ) : isSecondary ? (
                  <span
                    className="text-[9px] font-heading font-bold text-gold-700 bg-gold-500/20 px-1 rounded-xs leading-none"
                    title="Důležitý atribut pro roli (1× váha)"
                  >
                    1×
                  </span>
                ) : (
                  <span className="text-[9px] text-transparent select-none leading-none">·</span>
                )}
              </div>
              <div className={`text-sm sm:text-base font-heading font-bold tabular-nums leading-tight ${attrColor(v)}`}>
                {v}
              </div>
              <div
                className={`text-[10px] sm:text-micro uppercase font-heading truncate leading-tight ${
                  isPrimary
                    ? "text-pitch-700 font-bold"
                    : isSecondary
                    ? "text-gold-700 font-bold"
                    : "text-muted"
                }`}
                title={STAFF_ATTRIBUTE_LABELS[a]}
              >
                {ATTR_SHORT[a]}
              </div>
            </div>
          );
        })}
      </div>

      {def && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted font-heading flex-wrap">
          <span>Role {def.label}:</span>
          <span className="inline-flex items-center gap-1 text-pitch-700 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-pitch-500 inline-block" />
            ★ {STAFF_ATTRIBUTE_LABELS[def.primary]} (2×)
          </span>
          <span className="text-muted/40">·</span>
          <span className="inline-flex items-center gap-1 text-gold-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500 inline-block" />
            {STAFF_ATTRIBUTE_LABELS[def.secondary]} (1×)
          </span>
        </div>
      )}
    </div>
  );
}

/** Portrét v kruhu do levého sloupce řádku; bez obličeje první písmeno jména. */
function Avatar({ m }: { m: StaffMember }) {
  const hasFace = m.avatar && typeof m.avatar === "object" && Object.keys(m.avatar).length > 2;
  return (
    <span className="w-9 h-9 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center font-heading font-bold">
      {hasFace ? <FaceAvatar faceConfig={m.avatar as Record<string, unknown>} size={30} /> : m.firstName[0]}
    </span>
  );
}

export default function ZamestnanciPage() {
  const { teamId } = useTeam();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [loading, setLoading] = useState(true);
  const [hired, setHired] = useState<StaffMember[]>([]);
  const [market, setMarket] = useState<Array<StaffMember & { requiredLicence?: number }>>([]);
  const [coachLicence, setCoachLicence] = useState(0);
  const [maxScouts, setMaxScouts] = useState(2);
  const [pickRole, setPickRole] = useState<Record<string, StaffRole>>({});
  const [marketRoleFilter, setMarketRoleFilter] = useState<StaffRole | "all">("all");
  const [tasksData, setTasksData] = useState<StaffTasksData | null>(null);

  const refresh = async () => {
    if (!teamId) return;
    const [s, m, t] = await Promise.all([
      apiFetch<{ staff: StaffMember[]; coachLicence?: number; maxScouts?: number }>(`/api/teams/${teamId}/staff`).catch((e) => { console.error("load staff:", e); return null; }),
      apiFetch<{ market: Array<StaffMember & { requiredLicence?: number }>; coachLicence?: number }>(`/api/teams/${teamId}/staff/market`).catch((e) => { console.error("load market:", e); return null; }),
      apiFetch<StaffTasksData>(`/api/teams/${teamId}/staff/tasks`).catch((e) => { console.error("load staff tasks:", e); return null; }),
    ]);
    if (t) setTasksData(t);
    if (s) {
      setHired(s.staff ?? []);
      if (typeof s.maxScouts === "number") setMaxScouts(s.maxScouts);
      if (typeof s.coachLicence === "number") setCoachLicence(s.coachLicence);
    }
    if (m) {
      setMarket(m.market ?? []);
      if (typeof m.coachLicence === "number") {
        setCoachLicence(m.coachLicence);
        if (!s || typeof s.maxScouts !== "number") {
          setMaxScouts(maxScoutsForLicence(m.coachLicence));
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [teamId]);

  const hiredScouts = hired.filter((s) => s.role === "skaut");
  const byRole = new Map<StaffRole, StaffMember>();
  for (const s of hired) {
    if (s.role && s.role !== "skaut") {
      byRole.set(s.role, s);
    }
  }

  const isRoleOccupied = (role: StaffRole, currentMemberId?: string): boolean => {
    if (role === "skaut") {
      const alreadyScout = currentMemberId && hiredScouts.some((s) => s.id === currentMemberId);
      if (alreadyScout) return false;
      return hiredScouts.length >= maxScouts;
    }
    const currentHolder = byRole.get(role);
    return !!currentHolder && currentHolder.id !== currentMemberId;
  };

  // ── Akce ──
  const doHire = async (cand: StaffMember, role: StaffRole) => {
    if (!teamId) return;
    const eff = staffEffectiveness(cand, role);
    const ok = await confirm({
      title: `Najmout ${cand.firstName} ${cand.lastName}?`,
      description: `${ROLE_DEFS[role].label} · efektivita ${eff}/20`,
      details: [
        { label: "Podpisné", value: `−${czk(cand.signingFee)}`, color: "text-card-red" },
        { label: "Mzda", value: `${czk(cand.weeklyWage)}/týd`, color: "text-ink" },
      ],
      confirmLabel: "Najmout",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/staff/${cand.id}/hire`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    }), "Nábor se nezdařil")) {
      setTab("team");
      await refresh();
    }
  };

  const doFire = async (m: StaffMember) => {
    if (!teamId || !m.role) return;
    const ok = await confirm({
      title: `Propustit ${m.firstName} ${m.lastName}?`,
      description: `${ROLE_DEFS[m.role].label}. Vrátí se mezi volné. Propuštění je zdarma.`,
      confirmLabel: "Propustit",
      variant: "danger",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/staff/${m.id}/fire`, { method: "POST" }), "Propuštění se nezdařilo")) {
      await refresh();
    }
  };

  const doReassign = async (m: StaffMember, role: StaffRole) => {
    if (!teamId) return;
    const eff = staffEffectiveness(m, role);
    const def = ROLE_DEFS[role];
    const ok = await confirm({
      title: `Přeřadit na ${def.label}?`,
      description: `${m.firstName} ${m.lastName} · efektivita v nové roli ${eff}/20`,
      details: [
        {
          label: "Klíčové atributy",
          value: `${STAFF_ATTRIBUTE_LABELS[def.primary]} (2×) + ${STAFF_ATTRIBUTE_LABELS[def.secondary]} (1×)`,
          color: "text-ink",
        },
      ],
      confirmLabel: "Přeřadit",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/staff/${m.id}/reassign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    }), "Přeřazení se nezdařilo")) {
      await refresh();
    }
  };

  const doCourse = async (m: StaffMember, q: CourseQuote) => {
    if (!teamId) return;
    const role = m.role;
    const def = role ? ROLE_DEFS[role] : null;
    const isPrim = def ? q.attribute === def.primary : false;
    const isSec = def ? q.attribute === def.secondary : false;
    const curVal = staffAttributeValue(m, q.attribute);
    const nextVal = curVal + q.points;
    const curEff = role ? staffEffectiveness(m, role) : null;
    const nextM = staffWithUpdatedAttr(m, q.attribute, q.points);
    const nextEff = role ? staffEffectiveness(nextM, role) : null;
    const effDiff = curEff !== null && nextEff !== null ? nextEff - curEff : null;

    const roleImpactText = def
      ? isPrim
        ? `★ Klíčový atribut pro roli ${def.label} (2× váha)`
        : isSec
        ? `Důležitý atribut pro roli ${def.label} (1× váha)`
        : `Vedlejší atribut (nemá vliv na efektivitu role ${def.label})`
      : "-";

    const details = [
      {
        label: "Zlepšení",
        value: `${STAFF_ATTRIBUTE_LABELS[q.attribute]}: ${curVal} → ${nextVal} (+${q.points})`,
        color: isPrim ? "text-pitch-600 font-bold" : isSec ? "text-gold-600 font-bold" : "text-ink",
      },
      ...(def
        ? [
            {
              label: "Vliv na roli",
              value: roleImpactText,
              color: isPrim ? "text-pitch-600 font-bold" : isSec ? "text-gold-600 font-semibold" : "text-muted",
            },
            {
              label: "Efektivita v roli",
              value: effDiff !== null && effDiff > 0
                ? `${curEff}/20 → ${nextEff}/20 (+${effDiff})`
                : `${curEff}/20 (beze změny)`,
              color: effDiff !== null && effDiff > 0 ? "text-pitch-600 font-bold" : "text-muted",
            },
          ]
        : []),
      { label: "Cena", value: `−${czk(q.cost)}`, color: "text-card-red" },
      { label: "Délka", value: `${q.weeks} týdnů`, color: "text-ink" },
    ];

    const ok = await confirm({
      title: `Kurz: ${STAFF_ATTRIBUTE_LABELS[q.attribute]} +${q.points}`,
      description: `${m.firstName} ${m.lastName}${def ? ` (${def.label})` : ""} bude ${q.weeks} týdnů na kurzu (mezitím normálně pracuje).`,
      details,
      confirmLabel: "Poslat na kurz",
    });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/staff/${m.id}/course`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attribute: q.attribute }),
    }), "Kurz se nepodařilo zahájit")) {
      await refresh();
    }
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const tabs: [Tab, string, number][] = [["team", "Tým", hired.length], ["market", "Volní", market.length]];
  const filteredMarket = marketRoleFilter === "all" ? market : market.filter((c) => c.profession === marketRoleFilter);

  // Řádek bez odkazu: uvnitř je výběr role, tlačítka a úkol. Efektivita je štítkem
  // u jména, ne vpravo: sloupec vpravo by na telefonu zúžil mřížku atributů.
  const renderMemberRow = (m: StaffMember, role: StaffRole) => {
    const def = ROLE_DEFS[role];
    const eff = staffEffectiveness(m, role);

    return (
      <ListRow key={m.id}
        leading={<Avatar m={m} />}
        title={<>
          {m.firstName} {m.lastName}
          <span className={`ml-2 align-middle inline-block rounded-full bg-surface-3 px-2 py-0.5 text-micro font-bold tabular-nums whitespace-nowrap ${effClass(eff)}`}>
            efektivita {eff}/20
          </span>
        </>}
        meta={`${def.label} · ${m.age} let${m.gender === "f" ? " · žena" : ""}`}
        detail={
          <span className="block space-y-2 mt-1">
            {m.description && <span className="block text-xs text-gold-600 italic truncate">„{m.description}"</span>}

            <AttrGrid m={m} role={role} activeCourse={m.courseAttribute} />

            <span className="block text-xs text-muted">{def.effectDesc}</span>

            {role === "skaut" ? (
              <span className="block">
                <Link href={`/zamestnanci/skaut?scoutId=${m.id}`} className="btn btn-primary btn-sm inline-block">
                  Úkol a hlášení →
                </Link>
              </span>
            ) : teamId && (
              <StaffTaskBox
                teamId={teamId}
                member={{ id: m.id, role, firstName: m.firstName, lastName: m.lastName, gender: m.gender, taskCooldownUntil: m.taskCooldownUntil }}
                data={tasksData}
                onChanged={refresh}
              />
            )}

            {/* Kurz */}
            {m.courseAttribute ? (
              <div className="text-xs bg-gold-50 text-gold-700 rounded-soft px-3 py-2 font-heading">
                🎓 Kurz {STAFF_ATTRIBUTE_LABELS[m.courseAttribute]} - zbývá {m.courseWeeksRemaining} {m.courseWeeksRemaining === 1 ? "týden" : (m.courseWeeksRemaining ?? 0) < 5 ? "týdny" : "týdnů"}
              </div>
            ) : m.courses && m.courses.length > 0 ? (
              <details className="text-xs group">
                <summary className="cursor-pointer text-muted hover:text-ink font-heading flex items-center justify-between py-1 select-none">
                  <span>📚 Poslat na kurz…</span>
                  <span className="text-[11px] text-pitch-700 font-normal">
                    Doporučeno: <strong>{STAFF_ATTRIBUTE_LABELS[def.primary]}</strong> / <strong>{STAFF_ATTRIBUTE_LABELS[def.secondary]}</strong>
                  </span>
                </summary>
                <div className="mt-2 space-y-1.5">
                  {[...m.courses]
                    .sort((a, b) => {
                      const getWeight = (k: StaffAttributeKey) => {
                        if (k === def.primary) return 0;
                        if (k === def.secondary) return 1;
                        return 2;
                      };
                      const diff = getWeight(a.attribute) - getWeight(b.attribute);
                      if (diff !== 0) return diff;
                      return a.attribute.localeCompare(b.attribute);
                    })
                    .map((q) => {
                      const isPrim = q.attribute === def.primary;
                      const isSec = q.attribute === def.secondary;
                      const curVal = staffAttributeValue(m, q.attribute);
                      const nextVal = curVal + q.points;
                      const nextEff = staffEffectiveness(staffWithUpdatedAttr(m, q.attribute, q.points), role);
                      const effDiff = nextEff - eff;

                      return (
                        <button
                          key={q.attribute}
                          type="button"
                          onClick={() => doCourse(m, q)}
                          className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-left rounded-soft border p-2 transition-all ${
                            isPrim
                              ? "bg-pitch-500/10 border-pitch-500/30 hover:border-pitch-500/60 hover:bg-pitch-500/15"
                              : isSec
                              ? "bg-gold-500/10 border-gold-500/30 hover:border-gold-500/60 hover:bg-gold-500/15"
                              : "border-gray-100 hover:border-gray-300 opacity-70 hover:opacity-100 bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isPrim ? (
                              <span className="text-[10px] font-heading font-black text-pitch-700 bg-pitch-500/20 border border-pitch-500/30 rounded px-1.5 py-0.5 shrink-0">
                                ★ Klíčový (2×)
                              </span>
                            ) : isSec ? (
                              <span className="text-[10px] font-heading font-bold text-gold-700 bg-gold-500/20 border border-gold-500/30 rounded px-1.5 py-0.5 shrink-0">
                                Důležitý (1×)
                              </span>
                            ) : (
                              <span className="text-[10px] font-heading text-muted bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                                Ostatní
                              </span>
                            )}
                            <div className="truncate">
                              <span className="font-heading font-bold text-ink">{STAFF_ATTRIBUTE_LABELS[q.attribute]}</span>
                              <span className="text-muted ml-1 tabular-nums">+{q.points} ({curVal} → {nextVal})</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 text-right pl-7 sm:pl-0">
                            {effDiff > 0 ? (
                              <span className="text-pitch-600 font-heading font-bold text-[11px] tabular-nums whitespace-nowrap">
                                → efektivita {nextEff}/20 (+{effDiff})
                              </span>
                            ) : (
                              <span className="text-muted text-[11px] tabular-nums whitespace-nowrap">
                                {isPrim || isSec ? "beze změny efektivity" : "neovlivní roli"}
                              </span>
                            )}
                            <span className="text-muted tabular-nums text-xs whitespace-nowrap">
                              {q.weeks} týd · {czk(q.cost)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </details>
            ) : null}

            {/* Info řádek + akce */}
            <span className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2">
              <span className="text-xs text-muted">Mzda <span className="font-heading font-bold text-ink tabular-nums">{czk(m.weeklyWage)}</span>/týd</span>
              <span className="flex items-center gap-2">
                <select
                  value=""
                  onChange={(e) => { const r = e.target.value as StaffRole; if (r) doReassign(m, r); }}
                  className="text-xs border border-gray-200 rounded-soft px-2 py-1 font-heading text-muted bg-white">
                  <option value="">Přeřadit…</option>
                  {STAFF_ROLE_ORDER.filter((r) => r !== role && !isRoleOccupied(r, m.id)).map((r) => (
                    <option key={r} value={r}>{ROLE_DEFS[r].label} ({staffEffectiveness(m, r)}/20)</option>
                  ))}
                </select>
                <button onClick={() => doFire(m)}
                  className="text-xs text-muted hover:text-card-red font-heading uppercase transition-colors">✕ propustit</button>
              </span>
            </span>
          </span>
        } />
    );
  };

  const renderEmptySlot = (role: StaffRole, labelOverride?: string) => {
    const def = ROLE_DEFS[role];
    return (
      <ListRow key={`empty-${role}-${labelOverride ?? "slot"}`}
        leading={<RowIcon>👤</RowIcon>}
        title={<>{labelOverride ?? def.label}<span className="ml-2 align-middle"><StatusChip tone="ok">Volný slot</StatusChip></span></>}
        detail={
          <span className="block space-y-1.5">
            <span className="block text-muted">{def.effectDesc}</span>
            <span className="flex items-center gap-1.5 flex-wrap text-xs text-muted">
              <span>Klíčové:</span>
              <span className="text-pitch-700 font-bold">★ {STAFF_ATTRIBUTE_LABELS[def.primary]} (2×)</span>
              <span className="text-muted/40">·</span>
              <span className="text-gold-700 font-semibold">{STAFF_ATTRIBUTE_LABELS[def.secondary]} (1×)</span>
            </span>
            <span className="block pt-0.5">
              <button onClick={() => { setMarketRoleFilter(role); setTab("market"); }}
                className="btn btn-primary btn-sm">Najmout →</button>
            </span>
          </span>
        } />
    );
  };

  return (
    <>
      <div className="page-container space-y-4">
        {/* Tab bar */}
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Zaměstnanci"
          items={tabs.map(([key, label, count]) => ({ key, label, count: count || null }))}
        />

        {tab === "team" && (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              Zaměstnanci nejsou povinní - jsou to bonusy. Role můžeš obsadit jedním specialistou, skautů můžeš mít podle své trenérské licence až 5. Kohokoli můžeš najmout na jakoukoli roli a jeho <strong>atributy</strong> určují, jak dobrý v roli bude.
            </p>
            {GROUP_ORDER.map((group) => {
              if (group === "scouting") {
                return (
                  <div key={group} className="space-y-2">
                    <ListCard title={STAFF_GROUP_LABELS[group]}>
                      {hiredScouts.map((m) => renderMemberRow(m, "skaut"))}
                      {hiredScouts.length < maxScouts && (
                        renderEmptySlot("skaut", hiredScouts.length === 0 ? undefined : `Další skaut (${hiredScouts.length + 1}/${maxScouts})`)
                      )}
                    </ListCard>
                    <div className="text-xs text-muted flex items-center gap-2 pt-1 flex-wrap">
                      <span>Kapacita skautů: <strong>{hiredScouts.length}/{maxScouts}</strong>.</span>
                      {maxScouts < 5 ? (
                        <span>Další slot odemkneš s vyšší trenérskou licencí ({coachLicence < 2 ? "UEFA B" : coachLicence === 2 ? "UEFA A" : "UEFA Pro"}).</span>
                      ) : (
                        <span>Máš odemčený maximální počet skautů (5).</span>
                      )}
                    </div>
                  </div>
                );
              }

              const rolesInGroup = STAFF_ROLE_ORDER.filter((r) => ROLE_DEFS[r].group === group);
              return (
                <ListCard key={group} title={STAFF_GROUP_LABELS[group]}>
                  {rolesInGroup.map((role) => {
                    const m = byRole.get(role);
                    if (!m) {
                      return renderEmptySlot(role);
                    }
                    return renderMemberRow(m, role);
                  })}
                </ListCard>
              );
            })}
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-3">
            {market.length === 0 ? (
              <ListCard>
                <ListEmpty icon="👔">
                  <strong className="block font-heading font-bold text-ink">Nikdo volný</strong>
                  V okrese zrovna nikdo nehledá práci. Mrkni zítra, nabídka se průběžně obměňuje.
                </ListEmpty>
              </ListCard>
            ) : (
              <>
                {/* Filtr podle role (zaměření kandidáta) */}
                <div className="flex items-center gap-2">
                  <span className="text-micro uppercase font-heading font-bold text-muted tracking-wide shrink-0">Filtr role</span>
                  <select
                    value={marketRoleFilter}
                    onChange={(e) => setMarketRoleFilter(e.target.value as StaffRole | "all")}
                    className="text-sm border border-gray-200 rounded-soft px-2.5 py-1.5 font-heading bg-white flex-1 min-w-[10rem]">
                    <option value="all">Všechny role ({market.length})</option>
                    {STAFF_ROLE_ORDER.map((r) => {
                      const n = market.filter((c) => c.profession === r).length;
                      return <option key={r} value={r} disabled={n === 0}>{ROLE_DEFS[r].label} ({n})</option>;
                    })}
                  </select>
                </div>

                <ListCard>
                  {filteredMarket.length === 0 ? (
                    <ListEmpty icon="👔">
                      Pro roli <strong>{marketRoleFilter !== "all" ? ROLE_DEFS[marketRoleFilter].label : ""}</strong> zrovna nikdo volný není.
                    </ListEmpty>
                  ) : (
                    filteredMarket.map((cand) => {
                      const selected = pickRole[cand.id] ?? cand.profession;
                      const eff = staffEffectiveness(cand, selected);
                      const needsLicence = (cand.requiredLicence ?? 0) > coachLicence;
                      const occupied = isRoleOccupied(selected);
                      // Zaměření a věk jdou do odstavce: v jednom řádku by se dlouhá role uřízla.
                      return (
                        <ListRow key={cand.id}
                          leading={<Avatar m={cand} />}
                          title={`${cand.firstName} ${cand.lastName}`}
                          detail={
                            <span className="block space-y-1.5">
                              <span className="block text-xs text-muted">
                                umí nejlíp: <strong>{ROLE_DEFS[cand.profession].label}</strong> · {cand.age} let{cand.gender === "f" ? " · žena" : ""}
                              </span>
                              {cand.description && <span className="block text-xs text-gold-600 italic truncate">„{cand.description}"</span>}

                              <AttrGrid m={cand} role={selected} />

                              {/* Výběr role + fit */}
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted font-heading">Najmout jako:</span>
                                <select
                                  value={selected}
                                  onChange={(e) => setPickRole((p) => ({ ...p, [cand.id]: e.target.value as StaffRole }))}
                                  className="text-xs border border-gray-200 rounded-soft px-2 py-1 font-heading bg-white flex-1 min-w-[10rem]">
                                  {STAFF_ROLE_ORDER.map((r) => {
                                    const roleFull = isRoleOccupied(r);
                                    return (
                                      <option key={r} value={r} disabled={roleFull}>
                                        {ROLE_DEFS[r].label} ({staffEffectiveness(cand, r)}/20){roleFull ? ", obsazeno" : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                                <span className={`text-sm font-heading font-bold tabular-nums ${effClass(eff)}`}>{eff}/20</span>
                              </span>

                              <span className="block text-xs text-muted">{ROLE_DEFS[selected].effectDesc}</span>

                              {selected === "skaut" && occupied && (
                                <span className="block text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-soft px-3 py-1.5 font-heading">
                                  Kapacita skautů je plná ({hiredScouts.length}/{maxScouts}). Dalšího skauta odemkneš s vyšší trenérskou licencí.
                                </span>
                              )}

                              {(cand.requiredLicence ?? 0) > 0 && (
                                <span className={`block text-sm rounded-soft px-3 py-2 border ${needsLicence ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-surface border-gray-100 text-muted"}`}>
                                  🎓 Chce trenéra s licencí aspoň <strong>{licenceLabel(cand.requiredLicence ?? 0)}</strong>
                                  {needsLicence ? ". Tvůj trenér ji zatím nemá." : ". Tvůj trenér ji má."}
                                </span>
                              )}

                              {/* Info řádek + akce */}
                              <span className="flex items-center justify-between gap-3 border-t border-line-soft pt-2">
                                <span className="text-xs text-muted">
                                  Podpisné <span className="font-heading font-bold text-ink tabular-nums">{czk(cand.signingFee)}</span>
                                  <span className="mx-1">·</span>
                                  mzda <span className="font-heading font-bold text-ink tabular-nums">{czk(cand.weeklyWage)}</span>/týd
                                </span>
                                <button onClick={() => doHire(cand, selected)}
                                  disabled={occupied || needsLicence}
                                  className="btn btn-primary btn-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                                  Najmout
                                </button>
                              </span>
                            </span>
                          } />
                      );
                    })
                  )}
                </ListCard>
              </>
            )}
          </div>
        )}
      </div>
      {dialog}
    </>
  );
}
