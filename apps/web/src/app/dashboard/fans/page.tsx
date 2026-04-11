"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm } from "@/components/ui";

interface FansData {
  satisfaction: number;
  loyalty: number;
  expectedPerformance: number;
  baseTicketPrice: number;
  villageBaseTicketPrice: number;
  lastMatchDelta: number;
  lastMatchReasons: string[];
  manager: {
    reputation: number;
    motivation: number;
    matchBoost: number;
    weeklyLoyaltyBoost: number;
  } | null;
}

interface ProductTier {
  level: number;
  label: string;
  wholesalePrice: number;
  defaultSellPrice: number;
}

interface ConcessionProduct {
  key: string;
  label: string;
  baseDemandRate: number;
  qualityLevel: number;
  sellPrice: number;
  stockQuantity: number;
  tiers: ProductTier[];
}

interface ConcessionData {
  mode: "external" | "self";
  canSwitchToSelf: boolean;
  refreshmentsLevel: number;
  externalWeeklyIncome: number;
  products: ConcessionProduct[];
}

const PRODUCT_ICONS: Record<string, string> = {
  sausage: "🌭",
  beer: "🍺",
  lemonade: "🥤",
};


function formatCZK(v: number): string {
  return v.toLocaleString("cs") + " Kč";
}

function satBarColor(value: number): string {
  if (value >= 75) return "bg-pitch-500";
  if (value >= 50) return "bg-gold-500";
  if (value >= 25) return "bg-gold-600";
  return "bg-card-red";
}

function satTextColor(value: number): string {
  if (value >= 75) return "text-pitch-500";
  if (value >= 50) return "text-gold-600";
  return "text-card-red";
}

