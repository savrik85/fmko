"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { formatCZK } from "@/lib/sponsor-owners";
import {
  blockText, dayMonth, RESULT_LABELS, type RequestInfo, type RequestPurpose, type RequestResult,
} from "@/lib/sponsor-requests";

const RESULT_CHIP_CLASS: Record<RequestResult["kind"], string> = {
  granted: "bg-pitch-50 text-pitch-600",
  partial: "bg-gold-50 text-gold-600",
  refused: "bg-red-50 text-card-red",
};

/**
 * Prosba o příspěvek u majitele firmy. Centrovaný dialog stejného stylu jako OwnerReplyDialog:
 * formulář (účel, částka, vzkaz), po odeslání odpověď majitele. Stav si načítá sám, takže ho jde
 * otevřít ze stránky firmy i z telefonu.
 */
export function RequestDialog({ open, onClose, teamId, sponsorId, onDone }: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  sponsorId: number;
  /** Po odpovědi majitele (peníze, náklonnost a zprávy se změnily). */
  onDone?: (result: RequestResult) => void;
}) {
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<RequestPurpose | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setInfo(null); setLoadError(null); setPurpose(null); setAmount(""); setNote(""); setError(null); setResult(null);
    apiFetch<RequestInfo>(`/api/teams/${teamId}/sponsor-owners/${sponsorId}/request`)
      .then(setInfo)
      .catch((e) => { console.error("prosba o příspěvek, načtení:", e); setLoadError((e as Error).message); });
  }, [open, teamId, sponsorId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const selected = info?.purposes.find((p) => p.purpose === purpose) ?? null;
  const asked = Number(amount.replace(/\s/g, ""));
  const amountValid = Number.isInteger(asked) && asked >= (info?.minAsk ?? 1000);
  const blocked = info ? blockText(info) : null;

  const send = async () => {
    if (!purpose || !amountValid || sending) return;
    setSending(true); setError(null);
    try {
      const res = await apiFetch<RequestResult>(`/api/teams/${teamId}/sponsor-owners/${sponsorId}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, amount: asked, note: note.trim() }),
      });
      setResult(res);
      onDone?.(res);
    } catch (e) {
      console.error("prosba o příspěvek, odeslání:", e);
      setError((e as Error).message);
    }
    setSending(false);
  };

  const footerButton = "flex-1 min-h-11 py-3.5 text-sm font-heading font-bold transition-colors";

  return (
    <div className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Prosba o příspěvek"
      >
        <div className="p-5 overflow-y-auto">
          {!info ? (
            loadError ? <p className="text-sm text-card-red">{loadError}</p> : <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <FaceAvatar faceConfig={info.owner.faceConfig} size={48} className="shrink-0" />
                <div className="min-w-0">
                  <div className="font-heading font-bold text-lg break-words">{info.owner.name}</div>
                  <div className="text-sm text-muted break-words">{info.owner.firmName}</div>
                </div>
              </div>

              {result ? (
                <div className="mt-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-heading font-bold ${RESULT_CHIP_CLASS[result.kind]}`}>
                    {RESULT_LABELS[result.kind]}
                  </span>
                  <div className="mt-3 bg-surface rounded-xl p-3 text-base">„{result.reply}“</div>
                  {result.amount > 0 && (
                    <p className="text-sm text-ink-light mt-3">
                      Na účet ti přišlo <span className="font-heading font-bold text-ink">{formatCZK(result.amount)}</span>.
                      {result.checkDay && <> Utrať je na {selected?.label ?? "slíbený účel"} do {dayMonth(result.checkDay)}, jinak se naštve a letos už nedá nic.</>}
                    </p>
                  )}
                  {result.favorDelta < 0 && (
                    <p className="text-sm text-card-red mt-2">Náklonnost {result.favorDelta}.</p>
                  )}
                </div>
              ) : blocked ? (
                <p className="text-base mt-3">{blocked}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-sm text-muted font-heading uppercase tracking-wide mb-1.5">Na co</div>
                    <div className="grid grid-cols-2 gap-2">
                      {info.purposes.map((p) => (
                        <button
                          key={p.purpose}
                          type="button"
                          onClick={() => setPurpose(p.purpose)}
                          className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-heading font-bold text-left transition-colors ${
                            purpose === p.purpose ? "border-pitch-500 bg-pitch-50 text-pitch-600" : "border-gray-200 text-ink hover:bg-gray-50"
                          }`}
                        >
                          {p.label.charAt(0).toUpperCase() + p.label.slice(1)}
                        </button>
                      ))}
                    </div>
                    {selected && (
                      <p className="text-sm text-ink-light mt-2">
                        {selected.estimate
                          ? `Na ${selected.label} dá zhruba ${formatCZK(selected.estimate.low)} až ${formatCZK(selected.estimate.high)}.`
                          : `Na ${selected.label} ti teď nedá skoro nic, poslední dobou ti dal dost.`}
                      </p>
                    )}
                  </div>

                  <label className="block">
                    <span className="text-sm text-muted font-heading uppercase tracking-wide">Kolik</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))}
                        placeholder="např. 10000"
                        className="input flex-1 min-h-11 text-base"
                      />
                      <span className="text-base text-muted">Kč</span>
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-sm text-muted font-heading uppercase tracking-wide">Vzkaz (nepovinné)</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 300))}
                      rows={2}
                      placeholder="Proč peníze potřebuješ"
                      className="input w-full mt-1.5 text-base"
                    />
                  </label>

                  <p className="text-sm text-ink-light">
                    Peníze přijdou hned na účet. Do 30 dní je musíš utratit na slíbený účel, jinak se naštve a letos už nedá nic.
                    Když odmítne, trochu ho to naštve. Když ho prosíš moc často, naštve ho to víc.
                  </p>
                  {error && <p className="text-sm text-card-red">{error}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex border-t border-gray-100 shrink-0">
          {info && !result && !blocked ? (
            <>
              <button type="button" onClick={onClose} className={`${footerButton} text-muted hover:bg-gray-50`}>Zrušit</button>
              <div className="w-px bg-gray-100" />
              <button
                type="button"
                onClick={send}
                disabled={!purpose || !amountValid || sending}
                className={`${footerButton} text-pitch-500 hover:bg-pitch-50 disabled:opacity-40`}
              >
                {sending ? "Posílám…" : "Poslat prosbu"}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className={`${footerButton} text-ink hover:bg-gray-50`}>Zavřít</button>
          )}
        </div>
      </div>
    </div>
  );
}
