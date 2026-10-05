"use client";

import { useState, type CSSProperties } from "react";
import { LeagueTeamLinks } from "./LeagueTeamLinks";
import {
  ANCHOR_OFFSET,
  EMPTY,
  PlayerLink,
  TeamLink,
  clubPartners,
  formatDate,
  formatDateTime,
  transferKindLabel,
} from "./shared";
import type { TemplateProps } from "./types";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf } from "@/components/team/club-scarf";
import { ManagerFace } from "../ManagerFace";
import { TacticalPitch } from "../TacticalPitch";
import { ClubAudioPlayer } from "../ClubAudioPlayer";
import { StadiumPhotoCard } from "../StadiumPhotoCard";
import { PressCenter, hasPressCenterContent } from "../PressCenter";
import { ClubHallOfFame } from "../ClubHallOfFame";

/**
 * Web je v barvách klubu: proměnné `--club-*` nastavuje obal stránky (`clubPaletteStyle`).
 * Dřevo, papír a tabule zůstávají jako materiál, klubovou barvu nesou stuhy, štítky,
 * nadpisy a zvýraznění. Odvozené odstíny šablony:
 * - `--club-ink`: `--club-accent-light` drží kontrast 4.5:1 jen proti čisté bílé, na béžovém
 *   papíře proto drobný barevný text bere o čtvrtinu tmavší odstín.
 * - `--club-tint`: průsvitné podbarvení, papír pod ním prosvítá.
 * - `--club-frame`: rámeček karty, klubová barva namíchaná do béžové.
 * - `--club-chalk`: „křída“ na dřevě a výčepní tabuli. `--club-accent-dark` je počítaný proti
 *   #0b0f17 a na hnědém dřevě by u tmavých klubů spadl pod 4.5:1, proto je ještě zesvětlený.
 * Odstíny jsou proměnné, ne třídy `bg-[color-mix(...)]`: Tailwind pro prohlížeče bez color-mix
 * podstrčí plnou barvu akcentu a tmavý text by na ní zmizel. Neplatná proměnná místo toho
 * nechá pozadí průhledné.
 */
const CLUB_TONES = {
  "--club-ink": "color-mix(in srgb, var(--club-accent-light) 75%, black)",
  "--club-tint": "color-mix(in srgb, var(--club-accent-light) 12%, transparent)",
  "--club-frame": "color-mix(in srgb, var(--club-accent-light) 50%, #cbb092)",
  "--club-chalk": "color-mix(in srgb, var(--club-accent-dark) 65%, white)",
} as CSSProperties;

