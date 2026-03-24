"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, useConfirm } from "@/components/ui";

interface CategoryInfo {
  key: string;
  label: string;
  level: number;
  condition: number;
  effectiveLevel: number;
  description: string;
}

interface UpgradeOption {
  category: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  description: string;
  locked: boolean;
  lockReason?: string;
}

interface RepairOption {
  category: string;
  label: string;
  level: number;
  condition: number;
  cost: number;
}

interface EquipmentEffects {
  trainingMultiplier: number;
  tacticsTrainingBonus: number;
  matchTechniqueMod: number;
  moraleMod: number;
  injurySeverityMod: number;
  conditionDrainMod: number;
  teamChemistryMod: number;
  gkBonus: number;
}

interface EquipmentData {
  categories: CategoryInfo[];
  upgrades: UpgradeOption[];
  repairs: RepairOption[];
  effects: EquipmentEffects;
}

const CATEGORY_ICONS: Record<string, string> = {
  balls: "\u26BD",
  jerseys: "\u{1F455}",
  training_cones: "\u{1F9E1}",
  first_aid: "\u{1FA7A}",
  boots_stock: "\u{1F45F}",
  bibs: "\u{1F3BD}",
  goalkeeper_gear: "\u{1F9E4}",
  water_bottles: "\u{1FAD7}",
  tactics_board: "\u{1F4CB}",
};

function condColor(cond: number): string {
  if (cond >= 80) return "bg-pitch-400";
  if (cond >= 50) return "bg-gold-500";
  return "bg-card-red";
}

function condTextColor(cond: number): string {
  if (cond >= 80) return "text-pitch-400";
  if (cond >= 50) return "text-gold-600";
  return "text-card-red";
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
      title: `Vylepšit ${u.label}?`,
      description: u.description,
      details: [
        { label: "Efekt", value: u.effect, color: "text-pitch-500" },
        { label: "Cena", value: `-${formatCZK(u.cost)}`, color: "text-card-red" },
      ],
      confirmLabel: "Koupit",
    });
    if (!ok) return;
    setActing(u.category);
    await apiFetch(`/api/teams/${teamId}/equipment/upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: u.category }),
    }).catch(() => {});
    await refresh();
    setActing(null);
  };

  const handleRepair = async (r: RepairOption) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Opravit ${r.label}?`,
      description: "Stav se obnoví na 100%.",
      details: [{ label: "Cena", value: `-${formatCZK(r.cost)}`, color: "text-card-red" }],
      confirmLabel: "Opravit",
    });
    if (!ok) return;
    setActing("repair-" + r.category);
    await apiFetch(`/api/teams/${teamId}/equipment/repair`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: r.category }),
    }).catch(() => {});
    await refresh();
    setActing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !team) return <div className="page-container">Data nenalezena.</div>;

  const fx = data.effects;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Active effects summary */}
      <Card>
        <CardBody>
          <SectionLabel>Aktivní bonusy z vybavení</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {fx.trainingMultiplier > 1.01 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">+{Math.round((fx.trainingMultiplier - 1) * 100)}%</div>
                <div className="text-xs text-muted">Trénink</div>
              </div>
            )}
            {fx.moraleMod > 0 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">+{fx.moraleMod}</div>
                <div className="text-xs text-muted">Morálka</div>
              </div>
            )}
            {fx.injurySeverityMod > 0.01 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">-{Math.round(fx.injurySeverityMod * 100)}%</div>
                <div className="text-xs text-muted">Zranění</div>
              </div>
            )}
            {fx.conditionDrainMod > 0.01 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">-{Math.round(fx.conditionDrainMod * 100)}%</div>
                <div className="text-xs text-muted">Kondice</div>
              </div>
            )}
            {fx.teamChemistryMod > 0 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">+{fx.teamChemistryMod}</div>
                <div className="text-xs text-muted">Chemie</div>
              </div>
            )}
            {fx.gkBonus > 0 && (
              <div className="bg-surface rounded-xl p-2">
                <div className="font-heading font-bold text-pitch-500 text-sm">+{fx.gkBonus}</div>
                <div className="text-xs text-muted">Brankář</div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Equipment grid */}
      <Card>
        <CardBody>
          <SectionLabel>Stav vybavení</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.categories.map((cat) => (
              <div key={cat.key} className="bg-surface rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{CATEGORY_ICONS[cat.key] ?? "\u{1F4E6}"}</span>
                  <span className="font-heading font-bold text-xs">{cat.label}</span>
                </div>
                <div className="flex gap-1 mb-1.5">
                  {[0, 1, 2, 3].map((l) => (
                    <div key={l} className={`w-2.5 h-2.5 rounded-full ${l <= cat.level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                  <div className={`h-1.5 rounded-full transition-all ${condColor(cat.condition)}`} style={{ width: `${cat.condition}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-heading tabular-nums ${condTextColor(cat.condition)}`}>{cat.condition}%</span>
                </div>
                <p className="text-xs text-muted italic mt-1 leading-snug">{cat.description}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Upgrades */}
      {data.upgrades.length > 0 && (
        <Card>
          <CardBody>
            <SectionLabel>Vylepšení</SectionLabel>
            <div className="space-y-2">
              {data.upgrades.map((u) => {
                const canAfford = team.budget >= u.cost && !u.locked;
                return (
                  <div key={u.category} className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 ${u.locked ? "opacity-50" : ""}`}>
                    <span className="text-lg shrink-0">{CATEGORY_ICONS[u.category] ?? ""}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">
                        {u.label} <span className="text-muted font-normal">Lv.{u.currentLevel} &#8594; Lv.{u.nextLevel}</span>
                      </div>
                      <div className="text-xs text-pitch-500">{u.effect}</div>
                      {u.locked && u.lockReason && (
                        <div className="text-xs text-card-red mt-0.5">{"\u{1F512}"} {u.lockReason}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleUpgrade(u)}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                        canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {acting === u.category ? "..." : formatCZK(u.cost)}
                    </button>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Repairs */}
      {data.repairs.length > 0 && (
        <Card>
          <CardBody>
            <SectionLabel>Opravy a doplnění</SectionLabel>
            <div className="space-y-2">
              {data.repairs.map((r) => (
                <div key={r.category} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
                  <span className="text-lg shrink-0">{CATEGORY_ICONS[r.category] ?? ""}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-sm">{r.label}</div>
                    <div className="text-xs text-muted">
                      Stav: <span className={condTextColor(r.condition)}>{r.condition}%</span> &#8594; 100%
                    </div>
                  </div>
                  <button
                    onClick={() => handleRepair(r)}
                    disabled={team.budget < r.cost || !!acting}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                      team.budget >= r.cost ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {acting === "repair-" + r.category ? "..." : formatCZK(r.cost)}
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
