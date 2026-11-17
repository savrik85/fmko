"use client";

/**
 * Trenérský stůl — skupinové hospodské akce manažera.
 *
 * Posezení s trenéry: pozvat 2–4 trenéry z ligy na pivo (síť vztahů, riziko hádek, summit ve zpravodaji).
 * Runda pro hospodu: po výhře koupit pivo všem štamgastům (morálka, fanoušci, přízeň obce).
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, showError } from "@/lib/api";
import { AutoGrowTextarea, SectionLabel, ListRow, RowIcon, StatusChip } from "@/components/ui";

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

interface PlannedInvite {
  teamId: string;
  teamName: string;
  managerName: string;
  status: "invited" | "accepted" | "declined" | "resolved" | string;
}

interface SocialInfo {
  stammtisch: {
    available: boolean; planned: boolean; cooldownDaysLeft: number; costPerHead: number; plannedInvites: PlannedInvite[];
    /** Téma naplánovaného posezení, jen text do pozvánky. */
    topic?: string | null;
    topicMax?: number;
  };
  pubRound: { available: boolean; planned: boolean; reason: string | null };
  incomingInvites: Array<{ id: string; hostTeamId: string; hostTeam: string; hostManager: string; topic?: string | null }>;
}

const INVITE_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "danger" }> = {
  invited: { text: "Čeká na odpověď", tone: "warn" },
  accepted: { text: "Přijal, dorazí večer", tone: "ok" },
  declined: { text: "Odmítl", tone: "danger" },
};

