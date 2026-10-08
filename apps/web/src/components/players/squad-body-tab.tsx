"use client";

/**
 * Záložka Postava v Kádru (postava, část 3): kdo má s váhou problém, proč a co to stojí
 * sestavu. Vzhled převzatý z Docházky (FM tabulka), souhrn jako karty v hlavičce Kádru,
 * ovládání pod tabulkou. Páky: SMS hráči, plán hubnutí, vybavení Váha a jídelníček.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Spinner, PositionBadge } from "@/components/ui";
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

const CAUSE: Record<Cause, { icon: string; label: string }> = {
  pub: { icon: "🍺", label: "sedí v hospodě" },
  idle: { icon: "🛋️", label: "málo se hýbe" },
  injury: { icon: "🩹", label: "je zraněný" },
};

/** Záporné číslo se znakem minus (ne pomlčkou), kladné s plusem. */
function signed(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}

function czDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function trendTone(trend: number, category: WeightCategoryKey | null): string {
  if (trend === 0) return "text-muted";
  if (category === "under") return trend > 0 ? "text-pitch-600" : "text-card-red";
  if (category === "over" || category === "obese") return trend > 0 ? "text-card-red" : "text-pitch-600";
  return trend > 0 ? "text-amber-600" : "text-muted";
}

/** Souhrn je za celý kádr, filtr postů zužuje jen tabulku. */
export function SquadBodyTab({ teamId, filter }: { teamId: string; filter: PosFilter }) {
  const router = useRouter();
  const [data, setData] = useState<BodyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  if (error || !data) return <div className="card p-4 text-sm text-card-red text-center">{error ?? "Přehled se nepodařilo načíst."}</div>;

  const { summary } = data;
  const problemCount = data.players.filter((p) => p.problem).length;
  const rows = data.players.filter((p) => filter === "all" || p.position === filter);
  const penalty = summary.lineupPenalty;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3 text-center">
          <div className="font-heading font-[800] text-2xl tabular-nums">
            {summary.avgExcess === null ? "—" : `${signed(summary.avgExcess).replace(".", ",")} kg`}
          </div>
          <div className="text-micro text-muted uppercase tracking-wide">Ø nad ideálem</div>
        </div>
        <div className="card p-3 text-center">
          <div className={`font-heading font-[800] text-2xl tabular-nums ${summary.avgTrend30d && summary.avgTrend30d > 0 ? "text-card-red" : ""}`}>
            {summary.avgTrend30d === null ? "—" : formatKgChange(summary.avgTrend30d)}
          </div>
          <div className="text-micro text-muted uppercase tracking-wide">Ø za měsíc</div>
        </div>
        <div className="card p-3 text-center">
          <div className={`font-heading font-[800] text-2xl tabular-nums ${problemCount > 0 ? "text-amber-600" : "text-pitch-600"}`}>
            {problemCount}<span className="text-muted text-base">/{data.players.length}</span>
          </div>
          <div className="text-micro text-muted uppercase tracking-wide">S problémem</div>
        </div>
        <div className="card p-3 text-center" title="Kolik rychlosti a výdrže bere nadváha hráčům v sestavě dohromady">
          <div className={`font-heading font-[800] text-2xl tabular-nums ${penalty.speed || penalty.stamina ? "text-card-red" : "text-pitch-600"}`}>
            {penalty.speed === penalty.stamina ? signed(penalty.speed) : `${signed(penalty.speed)}/${signed(penalty.stamina)}`}
          </div>
          <div className="text-micro text-muted uppercase tracking-wide">
            {summary.lineupSource === "lineup" ? "Postih sestavy" : "Postih nejlepší 11"}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-4 text-sm text-muted text-center">Žádní hráči neodpovídají filtru.</div>
      ) : (
        <div className="card overflow-x-auto table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-gray-200">
                {([
                  ["Jméno", "Jméno hráče", "left"],
                  ["Poz", "Pozice", "center"],
                  ["Váha", "Aktuální váha", "center"],
                  ["Stav", "Váha proti ideálu podle výšky", "center"],
                  ["Měsíc", "Změna váhy za poslední měsíc", "center"],
                  ["Postih", "O kolik nadváha snižuje rychlost a výdrž", "center"],
                  ["Proč", "Příčina přírůstku, plán hubnutí, slib", "center"],
                  ["", "Napsat hráči", "center"],
                ] as Array<[string, string, "left" | "center"]>).map(([label, tip, align], i) => (
                  <th key={i} title={tip}
                    className={`py-2.5 px-1.5 font-heading uppercase text-muted whitespace-nowrap ${
                      align === "left" ? "text-left pl-3 sticky left-0 bg-white z-10" : "text-center"
                    }`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const cat = p.weightCategory ? WEIGHT_CATEGORY[p.weightCategory] : null;
                const { speed, stamina } = p.effects;
                return (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-pitch-50/30 transition-colors ${p.problem ? "" : "opacity-70"}`}>
                    <td className="py-2 px-1.5 pl-3 sticky left-0 bg-white z-10">
                      <Link href={`/hrac/${p.id}`}
                        className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2 px-1.5 text-center"><PositionBadge position={p.position} /></td>
                    <td className="py-2 px-1.5 text-center tabular-nums font-heading font-bold whitespace-nowrap">
                      {p.weight !== null ? formatKg(p.weight) : "—"}
                    </td>
                    <td className={`py-2 px-1.5 text-center whitespace-nowrap font-heading font-bold ${cat?.color ?? "text-muted"}`}>
                      {cat?.label ?? "—"}
                    </td>
                    <td className={`py-2 px-1.5 text-center tabular-nums whitespace-nowrap ${p.trend30d !== null ? trendTone(p.trend30d, p.weightCategory) : "text-muted"}`}>
                      {p.trend30d !== null ? formatKgChange(p.trend30d) : "—"}
                    </td>
                    <td className={`py-2 px-1.5 text-center tabular-nums whitespace-nowrap ${speed || stamina ? "text-card-red font-heading font-bold" : "text-muted"}`}>
                      {!speed && !stamina ? "—" : speed === stamina ? signed(speed) : `${signed(speed)}/${signed(stamina)}`}
                    </td>
                    <td className="py-2 px-1.5 text-center whitespace-nowrap text-sm">
                      {p.cause && <span title={CAUSE[p.cause].label}>{CAUSE[p.cause].icon}</span>}
                      {p.planUntil && <span title={`Plán hubnutí do ${czDate(p.planUntil)}`}>🏃</span>}
                      {p.pledgeUntil && <span title={`Slíbil omezit hospodu do ${czDate(p.pledgeUntil)}`}>🤝</span>}
                      {!p.cause && !p.planUntil && !p.pledgeUntil && <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="py-1 px-1.5 text-center">
                      {p.problem && (
                        <button onClick={() => openSms(p.id)} aria-label={`Napsat hráči ${p.name}`} title="Napsat SMS"
                          className="min-w-9 min-h-9 rounded-control hover:bg-pitch-50 transition-colors text-sm">
                          💬
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-3 text-sm text-muted space-y-1">
        <div>
          🍺 sedí v hospodě · 🛋️ málo se hýbe · 🩹 je zraněný · 🏃 plán hubnutí · 🤝 slíbil omezit hospodu
        </div>
        <div>
          Hubnutí: 💬 napiš hráči, plán u kondičního trenéra v{" "}
          <Link href="/zamestnanci" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>,
          váha a jídelníček ve{" "}
          <Link href="/vybaveni" className="text-pitch-600 underline decoration-pitch-500/30">Vybavení</Link>.
        </div>
      </div>
    </>
  );
}
