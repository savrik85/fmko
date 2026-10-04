"use client";

/**
 * Detail hlášení skauta v plachtě: odhad hodnocení jako rozmezí, plusy a minusy, ochota
 * hráče a co se s ním dá dělat (jednat s klubem, podepsat volného hráče, podívat se znovu).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiAction } from "@/lib/api";
import { Sheet, SheetDialog, PositionBadge, Spinner, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { MoneyInput, formatAmount } from "@/components/ui/money-input";
import { TransferTermsFields, PLAIN_TERMS, type TermsValue } from "@/components/transfers/transfer-terms";
import { WillingnessBadge, ratingText } from "./WillingnessBadge";
import { SCOUT_REPORT_STATUS_LABELS, type ScoutReportStatus } from "@okresni-masina/shared";

export interface ScoutReport {
  id: string;
  source: "village_club" | "free_agent";
  status: ScoutReportStatus;
  firstName: string;
  lastName: string;
  age: number;
  position: string;
  avatar: Record<string, unknown>;
  weeklyWage: number | null;
  clubName: string | null;
  clubCity: string | null;
  district: string | null;
  distanceKm: number;
  ratingLo: number;
  ratingHi: number;
  potentialLo: number | null;
  potentialHi: number | null;
  visits: number;
  askHint: number | null;
  pros: string[];
  cons: string[];
  willingness: { level: number; label: string } | null;
  negotiationId: string | null;
  freeAgentId: string | null;
  expiresAt: string;
  createdAt: string;
}

interface Detail {
  report: ScoutReport;
  revisit: { available: boolean; planned: boolean; hasAssignment: boolean };
}

export function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function ScoutReportSheet({ teamId, reportId, onClose, onChanged }: {
  teamId: string;
  reportId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm({ sheet: true });
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  const load = async () => {
    try {
      setData(await apiFetch<Detail>(`/api/teams/${teamId}/scout/reports/${reportId}`));
      setError(null);
    } catch (e) {
      console.error("Načtení hlášení selhalo:", e);
      setError(e instanceof Error ? e.message : "Hlášení se nepodařilo načíst");
    }
  };
  useEffect(() => { load(); }, [teamId, reportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = data?.report;
  const name = r ? `${r.firstName} ${r.lastName}` : "";
  const active = r?.status === "active";

  const revisit = async () => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/reports/${reportId}/revisit`, { method: "POST" }), "Návštěvu se nepodařilo naplánovat")) {
      await load();
      onChanged();
    }
  };

  const dismiss = async () => {
    if (await apiAction(apiFetch(`/api/teams/${teamId}/scout/reports/${reportId}/dismiss`, { method: "POST" }), "Nepodařilo se")) {
      onChanged();
      onClose();
    }
  };

  const signFreeAgent = async () => {
    if (!r?.freeAgentId) return;
    const ok = await confirm({ title: `Podpis: ${name}`, description: "Volný hráč, za přestup se neplatí. Rozhodne se hned.", confirmLabel: "Podepsat" });
    if (!ok) return;
    const out: { res: { success: boolean; decision?: { explanation?: string } } | null } = { res: null };
    const done = await apiAction(
      apiFetch<{ success: boolean; decision?: { explanation?: string } }>(`/api/teams/${teamId}/free-agents/${r.freeAgentId}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeredWage: r.weeklyWage ?? 0 }),
      }).then((x) => { out.res = x; }),
      "Podpis se nezdařil",
    );
    if (done && out.res) {
      await confirm({
        title: out.res.success ? `${name} podepsal!` : `${name} odmítl`,
        description: out.res.decision?.explanation ?? "",
        confirmLabel: "OK",
      });
    }
    onChanged();
    await load();
  };

  const negotiate = async (amount: number, terms: TermsValue, u21: boolean) => {
    const out: { res: { negotiationId: string } | null } = { res: null };
    const done = await apiAction(
      apiFetch<{ negotiationId: string }>(`/api/teams/${teamId}/scout/reports/${reportId}/negotiate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, upfrontPct: terms.upfrontPct, installments: terms.installments, targetSquad: u21 ? "u21" : "senior" }),
      }).then((x) => { out.res = x; }),
      "Jednání se nepodařilo zahájit",
    );
    if (done && out.res) {
      setOfferOpen(false);
      onChanged();
      router.push(`/prestupy/jednani/${out.res.negotiationId}`);
    }
  };

  return (
    <Sheet open onClose={onClose} title={name || "Hlášení skauta"}>
      <div className="px-5 pt-3 sm:pt-5 pb-5 space-y-4">
        {!data && !error && <div className="py-8 flex justify-center"><Spinner /></div>}
        {error && <div className="text-red-600 font-heading font-bold text-center py-6">{error}</div>}
        {r && (
          <>
            <div className="flex items-center gap-4">
              <div className="rounded-full overflow-hidden w-16 h-16 bg-paper ring-2 ring-white shadow-sm flex items-center justify-center shrink-0">
                {Object.keys(r.avatar ?? {}).length > 0 ? <FaceAvatar faceConfig={r.avatar} size={58} /> : <span className="text-2xl">👤</span>}
              </div>
              <div className="min-w-0">
                <div className="font-heading font-bold text-xl">{name}</div>
                <div className="flex items-center gap-2 flex-wrap text-sm mt-0.5">
                  <PositionBadge position={r.position as "GK" | "DEF" | "MID" | "FWD"} />
                  <span className="text-muted">{r.age} let</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-muted font-heading font-bold">{SCOUT_REPORT_STATUS_LABELS[r.status]}</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  {r.source === "free_agent" ? `Volný hráč, ${r.clubCity ?? ""} (okres ${r.district ?? "?"})` : `${r.clubName}, ${r.clubCity}`} · {r.distanceKm} km od vás
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/70 border border-gray-100 p-3 text-center">
                <div className="text-sm text-muted font-heading">Hodnocení</div>
                <div className="font-heading font-[900] text-2xl tabular-nums">{ratingText(r.ratingLo, r.ratingHi)}</div>
                <div className="text-sm text-muted">{r.visits === 1 ? "viděl ho jednou" : `viděl ho ${r.visits}×`}</div>
              </div>
              {r.potentialLo != null ? (
                <div className="rounded-xl bg-white/70 border border-gray-100 p-3 text-center">
                  <div className="text-sm text-muted font-heading">Dotáhne to na</div>
                  <div className="font-heading font-[900] text-2xl tabular-nums">{ratingText(r.potentialLo, r.potentialHi)}</div>
                  <div className="text-sm text-muted">názor skauta</div>
                </div>
              ) : (
                <div className="rounded-xl bg-white/70 border border-gray-100 p-3 text-center">
                  <div className="text-sm text-muted font-heading">Dojíždění</div>
                  <div className="font-heading font-[900] text-2xl tabular-nums">{r.distanceKm} km</div>
                  <div className="text-sm text-muted">{r.distanceKm <= 15 ? "kousek" : r.distanceKm <= 30 ? "dá se to" : "daleko"}</div>
                </div>
              )}
            </div>

            {(r.pros.length > 0 || r.cons.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <ul className="space-y-1">
                  {r.pros.map((p) => <li key={p} className="flex gap-2"><span className="text-pitch-500">＋</span><span>{p}</span></li>)}
                </ul>
                <ul className="space-y-1">
                  {r.cons.map((p) => <li key={p} className="flex gap-2"><span className="text-red-600">－</span><span>{p}</span></li>)}
                </ul>
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              {r.willingness && (active || r.status === "negotiating") && (
                <div className="flex items-center gap-2 flex-wrap"><span className="text-muted">Ochota přejít:</span><WillingnessBadge level={r.willingness.level} /></div>
              )}
              {r.source === "village_club" && r.askHint != null && (
                <div><span className="text-muted">Klub si řekne asi </span><span className="font-heading font-bold tabular-nums">{r.askHint.toLocaleString("cs")} Kč</span></div>
              )}
              {r.source === "free_agent" && r.weeklyWage != null && (
                <div><span className="text-muted">Chce </span><span className="font-heading font-bold tabular-nums">{r.weeklyWage.toLocaleString("cs")} Kč týdně</span></div>
              )}
              {(active || r.status === "negotiating") && (
                <div className="text-muted">Hlášení platí ještě {daysLeft(r.expiresAt)} {daysLeft(r.expiresAt) === 1 ? "den" : daysLeft(r.expiresAt) < 5 ? "dny" : "dní"}. Mezitím ho může sebrat jiný klub.</div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {active && r.source === "village_club" && (
                <button onClick={() => setOfferOpen(true)} className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                  Začít jednat s klubem
                </button>
              )}
              {active && r.source === "free_agent" && (
                <button onClick={signFreeAgent} className="w-full py-3 rounded-xl font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                  Podepsat
                </button>
              )}
              {r.status === "negotiating" && r.negotiationId && (
                <Link href={`/prestupy/jednani/${r.negotiationId}`} className="w-full py-3 rounded-xl font-heading font-bold bg-ink text-white text-center">
                  Otevřít jednání
                </Link>
              )}
              {data?.revisit.planned && (
                <div className="text-sm text-center text-muted">👀 Skaut se na něj v pondělí podívá znovu.</div>
              )}
              {data?.revisit.available && (
                <button onClick={revisit} className="w-full py-2.5 rounded-xl font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                  Podívej se na něj znovu
                </button>
              )}
              {data && !data.revisit.available && !data.revisit.planned && (active || r.status === "negotiating") && (
                <div className="text-sm text-center text-muted">
                  {data.revisit.hasAssignment ? "Na příští týden už má skaut jednu návštěvu." : "Znovu se podívat může skaut jen během úkolu."}
                </div>
              )}
              {data?.revisit.available && (
                <div className="text-sm text-center text-muted">Návštěva zabere skautovi příští týden místo hledání nových hráčů.</div>
              )}
              {active && (
                <button onClick={dismiss} className="text-sm text-muted hover:text-red-600 underline">Nezajímá mě</button>
              )}
            </div>
          </>
        )}
      </div>
      {offerOpen && r && (
        <OfferSheet
          askHint={r.askHint ?? 5000}
          canU21={r.age <= 21}
          onCancel={() => setOfferOpen(false)}
          onConfirm={negotiate}
        />
      )}
      {dialog}
    </Sheet>
  );
}

function OfferSheet({ askHint, canU21, onCancel, onConfirm }: {
  askHint: number;
  canU21: boolean;
  onCancel: () => void;
  onConfirm: (amount: number, terms: TermsValue, u21: boolean) => Promise<void>;
}) {
  const [amount, setAmount] = useState<number | null>(Math.round((askHint * 0.8) / 100) * 100);
  const [terms, setTerms] = useState<TermsValue>(PLAIN_TERMS);
  const [u21, setU21] = useState(false);
  return (
    <SheetDialog open title="Nabídka klubu" confirmLabel="Poslat nabídku" confirmDisabled={!amount}
      onCancel={onCancel}
      onConfirm={async () => { if (amount) await onConfirm(amount, terms, u21); }}>
      <label className="text-sm text-muted font-heading uppercase">Kolik nabízíš (Kč)</label>
      <MoneyInput value={amount} onChange={setAmount} autoFocus
        className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 bg-white font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500" />
      <div className="flex justify-center gap-2 mt-2">
        {[0.7, 0.8, 0.9, 1].map((m) => Math.round((askHint * m) / 100) * 100).map((preset, i) => (
          <button key={i} type="button" onClick={() => setAmount(preset)}
            className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === preset ? "bg-pitch-500 text-white" : "bg-black/5 text-muted hover:bg-black/10"}`}>
            {formatAmount(preset)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <TransferTermsFields amount={amount} value={terms} onChange={setTerms} allowSellOn={false} />
      </div>
      {canU21 && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={u21} onChange={(e) => setU21(e.target.checked)} className="w-4 h-4" />
          Do dorostu (U21)
        </label>
      )}
      <p className="text-sm text-muted mt-3">
        Předseda klubu odpoví hned. Svého nejlepšího hráče pouští nerad, talentovaného kluka si cení podle toho, kým bude, a urážlivá nabídka mu bere trpělivost.
      </p>
    </SheetDialog>
  );
}
