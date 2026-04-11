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

interface FansHistoryItem {
  id: string;
  matchId: string | null;
  gamedate: string;
  satisfactionBefore: number;
  satisfactionAfter: number;
  delta: number;
  reasons: string[];
  opponentName: string | null;
  result: "win" | "draw" | "loss" | null;
  attendance: number;
  createdAt: string;
}

interface SalesProduct {
  productKey: string;
  qualityLevel: number;
  sellPrice: number;
  wholesalePrice: number;
  soldCount: number;
  revenue: number;
  profit: number;
  stockout: boolean;
}

interface SalesMatch {
  matchId: string | null;
  gamedate: string;
  opponentName: string | null;
  result: "win" | "draw" | "loss" | null;
  attendance: number;
  products: SalesProduct[];
  totalRevenue: number;
  totalProfit: number;
}

type TabKey = "satisfaction" | "concession" | "sales";

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

function formatGamedate(s: string): string {
  const d = new Date(s.length > 10 ? s : s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function resultBadge(r: string | null): { label: string; cls: string } {
  if (r === "win") return { label: "V", cls: "bg-pitch-500 text-white" };
  if (r === "draw") return { label: "R", cls: "bg-gold-500 text-white" };
  if (r === "loss") return { label: "P", cls: "bg-card-red text-white" };
  return { label: "?", cls: "bg-gray-200 text-gray-500" };
}

/** SVG sparkline graf pro satisfaction history. Body jsou chronologicky od nejstaršího vlevo. */
function SatisfactionSparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="text-xs text-muted italic">Nedostatek dat pro graf (potřeba alespoň 2 zápasy)</div>;
  }
  const w = 600;
  const h = 80;
  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const toXY = (v: number, i: number) => {
    const x = padX + i * step;
    const y = padY + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
    return { x, y };
  };
  const path = points.map((v, i) => {
    const { x, y } = toXY(v, i);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${path} L${(padX + (points.length - 1) * step).toFixed(1)},${(padY + innerH).toFixed(1)} L${padX.toFixed(1)},${(padY + innerH).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      {/* Gridline 50% */}
      <line x1={padX} y1={padY + innerH / 2} x2={w - padX} y2={padY + innerH / 2} stroke="#e5e7eb" strokeDasharray="2,3" strokeWidth={1} />
      {/* Area fill */}
      <path d={areaPath} fill="rgba(45,95,45,0.08)" />
      {/* Line */}
      <path d={path} fill="none" stroke="#2d5f2d" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Body */}
      {points.map((v, i) => {
        const { x, y } = toXY(v, i);
        return <circle key={i} cx={x} cy={y} r={2.5} fill="#2d5f2d" />;
      })}
    </svg>
  );
}

export default function FansPage() {
  const { teamId } = useTeam();
  const [fans, setFans] = useState<FansData | null>(null);
  const [concession, setConcession] = useState<ConcessionData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [history, setHistory] = useState<FansHistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("satisfaction");
  const [ticketPriceDraft, setTicketPriceDraft] = useState<string>("");
  const [productDrafts, setProductDrafts] = useState<Record<string, { sellPrice: string }>>({});
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [f, co, t, h, s] = await Promise.all([
      apiFetch<FansData>(`/api/teams/${teamId}/fans`),
      apiFetch<ConcessionData>(`/api/teams/${teamId}/concession`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<{ items: FansHistoryItem[] }>(`/api/teams/${teamId}/fans/history?limit=20`),
      apiFetch<{ matches: SalesMatch[] }>(`/api/teams/${teamId}/concession/sales?limit=60`),
    ]);
    setFans(f);
    setConcession(co);
    setTeam(t);
    setHistory(h.items ?? []);
    setSalesHistory(s.matches ?? []);
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

  const tabs: { key: TabKey; label: string; icon: string; visible: boolean }[] = [
    { key: "satisfaction", label: "Spokojenost", icon: "\u{1F4CA}", visible: true },
    { key: "concession", label: "Občerstvení", icon: "\u{1F37A}", visible: true },
    { key: "sales", label: "Prodeje", icon: "\u{1F4C8}", visible: concession.mode === "self" },
  ];
  const visibleTabs = tabs.filter((t) => t.visible);
  const currentTab = visibleTabs.some((t) => t.key === activeTab) ? activeTab : "satisfaction";

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* ═══ Tab nav ═══ */}
      <div className="grid grid-cols-3 sm:flex sm:gap-1 gap-1 p-1 bg-gray-100 rounded-lg" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
        {visibleTabs.map((t) => {
          const active = t.key === currentTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`sm:flex-1 py-2 px-2 sm:px-3 rounded-md font-heading font-bold transition-colors flex items-center justify-center gap-1.5 ${
                active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span className="text-[11px] sm:text-sm leading-none">{t.label}</span>
            </button>
          );
        })}
      </div>

      {currentTab === "satisfaction" && (<>
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
        <div className="text-sm text-muted mb-4">
          Základní cena se řídí velikostí obce a vybavením stadionu. Tady ji můžeš přebít vlastní hodnotou.
          Cena přes 1.2× běžné úrovně rozzlobí fanoušky.
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-heading font-bold text-ink leading-tight">Tvoje cena</div>
            <div className="text-xs text-muted">0 = automaticky podle obce</div>
          </div>
          <input
            type="number"
            min={0}
            max={500}
            value={ticketPriceDraft}
            onChange={(e) => setTicketPriceDraft(e.target.value)}
            className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
          />
          <span className="text-xs text-muted shrink-0">Kč</span>
          <button
            onClick={saveTicketPrice}
            disabled={acting === "ticket" || ticketPriceDraft === String(fans.baseTicketPrice)}
            className={`shrink-0 py-1.5 px-4 rounded-lg text-xs font-heading font-bold transition-colors ${
              acting === "ticket" || ticketPriceDraft === String(fans.baseTicketPrice)
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-pitch-500 text-white hover:bg-pitch-600"
            }`}
          >
            {acting === "ticket" ? "..." : "Uložit"}
          </button>
        </div>
      </div>

      {/* ═══ Historie spokojenosti ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>
          {history.length > 0 ? `Historie spokojenosti (posledních ${history.length})` : "Historie spokojenosti"}
        </SectionLabel>

        {history.length === 0 ? (
          <div className="py-4 text-sm text-muted text-center">
            Zatím žádná historie. Po každém odehraném zápase se zde zobrazí vývoj spokojenosti,
            důvody její změny a návštěvnost.
          </div>
        ) : (
          <>
            {/* Sparkline — chronologicky od nejstaršího vlevo */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Vývoj spokojenosti</span>
                <span className="tabular-nums">
                  {history[history.length - 1].satisfactionAfter} → {history[0].satisfactionAfter}
                </span>
              </div>
              <SatisfactionSparkline
                points={[...history].reverse().map((h) => h.satisfactionAfter)}
              />
            </div>

            {/* Seznam zápasů */}
            <div className="space-y-2">
              {history.map((h) => {
                const badge = resultBadge(h.result);
                return (
                  <div key={h.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-heading font-bold ${badge.cls}`}>
                      {badge.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-heading font-bold text-ink">
                          {h.opponentName ?? "Neznámý soupeř"}
                        </span>
                        <span className="text-xs text-muted">{formatGamedate(h.gamedate)}</span>
                        {h.attendance > 0 && (
                          <span className="text-xs text-muted">· {h.attendance} diváků</span>
                        )}
                      </div>
                      {h.reasons.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {h.reasons.map((r, i) => (
                            <span key={i} className="text-xs text-muted">
                              {r}{i < h.reasons.length - 1 ? " ·" : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-heading font-bold text-sm tabular-nums ${
                        h.delta > 0 ? "text-pitch-500" : h.delta < 0 ? "text-card-red" : "text-muted"
                      }`}>
                        {h.delta > 0 ? "+" : ""}{h.delta}
                      </div>
                      <div className="text-xs text-muted tabular-nums">
                        {h.satisfactionBefore}→{h.satisfactionAfter}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      </>)}


      {currentTab === "concession" && (<>
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
                : "Týdenní pasivní příjem z pronájmu občerstvení"}
            </div>
            <div className="font-heading font-bold text-xl tabular-nums text-pitch-500">
              {formatCZK(concession.externalWeeklyIncome)}
            </div>
            <div className="text-xs text-muted mt-1">
              {concession.refreshmentsLevel === 0
                ? <>Externí provozovatel přijede s vlastním stánkem. Postav občerstvení na <a href="/dashboard/stadium" className="text-pitch-500 underline">stadionu</a> pro vyšší příjem.</>
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
                <div key={p.key} className="border border-gray-100 rounded-lg p-3">
                  {/* Header: ikona, název, aktuální tier, sklad */}
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

                  {/* Sell price */}
                  <div className="flex items-center gap-2 sm:gap-3 pt-3 border-t border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-heading font-bold text-ink leading-tight">Prodejní cena</div>
                      <div className="text-xs text-muted">doporučeno {currentTier.defaultSellPrice} Kč</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={priceDraft}
                      onChange={(e) => setProductDrafts((d) => ({ ...d, [p.key]: { sellPrice: e.target.value } }))}
                      className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
                    />
                    <span className="text-xs text-muted shrink-0 w-3 text-center">Kč</span>
                    <button
                      onClick={() => saveSellPrice(p.key)}
                      disabled={acting === "price-" + p.key || priceDraft === String(p.sellPrice)}
                      className={`shrink-0 w-[88px] py-1.5 px-2 rounded-lg text-xs font-heading font-bold transition-colors ${
                        acting === "price-" + p.key || priceDraft === String(p.sellPrice)
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-pitch-500 text-white hover:bg-pitch-600"
                      }`}
                    >
                      {acting === "price-" + p.key ? "..." : "Uložit"}
                    </button>
                  </div>

                  {/* Restock */}
                  <div className="flex items-center gap-2 sm:gap-3 mt-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-heading font-bold text-ink leading-tight">Doplnit sklad</div>
                      <div className="text-xs text-muted">{currentTier.wholesalePrice} Kč/ks</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={qty}
                      onChange={(e) => setRestockQty((r) => ({ ...r, [p.key]: e.target.value }))}
                      className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
                    />
                    <span className="text-xs text-muted shrink-0 w-3 text-center">ks</span>
                    <button
                      onClick={() => doRestock(p.key)}
                      disabled={acting === "restock-" + p.key || qtyNum <= 0 || isNaN(qtyNum)}
                      className={`shrink-0 w-[88px] py-1.5 px-2 rounded-lg text-xs font-heading font-bold transition-colors ${
                        acting === "restock-" + p.key || qtyNum <= 0 || isNaN(qtyNum)
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-gold-500 text-white hover:bg-gold-600"
                      }`}
                    >
                      {acting === "restock-" + p.key
                        ? "..."
                        : "Nakoupit"}
                    </button>
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
      </>)}

      {currentTab === "sales" && concession.mode === "self" && (<>
        {/* ═══ Prodeje občerstvení ═══ */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Prodeje občerstvení — posledních {salesHistory.length}</SectionLabel>

          {salesHistory.length === 0 ? (
            <div className="py-4 text-sm text-muted text-center">
              Zatím žádné prodeje. Po odehraném domácím zápase v režimu vlastního provozu
              zde uvidíš kolik jsi prodal každého produktu, výnos, zisk a jestli došlo zboží.
            </div>
          ) : (<>
            {/* Souhrn */}
            <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Celkový výnos</div>
                <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">
                  {formatCZK(salesHistory.reduce((s, m) => s + m.totalRevenue, 0))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Čistý zisk</div>
                <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">
                  {formatCZK(salesHistory.reduce((s, m) => s + m.totalProfit, 0))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Ø na zápas</div>
                <div className="font-heading font-bold text-lg tabular-nums text-ink">
                  {formatCZK(Math.round(salesHistory.reduce((s, m) => s + m.totalProfit, 0) / salesHistory.length))}
                </div>
              </div>
            </div>

            {/* Per match list */}
            <div className="space-y-3">
              {salesHistory.map((m, idx) => {
                const badge = resultBadge(m.result);
                return (
                  <div key={(m.matchId ?? "") + idx} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-heading font-bold ${badge.cls}`}>
                        {badge.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-sm text-ink">
                          {m.opponentName ?? "Neznámý soupeř"}
                        </div>
                        <div className="text-xs text-muted">
                          {formatGamedate(m.gamedate)} · {m.attendance} diváků
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-heading font-bold text-sm tabular-nums text-pitch-500">
                          {formatCZK(m.totalRevenue)}
                        </div>
                        <div className="text-xs text-muted">zisk {formatCZK(m.totalProfit)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-50">
                      {m.products.map((p) => (
                        <div key={p.productKey} className="text-xs">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span>{PRODUCT_ICONS[p.productKey] ?? "🍽"}</span>
                            <span className="font-heading font-bold tabular-nums text-ink">
                              {p.soldCount} ks
                            </span>
                            {p.stockout && <span className="text-card-red">⚠</span>}
                          </div>
                          <div className="text-muted tabular-nums">
                            {p.sellPrice} Kč → {formatCZK(p.revenue)}
                          </div>
                          <div className={`tabular-nums ${p.profit >= 0 ? "text-pitch-500" : "text-card-red"}`}>
                            {p.profit > 0 ? "+" : ""}{formatCZK(p.profit)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
        </div>
      </>)}
    </div>
  );
}
