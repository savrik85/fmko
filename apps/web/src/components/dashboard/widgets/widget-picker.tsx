"use client";

/**
 * Dialog „Přidat widget".
 *
 * Hlavička s hledáním a kategoriemi a patička s tlačítkem Hotovo se nescrollují —
 * posouvá se jen samotný seznam. Při šedesáti widgetech je jinak vyhledávání
 * i zavření mimo dohled.
 */

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { WIDGETS, CATEGORY_LABELS, CATEGORY_ORDER } from "./registry";
import type { WidgetCategory } from "./types";

/** Porovnání bez diakritiky a velikosti písmen — „radar" najde i „Radar". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

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
  const [query, setQuery] = useState("");
  const used = new Set(usedIds);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    return WIDGETS.filter((w) => {
      if (category !== "vse" && w.category !== category) return false;
      if (!q) return true;
      return normalize(`${w.title} ${w.description}`).includes(q);
    });
  }, [category, query]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="760px">
      <div className="flex flex-col max-h-[88vh] sm:max-h-[80vh]">

        {/* ── Hlavička ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading font-[800] text-xl leading-tight">Přidat widget</h2>
              <p className="text-sm text-muted mt-0.5">
                Vyber si, co chceš mít na Domů. Přidat jich můžeš víc naráz.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-lg text-muted hover:bg-black/5 transition-colors text-lg leading-none"
              aria-label="Zavřít"
            >
              ✕
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat widget…"
            aria-label="Hledat widget"
            className="mt-3 w-full h-10 px-3 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-pitch-400 transition-colors"
          />

          {/* Kategorie — na mobilu se posouvají do strany, nezalamují se do bloku */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            <CategoryChip active={category === "vse"} onClick={() => setCategory("vse")}>Vše</CategoryChip>
            {CATEGORY_ORDER.map((cat) => (
              <CategoryChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                {CATEGORY_LABELS[cat]}
              </CategoryChip>
            ))}
          </div>
        </div>

        {/* ── Seznam ───────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {list.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">
              Nic takového tu není. Zkus jiné slovo nebo jinou kategorii.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {list.map((w) => {
                const already = used.has(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={already}
                    onClick={() => onAdd(w.id)}
                    className={`text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                      already
                        ? "border-pitch-200 bg-pitch-50/60 cursor-default"
                        : "border-gray-200 bg-white hover:border-pitch-400 hover:bg-pitch-50/50"
                    }`}
                  >
                    <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">{w.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading font-bold text-sm leading-tight">{w.title}</span>
                      <span className="block text-sm text-muted leading-snug mt-1">{w.description}</span>
                    </span>
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                        already ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted"
                      }`}
                      aria-hidden="true"
                    >
                      {already ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Patička ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 sm:px-6 border-t border-gray-200">
          <span className="text-sm text-muted">
            Na dashboardu <span className="font-heading font-bold text-ink tabular-nums">{usedIds.length}</span> widgetů
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
          >
            Hotovo
          </button>
        </div>
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
      className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-heading font-bold whitespace-nowrap transition-colors ${
        active ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100 border border-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
