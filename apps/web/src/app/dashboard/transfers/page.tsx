"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge, useConfirm } from "@/components/ui";
import { PlayerRevealCard } from "@/components/players/reveal-card";
import { FaceAvatar } from "@/components/players/face-avatar";

type Tab = "search" | "free_agents" | "market" | "offers" | "squad";

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

function skillColor(v: number): string {
  if (v >= 70) return "text-pitch-500 font-bold";
  if (v >= 55) return "text-pitch-700";
  if (v >= 40) return "text-ink";
  if (v >= 25) return "text-amber-700";
  return "text-card-red";
}

interface FreeAgent {
  id: string; firstName: string; lastName: string; nickname?: string; age: number;
  position: string; overallRating: number; weeklyWage: number; occupation: string;
  source: string; villageName: string | null; distanceKm: number | null;
  expiresAt: string; avatar: Record<string, unknown>;
  skills: { speed?: number; technique?: number; shooting?: number; passing?: number; heading?: number; defense?: number; goalkeeping?: number; creativity?: number; setPieces?: number };
  physical: { stamina?: number; strength?: number; preferredFoot?: string };
  personality: { discipline?: number; workRate?: number; leadership?: number };
}

interface MarketListing {
  id: string; playerId: string; askingPrice: number; playerName: string;
  playerAge: number; position: string; overallRating: number; teamName: string;
  expiresAt: string; avatar: Record<string, unknown>;
  myBidAmount?: number | null;
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
  offer_type?: "transfer" | "loan"; loan_duration?: number | null;
}

type FASortKey = "rating" | "wage" | "age" | "distance";

interface FAFilters {
  position: string;
  ratingMin: number;
  ratingMax: number;
  ageMin: number;
  ageMax: number;
  maxWage: number;
  speedMin: number;
  techniqueMin: number;
  shootingMin: number;
  passingMin: number;
  defenseMin: number;
  staminaMin: number;
  sort: FASortKey;
}

interface FilterPreset {
  name: string;
  filters: FAFilters;
}

const DEFAULT_FILTERS: FAFilters = {
  position: "all",
  ratingMin: 0,
  ratingMax: 99,
  ageMin: 15,
  ageMax: 50,
  maxWage: 0,
  speedMin: 0,
  techniqueMin: 0,
  shootingMin: 0,
  passingMin: 0,
  defenseMin: 0,
  staminaMin: 0,
  sort: "rating",
};

const PRESETS_KEY = "fmko-transfer-filters";

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FilterPreset[];
  } catch { return []; }
}

function savePresets(presets: FilterPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function countActiveFilters(f: FAFilters): number {
  let n = 0;
  if (f.position !== "all") n++;
  if (f.ratingMin > 0) n++;
  if (f.ratingMax < 99) n++;
  if (f.ageMin > 15) n++;
  if (f.ageMax < 50) n++;
  if (f.maxWage > 0) n++;
  if (f.speedMin > 0) n++;
  if (f.techniqueMin > 0) n++;
  if (f.shootingMin > 0) n++;
  if (f.passingMin > 0) n++;
  if (f.defenseMin > 0) n++;
  if (f.staminaMin > 0) n++;
  return n;
}

const POS_MAP: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_PILLS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Vše" },
  { value: "GK", label: "BRA" },
  { value: "DEF", label: "OBR" },
  { value: "MID", label: "ZÁL" },
  { value: "FWD", label: "ÚTO" },
];

const SORT_OPTIONS: Array<{ value: FASortKey; label: string }> = [
  { value: "rating", label: "Rating" },
  { value: "wage", label: "Plat" },
  { value: "age", label: "Věk" },
  { value: "distance", label: "Vzdálenost" },
];