export function VillagePatriotTemplate({
  data,
  hasSponsorBanner,
  hasAudioModule,
  hasPressOfficer,
  onOpenTickets,
  onOpenHighlights,
  onOpenLightbox,
  isOwner,
}: TemplateProps) {
  const { team, website, roster, matches, concessions, tickets, transfers = [] } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"cards" | "pitch">("cards");
  const [positionFilter, setPositionFilter] = useState<"all" | "GK" | "DEF" | "MID" | "FWD">("all");
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");

  const primary = team.primaryColor || "#2D5F2D";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();
  const leagueName = team.league?.name ?? "Okresní soutěž";
  const announcement = website.announcement?.trim() || null;

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : roster.u21Team;

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

  // Skuteční sponzoři ze smluv klubu; když nikoho nemá, lišta se nevykreslí.
  const partners = clubPartners(data);
  const sponsorLines = [
    { label: "Generální partner", value: partners.general },
    { label: "Partner stadionu", value: partners.stadium },
    { label: "Partneři", value: partners.partners.join(", ") || null },
  ].filter((s): s is { label: string; value: string } => !!s.value);

  // Výčepní tabule: produkt, který klub neprodává (null), se vůbec nevypisuje.
  const menu = [
    { key: "beer", icon: "🍺", desc: "Poctivé točené chlazené pivo", name: concessions.beerName, price: concessions.beerPrice },
    { key: "sausage", icon: "🌭", desc: "Z udírny, chléb, plnotučná hořčice", name: concessions.sausageName, price: concessions.sausagePrice },
    { key: "lemonade", icon: "🥤", desc: "Tradiční točená malinovka 0,5 l", name: concessions.lemonadeName, price: concessions.lemonadePrice },
  ].filter(
    (item): item is { key: string; icon: string; desc: string; name: string; price: number } =>
      item.name !== null && item.price !== null,
  );

  // Domácí vlevo, hosté vpravo; soupeř je odkaz na jeho klubový web.
  const homeSide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? team.name : <TeamLink id={opponent.id} name={opponent.name} />;
  const awaySide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? <TeamLink id={opponent.id} name={opponent.name} /> : team.name;

  return (
    <div className="min-h-screen bg-[#f3ebe1] text-[#2c1b0e] font-sans pb-16" style={CLUB_TONES}>
      {/* Wooden Signboard Header */}
      <header className="bg-[#3b2010] text-[#ffebd4] border-b-8 border-[var(--club-primary)] shadow-2xl relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5 text-center sm:text-left min-w-0">
            {/* Wooden framed badge */}
            <div className="p-2 bg-[#2a160b] border-2 border-[#5c371e] rounded-xl shadow-inner shrink-0 relative">
              <span aria-hidden="true" className="absolute -top-2 -left-2 text-sm">🔩</span>
              <span aria-hidden="true" className="absolute -top-2 -right-2 text-sm">🔩</span>
              <span aria-hidden="true" className="absolute -bottom-2 -left-2 text-sm">🔩</span>
              <span aria-hidden="true" className="absolute -bottom-2 -right-2 text-sm">🔩</span>
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={56}
              />
            </div>

            <div className="min-w-0">
              <div className="text-sm uppercase tracking-wider text-[var(--club-chalk)] font-bold flex items-center gap-1.5 justify-center sm:justify-start">
                <span>🍺</span>
                <span>Vesnický patriot · Krajská fotbalová tradice</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-serif font-black tracking-tight drop-shadow-md text-[#fff3e4] break-words">
                {team.name}
              </h1>
              <div className="text-sm text-[#d8bca4] mt-1">
                Obec {team.village.name} ({team.village.district}) {team.identity.foundingYear ? `· Založeno roku ${team.identity.foundingYear}` : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-4 py-2 bg-[var(--club-bar)] text-[var(--club-on-bar)] hover:brightness-95 border-2 border-[var(--club-secondary)] rounded-xl font-serif font-bold text-sm shadow-lg active:scale-95 transition"
            >
              🎟️ Vstupenky
            </button>
            <span className="text-sm text-[#d8bca4]">
              Vstupné {tickets.adultPrice} Kč, platí se u vstupu
            </span>
          </div>
        </div>

        {/* Rustic Quick Nav Links */}
        <div className="bg-[#2a160b] border-t border-[#4a2b16] px-4 sm:px-8 py-2 text-sm text-[#eed8c5] font-serif font-bold flex items-center gap-5 overflow-x-auto">
          <a href="#plakat" className="hover:text-[var(--club-chalk)] shrink-0">📌 Zápasový plakát</a>
          <a href="#tabulka" className="hover:text-[var(--club-chalk)] shrink-0">📊 Tabulka soutěže</a>
          {announcement && <a href="#nastenka" className="hover:text-[var(--club-chalk)] shrink-0">📋 Vývěska vedení</a>}
          <a href="#kadr" className="hover:text-[var(--club-chalk)] shrink-0">🪪 Hráčské registračky</a>
          <a href="#prestupy" className="hover:text-[var(--club-chalk)] shrink-0">📜 Změny v kádru ({transfers.length})</a>
          <a href="#identita" className="hover:text-[var(--club-chalk)] shrink-0">👕 Dresy & Maskot</a>
          <a href="#bufet" className="hover:text-[var(--club-chalk)] shrink-0">🍻 Výčepní tabule</a>
          {hasPressCenterContent(data) && <a href="#tisk" className="hover:text-[var(--club-chalk)] shrink-0">🎙️ Slovo trenéra</a>}
          {data.history && <a href="#historie" className="hover:text-[var(--club-chalk)] shrink-0">🏆 Síň slávy</a>}
          <a href="#stadion" className="hover:text-[var(--club-chalk)] shrink-0">🏟️ Areál & Udírna</a>
          {hasAudioModule && <a href="#audio" className="text-[var(--club-chalk)] hover:underline shrink-0">📻 Gramofon & Hymna</a>}
        </div>
      </header>

      {/* Sponsor Banner Addon */}
      {hasSponsorBanner && partners.all.length > 0 && (
        <div className="bg-[#e4d3bf] border-b-2 border-[#b89a7a] py-2 px-4 text-center text-sm font-serif text-[#3e2211] break-words">
          <span className="font-bold text-[var(--club-ink)]">⭐ PARTNEŘI NAŠÍ OBECNÍ KOPANÉ: </span>
          {sponsorLines.map((s, i) => (
            <span key={s.label}>
              {i > 0 && " · "}
              {s.label}: <span className="underline font-bold">{s.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 mt-8 space-y-10">
        {/* ═══ SECTION 1: AUTHENTIC VILLAGE MATCHDAY POSTER (A4 Plakát na sloupu) ═══ */}
        <section id="plakat" className={ANCHOR_OFFSET}>
          <div className="bg-[#fefcf8] border-4 border-[var(--club-accent-light)] rounded-2xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
            {/* Thumbtacks in corners */}
            <span className="absolute top-3 left-4 text-2xl drop-shadow">📌</span>
            <span className="absolute top-3 right-4 text-2xl drop-shadow">📌</span>

            <div className="text-center border-b-2 border-dashed border-[#b89a7a] pb-6">
              <div className="inline-block px-3 py-1 bg-[var(--club-bar)] text-[var(--club-on-bar)] border border-[var(--club-accent-light)] font-serif font-black text-sm uppercase tracking-wider rounded-md mb-2 shadow">
                Pozvánka na fotbalové utkání
              </div>
              <h2 className="text-2xl sm:text-5xl font-serif font-black tracking-tight text-[var(--club-accent-light)] uppercase">
                {nextMatch ? "Hraje se mistrák!" : "Mistrák se chystá"}
              </h2>
              {nextMatch && (
                <div className="text-base sm:text-lg font-serif font-bold text-[var(--club-ink)] mt-1">
                  Výkop: {formatDateTime(nextMatch.scheduledAt)}
                </div>
              )}
              <div className="text-sm sm:text-base font-serif italic text-[#704222] mt-1">
                Přijďte fandit našim borcům!
              </div>
            </div>

            {/* Poster Match Card */}
            {nextMatch ? (
              <div className="py-8 grid grid-cols-1 sm:grid-cols-3 items-center gap-6 text-center">
                {/* Home team */}
                <div className="flex flex-col items-center min-w-0">
                  <div className="w-20 h-20 bg-white border-2 border-[var(--club-accent-light)] rounded-2xl p-2 shadow-md flex items-center justify-center mb-2">
                    <BadgePreview
                      primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={60}
                    />
                  </div>
                  <div className="font-serif font-black text-xl text-[#2b170c] break-words max-w-full">
                    {homeSide(nextMatch.isHome, nextMatch.opponent)}
                  </div>
                  <div className="text-sm text-[var(--club-ink)] font-bold mt-0.5">
                    DOMÁCÍ TÝM
                  </div>
                </div>

                {/* VS and Date */}
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-serif font-black text-[var(--club-accent-light)]">VS</span>
                  <div className="mt-2 text-sm font-serif font-bold text-[#2b170c]">
                    {nextMatch.round ? `${nextMatch.round}. kolo soutěže` : "Mistrovské utkání"}
                  </div>
                  <div className="mt-1 text-sm text-[#6e462c] break-words">
                    🏟️ {nextMatch.stadiumName}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenTickets}
                    className="mt-4 px-5 py-2 bg-[var(--club-bar)] text-[var(--club-on-bar)] hover:brightness-95 border border-[var(--club-accent-light)] font-serif font-bold text-sm uppercase rounded-xl shadow-md transition"
                  >
                    Vstupenky
                  </button>
                </div>

                {/* Away team */}
                <div className="flex flex-col items-center min-w-0">
                  <div className="w-20 h-20 bg-white border-2 border-[var(--club-accent-light)] rounded-2xl p-2 shadow-md flex items-center justify-center mb-2">
                    <BadgePreview
                      primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                      secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                      pattern="shield"
                      initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                      size={60}
                    />
                  </div>
                  <div className="font-serif font-black text-xl text-[#2b170c] break-words max-w-full">
                    {awaySide(nextMatch.isHome, nextMatch.opponent)}
                  </div>
                  <div className="text-sm text-[var(--club-ink)] font-bold mt-0.5">
                    HOSTÉ
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm italic text-gray-600">
                Příští termín utkání zatím nebyl stanoven okresním svazem.
              </div>
            )}

            {/* Poster footer notes */}
            <div className="border-t-2 border-dashed border-[#b89a7a] pt-4 flex flex-col sm:flex-row items-center justify-between text-sm text-[#704222] font-serif gap-2 text-center sm:text-left">
              {menu.length > 0 && (
                <div>
                  🍺 <strong>Občerstvení:</strong> {menu.map((item) => item.name).join(", ")}. Bufet otevírá 45 minut před výkopem.
                </div>
              )}
              <div className="shrink-0">🎟️ <strong>Vstupné:</strong> {tickets.adultPrice} Kč, platí se u vstupu</div>
            </div>

            {/* Last match bar */}
            {lastMatch && (
              <div className="mt-4 pt-3 border-t border-[#d4b07b] flex flex-col sm:flex-row items-center justify-between text-sm font-serif text-[#5c371e] gap-2 text-center sm:text-left">
                <div className="min-w-0 break-words">
                  <strong>Poslední utkání:</strong> {homeSide(lastMatch.isHome, lastMatch.opponent)} {lastMatch.scoreHome} : {lastMatch.scoreAway} {awaySide(lastMatch.isHome, lastMatch.opponent)}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="text-[var(--club-ink)] underline hover:no-underline font-bold shrink-0"
                >
                  Sestřih a zápis z utkání →
                </button>
              </div>
            )}

            {/* Recent matches list if available */}
            {recentMatches.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#d4b07b]">
                <div className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-2 font-serif">
                  Poslední odehraná kola
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-serif">
                  {recentMatches.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="p-2 bg-[#fbf7f0] border border-[#d8be9f] rounded-lg flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 break-words">
                        {m.round}. kolo: <strong>{homeSide(m.isHome, m.opponent)}</strong> vs {awaySide(m.isHome, m.opponent)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold px-1.5 py-0.5 bg-[#dfcfbd] rounded text-[#2b170c]">
                          {m.scoreHome}:{m.scoreAway}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenHighlights(m)}
                          className="text-[var(--club-ink)] hover:underline font-bold text-sm"
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
                <div className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-2 font-serif">
                  Rozpis příštích kol
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-serif">
                  {upcomingMatches.slice(0, 4).map((um) => (
                    <div
                      key={um.id}
                      className="p-2 bg-[#fbf7f0] border border-[#d8be9f] rounded-lg flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 break-words">
                        {um.round}. kolo · {um.isHome ? "🏠 Doma" : "✈️ Venku"}:{" "}
                        <strong>
                          <TeamLink id={um.opponent.id} name={um.opponent.name} />
                        </strong>
                      </span>
                      <span className="text-sm text-[#704222] font-semibold shrink-0">
                        {formatDate(um.scheduledAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: TABULKA SOUTĚŽE (WOODEN BULLETIN BOARD TABLE) ═══ */}
        <section id="tabulka" className={ANCHOR_OFFSET}>
          <div className="bg-[#fffdfa] border-2 border-[var(--club-frame)] rounded-3xl p-6 sm:p-8 shadow-md relative font-serif">
            <span className="absolute -top-3 left-8 text-2xl">📌</span>
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-4 flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <div className="text-sm uppercase tracking-widest text-[var(--club-ink)] font-bold">
                  Průběžná tabulka
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[var(--club-accent-light)] break-words">
                  📊 {leagueName}
                </h3>
              </div>
              <span className="text-sm text-[#704222] italic">Oficiální pořadí</span>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
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
                            ? "bg-[var(--club-tint)] font-black text-[var(--club-ink)] border-[var(--club-accent-light)]"
                            : "hover:bg-[#f7f2eb]"
                        }`}
                      >
                        <td className="py-2 px-2 text-center font-bold">{row.pos}.</td>
                        <td className="py-2 px-3 min-w-[9rem]">
                          <TeamLink id={row.teamId} name={row.teamName} />{" "}
                          {row.isCurrentTeam && <span className="text-sm text-[var(--club-ink)] font-bold ml-1 whitespace-nowrap">📍 NÁŠ ODDÍL</span>}
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
              <div className="py-6 text-center text-sm italic text-[#704222]">
                Tabulka soutěže se zpracovává po odehrání úvodních mistrovských kol.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 2: VÝVĚSKA VEDENÍ (NOTICE BOARD ANNOUNCEMENT): jen skutečné prohlášení ═══ */}
        {announcement && (
          <section id="nastenka" className={ANCHOR_OFFSET}>
            <div className="bg-[#fff9e6] border-2 border-[var(--club-frame)] rounded-2xl p-6 shadow-md relative">
              <span className="absolute -top-3 left-6 text-2xl">📌</span>
              <div className="text-sm font-serif font-bold uppercase tracking-wider text-[var(--club-ink)] mb-1">
                Zápis z vývěsky výboru oddílu {hasPressOfficer && "· Tiskový mluvčí"}
              </div>
              <p className="font-serif text-base italic leading-relaxed text-[#2c1b0e] break-words">
                „{announcement}“
              </p>
              <div className="text-right text-sm font-serif text-[var(--club-ink)] font-bold mt-3">
                Výbor oddílu {team.name}
              </div>
            </div>
          </section>
        )}

        {/* ═══ SECTION 3: ČLENSKÉ PRŮKAZKY FAČR (REGISTRAČKY) ═══ */}
        <section id="kadr" className={ANCHOR_OFFSET}>
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-sm font-serif font-bold uppercase tracking-widest text-[var(--club-ink)] mb-1">
                Registrační průkazy
              </div>
              <h2 className="text-2xl sm:text-4xl font-serif font-black text-[var(--club-accent-light)]">
                Hráčské registračky FAČR
              </h2>
              <div className="text-sm text-[#704222] mt-0.5 font-serif">
                Oficiální soupiska hráčů registrovaných u okresního fotbalového svazu
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-Team vs U21 Team Toggle */}
              <div className="bg-[#dfd1bf] p-1 rounded-xl flex flex-wrap gap-1 text-sm font-serif font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "aTeam"
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] shadow"
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
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] shadow"
                      : "text-[#3b2010] hover:bg-[#cfbfab]"
                  }`}
                >
                  🌱 Dorost U21 ({roster.u21Team?.length || 0})
                </button>
              </div>

              {/* Cards vs Pitch view toggle */}
              <div className="bg-[#dfd1bf] p-1 rounded-xl flex gap-1 text-sm font-serif font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1 rounded-lg ${viewMode === "cards" ? "bg-[var(--club-bar)] text-[var(--club-on-bar)]" : "text-[#3b2010]"}`}
                >
                  🪪 Průkazky
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1 rounded-lg ${viewMode === "pitch" ? "bg-[var(--club-bar)] text-[var(--club-on-bar)]" : "text-[#3b2010]"}`}
                >
                  ⚽ Na hřišti
                </button>
              </div>
            </div>
          </div>

          {/* Position Filters */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap text-sm font-serif font-bold">
            {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
              const label = pos === "all" ? "Všechny posty" : pos === "GK" ? "Brankáři" : pos === "DEF" ? "Obránci" : pos === "MID" ? "Záložníci" : "Útočníci";
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    positionFilter === pos
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-[var(--club-accent-light)] shadow-sm"
                      : "bg-[#fbf7f0] text-[#3e2211] border-[#cbb399] hover:bg-[#ede1d1]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {viewMode === "pitch" ? (
            <div className="bg-[#fbf7f0] border-2 border-[var(--club-frame)] rounded-2xl p-6 shadow-md">
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
                  className="bg-[#fffdfa] border-2 border-[var(--club-accent-light)] rounded-xl p-4 shadow-md relative overflow-hidden flex flex-col justify-between hover:shadow-lg transition-transform"
                >
                  {/* Fake Red Stamp Watermark */}
                  <div className="absolute right-2 bottom-8 text-[#d13a3a]/15 font-black text-xl uppercase font-serif rotate-[-18deg] pointer-events-none border-2 border-[#d13a3a]/15 p-1 rounded">
                    FAČR REGISTROVÁNO
                  </div>

                  <div>
                    {/* Header of Registration card */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#dfcfbd] pb-2 mb-3 text-sm font-serif font-bold text-[var(--club-ink)] uppercase">
                      <span className="min-w-0">Českomoravský fotbalový svaz</span>
                      <span className="shrink-0"># {player.squadNumber ?? EMPTY}</span>
                    </div>

                    <div className="flex items-start gap-3.5">
                      {/* Photo with simulated staple */}
                      <div className="w-16 h-20 rounded-md overflow-hidden bg-[#e0d3c1] border border-[#a88a6d] shrink-0 shadow-inner flex items-center justify-center relative">
                        <span aria-hidden="true" className="absolute top-0.5 left-1 text-sm text-gray-600">📎</span>
                        <ManagerFace faceConfig={player.avatar} size={60} />
                      </div>

                      <div className="min-w-0 flex-1 font-serif">
                        <div className="text-sm uppercase font-bold text-[var(--club-ink)]">
                          {player.positionName || player.position}
                        </div>
                        <PlayerLink id={player.id} className="block">
                          <span className="block font-black text-lg text-[#2b170c] leading-tight break-words">
                            {player.lastName}
                          </span>
                          <span className="block text-base text-[#704222] font-semibold break-words">
                            {player.firstName}
                          </span>
                        </PlayerLink>
                        <div className="text-sm text-[#8c5d38] mt-1">
                          Věk: <strong>{player.age} let</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card bottom registration stats */}
                  <div className="mt-4 pt-3 border-t border-[#dfcfbd] grid grid-cols-3 gap-2 text-center text-sm font-serif">
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-sm text-[#704222] font-bold">ZÁPASY</div>
                      <div className="font-black text-[#2b170c]">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-sm text-[#704222] font-bold">GÓLY</div>
                      <div className="font-black text-[var(--club-ink)]">{player.stats.goals}</div>
                    </div>
                    <div className="bg-[#f5ede1] p-1 rounded border border-[#dfcfbd]">
                      <div className="text-sm text-[#704222] font-bold">MINUTY</div>
                      <div className="font-black text-[#2b170c]">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION: ZMĚNY V KÁDRU A PŘESTUPY (VILLAGE NOTICE) ═══ */}
        <section id="prestupy" className={ANCHOR_OFFSET}>
          <div className="bg-[#fffdfa] border-2 border-[var(--club-frame)] rounded-3xl p-6 sm:p-8 shadow-md font-serif">
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3 mb-6 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-sm uppercase tracking-widest text-[var(--club-ink)] font-bold">
                  Přestupový lístek FAČR
                </div>
                <h3 className="text-xl sm:text-3xl font-black text-[var(--club-accent-light)]">
                  📜 Pohyby v kádru & Přestupy
                </h3>
              </div>

              {/* Transfer filter tabs */}
              <div className="flex flex-wrap gap-1.5 text-sm">
                {(["all", "in", "out"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTransferFilter(tab)}
                    className={`px-3 py-1 rounded-lg border font-bold transition ${
                      transferFilter === tab
                        ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-[var(--club-accent-light)] shadow-sm"
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
                          className={`text-sm px-2.5 py-0.5 rounded-full font-bold uppercase ${
                            isIn ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          {isIn ? "🟢 Příchod" : "🔴 Odchod"} · {transferKindLabel(t.kind, t.direction)}
                        </span>
                        <span className="text-sm text-[#704222] font-semibold">
                          {formatDate(t.date)}
                        </span>
                      </div>

                      <div className="text-sm text-[#4a2e18] mb-1 break-words">
                        Hráč:{" "}
                        <PlayerLink id={t.playerId} className="text-base font-bold text-[#2b170c]">
                          {t.playerName}
                        </PlayerLink>
                        {t.otherTeamName && (
                          <>
                            {" · "}
                            {isIn ? "Z klubu" : "Do klubu"}:{" "}
                            <TeamLink id={t.otherTeamId} name={t.otherTeamName} className="font-bold" />
                          </>
                        )}
                      </div>

                      <h4 className="font-bold text-base text-[#2b170c] mb-1 break-words">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-[#4a2e18] leading-relaxed mb-3 break-words">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-[var(--club-tint)] border-l-4 border-[var(--club-accent-light)] rounded-r-xl text-sm italic text-[#3e2211] break-words">
                          <strong>Slovo hráče:</strong> „{t.quote}“
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm italic text-[#704222]">
                Žádné hlášené přestupy ani změny v registračkách v tomto období.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: KLUBOVÁ IDENTITA, DRESY A MASKOT ═══ */}
        <section id="identita" className={`font-serif ${ANCHOR_OFFSET}`}>
          <div className="bg-[#fffdfa] border-2 border-[var(--club-frame)] rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
            <div className="border-b-2 border-dashed border-[#d8be9f] pb-3">
              <div className="text-sm uppercase tracking-widest text-[var(--club-ink)] font-bold">
                Klubové barvy a symboly
              </div>
              <h3 className="text-xl sm:text-3xl font-black text-[var(--club-accent-light)]">
                👕 Zápasová výstroj & Tradice oddílu
              </h3>
            </div>

            {/* Dresy Domácí / Venkovní */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-3">
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
                <div className="text-sm text-[#704222] mt-3">
                  Tradiční barva oddílu: <strong className="text-[#2b170c]">{primary}</strong>
                </div>
              </div>

              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-3">
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
                <div className="text-sm text-[#704222] mt-3">
                  Náhradní barva: <strong className="text-[#2b170c]">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            {/* Šála & Maskot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#d8be9f]">
              <div className="bg-[#fbf7f0] border border-[#d8be9f] rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-3">
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
                <h4 className="text-sm uppercase tracking-wider font-bold text-[var(--club-ink)] mb-3">
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
                      <div className="w-16 h-16 bg-[var(--club-tint)] border border-[var(--club-accent-light)] rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-base text-[#2b170c] break-words">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-sm text-[#704222] italic mt-1 leading-snug break-words">
                          „{team.mascot.story}“
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-[#704222] italic py-3">
                    Oddíl zatím nemá zapsaného oficiálního maskota.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 4: VÝČEPNÍ TABULE (PUB CHALKBOARD BUFET) ═══ */}
        <section id="bufet" className={ANCHOR_OFFSET}>
          <div className="bg-[#242b24] text-[#f2efe9] border-8 border-[#52331c] rounded-3xl p-6 sm:p-10 shadow-2xl relative">
            <div className="text-center border-b-2 border-dashed border-[#445944] pb-4 mb-6">
              <div className="text-sm uppercase tracking-widest text-[var(--club-chalk)] font-serif font-bold">
                Místní hospoda & kiosek
              </div>
              <h2 className="text-2xl sm:text-4xl font-serif font-black text-[#ffffff]">
                🍺 Na čepu a v udírně
              </h2>
              <div className="text-sm text-[#a3b8a3] mt-1 font-serif italic">
                {menu.length > 0 ? "Bufet otevírá 45 minut před výkopem." : "Bufet zatím nic neprodává."}
              </div>
            </div>

            {menu.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-serif">
                {menu.map((item) => (
                  <div key={item.key} className="bg-[#1b211b] border border-[#3b473b] p-5 rounded-2xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-3xl mb-1">{item.icon}</div>
                      <div className="text-lg font-bold text-white break-words">{item.name}</div>
                      <div className="text-sm text-[#a3b8a3]">{item.desc}</div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-[var(--club-chalk)] shrink-0">
                      {item.price} Kč
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══ TISKOVÉ STŘEDISKO ═══ */}
        {hasPressCenterContent(data) && (
        <section id="tisk" className={ANCHOR_OFFSET}>
          <div className="mb-4">
            <div className="text-sm font-serif font-bold uppercase tracking-widest text-[var(--club-ink)]">
              Z kabiny a ze zpravodaje
            </div>
            <h2 className="text-2xl sm:text-4xl font-serif font-black text-[var(--club-accent-light)] break-words">
              Slovo trenéra a zprávy klubu
            </h2>
          </div>
          <div className="bg-[#fdf6e3] border-2 border-[var(--club-frame)] rounded-xl p-3 sm:p-5 shadow">
            <PressCenter data={data} tone="light" />
          </div>
        </section>
        )}

        {/* ═══ SÍŇ SLÁVY ═══ */}
        {data.history && (
        <section id="historie" className={ANCHOR_OFFSET}>
          <div className="mb-4">
            <div className="text-sm font-serif font-bold uppercase tracking-widest text-[var(--club-ink)]">
              Kronika oddílu
            </div>
            <h2 className="text-2xl sm:text-4xl font-serif font-black text-[var(--club-accent-light)] break-words">
              Síň slávy
            </h2>
          </div>
          <div className="bg-[#fdf6e3] border-2 border-[var(--club-frame)] rounded-xl p-3 sm:p-5 shadow">
            <ClubHallOfFame history={data.history} tone="light" />
          </div>
        </section>
        )}

        {/* ═══ STADION: FOTKY Z 3D MODELU AREÁLU ═══ */}
        <section id="stadion" className={ANCHOR_OFFSET}>
          <div className="mb-4">
            <div className="text-sm font-serif font-bold uppercase tracking-widest text-[var(--club-ink)]">
              Náš domovský areál
            </div>
            <h2 className="text-2xl sm:text-4xl font-serif font-black text-[var(--club-accent-light)] break-words">
              {team.stadium.name || "Naše hřiště"}
            </h2>
          </div>
          <div className="bg-[#fdf6e3] border-2 border-[var(--club-frame)] rounded-xl p-3 sm:p-5 shadow">
            <StadiumPhotoCard data={data} isOwner={isOwner} tone="light" onOpenLightbox={onOpenLightbox} />
          </div>
        </section>

        {/* ═══ SECTION 6: KLUBOVÝ TRANZISTORÁK (AUDIO ADDON) ═══ */}
        {hasAudioModule && (
          <section id="audio" className={ANCHOR_OFFSET}>
            <div className="bg-[#ebd9c3] border-4 border-[var(--club-accent-light)] rounded-2xl p-6 shadow-md">
              <div className="text-sm font-serif font-bold uppercase tracking-widest text-[var(--club-ink)] mb-1 flex items-center gap-1.5">
                <span>📻</span>
                <span>Klubový gramofon a rádio v kabině</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-serif font-black text-[var(--club-ink)] mb-4 break-words">
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
      <footer className="max-w-5xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t-2 border-[#b89a7a] text-sm text-[#704222] font-serif text-center space-y-1">
        <div>
          Oficiální vesnická vývěska oddílu {team.name} · Šablona <strong>Vesnický patriot</strong>
        </div>
        <div>
          Foceno a psáno s láskou k českému okresnímu fotbalu. Všechna práva vyhrazena.
        </div>
        <LeagueTeamLinks
          standings={standings}
          className="pt-3 space-y-1 border-t border-[#b89a7a]/50"
          titleClassName="font-bold uppercase tracking-wider"
          linkClassName="hover:underline"
        />
      </footer>
    </div>
  );
}
