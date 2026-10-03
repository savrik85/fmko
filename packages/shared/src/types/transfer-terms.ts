/**
 * Podmínky trvalého přestupu mezi lidskými kluby: záloha, týdenní splátky a procenta
 * z příštího přestupu (spec 2026-10-03). Sdílené pro API i web, aby obě strany počítaly
 * zálohu, splátky i souhrn stejně.
 */

export const UPFRONT_PCT_MIN = 10;
export const INSTALLMENTS_MIN = 2;
export const INSTALLMENTS_MAX = 20;
export const SELL_ON_PCT_MAX = 50;
/** Nejnižší týdenní splátka. Menší nedává smysl, nejlevnější hráč má tržní cenu 500 Kč. */
export const INSTALLMENT_MIN_AMOUNT = 500;
export const SELL_ON_PCT_STEP = 5;
/** `seller_team_id` dohody, když se splácí cizímu klubu z trhu: peníze odcházejí mimo hru. */
export const CPU_CLUB_ID = "cpu";
/** Kolik splátkových přestupů může mít kupující najednou rozjetých. */
export const MAX_ACTIVE_INSTALLMENT_DEALS = 3;

export interface TransferTerms {
  /** Cena celkem. */
  amount: number;
  /** Záloha v procentech ceny; 100 = jednorázově. */
  upfrontPct: number;
  /** Počet týdenních splátek; 0 = jednorázově. */
  installments: number;
  /** Procenta z příštího přestupu pro prodávajícího. */
  sellOnPct: number;
}

export interface TransferSchedule {
  upfront: number;
  installmentAmount: number;
  /** Poslední splátka doplatí zbytek po zaokrouhlení. */
  lastInstallment: number;
  installments: number;
  remainingAfterUpfront: number;
}

/** Nejvyšší počet splátek, při kterém splátka neklesne pod minimum. 0 = na splátky to nejde. */
export function maxInstallmentsFor(amount: number, upfrontPct: number): number {
  const rest = amount - Math.round((amount * upfrontPct) / 100);
  const n = Math.min(INSTALLMENTS_MAX, Math.floor(rest / INSTALLMENT_MIN_AMOUNT));
  return n >= INSTALLMENTS_MIN ? n : 0;
}

/** Od jaké ceny jde při dané záloze platit na splátky (zaokrouhleno nahoru na stovky). */
export function minAmountForInstallments(upfrontPct: number): number {
  if (upfrontPct >= 100) return Number.POSITIVE_INFINITY;
  return Math.ceil((INSTALLMENTS_MIN * INSTALLMENT_MIN_AMOUNT) / (1 - upfrontPct / 100) / 100) * 100;
}

export function transferTermsError(t: TransferTerms): string | null {
  if (!Number.isInteger(t.upfrontPct) || t.upfrontPct < UPFRONT_PCT_MIN || t.upfrontPct > 100) {
    return `Záloha musí být ${UPFRONT_PCT_MIN}–100 %.`;
  }
  if (!Number.isInteger(t.installments) || (t.installments !== 0 && (t.installments < INSTALLMENTS_MIN || t.installments > INSTALLMENTS_MAX))) {
    return `Počet splátek musí být ${INSTALLMENTS_MIN}–${INSTALLMENTS_MAX}.`;
  }
  if ((t.upfrontPct < 100) !== (t.installments > 0)) {
    return "Na splátky jde jen záloha pod 100 % a se zálohou pod 100 % je potřeba počet splátek.";
  }
  if (t.installments > 0) {
    const max = maxInstallmentsFor(t.amount, t.upfrontPct);
    if (max === 0) return `Na splátky jde až od ceny ${minAmountForInstallments(t.upfrontPct).toLocaleString("cs-CZ")} Kč.`;
    if (t.installments > max) {
      return `Splátka musí být aspoň ${INSTALLMENT_MIN_AMOUNT} Kč. Při téhle ceně a záloze jde nejvýš ${max} splátek.`;
    }
  }
  if (!Number.isInteger(t.sellOnPct) || t.sellOnPct < 0 || t.sellOnPct > SELL_ON_PCT_MAX || t.sellOnPct % SELL_ON_PCT_STEP !== 0) {
    return `Procenta z dalšího prodeje musí být 0–${SELL_ON_PCT_MAX} % po ${SELL_ON_PCT_STEP} %.`;
  }
  return null;
}

export function transferSchedule(t: TransferTerms): TransferSchedule {
  if (t.installments === 0) {
    return { upfront: t.amount, installmentAmount: 0, lastInstallment: 0, installments: 0, remainingAfterUpfront: 0 };
  }
  const upfront = Math.round((t.amount * t.upfrontPct) / 100);
  const rest = t.amount - upfront;
  const installmentAmount = Math.floor(rest / t.installments);
  return {
    upfront,
    installmentAmount,
    lastInstallment: rest - installmentAmount * (t.installments - 1),
    installments: t.installments,
    remainingAfterUpfront: rest,
  };
}

export function sellOnShare(saleAmount: number, pct: number): number {
  return Math.round((saleAmount * pct) / 100);
}

const kc = (v: number) => v.toLocaleString("cs-CZ");

/** Jeden řádek do seznamů: „45 000 Kč · záloha 13 500 + 3× 10 500 · 15 % z dalšího prodeje". */
export function formatTermsSummary(t: TransferTerms): string {
  const s = transferSchedule(t);
  const parts = [`${kc(t.amount)} Kč`];
  if (t.installments > 0) parts.push(`záloha ${kc(s.upfront)} + ${s.installments}× ${kc(s.installmentAmount)}`);
  if (t.sellOnPct > 0) parts.push(`${t.sellOnPct} % z dalšího prodeje`);
  return parts.join(" · ");
}

/** Podmínky z řádku `transfer_offers` / `transfer_offer_events`; staré řádky = jednorázově. */
export function termsFromRow(
  row: { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null },
  amount: number,
): TransferTerms {
  return {
    amount,
    upfrontPct: row.upfront_pct ?? 100,
    installments: row.installments ?? 0,
    sellOnPct: row.sell_on_pct ?? 0,
  };
}
