"use client";

import { useState, useMemo } from "react";
import type { Player, Team } from "@/lib/api";
import { PaniniCard } from "./PaniniCard";
import { BadgePreview } from "@/components/ui";

interface TeamPosterBoardProps {
  players: Player[];
  team: Team;
  seasonText?: string;
  leagueName?: string;
  coachName?: string;
}

type ViewMode = "positions" | "rating" | "starting11";

export function TeamPosterBoard({
  players,
  team,
  seasonText = "Sezóna 2026/2027",
  leagueName = "Okresní přebor",
  coachName = "Hlavní trenér",
}: TeamPosterBoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("positions");

  const teamColor = team?.primary_color || "#1E40AF";
  const secondaryColor = team?.secondary_color || "#FFFFFF";

  // Vyhodnocení kapitána (nejvyšší leadership / rating)
  const captainId = useMemo(() => {
    if (!players.length) return null;
    const sorted = [...players].sort((a, b) => {
      const lA = (a.personality as any)?.leadership ?? a.overall_rating ?? 50;
      const lB = (b.personality as any)?.leadership ?? b.overall_rating ?? 50;
      return lB - lA;
    });
    return sorted[0]?.id;
  }, [players]);

  // Nejlepší hráč týmu
  const topPlayerId = useMemo(() => {
    if (!players.length) return null;
    const sorted = [...players].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0));
    return sorted[0]?.id;
  }, [players]);

  // Skupiny podle postů
  const gks = useMemo(() => players.filter((p) => p.position === "GK").sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)), [players]);
  const defs = useMemo(() => players.filter((p) => p.position === "DEF").sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)), [players]);
  const mids = useMemo(() => players.filter((p) => p.position === "MID").sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)), [players]);
  const fwds = useMemo(() => players.filter((p) => p.position === "FWD").sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)), [players]);

  // Seřazení podle OVR
  const sortedByRating = useMemo(() => [...players].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)), [players]);

  // Základní 11 (1 GK, 4 DEF, 4 MID, 2 FWD)
  const starting11 = useMemo(() => {
    const sGk = gks.slice(0, 1);
    const sDef = defs.slice(0, 4);
    const sMid = mids.slice(0, 4);
    const sFwd = fwds.slice(0, 2);
    return [...sGk, ...sDef, ...sMid, ...sFwd];
  }, [gks, defs, mids, fwds]);

  const avgRating = players.length
    ? Math.round(players.reduce((sum, p) => sum + (p.overall_rating ?? 0), 0) / players.length)
    : 0;

  const avgAge = players.length
    ? (players.reduce((sum, p) => sum + p.age, 0) / players.length).toFixed(1)
    : "—";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Ovládací lišta sběratelského alba ─── */}
      <div className="bg-surface border border-subtle rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Zobrazení kartiček:</span>
          <div className="inline-flex rounded-xl bg-surface-hover p-1 border border-subtle">
            <button
              onClick={() => setViewMode("positions")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "positions"
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <span>📑</span>
              <span>Dle postů</span>
            </button>
            <button
              onClick={() => setViewMode("starting11")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "starting11"
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <span>👑</span>
              <span>Základní XI</span>
            </button>
            <button
              onClick={() => setViewMode("rating")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === "rating"
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:text-ink hover:bg-surface"
              }`}
            >
              <span>⭐</span>
              <span>Dle ratingu</span>
            </button>
          </div>
        </div>

        {/* Tlačítka pro tisk a export */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="btn-secondary flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <span>🖨️</span>
            <span>Vytisknout plakát / Uložit PDF</span>
          </button>
        </div>
      </div>

      {/* ─── HLAVNÍ SBĚRATELSKÝ PLAKÁT (PANINI ALBUM) ─── */}
      <div
        id="panini-poster-board"
        className="relative rounded-3xl p-6 sm:p-10 bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col gap-8 text-white"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, ${teamColor}22 0%, transparent 65%), radial-gradient(circle at 100% 100%, ${teamColor}15 0%, transparent 50%)`,
        }}
      >
        {/* Luxusní zlatý ozdobný vnější lem */}
        <div className="absolute inset-3 rounded-2xl border border-amber-500/25 pointer-events-none" />
        <div className="absolute inset-5 rounded-xl border border-white/5 pointer-events-none" />

        {/* Rohové zlaté značky */}
        <div className="absolute top-4 left-4 w-3 h-3 border-t-2 border-l-2 border-amber-400 pointer-events-none" />
        <div className="absolute top-4 right-4 w-3 h-3 border-t-2 border-r-2 border-amber-400 pointer-events-none" />
        <div className="absolute bottom-4 left-4 w-3 h-3 border-b-2 border-l-2 border-amber-400 pointer-events-none" />
        <div className="absolute bottom-4 right-4 w-3 h-3 border-b-2 border-r-2 border-amber-400 pointer-events-none" />

        {/* ─── 1. Záhlaví plakátu ─── */}
        <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-white/10 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* Znak klubu */}
            <div className="relative shrink-0 p-2 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-lg shadow-black/50">
              <BadgePreview
                pattern={(team?.badge_pattern as any) || "plain"}
                primary={team?.primary_color || teamColor}
                secondary={team?.secondary_color || secondaryColor}
                initials={team?.name?.substring(0, 3).toUpperCase() || "FK"}
                symbol={(team as any)?.badge_symbol || null}
                size={74}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  {leagueName}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  • {seasonText} •
                </span>
              </div>
              <h1 className="font-heading font-black text-3xl sm:text-4xl text-white tracking-wide uppercase drop-shadow-md">
                {team?.name || "Fotbalový klub"}
              </h1>
              <p className="text-xs font-semibold text-slate-400 mt-0.5 tracking-wider uppercase">
                Oficiální sběratelská kolekce hráčských kartiček A-týmu
              </p>
            </div>
          </div>

          {/* Statistické medailonky kádru */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="font-heading font-black text-2xl text-amber-400 tabular-nums leading-none">
                {avgRating}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                Ø Rating
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="font-heading font-black text-2xl text-white tabular-nums leading-none">
                {players.length}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                Hráčů
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2.5 text-center min-w-[80px]">
              <div className="font-heading font-black text-2xl text-slate-200 tabular-nums leading-none">
                {avgAge}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                Ø Věk
              </div>
            </div>
          </div>
        </div>

        {/* ─── 2. Kartičky hráčů podle zvoleného zobrazení ─── */}
        {viewMode === "positions" && (
          <div className="flex flex-col gap-10">
            {/* Brankáři */}
            {gks.length > 0 && (
              <SectionGroup title="🧤 Brankáři" count={gks.length} color="text-amber-400" border="border-amber-500/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {gks.map((p) => (
                    <PaniniCard
                      key={p.id}
                      player={p}
                      teamColor={teamColor}
                      secondaryColor={secondaryColor}
                      isCaptain={p.id === captainId}
                      isTopPlayer={p.id === topPlayerId}
                    />
                  ))}
                </div>
              </SectionGroup>
            )}

            {/* Obránci */}
            {defs.length > 0 && (
              <SectionGroup title="🛡️ Obránci" count={defs.length} color="text-blue-400" border="border-blue-500/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {defs.map((p) => (
                    <PaniniCard
                      key={p.id}
                      player={p}
                      teamColor={teamColor}
                      secondaryColor={secondaryColor}
                      isCaptain={p.id === captainId}
                      isTopPlayer={p.id === topPlayerId}
                    />
                  ))}
                </div>
              </SectionGroup>
            )}

            {/* Záložníci */}
            {mids.length > 0 && (
              <SectionGroup title="⚙️ Záložníci" count={mids.length} color="text-emerald-400" border="border-emerald-500/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {mids.map((p) => (
                    <PaniniCard
                      key={p.id}
                      player={p}
                      teamColor={teamColor}
                      secondaryColor={secondaryColor}
                      isCaptain={p.id === captainId}
                      isTopPlayer={p.id === topPlayerId}
                    />
                  ))}
                </div>
              </SectionGroup>
            )}

            {/* Útočníci */}
            {fwds.length > 0 && (
              <SectionGroup title="⚡ Útočníci" count={fwds.length} color="text-rose-400" border="border-rose-500/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {fwds.map((p) => (
                    <PaniniCard
                      key={p.id}
                      player={p}
                      teamColor={teamColor}
                      secondaryColor={secondaryColor}
                      isCaptain={p.id === captainId}
                      isTopPlayer={p.id === topPlayerId}
                    />
                  ))}
                </div>
              </SectionGroup>
            )}
          </div>
        )}

        {viewMode === "starting11" && (
          <SectionGroup title="👑 Základní jedenáctka (Top 11)" count={starting11.length} color="text-amber-400" border="border-amber-500/30">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {starting11.map((p) => (
                <PaniniCard
                  key={p.id}
                  player={p}
                  teamColor={teamColor}
                  secondaryColor={secondaryColor}
                  isCaptain={p.id === captainId}
                  isTopPlayer={p.id === topPlayerId}
                />
              ))}
            </div>
          </SectionGroup>
        )}

        {viewMode === "rating" && (
          <SectionGroup title="⭐ Hráči seřazení podle hodnocení (OVR)" count={sortedByRating.length} color="text-yellow-400" border="border-yellow-500/30">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {sortedByRating.map((p) => (
                <PaniniCard
                  key={p.id}
                  player={p}
                  teamColor={teamColor}
                  secondaryColor={secondaryColor}
                  isCaptain={p.id === captainId}
                  isTopPlayer={p.id === topPlayerId}
                />
              ))}
            </div>
          </SectionGroup>
        )}

        {/* ─── 3. Zápatí plakátu s pečetí a podpisem ─── */}
        <div className="relative pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍺</span>
            <div>
              <div className="font-bold text-slate-200">Schváleno předsedou TJ a hospodským Frantou</div>
              <div className="text-[11px] text-slate-400">Oficiální licencovaný produkt Okresní mašiny • Všechna práva vyhrazena</div>
            </div>
          </div>

          {/* Pečeť pravosti */}
          <div className="border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 rounded-xl font-bold text-amber-300 text-[11px] tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
            <span>🛡️</span>
            <span>OFICIÁLNÍ SBĚRATELSKÝ ARCH</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionGroup({
  title,
  count,
  color,
  border,
  children,
}: {
  title: string;
  count: number;
  color: string;
  border: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-center justify-between pb-2 border-b ${border}`}>
        <h2 className={`font-heading font-black text-base sm:text-lg tracking-wide uppercase ${color} flex items-center gap-2`}>
          <span>{title}</span>
        </h2>
        <span className="text-xs font-bold text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-full border border-white/10">
          {count} {count === 1 ? "hráč" : count < 5 ? "hráči" : "hráčů"}
        </span>
      </div>
      {children}
    </div>
  );
}
