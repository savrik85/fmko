"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiAction, type Player, type Team, type CareerStats, type PlayerMatchEntry, type PlayerContract } from "@/lib/api";
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
  const [mySquad, setMySquad] = useState<Player[]>([]);
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
  const [offeredPlayerId, setOfferedPlayerId] = useState<string | null>(null);
  const [myListing, setMyListing] = useState<{ listingId: string; askingPrice: number } | null>(null);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [profileExtras, setProfileExtras] = useState<{
    personality: Record<string, number>;
    relationships: Array<{ relatedPlayerId: string; relatedPlayerName: string; relatedPlayerPosition: string; type: string; typeLabel: string; strength: number; effect: string }>;
  } | null>(null);
  const [showAllRelationships, setShowAllRelationships] = useState(false);
  type LeagueRank = { rank: number; total: number; value: number } | null;
  const [leagueRanks, setLeagueRanks] = useState<{ goals: LeagueRank; assists: LeagueRank; rating: LeagueRank } | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "W" | "D" | "L">("all");
  type ProfileTab = "prehled" | "statistiky" | "historie" | "vztahy";
  const [activeTab, setActiveTab] = useState<ProfileTab>("prehled");

  // URL hash sync — umožňuje linkovat přímo na tab přes #statistiky atd.
  useEffect(() => {
    const valid: ProfileTab[] = ["prehled", "statistiky", "historie", "vztahy"];
    const fromHash = (typeof window !== "undefined" ? window.location.hash.replace("#", "") : "") as ProfileTab;
    if (valid.includes(fromHash)) setActiveTab(fromHash);
    const onHash = () => {
      const h = window.location.hash.replace("#", "") as ProfileTab;
      if (valid.includes(h)) setActiveTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchTab = (t: ProfileTab) => {
    setActiveTab(t);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${t}`);
  };

  useEffect(() => {
    if (!teamId) return;
    // First fetch the player to find which team they belong to
    apiFetch<Player & { isWatched?: boolean; watchers?: Array<{ id: string; name: string; primary_color: string; secondary_color: string; badge_pattern: string }> }>(`/api/teams/${teamId}/players/${playerId}`)
      .then(async (p) => {
        setPlayer(p);
        setIsWatched(!!p.isWatched);
        const playerOwnerTeamId = p.team_id || teamId;
        const isForeign = playerOwnerTeamId !== teamId;

        const [t, all, stats, history, careerHistory, rankRes] = await Promise.all([
          apiFetch<Team>(`/api/teams/${teamId}`),
          // Fetch players from the PLAYER's team for navigation arrows
          apiFetch<Player[]>(`/api/teams/${playerOwnerTeamId}/players`),
          apiFetch<CareerStats>(`/api/teams/${teamId}/players/${playerId}/career-stats`).catch((e) => { console.error("career-stats fetch:", e); return null; }),
          apiFetch<{ matches: PlayerMatchEntry[] }>(`/api/teams/${teamId}/players/${playerId}/match-history`).catch((e) => { console.error("match-history fetch:", e); return { matches: [] }; }),
          apiFetch<{ contracts: PlayerContract[] }>(`/api/teams/${teamId}/players/${playerId}/career-history`).catch((e) => { console.error("career-history fetch:", e); return { contracts: [] }; }),
          apiFetch<{ ranks: { goals: LeagueRank; assists: LeagueRank; rating: LeagueRank } | null }>(`/api/teams/${playerOwnerTeamId}/players/${playerId}/league-rank`).catch((e) => { console.error("league-rank fetch:", e); return { ranks: null }; }),
        ]);

        setTeam(t);
        setAllPlayers(all);
        setCareerStats(stats);
        setMatchHistory(history.matches);
        setContracts(careerHistory.contracts);
        setLeagueRanks(rankRes.ranks);

        if (isForeign) {
          const [pt, mine] = await Promise.all([
            apiFetch<Team>(`/api/teams/${playerOwnerTeamId}`).catch((e) => { console.error("player team fetch:", e); return null; }),
            apiFetch<Player[]>(`/api/teams/${teamId}/players`).catch((e) => { console.error("my squad fetch:", e); return []; }),
          ]);
          setPlayerTeam(pt);
          setMySquad(mine);
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
    const ok = await apiAction(apiFetch(`/api/teams/${teamId}/players/${playerId}/list`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askingPrice: price }),
    }), "Vystavení na trh se nezdařilo");
    if (ok) {
      setPriceDialogOpen(false);
      await refreshListing();
    }
    setActionLoading(false);
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
    const success = await apiAction(apiFetch(`/api/teams/${teamId}/listings/${myListing.listingId}`, { method: "DELETE" }), "Stažení z trhu se nezdařilo");
    if (success) await refreshListing();
    setActionLoading(false);
  };

  const toggleWatch = async () => {
    if (!teamId || !player || watchLoading) return;
    setWatchLoading(true);
    const wasWatched = isWatched;
    // Optimistic update
    setIsWatched(!wasWatched);
    const ok = await apiAction(
      wasWatched
        ? apiFetch(`/api/teams/${teamId}/watchlist/${playerId}`, { method: "DELETE" })
        : apiFetch(`/api/teams/${teamId}/watchlist/${playerId}`, { method: "POST" }),
      wasWatched ? "Odebrání ze sledování se nezdařilo" : "Přidání do sledování se nezdařilo",
    );
    if (!ok) setIsWatched(wasWatched); // Revert on error
    setWatchLoading(false);
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
    const success = await apiAction(apiFetch(`/api/teams/${teamId}/players/${playerId}/release`, { method: "POST" }), "Propuštění hráče se nezdařilo");
    if (success) router.push("/dashboard/squad");
    else setActionLoading(false);
  };

  const currentIndex = allPlayers.findIndex((p) => p.id === playerId);
  const prevPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex - 1 + allPlayers.length) % allPlayers.length] : null;
  const nextPlayer = allPlayers.length > 1 ? allPlayers[(currentIndex + 1) % allPlayers.length] : null;

  const isOwnPlayer = player?.team_id === teamId;
  const isLoanedToUs = isOwnPlayer && !!player?.loan_from_team_id;
  const isForeignHumanPlayer = !isOwnPlayer && playerTeam && playerTeam.user_id !== "ai";
  const canSendOffer = isForeignHumanPlayer || isLoanedToUs;

  async function sendOffer() {
    if (!teamId || !player || offerSending) return;
    const amount = parseInt(offerAmount.replace(/\s/g, "") || "0", 10);
    if (offerType === "transfer" && (!amount || amount <= 0)) return;
    setOfferSending(true);
    const ok = await apiAction(apiFetch(`/api/teams/${teamId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: player.id,
        amount,
        message: offerMessage.trim() || undefined,
        offerType,
        ...(offerType === "loan" ? { loanDuration: parseInt(loanDuration, 10) } : {}),
        ...(offerType === "transfer" && offeredPlayerId ? { offeredPlayerId } : {}),
      }),
    }), "Odeslání nabídky se nezdařilo");
    if (ok) {
      setOfferSent(true);
      setOfferOpen(false);
    }
    setOfferSending(false);
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

  // Injury info (rendered as inline pill on both layouts)
  const injuryInfo = (player as unknown as { injury?: { daysRemaining: number; type?: string } | null }).injury ?? null;
  const injuryPill = injuryInfo ? (
    <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-50 border border-red-300/30 rounded-md px-2 py-0.5 text-[11px] font-heading font-bold whitespace-nowrap">
      <span>🩹</span>
      <span>Zraněný · {injuryInfo.daysRemaining} {injuryInfo.daysRemaining === 1 ? "den" : "dní"}</span>
    </span>
  ) : null;

  // Absence info (trénink zmeškán, výmluva)
  const absenceInfo = (player as unknown as { absence?: { reason?: string; category?: string } | null }).absence ?? null;
  const absencePill = absenceInfo ? (
    <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-50 border border-amber-300/30 rounded-md px-2 py-0.5 text-[11px] font-heading font-bold whitespace-nowrap" title={absenceInfo.reason ?? ""}>
      <span>🚫</span>
      <span>Absence{absenceInfo.reason ? ` · ${absenceInfo.reason}` : ""}</span>
    </span>
  ) : null;

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
                {injuryPill}
                {absencePill}
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
            {/* Řádek 2: pozice, věk, povolání, tým, injury pill */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
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
              {injuryPill}
              {absencePill}
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

          {/* ─── Action row — same styling mobile + desktop ─── */}
          {(() => {
            const btnBase = `flex-1 sm:flex-initial min-w-[120px] rounded-xl px-4 py-2 text-sm font-heading font-bold transition-colors flex items-center justify-center gap-1.5`;
            const btnNeutral = light
              ? "bg-black/10 hover:bg-black/20 text-gray-900"
              : "bg-white/10 hover:bg-white/20 text-white";
            const btnNeutralActive = light ? "bg-black/25 text-gray-900" : "bg-white/25 text-white";
            const btnWatched = light
              ? "bg-gold-500/40 text-gray-900 ring-1 ring-gold-600/50"
              : "bg-gold-400/30 text-white ring-1 ring-gold-300/50";
            const btnDanger = light
              ? "bg-red-500/20 hover:bg-red-500/30 text-red-700"
              : "bg-red-500/20 hover:bg-red-500/30 text-white";
            const btnListing = light
              ? "bg-gold-500/30 text-gray-900"
              : "bg-gold-500/20 text-white";
            return (
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Nabídka / Odkoupit */}
                {canSendOffer && !offerSent && (
                  <button onClick={() => { if (isLoanedToUs) setOfferType("transfer"); setOfferOpen(!offerOpen); }}
                    className={`${btnBase} ${offerOpen ? btnNeutralActive : btnNeutral}`}>
                    {offerOpen ? "✕ Zavřít" : isLoanedToUs ? "💰 Odkoupit" : "🤝 Nabídka"}
                  </button>
                )}
                {/* Ukončit hostování — jen pokud je hráč u nás na hostování */}
                {isLoanedToUs && (
                  <button onClick={async () => {
                    if (!teamId || !player) return;
                    const ok = await confirm({
                      title: "Ukončit hostování?",
                      description: `${player.first_name} ${player.last_name} se ihned vrátí do původního klubu.`,
                      confirmLabel: "Ukončit",
                    });
                    if (!ok) return;
                    if (await apiAction(apiFetch(`/api/teams/${teamId}/loans/${player.id}/terminate`, { method: "POST" }), "Ukončení hostování se nezdařilo")) {
                      router.push("/dashboard/transfers");
                    }
                  }}
                    className={`${btnBase} min-w-[140px] ${btnDanger}`}>
                    ✕ Ukončit hostování
                  </button>
                )}
                {/* Sledovat — for any non-own player */}
                {!isOwnPlayer && (
                  <button onClick={toggleWatch} disabled={watchLoading}
                    className={`${btnBase} disabled:opacity-50 ${isWatched ? btnWatched : btnNeutral}`}>
                    {isWatched ? "★ Sleduji" : "☆ Sledovat"}
                  </button>
                )}
                {/* Own player actions — ne pro hostující */}
                {isOwnPlayer && !isLoanedToUs && (myListing ? (
                  <>
                    <div className={`${btnBase} ${btnListing}`}>
                      <span>🏷️</span>
                      <span>Na trhu za {myListing.askingPrice.toLocaleString("cs")} Kč</span>
                    </div>
                    <button onClick={withdrawFromMarket} disabled={actionLoading}
                      className={`${btnBase} min-w-[140px] disabled:opacity-50 ${btnNeutral}`}>
                      ✕ Stáhnout z trhu
                    </button>
                  </>
                ) : (
                  <button onClick={() => setPriceDialogOpen(true)} disabled={actionLoading}
                    className={`${btnBase} min-w-[140px] disabled:opacity-50 ${btnNeutral}`}>
                    🏷️ Nabídnout na trh
                  </button>
                ))}
                {isOwnPlayer && !isLoanedToUs && (
                  <button onClick={releasePlayer} disabled={actionLoading}
                    className={`${btnBase} disabled:opacity-50 ${btnDanger}`}>
                    🗑️ Propustit
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Transfer offer inline below hero — same banner bg */}
        {offerSent && (
          <div className="max-w-[1280px] mx-auto mt-3 px-5 sm:px-8">
            <div className="text-white/80 text-sm font-heading font-bold">Nabídka odeslána</div>
          </div>
        )}
        {offerOpen && (
          <div className="max-w-[1280px] mx-auto mt-2 px-5 sm:px-8 pb-2">
            <div className={`${light ? "bg-black/10" : "bg-white/10"} backdrop-blur rounded-xl p-4 space-y-3`}>
              {isLoanedToUs && (
                <div className={`${light ? "text-gray-700" : "text-white/80"} text-xs font-heading`}>
                  Nabídka půjde původnímu klubu. Pokud bude akceptována, hráč u nás zůstane natrvalo.
                </div>
              )}
              {/* Type toggle — skryté u buyout (jen trvalý přestup) */}
              {!isLoanedToUs && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setOfferType("transfer")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${offerType === "transfer" ? (light ? "bg-black/20 text-gray-900" : "bg-white/20 text-white") : (light ? "bg-black/5 text-gray-500 hover:text-gray-700" : "bg-white/5 text-white/50 hover:text-white/80")}`}
                  >
                    Trvalý přestup
                  </button>
                  <button
                    onClick={() => setOfferType("loan")}
                    className={`px-4 py-1.5 rounded-lg text-sm font-heading font-bold transition-colors ${offerType === "loan" ? (light ? "bg-black/20 text-gray-900" : "bg-white/20 text-white") : (light ? "bg-black/5 text-gray-500 hover:text-gray-700" : "bg-white/5 text-white/50 hover:text-white/80")}`}
                  >
                    Hostování
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1 min-w-0">
                  <label className={`${light ? "text-gray-500" : "text-white/60"} text-xs font-heading uppercase mb-1 block`}>
                    {offerType === "loan" ? "Poplatek za hostování (Kč)" : "Nabízená částka (Kč)"}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={offerType === "loan" ? "0 = zdarma" : "např. 50000"}
                    className={`w-full rounded-lg px-3 py-2 text-sm font-heading font-bold focus:outline-none ${light ? "bg-black/5 text-gray-900 placeholder:text-gray-400 border border-black/20 focus:border-black/40" : "bg-white/10 text-white placeholder:text-white/30 border border-white/20 focus:border-white/50"}`}
                  />
                </div>
                {offerType === "loan" && (
                  <div className="w-32 shrink-0">
                    <label className={`${light ? "text-gray-500" : "text-white/60"} text-xs font-heading uppercase mb-1 block`}>Délka (dní)</label>
                    <select
                      value={loanDuration}
                      onChange={(e) => setLoanDuration(e.target.value)}
                      className={`w-full rounded-lg px-3 py-2 text-sm font-heading font-bold focus:outline-none ${light ? "bg-black/5 text-gray-900 border border-black/20 focus:border-black/40" : "bg-white/10 text-white border border-white/20 focus:border-white/50"}`}
                    >
                      <option value="14" className="bg-gray-800 text-white">14 dní</option>
                      <option value="30" className="bg-gray-800 text-white">30 dní</option>
                      <option value="60" className="bg-gray-800 text-white">60 dní</option>
                      <option value="90" className="bg-gray-800 text-white">90 dní</option>
                      <option value="120" className="bg-gray-800 text-white">Půl sezóny</option>
                      <option value="180" className="bg-gray-800 text-white">Celá sezóna</option>
                    </select>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <label className={`${light ? "text-gray-500" : "text-white/60"} text-xs font-heading uppercase mb-1 block`}>Zpráva (volitelné)</label>
                  <input
                    type="text"
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)}
                    placeholder="Nabízím vám spolupráci..."
                    className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none ${light ? "bg-black/5 text-gray-900 placeholder:text-gray-400 border border-black/20 focus:border-black/40" : "bg-white/10 text-white placeholder:text-white/30 border border-white/20 focus:border-white/50"}`}
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

              {/* Hráč na výměnu — jen u trvalého přestupu; nabízím SVÉ hráče */}
              {offerType === "transfer" && !isLoanedToUs && mySquad.length > 0 && (
                <div>
                  <label className={`${light ? "text-gray-500" : "text-white/60"} text-xs font-heading uppercase mb-1 block`}>
                    Hráč na výměnu (volitelné)
                  </label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={offeredPlayerId ?? ""}
                      onChange={(e) => setOfferedPlayerId(e.target.value || null)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-heading focus:outline-none ${light ? "bg-black/5 text-gray-900 border border-black/20 focus:border-black/40" : "bg-white/10 text-white border border-white/20 focus:border-white/50"}`}
                    >
                      <option value="" className="bg-gray-800 text-white">— bez výměny —</option>
                      {mySquad
                        .filter((p) => !p.loan_from_team_id)
                        .map((p) => (
                          <option key={p.id} value={p.id} className="bg-gray-800 text-white">
                            {p.first_name} {p.last_name} ({p.position}, {p.age} let)
                          </option>
                        ))}
                    </select>
                    {offeredPlayerId && (
                      <button
                        onClick={() => setOfferedPlayerId(null)}
                        className={`px-2 py-2 rounded-lg text-sm font-heading font-bold transition-colors ${light ? "bg-black/5 text-gray-600 hover:bg-black/10" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
                        title="Odstranit výměnu"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    <div className="page-container space-y-5">

      {/* ═══ Tab navigation ═══ */}
      <div className="flex gap-1 border-b border-gray-200 -mt-1 overflow-x-auto">
        {([
          { id: "prehled", label: "Přehled" },
          { id: "statistiky", label: "Statistiky" },
          { id: "historie", label: "Historie" },
          { id: "vztahy", label: "Vztahy" },
        ] as Array<{ id: ProfileTab; label: string }>).map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`px-4 py-2.5 text-sm font-heading font-bold transition-colors border-b-2 -mb-px shrink-0 ${
              activeTab === t.id
                ? "text-pitch-600 border-pitch-500"
                : "text-muted border-transparent hover:text-ink hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: PŘEHLED ═══ */}
      {activeTab === "prehled" && <>

      {/* ═══ Characteristics (tags) ═══ */}
      {player && allPlayers.length > 0 && (() => {
        const playerInput = {
          overall_rating: player.overall_rating ?? 0,
          age: player.age,
          position: player.position,
          skills: player.skills as Record<string, number> | undefined,
          personality: profileExtras?.personality ?? (player as any).personality,
          lifeContext: player.lifeContext as unknown as Record<string, number> | undefined,
          is_celebrity: (player as any).is_celebrity,
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
            {isOwnPlayer && player.weekly_wage != null && (
              <DetailRow label="Mzda" value={`${player.weekly_wage.toLocaleString("cs")} Kč/týd`} />
            )}
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

      </>}
      {/* ═══ /TAB PŘEHLED ═══ */}

      {/* ═══ TAB: HISTORIE — Trénink + Kondice + Historie klubů + Match history ═══ */}
      {activeTab === "historie" && <>

      {/* ═══ Tréninkový vývoj + Vývoj kondice (2-col grid na desktopu, equal height) ═══ */}
      {player.team_id === teamId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TrainingDevelopment teamId={teamId} playerId={playerId} />
          <ConditionLog teamId={teamId} playerId={playerId} />
        </div>
      )}

      {/* ═══ Historie klubů ═══ */}
      {contracts.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Historie klubů</SectionLabel>
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
                      : c.joinType === "swap" ? "bg-gold-50 text-gold-600"
                      : c.joinType === "loan" ? "bg-yellow-50 text-yellow-700"
                      : c.joinType === "pub" || c.joinType === "friend" || c.joinType === "recommendation" ? "bg-amber-50 text-amber-700"
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
        </div>
      )}

      </>}
      {/* ═══ /TAB HISTORIE — pokračování níže (match history) ═══ */}

      {/* ═══ TAB: VZTAHY — Vztahy v kádru + Watchers ═══ */}
      {activeTab === "vztahy" && <>

      {/* ═══ Vztahy v kádru ═══ */}
      {(((isOwnPlayer && profileExtras && profileExtras.relationships.length > 0))) && (
        <div className="grid grid-cols-1 gap-5">
          {isOwnPlayer && profileExtras && profileExtras.relationships.length > 0 ? (
            <div className="card p-4 sm:p-5">
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
          ) : null}
        </div>
      )}

      </>}
      {/* ═══ /TAB VZTAHY — pokračování níže (watchers) ═══ */}

      {/* ═══ TAB: STATISTIKY ═══ */}
      {activeTab === "statistiky" && <>

      {/* ═══ Forma — posledních 5 zápasů ═══ */}
      {matchHistory.length > 0 && (() => {
        const recent = matchHistory.slice(0, 5).reverse(); // DESC → ASC pro vizuální časovou osu
        const recentAvg = recent.reduce((s, m) => s + m.rating, 0) / recent.length;
        const olderSlice = matchHistory.slice(5, 10);
        const olderAvg = olderSlice.length > 0 ? olderSlice.reduce((s, m) => s + m.rating, 0) / olderSlice.length : null;
        const trend = olderAvg != null ? recentAvg - olderAvg : 0;
        return (
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <SectionLabel>Forma · posledních {recent.length}</SectionLabel>
              {olderAvg != null && (
                <div className="text-xs font-heading text-muted flex items-center gap-1">
                  <span>Trend:</span>
                  <span className={trend > 0.2 ? "text-pitch-500 font-bold" : trend < -0.2 ? "text-card-red font-bold" : "text-ink"}>
                    {trend > 0.2 ? "↗" : trend < -0.2 ? "↘" : "→"} {trend > 0 ? "+" : ""}{trend.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {recent.map((m) => {
                const ratingBg = m.rating >= 7.5 ? "bg-pitch-500 text-white"
                  : m.rating >= 6.5 ? "bg-pitch-100 text-pitch-700"
                  : m.rating >= 5.5 ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700";
                const resultLabel = m.result === "W" ? "V" : m.result === "L" ? "P" : "R";
                const resultColor = m.result === "W" ? "text-pitch-600"
                  : m.result === "L" ? "text-card-red"
                  : "text-muted";
                return (
                  <Link
                    key={m.matchId}
                    href={`/dashboard/match/${m.matchId}/replay`}
                    className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors min-w-[64px]"
                  >
                    <span className={`px-2 py-1 rounded-md text-base font-heading font-bold tabular-nums ${ratingBg}`}>
                      {m.rating.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs">
                      <span className="text-muted truncate max-w-[60px]">{m.opponent ?? "—"}</span>
                    </span>
                    <span className={`text-[11px] font-heading font-bold ${resultColor}`}>{resultLabel}</span>
                    {(m.goals > 0 || m.assists > 0) && (
                      <span className="text-[10px] text-muted">
                        {m.goals > 0 && <>⚽{m.goals > 1 ? m.goals : ""}</>}
                        {m.assists > 0 && <> 👟{m.assists > 1 ? m.assists : ""}</>}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="text-xs text-muted mt-3">
              Průměrný rating posledních {recent.length} zápasů: <span className="font-heading font-bold text-ink">{recentAvg.toFixed(1)}</span>
            </div>
          </div>
        );
      })()}

      {/* ═══ Trend ratingu přes celou sezónu ═══ */}
      {matchHistory.length >= 3 && (() => {
        const series = [...matchHistory].reverse(); // od nejstaršího k nejnovějšímu
        const avg = series.reduce((s, m) => s + m.rating, 0) / series.length;
        const w = 720;
        const h = 140;
        const padX = 12;
        const padY = 16;
        const minR = 4;
        const maxR = 9.5;
        const xStep = series.length > 1 ? (w - padX * 2) / (series.length - 1) : 0;
        const y = (r: number) => h - padY - ((Math.max(minR, Math.min(maxR, r)) - minR) / (maxR - minR)) * (h - padY * 2);
        const pts = series.map((m, i) => `${padX + i * xStep},${y(m.rating)}`).join(" ");
        const yAvg = y(avg);
        const yScale = [4, 5, 6, 7, 8, 9];
        return (
          <div className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <SectionLabel>Trend ratingu · {series.length} zápasů</SectionLabel>
              <div className="text-xs font-heading text-muted">
                Průměr: <span className="font-bold text-ink">{avg.toFixed(2)}</span>
              </div>
            </div>
            <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[600px] h-[140px]" preserveAspectRatio="none">
                {/* Y-axis gridlines */}
                {yScale.map((r) => (
                  <g key={r}>
                    <line x1={padX} x2={w - padX} y1={y(r)} y2={y(r)} stroke="#f3f4f6" strokeWidth={1} />
                    <text x={padX - 4} y={y(r) + 3} fontSize={9} fill="#9ca3af" textAnchor="end" fontFamily="ui-monospace">{r}</text>
                  </g>
                ))}
                {/* Average line */}
                <line x1={padX} x2={w - padX} y1={yAvg} y2={yAvg} stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                <text x={w - padX - 4} y={yAvg - 3} fontSize={9} fill="#10b981" textAnchor="end" fontFamily="ui-monospace">průměr {avg.toFixed(1)}</text>
                {/* Polyline */}
                <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeLinejoin="round" />
                {/* Dots — barva dle ratingu */}
                {series.map((m, i) => {
                  const cx = padX + i * xStep;
                  const cy = y(m.rating);
                  const fill = m.rating >= 7.5 ? "#10b981"
                    : m.rating >= 6.5 ? "#f59e0b"
                    : "#ef4444";
                  return <circle key={m.matchId} cx={cx} cy={cy} r={3} fill={fill} stroke="white" strokeWidth={1.5} />;
                })}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* ═══ Srovnání s ligou ═══ */}
      {leagueRanks && (() => {
        const items = [
          { label: "Góly", icon: "⚽", rank: leagueRanks.goals },
          { label: "Asistence", icon: "👟", rank: leagueRanks.assists },
          { label: "Průměr ratingu", icon: "⭐", rank: leagueRanks.rating, isRating: true },
        ].filter((i) => i.rank != null && i.rank.value > 0);
        if (items.length === 0) return null;
        return (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Srovnání s ligou</SectionLabel>
            <div className="space-y-3">
              {items.map((item) => {
                const r = item.rank!;
                const pct = r.total > 0 ? Math.max(0, ((r.total - r.rank) / r.total) * 100) : 0;
                const topPct = Math.min(100, Math.round(((r.rank - 1) / Math.max(1, r.total)) * 100) + 1);
                const barColor = pct >= 80 ? "bg-pitch-500"
                  : pct >= 50 ? "bg-pitch-400"
                  : pct >= 25 ? "bg-amber-400"
                  : "bg-gray-300";
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="shrink-0 text-base">{item.icon}</span>
                    <span className="shrink-0 w-32 sm:w-40 text-sm font-heading">{item.label}</span>
                    <span className="shrink-0 w-14 text-base font-heading font-bold tabular-nums text-right">
                      {item.isRating ? r.value.toFixed(2) : r.value}
                    </span>
                    <span className="shrink-0 w-20 text-xs text-muted">
                      {r.rank}. z {r.total}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 w-16 text-[11px] text-muted text-right font-heading">
                      Top {topPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══ Position-specific highlight stats ═══ */}
      {matchHistory.length > 0 && (() => {
        const totalGames = matchHistory.length;
        const startedGames = matchHistory.filter((m) => m.started).length;
        const totalMinutes = matchHistory.reduce((s, m) => s + (m.minutesPlayed ?? 0), 0);
        const totalGoals = matchHistory.reduce((s, m) => s + m.goals, 0);
        const totalAssists = matchHistory.reduce((s, m) => s + m.assists, 0);
        const totalYellow = matchHistory.reduce((s, m) => s + m.yellowCards, 0);
        const totalRed = matchHistory.reduce((s, m) => s + m.redCards, 0);
        const cleanSheets = matchHistory.filter((m) => {
          const oppScore = m.isHome ? m.awayScore : m.homeScore;
          return oppScore === 0;
        }).length;
        const goalsConceded = matchHistory.reduce((s, m) => s + (m.isHome ? m.awayScore : m.homeScore), 0);
        const wins = matchHistory.filter((m) => m.result === "W").length;
        const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        const goalsPerGame = totalGames > 0 ? totalGoals / totalGames : 0;
        const assistsPerGame = totalGames > 0 ? totalAssists / totalGames : 0;
        const minutesPerGame = totalGames > 0 ? Math.round(totalMinutes / totalGames) : 0;

        const pos = player.position;
        const stats: Array<{ label: string; value: string | number; sub?: string; highlight?: boolean }> = [];

        if (pos === "GK") {
          stats.push(
            { label: "Čistá konta", value: cleanSheets, sub: `z ${totalGames}`, highlight: true },
            { label: "Inkasované góly", value: goalsConceded, sub: `${(goalsConceded / Math.max(1, totalGames)).toFixed(1)} / zápas` },
            { label: "Min. na hřišti", value: totalMinutes },
            { label: "Sezónní % výher", value: `${winRate}%` },
          );
        } else if (pos === "DEF") {
          stats.push(
            { label: "Čistá konta", value: cleanSheets, sub: `z ${totalGames}`, highlight: true },
            { label: "Asistence", value: totalAssists },
            { label: "Žluté karty", value: totalYellow },
            { label: "Červené karty", value: totalRed },
          );
        } else if (pos === "MID") {
          stats.push(
            { label: "Asistence", value: totalAssists, sub: `${assistsPerGame.toFixed(2)} / zápas`, highlight: true },
            { label: "Góly", value: totalGoals, sub: `${goalsPerGame.toFixed(2)} / zápas` },
            { label: "G+A", value: totalGoals + totalAssists },
            { label: "Žluté karty", value: totalYellow },
          );
        } else { // FWD
          const goalContribution = totalGoals + totalAssists;
          stats.push(
            { label: "Góly", value: totalGoals, sub: `${goalsPerGame.toFixed(2)} / zápas`, highlight: true },
            { label: "Asistence", value: totalAssists },
            { label: "G+A", value: goalContribution },
            { label: "Min / gól", value: totalGoals > 0 ? Math.round(totalMinutes / totalGoals) : "—" },
          );
        }

        // Always-relevant secondary
        const secondary: Array<{ label: string; value: string | number }> = [
          { label: "Zápasů", value: totalGames },
          { label: "V základu", value: `${startedGames}/${totalGames}` },
          { label: "Min / zápas", value: minutesPerGame },
        ];

        const posTitle: Record<string, string> = {
          GK: "Brankářský přehled",
          DEF: "Obranný přehled",
          MID: "Záložnický přehled",
          FWD: "Útočný přehled",
        };

        return (
          <div className="card p-4 sm:p-5">
            <SectionLabel>{posTitle[pos] ?? "Sezónní přehled"}</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {stats.map((s) => (
                <div key={s.label} className={`p-3 rounded-lg ${s.highlight ? "bg-pitch-50 border border-pitch-100" : "bg-gray-50"}`}>
                  <div className={`font-heading font-[800] text-2xl tabular-nums ${s.highlight ? "text-pitch-700" : "text-ink"}`}>{s.value}</div>
                  <div className="text-xs font-heading uppercase text-muted mt-0.5">{s.label}</div>
                  {s.sub && <div className="text-[11px] text-muted mt-0.5">{s.sub}</div>}
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap text-sm text-muted">
              {secondary.map((sx) => (
                <div key={sx.label}>
                  {sx.label}: <span className="font-heading font-bold text-ink">{sx.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ═══ Row 2: Kariéra — FM style ═══ */}
      <div className="grid grid-cols-1 gap-5">

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

      </div>

      </>}
      {/* ═══ /TAB STATISTIKY ═══ */}

      {/* ═══ TAB: HISTORIE — pokračování (Match history) ═══ */}
      {activeTab === "historie" && matchHistory.length > 0 && (() => {
        const filtered = historyFilter === "all"
          ? matchHistory
          : matchHistory.filter((m) => m.result === historyFilter);
        // Highlight best/worst rating zápasy
        const bestRating = matchHistory.reduce((max, m) => Math.max(max, m.rating), -Infinity);
        const worstRating = matchHistory.reduce((min, m) => Math.min(min, m.rating), Infinity);
        const winsCount = matchHistory.filter((m) => m.result === "W").length;
        const drawsCount = matchHistory.filter((m) => m.result === "D").length;
        const lossesCount = matchHistory.filter((m) => m.result === "L").length;
        const Filter = ({ id, label, count, color }: { id: typeof historyFilter; label: string; count: number; color: string }) => (
          <button
            onClick={() => setHistoryFilter(id)}
            className={`px-2.5 py-1 rounded-md text-xs font-heading font-bold transition-colors ${
              historyFilter === id ? `${color} text-white` : "bg-gray-100 text-ink hover:bg-gray-200"
            }`}
          >
            {label} <span className="opacity-75">{count}</span>
          </button>
        );
        return (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionLabel>Historie zápasů ({filtered.length}/{matchHistory.length})</SectionLabel>
            <div className="flex items-center gap-1">
              <Filter id="all" label="Všechny" count={matchHistory.length} color="bg-pitch-500" />
              <Filter id="W" label="Výhry" count={winsCount} color="bg-pitch-500" />
              <Filter id="D" label="Remízy" count={drawsCount} color="bg-gray-500" />
              <Filter id="L" label="Prohry" count={lossesCount} color="bg-red-500" />
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
                  <th className="pb-2 pl-4 sm:pl-5 pr-2 w-12">Kolo</th>
                  <th className="pb-2 pr-2">Soupeř</th>
                  <th className="pb-2 pr-2 text-center w-20">Výsledek</th>
                  <th className="pb-2 pr-2 text-center w-24" title="Hodnocení">Hodnocení</th>
                  <th className="pb-2 pr-2 text-center w-12" title="Minuty">Min</th>
                  <th className="pb-2 pr-2 text-center w-8" title="Góly">G</th>
                  <th className="pb-2 pr-2 text-center w-8" title="Asistence">A</th>
                  <th className="pb-2 pr-4 sm:pr-5 text-center w-16" title="Karty">Karty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const resultBg = m.result === "W" ? "bg-pitch-50" : m.result === "L" ? "bg-red-50" : "bg-gray-50";
                  const resultText = m.result === "W" ? "text-pitch-600" : m.result === "L" ? "text-card-red" : "text-muted";
                  const ratingColor = m.rating >= 7.5 ? "text-pitch-500 font-bold"
                    : m.rating >= 6.5 ? "text-pitch-600"
                    : m.rating >= 5.5 ? "text-ink"
                    : m.rating >= 4.5 ? "text-gold-600"
                    : "text-card-red font-bold";
                  const barPct = Math.max(0, Math.min(100, ((m.rating - 1) / 9) * 100));
                  const barColor = m.rating >= 7.5 ? "#10b981"
                    : m.rating >= 6.5 ? "#f59e0b"
                    : "#ef4444";
                  const isBest = matchHistory.length >= 3 && m.rating === bestRating;
                  const isWorst = matchHistory.length >= 3 && m.rating === worstRating;
                  const rowBg = isBest ? "bg-pitch-50/30" : isWorst ? "bg-red-50/30" : "";

                  return (
                    <tr key={m.matchId} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${rowBg}`}>
                      <td className="py-2 pl-4 sm:pl-5 pr-2 tabular-nums text-muted">{m.round ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <a href={`/dashboard/match/${m.matchId}/replay`} className="flex items-center gap-2 hover:underline">
                          <BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                            pattern={(m.opponentBadge as BadgePattern) || "shield"}
                            initials={(m.opponent ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={20} />
                          <span className="font-heading font-bold text-ink truncate max-w-[180px]">{m.opponent ?? "Soupeř"}</span>
                          <span className="text-[10px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
                          {isBest && <span title="Nejlepší rating sezóny" className="text-xs">🌟</span>}
                          {isWorst && <span title="Nejhorší rating sezóny" className="text-xs">😞</span>}
                        </a>
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-heading font-bold ${resultBg} ${resultText}`}>
                          {m.homeScore}:{m.awayScore}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-8 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block" title={`Rating ${m.rating.toFixed(1)}/10`}>
                            <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                          </div>
                          <span className={`tabular-nums font-heading font-bold ${ratingColor}`}>
                            {m.rating.toFixed(1)}
                          </span>
                        </div>
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
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-center text-sm text-muted italic">Žádný zápas neodpovídá filtru.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Summary — vždy z celé sezóny, ne z filtru */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100 flex-wrap">
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-ink">{matchHistory.length}</span> zápasů
            </div>
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-pitch-500">{winsCount}V</span>
              {" "}
              <span className="font-heading font-bold text-ink">{drawsCount}R</span>
              {" "}
              <span className="font-heading font-bold text-card-red">{lossesCount}P</span>
            </div>
            <div className="text-sm text-muted">
              <span className="font-heading font-bold text-ink">{matchHistory.reduce((s, m) => s + m.goals, 0)}</span> gólů
            </div>
            <div className="text-sm text-muted">
              Prům. <span className="font-heading font-bold text-ink">{(matchHistory.reduce((s, m) => s + m.rating, 0) / matchHistory.length).toFixed(1)}</span>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ═══ TAB: VZTAHY — Watchers ═══ */}
      {activeTab === "vztahy" && (player as any).watchers && (player as any).watchers.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Sledují hráče ({(player as any).watchers.length})</SectionLabel>
          <div className="flex flex-wrap gap-2 mt-2">
            {((player as any).watchers as Array<{ id: string; name: string; primary_color: string; secondary_color: string; badge_pattern: string }>).map((w) => (
              <Link key={w.id} href={`/dashboard/team/${w.id}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 hover:bg-pitch-500/10 border border-gray-100 transition-colors">
                <BadgePreview
                  primary={w.primary_color || "#2D5F2D"}
                  secondary={w.secondary_color || "#FFF"}
                  pattern={(w.badge_pattern as BadgePattern) || "shield"}
                  initials={(w.name || "").split(" ").map((x) => x[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()}
                  size={18}
                />
                <span className="text-xs font-heading font-bold text-ink">{w.name}</span>
              </Link>
            ))}
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

const PREVIEW_ROWS = 8;

function TrainingDevelopment({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [log, setLog] = useState<TrainingLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiFetch<{ log: TrainingLogEntry[] }>(`/api/teams/${teamId}/players/${playerId}/training-log`)
      .then((data) => { setLog(data.log); setLoaded(true); })
      .catch((e) => { console.error("training-log load:", e); setLoaded(true); });
  }, [teamId, playerId]);

  if (!loaded) return null;

  const gains = log.filter((l) => l.change > 0).length;
  const losses = log.filter((l) => l.change < 0).length;
  const visible = showAll ? log : log.slice(0, PREVIEW_ROWS);

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Tréninkový vývoj</SectionLabel>

      {log.length === 0 ? (
        <p className="text-sm text-muted">Zatím žádné tréninkové záznamy.</p>
      ) : (
        <>
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-muted uppercase">
                  <th className="text-left py-2 pr-3 font-heading">Datum</th>
                  <th className="text-left py-2 pr-3 font-heading">Atribut</th>
                  <th className="text-left py-2 pr-3 font-heading hidden md:table-cell">Trénink</th>
                  <th className="text-right py-2 font-heading">Změna</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry, i) => {
                  const date = entry.game_date ? new Date(entry.game_date).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "—";
                  const trainingLabel = TRAIN_TYPE_LABELS[entry.training_type] ?? entry.training_type;
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-b-0 align-top">
                      <td className="py-1.5 pr-3 tabular-nums text-muted text-[11px] whitespace-nowrap">{date}</td>
                      <td className="py-1.5 pr-3">
                        <div className="font-medium">{TRAIN_ATTR_LABELS[entry.attribute] ?? entry.attribute}</div>
                        <div className="md:hidden text-[11px] text-muted leading-tight">{trainingLabel}</div>
                      </td>
                      <td className="py-1.5 pr-3 text-muted hidden md:table-cell">{trainingLabel}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <span className={`font-heading font-bold ${entry.change > 0 ? "text-pitch-500" : "text-card-red"}`}>
                          {entry.change > 0 ? `+${entry.change}` : entry.change}
                        </span>
                        <span className="text-muted text-xs ml-1">({entry.old_value}→{entry.new_value})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {log.length > PREVIEW_ROWS && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs text-pitch-500 font-heading font-bold hover:underline pt-2">
              {showAll ? "Sbalit" : `Zobrazit všechny (${log.length}) →`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const CONDITION_SOURCE_META: Record<string, { icon: string; label: string }> = {
  training: { icon: "🏃", label: "Trénink" },
  recovery: { icon: "💤", label: "Regenerace" },
  facility: { icon: "🚿", label: "Sprchy" },
  match: { icon: "⚽", label: "Zápas" },
  friendly: { icon: "🤝", label: "Přátelák" },
  hangover: { icon: "🍺", label: "Kocovina" },
  pub: { icon: "🍻", label: "Hospoda" },
  event: { icon: "🎉", label: "Událost" },
};

interface ConditionLogEntry {
  id: number;
  oldValue: number;
  newValue: number;
  delta: number;
  source: string;
  description: string | null;
  gameDate: string | null;
  createdAt: string;
}

function ConditionLog({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [entries, setEntries] = useState<ConditionLogEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const days = 7;

  useEffect(() => {
    apiFetch<{ entries: ConditionLogEntry[]; days: number }>(`/api/teams/${teamId}/players/${playerId}/condition-log?days=${days}`)
      .then((d) => setEntries(d.entries))
      .catch((e) => { console.error("condition-log fetch:", e); setEntries([]); })
      .finally(() => setLoading(false));
  }, [teamId, playerId]);

  if (loading) return null;

  const gains = entries.filter((e) => e.delta > 0).length;
  const losses = entries.filter((e) => e.delta < 0).length;
  const visible = showAll ? entries : entries.slice(0, PREVIEW_ROWS);

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Vývoj kondice</SectionLabel>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Za posledních {days} dní žádné změny kondice.</p>
      ) : (
        <>
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
              <div className="font-heading font-[800] text-2xl tabular-nums text-ink">{entries.length}</div>
              <div className="text-xs text-muted uppercase">Změn</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{gains}</div>
              <div className="text-xs text-muted uppercase">Nárůst</div>
            </div>
            {losses > 0 && (
              <div className="text-center px-4 py-2 rounded-lg bg-gray-50 min-w-[70px]">
                <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{losses}</div>
                <div className="text-xs text-muted uppercase">Pokles</div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-muted uppercase">
                  <th className="text-left py-2 pr-3 font-heading">Kdy</th>
                  <th className="text-left py-2 pr-3 font-heading">Zdroj</th>
                  <th className="text-left py-2 pr-3 font-heading hidden md:table-cell">Detail</th>
                  <th className="text-right py-2 font-heading">Změna</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const meta = CONDITION_SOURCE_META[entry.source] ?? { icon: "•", label: entry.source };
                  const dateSrc = entry.gameDate ?? entry.createdAt;
                  const date = new Date(dateSrc).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
                  return (
                    <tr key={entry.id} className="border-b border-gray-50 last:border-b-0 align-top">
                      <td className="py-1.5 pr-3 tabular-nums text-muted text-[11px] whitespace-nowrap">{date}</td>
                      <td className="py-1.5 pr-3">
                        <div className="whitespace-nowrap">
                          <span className="mr-1">{meta.icon}</span>
                          <span className="font-medium">{meta.label}</span>
                        </div>
                        <div className="md:hidden text-[11px] text-muted leading-tight">{entry.description ?? ""}</div>
                      </td>
                      <td className="py-1.5 pr-3 text-muted hidden md:table-cell">{entry.description ?? "—"}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <span className={`font-heading font-bold ${entry.delta > 0 ? "text-pitch-500" : entry.delta < 0 ? "text-card-red" : "text-muted"}`}>
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                        <span className="text-muted text-xs ml-1">({entry.oldValue}→{entry.newValue})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entries.length > PREVIEW_ROWS && (
            <button onClick={() => setShowAll((v) => !v)} className="text-xs text-pitch-500 font-heading font-bold hover:underline pt-2">
              {showAll ? "Sbalit" : `Zobrazit všechny (${entries.length}) →`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
