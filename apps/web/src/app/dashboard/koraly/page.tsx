"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

interface Achievement {
  key: string;
  icon: string;
  title: string;
  desc: string;
  tier: "bronze" | "silver" | "gold";
  earnedAt: string | null;
}

const TIER_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  bronze: { bg: "#8B451312", border: "#8B4513", text: "#8B4513", label: "Bronz" },
  silver: { bg: "#8B8B8B14", border: "#8B8B8B", text: "#595959", label: "Stříbro" },
  gold:   { bg: "#B8860B18", border: "#B8860B", text: "#8B6914", label: "Zlato" },
};

export default function KoralyPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<{ achievements: Achievement[]; earnedCount: number; totalCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ achievements: Achievement[]; earnedCount: number; totalCount: number }>(`/api/teams/${teamId}/achievements`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { console.error("load achievements:", e); setLoading(false); });
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  if (!data) return <div className="page-container">Nepodařilo se načíst Kořaly.</div>;

  const pct = data.totalCount > 0 ? (data.earnedCount / data.totalCount) * 100 : 0;
  const byTier: Record<string, Achievement[]> = { gold: [], silver: [], bronze: [] };
  for (const a of data.achievements) byTier[a.tier]?.push(a);

  return (
    <div className="page-container pb-24 space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <h1 className="font-heading font-[800] text-2xl">🍺 Kořaly</h1>
            <p className="text-sm text-muted mt-0.5">Vesnické trofeje a milníky tvé kariéry</p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-heading font-[800] text-2xl tabular-nums">{data.earnedCount}<span className="text-muted text-base font-normal">/{data.totalCount}</span></div>
            <div className="text-[11px] text-muted uppercase tracking-wide">získáno</div>
          </div>
        </div>
        <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-300 to-amber-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(["gold", "silver", "bronze"] as const).map((tier) => {
        const list = byTier[tier];
        if (list.length === 0) return null;
        const tc = TIER_COLORS[tier];
        return (
          <div key={tier}>
            <SectionLabel>{tc.label} ({list.filter((a) => a.earnedAt).length}/{list.length})</SectionLabel>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {list.map((a) => {
                const earned = !!a.earnedAt;
                return (
                  <div
                    key={a.key}
                    className={`card p-3 ${earned ? "" : "opacity-40 grayscale"}`}
                    style={earned ? { borderLeft: `4px solid ${tc.border}`, background: tc.bg } : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <div className="text-2xl shrink-0 leading-none mt-0.5">{a.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-heading font-bold text-sm truncate">{a.title}</div>
                        <div className="text-xs text-muted mt-0.5 leading-snug">{a.desc}</div>
                        {earned && a.earnedAt && (
                          <div className="text-[10px] text-muted mt-1 font-heading tabular-nums" style={{ color: tc.text }}>
                            ✓ {new Date(a.earnedAt).toLocaleDateString("cs")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
