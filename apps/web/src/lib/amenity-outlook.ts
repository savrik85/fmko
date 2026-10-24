/**
 * Co vylepšení zázemí (ozvučení, sociálky, pořadatelé) přidá spokojenosti fanoušků
 * po domácím zápase. Body zázemí se sčítají a mají společný strop, takže stejné
 * vylepšení dá každému klubu jinak. Počítá server (apps/api/src/season/amenity-outlook.ts),
 * stránka jen ukazuje.
 */
export interface AmenityOutlook {
  /** Kolik bodů zázemí vylepšení samo přidá (to, co slibuje popisek). */
  raw: number;
  /** Kolik z toho klub po stropu opravdu dostane. */
  gain: number;
  /** Kolik zázemí klubu dává teď. */
  current: number;
  cap: number;
  /** Hotová věta pro nabídku. */
  note: string;
}

/** Popis v potvrzení nákupu doplněný o větu, kolik vylepšení klubu opravdu přidá. */
export function withAmenityNote(text: string, a?: AmenityOutlook): string {
  if (!a) return text;
  const base = text.trim().replace(/\.$/, "");
  return base ? `${base}. ${a.note}` : a.note;
}

/** Řádek do potvrzení nákupu, ať je přírůstek vidět i těsně před zaplacením. */
export function amenityDetail(a: AmenityOutlook): { label: string; value: string; color: string } {
  return {
    label: "Spokojenost po domácím zápase",
    value: a.gain > 0 ? `+${a.gain}` : "nepřidá nic",
    // Zlatě jako štítek na kartě: je to upozornění, ne chyba.
    color: a.gain < a.raw ? "text-gold-600" : "text-pitch-500",
  };
}
