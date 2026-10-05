"use client";

import { useState } from "react";
import Link from "next/link";
import type { TemplateProps } from "./types";
import { BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ManagerFace } from "../ManagerFace";
import { TacticalPitch } from "../TacticalPitch";
import { StadiumPhotoCard } from "../StadiumPhotoCard";
import { ClubAudioPlayer } from "../ClubAudioPlayer";

export function RegionalStandardTemplate({
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
  const { team, website, manager, staff, roster, matches, concessions, tickets, news } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"cards" | "pitch">("cards");
  const [positionFilter, setPositionFilter] = useState<"all" | "GK" | "DEF" | "MID" | "FWD">("all");

  const primary = team.primaryColor || "#1e3a8a";
  const secondary = team.secondaryColor || "#ffffff";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;
  const hasU21 = roster.u21Team && roster.u21Team.length > 0;

  const nextMatch = matches.nextMatch;
  const lastMatch = matches.lastMatch;

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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* Top Accent Strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: primary }} />

      {/* Modern Clean Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="shrink-0 drop-shadow-sm">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={48}
              />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Oficiální klubový portál
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl text-slate-900 tracking-tight">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-4 py-2 rounded-xl text-white font-heading font-extrabold text-xs shadow hover:opacity-90 active:scale-95 transition"
              style={{ backgroundColor: primary }}
            >
              🎟️ Vstupenky ({tickets.adultPrice} Kč)
            </button>
            <button
              type="button"
              onClick={onBackToGame}
              className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-heading font-bold text-xs transition"
            >
              ← Zpět
            </button>
          </div>
        </div>

        {/* Horizontal Navigation Pills */}
        <div className="border-t border-slate-100 max-w-6xl mx-auto px-4 sm:px-8 py-2 text-xs font-heading font-bold text-slate-600 flex items-center gap-6 overflow-x-auto">
          <a href="#zapas" className="hover:text-slate-900 shrink-0">⚽ Zápasy</a>
          <a href="#kadr" className="hover:text-slate-900 shrink-0">👥 Soupiska</a>
          <a href="#stadion" className="hover:text-slate-900 shrink-0">🏟️ Stadion & Areál</a>
          <a href="#bufet" className="hover:text-slate-900 shrink-0">🍺 Občerstvení</a>
          {hasAudioModule && <a href="#audio" className="text-blue-600 hover:underline shrink-0">🎵 Audio přehrávač</a>}
          <a href="#realizak" className="hover:text-slate-900 shrink-0">👔 Realizační tým</a>
        </div>
      </header>

      {/* Sponsor Banner Addon */}
      {hasSponsorBanner && (
        <div className="bg-slate-100 border-b border-slate-200 py-2.5 px-4 text-xs font-heading text-center text-slate-700 flex items-center justify-center gap-3 flex-wrap">
          <span className="font-extrabold text-slate-900 uppercase text-[11px]">Partneři klubu:</span>
          <span className="font-semibold text-slate-600">Pivovar Kocour · Lesní správa a.s. · Truhlářství Novák</span>
          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">Oficiální partnerství</span>
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-10">
        {/* Press Announcement Box */}
        {(hasPressOfficer || website.announcement) && (
          <div className="bg-white border-l-4 p-5 rounded-2xl shadow-sm border-blue-600">
            <div className="text-xs uppercase font-heading font-extrabold text-blue-700 mb-1 flex items-center gap-2">
              <span>📢</span>
              <span>Oficiální tiskové prohlášení {hasPressOfficer && "· Tiskový mluvčí"}</span>
            </div>
            <p className="text-slate-800 text-sm leading-relaxed italic">
              &ldquo;{website.announcement || `Vedení fotbalového klubu ${team.name} vítá všechny fanoušky na našem oficiálním webovém portálu. Věříme v úspěšnou sezónu a těšíme se na vaši podporu při každém zápase!`}&rdquo;
            </p>
          </div>
        )}

        {/* ═══ SECTION 1: MODERN MATCH CENTER ═══ */}
        <section id="zapas" className="scroll-mt-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Next Match Card */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-heading font-bold uppercase text-slate-500 mb-4">
                  <span>Příští zápas · {nextMatch?.round ? `${nextMatch.round}. kolo` : "Nadcházející utkání"}</span>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-black">
                    {nextMatch?.isHome ? "Domácí utkání" : "Venkovní utkání"}
                  </span>
                </div>

                {nextMatch ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-4">
                    {/* Home team */}
                    <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100 mb-2">
                        <BadgePreview
                          primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                          secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                          pattern="shield"
                          initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                          size={52}
                        />
                      </div>
                      <div className="font-heading font-black text-lg sm:text-xl text-slate-900">
                        {nextMatch.isHome ? team.name : nextMatch.opponent.name}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Domácí celek</div>
                    </div>

                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-heading font-black text-slate-400">VS</div>
                      <div className="text-xs font-heading font-bold text-blue-600 mt-1">
                        {nextMatch.scheduledAt ? new Date(nextMatch.scheduledAt).toLocaleDateString("cs-CZ") : "Víkend"}
                      </div>
                    </div>

                    {/* Away team */}
                    <div className="flex flex-col items-center sm:items-end text-center sm:text-right">
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100 mb-2">
                        <BadgePreview
                          primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                          secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                          pattern="shield"
                          initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                          size={52}
                        />
                      </div>
                      <div className="font-heading font-black text-lg sm:text-xl text-slate-900">
                        {!nextMatch.isHome ? team.name : nextMatch.opponent.name}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Hostující celek</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    Žádný nadcházející zápas v kalendáři.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 font-medium">
                  📍 Stadion: <strong>{nextMatch?.stadiumName || team.stadium.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={onOpenTickets}
                  className="px-4 py-2 rounded-xl text-white font-heading font-bold shadow hover:opacity-90 transition"
                  style={{ backgroundColor: primary }}
                >
                  Koupit vstupenku ({tickets.adultPrice} Kč)
                </button>
              </div>
            </div>

            {/* Last Match Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-xs font-heading font-bold uppercase text-slate-500 mb-3">
                  Výsledek posledního kola
                </div>
                {lastMatch ? (
                  <div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center my-2">
                      <div className="font-heading font-extrabold text-sm text-slate-700">
                        {lastMatch.isHome ? team.name : lastMatch.opponent.name} vs {lastMatch.isHome ? lastMatch.opponent.name : team.name}
                      </div>
                      <div className="text-3xl font-heading font-black text-slate-900 my-1 tabular-nums">
                        {lastMatch.scoreHome} : {lastMatch.scoreAway}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {lastMatch.round ? `${lastMatch.round}. kolo soutěže` : "Konečný výsledek"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenHighlights(lastMatch)}
                      className="w-full mt-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-heading font-bold text-xs transition"
                    >
                      ▶ Zobrazit sestřih a reportáž
                    </button>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    Zatím nebyl odehrán žádný mistrovský zápas.
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-600 flex justify-between">
                <span>🍺 {concessions.beerName}</span>
                <span className="font-bold text-slate-900">{concessions.beerPrice} Kč</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 2: CLEAN MODERN ROSTER ═══ */}
        <section id="kadr" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                Klubový kádr
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-3xl text-slate-900">
                Soupiska hráčů
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-slate-100 p-1 rounded-xl flex gap-1 text-xs font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                >
                  📋 Seznam
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                >
                  ⚽ Taktika 11
                </button>
              </div>
            </div>
          </div>

          {/* Position Filters */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap text-xs font-heading font-bold">
            {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
              const label = pos === "all" ? "Všichni" : pos === "GK" ? "Brankáři" : pos === "DEF" ? "Obránci" : pos === "MID" ? "Záložníci" : "Útočníci";
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  className={`px-3.5 py-1.5 rounded-lg border transition ${
                    positionFilter === pos
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {viewMode === "pitch" ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={secondary}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((player) => (
                <div
                  key={player.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      <ManagerFace faceConfig={player.avatar} size={52} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-5 h-5 rounded bg-slate-100 text-slate-700 font-heading font-black text-[11px] flex items-center justify-center shrink-0 border border-slate-200">
                          {player.squadNumber ?? "-"}
                        </span>
                        <span className="text-[10px] font-heading font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <div className="font-heading font-extrabold text-sm sm:text-base text-slate-900 mt-1 leading-tight truncate">
                        {player.firstName} {player.lastName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {player.age} let
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-1 text-center font-heading text-xs">
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-[9px] text-slate-500">ZÁPASY</div>
                      <div className="font-bold text-slate-900">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-[9px] text-slate-500">GÓLY</div>
                      <div className="font-bold text-slate-900">{player.stats.goals}</div>
                    </div>
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-[9px] text-slate-500">MINUTY</div>
                      <div className="font-bold text-slate-900">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION 3: STADION & AREÁL ═══ */}
        <section id="stadion" className="scroll-mt-20">
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                Klubové zázemí
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-3xl text-slate-900">
                Stadion & areál
              </h2>
            </div>
            {hasStadiumGallery && (
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-heading font-bold text-xs border border-blue-200">
                📸 Odemčená fotogalerie areálu (4 fotografie)
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
              className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
                <img src="/images/stadion-tribuna.jpg" alt="Tribuna" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-bold text-sm text-slate-900">Krytá tribuna & lavičky</div>
              <div className="text-xs text-slate-500">Místo pro diváky podél hřiště</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kiosek.jpg",
                  title: "Kiosek s občerstvením",
                  desc: "Točené pivo, klobásy z udírny a setkávání fanoušků",
                })
              }
              className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
                <img src="/images/stadion-kiosek.jpg" alt="Kiosek" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-bold text-sm text-slate-900">Bufet & kiosek</div>
              <div className="text-xs text-slate-500">Točené pivo a klobásy během utkání</div>
            </div>

            <div
              onClick={() =>
                onOpenLightbox({
                  src: "/images/stadion-kabiny.jpg",
                  title: "Kabiny a šatny",
                  desc: "Zázemí pro domácí hráče, hosty i rozhodčí",
                })
              }
              className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md cursor-pointer transition"
            >
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
                <img src="/images/stadion-kabiny.jpg" alt="Kabiny" className="w-full h-full object-cover" />
              </div>
              <div className="mt-2.5 font-heading font-bold text-sm text-slate-900">Kabiny & šatny</div>
              <div className="text-xs text-slate-500">Šatny hráčů, sprchy a zázemí</div>
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
                className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm hover:shadow-md cursor-pointer transition sm:col-span-2 lg:col-span-3"
              >
                <div className="aspect-[16/9] max-h-60 rounded-xl overflow-hidden bg-slate-100">
                  <img src="/images/stadion-areal.jpg" alt="Areál" className="w-full h-full object-cover" />
                </div>
                <div className="mt-2.5 font-heading font-bold text-sm text-slate-900">Panoráma sportovního areálu</div>
                <div className="text-xs text-slate-500">Kvalitní přírodní trávník v obci {team.village.name}</div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 4: BUFET ═══ */}
        <section id="bufet" className="scroll-mt-20">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <div className="text-xs font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                Ceník občerstvení
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900">
                Klubový kiosek u hřiště
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-heading">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🍺</div>
                  <div className="font-bold text-slate-900">{concessions.beerName}</div>
                  <div className="text-xs text-slate-500 font-sans">Točené pivo 0.5l</div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {concessions.beerPrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🌭</div>
                  <div className="font-bold text-slate-900">{concessions.sausageName}</div>
                  <div className="text-xs text-slate-500 font-sans">Klobása z udírny</div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {concessions.sausagePrice} Kč
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-2xl mb-1">🥤</div>
                  <div className="font-bold text-slate-900">{concessions.lemonadeName}</div>
                  <div className="text-xs text-slate-500 font-sans">Točená limonáda</div>
                </div>
                <div className="text-2xl font-black text-slate-900 tabular-nums">
                  {concessions.lemonadePrice} Kč
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: AUDIO MODULE ═══ */}
        {hasAudioModule && (
          <section id="audio" className="scroll-mt-20">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-heading font-bold uppercase tracking-widest text-blue-600 mb-1">
                  Klubové audio
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900">
                  Hymna a chorály mužstva {team.name}
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

      {/* Modern Clean Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-slate-200 text-xs text-slate-500 font-heading flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          Oficiální prezentace fotbalového klubu {team.name} · Šablona <strong>Krajský standard</strong>
        </div>
        <div>
          Běží na platformě Prales. Všechna práva vyhrazena.
        </div>
      </footer>
    </div>
  );
}
