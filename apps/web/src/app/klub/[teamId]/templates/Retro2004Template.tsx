"use client";

import { useState } from "react";
import { LeagueTeamLinks } from "./LeagueTeamLinks";
import Link from "next/link";
import type { TemplateProps } from "./types";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf } from "@/components/team/club-scarf";
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
  const { team, website, manager, staff, roster, matches, concessions, tickets, transfers = [] } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"table" | "pitch">("table");
  const [pollVoted, setPollVoted] = useState(false);
  const [pollSelection, setPollSelection] = useState<string>("win");
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");

  const primary = team.primaryColor || "#002b66";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;
  const hasU21 = roster.u21Team && roster.u21Team.length > 0;

  const nextMatch = matches.nextMatch;
  const lastMatch = matches.lastMatch;
  const recentMatches = matches.recentMatches || [];
  const upcomingMatches = matches.upcomingMatches || [];
  const standings = matches.standings || [];

  const filteredTransfers = transfers.filter((t) => {
    if (transferFilter === "in") return t.direction === "in";
    if (transferFilter === "out") return t.direction === "out";
    return true;
  });

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
            Úvod & Zápasy
          </a>
          <a href="#tabulka" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium font-bold text-emerald-800">
            Tabulka soutěže
          </a>
          <a href="#kadr" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Soupiska kádru
          </a>
          <a href="#prestupy" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium font-bold text-blue-900">
            Přestupy ({transfers.length})
          </a>
          <a href="#identita" className="px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100 shrink-0 font-medium">
            Dresy & Maskot
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
                        className="text-blue-800 underline hover:text-red-600 font-bold cursor-pointer"
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

                {/* Upcoming Matches List */}
                {upcomingMatches.length > 1 && (
                  <div className="border border-gray-300 bg-white text-xs">
                    <div className="bg-[#f0f0e8] px-2.5 py-1 font-bold text-gray-800 border-b border-gray-300">
                      📅 Rozlosování nadcházejících kol
                    </div>
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200 text-gray-600">
                          <th className="py-1 px-2">Kolo</th>
                          <th className="py-1 px-2">Zápas</th>
                          <th className="py-1 px-2">Místo</th>
                          <th className="py-1 px-2 text-right">Termín</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingMatches.slice(0, 5).map((m) => (
                          <tr key={m.id} className="border-b border-gray-100 hover:bg-[#fff9cc]">
                            <td className="py-1 px-2 font-mono font-bold text-blue-900">{m.round}.</td>
                            <td className="py-1 px-2 font-bold">
                              {m.isHome ? team.name : m.opponent.name} vs. {m.isHome ? m.opponent.name : team.name}
                            </td>
                            <td className="py-1 px-2 text-gray-600">
                              {m.isHome ? "Doma" : "Venku"} ({m.stadiumName})
                            </td>
                            <td className="py-1 px-2 text-right text-gray-500 font-mono">
                              {m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString("cs-CZ") : "Víkend"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Recent Matches Archive */}
                {recentMatches.length > 1 && (
                  <div className="border border-gray-300 bg-white text-xs">
                    <div className="bg-[#f0f0e8] px-2.5 py-1 font-bold text-gray-800 border-b border-gray-300 flex items-center justify-between">
                      <span>⏮️ Výsledkový servis uplynulých kol</span>
                      <span className="text-[10px] text-gray-500 font-normal">Kliknutím otevřete zápis</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {recentMatches.slice(1, 5).map((rm) => (
                        <div
                          key={rm.id}
                          onClick={() => onOpenHighlights(rm)}
                          className="p-1.5 flex items-center justify-between hover:bg-[#fff9cc] cursor-pointer text-[11px]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-500">{rm.round ? `${rm.round}.k` : "Zápas"}</span>
                            <span className="font-bold">
                              {rm.isHome ? team.name : rm.opponent.name} vs. {rm.isHome ? rm.opponent.name : team.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="bg-black text-yellow-300 font-mono font-bold px-1.5 py-0.2">
                              {rm.scoreHome} : {rm.scoreAway}
                            </span>
                            <span className="text-blue-800 underline text-[10px]">[zápis]</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ═══ TABULKA SOUTĚŽE (OFFICIAL LEAGUE TABLE) ═══ */}
            <section id="tabulka" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Tabulka soutěže</span>
                <span className="text-yellow-300 text-xs font-mono">AKTUÁLNÍ POŘADÍ</span>
              </div>
              <div className="p-2 overflow-x-auto">
                {standings.length > 0 ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f0f0e8] border-b border-gray-400 text-gray-700 font-bold">
                        <th className="py-1 px-1.5 text-center w-8">#</th>
                        <th className="py-1 px-2">Klub / Oddíl</th>
                        <th className="py-1 px-1.5 text-center">Z</th>
                        <th className="py-1 px-1.5 text-center">V</th>
                        <th className="py-1 px-1.5 text-center">R</th>
                        <th className="py-1 px-1.5 text-center">P</th>
                        <th className="py-1 px-2 text-center">Skóre</th>
                        <th className="py-1 px-2 text-center font-black">Body</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row) => (
                        <tr
                          key={row.teamId}
                          className={`border-b border-gray-200 ${
                            row.isCurrentTeam
                              ? "bg-[#fff9cc] font-bold text-blue-900 border-yellow-400"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="py-1 px-1.5 text-center font-mono font-bold">{row.pos}.</td>
                          <td className="py-1 px-2">
                            {row.teamName} {row.isCurrentTeam && <span className="text-[10px] text-red-600 font-normal">◀ NÁŠ KLUB</span>}
                          </td>
                          <td className="py-1 px-1.5 text-center font-mono">{row.played}</td>
                          <td className="py-1 px-1.5 text-center font-mono text-emerald-800">{row.won}</td>
                          <td className="py-1 px-1.5 text-center font-mono text-gray-600">{row.drawn}</td>
                          <td className="py-1 px-1.5 text-center font-mono text-red-800">{row.lost}</td>
                          <td className="py-1 px-2 text-center font-mono text-gray-700">{row.gf}:{row.ga}</td>
                          <td className="py-1 px-2 text-center font-mono font-black text-black bg-black/5">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-500 italic">
                    Tabulka soutěže se aktualizuje po odehrání úvodních kol.
                  </div>
                )}
              </div>
            </section>

            {/* ═══ SOUPISKA - THE LEGENDARY 2004 HTML TABLE! ═══ */}
            <section id="kadr" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Hráčský kádr (Soupiska mužstva)</span>
                <span className="text-yellow-300 text-xs font-mono">SEZÓNA 2004/2005</span>
              </div>
              <div className="bg-[#ece9d8] p-2 border-b border-gray-400 flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-bold text-gray-800 mr-1 font-sans">Kádr:</span>
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("aTeam")}
                    className={`px-3 py-1 border text-xs cursor-pointer ${
                      activeRosterTab === "aTeam"
                        ? "bg-yellow-400 text-black font-bold border-black shadow"
                        : "bg-[#f5f5f0] text-black border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100"
                    }`}
                  >
                    ⚽ A-MUŽSTVO ({roster.aTeam.length})
                  </button>
                  {hasU21 && (
                    <button
                      type="button"
                      onClick={() => setActiveRosterTab("u21Team")}
                      className={`px-3 py-1 border text-xs cursor-pointer ${
                        activeRosterTab === "u21Team"
                          ? "bg-yellow-400 text-black font-bold border-black shadow"
                          : "bg-[#f5f5f0] text-blue-900 font-bold border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-yellow-100"
                      }`}
                    >
                      🌱 B-TÝM / U21 ({roster.u21Team.length} HRÁČŮ)
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2 py-0.5 border text-xs cursor-pointer ${
                      viewMode === "table" ? "bg-blue-900 text-white font-bold" : "bg-gray-200"
                    }`}
                  >
                    Tabulka
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("pitch")}
                    className={`px-2 py-0.5 border text-xs cursor-pointer ${
                      viewMode === "pitch" ? "bg-blue-900 text-white font-bold" : "bg-gray-200"
                    }`}
                  >
                    Taktika
                  </button>
                </div>
              </div>

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

            {/* ═══ PŘESTUPY & ZMĚNY V KÁDRU (2004 WEB 1.0) ═══ */}
            <section id="prestupy" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Pohyby v kádru (Přestupy & Hostování)</span>
                <span className="text-yellow-300 text-xs font-mono">
                  [ Celkem záznamů: {transfers.length} ]
                </span>
              </div>

              {/* Filter tabs */}
              <div className="bg-[#ece9d8] border-b border-gray-400 p-2 flex items-center justify-between gap-2 text-xs flex-wrap">
                <span className="font-bold text-gray-700">Filtrovat zprávy:</span>
                <div className="flex items-center gap-1 font-mono">
                  <button
                    type="button"
                    onClick={() => setTransferFilter("all")}
                    className={`px-2.5 py-0.5 border text-xs cursor-pointer ${
                      transferFilter === "all"
                        ? "bg-yellow-400 text-black font-bold border-black shadow-inner"
                        : "bg-[#f5f5f0] text-black border-t-white border-l-white border-b-gray-600 border-r-gray-600"
                    }`}
                  >
                    Vše ({transfers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferFilter("in")}
                    className={`px-2.5 py-0.5 border text-xs cursor-pointer ${
                      transferFilter === "in"
                        ? "bg-emerald-600 text-white font-bold border-black shadow-inner"
                        : "bg-[#f5f5f0] text-emerald-800 font-bold border-t-white border-l-white border-b-gray-600 border-r-gray-600"
                    }`}
                  >
                    Příchody ({transfers.filter((t) => t.direction === "in").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferFilter("out")}
                    className={`px-2.5 py-0.5 border text-xs cursor-pointer ${
                      transferFilter === "out"
                        ? "bg-red-600 text-white font-bold border-black shadow-inner"
                        : "bg-[#f5f5f0] text-red-800 font-bold border-t-white border-l-white border-b-gray-600 border-r-gray-600"
                    }`}
                  >
                    Odchody ({transfers.filter((t) => t.direction === "out").length})
                  </button>
                </div>
              </div>

              <div className="p-3 space-y-3">
                {filteredTransfers.length > 0 ? (
                  filteredTransfers.map((t) => {
                    const isArrival = t.direction === "in";
                    return (
                      <div
                        key={t.id}
                        className={`p-3 border text-xs ${
                          isArrival
                            ? "bg-[#f3f9f3] border-emerald-400"
                            : "bg-[#fff5f5] border-red-300"
                        }`}
                      >
                        {/* Meta header */}
                        <div className="flex items-center justify-between gap-2 border-b border-gray-300 pb-1.5 mb-2 flex-wrap">
                          <span
                            className={`font-mono font-bold text-[11px] px-1.5 py-0.5 ${
                              isArrival
                                ? "bg-emerald-700 text-white"
                                : "bg-red-700 text-white"
                            }`}
                          >
                            {isArrival ? "[ + PŘÍCHOD DO KÁDRU ]" : "[ - ODCHOD Z KÁDRU ]"}
                          </span>
                          <span className="text-gray-600 text-[11px]">
                            Datum: <strong>{new Date(t.date).toLocaleDateString("cs-CZ")}</strong> · Typ:{" "}
                            <strong>
                              {t.kind === "free_agent"
                                ? "Volný hráč (bez odstupného)"
                                : t.kind === "released"
                                ? "Propuštění / Konec smlouvy"
                                : t.kind === "swap"
                                ? "Hráčská výměna"
                                : "Řádný přestup"}
                            </strong>
                          </span>
                        </div>

                        {/* Headline */}
                        <h4 className="font-bold text-sm text-blue-900 mb-1">
                          {t.headline}
                        </h4>

                        {/* Story */}
                        <p className="text-gray-800 leading-relaxed mb-2 font-serif text-[13px]">
                          {t.story}
                        </p>

                        {/* Grassroots Quote in yellow retro callout */}
                        {t.quote && (
                          <div className="p-2 bg-[#fffde6] border border-yellow-400 border-l-4 border-l-yellow-600 text-gray-800 italic text-[11px] leading-snug">
                            <strong>Komentář výboru TJ:</strong> &ldquo;{t.quote}&rdquo;
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-gray-600 italic bg-[#f9f9f6] border border-dashed border-gray-300">
                    V tomto přestupovém období nejsou v registru hlášeny žádné nové změny.
                  </div>
                )}
              </div>
            </section>

            {/* ═══ DRESY, MASKOT & IDENTITA ═══ */}
            <section id="identita" className="border border-gray-400 bg-white">
              <div className="bg-[#002b66] text-white px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between">
                <span>Klubová kultura, dresy & maskot</span>
                <span className="text-yellow-300 text-xs font-mono">TRADICE ODDÍLU</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Dresy */}
                <div>
                  <h4 className="font-bold text-xs uppercase text-blue-900 mb-2 border-b border-gray-300 pb-1">
                    👕 Oficiální zápasová sada dresů pro tuto sezónu
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Domácí sada */}
                    <div className="border border-gray-300 p-3 bg-[#fbfbf8] flex flex-col items-center">
                      <span className="font-bold text-xs text-gray-800 uppercase mb-2">Domácí dresy</span>
                      <div className="flex items-center justify-center gap-3">
                        <JerseyPreview
                          primary={team.jersey?.homePrimary || primary}
                          secondary={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                          pattern={team.jersey?.pattern || team.jerseyPattern}
                          size={56}
                        />
                        <ShortsPreview
                          color={team.jersey?.homeShortsColor || primary}
                          trim={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                          size={44}
                        />
                        <SocksPreview
                          color={team.jersey?.homeSocksColor || primary}
                          trim={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                          size={44}
                        />
                      </div>
                      <span className="text-[11px] text-gray-600 mt-2 font-mono">Hlavní barva: {primary}</span>
                    </div>

                    {/* Hostující sada */}
                    <div className="border border-gray-300 p-3 bg-[#fbfbf8] flex flex-col items-center">
                      <span className="font-bold text-xs text-gray-800 uppercase mb-2">Venkovní dresy</span>
                      <div className="flex items-center justify-center gap-3">
                        <JerseyPreview
                          primary={team.jersey?.awayPrimary || team.secondaryColor || "#ffffff"}
                          secondary={team.jersey?.awaySecondary || primary}
                          pattern={team.jersey?.awayPattern || team.jerseyPattern}
                          size={56}
                        />
                        <ShortsPreview
                          color={team.jersey?.awayShortsColor || team.secondaryColor || "#ffffff"}
                          trim={team.jersey?.awaySecondary || primary}
                          size={44}
                        />
                        <SocksPreview
                          color={team.jersey?.awaySocksColor || team.secondaryColor || "#ffffff"}
                          trim={team.jersey?.awaySecondary || primary}
                          size={44}
                        />
                      </div>
                      <span className="text-[11px] text-gray-600 mt-2 font-mono">Venkovní barva: {team.secondaryColor || "#ffffff"}</span>
                    </div>
                  </div>
                </div>

                {/* Šála & Maskot */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                  {/* Šála */}
                  <div className="border border-gray-300 p-3 bg-[#fbfbf8]">
                    <h5 className="font-bold text-xs uppercase text-gray-700 mb-2">🧣 Oficiální klubová šála</h5>
                    <div className="py-2 flex items-center justify-center">
                      <ClubScarf
                        primary={team.badge.primary}
                        secondary={team.badge.secondary}
                        pattern={badgePattern}
                        scarfPattern={(team.scarfPattern as any) || "classic"}
                        initials={badgeIni}
                        symbol={team.badge.symbol}
                        className="h-14 w-full shadow-md"
                      />
                    </div>
                  </div>

                  {/* Maskot */}
                  <div className="border border-gray-300 p-3 bg-[#fbfbf8]">
                    <h5 className="font-bold text-xs uppercase text-gray-700 mb-2">🦁 Klubový maskot</h5>
                    {team.mascot?.name ? (
                      <div className="flex items-center gap-3">
                        {team.mascot.imageUrl ? (
                          <img
                            src={team.mascot.imageUrl}
                            alt={team.mascot.name}
                            className="w-16 h-16 rounded border border-gray-400 object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-yellow-100 border border-yellow-400 rounded flex items-center justify-center text-3xl shrink-0">
                            🦁
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-sm text-blue-900">{team.mascot.name}</div>
                          {team.mascot.story && (
                            <p className="text-[11px] text-gray-700 leading-snug mt-1 italic">
                              &ldquo;{team.mascot.story}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic py-2">
                        Oddíl zatím nemá oficiálně registrovaného maskota.
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                <LeagueTeamLinks
          standings={standings}
          className="pt-2 space-y-1 border-t border-gray-400"
          titleClassName="font-bold"
          linkClassName="text-blue-700 underline hover:text-red-600"
        />
      </footer>
      </div>
    </div>
  );
}
