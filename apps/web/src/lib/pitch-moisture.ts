/**
 * Nasáklost půdy pro zobrazení.
 *
 * Vlhkost hřiště (`stadiums.pitch_moisture`, 0–100, 50 = normál) od 2026-08-25
 * ovlivňuje zápas — techniku, nakopávané balony i riziko zranění. Do té doby
 * byla vidět jen jako kaluže ve 3D, takže hráč netušil, proč se mu na oko
 * pěkném hřišti nedaří. Prahy kopírují `apps/api/src/stadium/pitch-moisture.ts`
 * (mokro nad 55, sucho pod 45) — když se posunou tam, musí se i tady.
 */

export interface MoistureLabel {
  /** Slovní stav — to, co hráč čte jako první. */
  label: string;
  /** Tailwind třída barvy textu. Krajnosti varují, normál je klidný. */
  color: string;
}

export function moistureLabel(moisture: number | null | undefined): MoistureLabel {
  if (moisture == null) return { label: "Neznámá", color: "text-muted" };
  const m = Math.max(0, Math.min(100, moisture));
  if (m >= 85) return { label: "Bahno", color: "text-red-600" };
  if (m >= 70) return { label: "Rozmáčené", color: "text-amber-600" };
  if (m > 55) return { label: "Vlhké", color: "text-ink" };
  if (m >= 45) return { label: "Ideální", color: "text-pitch-600" };
  if (m >= 30) return { label: "Vysychá", color: "text-amber-600" };
  return { label: "Vyprahlé", color: "text-red-600" };
}

/** Jednořádkové vysvětlení, co ten stav dělá se hrou. */
export function moistureHint(moisture: number | null | undefined): string | null {
  if (moisture == null) return null;
  const m = Math.max(0, Math.min(100, moisture));
  if (m >= 85) return "Míč se v bahně zastaví, kombinace nefunguje a roste riziko zranění.";
  if (m >= 70) return "Těžký terén, kombinace vázne a vyplácí se nakopávat.";
  if (m > 55) return "Trochu těžší terén, na hru to má malý vliv.";
  if (m >= 45) return "Půda je akorát, hře nic nepřekáží.";
  if (m >= 30) return "Vyprahlá půda, míč se veze rychleji a povrch tvrdne.";
  return "Spálená tvrdá zem, nepříjemné odskoky a víc bolavých kloubů.";
}
