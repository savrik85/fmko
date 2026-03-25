"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge, useConfirm } from "@/components/ui";

type Tab = "free_agents" | "market" | "offers" | "squad";

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

interface FreeAgent {
  id: string; firstName: string; lastName: string; nickname?: string; age: number;
  position: string; overallRating: number; weeklyWage: number; occupation: string;
  source: string; villageName: string | null; distanceKm: number | null;
  expiresAt: string; avatar: Record<string, unknown>;
}

interface MarketListing {
  id: string; playerId: string; askingPrice: number; playerName: string;
  playerAge: number; position: string; overallRating: number; teamName: string;
  expiresAt: string; avatar: Record<string, unknown>;
}

interface MyListing {
  id: string; playerId: string; askingPrice: number; playerName: string;
  playerAge: number; position: string; overallRating: number; expiresAt: string;
  bids: Array<{ id: string; amount: number; bidderName: string; teamId: string }>;
}

interface TransferOffer {
  id: string; player_id: string; offer_amount: number; counter_amount: number | null;
  message: string | null; reject_message: string | null; status: string;
  first_name: string; last_name: string; age: number; position: string; overall_rating: number;
  from_team_name?: string; to_team_name?: string; expires_at: string;
}

export default function TransfersPage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useState<Tab>("free_agents");
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Free agents
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  // Market
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  // Offers
  const [incoming, setIncoming] = useState<TransferOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TransferOffer[]>([]);
  // Squad
  const [players, setPlayers] = useState<Player[]>([]);
  // Price dialog
  const [priceDialog, setPriceDialog] = useState<{ title: string; description: string; defaultPrice: number; onConfirm: (price: number) => void } | null>(null);

  const refresh = async () => {
    if (!teamId) return;
    const [fa, market, offers, squad] = await Promise.all([
      apiFetch<{ freeAgents: FreeAgent[] }>(`/api/teams/${teamId}/free-agents`).catch(() => ({ freeAgents: [] })),
      apiFetch<{ listings: MarketListing[]; myListings: MyListing[] }>(`/api/teams/${teamId}/market`).catch(() => ({ listings: [], myListings: [] })),
      apiFetch<{ incoming: TransferOffer[]; outgoing: TransferOffer[] }>(`/api/teams/${teamId}/offers`).catch(() => ({ incoming: [], outgoing: [] })),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`).catch(() => []),
    ]);
    setFreeAgents(fa.freeAgents);
    setListings(market.listings);
    setMyListings(market.myListings);
    setIncoming(offers.incoming);
    setOutgoing(offers.outgoing);
    setPlayers(squad);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const tabs: [Tab, string, number][] = [
    ["free_agents", "Volní hráči", freeAgents.length],
    ["market", "Trh", listings.length],
    ["offers", "Nabídky", incoming.length],
    ["squad", "Můj tým", players.filter((p) => (p as any).status === "quit").length],
  ];

  return (
    <div className="page-container space-y-5">
      {confirmDialog}
      {priceDialog && <PriceDialog {...priceDialog} onClose={() => setPriceDialog(null)} />}

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {tabs.map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}>
            {label}{count > 0 ? ` (${count})` : ""}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Volní hráči ═══ */}
      {tab === "free_agents" && (
        <div>
          <SectionLabel>Volní hráči v okresu ({freeAgents.length})</SectionLabel>
          {freeAgents.length === 0 ? (
            <div className="card p-6 text-center text-muted">Žádní volní hráči nejsou k dispozici.</div>
          ) : (
            <div className="space-y-3">
              {freeAgents.map((fa) => (
                <div key={fa.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-sm text-muted">
                      {fa.firstName[0]}{fa.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-heading font-bold">{fa.firstName} {fa.lastName}</span>
                        <PositionBadge position={fa.position as "GK" | "DEF" | "MID" | "FWD"} />
                        <span className="text-sm text-muted">{fa.age} let</span>
                        <span className="text-sm font-heading font-bold tabular-nums">{fa.overallRating}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                        <span>{fa.occupation}</span>
                        <span>Mzda: <span className="font-heading font-bold text-ink">{formatCZK(fa.weeklyWage)}/týd</span></span>
                        {fa.distanceKm !== null && <span>{fa.distanceKm} km</span>}
                        {fa.villageName && <span>{fa.villageName}</span>}
                        {fa.source === "released" && <span className="text-gold-600">Propuštěn</span>}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Podepsat ${fa.firstName} ${fa.lastName}?`,
                          description: `${fa.position}, ${fa.age} let, rating ${fa.overallRating} — ${fa.occupation}`,
                          details: [
                            { label: "Mzda", value: `${formatCZK(fa.weeklyWage)}/týd`, color: "text-ink" },
                            { label: "Registrace", value: `-${formatCZK(500)}`, color: "text-card-red" },
                          ],
                          confirmLabel: "Podepsat",
                        });
                        if (!ok || !teamId) return;
                        const res = await apiFetch<{ success: boolean; decision: { accepted: boolean; probability: number; explanation: string } }>(
                          `/api/teams/${teamId}/free-agents/${fa.id}/sign`,
                          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeredWage: fa.weeklyWage }) },
                        ).catch(() => null);
                        if (res) {
                          await confirm({
                            title: res.success ? "Podepsáno!" : "Odmítl",
                            description: res.decision.explanation,
                            confirmLabel: "OK",
                          });
                          await refresh();
                        }
                      }}
                      className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                    >
                      Podepsat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Trh ═══ */}
      {tab === "market" && (
        <div className="space-y-5">
          <div>
            <SectionLabel>Na trhu ({listings.length})</SectionLabel>
            {listings.length === 0 ? (
              <div className="card p-6 text-center text-muted">Nikdo momentálně nenabízí hráče.</div>
            ) : (
              <div className="space-y-3">
                {listings.map((l) => (
                  <div key={l.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Link href={`/dashboard/player/${l.playerId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                            {l.playerName}
                          </Link>
                          <PositionBadge position={l.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">{l.playerAge} let</span>
                          <span className="text-sm font-heading font-bold tabular-nums">{l.overallRating}</span>
                        </div>
                        <div className="text-xs text-muted">
                          <span className="font-heading font-bold text-ink">{formatCZK(l.askingPrice)}</span> — {l.teamName}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPriceDialog({
                            title: `Nabídnout za ${l.playerName}`,
                            description: `Požadovaná cena: ${formatCZK(l.askingPrice)}`,
                            defaultPrice: l.askingPrice,
                            onConfirm: async (price) => {
                              if (!teamId) return;
                              await apiFetch(`/api/teams/${teamId}/market/${l.id}/bid`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ amount: price }),
                              }).catch(() => {});
                              setPriceDialog(null);
                              await refresh();
                            },
                          });
                        }}
                        className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                      >
                        Nabídnout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {myListings.length > 0 && (
            <div>
              <SectionLabel>Moje inzerce ({myListings.length})</SectionLabel>
              <div className="space-y-3">
                {myListings.map((l) => (
                  <div key={l.id} className="card p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/player/${l.playerId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                            {l.playerName}
                          </Link>
                          <PositionBadge position={l.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">{l.playerAge} let</span>
                        </div>
                        <div className="text-xs text-muted">Cena: <span className="font-heading font-bold text-ink">{formatCZK(l.askingPrice)}</span></div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!teamId) return;
                          await apiFetch(`/api/teams/${teamId}/listings/${l.id}`, { method: "DELETE" }).catch(() => {});
                          await refresh();
                        }}
                        className="shrink-0 py-1 px-3 rounded-lg text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors"
                      >
                        Stáhnout
                      </button>
                    </div>
                    {l.bids.length > 0 && (
                      <div className="border-t border-gray-100 pt-2 space-y-2">
                        {l.bids.map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-3">
                            <div className="text-sm">
                              <span className="font-heading font-bold">{b.bidderName}</span>
                              <span className="text-muted"> nabízí </span>
                              <span className="font-heading font-bold text-pitch-500">{formatCZK(b.amount)}</span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={async () => {
                                const ok = await confirm({ title: `Přijmout nabídku ${formatCZK(b.amount)}?`, description: `Od: ${b.bidderName}`, confirmLabel: "Přijmout" });
                                if (!ok || !teamId) return;
                                await apiFetch(`/api/teams/${teamId}/bids/${b.id}/accept`, { method: "POST" }).catch(() => {});
                                await refresh();
                              }} className="py-1 px-3 rounded-lg text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                                Přijmout
                              </button>
                              <button onClick={async () => {
                                if (!teamId) return;
                                await apiFetch(`/api/teams/${teamId}/bids/${b.id}/reject`, { method: "POST" }).catch(() => {});
                                await refresh();
                              }} className="py-1 px-3 rounded-lg text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                                Odmítnout
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Nabídky ═══ */}
      {tab === "offers" && (
        <div className="space-y-5">
          {incoming.length > 0 && (
            <div>
              <SectionLabel>Příchozí nabídky ({incoming.length})</SectionLabel>
              <div className="space-y-3">
                {incoming.map((o) => (
                  <div key={o.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Link href={`/dashboard/player/${o.player_id}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                            {o.first_name} {o.last_name}
                          </Link>
                          <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                        </div>
                        <div className="text-sm">
                          <span className="font-heading font-bold">{o.from_team_name}</span>
                          <span className="text-muted"> nabízí </span>
                          <span className="font-heading font-bold text-pitch-500">{formatCZK(o.counter_amount ?? o.offer_amount)}</span>
                        </div>
                        {o.message && <div className="text-xs text-muted mt-1 italic">&ldquo;{o.message}&rdquo;</div>}
                        {o.status === "countered" && <div className="text-xs text-gold-600 mt-1">Protinabídka: {formatCZK(o.counter_amount!)}</div>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={async () => {
                          const ok = await confirm({ title: `Přijmout ${formatCZK(o.counter_amount ?? o.offer_amount)}?`, description: `Za ${o.first_name} ${o.last_name}`, confirmLabel: "Přijmout" });
                          if (!ok || !teamId) return;
                          await apiFetch(`/api/teams/${teamId}/offers/${o.id}/accept`, { method: "POST" }).catch(() => {});
                          await refresh();
                        }} className="py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                          Přijmout
                        </button>
                        <button onClick={async () => {
                          if (!teamId) return;
                          await apiFetch(`/api/teams/${teamId}/offers/${o.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch(() => {});
                          await refresh();
                        }} className="py-1.5 px-3 rounded-lg text-sm font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                          Odmítnout
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <SectionLabel>Moje nabídky ({outgoing.length})</SectionLabel>
              <div className="space-y-3">
                {outgoing.map((o) => (
                  <div key={o.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-heading font-bold">{o.first_name} {o.last_name}</span>
                          <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">→ {o.to_team_name}</span>
                        </div>
                        <div className="text-sm text-muted">
                          Nabídka: <span className="font-heading font-bold text-ink">{formatCZK(o.offer_amount)}</span>
                          {o.counter_amount && <span className="text-gold-600 ml-2">Protinabídka: {formatCZK(o.counter_amount)}</span>}
                        </div>
                      </div>
                      <button onClick={async () => {
                        if (!teamId) return;
                        await apiFetch(`/api/teams/${teamId}/offers/${o.id}`, { method: "DELETE" }).catch(() => {});
                        await refresh();
                      }} className="shrink-0 py-1 px-3 rounded-lg text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                        Stáhnout
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incoming.length === 0 && outgoing.length === 0 && (
            <div className="card p-6 text-center text-muted">Žádné aktivní nabídky.</div>
          )}
        </div>
      )}

      {/* ═══ TAB: Můj tým ═══ */}
      {tab === "squad" && (
        <SquadTransferTable
          players={players}
          myListings={myListings}
          teamId={teamId!}
          confirm={confirm}
          setPriceDialog={setPriceDialog}
          refresh={refresh}
        />
      )}
    </div>
  );
}

type SortKey = "name" | "position" | "age" | "rating" | "speed" | "technique" | "shooting" | "passing" | "defense" | "stamina" | "wage";
type SortDir = "asc" | "desc";

const SORT_COLS: Array<{ key: SortKey; label: string; short: string }> = [
  { key: "name", label: "Jméno", short: "Jméno" },
  { key: "position", label: "Pozice", short: "Poz" },
  { key: "age", label: "Věk", short: "Věk" },
  { key: "rating", label: "Rating", short: "Rat" },
  { key: "speed", label: "Rychlost", short: "Rch" },
  { key: "technique", label: "Technika", short: "Tch" },
  { key: "shooting", label: "Střelba", short: "Stř" },
  { key: "passing", label: "Přihrávky", short: "Přh" },
  { key: "defense", label: "Obrana", short: "Obr" },
  { key: "stamina", label: "Výdrž", short: "Výd" },
  { key: "wage", label: "Mzda", short: "Mzda" },
];

function attrCellColor(v: number): string {
  if (v >= 70) return "text-pitch-500 font-bold";
  if (v >= 50) return "text-pitch-700";
  if (v >= 30) return "text-ink";
  return "text-muted";
}

function getPlayerSortValue(p: Player, key: SortKey): string | number {
  const s = p.skills as Record<string, number> | undefined;
  switch (key) {
    case "name": return `${p.last_name} ${p.first_name}`;
    case "position": return p.position;
    case "age": return p.age;
    case "rating": return p.overall_rating ?? 0;
    case "speed": return s?.speed ?? 0;
    case "technique": return s?.technique ?? 0;
    case "shooting": return s?.shooting ?? 0;
    case "passing": return s?.passing ?? 0;
    case "defense": return s?.defense ?? 0;
    case "stamina": return s?.stamina ?? 0;
    case "wage": return p.weekly_wage ?? 0;
  }
}

function SquadTransferTable({ players, myListings, teamId, confirm, setPriceDialog, refresh }: {
  players: Player[]; myListings: MyListing[]; teamId: string;
  confirm: (opts: any) => Promise<boolean>;
  setPriceDialog: (d: any) => void; refresh: () => Promise<void>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" || key === "position" ? "asc" : "desc"); }
  };

  const sorted = [...players].sort((a, b) => {
    const va = getPlayerSortValue(a, sortKey);
    const vb = getPlayerSortValue(b, sortKey);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "cs") : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div>
      <SectionLabel>Hráči ({players.length})</SectionLabel>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {SORT_COLS.map((col) => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`py-2 px-2 text-xs font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                    sortKey === col.key ? "text-pitch-600" : "text-muted"
                  } ${col.key === "name" ? "text-left pl-4" : "text-center"}`}
                  title={col.label}
                >
                  {col.short}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="py-2 px-2 text-xs font-heading uppercase text-muted text-center">Status</th>
              <th className="py-2 px-2 text-xs font-heading uppercase text-muted text-right pr-4">Akce</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const s = p.skills as Record<string, number> | undefined;
              const isQuit = (p as any).status === "quit";
              const isListed = myListings.some((l) => l.playerId === p.id);
              return (
                <tr key={p.id} className={`border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 ${isQuit ? "bg-red-50/30" : ""}`}>
                  <td className="py-2 px-2 pl-4">
                    <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                      {p.first_name} {p.last_name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-center"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /></td>
                  <td className="py-2 px-2 text-center tabular-nums text-muted">{p.age}</td>
                  <td className="py-2 px-2 text-center tabular-nums font-heading font-bold">{p.overall_rating}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.speed ?? 0)}`}>{s?.speed ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.technique ?? 0)}`}>{s?.technique ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.shooting ?? 0)}`}>{s?.shooting ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.passing ?? 0)}`}>{s?.passing ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.defense ?? 0)}`}>{s?.defense ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums ${attrCellColor(s?.stamina ?? 0)}`}>{s?.stamina ?? "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-muted text-xs">{formatCZK(p.weekly_wage ?? 0)}</td>
                  <td className="py-2 px-2 text-center">
                    {isQuit && <span className="text-xs font-heading font-bold text-card-red bg-red-50 px-1.5 py-0.5 rounded">Odmítá</span>}
                    {isListed && <span className="text-xs font-heading font-bold text-gold-600 bg-gold-50 px-1.5 py-0.5 rounded">Na trhu</span>}
                  </td>
                  <td className="py-2 px-2 pr-4 text-right">
                    <div className="flex gap-1.5 justify-end">
                      {!isListed && (
                        <button onClick={() => {
                          setPriceDialog({
                            title: `Vystavit ${p.first_name} ${p.last_name} na trh`,
                            description: `${p.position}, ${p.age} let, rating ${p.overall_rating}`,
                            defaultPrice: Math.round((p.overall_rating ?? 50) * 50),
                            onConfirm: async (price: number) => {
                              await apiFetch(`/api/teams/${teamId}/players/${p.id}/list`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ askingPrice: price }),
                              }).catch(() => {});
                              await refresh();
                            },
                          });
                        }} className="py-1 px-2.5 rounded text-xs font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                          Na trh
                        </button>
                      )}
                      <button onClick={async () => {
                        const ok = await confirm({
                          title: `Uvolnit ${p.first_name} ${p.last_name}?`,
                          description: "Hráč bude propuštěn a stane se volným hráčem. Tuto akci nelze vrátit.",
                          confirmLabel: "Uvolnit",
                        });
                        if (!ok) return;
                        await apiFetch(`/api/teams/${teamId}/players/${p.id}/release`, { method: "POST" }).catch(() => {});
                        await refresh();
                      }} className="py-1 px-2.5 rounded text-xs font-heading font-bold bg-card-red text-white hover:bg-red-600 transition-colors">
                        Uvolnit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceDialog({ title, description, defaultPrice, onConfirm, onClose }: {
  title: string; description: string; defaultPrice: number;
  onConfirm: (price: number) => void; onClose: () => void;
}) {
  const [price, setPrice] = useState(defaultPrice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[90vw] max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg">{title}</h3>
          <p className="text-sm text-muted mt-1">{description}</p>

          <div className="mt-4">
            <label className="text-xs text-muted font-heading uppercase">Požadovaná cena (Kč)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
              min={0}
              step={500}
              autoFocus
            />
            <div className="flex justify-center gap-2 mt-2">
              {[1000, 2500, 5000, 10000].map((v) => (
                <button key={v} onClick={() => setPrice(v)}
                  className={`px-2 py-1 rounded text-xs font-heading font-bold transition-colors ${price === v ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}>
                  {(v / 1000)}k
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-3.5 text-sm font-heading font-bold text-muted hover:bg-gray-50 transition-colors">
            Zrušit
          </button>
          <button onClick={async () => {
              try { await onConfirm(price); } catch { /* ignore */ }
              onClose();
            }}
            className="flex-1 py-3.5 text-sm font-heading font-bold text-pitch-500 hover:bg-pitch-50 transition-colors border-l border-gray-100">
            Potvrdit
          </button>
        </div>
      </div>
    </div>
  );
}
