"use client";

/**
 * Trenérský stůl — skupinové hospodské akce manažera.
 *
 * Štamtiš: pozvat 2–4 trenéry z ligy na pivo (síť vztahů, riziko hádek, summit ve zpravodaji).
 * Runda pro hospodu: po výhře koupit pivo všem štamgastům (morálka, fanoušci, přízeň obce).
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, showError } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

interface RelationListItem {
  teamId: string;
  teamName: string;
  managerName: string;
  isAi: boolean;
  archetypeLabel: string | null;
  respect: number;
  heat: number;
  label: string;
}

interface SocialInfo {
  stammtisch: { available: boolean; cooldownDaysLeft: number; costPerHead: number };
  pubRound: { available: boolean; reason: string | null };
}

const BTN = "text-sm font-heading font-bold px-3 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export function StammtischCard({ teamId }: { teamId: string }) {
  const [info, setInfo] = useState<SocialInfo | null>(null);
  const [managers, setManagers] = useState<RelationListItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<SocialInfo>(`/api/teams/${teamId}/social-info`)
      .then(setInfo)
      .catch((e) => console.error("social info load:", e));
    apiFetch<{ relations: RelationListItem[] }>(`/api/teams/${teamId}/relations`)
      .then((d) => setManagers(d.relations))
      .catch((e) => console.error("relations list load:", e));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (!info) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const runStammtisch = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/teams/${teamId}/stammtisch`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestTeamIds: [...selected] }) },
      );
      setFeedback(res.message);
      setPicking(false);
      setSelected(new Set());
      load();
    } catch (e) {
      console.error("stammtisch:", e);
      showError("Štamtiš se nepovedl", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  const buyRound = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/teams/${teamId}/pub-round`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      setFeedback(res.message);
      load();
    } catch (e) {
      console.error("pub round:", e);
      showError("Runda se nepovedla", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Trenérský stůl v hospodě</SectionLabel>

      {feedback && (
        <div className="mt-2 mb-3 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">{feedback}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !info.stammtisch.available}
          title={!info.stammtisch.available
            ? `Hospodský doplňuje sudy — znovu za ${info.stammtisch.cooldownDaysLeft} dní`
            : `Pozvi 2–4 trenéry, rundy ${info.stammtisch.costPerHead} Kč na hlavu`}
          onClick={() => setPicking((v) => !v)}
          className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
          🍻 Uspořádat štamtiš{!info.stammtisch.available ? ` (za ${info.stammtisch.cooldownDaysLeft} dní)` : ""}
        </button>

        <button disabled={busy || !info.pubRound.available}
          title={info.pubRound.reason ?? "Pivo všem štamgastům — morálka, fanoušci i starosta v rohu"}
          onClick={buyRound}
          className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
          🍺 Koupit rundu hospodě
        </button>
      </div>

      {picking && info.stammtisch.available && (
        <div className="mt-3 border border-gray-100 rounded-lg p-3">
          <div className="text-xs text-muted uppercase tracking-wide font-heading font-bold mb-2">
            Koho pozvat? ({selected.size}/4, minimálně 2)
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {managers.map((m) => (
              <label key={m.teamId}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(m.teamId)} onChange={() => toggle(m.teamId)}
                  disabled={!selected.has(m.teamId) && selected.size >= 4}
                  className="accent-green-700" />
                <div className="min-w-0 flex-1">
                  <span className="font-heading font-bold text-sm">{m.managerName}</span>
                  <span className="text-xs text-muted ml-2">{m.teamName}{m.archetypeLabel ? ` · ${m.archetypeLabel}` : ""}</span>
                </div>
                <span className="text-xs text-muted shrink-0">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button disabled={busy || selected.size < 2} onClick={runStammtisch}
              className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
              Pozvat ke stolu ({selected.size ? `max ${info.stammtisch.costPerHead * (selected.size + 1)} Kč` : "vyber trenéry"})
            </button>
            <span className="text-xs text-muted">Platí se jen za ty, kdo dorazí. Pozor na rivaly u jednoho stolu.</span>
          </div>
        </div>
      )}
    </div>
  );
}
