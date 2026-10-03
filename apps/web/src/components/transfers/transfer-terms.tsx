"use client";

/**
 * Podmínky trvalého přestupu: jednorázově nebo záloha + týdenní splátky, k tomu procenta
 * z příštího přestupu. Pole i rozpis jsou sdílené pro nabídku z profilu hráče i protinávrh
 * v jednání, aby obě strany viděly totéž: kolik se platí hned, kolik týdně a kolik celkem.
 */

import { useEffect } from "react";
import {
  UPFRONT_PCT_MIN, INSTALLMENTS_MIN, INSTALLMENTS_MAX, SELL_ON_PCT_MAX, SELL_ON_PCT_STEP, INSTALLMENT_MIN_AMOUNT,
  maxInstallmentsFor, minAmountForInstallments, transferSchedule, type TransferTerms,
} from "@okresni-masina/shared";

export type TermsValue = Omit<TransferTerms, "amount">;
/** card = bílá karta; light/dark = na barvě týmu (tmavé / bílé písmo). */
export type TermsVariant = "card" | "light" | "dark";

export const PLAIN_TERMS: TermsValue = { upfrontPct: 100, installments: 0, sellOnPct: 0 };
const DEFAULT_INSTALLMENT_TERMS = { upfrontPct: 30, installments: 4 };

const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;

const styles = {
  card: {
    label: "text-muted", text: "text-ink", sub: "text-muted",
    chip: "bg-gray-100 text-muted hover:bg-gray-200", chipOn: "bg-pitch-500 text-white",
    box: "bg-gray-50 border border-gray-100", accent: "accent-pitch-500",
  },
  light: {
    label: "text-gray-600", text: "text-gray-900", sub: "text-gray-600",
    chip: "bg-black/5 text-gray-600 hover:text-gray-800", chipOn: "bg-black/20 text-gray-900",
    box: "bg-black/5 border border-black/10", accent: "accent-gray-900",
  },
  dark: {
    label: "text-white/70", text: "text-white", sub: "text-white/70",
    chip: "bg-white/5 text-white/60 hover:text-white/90", chipOn: "bg-white/20 text-white",
    box: "bg-white/10 border border-white/15", accent: "accent-white",
  },
} as const;

export function TransferTermsFields({ amount, value, onChange, variant = "card", allowSellOn = true }: {
  amount: number | null;
  value: TermsValue;
  onChange: (value: TermsValue) => void;
  variant?: TermsVariant;
  /** Cizí klub z trhu hráče zpátky neprodá, procenta u něj nedávají smysl. */
  allowSellOn?: boolean;
}) {
  const s = styles[variant];
  const onInstallments = value.installments > 0;
  const total = amount ?? 0;
  const hasAmount = total > 0;
  const upfront = Math.round((total * value.upfrontPct) / 100);
  const plan = transferSchedule({ amount: total, ...value });
  // Počet splátek je omezený tak, aby splátka neklesla pod minimum (shodně se serverem).
  const maxN = hasAmount ? maxInstallmentsFor(total, value.upfrontPct) : 0;
  const installmentsPossible = hasAmount && maxInstallmentsFor(total, UPFRONT_PCT_MIN) > 0;

  // Cena nebo záloha se změnila a nastavených splátek je víc, než kolik cena unese: srovnat.
  // Když na splátky při téhle ceně vůbec nejde, vrátit jednorázovou platbu.
  useEffect(() => {
    if (!onInstallments || !hasAmount) return;
    if (maxN === 0) {
      if (installmentsPossible) onChange({ ...value, upfrontPct: UPFRONT_PCT_MIN, installments: maxInstallmentsFor(total, UPFRONT_PCT_MIN) });
      else onChange({ ...value, upfrontPct: 100, installments: 0 });
    } else if (value.installments > maxN) {
      onChange({ ...value, installments: maxN });
    }
  }, [onInstallments, hasAmount, maxN, installmentsPossible, total, value, onChange]);

  const startInstallments = () => {
    const up = DEFAULT_INSTALLMENT_TERMS.upfrontPct;
    const max = maxInstallmentsFor(total, up) || maxInstallmentsFor(total, UPFRONT_PCT_MIN);
    onChange({
      ...value,
      upfrontPct: maxInstallmentsFor(total, up) ? up : UPFRONT_PCT_MIN,
      installments: Math.min(DEFAULT_INSTALLMENT_TERMS.installments, max),
    });
  };

  if (!hasAmount) {
    return (
      <div className={`rounded-xl px-3 py-2.5 text-sm ${s.box}`}>
        <span className={`font-heading font-bold ${s.text}`}>Nejdřív zadej cenu.</span>{" "}
        <span className={s.sub}>Pak tu nastavíš, jestli se platí najednou, nebo na splátky{allowSellOn ? ", a procenta z příštího přestupu" : ""}.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className={`text-sm font-heading uppercase mb-1.5 ${s.label}`}>Platba</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange({ ...value, upfrontPct: 100, installments: 0 })}
            className={`px-4 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${!onInstallments ? s.chipOn : s.chip}`}>
            Jednorázově
          </button>
          <button type="button" onClick={startInstallments} disabled={!installmentsPossible}
            className={`px-4 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors disabled:opacity-40 ${onInstallments ? s.chipOn : s.chip}`}>
            Na splátky
          </button>
        </div>
        {!installmentsPossible && (
          <div className={`text-sm mt-1 ${s.sub}`}>
            Na splátky jde až od ceny {kc(minAmountForInstallments(UPFRONT_PCT_MIN))}, splátka musí být aspoň {kc(INSTALLMENT_MIN_AMOUNT)}.
          </div>
        )}
      </div>

      {onInstallments && maxN > 0 && (
        <>
          <label className="block">
            <span className={`flex justify-between text-sm ${s.label}`}>
              <span className="font-heading uppercase">Záloha</span>
              <span className={`font-heading font-bold tabular-nums ${s.text}`}>{value.upfrontPct} % · {kc(upfront)}</span>
            </span>
            <input type="range" min={UPFRONT_PCT_MIN} max={90} step={5} value={value.upfrontPct}
              onChange={(e) => onChange({ ...value, upfrontPct: Number(e.target.value) })}
              className={`w-full mt-1 ${s.accent}`} />
          </label>
          <label className="block">
            <span className={`flex justify-between text-sm ${s.label}`}>
              <span className="font-heading uppercase">Počet týdenních splátek</span>
              <span className={`font-heading font-bold tabular-nums ${s.text}`}>
                {value.installments}× po {kc(plan.installmentAmount)}
              </span>
            </span>
            <input type="range" min={INSTALLMENTS_MIN} max={Math.max(INSTALLMENTS_MIN, maxN)} step={1} value={value.installments}
              disabled={maxN <= INSTALLMENTS_MIN}
              onChange={(e) => onChange({ ...value, installments: Number(e.target.value) })}
              className={`w-full mt-1 ${s.accent}`} />
            {maxN < INSTALLMENTS_MAX && (
              <span className={`block text-sm mt-0.5 ${s.sub}`}>
                Při téhle ceně nejvýš {maxN} splátek, splátka musí být aspoň {kc(INSTALLMENT_MIN_AMOUNT)}.
              </span>
            )}
          </label>
          <div className={`rounded-xl px-3 py-2 text-sm tabular-nums ${s.box}`}>
            <span className={s.sub}>Celkem </span>
            <span className={`font-heading font-bold ${s.text}`}>{kc(total)}</span>
            <span className={s.sub}> = {kc(plan.upfront)} hned + {plan.installments}× {kc(plan.installmentAmount)}</span>
            <span className={`block ${s.sub}`}>Poslední splátka za {plan.installments} {plan.installments < 5 ? "týdny" : "týdnů"}.</span>
          </div>
        </>
      )}

      {allowSellOn && <label className="block">
        <span className={`flex justify-between text-sm ${s.label}`}>
          <span className="font-heading uppercase">Procenta z příštího přestupu</span>
          <span className={`font-heading font-bold tabular-nums ${s.text}`}>{value.sellOnPct > 0 ? `${value.sellOnPct} %` : "bez procent"}</span>
        </span>
        <input type="range" min={0} max={SELL_ON_PCT_MAX} step={SELL_ON_PCT_STEP} value={value.sellOnPct}
          onChange={(e) => onChange({ ...value, sellOnPct: Number(e.target.value) })}
          className={`w-full mt-1 ${s.accent}`} />
        <span className={`block text-sm mt-0.5 ${s.sub}`}>Až kupující hráče prodá dál, prodávající dostane tolik procent z ceny.</span>
      </label>}

      <TermsBreakdown terms={{ amount: total, ...value }} variant={variant} />
    </div>
  );
}

