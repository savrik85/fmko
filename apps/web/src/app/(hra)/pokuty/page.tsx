"use client";

/**
 * Pokuty kabiny: sazebník, který schvaluje kapitán, kdo dluží a kdo co zaplatil.
 * Spec docs/superpowers/specs/2026-11-27-fine-schedule-design.md.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { formatKc, formatSigned } from "@/lib/format";
import {
  Button, ErrorBox, ListCard, ListEmpty, ListRow, PageLoading, RowValue, SectionLabel, StatusChip, Tabs,
  useConfirm, useTabParam, type ChipTone,
} from "@/components/ui";
import { FINE_REPEAT_LABELS, type FineScheduleItemInput, type FineValueKind } from "@okresni-masina/shared";
import { FineScheduleBuilder, offenceTitle } from "./FineScheduleBuilder";

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
  spends: Array<{ id: string; amountCzk: number; description: string; gameDate: string }>;
}

const TAB_KEYS = ["prehled", "sazebnik", "historie"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const plain = (items: FineScheduleItemInput[]): FineScheduleItemInput[] =>
  items.map(({ itemKey, conditionKey, amountCzk, repeatMode }) => ({ itemKey, conditionKey, valueKind: "czk", amountCzk, repeatMode }));

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

const fineTitle = (f: FineRow) => (f.itemKey ? offenceTitle({ itemKey: f.itemKey, conditionKey: f.conditionKey ?? "any" }) : "Pokuta z SMS");

const SQUAD_TONE: ChipTone[] = ["ok", "warn", "danger", "danger"];
const STATUS_CHIP: Record<FineRow["status"], { tone: ChipTone; label: string }> = {
  paid: { tone: "ok", label: "Zaplaceno" },
  refused: { tone: "danger", label: "Dluží" },
  forgiven: { tone: "neutral", label: "Prominuto" },
};

/** Výsledek akce: chyba v ErrorBoxu, potvrzení zeleně. */
function ActionMessage({ ok, text }: { ok: boolean; text: string }) {
  return ok ? <p className="text-base text-pitch-600 px-1" role="status">{text}</p> : <ErrorBox message={text} />;
}

