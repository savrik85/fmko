"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, useConfirm } from "@/components/ui";
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
  changing_rooms: "\u{1F6AA}",
  showers: "\u{1F6BF}",
  refreshments: "\u{1F37A}",
  lighting: "\u{1F4A1}",
  stands: "\u{1F3DF}",
  parking: "\u{1F697}",
  fence: "\u{1F3D7}",
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

const LEVEL_LABELS = ["Žádné", "Základní", "Dobré", "Vynikající"];

function pitchLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Výborný", color: "text-pitch-400" };
  if (condition >= 60) return { text: "Dobrý", color: "text-pitch-500" };
  if (condition >= 40) return { text: "Průměrný", color: "text-gold-600" };
  if (condition >= 20) return { text: "Špatný", color: "text-card-red" };
  return { text: "Bahno", color: "text-card-red" };
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

export default function StadiumPage() {
  const { teamId } = useTeam();
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]).then(([s, t]) => {
      setStadium(s); setTeam(t); setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  const { confirm, dialog: confirmDialog } = useConfirm();

  const handleUpgrade = async (facility: string, label: string, cost: number, effect: string) => {
    if (!teamId || upgrading) return;
    const ok = await confirm({
      title: `Vylepšit ${label}?`,
      description: effect,
      details: [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }],
      confirmLabel: "Koupit",
    });
    if (!ok) return;
    setUpgrading(facility);
    try {
      await apiFetch(`/api/teams/${teamId}/stadium/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility }),
      });
      // Refresh data
      const [s, t] = await Promise.all([
        apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
        apiFetch<Team>(`/api/teams/${teamId}`),
      ]);
      setStadium(s); setTeam(t);
    } catch { /* ignore */ }
    setUpgrading(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!stadium || !team) return <div className="page-container">Stadion nenalezen.</div>;

  const pitch = pitchLabel(stadium.pitchCondition);

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Stadium visualization */}
      <Card>
        <CardBody>
          <StadiumView
            pitchCondition={stadium.pitchCondition}
            pitchType={stadium.pitchType}
            facilities={stadium.facilities}
            teamColor={team.primary_color}
          />
          <div className="grid grid-cols-3 gap-4 text-center mt-3 pt-3 border-t border-gray-100">
            <div>
              <div className="font-heading font-bold text-lg tabular-nums text-ink">{stadium.capacity}</div>
              <div className="text-xs text-muted">Kapacita</div>
            </div>
            <div>
              <div className={`font-heading font-bold text-lg tabular-nums ${pitch.color}`}>{stadium.pitchCondition}%</div>
              <div className="text-xs text-muted">Trávník</div>
            </div>
            <div>
              <div className="font-heading font-bold text-lg tabular-nums text-ink">
                {stadium.pitchType === "natural" ? "Přírodní" : stadium.pitchType === "hybrid" ? "Hybridní" : "Umělý"}
              </div>
              <div className="text-xs text-muted">Povrch</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Pitch maintenance */}
      {(stadium.pitchActions.length > 0 || stadium.pitchUpgrades.length > 0) && (
        <Card>
          <CardBody>
            <SectionLabel>Údržba trávníku</SectionLabel>
            {stadium.pitchActions.length > 0 && (
              <div className="space-y-2 mb-3">
                {stadium.pitchActions.map((a) => {
                  const canAfford = team.budget >= a.cost;
                  return (
                    <div key={a.level} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
                      <span className="text-lg shrink-0">{"\u{1F33F}"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-sm">{a.label}</div>
                        <div className="text-xs text-muted">{a.desc} &middot; +{a.improvement}% stav</div>
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
                            confirmLabel: "Provést",
                          });
                          if (!ok || !teamId) return;
                          await apiFetch(`/api/teams/${teamId}/stadium/maintain-pitch`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ level: a.level }),
                          }).catch(() => {});
                          const [s, t] = await Promise.all([
                            apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
                            apiFetch<Team>(`/api/teams/${teamId}`),
                          ]);
                          setStadium(s); setTeam(t);
                        }}
                        disabled={!canAfford}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                          canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {formatCZK(a.cost)}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {stadium.pitchUpgrades.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-muted font-heading uppercase mb-1">Upgrade povrchu</div>
                {stadium.pitchUpgrades.map((u) => {
                  const canAfford = team.budget >= u.cost;
                  return (
                    <div key={u.pitchType} className="flex items-center gap-3 py-2">
                      <span className="text-lg shrink-0">{u.pitchType === "hybrid" ? "\u{1F33E}" : "\u{1F7E9}"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-sm">{u.label}</div>
                        <div className="text-xs text-muted">{u.desc}</div>
                      </div>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Upgrade na ${u.label}?`,
                            description: u.desc,
                            details: [{ label: "Cena", value: `-${formatCZK(u.cost)}`, color: "text-card-red" }],
                            confirmLabel: "Upgradovat",
                          });
                          if (!ok || !teamId) return;
                          await apiFetch(`/api/teams/${teamId}/stadium/upgrade-pitch`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ pitchType: u.pitchType }),
                          }).catch(() => {});
                          const [s, t] = await Promise.all([
                            apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
                            apiFetch<Team>(`/api/teams/${teamId}`),
                          ]);
                          setStadium(s); setTeam(t);
                        }}
                        disabled={!canAfford}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                          canAfford ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {formatCZK(u.cost)}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Facilities */}
      <Card>
        <CardBody>
          <SectionLabel>Zázemí</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stadium.facilities).map(([key, level]) => (
              <div key={key} className="bg-surface rounded-xl p-3 text-center">
                <div className="text-xl mb-1">{FACILITY_ICONS[key] ?? ""}</div>
                <div className="font-heading font-bold text-sm">{FACILITY_LABELS[key] ?? key}</div>
                <div className="flex justify-center gap-1 mt-1.5">
                  {[0, 1, 2, 3].map((l) => (
                    <div key={l} className={`w-2.5 h-2.5 rounded-full ${l <= level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
                <div className="text-xs text-muted mt-1">{LEVEL_LABELS[level]}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Upgrades */}
      {stadium.upgrades.length > 0 && (
        <Card>
          <CardBody>
            <SectionLabel>Vylepšení</SectionLabel>
            <div className="space-y-2">
              {stadium.upgrades.map((u) => {
                const canAfford = team.budget >= u.cost && !u.locked;
                return (
                  <div key={u.facility} className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 ${u.locked ? "opacity-50" : ""}`}>
                    <span className="text-xl shrink-0">{FACILITY_ICONS[u.facility] ?? ""}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold text-sm">
                        {u.label} <span className="text-muted font-normal">Lv.{u.currentLevel} &#8594; Lv.{u.nextLevel}</span>
                      </div>
                      <div className="text-xs text-muted">{u.effect}</div>
                      {u.locked && u.lockReason && (
                        <div className="text-xs text-card-red mt-0.5">{"\u{1F512}"} {u.lockReason}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleUpgrade(u.facility, u.label, u.cost, u.effect)}
                      disabled={!canAfford || upgrading === u.facility}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                        canAfford
                          ? "bg-pitch-500 text-white hover:bg-pitch-600"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {upgrading === u.facility ? "..." : formatCZK(u.cost)}
                    </button>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
