"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Tabs, useTabParam, ListCard, ListEmpty, PageLoading, Sheet } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FaceAvatar } from "@/components/players/face-avatar";
import { StaffTaskBox, ROW_BUTTON_CLASS, ROW_CONTROL_TOUCH, canAssignTask, type StaffTasksData } from "@/components/staff/StaffTaskBox";
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
import { formatKc } from "@/lib/format";

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

/**
 * Tabulka zaměstnanců jako ve Football Manageru: na počítači jeden řádek na člověka
 * (jméno, efektivita, sedm atributů, úkol, mzda, akce), na telefonu malá karta.
 * Dřív měl každý kartu přes celou obrazovku, i když v ní bylo pár řádků textu (2026-11-18).
 */
const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,14rem)_3.5rem_repeat(7,2.25rem)_minmax(0,1fr)_6.5rem_9rem] lg:items-center lg:gap-x-2";

function TableHead({ task, money }: { task: string; money: string }) {
  return (
    <div className={`hidden ${ROW_GRID} px-4 py-2 border-b border-line text-micro font-bold uppercase tracking-wider text-muted`}>
      <span>Jméno</span>
      <span className="text-center">Efekt.</span>
      {ATTR_ORDER.map((a) => (
        <span key={a} className="text-center" title={STAFF_ATTRIBUTE_LABELS[a]}>{ATTR_SHORT[a]}</span>
      ))}
      <span>{task}</span>
      <span className="text-right">{money}</span>
      <span />
    </div>
  );
}

/** Sedm atributů. Ty, které rozhodují o efektivitě v roli, jsou podbarvené. */
function AttrCells({ m, role, activeCourse }: {
  m: StaffMember;
  role: StaffRole;
  activeCourse?: StaffAttributeKey | null;
}) {
  const def = ROLE_DEFS[role];
  return (
    <div className="grid grid-cols-7 gap-1 lg:contents">
      {ATTR_ORDER.map((a) => {
        const v = staffAttributeValue(m, a);
        const tone = def.primary === a
          ? "bg-pitch-500/15 text-pitch-700 font-bold"
          : def.secondary === a
          ? "bg-gold-500/15 text-gold-700 font-bold"
          : "text-ink-light";
        const weight = def.primary === a ? ", rozhoduje 2×" : def.secondary === a ? ", rozhoduje 1×" : "";
        return (
          <span key={a} title={`${STAFF_ATTRIBUTE_LABELS[a]}${weight}${activeCourse === a ? ", právě na kurzu" : ""}`}
            className={`flex flex-col items-center justify-center rounded-tight py-1.5 text-sm tabular-nums ${tone} ${activeCourse === a ? "ring-1 ring-gold-500" : ""}`}>
            <span className="lg:hidden text-micro font-normal text-muted leading-none mb-1">{ATTR_SHORT[a]}</span>
            {v}
          </span>
        );
      })}
    </div>
  );
}

function Eff({ value }: { value: number }) {
  return (
    <span className={`text-body font-bold tabular-nums ${effClass(value)}`}>
      {value}<span className="text-meta font-normal text-muted">/20</span>
    </span>
  );
}