export default function TransfersPage() {
  const { teamId, primaryColor } = useTeam();
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
  // Loans
  const [loanedOut, setLoanedOut] = useState<Array<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number; loan_until: string; loan_team_name: string }>>([]);
  const [loanedIn, setLoanedIn] = useState<Array<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number; loan_until: string; owner_team_name: string }>>([]);
  // Squad
  const [players, setPlayers] = useState<Player[]>([]);
  // Price dialog
  const [priceDialog, setPriceDialog] = useState<{ title: string; description: string; defaultPrice: number; onConfirm: (price: number) => void } | null>(null);
  // Player reveal
  const [revealPlayer, setRevealPlayer] = useState<Player | null>(null);

  // Free agent filters
  const [filters, setFilters] = useState<FAFilters>({ ...DEFAULT_FILTERS });
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  useEffect(() => { setPresets(loadPresets()); }, []);

  const activeCount = countActiveFilters(filters);

  const filteredAgents = useMemo(() => {
    let list = freeAgents.filter((fa) => {
      if (filters.position !== "all" && fa.position !== filters.position) return false;
      if (fa.overallRating < filters.ratingMin) return false;
      if (fa.overallRating > filters.ratingMax) return false;
      if (fa.age < filters.ageMin) return false;
      if (fa.age > filters.ageMax) return false;
      if (filters.maxWage > 0 && fa.weeklyWage > filters.maxWage) return false;
      if (filters.speedMin > 0 && (fa.skills?.speed ?? 0) < filters.speedMin) return false;
      if (filters.techniqueMin > 0 && (fa.skills?.technique ?? 0) < filters.techniqueMin) return false;
      if (filters.shootingMin > 0 && (fa.skills?.shooting ?? 0) < filters.shootingMin) return false;
      if (filters.passingMin > 0 && (fa.skills?.passing ?? 0) < filters.passingMin) return false;
      if (filters.defenseMin > 0 && (fa.skills?.defense ?? 0) < filters.defenseMin) return false;
      if (filters.staminaMin > 0 && (fa.physical?.stamina ?? 0) < filters.staminaMin) return false;
      return true;
    });

    list.sort((a, b) => {
      switch (filters.sort) {
        case "rating": return b.overallRating - a.overallRating;
        case "wage": return a.weeklyWage - b.weeklyWage;
        case "age": return a.age - b.age;
        case "distance": return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        default: return 0;
      }
    });

    return list;
  }, [freeAgents, filters]);

  const isFiltered = activeCount > 0;

  const refresh = async () => {
    if (!teamId) return;
    const [fa, market, offers, squad] = await Promise.all([
      apiFetch<{ freeAgents: FreeAgent[] }>(`/api/teams/${teamId}/free-agents`).catch((e) => { console.error("Failed to load free agents:", e); return { freeAgents: [] }; }),
      apiFetch<{ listings: MarketListing[]; myListings: MyListing[] }>(`/api/teams/${teamId}/market`).catch((e) => { console.error("Failed to load market:", e); return { listings: [], myListings: [] }; }),
      apiFetch<{ incoming: TransferOffer[]; outgoing: TransferOffer[]; loanedOut: typeof loanedOut; loanedIn: typeof loanedIn }>(`/api/teams/${teamId}/offers`).catch((e) => { console.error("Failed to load offers:", e); return { incoming: [], outgoing: [], loanedOut: [], loanedIn: [] }; }),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`).catch((e) => { console.error("Failed to load players:", e); return []; }),
    ]);
    setFreeAgents(fa.freeAgents);
    setListings(market.listings);
    setMyListings(market.myListings);
    setIncoming(offers.incoming);
    setOutgoing(offers.outgoing);
    setLoanedOut(offers.loanedOut ?? []);
    setLoanedIn(offers.loanedIn ?? []);
    setPlayers(squad);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const updated = [...presets, { name: presetName.trim(), filters: { ...filters } }].slice(-10);
    setPresets(updated);
    savePresets(updated);
    setPresetName("");
    setShowPresetInput(false);
  };

  const handleDeletePreset = (idx: number) => {
    const updated = presets.filter((_, i) => i !== idx);
    setPresets(updated);
    savePresets(updated);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setFilters({ ...preset.filters });
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
  };

  const toggleSkills = (id: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Search all players
  interface SearchPlayer {
    id: string; firstName: string; lastName: string; nickname?: string;
    age: number; position: string; overallRating: number; weeklyWage: number;
    squadNumber?: number; teamId: string; teamName: string; isOwnTeam: boolean;
    skills: Record<string, number>; physical: Record<string, unknown>; avatar: Record<string, unknown>;
  }
  const [searchPlayers, setSearchPlayers] = useState<SearchPlayer[]>([]);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPos, setSearchPos] = useState<string>("all");
  const [searchSort, setSearchSort] = useState<string>("rating");
  const [searchMinRating, setSearchMinRating] = useState(0);
  const [searchExpandedSkills, setSearchExpandedSkills] = useState<Set<string>>(new Set());

  const loadSearch = async () => {
    if (!teamId || searchLoaded) return;
    const data = await apiFetch<{ players: SearchPlayer[] }>(`/api/teams/${teamId}/search-players`).catch((e) => { console.error("Failed to search players:", e); return { players: [] }; });
    setSearchPlayers(data.players);
    setSearchLoaded(true);
  };

  const filteredSearch = useMemo(() => {
    let list = searchPlayers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q));
    }
    if (searchPos !== "all") list = list.filter(p => p.position === searchPos);
    if (searchMinRating > 0) list = list.filter(p => p.overallRating >= searchMinRating);
    list = [...list].sort((a, b) => {
      switch (searchSort) {
        case "rating": return b.overallRating - a.overallRating;
        case "age": return a.age - b.age;
        case "wage": return a.weeklyWage - b.weeklyWage;
        case "name": return `${a.lastName}`.localeCompare(`${b.lastName}`, "cs");
        default: return 0;
      }
    });
    return list;
  }, [searchPlayers, searchQuery, searchPos, searchSort, searchMinRating]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const tabs: [Tab, string, number][] = [
    ["search", "Hledání", 0],
    ["free_agents", "Volní hráči", freeAgents.length],
    ["market", "Trh", listings.length],
    ["offers", "Nabídky", incoming.length],
    ["squad", "Můj tým", players.filter((p) => (p as any).status === "quit").length],
  ];

  return (
    <div className="page-container space-y-5">
      {confirmDialog}
      {priceDialog && <PriceDialog {...priceDialog} onClose={() => setPriceDialog(null)} />}

      {/* Player reveal overlay */}
      {revealPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setRevealPlayer(null)}>
          <div className="w-[320px]" onClick={(e) => e.stopPropagation()}>
            <PlayerRevealCard
              player={revealPlayer}
              teamColor={primaryColor || "#2D5F2D"}
              delay={300}
              onRevealed={() => {
                setTimeout(() => {
                  // Auto-close after 3s
                }, 3000);
              }}
            />
            <button onClick={() => setRevealPlayer(null)}
              className="w-full mt-4 py-3 rounded-xl font-heading font-bold text-white bg-white/10 hover:bg-white/20 transition-colors text-base">
              Pokračovat
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {tabs.map(([key, label, count]) => (
          <button key={key} onClick={() => { setTab(key); if (key === "search") loadSearch(); }}
            className={`flex-1 py-2 text-sm font-heading font-bold rounded-lg transition-colors ${
              tab === key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}>
            {label}{count > 0 ? ` (${count})` : ""}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Hledání ═══ */}
      {tab === "search" && (
        <div className="space-y-3">
          {!searchLoaded && <div className="flex justify-center py-8"><Spinner /></div>}
          {searchLoaded && (
            <>
              {/* Search + filters */}
              <div className="card p-3 space-y-3">
                <input
                  type="text" placeholder="Hledat jméno nebo tým..."
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-heading text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
                />
                <div className="flex flex-wrap gap-2 items-center">
                  {["all", "GK", "DEF", "MID", "FWD"].map((pos) => (
                    <button key={pos} onClick={() => setSearchPos(pos)}
                      className={`px-3 py-1 rounded-lg text-xs font-heading font-bold transition-colors ${searchPos === pos ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}>
                      {pos === "all" ? "Vše" : pos === "GK" ? "BRA" : pos === "DEF" ? "OBR" : pos === "MID" ? "ZÁL" : "ÚTO"}
                    </button>
                  ))}
                  <span className="text-muted text-xs ml-1">Rating:</span>
                  {[0, 30, 50, 60].map((v) => (
                    <button key={v} onClick={() => setSearchMinRating(v)}
                      className={`px-2 py-1 rounded text-xs font-heading font-bold transition-colors ${searchMinRating === v ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}>
                      {v === 0 ? "Vše" : `${v}+`}
                    </button>
                  ))}
                  <select value={searchSort} onChange={(e) => setSearchSort(e.target.value)}
                    className="ml-auto px-2 py-1 rounded-lg border border-gray-200 text-xs font-heading">
                    <option value="rating">Rating</option>
                    <option value="age">Věk</option>
                    <option value="wage">Plat</option>
                    <option value="name">Jméno</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-muted font-heading px-1">{filteredSearch.length} z {searchPlayers.length} hráčů</div>

              {/* Results */}
              <div className="space-y-2">
                {filteredSearch.map((p) => {
                  const isExpanded = searchExpandedSkills.has(p.id);
                  return (
                    <div key={p.id} className={`card p-3 ${p.isOwnTeam ? "ring-1 ring-pitch-500/20" : ""}`}>
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 w-10 h-10 rounded-full bg-gray-100">
                          {p.avatar && Object.keys(p.avatar).length > 0
                            ? <FaceAvatar faceConfig={p.avatar} size={40} className="rounded-full" />
                            : <div className="w-full h-full flex items-center justify-center font-heading font-bold text-xs text-muted">{p.firstName[0]}{p.lastName[0]}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors truncate">
                              {p.firstName} {p.lastName}
                            </Link>
                            <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                            <span className="text-sm font-heading font-bold tabular-nums">{p.overallRating}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                            <span>{p.age} let</span>
                            <Link href={`/dashboard/team/${p.teamId}`} className="hover:text-pitch-500 transition-colors">
                              {p.teamName}{p.isOwnTeam ? " (tvůj)" : ""}
                            </Link>
                            <span>{formatCZK(p.weeklyWage)}/týd</span>
                          </div>
                        </div>
                        <button onClick={() => {
                          const next = new Set(searchExpandedSkills);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          setSearchExpandedSkills(next);
                        }} className="shrink-0 text-xs text-muted hover:text-pitch-500 transition-colors font-heading">
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </div>
                      {isExpanded && p.skills && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          {!p.isOwnTeam && (
                            <p className="text-xs text-amber-600 mb-1.5 italic">⚠ Odhad — přesné hodnoty znáš jen u svých hráčů</p>
                          )}
                          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                            {[["Rych", "speed"], ["Tech", "technique"], ["Stř", "shooting"],
                              ["Přih", "passing"], ["Obr", "defense"], ["Výd", "stamina"],
                              ["Hlav", "heading"], ["Síla", "strength"], ["Bra", "goalkeeping"]].map(([label, key]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted text-xs">{label}</span>
                                <span className={`font-heading font-bold tabular-nums text-xs ${skillColor(p.skills[key] ?? 0)}`}>{!p.isOwnTeam ? "~" : ""}{p.skills[key] ?? "—"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredSearch.length === 0 && (
                <div className="card p-6 text-center text-muted">
                  Žádný hráč neodpovídá.
                  <button onClick={() => { setSearchQuery(""); setSearchPos("all"); setSearchMinRating(0); }} className="ml-2 text-pitch-500 font-heading font-bold hover:underline">Resetovat</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB: Volní hráči ═══ */}
      {tab === "free_agents" && (
        <div className="space-y-3">
          {/* Filter toggle button (sticky on mobile) */}
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`w-full py-2.5 rounded-xl font-heading font-bold text-sm transition-colors ${
              filterOpen ? "bg-pitch-500 text-white" : "bg-white text-ink border border-gray-200"
            }`}
          >
            Filtrovat{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>

          {/* Filter panel */}
          <div className={`overflow-hidden transition-all duration-300 ${filterOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
            <div className="card p-4 space-y-4">
              {/* Position pills */}
              <div>
                <label className="text-xs font-heading uppercase text-muted mb-1.5 block">Pozice</label>
                <div className="flex gap-1.5">
                  {POS_PILLS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setFilters((f) => ({ ...f, position: p.value }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${
                        filters.position === p.value
                          ? "bg-pitch-500 text-white"
                          : "bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div>
                <label className="text-xs font-heading uppercase text-muted mb-1.5 block">Rating</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={99} placeholder="Min"
                    value={filters.ratingMin || ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ratingMin: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                  <span className="text-muted text-sm">—</span>
                  <input
                    type="number" min={0} max={99} placeholder="Max"
                    value={filters.ratingMax < 99 ? filters.ratingMax : ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ratingMax: parseInt(e.target.value) || 99 }))}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {[30, 50, 60].map((v) => (
                    <button
                      key={v}
                      onClick={() => setFilters((f) => ({ ...f, ratingMin: v }))}
                      className={`px-2.5 py-1 rounded text-xs font-heading font-bold transition-colors ${
                        filters.ratingMin === v ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {v}+
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="text-xs font-heading uppercase text-muted mb-1.5 block">Věk</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={15} max={50} placeholder="Min"
                    value={filters.ageMin > 15 ? filters.ageMin : ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ageMin: parseInt(e.target.value) || 15 }))}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                  <span className="text-muted text-sm">—</span>
                  <input
                    type="number" min={15} max={50} placeholder="Max"
                    value={filters.ageMax < 50 ? filters.ageMax : ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ageMax: parseInt(e.target.value) || 50 }))}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                </div>
              </div>

              {/* Max wage */}
              <div>
                <label className="text-xs font-heading uppercase text-muted mb-1.5 block">Max mzda (Kč/týden)</label>
                <input
                  type="number" min={0} step={100} placeholder="Bez limitu"
                  value={filters.maxWage || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, maxWage: parseInt(e.target.value) || 0 }))}
                  className="w-32 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                />
              </div>

              {/* Expandable skill filters */}
              <div>
                <button
                  onClick={() => setMoreFilters(!moreFilters)}
                  className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 transition-colors"
                >
                  {moreFilters ? "Méně filtrů ▲" : "Více filtrů ▼"}
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${moreFilters ? "max-h-[500px] opacity-100 mt-3" : "max-h-0 opacity-0"}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {([
                      ["speedMin", "Rychlost"],
                      ["techniqueMin", "Technika"],
                      ["shootingMin", "Střelba"],
                      ["passingMin", "Přihrávky"],
                      ["defenseMin", "Obrana"],
                      ["staminaMin", "Výdrž"],
                    ] as Array<[keyof FAFilters, string]>).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-xs font-heading text-muted block mb-1">{label} min</label>
                        <input
                          type="number" min={0} max={99} placeholder="0"
                          value={(filters[key] as number) || ""}
                          onChange={(e) => setFilters((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="text-xs font-heading uppercase text-muted mb-1.5 block">Řazení</label>
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as FASortKey }))}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-heading focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <button onClick={resetFilters} className="py-1.5 px-3 rounded-lg text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                  Resetovat
                </button>
                {!showPresetInput ? (
                  <button onClick={() => setShowPresetInput(true)} className="py-1.5 px-3 rounded-lg text-xs font-heading font-bold bg-pitch-50 text-pitch-600 hover:bg-pitch-100 transition-colors">
                    Uložit filtr
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); if (e.key === "Escape") setShowPresetInput(false); }}
                      placeholder="Název filtru"
                      className="px-2 py-1 rounded-lg border border-gray-200 text-sm font-heading focus:outline-none focus:ring-2 focus:ring-pitch-500/30 w-32"
                      autoFocus
                    />
                    <button onClick={handleSavePreset} className="py-1 px-2.5 rounded-lg text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                      OK
                    </button>
                    <button onClick={() => setShowPresetInput(false)} className="py-1 px-2 rounded-lg text-xs font-heading font-bold text-muted hover:bg-gray-100 transition-colors">
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* Preset chips */}
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {presets.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleApplyPreset(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-heading font-bold bg-surface text-ink hover:bg-pitch-50 transition-colors group"
                    >
                      {p.name}
                      <span
                        onClick={(e) => { e.stopPropagation(); handleDeletePreset(i); }}
                        className="text-muted hover:text-card-red transition-colors ml-0.5"
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Result count */}
          <SectionLabel>
            Volní hráči v okresu{" "}
            {isFiltered
              ? `(${filteredAgents.length} z ${freeAgents.length} hráčů)`
              : `(${freeAgents.length} hráčů)`
            }
          </SectionLabel>

          {/* Free agent cards */}
          {filteredAgents.length === 0 ? (
            <div className="card p-6 text-center space-y-3">
              <p className="text-muted">{isFiltered ? "Žádní hráči neodpovídají filtrům." : "Žádní volní hráči nejsou k dispozici."}</p>
              {isFiltered && (
                <button onClick={resetFilters} className="py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                  Resetovat filtry
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAgents.map((fa) => {
                const isExpanded = expandedSkills.has(fa.id);
                return (
                  <div key={fa.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-11 h-11 rounded-full bg-gray-100">
                        {fa.avatar && Object.keys(fa.avatar).length > 0
                          ? <FaceAvatar faceConfig={fa.avatar} size={44} className="rounded-full" />
                          : <div className="w-full h-full flex items-center justify-center font-heading font-bold text-sm text-muted">{fa.firstName[0]}{fa.lastName[0]}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-heading font-bold text-base">{fa.firstName} {fa.lastName}</span>
                          <PositionBadge position={fa.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">{fa.age} let</span>
                          <span className="text-sm font-heading font-bold tabular-nums">{fa.overallRating}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                          <span>{fa.occupation}</span>
                          <span>Mzda: <span className="font-heading font-bold text-ink">{formatCZK(fa.weeklyWage)}/týd</span></span>
                          {fa.distanceKm !== null && <span>{fa.distanceKm} km</span>}
                          {fa.villageName && <span>{fa.villageName}</span>}
                          {fa.source === "released" && <span className="text-gold-600">Propuštěn</span>}
                        </div>

                        {/* Expandable skills */}
                        <button
                          onClick={() => toggleSkills(fa.id)}
                          className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 transition-colors mt-1.5"
                        >
                          {isExpanded ? "Dovednosti ▲" : "Dovednosti ▼"}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-sm tabular-nums">
                            <div>
                              <span className="text-muted font-heading">Rych </span>
                              <span className={skillColor(fa.skills?.speed ?? 0)}>{fa.skills?.speed ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Tech </span>
                              <span className={skillColor(fa.skills?.technique ?? 0)}>{fa.skills?.technique ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Stř </span>
                              <span className={skillColor(fa.skills?.shooting ?? 0)}>{fa.skills?.shooting ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Přih </span>
                              <span className={skillColor(fa.skills?.passing ?? 0)}>{fa.skills?.passing ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Obr </span>
                              <span className={skillColor(fa.skills?.defense ?? 0)}>{fa.skills?.defense ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Výd </span>
                              <span className={skillColor(fa.physical?.stamina ?? 0)}>{fa.physical?.stamina ?? "—"}</span>
                            </div>
                          </div>
                        )}
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
                          const res = await apiFetch<{ success: boolean; decision: { accepted: boolean; probability: number; explanation: string }; player?: Player }>(
                            `/api/teams/${teamId}/free-agents/${fa.id}/sign`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeredWage: fa.weeklyWage }) },
                          ).catch((e) => { console.error("Transfer action failed:", e); return null; });
                          if (res) {
                            if (res.success && res.player) {
                              setRevealPlayer(res.player);
                            } else {
                              await confirm({
                                title: "Odmítl",
                                description: res.decision.explanation,
                                confirmLabel: "OK",
                              });
                            }
                            await refresh();
                          }
                        }}
                        className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                      >
                        Podepsat
                      </button>
                    </div>
                  </div>
                );
              })}
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
                      {l.myBidAmount ? (
                        <span className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-50 text-pitch-600">
                          Nabídnuto {formatCZK(l.myBidAmount)}
                        </span>
                      ) : (
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
                                }).catch((e) => console.error("Transfer action failed:", e));
                                setPriceDialog(null);
                                await refresh();
                              },
                            });
                          }}
                          className="shrink-0 py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                        >
                          Nabídnout
                        </button>
                      )}
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
                          await apiFetch(`/api/teams/${teamId}/listings/${l.id}`, { method: "DELETE" }).catch((e) => console.error("Transfer action failed:", e));
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
                                await apiFetch(`/api/teams/${teamId}/bids/${b.id}/accept`, { method: "POST" }).catch((e) => console.error("Transfer action failed:", e));
                                await refresh();
                              }} className="py-1 px-3 rounded-lg text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                                Přijmout
                              </button>
                              <button onClick={async () => {
                                if (!teamId) return;
                                await apiFetch(`/api/teams/${teamId}/bids/${b.id}/reject`, { method: "POST" }).catch((e) => console.error("Transfer action failed:", e));
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
                          {o.offer_type === "loan" ? (
                            <span className="text-yellow-600 font-heading font-bold">Hostování{o.loan_duration ? ` (${o.loan_duration} dní)` : ""}{(o.counter_amount ?? o.offer_amount) > 0 ? ` za ${formatCZK(o.counter_amount ?? o.offer_amount)}` : " zdarma"}</span>
                          ) : (
                            <span className="font-heading font-bold text-pitch-500">{formatCZK(o.counter_amount ?? o.offer_amount)}</span>
                          )}
                        </div>
                        {o.message && <div className="text-xs text-muted mt-1 italic">&ldquo;{o.message}&rdquo;</div>}
                        {o.status === "countered" && <div className="text-xs text-gold-600 mt-1">Protinabídka: {formatCZK(o.counter_amount!)}</div>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={async () => {
                          const ok = await confirm({ title: `Přijmout ${formatCZK(o.counter_amount ?? o.offer_amount)}?`, description: `Za ${o.first_name} ${o.last_name}`, confirmLabel: "Přijmout" });
                          if (!ok || !teamId) return;
                          await apiFetch(`/api/teams/${teamId}/offers/${o.id}/accept`, { method: "POST" }).catch((e) => console.error("Transfer action failed:", e));
                          await refresh();
                        }} className="py-1.5 px-4 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                          Přijmout
                        </button>
                        <button onClick={async () => {
                          if (!teamId) return;
                          await apiFetch(`/api/teams/${teamId}/offers/${o.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).catch((e) => console.error("Transfer action failed:", e));
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
                          {o.offer_type === "loan" ? (
                            <span className="text-yellow-600 font-heading font-bold">Hostování{o.loan_duration ? ` (${o.loan_duration} dní)` : ""}</span>
                          ) : (
                            <>Nabídka: <span className="font-heading font-bold text-ink">{formatCZK(o.offer_amount)}</span></>
                          )}
                          {o.counter_amount && <span className="text-gold-600 ml-2">Protinabídka: {formatCZK(o.counter_amount)}</span>}
                        </div>
                      </div>
                      <button onClick={async () => {
                        if (!teamId) return;
                        await apiFetch(`/api/teams/${teamId}/offers/${o.id}`, { method: "DELETE" }).catch((e) => console.error("Transfer action failed:", e));
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

          {/* Loaned out players */}
          {loanedOut.length > 0 && (
            <div>
              <SectionLabel>Na hostování (odchozí)</SectionLabel>
              <div className="space-y-2">
                {loanedOut.map((p) => (
                  <div key={p.id} className="card p-3 flex items-center gap-3">
                    <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                      {p.first_name} {p.last_name}
                    </Link>
                    <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                    <span className="text-sm text-muted">→ {p.loan_team_name}</span>
                    <span className="ml-auto text-xs text-yellow-600 font-heading font-bold">
                      do {new Date(p.loan_until).toLocaleDateString("cs")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loaned in players */}
          {loanedIn.length > 0 && (
            <div>
              <SectionLabel>Na hostování (příchozí)</SectionLabel>
              <div className="space-y-2">
                {loanedIn.map((p) => (
                  <div key={p.id} className="card p-3 flex items-center gap-3">
                    <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                      {p.first_name} {p.last_name}
                    </Link>
                    <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                    <span className="text-sm text-muted">z {p.owner_team_name}</span>
                    <span className="ml-auto text-xs text-yellow-600 font-heading font-bold">
                      do {new Date(p.loan_until).toLocaleDateString("cs")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incoming.length === 0 && outgoing.length === 0 && loanedOut.length === 0 && loanedIn.length === 0 && (
            <div className="card p-6 text-center text-muted">Žádné aktivní nabídky ani hostování.</div>
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
              {SORT_COLS.map((col) => {
                const hideMobile = ["speed", "technique", "shooting", "passing", "defense", "stamina", "wage"].includes(col.key);
                return (
                  <th key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`py-2 px-2 text-xs font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                      sortKey === col.key ? "text-pitch-600" : "text-muted"
                    } ${col.key === "name" ? "text-left pl-4" : "text-center"} ${hideMobile ? "hidden sm:table-cell" : ""}`}
                    title={col.label}
                  >
                    {col.short}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                );
              })}
              <th className="py-2 px-2 text-xs font-heading uppercase text-muted text-center hidden sm:table-cell">Status</th>
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
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.speed ?? 0)}`}>{s?.speed ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.technique ?? 0)}`}>{s?.technique ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.shooting ?? 0)}`}>{s?.shooting ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.passing ?? 0)}`}>{s?.passing ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.defense ?? 0)}`}>{s?.defense ?? "—"}</td>
                  <td className={`py-2 px-2 text-center tabular-nums hidden sm:table-cell ${attrCellColor(s?.stamina ?? 0)}`}>{s?.stamina ?? "—"}</td>
                  <td className="py-2 px-2 text-center tabular-nums text-muted text-xs hidden sm:table-cell">{formatCZK(p.weekly_wage ?? 0)}</td>
                  <td className="py-2 px-2 text-center hidden sm:table-cell">
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
                              }).catch((e) => console.error("Transfer action failed:", e));
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
                        await apiFetch(`/api/teams/${teamId}/players/${p.id}/release`, { method: "POST" }).catch((e) => console.error("Transfer action failed:", e));
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
