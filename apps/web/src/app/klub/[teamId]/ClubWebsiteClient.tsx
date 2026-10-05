"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ClubWebsiteData,
  ClubWebsiteTemplate,
  ClubWebsiteTransfer,
  ClubWebsiteMatchSummary,
  ClubWebsitePlayer,
} from "@okresni-masina/shared";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf, type ScarfPattern } from "@/components/team/club-scarf";
import { apiFetch } from "@/lib/api";
import { ShareButton } from "./ShareButton";
import { ManagerFace } from "./ManagerFace";
import { TicketModal } from "./TicketModal";
import { TacticalPitch } from "./TacticalPitch";
import { MatchHighlightsModal } from "./MatchHighlightsModal";
import { StadiumPhotoCard } from "./StadiumPhotoCard";
import { ClubAudioPlayer } from "./ClubAudioPlayer";

const PITCH_LABELS: Record<string, string> = {
  natural: "Přírodní tráva",
  artificial: "Umělý trávník",
  hybrid: "Hybridní trávník",
  hlinak: "Škvára / hlína",
  trava: "Přírodní tráva",
  umelka: "Umělý trávník",
};

function formatPitchType(pitchType?: string | null): string {
  if (!pitchType) return "Přírodní tráva";
  return PITCH_LABELS[pitchType.toLowerCase()] || pitchType;
}

const STAFF_ROLE_LABELS: Record<string, string> = {
  asistent: "Asistent trenéra",
  trener_mladeze: "Trenér mládeže",
  trener_brankaru: "Trenér brankářů",
  kondicni_trener: "Kondiční trenér",
  maser: "Masér týmu",
  lekar: "Klubový lékař",
  psycholog: "Sportovní psycholog",
  spravce_hriste: "Správce areálu",
  skaut: "Klubový skaut",
  obsluha: "Obsluha kiosku",
  sef_fanklubu: "Šéf fanklubu",
  ekonom: "Klubový hospodář",
};

type PositionCategory = "all" | "GK" | "DEF" | "MID" | "FWD";

const POSITION_ORDER: Record<string, number> = {
  GK: 1,
  BRA: 1,
  DEF: 2,
  OBR: 2,
  CB: 2,
  LB: 2,
  RB: 2,
  LWB: 2,
  RWB: 2,
  MID: 3,
  ZAL: 3,
  ZÁL: 3,
  CM: 3,
  LM: 3,
  RM: 3,
  CDM: 3,
  CAM: 3,
  DM: 3,
  AM: 3,
  FWD: 4,
  UTO: 4,
  ÚTO: 4,
  ST: 4,
  CF: 4,
  LW: 4,
  RW: 4,
};

const POSITION_LABELS_CZ: Record<string, string> = {
  GK: "Brankář",
  BRA: "Brankář",
  DEF: "Obránce",
  OBR: "Obránce",
  CB: "Stoper",
  LB: "Levý obránce",
  RB: "Pravý obránce",
  LWB: "Krajní obránce",
  RWB: "Krajní obránce",
  MID: "Záložník",
  ZAL: "Záložník",
  ZÁL: "Záložník",
  CM: "Záložník",
  LM: "Levý záložník",
  RM: "Pravý záložník",
  CDM: "Def. záložník",
  CAM: "Of. záložník",
  DM: "Def. záložník",
  AM: "Of. záložník",
  FWD: "Útočník",
  UTO: "Útočník",
  ÚTO: "Útočník",
  ST: "Útočník",
  CF: "Útočník",
  LW: "Levé křídlo",
  RW: "Pravé křídlo",
};

function getPlayerPositionGroup(pos?: string): "GK" | "DEF" | "MID" | "FWD" {
  const p = (pos || "").toUpperCase();
  if (p === "GK" || p === "BRA") return "GK";
  if (["DEF", "OBR", "CB", "LB", "RB", "LWB", "RWB", "SW"].includes(p)) return "DEF";
  if (["MID", "ZAL", "ZÁL", "CM", "LM", "RM", "CDM", "CAM", "DM", "AM"].includes(p)) return "MID";
  if (["FWD", "UTO", "ÚTO", "ST", "CF", "LW", "RW"].includes(p)) return "FWD";
  return "MID";
}

