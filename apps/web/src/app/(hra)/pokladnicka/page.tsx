"use client";

/**
 * Pokladnička kabiny: sazebník pokut, který schvaluje kapitán, zapsané pokuty a co si o tom
 * kabina myslí. Spec docs/superpowers/specs/2026-11-27-fine-schedule-design.md.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { formatKc } from "@/lib/format";
import { ListCard, ListEmpty, ListRow, PageLoading, RowIcon, SectionLabel, StatusChip, useConfirm, type ChipTone } from "@/components/ui";
import {
  FINE_REPEAT_LABELS, FINE_SCOPE_LABELS, fineItemDef, fineValueLabel,
  type FineScheduleItemInput, type FineValueKind,
} from "@okresni-masina/shared";
import { FineScheduleBuilder } from "./FineScheduleBuilder";

interface FineRow {
  id: string; playerId: string; playerName: string; itemKey: string | null; conditionKey: string | null;
  source: "auto" | "manual" | "sms"; valueKind: FineValueKind; amountCzk: number | null;
  status: "paid" | "refused" | "forgiven"; fact: string | null; inSchedule: boolean; gameDate: string;
}

interface FinesData {
  day: string;
  status: "none" | "active";
  origin: "approved" | "imposed" | null;
  effectiveFrom: string | null;
  inEffect: boolean;
  proposal: { status: "none" | "pending" | "approved" | "reservation" | "rejected"; captainName: string | null; note: { itemKey: string; conditionKey: string; selfInterest: boolean } | null };
  captainName: string | null;
  squad: { stage: number; label: string; ultimatum: boolean };
  active: (FineScheduleItemInput & { id: string })[];
  draft: (FineScheduleItemInput & { id: string })[];
  fund: number;
  fines: FineRow[];
  burdened: Array<{ playerId: string; name: string; stage: number; label: string }>;
  players: Array<{ id: string; name: string }>;
}

const plain = (items: FineScheduleItemInput[]) => items.map(({ itemKey, conditionKey, valueKind, amountCzk, repeatMode, scope }) =>
  ({ itemKey, conditionKey, valueKind, amountCzk, repeatMode, scope }));

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

function itemTitle(it: { itemKey: string; conditionKey: string }): string {
  const def = fineItemDef(it.itemKey);
  const cond = def?.conditions.find((c) => c.key === it.conditionKey);
  return def ? (def.conditions.length > 1 && cond ? `${def.label}: ${cond.label.toLowerCase()}` : def.label) : it.itemKey;
}

const STATUS_CHIP: Record<FineRow["status"], { tone: ChipTone; label: string }> = {
  paid: { tone: "ok", label: "Zaplaceno" },
  refused: { tone: "danger", label: "Odmítá platit" },
  forgiven: { tone: "neutral", label: "Prominuto" },
};

export default function FineFundPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<FinesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FineScheduleItemInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Kde se zpráva ukáže: u pokut (prominutí, trvání, ruční pokuta), nebo dole u sazebníku.
  const [message, setMessage] = useState<{ ok: boolean; text: string; at: "fines" | "schedule" } | null>(null);
  const [manual, setManual] = useState<{ playerId: string; itemKey: string }>({ playerId: "", itemKey: "" });
  const { confirm, dialog } = useConfirm();

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<FinesData>(`/api/teams/${teamId}/fines`)
      .then((d) => {
        setData(d);
        setError(null);
        if (!dirty) setDraft(plain(d.draft.length > 0 && d.proposal.status !== "approved" ? d.draft : d.active));
      })
      .catch((e) => { console.error("fines fetch:", e); setError("Pokladničku se nepodařilo načíst."); });
  }, [teamId, dirty]);

  useEffect(() => { load(); }, [load]);

  /** Akce nad pokladničkou: `action` je část cesty za `/fines/` („propose“, „<id>/forgive“). */
  async function post(action: string, body?: unknown, key = action): Promise<boolean> {
    if (!teamId) return false;
    setBusy(key);
    setMessage(null);
    const at: "fines" | "schedule" = action === "propose" || action === "impose" ? "schedule" : "fines";
    try {
      const r = await apiFetch<{ message?: string; outcome?: string; captainName?: string }>(`/api/teams/${teamId}/fines/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      if (r.message) setMessage({ ok: true, text: r.message, at });
      if (r.outcome) setMessage({ ok: true, text: outcomeText(r.outcome, r.captainName), at });
      setDirty(false);
      load();
      return true;
    } catch (e) {
      console.error("fines action:", e);
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Nepovedlo se.", at });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function impose() {
    const ok = await confirm({
      title: "Vyhlásit sazebník bez souhlasu kapitána?",
      description: "Platit bude od pondělí, ale kabina ho nevezme za svůj. Kapitán to nese těžce a kluci se budou bránit. Čím přísnější sazebník, tím dřív přijde ultimátum.",
      confirmLabel: "Vyhlásit i tak", variant: "danger",
    });
    if (ok) await post("impose");
  }

  if (error) return <div className="page-container"><div className="card p-4 text-base text-muted">{error}</div></div>;
  if (!data) return <PageLoading />;

  const p = data.proposal;
  const manualItems = data.active.filter((it) => fineItemDef(it.itemKey)?.manual);
  const pending = p.status === "reservation" || p.status === "rejected";
  const owed = data.fines.filter((f) => f.status === "refused");

  return (
    <div className="page-container space-y-5">
      {dialog}
      <div className="card p-4 sm:p-5 space-y-3">
        <SectionLabel>Pokladnička kabiny</SectionLabel>
        <p className="text-base text-muted">
          Sazebník pokut si skládáš z hotových položek a za kabinu ho schvaluje kapitán. Kdo pravidlo poruší, platí do
          pokladničky. Rozumné pokuty kabinu srovnají, přehnané ji postaví proti tobě.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-3 p-3">
            <div className="text-sm text-muted">V pokladničce</div>
            <div className="text-xl font-heading font-bold text-ink">{formatKc(data.fund)}</div>
          </div>
          <div className="rounded-xl bg-surface-3 p-3">
            <div className="text-sm text-muted">Kabina</div>
            <div className={`text-base font-heading font-bold ${data.squad.stage >= 2 ? "text-card-red" : data.squad.stage === 1 ? "text-warn" : "text-ink"}`}>
              {data.squad.label}
            </div>
          </div>
        </div>
        <p className="text-base text-ink">
          {data.status !== "active" ? "Sazebník zatím nemáš. Bez něj dáváš pokuty jen v SMS."
            : !data.inEffect && data.effectiveFrom ? `Sazebník platí od pondělí ${formatDay(data.effectiveFrom)}`
            : data.origin === "imposed" ? "Sazebník platí, ale kabina ho nebere za svůj: vyhlásil jsi ho bez kapitána."
            : `Sazebník platí, kabina ho odsouhlasila${data.captainName ? ` přes kapitána (${data.captainName})` : ""}.`}
        </p>
        {data.squad.ultimatum && (
          <p className="text-base text-card-red font-bold">Kabina dala ultimátum: když sazebník do zápasu nezmírníš nebo nezrušíš, kluci nepřijdou.</p>
        )}
      </div>

      {pending && (
        <div className="card p-4 sm:p-5 space-y-3 border-l-4 border-warn">
          <SectionLabel>Kapitán {p.captainName ?? ""}</SectionLabel>
          <p className="text-base text-ink">
            {p.status === "reservation" ? "S návrhem skoro souhlasí, ale jedna položka mu vadí" : "Návrh za kabinu odmítl"}
            {p.note ? `: ${itemTitle(p.note)}.` : "."} Co přesně píše, najdeš v Telefonu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/telefon`} className="px-3 py-2.5 rounded-control text-base font-bold border border-gray-300 text-ink hover:bg-surface-3">Otevřít Telefon</Link>
            <button type="button" onClick={impose} disabled={busy !== null}
              className="px-3 py-2.5 rounded-control text-base font-bold bg-card-red text-white hover:opacity-90 disabled:opacity-50">
              Vyhlásit i tak
            </button>
          </div>
          <p className="text-sm text-muted">Nebo sazebník níž uprav a předlož znovu.</p>
        </div>
      )}

      {data.active.length > 0 && (
        <ListCard title="Platný sazebník" count={data.active.length}>
          {data.active.map((it) => (
            <ListRow key={it.id} leading={<RowIcon>📋</RowIcon>}
              title={itemTitle(it)}
              meta={`${fineValueLabel(it.valueKind, it.amountCzk)} · ${FINE_REPEAT_LABELS[it.repeatMode].toLowerCase()} · ${FINE_SCOPE_LABELS[it.scope].toLowerCase()}`} />
          ))}
        </ListCard>
      )}

      {data.burdened.length > 0 && (
        <ListCard title="Komu už pokuty lezou do kapsy" count={data.burdened.length}>
          {data.burdened.map((b) => (
            <ListRow key={b.playerId} tone={b.stage >= 2 ? "danger" : undefined} leading={<RowIcon>{b.stage >= 3 ? "😠" : b.stage === 2 ? "✋" : "😒"}</RowIcon>}
              title={<Link href={`/hrac/${b.playerId}`} className="hover:text-pitch-500">{b.name}</Link>}
              meta={b.label} />
          ))}
        </ListCard>
      )}

      <ListCard title="Pokuty za poslední týdny" count={data.fines.length}>
        {data.fines.length === 0 ? <ListEmpty icon="🐷">Zatím nikdo nic neplatil.</ListEmpty> : data.fines.map((f) => {
          const chip = STATUS_CHIP[f.status];
          return (
            <ListRow key={f.id} tone={f.status === "refused" ? "danger" : undefined}
              leading={<RowIcon>{f.source === "sms" ? "💬" : "🐷"}</RowIcon>}
              title={<>
                <Link href={`/hrac/${f.playerId}`} className="hover:text-pitch-500">{f.playerName}</Link>
                <span className="ml-2 align-middle"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></span>
              </>}
              meta={`${formatDay(f.gameDate)} · ${f.itemKey ? itemTitle({ itemKey: f.itemKey, conditionKey: f.conditionKey ?? "any" }) : "Pokuta z SMS"} · ${fineValueLabel(f.valueKind, f.amountCzk)}`}
              detail={<span className="block space-y-2 mt-1">
                {f.fact && <span className="block text-ink">{f.fact}</span>}
                {f.status !== "forgiven" && f.source !== "sms" && (
                  <span className="flex flex-wrap gap-2">
                    {f.status === "refused" && (
                      <button type="button" onClick={() => post(`${f.id}/insist`, undefined, f.id)} disabled={busy !== null}
                        className="px-3 py-2 rounded-control text-sm font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50">Trvat na zaplacení</button>
                    )}
                    <button type="button" onClick={() => post(`${f.id}/forgive`, undefined, f.id)} disabled={busy !== null}
                      className="px-3 py-2 rounded-control text-sm font-bold border border-gray-300 text-ink hover:bg-surface-3 disabled:opacity-50">Prominout</button>
                  </span>
                )}
              </span>} />
          );
        })}
      </ListCard>
      {message?.at === "fines" && (
        <p className={`text-base px-1 -mt-2 ${message.ok ? "text-pitch-600" : "text-card-red"}`}>{message.text}</p>
      )}
      {owed.length > 0 && (
        <p className="text-sm text-muted -mt-3 px-1">Trvat na zaplacení: hráč zaplatí, ale vztah k tobě utrpí. Prominout: když za totéž jiní platili, vědí o tom.</p>
      )}

      {data.inEffect && manualItems.length > 0 && (
        <div className="card p-4 sm:p-5 space-y-3">
          <SectionLabel>Ruční pokuta</SectionLabel>
          <p className="text-base text-muted">Za tyhle položky hra sama nepozná, kdo je porušil. Zapiš to sám.</p>
          <label className="block">
            <span className="text-sm text-muted">Hráč</span>
            <select className="select w-full min-h-11 text-base" value={manual.playerId} onChange={(e) => setManual((m) => ({ ...m, playerId: e.target.value }))}>
              <option value="">Vyber hráče</option>
              {data.players.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Za co</span>
            <select className="select w-full min-h-11 text-base" value={manual.itemKey} onChange={(e) => setManual((m) => ({ ...m, itemKey: e.target.value }))}>
              <option value="">Vyber položku</option>
              {manualItems.map((it) => <option key={it.id} value={it.itemKey}>{itemTitle(it)} ({fineValueLabel(it.valueKind, it.amountCzk)})</option>)}
            </select>
          </label>
          <button type="button" disabled={!manual.playerId || !manual.itemKey || busy !== null}
            onClick={async () => { if (await post("manual", manual, "manual")) setManual({ playerId: "", itemKey: "" }); }}
            className="px-3 py-2.5 rounded-control text-base font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50">
            Zapsat pokutu
          </button>
        </div>
      )}

      <div className="card p-4 sm:p-5 space-y-3">
        <SectionLabel>{data.status === "active" ? "Upravit sazebník" : "Sestavit sazebník"}</SectionLabel>
        <p className="text-base text-muted">
          Nový nebo přísnější sazebník schvaluje kapitán a platí od dalšího pondělí. Zmírnění platí hned a souhlas nepotřebuje.
        </p>
        <FineScheduleBuilder items={draft} onChange={(it) => { setDraft(it); setDirty(true); }} />
      </div>

      {message?.at === "schedule" && (
        <p className={`text-base px-1 ${message.ok ? "text-pitch-600" : "text-card-red"}`}>{message.text}</p>
      )}
      <button type="button" disabled={busy !== null || (!dirty && !(draft.length > 0 && data.status !== "active" && !pending))}
        onClick={() => post("propose", { items: draft }, "propose")}
        className={`btn btn-lg w-full ${dirty ? "btn-primary" : "btn-ghost"}`}>
        {draft.length === 0 && data.status === "active" ? "Zrušit sazebník" : "Předložit kapitánovi"}
      </button>
    </div>
  );
}

function outcomeText(outcome: string, captain?: string): string {
  switch (outcome) {
    case "approved": return `${captain ?? "Kapitán"} sazebník za kabinu schválil. Platí od pondělí.`;
    case "reservation": return `${captain ?? "Kapitán"} má k jedné položce výhradu. Odpověď máš v Telefonu.`;
    case "rejected": return `${captain ?? "Kapitán"} sazebník odmítl. Odpověď máš v Telefonu.`;
    case "activated_softening": return "Sazebník je mírnější, platí hned.";
    case "cleared": return "Sazebník je zrušený.";
    case "imposed": return "Sazebník je vyhlášený bez souhlasu kabiny. Platí od pondělí.";
    default: return "Hotovo.";
  }
}
