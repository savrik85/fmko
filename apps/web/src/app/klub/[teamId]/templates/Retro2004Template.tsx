"use client";

import { useState } from "react";
import Link from "next/link";
import type { TemplateProps } from "./types";
import { BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ManagerFace } from "../ManagerFace";
import { TacticalPitch } from "../TacticalPitch";
import { ClubAudioPlayer } from "../ClubAudioPlayer";

export function Retro2004Template({
  data,
  unlockedAddons,
  hasSponsorBanner,
  hasAudioModule,
  hasStadiumGallery,
  hasPressOfficer,
  onOpenTickets,
  onOpenHighlights,
  onOpenLightbox,
  onBackToGame,
}: TemplateProps) {
  const { team, website, manager, staff, roster, matches, concessions, tickets } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"table" | "pitch">("table");
  const [pollVoted, setPollVoted] = useState(false);
  const [pollSelection, setPollSelection] = useState<string>("win");

  const primary = team.primaryColor || "#002b66";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;
  const hasU21 = roster.u21Team && roster.u21Team.length > 0;

  const nextMatch = matches.nextMatch;
  const lastMatch = matches.lastMatch;

  return (
    <div className="min-h-screen bg-[#d8d6ce] text-[#111111] font-sans pb-16">
      {/* 2004 Framed Boxed Container */}
      <div className="max-w-5xl mx-auto my-3 bg-white border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.5)]">
        {/* Retro Header Top Banner */}
        <div className="bg-gradient-to-r from-[#001f4d] via-[#003882] to-[#001f4d] text-white p-3 sm:p-4 border-b-2 border-yellow-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 text-center sm:text-left">
            <div className="p-1 bg-white border border-yellow-400 shadow shrink-0">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={44}
              />
            </div>
            <div>
              <div className="text-[10px] tracking-widest text-yellow-300 font-mono uppercase">
                *** OFICIÁLNÍ WEBOVÉ STRÁNKY ***
              </div>
              <h1 className="text-xl sm:text-3xl font-serif font-black tracking-tight drop-shadow-md">
                {team.name}
              </h1>
              <div className="text-xs text-yellow-100 opacity-90 mt-0.5">
                Obec {team.village.name} · Okres {team.village.district} {team.identity.foundingYear ? `· Založeno roku ${team.identity.foundingYear}` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-3 py-1.5 bg-[#ffcc00] hover:bg-yellow-400 text-black border-2 border-t-white border-l-white border-b-black border-r-black font-bold text-xs uppercase shadow active:translate-y-0.5"
            >
              [ 🎟️ Vstupenky: {tickets.adultPrice} Kč ]
            </button>
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3 py-1.5 bg-[#e0e0e0] hover:bg-gray-300 text-black border-2 border-t-white border-l-white border-b-black border-r-black font-bold text-xs active:translate-y-0.5"
            >
              ← Zpět do hry
            </button>
          </div>
        </div>

        {/* Retro 2004 Scrolling Marquee Ticker */}
        <div className="bg-[#fff9d6] border-b border-gray-400 py-1 px-3 text-xs text-blue-900 font-mono font-bold flex items-center overflow-hidden">
          <span className="shrink-0 bg-red-600 text-white px-1.5 py-0.2 mr-2 text-[10px] font-sans uppercase">Zpráva:</span>
          <div className="whitespace-nowrap overflow-x-auto text-[11px]">
            +++ VÍTÁME VÁS NA WEBU ODDÍLU {team.name.toUpperCase()} +++ PŘÍŠTÍ UTKÁNÍ: {nextMatch ? `${nextMatch.isHome ? "DOMA" : "VENKU"} PROTI ${nextMatch.opponent.name.toUpperCase()}` : "ČEKÁ SE NA ROZLOSOVÁNÍ"} +++ BUFET U HŘIŠTĚ V PROVOZU OD 13:00 +++ K DISPOZICI TOČENÉ PIVO ${concessions.beerName} (${concessions.beerPrice} KČ) +++
          </div>
        </div>

        {/* Sponsor Banner Addon (Retro Web 1.0 Edition) */}
        {hasSponsorBanner && (
          <div className="bg-[#f0f0e0] border-b border-gray-400 py-1.5 px-3 text-center text-xs border-dashed border-t-0 font-serif">
            <span className="font-bold text-blue-900">HLAVNÍ SPONZOŘI KLUBU: </span>
            <span className="underline font-sans text-xs">Pivovar Kocour s.r.o. · Truhlářství Novák & synové · Lesní správa a.s.</span>
            <span className="ml-2 text-[10px] text-gray-500">[placená inzerce]</span>
          </div>
        )}

        {/* Retro Bevel Navigation Bar */}
        <div className="bg-[#ece9d8] border-b-2 border-gray-500 p-1 flex items-center gap-1 overflow-x-auto text-xs font-sans">
          <a href="#zapas" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Úvod & Zápas
          </a>
          <a href="#kadr" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Soupiska kádru
          </a>
          <a href="#stadion" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Areál hřiště
          </a>
          <a href="#bufet" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Klubový bufet
          </a>
          {hasAudioModule && (
            <a href="#audio" className="px-2.5 py-1 bg-[#e2f0d9] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-green-100 shrink-0 font-bold text-green-900">
              🎵 Klubové audio
            </a>
          )}
          <a href="#realizak" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Vedení oddílu
          </a>
          <a href="#historie" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Klubová historie
          </a>
        </div>

        {/* ═══ TWO-COLUMN CLASSIC WEB 1.0 PORTAL LAYOUT ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-4 p-3 gap-4">
          {/* ═══ LEFT SIDEBAR (Width ~1 col) ═══ */}
          <aside className="md:col-span-1 space-y-4 text-xs font-sans">
            {/* Sidebar Box 1: Navigace */}
            <div className="border border-gray-400 bg-[#f9f9f6]">
              <div className="bg-[#002b66] text-white px-2 py-1 font-bold text-xs uppercase flex items-center justify-between">
                <span>Rychlé menu</span>
                <span className="text-yellow-300">▼</span>
              </div>
              <ul className="p-2 space-y-1.5 text-blue-800 underline">
                <li><a href="#zapas" className="hover:text-red-600">» Příští zápas</a></li>
                <li><a href="#kadr" className="hover:text-red-600">» Hráčská soupiska</a></li>
                <li><a href="#stadion" className="hover:text-red-600">» Fotky stadionu</a></li>
                <li><a href="#bufet" className="hover:text-red-600">» Pivo a klobásy</a></li>
                <li><a href="#realizak" className="hover:text-red-600">» Trenér a vedení</a></li>
                <li><a href="#historie" className="hover:text-red-600">» Kronika a tradice</a></li>
              </ul>
            </div>

            {/* Sidebar Box 2: Anketa (Web 1.0 Poll) */}
            <div className="border border-gray-400 bg-[#f9f9f6]">
              <div className="bg-[#002b66] text-white px-2 py-1 font-bold text-xs uppercase">
                Anketa fanoušků
              </div>
              <div className="p-2.5">
                <div className="font-bold text-gray-900 mb-2">
                  Jak dopadne náš příští mistrovský zápas?
                </div>
                {!pollVoted ? (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="poll"
                        checked={pollSelection === "win"}
                        onChange={() => setPollSelection("win")}
                      />
                      <span>Vyhrajeme o parník (1)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="poll"
                        checked={pollSelection === "draw"}
                        onChange={() => setPollSelection("draw")}
                      />
                      <span>Bude to plichta (X)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="poll"
                        checked={pollSelection === "loss"}
                        onChange={() => setPollSelection("loss")}
                      />
                      <span>Zařízne nás sudí (2)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPollVoted(true)}
                      className="mt-2 w-full py-1 bg-[#ece9d8] hover:bg-yellow-100 border border-t-white border-l-white border-b-gray-600 border-r-gray-600 font-bold text-[11px]"
                    >
                      [ Odeslat hlas ]
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 text-[11px]">
                    <div className="text-green-700 font-bold mb-1">Děkujeme za Váš hlas!</div>
                    <div className="flex justify-between">
                      <span>Výhra:</span> <span className="font-mono font-bold">78 % (112)</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 border border-gray-400">
                      <div className="bg-blue-700 h-full w-[78%]" />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Remíza:</span> <span className="font-mono font-bold">14 % (20)</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 border border-gray-400">
                      <div className="bg-yellow-600 h-full w-[14%]" />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Zářez sudího:</span> <span className="font-mono font-bold">8 % (12)</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 border border-gray-400">
                      <div className="bg-red-600 h-full w-[8%]" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Box 3: Počítadlo návštěv (LED Counter) */}
            <div className="border border-gray-400 bg-[#f9f9f6] p-2.5 text-center">
              <div className="text-[10px] uppercase font-bold text-gray-600 mb-1">
                Počítadlo přístupů:
              </div>
              <div className="inline-flex bg-black text-[#00ff41] font-mono font-bold text-sm px-2.5 py-1 border-2 border-inset border-gray-600 tracking-widest shadow-inner">
                {String(website.visitorCount || 1).padStart(6, "0")}
              </div>
              <div className="text-[9px] text-gray-500 mt-1">
                unikátních zobrazení stránek
              </div>
            </div>

            {/* Sidebar Box 4: Občerstvení u klandru */}
            <div className="border border-gray-400 bg-[#f9f9f6]">
              <div className="bg-[#002b66] text-white px-2 py-1 font-bold text-xs uppercase flex items-center justify-between">
                <span>Vesnický bufet</span>
                <span>🍺</span>
              </div>
              <div className="p-2 space-y-1">
                <div className="flex justify-between border-b border-gray-200 pb-0.5">
                  <span>Točené pivo:</span>
                  <span className="font-bold">{concessions.beerPrice} Kč</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-0.5">
                  <span>Klobása:</span>
                  <span className="font-bold">{concessions.sausagePrice} Kč</span>
                </div>
                <div className="flex justify-between">
                  <span>Limonáda:</span>
                  <span className="font-bold">{concessions.lemonadePrice} Kč</span>
                </div>
              </div>
            </div>

            {/* Sidebar Box 5: Výměna odkazů */}
            <div className="border border-gray-400 bg-[#f9f9f6] p-2 text-[11px]">
              <div className="font-bold text-gray-700 mb-1 border-b border-gray-300 pb-0.5">
                Fotbalové odkazy:
              </div>
              <ul className="space-y-1 text-blue-800 underline">
                <li><a href="https://fotbal.cz" target="_blank" rel="noreferrer">Fotbalová asociace ČR</a></li>
                <li><a href="https://vysledky.com" target="_blank" rel="noreferrer">Okresní fotbalové výsledky</a></li>
                <li><a href="https://denik.cz" target="_blank" rel="noreferrer">Deník okresu {team.village.district}</a></li>
              </ul>
            </div>
          </aside>

          {/* ═══ RIGHT MAIN CONTENT (Width ~3 cols) ═══ */}
          <main className="md:col-span-3 space-y-6">
            {/* Press Officer Pinned Announcement (Retro Notice Box) */}
            {(hasPressOfficer || website.announcement) && (
              <div className="p-3 bg-[#fffbe6] border-2 border-red-600 text-xs shadow-sm">
                <div className="flex items-center gap-2 font-bold text-red-700 uppercase tracking-wide border-b border-red-300 pb-1 mb-1.5">
                  <span>⚠️</span>
                  <span>DŮLEŽITÉ SDRĚLENÍ VEDENÍ KLUBU A TISKOVÉHO MLUVČÍHO</span>
                </div>
                <p className="font-serif italic leading-relaxed text-gray-900">
                  &ldquo;{website.announcement || `Vedení klubu ${team.name} srdečně zdraví všechny příznivce a soupeře na našich internetových stránkách. Mužstvo poctivě trénuje, areál je připraven a těšíme se na vaši účast v nadcházejícím kole!`}&rdquo;
                </p>
                <div className="text-[10px] text-gray-500 text-right mt-1">
                  — Oficiální tiskové oddělení TJ/FK {team.name}
                </div>
              </div>
            )}

            {/* ═══ MATCH REPORT & NEXT MATCH (TELETEXT / EUROFOTBAL TABLE STYLE) ═══ */}
            <section id="zapas" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Mistrovská utkání</span>
                <span className="text-yellow-300 text-xs font-mono">SEZÓNA 2004/2005</span>
              </div>

              <div className="p-3 space-y-4">
                {/* Next Match Card */}
                {nextMatch ? (
                  <div className="border border-gray-300 bg-[#f7f7f4] p-3">
                    <div className="text-[11px] font-bold uppercase text-blue-900 mb-1 border-b border-gray-300 pb-0.5">
                      Příští mistrovské utkání · {nextMatch.round ? `${nextMatch.round}. kolo` : "Zápas týdne"}
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2">
                      <div className="text-center sm:text-left">
                        <div className="text-base sm:text-lg font-serif font-black text-black">
                          {nextMatch.isHome ? team.name : nextMatch.opponent.name} vs. {nextMatch.isHome ? nextMatch.opponent.name : team.name}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          🏟️ Hřiště: {nextMatch.stadiumName} · {nextMatch.isHome ? "Domácí hřiště" : "Hřiště soupeře"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onOpenTickets}
                          className="px-3 py-1 bg-yellow-400 hover:bg-yellow-300 text-black border border-black font-bold text-xs shadow active:translate-y-0.5"
                        >
                          Koupit lístek ({tickets.adultPrice} Kč)
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center text-xs text-gray-500 italic">
                    V nejbližších dnech není naplánováno žádné mistrovské utkání.
                  </div>
                )}

                {/* Last Match Summary */}
                {lastMatch && (
                  <div className="border border-gray-300 p-2.5 bg-white text-xs">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-1 mb-1.5 font-bold">
                      <span className="text-gray-700">Poslední odehrané utkání ({lastMatch.round ? `${lastMatch.round}. kolo` : "Zápas"}):</span>
                      <button
                        type="button"
                        onClick={() => onOpenHighlights(lastMatch)}
                        className="text-blue-800 underline hover:text-red-600 font-bold"
                      >
                        [ ▶ Zobrazit zápis & sestřih ]
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">{lastMatch.isHome ? team.name : lastMatch.opponent.name}</span>
                      <span className="bg-black text-yellow-300 font-mono px-2 py-0.5 font-bold text-base">
                        {lastMatch.scoreHome} : {lastMatch.scoreAway}
                      </span>
                      <span className="font-bold">{lastMatch.isHome ? lastMatch.opponent.name : team.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ═══ SOUPISKA - THE LEGENDARY 2004 HTML TABLE! ═══ */}
            <section id="kadr" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Hráčský kádr (Soupiska mužstva)</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2 py-0.5 text-xs font-sans ${viewMode === "table" ? "bg-yellow-400 text-black font-bold" : "bg-blue-900 text-white"}`}
                  >
                    Tabulka
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("pitch")}
                    className={`px-2 py-0.5 text-xs font-sans ${viewMode === "pitch" ? "bg-yellow-400 text-black font-bold" : "bg-blue-900 text-white"}`}
                  >
                    Hřiště
                  </button>
                </div>
              </div>

              {hasU21 && (
                <div className="bg-gray-100 p-1.5 border-b border-gray-300 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("aTeam")}
                    className={`px-3 py-0.5 border ${activeRosterTab === "aTeam" ? "bg-white border-black font-bold text-blue-900" : "bg-gray-200 border-gray-400"}`}
                  >
                    A-mužstvo ({roster.aTeam.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("u21Team")}
                    className={`px-3 py-0.5 border ${activeRosterTab === "u21Team" ? "bg-white border-black font-bold text-blue-900" : "bg-gray-200 border-gray-400"}`}
                  >
                    B-tým / U21 ({roster.u21Team.length})
                  </button>
                </div>
              )}

              {viewMode === "pitch" ? (
                <div className="p-4 bg-[#f0f0e8]">
                  <TacticalPitch
                    players={currentRoster}
                    primaryColor={primary}
                    secondaryColor={team.secondaryColor || "#ffffff"}
                  />
                </div>
              ) : (
                /* THE 2004 HTML TABLE */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr className="bg-[#002b66] text-yellow-300 border-b border-gray-400 text-[11px] uppercase">
                        <th className="py-2 px-2 text-center w-8">Čís.</th>
                        <th className="py-2 px-2 w-10 text-center">Foto</th>
                        <th className="py-2 px-3">Jméno a příjmení</th>
                        <th className="py-2 px-2">Post</th>
                        <th className="py-2 px-2 text-center">Věk</th>
                        <th className="py-2 px-2 text-center">Záp.</th>
                        <th className="py-2 px-2 text-center">Góly</th>
                        <th className="py-2 px-2 text-center">Asis.</th>
                        <th className="py-2 px-2 text-right pr-3">Minuty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRoster.map((player, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <tr
                            key={player.id}
                            className={`border-b border-gray-200 hover:bg-[#fff9cc] transition-colors ${
                              isEven ? "bg-white" : "bg-[#f5f5ee]"
                            }`}
                          >
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-gray-700">
                              {player.squadNumber ?? "-"}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <div className="w-7 h-8 mx-auto border border-gray-400 bg-gray-200 overflow-hidden flex items-center justify-center">
                                <ManagerFace faceConfig={player.avatar} size={28} />
                              </div>
                            </td>
                            <td className="py-1.5 px-3 font-bold text-blue-900">
                              {player.firstName} {player.lastName}
                            </td>
                            <td className="py-1.5 px-2 font-medium text-gray-700">
                              {player.positionName || player.position}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono text-gray-600">
                              {player.age}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-gray-900">
                              {player.stats.appearances}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-green-700">
                              {player.stats.goals}
                            </td>
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-blue-700">
                              {player.stats.assists}
                            </td>
                            <td className="py-1.5 px-2 text-right pr-3 font-mono text-gray-600">
                              {player.stats.minutesPlayed}&apos;
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ═══ REALIZAČNÍ TÝM ═══ */}
            <section id="realizak" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase">
                Vedení oddílu a realizační tým
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {manager && (
                  <div className="border border-gray-300 p-2 bg-[#f9f9f6] flex items-center gap-3">
                    <div className="w-12 h-14 border border-gray-400 bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                      <ManagerFace faceConfig={manager.avatar} size={48} />
                    </div>
                    <div>
                      <div className="text-[10px] text-red-700 font-bold uppercase">Hlavní trenér</div>
                      <div className="font-bold text-sm text-blue-900">{manager.name}</div>
                      <div className="text-gray-600 text-[11px]">Věk {manager.age} let · Licence {manager.licence}</div>
                    </div>
                  </div>
                )}
                {staff.slice(0, 3).map((st) => (
                  <div key={st.id} className="border border-gray-300 p-2 bg-[#f9f9f6] flex items-center gap-3">
                    <div className="w-12 h-14 border border-gray-400 bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                      <ManagerFace faceConfig={st.avatar} size={48} />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600 font-bold uppercase">{st.profession || st.role}</div>
                      <div className="font-bold text-sm text-black">{st.firstName} {st.lastName}</div>
                      <div className="text-gray-600 text-[11px]">{st.age} let</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ═══ FOTODOKUMENTACE AREÁLU ═══ */}
            <section id="stadion" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Fotodokumentace areálu TJ</span>
                {hasStadiumGallery && (
                  <span className="text-yellow-300 text-xs font-mono">[ Odemčená fotogalerie 4 foto ]</span>
                )}
              </div>
              <div className="p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div
                    onClick={() =>
                      onOpenLightbox({
                        src: "/images/stadion-tribuna.jpg",
                        title: "Krytá tribuna & Lavičky",
                        desc: "Dřevěná krytá tribuna pro diváky a stání podél klandru",
                      })
                    }
                    className="border border-black p-1 bg-white cursor-pointer hover:bg-yellow-50"
                  >
                    <img src="/images/stadion-tribuna.jpg" alt="Tribuna" className="w-full aspect-[4/3] object-cover border border-gray-400" />
                    <div className="p-1 font-serif text-xs text-center text-gray-800">
                      Obr. 1: Dřevěná tribuna a klandr
                    </div>
                  </div>

                  <div
                    onClick={() =>
                      onOpenLightbox({
                        src: "/images/stadion-kiosek.jpg",
                        title: "Hospůdka & Kiosek",
                        desc: "Klubový kiosek a točené pivo",
                      })
                    }
                    className="border border-black p-1 bg-white cursor-pointer hover:bg-yellow-50"
                  >
                    <img src="/images/stadion-kiosek.jpg" alt="Kiosek" className="w-full aspect-[4/3] object-cover border border-gray-400" />
                    <div className="p-1 font-serif text-xs text-center text-gray-800">
                      Obr. 2: Klubový kiosek s udírnou
                    </div>
                  </div>

                  <div
                    onClick={() =>
                      onOpenLightbox({
                        src: "/images/stadion-kabiny.jpg",
                        title: "Kabiny & Šatny",
                        desc: "Kabiny a šatny hráčů",
                      })
                    }
                    className="border border-black p-1 bg-white cursor-pointer hover:bg-yellow-50"
                  >
                    <img src="/images/stadion-kabiny.jpg" alt="Kabiny" className="w-full aspect-[4/3] object-cover border border-gray-400" />
                    <div className="p-1 font-serif text-xs text-center text-gray-800">
                      Obr. 3: Zázemí šaten a rozhodčích
                    </div>
                  </div>

                  {hasStadiumGallery && (
                    <div
                      onClick={() =>
                        onOpenLightbox({
                          src: "/images/stadion-areal.jpg",
                          title: "Panoráma areálu",
                          desc: "Celkový pohled na fotbalové hřiště",
                        })
                      }
                      className="border border-black p-1 bg-white cursor-pointer hover:bg-yellow-50 sm:col-span-2 lg:col-span-3"
                    >
                      <img src="/images/stadion-areal.jpg" alt="Areál" className="w-full aspect-[16/9] object-cover border border-gray-400 max-h-56" />
                      <div className="p-1 font-serif text-xs text-center text-gray-800 font-bold">
                        Obr. 4: Panoramatický pohled na travnatou plochu a areál v obci {team.village.name}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ═══ AUDIO MODUL (RETRO WINAMP / WMP STYLE) ═══ */}
            {hasAudioModule && (
              <section id="audio" className="border border-gray-400 bg-[#e0ded8] p-3 shadow-inner">
                <div className="text-xs font-bold font-mono text-blue-900 mb-2 uppercase flex items-center gap-1.5">
                  <span>📻</span>
                  <span>Audio přehrávač oddílu (Winamp 2.91 skin)</span>
                </div>
                <ClubAudioPlayer
                  teamName={team.name}
                  anthem={team.anthem}
                  chants={team.chants}
                />
              </section>
            )}

            {/* ═══ HISTORIE & KRONIKA ═══ */}
            <section id="historie" className="border border-gray-400 bg-white p-3.5 text-xs font-serif leading-relaxed">
              <div className="font-sans font-bold text-sm text-[#002b66] border-b border-gray-300 pb-1 mb-2">
                Z kroniky oddílu {team.name}
              </div>
              <p>
                {team.identity.foundingStory ||
                  `Fotbalový oddíl ${team.name} byl založen místními nadšenci a pamětníky za účelem rozvoje sportu a společenského života v obci ${team.village.name}. Od té doby prošly kádrem celé generace hráčů a oddíl je stálým pilířem okresní kopané.`}
              </p>
              {team.identity.motto && (
                <div className="mt-2 text-center font-bold text-gray-700 italic border-t border-gray-200 pt-1">
                  Klubové heslo: &ldquo;{team.identity.motto}&rdquo;
                </div>
              )}
            </section>
          </main>
        </div>

        {/* Retro 2004 Footer */}
        <footer className="bg-[#ece9d8] border-t-2 border-gray-500 p-4 text-center text-[11px] text-gray-700 font-sans space-y-1">
          <div>
            Optimalizováno pro rozlišení <strong>1024 × 768</strong> a prohlížeč <strong>Microsoft Internet Explorer 6.0</strong>.
          </div>
          <div>
            Oficiální prezentace fotbalového klubu {team.name} · Běží na systému Prales 2004.
          </div>
          <div className="text-[10px] text-gray-500">
            Webmaster: Lojza z kabin · Poslední aktualizace: dnes v 14:22 hod. · Všechna práva vyhrazena.
          </div>
        </footer>
      </div>
    </div>
  );
}
