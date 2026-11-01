/**
 * Hostování přes trh: popisky podmínky hraní, délky a stavu (API: transfers/loan-agreements.ts).
 */

export type LoanPlayingTime = "starter" | "regular" | "none";
export type LoanPlayingTimeState = "none" | "pending" | "ok" | "at_risk" | "breached";

export const LOAN_PLAYING_TIME_OPTIONS: Array<{ key: LoanPlayingTime; label: string; note: string }> = [
  { key: "starter", label: "Hraje v základu", note: "Začne aspoň ve 3 ze 4 ligových zápasů." },
  { key: "regular", label: "Pravidelně nastupuje", note: "Nastoupí aspoň v polovině ligových zápasů, klidně jako střídající." },
  { key: "none", label: "Bez podmínky", note: "Hrát nemusí, hlavně ať trénuje jinde." },
];

export const LOAN_PLAYING_TIME_LABEL: Record<LoanPlayingTime, string> = {
  starter: "Hraje v základu",
  regular: "Pravidelně nastupuje",
  none: "Bez podmínky",
};

export const LOAN_DURATIONS: Array<{ days: number; label: string }> = [
  { days: 14, label: "2 týdny" },
  { days: 30, label: "Měsíc" },
  { days: 60, label: "2 měsíce" },
  { days: 90, label: "3 měsíce" },
  { days: 180, label: "Půl roku" },
];

export function loanDurationLabel(days: number | null | undefined): string {
  if (!days) return "";
  return LOAN_DURATIONS.find((d) => d.days === days)?.label ?? `${days} dní`;
}

/** Podmínky inzerátu na jeden řádek: „2 měsíce · zdarma · hraje v základu“. */
export function loanTermsLine(l: { loanDays?: number | null; askingPrice: number; loanPlayingTime?: string | null }): string {
  const fee = l.askingPrice > 0 ? `${l.askingPrice.toLocaleString("cs-CZ")} Kč` : "zdarma";
  const pt = (l.loanPlayingTime ?? "none") as LoanPlayingTime;
  const condition = pt === "none" ? "bez podmínky" : LOAN_PLAYING_TIME_LABEL[pt].toLowerCase();
  return [loanDurationLabel(l.loanDays), fee, condition].filter(Boolean).join(" · ");
}

/** Stav podmínky hraní: popisek a barvy štítku (béžový design, čitelný kontrast). */
export const LOAN_STATE_STYLE: Record<LoanPlayingTimeState, { label: string; className: string }> = {
  none: { label: "Bez podmínky", className: "bg-gray-100 text-gray-700" },
  pending: { label: "Zatím se nehodnotí", className: "bg-gray-100 text-gray-700" },
  ok: { label: "Plní se", className: "bg-pitch-50 text-pitch-700" },
  at_risk: { label: "Hrozí porušení", className: "bg-amber-100 text-amber-800" },
  breached: { label: "Porušeno", className: "bg-red-100 text-red-800" },
};

/** Souhrn hostování z `GET /teams/:id/loans`. */
export interface LoanSummary {
  agreementId: string;
  playerId: string;
  playerName: string;
  age: number;
  position: string;
  rating: number | null;
  ratingChange: number | null;
  lenderTeamId: string;
  lenderName: string;
  borrowerTeamId: string;
  borrowerName: string;
  until: string;
  daysLeft: number;
  playingTime: LoanPlayingTime;
  playingTimeLabel: string;
  playingTimeState: LoanPlayingTimeState;
  playingTimeSummary: string;
  matches: number;
  starts: number;
  minutes: number;
  goals: number;
  avgRating: number | null;
}

export interface LoanOverview { lent: LoanSummary[]; borrowed: LoanSummary[] }

/** „za 3 dny“, „za 12 dní“. */
export function daysWord(n: number): string {
  if (n === 1) return "den";
  if (n >= 2 && n <= 4) return "dny";
  return "dní";
}

/** Názvy dovedností jako v kádru a na tréninku. */
export const SKILL_LABELS: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba", passing: "Přihrávky", heading: "Hlavičky",
  defense: "Obrana", stamina: "Výdrž", strength: "Síla", goalkeeping: "Brankář", vision: "Přehled",
  creativity: "Kreativita", setPieces: "Standardky", experience: "Zkušenost",
};

export interface LoanMatchLine {
  matchId: string; playedAt: string; opponentName: string; home: boolean;
  goalsFor: number | null; goalsAgainst: number | null;
  available: boolean; absenceReason: string | null;
  started: boolean; minutes: number; goals: number; assists: number; yellowCards: number; redCards: number; rating: number | null;
}

/** Podrobný přehled z `GET /teams/:id/loans/:agreementId`. */
export interface LoanReport extends LoanSummary {
  role: "lender" | "borrower";
  status: "active" | "ended" | "recalled" | "bought";
  fee: number;
  startedAt: string;
  playingTimeCheck: { eligible: number; fulfilled: number; required: number; state: LoanPlayingTimeState };
  matchLines: LoanMatchLine[];
  totals: { matches: number; starts: number; minutes: number; goals: number; assists: number; yellowCards: number; redCards: number; avgRating: number | null; missed: number };
  development: { sinceBaseline: boolean; startRating: number | null; skills: Array<{ key: string; before: number; now: number }> };
  training: { attended: number; total: number; gains: Array<{ key: string; change: number }> };
  now: { condition: number | null; mood: string; injuryDays: number | null; injury: string | null };
  avatar: Record<string, unknown>;
  recall: { allowed: boolean; refund: number; breached: boolean };
}

/** „3. 11.“ (den a měsíc, bez roku). */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}
