"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClubWebsiteData, ClubWebsiteTemplate, ClubWebsiteTransfer } from "@okresni-masina/shared";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf, type ScarfPattern } from "@/components/team/club-scarf";
import { apiFetch } from "@/lib/api";
import { ShareButton } from "./ShareButton";
import { ManagerFace } from "./ManagerFace";
import { TicketModal } from "./TicketModal";
import { TacticalPitch } from "./TacticalPitch";

interface ClubWebsiteClientProps {
  data: ClubWebsiteData;
  siteUrl: string;
}

export function ClubWebsiteClient({ data, siteUrl }: ClubWebsiteClientProps) {
  const router = useRouter();
  const { team, website, manager, staff, roster, matches, concessions, tickets, interviews, news } = data;
  const template = (website.template || "retro_2004") as ClubWebsiteTemplate;

  const [isPlayer, setIsPlayer] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsPlayer(!!localStorage.getItem("om_token"));
    }
  }, []);

  const handleBackToGame = () => {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.push("/muj-klub");
      }
    }
  };

  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [rosterViewMode, setRosterViewMode] = useState<"cards" | "pitch">("cards");
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);

  // Transfers & AI generation state
  const [transferList, setTransferList] = useState<ClubWebsiteTransfer[]>(data.transfers || []);
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");
  const [generatingAiId, setGeneratingAiId] = useState<string | null>(null);

  const handleRegenerateAi = async (t: ClubWebsiteTransfer) => {
    setGeneratingAiId(t.id);
    try {
      const res = await apiFetch<{
        ok: boolean;
        headline: string;
        story: string;
        quote: string;
        isAiGenerated: boolean;
      }>(`/api/teams/${team.id}/website/generate-transfer-story`, {
        method: "POST",
        body: JSON.stringify({
          direction: t.direction,
          playerName: t.playerName,
          otherTeamName: t.otherTeamName,
          fee: t.fee,
          kind: t.kind,
        }),
      });
      if (res.ok) {
        setTransferList((prev) =>
          prev.map((item) =>
            item.id === t.id
              ? {
                  ...item,
                  headline: res.headline,
                  story: res.story,
                  quote: res.quote,
                  isAiGenerated: res.isAiGenerated,
                }
              : item,
          ),
        );
      }
    } catch (e) {
      console.error("AI transfer story err:", e);
    } finally {
      setGeneratingAiId(null);
    }
  };

  const filteredTransfers = transferList.filter((t) => {
    if (transferFilter === "in") return t.direction === "in";
    if (transferFilter === "out") return t.direction === "out";
    return true;
  });

  const primary = team.primaryColor || "#2D5F2D";
  const secondary = team.secondaryColor || "#FFFFFF";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();
  const shareUrl = `${siteUrl}/klub/${website.customSlug || team.id}`;

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;
  const hasU21 = roster.u21Team && roster.u21Team.length > 0;

  // Template theme styles
  const isRetro = template === "retro_2004";
  const isVillage = template === "village_patriot";
  const isRegional = template === "regional_standard";
  const isProfi = template === "profi_league";
  const isChampions = template === "champions";

  // Base theme classes
  const themeBg = isRetro
    ? "bg-[#e5e5d8] text-gray-900 font-sans"
    : isVillage
    ? "bg-[#f5ede0] text-[#2c1d11]"
    : isRegional
    ? "bg-slate-50 text-slate-900"
    : isChampions
    ? "bg-[#050814] text-white"
    : "bg-[#0b0e14] text-white"; // profi_league default dark

  const cardBg = isRetro
    ? "bg-white border-2 border-gray-400 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]"
    : isVillage
    ? "bg-[#fdfaf5] border-2 border-[#8b5a2b]/30 shadow-md rounded-2xl"
    : isRegional
    ? "bg-white border border-slate-200 shadow-sm rounded-2xl"
    : isChampions
    ? "bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl rounded-3xl"
    : "bg-[#121722] border border-white/10 shadow-xl rounded-3xl";

  const headerGradient = isRetro
    ? "bg-gradient-to-r from-blue-900 via-blue-700 to-blue-900 text-white border-b-4 border-yellow-500"
    : isVillage
    ? "bg-[#3e2717] text-[#fbebd6] border-b-4 border-[#251509]"
    : isRegional
    ? "bg-white text-slate-900 border-b border-slate-200 shadow-sm"
    : isChampions
    ? "bg-gradient-to-r from-[#0d142b] via-[#1a2347] to-[#0d142b] text-white border-b border-cyan-500/20"
    : "bg-[#0e131d] text-white border-b border-white/10";

  return (
    <div className={`min-h-screen ${themeBg} pb-12 transition-colors duration-300`}>
      {/* ═══ TOP UTILITY BAR (PWA & RETURN NAVIGATION) ═══ */}
      <div className="bg-[#0b0f17] text-slate-300 border-b border-white/10 px-3 sm:px-6 py-2 text-xs flex items-center justify-between sticky top-0 z-50 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBackToGame}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-heading font-black text-xs uppercase tracking-wider shadow transition"
          >
            <span>←</span>
            <span>Zpět do hry</span>
          </button>
          <span className="hidden sm:inline text-slate-400 text-[11px] font-medium truncate max-w-xs">
            Oficiální web klubu {team.name}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/muj-klub"
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-heading font-bold text-xs transition px-2 py-1 rounded hover:bg-white/5"
          >
            <span>⚙️</span>
            <span className="hidden xs:inline">Správa webu</span>
          </Link>
          <Link
            href={`/tym/${team.id}/stadion`}
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-heading font-bold text-xs transition px-2 py-1 rounded hover:bg-white/5"
          >
            <span>🏟️</span>
            <span className="hidden sm:inline">3D Areál</span>
          </Link>
        </div>
      </div>

      {/* ═══ SPONSOR BANNER ADDON (Top Bar) ═══ */}
      {website.sponsorBannerEnabled && (
        <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 text-black py-2 px-4 text-xs font-heading font-extrabold text-center tracking-wider shadow-inner flex items-center justify-center gap-3">
          <span>⭐ OFICIÁLNÍ PARTNEŘI KLUBU:</span>
          <span className="font-bold underline">Pivovar Kocour · Lesní správa a.s. · Truhlářství Novák</span>
          <span className="bg-black/10 px-2 py-0.5 rounded text-[10px]">REKLAMA</span>
        </div>
      )}

      {/* ═══ HEADER & NAV ═══ */}
      <header className={`${headerGradient} relative z-30 transition-all`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          {/* Brand / Logo + Name */}
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="shrink-0 drop-shadow-md">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={isRetro ? 48 : 56}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-[900] text-xl sm:text-2xl tracking-tight truncate">
                  {team.name}
                </span>
                {team.identity.foundingYear && (
                  <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded-full bg-black/20 text-yellow-300 border border-yellow-300/30">
                    zal. {team.identity.foundingYear}
                  </span>
                )}
              </div>
              <div className="text-xs opacity-75 truncate flex items-center gap-1.5 mt-0.5">
                <span>📍 {team.village.name} ({team.village.district})</span>
                {team.identity.nickname && <span>· &ldquo;{team.identity.nickname}&rdquo;</span>}
              </div>
            </div>
          </div>

          {/* Actions & Visitor Counter */}
          <div className="flex items-center gap-3">
            {/* Retro Counter or Modern Visitor Pill */}
            {isRetro ? (
              <div className="hidden sm:flex items-center gap-1 bg-black text-[#00ff41] font-mono px-3 py-1 border-2 border-inset border-gray-600 rounded text-xs shadow-inner">
                <span className="text-[10px] text-gray-400">NÁVŠTĚVY:</span>
                <span className="tracking-widest font-bold">
                  {String(website.visitorCount || 1).padStart(6, "0")}
                </span>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-heading">
                <span>👁️</span>
                <span className="opacity-70">Návštěv:</span>
                <span className="font-bold">{website.visitorCount || 1}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsTicketModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-heading font-[900] text-xs sm:text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
            >
              <span>🎟️</span>
              <span>VSTUPENKY</span>
            </button>

            <ShareButton
              url={shareUrl}
              title={team.name}
              textClass={isRegional ? "text-slate-700" : "text-white"}
              bgClass={isRegional ? "bg-slate-100 hover:bg-slate-200" : "bg-white/10 hover:bg-white/20"}
            />
          </div>
        </div>

        {/* Quick section anchor bar */}
        <div className="border-t border-black/10 overflow-x-auto text-xs font-heading font-bold flex gap-4 px-4 sm:px-8 py-2 max-w-6xl mx-auto opacity-90">
          <a href="#zapas" className="hover:underline shrink-0">⚽ Zápasy</a>
          <a href="#kadr" className="hover:underline shrink-0">👥 Kádr týmu</a>
          <a href="#prestupy" className="hover:underline shrink-0">🔄 Přestupy</a>
          <a href="#realizak" className="hover:underline shrink-0">👔 Realizační tým</a>
          <a href="#stadion" className="hover:underline shrink-0">🏟️ Stadion & Areál</a>
          <a href="#bufet" className="hover:underline shrink-0">🍺 Občerstvení</a>
          <a href="#rozhovory" className="hover:underline shrink-0">🎙️ Rozhovory trenéra</a>
          <a href="#identita" className="hover:underline shrink-0">🎨 Klubová kultura</a>
        </div>
      </header>

      {/* ═══ OFFICIAL PINNED ANNOUNCEMENT (PRESS OFFICER ADDON) ═══ */}
      {website.announcement && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 mt-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-900 dark:text-amber-100 flex items-start gap-4 shadow-sm">
            <span className="text-3xl shrink-0">📢</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-widest font-heading font-extrabold text-amber-600 dark:text-amber-400 mb-1">
                Oficiální prohlášení vedení klubu
              </div>
              <div className="text-sm sm:text-base italic leading-relaxed whitespace-pre-line font-medium">
                &ldquo;{website.announcement}&rdquo;
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HERO MATCH CENTER ═══ */}
      <section id="zapas" className="max-w-6xl mx-auto px-4 sm:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Next Match Card */}
          <div className={`lg:col-span-2 ${cardBg} p-6 sm:p-8 relative overflow-hidden flex flex-col justify-between`}>
            {/* Background Team glow */}
            <div
              className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
              style={{ background: primary }}
            />

            <div>
              {/* Derby Alert Banner */}
              {matches.nextMatch?.isRival && (
                <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600 text-white font-heading font-black text-xs uppercase tracking-widest animate-pulse shadow-lg">
                  <span>⚔️</span>
                  <span>OKRESNÍ DERBY — VYSOKÁ RIVALITA!</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-heading font-bold uppercase tracking-wider opacity-60 mb-4">
                <span>Příští utkání · Kolo {matches.nextMatch?.round ?? "-"}</span>
                {matches.nextMatch?.isHome ? (
                  <span className="text-emerald-400 font-extrabold">DOMA</span>
                ) : (
                  <span className="text-amber-400 font-extrabold">VENKU</span>
                )}
              </div>

              {matches.nextMatch ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 my-4">
                  {/* Home Team */}
                  <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-1">
                    <span className="font-heading font-[900] text-xl sm:text-2xl">
                      {matches.nextMatch.isHome ? team.name : matches.nextMatch.opponent.name}
                    </span>
                    <span className="text-xs opacity-70 mt-1">Domácí</span>
                  </div>

                  {/* VS Badge */}
                  <div className="shrink-0 flex flex-col items-center px-4 py-2 rounded-2xl bg-black/30 border border-white/10 font-heading">
                    <span className="text-2xl font-[900] text-amber-400">VS</span>
                    <span className="text-[10px] opacity-70">Mistrovské utkání</span>
                  </div>

                  {/* Away Team */}
                  <div className="flex flex-col items-center sm:items-end text-center sm:text-right flex-1">
                    <span className="font-heading font-[900] text-xl sm:text-2xl">
                      {matches.nextMatch.isHome ? matches.nextMatch.opponent.name : team.name}
                    </span>
                    <span className="text-xs opacity-70 mt-1">Hosté</span>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center opacity-60 font-heading">
                  V této chvíli není naplánován žádný další ligový zápas.
                </div>
              )}

              {/* Match Details & Pitch Report */}
              <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-heading">
                <div>
                  <div className="opacity-60 text-[10px] uppercase">Místo konání</div>
                  <div className="font-bold truncate mt-0.5">
                    🏟️ {matches.nextMatch?.stadiumName || team.stadium.name || "Místní hřiště"}
                  </div>
                </div>

                <div>
                  <div className="opacity-60 text-[10px] uppercase">Stav pažitu</div>
                  <div className="font-bold mt-0.5 flex items-center gap-1.5">
                    <span>🌱</span>
                    <span>{team.stadium.pitchCondition ?? 70}% ({team.stadium.pitchType || "Přírodní tráva"})</span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="opacity-60 text-[10px] uppercase">Počasí zápasu</div>
                  <div className="font-bold mt-0.5">☀️ Polojasno, 19°C</div>
                </div>
              </div>
            </div>

            {/* Bottom Match Actions */}
            <div className="mt-6 pt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsTicketModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-heading font-extrabold text-xs shadow-md transition-all active:scale-95"
              >
                Vstupenky na zápas ({tickets.adultPrice} Kč)
              </button>

              {matches.nextMatch?.id && (
                <Link
                  href={`/zapasovy-den/${matches.nextMatch.id}`}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-current font-heading font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <span>📖</span>
                  <span>Zápasový den</span>
                </Link>
              )}
            </div>
          </div>

          {/* Last Match & Form Card */}
          <div className={`${cardBg} p-6 sm:p-8 flex flex-col justify-between`}>
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-wider opacity-60 mb-4">
                Poslední odehraný zápas
              </div>

              {matches.lastMatch ? (
                <div>
                  <div className="flex items-center justify-between gap-3 my-2">
                    <span className="font-heading font-bold truncate">
                      {matches.lastMatch.isHome ? team.name : matches.lastMatch.opponent.name}
                    </span>
                    <span className="font-heading font-[900] text-3xl tabular-nums text-emerald-400">
                      {matches.lastMatch.scoreHome} : {matches.lastMatch.scoreAway}
                    </span>
                    <span className="font-heading font-bold truncate">
                      {matches.lastMatch.isHome ? matches.lastMatch.opponent.name : team.name}
                    </span>
                  </div>
                  <div className="text-center text-xs opacity-60 mt-2">
                    Kolo {matches.lastMatch.round} · {matches.lastMatch.date ? new Date(matches.lastMatch.date).toLocaleDateString("cs-CZ") : "Odehráno"}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center opacity-50 text-xs">
                  Zatím nebyly odehrány žádné zápasy.
                </div>
              )}
            </div>

            {/* Quick Concession Teaser */}
            <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10">
              <div className="text-[10px] font-heading font-bold uppercase tracking-wider opacity-60 mb-2">
                Na čepu při zápase
              </div>
              <div className="flex items-center justify-between text-xs font-heading font-bold">
                <span>🍺 {concessions.beerName}</span>
                <span className="text-amber-400">{concessions.beerPrice} Kč</span>
              </div>
              <div className="flex items-center justify-between text-xs font-heading font-bold mt-1">
                <span>🌭 {concessions.sausageName}</span>
                <span className="text-amber-400">{concessions.sausagePrice} Kč</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ KÁDR TÝMU (ROSTER & TACTICS) ═══ */}
      <section id="kadr" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
              Hráčský kádr
            </div>
            <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
              Soupiska týmu
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* A-tým vs U21 */}
            {hasU21 && (
              <div className="flex rounded-xl bg-black/20 p-1 border border-white/10 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeRosterTab === "aTeam" ? "bg-amber-500 text-black" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  A-tým ({roster.aTeam.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("u21Team")}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeRosterTab === "u21Team" ? "bg-amber-500 text-black" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  U21 Rezerva ({roster.u21Team.length})
                </button>
              </div>
            )}

            {/* View Mode Toggle: Cards vs Pitch */}
            <div className="flex rounded-xl bg-black/20 p-1 border border-white/10 text-xs font-heading font-bold">
              <button
                type="button"
                onClick={() => setRosterViewMode("cards")}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  rosterViewMode === "cards" ? "bg-white/20 text-current" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span>📋</span>
                <span>Seznam</span>
              </button>
              <button
                type="button"
                onClick={() => setRosterViewMode("pitch")}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                  rosterViewMode === "pitch" ? "bg-white/20 text-current" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span>⚽</span>
                <span>Taktická 11</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode: Tactical Pitch */}
        {rosterViewMode === "pitch" ? (
          <div className={`${cardBg} p-6 sm:p-10`}>
            <div className="text-center mb-6">
              <div className="text-xs uppercase font-heading font-bold tracking-widest opacity-60">
                Předpokládané taktické rozestavení
              </div>
              <h3 className="text-xl font-heading font-[900] mt-1">
                Základní jedenáctka na hřišti
              </h3>
            </div>
            <TacticalPitch
              players={currentRoster}
              primaryColor={primary}
              secondaryColor={secondary}
            />
          </div>
        ) : (
          /* View Mode: Cards by Position */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentRoster.map((player) => (
              <div
                key={player.id}
                className={`${cardBg} p-4 flex flex-col justify-between hover:scale-[1.02] transition-transform`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-heading font-black text-xs flex items-center justify-center">
                        {player.squadNumber ?? "-"}
                      </span>
                      <span className="text-xs font-heading font-bold px-2 py-0.5 rounded bg-white/10 uppercase">
                        {player.position}
                      </span>
                    </div>
                    <div className="font-heading font-extrabold text-base mt-2 leading-tight">
                      {player.firstName} {player.lastName}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {player.age} let
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-xs uppercase font-heading opacity-60">Hodnocení</span>
                    <span className="text-2xl font-heading font-[900] text-emerald-400">
                      {player.overallRating}
                    </span>
                  </div>
                </div>

                {/* Season stats pills */}
                <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-4 gap-1 text-center font-heading">
                  <div className="p-1 rounded bg-black/10 dark:bg-white/5">
                    <div className="text-[9px] opacity-60">ZÁP</div>
                    <div className="text-xs font-bold">{player.stats.appearances}</div>
                  </div>
                  <div className="p-1 rounded bg-black/10 dark:bg-white/5">
                    <div className="text-[9px] opacity-60">GÓL</div>
                    <div className="text-xs font-bold text-emerald-400">{player.stats.goals}</div>
                  </div>
                  <div className="p-1 rounded bg-black/10 dark:bg-white/5">
                    <div className="text-[9px] opacity-60">ASIS</div>
                    <div className="text-xs font-bold text-yellow-400">{player.stats.assists}</div>
                  </div>
                  <div className="p-1 rounded bg-black/10 dark:bg-white/5">
                    <div className="text-[9px] opacity-60">MIN</div>
                    <div className="text-xs font-bold">{player.stats.minutesPlayed}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ PŘESTUPY: PŘEDSTAVOVAČKY & ROZLUČKY ═══ */}
      <section id="prestupy" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-heading font-bold uppercase tracking-widest text-amber-500 mb-1">
              Pohyby v kádru
            </div>
            <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
              Přestupy, představovačky a rozlučky
            </h2>
          </div>

          <div className="flex rounded-xl bg-black/20 p-1 border border-white/10 text-xs font-heading font-bold">
            <button
              type="button"
              onClick={() => setTransferFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                transferFilter === "all" ? "bg-amber-500 text-black" : "opacity-70 hover:opacity-100"
              }`}
            >
              Vše ({transferList.length})
            </button>
            <button
              type="button"
              onClick={() => setTransferFilter("in")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                transferFilter === "in" ? "bg-emerald-500 text-black" : "opacity-70 hover:opacity-100"
              }`}
            >
              Příchody ({transferList.filter((t) => t.direction === "in").length})
            </button>
            <button
              type="button"
              onClick={() => setTransferFilter("out")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                transferFilter === "out" ? "bg-red-500 text-white" : "opacity-70 hover:opacity-100"
              }`}
            >
              Odchody ({transferList.filter((t) => t.direction === "out").length})
            </button>
          </div>
        </div>

        {filteredTransfers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTransfers.map((t) => {
              const isArrival = t.direction === "in";
              const isGenerating = generatingAiId === t.id;

              return (
                <div
                  key={t.id}
                  className={`${cardBg} p-6 flex flex-col justify-between border-2 transition-all hover:border-amber-500/50 ${
                    isArrival ? "border-emerald-500/20" : "border-red-500/20"
                  }`}
                >
                  <div>
                    {/* Badge & Metadata row */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-heading font-black uppercase tracking-wider ${
                          isArrival
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        }`}
                      >
                        {isArrival ? "🟢 Nová posila / Příchod" : "🔴 Rozlučka / Odchod"}
                      </span>

                      <div className="flex items-center gap-2 text-xs font-heading font-bold opacity-75">
                        {t.kind === "free_agent" ? (
                          <span className="text-emerald-400">Volný hráč</span>
                        ) : t.kind === "released" ? (
                          <span className="text-red-400/80">Konec smlouvy</span>
                        ) : t.kind === "swap" ? (
                          <span className="text-blue-400">Výměna hráčů</span>
                        ) : (
                          <span className="text-amber-400/90 italic font-medium">Částka nezveřejněna</span>
                        )}
                        <span>·</span>
                        <span>{new Date(t.date).toLocaleDateString("cs-CZ")}</span>
                      </div>
                    </div>

                    {/* Headline */}
                    <h3 className="font-heading font-black text-lg sm:text-xl leading-snug mb-2">
                      {t.headline}
                    </h3>

                    {/* Story Article */}
                    <p className="text-xs sm:text-sm leading-relaxed opacity-85 mb-4">
                      {t.story}
                    </p>

                    {/* Grassroots Quote */}
                    {t.quote && (
                      <div className="p-3.5 rounded-xl bg-black/20 border-l-4 border-amber-500 text-xs italic opacity-90 leading-relaxed font-medium mb-4">
                        {t.quote}
                      </div>
                    )}
                  </div>

                  {/* Card bottom: AI Tag & Regenerate Button */}
                  <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-heading font-bold flex items-center gap-1.5 opacity-70">
                      {t.isAiGenerated ? (
                        <span className="text-amber-400 flex items-center gap-1">
                          ✨ AI generovaný komentář
                        </span>
                      ) : (
                        <span>📰 Klubový zpravodaj</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRegenerateAi(t)}
                      disabled={isGenerating}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 font-heading font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Přegenerovat představovačku/rozlučku pomocí AI s vesnickým humorem"
                    >
                      <span>🤖</span>
                      <span>{isGenerating ? "Generuji AI..." : "Napsat s AI"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`${cardBg} p-10 text-center flex flex-col items-center justify-center`}>
            <span className="text-4xl mb-3">🤝</span>
            <div className="font-heading font-extrabold text-base">Žádné přestupy v tomto období</div>
            <div className="text-xs opacity-60 mt-1 max-w-sm">
              V této kategorii zatím neproběhly žádné oficiální přestupy. Naši skauti a manažer však pilně sledují trh i okolní hospody!
            </div>
          </div>
        )}
      </section>

      {/* ═══ REALIZAČNÍ TÝM (STAFF & MANAGEMENT) ═══ */}
      <section id="realizak" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className="mb-6">
          <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
            Vedení a zázemí
          </div>
          <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
            Realizační tým
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Head Coach / Manager Spotlight */}
          {manager && (
            <div className={`md:col-span-1 ${cardBg} p-6 flex flex-col items-center text-center`}>
              <div className="relative mb-4">
                <div className="w-24 h-28 rounded-2xl overflow-hidden border-2 border-white/20 bg-black/20 flex items-center justify-center shadow-lg">
                  {manager.avatar && Object.keys(manager.avatar).length > 0 ? (
                    <ManagerFace faceConfig={manager.avatar} size={96} />
                  ) : (
                    <span className="text-4xl">👔</span>
                  )}
                </div>
                <span className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-amber-500 text-black font-heading font-extrabold text-[10px] uppercase shadow">
                  Hlavní trenér
                </span>
              </div>

              <h3 className="font-heading font-[900] text-xl mt-2">{manager.name}</h3>
              <div className="text-xs opacity-70 mt-0.5">
                {manager.age} let · Licence {manager.licence}
              </div>

              <div className="mt-4 w-full pt-4 border-t border-black/10 dark:border-white/10 flex justify-around text-xs font-heading">
                <div>
                  <div className="opacity-60 text-[10px]">Reputace</div>
                  <div className="font-bold text-amber-400">{manager.reputation} / 100</div>
                </div>
                <div>
                  <div className="opacity-60 text-[10px]">Status</div>
                  <div className="font-bold text-emerald-400">Aktivní</div>
                </div>
              </div>
            </div>
          )}

          {/* Assistants, Doctor, Physio, Groundskeeper Cards */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {staff.length > 0 ? (
              staff.map((st) => (
                <div key={st.id} className={`${cardBg} p-4 flex items-center gap-4`}>
                  <div className="w-14 h-16 rounded-xl bg-black/20 border border-white/10 flex items-center justify-center text-2xl shrink-0 overflow-hidden shadow">
                    {st.avatar && Object.keys(st.avatar).length > 0 ? (
                      <ManagerFace faceConfig={st.avatar} size={64} />
                    ) : (
                      <span>
                        {st.role === "lekar" ? "👨‍⚕️" : st.role === "maser" ? "💆" : st.role === "spravce_hriste" ? "🚜" : "📋"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-heading font-bold text-amber-400 truncate">
                      {st.profession || st.role}
                    </div>
                    <div className="font-heading font-extrabold text-base truncate">
                      {st.firstName} {st.lastName}
                    </div>
                    <div className="text-xs opacity-60 mt-0.5">
                      {st.age} let {st.description ? `· ${st.description}` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={`${cardBg} p-8 text-center col-span-2 opacity-60 text-sm font-heading flex flex-col items-center justify-center`}>
                <span>🧤</span>
                <span className="mt-2">Realizační tým je aktuálně řízen manažerem klubu.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ STADION & AREÁL (FOTOGALERIE) ═══ */}
      <section id="stadion" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 scroll-mt-14">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
              Zázemí & Domov
            </div>
            <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
              Stadion & Klubový areál
            </h2>
          </div>
          <Link
            href={`/tym/${team.id}/stadion`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-heading font-black text-xs uppercase tracking-wider shadow-lg transition active:scale-95 self-start sm:self-auto"
          >
            <span>🏟️</span>
            <span>3D virtuální prohlídka stadionu →</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metadata Card */}
          <div className={`${cardBg} p-6 sm:p-8 flex flex-col justify-between`}>
            <div>
              <div className="text-xs uppercase font-heading font-bold opacity-60 mb-1">
                Domácí svatostánek
              </div>
              <h3 className="font-heading font-[900] text-2xl sm:text-3xl leading-tight">
                {team.stadium.name || "Místní fotbalové hřiště"}
              </h3>
              {team.stadium.nickname && (
                <div className="text-base italic opacity-75 mt-1">&ldquo;{team.stadium.nickname}&rdquo;</div>
              )}

              {team.stadium.specialita && (
                <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <div className="font-heading font-bold text-amber-400 mb-1">🍺 Vesnická specialita</div>
                  <div className="opacity-90 leading-relaxed">{team.stadium.specialita}</div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs font-heading">
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Kapacita</span>
                  <div className="font-[900] text-xl tabular-nums mt-0.5">
                    {team.stadium.capacity ? team.stadium.capacity.toLocaleString("cs") : "400"} diváků
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Postaveno</span>
                  <div className="font-[900] text-xl tabular-nums mt-0.5">
                    {team.stadium.builtYear || "1972"}
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Povrch</span>
                  <div className="font-bold text-sm mt-0.5">
                    {team.stadium.pitchType || "Přírodní tráva"}
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Stav trávníku</span>
                  <div className="font-bold text-sm text-emerald-400 mt-0.5">
                    {team.stadium.pitchCondition ?? 75} %
                  </div>
                </div>
                {(team.stadium.tribunaNorth || team.stadium.tribunaSouth) && (
                  <div className="col-span-2 pt-2 border-t border-black/5 dark:border-white/5">
                    <span className="opacity-60 text-[10px] uppercase">Tribuny</span>
                    <div className="font-bold mt-0.5">
                      {[team.stadium.tribunaNorth, team.stadium.tribunaSouth].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                )}
              </div>

              <Link
                href={`/tym/${team.id}/stadion`}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-heading font-black text-xs uppercase tracking-wider text-center shadow transition flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                <span>Prohlédnout v 3D zobrazení</span>
              </Link>
            </div>
          </div>

          {/* Photo Gallery Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Foto 1: Reálné foto hřiště a areálu */}
            <div className={`${cardBg} p-4 flex flex-col justify-between group overflow-hidden`}>
              <div className="aspect-video rounded-xl relative overflow-hidden shadow-inner bg-slate-900 border border-white/10">
                <img
                  src="/images/prales-okres.webp"
                  alt={`${team.stadium.name || "Fotbalový stadion"} v obci ${team.village.name}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-3">
                  <span className="text-xs font-heading font-extrabold text-white flex items-center gap-1.5 drop-shadow">
                    <span>📸</span>
                    <span>Areál & Hrací plocha {team.village.name}</span>
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <div className="font-heading font-bold text-sm">Hrací plocha & Klandr</div>
                <div className="text-xs opacity-60 mt-0.5">Přírodní pažit s výhledem na obec {team.village.name} ({team.village.district})</div>
              </div>
            </div>

            {/* Foto 2: Reálné foto kotle s klubovým choreem */}
            <div className={`${cardBg} p-4 flex flex-col justify-between group overflow-hidden`}>
              <div className="aspect-video rounded-xl relative overflow-hidden shadow-inner bg-slate-900 border border-white/10">
                <img
                  src={`/kotel-foto?p=${encodeURIComponent(primary)}&s=${encodeURIComponent(secondary)}&team=${encodeURIComponent(team.name)}&att=${team.stadium.capacity || 400}&text=${encodeURIComponent(team.stadium.nickname || `${team.name.toUpperCase()} DO TOHO!`)}&lvl=2`}
                  alt={`Kotel a fanoušci ${team.name}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-3">
                  <span className="text-xs font-heading font-extrabold text-white flex items-center gap-1.5 drop-shadow">
                    <span>🔥</span>
                    <span>Domácí kotel & Tribuna</span>
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <div className="font-heading font-bold text-sm">Tribuna fanoušků</div>
                <div className="text-xs opacity-60 mt-0.5">Kapacita {team.stadium.capacity || 400} míst k stání i sezení</div>
              </div>
            </div>

            {/* Karta 3: 3D Virtuální prohlídka */}
            <Link
              href={`/tym/${team.id}/stadion`}
              className={`${cardBg} p-4 flex flex-col justify-between group overflow-hidden hover:border-cyan-500/50 transition-all cursor-pointer`}
            >
              <div className="aspect-video rounded-xl bg-gradient-to-br from-cyan-950 via-slate-900 to-blue-950 flex flex-col items-center justify-center text-4xl shadow-inner relative overflow-hidden group-hover:scale-[1.02] transition-transform border border-cyan-500/20">
                <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-30" />
                <span className="relative z-10 text-5xl animate-pulse">🏟️</span>
                <span className="relative z-10 text-[11px] uppercase tracking-widest font-heading font-black text-cyan-300 mt-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/30">
                  Interaktivní 3D model
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="font-heading font-bold text-sm text-cyan-400 group-hover:underline flex items-center gap-1.5">
                    <span>3D Virtuální prohlídka</span>
                    <span>→</span>
                  </div>
                  <div className="text-xs opacity-60 mt-0.5">Prozkoumej tribuny, střídačky a areál ve 3D</div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 font-heading font-bold text-[10px] uppercase">
                  Otevřít 3D
                </span>
              </div>
            </Link>

            {/* Karta 4: Klubový kiosek & bufet */}
            <a
              href="#bufet"
              className={`${cardBg} p-4 flex flex-col justify-between group overflow-hidden hover:border-amber-500/50 transition-all`}
            >
              <div className="aspect-video rounded-xl bg-gradient-to-br from-amber-950 via-amber-900/60 to-black flex flex-col items-center justify-center text-4xl shadow-inner relative overflow-hidden border border-amber-500/20">
                <span className="text-5xl">🍺</span>
                <span className="text-[11px] uppercase tracking-widest font-heading font-black text-amber-300 mt-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/30">
                  Kiosek & Udírna
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="font-heading font-bold text-sm text-amber-400 group-hover:underline flex items-center gap-1.5">
                    <span>Klubové občerstvení</span>
                    <span>↓</span>
                  </div>
                  <div className="text-xs opacity-60 mt-0.5">{concessions.beerName} ({concessions.beerPrice} Kč) & {concessions.sausageName}</div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-heading font-bold text-[10px] uppercase">
                  Ceník
                </span>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ CENÍK OBČERSTVENÍ (KLÚBOVÝ BUFET) ═══ */}
      <section id="bufet" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className={`${cardBg} p-6 sm:p-10 relative overflow-hidden border-2 border-amber-500/30`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-amber-500 mb-1">
                Klubový kiosek & Bufet
              </div>
              <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
                Ceník občerstvení u hřiště
              </h2>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 font-heading font-bold text-xs">
              🍻 Otevřeno během každého zápasu
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between">
              <div>
                <div className="text-3xl mb-1">🍺</div>
                <div className="font-heading font-extrabold text-lg">{concessions.beerName}</div>
                <div className="text-xs opacity-60 mt-0.5">Točené vychlazené pivo 0.5l</div>
              </div>
              <div className="font-heading font-[900] text-3xl text-amber-400 tabular-nums">
                {concessions.beerPrice} Kč
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between">
              <div>
                <div className="text-3xl mb-1">🌭</div>
                <div className="font-heading font-extrabold text-lg">{concessions.sausageName}</div>
                <div className="text-xs opacity-60 mt-0.5">Z udírny, chléb, plnotučná hořčice</div>
              </div>
              <div className="font-heading font-[900] text-3xl text-amber-400 tabular-nums">
                {concessions.sausagePrice} Kč
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-between">
              <div>
                <div className="text-3xl mb-1">🥤</div>
                <div className="font-heading font-extrabold text-lg">{concessions.lemonadeName}</div>
                <div className="text-xs opacity-60 mt-0.5">Tradiční točená limonáda 0.5l</div>
              </div>
              <div className="font-heading font-[900] text-3xl text-amber-400 tabular-nums">
                {concessions.lemonadePrice} Kč
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TISKOVÉ STŘEDISKO & ROZHOVORY ═══ */}
      <section id="rozhovory" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className="mb-6">
          <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
            Media & Tisk
          </div>
          <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
            Pozápasové rozhovory a aktuality
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coach Interviews */}
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg flex items-center gap-2">
              <span>🎙️</span>
              <span>Slova trenéra po zápasech</span>
            </h3>

            {interviews && interviews.length > 0 ? (
              interviews.slice(0, 3).map((itw) => (
                <div key={itw.id} className={`${cardBg} p-5 space-y-3`}>
                  <div className="text-xs uppercase font-heading font-bold text-amber-400">
                    Herní týden {itw.gameWeek}
                  </div>
                  {itw.questions.map((q, i) => (
                    <div key={i} className="text-xs space-y-1">
                      <div className="font-bold opacity-80">Otázka: &ldquo;{q}&rdquo;</div>
                      <div className="italic opacity-90 pl-3 border-l-2 border-amber-500/50">
                        &ldquo;{itw.answers[i] || "Bez komentáře."}&rdquo;
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className={`${cardBg} p-6 text-center opacity-60 text-xs font-heading`}>
                Trenér zatím neposkytl žádné oficiální pozápasové rozhovory.
              </div>
            )}
          </div>

          {/* Club News */}
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg flex items-center gap-2">
              <span>📰</span>
              <span>Aktuality z kabiny</span>
            </h3>

            {news && news.length > 0 ? (
              news.slice(0, 3).map((n) => (
                <div key={n.id} className={`${cardBg} p-5 space-y-2`}>
                  <div className="flex items-center justify-between text-[10px] font-heading opacity-60">
                    <span className="uppercase font-bold">{n.type}</span>
                    <span>{new Date(n.created_at).toLocaleDateString("cs-CZ")}</span>
                  </div>
                  <div className="font-heading font-extrabold text-base">{n.headline}</div>
                  <div className="text-xs opacity-75 line-clamp-2">{n.body}</div>
                </div>
              ))
            ) : (
              <div className={`${cardBg} p-6 text-center opacity-60 text-xs font-heading`}>
                Žádné nové tiskové zprávy.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ KLÚBOVÁ IDENTITA & KULTURA ═══ */}
      <section id="identita" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16">
        <div className="mb-6">
          <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
            Klubová hrdost
          </div>
          <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
            Identita, dresy a tradice
          </h2>
        </div>

        {/* Kits Showroom */}
        <div className={`${cardBg} p-8 mb-8`}>
          <div className="text-center mb-8">
            <div className="text-xs uppercase font-heading font-bold tracking-widest opacity-60">
              Oficiální zápasová sada
            </div>
            <h3 className="text-xl sm:text-2xl font-heading font-[900] mt-1">
              Domácí a hostující dresy
            </h3>
          </div>

          <div className="flex items-end justify-center gap-8 sm:gap-20 flex-wrap">
            {/* Home Kit */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-heading font-bold uppercase tracking-wider opacity-60 mb-3">Domácí</span>
              <JerseyPreview
                primary={team.jersey.homePrimary}
                secondary={team.jersey.homeSecondary}
                pattern={team.jersey.pattern || "solid"}
                size={140}
              />
              <div style={{ marginTop: -8 }}>
                <ShortsPreview
                  color={team.jersey.homeShortsColor || team.jersey.homePrimary}
                  trim={team.jersey.homeSecondary}
                  size={95}
                />
              </div>
              <div style={{ marginTop: -5 }}>
                <SocksPreview
                  color={team.jersey.homeSocksColor || team.jersey.homePrimary}
                  trim={team.jersey.homeSecondary}
                  size={85}
                />
              </div>
            </div>

            {/* Scarf / Badge Spotlight in Center */}
            <div className="flex flex-col items-center order-first sm:order-none max-w-sm">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={120}
              />
              <div className="w-full mt-6">
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as ScarfPattern) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-md"
                />
              </div>
              {team.jersey.sponsor && (
                <div className="mt-4 px-3 py-1 rounded bg-black/20 text-xs font-heading font-bold uppercase tracking-wider">
                  Partner: {team.jersey.sponsor}
                </div>
              )}
            </div>

            {/* Away Kit */}
            {(team.jersey.awayPrimary || team.jersey.awaySecondary) && (
              <div className="flex flex-col items-center">
                <span className="text-xs font-heading font-bold uppercase tracking-wider opacity-60 mb-3">Hostující</span>
                <JerseyPreview
                  primary={team.jersey.awayPrimary || team.jersey.homePrimary}
                  secondary={team.jersey.awaySecondary || team.jersey.homeSecondary}
                  pattern={team.jersey.awayPattern || "solid"}
                  size={140}
                />
                <div style={{ marginTop: -8 }}>
                  <ShortsPreview
                    color={team.jersey.awayShortsColor || team.jersey.awayPrimary || team.jersey.homePrimary}
                    trim={team.jersey.awaySecondary || team.jersey.homeSecondary}
                    size={95}
                  />
                </div>
                <div style={{ marginTop: -5 }}>
                  <SocksPreview
                    color={team.jersey.awaySocksColor || team.jersey.awayPrimary || team.jersey.homePrimary}
                    trim={team.jersey.awaySecondary || team.jersey.homeSecondary}
                    size={85}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Anthem, Mascot & Chants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Anthem Player */}
          {team.anthem.url && (
            <div className={`${cardBg} p-6`}>
              <div className="text-xs uppercase font-heading font-bold tracking-wider opacity-60 mb-2">
                Klubová hymna
              </div>
              <h3 className="font-heading font-[900] text-xl mb-3">
                {team.anthem.title || "Oficiální hymna klubu"}
              </h3>
              <audio controls src={team.anthem.url} className="w-full mb-4">
                Váš prohlížeč nepodporuje přehrávání audia.
              </audio>
              {team.anthem.lyrics && (
                <details className="text-xs opacity-75">
                  <summary className="cursor-pointer font-heading font-bold uppercase hover:opacity-100">
                    Zobrazit text hymny
                  </summary>
                  <pre className="mt-2 p-3 bg-black/20 rounded-xl whitespace-pre-wrap font-sans text-xs leading-relaxed max-h-48 overflow-y-auto">
                    {team.anthem.lyrics}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Mascot */}
          {team.mascot.imageUrl && (
            <div className={`${cardBg} p-6 flex items-center gap-5`}>
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-black/20 border border-white/10 shrink-0">
                <img src={team.mascot.imageUrl} alt={team.mascot.name || "Maskot"} className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="text-xs uppercase font-heading font-bold tracking-wider opacity-60">
                  Maskot klubu
                </div>
                <div className="font-heading font-[900] text-xl mt-0.5">
                  {team.mascot.name || "Náš maskot"}
                </div>
                {team.mascot.story && (
                  <p className="text-xs opacity-75 mt-1 italic leading-relaxed">
                    &ldquo;{team.mascot.story}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Founding Story & History */}
        {(team.identity.foundingStory || team.identity.colorsMeaning) && (
          <div className={`${cardBg} p-6 sm:p-8 mt-6`}>
            <h3 className="font-heading font-[900] text-xl mb-4">Příběh a historie klubu</h3>
            {team.identity.foundingStory && (
              <p className="text-sm leading-relaxed opacity-85 whitespace-pre-line">
                {team.identity.foundingStory}
              </p>
            )}
            {team.identity.colorsMeaning && (
              <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 text-xs italic opacity-75">
                <span className="font-bold">Význam klubových barev:</span> {team.identity.colorsMeaning}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-20 pt-8 border-t border-black/10 dark:border-white/10 text-xs opacity-75 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          Oficiální web fotbalového klubu {team.name} · Běží na platformě <Link href="/" className="font-bold underline">Prales</Link>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBackToGame}
            className="hover:underline font-heading font-bold text-emerald-400 flex items-center gap-1 cursor-pointer"
          >
            <span>←</span>
            <span>Zpět do hry</span>
          </button>
          <span>·</span>
          <Link href={`/tym/${team.id}`} className="hover:underline font-heading font-bold">
            Zobrazit profil v aplikaci →
          </Link>
        </div>
      </footer>

      {/* Ticket Modal */}
      <TicketModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        teamName={team.name}
        adultPrice={tickets.adultPrice}
        childPrice={tickets.childPrice}
        seasonPassPrice={tickets.seasonPassPrice}
        stadiumName={team.stadium.name}
        primaryColor={primary}
      />
    </div>
  );
}
