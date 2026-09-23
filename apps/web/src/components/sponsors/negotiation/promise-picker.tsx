"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import {
  findOption, optionKey, PROMISE_LABELS, PROMISE_ORDER, PROMISE_TIMING,
  type NegotiationView, type PromiseKind, type PromiseSpec,
} from "@/lib/sponsor-negotiation";

/** Sliby jako karty: klepnutím přidat nebo odebrat, u vybraného zvolit parametr. */
export function PromisePicker({ view, seasons, promises, onChange }: {
  view: NegotiationView; seasons: number; promises: PromiseSpec[]; onChange: (next: PromiseSpec[]) => void;
}) {
  const kinds = PROMISE_ORDER.filter((k) => view.catalog.some((o) => o.kind === k));
  const selected = new Map(promises.map((p) => [p.kind, p] as const));

  const toggle = (kind: PromiseKind) => {
    if (selected.has(kind)) {
      onChange(promises.filter((p) => p.kind !== kind));
      return;
    }
    const options = view.catalog.filter((o) => o.kind === kind);
    // Výchozí parametr: prostřední možnost (umístění v půlce tabulky, ne hned 1. místo).
    const first = options[Math.floor((options.length - 1) / 2)];
    if (first) onChange([...promises, { kind, params: first.params }]);
  };

  const pick = (kind: PromiseKind, key: string) => {
    const o = view.catalog.find((x) => x.kind === kind && optionKey(x.params) === key);
    if (o) onChange(promises.map((p) => (p.kind === kind ? { kind, params: o.params } : p)));
  };

  return (
    <div className="space-y-2">
      {seasons < 2 && (
        <p className="text-sm text-muted">Sezónní sliby platí až od příští sezóny. U smlouvy na 1 sezónu je dát nejde.</p>
      )}
      {kinds.map((kind) => {
        const options = view.catalog.filter((o) => o.kind === kind);
        const disabled = options[0].seasonal && seasons < 2;
        const chosen = selected.get(kind);
        const opt = chosen ? findOption(view, chosen) : undefined;
        const isWish = view.wishes.includes(kind);
        return (
          <div key={kind} className={`rounded-soft border p-3 ${chosen ? "border-pitch-500 bg-pitch-50" : "border-line-soft bg-white"} ${disabled ? "opacity-50" : ""}`}>
            <button
              type="button" onClick={() => toggle(kind)} disabled={disabled} aria-pressed={!!chosen}
              className="w-full min-h-11 flex items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-heading font-bold text-base">{PROMISE_LABELS[kind]}</span>
                <span className="block text-sm text-muted">{PROMISE_TIMING[kind]}{isWish ? " · přání majitele" : ""}</span>
              </span>
              <span className="text-sm font-heading font-bold shrink-0 text-pitch-600">{chosen ? "Slíbeno" : "Přidat"}</span>
            </button>
            {chosen && (
              <div className="mt-2 space-y-2">
                {options.length > 1 ? (
                  <select
                    value={optionKey(chosen.params)} onChange={(e) => pick(kind, e.target.value)}
                    className="input w-full min-h-11 text-base" aria-label={`Parametr slibu ${PROMISE_LABELS[kind]}`}
                  >
                    {options.map((o) => <option key={optionKey(o.params)} value={optionKey(o.params)}>{o.label}</option>)}
                  </select>
                ) : (
                  <div className="text-sm">{options[0].label}</div>
                )}
                {opt && (
                  <div className="text-sm text-muted">
                    Ochota stoupne zhruba o {formatCZK(opt.value.low)} až {formatCZK(opt.value.high)} měsíčně.
                    Za nesplnění pokuta {formatCZK(opt.penalty.low)} až {formatCZK(opt.penalty.high)}{opt.seasonal ? " za každou sezónu" : ""}.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
