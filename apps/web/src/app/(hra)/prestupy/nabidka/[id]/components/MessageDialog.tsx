"use client";

import { useState } from "react";
import { SheetDialog } from "@/components/ui";

/** Potvrzení akce v jednání s volitelnou krátkou zprávou protistraně (plachta). */
export function MessageDialog({ title, description, confirmLabel, confirmColor, placeholder, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: "pitch" | "red" | "gold";
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (message: string) => Promise<void>;
}) {
  const [msg, setMsg] = useState("");

  return (
    <SheetDialog open title={title} description={description} confirmLabel={confirmLabel}
      variant={confirmColor === "red" ? "danger" : confirmColor === "gold" ? "gold" : "default"}
      onCancel={onCancel} onConfirm={() => onConfirm(msg.trim())}>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value.slice(0, 200))}
        rows={3}
        placeholder={placeholder ?? "Krátká zpráva protistraně (volitelné)"}
        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500 resize-none"
      />
      <div className="text-sm text-muted text-right mt-1 tabular-nums">{msg.length}/200</div>
    </SheetDialog>
  );
}
