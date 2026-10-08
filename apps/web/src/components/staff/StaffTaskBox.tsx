"use client";

/**
 * Úkol zaměstnance na jeho kartě v Zaměstnancích: co právě dělá, kdy si oddechne,
 * a plachta se zadáním nového úkolu. Skaut má vlastní stránku, sem nepatří.
 */

import { useState } from "react";
import Link from "next/link";
import { apiFetch, apiAction } from "@/lib/api";
import { Sheet } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatKg } from "@/lib/player-attrs";
import {
  STAFF_TASK_DEFS,
  YOUTH_PLAN_AGE_MAX,
  staffTaskCost,
  staffTasksForRole,
  type StaffRole,
  type StaffTaskPlayer,
  type StaffTaskType,
  type StaffTaskView,
} from "@okresni-masina/shared";

export interface StaffTasksData {
  gameDate: string;
  tasks: StaffTaskView[];
  nextMatch: { id: string; day: string; isHome: boolean; homeName: string; awayName: string } | null;
  players: StaffTaskPlayer[];
}

interface Member {
  id: string;
  role: StaffRole;
  firstName: string;
  lastName: string;
  gender: "m" | "f";
  taskCooldownUntil?: string | null;
}

const POSITION_LABEL: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };

function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }

function czDate(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d}. ${m}.`;
}

function daysWord(n: number): string {
  return n === 1 ? "den" : n < 5 ? "dny" : "dní";
}

/** Kdo dává smysl jako cíl úkolu. Ostatní se v nabídce nezobrazí. */
function eligiblePlayers(type: StaffTaskType, players: StaffTaskPlayer[]): StaffTaskPlayer[] {
  switch (type) {
    case "doctor_injury_care": return players.filter((p) => (p.injuryDays ?? 0) > 0);
    case "youth_plan": return players.filter((p) => p.age <= YOUTH_PLAN_AGE_MAX);
    case "gk_plan": return players.filter((p) => p.position === "GK");
    case "massage_prep": return players.filter((p) => !p.isU21);
    case "weight_plan": return players.filter((p) => p.weightCategory === "over" || p.weightCategory === "obese");
    default: return players;
  }
}

/** Stejné prahy a ikony jako v Kádru. */
function toneOf(v: number): string {
  if (v >= 80) return "text-pitch-500";
  if (v >= 50) return "text-gold-600";
  return "text-card-red";
}

function moraleIcon(v: number): string {
  if (v >= 80) return "😊";
  if (v >= 60) return "🙂";
  if (v >= 40) return "😐";
  if (v >= 20) return "😞";
  return "😡";
}

const LINEUP_LABEL: Record<"start" | "bench" | "out", { text: string; tone: string }> = {
  start: { text: "v základu", tone: "text-pitch-500" },
  bench: { text: "na lavičce", tone: "text-ink" },
  out: { text: "mimo sestavu", tone: "text-muted" },
};

interface Info { text: string; tone: string }

/** Co u hráče rozhoduje o tomhle úkolu. */
function playerInfo(type: StaffTaskType, p: StaffTaskPlayer): Info[] {
  const out: Info[] = [];
  const ageRating = () => {
    out.push({ text: `${p.age} let`, tone: "text-muted" });
    if (p.rating !== null) out.push({ text: `hodnocení ${p.rating}`, tone: "text-ink" });
  };
  switch (type) {
    case "doctor_injury_care": {
      const days = p.injuryDays ?? 0;
      out.push({ text: `🩹 ${p.injuryName ?? "zranění"}`, tone: "text-card-red" });
      out.push({ text: `zbývá ${days} ${daysWord(days)}${p.injuryDaysTotal ? ` z ${p.injuryDaysTotal}` : ""}`, tone: "text-ink" });
      break;
    }
    case "massage_prep":
      if (p.condition !== null) out.push({ text: `${p.condition >= 50 ? "🔋" : "🪫"} kondice ${p.condition} %`, tone: toneOf(p.condition) });
      if (p.lineup) out.push(LINEUP_LABEL[p.lineup]);
      break;
    case "psych_session":
      if (p.morale !== null) out.push({ text: `${moraleIcon(p.morale)} nálada ${p.morale} %`, tone: toneOf(p.morale) });
      if ((p.unrest ?? 0) > 0) out.push({ text: `🚪 chce pryč (nespokojenost ${p.unrest})`, tone: "text-card-red" });
      break;
    case "youth_plan":
    case "gk_plan":
      ageRating();
      break;
    case "weight_plan":
      if (p.weight !== null) out.push({ text: `⚖️ ${formatKg(p.weight)} kg`, tone: "text-ink" });
      if (p.weightExcess !== null) {
        out.push({
          text: `${p.weightCategory === "obese" ? "velká nadváha" : "nadváha"} +${formatKg(p.weightExcess)} kg`,
          tone: p.weightCategory === "obese" ? "text-card-red" : "text-gold-600",
        });
      }
      break;
    default:
      out.push({ text: `${p.age} let`, tone: "text-muted" });
  }
  return out;
}

/** Proč hráče na tenhle úkol teď vybrat nejde, jinak `null`. Server to hlídá taky. */
function unavailableReason(type: StaffTaskType, p: StaffTaskPlayer, data: StaffTasksData): string | null {
  const same = data.tasks.find((t) => t.status === "active" && t.taskType === type && t.targetPlayerId === p.id);
  if (same) return `tenhle úkol už má, do ${czDate(same.endsGameDate)}`;
  if (type === "psych_session" && p.psychAgainFrom && p.psychAgainFrom > data.gameDate) {
    return `u psychologa byl nedávno, znovu od ${czDate(p.psychAgainFrom)}`;
  }
  return null;
}

const LINEUP_ORDER = { start: 0, bench: 1, out: 2 } as const;

/** Komu se úkol nejvíc hodí, ten jde nahoru. */
function sortForTask(type: StaffTaskType, players: StaffTaskPlayer[]): StaffTaskPlayer[] {
  const arr = [...players];
  if (type === "massage_prep") {
    arr.sort((a, b) => (LINEUP_ORDER[a.lineup ?? "out"] - LINEUP_ORDER[b.lineup ?? "out"]) || (a.condition ?? 100) - (b.condition ?? 100));
  }
  if (type === "psych_session") arr.sort((a, b) => (b.unrest ?? 0) - (a.unrest ?? 0) || (a.morale ?? 50) - (b.morale ?? 50));
  if (type === "doctor_injury_care") arr.sort((a, b) => (b.injuryDays ?? 0) - (a.injuryDays ?? 0));
  if (type === "youth_plan") arr.sort((a, b) => a.age - b.age || (b.rating ?? 0) - (a.rating ?? 0));
  if (type === "weight_plan") arr.sort((a, b) => (b.weightExcess ?? 0) - (a.weightExcess ?? 0));
  return arr;
}

export function StaffTaskBox({ teamId, member, data, onChanged }: {
  teamId: string;
  member: Member;
  data: StaffTasksData | null;
  onChanged: () => void | Promise<void>;
}) {
  const { confirm, dialog } = useConfirm({ sheet: true });
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<StaffTaskType | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const types = staffTasksForRole(member.role);
  if (types.length === 0 || !data) return null;

  const active = data.tasks.find((t) => t.staffId === member.id && t.status === "active");
  const last = data.tasks.find((t) => t.staffId === member.id && t.status === "done");
  const resting = !active && member.taskCooldownUntil && member.taskCooldownUntil > data.gameDate ? member.taskCooldownUntil : null;
  const name = `${member.firstName} ${member.lastName}`;

  const reset = () => { setPicked(null); setPlayerId(""); setPlayerIds([]); setDuration(null); };
  const close = () => { setOpen(false); reset(); };

  const choose = (t: StaffTaskType) => {
    setPicked(t);
    setPlayerId("");
    setPlayerIds([]);
    setDuration(STAFF_TASK_DEFS[t].durations?.[0] ?? null);
  };

  const submit = async () => {
    if (!picked || busy) return;
    setBusy(true);
    const ok = await apiAction(apiFetch(`/api/teams/${teamId}/staff/${member.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType: picked, playerId: playerId || undefined, playerIds, durationDays: duration ?? undefined }),
    }), "Úkol se nepodařilo zadat");
    setBusy(false);
    if (ok) {
      close();
      await onChanged();
    }
  };

  const cancel = async (t: StaffTaskView) => {
    const def = STAFF_TASK_DEFS[t.taskType];
    const started = t.kind === "match" ? !!t.resultText : t.startsGameDate < data.gameDate;
    const yes = await confirm({
      title: `Zrušit úkol ${def.label}?`,
      description: started
        ? `${name} už začal${member.gender === "f" ? "a" : ""} pracovat, peníze se nevrátí.`
        : `Zatím se nezačalo, ${czk(t.costPaid)} se vrátí do pokladny.`,
      confirmLabel: "Zrušit úkol",
      cancelLabel: "Nechat běžet",
      variant: "danger",
    });
    if (!yes) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/staff/tasks/${t.id}`, { method: "DELETE" }), "Úkol se nepodařilo zrušit")) {
      await onChanged();
    }
  };

  const matchLine = data.nextMatch
    ? `${data.nextMatch.homeName} – ${data.nextMatch.awayName}, ${czDate(data.nextMatch.day)}${data.nextMatch.isHome ? " (doma)" : " (venku)"}`
    : null;

  const def = picked ? STAFF_TASK_DEFS[picked] : null;
  const candidates = picked
    ? sortForTask(picked, eligiblePlayers(picked, data.players))
      .map((p) => ({ p, blockedBy: unavailableReason(picked, p, data) }))
      .sort((a, b) => Number(!!a.blockedBy) - Number(!!b.blockedBy))
    : [];
  const noLineupYet = picked === "massage_prep" && candidates.length > 0 && candidates.every(({ p }) => p.lineup === null);
  const blocked = def ? (def.kind === "match" && (!data.nextMatch || (def.homeOnly && !data.nextMatch.isHome))) : false;
  const ready = !!def && !blocked
    && (def.target !== "player" || !!playerId)
    && (def.target !== "players" || playerIds.length > 0);

  return (
    <div className="space-y-2">
      {active ? (
        <div className="rounded-soft bg-pitch-500/10 border border-pitch-500/30 px-3 py-2.5 space-y-1">
          <div className="text-sm font-heading font-bold text-pitch-700">🧰 {STAFF_TASK_DEFS[active.taskType].label}</div>
          <div className="text-sm text-ink">
            {active.targetMatchLabel && <>Zápas {active.targetMatchLabel}, {czDate(active.endsGameDate)}</>}
            {active.targetPlayerId && (
              <><Link href={`/hrac/${active.targetPlayerId}`} className="font-bold underline decoration-dotted">{active.targetPlayerName}</Link>, do {czDate(active.endsGameDate)}</>
            )}
            {!active.targetMatchLabel && !active.targetPlayerId && <>Do {czDate(active.endsGameDate)}</>}
          </div>
          {active.playerNames.length > 0 && <div className="text-sm text-muted">Hráči: {active.playerNames.join(", ")}</div>}
          {active.resultText && <div className="text-sm text-ink">{active.resultText}</div>}
          <div className="flex justify-end">
            <button type="button" onClick={() => cancel(active)} className="text-sm text-muted hover:text-card-red font-heading">Zrušit úkol</button>
          </div>
        </div>
      ) : resting ? (
        <div className="text-sm rounded-soft bg-surface px-3 py-2 text-muted">
          😮‍💨 Po zápasovém úkolu si oddechne, další úkol vezme od {czDate(resting)}.
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm">Zadat úkol</button>
      )}

      {last?.resultText && !active && (
        <div className="text-sm text-muted">Naposledy: {last.resultText}</div>
      )}

      <Sheet open={open} onClose={close} title={def ? def.label : `Úkol: ${name}`}>
        <div className="px-5 pt-3 sm:pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-heading font-bold text-lg">{def ? def.label : "Zadat úkol"}</div>
            <div className="text-sm text-muted">{name}</div>
          </div>
          <button type="button" onClick={close} aria-label="Zavřít" className="text-muted hover:text-ink text-xl leading-none px-1">✕</button>
        </div>
        {!def ? (
          <div className="space-y-2">
            {types.map((t) => {
              const d = STAFF_TASK_DEFS[t];
              const unavailable = d.kind === "match" && (!data.nextMatch || (d.homeOnly && !data.nextMatch.isHome));
              return (
                <button key={t} type="button" onClick={() => choose(t)}
                  className="w-full text-left card p-3 space-y-1 hover:border-pitch-500/50 transition-colors">
                  <div className="font-heading font-bold text-base">{d.label}</div>
                  <div className="text-sm text-muted">{d.description}</div>
                  <div className="text-sm text-ink">
                    {d.kind === "match" ? "Na příští ligový zápas" : `Na ${d.durations?.map((x) => `${x}`).join(" nebo ")} dní`}
                    {" · "}{czk(staffTaskCost(t, d.durations?.[0]))}
                    {unavailable && <span className="text-card-red"> · {data.nextMatch ? "příští zápas je venku" : "žádný zápas v plánu"}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted">{def.description}</div>

            {def.kind === "match" && (
              <div className="text-sm">
                <span className="text-muted">Zápas: </span>
                {matchLine ?? <span className="text-card-red">Klub teď nemá žádný ligový zápas.</span>}
                {blocked && data.nextMatch && <div className="text-card-red mt-1">Tohle jde jen na domácí zápas.</div>}
              </div>
            )}

            {def.durations && def.durations.length > 1 && (
              <div className="flex gap-2">
                {def.durations.map((d) => (
                  <button key={d} type="button" onClick={() => setDuration(d)}
                    className={`btn btn-sm ${duration === d ? "btn-primary" : "btn-secondary"}`}>{d} dní</button>
                ))}
              </div>
            )}

            {def.target !== "none" && (
              <div className="space-y-1.5">
                <div className="text-sm font-heading font-bold">
                  {def.target === "players" ? `Vyber hráče (nejvýš ${def.maxPlayers})` : "Vyber hráče"}
                </div>
                {noLineupYet && (
                  <div className="text-sm text-muted">Sestavu na zápas ještě nemáš. Masáž dej hráčům, se kterými počítáš.</div>
                )}
                {candidates.length === 0 ? (
                  <div className="text-sm text-muted">
                    {picked === "doctor_injury_care" ? "Nikdo není zraněný."
                      : picked === "gk_plan" ? "V klubu není brankář."
                      : picked === "weight_plan" ? "Nikdo v kádru nemá nadváhu."
                      : "V klubu není nikdo vhodný."}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-soft">
                    {candidates.map(({ p, blockedBy }) => {
                      const selected = def.target === "players" ? playerIds.includes(p.id) : playerId === p.id;
                      const full = def.target === "players" && !selected && playerIds.length >= (def.maxPlayers ?? 5);
                      const disabled = full || !!blockedBy;
                      return (
                        <label key={p.id} className={`flex items-center gap-3 px-3 py-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${selected ? "bg-pitch-500/10" : ""}`}>
                          <input
                            type={def.target === "players" ? "checkbox" : "radio"}
                            name={`task-player-${member.id}`}
                            checked={selected}
                            disabled={disabled}
                            onChange={() => {
                              if (def.target === "players") {
                                setPlayerIds((cur) => cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]);
                              } else setPlayerId(p.id);
                            }}
                          />
                          <span className="text-sm font-heading text-muted w-9 shrink-0">{POSITION_LABEL[p.position] ?? p.position}</span>
                          <span className="flex-1 min-w-0">
                            <span className="text-base font-bold truncate block">{p.name}{p.isU21 ? " (U21)" : ""}</span>
                            <span className="text-sm flex flex-wrap gap-x-2">
                              {blockedBy
                                ? <span className="text-muted">{blockedBy}</span>
                                : playerInfo(picked!, p).map((i) => <span key={i.text} className={i.tone}>{i.text}</span>)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="text-sm border-t border-gray-100 pt-3 flex justify-between">
              <span className="text-muted">Cena</span>
              <span className="font-heading font-bold tabular-nums">{czk(staffTaskCost(picked!, duration ?? undefined))}</span>
            </div>

            <div className="flex gap-2 justify-between">
              <button type="button" onClick={reset} className="btn btn-secondary btn-sm">← Jiný úkol</button>
              <button type="button" onClick={submit} disabled={!ready || busy} className="btn btn-primary btn-sm">
                {busy ? "Zadávám…" : "Zadat úkol"}
              </button>
            </div>
          </div>
        )}
        </div>
      </Sheet>
      {dialog}
    </div>
  );
}
