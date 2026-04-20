"use client";

import { useState, useEffect, useMemo } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge } from "@/components/ui";

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
    income: { sponsors: number; baseSponsor: number; subsidy: number; playerContributions: number; total: number };
    expenses: { wages: number; maintenance: number; equipment: number; training: number; loanRepayment: number; total: number };
    net: number;
    netWithLoan: number;
  };
  forecast: { weeklyNet: number; weeksUntilBankrupt: number | null; in4Weeks: number; inSeason: number };
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

type Tab = "overview" | "income" | "expenses" | "forecast" | "loan" | "history";
type TxnFilter = "all" | "income" | "expense";

// ────────────────────────────────────────────────────────────────────────────
// Konstanty a formátování
// ────────────────────────────────────────────────────────────────────────────

const SPONSOR_ICONS: Record<string, string> = {
  obchod: "🛒", remeslo: "🔧", hospoda: "🍺", firma: "🏗", obec: "🏛",
};

const TXN_ICONS: Record<string, string> = {
  wage: "💸", sponsor_income: "💰", match_income: "🏟", match_expense: "⚽",
  match_reward: "🏆", training_cost: "🏋", pitch_maintenance: "🌿",
  equipment_expense: "👟", equipment_upgrade: "⬆", stadium_upgrade: "🏗",
  pitch_repair: "🛠", pitch_upgrade: "🌿", classified_ad: "📰",
  sponsor_termination: "❌", season_reward: "🏆", event: "⚡",
  transfer_fee: "🤝", transfer_income: "💵", signing_fee: "✍",
  loan_fee: "📄", loan_income: "📄", transfer_admin_fee: "🗂",
  concession_wholesale: "📦", concession_income_external: "🏪", concession_income_self: "🍺",
  promotional_campaign: "📢",
  cash_loan_disbursement: "💳", cash_loan_repayment: "💳",
  other: "📋",
};

const TXN_LABELS: Record<string, string> = {
  wage: "Mzdy", sponsor_income: "Sponzoři", match_income: "Vstupné", match_expense: "Zápasové náklady",
  match_reward: "Bonus za výsledek", training_cost: "Trénink", pitch_maintenance: "Údržba hřiště",
  equipment_expense: "Vybavení", equipment_upgrade: "Upgrade vybavení", stadium_upgrade: "Upgrade stadionu",
  pitch_repair: "Oprava hřiště", pitch_upgrade: "Změna povrchu", classified_ad: "Inzerát",
  sponsor_termination: "Ukončení smlouvy", season_reward: "Sezónní odměna", event: "Událost",
  transfer_fee: "Přestupová cena", transfer_income: "Prodej hráče", signing_fee: "Podpisový bonus",
  loan_fee: "Hostování — platba", loan_income: "Hostování — příjem", transfer_admin_fee: "Přestupní poplatek",
  concession_wholesale: "Nákup zboží", concession_income_external: "Pronájem bufetu", concession_income_self: "Tržby z občerstvení",
  promotional_campaign: "Propagace zápasu",
  cash_loan_disbursement: "Půjčka — přijatá", cash_loan_repayment: "Splátka půjčky",
  other: "Ostatní",
};

