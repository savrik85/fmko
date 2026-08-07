"use client";

/**
 * Dialog „Přidat widget" — katalog rozdělený do kategorií.
 * Widget, který už na dashboardu je, zůstává vidět, ale nejde přidat podruhé.
 */

import { useState } from "react";
import { Modal } from "@/components/ui";
import { WIDGETS, CATEGORY_LABELS, CATEGORY_ORDER } from "./registry";
import type { WidgetCategory } from "./types";

export function WidgetPicker({
  isOpen,
  usedIds,
  onAdd,
  onClose,
}: {
  isOpen: boolean;
  usedIds: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<WidgetCategory | "vse">("vse");
  const used = new Set(usedIds);

  const list = WIDGETS.filter((w) => category === "vse" || w.category === category);

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="720px">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-heading font-[800] text-xl">Přidat widget</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-md text-muted hover:bg-gray-100 transition-colors"
          aria-label="Zavřít"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-muted mb-3">
        Můžeš jich přidat víc naráz — přidané se rovnou označí. Až budeš mít vybráno, zavři dialog.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <CategoryChip active={category === "vse"} onClick={() => setCategory("vse")}>
          Vše
        </CategoryChip>
        {CATEGORY_ORDER.map((cat) => (
          <CategoryChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
            {CATEGORY_LABELS[cat]}
          </CategoryChip>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {list.map((w) => {
          const already = used.has(w.id);
          return (
            <button
              key={w.id}
              type="button"
              disabled={already}
              onClick={() => onAdd(w.id)}
              className={`text-left flex gap-3 p-3 rounded-lg border transition-colors ${
                already
                  ? "border-gray-100 bg-gray-50 opacity-60 cursor-default"
                  : "border-gray-200 hover:border-pitch-300 hover:bg-pitch-50/40"
              }`}
            >
              <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">{w.icon}</span>
              <span className="min-w-0">
                <span className="block font-heading font-bold text-sm">
                  {w.title}
                  {already && <span className="ml-2 text-[11px] font-normal text-muted uppercase">už přidáno</span>}
                </span>
                <span className="block text-sm text-muted leading-snug mt-0.5">{w.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
        active ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
