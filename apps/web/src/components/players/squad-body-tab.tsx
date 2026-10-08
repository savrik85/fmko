"use client";

/**
 * Záložka Postava v Kádru (postava, část 3): kdo má s váhou problém, proč a co to stojí
 * základní jedenáctku. Páky: SMS hráči, plán hubnutí u kondičního trenéra, vybavení Váha a jídelníček.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import { formatKg, formatKgChange, WEIGHT_CATEGORY, type WeightCategoryKey } from "@/lib/player-attrs";
import type { PosFilter } from "@/components/players/squad-attribute-table";

type Cause = "pub" | "idle" | "injury";

interface OverviewPlayer {
  id: string;
  name: string;
  position: string;
  weight: number | null;
  weightCategory: WeightCategoryKey | null;
  trend30d: number | null;
  effects: { speed: number; stamina: number; strength: number; heading: number };
  cause: Cause | null;
  planUntil: string | null;
  pledgeUntil: string | null;
  problem: boolean;
}

interface BodyOverview {
  summary: {
    avgExcess: number | null;
    counts: Record<WeightCategoryKey, number>;
    avgTrend30d: number | null;
    lineupPenalty: { speed: number; stamina: number };
    lineupSource: "lineup" | "best11";
  };
  players: OverviewPlayer[];
}

const CAUSE_LABEL: Record<Cause, string> = {
  pub: "🍺 sedí v hospodě",
  idle: "🛋️ nechodí na trénink",
  injury: "🩹 je zraněný",
};

const COUNT_ORDER: WeightCategoryKey[] = ["ideal", "muscular", "over", "obese", "under"];
const POS_SHORT: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };

function czDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

/** Postih vlastností slovy: „rychlost −5, výdrž −5“. Znak minus, ne pomlčka. */
function penaltyText(e: OverviewPlayer["effects"]): string | null {
  const parts: string[] = [];
  if (e.speed) parts.push(`rychlost ${e.speed > 0 ? "+" : "−"}${Math.abs(e.speed)}`);
  if (e.stamina) parts.push(`výdrž ${e.stamina > 0 ? "+" : "−"}${Math.abs(e.stamina)}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function trendTone(trend: number, category: WeightCategoryKey | null): string {
  if (trend === 0) return "text-muted";
  if (category === "under") return trend > 0 ? "text-pitch-500" : "text-card-red";
  if (category === "over" || category === "obese") return trend > 0 ? "text-card-red" : "text-pitch-500";
  return trend > 0 ? "text-gold-600" : "text-muted";
}

/** Souhrn je za celý kádr, filtr postů zužuje jen seznamy hráčů. */
export function SquadBodyTab({ teamId, filter }: { teamId: string; filter: PosFilter }) {
  const router = useRouter();
  const [data, setData] = useState<BodyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<BodyOverview>(`/api/teams/${teamId}/body-overview`)
      .then(setData)
      .catch((e) => { console.error("body-overview fetch:", e); setError("Přehled se nepodařilo načíst."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  async function openSms(playerId: string) {
    try {
      const res = await apiFetch<{ conversationId: string }>(`/api/teams/${teamId}/player-conversation/${playerId}`, { method: "POST" });
      router.push(`/telefon/${res.conversationId}`);
    } catch (e) {
      console.error("open player conversation:", e);
    }
  }

  if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>;
  if (error || !data) return <div className="card p-4"><p className="text-sm text-card-red">{error ?? "Přehled se nepodařilo načíst."}</p></div>;

  const { summary } = data;
  const shown = data.players.filter((p) => filter === "all" || p.position === filter);
  const problems = shown.filter((p) => p.problem);
  const others = shown.filter((p) => !p.problem);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-sm text-muted">Nad ideálem v průměru</div>
          <div className="font-heading font-bold text-2xl tabular-nums">
            {summary.avgExcess === null ? "—" : `${summary.avgExcess > 0 ? "+" : summary.avgExcess < 0 ? "−" : ""}${formatKg(Math.abs(summary.avgExcess))} kg`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">Kádr za měsíc</div>
          <div className={`font-heading font-bold text-2xl tabular-nums ${summary.avgTrend30d && summary.avgTrend30d > 0 ? "text-card-red" : "text-ink"}`}>
            {summary.avgTrend30d === null ? "—" : formatKgChange(summary.avgTrend30d)}
          </div>
        </div>
        <div className="card p-4 col-span-2">
          <div className="text-sm text-muted">
            Tuk stojí {summary.lineupSource === "lineup" ? "sestavu na příští zápas" : "11 nejlepších hráčů"}
          </div>
          <div className="font-heading font-bold text-2xl tabular-nums">
            {summary.lineupPenalty.speed === 0 && summary.lineupPenalty.stamina === 0
              ? <span className="text-pitch-500">nic</span>
              : <span className="text-card-red">rychlost −{Math.abs(summary.lineupPenalty.speed)}, výdrž −{Math.abs(summary.lineupPenalty.stamina)}</span>}
          </div>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap gap-x-4 gap-y-1">
        {COUNT_ORDER.map((k) => (
          <span key={k} className="text-sm">
            <span className={`font-heading font-bold ${WEIGHT_CATEGORY[k].color}`}>{summary.counts[k]}</span>{" "}
            <span className="text-muted">{WEIGHT_CATEGORY[k].label}</span>
          </span>
        ))}
      </div>

      <div>
        <SectionLabel>Kdo má problém</SectionLabel>
        {problems.length === 0 ? (
          <p className="text-sm text-muted">Nikdo z kádru nemá s váhou problém.</p>
        ) : (
          <div className="space-y-3">
            {problems.map((p) => {
              const cat = p.weightCategory ? WEIGHT_CATEGORY[p.weightCategory] : null;
              const penalty = penaltyText(p.effects);
              const canPlan = (p.weightCategory === "over" || p.weightCategory === "obese") && !p.planUntil;
              return (
                <div key={p.id} className="card p-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/hrac/${p.id}`} className="font-heading font-bold text-base hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-sm text-muted">{POS_SHORT[p.position] ?? p.position}</span>
                  </div>
                  <div className="text-sm flex flex-wrap gap-x-3 gap-y-1">
                    {p.weight !== null && <span className="font-heading font-bold">{formatKg(p.weight)} kg</span>}
                    {cat && <span className={cat.color}>{cat.label}</span>}
                    {p.trend30d !== null && (
                      <span className={trendTone(p.trend30d, p.weightCategory)}>{formatKgChange(p.trend30d)} za měsíc</span>
                    )}
                    {penalty && <span className="text-card-red">{penalty}</span>}
                  </div>
                  {(p.cause || p.planUntil || p.pledgeUntil) && (
                    <div className="text-sm flex flex-wrap gap-x-3 gap-y-1 text-muted">
                      {p.cause && <span>{CAUSE_LABEL[p.cause]}</span>}
                      {p.planUntil && <span className="text-pitch-500">🏃 plán hubnutí do {czDate(p.planUntil)}</span>}
                      {p.pledgeUntil && <span className="text-pitch-500">🤝 slíbil omezit hospodu do {czDate(p.pledgeUntil)}</span>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => openSms(p.id)} className="btn btn-secondary btn-md" aria-label={`Napsat hráči ${p.name}`}>
                      💬 Napsat SMS
                    </button>
                    {canPlan && (
                      <Link href="/zamestnanci" className="btn btn-secondary btn-md">🏃 Plán hubnutí</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div className="card p-4">
          <button onClick={() => setShowAll((v) => !v)} className="text-sm font-heading font-bold text-pitch-500 hover:underline">
            {showAll ? "Skrýt ostatní" : `Bez problému: ${others.length} ${others.length === 1 ? "hráč" : others.length < 5 ? "hráči" : "hráčů"}`}
          </button>
          {showAll && (
            <div className="mt-2 divide-y divide-gray-50">
              {others.map((p) => (
                <div key={p.id} className="py-1.5 flex items-center justify-between gap-3 text-sm">
                  <Link href={`/hrac/${p.id}`} className="hover:underline">{p.name}</Link>
                  <span className="tabular-nums">
                    {p.weight !== null ? `${formatKg(p.weight)} kg` : "—"}
                    {p.weightCategory && <span className={WEIGHT_CATEGORY[p.weightCategory].color}> · {WEIGHT_CATEGORY[p.weightCategory].label}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-muted">
        Hubnutí: plán u kondičního trenéra v <Link href="/zamestnanci" className="text-pitch-500 hover:underline">Zaměstnancích</Link>,
        vybavení Váha a jídelníček ve <Link href="/vybaveni" className="text-pitch-500 hover:underline">Vybavení</Link>, nebo hráči napiš.
      </p>
    </div>
  );
}
