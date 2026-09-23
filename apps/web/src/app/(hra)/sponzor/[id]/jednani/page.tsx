"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { ErrorBox, SectionLabel, Spinner, useConfirm } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import {
  emptyProposal, estimateRange, previewCost, withSeasons, type NegotiationView, type PromiseKind, type Proposal,
} from "@/lib/sponsor-negotiation";
import { NegotiationHeader } from "@/components/sponsors/negotiation/negotiation-header";
import { PromisePicker } from "@/components/sponsors/negotiation/promise-picker";
import { DemandsForm } from "@/components/sponsors/negotiation/demands-form";
import { RoundsHistory } from "@/components/sponsors/negotiation/rounds-history";
import { SigningSummary } from "@/components/sponsors/negotiation/signing-summary";

const CLOSED_TEXT: Record<string, string> = {
  walked_away: "Majitel od jednání odešel. Chvíli s vámi jednat nebude.",
  expired: "Jednání vypršelo. Nové otevřeš na stránce sponzora.",
  signed: "Smlouva je podepsaná.",
};

/** Strop kol jednání, shodně s MAX_NEGOTIATION_ROUNDS v apps/api/src/routes/sponsors.ts. */
const MAX_ROUNDS = 30;

export default function NegotiationPage() {
  const { id: sponsorId } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, setTeam } = useTeam();
  // undefined = ještě nečteno z adresy, null = adresa id nemá.
  const [negId, setNegId] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<NegotiationView | null>(null);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    setNegId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const load = () => {
    if (!teamId || !negId) return Promise.resolve();
    return apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${negId}`)
      .then((v) => { setView(v); setDraft((d) => d ?? emptyProposal(v)); })
      .catch((e) => { console.error("jednání se sponzorem:", e); setError((e as Error).message); });
  };

  useEffect(() => { void load(); }, [teamId, negId]);

  // Server drží stav (expirace, urážka); po 410 (jednání mezitím vypršelo) načteme stránku znovu,
  // ať se místo formuláře ukáže CLOSED_TEXT a ne návrh do neexistujícího jednání.
  const reloadIfExpired = (e: unknown) => {
    if ((e as Error & { status?: number }).status === 410) return load();
  };

  const propose = async () => {
    if (!teamId || !view || !draft || acting) return;
    setActing(true);
    setError(null);
    const v = await apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${view.id}/propose`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
    }).catch(async (e) => {
      console.error("návrh sponzorovi:", e); setError((e as Error).message);
      await reloadIfExpired(e);
      return null;
    });
    if (v) setView(v);
    setActing(false);
  };

  const sign = async () => {
    if (!teamId || !view?.pending || acting) return;
    const p = view.pending;
    const d = p.proposal.demands;
    const ok = await confirm({
      title: `Podepsat smlouvu s ${view.sponsorName}?`,
      description: `Smlouva na ${seasonsAccusative(p.proposal.seasons)}. Slibů: ${p.promises.length}. Nesplněné sliby stojí pokutu, dvě porušení v sezóně a sponzor smlouvu vypoví.`,
      details: [
        { label: "Měsíčně", value: `+${formatCZK(d.monthly)}`, color: "text-pitch-500" },
        ...(d.signingBonus > 0 ? [{ label: "Za podpis", value: `+${formatCZK(d.signingBonus)}`, color: "text-pitch-500" }] : []),
        ...(view.current && !view.current.sameSponsor && p.currentFee === 0
          ? [{ label: "Výpovědní pokuta", value: `-${formatCZK(view.current.terminationFee)}`, color: "text-card-red" }] : []),
        ...(view.current && view.current.clawback > 0
          ? [{ label: "Vrácení zálohy", value: `-${formatCZK(view.current.clawback)}`, color: "text-card-red" }] : []),
        ...(p.renamesClub ? [{ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" }] : []),
      ],
      confirmLabel: "Podepsat",
    });
    if (!ok) return;
    setActing(true);
    setError(null);
    const res = await apiFetch<{ ok: boolean; newTeamName: string | null }>(
      `/api/teams/${teamId}/sponsors/negotiations/${view.id}/accept`, { method: "POST" },
    ).catch(async (e) => {
      console.error("podpis smlouvy se sponzorem:", e); setError((e as Error).message);
      await reloadIfExpired(e);
      return null;
    });
    if (res?.newTeamName) setTeam(teamId, res.newTeamName);
    setActing(false);
    if (res?.ok) router.push("/sponzori");
  };

  if (negId === null) {
    return (
      <div className="page-container space-y-3">
        <ErrorBox message="Jednání nenalezeno." />
        <Link href={`/sponzor/${sponsorId}`} className="text-pitch-600 underline text-base">Zpět na sponzora</Link>
      </div>
    );
  }
  if (error && !view) return <div className="page-container"><ErrorBox message={error} /></div>;
  if (!view || !draft) return <div className="flex justify-center py-12"><Spinner /></div>;

  const estimate = estimateRange(view, draft.promises, draft.seasons);
  const cost = previewCost(view, draft);
  const open = view.status === "open";
  const atRoundLimit = view.rounds.length >= MAX_ROUNDS;
  const ownerName = `${view.owner.firstName} ${view.owner.lastName}`;

  return (
    <div className="page-container space-y-5">
      {dialog}
      <NegotiationHeader view={view} estimate={estimate} cost={cost} />
      <RoundsHistory
        rounds={view.rounds} ownerName={ownerName}
        onUseCounter={open ? (p) => setDraft(p) : undefined}
      />

      {CLOSED_TEXT[view.status] && (
        <div className="text-sm bg-surface-2 rounded-soft px-3 py-2">{CLOSED_TEXT[view.status]}</div>
      )}

      {open && (
        <>
          <section>
            <SectionLabel>Sliby klubu</SectionLabel>
            <PromisePicker
              view={view} seasons={draft.seasons} promises={draft.promises}
              onChange={(promises) => {
                const kinds = new Set(promises.map((p) => p.kind));
                const goalBonuses = Object.fromEntries(Object.entries(draft.demands.goalBonuses).filter(([k]) => kinds.has(k as PromiseKind)));
                setDraft({ ...draft, promises, demands: { ...draft.demands, goalBonuses } });
              }}
            />
          </section>
          <section>
            <SectionLabel>Co chceš od sponzora</SectionLabel>
            <DemandsForm view={view} proposal={draft} onChange={(p) => setDraft(withSeasons(view, p, p.seasons))} />
          </section>
          {atRoundLimit && (
            <div className="text-sm bg-surface-2 rounded-soft px-3 py-2">
              Majitel už o tom nechce dál mluvit. Přijmi jeho poslední nabídku, nebo to nech být.
            </div>
          )}
        </>
      )}

      <SigningSummary view={view} />

      {error && <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{error}</div>}

      {/* Odesílací tlačítka vždy na konci stránky, bez částek. */}
      <div className="flex flex-col gap-2">
        {view.pending && (
          <button type="button" onClick={sign} disabled={acting} className="btn btn-primary w-full min-h-11">Podepsat smlouvu</button>
        )}
        {open && (
          <button type="button" onClick={propose} disabled={acting || atRoundLimit} className={`btn ${view.pending ? "btn-ghost" : "btn-primary"} w-full min-h-11`}>
            Navrhnout
          </button>
        )}
        <Link href={`/sponzor/${view.sponsorId}`} className="text-center text-sm text-muted min-h-11 leading-[2.75rem]">Zpět na sponzora</Link>
      </div>
    </div>
  );
}
