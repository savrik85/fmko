"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { ErrorBox, SectionLabel, Spinner, useConfirm } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { formatGameDay, seasonsAccusative } from "@/lib/sponsor-format";
import {
  estimateRange, initialDraft, previewCost, proposalsEqual, RESPONSE_LABELS, withSeasons,
  type NegotiationRound, type NegotiationView, type PromiseKind, type Proposal,
} from "@/lib/sponsor-negotiation";
import { NegotiationHeader } from "@/components/sponsors/negotiation/negotiation-header";
import { PromisePicker } from "@/components/sponsors/negotiation/promise-picker";
import { DemandsForm } from "@/components/sponsors/negotiation/demands-form";
import { RoundsHistory } from "@/components/sponsors/negotiation/rounds-history";
import { SigningSummary } from "@/components/sponsors/negotiation/signing-summary";
import { OwnerReplyDialog } from "@/components/sponsors/negotiation/owner-reply-dialog";

const CLOSED_TEXT: Record<string, string> = {
  walked_away: "Majitel od jednání odešel. Chvíli s vámi jednat nebude.",
  expired: "Jednání skončilo: vypršela lhůta, ukončil jsi ho, nebo jsi mezitím podepsal smlouvu s jinou firmou. Nové otevřeš na stránce sponzora.",
  signed: "Smlouva je podepsaná.",
};

function attempts(n: number): string {
  return n === 1 ? "1 pokus" : n >= 2 && n <= 4 ? `${n} pokusy` : `${n} pokusů`;
}

/**
 * Co majitel právě odpověděl, česky a s dopadem, aby hráč u tlačítek viděl výsledek svého návrhu.
 * `hasPending`: jednání pořád nabízí něco k podpisu (majitelova poslední nabídka přežívá odmítnutí).
 */
function replyNote(round: NegotiationRound, patience: number, cooldownUntil: string | null, hasPending: boolean): string {
  const stillStanding = hasPending ? " Jeho poslední nabídka pořád platí, můžeš ji podepsat nebo navrhnout znovu." : "";
  switch (round.response.kind) {
    case "accept": return "Návrh přijal. Můžeš podepsat.";
    case "counter_money":
    case "counter_wish": return "Poslal protinabídku, máš ji ve formuláři. Podepiš ji, nebo ji uprav a navrhni znovu.";
    case "reject": return `Návrh odmítl. Trpělivost: ${attempts(patience)} na odmítnutí.${stillStanding}`;
    case "insulted": return `Návrh ho urazil, náklonnost klesla o 3. Trpělivost: ${attempts(patience)} na odmítnutí.${stillStanding}`;
    case "walked_away": {
      const favorText = round.response.insulted ? "náklonnost klesla o 5 (a o 3 za urážku)" : "náklonnost klesla o 5";
      const cooldownText = cooldownUntil ? ` Do ${formatGameDay(cooldownUntil)} s vámi jednat nechce.` : "";
      return `Od jednání odešel, ${favorText}.${cooldownText}`;
    }
    default: return "";
  }
}

/** Strop kol jednání, shodně s MAX_NEGOTIATION_ROUNDS v apps/api/src/routes/sponsors.ts. */
const MAX_ROUNDS = 30;

