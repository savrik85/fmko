"use client";

import { useState } from "react";
import Link from "next/link";
import type { TemplateProps } from "./types";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf } from "@/components/team/club-scarf";
import { ManagerFace } from "../ManagerFace";
import { TacticalPitch } from "../TacticalPitch";
import { ClubAudioPlayer } from "../ClubAudioPlayer";

export function VillagePatriotTemplate({
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
  const [viewMode, setViewMode] = useState<"cards" | "pitch">("cards");
  const [positionFilter, setPositionFilter] = useState<"all" | "GK" | "DEF" | "MID" | "FWD">("all");
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");

  const primary = team.primaryColor || "#3e2211";
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

  const filteredRoster = positionFilter === "all"
    ? currentRoster
    : currentRoster.filter((p) => {
        const pos = (p.position || "").toUpperCase();
        if (positionFilter === "GK") return pos === "GK" || pos === "BRA";
        if (positionFilter === "DEF") return ["DEF", "OBR", "CB", "LB", "RB", "LWB", "RWB"].includes(pos);
        if (positionFilter === "MID") return ["MID", "ZAL", "ZÁL", "CM", "LM", "RM", "CDM", "CAM", "DM", "AM"].includes(pos);
        if (positionFilter === "FWD") return ["FWD", "UTO", "ÚTO", "ST", "CF", "LW", "RW"].includes(pos);
        return false;
      });

  return (
    <div className="min-h-screen bg-[#f3ebe1] text-[#2c1b0e] font-sans pb-16">
      {/* Wooden Signboard Header */}
      <header className="bg-[#3b2010] text-[#ffebd4] border-b-8 border-[#221006] shadow-2xl relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5 text-center sm:text-left">
            {/* Wooden framed badge */}
            <div className="p-2 bg-[#2a160b] border-2 border-[#5c371e] rounded-xl shadow-inner shrink-0 relative">
              <span className="absolute -top-1 -left-1 text-[10px]">🔩</span>
              <span className="absolute -top-1 -right-1 text-[10px]">🔩</span>
              <span className="absolute -bottom-1 -left-1 text-[10px]">🔩</span>
              <span className="absolute -bottom-1 -right-1 text-[10px]">🔩</span>
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={56}
              />
            </div>

            <div>
              <div className="text-xs uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5 justify-center sm:justify-start">
                <span>🍺</span>
                <span>Vesnický patriot · Krajská fotbalová tradice</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif font-black tracking-tight drop-shadow-md text-[#fff3e4]">
                {team.name}
              </h1>
              <div className="text-xs text-[#d8bca4] mt-1">
                Obec {team.village.name} ({team.village.district}) {team.identity.foundingYear ? `· Založeno roku ${team.identity.foundingYear}` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-4 py-2 bg-[#b85d19] hover:bg-[#a04e12] text-white border-2 border-[#ffbe85] rounded-xl font-serif font-bold text-xs sm:text-sm shadow-lg active:scale-95 transition"
            >
              🎟️ Lístky k stání ({tickets.adultPrice} Kč)
            </button>
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3 py-2 bg-[#2a160b] hover:bg-[#1f0f07] text-[#ffd8b3] border border-[#5c371e] rounded-xl font-bold text-xs transition"
            >
              ← Zpět
            </button>
          </div>
        </div>

        {/* Rustic Quick Nav Links */}
        <div className="bg-[#2a160b] border-t border-[#4a2b16] px-4 sm:px-8 py-2 text-xs text-[#eed8c5] font-serif font-bold flex items-center gap-5 overflow-x-auto">
          <a href="#plakat" className="hover:text-amber-400 shrink-0">📌 Zápasový plakát</a>
          <a href="#tabulka" className="hover:text-amber-400 shrink-0">📊 Tabulka soutěže</a>
          <a href="#nastenka" className="hover:text-amber-400 shrink-0">📋 Vývěska vedení</a>
          <a href="#kadr" className="hover:text-amber-400 shrink-0">🪪 Hráčské registračky</a>
          <a href="#prestupy" className="hover:text-amber-400 shrink-0">📜 Změny v kádru ({transfers.length})</a>
          <a href="#identita" className="hover:text-amber-400 shrink-0">👕 Dresy & Maskot</a>
          <a href="#bufet" className="hover:text-amber-400 shrink-0">🍻 Výčepní tabule</a>
          <a href="#stadion" className="hover:text-amber-400 shrink-0">🏟️ Areál & Udírna</a>
          {hasAudioModule && <a href="#audio" className="text-amber-400 hover:underline shrink-0">📻 Gramofon & Hymna</a>}
        </div>
      </header>

      {/* Sponsor Banner Addon */}
      {hasSponsorBanner && (
        <div className="bg-[#e4d3bf] border-b-2 border-[#b89a7a] py-2 px-4 text-center text-xs font-serif text-[#3e2211]">
          <span className="font-bold text-[#8c3d0b]">⭐ PARTNEŘI NAŠÍ OBECNÍ KOPANÉ: </span>
          <span className="underline font-bold">Pivovar Kocour · Truhlářství Novák & syn · Místní lesní hospodářství</span>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 mt-8 space-y-10">
        {/* ═══ SECTION 1: AUTHENTIC VILLAGE MATCHDAY POSTER (A4 Plakát na sloupu) ═══ */}
        <section id="plakat">
          <div className="bg-[#fefcf8] border-4 border-[#2b170c] rounded-2xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
            {/* Thumbtacks in corners */}
            <span className="absolute top-3 left-4 text-2xl drop-shadow">📌</span>
            <span className="absolute top-3 right-4 text-2xl drop-shadow">📌</span>

            <div className="text-center border-b-2 border-dashed border-[#b89a7a] pb-6">
              <div className="inline-block px-3 py-1 bg-[#8c3d0b] text-white font-serif font-black text-xs uppercase tracking-widest rounded-md mb-2 shadow">
                POZVÁNKA NA FOTBALOVÉ UTKÁNÍ
              </div>
              <h2 className="text-2xl sm:text-5xl font-serif font-black tracking-tight text-[#2b170c] uppercase">
                V sobotu se hraje mistrák!
              </h2>
              <div className="text-sm sm:text-base font-serif italic text-[#704222] mt-1">
                Přijďte fandit našim borcům na místní pažit!
              </div>
            </div>

            {/* Poster Match Card */}
            {nextMatch ? (
              <div className="py-8 grid grid-cols-1 sm:grid-cols-3 items-center gap-6 text-center">
                {/* Home team */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-white border-2 border-[#3b2010] rounded-2xl p-2 shadow-md flex items-center justify-center mb-2">
                    <BadgePreview
                      primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={60}
                    />
                  </div>
                  <div className="font-serif font-black text-xl text-[#2b170c]">
                    {nextMatch.isHome ? team.name : nextMatch.opponent.name}
                  </div>
                  <div className="text-xs text-[#8c3d0b] font-bold mt-0.5">
                    {nextMatch.isHome ? "DOMÁCÍ TÝM" : "HOSTÉ"}
                  </div>
                </div>

                {/* VS and Date */}
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-serif font-black text-[#8c3d0b]">VS</span>
                  <div className="mt-2 text-sm font-serif font-bold text-[#2b170c]">
                    {nextMatch.round ? `${nextMatch.round}. kolo soutěže` : "Mistrovské utkání"}
                  </div>
                  <div className="mt-1 text-xs text-[#6e462c]">
                    🏟️ {nextMatch.stadiumName}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenTickets}
                    className="mt-4 px-5 py-2 bg-[#8c3d0b] hover:bg-[#6e2e07] text-white font-serif font-bold text-xs uppercase rounded-xl shadow-md transition"
                  >
                    Vstupné {tickets.adultPrice} Kč · Koupit
                  </button>
                </div>

                {/* Away team */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-white border-2 border-[#3b2010] rounded-2xl p-2 shadow-md flex items-center justify-center mb-2">
                    <BadgePreview
                      primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={60}
                    />
                  </div>
                  <div className="font-serif font-black text-xl text-[#2b170c]">
                    {!nextMatch.isHome ? team.name : nextMatch.opponent.name}
                  </div>
                  <div className="text-xs text-[#8c3d0b] font-bold mt-0.5">
                    {!nextMatch.isHome ? "DOMÁCÍ TÝM" : "HOSTÉ"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm italic text-gray-600">
                Příští termín utkání zatím nebyl stanoven okresním svazem.
              </div>
            )}

            {/* Poster footer notes */}
            <div className="border-t-2 border-dashed border-[#b89a7a] pt-4 flex flex-col sm:flex-row items-center justify-between text-xs text-[#704222] font-serif gap-2">
              <div>🍺 <strong>Občerstvení:</strong> Klobása z udírny a točené pivo zajištěno!</div>
              <div>🎟️ <strong>Vstupné:</strong> {tickets.adultPrice} Kč (ženy a děti do 15 let zdarma)</div>
            </div>

            {/* Last match bar */}
            {lastMatch && (
              <div className="mt-4 pt-3 border-t border-[#d4b07b] flex flex-col sm:flex-row items-center justify-between text-xs font-serif text-[#5c371e] gap-2">
                <div>
                  <strong>Poslední utkání:</strong> {lastMatch.isHome ? team.name : lastMatch.opponent.name} {lastMatch.scoreHome} : {lastMatch.scoreAway} {lastMatch.isHome ? lastMatch.opponent.name : team.name}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="text-[#8c3d0b] underline hover:text-[#522204] font-bold"
                >
                  Sestřih a zápis z utkání →
                </button>
              </div>
            )}

            {/* Recent matches list if available */}
            {recentMatches.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#d4b07b]">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#8c3d0b] mb-2 font-serif">
                  Poslední odehraná kola
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-serif">
                  {recentMatches.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="p-2 bg-[#fbf7f0] border border-[#d8be9f] rounded-lg flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {m.round}. kolo: <strong>{m.isHome ? team.name : m.opponent.name}</strong> vs {m.isHome ? m.opponent.name : team.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold px-1.5 py-0.5 bg-[#dfcfbd] rounded text-[#2b170c]">
                          {m.scoreHome}:{m.scoreAway}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenHighlights(m)}
                          className="text-[#8c3d0b] hover:underline font-bold text-[11px]"
                        >
                          Zápis
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming fixtures schedule if available */}
            {upcomingMatches.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#d4b07b]">
                <div className="text-[11px] uppercase tracking-wider font-bold text-[#8c3d0b] mb-2 font-serif">
                  Rozpis příštích kol
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-serif">
                  {upcomingMatches.slice(0, 4).map((um) => (
                    <div
                      key={um.id}
                      className="p-2 bg-[#fbf7f0] border border-[#d8be9f] rounded-lg flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {um.round}. kolo: {um.isHome ? "🏠 Doma s" : "✈️ Venku v"} <strong>{um.opponent.name}</strong>
                      </span>
                      <span className="text-[10px] text-[#704222] font-semibold shrink-0">
                        {um.isHome ? "Doma" : "Venku"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: TABULKA SOUTĚŽE (WOODEN BULLETIN BOARD TABLE) ═══ */}
        <section id="tabulka">
          <div className="bg-[#fffdfa] border-2 border-[#cbb092] rounded-3xl p-6 sm:p-8 shadow-md relative font-serif">
            <span className="absolute -top-3 left-8 text-2xl">📌</span>
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#8c3d0b] font-bold">
                  Okresní fotbalový svaz
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[#2b170c]">
                  📊 Průběžná tabulka okresní soutěže
                </h3>
              </div>
              <span className="text-xs text-[#704222] italic">Oficiální pořadí</span>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#ede2d2] border-b-2 border-[#b89a7a] text-[#3e2211] font-bold">
                      <th className="py-2 px-2 text-center w-8">#</th>
                      <th className="py-2 px-3">Mužstvo</th>
                      <th className="py-2 px-2 text-center">Záp.</th>
                      <th className="py-2 px-2 text-center">V</th>
                      <th className="py-2 px-2 text-center">R</th>
                      <th className="py-2 px-2 text-center">P</th>
                      <th className="py-2 px-3 text-center">Skóre</th>
                      <th className="py-2 px-3 text-center font-black">Body</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row) => (
                      <tr
                        key={row.teamId}
                        className={`border-b border-[#e8dccd] ${
                          row.isCurrentTeam
                            ? "bg-[#faedd9] font-black text-[#8c3d0b] border-[#cbb092]"
                            : "hover:bg-[#f7f2eb]"
                        }`}
                      >
                        <td className="py-2 px-2 text-center font-bold">{row.pos}.</td>
                        <td className="py-2 px-3">
                          {row.teamName} {row.isCurrentTeam && <span className="text-[10px] text-[#8c3d0b] font-bold ml-1">📍 NÁŠ ODDÍL</span>}
                        </td>
                        <td className="py-2 px-2 text-center">{row.played}</td>
                        <td className="py-2 px-2 text-center text-emerald-800 font-bold">{row.won}</td>
                        <td className="py-2 px-2 text-center text-gray-700">{row.drawn}</td>
                        <td className="py-2 px-2 text-center text-red-800 font-bold">{row.lost}</td>
                        <td className="py-2 px-3 text-center">{row.gf}:{row.ga}</td>
                        <td className="py-2 px-3 text-center font-black text-[#2b170c] bg-[#e8dccd]/50">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center text-xs italic text-[#704222]">
                Tabulka soutěže se zpracovává po odehrání úvodních mistrovských kol.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 2: VÝVĚSKA VEDENÍ (NOTICE BOARD ANNOUNCEMENT) ═══ */}
        {(hasPressOfficer || website.announcement) && (
          <section id="nastenka">
            <div className="bg-[#fff9e6] border-2 border-[#d4b07b] rounded-2xl p-6 shadow-md relative">
              <span className="absolute -top-3 left-6 text-2xl">📌</span>
              <div className="text-xs font-serif font-bold uppercase tracking-wider text-[#8c3d0b] mb-1">
                Zápis z vývěsky výboru oddílu {hasPressOfficer && "· Tiskový mluvčí"}
              </div>
              <p className="font-serif text-sm sm:text-base italic leading-relaxed text-[#2c1b0e]">
                &ldquo;{website.announcement || `Výbor fotbalového oddílu ${team.name} oznamuje všem členům, sponzorům a příznivcům, že příprava kádru probíhá dle plánu. Hřiště je uválcováno, lajny nataženy a v sobotu se těšíme na hojnou návštěvu u klandru!`}&rdquo;
              </p>
              <div className="text-right text-xs font-serif text-[#8c3d0b] font-bold mt-3">
                — Výbor TJ/FK {team.name}
              </div>
            </div>
          </section>
        )}

        {/* ═══ SECTION 3: ČLENSKÉ PRŮKAZKY FAČR (REGISTRAČKY) ═══ */}
        <section id="kadr" className="scroll-mt-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-serif font-bold uppercase tracking-widest text-[#8c3d0b] mb-1">
                Registrační průkazy
              </div>
              <h2 className="text-2xl sm:text-4xl font-serif font-black text-[#2b170c]">
                Hráčské registračky FAČR
              </h2>
              <div className="text-xs text-[#704222] mt-0.5 font-serif">
                Oficiální soupiska hráčů registrovaných u okresního fotbalového svazu
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-Team vs U21 Team Toggle */}
              <div className="bg-[#dfd1bf] p-1 rounded-xl flex gap-1 text-xs font-serif font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "aTeam"
                      ? "bg-[#3b2010] text-[#ffebd4] shadow"
                      : "text-[#3b2010] hover:bg-[#cfbfab]"
                  }`}
                >
                  ⚽ A-Mužstvo ({roster.aTeam.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("u21Team")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "u21Team"
                      ? "bg-[#3b2010] text-[#ffebd4] shadow"
                      : "text-[#3b2010] hover:bg-[#cfbfab]"
                  }`}
                >
                  🌱 Dorost / B-Tým ({roster.u21Team?.length || 0})
                </button>
              </div>

              {/* Cards vs Pitch view toggle */}
              <div className="bg-[#dfd1bf] p-1 rounded-xl flex gap-1 text-xs font-serif font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1 rounded-lg ${viewMode === "cards" ? "bg-[#3b2010] text-[#ffebd4]" : "text-[#3b2010]"}`}
                >
                  🪪 Průkazky
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1 rounded-lg ${viewMode === "pitch" ? "bg-[#3b2010] text-[#ffebd4]" : "text-[#3b2010]"}`}
                >
                  ⚽ Na hřišti
                </button>
              </div>
            </div>
          </div>

          {/* Position Filters */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap text-xs font-serif font-bold">
            {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
              const label = pos === "all" ? "Všechny posty" : pos === "GK" ? "Brankáři" : pos === "DEF" ? "Obránci" : pos === "MID" ? "Záložníci" : "Útočníci";
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    positionFilter === pos
                      ? "bg-[#8c3d0b] text-white border-[#5e2704] shadow-sm"
                      : "bg-[#fbf7f0] text-[#3e2211] border-[#cbb399] hover:bg-[#ede1d1]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {viewMode === "pitch" ? (
            <div className="bg-[#fbf7f0] border-2 border-[#b89a7a] rounded-2xl p-6 shadow-md">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={team.secondaryColor || "#ffffff"}
              />
            </div>
          ) : (
            /* ═══ GRID OF AUTHENTIC FAČR REGISTRATION CARDS ═══ */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRoster.map((player) => (
                <div
                  key={player.id}
                  className="bg-[#fffdfa] border-2 border-[#8c5d38] rounded-xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between hover:shadow-lg transition-transform"
                >
                  {/* Fake Red Stamp Watermark */}
                  <div className="absolute right-2 bottom-8 text-[#d13a3a]/15 font-black text-xl uppercase font-serif rotate-[-18deg] pointer-events-none border-2 border-[#d13a3a]/15 p-1 rounded">
                    FAČR REGISTROVÁNO
                  </div>

                  <div>
                    {/* Header of Registration card */}
                    <div className="flex items-center justify-between border-b border-[#dfcfbd] pb-2 mb-3 text-[10px] font-serif font-bold text-[#8c3d0b] uppercase">
                      <span>ČESKOMORAVSKÝ FOTBALOVÝ SVAZ</span>
                      <span># {player.squadNumber ?? "—"}</span>
                    </div>

                    <div className="flex items-start gap-3.5">
                      {/* Photo with simulated staple */}
                      <div className="w-16 h-20 rounded-md overflow-hidden bg-[#e0d3c1] border border-[#a88a6d] shrink-0 shadow-inner flex items-center justify-center relative">
                        <span className="absolute top-0.5 left-1 text-[10px] text-gray-600">📎</span>
                        <ManagerFace faceConfig={player.avatar} size={60} />
                      </div>

                      <div className="min-w-0 flex-1 font-serif">
                        <div className="text-[10px] uppercase font-bold text-[#8c3d0b]">
                          {player.positionName || player.position}
                        </div>
                        <div className="font-black text-base sm:text-lg text-[#2b170c] leading-tight truncate">
                          {player.lastName}
                        </div>
                        <div className="text-xs text-[#704222] font-semibold truncate">
                          {player.firstName}
                        </div>
                        <div className="text-[11px] text-[#8c5d38] mt-1">
                          Věk: <strong>{player.age} let</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card bottom registration stats */}
                  <div className="mt-4 pt-3 border-t border-[#dfcfbd] grid grid-cols-3 gap-2 text-center text-xs font-serif">
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-[9px] text-[#704222] font-bold">ZÁPASY</div>
                      <div className="font-black text-[#2b170c]">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-[9px] text-[#704222] font-bold">GÓLY</div>
                      <div className="font-black text-[#8c3d0b]">{player.stats.goals}</div>
                    </div>
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-[9px] text-[#704222] font-bold">MINUTY</div>
                      <div className="font-black text-[#2b170c]">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION: ZMĚNY V KÁDRU A PŘESTUPY (VILLAGE NOTICE) ═══ */}
        <section id="prestupy" className="scroll-mt-16">
          <div className="bg-[#fffdfa] border-2 border-[#b89a7a] rounded-3xl p-6 sm:p-8 shadow-md font-serif">
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#8c3d0b] font-bold">
                  Přestupový lístek FAČR
                </div>
                <h3 className="text-xl sm:text-3xl font-black text-[#2b170c]">
                  📜 Pohyby v kádru & Přestupy
                </h3>
              </div>

              {/* Transfer filter tabs */}
              <div className="flex gap-1.5 text-xs">
                {(["all", "in", "out"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTransferFilter(tab)}
                    className={`px-3 py-1 rounded-lg border font-bold transition ${
                      transferFilter === tab
                        ? "bg-[#8c3d0b] text-white border-[#5e2704] shadow-sm"
                        : "bg-[#f5ede1] text-[#3e2211] border-[#dfcfbd] hover:bg-[#ebd9c3]"
                    }`}
                  >
                    {tab === "all" ? `Všechny (${transfers.length})` : tab === "in" ? "Příchody" : "Odchody"}
                  </button>
                ))}
              </div>
            </div>

            {filteredTransfers.length > 0 ? (
              <div className="space-y-4">
                {filteredTransfers.map((t) => {
                  const isIn = t.direction === "in";
                  return (
                    <div
                      key={t.id}
                      className="p-4 bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl relative"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                            isIn ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          {isIn ? "🟢 Příchod" : "🔴 Odchod"} · {t.kind === "free_agent" ? "Volný hráč" : t.kind === "released" ? "Uvolnění" : t.kind === "swap" ? "Výměna" : "Přestup"}
                        </span>
                        <span className="text-xs text-[#704222] font-semibold">
                          Odstupné: <strong className="text-[#2b170c]">{t.fee > 0 ? `${t.fee.toLocaleString("cs-CZ")} Kč` : "Bez odstupného"}</strong>
                        </span>
                      </div>

                      <h4 className="font-bold text-base text-[#2b170c] mb-1">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-[#4a2e18] leading-relaxed mb-3">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-[#fff8e7] border-l-4 border-[#8c3d0b] rounded-r-xl text-xs italic text-[#3e2211]">
                          <strong>Hlas z kabiny:</strong> &ldquo;{t.quote}&rdquo;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs italic text-[#704222]">
                Žádné hlášené přestupy ani změny v registračkách v tomto období.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: KLUBOVÁ IDENTITA, DRESY A MASKOT ═══ */}
        <section id="identita" className="scroll-mt-16 font-serif">
          <div className="bg-[#fffdfa] border-2 border-[#b89a7a] rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3">
              <div className="text-xs uppercase tracking-widest text-[#8c3d0b] font-bold">
                Klubové barvy a symboly
              </div>
              <h3 className="text-xl sm:text-3xl font-black text-[#2b170c]">
                👕 Zápasová výstroj & Tradice oddílu
              </h3>
            </div>

            {/* Dresy Domácí / Venkovní */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-bold text-[#8c3d0b] mb-3">
                  Domácí zápasová sada
                </span>
                <div className="flex items-center justify-center gap-4 py-2">
                  <JerseyPreview
                    primary={team.jersey?.homePrimary || primary}
                    secondary={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                    pattern={team.jersey?.pattern || team.jerseyPattern}
                    size={64}
                  />
                  <ShortsPreview
                    color={team.jersey?.homeShortsColor || primary}
                    trim={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                    size={48}
                  />
                  <SocksPreview
                    color={team.jersey?.homeSocksColor || primary}
                    trim={team.jersey?.homeSecondary || team.secondaryColor || "#ffffff"}
                    size={48}
                  />
                </div>
                <div className="text-xs text-[#704222] mt-3">
                  Tradiční barva oddílu: <strong className="text-[#2b170c]">{primary}</strong>
                </div>
              </div>

              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-bold text-[#8c3d0b] mb-3">
                  Venkovní záložní sada
                </span>
                <div className="flex items-center justify-center gap-4 py-2">
                  <JerseyPreview
                    primary={team.jersey?.awayPrimary || team.secondaryColor || "#ffffff"}
                    secondary={team.jersey?.awaySecondary || primary}
                    pattern={team.jersey?.awayPattern || team.jerseyPattern}
                    size={64}
                  />
                  <ShortsPreview
                    color={team.jersey?.awayShortsColor || team.secondaryColor || "#ffffff"}
                    trim={team.jersey?.awaySecondary || primary}
                    size={48}
                  />
                  <SocksPreview
                    color={team.jersey?.awaySocksColor || team.secondaryColor || "#ffffff"}
                    trim={team.jersey?.awaySecondary || primary}
                    size={48}
                  />
                </div>
                <div className="text-xs text-[#704222] mt-3">
                  Náhradní barva: <strong className="text-[#2b170c]">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            {/* Šála & Maskot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#d8be9f]">
              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-bold text-[#8c3d0b] mb-3">
                  🧣 Pletená fanklubová šála
                </h4>
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as any) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-md rounded"
                />
              </div>

              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-bold text-[#8c3d0b] mb-3">
                  🦁 Patron & Maskot oddílu
                </h4>
                {team.mascot?.name ? (
                  <div className="flex items-center gap-4">
                    {team.mascot.imageUrl ? (
                      <img
                        src={team.mascot.imageUrl}
                        alt={team.mascot.name}
                        className="w-16 h-16 rounded-xl border border-[#b89a7a] object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-amber-100 border border-amber-300 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-base text-[#2b170c]">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-xs text-[#704222] italic mt-1 leading-snug">
                          &ldquo;{team.mascot.story}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#704222] italic py-3">
                    Oddíl zatím nemá zapsaného oficiálního maskota.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 4: VÝČEPNÍ TABULE (PUB CHALKBOARD BUFET) ═══ */}
        <section id="bufet">
          <div className="bg-[#242b24] text-[#f2efe9] border-8 border-[#52331c] rounded-3xl p-6 sm:p-10 shadow-2xl relative">
            <div className="text-center border-b-2 border-dashed border-[#445944] pb-4 mb-6">
              <div className="text-xs uppercase tracking-widest text-[#ffd97d] font-serif font-bold">
                Místní hospoda & kiosek
              </div>
              <h2 className="text-2xl sm:text-4xl font-serif font-black text-[#ffffff]">
                🍺 Dnes na čepu a v udírně
              </h2>
              <div className="text-xs text-[#a3b8a3] mt-1 font-serif italic">
                Klubový bufet otevřen 60 minut před výkopem i po zápase do vypití sudů!
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-serif">
              <div className="bg-[#1b211b] border border-[#3b473b] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-1">🍺</div>
                  <div className="text-lg font-bold text-white">{concessions.beerName}</div>
                  <div className="text-xs text-[#a3b8a3]">Poctivé točené chlazené pivo</div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#ffd97d]">
                  {concessions.beerPrice} Kč
                </div>
              </div>

              <div className="bg-[#1b211b] border border-[#3b473b] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-1">🌭</div>
                  <div className="text-lg font-bold text-white">{concessions.sausageName}</div>
                  <div className="text-xs text-[#a3b8a3]">Z udírny, chléb, plnotučná hořčice</div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#ffd97d]">
                  {concessions.sausagePrice} Kč
                </div>
              </div>

              <div className="bg-[#1b211b] border border-[#3b473b] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-3xl mb-1">🥤</div>
                  <div className="text-lg font-bold text-white">{concessions.lemonadeName}</div>
                  <div className="text-xs text-[#a3b8a3]">Tradiční točená malinovka 0.5l</div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#ffd97d]">
                  {concessions.lemonadePrice} Kč
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: AREÁL HŘIŠTĚ & KABINY ═══ */}
        <section id="stadion">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs font-serif font-bold uppercase tracking-widest text-[#8c3d0b]">
                Náš domovský areál
              </div>
              <h2 className="text-2xl sm:text-4xl font-serif font-black text-[#2b170c]">
                Stadion & zázemí {team.stadium.name}
              </h2>
            </div>
            {hasStadiumGallery && (
              <span className="px-3 py-1 bg-[#8c3d0b] text-white rounded-full font-serif font-bold text-xs shadow">
                📸 Odemčená fotogalerie (4 foto)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-tribuna.jpg",
                  title: "Dřevěná krytá tribuna",
                  desc: "Místní tribuna pro diváky a stání podél klandru",
                })
              }
              className="bg-white border-2 border-[#b89a7a] p-3 rounded-2xl shadow-md cursor-pointer hover:border-[#8c3d0b] transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden shadow">
                <img src="/images/stadion-tribuna.jpg" alt="Tribuna" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2 font-serif font-bold text-sm text-[#2b170c]">Dřevěná krytá tribuna</div>
              <div className="text-xs text-[#704222] font-serif">Místo pro věrné fanoušky a pamětníky</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kiosek.jpg",
                  title: "Klubový kiosek",
                  desc: "Výčep točeného piva a udírna u střídaček",
                })
              }
              className="bg-white border-2 border-[#b89a7a] p-3 rounded-2xl shadow-md cursor-pointer hover:border-[#8c3d0b] transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden shadow">
                <img src="/images/stadion-kiosek.jpg" alt="Kiosek" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2 font-serif font-bold text-sm text-[#2b170c]">Hospůdka & Kiosek</div>
              <div className="text-xs text-[#704222] font-serif">Kde se probírá taktika i rozhodčí</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kabiny.jpg",
                  title: "Kabiny a šatny",
                  desc: "Šatny domácích, hostů a rozhodčích",
                })
              }
              className="bg-white border-2 border-[#b89a7a] p-3 rounded-2xl shadow-md cursor-pointer hover:border-[#8c3d0b] transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden shadow">
                <img src="/images/stadion-kabiny.jpg" alt="Kabiny" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2 font-serif font-bold text-sm text-[#2b170c]">Kabiny & Zázemí</div>
              <div className="text-xs text-[#704222] font-serif">Šatny hráčů, sprchy a tabule na taktiku</div>
            </div>

            {hasStadiumGallery && (
              <div
                onClick={() =>
                  onOpenLightbox({
                    src: "/images/stadion-areal.jpg",
                    title: "Panoráma areálu",
                    desc: "Celkový pohled na fotbalové hřiště a obec",
                  })
                }
                className="bg-white border-2 border-[#b89a7a] p-3 rounded-2xl shadow-md cursor-pointer hover:border-[#8c3d0b] transition sm:col-span-2 lg:col-span-3"
              >
                <div className="aspect-[16/9] max-h-64 rounded-xl overflow-hidden shadow">
                  <img src="/images/stadion-areal.jpg" alt="Areál" className="w-full h-full object-cover" />
                </div>
                <div className="mt-2 font-serif font-bold text-sm text-[#2b170c]">Panoramatický pohled na celé hřiště</div>
                <div className="text-xs text-[#704222] font-serif">Krásný vesnický pažit v obci {team.village.name}</div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 6: KLUBOVÝ TRANZISTORÁK (AUDIO ADDON) ═══ */}
        {hasAudioModule && (
          <section id="audio">
            <div className="bg-[#ebd9c3] border-4 border-[#8c5d38] rounded-2xl p-6 shadow-md">
              <div className="text-xs font-serif font-bold uppercase tracking-widest text-[#8c3d0b] mb-1 flex items-center gap-1.5">
                <span>📻</span>
                <span>Klubový gramofon a rádio v kabině</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-serif font-black text-[#2b170c] mb-4">
                Hymna a chorály oddílu {team.name}
              </h2>
              <ClubAudioPlayer
                teamName={team.name}
                anthem={team.anthem}
                chants={team.chants}
              />
            </div>
          </section>
        )}
      </main>

      {/* Rustic Footer */}
      <footer className="max-w-5xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t-2 border-[#b89a7a] text-xs text-[#704222] font-serif text-center space-y-1">
        <div>
          Oficiální vesnická vývěska oddílu {team.name} · Šablona <strong>Vesnický patriot</strong>
        </div>
        <div>
          Foceno a psáno s láskou k českému okresnímu fotbalu. Všechna práva vyhrazena.
        </div>
      </footer>
    </div>
  );
}
