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

export function ProfiLeagueTemplate({
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

  const primary = team.primaryColor || "#dc2626";
  const secondary = team.secondaryColor || "#ffffff";
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
    <div className="min-h-screen bg-[#070a12] text-white font-sans pb-16 selection:bg-red-600 selection:text-white">
      {/* High-impact Dark Broadcast Header */}
      <header className="bg-[#0e1320] border-b border-white/10 sticky top-0 z-40 shadow-2xl backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={52}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30 text-[9px] font-heading font-black tracking-widest uppercase">
                  PROFI LIGA
                </span>
                <span className="text-[11px] text-white/50 font-heading font-bold">
                  {team.village.name}
                </span>
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl tracking-tighter text-white uppercase mt-0.5">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-heading font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(220,38,38,0.4)] active:scale-95 transition"
            >
              VSTUPENKY ({tickets.adultPrice} Kč)
            </button>
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-heading font-bold text-xs transition"
            >
              ← Zpět
            </button>
          </div>
        </div>

        {/* Dynamic Dark Nav Strip */}
        <div className="border-t border-white/5 bg-[#0b0e17] px-4 sm:px-8 py-2 text-xs font-heading font-bold text-white/70 flex items-center gap-6 overflow-x-auto">
          <a href="#broadcast" className="hover:text-white shrink-0 flex items-center gap-1.5 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>TV MATCHDAY</span>
          </a>
          <a href="#tabulka" className="hover:text-white shrink-0">LIGOVÁ TABULKA</a>
          <a href="#kadr" className="hover:text-white shrink-0">SOUPISKA & STATS</a>
          <a href="#prestupy" className="hover:text-white shrink-0">PŘESTUPY ({transfers.length})</a>
          <a href="#identita" className="hover:text-white shrink-0">DRESY & IDENTITA</a>
          <a href="#video" className="hover:text-white shrink-0">KLÚBOVÁ TV</a>
          <a href="#stadion" className="hover:text-white shrink-0">STADION</a>
          <a href="#bufet" className="hover:text-white shrink-0">FAN ZÓNA & GASTRO</a>
          {hasAudioModule && <a href="#audio" className="text-amber-400 hover:text-amber-300 shrink-0">AUDIO MODUL</a>}
        </div>
      </header>

      {/* Sponsor Banner Addon */}
      {hasSponsorBanner && (
        <div className="bg-[#121826] border-b border-amber-500/20 py-2.5 px-4 text-xs font-heading text-center text-slate-300 flex items-center justify-center gap-3 flex-wrap">
          <span className="font-black text-amber-400 uppercase text-[10px] tracking-widest">HLAVNÍ PARTNEŘI KLUBU:</span>
          <span className="font-bold text-white">PIVOVAR KOCOUR · LESNÍ SPRÁVA A.S. · TRUHLÁŘSTVÍ NOVÁK</span>
          <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-[9px] font-black border border-amber-500/20">PREMIUM</span>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-12">
        {/* Press Announcement */}
        {(hasPressOfficer || website.announcement) && (
          <div className="bg-[#111726] border-l-4 border-red-500 p-5 rounded-2xl shadow-xl flex items-start gap-4">
            <span className="text-3xl shrink-0 mt-0.5">🎙️</span>
            <div>
              <div className="text-[10px] font-heading font-black uppercase tracking-widest text-red-400 mb-1">
                TISKOVÉ PROHLÁŠENÍ KLUBU {hasPressOfficer && "· TISKOVÝ MLUVČÍ"}
              </div>
              <p className="text-white/90 text-sm italic font-medium leading-relaxed">
                &ldquo;{website.announcement || `Vedení klubu ${team.name} oznamuje plné soustředění týmu na nadcházející soutěžní duely. Věříme v sílu našeho kádru a děkujeme fanouškům za neutuchající podporu!`}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* ═══ SECTION 1: BROADCAST MATCH CENTER LIVE ═══ */}
        <section id="broadcast" className="scroll-mt-20">
          <div className="bg-gradient-to-br from-[#121828] via-[#0d121e] to-[#080b14] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
            {/* Ambient Team Glow */}
            <div
              className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
              style={{ background: primary }}
            />

            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-md bg-red-600 text-white font-heading font-black text-xs uppercase tracking-widest flex items-center gap-1.5 shadow">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  MATCHDAY CENTER
                </span>
                <span className="text-xs text-white/50 font-heading font-bold hidden sm:inline">
                  {nextMatch?.round ? `${nextMatch.round}. KOLO MISTROVSKÉ SOUTĚŽE` : "LIGOVÉ UTKÁNÍ"}
                </span>
              </div>
              <div className="text-xs font-heading font-black text-red-400 uppercase tracking-widest bg-black/40 px-3 py-1 rounded-lg border border-white/10">
                📺 PRALES SPORT 1 HD
              </div>
            </div>

            {nextMatch ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-8 py-4">
                {/* Home team */}
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 p-2 shadow-2xl flex items-center justify-center mb-3">
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
                  <div className="text-[11px] font-heading font-bold text-white/50 mt-1 uppercase">
                    {nextMatch.isHome ? "Domácí tým" : "Hosté"}
                  </div>
                </div>

                {/* Score / VS Center */}
                <div className="flex flex-col items-center text-center">
                  <div className="px-6 py-2 rounded-2xl bg-black/60 border border-white/10 text-3xl sm:text-5xl font-heading font-black tracking-widest text-red-500 shadow-inner">
                    VS
                  </div>
                  <div className="text-xs font-heading font-bold text-white/70 mt-3">
                    {nextMatch.scheduledAt ? new Date(nextMatch.scheduledAt).toLocaleDateString("cs-CZ") : "SOBOTA · 15:00"}
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">
                    🏟️ {nextMatch.stadiumName}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenTickets}
                    className="mt-5 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-heading font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition"
                  >
                    KOUPIT LÍSTEK ({tickets.adultPrice} Kč)
                  </button>
                </div>

                {/* Away team */}
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 p-2 shadow-2xl flex items-center justify-center mb-3">
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
                  <div className="text-[11px] font-heading font-bold text-white/50 mt-1 uppercase">
                    {!nextMatch.isHome ? "Domácí tým" : "Hosté"}
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
              <div className="mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-heading">
                <div className="text-white/60">
                  POSLEDNÍ ZÁPAS ({lastMatch.round ? `${lastMatch.round}. KOLO` : "VÝSLEDEK"}):{" "}
                  <strong className="text-white">
                    {lastMatch.isHome ? team.name : lastMatch.opponent.name} {lastMatch.scoreHome} : {lastMatch.scoreAway} {lastMatch.isHome ? lastMatch.opponent.name : team.name}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition"
                >
                  ▶ VIDEOSESTŘIH ZÁPASU
                </button>
              </div>
            )}

            {/* Broadcast Fixtures & Results Ticker Grid */}
            {(recentMatches.length > 0 || upcomingMatches.length > 0) && (
              <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Recent matches */}
                {recentMatches.length > 0 && (
                  <div className="bg-[#121826] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                      <span className="font-heading font-black text-xs uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                        <span>⏪</span> ARCHIV ODEHRANÝCH KOL
                      </span>
                    </div>
                    <div className="space-y-2">
                      {recentMatches.slice(0, 4).map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="truncate">
                            <span className="text-[10px] text-white/40 uppercase mr-1.5 font-mono">{m.round}.k</span>
                            <span className="font-bold text-white">
                              {m.isHome ? team.name : m.opponent.name} vs {m.isHome ? m.opponent.name : team.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black px-2 py-0.5 bg-white/10 rounded text-amber-400 font-mono">
                              {m.scoreHome}:{m.scoreAway}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenHighlights(m)}
                              className="text-red-400 hover:text-red-300 font-bold text-[11px]"
                            >
                              Záznam
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming fixtures */}
                {upcomingMatches.length > 0 && (
                  <div className="bg-[#121826] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                      <span className="font-heading font-black text-xs uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                        <span>⏩</span> PROGRAM BUDOUCÍCH UTKÁNÍ
                      </span>
                    </div>
                    <div className="space-y-2">
                      {upcomingMatches.slice(0, 4).map((um) => (
                        <div
                          key={um.id}
                          className="p-2.5 bg-black/30 border border-white/5 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="truncate">
                            <span className="text-[10px] text-white/40 uppercase mr-1.5 font-mono">{um.round}.k</span>
                            <span className="font-semibold text-white/90">
                              {um.isHome ? "DOMA: " : "VENKU: "} <strong>{um.opponent.name}</strong>
                            </span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase font-mono ${
                            um.isHome ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/10 text-white/70"
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

        {/* ═══ SECTION: LIGOVÁ TABULKA (BROADCAST STANDINGS) ═══ */}
        <section id="tabulka" className="scroll-mt-20">
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 flex-wrap gap-2">
              <div>
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500">
                  OFICIÁLNÍ POŘADÍ SOUTĚŽE
                </div>
                <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Ligová tabulka
                </h3>
              </div>
              <span className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded-full text-xs font-heading font-black">
                LIVE POŘADÍ
              </span>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-white/60 font-heading font-black text-[11px] uppercase tracking-wider border-b border-white/10">
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
                            ? "bg-red-600/25 font-bold text-white border-l-4 border-l-red-500 shadow-inner"
                            : "hover:bg-white/5 text-white/80"
                        }`}
                      >
                        <td className="py-3 px-3 text-center font-heading font-black text-white/50">
                          {row.pos}.
                        </td>
                        <td className="py-3 px-3 font-semibold">
                          {row.teamName} {row.isCurrentTeam && <span className="text-[10px] font-black text-red-400 ml-2 px-2 py-0.5 bg-red-600/30 border border-red-500/40 rounded">NÁŠ KLUB</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono">{row.played}</td>
                        <td className="py-3 px-2 text-center font-mono text-emerald-400 font-bold">{row.won}</td>
                        <td className="py-3 px-2 text-center font-mono text-white/60">{row.drawn}</td>
                        <td className="py-3 px-2 text-center font-mono text-red-400 font-bold">{row.lost}</td>
                        <td className="py-3 px-3 text-center font-mono">{row.gf}:{row.ga}</td>
                        <td className="py-3 px-4 text-center font-heading font-black text-amber-400 text-sm bg-black/40">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-white/40 italic font-heading">
                Pořadí v ligové tabulce bude k dispozici po odehrání úvodních mistrovských kol.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 2: FIFA ULTIMATE TEAM SQUAD CARDS ═══ */}
        <section id="kadr" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500 mb-1">
                PROFESIONÁLNÍ SOUPISKA
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase">
                Hráčský kádr & karty
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-Team vs U21 Toggle */}
              <div className="bg-[#121826] p-1 rounded-xl border border-white/10 flex gap-1 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "aTeam"
                      ? "bg-red-600 text-white shadow"
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
                      ? "bg-red-600 text-white shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  🌱 DOROST U21 ({roster.u21Team?.length || 0})
                </button>
              </div>

              <div className="bg-[#121826] p-1 rounded-xl border border-white/10 flex gap-1 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-red-600 text-white shadow" : "text-white/60"}`}
                >
                  FUT KARTY
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-red-600 text-white shadow" : "text-white/60"}`}
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
                      ? "bg-red-600 text-white font-black shadow-lg"
                      : "bg-[#121826] text-white/70 hover:bg-white/10 border border-white/10"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {viewMode === "pitch" ? (
            <div className="bg-[#121826] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={secondary}
              />
            </div>
          ) : (
            /* ═══ FUT-STYLE PLAYER CARDS GRID ═══ */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((player) => (
                <div
                  key={player.id}
                  className="bg-gradient-to-b from-[#161f33] to-[#0e1422] border border-white/15 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-red-500/60 hover:scale-[1.02] transition-all flex flex-col justify-between"
                >
                  {/* Watermark Squad Number in Background */}
                  <div className="absolute -right-3 -top-5 text-7xl font-heading font-black text-white/5 pointer-events-none select-none tracking-tighter">
                    {player.squadNumber ?? ""}
                  </div>

                  <div>
                    {/* Top Row: OVR Rating & Position */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white font-heading font-black text-xs shadow">
                          {player.overallRating || 75} OVR
                        </span>
                        <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-white/60">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <span className="text-xs font-heading font-black text-white/40">
                        #{player.squadNumber ?? "-"}
                      </span>
                    </div>

                    {/* Avatar Portrait */}
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-18 rounded-xl overflow-hidden bg-black/40 border border-white/20 shrink-0 flex items-center justify-center shadow-inner group-hover:border-red-500/50 transition-colors">
                        <ManagerFace faceConfig={player.avatar} size={58} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-heading font-black text-base text-white uppercase tracking-tight truncate">
                          {player.lastName}
                        </div>
                        <div className="text-xs text-white/60 font-semibold truncate">
                          {player.firstName}
                        </div>
                        <div className="text-[11px] text-white/40 mt-1">
                          {player.age} let
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FUT Stat Meters */}
                  <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-1 text-center font-heading">
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-white/50 font-bold uppercase">ZÁPASY</div>
                      <div className="font-black text-sm text-white">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-white/50 font-bold uppercase">GÓLY</div>
                      <div className="font-black text-sm text-red-400">{player.stats.goals}</div>
                    </div>
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-[9px] text-white/50 font-bold uppercase">MINUTY</div>
                      <div className="font-black text-sm text-white">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION: PŘESTUPOVÁ CENTRÁLA (PROFI TRANSFERS) ═══ */}
        <section id="prestupy" className="scroll-mt-20">
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 flex-wrap gap-3">
              <div>
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500">
                  PŘESTUPOVÝ TRH & TRANSFÉRY
                </div>
                <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Pohyby v kádru & Změny
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
                        ? "bg-red-600 text-white border-red-500 shadow"
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
                      className="p-4 sm:p-5 bg-black/40 border border-white/10 rounded-2xl transition hover:border-white/20"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wider ${
                            isIn
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {isIn ? "🟢 PŘÍCHOD" : "🔴 ODCHOD"} · {t.kind === "free_agent" ? "VOLNÝ HRÁČ" : t.kind === "released" ? "UVOLNĚNÍ" : t.kind === "swap" ? "VÝMĚNA" : "PŘESTUP"}
                        </span>
                        <span className="text-xs text-white/50 font-medium">
                          ČÁSTKA: <strong className="text-amber-400 font-mono">{t.fee > 0 ? `${t.fee.toLocaleString("cs-CZ")} Kč` : "BEZ ODSTUPNÉHO"}</strong>
                        </span>
                      </div>

                      <h4 className="font-heading font-bold text-base text-white mb-1">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-white/70 leading-relaxed mb-3">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-white/5 border-l-4 border-red-600 rounded-r-xl text-xs italic text-white/80">
                          <strong>Vyjádření klubu:</strong> &ldquo;{t.quote}&rdquo;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-white/40 italic font-heading">
                V tomto přestupovém období nejsou v systému žádné hlášené transakce.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: KLUBOVÁ IDENTITA, DRESY & MASKOT ═══ */}
        <section id="identita" className="scroll-mt-20">
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500">
                KLUB SIGNATURE & VÝSTROJ
              </div>
              <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                Oficiální zápasová sada & Identita
              </h3>
            </div>

            {/* Kits Showcase */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-heading font-black text-red-400 mb-3">
                  DOMÁCÍ ZÁPASOVÁ SADA
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
                  Primární barva: <strong className="text-white">{primary}</strong>
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-xs uppercase tracking-wider font-heading font-black text-red-400 mb-3">
                  VENKOVNÍ ZÁLOŽNÍ SADA
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
                  Sekundární barva: <strong className="text-white">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            {/* Scarf & Mascot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-white/10">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-heading font-black text-white/80 mb-3">
                  🧣 OFICIÁLNÍ FANKLUBOVÁ ŠÁLA
                </h4>
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as any) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-lg rounded-lg"
                />
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                <h4 className="text-xs uppercase tracking-wider font-heading font-black text-white/80 mb-3">
                  🦁 KLUB MASKOT
                </h4>
                {team.mascot?.name ? (
                  <div className="flex items-center gap-4">
                    {team.mascot.imageUrl ? (
                      <img
                        src={team.mascot.imageUrl}
                        alt={team.mascot.name}
                        className="w-16 h-16 rounded-xl border border-white/10 object-cover shrink-0 shadow"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-red-600/20 border border-red-500/30 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div>
                      <div className="font-heading font-black text-base text-white">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-xs text-white/60 italic mt-1 leading-snug">
                          &ldquo;{team.mascot.story}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-white/40 italic py-3 font-heading">
                    Klub v současnosti nemá oficiálně zapsaného maskota.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 3: STADION & AREÁL ═══ */}
        <section id="stadion" className="scroll-mt-20">
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500 mb-1">
                INFRASTRUKTURA & ARÉNA
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase">
                Domovský stadion {team.stadium.name}
              </h2>
            </div>
            {hasStadiumGallery && (
              <span className="px-3 py-1 rounded-full bg-red-600/20 text-red-400 font-heading font-black text-xs border border-red-500/30 uppercase tracking-wider">
                📸 ODEMČENÁ FOTOGALERIE 4K
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-tribuna.jpg",
                  title: "Krytá tribuna & klandr",
                  desc: "Dřevěná krytá tribuna pro diváky a stání podél klandru",
                })
              }
              className="bg-[#121826] border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-red-500/50 cursor-pointer transition"
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
              className="bg-[#121826] border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-red-500/50 cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-kiosek.jpg" alt="Kiosek" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Bufet & Fan Zóna</div>
              <div className="text-xs text-white/50">Točené pivo a klobásy</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kabiny.jpg",
                  title: "Šatny a zázemí",
                  desc: "Zázemí pro domácí hráče, hosty i rozhodčí",
                })
              }
              className="bg-[#121826] border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-red-500/50 cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-black/40">
                <img src="/images/stadion-kabiny.jpg" alt="Kabiny" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Kabiny & Taktika</div>
              <div className="text-xs text-white/50">Šatny a regenerace</div>
            </div>

            {hasStadiumGallery && (
              <div
                onClick={() =>
                  onOpenLightbox({
                    src: "/images/stadion-areal.jpg",
                    title: "Panoramatický pohled na areál",
                    desc: "Celkový pohled na fotbalové hřiště a okolní obec",
                  })
                }
                className="bg-[#121826] border border-white/10 rounded-2xl p-3.5 shadow-xl hover:border-red-500/50 cursor-pointer transition sm:col-span-2 lg:col-span-3"
              >
                <div className="aspect-[16/9] max-h-64 rounded-xl overflow-hidden bg-black/40">
                  <img src="/images/stadion-areal.jpg" alt="Areál" className="w-full h-full object-cover" />
                </div>
                <div className="mt-2.5 font-heading font-black text-sm text-white uppercase">Panoráma stadionu</div>
                <div className="text-xs text-white/50">Areál v obci {team.village.name}</div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 4: GASTRO & BUFET ═══ */}
        <section id="bufet" className="scroll-mt-20">
          <div className="bg-[#121826] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="mb-6">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500 mb-1">
                FAN ZÓNA & GASTRO
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                Občerstvení u hřiště
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-heading">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🍺</div>
                  <div className="font-black text-white">{concessions.beerName}</div>
                  <div className="text-xs text-white/50">Točené pivo 0.5l</div>
                </div>
                <div className="text-2xl font-black text-red-400 tabular-nums">
                  {concessions.beerPrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🌭</div>
                  <div className="font-black text-white">{concessions.sausageName}</div>
                  <div className="text-xs text-white/50">Z udírny</div>
                </div>
                <div className="text-2xl font-black text-red-400 tabular-nums">
                  {concessions.sausagePrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🥤</div>
                  <div className="font-black text-white">{concessions.lemonadeName}</div>
                  <div className="text-xs text-white/50">Limonáda</div>
                </div>
                <div className="text-2xl font-black text-red-400 tabular-nums">
                  {concessions.lemonadePrice} Kč
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: AUDIO MODULE ═══ */}
        {hasAudioModule && (
          <section id="audio" className="scroll-mt-20">
            <div className="bg-[#121826] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="mb-4">
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-red-500 mb-1">
                  OFFICIAL AUDIO HUB
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                  Klubová hymna & Chorály
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

      {/* Broadcast Dark Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-white/10 text-xs text-white/40 font-heading flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4">
        <div>
          Oficiální prezentace fotbalového klubu {team.name} · Šablona <strong>Profi Liga</strong>
        </div>
        <div>
          Běží na platformě Prales Broadcast. Všechna práva vyhrazena.
        </div>
              <LeagueTeamLinks
          standings={standings}
          className="w-full text-center space-y-2 pt-4 border-t border-white/10"
          titleClassName="font-bold uppercase tracking-wider text-white/30"
          linkClassName="hover:text-white hover:underline"
        />
      </footer>
    </div>
  );
}