export default function FinesPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<FinesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FineScheduleItemInput[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const { confirm, dialog } = useConfirm({ sheet: true });

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<FinesData>(`/api/teams/${teamId}/fines`)
      .then((d) => {
        setData(d);
        setError(null);
        if (!dirty) setDraft(plain(d.draft.length > 0 && d.proposal.status !== "approved" ? d.draft : d.active));
      })
      .catch((e) => { console.error("fines fetch:", e); setError("Pokuty se nepodařilo načíst."); });
  }, [teamId, dirty]);

  useEffect(() => { load(); }, [load]);
  // Hláška patří k záložce, kde vznikla.
  useEffect(() => { setMessage(null); }, [tab]);

  /** Akce nad pokutami: `action` je část cesty za `/fines/` („propose“, „<id>/forgive“). */
  async function post(action: string, body?: unknown, key = action): Promise<boolean> {
    if (!teamId) return false;
    setBusy(key);
    setMessage(null);
    try {
      const r = await apiFetch<{ message?: string; outcome?: string; captainName?: string }>(`/api/teams/${teamId}/fines/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      if (r.message) setMessage({ ok: true, text: r.message });
      if (r.outcome) setMessage({ ok: true, text: outcomeText(r.outcome, r.captainName) });
      setDirty(false);
      load();
      return true;
    } catch (e) {
      console.error("fines action:", e);
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Nepovedlo se." });
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

  if (error) return <div className="page-container"><ErrorBox message={error} /></div>;
  if (!data) return <PageLoading />;

  const p = data.proposal;
  const pending = p.status === "reservation" || p.status === "rejected";
  const owed = data.fines.filter((f) => f.status === "refused");
  const statusLine = data.status !== "active" ? "Sazebník zatím nemáš. Pokutu můžeš dát jen v SMS."
    : !data.inEffect && data.effectiveFrom ? `Sazebník platí od pondělí ${formatDay(data.effectiveFrom)}`
    : data.origin === "imposed" ? "Sazebník platí, ale kabina ho nebere za svůj: vyhlásil jsi ho bez kapitána."
    : `Sazebník platí, kabina ho odsouhlasila${data.captainName ? ` přes kapitána (${data.captainName})` : ""}.`;

  const fineRow = (f: FineRow, actions: boolean) => {
    const chip = STATUS_CHIP[f.status];
    return (
      <ListRow key={f.id} tone={f.status === "refused" ? "danger" : undefined}
        title={<>
          <Link href={`/hrac/${f.playerId}`} className="hover:text-pitch-500">{f.playerName}</Link>
          <span className="ml-2 align-middle"><StatusChip tone={chip.tone}>{chip.label}</StatusChip></span>
        </>}
        meta={`${formatDay(f.gameDate)} · ${fineTitle(f)}`}
        trailing={<RowValue>{formatKc(f.amountCzk ?? 0)}</RowValue>}
        detail={(f.fact || actions) && (
          <span className="block space-y-2 mt-1">
            {f.fact && <span className="block text-ink">{f.fact}</span>}
            {actions && (
              <span className="flex flex-wrap gap-2">
                {f.status === "refused" && (
                  <Button size="sm" onClick={() => post(`${f.id}/insist`, undefined, f.id)} disabled={busy !== null}>Trvat na zaplacení</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => post(`${f.id}/forgive`, undefined, f.id)} disabled={busy !== null}>Prominout</Button>
              </span>
            )}
          </span>
        )} />
    );
  };

  return (
    <div className="page-container space-y-5">
      {dialog}
      <div className="card p-4 sm:p-5 space-y-3">
        <SectionLabel>Pokuty</SectionLabel>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-micro text-muted uppercase tracking-wide">V kase pokut</div>
            <div className="font-heading font-[800] text-3xl sm:text-4xl tabular-nums text-ink">{formatKc(data.fund)}</div>
          </div>
          <StatusChip tone={SQUAD_TONE[Math.min(data.squad.stage, 3)]}>{data.squad.label}</StatusChip>
        </div>
        <p className="text-sm text-muted">
          Do rozpočtu klubu kasa nejde. Platí se z ní hospoda s klukama: když je vezmeš do <Link href="/udalosti" className="text-pitch-700 underline decoration-pitch-500/30 hover:text-pitch-500">hospody</Link>, bere se nejdřív odsud.
        </p>
        <p className="text-base text-ink">{statusLine}</p>
        {data.squad.ultimatum && (
          <ErrorBox message="Kabina dala ultimátum: když sazebník do zápasu nezmírníš nebo nezrušíš, kluci nepřijdou." />
        )}
      </div>

      {pending && (
        <div className="card p-4 sm:p-5 space-y-3 border-l-4 border-warn">
          <SectionLabel>Kapitán {p.captainName ?? ""}</SectionLabel>
          <p className="text-base text-ink">
            {p.status === "reservation" ? "S návrhem skoro souhlasí, ale jedna položka mu vadí" : "Návrh za kabinu odmítl"}
            {p.note ? `: ${offenceTitle(p.note)}.` : "."} Co přesně píše, najdeš v Telefonu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/telefon" className="btn btn-secondary btn-md">Otevřít Telefon</Link>
            <Button variant="danger" onClick={impose} disabled={busy !== null}>Vyhlásit i tak</Button>
          </div>
          <p className="text-sm text-muted">Nebo sazebník uprav a předlož znovu.</p>
        </div>
      )}

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        ariaLabel="Pokuty"
        items={[
          { key: "prehled", label: "Přehled", count: owed.length || null },
          { key: "sazebnik", label: "Sazebník" },
          { key: "historie", label: "Historie" },
        ]}
      />

      {tab === "prehled" && (
        <div className="space-y-5">
          <ListCard title="Dluží" count={owed.length || undefined}>
            {owed.length === 0
              ? <ListEmpty icon="✅">Nikdo nic nedluží.</ListEmpty>
              : owed.map((f) => fineRow(f, true))}
          </ListCard>
          {owed.length > 0 && (
            <p className="text-sm text-muted px-1 -mt-3">Trvat na zaplacení: hráč zaplatí, ale vztah k tobě utrpí. Prominout: když za totéž jiní platili, vědí o tom.</p>
          )}
          {data.burdened.length > 0 && (
            <ListCard title="Komu pokuty lezou do kapsy" count={data.burdened.length}>
              {data.burdened.map((b) => (
                <ListRow key={b.playerId} tone={b.stage >= 2 ? "danger" : undefined}
                  title={<Link href={`/hrac/${b.playerId}`} className="hover:text-pitch-500">{b.name}</Link>}
                  trailing={<StatusChip tone={b.stage >= 2 ? "danger" : "warn"}>{b.label}</StatusChip>} />
              ))}
            </ListCard>
          )}
          {message && <ActionMessage ok={message.ok} text={message.text} />}
        </div>
      )}

      {tab === "sazebnik" && (
        <div className="space-y-5">
          {data.active.length > 0 && (
            <ListCard title={data.inEffect ? "Platí" : `Platí od ${formatDay(data.effectiveFrom ?? data.day)}`} count={data.active.length}>
              {data.active.map((it) => (
                <ListRow key={it.id} title={offenceTitle(it)} meta={FINE_REPEAT_LABELS[it.repeatMode]}
                  trailing={<RowValue>{formatKc(it.amountCzk ?? 0)}</RowValue>} />
              ))}
            </ListCard>
          )}
          <ListCard title={data.status === "active" ? "Upravit sazebník" : "Sestavit sazebník"}>
            <p className="px-4 pt-3 text-sm text-muted">
              Nový nebo přísnější sazebník schvaluje kapitán a platí od dalšího pondělí. Zmírnění platí hned.
            </p>
            <FineScheduleBuilder items={draft} onChange={(it) => { setDraft(it); setDirty(true); }} />
          </ListCard>
          {message && <ActionMessage ok={message.ok} text={message.text} />}
          <Button size="lg" variant={dirty ? "primary" : "ghost"} className="w-full"
            disabled={busy !== null || (!dirty && !(draft.length > 0 && data.status !== "active" && !pending))}
            onClick={() => post("propose", { items: draft }, "propose")}>
            {draft.length === 0 && data.status === "active" ? "Zrušit sazebník" : "Předložit kapitánovi"}
          </Button>
        </div>
      )}

      {tab === "historie" && (
        <div className="space-y-5">
          <ListCard title="Posledních 6 týdnů" count={data.fines.length || undefined}>
            {data.fines.length === 0
              ? <ListEmpty icon="⚖️">Zatím nikdo nic neplatil.</ListEmpty>
              : data.fines.map((f) => fineRow(f, f.status === "paid"))}
          </ListCard>
          {data.spends.length > 0 && (
            <ListCard title="Utraceno z kasy" count={data.spends.length}>
              {data.spends.map((x) => (
                <ListRow key={x.id} title={x.description} meta={formatDay(x.gameDate)}
                  trailing={<RowValue tone="minus">{formatSigned(-x.amountCzk)}</RowValue>} />
              ))}
            </ListCard>
          )}
          {message && <ActionMessage ok={message.ok} text={message.text} />}
        </div>
      )}
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
