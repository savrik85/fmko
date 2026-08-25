"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MANAGER_FANS, MANAGER_FANS_BANDS } from "@okresni-masina/shared";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm, Tabs } from "@/components/ui";
import { BusSelector } from "../match/BusSelector";

interface ScheduleMatch {
  id: string;
  status: string;
  awayName: string;
  scheduledAt: string | null;
  isHome: boolean;
  isCup?: boolean;
  roundName?: string | null;
  promoted?: boolean;
  promotionCost?: number | null;
}

interface FansData {
  satisfaction: number;
  loyalty: number;
  expectedPerformance: number;
  baseTicketPrice: number;
  villageBaseTicketPrice: number;
  lastMatchDelta: number;
  lastMatchReasons: string[];
  manager: {
    name: string;
    reputation: number;
    motivation: number;
    influence: number;
    neutral: number;
    repWeight: number;
    motWeight: number;
    repPoints: number;
    motPoints: number;
    bandKey: string;
    bandLabel: string;
    bandFanView: string;
    matchBoost: number;
    loyaltyOffset: number;
    pointsToNext: number;
    repPointsToNext: number;
    motPointsToNext: number;
    nextBandLabel: string | null;
    nextBandBoost: number | null;
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

interface ConcessionDemandHint {
  key: string;
  label: string;
  factor: number;
  hint: string;
}

interface NextHomeMatch {
  scheduledAt: string;
  opponent: string;
  isCup: boolean;
  forecast: { icon: string; expected: string; temperature: number; description: string };
  /** Teplota zápasu. Táž hodnota pohání tipy i skutečný prodej. */
  avgTemperature: number | null;
  hints: ConcessionDemandHint[];
}



interface ConcessionData {
  mode: "external" | "self";
  canSwitchToSelf: boolean;
  refreshmentsLevel: number;
  externalWeeklyIncome: number;
  products: ConcessionProduct[];
  /** Nejbližší domácí zápas. Null, když žádný nenaplánovaný není. */
  nextHome: NextHomeMatch | null;
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
  /** Pohárový zápas — soupeř se dohledává v jiných tabulkách než liga. */
  isCup?: boolean;
  attendance: number;
  products: SalesProduct[];
  totalRevenue: number;
  totalProfit: number;
}

type TabKey = "fanbase" | "satisfaction" | "concession" | "sales";

interface FanbaseTier {
  hardcore: number;
  regular: number;
  casual: number;
}

interface FanbaseSatellite {
  villageId: string;
  villageName: string;
  population: number;
  distanceKm: number;
  conversionMod: number;
  casualCount: number;
  regularCount: number;
  hardcoreCount: number;
  consecutiveBuses: number;
}

interface FanbaseData {
  tiers: FanbaseTier;
  totalLoyal: number;
  sources: {
    home: { hardcore: number; regular: number; casual: number };
    promo: { casual: number };
    satellites: { hardcore: number; regular: number; casual: number };
  };
  homeVillage: { id: string; name: string; population: number };
  capacity: number;
  reputation: number;
  satellites: FanbaseSatellite[];
  promo: {
    consecutive: number;
    unpromotedStreak: number;
    casualFromPromo: number;
    nextThreshold: number | null;
  };
  progression: {
    casualToRegularStreak: number;
    casualToRegularNeeded: number;
    regularToHardcoreStreak: number;
    regularToHardcoreNeeded: number;
  };
  expectedNextHomeAttendance: number;
  expectedBreakdown: { hardcore: number; regular: number; casual: number; walkUp: number };
  homeAdvantageModifier: number;
  homeAdvantageBreakdown: { fromFans: number; atmosphere: number };
}

interface FanbaseHistoryPoint {
  gamedate: string;
  hardcore: number;
  regular: number;
  casual: number;
  totalLoyal: number;
  reputation: number;
  satisfaction: number | null;
}

const PRODUCT_ICONS: Record<string, string> = {
  sausage: "🌭",
  beer: "🍺",
  lemonade: "🥤",
  mulled_wine: "🍷",
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

/** Výsledek slovem — písmeno V se plete s „venku". */
function resultLabel(r: string | null): { text: string; cls: string } {
  if (r === "win") return { text: "Výhra", cls: "text-pitch-600" };
  if (r === "draw") return { text: "Remíza", cls: "text-gold-600" };
  if (r === "loss") return { text: "Prohra", cls: "text-card-red" };
  return { text: "", cls: "" };
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
  const [activeTab, setActiveTab] = useState<TabKey>("fanbase");
  const [fanbase, setFanbase] = useState<FanbaseData | null>(null);
  const [fanbaseHistory, setFanbaseHistory] = useState<FanbaseHistoryPoint[]>([]);
  const [nextHomeMatch, setNextHomeMatch] = useState<ScheduleMatch | null>(null);
  const [promotionPrice, setPromotionPrice] = useState<number | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [ticketPriceDraft, setTicketPriceDraft] = useState<string>("");
  const [productDrafts, setProductDrafts] = useState<Record<string, { sellPrice: string }>>({});
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [f, co, t, h, s, fb, fbh, sched] = await Promise.all([
      apiFetch<FansData>(`/api/teams/${teamId}/fans`).catch((e) => {
        console.error("load fans data:", e);
        return null;
      }),
      apiFetch<ConcessionData>(`/api/teams/${teamId}/concession`).catch((e) => {
        console.error("load concession:", e);
        return null;
      }),
      apiFetch<Team>(`/api/teams/${teamId}`).catch((e) => {
        console.error("load team:", e);
        return null;
      }),
      apiFetch<{ items: FansHistoryItem[] }>(`/api/teams/${teamId}/fans/history?limit=20`).catch((e) => {
        console.error("load fans history:", e);
        return { items: [] };
      }),
      apiFetch<{ matches: SalesMatch[] }>(`/api/teams/${teamId}/concession/sales?limit=60`).catch((e) => {
        console.error("load concession sales:", e);
        return { matches: [] };
      }),
      apiFetch<FanbaseData>(`/api/teams/${teamId}/fanbase`).catch((e) => {
        console.error("load fanbase:", e);
        return null;
      }),
      apiFetch<{ history: FanbaseHistoryPoint[] }>(`/api/teams/${teamId}/fanbase/history?days=60`).catch((e) => {
        console.error("load fanbase history:", e);
        return { history: [] };
      }),
      apiFetch<{ matches: ScheduleMatch[]; promotionPrice?: number }>(`/api/teams/${teamId}/schedule`).catch((e) => {
        console.error("load schedule for fans page:", e);
        return { matches: [] as ScheduleMatch[] };
      }),
    ]);
    if (!f || !co || !t || !fb) {
      console.error("fans page: chybí povinná data, neukazuju refresh");
      return;
    }
    setFans(f);
    setConcession(co);
    setTeam(t);
    setHistory(h.items ?? []);
    setSalesHistory(s.matches ?? []);
    setFanbase(fb);
    setFanbaseHistory(fbh.history ?? []);
    // Propagace i doprava fanoušků fungují pro ligové, přátelské i pohárové domácí zápasy.
    const home = sched.matches.find((m) => m.status !== "simulated" && m.isHome) ?? null;
    setNextHomeMatch(home);
    setPromotionPrice((sched as { promotionPrice?: number }).promotionPrice ?? null);
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

  const promoteNext = async () => {
    if (!teamId || !nextHomeMatch || promoting) return;
    const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";
    const ok = await confirm({
      title: `Propagovat zápas proti ${nextHomeMatch.awayName}?`,
      description: `Doma · ${nextHomeMatch.scheduledAt ? new Date(nextHomeMatch.scheduledAt).toLocaleDateString("cs") : ""}. Vyjde článek ve Zpravodaji a přijde +25 % diváků.`,
      details: [{ label: "Cena", value: `-${priceStr}`, color: "text-card-red" }],
      confirmLabel: promotionPrice != null ? `Propagovat za ${priceStr}` : "Propagovat",
    });
    if (!ok) return;
    setPromoting(true);
    const res = await apiFetch<{ ok?: boolean; error?: string }>(
      `/api/teams/${teamId}/matches/${nextHomeMatch.id}/promote`,
      { method: "POST" },
    ).catch((e) => {
      console.error("promote from fans:", e);
      return { error: "Chyba při propagaci" };
    });
    setPromoting(false);
    if (res?.error) {
      showError("Chyba", res.error ?? "Zkus to prosím znovu.");
      return;
    }
    await refresh();
  };

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
      showError("Chyba", res.error ?? "Zkus to prosím znovu.");
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
      showError("Nedostatek peněz", "Potřebuješ víc peněz na rozpočtu.");
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
    { key: "fanbase", label: "Základna", icon: "\u{1F465}", visible: true },
    { key: "satisfaction", label: "Spokojenost", icon: "\u{1F4CA}", visible: true },
    { key: "concession", label: "Občerstvení", icon: "\u{1F37A}", visible: true },
    { key: "sales", label: "Prodeje", icon: "\u{1F4C8}", visible: concession.mode === "self" },
  ];
  const visibleTabs = tabs.filter((t) => t.visible);
  const currentTab = visibleTabs.some((t) => t.key === activeTab) ? activeTab : "fanbase";

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* ═══ Tab nav ═══ */}
      <Tabs
        value={currentTab}
        onChange={setActiveTab}
        ariaLabel="Fanoušci"
        items={visibleTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
      />

      {currentTab === "fanbase" && fanbase && (<>
      {/* ═══ Jak to funguje — jednoduchý úvod ═══ */}
      <details className="card p-4 sm:p-5 group">
        <summary className="cursor-pointer font-heading font-bold text-sm flex items-center justify-between">
          <span>💡 Jak to s fanoušky funguje</span>
          <span className="text-xs text-muted group-open:hidden">rozbalit</span>
          <span className="text-xs text-muted hidden group-open:inline">sbalit</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>Fanoušci se dělí na tři druhy podle toho, jak ti jsou věrní:</p>
          <ul className="space-y-1.5 ml-4 list-disc">
            <li><strong className="text-card-red">🟥 Tvrdé jádro</strong> — ti, co přijdou vždycky. I když prší, i když prohráváš. Když je jich hodně, mužstvo se cítí silně doma.</li>
            <li><strong className="text-gold-600">🟧 Pravidelní</strong> — chodí skoro pořád. Po dlouhé sérii proher pár z nich začne chybět, ale většinou se vrátí.</li>
            <li><strong className="text-gold-500">🟨 Občasní</strong> — přijdou když mají náladu. Tihle se snadno nadchnou, ale taky snadno přestanou chodit.</li>
          </ul>

          <p className="pt-2">Fanoušci ti přibývají třemi způsoby:</p>
          <ol className="space-y-1.5 ml-4 list-decimal">
            <li><strong>Z vlastní vesnice</strong> — automaticky podle počtu obyvatel. Když chodíš stabilně domů, občasní se časem stávají pravidelnými, pravidelní pak tvrdým jádrem.</li>
            <li><strong>Z propagace</strong> (📢) — zaplatíš si článek ve zpravodaji a přitáhneš víc lidí. Když propaguješ <strong>3 zápasy po sobě</strong>, část z nich u tebe zůstane natrvalo.</li>
            <li><strong>Z autobusů</strong> (🚌) — pošleš bus do sousední vesnice a doveze 8 až 45 lidí (podle velikosti). Když posíláš bus do stejné obce <strong>3 zápasy po sobě</strong>, ze čtvrtiny cestujících se stanou tví stálí fanoušci.</li>
          </ol>

          <p className="pt-2">Pár věcí, na které si dej pozor:</p>
          <ul className="space-y-1.5 ml-4 list-disc">
            <li><strong>Vzdálenost rozhoduje.</strong> Bližší obec = víc lidí u tebe zůstane natrvalo. Z 2 km zůstane víc než dvojnásobek toho, co z 10 km. Velký bus do daleké obce přiveze sice hodně diváků, ale do stálých se jich přepíše málo.</li>
            <li><strong>Vyplatí se vydržet.</strong> Posílej bus pravidelně. Když ho přestaneš platit, lidi z té obce postupně přestanou chodit — po 3 nepokrytých zápasech ti polovina utíká.</li>
            <li><strong>Líp 3 různé obce než 3× ta samá.</strong> Když pošleš každý zápas bus jinam, dostáváš trvalé fanoušky ze tří míst zároveň. Když lítáš jen do jedné obce, máš sice plnější tribunu hned, ale dlouhodobě tě to omezí.</li>
          </ul>

          <p className="pt-2 text-xs text-muted italic">
            Pro malou vesnici (do 200 obyvatel) je rozumný cíl po první sezóně: 20-30 stálých fanoušků a kolem 80-90 lidí na zápase. Záleží na tom, kolik peněz máš na busy a propagaci.
          </p>
        </div>
      </details>

      {/* ═══ Fanbase tier pyramid ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Fanouškovská základna</SectionLabel>

        <div className="space-y-3 mb-4">
          {[
            {
              key: "hardcore",
              icon: "🟥",
              label: "Tvrdé jádro",
              count: fanbase.tiers.hardcore,
              hint: "chodí vždy",
              barColor: "bg-card-red",
            },
            {
              key: "regular",
              icon: "🟧",
              label: "Pravidelní",
              count: fanbase.tiers.regular,
              hint: "~80 % zápasů",
              barColor: "bg-gold-500",
            },
            {
              key: "casual",
              icon: "🟨",
              label: "Občasní",
              count: fanbase.tiers.casual,
              hint: "~30–50 %",
              barColor: "bg-gold-400",
            },
          ].map((row) => {
            const pct = Math.min(
              100,
              (row.count / Math.max(fanbase.totalLoyal, 1)) * 100,
            );
            return (
              <div key={row.key} className="grid grid-cols-[8rem_4rem_1fr_5rem] items-center gap-3">
                <div className="text-sm font-heading font-bold text-ink">
                  <span className="mr-1">{row.icon}</span>
                  {row.label}
                </div>
                <div className="text-2xl font-heading font-bold tabular-nums text-ink text-right">
                  {row.count}
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${row.barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-muted text-right">{row.hint}</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t border-gray-200">
          <div>
            <div className="font-heading font-bold text-2xl tabular-nums text-pitch-600">{fanbase.totalLoyal}</div>
            <div className="text-xs text-muted">Stálých fanoušků</div>
          </div>
          <div>
            <div className="font-heading font-bold text-2xl tabular-nums text-ink">{fanbase.expectedNextHomeAttendance}</div>
            <div className="text-xs text-muted">Očekávaná návštěva</div>
          </div>
          <div>
            <div className="font-heading font-bold text-2xl tabular-nums text-gold-600">
              {fanbase.homeAdvantageModifier >= 0 ? "+" : ""}{fanbase.homeAdvantageModifier}
            </div>
            <div className="text-xs text-muted">Domácí výhoda</div>
          </div>
        </div>

        {/* Breakdown očekávané návštěvy */}
        {(() => {
          const eb = fanbase.expectedBreakdown;
          const tierAtt = eb.hardcore + eb.regular + eb.casual;
          return (
            <div className="mt-3 pt-3 border-t border-gray-100 text-micro text-muted">
              <div className="font-heading font-bold text-micro uppercase tracking-wide text-muted/70 mb-1">
                Z čeho se očekávaná návštěva skládá
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
                <span>Stálí fanoušci (z {fanbase.totalLoyal} přijde)</span>
                <span className="text-right tabular-nums">{tierAtt}</span>
                <span>Lidi z vesnice ({fanbase.homeVillage.name})</span>
                <span className="text-right tabular-nums">{eb.walkUp - Math.max(0, eb.walkUp - Math.round(fanbase.homeVillage.population * 0.075))}</span>
                <span>Lidi z okolí (do 5 km)</span>
                <span className="text-right tabular-nums">{Math.max(0, eb.walkUp - Math.round(fanbase.homeVillage.population * 0.075))}</span>
              </div>
              <div className="italic">
                Stálí jsou tví registrovaní — znáš je jménem, reagují na výsledky, rostou s tvými akcemi. Zbytek jsou anonymní vesničané a lidi z okolí, co prostě přijdou na zápas.
              </div>
            </div>
          );
        })()}

        <div className="mt-2 text-micro text-muted text-center">
          {fanbase.homeVillage.name} ({fanbase.homeVillage.population.toLocaleString("cs")} obyv.) · kapacita {fanbase.capacity}
        </div>
      </div>

      {/* ═══ Před dalším domácím zápasem (propagace + bus) ═══ */}
      {nextHomeMatch && teamId && (
        <div className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Před dalším domácím zápasem</SectionLabel>
            <div className="text-xs text-muted">
              vs <span className="font-heading font-bold text-ink">{nextHomeMatch.awayName}</span>
              {nextHomeMatch.isCup && (
                <> · <span className="font-heading font-bold text-gold-600">🏆 {nextHomeMatch.roundName ?? "Pohár"}</span></>
              )}
              {nextHomeMatch.scheduledAt && (
                <> · {new Date(nextHomeMatch.scheduledAt).toLocaleDateString("cs")}</>
              )}
            </div>
          </div>

          <div className="flex items-stretch gap-2">
            {nextHomeMatch.promoted ? (
              <div className="flex-1 px-3 py-2 rounded bg-gold-500/10 text-gold-700 font-heading font-bold text-sm flex items-center gap-2">
                📢 Propagováno · článek ve zpravodaji + 25 % diváků
              </div>
            ) : (
              <button
                onClick={promoteNext}
                disabled={promoting}
                className="flex-1 px-3 py-2 rounded bg-gold-500/10 text-gold-700 hover:bg-gold-500/20 font-heading font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                📢 {promoting ? "Propaguji…" : "Propagovat zápas"}
                {promotionPrice != null && (
                  <span className="text-xs text-muted font-normal">
                    {promotionPrice.toLocaleString("cs")} Kč
                  </span>
                )}
              </button>
            )}
          </div>

          <BusSelector teamId={teamId} matchId={nextHomeMatch.id} />
        </div>
      )}

      {/* ═══ Loyalty progression ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Růst loajality</SectionLabel>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted">Občasní → Pravidelní</span>
              <span className="font-heading font-bold text-ink">
                {fanbase.progression.casualToRegularStreak} / {fanbase.progression.casualToRegularNeeded}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 bg-gold-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (fanbase.progression.casualToRegularStreak / fanbase.progression.casualToRegularNeeded) * 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted">Pravidelní → Tvrdé jádro</span>
              <span className="font-heading font-bold text-ink">
                {fanbase.progression.regularToHardcoreStreak} / {fanbase.progression.regularToHardcoreNeeded}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 bg-card-red rounded-full transition-all"
                style={{ width: `${Math.min(100, (fanbase.progression.regularToHardcoreStreak / fanbase.progression.regularToHardcoreNeeded) * 100)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-2 text-micro text-muted">
          Po každém domácím zápase streak roste. Po dosažení prahu se část nižšího tieru promotne výš.
        </div>
      </div>

      {/* ═══ Odkud máš fanoušky ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Odkud máš fanoušky</SectionLabel>
        {(() => {
          const homeTot =
            fanbase.sources.home.hardcore +
            fanbase.sources.home.regular +
            fanbase.sources.home.casual;
          const promoTot = fanbase.sources.promo.casual;
          const satTot =
            fanbase.sources.satellites.hardcore +
            fanbase.sources.satellites.regular +
            fanbase.sources.satellites.casual;
          const tot = Math.max(homeTot + promoTot + satTot, 1);
          return (
            <>
              <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-3">
                <div
                  className="bg-pitch-500"
                  style={{ width: `${(homeTot / tot) * 100}%` }}
                  title={`Vlastní vesnice: ${homeTot}`}
                />
                <div
                  className="bg-gold-500"
                  style={{ width: `${(promoTot / tot) * 100}%` }}
                  title={`Z propagace: ${promoTot}`}
                />
                <div
                  className="bg-card-red/80"
                  style={{ width: `${(satTot / tot) * 100}%` }}
                  title={`Spádové obce: ${satTot}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <div className="font-heading font-bold text-xl tabular-nums text-pitch-600">{homeTot}</div>
                  <div className="text-micro text-muted">{fanbase.homeVillage.name}</div>
                  <div className="text-micro text-muted">vlastní vesnice</div>
                </div>
                <div>
                  <div className="font-heading font-bold text-xl tabular-nums text-gold-600">{promoTot}</div>
                  <div className="text-micro text-muted">z propagace</div>
                  <div className="text-micro text-muted">články ve zpravodaji</div>
                </div>
                <div>
                  <div className="font-heading font-bold text-xl tabular-nums text-card-red">{satTot}</div>
                  <div className="text-micro text-muted">spádové obce</div>
                  <div className="text-micro text-muted">{fanbase.satellites.length} obcí</div>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ═══ Spádové obce (autobusy) ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Spádové obce (autobusy)</SectionLabel>
        {fanbase.satellites.length === 0 ? (
          <div className="text-sm text-muted">
            Zatím žádné spádové obce. Před domácím zápasem objednej autobus z okolí (sekce u zápasu).
          </div>
        ) : (
          <div className="space-y-1.5">
            {fanbase.satellites.map((s) => {
              const total = s.casualCount + s.regularCount + s.hardcoreCount;
              return (
                <div
                  key={s.villageId}
                  className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold truncate">{s.villageName}</div>
                    <div className="text-micro text-muted">
                      {s.distanceKm} km · {s.population.toLocaleString("cs")} obyv. · konverze ×{s.conversionMod}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-heading font-bold text-pitch-600">★ {total}</div>
                    <div className="text-micro text-muted">streak {s.consecutiveBuses}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-micro text-muted">
          Bližší obce mají vyšší konverzi (3 km = ×1.2, 10 km = ×0.5). Lidi z blízka snadněji udělají z busu pravidelný návyk.
        </div>
      </div>

      {/* ═══ Propagační kampaň ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Propagační kampaň</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">Streak v řadě</div>
            <div className="font-heading font-bold text-2xl tabular-nums text-ink">
              {fanbase.promo.consecutive}
              {fanbase.promo.nextThreshold && (
                <span className="text-sm text-muted font-normal"> / {fanbase.promo.nextThreshold}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Bez propagace</div>
            <div className={`font-heading font-bold text-2xl tabular-nums ${fanbase.promo.unpromotedStreak >= 1 ? "text-card-red" : "text-ink"}`}>
              {fanbase.promo.unpromotedStreak}
            </div>
          </div>
        </div>
        <div className="mt-2 text-micro text-muted">
          {fanbase.promo.consecutive >= 3
            ? "Propagací jsi získal stálé fans. Pokračuj!"
            : fanbase.promo.consecutive > 0
              ? `Po ${3 - fanbase.promo.consecutive} dalších propagovaných home zápasech získáš stálé fans.`
              : "Propaguj 3 home zápasy v řadě → 30 % drop-in se stane stálými občasnými fanoušky."}
          {fanbase.promo.unpromotedStreak >= 1 && fanbase.promo.consecutive === 0 && (
            <> ⚠ Po 2 nepropagovaných v řadě se část stálých z propagace ztratí (-50 %).</>
          )}
        </div>
      </div>

      {/* ═══ Vývoj základny — sparkline ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Vývoj základny ({fanbaseHistory.length} dní)</SectionLabel>
        {fanbaseHistory.length < 2 ? (
          <div className="text-sm text-muted">Snapshoty se ještě nesbírají, vrať se za pár dní.</div>
        ) : (
          (() => {
            const maxTotal = Math.max(...fanbaseHistory.map((p) => p.totalLoyal), 1);
            const w = 100 / Math.max(fanbaseHistory.length - 1, 1);
            const buildPath = (key: keyof Pick<FanbaseHistoryPoint, "hardcore" | "regular" | "casual" | "totalLoyal">) =>
              fanbaseHistory
                .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * w).toFixed(2)} ${(100 - (p[key] / maxTotal) * 100).toFixed(2)}`)
                .join(" ");
            const first = fanbaseHistory[0];
            const last = fanbaseHistory[fanbaseHistory.length - 1];
            return (
              <>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-32 mb-2">
                  <path d={buildPath("totalLoyal")} fill="none" stroke="#65a30d" strokeWidth="1.5" />
                  <path d={buildPath("hardcore")} fill="none" stroke="#dc2626" strokeWidth="1" />
                  <path d={buildPath("regular")} fill="none" stroke="#ca8a04" strokeWidth="1" />
                  <path d={buildPath("casual")} fill="none" stroke="#fde047" strokeWidth="1" />
                </svg>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-card-red">🟥 Jádro: {first.hardcore} → {last.hardcore}</div>
                  <div className="text-gold-600">🟧 Pravid.: {first.regular} → {last.regular}</div>
                  <div className="text-gold-500">🟨 Občas.: {first.casual} → {last.casual}</div>
                </div>
                <div className="mt-1 text-micro text-muted">
                  Total: {first.totalLoyal} → {last.totalLoyal} ({last.totalLoyal - first.totalLoyal >= 0 ? "+" : ""}{last.totalLoyal - first.totalLoyal} stálých)
                </div>
              </>
            );
          })()
        )}
      </div>
      </>)}

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
              <span>Loajalita — dlouhodobá důvěra ke klubu</span>
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
            className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-soft text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
          />
          <span className="text-xs text-muted shrink-0">Kč</span>
          <button
            onClick={saveTicketPrice}
            disabled={acting === "ticket" || ticketPriceDraft === String(fans.baseTicketPrice)}
            className={`shrink-0 py-1.5 px-4 rounded-soft text-xs font-heading font-bold transition-colors ${
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

      {/* ═══ Trenér → Fanoušci ═══ */}
      {fans.manager && (() => {
        const m = fans.manager;
        const tone = (v: number) => v > 0 ? "text-pitch-500" : v < 0 ? "text-card-red" : "text-ink";
        const sign = (v: number) => `${v > 0 ? "+" : ""}${v}`;
        return (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Vliv trenéra na fanoušky</SectionLabel>

          {/* — Kdo a jak na tom je — */}
          <div className="mb-4">
            <Link
              href={`/dashboard/manager/${teamId}`}
              className="font-heading font-bold text-base text-ink hover:text-pitch-600 underline decoration-pitch-500/25 transition-colors"
            >
              {m.name}
            </Link>
            <div className="text-sm text-ink mt-0.5">
              <span className="font-heading font-bold">{m.bandLabel}</span>
              <span className="text-muted"> · vliv {m.influence} / 100</span>
            </div>
            <div className="text-sm text-muted mt-1">„{m.bandFanView}"</div>
          </div>

          <div className="text-sm text-muted mb-4">
            Fanoušci sledují, koho máš na lavičce. Z reputace a motivace trenéra počítáme jedno
            číslo — <strong className="text-ink">vliv</strong>. Ten po každém zápase přidá nebo ubere
            body spokojenosti a dlouhodobě posouvá hladinu loajality.
          </div>

          {/* — Z čeho se vliv počítá — */}
          <div className="bg-gray-50 rounded-soft p-4 mb-4">
            <div className="text-sm font-heading font-bold text-ink mb-3">Z čeho se vliv počítá</div>
            <div className="space-y-3">
              {[
                // Strop reputace je 75, ne 100 — bar i popisek to musí respektovat,
                // jinak vypadá maxed trenér pořád jako nedodělaný.
                { label: "Reputace", value: m.reputation, weight: m.repWeight, points: m.repPoints, max: MANAGER_FANS.REP_MAX },
                { label: "Motivace", value: m.motivation, weight: m.motWeight, points: m.motPoints, max: MANAGER_FANS.MOT_MAX },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="text-ink">
                      {row.label} <span className="tabular-nums font-heading font-bold">{row.value}</span>
                      <span className="text-muted"> / {row.max}</span>
                    </span>
                    <span className="text-muted tabular-nums">
                      × {row.weight.toString().replace(".", ",")} →{" "}
                      <span className="text-ink font-heading font-bold">
                        {row.points.toFixed(1).replace(".", ",")}
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-pitch-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, (row.value / row.max) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between text-sm mt-3 pt-3 border-t border-gray-200">
              <span className="font-heading font-bold text-ink">Vliv trenéra</span>
              <span className="tabular-nums">
                <span className="font-heading font-bold text-lg text-ink">{m.influence}</span>
                <span className="text-muted"> · neutrál je {m.neutral}</span>
              </span>
            </div>
            <div className="text-sm text-muted mt-2">
              Reputace váží víc — fanoušky zajímá hlavně to, co má trenér za sebou. Motivace je doplněk.
            </div>
          </div>

          {/* — Žebříček stupňů — */}
          <div className="mb-4">
            <div className="text-sm font-heading font-bold text-ink mb-2">Stupně vlivu</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 pr-3 font-heading uppercase text-xs text-muted tracking-widest">Vliv</th>
                    <th className="text-right py-1.5 px-2 font-heading uppercase text-xs text-muted tracking-widest whitespace-nowrap">Po zápase</th>
                    <th className="text-right py-1.5 px-2 font-heading uppercase text-xs text-muted tracking-widest">Loajalita</th>
                    <th className="text-left py-1.5 pl-3 font-heading uppercase text-xs text-muted tracking-widest">Jak to fanoušci berou</th>
                  </tr>
                </thead>
                <tbody>
                  {MANAGER_FANS_BANDS.map((band, i) => {
                    const isCurrent = band.key === m.bandKey;
                    const upper = i === 0 ? null : MANAGER_FANS_BANDS[i - 1].min - 1;
                    const range = upper === null
                      ? `${band.min} a víc`
                      : band.min === 0 ? `${upper} a míň` : `${band.min}–${upper}`;
                    return (
                      <tr
                        key={band.key}
                        className={isCurrent
                          ? "bg-pitch-50 border-l-2 border-pitch-500"
                          : "border-b border-gray-50"}
                      >
                        <td className={`py-2 pr-3 tabular-nums whitespace-nowrap ${isCurrent ? "pl-2 font-heading font-bold text-ink" : "text-muted"}`}>
                          {range}
                        </td>
                        <td className={`py-2 px-2 text-right tabular-nums font-heading font-bold ${tone(band.matchBoost)}`}>
                          {sign(band.matchBoost)}
                        </td>
                        <td className={`py-2 px-2 text-right tabular-nums ${isCurrent ? "text-ink" : "text-muted"}`}>
                          {sign(band.loyaltyOffset)}
                        </td>
                        <td className={`py-2 pl-3 ${isCurrent ? "text-ink" : "text-muted"}`}>{band.fanView}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-muted mt-3 space-y-1">
              <p>
                <strong className="text-ink">Po zápase</strong> se hodnota přičte ke spokojenosti —
                pro srovnání: výhra je +6, prohra −5, drahé vstupné −2.
              </p>
              <p>
                <strong className="text-ink">Loajalita</strong> je hladina, ke které se spokojenost
                každý den o bod vrací. Trenér tu hladinu posouvá proti reputaci klubu. Přes 100 se
                ale nedostane — když má klub reputaci 100, kladný posun se ztratí ve stropu.
              </p>
            </div>
          </div>

          {/* — Co s tím — */}
          <div className="pt-4 border-t border-gray-100">
            {m.nextBandLabel !== null && m.nextBandBoost !== null ? (
              <div className="text-sm font-heading font-bold text-pitch-600 mb-3">
                Do stupně {m.nextBandLabel} ({sign(m.nextBandBoost)} po zápase) ti chybí{" "}
                {m.pointsToNext} {m.pointsToNext === 1 ? "bod" : m.pointsToNext < 5 ? "body" : "bodů"} vlivu
                {/* Nula = tudy cesta nevede, protože atribut už je na stropu. */}
                {m.repPointsToNext > 0 && m.motPointsToNext > 0
                  ? ` — to je ${m.repPointsToNext} bodů reputace nebo ${m.motPointsToNext} bodů motivace.`
                  : m.repPointsToNext > 0
                    ? ` — to je ${m.repPointsToNext} bodů reputace. Motivaci už výš nedostaneš.`
                    : m.motPointsToNext > 0
                      ? ` — to je ${m.motPointsToNext} bodů motivace. Reputace už je na stropu.`
                      : "."}
              </div>
            ) : (
              <div className="text-sm font-heading font-bold text-pitch-600 mb-3">
                Jsi na nejvyšším stupni. Fanoušky víc nepotěšíš — soustřeď se na výsledky a vstupné.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-heading font-bold text-ink mb-1.5">
                  Reputace trenéra <span className="text-muted font-normal">(15–75, teď {m.reputation})</span>
                </div>
                <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                  <li>Výhra <strong className="text-ink">+1</strong>, o tři a víc gólů <strong className="text-ink">+2</strong>. Projeví se zhruba v každém třetím zápase.</li>
                  <li>Prohra <strong className="text-ink">−1</strong>, debakl o tři a víc <strong className="text-ink">−2</strong>, taky asi v třetině případů.</li>
                  <li>Konec sezóny je nejsilnější páka: ve čtrnáctičlenné lize dá první místo <strong className="text-ink">+10</strong>, poslední <strong className="text-ink">−10</strong>.</li>
                  <li>Pohár: osmifinále <strong className="text-ink">+2</strong>, čtvrtfinále <strong className="text-ink">+3</strong>, semifinále <strong className="text-ink">+5</strong>, výhra ve finále <strong className="text-ink">+8</strong>.</li>
                  <li>Proslov na závěrečné párty: pokorný tón <strong className="text-ink">+1</strong>, výmluvy nebo opilecký projev <strong className="text-ink">−1</strong>.</li>
                  <li>Nad 75 to nejde, pod 15 taky ne.</li>
                </ul>
              </div>
              <div>
                <div className="text-sm font-heading font-bold text-ink mb-1.5">
                  Motivace <span className="text-muted font-normal">(1–99, teď {m.motivation})</span>
                </div>
                <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                  <li>Konec sezóny v horní polovině tabulky: <strong className="text-ink">+1</strong>.</li>
                  <li>Ve spodní polovině je padesátiprocentní šance na <strong className="text-ink">−1</strong>.</li>
                  <li>Zhruba každá osmá prohra (debakl každá čtvrtá) sebere bod motivace nebo disciplíny.</li>
                  <li>Motivace sama neroste. Jediná spolehlivá cesta je držet tým v horní polovině.</li>
                </ul>
              </div>
            </div>

            <div className="text-sm text-muted mt-4 pt-3 border-t border-gray-100">
              Spokojenost není kosmetika: násobí návštěvnost (0,75× až 1,25×), cenu vstupenky
              (0,7× až 1,3×) i tržby v bufetu.
            </div>
          </div>
        </div>
        );
      })()}

      </>)}


      {currentTab === "concession" && (<>
      {/* ═══ Občerstvení ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Občerstvení</SectionLabel>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => switchMode("external")}
            disabled={concession.mode === "external" || !!acting}
            className={`flex-1 py-2 px-3 rounded-soft text-sm font-heading font-bold transition-colors ${
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
            className={`flex-1 py-2 px-3 rounded-soft text-sm font-heading font-bold transition-colors ${
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
          <div className="bg-gray-50 rounded-soft p-3">
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
            <div className="text-sm text-muted bg-gray-50 rounded-soft px-3 py-2.5">
              Sklad se nečerpá automaticky, před každým domácím zápasem doplň zásoby. Bez zásob jsou fanoušci nespokojení.
            </div>

            {/* Předpověď na nejbližší domácí zápas. Bez ní manažer neví, čeho
                navézt víc: v mrazu jde na odbyt svařák, na výhni limonáda. */}
            {concession.nextHome && (
              <div className="border border-gray-100 rounded-soft p-3">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="text-2xl">{concession.nextHome.forecast.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold">
                      Doma s {concession.nextHome.opponent}
                      {concession.nextHome.isCup && (
                        <span className="text-gold-600"> · 🏆 pohár</span>
                      )}
                    </div>
                    <div className="text-sm text-muted">
                      {concession.nextHome.forecast.description}
                      {concession.nextHome.avgTemperature !== null && (
                        <> · {Math.round(concession.nextHome.avgTemperature)} °C</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  {concession.nextHome.hints.map((h) => (
                    <div key={h.key} className="flex items-center gap-2 text-sm">
                      <span className="w-6 text-center">{PRODUCT_ICONS[h.key] ?? "🍽"}</span>
                      <span className="flex-1 min-w-0 truncate">{h.label}</span>
                      <span
                        className={
                          h.factor >= 1.10
                            ? "text-pitch-500 font-medium"
                            : h.factor <= 0.60
                              ? "text-card-red"
                              : "text-muted"
                        }
                      >
                        {h.hint}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {concession.products.map((p) => {
              const currentTier = p.tiers[p.qualityLevel];
              const priceDraft = productDrafts[p.key]?.sellPrice ?? String(p.sellPrice);
              const qty = restockQty[p.key] ?? "";
              const qtyNum = parseInt(qty, 10);
              const total = !isNaN(qtyNum) && qtyNum > 0 ? qtyNum * currentTier.wholesalePrice : 0;
              const stockEmpty = p.stockQuantity === 0;
              const stockLow = p.stockQuantity > 0 && p.stockQuantity < 20;
              return (
                <div key={p.key} className="border border-gray-100 rounded-soft p-3">
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
                          <div className={`text-micro tabular-nums mt-0.5 ${isActive ? "text-white/80" : "text-muted"}`}>{tier.wholesalePrice} Kč/ks</div>
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
                      className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-soft text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
                    />
                    <span className="text-xs text-muted shrink-0 w-3 text-center">Kč</span>
                    <button
                      onClick={() => saveSellPrice(p.key)}
                      disabled={acting === "price-" + p.key || priceDraft === String(p.sellPrice)}
                      className={`shrink-0 w-[88px] py-1.5 px-2 rounded-soft text-xs font-heading font-bold transition-colors ${
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
                      className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-soft text-sm tabular-nums text-right bg-white focus:outline-none focus:border-pitch-500 shrink-0"
                    />
                    <span className="text-xs text-muted shrink-0 w-3 text-center">ks</span>
                    <button
                      onClick={() => doRestock(p.key)}
                      disabled={acting === "restock-" + p.key || qtyNum <= 0 || isNaN(qtyNum)}
                      className={`shrink-0 w-[88px] py-1.5 px-2 rounded-soft text-xs font-heading font-bold transition-colors ${
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
              <div className="bg-gray-50 rounded-soft p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Celkový výnos</div>
                <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">
                  {formatCZK(salesHistory.reduce((s, m) => s + m.totalRevenue, 0))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-soft p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Čistý zisk</div>
                <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">
                  {formatCZK(salesHistory.reduce((s, m) => s + m.totalProfit, 0))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-soft p-3 text-center">
                <div className="text-xs text-muted uppercase mb-1">Ø na zápas</div>
                <div className="font-heading font-bold text-lg tabular-nums text-ink">
                  {formatCZK(Math.round(salesHistory.reduce((s, m) => s + m.totalProfit, 0) / salesHistory.length))}
                </div>
              </div>
            </div>

            {/* Per match list */}
            <div className="space-y-3">
              {salesHistory.map((m, idx) => {
                const vysledek = resultLabel(m.result);
                return (
                  <div key={(m.matchId ?? "") + idx} className="border border-gray-100 rounded-soft p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="shrink-0 text-lg" title={m.isCup ? "Pohárový zápas" : "Ligový zápas"}>
                        {m.isCup ? "🏆" : "⚽"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-bold text-sm text-ink">
                          {m.opponentName ?? "Neznámý soupeř"}
                        </div>
                        <div className="text-xs text-muted">
                          Doma · {formatGamedate(m.gamedate)} · {m.attendance} diváků
                          {vysledek.text && <span className={`ml-1 font-bold ${vysledek.cls}`}>{vysledek.text}</span>}
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
