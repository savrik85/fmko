"use client";

/** Finanční widgety — rozpočet, prognóza, struktura příjmů a výdajů, sponzoři, občerstvení. */

import Link from "next/link";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import {
  LineChart, DonutChart, BarChart, HBarChart, StatTile, ChartEmpty, ChartHero,
  DIVERGING, PRIMARY, seriesColor, compact, compactCZK, fullCZK,
} from "../charts";
import type { WidgetProps } from "../types";
import { safeTeamColor, MoreLink } from "./shared";

// ── Rozpočet ────────────────────────────────────────────────────────────────

export function BudgetSummaryWidget({ data }: WidgetProps) {
  if (data.team.loading) return <WidgetSkeleton rows={2} />;
  const team = data.team.data;
  if (!team) return <WidgetError />;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Rozpočet</span>
        <span className="font-heading font-bold tabular-nums">{fullCZK(team.budget)}</span>
      </div>
      <Link href="/dashboard/finances" className="text-sm text-pitch-500 font-heading font-bold hover:underline block mt-2">
        Detail financí →
      </Link>
    </div>
  );
}

// ── Prognóza rozpočtu ───────────────────────────────────────────────────────

export function BudgetForecastWidget({ data }: WidgetProps) {
  if (data.budget.loading) return <WidgetSkeleton rows={4} />;
  if (data.budget.error) return <WidgetError />;
  const budget = data.budget.data;
  const series = budget?.forecast?.series ?? [];
  if (!budget || series.length < 2) return <ChartEmpty>Prognóza zatím nemá z čeho vycházet.</ChartEmpty>;

  const net = budget.weekly.net;
  const bankrupt = budget.forecast.weeksUntilBankrupt;

  return (
    <div className="space-y-3">
      <LineChart
        series={[{ label: "Rozpočet", points: series.map((p) => p.budget) }]}
        labels={series.map((p) => (p.week === 0 ? "dnes" : `${p.week}. týden`))}
        formatValue={compact}
        zeroBaseline
      />
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Týdenní bilance"
          value={`${net >= 0 ? "+" : ""}${compactCZK(net)}`}
          color={net >= 0 ? DIVERGING.positive : DIVERGING.negative}
        />
        <StatTile
          label="Za 4 týdny"
          value={compactCZK(budget.forecast.in4Weeks)}
          color={budget.forecast.in4Weeks >= 0 ? undefined : DIVERGING.negative}
        />
      </div>
      {bankrupt != null && (
        <div className="text-sm text-card-red text-center font-heading font-bold">
          Při téhle bilanci dojdou peníze za {bankrupt} týdnů.
        </div>
      )}
    </div>
  );
}

// ── Skutečný vývoj rozpočtu ─────────────────────────────────────────────────

export function BudgetHistoryWidget({ data }: WidgetProps) {
  if (data.transactions.loading) return <WidgetSkeleton rows={4} />;
  if (data.transactions.error) return <WidgetError />;
  const txns = data.transactions.data ?? [];
  if (txns.length < 2) return <ChartEmpty>Na graf je potřeba aspoň dva pohyby na účtu.</ChartEmpty>;

  // Endpoint vrací od nejnovější; graf potřebuje časovou osu odleva.
  const ordered = [...txns].reverse();

  return (
    <LineChart
      series={[{ label: "Zůstatek", points: ordered.map((t) => t.balanceAfter) }]}
      labels={ordered.map((t) => `${new Date(t.gameDate).toLocaleDateString("cs")} · ${t.description}`)}
      formatValue={compact}
      zeroBaseline
    />
  );
}

// ── Struktura příjmů a výdajů ───────────────────────────────────────────────

export function IncomeBreakdownWidget({ data }: WidgetProps) {
  if (data.budget.loading) return <WidgetSkeleton rows={4} />;
  if (data.budget.error) return <WidgetError />;
  const w = data.budget.data?.weekly;
  if (!w || w.income.total <= 0) return <ChartEmpty>Zatím žádné týdenní příjmy.</ChartEmpty>;

  return (
    <DonutChart
      slices={[
        { label: "Sponzoři", value: w.income.sponsors, color: seriesColor(0) },
        { label: "Základní sponzor", value: w.income.baseSponsor, color: seriesColor(1) },
        { label: "Dotace obce", value: w.income.subsidy, color: seriesColor(2) },
        { label: "Příspěvky hráčů", value: w.income.playerContributions, color: seriesColor(3) },
      ].filter((s) => s.value > 0)}
      centerValue={compactCZK(w.income.total)}
      centerLabel="týdně"
      formatValue={compactCZK}
    />
  );
}

