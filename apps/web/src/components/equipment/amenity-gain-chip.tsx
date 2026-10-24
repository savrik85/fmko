"use client";

import type { AmenityOutlook } from "@/lib/amenity-outlook";

/**
 * Krátký štítek pod nabídkou zázemí, když klubu nepřidá celý slibovaný bonus (strop zázemí).
 * Plné vysvětlení je v potvrzení nákupu; karta ukazuje jen to, co hráč potřebuje vidět
 * na první pohled. Když vylepšení přidá všechno, štítek se neukáže.
 */
export function AmenityGainChip({ amenity }: { amenity: AmenityOutlook }) {
  if (amenity.gain >= amenity.raw) return null;
  const text = amenity.gain <= 0
    ? `U tebe +0 · strop zázemí +${amenity.cap} už máš`
    : `U tebe jen +${amenity.gain} · strop zázemí +${amenity.cap}`;
  return (
    <div
      className="inline-flex items-center mt-1.5 px-2.5 py-1 rounded-soft bg-gold-500/10 text-gold-600 text-sm font-heading font-bold leading-snug"
      title={amenity.note}
    >
      {text}
    </div>
  );
}
