"use client";

import { MoneyInput, formatAmount } from "@/components/ui/money-input";
import { useState } from "react";
import { formatTermsSummary, type TransferTerms } from "@okresni-masina/shared";
import { TransferTermsFields, type TermsValue } from "@/components/transfers/transfer-terms";

type DialogKind = "accept" | "counter" | "reject" | null;

export function ActionBar({
  onAccept, onCounter, onReject,
  currentAmount, defaultCounter, terms, termsNegotiable, adminFee, payNow,
  canAfford, waiting, role, hideCounter, rejectWarning, initialDialog = null, saleDeductions = null,
}: {
  onAccept: (message: string) => Promise<void>;
  onCounter: (amount: number, message: string, terms: TermsValue | null) => Promise<void>;
  onReject: (message: string) => Promise<void>;
  currentAmount: number;
  defaultCounter: number;
  /** Podmínky posledního návrhu. */
  terms: TransferTerms;
  /** U trvalého přestupu mezi lidmi jde v protinávrhu měnit i splátky a procenta. */
  termsNegotiable: boolean;
  adminFee: number;
  /** Kolik kupující zaplatí při přijetí hned. */
  payNow: number;
  canAfford: boolean;
  waiting: boolean;
  role: "buyer" | "seller";
  hideCounter?: boolean; // virtuální klub o ceně nejedná
  rejectWarning?: string | null; // varování, když hráč o přestup stojí
  initialDialog?: DialogKind;
  /** Prodávající za hráče sám splácí nebo slíbil procenta: co se mu z ceny hned strhne. */
  saleDeductions?: { settle: number; settleTo: string; sellOnPct: number; sellOnTo: string; sellOn: number; withSwap: boolean } | null;
}) {
  const [dialog, setDialog] = useState<DialogKind>(initialDialog);

  if (waiting) {
    return (
      <div className="text-center py-3">
        <div className="font-heading font-bold text-muted text-sm uppercase tracking-wider">
          ⏳ Čeká se na odpověď soupeře
        </div>
      </div>
    );
  }

  const acceptDisabled = role === "buyer" && !canAfford;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            disabled={acceptDisabled}
            onClick={() => setDialog("accept")}
            className="flex-1 sm:flex-none min-w-[140px] px-4 py-2.5 rounded-soft font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Přijmout
          </button>
          {!hideCounter && (
          <button
            onClick={() => setDialog("counter")}
            className="flex-1 sm:flex-none min-w-[120px] px-4 py-2.5 rounded-soft font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors"
          >
            Protinabídka
          </button>
          )}
          <button
            onClick={() => setDialog("reject")}
            className="flex-1 sm:flex-none min-w-[120px] px-4 py-2.5 rounded-soft font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors"
          >
            Odmítnout
          </button>
        </div>
        <div className="text-center text-sm text-muted tabular-nums">
          {role === "buyer"
            ? `Přijetím zaplatíš hned ${payNow.toLocaleString("cs")} Kč${terms.installments > 0 ? `, zbytek ve ${terms.installments} týdenních splátkách` : ""}.`
            : `Kupující při přijetí pošle hned ${(payNow - adminFee).toLocaleString("cs")} Kč${terms.installments > 0 ? `, zbytek ve ${terms.installments} týdenních splátkách` : ""}.`}
        </div>
        {saleDeductions && (
          <div className="mx-auto w-full max-w-sm rounded-xl bg-gold-50 border border-gold-300/60 px-3 py-2 text-sm tabular-nums">
            <div className="font-heading font-bold mb-1">Z ceny se ti hned strhne</div>
            {saleDeductions.settle > 0 && (
              <div className="flex justify-between gap-3"><span>Doplacení splátek pro {saleDeductions.settleTo}</span><span className="font-heading font-bold">{saleDeductions.settle.toLocaleString("cs")} Kč</span></div>
            )}
            {saleDeductions.sellOnPct > 0 && (
              <div className="flex justify-between gap-3"><span>{saleDeductions.sellOnPct} % pro {saleDeductions.sellOnTo}</span><span className="font-heading font-bold">{saleDeductions.sellOn.toLocaleString("cs")} Kč{saleDeductions.withSwap ? " a víc" : ""}</span></div>
            )}
            <div className="flex justify-between gap-3 border-t border-gold-300/60 mt-1 pt-1">
              <span>Zůstane ti z ceny</span>
              <span className="font-heading font-bold">{(currentAmount - saleDeductions.settle - saleDeductions.sellOn).toLocaleString("cs")} Kč</span>
            </div>
            {saleDeductions.withSwap && (
              <div className="text-muted mt-1">U výměny se procenta počítají i z tržní ceny hráče, kterého dostaneš.</div>
            )}
          </div>
        )}
        {role === "buyer" && !canAfford && (
          <div className="text-center text-sm text-red-600 italic">
            {terms.installments > 0 ? "Nemáš dost peněz ani na zálohu" : "Nemáš dostatek prostředků na přijetí této nabídky"}
          </div>
        )}
      </div>

      {dialog === "accept" && (
        <MessageDialog
          title="Přijmout nabídku?"
          description={`${currentAmount > 0 ? formatTermsSummary(terms) : "Zdarma"}. Krátká zpráva protistraně (volitelné).`}
          confirmLabel="Přijmout"
          confirmColor="pitch"
          onCancel={() => setDialog(null)}
          onConfirm={async (msg) => { await onAccept(msg); setDialog(null); }}
        />
      )}
      {dialog === "reject" && (
        <MessageDialog
          title="Odmítnout nabídku?"
          description={rejectWarning ? `${rejectWarning} Krátká zpráva protistraně (volitelné).` : "Krátká zpráva protistraně (volitelné)"}
          confirmLabel="Odmítnout"
          confirmColor="red"
          onCancel={() => setDialog(null)}
          onConfirm={async (msg) => { await onReject(msg); setDialog(null); }}
        />
      )}
      {dialog === "counter" && (
        <CounterDialog
          initial={defaultCounter}
          initialTerms={termsNegotiable ? { upfrontPct: terms.upfrontPct, installments: terms.installments, sellOnPct: terms.sellOnPct } : null}
          onCancel={() => setDialog(null)}
          onConfirm={async (amount, msg, t) => { await onCounter(amount, msg, t); setDialog(null); }}
        />
      )}
    </>
  );
}