export function ExpenseBreakdownWidget({ data }: WidgetProps) {
  if (data.budget.loading) return <WidgetSkeleton rows={4} />;
  if (data.budget.error) return <WidgetError />;
  const w = data.budget.data?.weekly;
  if (!w || w.expenses.total <= 0) return <ChartEmpty>Zatím žádné týdenní výdaje.</ChartEmpty>;

  return (
    <DonutChart
      slices={[
        { label: "Mzdy", value: w.expenses.wages, color: seriesColor(0) },
        { label: "Údržba", value: w.expenses.maintenance, color: seriesColor(1) },
        { label: "Vybavení", value: w.expenses.equipment, color: seriesColor(2) },
        { label: "Trénink", value: w.expenses.training, color: seriesColor(3) },
        { label: "Splátky půjčky", value: w.expenses.loanRepayment, color: seriesColor(4) },
      ].filter((s) => s.value > 0)}
      centerValue={compactCZK(w.expenses.total)}
      centerLabel="týdně"
      formatValue={compactCZK}
    />
  );
}

// ── Sponzoři ────────────────────────────────────────────────────────────────

export function SponsorsWidget({ data }: WidgetProps) {
  if (data.sponsors.loading) return <WidgetSkeleton />;
  if (data.sponsors.error) return <WidgetError />;
  const s = data.sponsors.data;
  const contracts = [s?.mainContract, s?.stadiumContract, ...(s?.bannerContracts ?? [])]
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (contracts.length === 0) return <ChartEmpty>Klub zatím nemá sponzora.</ChartEmpty>;

  const total = contracts.reduce((sum, c) => sum + (c.monthlyAmount ?? 0), 0);
  const categoryLabel = (cat: string) =>
    cat === "main" ? "hlavní" : cat === "stadium" ? "stadion" : "banner";

  return (
    <div className="space-y-3">
      <ChartHero value={compactCZK(total)} note="měsíčně od sponzorů" color={safeTeamColor(data.team.data)} />
      <HBarChart
        data={contracts.map((c) => ({
          label: `${c.sponsorName} · ${categoryLabel(c.category)}`,
          value: c.monthlyAmount ?? 0,
          display: compactCZK(c.monthlyAmount ?? 0),
        }))}
      />
      <MoreLink href="/dashboard/sponsors">Detail sponzorů →</MoreLink>
    </div>
  );
}

// ── Občerstvení ─────────────────────────────────────────────────────────────

export function ConcessionRevenueWidget({ data }: WidgetProps) {
  if (data.concessionSales.loading) return <WidgetSkeleton rows={4} />;
  if (data.concessionSales.error) return <WidgetError />;
  const sales = (data.concessionSales.data ?? []).slice(0, 10).reverse();
  if (sales.length === 0) return <ChartEmpty>Na stánku se zatím nic neprodalo.</ChartEmpty>;

  const totalProfit = sales.reduce((s, m) => s + (m.totalProfit ?? 0), 0);

  return (
    <div className="space-y-3">
      <BarChart
        categories={sales.map((m) => m.opponentName ?? "—")}
        series={[
          { label: "Tržba", color: PRIMARY, values: sales.map((m) => m.totalRevenue ?? 0) },
          { label: "Zisk", color: seriesColor(1), values: sales.map((m) => m.totalProfit ?? 0) },
        ]}
        formatValue={compactCZK}
      />
      <div className="text-sm text-muted text-center">
        Zisk za posledních {sales.length} zápasů{" "}
        <span className="font-heading font-bold text-ink tabular-nums">{fullCZK(totalProfit)}</span>
      </div>
      <MoreLink href="/dashboard/fans">Detail stánku →</MoreLink>
    </div>
  );
}
