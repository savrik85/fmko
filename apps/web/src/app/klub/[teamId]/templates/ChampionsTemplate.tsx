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

export function ChampionsTemplate({
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

  const primary = team.primaryColor || "#0284c7";
  const secondary = team.secondaryColor || "#fbbf24";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : (roster.u21Team || []);
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
    <div className="min-h-screen bg-[#020510] text-white font-sans pb-20 selection:bg-cyan-500 selection:text-black relative overflow-hidden">
      {/* Background Starry Dust & Aurora */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-600/10 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none" />

      {/* Floating Glassmorphic Header */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-white/5 border-b border-cyan-500/20 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={54}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-400/30 text-[9px] font-heading font-black tracking-widest uppercase">
                  CHAMPIONS PORTAL
                </span>
                <span className="text-[11px] text-cyan-200/50 font-heading font-bold">
                  {team.village.name}
                </span>
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl tracking-tight text-white uppercase mt-0.5">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-heading font-black text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(6,182,212,0.5)] active:scale-95 transition"
            >
              VIP VSTUPENKY ({tickets.adultPrice} Kč)
            </button>
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-xs transition border border-white/10"
            >
              ← Zpět
            </button>
          </div>
        </div>

        {/* Glass Navigation Strip */}
        <div className="border-t border-white/5 px-4 sm:px-8 py-2 text-xs font-heading font-bold text-cyan-100/70 flex items-center gap-6 overflow-x-auto">
          <a href="#arena" className="hover:text-cyan-300 shrink-0 flex items-center gap-1.5 text-cyan-400">
            <span>✨</span>
            <span>CHAMPIONS HUB</span>
          </a>
          <a href="#tabulka" className="hover:text-cyan-300 shrink-0">TABULKA SOUTĚŽE</a>
          <a href="#kadr" className="hover:text-cyan-300 shrink-0">HOLOGRAPHIC SQUAD</a>
          <a href="#prestupy" className="hover:text-cyan-300 shrink-0">PŘESTUPY ({transfers.length})</a>
          <a href="#identita" className="hover:text-cyan-300 shrink-0">DRESY & PRESTIGE</a>
          <a href="#stadion" className="hover:text-cyan-300 shrink-0">EXECUTIVE STADIUM</a>
          <a href="#vip-gastro" className="hover:text-cyan-300 shrink-0">VIP LOUNGE & GASTRO</a>
          {hasAudioModule && <a href="#audio" className="text-amber-400 hover:text-amber-300 shrink-0">AUDIO SUITE</a>}
        </div>
      </header>

      {/* Luxury Sponsor Ribbon */}
      {hasSponsorBanner && (
        <div className="bg-gradient-to-r from-[#030d22] via-[#061838] to-[#030d22] border-b border-cyan-500/20 py-2.5 px-4 text-xs font-heading text-center text-cyan-200 flex items-center justify-center gap-3 flex-wrap">
          <span className="font-black text-amber-400 uppercase text-[10px] tracking-widest flex items-center gap-1">
            <span>🏆</span>
            <span>OFICIÁLNÍ PARTNEŘI KLUBU:</span>
          </span>
          <span className="font-bold text-white tracking-wide">Pivovar Kocour · Lesní správa a.s. · Truhlářství Novák</span>
          <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded text-[9px] font-black border border-cyan-400/30">PLATINUM PARTNER</span>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-12">
        {/* Press Announcement Box */}
        {(hasPressOfficer || website.announcement) && (
          <div className="backdrop-blur-xl bg-white/5 border border-cyan-500/30 p-6 rounded-3xl shadow-[0_0_30px_rgba(6,182,212,0.15)] flex items-start gap-4">
            <span className="text-3xl shrink-0 mt-0.5 text-cyan-400">💎</span>
            <div>
              <div className="text-[10px] font-heading font-black uppercase tracking-widest text-cyan-400 mb-1">
                OFICIÁLNÍ PROHLÁŠENÍ VEDENÍ {hasPressOfficer && "· TISKOVÝ MLUVČÍ"}
              </div>
              <p className="text-white/90 text-sm italic font-medium leading-relaxed">
                &ldquo;{website.announcement || `Vedení fotbalového klubu ${team.name} srdečně zdraví všechny partnery, sponzory a věrné fanoušky. Věříme v excelentní sportovní výkony na evropské úrovni!`}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ═══ SECTION 1: CHAMPIONS MATCH HUB ═══ */}
        <section id="arena" className="scroll-mt-20">
          <div className="backdrop-blur-2xl bg-gradient-to-br from-[#07132c]/80 via-[#040c1d]/90 to-[#020612] border border-cyan-500/30 rounded-3xl p-6 sm:p-10 shadow-[0_0_50px_rgba(6,182,212,0.2)] relative overflow-hidden">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-heading font-black text-xs uppercase tracking-widest flex items-center gap-1.5 border border-cyan-400/30">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  GRAND MATCHDAY
                </span>
                <span className="text-xs text-white/50 font-heading font-bold hidden sm:inline">
                  {nextMatch?.round ? `${nextMatch.round}. KOLO MISTROVSTVÍ` : "EVROPSKÝ ZÁPAS"}
                </span>
              </div>
              {/* Form Guide Pills */}
              <div className="flex items-center gap-1 text-[10px] font-heading font-black">
                <span className="text-white/40 mr-1 hidden sm:inline">FORMA TÝMU:</span>
                <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center">V</span>
                <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center">V</span>
                <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 border border-amber-400/30 flex items-center justify-center">R</span>
                <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center">V</span>
                <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center">V</span>
              </div>
            </div>

            {nextMatch ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-8 py-4">
                {/* Home team */}
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-3xl bg-white/5 border border-cyan-500/30 p-2 shadow-[0_0_30px_rgba(6,182,212,0.25)] flex items-center justify-center mb-3">
                    <BadgePreview
                      primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={68}
                    />
                  </div>
                  <div className="font-heading font-black text-xl sm:text-2xl text-white uppercase tracking-tight text-center">
                    {nextMatch.isHome ? team.name : nextMatch.opponent.name}
                  </div>
                  <div className="text-[11px] font-heading font-bold text-cyan-400 mt-1 uppercase">
                    {nextMatch.isHome ? "Domácí celek" : "Hostující celek"}
                  </div>
                </div>

                {/* Score / VS Center */}
                <div className="flex flex-col items-center text-center">
                  <div className="px-6 py-2 rounded-2xl bg-cyan-950/40 border border-cyan-400/40 text-3xl sm:text-5xl font-heading font-black tracking-widest text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                    VS
                  </div>
                  <div className="text-xs font-heading font-bold text-cyan-200 mt-3">
                    {nextMatch.scheduledAt ? new Date(nextMatch.scheduledAt).toLocaleDateString("cs-CZ") : "VÍKENDOVÝ ZÁPAS"}
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">
                    🏟️ {nextMatch.stadiumName}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenTickets}
                    className="mt-5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-heading font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition"
                  >
                    VIP VSTUPENKY ({tickets.adultPrice} Kč)
                  </button>
                </div>

                {/* Away team */}
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-3xl bg-white/5 border border-cyan-500/30 p-2 shadow-[0_0_30px_rgba(6,182,212,0.25)] flex items-center justify-center mb-3">
                    <BadgePreview
                      primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={68}
                    />
                  </div>
                  <div className="font-heading font-black text-xl sm:text-2xl text-white uppercase tracking-tight text-center">
                    {!nextMatch.isHome ? team.name : nextMatch.opponent.name}
                  </div>
                  <div className="text-[11px] font-heading font-bold text-cyan-400 mt-1 uppercase">
                    {!nextMatch.isHome ? "Domácí celek" : "Hostující celek"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-white/40 text-sm font-heading">
                Žádný nadcházející zápas v programu.
              </div>
            )}

            {/* Last match bar */}
            {lastMatch && (
              <div className="mt-8 pt-4 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-heading">
                <div className="text-white/60">
                  POSLEDNÍ VÝSLEDEK ({lastMatch.round ? `${lastMatch.round}. KOLO` : "UTKÁNÍ"}):{" "}
                  <strong className="text-cyan-300">
                    {lastMatch.isHome ? team.name : lastMatch.opponent.name} {lastMatch.scoreHome} : {lastMatch.scoreAway} {lastMatch.isHome ? lastMatch.opponent.name : team.name}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-400/30 transition"
                >
                  ▶ REPORTÁŽ & HIGHLIGHTS
                </button>
              </div>
            )}

            {/* Champions Fixtures Grid */}
            {(recentMatches.length > 0 || upcomingMatches.length > 0) && (
              <div className="mt-8 pt-6 border-t border-cyan-500/20 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent matches */}
                {recentMatches.length > 0 && (
                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                      <span className="font-heading font-black text-xs uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <span>✨</span> VÝSLEDKY POSLEDNÍCH KOL
                      </span>
                    </div>
                    <div className="space-y-2">
                      {recentMatches.slice(0, 4).map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 bg-black/40 border border-cyan-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="truncate">
                            <span className="text-[10px] text-cyan-400 uppercase mr-1.5 font-mono">{m.round}.k</span>
                            <span className="font-bold text-white">
                              {m.isHome ? team.name : m.opponent.name} vs {m.isHome ? m.opponent.name : team.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/40 rounded text-cyan-200 font-mono">
                              {m.scoreHome}:{m.scoreAway}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenHighlights(m)}
                              className="text-cyan-400 hover:text-cyan-300 font-bold text-[11px]"
                            >
                              Sestřih
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming fixtures */}
                {upcomingMatches.length > 0 && (
                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                      <span className="font-heading font-black text-xs uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <span>🗓️</span> NADCHÁZEJÍCÍ PROGRAM
                      </span>
                    </div>
                    <div className="space-y-2">
                      {upcomingMatches.slice(0, 4).map((um) => (
                        <div
                          key={um.id}
                          className="p-2.5 bg-black/40 border border-cyan-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="truncate">
                            <span className="text-[10px] text-cyan-400 uppercase mr-1.5 font-mono">{um.round}.k</span>
                            <span className="font-semibold text-white/90">
                              {um.isHome ? "DOMA: " : "VENKU: "} <strong>{um.opponent.name}</strong>
                            </span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase font-mono ${
                            um.isHome ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30" : "bg-white/10 text-white/70"
                          }`}>
                            {um.isHome ? "DOMA" : "VENKU"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: TABULKA SOUTĚŽE (CHAMPIONS LEAGUE TABLE) ═══ */}
        <section id="tabulka" className="scroll-mt-20">
          <div className="bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6 border-b border-cyan-500/20 pb-4 flex-wrap gap-2">
              <div>
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400">
                  OFICIÁLNÍ ŽEBŘÍČEK
                </div>
                <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Ligová tabulka
                </h3>
              </div>
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-full text-xs font-heading font-black">
                LIVE UPDATE
              </span>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-cyan-200/60 font-heading font-black text-[11px] uppercase tracking-wider border-b border-cyan-500/20">
                      <th className="py-3 px-3 text-center w-12">POŘ.</th>
                      <th className="py-3 px-3">KLUB</th>
                      <th className="py-3 px-2 text-center">Z</th>
                      <th className="py-3 px-2 text-center text-emerald-400">V</th>
                      <th className="py-3 px-2 text-center text-slate-400">R</th>
                      <th className="py-3 px-2 text-center text-red-400">P</th>
                      <th className="py-3 px-3 text-center">SKÓRE</th>
                      <th className="py-3 px-4 text-center font-black text-white">BODY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-sans">
                    {standings.map((row) => (
                      <tr
                        key={row.teamId}
                        className={`transition ${
                          row.isCurrentTeam
                            ? "bg-cyan-500/20 font-bold text-white border-l-4 border-l-cyan-400 shadow-inner"
                            : "hover:bg-white/5 text-white/80"
                        }`}
                      >
                        <td className="py-3 px-3 text-center font-heading font-black text-cyan-300/70">
                          {row.pos}.
                        </td>
                        <td className="py-3 px-3 font-semibold">
                          {row.teamName} {row.isCurrentTeam && <span className="text-[10px] font-black text-cyan-300 ml-2 px-2 py-0.5 bg-cyan-500/30 border border-cyan-400/40 rounded">NÁŠ TÝM</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono">{row.played}</td>
                        <td className="py-3 px-2 text-center font-mono text-emerald-400 font-bold">{row.won}</td>
                        <td className="py-3 px-2 text-center font-mono text-white/60">{row.drawn}</td>
                        <td className="py-3 px-2 text-center font-mono text-red-400 font-bold">{row.lost}</td>
                        <td className="py-3 px-3 text-center font-mono">{row.gf}:{row.ga}</td>
                        <td className="py-3 px-4 text-center font-heading font-black text-cyan-300 text-sm bg-black/40">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-cyan-200/40 italic font-heading">
                Ligová tabulka bude publikována po odehrání úvodních mistrovských utkání.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 2: HOLOGRAPHIC SQUAD CARDS ═══ */}
        <section id="kadr" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400 mb-1">
                ELITE SQUAD
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase">
                Holografické karty kádru
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-Team vs U21 Toggle */}
              <div className="backdrop-blur-xl bg-white/5 p-1 rounded-xl border border-white/10 flex gap-1 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "aTeam"
                      ? "bg-cyan-500 text-black font-black shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  ⚽ A-TÝM ({roster.aTeam.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("u21Team")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "u21Team"
                      ? "bg-cyan-500 text-black font-black shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  🌱 DOROST U21 ({roster.u21Team?.length || 0})
                </button>
              </div>

              <div className="backdrop-blur-xl bg-white/5 p-1 rounded-xl border border-white/10 flex gap-1 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-cyan-500 text-black font-black shadow" : "text-white/60"}`}
                >
                  HOLO KARTY
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-cyan-500 text-black font-black shadow" : "text-white/60"}`}
                >
                  TAKTIKA 11
                </button>
              </div>
            </div>
          </div>

          {/* Position Filters */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap text-xs font-heading font-bold">
            {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
              const label = pos === "all" ? "VŠICHNI" : pos === "GK" ? "BRANKÁŘI" : pos === "DEF" ? "OBRÁNCI" : pos === "MID" ? "ZÁLOŽNÍCI" : "ÚTOČNÍCI";
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  className={`px-4 py-1.5 rounded-lg uppercase tracking-wider transition ${
                    positionFilter === pos
                      ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-black shadow-lg"
                      : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {viewMode === "pitch" ? (
            <div className="backdrop-blur-xl bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-10 shadow-2xl">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={secondary}
              />
            </div>
          ) : (
            /* ═══ HOLOGRAPHIC SQUAD CARDS GRID ═══ */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((player) => (
                <div
                  key={player.id}
                  className="backdrop-blur-xl bg-gradient-to-b from-white/10 via-white/5 to-[#050e20] border border-cyan-500/30 rounded-2xl p-4 shadow-[0_4px_25px_rgba(6,182,212,0.15)] relative overflow-hidden group hover:border-cyan-400 hover:scale-[1.02] transition-all flex flex-col justify-between"
                >
                  {/* Subtle iridescent glow */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/0 via-cyan-500/5 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <div>
                    {/* Top Row: OVR Rating & Position */}
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-cyan-400 text-black font-heading font-black text-xs shadow">
                          {player.overallRating || 78} ★
                        </span>
                        <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-cyan-300">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <span className="text-xs font-heading font-black text-white/40">
                        #{player.squadNumber ?? "-"}
                      </span>
                    </div>

                    {/* Avatar Portrait */}
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-16 h-18 rounded-xl overflow-hidden bg-black/40 border border-cyan-500/30 shrink-0 flex items-center justify-center shadow-inner group-hover:border-cyan-400 transition-colors">
                        <ManagerFace faceConfig={player.avatar} size={58} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-heading font-black text-base text-white uppercase tracking-tight truncate">
                          {player.lastName}
                        </div>
                        <div className="text-xs text-white/60 font-semibold truncate">
                          {player.firstName}
                        </div>
                        <div className="text-[11px] text-cyan-400/80 mt-1 font-heading font-bold">
                          {player.age} let
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Holographic Stats */}
                  <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-1 text-center font-heading relative z-10">
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-cyan-200/50 font-bold uppercase">ZÁPASY</div>
                      <div className="font-black text-sm text-white">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-cyan-200/50 font-bold uppercase">GÓLY</div>
                      <div className="font-black text-sm text-cyan-300">{player.stats.goals}</div>
                    </div>
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-cyan-200/50 font-bold uppercase">MINUTY</div>
                      <div className="font-black text-sm text-white">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION: PŘESTUPOVÁ ARÉNA (CHAMPIONS TRANSFERS) ═══ */}
        <section id="prestupy" className="scroll-mt-20">
          <div className="bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6 border-b border-cyan-500/20 pb-4 flex-wrap gap-3">
              <div>
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400">
                  GLOBAL TRANSFER MARKET
                </div>
                <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Pohyby v kádru & Transakce
                </h3>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1.5 text-xs font-heading font-bold">
                {(["all", "in", "out"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTransferFilter(tab)}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      transferFilter === tab
                        ? "bg-cyan-500 text-black font-black border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {tab === "all" ? `VŠECHNY (${transfers.length})` : tab === "in" ? "PŘÍCHODY" : "ODCHODY"}
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
                      className="p-4 sm:p-5 bg-black/40 border border-cyan-500/20 rounded-2xl transition hover:border-cyan-400/40"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wider ${
                            isIn
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {isIn ? "🟢 PŘÍCHOD" : "🔴 ODCHOD"} · {t.kind === "free_agent" ? "VOLNÝ HRÁČ" : t.kind === "released" ? "UVOLNĚNÍ" : t.kind === "swap" ? "VÝMĚNA" : "PŘESTUP"}
                        </span>
                        <span className="text-xs text-white/50 font-medium">
                          FEE: <strong className="text-cyan-300 font-mono">{t.fee > 0 ? `${t.fee.toLocaleString("cs-CZ")} Kč` : "BEZ ODSTUPNÉHO"}</strong>
                        </span>
                      </div>

                      <h4 className="font-heading font-bold text-base text-white mb-1">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-cyan-100/70 leading-relaxed mb-3">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-white/5 border-l-4 border-cyan-400 rounded-r-xl text-xs italic text-cyan-100/90">
                          <strong>Komentář vedení:</strong> &ldquo;{t.quote}&rdquo;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-cyan-200/40 italic font-heading">
                V tomto přestupovém období nejsou v systému žádné hlášené transakce.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: KLUBOVÁ IDENTITA, DRESY & MASKOT ═══ */}
        <section id="identita" className="scroll-mt-20">
          <div className="bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 backdrop-blur-xl">
            <div className="border-b border-cyan-500/20 pb-4">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400">
                ROYAL COUTURE & SIGNATURE KITS
              </div>
              <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                Zápasové dresy & Prestiž klubu
              </h3>
            </div>

            {/* Kits Showcase */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-heading font-black text-cyan-300 mb-3">
                  ROYAL HOME KIT
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
                <div className="text-xs text-white/50 mt-3 font-mono">
                  Royal Color: <strong className="text-white">{primary}</strong>
                </div>
              </div>

              <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-heading font-black text-cyan-300 mb-3">
                  GLAMOUR AWAY KIT
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
                <div className="text-xs text-white/50 mt-3 font-mono">
                  Secondary Color: <strong className="text-white">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            {/* Scarf & Mascot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-cyan-500/20">
              <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-heading font-black text-cyan-200/80 mb-3">
                  🧣 EXKLUZIVNÍ HEDVÁBNÁ ŠÁLA
                </h4>
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as any) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-[0_0_20px_rgba(6,182,212,0.3)] rounded-lg"
                />
              </div>

              <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-heading font-black text-cyan-200/80 mb-3">
                  🦁 LEGENDÁRNÍ MASKOT
                </h4>
                {team.mascot?.name ? (
                  <div className="flex items-center gap-4">
                    {team.mascot.imageUrl ? (
                      <img
                        src={team.mascot.imageUrl}
                        alt={team.mascot.name}
                        className="w-16 h-16 rounded-xl border border-cyan-500/30 object-cover shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-cyan-500/20 border border-cyan-400/30 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div>
                      <div className="font-heading font-black text-base text-white">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-xs text-cyan-100/70 italic mt-1 leading-snug">
                          &ldquo;{team.mascot.story}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-cyan-200/40 italic py-3 font-heading">
                    Klub v současnosti nemá oficiálně zapsaného maskota.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 3: EXECUTIVE STADIUM ═══ */}
        <section id="stadion" className="scroll-mt-20">
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400 mb-1">
                EXECUTIVE INFRASTRUCTURE
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase">
                Stadion & aréna {team.stadium.name}
              </h2>
            </div>
            <span className="px-3.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-heading font-black text-xs border border-cyan-400/30 uppercase tracking-wider shadow">
              📸 PREMIUM FOTOGALERIE (4 FOTOGRAFIE)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-areal.jpg",
                  title: "Panoramatický pohled na areál",
                  desc: "Celkový pohled na fotbalové hřiště a okolní obec",
                })
              }
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-cyan-400/50 cursor-pointer transition sm:col-span-2 lg:col-span-3"
            >
              <div className="aspect-[16/9] max-h-72 rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-areal.jpg" alt="Areál" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Panoráma stadionu</div>
              <div className="text-xs text-white/50">Přírodní trávník v obci {team.village.name}</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-tribuna.jpg",
                  title: "Krytá tribuna & klandr",
                  desc: "Dřevěná krytá tribuna pro diváky a stání podél klandru",
                })
              }
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-cyan-400/50 cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-tribuna.jpg" alt="Tribuna" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Tribuna & Klandr</div>
              <div className="text-xs text-white/50">Divácká kulisa a lavičky</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kiosek.jpg",
                  title: "Bufet a gastro zóna",
                  desc: "Točené pivo, klobásy z udírny a setkávání fanoušků",
                })
              }
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-cyan-400/50 cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-kiosek.jpg" alt="Kiosek" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">VIP Kiosek & Bufet</div>
              <div className="text-xs text-white/50">Točené pivo a klobásy z udírny</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kabiny.jpg",
                  title: "Šatny a zázemí",
                  desc: "Zázemí pro domácí hráče, hosty i rozhodčí",
                })
              }
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-cyan-400/50 cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-kabiny.jpg" alt="Kabiny" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Šatny & Zázemí</div>
              <div className="text-xs text-white/50">Šatny a taktická zóna</div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 4: VIP GASTRO & BUFET ═══ */}
        <section id="vip-gastro" className="scroll-mt-20">
          <div className="backdrop-blur-xl bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="mb-6">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400 mb-1">
                VIP HOSPITALITY & GASTRO
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                Občerstvení a nápoje v areálu
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-heading">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🍺</div>
                  <div className="font-black text-white">{concessions.beerName}</div>
                  <div className="text-xs text-white/50">Točené pivo 0.5l</div>
                </div>
                <div className="text-2xl font-black text-cyan-300 tabular-nums">
                  {concessions.beerPrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🌭</div>
                  <div className="font-black text-white">{concessions.sausageName}</div>
                  <div className="text-xs text-white/50">Z udírny</div>
                </div>
                <div className="text-2xl font-black text-cyan-300 tabular-nums">
                  {concessions.sausagePrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🥤</div>
                  <div className="font-black text-white">{concessions.lemonadeName}</div>
                  <div className="text-xs text-white/50">Točená limonáda</div>
                </div>
                <div className="text-2xl font-black text-cyan-300 tabular-nums">
                  {concessions.lemonadePrice} Kč
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: AUDIO SUITE ═══ */}
        {hasAudioModule && (
          <section id="audio" className="scroll-mt-20">
            <div className="backdrop-blur-xl bg-white/5 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="mb-4">
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-cyan-400 mb-1">
                  CHAMPIONS AUDIO SUITE
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                  Hymna & Zápasové skandování
                </h2>
              </div>
              <ClubAudioPlayer
                teamName={team.name}
                anthem={team.anthem}
                chants={team.chants}
              />
            </div>
          </section>
        )}
      </main>

      {/* Champions Luxury Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-white/10 text-xs text-cyan-100/50 font-heading flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4">
        <div>
          Oficiální prezentace fotbalového klubu {team.name} · Šablona <strong>Champions Portál</strong>
        </div>
        <div>
          Běží na platformě Prales Champions Edition. Všechna práva vyhrazena.
        </div>
              <LeagueTeamLinks
          standings={standings}
          className="w-full text-center space-y-2 pt-4 border-t border-white/10"
          titleClassName="font-bold uppercase tracking-wider text-cyan-200/40"
          linkClassName="hover:text-cyan-100 hover:underline"
        />
      </footer>
    </div>
  );
}
