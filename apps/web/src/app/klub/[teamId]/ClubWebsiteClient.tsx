"use client";

import { useState, useEffect, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ClubWebsiteData,
  ClubWebsiteTemplate,
  ClubWebsiteMatchSummary,
} from "@okresni-masina/shared";
import { apiFetch } from "@/lib/api";
import { ShareButton } from "./ShareButton";
import { TicketModal } from "./TicketModal";
import { MatchHighlightsModal } from "./MatchHighlightsModal";

import { Retro2004Template } from "./templates/Retro2004Template";
import { VillagePatriotTemplate } from "./templates/VillagePatriotTemplate";
import { RegionalStandardTemplate } from "./templates/RegionalStandardTemplate";
import { ProfiLeagueTemplate } from "./templates/ProfiLeagueTemplate";
import { ChampionsTemplate } from "./templates/ChampionsTemplate";
import type { TemplateProps } from "./templates/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** Registr šablon: nová šablona = jeden řádek tady, žádný seznam ID navíc. */
const TEMPLATES: Record<ClubWebsiteTemplate, ComponentType<TemplateProps>> = {
  retro_2004: Retro2004Template,
  village_patriot: VillagePatriotTemplate,
  regional_standard: RegionalStandardTemplate,
  profi_league: ProfiLeagueTemplate,
  champions: ChampionsTemplate,
};

/** Kdo se dívá: anonym ze sdíleného odkazu, hráč jiného klubu, nebo vlastník webu. */
type Viewer = "unknown" | "anonymous" | "player" | "owner";

interface ClubWebsiteClientProps {
  data: ClubWebsiteData;
  siteUrl: string;
}

