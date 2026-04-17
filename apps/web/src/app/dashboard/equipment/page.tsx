"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm } from "@/components/ui";

interface CategoryInfo { key: string; label: string; level: number; condition: number; effectiveLevel: number; description: string }
interface UpgradeOption { category: string; label: string; currentLevel: number; nextLevel: number; cost: number; effect: string; description: string; locked: boolean; lockReason?: string }
interface RepairOption { category: string; label: string; level: number; condition: number; cost: number }
interface EquipmentEffects { trainingMultiplier: number; tacticsTrainingBonus: number; matchTechniqueMod: number; moraleMod: number; injurySeverityMod: number; conditionDrainMod: number; teamChemistryMod: number; gkBonus: number }
interface EquipmentData { categories: CategoryInfo[]; upgrades: UpgradeOption[]; repairs: RepairOption[]; effects: EquipmentEffects }

const ICONS: Record<string, string> = {
  balls: "⚽", jerseys: "👕", training_cones: "🔶", first_aid: "🩺",
  boots_stock: "👟", bibs: "🎽", goalkeeper_gear: "🧤", water_bottles: "🫗", tactics_board: "📋",
};

function condColor(c: number): string {
  if (c >= 80) return "text-pitch-500";
  if (c >= 50) return "text-gold-600";
  return "text-card-red";
}

function condBarColor(c: number): string {
  if (c >= 80) return "bg-pitch-400";
  if (c >= 50) return "bg-gold-500";
  return "bg-card-red";
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

export default function EquipmentPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<EquipmentData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [eq, t] = await Promise.all([
      apiFetch<EquipmentData>(`/api/teams/${teamId}/equipment`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setData(eq); setTeam(t);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  const handleUpgrade = async (u: UpgradeOption) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Vylepšit ${u.label} na úroveň ${u.nextLevel}?`,
      description: u.description,
      details: [
        { label: "Bonus", value: u.effect, color: "text-pitch-500" },
        { label: "Cena", value: `-${formatCZK(u.cost)}`, color: "text-card-red" },
      ],
      confirmLabel: `Koupit za ${formatCZK(u.cost)}`,
    });
    if (!ok) return;
    setActing(u.category);
    await apiFetch(`/api/teams/${teamId}/equipment/upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: u.category }),
    }).catch((e) => console.error("equipment upgrade failed:", e));
    await refresh();
    setActing(null);
  };

  const handleRepair = async (r: RepairOption) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Opravit ${r.label}?`,
      description: `Stav ${r.condition}% se obnoví na 100%.`,
      details: [{ label: "Cena", value: `-${formatCZK(r.cost)}`, color: "text-card-red" }],
      confirmLabel: `Opravit za ${formatCZK(r.cost)}`,
    });
    if (!ok) return;
    setActing("r-" + r.category);
    await apiFetch(`/api/teams/${teamId}/equipment/repair`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: r.category }),
    }).catch((e) => console.error("equipment repair failed:", e));
    await refresh();
    setActing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !team) return <div className="page-container">Data nenalezena.</div>;

  const fx = data.effects;
  const activeEffects = [
    fx.trainingMultiplier > 1.01 && { label: "Trénink", value: `+${Math.round((fx.trainingMultiplier - 1) * 100)}%`, icon: "🏋" },
    fx.matchTechniqueMod > 0 && { label: "Technika", value: `+${fx.matchTechniqueMod}`, icon: "⚡" },
    fx.moraleMod > 0 && { label: "Morálka", value: `+${fx.moraleMod}`, icon: "💪" },
    fx.injurySeverityMod > 0.01 && { label: "Ochrana", value: `-${Math.round(fx.injurySeverityMod * 100)}%`, icon: "🛡" },
    fx.conditionDrainMod > 0.01 && { label: "Výdrž", value: `-${Math.round(fx.conditionDrainMod * 100)}%`, icon: "🔋" },
    fx.gkBonus > 0 && { label: "Brankář", value: `+${fx.gkBonus}`, icon: "🧤" },
    fx.teamChemistryMod > 0 && { label: "Chemie", value: `+${fx.teamChemistryMod}`, icon: "🤝" },
  ].filter(Boolean) as { label: string; value: string; icon: string }[];

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* ═══ Active effects ═══ */}
      {activeEffects.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Aktivní bonusy</SectionLabel>
          <div className="flex gap-3 flex-wrap">
            {activeEffects.map((e) => (
              <div key={e.label} className="flex items-center gap-1.5 bg-pitch-50 text-pitch-700 px-3 py-1.5 rounded-lg">
                <span className="text-sm">{e.icon}</span>
                <span className="text-sm font-heading font-bold">{e.value}</span>
                <span className="text-xs text-pitch-600">{e.label}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted mt-2 italic">Bonusy závisí na úrovni a stavu vybavení. Aplikují se na tréninky i zápasy.</div>
        </div>
      )}

      {/* ═══ Equipment grid — cards ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.categories.map((cat) => {
          const upgrade = data.upgrades.find((u) => u.category === cat.key);
          const repair = data.repairs.find((r) => r.category === cat.key);
          const canUpgrade = upgrade && !upgrade.locked && team.budget >= upgrade.cost;
          const canRepair = repair && team.budget >= repair.cost;

          return (
            <div key={cat.key} className="card p-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-2xl">{ICONS[cat.key] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold">{cat.label}</div>
                  <div className="text-xs text-muted">{cat.description}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {[1, 2, 3].map((l) => (
                    <div key={l} className={`w-3 h-3 rounded-full ${l <= cat.level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>

              {/* Condition bar */}
              {cat.level > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted uppercase">Stav</span>
                    <span className={`text-sm font-heading font-bold tabular-nums ${condColor(cat.condition)}`}>{cat.condition}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${condBarColor(cat.condition)}`} style={{ width: `${cat.condition}%` }} />
                  </div>
                </div>
              )}

              {/* Upgrade info + action */}
              {upgrade && !upgrade.locked && (
                <div className="flex items-center justify-between gap-3 mt-1">
                  <div>
                    <div className="text-sm"><span className="font-heading font-bold">Lv.{upgrade.nextLevel}</span> <span className="text-muted">—</span> <span className="font-heading font-bold tabular-nums">{formatCZK(upgrade.cost)}</span></div>
                    <div className="text-xs text-pitch-600">{upgrade.effect}</div>
                  </div>
                  <button onClick={() => handleUpgrade(upgrade)} disabled={!canUpgrade || !!acting}
                    className={`shrink-0 py-1.5 px-4 rounded-lg text-xs font-heading font-bold transition-colors ${
                      canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}>
                    {acting === cat.key ? "..." : "Koupit"}
                  </button>
                </div>
              )}
              {upgrade?.locked && (
                <div className="text-xs text-muted mt-2">🔒 {upgrade.lockReason}</div>
              )}
              {!upgrade && cat.level === 3 && (
                <div className="text-xs text-pitch-600 font-heading font-bold mt-2">Maximální úroveň</div>
              )}

              {/* Repair */}
              {repair && (
                <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-gray-100">
                  <div className="text-sm text-muted">Oprava na 100% — <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(repair.cost)}</span></div>
                  <button onClick={() => handleRepair(repair)} disabled={!canRepair || !!acting}
                    className={`shrink-0 py-1 px-3 rounded text-xs font-heading font-bold transition-colors ${
                      canRepair ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}>
                    {acting === "r-" + cat.key ? "..." : "Opravit"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
