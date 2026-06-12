"use client";

/**
 * Trenérský stůl — skupinové hospodské akce manažera.
 *
 * Posezení s trenéry: pozvat 2–4 trenéry z ligy na pivo (síť vztahů, riziko hádek, summit ve zpravodaji).
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
  stammtisch: { available: boolean; planned: boolean; cooldownDaysLeft: number; costPerHead: number };
  pubRound: { available: boolean; planned: boolean; reason: string | null };
  incomingInvites: Array<{ id: string; hostTeamId: string; hostTeam: string; hostManager: string }>;
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
      showError("Posezení se nepovedlo", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  const respondInvite = async (inviteId: string, accept: boolean) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/teams/${teamId}/stammtisch-invite/${inviteId}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) },
      );
      setFeedback(res.message);
      load();
    } catch (e) {
      console.error("invite response:", e);
      showError("Odpověď se nepovedla", (e as Error)?.message || "Zkus to znovu.");
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

      {/* Příchozí pozvánky od jiných trenérů */}
      {info.incomingInvites.length > 0 && (
        <div className="mb-3 space-y-2">
          {info.incomingInvites.map((inv) => (
            <div key={inv.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm flex-1 min-w-[200px]">
                🍻 Trenér <b>{inv.hostManager}</b> ({inv.hostTeam}) tě zve dnes večer na posezení s trenéry. Útratu platí on.
              </span>
              <button disabled={busy} onClick={() => respondInvite(inv.id, true)}
                className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
                Přijmout
              </button>
              <button disabled={busy} onClick={() => respondInvite(inv.id, false)}
                className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
                Odmítnout
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {info.stammtisch.planned ? (
          <span className="text-sm text-muted self-center">🍻 Posezení je domluvené — kdo dorazí, uvidíš večer v hospodě</span>
        ) : (
          <button disabled={busy || !info.stammtisch.available}
            title={!info.stammtisch.available
              ? `Hospodský doplňuje sudy — znovu za ${info.stammtisch.cooldownDaysLeft} dní`
              : `Pozvi 2–4 trenéry, rundy ${info.stammtisch.costPerHead} Kč na hlavu. Vyhodnotí se večer.`}
            onClick={() => setPicking((v) => !v)}
            className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
            🍻 Posezení s trenéry{!info.stammtisch.available ? ` (za ${info.stammtisch.cooldownDaysLeft} dní)` : ""}
          </button>
        )}

        {info.pubRound.planned ? (
          <span className="text-sm text-muted self-center">🍺 Runda je slíbená — večer se roztočí</span>
        ) : (
          <button disabled={busy || !info.pubRound.available}
            title={info.pubRound.reason ?? "Pivo všem štamgastům — morálka, fanoušci i starosta v rohu. Roztočí se večer."}
            onClick={buyRound}
            className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
            🍺 Koupit rundu hospodě
          </button>
        )}
      </div>

      {picking && info.stammtisch.available && (
        <div className="mt-3 border border-gray-100 rounded-lg p-3">
          <div className="text-xs text-muted uppercase tracking-wide font-heading font-bold mb-2">
            Koho pozvat? ({selected.size}/4) — zvou se jen lidští trenéři
          </div>
          {managers.filter((m) => !m.isAi).length === 0 && (
            <div className="text-sm text-muted">V lize zatím není žádný další lidský trenér.</div>
          )}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {managers.filter((m) => !m.isAi).map((m) => (
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
            <button disabled={busy || selected.size < 1} onClick={runStammtisch}
              className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
              Pozvat ke stolu ({selected.size ? `max ${info.stammtisch.costPerHead * (selected.size + 1)} Kč` : "vyber trenéry"})
            </button>
            <span className="text-xs text-muted">Pozvaní dostanou pozvánku k přijetí. Vyhodnotí se večer v hospodě — platí se jen za ty, kdo dorazí, a pozor na rivaly u jednoho stolu.</span>
          </div>
        </div>
      )}
    </div>
  );
}