function weeksWord(n: number): string {
  return n === 1 ? "týden" : n < 5 ? "týdny" : "týdnů";
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
  const { confirm, dialog } = useConfirm({ sheet: true });
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [loading, setLoading] = useState(true);
  const [hired, setHired] = useState<StaffMember[]>([]);
  const [market, setMarket] = useState<Array<StaffMember & { requiredLicence?: number }>>([]);
  const [coachLicence, setCoachLicence] = useState(0);
  const [maxScouts, setMaxScouts] = useState(2);
  const [pickRole, setPickRole] = useState<Record<string, StaffRole>>({});
  const [marketRoleFilter, setMarketRoleFilter] = useState<StaffRole | "all">("all");
  const [tasksData, setTasksData] = useState<StaffTasksData | null>(null);
  // Plachta s nabídkou kurzů: komu a v jaké roli.
  const [courseFor, setCourseFor] = useState<{ m: StaffMember; role: StaffRole } | null>(null);

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
        { label: "Podpisné", value: `−${formatKc(cand.signingFee)}`, color: "text-card-red" },
        { label: "Mzda", value: `${formatKc(cand.weeklyWage)}/týd`, color: "text-ink" },
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
      { label: "Cena", value: `−${formatKc(q.cost)}`, color: "text-card-red" },
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

  if (loading) return <PageLoading />;

  const tabs: [Tab, string, number][] = [["team", "Tým", hired.length], ["market", "Volní", market.length]];
  const filteredMarket = marketRoleFilter === "all" ? market : market.filter((c) => c.profession === marketRoleFilter);

  const onAction = (m: StaffMember, role: StaffRole, value: string) => {
    if (value === "course") setCourseFor({ m, role });
    else if (value === "fire") doFire(m);
    else if (value.startsWith("role:")) doReassign(m, value.slice(5) as StaffRole);
  };

  const renderMemberRow = (m: StaffMember, role: StaffRole) => {
    const def = ROLE_DEFS[role];
    const eff = staffEffectiveness(m, role);
    const reassignTo = STAFF_ROLE_ORDER.filter((r) => r !== role && !isRoleOccupied(r, m.id));
    const member = { id: m.id, role, firstName: m.firstName, lastName: m.lastName, gender: m.gender, taskCooldownUntil: m.taskCooldownUntil };
    const courseLine = m.courseAttribute && (
      <div className="mt-1 text-meta text-gold-700 lg:truncate">
        Kurz {STAFF_ATTRIBUTE_LABELS[m.courseAttribute]}, ještě {m.courseWeeksRemaining} {weeksWord(m.courseWeeksRemaining ?? 0)}
      </div>
    );

    // Na počítači řádek tabulky. Na telefonu karta: jméno, atributy, stav úkolu
    // a dole jeden řádek přes celou šířku se „Zadat úkol“ a „Upravit…“ vedle sebe.
    return (
      <div key={m.id} className={`px-4 py-3 lg:py-2 border-b border-line-soft last:border-b-0 space-y-3 lg:space-y-0 ${ROW_GRID}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0"><Avatar m={m} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-body font-bold text-ink truncate" title={m.description ?? undefined}>{m.firstName} {m.lastName}</span>
            <span className="block mt-0.5 text-meta text-muted truncate" title={def.effectDesc}>
              {def.label} · {m.age} let<span className="lg:hidden"> · {formatKc(m.weeklyWage)}/týd</span>
            </span>
          </span>
          <span className="lg:hidden shrink-0"><Eff value={eff} /></span>
        </div>
        <span className="hidden lg:block text-center"><Eff value={eff} /></span>

        <AttrCells m={m} role={role} activeCourse={m.courseAttribute} />

        {/* Sloupec Úkol na počítači */}
        <div className="hidden lg:block min-w-0">
          {role === "skaut" ? (
            <Link href={`/zamestnanci/skaut?scoutId=${m.id}`} className="text-sm font-bold text-pitch-700 hover:underline">
              Úkol a hlášení →
            </Link>
          ) : teamId && (
            <StaffTaskBox teamId={teamId} member={member} data={tasksData} onChanged={refresh} />
          )}
          {courseLine}
        </div>

        {/* Stav úkolu na telefonu */}
        {role !== "skaut" && teamId && (
          <StaffTaskBox teamId={teamId} member={member} data={tasksData} onChanged={refresh} part="status" className="lg:hidden" />
        )}
        {courseLine && <div className="lg:hidden">{courseLine}</div>}

        <div className="flex items-center gap-2 lg:contents">
          <span className="hidden lg:block text-sm text-muted tabular-nums text-right">
            <strong className="text-ink">{formatKc(m.weeklyWage)}</strong>/týd
          </span>
          {/* Obal schovává tlačítko na počítači: `.btn` nastavuje display mimo vrstvy
              Tailwindu, takže `lg:hidden` přímo na tlačítku nezabere. */}
          {role === "skaut" ? (
            <span className="flex grow basis-1/2 min-w-0 lg:hidden">
              <Link href={`/zamestnanci/skaut?scoutId=${m.id}`} className={`${ROW_BUTTON_CLASS} w-full`}>Úkol a hlášení</Link>
            </span>
          ) : teamId && canAssignTask(member, tasksData) && (
            <span className="flex grow basis-1/2 min-w-0 lg:hidden">
              <StaffTaskBox teamId={teamId} member={member} data={tasksData} onChanged={refresh} part="button" buttonClassName="w-full" />
            </span>
          )}
          <select value="" onChange={(e) => onAction(m, role, e.target.value)}
            aria-label={`Upravit: ${m.firstName} ${m.lastName}`}
            className={`select !text-sm !py-0 h-9 !font-heading grow basis-1/2 min-w-0 lg:w-full ${ROW_CONTROL_TOUCH}`}>
            <option value="">Upravit…</option>
            {!m.courseAttribute && (m.courses?.length ?? 0) > 0 && <option value="course">Poslat na kurz</option>}
            {reassignTo.length > 0 && (
              <optgroup label="Přeřadit na">
                {reassignTo.map((r) => (
                  <option key={r} value={`role:${r}`}>{ROLE_DEFS[r].label} ({staffEffectiveness(m, r)}/20)</option>
                ))}
              </optgroup>
            )}
            <option value="fire">Propustit</option>
          </select>
        </div>
      </div>
    );
  };

  const renderEmptySlot = (role: StaffRole, labelOverride?: string) => {
    const def = ROLE_DEFS[role];
    return (
      <div key={`empty-${role}-${labelOverride ?? "slot"}`}
        className={`flex items-center gap-3 px-4 py-3 lg:py-2 border-b border-line-soft last:border-b-0 ${ROW_GRID}`}>
        <div className="flex flex-1 items-center gap-3 min-w-0 lg:col-span-10">
          <span className="shrink-0 w-9 h-9 rounded-full border-2 border-dashed border-line" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-body font-bold text-muted truncate">{labelOverride ?? def.label}</span>
            <span className="block text-meta text-muted truncate">Volné místo · {def.effectDesc}</span>
          </span>
        </div>
        <span className="hidden lg:block" />
        <button onClick={() => { setMarketRoleFilter(role); setTab("market"); }}
          className={`${ROW_BUTTON_CLASS} shrink-0 lg:justify-self-end`}>Najmout</button>
      </div>
    );
  };

  const renderCandidateRow = (cand: StaffMember & { requiredLicence?: number }) => {
    const selected = pickRole[cand.id] ?? cand.profession;
    const eff = staffEffectiveness(cand, selected);
    const needsLicence = (cand.requiredLicence ?? 0) > coachLicence;
    const occupied = isRoleOccupied(selected);

    return (
      <div key={cand.id} className={`px-4 py-3 lg:py-2 border-b border-line-soft last:border-b-0 space-y-3 lg:space-y-0 ${ROW_GRID}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0"><Avatar m={cand} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-body font-bold text-ink truncate" title={cand.description ?? undefined}>{cand.firstName} {cand.lastName}</span>
            <span className="block mt-0.5 text-meta text-muted truncate">
              {ROLE_DEFS[cand.profession].label} · {cand.age} let
              {needsLicence && <span className="text-card-red"> · chce licenci {licenceLabel(cand.requiredLicence ?? 0)}</span>}
            </span>
          </span>
          <span className="lg:hidden shrink-0"><Eff value={eff} /></span>
        </div>
        <span className="hidden lg:block text-center"><Eff value={eff} /></span>

        <AttrCells m={cand} role={selected} />

        <div className="min-w-0">
          <select value={selected}
            onChange={(e) => setPickRole((p) => ({ ...p, [cand.id]: e.target.value as StaffRole }))}
            aria-label={`Najmout jako: ${cand.firstName} ${cand.lastName}`}
            className="select !text-sm !py-1 !font-heading w-full">
            {STAFF_ROLE_ORDER.map((r) => {
              const roleFull = isRoleOccupied(r);
              return (
                <option key={r} value={r} disabled={roleFull}>
                  {ROLE_DEFS[r].label} ({staffEffectiveness(cand, r)}/20){roleFull ? ", obsazeno" : ""}
                </option>
              );
            })}
          </select>
          {selected === "skaut" && occupied && (
            <div className="text-meta text-card-red truncate">Skautů máš plno ({hiredScouts.length}/{maxScouts})</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 lg:contents">
          <span className="text-sm text-muted tabular-nums lg:text-right">
            <strong className="text-ink">{formatKc(cand.weeklyWage)}</strong>/týd
            <span className="block text-meta">podpis {formatKc(cand.signingFee)}</span>
          </span>
          <button onClick={() => doHire(cand, selected)}
            disabled={occupied || needsLicence}
            title={needsLicence ? `Chce trenéra s licencí aspoň ${licenceLabel(cand.requiredLicence ?? 0)}` : undefined}
            className={`${ROW_BUTTON_CLASS} shrink-0 lg:justify-self-end`}>
            Najmout
          </button>
        </div>
      </div>
    );
  };

  const course = courseFor;
  const courseDef = course ? ROLE_DEFS[course.role] : null;
  const courseEff = course ? staffEffectiveness(course.m, course.role) : 0;

  return (
    <>
      <div className="page-container space-y-4">
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Zaměstnanci"
          items={tabs.map(([key, label, count]) => ({ key, label, count: count || null }))}
        />

        {tab === "team" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Zaměstnanci nejsou povinní, jsou to bonusy. Každou roli obsadí jeden člověk, skautů můžeš mít podle licence až 5.
              Efektivitu v roli určují podbarvené atributy: <span className="text-pitch-700 font-bold">zelený</span> dvojnásob, <span className="text-gold-700 font-bold">žlutý</span> jednou.
            </p>
            {GROUP_ORDER.map((group) => {
              if (group === "scouting") {
                return (
                  <div key={group} className="space-y-2">
                    <ListCard title={STAFF_GROUP_LABELS[group]} count={`${hiredScouts.length}/${maxScouts}`}>
                      <TableHead task="Úkol" money="Mzda" />
                      {hiredScouts.map((m) => renderMemberRow(m, "skaut"))}
                      {hiredScouts.length < maxScouts && (
                        renderEmptySlot("skaut", hiredScouts.length === 0 ? undefined : `Další skaut (${hiredScouts.length + 1}/${maxScouts})`)
                      )}
                    </ListCard>
                    {maxScouts < 5 && (
                      <p className="text-sm text-muted">
                        Dalšího skauta odemkneš s licencí {coachLicence < 2 ? "UEFA B" : coachLicence === 2 ? "UEFA A" : "UEFA Pro"}.
                      </p>
                    )}
                  </div>
                );
              }

              const rolesInGroup = STAFF_ROLE_ORDER.filter((r) => ROLE_DEFS[r].group === group);
              return (
                <ListCard key={group} title={STAFF_GROUP_LABELS[group]}>
                  <TableHead task="Úkol" money="Mzda" />
                  {rolesInGroup.map((role) => {
                    const m = byRole.get(role);
                    return m ? renderMemberRow(m, role) : renderEmptySlot(role);
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
                <div className="flex items-center gap-2">
                  <span className="text-micro uppercase font-heading font-bold text-muted tracking-wide shrink-0">Filtr role</span>
                  <select
                    value={marketRoleFilter}
                    onChange={(e) => setMarketRoleFilter(e.target.value as StaffRole | "all")}
                    className="select !text-sm !py-1.5 !font-heading flex-1 min-w-[10rem] lg:flex-none">
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
                    <>
                      <TableHead task="Najmout jako" money="Mzda" />
                      {filteredMarket.map(renderCandidateRow)}
                    </>
                  )}
                </ListCard>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!course} onClose={() => setCourseFor(null)} title="Poslat na kurz">
        {course && courseDef && (
          <div className="px-5 pt-3 sm:pt-5 pb-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-heading font-bold text-lg">Poslat na kurz</div>
                <div className="text-sm text-muted">{course.m.firstName} {course.m.lastName} · {courseDef.label} · efektivita {courseEff}/20</div>
              </div>
              <button type="button" onClick={() => setCourseFor(null)} aria-label="Zavřít" className="text-muted hover:text-ink text-xl leading-none px-1">✕</button>
            </div>
            <p className="text-sm text-muted">
              Pro roli se vyplatí <strong className="text-pitch-700">{STAFF_ATTRIBUTE_LABELS[courseDef.primary]}</strong> a <strong className="text-gold-700">{STAFF_ATTRIBUTE_LABELS[courseDef.secondary]}</strong>. Na kurzu dál normálně pracuje.
            </p>
            <div className="divide-y divide-line-soft border border-line rounded-soft">
              {[...(course.m.courses ?? [])]
                .sort((x, y) => {
                  const w = (k: StaffAttributeKey) => (k === courseDef.primary ? 0 : k === courseDef.secondary ? 1 : 2);
                  return w(x.attribute) - w(y.attribute) || x.attribute.localeCompare(y.attribute);
                })
                .map((q) => {
                  const cur = staffAttributeValue(course.m, q.attribute);
                  const nextEff = staffEffectiveness(staffWithUpdatedAttr(course.m, q.attribute, q.points), course.role);
                  const gain = nextEff - courseEff;
                  return (
                    <button key={q.attribute} type="button"
                      onClick={() => { const c = course; setCourseFor(null); doCourse(c.m, q); }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-ink">
                          {STAFF_ATTRIBUTE_LABELS[q.attribute]} <span className="font-normal text-muted tabular-nums">{cur} → {cur + q.points}</span>
                        </span>
                        <span className={`block text-meta ${gain > 0 ? "text-pitch-700 font-semibold" : "text-muted"}`}>
                          {gain > 0 ? `efektivita ${nextEff}/20 (+${gain})` : "efektivitu v roli nezmění"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm tabular-nums">
                        <strong className="text-ink">{formatKc(q.cost)}</strong>
                        <span className="block text-meta text-muted">{q.weeks} {weeksWord(q.weeks)}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </Sheet>
      {dialog}
    </>
  );
}