function formatCZK(amount: number): string {
  return amount.toLocaleString("cs") + " Kč";
}

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
  const [tab, setTab] = useState<Tab>("overview");
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

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data) return <div className="page-container">Data nenalezena.</div>;

  const tabs: [Tab, string, string][] = [
    ["overview", "Přehled", "📊"],
    ["income", "Příjmy", "💰"],
    ["expenses", "Výdaje", "💸"],
    ["forecast", "Prognóza", "🔮"],
    ["loan", "Půjčka", data.loan ? "💳 •" : "💳"],
    ["history", "Historie", "📜"],
  ];

  return (
    <div className="page-container space-y-5">

      {/* Hlavička: rozpočet vždy viditelný */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] text-muted uppercase tracking-wide">Aktuální rozpočet</div>
            <div className={`font-heading font-[800] text-3xl sm:text-4xl tabular-nums ${data.budget < 0 ? "text-card-red" : "text-ink"}`}>
              {formatCZK(data.budget)}
            </div>
          </div>
          {data.purchaseBlocked && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-card-red max-w-sm">
              <div className="font-heading font-bold mb-0.5">⛔ Nákupy blokovány</div>
              <div>Dokud rozpočet nevyrovnáš na nulu, nelze utrácet za přestupy, upgrady ani inzeráty.</div>
            </div>
          )}
          {data.loan && !data.purchaseBlocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
              <div className="font-heading font-bold">Aktivní půjčka</div>
              <div>Zbývá {formatCZK(data.loan.remaining)} • {data.loan.installmentsRemaining} splátek</div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 overflow-x-auto">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === "loan") loadLoanInfo(); }}
            className={`flex-1 min-w-[80px] py-2 px-2 text-sm font-heading font-bold rounded-lg transition-colors whitespace-nowrap ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            <span className="mr-1">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "income" && <IncomeTab data={data} />}
      {tab === "expenses" && <ExpensesTab data={data} />}
      {tab === "forecast" && <ForecastTab data={data} />}
      {tab === "loan" && <LoanTab teamId={teamId!} data={data} info={loanInfo} onChange={refreshAll} reload={loadLoanInfo} />}
      {tab === "history" && (
        <HistoryTab transactions={transactions} total={txnTotal} filter={txnFilter} onFilter={loadTransactions} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Přehled
// ────────────────────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: BudgetData }) {
  const isPositive = data.weekly.netWithLoan >= 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Týdenní příjmy" value={`+${formatCZK(data.weekly.income.total)}`} color="text-pitch-500" />
        <MetricCard
          label="Týdenní výdaje"
          value={`-${formatCZK(data.weekly.expenses.total + data.weekly.expenses.loanRepayment)}`}
          color="text-card-red"
          sub={data.weekly.expenses.loanRepayment > 0 ? `z toho splátka ~${formatCZK(data.weekly.expenses.loanRepayment)}` : undefined}
        />
        <MetricCard
          label="Bilance"
          value={`${isPositive ? "+" : ""}${formatCZK(data.weekly.netWithLoan)}`}
          color={isPositive ? "text-pitch-500" : "text-card-red"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-4 sm:p-5">
          <SectionLabel>Tři největší příjmy / týden</SectionLabel>
          <div className="mt-2 space-y-2">
            {topIncomeItems(data).map((it) => (
              <BarRow key={it.label} label={it.label} amount={it.amount} max={topIncomeItems(data)[0]?.amount ?? 1} positive />
            ))}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <SectionLabel>Tři největší výdaje / týden</SectionLabel>
          <div className="mt-2 space-y-2">
            {topExpenseItems(data).map((it) => (
              <BarRow key={it.label} label={it.label} amount={it.amount} max={topExpenseItems(data)[0]?.amount ?? 1} />
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Rychlý pohled na sezónu</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <StatBox label="Zbývá zápasů" value={String(data.remainingMatches)} />
          <StatBox label="Za 4 týdny" value={formatCZK(data.forecast.in4Weeks)} colorRed={data.forecast.in4Weeks < 0} />
          <StatBox label="Na konci sezóny" value={formatCZK(data.forecast.inSeason)} colorRed={data.forecast.inSeason < 0} />
          <StatBox
            label="Bankrot za"
            value={data.forecast.weeksUntilBankrupt != null ? `${data.forecast.weeksUntilBankrupt} týd` : "—"}
            colorRed={data.forecast.weeksUntilBankrupt != null}
          />
        </div>
      </div>
    </div>
  );
}

function topIncomeItems(d: BudgetData) {
  const items = [
    { label: "Sponzoři", amount: d.weekly.income.sponsors + d.weekly.income.baseSponsor },
    { label: "Dotace obce", amount: d.weekly.income.subsidy },
    { label: "Členské příspěvky", amount: d.weekly.income.playerContributions },
  ];
  return items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
}

function topExpenseItems(d: BudgetData) {
  const items = [
    { label: "Mzdy hráčů", amount: d.weekly.expenses.wages },
    { label: "Údržba hřiště", amount: d.weekly.expenses.maintenance },
    { label: "Tréninky", amount: d.weekly.expenses.training },
    { label: "Vybavení", amount: d.weekly.expenses.equipment },
    ...(d.weekly.expenses.loanRepayment > 0 ? [{ label: "Splátka půjčky (odhad/týd)", amount: d.weekly.expenses.loanRepayment }] : []),
  ];
  return items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Příjmy
// ────────────────────────────────────────────────────────────────────────────

function IncomeTab({ data }: { data: BudgetData }) {
  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex justify-between items-baseline mb-3">
          <SectionLabel>Struktura příjmů / týden</SectionLabel>
          <span className="font-heading font-bold text-pitch-500 tabular-nums">+{formatCZK(data.weekly.income.total)}</span>
        </div>
        <div className="space-y-2.5">
          <BarRow label="Sponzorské smlouvy" amount={data.weekly.income.sponsors} max={data.weekly.income.total} positive icon="💰" />
          <BarRow label="Místní podpora (reputace)" amount={data.weekly.income.baseSponsor} max={data.weekly.income.total} positive icon="🏪" />
          <BarRow label="Dotace od obce" amount={data.weekly.income.subsidy} max={data.weekly.income.total} positive icon="🏛" />
          <BarRow label="Členské příspěvky" amount={data.weekly.income.playerContributions} max={data.weekly.income.total} positive icon="👥" />
        </div>
      </div>

      {data.sponsors.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Sponzorské smlouvy ({data.sponsors.length})</SectionLabel>
          <div className="mt-2 space-y-2">
            {data.sponsors.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{SPONSOR_ICONS[s.type] ?? "💰"}</span>
                  <div>
                    <div className="text-sm font-heading font-bold">{s.name}</div>
                    <div className="text-[11px] text-muted">Typ: {s.type}{s.winBonus > 0 ? ` • bonus za výhru ${formatCZK(s.winBonus)}` : ""}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums text-pitch-500 font-heading font-bold">{formatCZK(s.weeklyAmount)}/týd</div>
                  <div className="text-[10px] text-muted">{formatCZK(s.monthlyAmount)}/měs</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <SectionLabel>Nepravidelné příjmy</SectionLabel>
        <div className="mt-2 text-sm text-muted space-y-1">
          <div>• <span className="font-heading font-bold text-ink">Vstupné</span> — domácí zápasy podle návštěvy a ceny.</div>
          <div>• <span className="font-heading font-bold text-ink">Bufet</span> — buď vlastní tržby, nebo pronájem externímu provozovateli.</div>
          <div>• <span className="font-heading font-bold text-ink">Bonusy za výsledky</span> — výhra/remíza, sponzorské win-bonusy.</div>
          <div>• <span className="font-heading font-bold text-ink">Přestupy</span> — prodej hráčů, jednorázové příjmy.</div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Výdaje
// ────────────────────────────────────────────────────────────────────────────

function ExpensesTab({ data }: { data: BudgetData }) {
  const totalWithLoan = data.weekly.expenses.total + data.weekly.expenses.loanRepayment;
  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex justify-between items-baseline mb-3">
          <SectionLabel>Struktura výdajů / týden</SectionLabel>
          <span className="font-heading font-bold text-card-red tabular-nums">-{formatCZK(totalWithLoan)}</span>
        </div>
        <div className="space-y-2.5">
          <BarRow label="Mzdy hráčů" amount={data.weekly.expenses.wages} max={totalWithLoan} icon="💸" />
          <BarRow label="Tréninky" amount={data.weekly.expenses.training} max={totalWithLoan} icon="🏋" />
          <BarRow label="Údržba hřiště" amount={data.weekly.expenses.maintenance} max={totalWithLoan} icon="🌿" />
          <BarRow label="Vybavení" amount={data.weekly.expenses.equipment} max={totalWithLoan} icon="👟" />
          {data.weekly.expenses.loanRepayment > 0 && (
            <BarRow label="Splátka půjčky (odhad)" amount={data.weekly.expenses.loanRepayment} max={totalWithLoan} icon="💳" />
          )}
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Mzdový rozpočet ({data.playerCount} hráčů)</SectionLabel>
        <div className="bg-gray-50 rounded-lg py-3 text-center my-3">
          <div className="font-heading font-bold text-2xl tabular-nums">{formatCZK(data.wageBill.weekly)}</div>
          <div className="text-[11px] text-muted uppercase tracking-wide">týdně</div>
        </div>
        {data.wageBill.topPlayers.length > 0 && (
          <>
            <div className="text-[10px] text-muted uppercase mb-2">Nejlépe placení</div>
            {data.wageBill.topPlayers.map((p) => (
              <a key={p.id} href={`/dashboard/player/${p.id}`}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors -mx-2 px-2 rounded">
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                  <span className="text-sm font-heading font-bold">{p.name}</span>
                </div>
                <span className="text-sm tabular-nums font-heading font-bold">{formatCZK(p.weeklyWage)}/t</span>
              </a>
            ))}
          </>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Nepravidelné výdaje</SectionLabel>
        <div className="mt-2 text-sm text-muted space-y-1">
          <div>• <span className="font-heading font-bold text-ink">Zápasové náklady</span> — rozhodčí, cestovné, občerstvení po zápase.</div>
          <div>• <span className="font-heading font-bold text-ink">Přestupy</span> — přestupové ceny, registrace, hostování.</div>
          <div>• <span className="font-heading font-bold text-ink">Upgrady</span> — stadion, hřiště, vybavení, propagace zápasu.</div>
          <div>• <span className="font-heading font-bold text-ink">Inzeráty</span> — hledání volných hráčů.</div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Prognóza
// ────────────────────────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: BudgetData }) {
  // 16-week line: vykreslíme jednoduchý CSS bar chart
  const weeksToShow = 16;
  const points = useMemo(() => {
    const pts: { week: number; value: number }[] = [];
    for (let w = 0; w <= weeksToShow; w++) {
      pts.push({ week: w, value: data.budget + data.forecast.weeklyNet * w });
    }
    return pts;
  }, [data.budget, data.forecast.weeklyNet]);

  const values = points.map((p) => p.value);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = Math.max(1, maxV - minV);
  const zeroRatio = (0 - minV) / range;

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Vývoj rozpočtu (16 týdnů)</SectionLabel>
        <div className="mt-4 relative h-44 bg-gradient-to-b from-gray-50 to-white rounded-lg overflow-hidden">
          {/* Nulová osa */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-gray-300"
            style={{ bottom: `${zeroRatio * 100}%` }}
          >
            <span className="absolute right-1 -top-4 text-[10px] text-muted tabular-nums bg-white/80 px-1">0</span>
          </div>
          {/* Sloupce */}
          <div className="absolute inset-0 flex items-end justify-between px-2 pt-2 pb-0 gap-px">
            {points.map((p, i) => {
              const isPositive = p.value >= 0;
              const heightRatio = Math.abs(p.value) / range;
              const bottomRatio = isPositive ? zeroRatio : zeroRatio - heightRatio;
              return (
                <div
                  key={i}
                  className={`flex-1 ${isPositive ? "bg-pitch-500/70" : "bg-card-red/70"} rounded-t-sm relative group`}
                  style={{
                    height: `${heightRatio * 100}%`,
                    marginBottom: `${bottomRatio * 100}%`,
                  }}
                  title={`Týden ${p.week}: ${formatCZK(p.value)}`}
                />
              );
            })}
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted mt-1 px-2">
          <span>dnes</span>
          <span>4 týd</span>
          <span>8 týd</span>
          <span>12 týd</span>
          <span>konec sezóny</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Za 4 týdny" value={formatCZK(data.forecast.in4Weeks)} color={data.forecast.in4Weeks < 0 ? "text-card-red" : "text-ink"} />
        <MetricCard label="Na konci sezóny" value={formatCZK(data.forecast.inSeason)} color={data.forecast.inSeason < 0 ? "text-card-red" : "text-ink"} />
        <MetricCard
          label="Bankrot za"
          value={data.forecast.weeksUntilBankrupt != null ? `${data.forecast.weeksUntilBankrupt} týd` : "—"}
          color={data.forecast.weeksUntilBankrupt != null ? "text-card-red" : "text-muted"}
          sub={data.forecast.weeksUntilBankrupt != null ? "hrozí záporný rozpočet" : "stabilní hospodaření"}
        />
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Předpoklady výpočtu</SectionLabel>
        <ul className="mt-2 text-sm text-muted space-y-1">
          <li>• Týdenní bilance <span className="font-heading font-bold text-ink tabular-nums">{data.weekly.netWithLoan >= 0 ? "+" : ""}{formatCZK(data.weekly.netWithLoan)}</span> (vč. splátky půjčky)</li>
          <li>• Bez nepravidelných příjmů (vstupné, bufet, přestupy, bonusy)</li>
          <li>• Bez jednorázových nákupů (upgrady, inzeráty, registrace)</li>
          <li>• Zbývá zápasových dní v sezóně: <span className="font-heading font-bold text-ink tabular-nums">{data.remainingMatches}</span></li>
        </ul>
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
    return <div className="card p-8 text-center"><Spinner /></div>;
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
      setSuccess(`Půjčka vzata: ${formatCZK(res.loan.principal)}. Splácej ${formatCZK(res.loan.perMatchInstallment)} za každý zápas.`);
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
          <li>💰 Výše: <span className="font-heading font-bold">{formatCZK(info.rules.minPrincipal)}</span> až <span className="font-heading font-bold">{formatCZK(info.rules.maxPrincipal)}</span></li>
          <li>📈 Úrok: <span className="font-heading font-bold">{Math.round(info.rules.interestRate * 100)} %</span> z půjčené částky</li>
          <li>📅 Splátky: rovnoměrně po každém zápase až do konce sezóny</li>
          <li>🚫 Najednou pouze jedna aktivní půjčka</li>
          <li>🔁 Půjčku lze vzít jednou za sezónu</li>
          <li>⛔ Při záporném rozpočtu nelze nic kupovat — dokud nevyrovnáš</li>
        </ul>
      </div>

      {/* Aktivní půjčka */}
      {data.loan && (
        <div className="card p-4 sm:p-5 bg-amber-50/50 border border-amber-200">
          <SectionLabel>Aktivní půjčka</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <StatBox label="Půjčeno" value={formatCZK(data.loan.principal)} />
            <StatBox label="K doplacení" value={formatCZK(data.loan.remaining)} colorRed />
            <StatBox label="Splátka / zápas" value={formatCZK(data.loan.perMatchInstallment)} />
            <StatBox label="Splátek zbývá" value={`${data.loan.installmentsRemaining} / ${data.loan.totalInstallments}`} />
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-muted mb-1">
              <span>Splaceno {formatCZK(data.loan.totalToRepay - data.loan.remaining)}</span>
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
                <span className="text-xl font-heading font-bold tabular-nums">{formatCZK(amount)}</span>
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
              <div className="flex justify-between text-[11px] text-muted mt-1">
                <span>{formatCZK(info.rules.minPrincipal)}</span>
                <span>{formatCZK(info.rules.maxPrincipal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
              <StatBox label="Půjčíš si" value={formatCZK(amount)} />
              <StatBox label={`Úrok (${Math.round(info.rules.interestRate * 100)} %)`} value={formatCZK(interestAmount)} colorRed />
              <StatBox label="Splatíš celkem" value={formatCZK(totalRepay)} />
              <StatBox label="Splátka / zápas" value={formatCZK(perMatch)} sub={`${info.remainingMatches} splátek`} />
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-card-red">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-pitch-600">{success}</div>}

            <button
              onClick={take}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-pitch-500 hover:bg-pitch-600 text-white font-heading font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? "Zpracovávám..." : `Vzít půjčku ${formatCZK(amount)}`}
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
        <div className="card p-4 sm:p-5">
          <SectionLabel>Historie půjček</SectionLabel>
          <div className="mt-2 space-y-2">
            {info.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                <div>
                  <div className="text-sm font-heading font-bold">{formatCZK(h.principal)} → {formatCZK(h.totalToRepay)}</div>
                  <div className="text-[11px] text-muted">
                    Vzato: {h.takenGameDate.slice(0, 10)} • {h.status === "active" ? "Aktivní" : h.status === "paid" ? `Splaceno ${h.paidOffAt?.slice(0, 10) ?? ""}` : h.status}
                  </div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  {h.status === "active" ? (
                    <span className="text-amber-700 font-heading font-bold">Zbývá {formatCZK(h.remaining)}</span>
                  ) : (
                    <span className="text-muted">{h.installmentsPaid} splátek</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Historie transakcí
// ────────────────────────────────────────────────────────────────────────────

function HistoryTab({ transactions, total, filter, onFilter }: {
  transactions: Transaction[];
  total: number;
  filter: TxnFilter;
  onFilter: (f: TxnFilter) => void;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionLabel>Historie transakcí ({total})</SectionLabel>
        <div className="flex gap-1">
          {(["all", "income", "expense"] as TxnFilter[]).map((f) => (
            <button key={f} onClick={() => onFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full font-heading font-bold transition-colors ${
                filter === f ? "bg-ink text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
              }`}>
              {f === "all" ? "Vše" : f === "income" ? "Příjmy" : "Výdaje"}
            </button>
          ))}
        </div>
      </div>

      {transactions.length > 0 ? (
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                <th className="pb-2 pl-4 sm:pl-5 pr-2 w-8"></th>
                <th className="pb-2 pr-2">Popis</th>
                <th className="pb-2 pr-2 text-right w-28">Částka</th>
                <th className="pb-2 pr-2 text-right w-28">Zůstatek</th>
                <th className="pb-2 pr-4 sm:pr-5 text-right w-16">Kdy</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-2 pl-4 sm:pl-5 pr-2 text-center text-sm">{TXN_ICONS[t.type] ?? "📋"}</td>
                  <td className="py-2 pr-2">
                    <div className="font-heading font-bold text-sm">{t.description}</div>
                    <div className="text-[11px] text-muted">{TXN_LABELS[t.type] ?? t.type}</div>
                  </td>
                  <td className={`py-2 pr-2 text-right tabular-nums font-heading font-bold text-sm ${t.amount >= 0 ? "text-pitch-500" : "text-card-red"}`}>
                    {t.amount >= 0 ? "+" : ""}{formatCZK(t.amount)}
                  </td>
                  <td className={`py-2 pr-2 text-right tabular-nums text-sm ${t.balanceAfter < 0 ? "text-card-red" : "text-muted"}`}>
                    {formatCZK(t.balanceAfter)}
                  </td>
                  <td className="py-2 pr-4 sm:pr-5 text-right text-[11px] text-muted">{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center text-muted text-sm py-8 italic">Zatím žádné transakce.</div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sdílené komponenty
// ────────────────────────────────────────────────────────────────────────────

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-heading font-[800] text-2xl tabular-nums ${color ?? "text-ink"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function StatBox({ label, value, sub, colorRed }: { label: string; value: string; sub?: string; colorRed?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <div className={`font-heading font-bold text-base sm:text-lg tabular-nums ${colorRed ? "text-card-red" : "text-ink"}`}>{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
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
          {positive ? "+" : "-"}{formatCZK(amount)}
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