/** Rozpis: celkem, hned, kolikrát týdně a za kolik, procenta. `adminFee` platí kupující hned navíc. */
export function TermsBreakdown({ terms, adminFee = 0, variant = "card", sellOnFor }: {
  terms: TransferTerms;
  adminFee?: number;
  variant?: TermsVariant;
  /** Komu procenta půjdou, když je známý („Prodávající"). */
  sellOnFor?: string;
}) {
  const s = styles[variant];
  const plan = transferSchedule(terms);
  const rows: Array<[string, string]> = [["Cena celkem", kc(terms.amount)]];
  if (plan.installments > 0) {
    rows.push(["Hned (záloha " + terms.upfrontPct + " %)", kc(plan.upfront)]);
    rows.push([
      `Pak ${plan.installments}× každé pondělí`,
      plan.lastInstallment !== plan.installmentAmount
        ? `${kc(plan.installmentAmount)} (poslední ${kc(plan.lastInstallment)})`
        : kc(plan.installmentAmount),
    ]);
  }
  if (adminFee > 0) rows.push(["Administrační poplatek hned", kc(adminFee)]);
  if (plan.installments > 0 || adminFee > 0) rows.push(["Kupující zaplatí hned", kc(plan.upfront + adminFee)]);
  if (terms.sellOnPct > 0) {
    rows.push(["Z příštího přestupu", `${terms.sellOnPct} %${sellOnFor ? ` pro ${sellOnFor}` : ""}`]);
  }

  return (
    <dl className={`rounded-xl px-3 py-2 text-sm ${s.box}`}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-0.5">
          <dt className={s.sub}>{k}</dt>
          <dd className={`font-heading font-bold tabular-nums text-right ${s.text}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Krátký popis podmínek pro bubliny a seznamy; u jednorázové platby bez procent prázdný. */
export function termsNote(t: Pick<TransferTerms, "upfrontPct" | "installments" | "sellOnPct"> & { amount?: number }): string {
  const parts: string[] = [];
  if (t.installments > 0) {
    if (t.amount != null && t.amount > 0) {
      const plan = transferSchedule({ amount: t.amount, upfrontPct: t.upfrontPct, installments: t.installments, sellOnPct: t.sellOnPct });
      parts.push(`záloha ${kc(plan.upfront)} + ${plan.installments}× ${kc(plan.installmentAmount)} týdně`);
    } else {
      parts.push(`záloha ${t.upfrontPct} % + ${t.installments}× týdně`);
    }
  }
  if (t.sellOnPct > 0) parts.push(`${t.sellOnPct} % z příštího přestupu`);
  return parts.join(" · ");
}
