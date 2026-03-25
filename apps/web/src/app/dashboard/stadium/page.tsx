"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm } from "@/components/ui";
import { StadiumView } from "@/components/stadium/stadium-view";

interface UpgradeOption {
  facility: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  locked?: boolean;
  lockReason?: string;
}

interface PitchAction {
  level: string;
  label: string;
  desc: string;
  cost: number;
  improvement: number;
}

interface PitchUpgrade {
  pitchType: string;
  label: string;
  desc: string;
  cost: number;
}

interface StadiumData {
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  upgrades: UpgradeOption[];
  pitchActions: PitchAction[];
  pitchUpgrades: PitchUpgrade[];
}

const FACILITY_ICONS: Record<string, string> = {
  changing_rooms: "🚪",
  showers: "🚿",
  refreshments: "🍺",
  lighting: "💡",
  stands: "🏟",
  parking: "🚗",
  fence: "🏗",
};

const FACILITY_LABELS: Record<string, string> = {
  changing_rooms: "Šatny",
  showers: "Sprchy",
  refreshments: "Občerstvení",
  lighting: "Osvětlení",
  stands: "Tribuny",
  parking: "Parkoviště",
  fence: "Oplocení",
};

const FACILITY_DESCRIPTIONS: Record<string, string[]> = {
  changing_rooms: ["Převlékání za autem", "Bouda s lavicí", "Šatna se skříňkami", "Moderní šatny s vyhříváním"],
  showers: ["Hadice na dvoře", "Jedna sprcha se studenou vodou", "Sprchy s teplou vodou", "Sprchy s masážními tryskami"],
  refreshments: ["Žádné", "Termoska s čajem", "Stánek s pivem a párkem", "Bufet s grillem a točeným"],
  lighting: ["Žádné", "Pár lamp na stožáru", "Základní osvětlení hřiště", "Plné floodlighty"],
  stands: ["Diváci stojí kolem hřiště", "Pár laviček", "Dřevěná tribuna se střechou", "Betonová tribuna se sedačkami"],
  parking: ["Žádné", "Louka vedle hřiště", "Štěrkové parkoviště", "Asfaltové parkoviště s čarami"],
  fence: ["Žádné", "Provizorní páska", "Drátěný plot", "Zděné oplocení s branami"],
};

const LEVEL_LABELS = ["Žádné", "Základní", "Dobré", "Vynikající"];

function pitchColor(condition: number): string {
  if (condition >= 80) return "text-pitch-500";
  if (condition >= 60) return "text-pitch-600";
  if (condition >= 40) return "text-gold-600";
  return "text-card-red";
}

