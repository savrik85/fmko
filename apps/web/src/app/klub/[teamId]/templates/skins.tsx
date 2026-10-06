"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ClubWebsiteTemplate } from "@okresni-masina/shared";
import { ShareButton } from "../ShareButton";
import { ClubBasePathContext, TeamSlugsContext, clubPaletteStyle } from "./shared";

/**
 * Vzhled podstránek webu (profil hráče, trenér, zápasy, zpravodaj) převzatý z šablony klubu.
 * Třídy jsou zkopírované z jejích sekcí (rám stránky, lišty, tabulka soutěže), aby podstránka
 * vypadala jako další stránka téhož webu, ne jako cizí aplikace. Nový prvek podstránky
 * stavět jen z těchto tříd.
 */
export interface Skin {
  root: string;
  rootStyle?: CSSProperties;
  frame: string;
  header: string;
  kicker: string;
  name: string;
  meta: string;
  body: string;
  section: string;
  sectionHead: (title: string) => ReactNode;
  table: string;
  thead: string;
  th: string;
  td: string;
  row: string;
  link: string;
  muted: string;
  quote: string;
  faceBox: string;
}

const LIGHT_TONES = {
  "--club-ink": "color-mix(in srgb, var(--club-accent-light) 75%, black)",
  "--club-frame": "color-mix(in srgb, var(--club-accent-light) 50%, #cbb092)",
} as CSSProperties;

