"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ClubWebsiteData,
  ClubWebsiteTemplate,
  ClubWebsiteMatchSummary,
} from "@okresni-masina/shared";
import { ShareButton } from "./ShareButton";
import { TicketModal } from "./TicketModal";
import { MatchHighlightsModal } from "./MatchHighlightsModal";

import { Retro2004Template } from "./templates/Retro2004Template";
import { VillagePatriotTemplate } from "./templates/VillagePatriotTemplate";
import { RegionalStandardTemplate } from "./templates/RegionalStandardTemplate";
import { ProfiLeagueTemplate } from "./templates/ProfiLeagueTemplate";
import { ChampionsTemplate } from "./templates/ChampionsTemplate";
import type { TemplateProps } from "./templates/types";

interface ClubWebsiteClientProps {
  data: ClubWebsiteData;
  siteUrl: string;
}

export function ClubWebsiteClient({ data, siteUrl }: ClubWebsiteClientProps) {
  const router = useRouter();
  const { team, website, matches, tickets } = data;
  const template = (website.template || "retro_2004") as ClubWebsiteTemplate;

  const unlockedAddons = website.unlockedAddons || [];
  const hasSponsorBanner = !!(website.sponsorBannerEnabled || unlockedAddons.includes("sponsor_banner"));
  const hasAudioModule = unlockedAddons.includes("audio_module");
  const hasStadiumGallery = unlockedAddons.includes("stadium_gallery");
  const hasPressOfficer = unlockedAddons.includes("press_officer");

  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; title: string; desc: string } | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isHighlightsOpen, setIsHighlightsOpen] = useState(false);
  const [selectedHighlightMatch, setSelectedHighlightMatch] = useState<ClubWebsiteMatchSummary | null>(matches.lastMatch);

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

  const primary = team.primaryColor || "#2D5F2D";
  const secondary = team.secondaryColor || "#FFFFFF";
  const shareUrl = `${siteUrl}/klub/${website.customSlug || team.id}`;

  const templateProps: TemplateProps = {
    data,
    siteUrl,
    unlockedAddons,
    hasSponsorBanner,
    hasAudioModule,
    hasStadiumGallery,
    hasPressOfficer,
    onOpenTickets: () => setIsTicketModalOpen(true),
    onOpenHighlights: (match) => {
      setSelectedHighlightMatch(match || matches.lastMatch);
      setIsHighlightsOpen(true);
    },
    onOpenLightbox: (photo) => setLightboxPhoto(photo),
    onBackToGame: handleBackToGame,
  };

  return (
    <div className="min-h-screen">
      {/* ═══ TOP UTILITY BAR (PWA & RETURN NAVIGATION) ═══ */}
      <div className="bg-[#0b0f17] text-slate-300 border-b border-white/10 px-3 sm:px-6 py-2 text-xs flex items-center justify-between sticky top-0 z-50 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBackToGame}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-heading font-black text-xs uppercase tracking-wider shadow transition cursor-pointer"
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
          <ShareButton
            url={shareUrl}
            title={team.name}
            textClass="text-slate-200 hover:text-white"
            bgClass="bg-white/10 hover:bg-white/20 border border-white/20"
          />
          <Link
            href="/muj-klub"
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-heading font-bold text-xs transition px-2.5 py-1 rounded-lg border border-amber-400/30 hover:bg-amber-400/10"
          >
            <span>⚙️</span>
            <span className="hidden xs:inline">Správa webu</span>
          </Link>
        </div>
      </div>

      {/* ═══ TEMPLATE ROUTER ═══ */}
      {template === "retro_2004" && <Retro2004Template {...templateProps} />}
      {template === "village_patriot" && <VillagePatriotTemplate {...templateProps} />}
      {template === "regional_standard" && <RegionalStandardTemplate {...templateProps} />}
      {template === "profi_league" && <ProfiLeagueTemplate {...templateProps} />}
      {template === "champions" && <ChampionsTemplate {...templateProps} />}

      {/* Fallback if template is unrecognized */}
      {!["retro_2004", "village_patriot", "regional_standard", "profi_league", "champions"].includes(template) && (
        <Retro2004Template {...templateProps} />
      )}

      {/* ═══ SHARED MODALS ═══ */}
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
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-bold transition cursor-pointer"
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
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-heading font-bold cursor-pointer"
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
