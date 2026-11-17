"use client";

import { useState, useEffect, useMemo } from "react";
import { sponsorMonthlyPayout } from "@okresni-masina/shared";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { sponsorTypeIcon, sponsorTypeLabel } from "@/lib/sponsor-types";
import { SectionLabel, PositionBadge, Tabs, useTabParam, ListCard, ListRow, ListEmpty, RowIcon, RowValue, PageLoading, SectionLoading } from "@/components/ui";
import { TXN_ICONS, TXN_LABELS } from "@/lib/transaction-labels";
import { weeksText } from "@/lib/weeks-text";
import { formatKc } from "@/lib/format";

// ────────────────────────────────────────────────────────────────────────────
// Typy
// ────────────────────────────────────────────────────────────────────────────

interface WagePlayer { id: string; name: string; position: string; rating: number; weeklyWage: number }
interface Sponsor { name: string; type: string; monthlyAmount: number; weeklyAmount: number; winBonus: number }
interface Transaction { id: string; type: string; amount: number; balanceAfter: number; description: string; gameDate: string; createdAt: string }

interface ActiveLoan {
  id: string;
  principal: number;
  totalToRepay: number;
  remaining: number;
  totalInstallments: number;
  installmentsPaid: number;
  installmentsRemaining: number;
  perMatchInstallment: number;
}

interface BudgetData {
  budget: number;
  sponsors: Sponsor[];
  playerCount: number;
  wageBill: { weekly: number; topPlayers: WagePlayer[] };
  weekly: {
    income: { sponsors: number; baseSponsor: number; subsidy: number; playerContributions: number; transferInstallments?: number; total: number };
    expenses: { wages: number; staffWages?: number; maintenance: number; equipment: number; training: number; youthWages?: number; youthTraining?: number; loanRepayment: number; transferInstallments?: number; total: number };
    net: number;
    netWithLoan: number;
  };
  forecast: {
    weeklyNet: number;
    weeksUntilBankrupt: number | null;
    in4Weeks: number;
    inSeason: number;
    series?: { week: number; budget: number }[];
    /** Týdnů do posledního zápasu sezóny. */
    seasonWeeksLeft?: number;
    /** Ostatní pravidelné výdaje týdně (události, skaut, úkoly, poplatky soutěži, akademie). */
    otherRunningPerWeek?: number;
    /** Zápasové dny v prognóze: průměr posledních zápasů a kolik jich zbývá. */
    matchDays?: { perHome: number | null; perAway: number | null; homeSample: number; awaySample: number; homeLeft: number; awayLeft: number };
  };
  /** Účet posledního domácího zápasu (vstupné, bufet, tombola, výdaje…). */
  lastHomeMatch?: {
    opponent: string;
    attendance: number | null;
    lines: Array<{ label: string; amount: number; detail: string | null }>;
    wholesaleEstimate: number;
    total: number;
  } | null;
  loan: ActiveLoan | null;
  remainingMatches: number;
  purchaseBlocked: boolean;
}

interface LoanInfo {
  eligible: boolean;
  ineligibleReason: string | null;
  active: ActiveLoan | null;
  history: Array<ActiveLoan & { status: string; takenGameDate: string; paidOffAt: string | null }>;
  rules: { minPrincipal: number; maxPrincipal: number; interestRate: number };
  remainingMatches: number;
  currentBudget: number;
}

type Tab = "overview" | "flows" | "forecast" | "loan";
// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["overview", "flows", "forecast", "loan"] as const;
type TxnFilter = "all" | "income" | "expense";
type FlowSide = "income" | "expenses";

// ────────────────────────────────────────────────────────────────────────────
// Konstanty a formátování
// ────────────────────────────────────────────────────────────────────────────