function MessageDialog({ title, description, confirmLabel, confirmColor, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: "pitch" | "red" | "gold";
  onCancel: () => void;
  onConfirm: (message: string) => Promise<void>;
}) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const colorCls = confirmColor === "red"
    ? "text-card-red hover:bg-red-50"
    : confirmColor === "gold"
      ? "text-gold-600 hover:bg-gold-50"
      : "text-pitch-500 hover:bg-pitch-50";

  return (
    // Kliknutí vedle dialog nezavírá — rozepsaná částka nebo zpráva by se ztratila. Zavírá jen Zrušit.
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg">{title}</h3>
          <p className="text-sm text-muted mt-1">{description}</p>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="např. Máme zájem, ale za tuto cenu..."
            className="w-full mt-3 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500 resize-none"
          />
          <div className="text-xs text-muted text-right mt-1 tabular-nums">{msg.length}/200</div>
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onCancel} disabled={loading} className="flex-1 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
            Zrušit
          </button>
          <div className="w-px bg-gray-100" />
          <button
            disabled={loading}
            onClick={async () => { setLoading(true); try { await onConfirm(msg.trim()); } finally { setLoading(false); } }}
            className={`flex-1 py-3.5 text-sm font-heading font-bold transition-colors disabled:opacity-50 ${colorCls}`}
          >
            {loading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CounterDialog({ initial, initialTerms, onCancel, onConfirm }: {
  initial: number;
  /** null = podmínky se nevyjednávají (hostování). */
  initialTerms: TermsValue | null;
  onCancel: () => void;
  onConfirm: (amount: number, message: string, terms: TermsValue | null) => Promise<void>;
}) {
  const [v, setV] = useState<number | null>(initial);
  const [terms, setTerms] = useState<TermsValue | null>(initialTerms);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    // Kliknutí vedle dialog nezavírá — rozepsaná částka nebo zpráva by se ztratila. Zavírá jen Zrušit.
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 overflow-y-auto">
          <h3 className="font-heading font-bold text-lg">Protinabídka</h3>
          <div className="mt-4">
            <label className="text-xs text-muted font-heading uppercase">Nová částka (Kč)</label>
            <MoneyInput
              value={v}
              onChange={setV}
              autoFocus
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
            />
            <div className="flex justify-center gap-2 mt-2">
              {[0.8, 1, 1.2, 1.5].map((mul) => Math.round((initial * mul) / 100) * 100).map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setV(preset)}
                  className={`px-2.5 py-1 rounded text-xs font-heading font-bold tabular-nums transition-colors ${
                    v === preset ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
                  }`}
                >
                  {formatAmount(preset)}
                </button>
              ))}
            </div>
          </div>
          {terms && (
            <div className="mt-4">
              <TransferTermsFields amount={v} value={terms} onChange={setTerms} />
            </div>
          )}
          <div className="mt-3">
            <label className="text-xs text-muted font-heading uppercase">Zpráva (volitelné)</label>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="např. Klub přistupuje vstřícně..."
              className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/30 focus:border-gold-500 resize-none"
            />
            <div className="text-xs text-muted text-right mt-0.5 tabular-nums">{msg.length}/200</div>
          </div>
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onCancel} disabled={loading} className="flex-1 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
            Zrušit
          </button>
          <div className="w-px bg-gray-100" />
          <button
            disabled={loading || !v}
            onClick={async () => {
              if (!v) return;
              setLoading(true);
              try { await onConfirm(v, msg.trim(), terms); } finally { setLoading(false); }
            }}
            className="flex-1 py-3.5 text-sm font-heading font-bold text-gold-600 hover:bg-gold-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Posílám..." : "Poslat"}
          </button>
        </div>
      </div>
    </div>
  );
}