function getPlayerPositionLabel(player: ClubWebsitePlayer): string {
  if (player.positionName) return player.positionName;
  const p = (player.position || "").toUpperCase();
  return POSITION_LABELS_CZ[p] || player.position || "Hráč";
}

const POSITION_SECTIONS: Array<{ group: "GK" | "DEF" | "MID" | "FWD"; title: string }> = [
  { group: "GK", title: "Brankáři" },
  { group: "DEF", title: "Obránci" },
  { group: "MID", title: "Záložníci" },
  { group: "FWD", title: "Útočníci" },
];

interface ClubWebsiteClientProps {
  data: ClubWebsiteData;
  siteUrl: string;
}

export function ClubWebsiteClient({ data, siteUrl }: ClubWebsiteClientProps) {
  const router = useRouter();
  const { team, website, manager, staff, roster, matches, concessions, tickets, interviews, news } = data;
  const template = (website.template || "retro_2004") as ClubWebsiteTemplate;

  const unlockedAddons = website.unlockedAddons || [];
  const hasSponsorBanner = !!(website.sponsorBannerEnabled || unlockedAddons.includes("sponsor_banner"));
  const hasAudioModule = unlockedAddons.includes("audio_module");
  const hasStadiumGallery = unlockedAddons.includes("stadium_gallery");
  const hasPressOfficer = unlockedAddons.includes("press_officer");

  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; title: string; desc: string } | null>(null);

  const [isPlayer, setIsPlayer] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsPlayer(!!localStorage.getItem("om_token"));
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxPhoto(null);
      }
    };
    if (lightboxPhoto) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [lightboxPhoto]);

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
  const [isHighlightsOpen, setIsHighlightsOpen] = useState(false);
  const [selectedHighlightMatch, setSelectedHighlightMatch] = useState<ClubWebsiteMatchSummary | null>(matches.lastMatch);

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

  const [positionFilter, setPositionFilter] = useState<PositionCategory>("all");

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;
  const hasU21 = roster.u21Team && roster.u21Team.length > 0;

  const positionCounts = useMemo(() => {
    const counts = { all: currentRoster.length, GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of currentRoster) {
      const group = getPlayerPositionGroup(p.position);
      counts[group] = (counts[group] || 0) + 1;
    }
    return counts;
  }, [currentRoster]);

  const sortedRoster = useMemo(() => {
    return [...currentRoster].sort((a, b) => {
      const orderA = POSITION_ORDER[a.position?.toUpperCase()] ?? POSITION_ORDER[getPlayerPositionGroup(a.position)] ?? 5;
      const orderB = POSITION_ORDER[b.position?.toUpperCase()] ?? POSITION_ORDER[getPlayerPositionGroup(b.position)] ?? 5;
      if (orderA !== orderB) return orderA - orderB;
      const numA = a.squadNumber === null || a.squadNumber === 0 ? 999 : a.squadNumber;
      const numB = b.squadNumber === null || b.squadNumber === 0 ? 999 : b.squadNumber;
      if (numA !== numB) return numA - numB;
      return (b.overallRating ?? 0) - (a.overallRating ?? 0);
    });
  }, [currentRoster]);

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

        {unlockedAddons.length > 0 && (
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
            <span className="text-amber-400 font-heading font-bold">✨ Aktivní doplňky:</span>
            <div className="flex items-center gap-1.5 text-slate-300">
              {hasSponsorBanner && <span title="Sponzorský banner aktivní">Partneři</span>}
              {hasSponsorBanner && (hasPressOfficer || hasAudioModule || hasStadiumGallery) && <span>·</span>}
              {hasPressOfficer && <span title="Tiskový mluvčí aktivní">Tisk</span>}
              {hasPressOfficer && (hasAudioModule || hasStadiumGallery) && <span>·</span>}
              {hasAudioModule && <span title="Audio přehrávač aktivní">Audio</span>}
              {hasAudioModule && hasStadiumGallery && <span>·</span>}
              {hasStadiumGallery && <span title="Fotogalerie areálu aktivní">Fotogalerie</span>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/muj-klub"
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-heading font-bold text-xs transition px-2 py-1 rounded hover:bg-white/5"
          >
            <span>⚙️</span>
            <span className="hidden xs:inline">Správa webu</span>
          </Link>
        </div>
      </div>

      {/* ═══ SPONSOR BANNER ADDON (Top Bar) ═══ */}
      {hasSponsorBanner && (
        <div className="bg-[#10141e] border-b border-amber-500/30 text-slate-200 py-2.5 px-4 text-xs font-heading tracking-wide shadow-sm flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
          <span className="font-black text-amber-400 uppercase text-[11px] flex items-center gap-1">
            <span>🤝</span>
            <span>Oficiální partneři klubu:</span>
          </span>
          <span className="text-slate-200 font-bold flex items-center gap-2">
            <span>Pivovar Kocour</span>
            <span className="opacity-40">·</span>
            <span>Lesní správa a.s.</span>
            <span className="opacity-40">·</span>
            <span>Truhlářství Novák</span>
          </span>
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-widest uppercase">
            Partnerství
          </span>
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
          <a href="#kadr" className="hover:underline shrink-0">👥 Kádr</a>
          <a href="#prestupy" className="hover:underline shrink-0">🔄 Přestupy</a>
          <a href="#realizak" className="hover:underline shrink-0">👔 Realizační tým</a>
          <a href="#stadion" className="hover:underline shrink-0">🏟️ Stadion</a>
          {hasAudioModule && <a href="#audio" className="hover:underline shrink-0 text-amber-400">🎵 Audio</a>}
          <a href="#bufet" className="hover:underline shrink-0">🍺 Občerstvení</a>
          <a href="#rozhovory" className="hover:underline shrink-0">🎙️ Rozhovory</a>
          <a href="#identita" className="hover:underline shrink-0">🎨 Klubová kultura</a>
        </div>
      </header>

      {/* ═══ OFFICIAL PINNED ANNOUNCEMENT (PRESS OFFICER ADDON) ═══ */}
      {(hasPressOfficer || website.announcement) && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 mt-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-black/10 dark:bg-white/5 border border-black/15 dark:border-white/10 text-current flex items-start gap-4 shadow-sm">
            <span className="text-2xl sm:text-3xl shrink-0 mt-0.5">📢</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs uppercase tracking-widest font-heading font-extrabold opacity-75">
                  Oficiální prohlášení vedení klubu
                </span>
                {hasPressOfficer && (
                  <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Tiskový mluvčí
                  </span>
                )}
              </div>
              <div className="text-sm sm:text-base italic leading-relaxed whitespace-pre-line font-medium opacity-90">
                &ldquo;{website.announcement || `Vedení klubu ${team.name} vítá všechny fanoušky, partnery a soupeře na oficiálních stránkách v probíhající sezóně. Tým poctivě trénuje, bufet u hřiště je zásoben a těšíme se na vaši podporu v nadcházejících mistrovských zápasech!`}&rdquo;
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
                  <div className="opacity-60 text-[10px] uppercase">Hrací plocha</div>
                  <div className="font-bold mt-0.5 flex items-center gap-1.5">
                    <span>🌱</span>
                    <span>{formatPitchType(team.stadium.pitchType)}</span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="opacity-60 text-[10px] uppercase">Zápasový den</div>
                  <div className="font-bold mt-0.5">☀️ {matches.nextMatch?.round ? `${matches.nextMatch.round}. kolo soutěže` : "Mistrovské utkání"}</div>
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
                  {/* Scoreboard Box: Full team names and non-wrapping scores */}
                  <div className="my-2 p-3 sm:p-4 rounded-2xl bg-black/15 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-2.5">
                    {/* Home team row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-heading font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/20 dark:bg-white/10 opacity-70 shrink-0">
                          {matches.lastMatch.isHome ? "DOMA" : "VENKU"}
                        </span>
                        <span
                          className={`font-heading font-extrabold text-sm sm:text-base leading-tight break-words ${
                            matches.lastMatch.scoreHome > matches.lastMatch.scoreAway
                              ? "text-emerald-400 font-black"
                              : ""
                          }`}
                        >
                          {matches.lastMatch.isHome ? team.name : matches.lastMatch.opponent.name}
                        </span>
                      </div>
                      <span
                        className={`font-heading font-black text-2xl sm:text-3xl tabular-nums shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-lg bg-black/25 ${
                          matches.lastMatch.scoreHome > matches.lastMatch.scoreAway
                            ? "text-emerald-400"
                            : "text-current/90"
                        }`}
                      >
                        {matches.lastMatch.scoreHome}
                      </span>
                    </div>

                    <div className="border-t border-black/10 dark:border-white/10" />

                    {/* Away team row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-heading font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/20 dark:bg-white/10 opacity-70 shrink-0">
                          {!matches.lastMatch.isHome ? "DOMA" : "VENKU"}
                        </span>
                        <span
                          className={`font-heading font-extrabold text-sm sm:text-base leading-tight break-words ${
                            matches.lastMatch.scoreAway > matches.lastMatch.scoreHome
                              ? "text-emerald-400 font-black"
                              : ""
                          }`}
                        >
                          {matches.lastMatch.isHome ? matches.lastMatch.opponent.name : team.name}
                        </span>
                      </div>
                      <span
                        className={`font-heading font-black text-2xl sm:text-3xl tabular-nums shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-lg bg-black/25 ${
                          matches.lastMatch.scoreAway > matches.lastMatch.scoreHome
                            ? "text-emerald-400"
                            : "text-current/90"
                        }`}
                      >
                        {matches.lastMatch.scoreAway}
                      </span>
                    </div>
                  </div>

                  <div className="text-center text-xs opacity-60 mt-2 font-heading">
                    Kolo {matches.lastMatch.round} · {matches.lastMatch.date ? new Date(matches.lastMatch.date).toLocaleDateString("cs-CZ") : "Odehráno"} · Konečný výsledek
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHighlightMatch(matches.lastMatch);
                      setIsHighlightsOpen(true);
                    }}
                    className="mt-4 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-heading font-extrabold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-95 group"
                  >
                    <span className="text-base group-hover:scale-110 transition-transform">🎥</span>
                    <span>Přehrát záznam zápasu</span>
                  </button>

                  {/* Previous matches quick links */}
                  {matches.recentMatches && matches.recentMatches.length > 1 && (
                    <div className="mt-3 pt-2.5 border-t border-black/10 dark:border-white/10">
                      <div className="text-[10px] font-heading font-bold uppercase opacity-60 mb-1.5">
                        Předchozí odehrané zápasy:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {matches.recentMatches.slice(1).map((rm) => (
                          <button
                            key={rm.id}
                            type="button"
                            onClick={() => {
                              setSelectedHighlightMatch(rm);
                              setIsHighlightsOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-amber-500 hover:text-black text-xs font-heading font-bold transition-colors flex items-center gap-1"
                          >
                            <span>▶ {rm.round ? `${rm.round}. kolo` : "Zápas"}</span>
                            <span className="opacity-75">
                              ({rm.scoreHome}:{rm.scoreAway})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
                  Tým U21 ({roster.u21Team.length})
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
              players={sortedRoster}
              primaryColor={primary}
              secondaryColor={secondary}
            />
          </div>
        ) : (
          /* View Mode: Cards by Position */
          <div className="space-y-6">
            {/* Position filter buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setPositionFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  positionFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold shadow-sm"
                    : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-current/80 border border-black/10 dark:border-white/10"
                }`}
              >
                Všichni ({positionCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter("GK")}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  positionFilter === "GK"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold shadow-sm"
                    : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-current/80 border border-black/10 dark:border-white/10"
                }`}
              >
                Brankáři ({positionCounts.GK})
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter("DEF")}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  positionFilter === "DEF"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold shadow-sm"
                    : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-current/80 border border-black/10 dark:border-white/10"
                }`}
              >
                Obránci ({positionCounts.DEF})
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter("MID")}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  positionFilter === "MID"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold shadow-sm"
                    : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-current/80 border border-black/10 dark:border-white/10"
                }`}
              >
                Záložníci ({positionCounts.MID})
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter("FWD")}
                className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  positionFilter === "FWD"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold shadow-sm"
                    : "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-current/80 border border-black/10 dark:border-white/10"
                }`}
              >
                Útočníci ({positionCounts.FWD})
              </button>
            </div>

            {/* Empty roster check */}
            {sortedRoster.length === 0 ? (
              <div className="p-8 text-center text-white/50 bg-black/20 rounded-2xl border border-white/10">
                Žádní hráči nejsou v kádru k dispozici.
              </div>
            ) : positionFilter === "all" ? (
              /* All positions - grouped into lines (Brankáři, Obránci, Záložníci, Útočníci) */
              <div className="space-y-8">
                {POSITION_SECTIONS.map((section) => {
                  const sectionPlayers = sortedRoster.filter(
                    (p) => getPlayerPositionGroup(p.position) === section.group,
                  );
                  if (sectionPlayers.length === 0) return null;
                  return (
                    <div key={section.group} className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 pb-2">
                        <h3 className="font-heading font-black text-base sm:text-lg tracking-wide uppercase">
                          {section.title}
                        </h3>
                        <span className="text-xs font-heading font-bold opacity-60 bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full">
                          {sectionPlayers.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {sectionPlayers.map((player) => {
                          const posGroup = getPlayerPositionGroup(player.position);
                          const posLabel = getPlayerPositionLabel(player);
                          const isGk = posGroup === "GK";

                          return (
                            <div
                              key={player.id}
                              className={`${cardBg} p-4 flex flex-col justify-between hover:scale-[1.01] transition-transform`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="shrink-0 w-14 h-16 rounded-xl overflow-hidden bg-black/20 border border-white/10 flex items-center justify-center">
                                  <ManagerFace faceConfig={player.avatar} size={52} />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="w-6 h-6 rounded bg-black/10 dark:bg-white/10 text-current/85 font-heading font-black text-[11px] flex items-center justify-center shrink-0 border border-black/5 dark:border-white/10">
                                      {player.squadNumber ?? "-"}
                                    </span>
                                    <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-black/5 dark:bg-white/10 text-current/80 border border-black/10 dark:border-white/10">
                                      {posLabel}
                                    </span>
                                  </div>
                                  <div className="font-heading font-extrabold text-sm sm:text-base mt-1.5 leading-tight truncate">
                                    {player.firstName} {player.lastName}
                                  </div>
                                  <div className="text-xs opacity-60 mt-0.5">
                                    {player.age} let
                                  </div>
                                </div>
                              </div>

                              {/* Season stats pills */}
                              <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-4 gap-1 text-center font-heading">
                                <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                                  <div className="text-[9px] opacity-60">ZÁP</div>
                                  <div className="text-xs font-bold">{player.stats.appearances}</div>
                                </div>
                                <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                                  <div className="text-[9px] opacity-60">{isGk ? "NULY" : "GÓL"}</div>
                                  <div className="text-xs font-bold text-current">
                                    {isGk ? player.stats.cleanSheets : player.stats.goals}
                                  </div>
                                </div>
                                <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                                  <div className="text-[9px] opacity-60">{isGk ? "GÓL" : "ASIS"}</div>
                                  <div className="text-xs font-bold text-current">
                                    {isGk ? player.stats.goals : player.stats.assists}
                                  </div>
                                </div>
                                <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                                  <div className="text-[9px] opacity-60">MIN</div>
                                  <div className="text-xs font-bold">{player.stats.minutesPlayed}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Filtered single position group */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedRoster
                  .filter((p) => getPlayerPositionGroup(p.position) === positionFilter)
                  .map((player) => {
                    const posGroup = getPlayerPositionGroup(player.position);
                    const posLabel = getPlayerPositionLabel(player);
                    const isGk = posGroup === "GK";

                    return (
                      <div
                        key={player.id}
                        className={`${cardBg} p-4 flex flex-col justify-between hover:scale-[1.01] transition-transform`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 w-14 h-16 rounded-xl overflow-hidden bg-black/20 border border-white/10 flex items-center justify-center">
                            <ManagerFace faceConfig={player.avatar} size={52} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-6 h-6 rounded bg-black/10 dark:bg-white/10 text-current/85 font-heading font-black text-[11px] flex items-center justify-center shrink-0 border border-black/5 dark:border-white/10">
                                {player.squadNumber ?? "-"}
                              </span>
                              <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-black/5 dark:bg-white/10 text-current/80 border border-black/10 dark:border-white/10">
                                {posLabel}
                              </span>
                            </div>
                            <div className="font-heading font-extrabold text-sm sm:text-base mt-1.5 leading-tight truncate">
                              {player.firstName} {player.lastName}
                            </div>
                            <div className="text-xs opacity-60 mt-0.5">
                              {player.age} let
                            </div>
                          </div>
                        </div>

                        {/* Season stats pills */}
                        <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-4 gap-1 text-center font-heading">
                          <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                            <div className="text-[9px] opacity-60">ZÁP</div>
                            <div className="text-xs font-bold">{player.stats.appearances}</div>
                          </div>
                          <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                            <div className="text-[9px] opacity-60">{isGk ? "NULY" : "GÓL"}</div>
                            <div className="text-xs font-bold text-current">
                              {isGk ? player.stats.cleanSheets : player.stats.goals}
                            </div>
                          </div>
                          <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                            <div className="text-[9px] opacity-60">{isGk ? "GÓL" : "ASIS"}</div>
                            <div className="text-xs font-bold text-current">
                              {isGk ? player.stats.goals : player.stats.assists}
                            </div>
                          </div>
                          <div className="p-1 rounded bg-black/5 dark:bg-white/5">
                            <div className="text-[9px] opacity-60">MIN</div>
                            <div className="text-xs font-bold">{player.stats.minutesPlayed}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
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
                  <div className="opacity-60 text-[10px]">Pozice</div>
                  <div className="font-bold text-amber-400">Hlavní trenér</div>
                </div>
                <div>
                  <div className="opacity-60 text-[10px]">Působení</div>
                  <div className="font-bold text-emerald-400">A-tým</div>
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
                      {st.profession || (st.role && STAFF_ROLE_LABELS[st.role]) || st.role || "Realizační tým"}
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
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-heading font-bold uppercase tracking-widest opacity-60 mb-1">
              Zázemí & Domov
            </div>
            <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
              Stadion & Klubový areál
            </h2>
            <div className="text-xs sm:text-sm opacity-70 mt-1">
              {team.stadium.name || "Fotbalový stadion"} v obci {team.village.name} ({team.village.district})
            </div>
          </div>
          {hasStadiumGallery && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-heading font-bold text-xs shadow-sm">
              <span>📸</span>
              <span>Odemčená fotogalerie areálu (4 fotografie)</span>
            </div>
          )}
        </div>

        {/* Hlavní fotografie areálu vyrenderovaná ze 3D modelu stadionu */}
        <StadiumPhotoCard
          team={team}
          cardBg={cardBg}
          formatPitchType={formatPitchType}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metadata Card */}
          <div className={`${cardBg} p-6 sm:p-8 flex flex-col justify-between`}>
            <div>
              <div className="text-xs uppercase font-heading font-bold opacity-60 mb-1">
                Parametry hřiště
              </div>
              <h3 className="font-heading font-[900] text-xl sm:text-2xl leading-tight">
                {team.stadium.name || "Místní fotbalové hřiště"}
              </h3>
              {team.stadium.nickname && (
                <div className="text-sm italic opacity-75 mt-1">&ldquo;{team.stadium.nickname}&rdquo;</div>
              )}

              {team.stadium.specialita && (
                <div className="mt-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
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
                    {team.stadium.capacity ? team.stadium.capacity.toLocaleString("cs") : "400"} míst
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Postaveno</span>
                  <div className="font-[900] text-xl tabular-nums mt-0.5">
                    {team.stadium.builtYear || "1972"}
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Hrací plocha</span>
                  <div className="font-bold text-sm mt-0.5">
                    {formatPitchType(team.stadium.pitchType)}
                  </div>
                </div>
                <div>
                  <span className="opacity-60 text-[10px] uppercase">Rozměry hřiště</span>
                  <div className="font-bold text-sm mt-0.5">
                    105 × 68 m
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

              <a
                href="#bufet"
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-heading font-bold text-xs flex items-center justify-center gap-2 transition"
              >
                <span>🍺</span>
                <span>Klubový bufet ({concessions.beerName} {concessions.beerPrice} Kč)</span>
              </a>
            </div>
          </div>

          {/* Reálná fotogalerie areálu (3 až 4 fotografie s lightboxem) */}
          <div className={`lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 ${hasStadiumGallery ? "lg:grid-cols-2" : "lg:grid-cols-3"} gap-4`}>
            {/* Foto 1: Krytá tribuna */}
            <div
              onClick={() =>
                setLightboxPhoto({
                  src: "/images/stadion-tribuna.jpg",
                  title: "Krytá tribuna & Lavičky",
                  desc: "Dřevěná krytá tribuna pro diváky a stání podél klandru při mistrovských zápasech",
                })
              }
              className={`${cardBg} p-3.5 flex flex-col justify-between group overflow-hidden border border-white/10 cursor-pointer hover:border-amber-500/50 transition-all`}
            >
              <div className="aspect-[4/3] rounded-xl relative overflow-hidden shadow-inner bg-slate-900">
                <img
                  src="/images/stadion-tribuna.jpg"
                  alt={`Tribuna a diváci na stadionu ${team.stadium.name || team.name}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-2.5">
                  <span className="text-[11px] font-heading font-extrabold text-white flex items-center gap-1 drop-shadow">
                    <span>🏟️</span>
                    <span>Tribuna & Klandr</span>
                  </span>
                  <span className="text-[10px] font-heading font-bold text-white/80 bg-black/50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    🔍 Zvětšit
                  </span>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="font-heading font-bold text-xs sm:text-sm group-hover:text-amber-400 transition-colors">
                  Krytá tribuna & Lavičky
                </div>
                <div className="text-[11px] opacity-60 mt-0.5 leading-snug">Dřevěná krytá tribuna pro diváky a stání podél klandru</div>
              </div>
            </div>

            {/* Foto 2: Kiosek a hospůdka u hřiště */}
            <div
              onClick={() =>
                setLightboxPhoto({
                  src: "/images/stadion-kiosek.jpg",
                  title: "Kiosek & Udírna",
                  desc: "Točené vychlazené pivo, klobásy z udírny a setkávání fanoušků u hřiště",
                })
              }
              className={`${cardBg} p-3.5 flex flex-col justify-between group overflow-hidden border border-white/10 cursor-pointer hover:border-amber-500/50 transition-all`}
            >
              <div className="aspect-[4/3] rounded-xl relative overflow-hidden shadow-inner bg-slate-900">
                <img
                  src="/images/stadion-kiosek.jpg"
                  alt="Klubový kiosek a občerstvení u hřiště"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-2.5">
                  <span className="text-[11px] font-heading font-extrabold text-amber-300 flex items-center gap-1 drop-shadow">
                    <span>🍺</span>
                    <span>Hospůdka & Kiosek</span>
                  </span>
                  <span className="text-[10px] font-heading font-bold text-white/80 bg-black/50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    🔍 Zvětšit
                  </span>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="font-heading font-bold text-xs sm:text-sm text-amber-400 group-hover:underline">
                  Kiosek & Udírna
                </div>
                <div className="text-[11px] opacity-60 mt-0.5 leading-snug">Točené pivo, klobásy z udírny a setkávání fanoušků</div>
              </div>
            </div>

            {/* Foto 3: Kabiny a zázemí */}
            <div
              onClick={() =>
                setLightboxPhoto({
                  src: "/images/stadion-kabiny.jpg",
                  title: "Šatny a zázemí hráčů",
                  desc: "Kabiny domácích a hostů, sprchy, masérna a zázemí rozhodčích",
                })
              }
              className={`${cardBg} p-3.5 flex flex-col justify-between group overflow-hidden border border-white/10 cursor-pointer hover:border-amber-500/50 transition-all`}
            >
              <div className="aspect-[4/3] rounded-xl relative overflow-hidden shadow-inner bg-slate-900">
                <img
                  src="/images/stadion-kabiny.jpg"
                  alt="Kabiny a šatny FK"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-2.5">
                  <span className="text-[11px] font-heading font-extrabold text-white flex items-center gap-1 drop-shadow">
                    <span>🚪</span>
                    <span>Kabiny & Šatny</span>
                  </span>
                  <span className="text-[10px] font-heading font-bold text-white/80 bg-black/50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    🔍 Zvětšit
                  </span>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="font-heading font-bold text-xs sm:text-sm group-hover:text-amber-400 transition-colors">
                  Šatny a zázemí hráčů
                </div>
                <div className="text-[11px] opacity-60 mt-0.5 leading-snug">Kabiny domácích a hostů, masérna a zázemí rozhodčích</div>
              </div>
            </div>

            {/* Foto 4: Panoráma hřiště a areálu (Odemčeno doplňkem Fotogalerie) */}
            {hasStadiumGallery && (
              <div
                onClick={() =>
                  setLightboxPhoto({
                    src: "/images/stadion-areal.jpg",
                    title: "Panoráma areálu a hřiště",
                    desc: `Celkový pohled na travnaté hřiště a klubový areál týmu ${team.name} v obci ${team.village.name}`,
                  })
                }
                className={`${cardBg} p-3.5 flex flex-col justify-between group overflow-hidden border border-white/10 cursor-pointer hover:border-amber-500/50 transition-all`}
              >
                <div className="aspect-[4/3] rounded-xl relative overflow-hidden shadow-inner bg-slate-900">
                  <img
                    src="/images/stadion-areal.jpg"
                    alt={`Panoráma stadionu ${team.stadium.name || team.name}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-2.5">
                    <span className="text-[11px] font-heading font-extrabold text-emerald-400 flex items-center gap-1 drop-shadow">
                      <span>🌿</span>
                      <span>Panoráma areálu</span>
                    </span>
                    <span className="text-[10px] font-heading font-bold text-white/80 bg-black/50 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      🔍 Zvětšit
                    </span>
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="font-heading font-bold text-xs sm:text-sm text-emerald-400 group-hover:underline">
                    Panoráma areálu & Příroda
                  </div>
                  <div className="text-[11px] opacity-60 mt-0.5 leading-snug">Celkový pohled na fotbalové hřiště a okolní vesnici</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ AUDIO MODUL (ADDON) ═══ */}
      {hasAudioModule && (
        <section id="audio" className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 scroll-mt-14">
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-amber-500 mb-1 flex items-center gap-1.5">
                <span>🎵</span>
                <span>Oficiální audio modul</span>
              </div>
              <h2 className="font-heading font-[900] text-2xl sm:text-4xl">
                Klubová hymna & Zápasové skandování
              </h2>
              <div className="text-xs sm:text-sm opacity-70 mt-1">
                Poslechněte si oficiální skladby, chorály a atmosféru z utkání klubu {team.name}
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-heading font-bold text-xs flex items-center gap-1">
              <span>⭐</span>
              <span>Aktivní audio modul</span>
            </div>
          </div>

          <ClubAudioPlayer
            teamName={team.name}
            anthem={team.anthem}
            chants={team.chants}
          />
        </section>
      )}

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
        stadiumName={team.stadium.name}
        primaryColor={primary}
      />

      {/* Match Highlights Modal */}
      <MatchHighlightsModal
        isOpen={isHighlightsOpen}
        onClose={() => setIsHighlightsOpen(false)}
        initialMatch={selectedHighlightMatch || matches.lastMatch}
        recentMatches={matches.recentMatches || (matches.lastMatch ? [matches.lastMatch] : [])}
        teamName={team.name}
        primaryColor={primary}
        secondaryColor={secondary}
      />

      {/* Stadium Gallery Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
              <div>
                <h3 className="font-heading font-extrabold text-base sm:text-lg text-white">
                  {lightboxPhoto.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{lightboxPhoto.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-bold transition"
                title="Zavřít (ESC)"
              >
                ✕
              </button>
            </div>

            {/* Modal Image */}
            <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full bg-black flex items-center justify-center overflow-hidden">
              <img
                src={lightboxPhoto.src}
                alt={lightboxPhoto.title}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-black/40 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between">
              <span>{team.stadium.name || team.name} · {team.village.name}</span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-heading font-bold"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
