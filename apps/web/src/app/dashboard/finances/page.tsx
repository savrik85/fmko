"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge } from "@/components/ui";

interface WagePlayer { id: string; name: string; position: string; rating: number; weeklyWage: number }
interface Sponsor { name: string; type: string; monthlyAmount: number; weeklyAmount: number; winBonus: number }
interface Transaction { id: string; type: string; amount: number; balanceAfter: number; description: string; gameDate: string; createdAt: string }

interface BudgetData {
  budget: number;
  sponsors: Sponsor[];
  playerCount: number;
  wageBill: { weekly: number; topPlayers: WagePlayer[] };
  weekly: {
    income: { sponsors: number; baseSponsor: number; subsidy: number; playerContributions: number; total: number };
    expenses: { wages: number; maintenance: number; equipment: number; training: number; total: number };
    net: number;
  };
  forecast: { weeklyNet: number; weeksUntilBankrupt: number | null; in4Weeks: number; inSeason: number };
}

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
  other: "Ostatní",
};

function formatCZK(amount: number): string {
  return amount.toLocaleString("cs") + " Kč";
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type TxnFilter = "all" | "income" | "expense";

export default function FinancesPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<BudgetData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnFilter, setTxnFilter] = useState<TxnFilter>("all");
  const [txnTotal, setTxnTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<BudgetData>(`/api/teams/${teamId}/budget`),
      apiFetch<{ transactions: Transaction[]; total: number }>(`/api/teams/${teamId}/transactions?limit=30`),
    ]).then(([b, t]) => {
      setData(b);
      setTransactions(t.transactions);
      setTxnTotal(t.total);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  const loadTransactions = (filter: TxnFilter) => {
    if (!teamId) return;
    setTxnFilter(filter);
    const params = filter === "all" ? "" : `&direction=${filter}`;
    apiFetch<{ transactions: Transaction[]; total: number }>(`/api/teams/${teamId}/transactions?limit=30${params}`)
      .then((t) => { setTransactions(t.transactions); setTxnTotal(t.total); })
      .catch((e) => console.error("load transactions:", e));
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data) return <div className="page-container">Data nenalezena.</div>;

  const isPositive = data.weekly.net >= 0;

  return (
    <div className="page-container space-y-5">

      {/* ═══ Row 1: Budget + Weekly balance + Forecast ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Current balance */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Rozpočet</SectionLabel>
          <div className="text-center py-3">
            <div className="font-heading font-[800] text-4xl tabular-nums text-ink">{formatCZK(data.budget)}</div>
            <div className="text-sm text-muted mt-1">Aktuální stav klubové kasy</div>
          </div>
        </div>

        {/* Weekly balance */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Týdenní bilance</SectionLabel>
          <div className="grid grid-cols-3 gap-2 text-center py-2">
            <div>
              <div className="text-pitch-500 font-heading font-bold text-lg tabular-nums">+{formatCZK(data.weekly.income.total)}</div>
              <div className="text-[10px] text-muted uppercase">Příjmy</div>
            </div>
            <div>
              <div className="text-card-red font-heading font-bold text-lg tabular-nums">-{formatCZK(data.weekly.expenses.total)}</div>
              <div className="text-[10px] text-muted uppercase">Výdaje</div>
            </div>
            <div>
              <div className={`font-heading font-[800] text-lg tabular-nums ${isPositive ? "text-pitch-500" : "text-card-red"}`}>
                {isPositive ? "+" : ""}{formatCZK(data.weekly.net)}
              </div>
              <div className="text-[10px] text-muted uppercase">Bilance</div>
            </div>
          </div>
        </div>

        {/* Forecast */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Prognóza</SectionLabel>
          <div className="text-center py-2">
            <div className={`font-heading font-bold text-2xl tabular-nums ${data.forecast.in4Weeks >= 0 ? "text-ink" : "text-card-red"}`}>
              {formatCZK(data.forecast.in4Weeks)}
            </div>
            <div className="text-sm text-muted mt-1">Za 4 týdny</div>
            <div className="text-xs text-muted mt-2">
              Na konci sezóny: <span className="font-heading font-bold text-ink">{formatCZK(data.forecast.inSeason)}</span>
            </div>
            {data.forecast.weeksUntilBankrupt != null && data.forecast.weeksUntilBankrupt > 0 && (
              <div className="mt-2 text-xs text-card-red font-heading font-bold bg-red-50 rounded-full px-3 py-1 inline-block">
                Bankrot za {data.forecast.weeksUntilBankrupt} týdnů!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Row 2: Income + Expenses + Wage bill ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Income breakdown */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Příjmy</SectionLabel>
          <div className="space-y-2">
            {data.weekly.income.sponsors > 0 && <ExpenseRow label="Sponzorské smlouvy" amount={data.weekly.income.sponsors} icon="💰" positive />}
            <ExpenseRow label="Místní podpora" amount={data.weekly.income.baseSponsor} icon="🏪" positive />
            <ExpenseRow label="Dotace od obce" amount={data.weekly.income.subsidy} icon="🏛" positive />
            <ExpenseRow label="Členské příspěvky" amount={data.weekly.income.playerContributions} icon="👥" positive />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <span className="text-sm font-heading font-bold">Celkem</span>
            <span className="text-sm font-heading font-bold text-pitch-500 tabular-nums">+{formatCZK(data.weekly.income.total)}/týd</span>
          </div>
          {data.sponsors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-[10px] text-muted uppercase mb-2">Sponzorské smlouvy</div>
              {data.sponsors.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{SPONSOR_ICONS[s.type] ?? "💰"}</span>
                    <span className="text-xs font-heading font-bold">{s.name}</span>
                  </div>
                  <div className="text-xs tabular-nums text-pitch-500 font-heading font-bold">{formatCZK(s.weeklyAmount)}/týd</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expense breakdown */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Výdaje</SectionLabel>
          <div className="space-y-2">
            <ExpenseRow label="Mzdy hráčů" amount={data.weekly.expenses.wages} icon="💸" highlight />
            <ExpenseRow label="Údržba hřiště" amount={data.weekly.expenses.maintenance} icon="🌿" />
            <ExpenseRow label="Vybavení" amount={data.weekly.expenses.equipment} icon="👟" />
            <ExpenseRow label="Tréninky" amount={data.weekly.expenses.training} icon="🏋" />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <span className="text-sm font-heading font-bold">Celkem</span>
            <span className="text-sm font-heading font-bold text-card-red tabular-nums">-{formatCZK(data.weekly.expenses.total)}/týd</span>
          </div>
        </div>

        {/* Wage bill */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Mzdy ({data.playerCount} hráčů)</SectionLabel>
          <div className="bg-gray-50 rounded-lg py-3 text-center mb-3">
            <div className="font-heading font-bold text-xl tabular-nums">{formatCZK(data.wageBill.weekly)}</div>
            <div className="text-[10px] text-muted uppercase">Týdně</div>
          </div>
          {data.wageBill.topPlayers.length > 0 && (
            <>
              <div className="text-[10px] text-muted uppercase mb-2">Nejlépe placení</div>
              {data.wageBill.topPlayers.map((p) => (
                <a key={p.id} href={`/dashboard/player/${p.id}`}
                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors -mx-2 px-2 rounded">
                  <div className="flex items-center gap-2">
                    <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                    <span className="text-xs font-heading font-bold">{p.name}</span>
                  </div>
                  <span className="text-xs tabular-nums font-heading font-bold">{formatCZK(p.weeklyWage)}/t</span>
                </a>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ═══ Row 3: Transaction history ═══ */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Historie transakcí ({txnTotal})</SectionLabel>
          <div className="flex gap-1">
            {(["all", "income", "expense"] as TxnFilter[]).map((f) => (
              <button key={f} onClick={() => loadTransactions(f)}
                className={`text-xs px-2.5 py-1 rounded-full font-heading font-bold transition-colors ${
                  txnFilter === f ? "bg-ink text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
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
                      <div className="font-heading font-bold text-xs">{t.description}</div>
                      <div className="text-[10px] text-muted">{TXN_LABELS[t.type] ?? t.type}</div>
                    </td>
                    <td className={`py-2 pr-2 text-right tabular-nums font-heading font-bold text-xs ${t.amount >= 0 ? "text-pitch-500" : "text-card-red"}`}>
                      {t.amount >= 0 ? "+" : ""}{formatCZK(t.amount)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-xs text-muted">{formatCZK(t.balanceAfter)}</td>
                    <td className="py-2 pr-4 sm:pr-5 text-right text-[10px] text-muted">{timeAgo(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-muted text-sm py-8 italic">
            Zatím žádné transakce. Finance se začnou zaznamenávat od dalšího pondělí.
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ label, amount, icon, positive, highlight }: { label: string; amount: number; icon: string; positive?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${highlight ? "bg-red-50/50 -mx-2 px-2 rounded" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className={`text-sm ${highlight ? "font-heading font-bold" : ""}`}>{label}</span>
      </div>
      <span className={`text-sm font-heading font-bold tabular-nums ${positive ? "text-pitch-500" : "text-card-red"}`}>
        {positive ? "+" : "-"}{formatCZK(amount)}/týd
      </span>
    </div>
  );
}