const BTN = "text-sm font-heading font-bold px-3 py-2 rounded-soft border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export function StammtischCard({ teamId }: { teamId: string }) {
  const [info, setInfo] = useState<SocialInfo | null>(null);
  const [managers, setManagers] = useState<RelationListItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestTeamIds: [...selected], topic }) },
      );
      setFeedback(res.message);
      setPicking(false);
      setSelected(new Set());
      setTopic("");
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
        <div className="mt-2 mb-3 text-sm bg-amber-50 border border-amber-200 rounded-soft p-3 leading-relaxed">{feedback}</div>
      )}

      {/* Příchozí pozvánky od jiných trenérů */}
      {info.incomingInvites.length > 0 && (
        <div className="-mx-4 sm:-mx-5 mt-2 mb-3 border-y border-line">
          {info.incomingInvites.map((inv) => (
            <ListRow key={inv.id} tone="new"
              leading={<RowIcon>🍻</RowIcon>}
              title={`Trenér ${inv.hostManager}`}
              meta={inv.hostTeam}
              detail={
                <>
                  <span className="block">Zve tě dnes večer na posezení s trenéry. Útratu platí on.</span>
                  {inv.topic && <span className="block mt-1">Téma: „{inv.topic}“</span>}
                  <span className="flex flex-wrap gap-2 mt-2">
                    <button disabled={busy} onClick={() => respondInvite(inv.id, true)}
                      className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
                      Přijmout
                    </button>
                    <button disabled={busy} onClick={() => respondInvite(inv.id, false)}
                      className={`${BTN} bg-gray-50 border-gray-200 hover:bg-gray-100`}>
                      Odmítnout
                    </button>
                  </span>
                </>
              } />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {info.stammtisch.planned ? (
          <div className="w-full">
            <div className="text-sm font-heading font-bold mb-2">🍻 Posezení je domluvené, odpovědi pozvaných</div>
            {info.stammtisch.topic && <div className="text-sm mb-2">Téma: „{info.stammtisch.topic}“</div>}
            {info.stammtisch.plannedInvites.length === 0 ? (
              <div className="text-sm text-muted">Pozvánky se rozesílají…</div>
            ) : (
              <div className="-mx-4 sm:-mx-5 border-y border-line">
                {info.stammtisch.plannedInvites.map((inv) => {
                  const label = INVITE_LABEL[inv.status];
                  return (
                    <ListRow key={inv.teamId} dense
                      title={<>{inv.managerName}<span className="text-meta font-normal text-muted"> · {inv.teamName}</span></>}
                      trailing={<StatusChip tone={label?.tone ?? "neutral"}>{label?.text ?? inv.status}</StatusChip>} />
                  );
                })}
              </div>
            )}
            <div className="text-xs text-muted mt-2">Vyhodnotí se večer. Kdo neodpoví do té doby, nedorazí.</div>
          </div>
        ) : (
          <button disabled={busy || !info.stammtisch.available}
            title={!info.stammtisch.available
              ? `Hospodský doplňuje sudy, znovu za ${info.stammtisch.cooldownDaysLeft} dní`
              : `Rezervace stolu 100 Kč + rundy ${info.stammtisch.costPerHead} Kč na hlavu. Vyhodnotí se večer.`}
            onClick={() => setPicking((v) => !v)}
            className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
            🍻 Posezení s trenéry{!info.stammtisch.available ? ` (za ${info.stammtisch.cooldownDaysLeft} dní)` : ""}
          </button>
        )}

        {info.pubRound.planned ? (
          <span className="text-sm text-muted self-center">🍺 Runda je slíbená, večer se roztočí</span>
        ) : (
          <button disabled={busy || !info.pubRound.available}
            title={info.pubRound.reason ?? "Pivo všem štamgastům, morálka, fanoušci i starosta v rohu. Roztočí se večer."}
            onClick={buyRound}
            className={`${BTN} bg-green-50 border-green-200 hover:bg-green-100`}>
            🍺 Koupit rundu hospodě
          </button>
        )}
      </div>

      {picking && info.stammtisch.available && (
        <div className="mt-3 border border-gray-100 rounded-soft p-3">
          <div className="text-xs text-muted uppercase tracking-wide font-heading font-bold mb-2">
            Koho pozvat? ({selected.size}/4), zvou se jen lidští trenéři
          </div>
          {managers.filter((m) => !m.isAi).length === 0 && (
            <div className="text-sm text-muted">V lize zatím není žádný další lidský trenér.</div>
          )}
          <div className="-mx-3 max-h-64 overflow-y-auto border-y border-line-soft">
            {/* Celý řádek je popisek zaškrtávátka, klik kamkoli do řádku trenéra přidá. */}
            {managers.filter((m) => !m.isAi).map((m) => (
              <label key={m.teamId} className="block cursor-pointer hover:bg-surface-2 transition-colors">
                <ListRow
                  leading={
                    <input type="checkbox" checked={selected.has(m.teamId)} onChange={() => toggle(m.teamId)}
                      disabled={!selected.has(m.teamId) && selected.size >= 4}
                      className="accent-green-700 w-4 h-4" />
                  }
                  title={m.managerName}
                  meta={`${m.teamName}${m.archetypeLabel ? ` · ${m.archetypeLabel}` : ""}`}
                  trailing={<span className="block max-w-[96px] text-meta text-muted leading-tight">{m.label}</span>} />
              </label>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="text-sm font-heading font-bold">Téma posezení <span className="font-normal text-muted">(nepovinné)</span></span>
            {/* Téma je jeden řádek textu, Enter proto nový řádek nedělá. Pole roste, ať je vidět celé. */}
            <AutoGrowTextarea value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              enterKeyHint="done"
              maxRows={4}
              maxLength={info.stammtisch.topicMax ?? 120}
              placeholder="Třeba: Kdo letos spadne?"
              className="mt-1 block w-full px-3 py-2.5 border border-gray-200 rounded-soft text-base leading-6 focus:border-pitch-500 focus:outline-none" />
            <span className="mt-1 block text-sm text-muted">
              Pozvaní ho uvidí v pozvánce v telefonu. {topic.length}/{info.stammtisch.topicMax ?? 120}
            </span>
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button disabled={busy || selected.size < 1} onClick={runStammtisch}
              className={`${BTN} bg-amber-50 border-amber-200 hover:bg-amber-100`}>
              Pozvat ke stolu ({selected.size ? `rezervace 100 Kč + rundy max ${info.stammtisch.costPerHead * (selected.size + 1)} Kč` : "vyber trenéry"})
            </button>
            <span className="text-xs text-muted">Pozvaní dostanou pozvánku k přijetí. Vyhodnotí se večer v hospodě. Platí se jen za ty, kdo dorazí, a pozor na rivaly u jednoho stolu.</span>
          </div>
        </div>
      )}
    </div>
  );
}
