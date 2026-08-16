"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction, showError, type Player } from "@/lib/api";
import { nationalityFlag } from "@/lib/nationality";
import { Spinner, SectionLabel, PositionBadge, useConfirm, BadgePreview, type BadgePattern, Tabs, useTabParam, Sheet, Button } from "@/components/ui";
import { PlayerRevealCard } from "@/components/players/reveal-card";
import { FaceAvatar } from "@/components/players/face-avatar";
import { isLightColor } from "@/lib/team-color";

type Tab = "overview" | "search" | "free_agents" | "market" | "offers" | "squad";
// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["overview", "search", "free_agents", "market", "offers", "squad"] as const;

interface TransfersOverview {
  stats: {
    totalTransfers: number;
    totalValue: number;
    avgFee: number;
    freeAgentSignings: number;
    crossLeagueCount: number;
    crossLeagueAdminTotal: number;
  };
  biggest: Array<{ playerId: string; playerName: string; playerAvatar?: Record<string, unknown>; age?: number; position?: string; fromTeamId: string | null; fromTeam: string | null; fromTeamBadge?: TeamBadge | null; toTeamId: string; toTeam: string; toTeamBadge?: TeamBadge; fee: number; date: string; isCrossLeague: boolean; toVirtual?: boolean }>;
  topSellers: Array<{ teamId: string; teamName: string; badge?: TeamBadge | null; earned: number; count: number }>;
  topBuyers: Array<{ teamId: string; teamName: string; badge?: TeamBadge | null; spent: number; count: number }>;
  mostActive: Array<{ teamId: string; teamName: string; badge?: TeamBadge | null; in: number; out: number; total: number }>;
  recent: Array<{ playerId: string; playerName: string; playerAvatar?: Record<string, unknown>; age?: number; position?: string; fromTeamId: string | null; fromTeam: string | null; fromTeamBadge?: TeamBadge | null; toTeamId: string; toTeam: string; toTeamBadge?: TeamBadge; fee: number; date: string; isCrossLeague: boolean; joinType?: string; toVirtual?: boolean }>;
  speculations?: Array<{
    playerId: string;
    playerName: string;
    playerAvatar?: Record<string, unknown>;
    position: string;
    overallRating: number;
    currentTeamId: string;
    currentTeamName: string;
    currentTeamBadge?: TeamBadge;
    watcherCount: number;
    watcherBadges?: TeamBadge[];
    latestWatchedAt: string;
  }>;
}

interface TeamBadge {
  primary: string;
  secondary: string;
  pattern: string;
  initials: string;
  symbol: string | null;
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }


function relativeTimeCs(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "teď";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} t`;
  const mo = Math.floor(d / 30);
  return `${mo} měs`;
}

// Klubový znak — opravdové kruhové logo
function ClubBadge({ badge, size = 28 }: {
  badge: TeamBadge | null | undefined;
  size?: number;
}) {
  if (!badge) {
    return <span className="inline-block rounded-full bg-gray-200 shrink-0" style={{ width: size, height: size }} aria-hidden />;
  }
  return (
    <span className="inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <BadgePreview
        primary={badge.primary}
        secondary={badge.secondary}
        pattern={badge.pattern as BadgePattern}
        initials={badge.initials}
        symbol={badge.symbol}
        size={size}
      />
    </span>
  );
}

function ClubLink({ teamId, name, badge, href, withBadge = true, bold = true, badgeSize = 24, textSize = "sm" }: {
  teamId: string | null;
  name: string;
  badge?: TeamBadge | null;
  href?: string | null;
  withBadge?: boolean;
  bold?: boolean;
  badgeSize?: number;
  textSize?: "sm" | "md" | "lg";
}) {
  const txt = textSize === "lg" ? "text-base sm:text-lg" : textSize === "md" ? "text-sm sm:text-base" : "text-xs sm:text-sm";
  const w = bold ? "font-heading font-bold" : "font-heading";
  const inner = (
    <>
      {withBadge && <ClubBadge badge={badge} size={badgeSize} />}
      <span className={`${w} text-ink hover:text-pitch-500 transition-colors truncate ${txt}`}>{name}</span>
    </>
  );
  const cls = "inline-flex items-center gap-1.5 min-w-0 max-w-full";
  if (href && teamId) {
    return <Link href={href} className={cls}>{inner}</Link>;
  }
  return <span className={cls}>{inner}</span>;
}

function FancyArrow({ size = "sm" }: { size?: "xs" | "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? { w: 96, h: 32 } : size === "md" ? { w: 64, h: 22 } : size === "xs" ? { w: 28, h: 14 } : { w: 40, h: 18 };
  const id = `arrow-grad-${size}-${Math.random().toString(36).slice(2, 7)}`;
  // tělo šípu: trojúhelníková špička + obdélníkové dříko
  const stem = dim.h * 0.32;          // tloušťka dříku
  const stemY1 = (dim.h - stem) / 2;
  const stemY2 = stemY1 + stem;
  const headStart = dim.w * 0.6;
  return (
    <svg className="shrink-0 drop-shadow-sm" width={dim.w} height={dim.h} viewBox={`0 0 ${dim.w} ${dim.h}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="55%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <path
        d={`M 0 ${stemY1} L ${headStart} ${stemY1} L ${headStart} 2 L ${dim.w - 1} ${dim.h / 2} L ${headStart} ${dim.h - 2} L ${headStart} ${stemY2} L 0 ${stemY2} Z`}
        fill={`url(#${id})`}
        stroke="#14532d"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FreeAgentLabel({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs sm:text-sm";
  return (
    /* whitespace-nowrap: ve stísněném řádku se „Volný hráč" lámalo na dvě řádky
       a celý řádek přestupu tím narostl o 16 px. */
    <span className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap font-heading font-bold italic text-amber-700 ${cls}`}>
      <span aria-hidden>★</span>Volný hráč
    </span>
  );
}

// HERO — #1 nejdražší přestup
function HeroTransfer({ t }: { t: TransfersOverview["biggest"][number] }) {
  const hasAvatar = t.playerAvatar && Object.keys(t.playerAvatar).length > 0;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pitch-50 via-white to-amber-50 border border-pitch-200 shadow-sm">
      {/* Akcentová stuha */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pitch-500 text-white text-micro font-heading font-bold uppercase tracking-wider shadow-sm">
        <span aria-hidden>🏆</span>
        <span>Top přestup</span>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:gap-6 p-4 sm:p-6 pt-12 sm:pt-6">
        {/* Avatar */}
        <div className="shrink-0 self-center sm:self-start">
          {hasAvatar ? (
            <div className="rounded-2xl overflow-hidden bg-white ring-4 ring-white shadow-lg">
              <FaceAvatar faceConfig={t.playerAvatar as Record<string, unknown>} size={120} />
            </div>
          ) : (
            <div className="w-[120px] h-[144px] rounded-2xl bg-gray-100" />
          )}
        </div>

        {/* Pravá strana */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <div>
            <Link href={`/dashboard/player/${t.playerId}`} className="block">
              <h3 className="font-heading font-[800] text-xl sm:text-3xl text-ink hover:text-pitch-500 transition-colors leading-tight truncate">
                {t.playerName}
                {t.isCrossLeague && <span className="ml-2 text-base align-middle" title="Cross-league">🔄</span>}
              </h3>
            </Link>
            {(t.position || t.age) && (
              <div className="flex items-center gap-2 mt-1.5">
                {t.position && <PositionBadge position={t.position} />}
                {t.age ? <span className="text-sm text-muted tabular-nums">{t.age}&nbsp;let</span> : null}
              </div>
            )}
          </div>

          {/* Trasa přestupu */}
          {/* Bez flex-wrap: pri zalomeni zustala sipka viset za prvnim klubem
              a cil skoncil na dalsim radku, takze to necetlo jako trasa.
              Nazvy klubu se radeji orizli. */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {t.fromTeam ? (
              <ClubLink teamId={t.fromTeamId} name={t.fromTeam} badge={t.fromTeamBadge} href={t.fromTeamId ? `/dashboard/team/${t.fromTeamId}` : null} textSize="md" badgeSize={32} />
            ) : (
              <FreeAgentLabel size="md" />
            )}
            <FancyArrow size="lg" />
            <ClubLink teamId={t.toVirtual ? null : t.toTeamId} name={t.toTeam} badge={t.toTeamBadge} href={t.toVirtual ? null : `/dashboard/team/${t.toTeamId}`} textSize="md" badgeSize={32} />
          </div>

          {/* Cena */}
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-heading font-[900] text-3xl sm:text-5xl text-pitch-500 tabular-nums leading-none">
              {t.fee.toLocaleString("cs")}
            </span>
            <span className="font-heading font-bold text-base text-pitch-700">Kč</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Kompaktní karta #2-#5
function MidTransferCard({ rank, t }: { rank: number; t: TransfersOverview["biggest"][number] }) {
  const hasAvatar = t.playerAvatar && Object.keys(t.playerAvatar).length > 0;
  const medal = rank === 2 ? "from-gray-300 to-gray-400 text-gray-900" : rank === 3 ? "from-amber-300 to-amber-500 text-amber-950" : "from-gray-100 to-gray-200 text-gray-600";
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 hover:border-pitch-300 hover:shadow-md transition-all p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {hasAvatar ? (
          <div className="shrink-0 rounded-xl overflow-hidden bg-gray-50 ring-2 ring-white shadow-sm">
            <FaceAvatar faceConfig={t.playerAvatar as Record<string, unknown>} size={56} />
          </div>
        ) : (
          <div className="shrink-0 w-14 h-[67px] rounded-xl bg-gray-100" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link href={`/dashboard/player/${t.playerId}`} className="font-heading font-bold text-sm sm:text-base text-ink hover:text-pitch-500 truncate flex-1 min-w-0">
              {t.playerName}
              {t.isCrossLeague && <span className="ml-1 text-micro">🔄</span>}
            </Link>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-micro font-heading font-bold bg-gradient-to-br ${medal}`}>#{rank}</span>
          </div>
          {(t.position || t.age) && (
            <div className="flex items-center gap-1.5 mb-1.5">
              {t.position && <PositionBadge position={t.position} />}
              {t.age ? <span className="text-micro text-muted tabular-nums">{t.age}&nbsp;let</span> : null}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted mb-2 min-w-0">
            {t.fromTeam ? (
              <ClubLink teamId={t.fromTeamId} name={t.fromTeam} badge={t.fromTeamBadge} href={t.fromTeamId ? `/dashboard/team/${t.fromTeamId}` : null} bold={false} />
            ) : (
              <FreeAgentLabel />
            )}
            <FancyArrow size="sm" />
            <ClubLink teamId={t.toVirtual ? null : t.toTeamId} name={t.toTeam} badge={t.toTeamBadge} href={t.toVirtual ? null : `/dashboard/team/${t.toTeamId}`} bold={false} />
          </div>
          <div className="font-heading font-[800] text-base sm:text-lg text-pitch-500 tabular-nums">
            {t.fee.toLocaleString("cs")} <span className="text-xs text-pitch-700">Kč</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Karta spekulace
function SpeculationCard({ s }: { s: NonNullable<TransfersOverview["speculations"]>[number] }) {
  const hasAvatar = s.playerAvatar && Object.keys(s.playerAvatar).length > 0;
  const hot = s.watcherCount >= 3;
  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-amber-400 hover:shadow-md transition-all p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {hasAvatar ? (
            <div className="rounded-xl overflow-hidden bg-gray-50 ring-2 ring-white shadow-sm">
              <FaceAvatar faceConfig={s.playerAvatar as Record<string, unknown>} size={48} />
            </div>
          ) : (
            <div className="w-12 h-[58px] rounded-xl bg-gray-100" />
          )}
          {hot && <span className="absolute -top-1 -right-1 text-base" title="Hot">🔥</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Link href={`/dashboard/player/${s.playerId}`} className="font-heading font-bold text-sm sm:text-base text-ink hover:text-pitch-500 truncate">
              {s.playerName}
            </Link>
            <span className="shrink-0 text-micro text-muted tabular-nums">{s.position}·{s.overallRating}</span>
          </div>
          <div className="text-xs sm:text-sm text-muted mb-1.5 min-w-0">
            <ClubLink teamId={s.currentTeamId} name={s.currentTeamName} badge={s.currentTeamBadge} href={`/dashboard/team/${s.currentTeamId}`} bold={false} badgeSize={20} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span aria-hidden className="text-micro">👁️</span>
              {(s.watcherBadges && s.watcherBadges.length > 0 ? s.watcherBadges : []).slice(0, 5).map((b, i) => (
                <span key={i} className="relative inline-block" title="Zájem skrytého klubu">
                  <ClubBadge badge={b} size={20} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-heading font-bold flex items-center justify-center ring-1 ring-white">?</span>
                </span>
              ))}
              {s.watcherBadges && s.watcherBadges.length > 5 && (
                <span className="text-micro text-muted font-heading font-bold ml-1">+{s.watcherBadges.length - 5}</span>
              )}
              {(!s.watcherBadges || s.watcherBadges.length === 0) && (
                <span className="text-micro text-amber-800 font-heading font-bold">{s.watcherCount} {s.watcherCount === 1 ? "tým" : s.watcherCount < 5 ? "týmy" : "týmů"}</span>
              )}
            </div>
            <span className="text-micro text-muted shrink-0">{relativeTimeCs(s.latestWatchedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Kompaktní řádek pro Poslední přestupy
function RecentTransferRow({ t }: { t: TransfersOverview["recent"][number] }) {
  const hasAvatar = t.playerAvatar && Object.keys(t.playerAvatar).length > 0;
  return (
    /* items-start, ne items-center: prostřední sloupec je dvouřádkový, takže
       se cena centrovala proti jeho středu a končila 17 px pod jménem —
       vypadalo to, že patří k řádku pod ním. Cena je proto na lince se
       jménem; druhý řádek (odkud → kam) tím dostal celou šířku a názvy
       klubů se ořezávají mnohem míň. */
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-b-0">
      {hasAvatar ? (
        <div className="shrink-0 rounded-soft overflow-hidden bg-gray-50">
          <FaceAvatar faceConfig={t.playerAvatar as Record<string, unknown>} size={32} />
        </div>
      ) : (
        <div className="shrink-0 w-8 h-[38px] rounded-soft bg-gray-100" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href={`/dashboard/player/${t.playerId}`} className="font-heading font-bold text-sm text-ink hover:text-pitch-500 truncate">
            {t.playerName}
          </Link>
          {t.position && <PositionBadge position={t.position} />}
          {t.age ? <span className="text-micro text-muted tabular-nums shrink-0">{t.age}&nbsp;l.</span> : null}
          {t.isCrossLeague && <span className="text-micro shrink-0">🔄</span>}
          <span className="ml-auto shrink-0 font-heading font-bold text-sm text-pitch-500 tabular-nums whitespace-nowrap">
            {t.joinType === "free_agent" ? (
              <span className="text-amber-700">★&nbsp;ZDARMA</span>
            ) : t.fee > 0 ? (
              <>{t.fee.toLocaleString("cs")}&nbsp;<span className="text-micro text-muted">Kč</span></>
            ) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted mt-0.5 min-w-0">
          {t.joinType === "free_agent" || !t.fromTeam ? (
            <FreeAgentLabel />
          ) : (
            <ClubLink teamId={t.fromTeamId} name={t.fromTeam} badge={t.fromTeamBadge} href={t.fromTeamId ? `/dashboard/team/${t.fromTeamId}` : null} bold={false} />
          )}
          <FancyArrow size="xs" />
          <ClubLink teamId={t.toVirtual ? null : t.toTeamId} name={t.toTeam} badge={t.toTeamBadge} href={t.toVirtual ? null : `/dashboard/team/${t.toTeamId}`} bold={false} />
        </div>
      </div>
    </div>
  );
}


/**
 * Filtry hledání přežijí odchod na profil hráče a návrat zpět.
 *
 * Záložka je v adrese (?tab=search), ale filtry byly v useState — po návratu
 * se stránka namountovala znovu a hledání bylo prázdné. sessionStorage stačí:
 * drží to po dobu relace, nešpiní adresu a přežije i obnovení stránky.
 */
const KLIC_HLEDANI = "prales_transfers_search";

/** Kolik hráčů se vypíše najednou. Liga jich má stovky a karta s dovednostmi
 *  není levná — bez stropu se na telefonu scrollovalo po sekundách. */
const VYPIS_MAX = 60;

/** „Zobrazit 1 hráče" / „2 hráče" / „5 hráčů" — ne „1 hráčů". */
function hraciTvar(n: number): string {
  return n >= 1 && n <= 4 ? "hráče" : "hráčů";
}

type UlozeneHledani = {
  query: string; pos: string; sort: string;
  minRating: number; ageMin: number; ageMax: number; leagueId: string;
};

const VYCHOZI_HLEDANI: UlozeneHledani = {
  query: "", pos: "all", sort: "rating", minRating: 0, ageMin: 0, ageMax: 99, leagueId: "",
};

function nactiHledani(): UlozeneHledani {
  if (typeof window === "undefined") return VYCHOZI_HLEDANI;
  try {
    const raw = sessionStorage.getItem(KLIC_HLEDANI);
    return raw ? { ...VYCHOZI_HLEDANI, ...JSON.parse(raw) } : VYCHOZI_HLEDANI;
  } catch (e) {
    console.error("nacteni ulozeneho hledani:", e);
    return VYCHOZI_HLEDANI;
  }
}

function ulozHledani(v: UlozeneHledani) {
  try {
    sessionStorage.setItem(KLIC_HLEDANI, JSON.stringify(v));
  } catch (e) {
    console.error("ulozeni hledani:", e);
  }
}


/**
 * Řádek filtru: krátký popisek vlevo, pilulky vpravo.
 *
 * Popisek musí být — „30+" znamená u ratingu i u věku něco jiného. Je ale
 * úzký (56 px) a pilulky se posouvají do strany, takže se nic nezalomí
 * ani na 375 px. Dřív byly filtry pod sebou v panelu vysokém 780 px
 * a výsledky člověk na telefonu vůbec neviděl.
 */
function FiltrRadek({ popisek, volby, aktivni, vyber }: {
  popisek: string;
  volby: Array<{ k: string; l: string }>;
  aktivni: string;
  vyber: (k: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-micro text-muted font-heading font-bold uppercase tracking-wide">
        {popisek}
      </span>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -my-0.5 py-0.5" role="group" aria-label={popisek}>
        {volby.map(({ k, l }) => (
          <button
            key={k}
            onClick={() => vyber(k)}
            aria-pressed={aktivni === k}
            className={`shrink-0 px-3 min-h-9 rounded-control text-sm font-heading font-bold transition-colors ${
              aktivni === k ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function skillColor(v: number): string {
  if (v >= 70) return "text-pitch-500 font-bold";
  if (v >= 55) return "text-pitch-700";
  if (v >= 40) return "text-ink";
  if (v >= 25) return "text-amber-700";
  return "text-card-red";
}

interface FreeAgent {
  id: string; firstName: string; lastName: string; nickname?: string; nationality?: string; age: number;
  position: string; overallRating: number; weeklyWage: number; occupation: string;
  source: string; villageName: string | null; distanceKm: number | null;
  expiresAt: string; avatar: Record<string, unknown>;
  skills: { speed?: number; technique?: number; shooting?: number; passing?: number; heading?: number; defense?: number; goalkeeping?: number; creativity?: number; setPieces?: number };
  physical: { stamina?: number; strength?: number; preferredFoot?: string };
  personality: { discipline?: number; workRate?: number; leadership?: number; celebrityType?: string; celebrityTier?: string };
  isCelebrity?: boolean;
}

interface MarketListing {
  id: string; playerId: string; askingPrice: number; playerName: string; nationality?: string;
  playerAge: number; position: string; overallRating: number; teamName: string;
  expiresAt: string; avatar: Record<string, unknown>;
  myBidAmount?: number | null;
  myActiveOfferId?: string | null;
  myActiveOfferAmount?: number | null;
  myActiveOfferStatus?: string | null;
}

interface MyListing {
  id: string; playerId: string; askingPrice: number; playerName: string;
  playerAge: number; position: string; overallRating: number; expiresAt: string;
  bids: Array<{ id: string; amount: number; bidderName: string; teamId: string }>;
}

interface PlayerOffer {
  id: string;
  source: "pub" | "youth" | "friend" | "recommendation";
  sourceName: string;
  message: string;
  firstName: string; lastName: string; age: number; position: string;
  overallRating: number; weeklyWage: number; expiresAt: string;
  skills: Record<string, number>;
  physical: Record<string, number>;
  personality: Record<string, unknown>;
  avatar: Record<string, unknown>;
}

interface TransferOffer {
  id: string; player_id: string; offer_amount: number; counter_amount: number | null;
  message: string | null; reject_message: string | null; status: string;
  first_name: string; last_name: string; age: number; position: string; overall_rating: number;
  from_team_name?: string; to_team_name?: string; expires_at: string;
  offer_type?: "transfer" | "loan"; loan_duration?: number | null;
  avatar?: Record<string, unknown>;
  on_turn?: boolean; // true = já jsem na tahu (druhá strana čeká)
  offered_player_id?: string | null;
  offered_first_name?: string | null;
  offered_last_name?: string | null;
  offered_position?: string | null;
  is_virtual?: number; // 1 = nabídka od virtuálního (počítačového) klubu
  player_interest?: number | null; // 0-3 zájem hráče o přestup
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
  const { teamId, primaryColor, gameDate } = useTeam();
  const router = useRouter();
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [overview, setOverview] = useState<TransfersOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Player offers (organické nabídky)
  const [playerOffers, setPlayerOffers] = useState<PlayerOffer[]>([]);
  const [playerOfferLoading, setPlayerOfferLoading] = useState<string | null>(null);

  // Free agents
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  // Market
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  // Offers
  const [incoming, setIncoming] = useState<TransferOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TransferOffer[]>([]);
  const [incomingBids, setIncomingBids] = useState<Array<{ id: string; listing_id: string; amount: number; counter_amount: number | null; status: string; on_turn: boolean; asking_price: number; first_name: string; last_name: string; position: string; age: number; overall_rating: number; buyer_team_name: string; player_id: string; player_avatar?: Record<string, unknown> | string | null }>>([]);
  const [outgoingBids, setOutgoingBids] = useState<Array<{ id: string; listing_id: string; amount: number; counter_amount: number | null; status: string; on_turn: boolean; asking_price: number; first_name: string; last_name: string; position: string; age: number; overall_rating: number; seller_team_name: string; player_id: string; player_avatar?: Record<string, unknown> | string | null }>>([]);
  const [history, setHistory] = useState<Array<TransferOffer & { my_role: "buyer" | "seller"; resolved_at: string | null }>>([]);
  const [offersView, setOffersView] = useState<"active" | "history">("active");
  const [myLeagueId, setMyLeagueId] = useState<string | null>(null);
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
    const [fa, market, offers, squad, poRaw] = await Promise.all([
      apiFetch<{ freeAgents: FreeAgent[] }>(`/api/teams/${teamId}/free-agents`).catch((e) => { console.error("Failed to load free agents:", e); return { freeAgents: [] }; }),
      apiFetch<{ listings: MarketListing[]; myListings: MyListing[] }>(`/api/teams/${teamId}/market`).catch((e) => { console.error("Failed to load market:", e); return { listings: [], myListings: [] }; }),
      apiFetch<{ incoming: TransferOffer[]; outgoing: TransferOffer[]; incomingBids?: typeof incomingBids; outgoingBids?: typeof outgoingBids; history: Array<TransferOffer & { my_role: "buyer" | "seller"; resolved_at: string | null }>; loanedOut: typeof loanedOut; loanedIn: typeof loanedIn; myLeagueId?: string | null }>(`/api/teams/${teamId}/offers`).catch((e) => { console.error("Failed to load offers:", e); return { incoming: [], outgoing: [], incomingBids: [], outgoingBids: [], history: [], loanedOut: [], loanedIn: [] }; }),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`).catch((e) => { console.error("Failed to load players:", e); return []; }),
      apiFetch<PlayerOffer[]>(`/api/teams/${teamId}/player-offers`).catch((e) => { console.error("Failed to load player offers:", e); return []; }),
    ]);
    setFreeAgents(fa.freeAgents);
    setListings(market.listings);
    setMyListings(market.myListings);
    setIncoming(offers.incoming);
    setOutgoing(offers.outgoing);
    setIncomingBids(offers.incomingBids ?? []);
    setOutgoingBids(offers.outgoingBids ?? []);
    setHistory(offers.history ?? []);
    if ((offers as any).myLeagueId) setMyLeagueId((offers as any).myLeagueId);
    setLoanedOut(offers.loanedOut ?? []);
    setLoanedIn(offers.loanedIn ?? []);
    setPlayers(squad);
    setPlayerOffers(Array.isArray(poRaw) ? poRaw : []);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch((e) => { console.error("Failed to load transfers data:", e); setLoading(false); });
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
  // Filtry se pamatují na dobu relace. Bez toho stačilo kliknout na hráče
  // a vrátit se zpět, aby bylo hledání prázdné a muselo se zadat znovu.
  const ulozene = nactiHledani();
  const [searchQuery, setSearchQuery] = useState(ulozene.query);
  const [searchPos, setSearchPos] = useState<string>(ulozene.pos);
  const [searchSort, setSearchSort] = useState<string>(ulozene.sort);
  const [searchMinRating, setSearchMinRating] = useState(ulozene.minRating);
  const [searchAgeMin, setSearchAgeMin] = useState(ulozene.ageMin);
  const [searchAgeMax, setSearchAgeMax] = useState(ulozene.ageMax);
  const [filtrOtevren, setFiltrOtevren] = useState(false);
  const [searchExpandedSkills, setSearchExpandedSkills] = useState<Set<string>>(new Set());

  // League picker for search
  const [searchLeagues, setSearchLeagues] = useState<Array<{ id: string; name: string; team_count: number }>>([]);
  const [searchLeagueId, setSearchLeagueId] = useState<string>(ulozene.leagueId);

  useEffect(() => {
    apiFetch<{ leagues: Array<{ id: string; name: string; team_count: number }> }>("/api/leagues")
      .then((data) => setSearchLeagues(data.leagues))
      .catch((e) => console.error("fetch leagues:", e));
  }, []);

  const loadSearch = async (leagueOverride?: string) => {
    if (!teamId) return;
    const lid = leagueOverride ?? searchLeagueId;
    const url = lid ? `/api/teams/${teamId}/search-players?leagueId=${lid}` : `/api/teams/${teamId}/search-players`;
    const data = await apiFetch<{ players: SearchPlayer[] }>(url).catch((e) => { console.error("Failed to search players:", e); return { players: [] }; });
    setSearchPlayers(data.players);
    setSearchLoaded(true);
  };

  const loadOverview = async () => {
    if (!myLeagueId || overviewLoading) return;
    setOverviewLoading(true);
    const data = await apiFetch<TransfersOverview>(`/api/leagues/${myLeagueId}/transfers-overview`).catch((e) => { console.error("Failed to load transfers overview:", e); return null; });
    setOverview(data);
    setOverviewLoading(false);
  };

  useEffect(() => {
    if (tab === "overview" && myLeagueId && !overview && !overviewLoading) {
      loadOverview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, myLeagueId]);

  // Seznam hráčů se dřív načítal jen při kliknutí na záložku. Kdo se vrátil
  // zpět z profilu hráče, přistál na ?tab=search a zůstal navěky na spinneru.
  useEffect(() => {
    if (tab === "search" && teamId && !searchLoaded) loadSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, teamId, searchLoaded]);

  // Uložit filtry, ať přežijí odchod na profil a návrat
  useEffect(() => {
    ulozHledani({ query: searchQuery, pos: searchPos, sort: searchSort,
      minRating: searchMinRating, ageMin: searchAgeMin, ageMax: searchAgeMax, leagueId: searchLeagueId });
  }, [searchQuery, searchPos, searchSort, searchMinRating, searchAgeMin, searchAgeMax, searchLeagueId]);

  // Rating, věk a pozice jsou vidět nahoře, takže se do počtu na tlačítku
  // nepočítají — to hlásí jen to, co je schované v plachtě.
  const pocetDalsich =
    (searchLeagueId ? 1 : 0) +
    (searchSort !== "rating" ? 1 : 0);

  const filteredSearch = useMemo(() => {
    let list = searchPlayers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q));
    }
    if (searchPos !== "all") list = list.filter(p => p.position === searchPos);
    if (searchMinRating > 0) list = list.filter(p => p.overallRating >= searchMinRating);
    if (searchAgeMin > 0) list = list.filter(p => p.age >= searchAgeMin);
    if (searchAgeMax < 99) list = list.filter(p => p.age <= searchAgeMax);
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
  }, [searchPlayers, searchQuery, searchPos, searchSort, searchMinRating, searchAgeMin, searchAgeMax]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const tabs: [Tab, string, number][] = [
    ["overview", "Přehled", 0],
    ["search", "Hledání", 0],
    ["free_agents", "Volní", 0],
    ["market", "Trh", listings.length],
    ["offers", "Nabídky", incoming.length + playerOffers.length],
    ["squad", "Můj tým", players.filter((p) => (p as any).status === "quit").length],
  ];

  return (
    <div className="page-container space-y-5">
      {confirmDialog}
      {priceDialog && <PriceDialog {...priceDialog} onClose={() => setPriceDialog(null)} />}

      {/* Player reveal overlay */}
      {revealPlayer && (
        <div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/70" onClick={() => setRevealPlayer(null)}>
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
            <div className="mt-3 text-center text-white/80 text-sm">
              Hráč je teď ve tvém kádru.
            </div>
            <Link
              href="/dashboard/squad"
              onClick={() => setRevealPlayer(null)}
              className="block mt-3 w-full py-3 rounded-xl font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 transition-colors text-base text-center"
            >
              Otevřít Kádr →
            </Link>
            <button onClick={() => setRevealPlayer(null)}
              className="w-full mt-2 py-2.5 rounded-xl font-heading text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm">
              Zavřít
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <Tabs
        value={tab}
        onChange={(k) => { setTab(k); if (k === "search") loadSearch(); }}
        ariaLabel="Přestupy"
        items={tabs.map(([key, label, count]) => ({ key, label, count: count || null }))}
      />

      {/* ═══ TAB: Přehled ═══ */}
      {tab === "overview" && (
        <div className="space-y-4">
          {overviewLoading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!overviewLoading && !overview && (
            <div className="card p-8 text-center text-muted">Nepodařilo se načíst přehled</div>
          )}
          {!overviewLoading && overview && overview.stats.totalTransfers === 0 && overview.stats.freeAgentSignings === 0 && (
            <div className="card p-8 text-center">
              <div className="text-3xl mb-2">📭</div>
              <div className="font-heading font-bold text-base mb-1">Zatím žádné přestupy</div>
              <div className="text-sm text-muted">Jakmile se v lize něco stane, uvidíš to tady.</div>
            </div>
          )}
          {!overviewLoading && overview && (overview.stats.totalTransfers > 0 || overview.stats.freeAgentSignings > 0) && (
            <>
              {/* HERO #1 nejdražší přestup */}
              {overview.biggest.length > 0 && <HeroTransfer t={overview.biggest[0]} />}

              {/* Stats — kompaktní pruh pod hero */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="card p-3 text-center">
                  <div className="font-heading font-[800] text-xl sm:text-2xl tabular-nums text-pitch-500">{overview.stats.totalTransfers}</div>
                  <div className="text-micro text-muted uppercase tracking-wide">Přestupů</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="font-heading font-[800] text-base sm:text-xl tabular-nums">{overview.stats.totalValue.toLocaleString("cs")}</div>
                  <div className="text-micro text-muted uppercase tracking-wide">Celkem Kč</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="font-heading font-[800] text-base sm:text-xl tabular-nums">{overview.stats.avgFee.toLocaleString("cs")}</div>
                  <div className="text-micro text-muted uppercase tracking-wide">Průměr Kč</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="font-heading font-[800] text-xl tabular-nums text-amber-600">{overview.stats.freeAgentSignings}</div>
                  <div className="text-micro text-muted uppercase tracking-wide">Volní</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="font-heading font-[800] text-xl tabular-nums">{overview.stats.crossLeagueCount}</div>
                  <div className="text-micro text-muted uppercase tracking-wide">Cross 🔄</div>
                </div>
              </div>

              {/* Top 2-5 nejdražších — grid karet */}
              {overview.biggest.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <SectionLabel>Další přestupy roku</SectionLabel>
                    <span className="text-micro text-muted uppercase tracking-wide">#2 – #{Math.min(overview.biggest.length, 5)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {overview.biggest.slice(1, 5).map((t, i) => (
                      <MidTransferCard key={`${t.playerId}-${t.date}`} rank={i + 2} t={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Poslední přestupy */}
              {overview.recent.length > 0 && (
                <div className="card p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base" aria-hidden>📋</span>
                    <SectionLabel>Poslední přestupy</SectionLabel>
                  </div>
                  <div>
                    {overview.recent.map((t) => (
                      <RecentTransferRow key={`${t.playerId}-${t.date}`} t={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Spekulace */}
              {overview.speculations && overview.speculations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <SectionLabel>Spekulace</SectionLabel>
                    <span className="text-micro sm:text-xs text-muted">Ve hledáčku jiných týmů</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {overview.speculations.slice(0, 4).map((s) => (
                      <SpeculationCard key={s.playerId} s={s} />
                    ))}
                  </div>
                </div>
              )}

              {/* Top sellers + buyers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {overview.topSellers.length > 0 && (
                  <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base" aria-hidden>💰</span>
                      <SectionLabel>Nejvíc vydělali</SectionLabel>
                    </div>
                    <div className="space-y-2.5">
                      {overview.topSellers.map((s, i) => {
                        const max = overview.topSellers[0]?.earned ?? 1;
                        const pct = (s.earned / max) * 100;
                        return (
                          <div key={s.teamId} className="flex items-center gap-2.5">
                            <span className="font-heading font-bold text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                            <ClubBadge badge={s.badge} size={28} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <Link href={`/dashboard/team/${s.teamId}`} className="text-sm font-heading font-bold text-ink hover:text-pitch-500 truncate">
                                  {s.teamName}
                                </Link>
                                <span className="font-heading font-bold text-sm text-pitch-500 tabular-nums shrink-0">{s.earned.toLocaleString("cs")} Kč</span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-pitch-400 to-pitch-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {overview.topBuyers.length > 0 && (
                  <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base" aria-hidden>🛒</span>
                      <SectionLabel>Nejvíc utratili</SectionLabel>
                    </div>
                    <div className="space-y-2.5">
                      {overview.topBuyers.map((b, i) => {
                        const max = overview.topBuyers[0]?.spent ?? 1;
                        const pct = (b.spent / max) * 100;
                        return (
                          <div key={b.teamId} className="flex items-center gap-2.5">
                            <span className="font-heading font-bold text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                            <ClubBadge badge={b.badge} size={28} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <Link href={`/dashboard/team/${b.teamId}`} className="text-sm font-heading font-bold text-ink hover:text-pitch-500 truncate">
                                  {b.teamName}
                                </Link>
                                <span className="font-heading font-bold text-sm text-card-red tabular-nums shrink-0">{b.spent.toLocaleString("cs")} Kč</span>
                              </div>
                              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-amber-400 to-card-red rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Nejaktivnější */}
              {overview.mostActive.length > 0 && (
                <div className="card p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base" aria-hidden>⚡</span>
                    <SectionLabel>Nejaktivnější</SectionLabel>
                  </div>
                  <div className="space-y-2">
                    {overview.mostActive.map((a, i) => (
                      <div key={a.teamId} className="flex items-center gap-2.5 py-1">
                        <span className="font-heading font-bold text-xs text-muted w-4 tabular-nums shrink-0">{i + 1}.</span>
                        <ClubBadge badge={a.badge} size={28} />
                        <Link href={`/dashboard/team/${a.teamId}`} className="text-sm font-heading font-bold text-ink hover:text-pitch-500 truncate flex-1 min-w-0">
                          {a.teamName}
                        </Link>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-xs">
                          <span className="inline-flex items-center gap-0.5 text-pitch-500 font-heading font-bold tabular-nums" title="Příchozí">
                            <span aria-hidden>↓</span>{a.in}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-card-red font-heading font-bold tabular-nums" title="Odchozí">
                            <span aria-hidden>↑</span>{a.out}
                          </span>
                          <span className="font-heading font-[800] text-base tabular-nums w-7 text-right text-ink">{a.total}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ═══ TAB: Hledání ═══ */}
      {tab === "search" && (
        <div className="space-y-3">
          {!searchLoaded && <div className="flex justify-center py-8"><Spinner /></div>}
          {searchLoaded && (
            <>
              {/* Rating a věk jsou při shánění hráče důležitější než jméno,
                  takže jsou nahoře jako pilulky vedle pozice. Jméno zůstává,
                  ale menší. Každý řádek se posouvá do strany, nic se nezalomí. */}
              <div className="flex gap-2">
                <input
                  type="search" placeholder="Jméno hráče nebo týmu…"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Hledat podle jména hráče nebo týmu"
                  className="input flex-1 min-w-0 !py-1.5 !text-sm"
                />
                <button
                  onClick={() => setFiltrOtevren(true)}
                  aria-label="Další filtry"
                  className={`shrink-0 px-3 rounded-control font-heading font-bold text-sm transition-colors ${
                    pocetDalsich > 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"
                  }`}
                >
                  Víc{pocetDalsich > 0 ? ` (${pocetDalsich})` : ""}
                </button>
              </div>

              <div className="card px-3 py-2 space-y-1.5">
                <FiltrRadek
                  popisek="Rating"
                  volby={[
                    { k: "0", l: "Vše" }, { k: "30", l: "30+" }, { k: "50", l: "50+" },
                    { k: "60", l: "60+" }, { k: "70", l: "70+" },
                  ]}
                  aktivni={String(searchMinRating)}
                  vyber={(k) => setSearchMinRating(Number(k))}
                />
                <FiltrRadek
                  popisek="Věk"
                  volby={[
                    { k: "0-99", l: "Vše" }, { k: "16-21", l: "do 21" }, { k: "16-23", l: "16–23" },
                    { k: "24-30", l: "24–30" }, { k: "31-99", l: "31+" },
                  ]}
                  aktivni={`${searchAgeMin}-${searchAgeMax}`}
                  vyber={(k) => { const [a, b] = k.split("-"); setSearchAgeMin(Number(a)); setSearchAgeMax(Number(b)); }}
                />
                <FiltrRadek
                  popisek="Pozice"
                  volby={[
                    { k: "all", l: "Vše" }, { k: "GK", l: "BRA" }, { k: "DEF", l: "OBR" },
                    { k: "MID", l: "ZÁL" }, { k: "FWD", l: "ÚTO" },
                  ]}
                  aktivni={searchPos}
                  vyber={setSearchPos}
                />
              </div>

              <Sheet open={filtrOtevren} onClose={() => setFiltrOtevren(false)} title="Filtry hledání">
                <div className="px-5 pb-5 pt-3 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading font-bold text-lg">Filtry</h2>
                    {(pocetDalsich > 0 || searchPos !== "all" || searchMinRating > 0 || searchAgeMin > 0 || searchAgeMax < 99) && (
                      <button
                        onClick={() => { setSearchPos("all"); setSearchMinRating(0); setSearchAgeMin(0); setSearchAgeMax(99); setSearchQuery(""); setSearchSort("rating"); }}
                        className="text-sm font-heading font-bold text-card-red"
                      >
                        Zrušit vše
                      </button>
                    )}
                  </div>

                  {searchLeagues.length > 1 && (
                    <div>
                      <span className="block text-micro text-muted font-heading font-bold uppercase tracking-wide mb-1.5">Liga</span>
                      <select
                        value={searchLeagueId}
                        onChange={(e) => { setSearchLeagueId(e.target.value); setSearchLoaded(false); setTimeout(() => loadSearch(e.target.value), 50); }}
                        className="select w-full"
                      >
                        <option value="">Moje liga</option>
                        {searchLeagues.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <span className="block text-micro text-muted font-heading font-bold uppercase tracking-wide mb-1.5">Přesný rozsah věku</span>
                    <div className="flex gap-1.5 items-center">
                      <input type="number" value={searchAgeMin || ""} onChange={(e) => setSearchAgeMin(parseInt(e.target.value) || 0)}
                        placeholder="od" min={0} max={60} aria-label="Věk od"
                        className="w-20 px-2 min-h-11 rounded-control border border-line text-sm font-heading tabular-nums text-center" />
                      <span className="text-muted">–</span>
                      <input type="number" value={searchAgeMax < 99 ? searchAgeMax : ""} onChange={(e) => setSearchAgeMax(parseInt(e.target.value) || 99)}
                        placeholder="do" min={0} max={60} aria-label="Věk do"
                        className="w-20 px-2 min-h-11 rounded-control border border-line text-sm font-heading tabular-nums text-center" />
                    </div>
                  </div>

                  <div>
                    <span className="block text-micro text-muted font-heading font-bold uppercase tracking-wide mb-1.5">Řazení</span>
                    <select value={searchSort} onChange={(e) => setSearchSort(e.target.value)} className="select w-full">
                      <option value="rating">Rating (nejlepší)</option>
                      <option value="age">Věk (nejmladší)</option>
                      <option value="wage">Plat (nejnižší)</option>
                      <option value="name">Jméno (A–Z)</option>
                    </select>
                  </div>

                  <Button variant="primary" size="lg" className="w-full" onClick={() => setFiltrOtevren(false)}>
                    Zobrazit {filteredSearch.length} {hraciTvar(filteredSearch.length)}
                  </Button>
                </div>
              </Sheet>
            </>
          )}

          {searchLoaded && (
            <p className="text-xs text-amber-600 italic px-1">⚠ Dovednosti cizích hráčů jsou pouze orientační — přesné hodnoty znáš jen u svého týmu.</p>
          )}

          {/* Výsledky se dřív ukázaly až po nastavení filtru, takže po otevření
              záložky byla obrazovka prázdná s výzvou „zadej něco". Teď je
              seznam vidět hned; delší se ořízne a řekne o tom. */}
          {searchLoaded && (
            <>
              <div className="flex items-baseline justify-between px-1">
                <span className="text-micro text-muted font-heading uppercase tracking-wide">
                  {filteredSearch.length === searchPlayers.length
                    ? `${filteredSearch.length} hráčů`
                    : `${filteredSearch.length} z ${searchPlayers.length} hráčů`}
                </span>
                {filteredSearch.length > VYPIS_MAX && (
                  <span className="text-micro text-muted">zobrazeno prvních {VYPIS_MAX}</span>
                )}
              </div>
              <div className="space-y-2">
                {filteredSearch.slice(0, VYPIS_MAX).map((p) => {
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
                            {nationalityFlag((p as { nationality?: string }).nationality) && <span title={(p as { nationality?: string }).nationality}>{nationalityFlag((p as { nationality?: string }).nationality)}</span>}
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
                  <button onClick={() => { setSearchQuery(""); setSearchPos("all"); setSearchMinRating(0); setSearchAgeMin(0); setSearchAgeMax(99); }} className="ml-2 text-pitch-500 font-heading font-bold hover:underline">Resetovat</button>
                </div>
              )}
            </>
          )}

          {searchLoaded && filteredSearch.length === 0 && (
            <div className="card p-6 text-center text-muted">
              Žádný hráč neodpovídá filtrům. Zkus je zmírnit nebo hledat jiné jméno.
            </div>
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
                      className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${
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
                    className="w-20 px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                  <span className="text-muted text-sm">—</span>
                  <input
                    type="number" min={0} max={99} placeholder="Max"
                    value={filters.ratingMax < 99 ? filters.ratingMax : ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ratingMax: parseInt(e.target.value) || 99 }))}
                    className="w-20 px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
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
                    className="w-20 px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                  />
                  <span className="text-muted text-sm">—</span>
                  <input
                    type="number" min={15} max={50} placeholder="Max"
                    value={filters.ageMax < 50 ? filters.ageMax : ""}
                    onChange={(e) => setFilters((f) => ({ ...f, ageMax: parseInt(e.target.value) || 50 }))}
                    className="w-20 px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
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
                  className="w-32 px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
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
                          className="w-full px-2 py-1.5 rounded-soft border border-gray-200 text-sm font-heading tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
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
                  className="px-3 py-1.5 rounded-soft border border-gray-200 text-sm font-heading focus:outline-none focus:ring-2 focus:ring-pitch-500/30"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <button onClick={resetFilters} className="py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                  Resetovat
                </button>
                {!showPresetInput ? (
                  <button onClick={() => setShowPresetInput(true)} className="py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-pitch-50 text-pitch-600 hover:bg-pitch-100 transition-colors">
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
                      className="px-2 py-1 rounded-soft border border-gray-200 text-sm font-heading focus:outline-none focus:ring-2 focus:ring-pitch-500/30 w-32"
                      autoFocus
                    />
                    <button onClick={handleSavePreset} className="py-1 px-2.5 rounded-soft text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                      OK
                    </button>
                    <button onClick={() => setShowPresetInput(false)} className="py-1 px-2 rounded-soft text-xs font-heading font-bold text-muted hover:bg-gray-100 transition-colors">
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-soft text-xs font-heading font-bold bg-surface text-ink hover:bg-pitch-50 transition-colors group"
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
                <button onClick={resetFilters} className="py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                  Resetovat filtry
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAgents.map((fa) => {
                const isExpanded = expandedSkills.has(fa.id);
                return (
                  <div key={fa.id} className={`card relative p-3 ${fa.isCelebrity ? "ring-2 ring-gold-400 bg-amber-50/30" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      {/* FaceAvatar se vykresluje na výšku size × 1,2. Do 40px
                          kolečka proto patří size 33, ne 40 — jinak se ořízne
                          brada. Stejné pravidlo platí všude, kde je avatar
                          v kolečku s pevnou velikostí. */}
                      <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                        {fa.avatar && Object.keys(fa.avatar).length > 0
                          ? <FaceAvatar faceConfig={fa.avatar} size={33} />
                          : <span className="font-heading font-bold text-sm text-muted">{fa.firstName[0]}{fa.lastName[0]}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap pr-24">
                          <span className="font-heading font-bold text-base">{fa.firstName} {fa.lastName}{nationalityFlag(fa.nationality) && <span className="ml-1" title={fa.nationality}>{nationalityFlag(fa.nationality)}</span>}</span>
                          <PositionBadge position={fa.position as "GK" | "DEF" | "MID" | "FWD"} />
                          {fa.isCelebrity && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-micro font-heading font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                              ⭐ {fa.personality?.celebrityType === "fallen_star" ? "Padlá hvězda" : fa.personality?.celebrityType === "glass_man" ? "Skleněný muž" : "Celebrita"}
                            </span>
                          )}
                          <span className="text-sm text-muted">{fa.age} let</span>
                          <span className="text-sm font-heading font-bold tabular-nums">{fa.overallRating}</span>
                        </div>
                        {/* Údaje na jednom řádku oddělené tečkami. Dřív měly
                            vlastní řádek každý (povolání / mzda / km + obec)
                            a karta kvůli tomu měřila skoro 190 px. */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 text-sm text-muted truncate">
                            {fa.occupation}
                            {" · "}<span className="font-heading font-bold text-ink">{formatCZK(fa.weeklyWage)}/týd</span>
                            {fa.distanceKm !== null && <>{" · "}{fa.distanceKm} km</>}
                            {fa.villageName && <>{" · "}{fa.villageName}</>}
                            {fa.source === "released" && <>{" · "}<span className="text-gold-600">Propuštěn</span></>}
                          </div>
                          {/* Rozbalení dovedností jako šipka — textové tlačítko
                              mělo na dotyku vlastní řádek 44 px navíc. */}
                          <button
                            onClick={() => toggleSkills(fa.id)}
                            aria-label={isExpanded ? "Skrýt dovednosti" : "Zobrazit dovednosti"}
                            aria-expanded={isExpanded}
                            className="shrink-0 min-w-11 min-h-11 -my-2 flex items-center justify-center text-pitch-500 hover:text-pitch-600 transition-colors"
                          >
                            <span aria-hidden="true" className="text-xs">{isExpanded ? "▲" : "▼"}</span>
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-sm tabular-nums">
                            {fa.position === "GK" && (
                              <div>
                                <span className="text-muted font-heading">Bra </span>
                                <span className={skillColor(fa.skills?.goalkeeping ?? 0)}>{fa.skills?.goalkeeping ?? "—"}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted font-heading">Rych </span>
                              <span className={skillColor(fa.skills?.speed ?? 0)}>{fa.skills?.speed ?? "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted font-heading">Tech </span>
                              <span className={skillColor(fa.skills?.technique ?? 0)}>{fa.skills?.technique ?? "—"}</span>
                            </div>
                            {fa.position !== "GK" && (
                              <div>
                                <span className="text-muted font-heading">Stř </span>
                                <span className={skillColor(fa.skills?.shooting ?? 0)}>{fa.skills?.shooting ?? "—"}</span>
                              </div>
                            )}
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
                          let errMessage: string | null = null;
                          const res = await apiFetch<{ success: boolean; decision: { accepted: boolean; probability: number; explanation: string }; player?: Player }>(
                            `/api/teams/${teamId}/free-agents/${fa.id}/sign`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeredWage: fa.weeklyWage }) },
                          ).catch((e: Error) => {
                            console.error("Transfer action failed:", e);
                            errMessage = e.message || "Nepodařilo se podepsat hráče";
                            return null;
                          });
                          if (errMessage) {
                            await confirm({ title: "Chyba", description: errMessage, confirmLabel: "OK" });
                          } else if (res) {
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
                        className="absolute top-3 right-3 px-3 min-h-9 rounded-control text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
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
                {listings.map((l) => {
                  const lAvatar = (() => { try { return typeof l.avatar === "string" ? JSON.parse(l.avatar) : l.avatar; } catch { return null; } })();
                  return (
                  <div key={l.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      {lAvatar && Object.keys(lAvatar).length > 0
                        ? <FaceAvatar faceConfig={lAvatar} size={40} className="rounded-full shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          {(l as any).isAiListing
                            ? <span className="font-heading font-bold">{l.playerName}</span>
                            : <Link href={`/dashboard/player/${l.playerId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">{l.playerName}</Link>
                          }
                          {nationalityFlag(l.nationality) && <span title={l.nationality}>{nationalityFlag(l.nationality)}</span>}
                          <PositionBadge position={l.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">{l.playerAge} let</span>
                          <span className="text-sm font-heading font-bold tabular-nums">{l.overallRating}</span>
                        </div>
                        <div className="text-xs text-muted">
                          <span className="font-heading font-bold text-ink">{formatCZK(l.askingPrice)}</span> — {l.teamName}
                          {(l as any).injuryDays > 0 && (
                            <span className="ml-2 text-card-red font-heading font-bold">🩹 Zraněný ({(l as any).injuryDays}d)</span>
                          )}
                        </div>
                        {(l as any).skills && Object.keys((l as any).skills).length > 0 && (
                          <button onClick={() => toggleSkills(l.id)} className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 transition-colors mt-1">
                            Dovednosti {expandedSkills.has(l.id) ? "▲" : "▼"}
                          </button>
                        )}
                        {expandedSkills.has(l.id) && (l as any).skills && (() => {
                          const s = (l as any).skills as Record<string, number>;
                          const isGK = l.position === "GK";
                          return (
                            <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-sm tabular-nums">
                              {isGK && <div><span className="text-muted font-heading">Bra </span><span className={skillColor(s.goalkeeping ?? 0)}>{s.goalkeeping ?? "—"}</span></div>}
                              <div><span className="text-muted font-heading">Rych </span><span className={skillColor(s.speed ?? 0)}>{s.speed ?? "—"}</span></div>
                              <div><span className="text-muted font-heading">Tech </span><span className={skillColor(s.technique ?? 0)}>{s.technique ?? "—"}</span></div>
                              {!isGK && <div><span className="text-muted font-heading">Stř </span><span className={skillColor(s.shooting ?? 0)}>{s.shooting ?? "—"}</span></div>}
                              <div><span className="text-muted font-heading">Přih </span><span className={skillColor(s.passing ?? 0)}>{s.passing ?? "—"}</span></div>
                              <div><span className="text-muted font-heading">Obr </span><span className={skillColor(s.defense ?? 0)}>{s.defense ?? "—"}</span></div>
                              <div><span className="text-muted font-heading">Výd </span><span className={skillColor(s.stamina ?? 0)}>{s.stamina ?? "—"}</span></div>
                            </div>
                          );
                        })()}
                      </div>
                      {l.myActiveOfferId ? (
                        <Link
                          href={`/dashboard/transfers/offer/${l.myActiveOfferId}`}
                          className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-ink text-white hover:bg-ink/80 transition-colors"
                        >
                          Probíhá jednání{l.myActiveOfferAmount ? ` (${formatCZK(l.myActiveOfferAmount)})` : ""} →
                        </Link>
                      ) : l.myBidAmount ? (
                        <span className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-50 text-pitch-600">
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
                                let res: { ok: boolean; autoAccepted?: boolean; rejected?: boolean; explanation?: string; player?: Player; error?: string; offerId?: string; alreadyExists?: boolean } | null = null;
                                let errorMsg: string | null = null;
                                try {
                                  res = await apiFetch(`/api/teams/${teamId}/market/${l.id}/bid`, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ amount: price }),
                                  });
                                } catch (e: any) {
                                  errorMsg = e?.message ?? String(e);
                                }
                                setPriceDialog(null);
                                if (errorMsg) {
                                  await confirm({ title: "Chyba", description: errorMsg });
                                } else if (res?.rejected) {
                                  await confirm({ title: "Odmítl přestup", description: res.explanation ?? "Hráč nemá zájem." });
                                } else if (res?.autoAccepted && res?.player) {
                                  setRevealPlayer(res.player);
                                } else if (res?.offerId) {
                                  // Lidsky listing -> vytvorena nabidka, otevri jednani
                                  router.push(`/dashboard/transfers/offer/${res.offerId}`);
                                  return;
                                }
                                await refresh();
                              },
                            });
                          }}
                          className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                        >
                          Nabídnout
                        </button>
                      )}
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </div>

          {myListings.length > 0 && (
            <div>
              <SectionLabel>Moje inzerce ({myListings.length})</SectionLabel>
              <div className="space-y-3">
                {myListings.map((l) => {
                  const mlAvatar = (() => { try { const a = (l as any).avatar; return typeof a === "string" ? JSON.parse(a) : a; } catch { return null; } })();
                  return (
                  <div key={l.id} className="card p-4">
                    <div className="flex items-center gap-3 mb-2">
                      {mlAvatar && Object.keys(mlAvatar).length > 0
                        ? <FaceAvatar faceConfig={mlAvatar} size={40} className="rounded-full shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />}
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
                          if (await apiAction(apiFetch(`/api/teams/${teamId}/listings/${l.id}`, { method: "DELETE" }), "Stažení inzerátu se nezdařilo")) await refresh();
                        }}
                        className="shrink-0 py-1 px-3 rounded-soft text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors"
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
                                if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/accept`, { method: "POST" }), "Přijetí nabídky se nezdařilo")) await refresh();
                              }} className="py-1 px-3 rounded-soft text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                                Přijmout
                              </button>
                              <button onClick={async () => {
                                if (!teamId) return;
                                if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/reject`, { method: "POST" }), "Odmítnutí nabídky se nezdařilo")) await refresh();
                              }} className="py-1 px-3 rounded-soft text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                                Odmítnout
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ); })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Nabídky ═══ */}
      {tab === "offers" && (
        <div className="space-y-5">

          {/* ── Toggle Aktivní / Historie ── */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffersView("active")}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "active" ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}
            >
              Aktivní ({incoming.length + outgoing.length + playerOffers.length})
            </button>
            <button
              onClick={() => setOffersView("history")}
              className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "history" ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted hover:bg-gray-200"}`}
            >
              Historie ({history.length})
            </button>
          </div>

          {offersView === "history" && (
            <div>
              <SectionLabel>Historie přestupů</SectionLabel>
              {history.length === 0 ? (
                <div className="card p-6 text-center text-muted">Zatím žádná uzavřená jednání.</div>
              ) : (
                <div className="space-y-2">
                  {history.map((o) => {
                    const statusMap: Record<string, { label: string; color: string }> = {
                      accepted: { label: "Přijato", color: "text-pitch-500" },
                      rejected: { label: "Zamítnuto", color: "text-red-600" },
                      withdrawn: { label: "Staženo", color: "text-muted" },
                      expired: { label: "Vypršelo", color: "text-muted" },
                    };
                    const s = statusMap[o.status] ?? { label: o.status, color: "text-muted" };
                    const amount = o.counter_amount ?? o.offer_amount;
                    const isLoan = o.offer_type === "loan";
                    const otherName = o.my_role === "buyer" ? o.to_team_name : o.from_team_name;
                    const when = o.resolved_at ? new Date(o.resolved_at).toLocaleDateString("cs-CZ") : "";
                    const hAvatar = (() => { try { const raw = (o as any).player_avatar ?? o.avatar; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                    return (
                      <Link key={o.id} href={`/dashboard/transfers/offer/${o.id}`} className="card p-3 flex items-center gap-3 hover:bg-pitch-50 transition-colors">
                        {hAvatar && Object.keys(hAvatar).length > 0
                          ? <FaceAvatar faceConfig={hAvatar} size={36} className="rounded-full shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-heading font-bold text-sm truncate">{o.first_name} {o.last_name}</span>
                            <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                            <span className={`text-xs font-heading font-bold uppercase tracking-wider ${s.color}`}>{s.label}</span>
                          </div>
                          <div className="text-xs text-muted truncate">
                            {o.my_role === "buyer" ? "→" : "←"} {otherName}
                            {" · "}
                            {isLoan ? "Hostování" : "Přestup"}
                            {amount > 0 && ` · ${amount.toLocaleString("cs")} Kč`}
                            {when && ` · ${when}`}
                          </div>
                        </div>
                        <span className="text-xs text-muted shrink-0">›</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {offersView === "active" && <>

          {/* ── Organické nabídky hráčů (skauting) ── */}
          {playerOffers.length > 0 && (
            <div>
              <SectionLabel>Noví zájemci ({playerOffers.length})</SectionLabel>
              <div className="space-y-3">
                {playerOffers.map((o) => {
                  const sourceIcon: Record<string, string> = {
                    pub: "🍺", youth: "🌱", friend: "🤝", recommendation: "🏛️",
                  };
                  const isYouth = o.source === "youth";
                  const hiddenTalent = (o.personality as any)?.hiddenTalent as number | undefined;
                  // expiresAt je v HERNÍM čase (player-offers.ts ho počítá z game_date),
                  // takže odpočet musí běžet proti hernímu datu. Proti reálnému času
                  // ukazoval při posunutých hodinách nesmysly (např. „vyprší za 78 dní").
                  const nowMs = gameDate ? new Date(gameDate).getTime() : Date.now();
                  const daysLeft = Math.max(0, Math.ceil((new Date(o.expiresAt).getTime() - nowMs) / 86400000));
                  return (
                    <div key={o.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        {o.avatar && Object.keys(o.avatar).length > 0
                          ? <FaceAvatar faceConfig={o.avatar} size={44} className="rounded-full shrink-0 mt-0.5" />
                          : <div className="w-11 h-11 rounded-full bg-surface shrink-0 mt-0.5 flex items-center justify-center text-xl">{sourceIcon[o.source] ?? "👤"}</div>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-heading font-bold text-base">{o.firstName} {o.lastName}</span>
                            {nationalityFlag((o as { nationality?: string }).nationality) && <span title={(o as { nationality?: string }).nationality}>{nationalityFlag((o as { nationality?: string }).nationality)}</span>}
                            <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                            <span className="text-sm text-muted">{o.age} let</span>
                            {isYouth && <span className="text-xs bg-pitch-100 text-pitch-700 px-2 py-0.5 rounded-full font-heading font-bold">Dorostenec</span>}
                          </div>
                          <div className="text-xs text-muted mb-1">
                            {sourceIcon[o.source]} <span className="font-heading font-bold text-ink">{o.sourceName}</span>
                          </div>
                          <div className="text-sm italic text-muted mb-2">&ldquo;{o.message}&rdquo;</div>
                          {/* Skills preview */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                            {(() => {
                              const s = o.skills;
                              const pos = o.position;
                              const entries: [string, string][] =
                                pos === "GK" ? [["Bra", "goalkeeping"], ["Síl", "strength"], ["Výd", "stamina"]]
                                : pos === "DEF" ? [["Obr", "defense"], ["Hl", "heading"], ["Rch", "speed"], ["Pas", "passing"]]
                                : pos === "MID" ? [["Pas", "passing"], ["Tch", "technique"], ["Výd", "stamina"], ["Rch", "speed"]]
                                : [["Stř", "shooting"], ["Rch", "speed"], ["Tch", "technique"], ["Hl", "heading"]];
                              return entries.map(([lbl, key]) => (
                                <span key={key} className={`text-xs tabular-nums ${skillColor(s[key] ?? 0)}`}>
                                  {lbl} <span className="font-heading font-bold">{s[key] ?? 0}</span>
                                </span>
                              ));
                            })()}
                            {isYouth && hiddenTalent !== undefined && (
                              <span className="text-xs text-amber-600 font-heading font-bold" title="Skrytý talent — talentovaný hráč roste na tréninku rychleji a má vyšší strop rozvoje">
                                ✨ Talent {hiddenTalent >= 30 ? "vysoký" : hiddenTalent >= 18 ? "střední" : "nízký"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted">
                            Plat: <span className="font-heading font-bold text-ink">{o.weeklyWage} Kč/týden</span>
                            <span className="ml-3">Vyprší za: <span className={daysLeft <= 1 ? "text-card-red font-bold" : ""}>{daysLeft} {daysLeft === 1 ? "den" : daysLeft < 5 ? "dny" : "dní"}</span></span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            disabled={playerOfferLoading === o.id}
                            onClick={async () => {
                              if (!teamId) return;
                              setPlayerOfferLoading(o.id);
                              try {
                                const result = await apiFetch<{ ok: boolean; player: Player }>(`/api/teams/${teamId}/player-offers/${o.id}/accept`, { method: "POST" });
                                if (result.player) setRevealPlayer(result.player);
                                await refresh();
                              } catch (e) {
                                console.error("player offer accept:", e);
                                showError("Přijetí nabídky se nezdařilo", (e as Error)?.message || "Zkus to prosím znovu.");
                              } finally { setPlayerOfferLoading(null); }
                            }}
                            className="py-2 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors disabled:opacity-50">
                            {playerOfferLoading === o.id ? "..." : "Přijmout"}
                          </button>
                          <button
                            disabled={playerOfferLoading === o.id}
                            onClick={async () => {
                              if (!teamId) return;
                              setPlayerOfferLoading(o.id);
                              const ok = await apiAction(apiFetch(`/api/teams/${teamId}/player-offers/${o.id}/reject`, { method: "POST" }), "Odmítnutí nabídky se nezdařilo");
                              if (ok) await refresh();
                              setPlayerOfferLoading(null);
                            }}
                            className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors disabled:opacity-50">
                            Odmítnout
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {incoming.length > 0 && (
            <div>
              <SectionLabel>Příchozí nabídky ({incoming.length})</SectionLabel>
              <div className="space-y-3">
                {incoming.map((o) => {
                  const oAvatar = (() => { try { const raw = (o as any).player_avatar ?? o.avatar; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                  return (
                  <div key={o.id} className="card p-4">
                    <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                      {oAvatar && Object.keys(oAvatar).length > 0
                        ? <FaceAvatar faceConfig={oAvatar} size={40} className="rounded-full shrink-0 mt-0.5" />
                        : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Link href={`/dashboard/player/${o.player_id}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                            {o.first_name} {o.last_name}
                          </Link>
                          <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                        </div>
                        {(() => {
                          const ps = (() => { try { const raw = (o as any).player_skills; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                          if (!ps || Object.keys(ps).length === 0) return null;
                          const blur = (v: number) => Math.round(v / 5) * 5;
                          const pos = o.position;
                          const labels: [string, string][] = pos === "GK" ? [["Bra", "goalkeeping"]] : pos === "DEF" ? [["Obr", "defense"],["Hl", "heading"],["Rch", "speed"]] : pos === "MID" ? [["Pas", "passing"],["Tch", "technique"],["Kre", "creativity"]] : [["Stř", "shooting"],["Rch", "speed"],["Tch", "technique"]];
                          return <div className="flex gap-2 mt-0.5">{labels.map(([lbl, key]) => <span key={key} className={`text-micro tabular-nums ${skillColor(blur(ps[key] ?? 0))}`}>~{lbl} {blur(ps[key] ?? 0)}</span>)}</div>;
                        })()}
                        <div className="text-sm">
                          <span className="font-heading font-bold">{o.from_team_name}</span>
                          {!!o.is_virtual && (
                            <span className="ml-1.5 inline-block align-middle text-micro font-heading font-bold uppercase tracking-wide bg-ink/80 text-white rounded px-1.5 py-0.5">Cizí klub</span>
                          )}
                          <span className="text-muted"> nabízí </span>
                          {o.offer_type === "loan" ? (
                            <span className="text-yellow-600 font-heading font-bold">Hostování{o.loan_duration ? ` (${o.loan_duration} dní)` : ""}{(o.counter_amount ?? o.offer_amount) > 0 ? ` za ${formatCZK(o.counter_amount ?? o.offer_amount)}` : " zdarma"}</span>
                          ) : (
                            <span className="font-heading font-bold text-pitch-500">{formatCZK(o.counter_amount ?? o.offer_amount)}</span>
                          )}
                        </div>
                        {o.offered_player_id && (
                          <div className="mt-1 inline-flex items-center gap-1.5 bg-gold-50 border border-gold-300/60 rounded-full px-2.5 py-0.5 text-xs">
                            <span>⇄</span>
                            <span className="font-heading font-bold text-ink">{o.offered_first_name} {o.offered_last_name}</span>
                            {o.offered_position && <span className="text-muted">({o.offered_position})</span>}
                            <span className="text-muted">na výměnu</span>
                          </div>
                        )}
                        {o.player_interest != null && (
                          <div className="mt-1">
                            <span className={`inline-flex items-center gap-1 rounded-full text-micro font-heading font-bold px-2 py-0.5 ${
                              o.player_interest >= 3 ? "bg-red-50 text-red-700 border border-red-200"
                              : o.player_interest === 2 ? "bg-orange-50 text-orange-700 border border-orange-200"
                              : o.player_interest === 1 ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                              : "bg-gray-100 text-muted"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${o.player_interest >= 3 ? "bg-red-500" : o.player_interest === 2 ? "bg-orange-500" : o.player_interest === 1 ? "bg-yellow-400" : "bg-gray-400"}`} />
                              {o.player_interest >= 3 ? "Velmi chce přestoupit" : o.player_interest === 2 ? "Chce přestoupit" : o.player_interest === 1 ? "Váhá" : "Nechce odejít"}
                            </span>
                          </div>
                        )}
                        {o.message && <div className="text-xs text-muted mt-1 italic">&ldquo;{o.message}&rdquo;</div>}
                        {o.status === "countered" && <div className="text-xs text-gold-600 mt-1">Protinabídka: {formatCZK(o.counter_amount!)}</div>}
                        {o.on_turn === false && <div className="text-xs text-muted mt-1 italic">Čeká se na odpověď soupeře</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 justify-start sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
                        <Link href={`/dashboard/transfers/offer/${o.id}`} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-ink text-white hover:bg-ink/80 transition-colors">
                          Jednání →
                        </Link>
                        {o.on_turn !== false && (<>
                        <button onClick={async () => {
                          const amount = o.counter_amount ?? o.offer_amount;
                          const isCrossLeague = myLeagueId && (o as any).from_league_id && (o as any).from_league_id !== myLeagueId;
                          const adminFee = isCrossLeague ? Math.round(amount * 0.20) : 0;
                          const desc = isCrossLeague
                            ? `Za ${o.first_name} ${o.last_name}\n\nMeziligový přestup — kupující zaplatí navíc administrační poplatek ${formatCZK(adminFee)} (15%)`
                            : `Za ${o.first_name} ${o.last_name}`;
                          const ok = await confirm({ title: `Přijmout ${formatCZK(amount)}?`, description: desc, confirmLabel: "Přijmout" });
                          if (!ok || !teamId) return;
                          if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}/accept`, { method: "POST" }), "Přijetí nabídky se nezdařilo")) await refresh();
                        }} className="py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                          Přijmout
                        </button>
                        {!o.is_virtual && <button onClick={() => {
                          const currentAmount = o.counter_amount ?? o.offer_amount;
                          setPriceDialog({
                            title: `Protinabídka za ${o.first_name} ${o.last_name}`,
                            description: `${o.from_team_name} nabízí ${formatCZK(currentAmount)}. Zadej částku, za kterou jsi ochotný hráče pustit.`,
                            defaultPrice: Math.round(currentAmount * 1.25),
                            onConfirm: async (price) => {
                              if (!teamId) return;
                              const ok = await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}/counter`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ amount: price }),
                              }), "Protinabídka se nezdařila");
                              setPriceDialog(null);
                              if (ok) await refresh();
                            },
                          });
                        }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                          Protinabídka
                        </button>}
                        <button onClick={async () => {
                          if (!teamId) return;
                          if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }), "Odmítnutí nabídky se nezdařilo")) await refresh();
                        }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                          Odmítnout
                        </button>
                        </>)}
                        <button onClick={async () => {
                          if (!teamId) return;
                          const ok = await confirm({ title: "Ukončit jednání?", description: `Jednání o ${o.first_name} ${o.last_name} bude zrušeno.`, confirmLabel: "Ukončit" });
                          if (!ok) return;
                          if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}`, { method: "DELETE" }), "Ukončení jednání se nezdařilo")) await refresh();
                        }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                          Ukončit
                        </button>
                      </div>
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <SectionLabel>Moje nabídky ({outgoing.length})</SectionLabel>
              <div className="space-y-3">
                {outgoing.map((o) => {
                  const oAvatar = (() => { try { const raw = (o as any).player_avatar ?? o.avatar; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                  return (
                  <div key={o.id} className="card p-4">
                    <div className="flex items-start sm:items-center gap-3 flex-wrap sm:flex-nowrap">
                      {oAvatar && Object.keys(oAvatar).length > 0
                        ? <FaceAvatar faceConfig={oAvatar} size={40} className="rounded-full shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-heading font-bold">{o.first_name} {o.last_name}</span>
                          <PositionBadge position={o.position as "GK" | "DEF" | "MID" | "FWD"} />
                          <span className="text-sm text-muted">→ {o.to_team_name}</span>
                        </div>
                        {(() => {
                          const ps = (() => { try { const raw = (o as any).player_skills; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                          if (!ps || Object.keys(ps).length === 0) return null;
                          const blur = (v: number) => Math.round(v / 5) * 5;
                          const pos = o.position;
                          const labels: [string, string][] = pos === "GK" ? [["Bra", "goalkeeping"]] : pos === "DEF" ? [["Obr", "defense"],["Hl", "heading"],["Rch", "speed"]] : pos === "MID" ? [["Pas", "passing"],["Tch", "technique"],["Kre", "creativity"]] : [["Stř", "shooting"],["Rch", "speed"],["Tch", "technique"]];
                          return <div className="flex gap-2 mt-0.5">{labels.map(([lbl, key]) => <span key={key} className={`text-micro tabular-nums ${skillColor(blur(ps[key] ?? 0))}`}>~{lbl} {blur(ps[key] ?? 0)}</span>)}</div>;
                        })()}
                        <div className="text-sm text-muted">
                          {o.offer_type === "loan" ? (
                            <span className="text-yellow-600 font-heading font-bold">Hostování{o.loan_duration ? ` (${o.loan_duration} dní)` : ""}</span>
                          ) : (
                            <>Nabídka: <span className="font-heading font-bold text-ink">{formatCZK(o.offer_amount)}</span></>
                          )}
                          {o.counter_amount && <span className="text-gold-600 ml-2">Protinabídka: {formatCZK(o.counter_amount)}</span>}
                          {(() => {
                            const crossLeague = myLeagueId && (o as any).to_league_id && (o as any).to_league_id !== myLeagueId;
                            if (!crossLeague) return null;
                            const fee = Math.round((o.counter_amount ?? o.offer_amount) * 0.20);
                            return <span className="text-xs text-card-red ml-2">+ poplatek {formatCZK(fee)}</span>;
                          })()}
                        </div>
                        {o.offered_player_id && (
                          <div className="mt-1 inline-flex items-center gap-1.5 bg-gold-50 border border-gold-300/60 rounded-full px-2.5 py-0.5 text-xs">
                            <span>⇄</span>
                            <span className="font-heading font-bold text-ink">{o.offered_first_name} {o.offered_last_name}</span>
                            {o.offered_position && <span className="text-muted">({o.offered_position})</span>}
                            <span className="text-muted">na výměnu</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-stretch gap-2 shrink-0 justify-start sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
                        <Link href={`/dashboard/transfers/offer/${o.id}`} className="inline-flex items-center justify-center py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-ink text-white hover:bg-ink/80 transition-colors">
                          Jednání →
                        </Link>
                        {o.on_turn && (<>
                          <button onClick={async () => {
                            const amount = o.counter_amount ?? o.offer_amount;
                            const isCrossLeague = myLeagueId && (o as any).to_league_id && (o as any).to_league_id !== myLeagueId;
                            const adminFee = isCrossLeague ? Math.round(amount * 0.20) : 0;
                            const desc = isCrossLeague
                              ? `Za ${o.first_name} ${o.last_name}\n\nMeziligový přestup — zaplatíš navíc administrační poplatek ${formatCZK(adminFee)} (15%)`
                              : `Za ${o.first_name} ${o.last_name}`;
                            const ok = await confirm({ title: `Přijmout protinabídku ${formatCZK(amount)}?`, description: desc, confirmLabel: "Přijmout" });
                            if (!ok || !teamId) return;
                            if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}/accept`, { method: "POST" }), "Přijetí protinabídky se nezdařilo")) await refresh();
                          }} className="inline-flex items-center justify-center py-1.5 px-4 rounded-soft text-xs font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                            Přijmout
                          </button>
                          <button onClick={() => {
                            const currentAmount = o.counter_amount ?? o.offer_amount;
                            setPriceDialog({
                              title: `Protinabídka za ${o.first_name} ${o.last_name}`,
                              description: `${o.to_team_name} chce ${formatCZK(currentAmount)}. Zadej novou částku.`,
                              defaultPrice: Math.round(currentAmount * 0.9),
                              onConfirm: async (price) => {
                                if (!teamId) return;
                                const ok = await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}/counter`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ amount: price }),
                                }), "Protinabídka se nezdařila");
                                setPriceDialog(null);
                                if (ok) await refresh();
                              },
                            });
                          }} className="inline-flex items-center justify-center py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                            Protinabídka
                          </button>
                        </>)}
                        {!o.on_turn && (
                          <span className="text-xs text-muted italic self-center">Čeká se na {o.to_team_name}</span>
                        )}
                        <button onClick={async () => {
                          if (!teamId) return;
                          if (await apiAction(apiFetch(`/api/teams/${teamId}/offers/${o.id}`, { method: "DELETE" }), "Stažení nabídky se nezdařilo")) await refresh();
                        }} className="inline-flex items-center justify-center py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                          Stáhnout
                        </button>
                      </div>
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          )}

          {/* Legacy bidy (před sjednocením s offers) — postupně zmizí */}
          {false && incomingBids.length > 0 && (
            <div>
              <SectionLabel>Nabídky z trhu ({incomingBids.length})</SectionLabel>
              <div className="space-y-3">
                {incomingBids.map((b) => {
                  const ba = (() => { try { const raw = b.player_avatar; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                  const currentAmount = b.counter_amount ?? b.amount;
                  return (
                    <div key={b.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        {ba && Object.keys(ba).length > 0
                          ? <FaceAvatar faceConfig={ba} size={40} className="rounded-full shrink-0 mt-0.5" />
                          : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Link href={`/dashboard/player/${b.player_id}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                              {b.first_name} {b.last_name}
                            </Link>
                            <PositionBadge position={b.position as "GK" | "DEF" | "MID" | "FWD"} />
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-heading font-bold">{b.buyer_team_name}</span>
                            <span className="text-muted"> nabízí </span>
                            <span className="font-heading font-bold text-pitch-500">{formatCZK(currentAmount)}</span>
                            <span className="text-xs text-muted ml-2">(požadovaná cena {formatCZK(b.asking_price)})</span>
                          </div>
                          {b.status === "countered" && <div className="text-xs text-gold-600 mt-1">Tvá protinabídka: {formatCZK(b.counter_amount!)}</div>}
                          {!b.on_turn && <div className="text-xs text-muted mt-1 italic">Čeká se na odpověď druhé strany</div>}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                          {b.on_turn && (<>
                            <button onClick={async () => {
                              if (!teamId) return;
                              const ok = await confirm({ title: `Přijmout ${formatCZK(currentAmount)}?`, description: `Za ${b.first_name} ${b.last_name}`, confirmLabel: "Přijmout" });
                              if (!ok) return;
                              if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/accept`, { method: "POST" }), "Přijetí nabídky se nezdařilo")) await refresh();
                            }} className="py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                              Přijmout
                            </button>
                            <button onClick={() => {
                              setPriceDialog({
                                title: `Protinabídka za ${b.first_name} ${b.last_name}`,
                                description: `${b.buyer_team_name} nabízí ${formatCZK(currentAmount)}. Zadej částku.`,
                                defaultPrice: Math.round(currentAmount * 1.25),
                                onConfirm: async (price) => {
                                  if (!teamId) return;
                                  const ok = await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/counter`, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ amount: price }),
                                  }), "Protinabídka se nezdařila");
                                  setPriceDialog(null);
                                  if (ok) await refresh();
                                },
                              });
                            }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                              Protinabídka
                            </button>
                            <button onClick={async () => {
                              if (!teamId) return;
                              if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/reject`, { method: "POST" }), "Odmítnutí se nezdařilo")) await refresh();
                            }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                              Odmítnout
                            </button>
                          </>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legacy odchozí bidy (před sjednocením) — postupně zmizí */}
          {false && outgoingBids.length > 0 && (
            <div>
              <SectionLabel>Moje bidy na trhu ({outgoingBids.length})</SectionLabel>
              <div className="space-y-3">
                {outgoingBids.map((b) => {
                  const ba = (() => { try { const raw = b.player_avatar; return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; } })();
                  const currentAmount = b.counter_amount ?? b.amount;
                  return (
                    <div key={b.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        {ba && Object.keys(ba).length > 0
                          ? <FaceAvatar faceConfig={ba} size={40} className="rounded-full shrink-0 mt-0.5" />
                          : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-heading font-bold">{b.first_name} {b.last_name}</span>
                            <PositionBadge position={b.position as "GK" | "DEF" | "MID" | "FWD"} />
                            <span className="text-sm text-muted">→ {b.seller_team_name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</span>
                          </div>
                          <div className="text-sm text-muted">
                            Nabídnuto: <span className="font-heading font-bold text-ink">{formatCZK(b.amount)}</span>
                            <span className="ml-2 text-xs">(cena {formatCZK(b.asking_price)})</span>
                          </div>
                          {b.status === "countered" && <div className="text-sm text-gold-600 mt-1">Protinabídka prodávajícího: <span className="font-heading font-bold">{formatCZK(b.counter_amount!)}</span></div>}
                          {!b.on_turn && b.status !== "countered" && <div className="text-xs text-muted mt-1 italic">Čeká se na prodávajícího</div>}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                          {b.on_turn && b.status === "countered" && (<>
                            <button onClick={async () => {
                              if (!teamId) return;
                              const ok = await confirm({ title: `Přijmout protinabídku ${formatCZK(currentAmount)}?`, description: `Za ${b.first_name} ${b.last_name}`, confirmLabel: "Přijmout" });
                              if (!ok) return;
                              if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/accept`, { method: "POST" }), "Přijetí nabídky se nezdařilo")) await refresh();
                            }} className="py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
                              Přijmout
                            </button>
                            <button onClick={() => {
                              setPriceDialog({
                                title: `Protinabídka za ${b.first_name} ${b.last_name}`,
                                description: `${b.seller_team_name} chce ${formatCZK(currentAmount)}. Zadej novou částku.`,
                                defaultPrice: Math.round(currentAmount * 0.9),
                                onConfirm: async (price) => {
                                  if (!teamId) return;
                                  const ok = await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}/counter`, {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ amount: price }),
                                  }), "Protinabídka se nezdařila");
                                  setPriceDialog(null);
                                  if (ok) await refresh();
                                },
                              });
                            }} className="py-1.5 px-3 rounded-soft text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 transition-colors">
                              Protinabídka
                            </button>
                          </>)}
                          <button onClick={async () => {
                            if (!teamId) return;
                            const ok = await confirm({ title: "Stáhnout nabídku?", description: "Tvá nabídka bude zrušena.", confirmLabel: "Stáhnout", variant: "danger" });
                            if (!ok) return;
                            if (await apiAction(apiFetch(`/api/teams/${teamId}/bids/${b.id}`, { method: "DELETE" }), "Stažení se nezdařilo")) await refresh();
                          }} className="py-1.5 px-3 rounded-soft text-xs font-heading font-bold bg-gray-100 text-muted hover:bg-gray-200 transition-colors">
                            Stáhnout
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                  <div key={p.id} className="card p-3 flex items-center gap-3 flex-wrap">
                    <Link href={`/dashboard/player/${p.id}`} className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors">
                      {p.first_name} {p.last_name}
                    </Link>
                    <PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} />
                    <span className="text-sm text-muted">z {p.owner_team_name}</span>
                    <span className="ml-auto text-xs text-yellow-600 font-heading font-bold">
                      do {new Date(p.loan_until).toLocaleDateString("cs")}
                    </span>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Ukončit hostování?",
                          description: `${p.first_name} ${p.last_name} se ihned vrátí do ${p.owner_team_name}.`,
                          confirmLabel: "Ukončit",
                        });
                        if (!ok || !teamId) return;
                        if (await apiAction(apiFetch(`/api/teams/${teamId}/loans/${p.id}/terminate`, { method: "POST" }), "Ukončení hostování se nezdařilo")) await refresh();
                      }}
                      className="shrink-0 py-1 px-3 rounded-soft text-xs font-heading font-bold bg-card-red/10 text-card-red hover:bg-card-red/20 transition-colors"
                    >
                      Ukončit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {playerOffers.length === 0 && incoming.length === 0 && outgoing.length === 0 && loanedOut.length === 0 && loanedIn.length === 0 && (
            <div className="card p-6 text-center text-muted">Žádné aktivní nabídky ani hostování.</div>
          )}

          </>}
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
      <div className="card overflow-x-auto table-scroll">
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
                              const ok = await apiAction(apiFetch(`/api/teams/${teamId}/players/${p.id}/list`, {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ askingPrice: price }),
                              }), "Vystavení na trh se nezdařilo");
                              setPriceDialog(null);
                              if (ok) await refresh();
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
                        if (await apiAction(apiFetch(`/api/teams/${teamId}/players/${p.id}/release`, { method: "POST" }), "Uvolnění hráče se nezdařilo")) await refresh();
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
  onConfirm: (price: number) => Promise<void> | void; onClose: () => void;
}) {
  const [price, setPrice] = useState(defaultPrice);
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[90vw] max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-heading font-bold text-lg">{title}</h3>
          <p className="text-sm text-muted mt-1">{description}</p>

          <div className="mt-4">
            <label className="text-xs text-muted font-heading uppercase">Požadovaná cena (Kč)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Math.min(100_000_000, Math.max(0, parseInt(e.target.value) || 0)))}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 font-heading font-bold text-lg tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-pitch-500"
              min={0}
              max={100_000_000}
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
          <button disabled={loading} onClick={async () => {
              setLoading(true);
              try { await onConfirm(price); } catch (e) { console.error("PriceDialog confirm error:", e); }
              setLoading(false);
            }}
            className="flex-1 py-3.5 text-sm font-heading font-bold text-pitch-500 hover:bg-pitch-50 transition-colors border-l border-gray-100 disabled:opacity-50">
            {loading ? "Zpracovávám..." : "Potvrdit"}
          </button>
        </div>
      </div>
    </div>
  );
}
