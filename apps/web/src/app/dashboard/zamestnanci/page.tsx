"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FaceAvatar } from "@/components/players/face-avatar";
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
}

type Tab = "team" | "market";

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

function AttrGrid({ m }: { m: StaffMember }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {ATTR_ORDER.map((a) => {
        const v = staffAttributeValue(m, a);
        return (
          <div key={a} className="text-center">
            <div className={`text-sm font-heading font-bold tabular-nums ${attrColor(v)}`}>{v}</div>
            <div className="text-[9px] text-muted font-heading uppercase" title={STAFF_ATTRIBUTE_LABELS[a]}>{ATTR_SHORT[a]}</div>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ m, size = 48 }: { m: StaffMember; size?: number }) {
  const hasFace = m.avatar && typeof m.avatar === "object" && Object.keys(m.avatar).length > 2;
  return hasFace
    ? <FaceAvatar faceConfig={m.avatar as Record<string, unknown>} size={size} className="rounded-soft bg-white" />
    : <div className="rounded-soft bg-surface flex items-center justify-center font-heading font-bold" style={{ width: size, height: size }}>{m.firstName[0]}</div>;
}

export default function ZamestnanciPage() {
  const { teamId } = useTeam();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("team");
  const [loading, setLoading] = useState(true);
  const [hired, setHired] = useState<StaffMember[]>([]);
  const [market, setMarket] = useState<StaffMember[]>([]);
  const [pickRole, setPickRole] = useState<Record<string, StaffRole>>({});
  const [marketRoleFilter, setMarketRoleFilter] = useState<StaffRole | "all">("all");

  const refresh = async () => {
    if (!teamId) return;
    const [s, m] = await Promise.all([
      apiFetch<{ staff: StaffMember[] }>(`/api/teams/${teamId}/staff`).catch((e) => { console.error("load staff:", e); return null; }),
      apiFetch<{ market: StaffMember[] }>(`/api/teams/${teamId}/staff/market`).catch((e) => { console.error("load market:", e); return null; }),
    ]);
    if (s) setHired(s.staff ?? []);
    if (m) setMarket(m.market ?? []);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [teamId]);

  const byRole = new Map<StaffRole, StaffMember>();
  for (const s of hired) if (s.role) byRole.set(s.role, s);
  const occupiedRoles = new Set(byRole.keys());

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
    const ok = await confirm({
      title: `Přeřadit na ${ROLE_DEFS[role].label}?`,
      description: `${m.firstName} ${m.lastName} · efektivita v nové roli ${eff}/20`,
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
    const ok = await confirm({
      title: `Kurz: ${STAFF_ATTRIBUTE_LABELS[q.attribute]} +${q.points}`,
      description: `${m.firstName} ${m.lastName} bude ${q.weeks} týdnů na kurzu (mezitím normálně pracuje).`,
      details: [
        { label: "Cena", value: `−${czk(q.cost)}`, color: "text-card-red" },
        { label: "Délka", value: `${q.weeks} týdnů`, color: "text-ink" },
      ],
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

  return (
    <>
      <div className="page-container space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 bg-surface rounded-xl p-1">
          {tabs.map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 text-sm font-heading font-bold rounded-soft transition-colors ${
                tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"}`}>
              {label}{count > 0 ? ` (${count})` : ""}
            </button>
          ))}
        </div>

        {tab === "team" && (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              Zaměstnanci nejsou povinní — jsou to bonusy. Každou roli obsadíš max jedním člověkem, ale kohokoli můžeš najmout na jakoukoli roli. Jeho <strong>atributy</strong> určují, jak dobrý v roli bude.
            </p>
            {GROUP_ORDER.map((group) => {
              const rolesInGroup = STAFF_ROLE_ORDER.filter((r) => ROLE_DEFS[r].group === group);
              return (
                <div key={group} className="space-y-2">
                  <div className="text-[11px] uppercase font-heading font-bold text-muted tracking-wide">{STAFF_GROUP_LABELS[group]}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {rolesInGroup.map((role) => {
                      const m = byRole.get(role);
                      const def = ROLE_DEFS[role];
                      if (!m) {
                        // Prázdný slot
                        return (
                          <div key={role} className="card p-4 border-2 border-dashed border-gray-100 flex flex-col gap-1.5">
                            <div className="font-heading font-bold text-base text-ink">{def.label}</div>
                            <div className="text-sm text-muted">{def.effectDesc}</div>
                            <div className="text-xs text-muted mt-1">
                              Klíčové: <strong>{STAFF_ATTRIBUTE_LABELS[def.primary]}</strong> ×2 + {STAFF_ATTRIBUTE_LABELS[def.secondary]}
                            </div>
                            <button onClick={() => setTab("market")}
                              className="btn btn-primary btn-sm self-start mt-1">Najmout →</button>
                          </div>
                        );
                      }
                      const eff = staffEffectiveness(m, role);
                      return (
                        <div key={role} className="card p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <Avatar m={m} />
                            <div className="flex-1 min-w-0">
                              <div className="font-heading font-bold text-base truncate">{m.firstName} {m.lastName}</div>
                              <div className="text-xs text-muted">{def.label} · {m.age} let{m.gender === "f" ? " · žena" : ""}</div>
                              {m.description && <div className="text-xs text-gold-600 italic mt-0.5 truncate">„{m.description}"</div>}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`text-lg font-heading font-bold tabular-nums ${effClass(eff)}`}>{eff}<span className="text-xs text-muted">/20</span></div>
                              <div className="text-[9px] uppercase text-muted font-heading">efektivita</div>
                            </div>
                          </div>

                          <AttrGrid m={m} />

                          <div className="text-xs text-muted">{def.effectDesc}</div>

                          {/* Kurz */}
                          {m.courseAttribute ? (
                            <div className="text-xs bg-gold-50 text-gold-700 rounded-soft px-3 py-2 font-heading">
                              🎓 Kurz {STAFF_ATTRIBUTE_LABELS[m.courseAttribute]} — zbývá {m.courseWeeksRemaining} {m.courseWeeksRemaining === 1 ? "týden" : (m.courseWeeksRemaining ?? 0) < 5 ? "týdny" : "týdnů"}
                            </div>
                          ) : m.courses && m.courses.length > 0 ? (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted hover:text-ink font-heading">📚 Poslat na kurz…</summary>
                              <div className="mt-2 grid grid-cols-1 gap-1.5">
                                {m.courses.map((q) => (
                                  <button key={q.attribute} onClick={() => doCourse(m, q)}
                                    className="flex items-center justify-between gap-2 text-left rounded-soft border border-gray-100 px-2.5 py-1.5 hover:border-pitch-300 transition-colors">
                                    <span className="font-heading">{STAFF_ATTRIBUTE_LABELS[q.attribute]} +{q.points}</span>
                                    <span className="text-muted tabular-nums">{q.weeks} týd · {czk(q.cost)}</span>
                                  </button>
                                ))}
                              </div>
                            </details>
                          ) : null}

                          {/* Info řádek + akce */}
                          <div className="flex items-center justify-between border-t border-gray-50 pt-2.5">
                            <div className="text-xs text-muted">Mzda <span className="font-heading font-bold text-ink tabular-nums">{czk(m.weeklyWage)}</span>/týd</div>
                            <div className="flex items-center gap-2">
                              <select
                                value=""
                                onChange={(e) => { const r = e.target.value as StaffRole; if (r) doReassign(m, r); }}
                                className="text-xs border border-gray-200 rounded-soft px-2 py-1 font-heading text-muted bg-white">
                                <option value="">Přeřadit…</option>
                                {STAFF_ROLE_ORDER.filter((r) => r !== role && !occupiedRoles.has(r)).map((r) => (
                                  <option key={r} value={r}>{ROLE_DEFS[r].label} ({staffEffectiveness(m, r)}/20)</option>
                                ))}
                              </select>
                              <button onClick={() => doFire(m)}
                                className="text-xs text-muted hover:text-card-red font-heading uppercase transition-colors">✕ propustit</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-3">
            {market.length === 0 ? (
              <div className="card p-8 text-center text-muted">
                <div className="text-4xl mb-3">👔</div>
                <p className="text-lg font-heading font-bold mb-2">Nikdo volný</p>
                <p className="text-sm">V okrese zrovna nikdo nehledá práci. Mrkni zítra — nabídka se průběžně obměňuje.</p>
              </div>
            ) : (
              <>
                {/* Filtr podle role (zaměření kandidáta) */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase font-heading font-bold text-muted tracking-wide shrink-0">Filtr role</span>
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

                {filteredMarket.length === 0 ? (
                  <div className="card p-6 text-center text-muted text-sm">
                    Pro roli <strong>{marketRoleFilter !== "all" ? ROLE_DEFS[marketRoleFilter].label : ""}</strong> zrovna nikdo volný není.
                  </div>
                ) : (
                filteredMarket.map((cand) => {
                const selected = pickRole[cand.id] ?? cand.profession;
                const eff = staffEffectiveness(cand, selected);
                return (
                  <div key={cand.id} className="card p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar m={cand} size={52} />
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-base truncate">{cand.firstName} {cand.lastName}</div>
                        <div className="text-xs text-muted">
                          umí nejlíp: <strong>{ROLE_DEFS[cand.profession].label}</strong> · {cand.age} let{cand.gender === "f" ? " · žena" : ""}
                        </div>
                        {cand.description && <div className="text-xs text-gold-600 italic mt-0.5 truncate">„{cand.description}"</div>}
                      </div>
                    </div>

                    <AttrGrid m={cand} />

                    {/* Výběr role + fit */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted font-heading">Najmout jako:</span>
                      <select
                        value={selected}
                        onChange={(e) => setPickRole((p) => ({ ...p, [cand.id]: e.target.value as StaffRole }))}
                        className="text-xs border border-gray-200 rounded-soft px-2 py-1 font-heading bg-white flex-1 min-w-[10rem]">
                        {STAFF_ROLE_ORDER.map((r) => (
                          <option key={r} value={r} disabled={occupiedRoles.has(r)}>
                            {ROLE_DEFS[r].label} ({staffEffectiveness(cand, r)}/20){occupiedRoles.has(r) ? " — obsazeno" : ""}
                          </option>
                        ))}
                      </select>
                      <span className={`text-sm font-heading font-bold tabular-nums ${effClass(eff)}`}>{eff}/20</span>
                    </div>

                    <div className="text-xs text-muted">{ROLE_DEFS[selected].effectDesc}</div>

                    {/* Info řádek + akce */}
                    <div className="flex items-center justify-between border-t border-gray-50 pt-2.5">
                      <div className="text-xs text-muted">
                        Podpisné <span className="font-heading font-bold text-ink tabular-nums">{czk(cand.signingFee)}</span>
                        <span className="mx-1">·</span>
                        mzda <span className="font-heading font-bold text-ink tabular-nums">{czk(cand.weeklyWage)}</span>/týd
                      </div>
                      <button onClick={() => doHire(cand, selected)}
                        disabled={occupiedRoles.has(selected)}
                        className="btn btn-primary btn-sm disabled:opacity-40 disabled:cursor-not-allowed">
                        Najmout
                      </button>
                    </div>
                  </div>
                );
              })
                )}
              </>
            )}
          </div>
        )}
      </div>
      {dialog}
    </>
  );
}
