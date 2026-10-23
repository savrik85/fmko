export type SponsorType = "hospoda" | "obchod" | "remeslo" | "firma" | "obec";

export interface Sponsor {
  id: number;
  teamId: number;
  name: string;
  type: SponsorType;
  monthlyAmount: number;
  winBonus: number;
  contractUntil: string;
  createdAt: string;
}

/**
 * Kolikrát víc sponzor skutečně vyplácí, než říká měsíční částka ve smlouvě.
 *
 * Pondělní výplata je od 25. 3. 2026 `měsíční částka / 4,3 × 2` (finance-processor), důvod
 * ×2 nikde zapsaný není. Majitel hry rozhodl, že peníze chodí dál takhle, ale hra musí
 * ukazovat, co klub opravdu dostane. Výplata i každé zobrazení příjmu od sponzora proto
 * jde přes tenhle násobitel. Vratky, výpovědní pokuty a pokuty za sliby se počítají
 * z měsíční částky ve smlouvě bez něj.
 */
export const SPONSOR_PAYOUT_MULTIPLIER = 2;

/** Kolik smlouva s danou měsíční částkou vyplácí každé pondělí (bez bonusu ekonoma). */
export function sponsorWeeklyPayout(monthlyAmount: number): number {
  return Math.round((monthlyAmount / 4.3) * SPONSOR_PAYOUT_MULTIPLIER);
}

/** Kolik smlouva s danou měsíční částkou vyplatí za měsíc (bez bonusu ekonoma). */
export function sponsorMonthlyPayout(monthlyAmount: number): number {
  return Math.round(monthlyAmount * SPONSOR_PAYOUT_MULTIPLIER);
}
