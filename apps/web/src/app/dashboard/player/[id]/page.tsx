"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, type Player, type Team, type CareerStats, type PlayerMatchEntry, type PlayerContract } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PositionBadge, SectionLabel, Spinner, BadgePreview, JerseyPreview, useConfirm } from "@/components/ui";
import { generateCharacteristics, type PlayerTag } from "@/lib/characteristics";
import type { BadgePattern } from "@/components/ui";

/* ── Helpers ── */

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function traitLevel(value: number): { label: string; color: string } {
  if (value >= 80) return { label: "Velmi vysoký", color: "text-pitch-400" };
  if (value >= 60) return { label: "Vysoký", color: "text-pitch-500" };
  if (value >= 40) return { label: "Průměrný", color: "text-muted" };
  if (value >= 20) return { label: "Nízký", color: "text-gold-600" };
  return { label: "Velmi nízký", color: "text-card-red" };
}

function footLabel(foot?: string): string {
  if (foot === "left") return "Levá";
  if (foot === "right") return "Pravá";
  if (foot === "both") return "Oboumožka";
  return "—";
}

function sideLabel(side?: string): string {
  if (side === "left") return "Levá";
  if (side === "right") return "Pravá";
  if (side === "center") return "Střed";
  if (side === "any") return "Všechny";
  return "—";
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

/* ── Page ── */

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [playerTeam, setPlayerTeam] = useState<Team | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [careerStats, setCareerStats] = useState<CareerStats | null>(null);
  const [matchHistory, setMatchHistory] = useState<PlayerMatchEntry[]>([]);
  const [contracts, setContracts] = useState<PlayerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerSending, setOfferSending] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [offerType, setOfferType] = useState<"transfer" | "loan">("transfer");
  const [loanDuration, setLoanDuration] = useState("30");
  const [myListing, setMyListing] = useState<{ listingId: string; askingPrice: number } | null>(null);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [profileExtras, setProfileExtras] = useState<{
    personality: Record<string, number>;
    relationships: Array<{ relatedPlayerId: string; relatedPlayerName: string; relatedPlayerPosition: string; type: string; typeLabel: string; strength: number; effect: string }>;
  } | null>(null);
  const [showAllRelationships, setShowAllRelationships] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    // First fetch the player to find which team they belong to
    apiFetch<Player>(`/api/teams/${teamId}/players/${playerId}`)
      .then(async (p) => {
        setPlayer(p);
        const playerOwnerTeamId = p.team_id || teamId;
        const isForeign = playerOwnerTeamId !== teamId;

        const [t, all, stats, history, careerHistory] = await Promise.all([
          apiFetch<Team>(`/api/teams/${teamId}`),
          // Fetch players from the PLAYER's team for navigation arrows
          apiFetch<Player[]>(`/api/teams/${playerOwnerTeamId}/players`),
          apiFetch<CareerStats>(`/api/teams/${teamId}/players/${playerId}/career-stats`).catch((e) => { console.error("career-stats fetch:", e); return null; }),
          apiFetch<{ matches: PlayerMatchEntry[] }>(`/api/teams/${teamId}/players/${playerId}/match-history`).catch((e) => { console.error("match-history fetch:", e); return { matches: [] }; }),
          apiFetch<{ contracts: PlayerContract[] }>(`/api/teams/${teamId}/players/${playerId}/career-history`).catch((e) => { console.error("career-history fetch:", e); return { contracts: [] }; }),
        ]);

        setTeam(t);
        setAllPlayers(all);
        setCareerStats(stats);
        setMatchHistory(history.matches);
        setContracts(careerHistory.contracts);

        if (isForeign) {
          const pt = await apiFetch<Team>(`/api/teams/${playerOwnerTeamId}`).catch((e) => { console.error("player team fetch:", e); return null; });
          setPlayerTeam(pt);
        } else {
          // Own player — check if already listed on market
          const market = await apiFetch<{ myListings: Array<{ id: string; playerId: string; askingPrice: number }> }>(`/api/teams/${teamId}/market`).catch((e) => { console.error("market fetch:", e); return null; });
          const found = market?.myListings?.find((l) => l.playerId === playerId);
          if (found) setMyListing({ listingId: found.id, askingPrice: found.askingPrice });
        }

        // Profile extras (personality + relationships) — only for own players
        if (!isForeign) {
          const extras = await apiFetch<typeof profileExtras>(`/api/teams/${teamId}/players/${playerId}/profile-extras`).catch((e) => { console.error("profile-extras fetch:", e); return null; });
          if (extras) setProfileExtras(extras);
        }
        setLoading(false);
      })
      .catch((e) => { console.error("player detail load:", e); setLoading(false); });
  }, [teamId, playerId]);

  const refreshListing = async () => {
    if (!teamId) return;
    const market = await apiFetch<{ myListings: Array<{ id: string; playerId: string; askingPrice: number }> }>(`/api/teams/${teamId}/market`).catch((e) => { console.error("market refresh:", e); return null; });
    const found = market?.myListings?.find((l) => l.playerId === playerId);
    setMyListing(found ? { listingId: found.id, askingPrice: found.askingPrice } : null);
  };

  const listOnMarket = async (price: number) => {
    if (!teamId || !player || actionLoading) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/teams/${teamId}/players/${playerId}/list`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ askingPrice: price }),
      });
      setPriceDialogOpen(false);
      await refreshListing();
    } catch (e) {
      console.error("list on market failed:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const withdrawFromMarket = async () => {
    if (!teamId || !myListing || actionLoading) return;
    const ok = await confirm({
      title: "Stáhnout z trhu?",
      description: `${player?.first_name} ${player?.last_name} se vrátí zpět do tvého kádru.`,
      confirmLabel: "Stáhnout",
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/teams/${teamId}/listings/${myListing.listingId}`, { method: "DELETE" });
      await refreshListing();
    } catch (e) {
      console.error("withdraw listing failed:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const releasePlayer = async () => {
    if (!teamId || !player || actionLoading) return;
    const ok = await confirm({
      title: `Propustit ${player.first_name} ${player.last_name}?`,
      description: "Hráč bude uvolněn z kádru a stane se volným hráčem. Akci nelze vrátit.",
      confirmLabel: "Propustit",
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/teams/${teamId}/players/${playerId}/release`, { method: "POST" });
      router.push("/dashboard/squad");
    } catch (e) {
      console.error("release player failed:", e);
      setActionLoading(false);
    }
  };

  const currentIndex = allPlayers.findIndex((p) => p.id === playerId);
  const prevPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex - 1 + allPlayers.length) % allPlayers.length] : null;
  const nextPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex + 1) % allPlayers.length] : null;

  const isOwnPlayer = player?.team_id === teamId;
  const isForeignHumanPlayer = !isOwnPlayer && playerTeam && playerTeam.user_id !== "ai";

  async function sendOffer() {
    if (!teamId || !player || offerSending) return;
    const amount = parseInt(offerAmount.replace(/\s/g, "") || "0", 10);
    if (offerType === "transfer" && (!amount || amount <= 0)) return;
    setOfferSending(true);
    try {
      await apiFetch(`/api/teams/${teamId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.id,
          amount,
          message: offerMessage.trim() || undefined,
          offerType,
          ...(offerType === "loan" ? { loanDuration: parseInt(loanDuration, 10) } : {}),
        }),
      });
      setOfferSent(true);
      setOfferOpen(false);
    } catch {
      // silently handled
    } finally {
      setOfferSending(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!player || !team) return <div className="page-container">Hráč nenalezen.</div>;

  const cond = conditionLabel(player.lifeContext?.condition ?? 50);
  const displayTeam = isOwnPlayer ? team : (playerTeam ?? team);
  const color = displayTeam.primary_color || "#2D5F2D";
  const light = isLightColor(color);
  const txt = light ? "text-gray-900" : "text-white";
  const txtMuted = light ? "text-gray-500" : "text-white/60";
  const txtSoft = light ? "text-gray-400" : "text-white/40";
  const boxBg = light ? "bg-black/5" : "bg-white/10";
  const boxBgHover = light ? "hover:bg-black/10" : "hover:bg-white/20";
  const boxLabel = light ? "text-gray-400" : "text-white/50";

  return (
    <>
      {/* ═══ Player header ═══ */}
      <div className="hero-gradient px-3 sm:px-8 py-4 sm:py-5" style={{ backgroundColor: color }}>
        <div className="max-w-[1280px] mx-auto">
          {/* ─── Desktop: jednořádkový layout ─── */}
          <div className="hidden sm:flex items-center gap-4">
            {allPlayers.length > 1 && (
              <button onClick={() => prevPlayer && router.push(`/dashboard/player/${prevPlayer.id}`)}
                className={`w-10 h-10 rounded-xl ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} shrink-0 transition-colors`}>&#9664;</button>
            )}
            {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
              <FaceAvatar faceConfig={player.avatar} size={72} className={`shrink-0 ${boxBg} rounded-xl`} />
            ) : (
              <div className={`shrink-0 w-[72px] h-[72px] rounded-xl ${boxBg} flex items-center justify-center ${txt} font-heading font-bold text-2xl`}>
                {player.first_name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${txt} text-2xl leading-tight`}>
                {player.first_name} {player.last_name}
              </h1>
              {player.nickname && (
                <div className={`${txtMuted} text-sm`}>&bdquo;{player.nickname}&ldquo;</div>
              )}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <PositionBadge position={player.position} />
                <span className={`${txtMuted} text-sm`}>{player.age} let</span>
                <span className={txtSoft}>&middot;</span>
                <span className={`${txtMuted} text-sm`}>{player.lifeContext?.occupation ?? ""}</span>
                {player.loan_from_team_id && (
                  <>
                    <span className={txtSoft}>&middot;</span>
                    <span className="bg-yellow-400/20 text-yellow-700 text-xs font-heading font-bold px-2 py-0.5 rounded-full">Na hostování</span>
                  </>
                )}
                <span className={txtSoft}>&middot;</span>
                <a href={`/dashboard/team/${displayTeam.id}`} className={`${txtMuted} text-sm hover:opacity-80 underline transition-colors flex items-center gap-1.5`}>
                  <BadgePreview primary={color} secondary={displayTeam.secondary_color || "#FFF"} pattern={(displayTeam.badge_pattern as BadgePattern) || "shield"}
                    initials={displayTeam.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
                  {displayTeam.name}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`${boxBg} rounded-xl py-2.5 text-center min-w-[64px]`}>
                <div className={`font-heading font-extrabold text-lg tabular-nums leading-none ${cond.color}`}>
                  {player.lifeContext?.condition ?? 50}%
                </div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Kondice</div>
              </div>
              <div className={`${boxBg} rounded-xl py-2.5 text-center min-w-[64px]`}>
                <div className="text-xl leading-none">{getMoraleEmoji(player.lifeContext?.morale ?? 50)}</div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Morálka</div>
              </div>
              <div className={`${boxBg} rounded-xl py-2.5 text-center min-w-[64px]`}>
                <div className={`font-heading font-extrabold text-xl tabular-nums leading-none ${txt}`}>
                  {player.overall_rating}
                </div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Rating</div>
              </div>
            </div>
            {allPlayers.length > 1 && (
              <button onClick={() => nextPlayer && router.push(`/dashboard/player/${nextPlayer.id}`)}
                className={`w-10 h-10 rounded-xl ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} shrink-0 transition-colors`}>&#9654;</button>
            )}
          </div>

          {/* ─── Mobil: kompaktní layout ─── */}
          <div className="sm:hidden">
            {/* Řádek 1: avatar + jméno/info + šipky */}
            <div className="flex items-center gap-3">
              {player.avatar && typeof player.avatar === "object" && Object.keys(player.avatar).length > 2 ? (
                <FaceAvatar faceConfig={player.avatar} size={56} className={`shrink-0 ${boxBg} rounded-xl`} />
              ) : (
                <div className={`shrink-0 w-14 h-14 rounded-xl ${boxBg} flex items-center justify-center ${txt} font-heading font-bold text-xl`}>
                  {player.first_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className={`font-heading font-extrabold ${txt} text-xl leading-tight`}>
                  {player.first_name} {player.last_name}
                </h1>
                {player.nickname && (
                  <div className={`${txtMuted} text-sm`}>&bdquo;{player.nickname}&ldquo;</div>
                )}
              </div>
              {allPlayers.length > 1 && (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => prevPlayer && router.push(`/dashboard/player/${prevPlayer.id}`)}
                    className={`w-8 h-8 rounded-lg ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-sm`}>&#9664;</button>
                  <button onClick={() => nextPlayer && router.push(`/dashboard/player/${nextPlayer.id}`)}
                    className={`w-8 h-8 rounded-lg ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-sm`}>&#9654;</button>
                </div>
              )}
            </div>
            {/* Řádek 2: pozice, věk, povolání, tým */}
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <PositionBadge position={player.position} />
              <span className={`${txtMuted} text-sm`}>{player.age} let</span>
              <span className={txtSoft}>&middot;</span>
              <span className={`${txtMuted} text-sm`}>{player.lifeContext?.occupation ?? ""}</span>
              <span className={txtSoft}>&middot;</span>
              <a href={`/dashboard/team/${displayTeam.id}`} className={`${txtMuted} text-sm hover:opacity-80 flex items-center gap-1.5`}>
                <BadgePreview primary={color} secondary={displayTeam.secondary_color || "#FFF"} pattern={(displayTeam.badge_pattern as BadgePattern) || "shield"}
                  initials={displayTeam.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={16} />
                {displayTeam.name}
              </a>
            </div>
            {/* Řádek 3: staty přes celou šířku */}
            <div className="flex gap-2 mt-3">
              <div className={`flex-1 ${boxBg} rounded-lg py-2 text-center`}>
                <div className={`font-heading font-extrabold text-base tabular-nums leading-none ${cond.color}`}>
                  {player.lifeContext?.condition ?? 50}%
                </div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Kondice</div>
              </div>
              <div className={`flex-1 ${boxBg} rounded-lg py-2 text-center`}>
                <div className="text-lg leading-none">{getMoraleEmoji(player.lifeContext?.morale ?? 50)}</div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Morálka</div>
              </div>
              <div className={`flex-1 ${boxBg} rounded-lg py-2 text-center`}>
                <div className={`font-heading font-extrabold text-base tabular-nums leading-none ${txt}`}>{player.overall_rating}</div>
                <div className={`${boxLabel} text-[9px] font-heading font-bold uppercase mt-0.5`}>Rating</div>
              </div>
            </div>
          </div>

          {/* Nabídka tlačítko — pod headerem */}
          {isForeignHumanPlayer && !offerSent && (
            <div className="max-w-[1280px] mx-auto mt-3">
              <button onClick={() => setOfferOpen(!offerOpen)}
                className={`rounded-xl px-4 py-2 text-sm font-heading font-bold transition-colors ${offerOpen ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20 text-white/80"}`}>
                {offerOpen ? "✕ Zavřít" : "🤝 Nabídka"}
              </button>
            </div>
          )}

          {/* Own player actions */}
          {isOwnPlayer && (
            <div className="max-w-[1280px] mx-auto mt-3 flex flex-wrap gap-2">
              {myListing ? (
                <>
                  <div className="rounded-xl px-4 py-2 bg-gold-500/20 text-white text-sm font-heading font-bold flex items-center gap-2">
                    <span>🏷️</span>
                    <span>Na trhu za {myListing.askingPrice.toLocaleString("cs")} Kč</span>
                  </div>
                  <button
                    onClick={withdrawFromMarket}
                    disabled={actionLoading}
                    className="rounded-xl px-4 py-2 text-sm font-heading font-bold bg-white/10 hover:bg-white/20 text-white/80 transition-colors disabled:opacity-50"
                  >
                    ✕ Stáhnout z trhu
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setPriceDialogOpen(true)}
                  disabled={actionLoading}
                  className="rounded-xl px-4 py-2 text-sm font-heading font-bold bg-white/10 hover:bg-white/20 text-white/80 transition-colors disabled:opacity-50"
                >
                  🏷️ Nabídnout na trh
                </button>
              )}
              <button
                onClick={releasePlayer}
                disabled={actionLoading}
                className="rounded-xl px-4 py-2 text-sm font-heading font-bold bg-red-500/20 hover:bg-red-500/30 text-white transition-colors disabled:opacity-50"
              >
                🗑️ Propustit
              </button>
            </div>
          )}
        </div>

        {/* Transfer offer inline below hero — same banner bg */}
        {offerSent && (
          <div className="max-w-[1280px] mx-auto mt-3 px-5 sm:px-8">
            <div className="text-white/80 text-sm font-heading font-bold">Nabídka odeslána</div>
          </div>
        )}
        {offerOpen && (
          <div className="max-w-[1280px] mx-auto mt-2 px-5 sm:px-8 pb-2">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-3">
              {/* Type toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setOfferType("transfer")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${offerType === "transfer" ? "bg-white/20 text-white" : "bg-white/5 text-white/50 hover:text-white/80"}`}
                >
                  Trvalý přestup
                </button>
                <button
                  onClick={() => setOfferType("loan")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${offerType === "loan" ? "bg-white/20 text-white" : "bg-white/5 text-white/50 hover:text-white/80"}`}
                >
                  Hostování
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className="text-white/60 text-xs font-heading uppercase mb-1 block">
                    {offerType === "loan" ? "Poplatek za hostování (Kč)" : "Nabízená částka (Kč)"}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={offerType === "loan" ? "0 = zdarma" : "např. 50000"}
                    className="w-full bg-white/10 text-white placeholder:text-white/30 border border-white/20 rounded-lg px-3 py-2 text-sm font-heading font-bold focus:outline-none focus:border-white/50"
                  />
                </div>
                {offerType === "loan" && (
                  <div className="w-32 shrink-0">
                    <label className="text-white/60 text-xs font-heading uppercase mb-1 block">Délka (dní)</label>
                    <select
                      value={loanDuration}
                      onChange={(e) => setLoanDuration(e.target.value)}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm font-heading font-bold focus:outline-none focus:border-white/50"
                    >
                      <option value="14" className="bg-gray-800">14 dní</option>
                      <option value="30" className="bg-gray-800">30 dní</option>
                      <option value="60" className="bg-gray-800">60 dní</option>
                      <option value="90" className="bg-gray-800">90 dní</option>
                      <option value="120" className="bg-gray-800">Půl sezóny</option>
                      <option value="180" className="bg-gray-800">Celá sezóna</option>
                    </select>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <label className="text-white/60 text-xs font-heading uppercase mb-1 block">Zpráva (volitelné)</label>
                  <input
                    type="text"
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)}
                    placeholder="Nabízím vám spolupráci..."
                    className="w-full bg-white/10 text-white placeholder:text-white/30 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/50"
                  />
                </div>
                <button
                  onClick={sendOffer}
                  disabled={offerSending || (!offerAmount && offerType !== "loan")}
                  className="bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 text-white font-heading font-bold text-sm px-5 py-2 rounded-lg transition-colors shrink-0"
                >
                  {offerSending ? "Odesílám..." : offerType === "loan" ? "Nabídnout hostování" : "Odeslat nabídku"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    <div className="page-container space-y-5">

      {/* ═══ Characteristics (tags) ═══ */}
      {player && allPlayers.length > 0 && (() => {
        const playerInput = {
          overall_rating: player.overall_rating ?? 0,
          age: player.age,
          position: player.position,
          skills: player.skills as Record<string, number> | undefined,
          personality: profileExtras?.personality ?? (player as any).personality,
          lifeContext: player.lifeContext as unknown as Record<string, number> | undefined,
        };
        const teamInput = allPlayers.map((tp) => ({
          overall_rating: tp.overall_rating ?? 0,
          age: tp.age,
          position: tp.position,
          skills: tp.skills as Record<string, number> | undefined,
        }));
        const tags = generateCharacteristics(playerInput, teamInput);

        if (tags.length === 0) return null;

        const TAG_COLORS: Record<string, string> = {
          green: "bg-pitch-50 text-pitch-600 border-pitch-200",
          gold: "bg-amber-50 text-amber-700 border-amber-200",
          red: "bg-red-50 text-card-red border-red-200",
          blue: "bg-blue-50 text-blue-700 border-blue-200",
          purple: "bg-purple-50 text-purple-700 border-purple-200",
          muted: "bg-gray-50 text-muted border-gray-200",
        };

        return (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div key={tag.key} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-heading font-bold ${TAG_COLORS[tag.color] ?? TAG_COLORS.muted}`}
                title={tag.description}>
                <span>{tag.emoji}</span>
                <span>{tag.label}</span>
              </div>
            ))}
          </div>
        );
      })()}


      {/* ═══ Row 1: Info + Attributes grid + Physical/Character ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Column 1: Personal info */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-2">
            <SectionLabel>Profil</SectionLabel>
            <JerseyPreview primary={color} secondary={displayTeam.secondary_color || "#FFF"}
              pattern={displayTeam.jersey_pattern as string} size={56}
              number={player.squad_number ?? undefined} />
          </div>
          <div className="space-y-0">
            <DetailRow label="Pozice" value={<PositionBadge position={player.position} />} />
            <DetailRow label="Věk" value={`${player.age} let`} />
            <DetailRow label="Povolání" value={player.lifeContext?.occupation ?? "—"} />
            <DetailRow label="Bydliště" value={player.residence ?? "—"} />
            <DetailRow label="Dojíždění" value={player.commute_km != null ? `${player.commute_km} km` : "—"} />
            <DetailRow label="Výška" value={player.physical?.height ? `${player.physical.height} cm` : "—"} />
            <DetailRow label="Váha" value={player.physical?.weight ? `${player.physical.weight} kg` : "—"} />
            <DetailRow label="Noha" value={footLabel(player.physical?.preferredFoot)} />
            <DetailRow label="Strana" value={sideLabel(player.physical?.preferredSide)} />
          </div>
        </div>

        {/* Column 2: Skills — FM-style compact grid */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Dovednosti</SectionLabel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0">
            <AttrRow label="Rychlost" value={player.skills?.speed ?? 0} />
            <AttrRow label="Technika" value={player.skills?.technique ?? 0} />
            <AttrRow label="Střelba" value={player.skills?.shooting ?? 0} />
            <AttrRow label="Přihrávky" value={player.skills?.passing ?? 0} />
            <AttrRow label="Hlavičky" value={player.skills?.heading ?? 0} />
            <AttrRow label="Obrana" value={player.skills?.defense ?? 0} />
            <AttrRow label="Kreativita" value={player.skills?.creativity ?? 0} />
            <AttrRow label="Standardky" value={player.skills?.setPieces ?? 0} />
            {player.position === "GK" && <AttrRow label="Brankář" value={player.skills?.goalkeeping ?? 0} />}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-label text-[11px] uppercase tracking-wide mb-2">Fyzické</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0">
              <AttrRow label="Výdrž" value={player.physical?.stamina ?? 0} />
              <AttrRow label="Síla" value={player.physical?.strength ?? 0} />
              <AttrRow label="Náchylnost" value={player.physical?.injuryProneness ?? 0} inverted />
            </div>
          </div>
        </div>

        {/* Column 3: Character traits */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Osobnost</SectionLabel>
          <div className="space-y-0">
            <TraitRow label="Vůdcovství" value={player.personality?.leadership ?? 30} />
            <TraitRow label="Disciplína" value={player.personality?.discipline ?? 50} />
            <TraitRow label="Pracovitost" value={player.personality?.workRate ?? 50} />
            <TraitRow label="Konzistence" value={player.personality?.consistency ?? 50} />
            <TraitRow label="Pod tlakem" value={player.personality?.clutch ?? 50} />
            <TraitRow label="Věrnost" value={player.personality?.patriotism ?? 50} />
            <TraitRow label="Agresivita" value={player.personality?.aggression ?? 40} />
            <TraitRow label="Alkoholismus" value={player.personality?.alcohol ?? 30} inverted />
            <TraitRow label="Temperament" value={player.personality?.temper ?? 40} inverted />
            <TraitRow label="Náchylnost" value={player.personality?.injuryProneness ?? 30} inverted />
          </div>
        </div>
      </div>

      {/* ═══ Tréninkový vývoj (jen pro vlastníka) ═══ */}
      {player.team_id === teamId && <TrainingDevelopment teamId={teamId} playerId={playerId} />}

      {/* ═══ Vztahy v kádru (jen vlastní hráči) ═══ */}
      {isOwnPlayer && profileExtras && profileExtras.relationships.length > 0 && (
        <div className="card p-4 sm:p-5 max-w-lg">
          <SectionLabel>Vztahy v kádru</SectionLabel>
          <div className="space-y-1.5">
            {(showAllRelationships ? profileExtras.relationships : profileExtras.relationships.slice(0, 3)).map((rel) => {
              const EMOJI: Record<string, string> = {
                brothers: "👨‍👦", father_son: "👴", in_laws: "🤝", classmates: "🎓",
                coworkers: "💼", neighbors: "🏠", drinking_buddies: "🍻", rivals: "⚔️", mentor_pupil: "📚",
              };
              return (
                <div key={rel.relatedPlayerId} className="py-1.5 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm shrink-0">{EMOJI[rel.type] ?? "👥"}</span>
                    <Link href={`/dashboard/player/${rel.relatedPlayerId}`} className="text-sm font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">
                      {rel.relatedPlayerName}
                    </Link>
                    <PositionBadge position={rel.relatedPlayerPosition as "GK" | "DEF" | "MID" | "FWD"} />
                    <span className="text-[10px] text-muted font-heading">· {rel.typeLabel}</span>
                  </div>
                  {rel.effect && <div className="text-[11px] text-muted italic ml-6 mt-0.5">{rel.effect}</div>}
                </div>
              );
            })}
            {!showAllRelationships && profileExtras.relationships.length > 3 && (
              <button onClick={() => setShowAllRelationships(true)} className="text-xs text-pitch-500 font-heading font-bold hover:underline pt-1">
                Zobrazit všechny ({profileExtras.relationships.length}) →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ Row 2: Kariéra — FM style ═══ */}
      <div className={`grid grid-cols-1 ${careerStats && careerStats.totals.appearances > 0 ? "lg:grid-cols-[1fr_320px]" : ""} gap-5`}>

        {/* Career stats per season with team info */}
        {careerStats && careerStats.totals.appearances > 0 ? (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Kariérní statistiky</SectionLabel>

            {/* Totals strip */}
            <div className="flex gap-3 flex-wrap mb-4">
              <StatBox label="Zápasy" value={careerStats.totals.appearances} />
              <StatBox label="Góly" value={careerStats.totals.goals} />
              <StatBox label="Asistence" value={careerStats.totals.assists} />
              <StatBox label="Žluté" value={careerStats.totals.yellowCards} color="text-gold-500" />
              <StatBox label="Červené" value={careerStats.totals.redCards} color="text-card-red" />
              {matchHistory.length > 0 && (
                <StatBox label="Prům. hod." value={Number((matchHistory.reduce((s, m) => s + m.rating, 0) / matchHistory.length).toFixed(1))} />
              )}
            </div>

            {/* Per-season table with team */}
            {careerStats.seasons.length > 0 && (
              <div className="overflow-x-auto -mx-4 sm:-mx-5">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                      <th className="pb-2 pl-4 sm:pl-5 pr-2">Sezóna</th>
                      <th className="pb-2 pr-2">Klub</th>
                      <th className="pb-2 pr-2">Liga</th>
                      <th className="pb-2 pr-2 text-center">Z</th>
                      <th className="pb-2 pr-2 text-center">G</th>
                      <th className="pb-2 pr-2 text-center">A</th>
                      <th className="pb-2 pr-2 text-center">ŽK</th>
                      <th className="pb-2 pr-2 text-center">ČK</th>
                      <th className="pb-2 pr-4 sm:pr-5 text-center">Hod.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {careerStats.seasons.map((s) => (
                      <tr key={`${s.season}-${s.teamId}`} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-2 pl-4 sm:pl-5 pr-2 font-heading font-bold tabular-nums">{s.season}</td>
                        <td className="py-2 pr-2">
                          <a href={`/dashboard/team/${s.teamId}`} className="flex items-center gap-1.5 hover:underline">
                            <BadgePreview primary={s.teamColor} secondary={s.teamSecondary}
                              pattern={(s.teamBadge as BadgePattern) || "shield"}
                              initials={(s.teamName ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
                            <span className="font-heading font-bold text-ink truncate max-w-[140px]">{s.teamName}</span>
                          </a>
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted truncate max-w-[120px]">{s.leagueName ?? "—"}</td>
                        <td className="py-2 pr-2 text-center tabular-nums">{s.appearances}</td>
                        <td className="py-2 pr-2 text-center tabular-nums font-heading font-bold">{(s.goals as number) > 0 ? s.goals : "—"}</td>
                        <td className="py-2 pr-2 text-center tabular-nums">{(s.assists as number) > 0 ? s.assists : "—"}</td>
                        <td className="py-2 pr-2 text-center tabular-nums text-gold-500">{(s.yellowCards as number) > 0 ? s.yellowCards : ""}</td>
                        <td className="py-2 pr-2 text-center tabular-nums text-card-red">{(s.redCards as number) > 0 ? s.redCards : ""}</td>
                        <td className="py-2 pr-4 sm:pr-5 text-center tabular-nums font-heading font-bold">{typeof s.avgRating === "number" ? s.avgRating.toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* No career stats yet — show placeholder */
          <div className="card p-4 sm:p-5">
            <SectionLabel>Kariérní statistiky</SectionLabel>
            <div className="text-sm text-muted">Zatím žádné odehrané zápasy v sezóně.</div>
          </div>
        )}

        {/* Club history sidebar */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Historie klubů</SectionLabel>
          {contracts.length > 0 ? (
            <div className="space-y-0">
              {contracts.map((c) => (
                <div key={c.id} className="py-3 border-b border-gray-50 last:border-b-0">
                  <a href={`/dashboard/team/${c.teamId}`} className="flex items-center gap-2.5 group">
                    <BadgePreview primary={c.teamColor} secondary={c.teamSecondary}
                      pattern={(c.teamBadge as BadgePattern) || "shield"}
                      initials={(c.teamName ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-sm group-hover:underline truncate">{c.teamName}</div>
                      <div className="text-[11px] text-muted">
                        {c.isActive ? (
                          <span>Od sezóny {c.seasonNumber} &middot; <span className="text-pitch-500 font-bold">Aktivní</span></span>
                        ) : (
                          <span>Sezóna {c.seasonNumber}{c.leftAt ? ` — ${c.leftAt}` : ""}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-heading font-bold ${
                        c.joinType === "generated" ? "bg-gray-100 text-muted"
                        : c.joinType === "transfer" ? "bg-blue-50 text-blue-600"
                        : c.joinType === "free_agent" ? "bg-green-50 text-green-600"
                        : c.joinType === "youth" ? "bg-purple-50 text-purple-600"
                        : "bg-gray-100 text-muted"
                      }`}>{c.joinLabel}</span>
                    </div>
                  </a>
                  {c.fee > 0 && (
                    <div className="text-[10px] text-muted mt-1 ml-[42px]">Přestupní částka: {c.fee.toLocaleString("cs")} Kč</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">Žádná historie</div>
          )}
        </div>
      </div>

      {/* ═══ Row 3: Match history ═══ */}
      {matchHistory.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Historie zápasů ({matchHistory.length})</SectionLabel>
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                  <th className="pb-2 pl-4 sm:pl-5 pr-2 w-12">Kolo</th>
                  <th className="pb-2 pr-2">Soupeř</th>
                  <th className="pb-2 pr-2 text-center w-20">Výsledek</th>
                  <th className="pb-2 pr-2 text-center w-14" title="Hodnocení">Hod.</th>
                  <th className="pb-2 pr-2 text-center w-12" title="Minuty">Min</th>
                  <th className="pb-2 pr-2 text-center w-8" title="Góly">G</th>
                  <th className="pb-2 pr-2 text-center w-8" title="Asistence">A</th>
                  <th className="pb-2 pr-4 sm:pr-5 text-center w-16" title="Karty">Karty</th>
                </tr>
              </thead>
              <tbody>
                {matchHistory.map((m) => {
                  const resultBg = m.result === "W" ? "bg-pitch-50" : m.result === "L" ? "bg-red-50" : "bg-gray-50";
                  const resultText = m.result === "W" ? "text-pitch-600" : m.result === "L" ? "text-card-red" : "text-muted";
                  const ratingColor = m.rating >= 7.5 ? "text-pitch-500 font-bold"
                    : m.rating >= 6.5 ? "text-pitch-600"
                    : m.rating >= 5.5 ? "text-ink"
                    : m.rating >= 4.5 ? "text-gold-600"
                    : "text-card-red font-bold";

                  return (
                    <tr key={m.matchId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-2 pl-4 sm:pl-5 pr-2 tabular-nums text-muted">{m.round ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <a href={`/dashboard/match/${m.matchId}/replay`} className="flex items-center gap-2 hover:underline">
                          <BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                            pattern={(m.opponentBadge as BadgePattern) || "shield"}
                            initials={(m.opponent ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={20} />
                          <span className="font-heading font-bold text-ink truncate max-w-[180px]">{m.opponent ?? "Soupeř"}</span>
                          <span className="text-[10px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                        </a>
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-heading font-bold ${resultBg} ${resultText}`}>
                          {m.homeScore}:{m.awayScore}
                        </span>
                      </td>
                      <td className={`py-2 pr-2 text-center tabular-nums font-heading font-bold ${ratingColor}`}>
                        {m.rating.toFixed(1)}
                      </td>
                      <td className="py-2 pr-2 text-center tabular-nums text-muted">{m.minutesPlayed}&apos;</td>
                      <td className="py-2 pr-2 text-center tabular-nums font-heading font-bold">{m.goals > 0 ? m.goals : ""}</td>
                      <td className="py-2 pr-2 text-center tabular-nums font-heading font-bold text-muted">{m.assists > 0 ? m.assists : ""}</td>
                      <td className="py-2 pr-4 sm:pr-5 text-center">
                        {m.yellowCards > 0 && <span className="inline-block w-3 h-4 rounded-[1px] bg-gold-400 mr-0.5" title="Žlutá karta" />}
                        {m.redCards > 0 && <span className="inline-block w-3 h-4 rounded-[1px] bg-card-red" title="Červená karta" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap">
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-ink">{matchHistory.length}</span> zápasů
            </div>
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-pitch-500">{matchHistory.filter((m) => m.result === "W").length}V</span>
              {" "}
              <span className="font-heading font-bold text-ink">{matchHistory.filter((m) => m.result === "D").length}R</span>
              {" "}
              <span className="font-heading font-bold text-card-red">{matchHistory.filter((m) => m.result === "L").length}P</span>
            </div>
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-ink">{matchHistory.reduce((s, m) => s + m.goals, 0)}</span> gólů
            </div>
            <div className="text-sm text-muted">
              Prům. <span className="font-heading font-bold text-ink">{(matchHistory.reduce((s, m) => s + m.rating, 0) / matchHistory.length).toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

    </div>

    {confirmDialog}
    {priceDialogOpen && player && (
      <PlayerPriceDialog
        player={player}
        onClose={() => setPriceDialogOpen(false)}
        onConfirm={listOnMarket}
        loading={actionLoading}
      />
    )}
    </>
  );
}

function PlayerPriceDialog({ player, onClose, onConfirm, loading }: {
  player: Player; onClose: () => void; onConfirm: (price: number) => void; loading: boolean;
}) {
  const defaultPrice = Math.round((player.overall_rating ?? 50) * 50);
  const [price, setPrice] = useState(defaultPrice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg">Nabídnout na trh</h3>
          <p className="text-sm text-muted mt-1">
            {player.first_name} {player.last_name} · {player.position}, {player.age} let, rating {player.overall_rating}
          </p>

          <div className="mt-4">
            <label className="text-xs text-muted font-heading uppercase tracking-wide block mb-1.5">Požadovaná cena (Kč)</label>
            <input
              type="text"
              inputMode="numeric"
              value={price.toLocaleString("cs")}
              onChange={(e) => setPrice(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-heading font-bold text-lg tabular-nums focus:outline-none focus:border-pitch-500"
            />
            <div className="flex gap-2 mt-2">
              {[0.5, 1, 1.5, 2].map((mul) => (
                <button
                  key={mul}
                  type="button"
                  onClick={() => setPrice(Math.round(defaultPrice * mul))}
                  className="flex-1 py-1 px-2 rounded text-xs font-heading font-bold bg-gray-50 hover:bg-gray-100 text-muted"
                >
                  {mul}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-heading font-bold bg-gray-100 hover:bg-gray-200 text-ink"
            >
              Zrušit
            </button>
            <button
              onClick={() => onConfirm(price)}
              disabled={loading || price <= 0}
              className="flex-1 py-2 rounded-lg text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50"
            >
              {loading ? "Ukládám..." : "Nabídnout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading font-bold text-sm">{value}</span>
    </div>
  );
}

function AttrRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const colorValue = inverted ? 100 - value : value;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-ink-light">{label}</span>
      <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-heading font-bold tabular-nums ${attrBg(colorValue)}`}>
        {value}
      </span>
    </div>
  );
}

function TraitRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  // Label reflects actual value (Vysoký/Nízký), color reflects quality (inverted = high is bad)
  const levelLabel = traitLevel(value);
  const colorEffective = inverted ? 100 - value : value;
  const levelColor = traitLevel(colorEffective);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-ink-light">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-heading font-bold ${levelColor.color}`}>{levelLabel.label}</span>
        <span className="text-[10px] text-muted tabular-nums w-5 text-right">{value}</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
      <div className={`font-heading font-[800] text-2xl tabular-nums ${color ?? "text-ink"}`}>{value}</div>
      <div className="text-label text-[10px] uppercase">{label}</div>
    </div>
  );
}

function attrBg(value: number): string {
  if (value >= 70) return "bg-pitch-500 text-white";
  if (value >= 50) return "bg-pitch-100 text-pitch-800";
  if (value >= 30) return "bg-gray-100 text-ink";
  if (value >= 15) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-card-red";
}

/* ── Training Development Section ── */

const TRAIN_ATTR_LABELS: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba",
  passing: "Přihrávky", heading: "Hlavičky", defense: "Obrana",
  stamina: "Výdrž", strength: "Síla", goalkeeping: "Brankář",
  vision: "Přehled", creativity: "Kreativita", setPieces: "Standardky",
};

const TRAIN_TYPE_LABELS: Record<string, string> = {
  conditioning: "Kondice", technique: "Technika", tactics: "Taktika", match_practice: "Zápasová praxe",
};

interface TrainingLogEntry {
  attribute: string;
  old_value: number;
  new_value: number;
  change: number;
  training_type: string;
  game_date: string | null;
  created_at: string;
}

function TrainingDevelopment({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [log, setLog] = useState<TrainingLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<{ log: TrainingLogEntry[] }>(`/api/teams/${teamId}/players/${playerId}/training-log`)
      .then((data) => { setLog(data.log); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [teamId, playerId]);

  if (!loaded) return null;

  const gains = log.filter((l) => l.change > 0).length;
  const losses = log.filter((l) => l.change < 0).length;

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Tréninkový vývoj</SectionLabel>

      {log.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné tréninkové záznamy.</p>
      ) : (
        <>
          {/* Summary strip */}
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
              <div className="font-heading font-[800] text-2xl tabular-nums text-ink">{log.length}</div>
              <div className="text-xs text-muted uppercase">Změn</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{gains}</div>
              <div className="text-xs text-muted uppercase">Zlepšení</div>
            </div>
            {losses > 0 && (
              <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
                <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{losses}</div>
                <div className="text-xs text-muted uppercase">Pokles</div>
              </div>
            )}
          </div>

          {/* Changes table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-muted uppercase">
                  <th className="text-left py-2 font-heading">Datum</th>
                  <th className="text-left py-2 font-heading">Atribut</th>
                  <th className="text-center py-2 font-heading">Změna</th>
                  <th className="text-left py-2 font-heading">Trénink</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 20).map((entry, i) => {
                  const date = entry.game_date ? new Date(entry.game_date).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "—";
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-1.5 tabular-nums text-muted">{date}</td>
                      <td className="py-1.5 font-medium">{TRAIN_ATTR_LABELS[entry.attribute] ?? entry.attribute}</td>
                      <td className="py-1.5 text-center">
                        <span className={`font-heading font-bold ${entry.change > 0 ? "text-pitch-500" : "text-card-red"}`}>
                          {entry.change > 0 ? `+${entry.change}` : entry.change}
                        </span>
                        <span className="text-muted text-xs ml-1">({entry.old_value}→{entry.new_value})</span>
                      </td>
                      <td className="py-1.5 text-muted">{TRAIN_TYPE_LABELS[entry.training_type] ?? entry.training_type}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
