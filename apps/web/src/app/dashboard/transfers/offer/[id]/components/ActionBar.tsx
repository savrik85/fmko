"use client";

import { useState } from "react";

type DialogKind = "accept" | "counter" | "reject" | null;

export function ActionBar({
  onAccept, onCounter, onReject,
  currentAmount, defaultCounter,
  canAfford, waiting, role,
}: {
  onAccept: (message: string) => Promise<void>;
  onCounter: (amount: number, message: string) => Promise<void>;
  onReject: (message: string) => Promise<void>;
  currentAmount: number;
  defaultCounter: number;
  canAfford: boolean;
  waiting: boolean;
  role: "buyer" | "seller";
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);

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
            className="flex-1 sm:flex-none min-w-[140px] px-4 py-2.5 rounded-lg font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Přijmout {currentAmount > 0 ? `${currentAmount.toLocaleString("cs")} Kč` : "zdarma"}
          </button>
          <button
            onClick={() => setDialog("counter")}
            className="flex-1 sm:flex-none min-w-[120px] px-4 py-2.5 rounded-lg font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors"
          >
            Protinabídka
          </button>
          <button
            onClick={() => setDialog("reject")}
            className="flex-1 sm:flex-none min-w-[120px] px-4 py-2.5 rounded-lg font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors"
          >
            Odmítnout
          </button>
        </div>
        {role === "buyer" && !canAfford && (
          <div className="text-center text-xs text-red-600 italic">
            Nemáš dostatek prostředků na přijetí této nabídky
          </div>
        )}
      </div>

      {dialog === "accept" && (
        <MessageDialog
          title={`Přijmout ${currentAmount > 0 ? `${currentAmount.toLocaleString("cs")} Kč` : "zdarma"}?`}
          description="Krátká zpráva protistraně (volitelné)"
          confirmLabel="Přijmout"
          confirmColor="pitch"
          onCancel={() => setDialog(null)}
          onConfirm={async (msg) => { await onAccept(msg); setDialog(null); }}
        />
      )}
      {dialog === "reject" && (
        <MessageDialog
          title="Odmítnout nabídku?"
          description="Krátká zpráva protistraně (volitelné)"
          confirmLabel="Odmítnout"
          confirmColor="red"
          onCancel={() => setDialog(null)}
          onConfirm={async (msg) => { await onReject(msg); setDialog(null); }}
        />
      )}
      {dialog === "counter" && (
        <CounterDialog
          initial={defaultCounter}
          onCancel={() => setDialog(null)}
          onConfirm={async (amount, msg) => { await onCounter(amount, msg); setDialog(null); }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
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

function CounterDialog({ initial, onCancel, onConfirm }: {
  initial: number;
  onCancel: () => void;
  onConfirm: (amount: number, message: string) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg">Protinabídka</h3>
          <div className="mt-4">
            <label className="text-xs text-muted font-heading uppercase">Nová částka (Kč)</label>
            <input
              type="number"
              value={v}
              onChange={(e) => setV(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              step={500}
              autoFocus
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
            />
            <div className="flex justify-center gap-2 mt-2">
              {[
                Math.round(initial * 0.8),
                initial,
                Math.round(initial * 1.2),
                Math.round(initial * 1.5),
              ].map((preset, i) => (
                <button
                  key={i}
                  onClick={() => setV(preset)}
                  className={`px-2.5 py-1 rounded text-xs font-heading font-bold tabular-nums transition-colors ${
                    v === preset ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
                  }`}
                >
                  {preset >= 1000 ? `${Math.round(preset / 1000)}k` : preset}
                </button>
              ))}
            </div>
          </div>
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
            disabled={loading || v <= 0}
            onClick={async () => {
              setLoading(true);
              try { await onConfirm(v, msg.trim()); } finally { setLoading(false); }
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
