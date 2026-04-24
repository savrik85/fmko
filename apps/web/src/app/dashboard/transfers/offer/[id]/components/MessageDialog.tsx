"use client";

import { useState } from "react";

export function MessageDialog({ title, description, confirmLabel, confirmColor, onCancel, onConfirm }: {
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
            placeholder="Krátká zpráva protistraně (volitelné)"
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
