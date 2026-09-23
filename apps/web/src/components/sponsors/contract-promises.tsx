"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import { promiseMoneyParts, promiseStatusClass, promiseStatusLabel, promiseTermText } from "@/lib/sponsor-promises";
import type { SponsorPromiseView } from "@/lib/sponsor-page-types";

/** Sliby u aktivní smlouvy: co klub slíbil, do kdy, jak to dopadlo a o kolik jde. Jeden slib na řádek. */
export function ContractPromises({ promises, acting, onSleeveLogo }: {
  promises: SponsorPromiseView[];
  acting: boolean;
  onSleeveLogo: (promiseId: string) => void;
}) {
  if (promises.length === 0) return null;
  return (
    <div className="pt-2 border-t border-line-soft space-y-2">
      <div className="text-sm text-muted font-heading font-bold">Sliby sponzorovi</div>
      <ul className="space-y-3">
        {promises.map((p) => {
          const moneyParts = promiseMoneyParts(p);
          return (
            <li key={p.id} className="text-sm space-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 first-letter:uppercase">{p.label}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-heading font-bold ${promiseStatusClass(p)}`}>
                  {promiseStatusLabel(p)}
                </span>
              </div>
              <div className="text-muted">
                {promiseTermText(p)}
                {p.actualText ? `, skutečnost: ${p.actualText}` : ""}
              </div>
              {moneyParts.length > 0 && (
                <div className="flex flex-wrap gap-x-1 tabular-nums">
                  {p.status === "pending" && <span className="text-muted">v sázce:</span>}
                  {moneyParts.map((part, i) => (
                    <span key={part.kind} className={part.kind === "bonus" ? "text-pitch-500" : "text-card-red"}>
                      {part.kind === "bonus" ? "bonus" : "pokuta"} {formatCZK(part.amount)}{i < moneyParts.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              )}
              {p.canPlaceSleeveLogo && (
                <button onClick={() => onSleeveLogo(p.id)} disabled={acting}
                  className="min-h-11 text-sm text-pitch-600 hover:text-pitch-500 font-heading font-bold transition-colors disabled:opacity-50">
                  👕 Dát logo na rukáv
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