export default function FansPage() {
  const { teamId } = useTeam();
  const [fans, setFans] = useState<FansData | null>(null);
  const [concession, setConcession] = useState<ConcessionData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketPriceDraft, setTicketPriceDraft] = useState<string>("");
  const [productDrafts, setProductDrafts] = useState<Record<string, { sellPrice: string }>>({});
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [f, co, t] = await Promise.all([
      apiFetch<FansData>(`/api/teams/${teamId}/fans`),
      apiFetch<ConcessionData>(`/api/teams/${teamId}/concession`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setFans(f);
    setConcession(co);
    setTeam(t);
    // Předvyplnit cenu vstupenky: user override, jinak automatická podle obce
    const prefillPrice = f.baseTicketPrice > 0 ? f.baseTicketPrice : f.villageBaseTicketPrice;
    setTicketPriceDraft(String(prefillPrice));
    const drafts: Record<string, { sellPrice: string }> = {};
    for (const p of co.products) {
      drafts[p.key] = { sellPrice: String(p.sellPrice) };
    }
    setProductDrafts(drafts);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh()
      .then(() => setLoading(false))
      .catch((e) => {
        console.error("load fans failed:", e);
        setLoading(false);
      });
  }, [teamId]);

  const saveTicketPrice = async () => {
    if (!teamId) return;
    const parsed = parseInt(ticketPriceDraft, 10);
    if (isNaN(parsed) || parsed < 0) return;
    setActing("ticket");
    await apiFetch(`/api/teams/${teamId}/fans/ticket-price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseTicketPrice: parsed }),
    }).catch((e) => console.error("save ticket price failed:", e));
    await refresh();
    setActing(null);
  };

  const switchMode = async (mode: "external" | "self") => {
    if (!teamId || !concession) return;
    if (mode === "self" && !concession.canSwitchToSelf) return;
    setActing("mode-" + mode);
    const res = await apiFetch<{ error?: string }>(`/api/teams/${teamId}/concession/mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    }).catch((e) => {
      console.error("switch mode failed:", e);
      return { error: "Chyba při změně módu" };
    });
    if (res?.error) {
      alert(res.error);
    }
    await refresh();
    setActing(null);
  };

  const upgradeQuality = async (key: string, toLevel: number) => {
    if (!teamId || !concession) return;
    const product = concession.products.find((p) => p.key === key);
    if (!product) return;
    const targetTier = product.tiers[toLevel];
    const ok = await confirm({
      title: `Změnit kvalitu na ${targetTier.label}?`,
      description: `Nákup za ${targetTier.wholesalePrice} Kč/ks. Doporučená prodejní cena: ${targetTier.defaultSellPrice} Kč.`,
      confirmLabel: "Změnit kvalitu",
    });
    if (!ok) return;
    setActing("quality-" + key);
    await apiFetch(`/api/teams/${teamId}/concession/products/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualityLevel: toLevel, sellPrice: targetTier.defaultSellPrice }),
    }).catch((e) => console.error("upgrade quality failed:", e));
    await refresh();
    setActing(null);
  };

  const saveSellPrice = async (key: string) => {
    if (!teamId) return;
    const draft = productDrafts[key];
    if (!draft) return;
    const parsed = parseInt(draft.sellPrice, 10);
    if (isNaN(parsed) || parsed < 0) return;
    setActing("price-" + key);
    await apiFetch(`/api/teams/${teamId}/concession/products/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellPrice: parsed }),
    }).catch((e) => console.error("save sell price failed:", e));
    await refresh();
    setActing(null);
  };

  const doRestock = async (key: string) => {
    if (!teamId || !team || !concession) return;
    const qtyStr = restockQty[key] ?? "";
    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty) || qty <= 0) return;
    const product = concession.products.find((p) => p.key === key);
    if (!product) return;
    const tier = product.tiers[product.qualityLevel];
    const total = tier.wholesalePrice * qty;
    if (team.budget < total) {
      alert("Nedostatek peněz");
      return;
    }
    const ok = await confirm({
      title: `Doplnit sklad ${product.label}?`,
      description: `${qty} ks × ${tier.wholesalePrice} Kč (${tier.label})`,
      details: [{ label: "Celkem", value: `-${formatCZK(total)}`, color: "text-card-red" }],
      confirmLabel: `Nakoupit za ${formatCZK(total)}`,
    });
    if (!ok) return;
    setActing("restock-" + key);
    await apiFetch(`/api/teams/${teamId}/concession/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey: key, quantity: qty }),
    }).catch((e) => console.error("restock failed:", e));
    setRestockQty((r) => ({ ...r, [key]: "" }));
    await refresh();
    setActing(null);
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }
  if (!fans || !concession || !team) {
    return <div className="page-container">Nepodařilo se načíst data fanoušků.</div>;
  }

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* ═══ Satisfaction ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Spokojenost fanoušků</SectionLabel>

        <div className="grid grid-cols-3 gap-4 text-center mb-4">
          <div>
            <div className={`font-heading font-bold text-2xl tabular-nums ${satTextColor(fans.satisfaction)}`}>
              {fans.satisfaction}
            </div>
            <div className="text-sm text-muted">Spokojenost</div>
          </div>
          <div>
            <div className={`font-heading font-bold text-2xl tabular-nums ${satTextColor(fans.loyalty)}`}>
              {fans.loyalty}
            </div>
            <div className="text-sm text-muted">Loajalita</div>
          </div>
          <div>
            <div className="font-heading font-bold text-2xl tabular-nums text-ink">
              {fans.expectedPerformance}
            </div>
            <div className="text-sm text-muted">Očekávání</div>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>Spokojenost</span>
              <span>{fans.satisfaction} / 100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${satBarColor(fans.satisfaction)}`}
                style={{ width: `${fans.satisfaction}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>Loajalita (dlouhodobý baseline)</span>
              <span>{fans.loyalty} / 100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${satBarColor(fans.loyalty)}`}
                style={{ width: `${fans.loyalty}%` }}
              />
            </div>
          </div>
        </div>

        {(fans.lastMatchReasons.length > 0 || fans.lastMatchDelta !== 0) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-muted uppercase mb-2">Poslední zápas</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-heading font-bold text-base ${
                  fans.lastMatchDelta > 0
                    ? "text-pitch-500"
                    : fans.lastMatchDelta < 0
                    ? "text-card-red"
                    : "text-muted"
                }`}
              >
                {fans.lastMatchDelta > 0 ? "+" : ""}
                {fans.lastMatchDelta}
              </span>
              {fans.lastMatchReasons.map((r, i) => (
                <span
                  key={i}
                  className="text-sm bg-gray-100 px-2 py-1 rounded-full text-ink"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ Vstupné ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Vstupné</SectionLabel>
        <div className="text-sm text-muted mb-3">
          Základní cena se řídí velikostí obce a vybavením stadionu. Tady ji můžeš přebít vlastní hodnotou.
          Cena přes 1.2× běžné úrovně rozzlobí fanoušky.
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted block mb-1">
              Tvoje cena (0 = automaticky podle obce)
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={ticketPriceDraft}
              onChange={(e) => setTicketPriceDraft(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base tabular-nums"
            />
          </div>
          <button
            onClick={saveTicketPrice}
            disabled={acting === "ticket" || ticketPriceDraft === String(fans.baseTicketPrice)}
            className="py-2 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {acting === "ticket" ? "..." : "Uložit"}
          </button>
        </div>
      </div>

      {/* ═══ Občerstvení ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Občerstvení</SectionLabel>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => switchMode("external")}
            disabled={concession.mode === "external" || !!acting}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-heading font-bold transition-colors ${
              concession.mode === "external"
                ? "bg-pitch-500 text-white"
                : "bg-gray-100 text-ink hover:bg-gray-200"
            }`}
          >
            Externí provozovatel
          </button>
          <button
            onClick={() => switchMode("self")}
            disabled={concession.mode === "self" || !concession.canSwitchToSelf || !!acting}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-heading font-bold transition-colors ${
              concession.mode === "self"
                ? "bg-pitch-500 text-white"
                : !concession.canSwitchToSelf
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-ink hover:bg-gray-200"
            }`}
          >
            Vlastní provoz
          </button>
        </div>

        {!concession.canSwitchToSelf && concession.mode === "external" && (
          <div className="text-sm text-muted mb-3">
            Pro vlastní provoz potřebuješ alespoň L1 občerstvení na stadionu.
          </div>
        )}

        {concession.mode === "external" && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-muted mb-1">
              {concession.refreshmentsLevel === 0
                ? "Týdenní příjem z pronájmu plochy"
                : "Týdenní pasivní příjem z pronájmu bufetu"}
            </div>
            <div className="font-heading font-bold text-xl tabular-nums text-pitch-500">
              {formatCZK(concession.externalWeeklyIncome)}
            </div>
            <div className="text-xs text-muted mt-1">
              {concession.refreshmentsLevel === 0
                ? <>Externí provozovatel přijede s vlastním stánkem. Postav bufet na <a href="/dashboard/stadium" className="text-pitch-500 underline">stadionu</a> pro vyšší příjem.</>
                : "Bez starostí. Příjem škáluje s levelem občerstvení a reputací klubu."}
            </div>
          </div>
        )}

        {concession.mode === "self" && (
          <div className="space-y-3">
            <div className="text-sm text-muted bg-gray-50 rounded-lg px-3 py-2.5">
              Sklad se nečerpá automaticky — před každým domácím zápasem doplň zásoby. Bez zásob = nespokojení fanoušci.
            </div>

            {concession.products.map((p) => {
              const currentTier = p.tiers[p.qualityLevel];
              const priceDraft = productDrafts[p.key]?.sellPrice ?? String(p.sellPrice);
              const qty = restockQty[p.key] ?? "";
              const qtyNum = parseInt(qty, 10);
              const total = !isNaN(qtyNum) && qtyNum > 0 ? qtyNum * currentTier.wholesalePrice : 0;
              const stockEmpty = p.stockQuantity === 0;
              const stockLow = p.stockQuantity > 0 && p.stockQuantity < 20;
              return (
                <div key={p.key} className="card p-4">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="text-2xl">{PRODUCT_ICONS[p.key] ?? "🍽"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-bold">{p.label}</div>
                      <div className="text-xs text-muted">{currentTier.label}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-heading font-bold text-lg tabular-nums ${stockEmpty ? "text-card-red" : stockLow ? "text-gold-600" : "text-pitch-500"}`}>
                        {p.stockQuantity} <span className="text-xs font-normal text-muted">ks</span>
                      </div>
                      {stockEmpty && <div className="text-xs text-card-red">prázdno</div>}
                      {stockLow && <div className="text-xs text-gold-600">málo</div>}
                    </div>
                  </div>

                  {/* Quality tiers */}
                  <div className="flex gap-1 mb-3">
                    {p.tiers.slice(1).map((tier, idx) => {
                      const lvl = idx + 1;
                      const isActive = lvl === p.qualityLevel;
                      return (
                        <button
                          key={lvl}
                          onClick={() => upgradeQuality(p.key, lvl)}
                          disabled={isActive || !!acting}
                          className={`flex-1 py-1.5 px-1 rounded text-center transition-colors ${
                            isActive ? "bg-gold-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"
                          }`}
                        >
                          <div className="text-xs font-heading font-bold leading-tight truncate">{tier.label}</div>
                          <div className={`text-[10px] tabular-nums mt-0.5 ${isActive ? "text-white/80" : "text-muted"}`}>{tier.wholesalePrice} Kč/ks</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Price + restock */}
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted shrink-0">Prodejní cena <span className="text-ink">(doporučeno {currentTier.defaultSellPrice} Kč)</span></span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={0}
                          value={priceDraft}
                          onChange={(e) => setProductDrafts((d) => ({ ...d, [p.key]: { sellPrice: e.target.value } }))}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm tabular-nums text-right"
                        />
                        <span className="text-xs text-muted">Kč</span>
                        <button
                          onClick={() => saveSellPrice(p.key)}
                          disabled={acting === "price-" + p.key || priceDraft === String(p.sellPrice)}
                          className="py-1 px-3 rounded text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          {acting === "price-" + p.key ? "..." : "Uložit"}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted shrink-0">
                        {total > 0 ? <>Doplnit — celkem <span className="font-heading font-bold text-ink">{formatCZK(total)}</span></> : <>Doplnit sklad · {currentTier.wholesalePrice} Kč/ks</>}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={qty}
                          onChange={(e) => setRestockQty((r) => ({ ...r, [p.key]: e.target.value }))}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-sm tabular-nums text-right"
                        />
                        <span className="text-xs text-muted">ks</span>
                        <button
                          onClick={() => doRestock(p.key)}
                          disabled={acting === "restock-" + p.key || qtyNum <= 0 || isNaN(qtyNum)}
                          className="py-1 px-3 rounded text-xs font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          {acting === "restock-" + p.key ? "..." : "Nakoupit"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Trenér → Fanoušci ═══ */}
      {fans.manager && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Vliv trenéra na fanoušky</SectionLabel>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted">Reputace trenéra</div>
              <div className="font-heading font-bold text-lg tabular-nums">
                {fans.manager.reputation}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Motivace</div>
              <div className="font-heading font-bold text-lg tabular-nums">
                {fans.manager.motivation}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Dopad na každý zápas</div>
              <div
                className={`font-heading font-bold text-lg tabular-nums ${
                  fans.manager.matchBoost > 0
                    ? "text-pitch-500"
                    : fans.manager.matchBoost < 0
                    ? "text-card-red"
                    : "text-ink"
                }`}
              >
                {fans.manager.matchBoost > 0 ? "+" : ""}
                {fans.manager.matchBoost}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Týdenní drift loajality</div>
              <div
                className={`font-heading font-bold text-lg tabular-nums ${
                  fans.manager.weeklyLoyaltyBoost > 0
                    ? "text-pitch-500"
                    : fans.manager.weeklyLoyaltyBoost < 0
                    ? "text-card-red"
                    : "text-ink"
                }`}
              >
                {fans.manager.weeklyLoyaltyBoost > 0 ? "+" : ""}
                {fans.manager.weeklyLoyaltyBoost}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
