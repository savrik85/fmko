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
import {
  STAFF_TASK_DEFS,
  YOUTH_PLAN_AGE_MAX,
  staffTaskCost,
  staffTasksForRole,
  type StaffRole,
  type StaffTaskType,
  type StaffTaskView,
} from "@okresni-masina/shared";

export interface StaffTaskPlayer {
  id: string;
  name: string;
  age: number;
  position: string;
  isU21: boolean;
  injuryDays: number | null;
  condition: number | null;
  morale: number | null;
  unrest: number | null;
}

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
    default: return players;
  }
}

function playerHint(type: StaffTaskType, p: StaffTaskPlayer): string {
  switch (type) {
    case "doctor_injury_care": return `zraněný ${p.injuryDays} ${daysWord(p.injuryDays ?? 0)}`;
    case "massage_prep": return p.condition !== null ? `kondice ${p.condition}` : "";
    case "psych_session": return [
      p.morale !== null ? `morálka ${p.morale}` : "",
      (p.unrest ?? 0) > 0 ? `chce pryč (${p.unrest})` : "",
    ].filter(Boolean).join(", ");
    default: return `${p.age} let`;
  }
}

/** Komu se sezení / plán nejvíc hodí, ten jde nahoru. */
function sortForTask(type: StaffTaskType, players: StaffTaskPlayer[]): StaffTaskPlayer[] {
  const arr = [...players];
  if (type === "massage_prep") arr.sort((a, b) => (a.condition ?? 100) - (b.condition ?? 100));
  if (type === "psych_session") arr.sort((a, b) => (b.unrest ?? 0) - (a.unrest ?? 0) || (a.morale ?? 50) - (b.morale ?? 50));
  if (type === "doctor_injury_care") arr.sort((a, b) => (b.injuryDays ?? 0) - (a.injuryDays ?? 0));
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
  const candidates = picked ? sortForTask(picked, eligiblePlayers(picked, data.players)) : [];
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
                {candidates.length === 0 ? (
                  <div className="text-sm text-muted">
                    {picked === "doctor_injury_care" ? "Nikdo není zraněný." : picked === "gk_plan" ? "V klubu není brankář." : "V klubu není nikdo vhodný."}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-soft">
                    {candidates.map((p) => {
                      const selected = def.target === "players" ? playerIds.includes(p.id) : playerId === p.id;
                      const full = def.target === "players" && !selected && playerIds.length >= (def.maxPlayers ?? 5);
                      return (
                        <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${selected ? "bg-pitch-500/10" : ""} ${full ? "opacity-50" : ""}`}>
                          <input
                            type={def.target === "players" ? "checkbox" : "radio"}
                            name={`task-player-${member.id}`}
                            checked={selected}
                            disabled={full}
                            onChange={() => {
                              if (def.target === "players") {
                                setPlayerIds((cur) => cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]);
                              } else setPlayerId(p.id);
                            }}
                          />
                          <span className="text-sm font-heading text-muted w-9 shrink-0">{POSITION_LABEL[p.position] ?? p.position}</span>
                          <span className="flex-1 min-w-0">
                            <span className="text-base font-bold truncate block">{p.name}{p.isU21 ? " (U21)" : ""}</span>
                            <span className="text-sm text-muted">{playerHint(picked!, p)}</span>
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