export function ClubWebsiteClient({ data, siteUrl }: ClubWebsiteClientProps) {
  const router = useRouter();
  const { team, website, matches, tickets } = data;
  const Template = TEMPLATES[website.template] ?? Retro2004Template;

  const unlockedAddons = website.unlockedAddons || [];
  // Lišta jen když je koupená A zapnutá: vypínač v administraci musí něco dělat
  const hasSponsorBanner = unlockedAddons.includes("sponsor_banner") && website.sponsorBannerEnabled;
  const hasAudioModule = unlockedAddons.includes("audio_module");
  const hasPressOfficer = unlockedAddons.includes("press_officer");

  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; title: string; desc: string } | null>(null);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isHighlightsOpen, setIsHighlightsOpen] = useState(false);
  const [selectedHighlightMatch, setSelectedHighlightMatch] = useState<ClubWebsiteMatchSummary | null>(matches.lastMatch);
  const [viewer, setViewer] = useState<Viewer>("unknown");
  const [visitorCount, setVisitorCount] = useState(website.visitorCount);

  // Kdo se dívá: bez tokenu anonym, jinak podle týmu přihlášeného hráče
  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem("om_token");
    } catch (e) {
      console.warn("klubový web: nelze přečíst přihlášení", e);
    }
    if (!token) {
      setViewer("anonymous");
      return;
    }
    let cancelled = false;
    apiFetch<{ teamId: string | null }>("/auth/me")
      .then((me) => {
        if (!cancelled) setViewer(me.teamId === team.id ? "owner" : "player");
      })
      .catch((e) => {
        console.warn("klubový web: ověření přihlášení selhalo", e);
        if (!cancelled) setViewer("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  // Návštěva se počítá v prohlížeči jednou za relaci; vlastník se nepočítá.
  // Serverové vykreslení, náhledy odkazů ani administrace počítadlo nezvedají.
  useEffect(() => {
    if (viewer === "unknown" || viewer === "owner") return;
    const key = `klubweb-navsteva-${team.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (e) {
      console.warn("klubový web: sessionStorage nedostupný, návštěvu počítám", e);
    }
    fetch(`${API}/api/teams/${team.id}/website/visit`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { visitorCount?: number } | null) => {
        if (json?.visitorCount) setVisitorCount(json.visitorCount);
      })
      .catch((e) => console.warn("klubový web: započítání návštěvy selhalo", e));
  }, [viewer, team.id]);

  useEffect(() => {
    if (!lightboxPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxPhoto(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxPhoto]);

  const handleBackToGame = () => {
    // Zpět jen když hráč přišel ze hry; z cizího webu (WhatsApp, Google) do přehledu
    const fromGame = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (fromGame && window.history.length > 1) {
      window.history.back();
    } else {
      router.push("/prehled");
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
    hasPressOfficer,
    onOpenTickets: () => setIsTicketModalOpen(true),
    onOpenHighlights: (match) => {
      setSelectedHighlightMatch(match || matches.lastMatch);
      setIsHighlightsOpen(true);
    },
    onOpenLightbox: (photo) => setLightboxPhoto(photo),
    visitorCount,
    isOwner: viewer === "owner",
  };

  return (
    <div className="min-h-screen">
      {/* ═══ HORNÍ LIŠTA (sdílení a návrat do hry) ═══ */}
      <div className="bg-[#0b0f17] text-slate-300 border-b border-white/10 px-3 sm:px-6 py-2 text-sm flex items-center justify-between gap-2 sticky top-0 z-50 shadow-md backdrop-blur-md min-h-[52px]">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {(viewer === "owner" || viewer === "player") && (
            <button
              type="button"
              onClick={handleBackToGame}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-heading font-black text-sm uppercase tracking-wide shadow transition cursor-pointer shrink-0"
            >
              <span aria-hidden="true">←</span>
              <span>Do hry</span>
            </button>
          )}
          {viewer === "anonymous" && (
            <Link
              href="/registrace"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-heading font-black text-sm tracking-wide shadow transition shrink-0"
            >
              <span aria-hidden="true">⚽</span>
              <span>Založ si klub</span>
            </Link>
          )}
          <span className="hidden md:inline text-slate-400 text-sm font-medium truncate">
            Oficiální web klubu {team.name}
          </span>
        </div>

        {viewer === "owner" && unlockedAddons.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 text-sm text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
            <span className="text-amber-400 font-heading font-bold">Aktivní doplňky:</span>
            <span className="text-slate-300">
              {[
                hasSponsorBanner && "Partneři",
                hasPressOfficer && "Tisk",
                hasAudioModule && "Audio",
              ].filter(Boolean).join(" · ") || "žádné zapnuté"}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ShareButton
            url={shareUrl}
            title={team.name}
            textClass="text-slate-200 hover:text-white"
            bgClass="bg-white/10 hover:bg-white/20 border border-white/20"
          />
          {viewer === "owner" && (
            <Link
              href="/muj-klub"
              aria-label="Správa webu"
              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-heading font-bold text-sm transition px-2.5 py-1 rounded-lg border border-amber-400/30 hover:bg-amber-400/10"
            >
              <span aria-hidden="true">⚙️</span>
              <span className="hidden sm:inline">Správa webu</span>
            </Link>
          )}
        </div>
      </div>

      <Template {...templateProps} />

      {/* ═══ SPOLEČNÁ OKNA ═══ */}
      <TicketModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        teamName={team.name}
        adultPrice={tickets.adultPrice}
        stadiumName={team.stadium.name}
        primaryColor={primary}
        parkingLevel={team.stadium.facilities?.parking ?? 0}
      />

      <MatchHighlightsModal
        isOpen={isHighlightsOpen}
        onClose={() => setIsHighlightsOpen(false)}
        initialMatch={selectedHighlightMatch || matches.lastMatch}
        recentMatches={matches.recentMatches || (matches.lastMatch ? [matches.lastMatch] : [])}
        teamName={team.name}
        primaryColor={primary}
        secondaryColor={secondary}
      />

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lightboxPhoto.title}
            className="relative max-w-4xl w-full bg-slate-900 border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10 bg-black/40">
              <div className="min-w-0">
                <h3 className="font-heading font-extrabold text-base sm:text-lg text-white">
                  {lightboxPhoto.title}
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">{lightboxPhoto.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="w-9 h-9 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-bold transition cursor-pointer"
                title="Zavřít (Esc)"
                aria-label="Zavřít"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full bg-black flex items-center justify-center overflow-hidden">
              <img
                src={lightboxPhoto.src}
                alt={lightboxPhoto.title}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="p-3 bg-black/40 border-t border-white/10 text-sm text-slate-400 flex items-center justify-between gap-3">
              <span className="truncate">{team.stadium.name || team.name} · {team.village.name}</span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-sm font-heading font-bold cursor-pointer"
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