export const SKINS: Record<ClubWebsiteTemplate, Skin> = {
  retro_2004: {
    root: "min-h-screen bg-[#d8d6ce] text-[#111111] font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "max-w-5xl mx-auto my-3 bg-white border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.5)]",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] p-3 sm:p-4 border-b-4 border-[var(--club-secondary)]",
    kicker: "text-sm tracking-wide font-mono uppercase",
    name: "text-2xl sm:text-3xl font-serif font-black tracking-tight break-words",
    meta: "text-sm mt-0.5",
    body: "p-3 space-y-3",
    section: "border border-gray-400 bg-white",
    sectionHead: (title) => (
      <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase">{title}</div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-[#f0f0e8] border-b border-gray-400 text-gray-700 font-bold",
    th: "py-1 px-2",
    td: "py-1 px-2",
    row: "border-b border-gray-200",
    link: "text-blue-800 underline",
    muted: "text-gray-600",
    quote: "font-serif italic text-base",
    faceBox: "p-1 bg-white border border-[var(--club-secondary)] shadow shrink-0",
  },
  village_patriot: {
    root: "min-h-screen bg-[#f3ebe1] text-[#2c1b0e] font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "",
    header: "bg-[#3b2010] text-[#ffebd4] border-b-8 border-[var(--club-primary)] shadow-2xl",
    kicker: "text-sm font-serif font-bold uppercase tracking-widest",
    name: "text-3xl sm:text-4xl font-serif font-black break-words",
    meta: "text-base font-serif mt-1",
    body: "max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-[#fffdfa] border-2 border-[var(--club-frame)] rounded-3xl p-6 sm:p-8 shadow-md relative font-serif",
    sectionHead: (title) => (
      <>
        <span className="absolute -top-3 left-8 text-2xl" aria-hidden="true">📌</span>
        <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-4">
          <div className="text-sm uppercase tracking-widest text-[var(--club-ink)] font-bold">{title}</div>
        </div>
      </>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-[#ede2d2] border-b-2 border-[#b89a7a] text-[#3e2211] font-bold",
    th: "py-2 px-2",
    td: "py-2 px-2",
    row: "border-b border-[#e5d5c0]",
    link: "text-[var(--club-ink)] font-bold hover:underline",
    muted: "text-[#6b4f36]",
    quote: "font-serif italic text-base",
    faceBox: "p-2 bg-[#2a160b] border-2 border-[#5c371e] rounded-xl shadow-inner shrink-0",
  },
  regional_standard: {
    root: "min-h-screen bg-slate-50 text-slate-900 font-sans pb-16",
    rootStyle: LIGHT_TONES,
    frame: "",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-black/10 shadow-sm",
    kicker: "text-sm font-bold uppercase tracking-wider",
    name: "font-heading font-black text-2xl sm:text-4xl tracking-tight break-words",
    meta: "text-base mt-1",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm",
    sectionHead: (title) => (
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="text-xl sm:text-2xl font-heading font-black text-slate-900">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-slate-50 border-b border-slate-200 text-slate-600 font-heading font-bold text-sm uppercase tracking-wider",
    th: "py-2.5 px-3",
    td: "py-2.5 px-3",
    row: "border-b border-slate-100",
    link: "text-[var(--club-ink)] font-bold hover:underline",
    muted: "text-slate-500",
    quote: "italic text-base text-slate-700",
    faceBox: "shrink-0 rounded-xl bg-white/90 p-1.5",
  },
  profi_league: {
    root: "min-h-screen bg-[#070a12] text-white font-sans pb-16",
    frame: "",
    header: "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-white/10 shadow-2xl",
    kicker: "text-sm font-heading font-black uppercase tracking-wide",
    name: "font-heading font-black text-3xl sm:text-5xl tracking-tight uppercase break-words",
    meta: "text-base font-heading font-bold mt-1",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl",
    sectionHead: (title) => (
      <div className="mb-6 border-b border-white/10 pb-4">
        <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-white/5 text-white/60 font-heading font-black text-sm uppercase tracking-wide border-b border-white/10",
    th: "py-3 px-2 sm:px-3",
    td: "py-3 px-2 sm:px-3",
    row: "border-b border-white/5",
    link: "text-[var(--club-accent-dark)] font-bold hover:underline",
    muted: "text-white/60",
    quote: "italic text-base text-white/80",
    faceBox: "shrink-0 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]",
  },
  champions: {
    root: "min-h-screen bg-[#020510] text-white font-sans pb-20",
    frame: "",
    header: "backdrop-blur-2xl bg-white/5 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
    kicker: "text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]",
    name: "font-heading font-black text-3xl sm:text-5xl tracking-tight uppercase break-words",
    meta: "text-base font-heading font-bold mt-1 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]",
    body: "max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8",
    section: "bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl",
    sectionHead: (title) => (
      <div className="mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
        <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">{title}</h2>
      </div>
    ),
    table: "w-full text-left text-sm border-collapse",
    thead: "bg-white/5 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-black text-sm uppercase tracking-wide border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]",
    th: "py-3 px-2 sm:px-3",
    td: "py-3 px-2 sm:px-3",
    row: "border-b border-white/5",
    link: "text-[var(--club-accent-dark)] font-bold hover:underline",
    muted: "text-white/60",
    quote: "italic text-base text-white/80",
    faceBox: "shrink-0 drop-shadow-[0_0_20px_color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]",
  },
};


interface ShellClub {
  id: string;
  name: string;
  slug: string | null;
  template: ClubWebsiteTemplate;
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Obal podstránky webu klubu: horní lišta (zpět na web, sdílet), barvy klubu a rám šablony.
 * Obsah dostane `skin` se třídami šablony a cestu na web klubu.
 */
export function ClubSubpageShell({
  club,
  teamSlugs,
  siteUrl,
  path,
  shareTitle,
  children,
}: {
  club: ShellClub;
  teamSlugs: Record<string, string>;
  siteUrl: string;
  /** Cesta podstránky za adresou klubu, např. "/zapasy". */
  path: string;
  shareTitle: string;
  children: (skin: Skin, clubPath: string) => ReactNode;
}) {
  const skin = SKINS[club.template] ?? SKINS.retro_2004;
  const clubPath = `/klub/${club.slug || club.id}`;
  const content = children(skin, clubPath);
  return (
    <ClubBasePathContext.Provider value={clubPath}>
      <TeamSlugsContext.Provider value={teamSlugs ?? {}}>
        <div style={clubPaletteStyle(club.primaryColor, club.secondaryColor)}>
          <div className="bg-[#0b0f17] text-slate-300 border-b border-white/10 px-3 sm:px-6 py-2 text-sm flex items-center justify-between gap-2 sticky top-0 z-50 shadow-md min-h-[52px] print:hidden">
            <Link
              href={clubPath}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-slate-200 font-heading font-bold text-sm min-w-0"
            >
              <span aria-hidden="true">←</span>
              <span className="truncate">Web klubu {club.name}</span>
            </Link>
            <ShareButton
              url={`${siteUrl}${clubPath}${path}`}
              title={shareTitle}
              textClass="text-slate-200 hover:text-white"
              bgClass="bg-white/10 hover:bg-white/20 border border-white/20"
            />
          </div>
          <div className={skin.root} style={skin.rootStyle}>
            {skin.frame ? <div className={skin.frame}>{content}</div> : content}
          </div>
        </div>
      </TeamSlugsContext.Provider>
    </ClubBasePathContext.Provider>
  );
}
