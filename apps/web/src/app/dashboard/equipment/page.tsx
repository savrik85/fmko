"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiAction, apiFetch, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm, LockDetail } from "@/components/ui";
import { SellDialog } from "./SellDialog";
import { BazarTab } from "./BazarTab";
import {
  EQUIPMENT_ICONS, condBarColor, condColor, daysLeft, formatCZK,
  type BazarData, type BazarListing, type EquipmentData, type MyListing,
  type RepairOption, type SellOption, type UpgradeOption,
} from "./types";

type Tab = "mine" | "bazar";

/**
 * Akční tlačítka na kartě vybavení (Koupit / Opravit / Prodat / Stáhnout).
 * Jsou pod sebou ve sloupci, takže musí mít stejný tvar i šířku — jinak to
 * vypadá jako tři náhodná tlačítka místo jedné sady.
 */
const CARD_BTN = "shrink-0 w-24 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors text-center";

// useSearchParams (deep-link ?tab=bazar) musí být pod Suspense, jinak build padá
// na prerenderu — stejný vzor jako liga/page.tsx:90.
export default function EquipmentPageWrapper() {
  return (
    <Suspense fallback={<div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>}>
      <EquipmentPage />
    </Suspense>
  );
}

function EquipmentPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<EquipmentData | null>(null);
  const [bazar, setBazar] = useState<BazarData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [bazarLoading, setBazarLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [selling, setSelling] = useState<SellOption | null>(null);
  const [bonusesOpen, setBonusesOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Deep-link z SMS a notifikací míří rovnou na bazar.
  const tab: Tab = searchParams.get("tab") === "bazar" ? "bazar" : "mine";
  const setTab = (next: Tab) => {
    router.replace(next === "bazar" ? "/dashboard/equipment?tab=bazar" : "/dashboard/equipment", { scroll: false });
  };

  const refresh = useCallback(async () => {
    if (!teamId) return;
    const [eq, t] = await Promise.all([
      apiFetch<EquipmentData>(`/api/teams/${teamId}/equipment`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setData(eq); setTeam(t);
  }, [teamId]);

  const refreshBazar = useCallback(async () => {
    if (!teamId) return;
    setBazarLoading(true);
    try {
      setBazar(await apiFetch<BazarData>(`/api/teams/${teamId}/equipment-market`));
    } catch (e) {
      console.error("bazar load failed:", e);
    } finally {
      setBazarLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch((e) => { console.error("equipment load failed:", e); setLoading(false); });
  }, [teamId, refresh]);

  useEffect(() => {
    if (tab === "bazar" && teamId && !bazar) refreshBazar();
  }, [tab, teamId, bazar, refreshBazar]);

  const refreshAll = async () => {
    await refresh();
    await refreshBazar();
  };

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
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment/upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: u.category }),
    }), "Vylepšení se nezdařilo")) await refreshAll();
    setActing(null);
  };

  /** Samotné provedení opravy. Bez potvrzení — to si řeší volající. */
  const repairNow = async (category: string) => {
    if (!teamId || acting) return;
    setActing("r-" + category);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment/repair`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }), "Oprava se nezdařila")) await refreshAll();
    setActing(null);
    setSelling(null);
  };

  const handleRepair = async (category: string, label: string, condition: number, cost: number) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Opravit ${label}?`,
      description: `Stav ${condition} % se obnoví na 100 %.`,
      details: [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }],
      confirmLabel: `Opravit za ${formatCZK(cost)}`,
    });
    if (!ok) return;
    await repairNow(category);
  };

  const handleList = async (category: string, price: number) => {
    if (!teamId || acting) return;
    setActing("sell-" + category);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment-market/list`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, price }),
    }), "Vystavení se nezdařilo")) {
      setSelling(null);
      await refreshAll();
    }
    setActing(null);
  };

  // Bez useConfirm — dialog prodeje je otevřený a druhý modal nad ním by se schoval
  // za něj. Potvrzení řeší SellDialog dvoukrokovým tlačítkem.
  const handlePawn = async (category: string) => {
    if (!teamId || acting || !selling) return;
    setActing("pawn-" + category);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment/pawn`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }), "Zastavení se nezdařilo")) {
      setSelling(null);
      await refreshAll();
    }
    setActing(null);
  };

  const handleWithdraw = async (listing: MyListing) => {
    if (!teamId || acting) return;
    setActing("w-" + listing.id);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment-market/${listing.id}`, { method: "DELETE" }),
      "Stažení se nezdařilo")) await refreshAll();
    setActing(null);
  };

  const handleBuy = async (l: BazarListing) => {
    if (!teamId || acting) return;
    // Level × stav — po koupi může efektivní úroveň i klesnout, ať to hráč vidí předem.
    const myEffective = data?.categories.find((c) => c.key === l.category)?.effectiveLevel ?? 0;
    const newEffective = Math.round(l.level * (l.condition / 100) * 10) / 10;

    const details = [
      { label: "Úroveň", value: `${l.myLevel} → ${l.level}`, color: "text-pitch-500" },
      { label: "Stav", value: `${l.condition} %`, color: condColor(l.condition) },
      { label: "Efektivní úroveň", value: `${myEffective} → ${newEffective}`, color: newEffective >= myEffective ? "text-pitch-500" : "text-card-red" },
      { label: "Cena", value: `-${formatCZK(l.price)}`, color: "text-card-red" },
    ];
    if (l.repairCostAfterBuy > 0) {
      details.push({ label: "Oprava na 100 %", value: formatCZK(l.repairCostAfterBuy), color: "text-muted" });
    }

    const ok = await confirm({
      title: `Koupit ${l.categoryLabel} od ${l.teamName}?`,
      description: newEffective < myEffective
        ? "Pozor: vybavení je sice vyšší úrovně, ale v horším stavu — efektivní úroveň ti klesne. Po opravě bude vyšší."
        : l.levelDescription,
      details,
      confirmLabel: `Koupit za ${formatCZK(l.price)}`,
    });
    if (!ok) return;
    setActing("b-" + l.id);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment-market/${l.id}/buy`, { method: "POST" }),
      "Nákup se nezdařil")) await refreshAll();
    setActing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !team) return <div className="page-container">Data nenalezena.</div>;

  const fx = data.effects;
  const activeEffects = [
    fx.trainingMultiplier > 1.01 && { label: "Trénink", value: `+${Math.round((fx.trainingMultiplier - 1) * 100)}%`, icon: "🏋" },
    fx.tacticsTrainingBonus > 0.01 && { label: "Taktický trénink", value: `+${Math.round(fx.tacticsTrainingBonus * 100)}%`, icon: "📋" },
    fx.matchTechniqueMod > 0 && { label: "Technika", value: `+${fx.matchTechniqueMod}`, icon: "⚡" },
    fx.moraleMod > 0 && { label: "Morálka", value: `+${fx.moraleMod}`, icon: "💪" },
    fx.injurySeverityMod > 0.01 && { label: "Ochrana", value: `-${Math.round(fx.injurySeverityMod * 100)}%`, icon: "🛡" },
    fx.conditionDrainMod > 0.01 && { label: "Výdrž", value: `-${Math.round(fx.conditionDrainMod * 100)}%`, icon: "🔋" },
    fx.gkBonus > 0 && { label: "Brankář", value: `+${fx.gkBonus}`, icon: "🧤" },
    fx.teamChemistryMod > 0 && { label: "Chemie", value: `+${fx.teamChemistryMod}`, icon: "🤝" },
    (fx.injuryDaysReduction ?? 0) > 0 && { label: "Ošetření", value: `zranění o ${fx.injuryDaysReduction} ${fx.injuryDaysReduction === 1 ? "den" : "dny"} kratší`, icon: "🩺" },
    (fx.attendanceBonus ?? 0) > 0.001 && { label: "Docházka", value: `+${Math.round((fx.attendanceBonus ?? 0) * 100)} p.b.`, icon: "🚐" },
    (fx.commuteAbsenceMod ?? 0) > 0.01 && { label: "Dojíždění", value: `-${Math.round((fx.commuteAbsenceMod ?? 0) * 100)}% absencí`, icon: "🛣" },
    (fx.conditionRegenBonus ?? 0) > 0 && { label: "Regenerace", value: `+${fx.conditionRegenBonus} denně`, icon: "💪" },
    (fx.setPiecesMod ?? 0) > 0 && { label: "Standardky", value: `+${fx.setPiecesMod}`, icon: "🧱" },
    (fx.moraleTargetBonus ?? 0) > 0 && { label: "Nálada kabiny", value: `+${fx.moraleTargetBonus}`, icon: "🍖" },
    (fx.crowdMod ?? 0) > 0.01 && { label: "Návštěva", value: `+${Math.round((fx.crowdMod ?? 0) * 100)}%`, icon: "📣" },
    (fx.weatherResistMod ?? 0) > 0.01 && { label: "Počasí", value: `-${Math.round((fx.weatherResistMod ?? 0) * 100)}% postih`, icon: "🧥" },
    (fx.youthTrainingMod ?? 0) > 0.01 && { label: "Mladíci", value: `+${Math.round((fx.youthTrainingMod ?? 0) * 100)}%`, icon: "📹" },
    (fx.equipCareMod ?? 0) > 0.01 && { label: "Údržba vybavení", value: `-${Math.round((fx.equipCareMod ?? 0) * 100)}% chátrání`, icon: "🧺" },
    (fx.pitchCareMod ?? 0) > 0.01 && { label: "Trávník", value: `${Math.round((fx.pitchCareMod ?? 0) * 100)}% dní bez opotřebení`, icon: "🚜" },
    (fx.hangoverMod ?? 0) > 0.01 && { label: "Kocovina", value: `-${Math.round((fx.hangoverMod ?? 0) * 100)}%`, icon: "☕" },
    (fx.lateFatigueMod ?? 0) > 0.01 && { label: "Únava v závěru", value: `-${Math.round((fx.lateFatigueMod ?? 0) * 100)}%`, icon: "🥤" },
    (fx.raffleIncomePerFan ?? 0) > 0 && { label: "Tombola", value: `+${fx.raffleIncomePerFan} Kč z diváka`, icon: "🎟" },
    (fx.fanSatisfactionMod ?? 0) > 0 && { label: "Atmosféra", value: `+${fx.fanSatisfactionMod} spokojenost`, icon: "🎙" },
    (fx.loyaltyMod ?? 0) > 0.01 && { label: "Věrnost", value: `truc -${Math.round((fx.loyaltyMod ?? 0) * 100)}%`, icon: "🏆" },
  ].filter(Boolean) as { label: string; value: string; icon: string }[];

  const sellByCategory = new Map((data.sellOptions ?? []).map((s) => [s.category, s]));
  const bazarCount = bazar?.listings.length ?? 0;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}
      <SellDialog
        option={selling}
        busy={!!acting}
        onClose={() => setSelling(null)}
        onList={handleList}
        onPawn={handlePawn}
        onRepair={repairNow}
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {([["mine", "Moje vybavení"], ["bazar", "Bazar"]] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}>
            {label}{key === "bazar" && bazarCount > 0 ? ` (${bazarCount})` : ""}
          </button>
        ))}
      </div>

      {tab === "bazar" ? (
        <BazarTab
          data={bazar}
          loading={bazarLoading}
          budget={team.budget}
          busy={acting}
          onBuy={handleBuy}
          onWithdraw={handleWithdraw}
        />
      ) : (
        <>
          {/* ═══ Active effects ═══ */}
          {/* Na mobilu se sbaluje — s 19 kategoriemi vytlačí seznam bonusů karty
              vybavení pod okraj obrazovky. Na širokém displeji je pořád rozbalené. */}
          {activeEffects.length > 0 && (
            <div className="card p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setBonusesOpen((v) => !v)}
                aria-expanded={bonusesOpen}
                className="w-full flex items-center justify-between gap-2 sm:pointer-events-none"
              >
                <SectionLabel>Aktivní bonusy ({activeEffects.length})</SectionLabel>
                <span className={`sm:hidden text-muted text-sm transition-transform ${bonusesOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              <div className={bonusesOpen ? "block" : "hidden sm:block"}>
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
            </div>
          )}

          {/* ═══ Equipment grid — cards ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.categories.map((cat) => {
              const upgrade = data.upgrades.find((u) => u.category === cat.key);
              const repair = data.repairs.find((r: RepairOption) => r.category === cat.key);
              const sell = sellByCategory.get(cat.key);
              const canUpgrade = upgrade && !upgrade.locked && team.budget >= upgrade.cost;
              const canRepair = repair && team.budget >= repair.cost;

              return (
                <div key={cat.key} className="card p-4">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">{EQUIPMENT_ICONS[cat.key] ?? "📦"}</span>
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
                        className={`${CARD_BTN} ${
                          canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}>
                        {acting === cat.key ? "..." : "Koupit"}
                      </button>
                    </div>
                  )}
                  {upgrade?.locked && (
                    <LockDetail detail={upgrade.lockDetail} hint={upgrade.lockHint} fallback={upgrade.lockReason} />
                  )}
                  {!upgrade && cat.level === 3 && (
                    <div className="text-xs text-pitch-600 font-heading font-bold mt-2">Maximální úroveň</div>
                  )}

                  {/* Repair */}
                  {repair && (
                    <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-gray-100">
                      <div className="text-sm text-muted">Oprava na 100% — <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(repair.cost)}</span></div>
                      <button onClick={() => handleRepair(repair.category, repair.label, repair.condition, repair.cost)} disabled={!canRepair || !!acting}
                        className={`${CARD_BTN} ${
                          canRepair ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}>
                        {acting === "r-" + cat.key ? "..." : "Opravit"}
                      </button>
                    </div>
                  )}

                  {/* Prodej — vystavené v bazaru vypadá jinak než dostupné k prodeji */}
                  {sell && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {sell.listingId ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-muted min-w-0">
                            🏷 V bazaru za <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(sell.listedPrice ?? 0)}</span>
                            <div className="text-xs">{sell.listedUntil ? daysLeft(sell.listedUntil) : ""}</div>
                          </div>
                          <button
                            onClick={() => handleWithdraw({ id: sell.listingId as string, category: sell.category, categoryLabel: sell.label, level: sell.level, price: sell.listedPrice ?? 0, condition: sell.condition, conditionAtListing: sell.condition, expiresAt: sell.listedUntil ?? "" })}
                            disabled={!!acting}
                            className={`${CARD_BTN} border border-gray-300 text-muted hover:text-ink hover:border-gray-400 disabled:opacity-50`}>
                            {acting === "w-" + sell.listingId ? "..." : "Stáhnout"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          {/* Při stavu 100 % se obě čísla rovnají a „od X, zastavárna X" mate. */}
                          <div className="text-sm text-muted">
                            {sell.bazarSuggested > sell.pawnQuote
                              ? <>Prodej — v bazaru kolem <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(sell.bazarSuggested)}</span>, zastavárna hned <span className="tabular-nums">{formatCZK(sell.pawnQuote)}</span></>
                              : <>Prodej — zastavárna dá <span className="font-heading font-bold text-ink tabular-nums">{formatCZK(sell.pawnQuote)}</span></>}
                          </div>
                          <button onClick={() => setSelling(sell)} disabled={!!acting}
                            className={`${CARD_BTN} border border-gray-300 text-muted hover:text-ink hover:border-gray-400 disabled:opacity-50`}>
                            Prodat
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
