"use client";

/**
 * Záložka Postava v Kádru (postava, část 3): kdo má s váhou problém, proč a co to stojí
 * sestavu. Vzhled převzatý z Docházky (FM tabulka), souhrn jako karty v hlavičce Kádru,
 * ovládání pod tabulkou. Páky: SMS hráči, plán hubnutí, vybavení Váha a jídelníček.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useOpenPlayerConversation } from "@/hooks/use-open-player-conversation";
import { PositionBadge, DataTable, ListCard, SectionLoading } from "@/components/ui";
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
  planKind: "loss" | "gain" | null;
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
  const { open: openSms, openingPlayerId } = useOpenPlayerConversation(teamId);
  const [data, setData] = useState<BodyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BodyOverview>(`/api/teams/${teamId}/body-overview`)
      .then(setData)
      .catch((e) => { console.error("body-overview fetch:", e); setError("Přehled se nepodařilo načíst."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="card"><SectionLoading /></div>;
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
            {summary.avgExcess === null ? "-" : `${signed(summary.avgExcess).replace(".", ",")} kg`}
          </div>
          <div className="text-micro text-muted uppercase tracking-wide">Ø nad ideálem</div>
        </div>
        <div className="card p-3 text-center">
          <div className={`font-heading font-[800] text-2xl tabular-nums ${summary.avgTrend30d && summary.avgTrend30d > 0 ? "text-card-red" : ""}`}>
            {summary.avgTrend30d === null ? "-" : formatKgChange(summary.avgTrend30d)}
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

      <ListCard>
        <DataTable rows={rows} rowKey={(p) => p.id}
          rowHref={(p) => `/hrac/${p.id}`} scroll={{ minWidth: 720 }}
          // Hráči s problémem s váhou mají zlatý proužek; dřív se ostatní řádky jen ztlumily.
          rowTone={(p) => (p.problem ? { bar: "warn" } : undefined)}
          empty="Žádní hráči neodpovídají filtru."
          columns={[
            { key: "name", header: "Jméno", title: "Jméno hráče", align: "left",
              cell: (p) => <span className="text-body font-bold text-ink whitespace-nowrap">{p.name}</span> },
            { key: "pos", header: "Poz", title: "Pozice", width: "w-14", cell: (p) => <PositionBadge position={p.position} /> },
            { key: "weight", header: "Váha", title: "Aktuální váha",
              cell: (p) => <span className="font-bold text-ink whitespace-nowrap">{p.weight !== null ? formatKg(p.weight) : "-"}</span> },
            { key: "state", header: "Stav", title: "Váha proti ideálu podle výšky",
              cell: (p) => {
                const cat = p.weightCategory ? WEIGHT_CATEGORY[p.weightCategory] : null;
                return <span className={`font-bold whitespace-nowrap ${cat?.color ?? "text-muted"}`}>{cat?.label ?? "-"}</span>;
              } },
            { key: "month", header: "Měsíc", title: "Změna váhy za poslední měsíc",
              cell: (p) => <span className={`whitespace-nowrap ${p.trend30d !== null ? trendTone(p.trend30d, p.weightCategory) : "text-muted"}`}>{p.trend30d !== null ? formatKgChange(p.trend30d) : "-"}</span> },
            { key: "penalty", header: "Postih", title: "O kolik nadváha snižuje rychlost a výdrž",
              cell: (p) => {
                const { speed, stamina } = p.effects;
                return <span className={`whitespace-nowrap ${speed || stamina ? "text-card-red font-bold" : "text-muted"}`}>{!speed && !stamina ? "-" : speed === stamina ? signed(speed) : `${signed(speed)}/${signed(stamina)}`}</span>;
              } },
            { key: "why", header: "Proč", title: "Příčina přírůstku, plán hubnutí, slib",
              cell: (p) => (
                <span className="whitespace-nowrap">
                  {p.cause && <span title={CAUSE[p.cause].label}>{CAUSE[p.cause].icon}</span>}
                  {p.planUntil && (p.planKind === "gain"
                    ? <span title={`Plán nabírání do ${czDate(p.planUntil)}`}>💪</span>
                    : <span title={`Plán hubnutí do ${czDate(p.planUntil)}`}>🏃</span>)}
                  {p.pledgeUntil && <span title={`Slíbil omezit hospodu do ${czDate(p.pledgeUntil)}`}>🤝</span>}
                  {!p.cause && !p.planUntil && !p.pledgeUntil && <span className="text-muted">-</span>}
                </span>
              ) },
            { key: "sms", header: "", title: "Napsat hráči", width: "w-12",
              cell: (p) => p.problem ? (
                <button onClick={(e) => { e.stopPropagation(); openSms(p.id); }} disabled={openingPlayerId !== null}
                  aria-label={`Napsat hráči ${p.name}`} title="Napsat SMS"
                  className="min-w-9 min-h-9 rounded-control hover:bg-pitch-50 transition-colors text-sm disabled:opacity-50">
                  💬
                </button>
              ) : null },
          ]} />
      </ListCard>

      <div className="card p-3 text-sm text-muted space-y-1">
        <div>
          🍺 sedí v hospodě · 🛋️ málo se hýbe · 🩹 je zraněný · 🏃 plán hubnutí · 💪 plán nabírání · 🤝 slíbil omezit hospodu
        </div>
        <div>
          Hráči s nadváhou 💬 napiš. Plán hubnutí i nabírání zadáš kondičnímu trenérovi v{" "}
          <Link href="/zamestnanci" className="text-pitch-600 underline decoration-pitch-500/30">Zaměstnancích</Link>,
          s oběma pomáhá Váha a jídelníček ve{" "}
          <Link href="/vybaveni" className="text-pitch-600 underline decoration-pitch-500/30">Vybavení</Link>.
        </div>
      </div>
    </>
  );
}