function timeAgo(iso: string): string {
  if (!iso) return "";
  const utcIso = iso.endsWith("Z") || iso.includes("+") ? iso : iso.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(utcIso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "teď";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ────────────────────────────────────────────────────────────────────────────
// Hlavní stránka
// ────────────────────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<BudgetData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnFilter, setTxnFilter] = useState<TxnFilter>("all");
  const [txnTotal, setTxnTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [loanInfo, setLoanInfo] = useState<LoanInfo | null>(null);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<BudgetData>(`/api/teams/${teamId}/budget`),
      apiFetch<{ transactions: Transaction[]; total: number }>(`/api/teams/${teamId}/transactions?limit=50`),
    ]).then(([b, t]) => {
      setData(b);
      setTransactions(t.transactions);
      setTxnTotal(t.total);
      setLoading(false);
    }).catch((e) => { console.error("load budget:", e); setLoading(false); });
  }, [teamId]);

  const loadTransactions = (filter: TxnFilter) => {
    if (!teamId) return;
    setTxnFilter(filter);
    const params = filter === "all" ? "" : `&direction=${filter}`;
    apiFetch<{ transactions: Transaction[]; total: number }>(`/api/teams/${teamId}/transactions?limit=50${params}`)
      .then((t) => { setTransactions(t.transactions); setTxnTotal(t.total); })
      .catch((e) => console.error("load transactions:", e));
  };

  const loadLoanInfo = () => {
    if (!teamId) return;
    apiFetch<LoanInfo>(`/api/teams/${teamId}/cash-loans`)
      .then((li) => setLoanInfo(li))
      .catch((e) => console.error("load loan info:", e));
  };

  const refreshAll = () => {
    if (!teamId) return;
    apiFetch<BudgetData>(`/api/teams/${teamId}/budget`)
      .then((b) => setData(b))
      .catch((e) => console.error("reload budget:", e));
    loadLoanInfo();
    loadTransactions(txnFilter);
  };

  if (loading) return <PageLoading />;
  if (!data) return <div className="page-container">Data nenalezena.</div>;

  const tabs: [Tab, string, string][] = [
    ["overview", "Přehled", "📊"],
    ["flows", "Pohyby", "💸"],
    ["forecast", "Prognóza", "🔮"],
    ["loan", data.loan ? "Půjčka •" : "Půjčka", "💳"],
  ];

  return (
    <div className="page-container space-y-5">

      {/* Hlavička: rozpočet vždy viditelný */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-micro text-muted uppercase tracking-wide">Aktuální rozpočet</div>
            <div className={`font-heading font-[800] text-3xl sm:text-4xl tabular-nums ${data.budget < 0 ? "text-card-red" : "text-ink"}`}>
              {formatKc(data.budget)}
            </div>
          </div>
          {data.purchaseBlocked && (
            <div className="bg-red-50 border border-red-200 rounded-soft px-3 py-2 text-xs text-card-red max-w-sm">
              <div className="font-heading font-bold mb-0.5">⛔ Nákupy blokovány</div>
              <div>Dokud rozpočet nevyrovnáš na nulu, nelze utrácet za přestupy, upgrady ani inzeráty.</div>
            </div>
          )}
          {data.loan && !data.purchaseBlocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-soft px-3 py-2 text-xs text-amber-900">
              <div className="font-heading font-bold">Aktivní půjčka</div>
              <div>Zbývá {formatKc(data.loan.remaining)} • {data.loan.installmentsRemaining} splátek</div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar — 4 taby, plně na šířku i na mobilu */}
      <Tabs
        value={tab}
        onChange={(k) => { setTab(k); if (k === "loan") loadLoanInfo(); }}
        ariaLabel="Finance"
        items={tabs.map(([key, label, icon]) => ({ key, label, icon }))}
      />

      {tab === "overview" && (
        <OverviewTab
          data={data}
          transactions={transactions}
          txnTotal={txnTotal}
          txnFilter={txnFilter}
          onFilter={loadTransactions}
        />
      )}
      {tab === "flows" && <FlowsTab data={data} />}
      {tab === "forecast" && <ForecastTab data={data} />}
      {tab === "loan" && <LoanTab teamId={teamId!} data={data} info={loanInfo} onChange={refreshAll} reload={loadLoanInfo} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Přehled
// ────────────────────────────────────────────────────────────────────────────

function OverviewTab({ data, transactions, txnTotal, txnFilter, onFilter }: {
  data: BudgetData;
  transactions: Transaction[];
  txnTotal: number;
  txnFilter: TxnFilter;
  onFilter: (f: TxnFilter) => void;
}) {
  const isPositive = data.weekly.netWithLoan >= 0;
  const topInc = topIncomeItems(data);
  const topExp = topExpenseItems(data);
  return (
    <div className="space-y-5">
      {/* Dve karty na radek na mobilu: pri trech se do 110 px nevesla ani
          castka („+7 275" / „Kč" na dva radky) ani popisek. Bilance je
          nejdulezitejsi, takze dostane cely druhy radek. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <MetricCard label="Příjmy / týd" value={`+${formatKc(data.weekly.income.total + (data.weekly.income.transferInstallments ?? 0))}`} color="text-pitch-500" />
        <MetricCard
          label="Výdaje / týd"
          value={`−${formatKc(data.weekly.expenses.total + data.weekly.expenses.loanRepayment + (data.weekly.expenses.transferInstallments ?? 0))}`}
          color="text-card-red"
        />
        <MetricCard
          label="Bilance"
          value={`${isPositive ? "+" : ""}${formatKc(data.weekly.netWithLoan)}`}
          color={isPositive ? "text-pitch-500" : "text-card-red"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-4 sm:p-5">
          <SectionLabel>Tři největší příjmy / týden</SectionLabel>
          <div className="mt-2 space-y-2">
            {topInc.map((it) => (
              <BarRow key={it.label} label={it.label} amount={it.amount} max={topInc[0]?.amount ?? 1} positive />
            ))}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <SectionLabel>Tři největší výdaje / týden</SectionLabel>
          <div className="mt-2 space-y-2">
            {topExp.map((it) => (
              <BarRow key={it.label} label={it.label} amount={it.amount} max={topExp[0]?.amount ?? 1} />
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Rychlý pohled na sezónu</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <StatBox label="Zbývá zápasů" value={String(data.remainingMatches)} />
          <StatBox label="Za 4 týdny" value={formatKc(data.forecast.in4Weeks)} colorRed={data.forecast.in4Weeks < 0} />
          <StatBox label="Na konci sezóny" value={formatKc(data.forecast.inSeason)} colorRed={data.forecast.inSeason < 0} />
          {/* Bankrot ve hře není: v mínusu se jen zablokují nákupy a investice. */}
          <StatBox
            label="Peníze dojdou"
            value={data.forecast.weeksUntilBankrupt != null ? `za ${weeksText(data.forecast.weeksUntilBankrupt)}` : "nehrozí"}
            sub={data.forecast.weeksUntilBankrupt != null ? "pak se zablokují nákupy" : undefined}
            colorRed={data.forecast.weeksUntilBankrupt != null}
          />
        </div>
      </div>

      {data.lastHomeMatch && <LastHomeMatchCard account={data.lastHomeMatch} />}

      <HistorySection
        transactions={transactions}
        total={txnTotal}
        filter={txnFilter}
        onFilter={onFilter}
      />
    </div>
  );
}

function topIncomeItems(d: BudgetData) {
  const items = [
    { label: "Sponzoři", amount: d.weekly.income.sponsors + d.weekly.income.baseSponsor },
    { label: "Dotace obce", amount: d.weekly.income.subsidy },
    { label: "Členské příspěvky", amount: d.weekly.income.playerContributions },
    { label: "Splátky za prodané hráče", amount: d.weekly.income.transferInstallments ?? 0 },
  ];
  return items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
}

function topExpenseItems(d: BudgetData) {
  const items = [
    { label: "Mzdy hráčů", amount: d.weekly.expenses.wages },
    ...((d.weekly.expenses.staffWages ?? 0) > 0 ? [{ label: "Mzdy zaměstnanců", amount: d.weekly.expenses.staffWages ?? 0 }] : []),
    { label: "Údržba hřiště", amount: d.weekly.expenses.maintenance },
    { label: "Tréninky", amount: d.weekly.expenses.training },
    ...((d.weekly.expenses.youthWages ?? 0) > 0 ? [{ label: "Mzdy dorostu (U21)", amount: d.weekly.expenses.youthWages ?? 0 }] : []),
    ...((d.weekly.expenses.youthTraining ?? 0) > 0 ? [{ label: "Tréninky dorostu (U21)", amount: d.weekly.expenses.youthTraining ?? 0 }] : []),
    { label: "Vybavení", amount: d.weekly.expenses.equipment },
    ...(d.weekly.expenses.loanRepayment > 0 ? [{ label: "Splátka půjčky (odhad/týd)", amount: d.weekly.expenses.loanRepayment }] : []),
    { label: "Splátky za koupené hráče", amount: d.weekly.expenses.transferInstallments ?? 0 },
  ];
  return items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Pohyby (Příjmy + Výdaje v jednom přepínači)
// ────────────────────────────────────────────────────────────────────────────

function FlowsTab({ data }: { data: BudgetData }) {
  const [side, setSide] = useState<FlowSide>("income");
  const totalExpWithLoan = data.weekly.expenses.total + data.weekly.expenses.loanRepayment + (data.weekly.expenses.transferInstallments ?? 0);
  const totalIncome = data.weekly.income.total + (data.weekly.income.transferInstallments ?? 0);
  return (
    <div className="space-y-5">
      {/* Segmented control */}
      <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1">
        <button
          onClick={() => setSide("income")}
          className={`py-2 text-sm font-heading font-bold rounded-soft transition-colors ${
            side === "income" ? "bg-white text-pitch-600 shadow-sm" : "text-muted"
          }`}
        >
          💰 Příjmy <span className="tabular-nums">+{formatKc(data.weekly.income.total)}</span>
        </button>
        <button
          onClick={() => setSide("expenses")}
          className={`py-2 text-sm font-heading font-bold rounded-soft transition-colors ${
            side === "expenses" ? "bg-white text-pitch-600 shadow-sm" : "text-muted"
          }`}
        >
          💸 Výdaje <span className="tabular-nums">−{formatKc(totalExpWithLoan)}</span>
        </button>
      </div>

      {side === "income" ? (
        <>
          <div className="card p-4 sm:p-5">
            <div className="flex justify-between items-baseline mb-3">
              <SectionLabel>Struktura příjmů / týden</SectionLabel>
              <span className="font-heading font-bold text-pitch-500 tabular-nums">+{formatKc(totalIncome)}</span>
            </div>
            <div className="space-y-2.5">
              <BarRow label="Sponzorské smlouvy" amount={data.weekly.income.sponsors} max={totalIncome} positive icon="💰" />
              <BarRow label="Místní podpora (reputace)" amount={data.weekly.income.baseSponsor} max={totalIncome} positive icon="🏪" />
              <BarRow label="Dotace od obce" amount={data.weekly.income.subsidy} max={totalIncome} positive icon="🏛" />
              <BarRow label="Členské příspěvky" amount={data.weekly.income.playerContributions} max={totalIncome} positive icon="👥" />
              {(data.weekly.income.transferInstallments ?? 0) > 0 && (
                <BarRow label="Splátky za prodané hráče" amount={data.weekly.income.transferInstallments ?? 0} max={totalIncome} positive icon="🤝" />
              )}
            </div>
          </div>

          {data.sponsors.length === 0 && (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Sponzorské smlouvy</SectionLabel>
              <p className="mt-2 text-sm text-muted">
                Žádná podepsaná smlouva, ze sponzorů teď nekape nic. Nabídky najdeš na stránce{" "}
                <a href="/sponzori" className="font-heading font-bold text-ink underline">Sponzoři</a>.
              </p>
            </div>
          )}
          {data.sponsors.length > 0 && (
            <ListCard title="Sponzorské smlouvy" count={data.sponsors.length}>
              {data.sponsors.map((s, i) => (
                <ListRow key={i}
                  leading={<RowIcon>{sponsorTypeIcon(s.type)}</RowIcon>}
                  title={s.name}
                  meta={`${sponsorTypeLabel(s.type)}${s.winBonus > 0 ? ` · bonus za výhru ${formatKc(s.winBonus)}` : ""}`}
                  trailing={<RowValue tone="plus" sub={`${formatKc(sponsorMonthlyPayout(s.monthlyAmount))}/měs`}>{formatKc(s.weeklyAmount)}/týd</RowValue>} />
              ))}
            </ListCard>
          )}

          <div className="card p-4 sm:p-5">
            <SectionLabel>Nepravidelné příjmy</SectionLabel>
            <div className="mt-2 text-sm text-muted space-y-1">
              <div>• <span className="font-heading font-bold text-ink">Vstupné</span>, domácí zápasy podle návštěvy a ceny.</div>
              <div>• <span className="font-heading font-bold text-ink">Bufet</span>, buď vlastní tržby, nebo pronájem externímu provozovateli.</div>
              <div>• <span className="font-heading font-bold text-ink">Bonusy za výsledky</span>, výhra/remíza, sponzorské win-bonusy.</div>
              <div>• <span className="font-heading font-bold text-ink">Přestupy</span>, prodej hráčů, jednorázové příjmy.</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card p-4 sm:p-5">
            <div className="flex justify-between items-baseline mb-3">
              <SectionLabel>Struktura výdajů / týden</SectionLabel>
              <span className="font-heading font-bold text-card-red tabular-nums">−{formatKc(totalExpWithLoan)}</span>
            </div>
            <div className="space-y-2.5">
              <BarRow label="Mzdy hráčů" amount={data.weekly.expenses.wages} max={totalExpWithLoan} icon="💸" />
              <BarRow label="Tréninky" amount={data.weekly.expenses.training} max={totalExpWithLoan} icon="🏋" />
              {(data.weekly.expenses.youthWages ?? 0) > 0 && (
                <BarRow label="Mzdy dorostu (U21)" amount={data.weekly.expenses.youthWages ?? 0} max={totalExpWithLoan} icon="🧒" />
              )}
              {(data.weekly.expenses.youthTraining ?? 0) > 0 && (
                <BarRow label="Tréninky dorostu (U21)" amount={data.weekly.expenses.youthTraining ?? 0} max={totalExpWithLoan} icon="🏃" />
              )}
              <BarRow label="Údržba hřiště" amount={data.weekly.expenses.maintenance} max={totalExpWithLoan} icon="🌿" />
              <BarRow label="Vybavení" amount={data.weekly.expenses.equipment} max={totalExpWithLoan} icon="👟" />
              {data.weekly.expenses.loanRepayment > 0 && (
                <BarRow label="Splátka půjčky (odhad)" amount={data.weekly.expenses.loanRepayment} max={totalExpWithLoan} icon="💳" />
              )}
              {(data.weekly.expenses.transferInstallments ?? 0) > 0 && (
                <BarRow label="Splátky za koupené hráče" amount={data.weekly.expenses.transferInstallments ?? 0} max={totalExpWithLoan} icon="🤝" />
              )}
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <SectionLabel>Mzdový rozpočet ({data.playerCount} hráčů)</SectionLabel>
            <div className="bg-gray-50 rounded-soft py-3 text-center my-3">
              <div className="font-heading font-bold text-2xl tabular-nums">{formatKc(data.wageBill.weekly)}</div>
              <div className="text-micro text-muted uppercase tracking-wide">týdně</div>
            </div>
            {data.wageBill.topPlayers.length > 0 && (
              <>
                <div className="text-micro text-muted uppercase mb-2">Nejlépe placení</div>
                <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-line-soft">
                  {data.wageBill.topPlayers.map((p) => (
                    <ListRow key={p.id} href={`/hrac/${p.id}`}
                      title={p.name}
                      meta={<PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />}
                      trailing={<RowValue>{formatKc(p.weeklyWage)}/t</RowValue>} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card p-4 sm:p-5">
            <SectionLabel>Nepravidelné výdaje</SectionLabel>
            <div className="mt-2 text-sm text-muted space-y-1">
              <div>• <span className="font-heading font-bold text-ink">Zápasové náklady</span>, rozhodčí, cestovné, občerstvení po zápase.</div>
              <div>• <span className="font-heading font-bold text-ink">Přestupy</span>, přestupové ceny, registrace, hostování.</div>
              <div>• <span className="font-heading font-bold text-ink">Upgrady</span>, stadion, hřiště, vybavení, propagace zápasu.</div>
              <div>• <span className="font-heading font-bold text-ink">Inzeráty</span>, hledání volných hráčů.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Prognóza
// ────────────────────────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: BudgetData }) {
  // Použijeme přesnou sérii z BE (zahrnuje dynamické splátky půjčky podle kalendáře).
  // Fallback: lineární aproximace pokud BE ještě neposílá series.
  const points = useMemo(() => {
    if (data.forecast.series && data.forecast.series.length > 0) {
      return data.forecast.series.map((p) => ({ week: p.week, value: p.budget }));
    }
    const pts: { week: number; value: number }[] = [];
    for (let w = 0; w <= 16; w++) {
      pts.push({ week: w, value: data.budget + data.forecast.weeklyNet * w });
    }
    return pts;
  }, [data.forecast.series, data.budget, data.forecast.weeklyNet]);

  const values = points.map((p) => p.value);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = Math.max(1, maxV - minV);
  const zeroRatio = (0 - minV) / range;

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Vývoj rozpočtu do konce sezóny</SectionLabel>
        <div className="mt-4 relative h-44 bg-gradient-to-b from-gray-50 to-white rounded-soft overflow-hidden">
          {(() => {
            const W = 100;
            const H = 100;
            const len = points.length;
            const stepX = len > 1 ? W / (len - 1) : 0;
            const toY = (v: number) => ((maxV - v) / range) * H;
            const zeroY = toY(0);
            const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(" ");
            const lastX = (len > 0 ? (len - 1) * stepX : 0).toFixed(2);
            const fillPath = `${linePath} L ${lastX} ${H} L 0 ${H} Z`;
            return (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                <defs>
                  <linearGradient id="fc-pos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="fc-neg" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="fc-above-zero" clipPathUnits="userSpaceOnUse">
                    <rect x="0" y="0" width={W} height={Math.max(0, zeroY)} />
                  </clipPath>
                  <clipPath id="fc-below-zero" clipPathUnits="userSpaceOnUse">
                    <rect x="0" y={Math.max(0, zeroY)} width={W} height={Math.max(0, H - zeroY)} />
                  </clipPath>
                </defs>
                {zeroY < H && (
                  <rect x="0" y={zeroY} width={W} height={H - zeroY} fill="#dc2626" fillOpacity="0.05" />
                )}
                <path d={fillPath} fill="url(#fc-pos)" clipPath="url(#fc-above-zero)" />
                <path d={fillPath} fill="url(#fc-neg)" clipPath="url(#fc-below-zero)" />
                <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#9ca3af" strokeWidth="0.5" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
                <path d={linePath} fill="none" stroke="#15803d" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={(i * stepX).toFixed(2)} cy={toY(p.value).toFixed(2)} r="1.2" fill="#15803d" vectorEffect="non-scaling-stroke" />
                    <circle cx={(i * stepX).toFixed(2)} cy={toY(p.value).toFixed(2)} r="3" fill="transparent">
                      <title>{`Týden ${p.week}: ${formatKc(p.value)}`}</title>
                    </circle>
                  </g>
                ))}
              </svg>
            );
          })()}
          <span
            className="absolute right-1 text-micro text-muted tabular-nums bg-white/80 px-1 pointer-events-none"
            style={{ bottom: `${zeroRatio * 100}%`, transform: "translateY(50%)" }}
          >
            0
          </span>
        </div>
        <div className="flex justify-between text-micro text-muted mt-1 px-2">
          <span>dnes</span>
          <span>{Math.round((points.length - 1) / 2)} týd</span>
          <span>{(data.forecast.seasonWeeksLeft ?? 0) > 0 ? "konec sezóny" : `${points.length - 1} týd`}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Za 4 týdny" value={formatKc(data.forecast.in4Weeks)} color={data.forecast.in4Weeks < 0 ? "text-card-red" : "text-ink"} />
        <MetricCard label="Na konci sezóny" value={formatKc(data.forecast.inSeason)} color={data.forecast.inSeason < 0 ? "text-card-red" : "text-ink"} />
        <MetricCard
          label="Peníze dojdou"
          value={data.forecast.weeksUntilBankrupt != null ? `za ${weeksText(data.forecast.weeksUntilBankrupt)}` : "nehrozí"}
          color={data.forecast.weeksUntilBankrupt != null ? "text-card-red" : "text-muted"}
          sub={data.forecast.weeksUntilBankrupt != null ? "rozpočet spadne do mínusu" : "stabilní hospodaření"}
        />
      </div>

      {data.forecast.weeksUntilBankrupt != null && (
        <p className="text-sm text-muted leading-snug">
          Klub v mínusu nekončí. Mzdy a provoz se platí dál, ale dokud rozpočet nevyrovnáš,
          zablokují se nákupy a investice: přestupy, stavby, vybavení i inzeráty.
        </p>
      )}

      <div className="card p-4 sm:p-5">
        <SectionLabel>Předpoklady výpočtu</SectionLabel>
        <ul className="mt-2 text-sm text-muted space-y-1">
          <li>• Týdenní bilance <span className="font-heading font-bold text-ink tabular-nums">{data.weekly.net >= 0 ? "+" : ""}{formatKc(data.weekly.net)}</span> (bez půjčky)</li>
          {data.loan && (
            <li>• Splátka <span className="font-heading font-bold text-ink tabular-nums">{formatKc(data.loan.perMatchInstallment)}</span> × {data.loan.installmentsRemaining} zápasů = {formatKc(data.loan.remaining)} do doplacení</li>
          )}
          {data.forecast.matchDays && (data.forecast.matchDays.homeLeft + data.forecast.matchDays.awayLeft) > 0 && (
            <li>
              • Zápasové dny (vstupné, bufet, tombola, výdaje, autobus) podle posledních zápasů: doma{" "}
              <span className="font-heading font-bold text-ink tabular-nums">{data.forecast.matchDays.perHome == null ? "zatím bez údajů" : `${data.forecast.matchDays.perHome >= 0 ? "+" : ""}${formatKc(data.forecast.matchDays.perHome)}`}</span>
              {" "}× {data.forecast.matchDays.homeLeft}, venku{" "}
              <span className="font-heading font-bold text-ink tabular-nums">{data.forecast.matchDays.perAway == null ? "zatím bez údajů" : `${data.forecast.matchDays.perAway >= 0 ? "+" : ""}${formatKc(data.forecast.matchDays.perAway)}`}</span>
              {" "}× {data.forecast.matchDays.awayLeft}
            </li>
          )}
          {(data.forecast.otherRunningPerWeek ?? 0) !== 0 && (
            <li>
              • Ostatní pravidelné výdaje (události, skaut, úkoly zaměstnanců, poplatky soutěži, akademie) podle posledních 4 týdnů:{" "}
              <span className="font-heading font-bold text-ink tabular-nums">{formatKc(data.forecast.otherRunningPerWeek ?? 0)}</span> týdně
            </li>
          )}
          <li>• Bez přestupů, odměn za umístění a sázek</li>
          <li>• Bez jednorázových nákupů (upgrady, inzeráty, registrace)</li>
          <li>• Zbývá zápasových dní v sezóně: <span className="font-heading font-bold text-ink tabular-nums">{data.remainingMatches}</span></li>
        </ul>
      </div>
    </div>
  );
}

/** Kolik vynesl poslední domácí zápas: položky z účetnictví zápasu a odhad zboží do bufetu. */
function LastHomeMatchCard({ account }: { account: NonNullable<BudgetData["lastHomeMatch"]> }) {
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Poslední domácí zápas{account.opponent ? ` proti ${account.opponent}` : ""}</SectionLabel>
      {account.attendance != null && <div className="text-xs text-muted mt-0.5">Diváků: {account.attendance}</div>}
      <div className="mt-3 space-y-1.5">
        {account.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-heading font-bold text-ink">{l.label}</span>
              {l.detail && <span className="block text-micro text-muted truncate">{l.detail}</span>}
            </span>
            <span className={`tabular-nums font-heading font-bold shrink-0 ${l.amount >= 0 ? "text-pitch-600" : "text-card-red"}`}>
              {l.amount >= 0 ? "+" : ""}{formatKc(l.amount)}
            </span>
          </div>
        ))}
        {account.wholesaleEstimate !== 0 && (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-heading font-bold text-ink">Zboží do bufetu</span>
              <span className="block text-micro text-muted">odhad: nákupy za 4 týdny rozpočtené na domácí zápasy</span>
            </span>
            <span className="tabular-nums font-heading font-bold shrink-0 text-card-red">{formatKc(account.wholesaleEstimate)}</span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 flex items-baseline justify-between">
        <span className="font-heading font-bold text-sm">Zápas vynesl</span>
        <span className={`tabular-nums font-heading font-[800] text-lg ${account.total >= 0 ? "text-pitch-600" : "text-card-red"}`}>
          {account.total >= 0 ? "+" : ""}{formatKc(account.total)}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Půjčka
// ────────────────────────────────────────────────────────────────────────────

function LoanTab({ teamId, data, info, onChange, reload }: {
  teamId: string;
  data: BudgetData;
  info: LoanInfo | null;
  onChange: () => void;
  reload: () => void;
}) {
  const [amount, setAmount] = useState(10_000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (info) {
      // Po načtení nastavíme default na polovinu rozsahu
      setAmount(Math.min(info.rules.maxPrincipal, Math.max(info.rules.minPrincipal, 10_000)));
    }
  }, [info?.rules.minPrincipal, info?.rules.maxPrincipal]);

  if (!info) {
    return <div className="card"><SectionLoading /></div>;
  }

  const take = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch<{ ok: boolean; loan: ActiveLoan }>(
        `/api/teams/${teamId}/cash-loans`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) },
      );
      setSuccess(`Půjčka vzata: ${formatKc(res.loan.principal)}. Splácej ${formatKc(res.loan.perMatchInstallment)} za každý zápas.`);
      onChange();
    } catch (e: any) {
      setError(e?.message ?? "Půjčku se nepodařilo vzít.");
    } finally {
      setSubmitting(false);
    }
  };

  const interestAmount = Math.round(amount * info.rules.interestRate);
  const totalRepay = amount + interestAmount;
  const perMatch = info.remainingMatches > 0 ? Math.ceil(totalRepay / info.remainingMatches) : 0;

  return (
    <div className="space-y-5">
      {/* Pravidla */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak půjčka funguje</SectionLabel>
        <ul className="mt-2 text-sm space-y-1.5">
          <li>💰 Výše: <span className="font-heading font-bold">{formatKc(info.rules.minPrincipal)}</span> až <span className="font-heading font-bold">{formatKc(info.rules.maxPrincipal)}</span></li>
          <li>📈 Úrok: <span className="font-heading font-bold">{Math.round(info.rules.interestRate * 100)} %</span> z půjčené částky</li>
          <li>📅 Splátky: rovnoměrně po každém zápase až do konce sezóny</li>
          <li>🚫 Najednou pouze jedna aktivní půjčka</li>
          <li>🔁 Půjčku lze vzít jednou za sezónu</li>
          <li>⛔ Při záporném rozpočtu nelze nic kupovat, dokud nevyrovnáš</li>
        </ul>
      </div>

      {/* Aktivní půjčka */}
      {data.loan && (
        <div className="card p-4 sm:p-5 bg-amber-50/50 border border-amber-200">
          <SectionLabel>Aktivní půjčka</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <StatBox label="Půjčeno" value={formatKc(data.loan.principal)} />
            <StatBox label="K doplacení" value={formatKc(data.loan.remaining)} colorRed />
            <StatBox label="Splátka / zápas" value={formatKc(data.loan.perMatchInstallment)} />
            <StatBox label="Splátek zbývá" value={`${data.loan.installmentsRemaining} / ${data.loan.totalInstallments}`} />
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-micro text-muted mb-1">
              <span>Splaceno {formatKc(data.loan.totalToRepay - data.loan.remaining)}</span>
              <span>{Math.round(((data.loan.totalToRepay - data.loan.remaining) / data.loan.totalToRepay) * 100)} %</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-pitch-500 transition-all"
                style={{ width: `${((data.loan.totalToRepay - data.loan.remaining) / data.loan.totalToRepay) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Formulář pro vzetí půjčky */}
      {info.eligible ? (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Vzít novou půjčku</SectionLabel>
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-sm font-heading font-bold">Částka</span>
                <span className="text-xl font-heading font-bold tabular-nums">{formatKc(amount)}</span>
              </div>
              <input
                type="range"
                min={info.rules.minPrincipal}
                max={info.rules.maxPrincipal}
                step={500}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full accent-pitch-500"
              />
              <div className="flex justify-between text-micro text-muted mt-1">
                <span>{formatKc(info.rules.minPrincipal)}</span>
                <span>{formatKc(info.rules.maxPrincipal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
              <StatBox label="Půjčíš si" value={formatKc(amount)} />
              <StatBox label={`Úrok (${Math.round(info.rules.interestRate * 100)} %)`} value={formatKc(interestAmount)} colorRed />
              <StatBox label="Splatíš celkem" value={formatKc(totalRepay)} />
              <StatBox label="Splátka / zápas" value={formatKc(perMatch)} sub={`${info.remainingMatches} splátek`} />
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-soft p-3 text-sm text-card-red">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 rounded-soft p-3 text-sm text-pitch-600">{success}</div>}

            <button
              onClick={take}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-pitch-500 hover:bg-pitch-600 text-white font-heading font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? "Zpracovávám..." : `Vzít půjčku ${formatKc(amount)}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-4 sm:p-5 bg-gray-50">
          <SectionLabel>Novou půjčku zatím nelze vzít</SectionLabel>
          <div className="mt-2 text-sm text-muted">{info.ineligibleReason ?? "Není splněna podmínka."}</div>
        </div>
      )}

      {/* Historie půjček */}
      {info.history.length > 0 && (
        <ListCard title="Historie půjček">
          {/* Data jdou pod částku celá: v jednom řádku vedle zůstatku by se datum splacení uřízlo. */}
          {info.history.map((h) => (
            <ListRow key={h.id}
              title={`${formatKc(h.principal)} → ${formatKc(h.totalToRepay)}`}
              detail={
                <span className="text-muted">
                  Vzato: {h.takenGameDate.slice(0, 10)} · {h.status === "active" ? "Aktivní" : h.status === "paid" ? `Splaceno ${h.paidOffAt?.slice(0, 10) ?? ""}` : h.status}
                </span>
              }
              trailing={h.status === "active" ? (
                <span className="text-meta text-amber-700 font-heading font-bold tabular-nums whitespace-nowrap">Zbývá {formatKc(h.remaining)}</span>
              ) : (
                <span className="text-meta text-muted tabular-nums whitespace-nowrap">{h.installmentsPaid} splátek</span>
              )} />
          ))}
        </ListCard>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Historie transakcí
// ────────────────────────────────────────────────────────────────────────────

function HistorySection({ transactions, total, filter, onFilter }: {
  transactions: Transaction[];
  total: number;
  filter: TxnFilter;
  onFilter: (f: TxnFilter) => void;
}) {
  return (
    <ListCard title="Historie transakcí" count={total}
      controls={
        <div className="flex gap-1">
          {(["all", "income", "expense"] as TxnFilter[]).map((f) => (
            <button key={f} onClick={() => onFilter(f)}
              className={`text-meta px-2.5 py-1 rounded-full font-bold transition-colors ${
                filter === f ? "bg-ink text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
              }`}>
              {f === "all" ? "Vše" : f === "income" ? "Příjmy" : "Výdaje"}
            </button>
          ))}
        </div>
      }>
      {transactions.length === 0 && (
        <ListEmpty icon="🧾">
          {filter === "all" ? "Na účtu se zatím nic nepohnulo. První pohyby přijdou po domácím zápase a výplatě." : "Tomuhle filtru žádný pohyb neodpovídá."}
        </ListEmpty>
      )}
      {transactions.map((t) => (
        <ListRow key={t.id}
          leading={<RowIcon>{TXN_ICONS[t.type] ?? "📋"}</RowIcon>}
          title={t.description}
          // Zůstatek je na telefonu v řádku podrobností: vedle částky bral titulku šířku a řádky rostly.
          // Druh pohybu na telefonu říká ikona; text by zůstatek vytlačil za okraj.
          meta={<><span className="hidden sm:inline">{TXN_LABELS[t.type] ?? t.type} · </span>{timeAgo(t.createdAt)}<span className="sm:hidden"> · zůstatek {formatKc(t.balanceAfter)}</span></>}
          trailing={
            <RowValue tone={t.amount >= 0 ? "plus" : "minus"}
              sub={<span className={`hidden sm:inline ${t.balanceAfter < 0 ? "text-card-red" : ""}`}>zůstatek {formatKc(t.balanceAfter)}</span>}>
              {t.amount >= 0 ? "+" : "−"}{formatKc(Math.abs(t.amount))}
            </RowValue>
          } />
      ))}
    </ListCard>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sdílené komponenty
// ────────────────────────────────────────────────────────────────────────────

function MetricCard({ label, value, color, sub, className = "" }: { label: string; value: string; color?: string; sub?: string; className?: string }) {
  return (
    <div className={`card p-3 sm:p-4 text-center ${className}`}>
      {/* whitespace-nowrap + mensi pismo na mobilu: „+7 275 Kč" se jinak
          lamalo tak, ze „Kč" spadlo na vlastni radek. */}
      <div className="text-micro text-muted uppercase tracking-wide mb-1 whitespace-nowrap">{label}</div>
      <div className={`font-heading font-[800] text-xl sm:text-2xl tabular-nums whitespace-nowrap ${color ?? "text-ink"}`}>{value}</div>
      {sub && <div className="text-micro text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function StatBox({ label, value, sub, colorRed }: { label: string; value: string; sub?: string; colorRed?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-soft p-3 text-center">
      <div className={`font-heading font-bold text-base sm:text-lg tabular-nums ${colorRed ? "text-card-red" : "text-ink"}`}>{value}</div>
      <div className="text-micro text-muted uppercase tracking-wide mt-0.5">{label}</div>
      {sub && <div className="text-micro text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function BarRow({ label, amount, max, positive, icon }: { label: string; amount: number; max: number; positive?: boolean; icon?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((amount / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </span>
        <span className={`text-sm font-heading font-bold tabular-nums ${positive ? "text-pitch-500" : "text-card-red"}`}>
          {positive ? "+" : "-"}{formatKc(amount)}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${positive ? "bg-pitch-500" : "bg-card-red"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