export default function NegotiationPage() {
  const { id: sponsorId } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, isLoading: authLoading, setTeam } = useTeam();
  // undefined = ještě nečteno z adresy, null = adresa id nemá.
  const [negId, setNegId] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<NegotiationView | null>(null);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  // Odpověď majitele na poslední návrh v této návštěvě stránky; ukazuje se u tlačítek.
  const [reply, setReply] = useState<NegotiationRound | null>(null);
  const replyRef = useRef<HTMLDivElement | null>(null);
  // Dialog s odpovědí hned po návrhu (jako u přestupů), ať hráč nemusí hledat, co majitel řekl.
  const [replyOpen, setReplyOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    setNegId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const load = () => {
    if (!teamId || !negId) return Promise.resolve();
    return apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${negId}`)
      .then((v) => { setView(v); setDraft((d) => (d ? withSeasons(v, d, d.seasons) : initialDraft(v))); })
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
    if (v) {
      setView(v);
      const last = v.rounds[v.rounds.length - 1] ?? null;
      setReply(last);
      // Formulář přepsat jen protinabídkou majitele. Při odmítnutí zůstává, co hráč vyplnil,
      // ať může návrh upravit, a ne začínat znovu od staré nabídky.
      const kind = last?.response.kind;
      if ((kind === "counter_money" || kind === "counter_wish") && last?.response.counter) {
        setDraft(withSeasons(v, last.response.counter, last.response.counter.seasons));
      }
      setReplyOpen(true);
    }
    setActing(false);
  };

  const sign = async () => {
    if (!teamId || !view?.pending || acting) return;
    const p = view.pending;
    const d = p.proposal.demands;
    const legacySwitch = !!(view.current && !view.current.sameSponsor && view.current.isLegacy);
    const ok = await confirm({
      title: `Podepsat smlouvu s firmou ${view.sponsorName}?`,
      description: `Smlouva na ${seasonsAccusative(p.proposal.seasons)}. Slibů: ${p.promises.length}. Nesplněné sliby stojí pokutu, dvě porušení v sezóně a sponzor smlouvu vypoví.`
        + (legacySwitch ? " Přechod ze staré smlouvy je zdarma: žádná výpovědní pokuta ani ztráta reputace." : ""),
      details: [
        { label: "Měsíčně", value: `+${formatCZK(d.monthly)}`, color: "text-pitch-500" },
        ...(d.signingBonus > 0 ? [{ label: "Za podpis", value: `+${formatCZK(d.signingBonus)}`, color: "text-pitch-500" }] : []),
        ...(view.current && !view.current.sameSponsor && p.currentFee === 0 && view.current.terminationFee > 0
          ? [{ label: "Výpovědní pokuta", value: `-${formatCZK(view.current.terminationFee)}`, color: "text-card-red" }] : []),
        ...(view.current && view.current.clawback > 0
          ? [{ label: "Vrácení zálohy", value: `-${formatCZK(view.current.clawback)}`, color: "text-card-red" }] : []),
        ...(view.current && !view.current.sameSponsor && (view.current.forfeitPenalty ?? 0) > 0
          ? [{ label: "Propadlé sliby", value: `pokuta ${formatCZK(view.current.forfeitPenalty ?? 0)}`, color: "text-card-red" }] : []),
        ...(p.renamesClub && p.reputationPenalty > 0 ? [{ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" }] : []),
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

  const closeNegotiation = async () => {
    if (!teamId || !view || acting) return;
    const ok = await confirm({
      title: `Ukončit jednání s firmou ${view.sponsorName}?`,
      description: "Nic se nepodepíše, majitel to nebere zle a jednat můžete znovu kdykoli.",
      confirmLabel: "Ukončit jednání",
    });
    if (!ok) return;
    setActing(true);
    setError(null);
    const res = await apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${view.id}/close`, { method: "POST" })
      .catch((e) => { console.error("ukončení jednání se sponzorem:", e); setError((e as Error).message); return null; });
    setActing(false);
    if (res) router.push(`/sponzor/${sponsorId}`);
  };

  if (negId === null) {
    return (
      <div className="page-container space-y-3">
        <ErrorBox message="Jednání nenalezeno." />
        <Link href={`/sponzor/${sponsorId}`} className="text-pitch-600 underline text-base">Zpět na sponzora</Link>
      </div>
    );
  }
  // Bez klubu (po načtení přihlášení) by se jinak donekonečna točil spinner.
  if (!authLoading && !teamId) {
    return (
      <div className="page-container space-y-3">
        <ErrorBox message="Jednat se sponzorem může jen klub. Nejdřív si ho založ." />
        <Link href={`/sponzor/${sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-pitch-600 underline text-base">Zpět na sponzora</Link>
      </div>
    );
  }
  if (error && !view) return <div className="page-container"><ErrorBox message={error} /></div>;
  if (!view || !draft) return <div className="flex justify-center py-12"><Spinner /></div>;

  const estimate = estimateRange(view, draft.promises, draft.seasons);
  const cost = previewCost(view, draft);
  // Přijaté jednání (accepted) se dá formulářem přepsat úplně stejně jako otevřené: nový návrh
  // nahradí přijaté podmínky (API to teď povoluje, viz routes/sponsors.ts propose).
  const negotiable = view.status === "open" || view.status === "accepted";
  const atRoundLimit = view.rounds.length >= MAX_ROUNDS;
  const ownerName = `${view.owner.firstName} ${view.owner.lastName}`;
  const pendingProposal = view.pending?.proposal ?? null;
  // Server podepisuje pendingTerms, ne rozpracovaný formulář (accept ignoruje draft), takže
  // Podepsat smí jít zobrazit, jen když se draft s podmínkami k podpisu shoduje. Mimo otevřené
  // ani přijaté jednání pending vždycky null, podmínka na negotiable proto navíc netřeba.
  const agreesWithPending = pendingProposal !== null && proposalsEqual(draft, pendingProposal);

  return (
    <div className="page-container space-y-5">
      {dialog}
      <NegotiationHeader view={view} estimate={estimate} cost={cost} />
      <RoundsHistory
        rounds={view.rounds} ownerName={ownerName}
        onUseCounter={negotiable ? (p) => setDraft(withSeasons(view, p, p.seasons)) : undefined}
      />

      {CLOSED_TEXT[view.status] && (
        <div className="text-sm bg-surface-2 rounded-soft px-3 py-2">{CLOSED_TEXT[view.status]}</div>
      )}

      {negotiable && (
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

      {agreesWithPending && <SigningSummary view={view} />}

      <OwnerReplyDialog
        open={replyOpen && reply !== null}
        onClose={() => setReplyOpen(false)}
        round={reply}
        ownerName={ownerName}
        faceConfig={view.owner.faceConfig}
        note={reply ? replyNote(reply, view.patience, view.cooldownUntil, view.pending !== null) : ""}
        hasPending={view.pending !== null}
        sponsorId={view.sponsorId}
        onEdit={() => setReplyOpen(false)}
        onSign={() => { setReplyOpen(false); void sign(); }}
        onUseCounter={() => { if (view.pending) setDraft(view.pending.proposal); setReplyOpen(false); }}
      />

      {reply && (
        <div ref={replyRef} className="card px-4 py-3 space-y-1">
          <div className="text-sm font-heading font-bold text-gold-600">Odpověď majitele: {RESPONSE_LABELS[reply.response.kind]}</div>
          <div className="text-base"><span className="font-heading font-bold">{ownerName}:</span> „{reply.response.text}“</div>
          <div className="text-sm">{replyNote(reply, view.patience, view.cooldownUntil, view.pending !== null)}</div>
        </div>
      )}

      {error && <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{error}</div>}

      {/* Odesílací tlačítka vždy na konci stránky, bez částek. */}
      <div className="flex flex-col gap-2">
        {negotiable && !agreesWithPending && (
          <p className="text-sm">
            Tvůj návrh ho stojí <span className={`font-heading font-bold ${cost > estimate.high ? "text-card-red" : cost <= estimate.low ? "text-pitch-600" : "text-gold-600"}`}>{formatCZK(cost)}</span> měsíčně,
            ochota je zhruba {formatCZK(estimate.low)} až {formatCZK(estimate.high)}.
            {cost > estimate.high * 1.5 ? " Takový návrh ho nejspíš urazí." : cost > estimate.high ? " Nejspíš ho odmítne." : ""}
          </p>
        )}
        {negotiable && !agreesWithPending && pendingProposal && (
          <p className="text-sm text-muted">Změnil jsi podmínky. Pošli je majiteli jako návrh, podepsat půjde, až se shodnete.</p>
        )}
        {agreesWithPending && (
          <button type="button" onClick={sign} disabled={acting} className="btn btn-primary w-full min-h-11">Podepsat smlouvu</button>
        )}
        {negotiable && !agreesWithPending && (
          <button type="button" onClick={propose} disabled={acting || atRoundLimit} className="btn btn-primary w-full min-h-11">
            {acting ? "Majitel čte návrh…" : "Navrhnout"}
          </button>
        )}
        <Link href={`/sponzor/${view.sponsorId}`} className="text-center text-sm text-muted min-h-11 leading-[2.75rem]">Zpět na sponzora</Link>
        {negotiable && (
          <button type="button" onClick={closeNegotiation} disabled={acting} className="btn btn-secondary w-full min-h-11">
            Ukončit jednání
          </button>
        )}
      </div>
    </div>
  );
}
