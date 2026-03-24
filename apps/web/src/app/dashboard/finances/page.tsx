"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel } from "@/components/ui";

interface Sponsor {
  name: string;
  type: string;
  monthlyAmount: number;
  winBonus: number;
}

interface BudgetData {
  budget: number;
  sponsors: Sponsor[];
  monthly: { income: number; expenses: number; net: number };
  playerCount: number;
}

const SPONSOR_ICONS: Record<string, string> = {
  obchod: "\u{1F6D2}",
  remeslo: "\u{1F527}",
  hospoda: "\u{1F37A}",
  firma: "\u{1F3D7}",
  obec: "\u{1F3DB}",
};

function formatCZK(amount: number): string {
  return amount.toLocaleString("cs") + " Kč";
}

export default function FinancesPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<BudgetData>(`/api/teams/${teamId}/budget`)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data) return <div className="page-container">Data nenalezena.</div>;

  const isPositive = data.monthly.net >= 0;

  return (
    <div className="page-container space-y-5">

      {/* Budget overview */}
      <Card>
        <CardBody>
          <SectionLabel>Rozpočet</SectionLabel>
          <div className="text-center py-4">
            <div className="font-heading font-[800] text-4xl tabular-nums text-ink">
              {formatCZK(data.budget)}
            </div>
            <div className="text-sm text-muted mt-1">Aktuální stav klubové kasy</div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-gray-100">
            <div>
              <div className="text-pitch-400 font-heading font-bold text-lg tabular-nums">+{formatCZK(data.monthly.income)}</div>
              <div className="text-xs text-muted">Příjmy/měs.</div>
            </div>
            <div>
              <div className="text-card-red font-heading font-bold text-lg tabular-nums">-{formatCZK(data.monthly.expenses)}</div>
              <div className="text-xs text-muted">Výdaje/měs.</div>
            </div>
            <div>
              <div className={`font-heading font-[800] text-lg tabular-nums ${isPositive ? "text-pitch-400" : "text-card-red"}`}>
                {isPositive ? "+" : ""}{formatCZK(data.monthly.net)}
              </div>
              <div className="text-xs text-muted">Bilance/měs.</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Sponsors */}
      <Card>
        <CardBody>
          <SectionLabel>Sponzoři ({data.sponsors.length})</SectionLabel>
          {data.sponsors.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">Žádní sponzoři</p>
          ) : (
            <div className="space-y-3">
              {data.sponsors.map((s, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-xl shrink-0">
                    {SPONSOR_ICONS[s.type] ?? "\u{1F4B0}"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-sm">{s.name}</div>
                    <div className="text-xs text-muted">{s.type}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-heading font-bold text-sm text-pitch-500 tabular-nums">
                      {formatCZK(s.monthlyAmount)}/měs
                    </div>
                    {s.winBonus > 0 && (
                      <div className="text-xs text-gold-600 tabular-nums">
                        +{formatCZK(s.winBonus)} za výhru
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Expense breakdown */}
      <Card>
        <CardBody>
          <SectionLabel>Měsíční výdaje</SectionLabel>
          <div className="space-y-2">
            <ExpenseRow label="Údržba hřiště" amount={Math.round(data.monthly.expenses * 0.5)} icon={"\u{1F3DF}"} />
            <ExpenseRow label="Vybavení a dresy" amount={Math.round(data.monthly.expenses * 0.2)} icon={"\u{1F45F}"} />
            <ExpenseRow label="Rozhodčí a poplatky" amount={Math.round(data.monthly.expenses * 0.2)} icon={"\u{1F9D1}\u200D\u2696\uFE0F"} />
            <ExpenseRow label="Ostatní" amount={Math.round(data.monthly.expenses * 0.1)} icon={"\u{1F4CB}"} />
          </div>
        </CardBody>
      </Card>

      {/* Info */}
      <Card>
        <CardBody>
          <SectionLabel>Info</SectionLabel>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted">Hráčů v kádru:</span>
              <span className="font-heading font-bold ml-2">{data.playerCount}</span>
            </div>
            <div>
              <span className="text-muted">Sponzorů:</span>
              <span className="font-heading font-bold ml-2">{data.sponsors.length}</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ExpenseRow({ label, amount, icon }: { label: string; amount: number; icon: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-heading font-bold tabular-nums text-card-red">-{formatCZK(amount)}</span>
    </div>
  );
}