function pitchBarColor(condition: number): string {
  if (condition >= 80) return "bg-pitch-400";
  if (condition >= 60) return "bg-pitch-500";
  if (condition >= 40) return "bg-gold-500";
  return "bg-card-red";
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

export default function StadiumPage() {
  const { teamId } = useTeam();
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [s, t] = await Promise.all([
      apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setStadium(s); setTeam(t);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  const handleUpgrade = async (facility: string, label: string, cost: number, effect: string) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Vylepšit ${label}?`,
      description: effect,
      details: [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }],
      confirmLabel: `Koupit za ${formatCZK(cost)}`,
    });
    if (!ok) return;
    setActing(facility);
    await apiFetch(`/api/teams/${teamId}/stadium/upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facility }),
    }).catch(() => {});
    await refresh();
    setActing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!stadium || !team) return <div className="page-container">Stadion nenalezen.</div>;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* ═══ Stadium visualization + stats ═══ */}
      <div className="card p-4 sm:p-5">
        <StadiumView
          pitchCondition={stadium.pitchCondition}
          pitchType={stadium.pitchType}
          facilities={stadium.facilities}
          teamColor={team.primary_color}
        />
        <div className="grid grid-cols-3 gap-4 text-center mt-4 pt-4 border-t border-gray-100">
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">{stadium.capacity}</div>
            <div className="text-sm text-muted">Kapacita</div>
          </div>
          <div>
            <div className={`font-heading font-bold text-xl tabular-nums ${pitchColor(stadium.pitchCondition)}`}>{stadium.pitchCondition}%</div>
            <div className="text-sm text-muted">Trávník</div>
          </div>
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">
              {stadium.pitchType === "natural" ? "Přírodní" : stadium.pitchType === "hybrid" ? "Hybridní" : "Umělý"}
            </div>
            <div className="text-sm text-muted">Povrch</div>
          </div>
        </div>
      </div>

      {/* ═══ Pitch maintenance ═══ */}
      {(stadium.pitchActions.length > 0 || stadium.pitchUpgrades.length > 0) && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Údržba trávníku</SectionLabel>

          {/* Condition bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted uppercase">Stav trávníku</span>
              <span className={`text-sm font-heading font-bold tabular-nums ${pitchColor(stadium.pitchCondition)}`}>{stadium.pitchCondition}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${pitchBarColor(stadium.pitchCondition)}`} style={{ width: `${stadium.pitchCondition}%` }} />
            </div>
          </div>

          {stadium.pitchActions.length > 0 && (
            <div className="space-y-2 mb-3">
              {stadium.pitchActions.map((a) => {
                const canAfford = team.budget >= a.cost;
                return (
                  <div key={a.level} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">🌿</span>
                      <div>
                        <div className="font-heading font-bold text-sm">{a.label} <span className="text-muted">—</span> <span className="font-heading font-bold tabular-nums">{formatCZK(a.cost)}</span></div>
                        <div className="text-xs text-muted">{a.desc} · +{a.improvement}% stav</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: a.label,
                          description: a.desc,
                          details: [
                            { label: "Zlepšení", value: `+${a.improvement}%`, color: "text-pitch-500" },
                            { label: "Cena", value: `-${formatCZK(a.cost)}`, color: "text-card-red" },
                          ],
                          confirmLabel: `Provést za ${formatCZK(a.cost)}`,
                        });
                        if (!ok || !teamId) return;
                        setActing("pitch-" + a.level);
                        await apiFetch(`/api/teams/${teamId}/stadium/maintain-pitch`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ level: a.level }),
                        }).catch(() => {});
                        await refresh();
                        setActing(null);
                      }}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold transition-colors ${
                        canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {acting === "pitch-" + a.level ? "..." : "Provést"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {stadium.pitchUpgrades.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs text-muted font-heading uppercase mb-2">Upgrade povrchu</div>
              {stadium.pitchUpgrades.map((u) => {
                const canAfford = team.budget >= u.cost;
                return (
                  <div key={u.pitchType} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{u.pitchType === "hybrid" ? "🌾" : "🟩"}</span>
                      <div>
                        <div className="font-heading font-bold text-sm">{u.label} <span className="text-muted">—</span> <span className="font-heading font-bold tabular-nums">{formatCZK(u.cost)}</span></div>
                        <div className="text-xs text-muted">{u.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Upgrade na ${u.label}?`,
                          description: u.desc,
                          details: [{ label: "Cena", value: `-${formatCZK(u.cost)}`, color: "text-card-red" }],
                          confirmLabel: `Upgradovat za ${formatCZK(u.cost)}`,
                        });
                        if (!ok || !teamId) return;
                        setActing("pitch-up-" + u.pitchType);
                        await apiFetch(`/api/teams/${teamId}/stadium/upgrade-pitch`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pitchType: u.pitchType }),
                        }).catch(() => {});
                        await refresh();
                        setActing(null);
                      }}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold transition-colors ${
                        canAfford ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {acting === "pitch-up-" + u.pitchType ? "..." : "Upgradovat"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Facilities grid — cards ═══ */}
      <SectionLabel>Zázemí</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(stadium.facilities).map(([key, level]) => {
          const upgrade = stadium.upgrades.find((u) => u.facility === key);
          const canUpgrade = upgrade && !upgrade.locked && team.budget >= upgrade.cost;

          return (
            <div key={key} className="card p-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-2xl">{FACILITY_ICONS[key] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold">{FACILITY_LABELS[key] ?? key}</div>
                  <div className="text-xs text-muted">{FACILITY_DESCRIPTIONS[key]?.[level] ?? LEVEL_LABELS[level]}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {[1, 2, 3].map((l) => (
                    <div key={l} className={`w-3 h-3 rounded-full ${l <= level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>

              {/* Upgrade info + action */}
              {upgrade && !upgrade.locked && (
                <div className="flex items-center justify-between gap-3 mt-1">
                  <div>
                    <div className="text-sm">
                      <span className="font-heading font-bold">Lv.{upgrade.nextLevel}</span>{" "}
                      <span className="text-muted">—</span>{" "}
                      <span className="font-heading font-bold tabular-nums">{formatCZK(upgrade.cost)}</span>
                    </div>
                    <div className="text-xs text-pitch-600">{upgrade.effect}</div>
                  </div>
                  <button
                    onClick={() => handleUpgrade(upgrade.facility, upgrade.label, upgrade.cost, upgrade.effect)}
                    disabled={!canUpgrade || !!acting}
                    className={`shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold transition-colors ${
                      canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {acting === key ? "..." : "Koupit"}
                  </button>
                </div>
              )}
              {upgrade?.locked && (
                <div className="text-xs text-muted mt-2">🔒 {upgrade.lockReason}</div>
              )}
              {!upgrade && level === 3 && (
                <div className="text-sm text-pitch-600 font-heading font-bold mt-2">Maximální úroveň</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
