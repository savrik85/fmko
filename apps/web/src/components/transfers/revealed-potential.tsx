"use client";

/**
 * Potenciál hráče odkrytý prodávajícím u inzerátu (prodej i hostování): zaškrtávátko pro
 * prodávajícího a štítek, který vidí kupující na trhu a v profilu hráče.
 */

import { scoutReach } from "@/lib/scout-reach";

export interface RevealedPotential {
  lo: number;
  hi: number;
  /** Horní odhad dnešního hodnocení; u dospělých se z něj počítá, kolik hráč ještě přidá. */
  ratingHi: number;
}

export function RevealPotentialToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${checked ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:bg-gray-50"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 accent-[var(--color-pitch-500)]" />
      <span>
        <span className="block font-heading font-bold text-ink">Odkrýt potenciál hráče</span>
        <span className="block text-sm text-muted">
          Kupující uvidí na trhu i v profilu hráče, kam to může dotáhnout. Platí, dokud je inzerát aktivní.
        </span>
      </span>
    </label>
  );
}

export function RevealedPotentialBadge({ age, potential }: { age: number | null; potential: RevealedPotential }) {
  const reach = scoutReach(age, potential.ratingHi, potential.lo, potential.hi);
  return (
    <span title="Potenciál odkryl prodávající klub"
      className="inline-block text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 whitespace-nowrap">
      Potenciál: {reach.sentence}
    </span>
  );
}
