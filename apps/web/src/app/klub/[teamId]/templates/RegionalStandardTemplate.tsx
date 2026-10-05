"use client";

import { useState, type CSSProperties } from "react";
import { LeagueTeamLinks } from "./LeagueTeamLinks";
import { ROLE_DEFS, type StaffRole } from "@okresni-masina/shared";
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
import { StadiumPhotoCard } from "../StadiumPhotoCard";
import { ClubAudioPlayer } from "../ClubAudioPlayer";
import {
  AWARD_TITLES,
  PRESS_NEWS_TYPES,
  awardsBySeason,
  cupMatchText,
  cupResultText,
  hasHistory,
  hasPressContent,
  historyIntro,
  interviewCoach,
  interviewHeadline,
  interviewPairs,
  pressInterviews,
  pressNews,
  trophyTitle,
  type Interview,
} from "./club-content";
import type { ClubWebsiteHistoryAward, ClubWebsiteHistoryCupRun } from "@okresni-masina/shared";

/**
 * Web je v barvách klubu: proměnné `--club-*` nastavuje obal stránky (`clubPaletteStyle`).
 * Odvozené odstíny šablony:
 * - `--club-ink`: `--club-accent-light` drží kontrast 4.5:1 jen proti čisté bílé, na šedých
 *   kartičkách (slate-50) a barevných štítcích proto drobný text bere o čtvrtinu tmavší odstín.
 * - `--club-tint` / `--club-tint-strong`: světlé podbarvení štítků a našeho řádku v tabulce.
 * - `--club-line`: světlý rámeček.
 * Odstíny jsou proměnné, ne třídy `bg-[color-mix(...)]`: Tailwind pro prohlížeče bez color-mix
 * podstrčí plnou barvu akcentu a tmavý text by na ní zmizel. Neplatná proměnná místo toho
 * nechá pozadí průhledné.
 */
const CLUB_TONES = {
  "--club-ink": "color-mix(in srgb, var(--club-accent-light) 75%, black)",
  "--club-tint": "color-mix(in srgb, var(--club-accent-light) 10%, white)",
  "--club-tint-strong": "color-mix(in srgb, var(--club-accent-light) 18%, white)",
  "--club-line": "color-mix(in srgb, var(--club-accent-light) 30%, white)",
} as CSSProperties;

export function RegionalStandardTemplate({
  data,
  hasSponsorBanner,
  hasAudioModule,
  hasPressOfficer,
  onOpenTickets,
  onOpenHighlights,
  onOpenLightbox,
  isOwner,
}: TemplateProps) {
  const { team, website, manager, staff, roster, matches, concessions, tickets, transfers = [] } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"cards" | "pitch">("cards");
  const [positionFilter, setPositionFilter] = useState<"all" | "GK" | "DEF" | "MID" | "FWD">("all");
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");
  const [openInterviews, setOpenInterviews] = useState<Record<string, boolean>>({});

  // Tiskové středisko a historie: jen data, vzhled dělá tahle šablona sama.
  const showPress = hasPressContent(data);
  const [latestInterview, ...olderInterviews] = pressInterviews(data);
  const clubNews = pressNews(data);
  const history = hasHistory(data.history) ? data.history : null;
  const awardGroups = history ? awardsBySeason(history) : [];

  const primary = team.primaryColor || "#2D5F2D";
  const secondary = team.secondaryColor || "#ffffff";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();
  const leagueName = team.league?.name ?? "Okresní soutěž";
  const announcement = website.announcement?.trim() || null;

  const currentRoster = activeRosterTab === "aTeam" ? roster.aTeam : (roster.u21Team || []);
  const hasStaff = !!manager || staff.length > 0;

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

  // Ceník bufetu: produkt, který klub neprodává (null), se vůbec nevypisuje.
  const menu = [
    { key: "beer", icon: "🍺", desc: "Točené pivo 0,5 l", name: concessions.beerName, price: concessions.beerPrice },
    { key: "sausage", icon: "🌭", desc: "Klobása z udírny", name: concessions.sausageName, price: concessions.sausagePrice },
    { key: "lemonade", icon: "🥤", desc: "Točená limonáda", name: concessions.lemonadeName, price: concessions.lemonadePrice },
  ].filter(
    (item): item is { key: string; icon: string; desc: string; name: string; price: number } =>
      item.name !== null && item.price !== null,
  );
  const beer = menu.find((item) => item.key === "beer");

  const staffRoleLabel = (st: { role: string; profession: string }) =>
    ROLE_DEFS[st.role as StaffRole]?.label ?? ROLE_DEFS[st.profession as StaffRole]?.label ?? "Realizační tým";

  // Domácí vlevo, hosté vpravo; soupeř je odkaz na jeho klubový web.
  const homeSide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? team.name : <TeamLink id={opponent.id} name={opponent.name} />;
  const awaySide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? <TeamLink id={opponent.id} name={opponent.name} /> : team.name;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16" style={CLUB_TONES}>
      {/* Top Accent Strip */}
      <div className="h-1.5 w-full bg-[var(--club-secondary)]" />

      {/* Modern Clean Header (nelepí, nahoře už je lišta z ClubWebsiteClient) */}
      <header className="bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-black/10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3.5 min-w-0">
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
            <div className="min-w-0">
              <div className="text-sm font-bold text-[var(--club-on-bar)] uppercase tracking-wider">
                Oficiální klubový portál
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl text-[var(--club-on-bar)] tracking-tight break-words">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--club-on-bar)]">
              Vstupné <strong className="text-[var(--club-on-bar)]">{tickets.adultPrice} Kč</strong>
            </span>
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-4 py-2 rounded-xl bg-[var(--club-on-bar)] text-[var(--club-bar)] font-heading font-extrabold text-sm shadow hover:opacity-90 active:scale-95 transition"
            >
              🎟️ Vstupenky
            </button>
          </div>
        </div>
      </header>

      {/* Horizontal Navigation Pills (lepí pod horní lištou ClubWebsiteClient) */}
      <nav className="bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm sticky top-[52px] z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2 text-sm font-heading font-bold text-slate-600 flex items-center gap-6 overflow-x-auto">
          <a href="#zapas" className="hover:text-[var(--club-accent-light)] shrink-0">⚽ Zápasy</a>
          <a href="#tabulka" className="hover:text-[var(--club-accent-light)] shrink-0">📊 Tabulka</a>
          <a href="#kadr" className="hover:text-[var(--club-accent-light)] shrink-0">👥 Soupiska</a>
          <a href="#prestupy" className="hover:text-[var(--club-accent-light)] shrink-0">📜 Přestupy ({transfers.length})</a>
          <a href="#identita" className="hover:text-[var(--club-accent-light)] shrink-0">👕 Dresy & Maskot</a>
          {showPress && <a href="#tisk" className="hover:text-[var(--club-accent-light)] shrink-0">🎙️ Tisk</a>}
          {history && <a href="#historie" className="hover:text-[var(--club-accent-light)] shrink-0">🏆 Historie</a>}
          <a href="#stadion" className="hover:text-[var(--club-accent-light)] shrink-0">🏟️ Stadion & Areál</a>
          <a href="#bufet" className="hover:text-[var(--club-accent-light)] shrink-0">🍺 Občerstvení</a>
          {hasAudioModule && <a href="#audio" className="text-[var(--club-accent-light)] hover:underline shrink-0">🎵 Audio přehrávač</a>}
          {hasStaff && <a href="#realizak" className="hover:text-[var(--club-accent-light)] shrink-0">👔 Realizační tým</a>}
        </div>
      </nav>

      {/* Sponsor Banner Addon */}
      {hasSponsorBanner && partners.all.length > 0 && (
        <div className="bg-slate-100 border-b border-slate-200 py-2.5 px-4 text-sm font-heading text-center text-slate-700 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap">
          <span className="font-extrabold text-slate-900 uppercase">Partneři klubu:</span>
          {sponsorLines.map((s) => (
            <span key={s.label} className="text-slate-600 break-words">
              {s.label}: <strong className="font-semibold text-slate-900">{s.value}</strong>
            </span>
          ))}
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-10">
        {/* Press Announcement Box: jen skutečné prohlášení vedení */}
        {announcement && (
          <div className="bg-white border-l-4 p-5 rounded-2xl shadow-sm border-[var(--club-accent-light)]">
            <div className="text-sm uppercase font-heading font-extrabold text-[var(--club-accent-light)] mb-1 flex items-center gap-2">
              <span>📢</span>
              <span>Oficiální prohlášení klubu {hasPressOfficer && "· Tiskový mluvčí"}</span>
            </div>
            <p className="text-slate-800 text-base leading-relaxed italic break-words">
              „{announcement}“
            </p>
          </div>
        )}

        {/* ═══ SECTION 1: MODERN MATCH CENTER ═══ */}
        <section id="zapas" className={ANCHOR_OFFSET}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Next Match Card */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-heading font-bold uppercase text-slate-500 mb-4">
                  <span>Příští zápas · {nextMatch?.round ? `${nextMatch.round}. kolo` : "Nadcházející utkání"}</span>
                  {nextMatch && (
                    <span className="px-2.5 py-1 rounded-full bg-[var(--club-tint)] text-[var(--club-ink)] border border-[var(--club-line)] font-black">
                      {nextMatch.isHome ? "Domácí utkání" : "Venkovní utkání"}
                    </span>
                  )}
                </div>

                {nextMatch ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-4">
                    {/* Home team */}
                    <div className="flex flex-col items-center sm:items-start text-center sm:text-left min-w-0">
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100 mb-2">
                        <BadgePreview
                          primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                          secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                          pattern="shield"
                          initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                          size={52}
                        />
                      </div>
                      <div className="font-heading font-black text-lg sm:text-xl text-slate-900 break-words max-w-full">
                        {homeSide(nextMatch.isHome, nextMatch.opponent)}
                      </div>
                      <div className="text-sm text-slate-500 font-medium">Domácí celek</div>
                    </div>

                    <div className="text-center">
                      <div className="text-2xl sm:text-3xl font-heading font-black text-slate-400">VS</div>
                      <div className="text-sm font-heading font-bold text-[var(--club-accent-light)] mt-1">
                        {formatDateTime(nextMatch.scheduledAt)}
                      </div>
                    </div>

                    {/* Away team */}
                    <div className="flex flex-col items-center sm:items-end text-center sm:text-right min-w-0">
                      <div className="p-2 rounded-2xl bg-slate-50 border border-slate-100 mb-2">
                        <BadgePreview
                          primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                          secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                          pattern="shield"
                          initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                          size={52}
                        />
                      </div>
                      <div className="font-heading font-black text-lg sm:text-xl text-slate-900 break-words max-w-full">
                        {awaySide(nextMatch.isHome, nextMatch.opponent)}
                      </div>
                      <div className="text-sm text-slate-500 font-medium">Hostující celek</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    Žádný nadcházející zápas v kalendáři.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                <div className="text-center sm:text-left min-w-0">
                  <div className="text-slate-600 font-medium break-words">
                    📍 Stadion: <strong>{nextMatch?.stadiumName || team.stadium.name || EMPTY}</strong>
                  </div>
                  <div className="text-slate-500">
                    Vstupné {tickets.adultPrice} Kč, platí se u vstupu
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenTickets}
                  className="px-4 py-2 rounded-xl bg-[var(--club-bar)] text-[var(--club-on-bar)] ring-1 ring-inset ring-black/10 font-heading font-bold shadow hover:opacity-90 transition shrink-0"
                >
                  Vstupenky
                </button>
              </div>
            </div>

            {/* Last Match Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-sm font-heading font-bold uppercase text-slate-500 mb-3">
                  Výsledek posledního kola
                </div>
                {lastMatch ? (
                  <div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center my-2">
                      <div className="font-heading font-extrabold text-sm text-slate-700 break-words">
                        {homeSide(lastMatch.isHome, lastMatch.opponent)} vs {awaySide(lastMatch.isHome, lastMatch.opponent)}
                      </div>
                      <div className="text-3xl font-heading font-black text-slate-900 my-1 tabular-nums">
                        {lastMatch.scoreHome} : {lastMatch.scoreAway}
                      </div>
                      <div className="text-sm text-slate-500">
                        {lastMatch.round ? `${lastMatch.round}. kolo soutěže` : "Konečný výsledek"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenHighlights(lastMatch)}
                      className="w-full mt-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-heading font-bold text-sm transition"
                    >
                      ▶ Zobrazit sestřih a reportáž
                    </button>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 text-sm">
                    Zatím nebyl odehrán žádný mistrovský zápas.
                  </div>
                )}
              </div>

              {beer && (
                <div className="pt-4 border-t border-slate-100 text-sm text-slate-600 flex justify-between gap-3">
                  <span className="min-w-0 break-words">🍺 {beer.name}</span>
                  <span className="font-bold text-slate-900 shrink-0">{beer.price} Kč</span>
                </div>
              )}
            </div>
          </div>

          {/* Recent & Upcoming Matches Grid */}
          {(recentMatches.length > 0 || upcomingMatches.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Recent matches */}
              {recentMatches.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <span className="font-heading font-extrabold text-sm uppercase tracking-wider text-slate-700">
                      Nedávno odehraná kola
                    </span>
                    <span className="text-sm text-slate-400 font-medium">Archiv</span>
                  </div>
                  <div className="space-y-2">
                    {recentMatches.slice(0, 4).map((m) => (
                      <div
                        key={m.id}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-400 uppercase">{m.round}. kolo</div>
                          <div className="font-bold text-slate-900 break-words">
                            {homeSide(m.isHome, m.opponent)} vs {awaySide(m.isHome, m.opponent)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-black px-2 py-0.5 bg-slate-200 rounded text-slate-900 font-mono">
                            {m.scoreHome}:{m.scoreAway}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenHighlights(m)}
                            className="text-[var(--club-ink)] hover:underline font-heading font-bold text-sm"
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
                <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <span className="font-heading font-extrabold text-sm uppercase tracking-wider text-slate-700">
                      Kalendář příštích zápasů
                    </span>
                    <span className="text-sm text-slate-400 font-medium">Rozpis</span>
                  </div>
                  <div className="space-y-2">
                    {upcomingMatches.slice(0, 4).map((um) => (
                      <div
                        key={um.id}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-400">
                            {um.round}. kolo · {formatDate(um.scheduledAt)}
                          </div>
                          <div className="font-semibold text-slate-800 break-words">
                            Soupeř: <strong><TeamLink id={um.opponent.id} name={um.opponent.name} /></strong>
                          </div>
                        </div>
                        <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          um.isHome ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-200 text-slate-700"
                        }`}>
                          {um.isHome ? "Doma" : "Venku"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══ SECTION: TABULKA SOUTĚŽE (LEAGUE STANDINGS) ═══ */}
        <section id="tabulka" className={ANCHOR_OFFSET}>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div className="min-w-0">
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500">
                  Soutěžní tabulka
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-black text-slate-900 break-words">
                  {leagueName}
                </h3>
              </div>
              <span className="text-sm text-slate-500 font-medium">Aktualizováno po každém kole</span>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-heading font-bold text-sm uppercase tracking-wider">
                      <th className="py-2.5 px-3 text-center w-10">Poř.</th>
                      <th className="py-2.5 px-3">Tým</th>
                      <th className="py-2.5 px-2 text-center">Z</th>
                      <th className="py-2.5 px-2 text-center">V</th>
                      <th className="py-2.5 px-2 text-center">R</th>
                      <th className="py-2.5 px-2 text-center">P</th>
                      <th className="py-2.5 px-3 text-center">Skóre</th>
                      <th className="py-2.5 px-3 text-center font-black">Body</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {standings.map((row) => (
                      <tr
                        key={row.teamId}
                        className={`transition ${
                          row.isCurrentTeam
                            ? "bg-[var(--club-tint)] font-bold text-[var(--club-ink)] border-l-4 border-l-[var(--club-accent-light)]"
                            : "hover:bg-slate-50/60 text-slate-700"
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-heading font-extrabold text-slate-500">
                          {row.pos}.
                        </td>
                        <td className="py-2.5 px-3 font-medium min-w-[9rem]">
                          <TeamLink id={row.teamId} name={row.teamName} />{" "}
                          {row.isCurrentTeam && <span className="text-sm font-black text-[var(--club-ink)] ml-1.5 px-1.5 py-0.5 bg-[var(--club-tint-strong)] rounded whitespace-nowrap">NÁŠ TÝM</span>}
                        </td>
                        <td className="py-2.5 px-2 text-center">{row.played}</td>
                        <td className="py-2.5 px-2 text-center text-emerald-700 font-bold">{row.won}</td>
                        <td className="py-2.5 px-2 text-center text-slate-600">{row.drawn}</td>
                        <td className="py-2.5 px-2 text-center text-red-600 font-bold">{row.lost}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{row.gf}:{row.ga}</td>
                        <td className="py-2.5 px-3 text-center font-heading font-black text-slate-900 bg-slate-100/60">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400 italic">
                Ligová tabulka se sestavuje po odehrání úvodních mistrovských kol.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 2: CLEAN MODERN ROSTER ═══ */}
        <section id="kadr" className={ANCHOR_OFFSET}>
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                Klubový kádr
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-3xl text-slate-900">
                Soupiska hráčů
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-Team vs U21 Toggle */}
              <div className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 text-sm font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("aTeam")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "aTeam"
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ⚽ A-Tým ({roster.aTeam.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRosterTab("u21Team")}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    activeRosterTab === "u21Team"
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  🌱 Dorost U21 ({roster.u21Team?.length || 0})
                </button>
              </div>

              <div className="bg-slate-100 p-1 rounded-xl flex gap-1 text-sm font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-white text-[var(--club-accent-light)] shadow-sm" : "text-slate-600"}`}
                >
                  📋 Seznam
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-white text-[var(--club-accent-light)] shadow-sm" : "text-slate-600"}`}
                >
                  ⚽ Taktika 11
                </button>
              </div>
            </div>
          </div>

          {/* Position Filters */}
          <div className="flex items-center gap-1.5 mb-6 flex-wrap text-sm font-heading font-bold">
            {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
              const label = pos === "all" ? "Všichni" : pos === "GK" ? "Brankáři" : pos === "DEF" ? "Obránci" : pos === "MID" ? "Záložníci" : "Útočníci";
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  className={`px-3.5 py-1.5 rounded-lg border transition ${
                    positionFilter === pos
                      ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-[var(--club-accent-light)] shadow-sm"
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
                        <span className="min-w-7 h-7 px-1 rounded bg-[var(--club-bar)] text-[var(--club-on-bar)] font-heading font-black text-sm flex items-center justify-center shrink-0 border border-black/10">
                          {player.squadNumber ?? EMPTY}
                        </span>
                        <span className="text-sm font-heading font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <PlayerLink
                        id={player.id}
                        className="block font-heading font-extrabold text-base sm:text-lg text-slate-900 mt-1 leading-tight break-words"
                      >
                        {player.firstName} {player.lastName}
                      </PlayerLink>
                      <div className="text-sm text-slate-500 mt-0.5">
                        {player.age} let
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-1 text-center font-heading text-sm">
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-sm text-slate-500">ZÁPASY</div>
                      <div className="font-bold text-slate-900">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-sm text-slate-500">GÓLY</div>
                      <div className="font-bold text-slate-900">{player.stats.goals}</div>
                    </div>
                    <div className="bg-slate-50 p-1 rounded border border-slate-100">
                      <div className="text-sm text-slate-500">MINUTY</div>
                      <div className="font-bold text-slate-900">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══ SECTION: PŘESTUPY & POHYBY V KÁDRU ═══ */}
        <section id="prestupy" className={ANCHOR_OFFSET}>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3 flex-wrap gap-3">
              <div>
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500">
                  Přestupový trh
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                  Pohyby v kádru & Změny
                </h3>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-heading font-bold">
                {(["all", "in", "out"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTransferFilter(tab)}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      transferFilter === tab
                        ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] border-[var(--club-accent-light)] shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
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
                      className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl transition hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wider ${
                            isIn
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {isIn ? "🟢 Příchod" : "🔴 Odchod"} · {transferKindLabel(t.kind, t.direction)}
                        </span>
                        <span className="text-sm text-slate-500 font-medium">
                          {formatDate(t.date)}
                        </span>
                      </div>

                      <div className="text-sm text-slate-600 mb-1 break-words">
                        Hráč:{" "}
                        <PlayerLink id={t.playerId} className="text-base font-bold text-slate-900">
                          {t.playerName}
                        </PlayerLink>
                        {t.otherTeamName && (
                          <>
                            {" · "}
                            {isIn ? "Z klubu" : "Do klubu"}:{" "}
                            <TeamLink id={t.otherTeamId} name={t.otherTeamName} className="font-bold text-slate-900" />
                          </>
                        )}
                      </div>

                      <h4 className="font-heading font-bold text-base text-slate-900 mb-1 break-words">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-slate-600 leading-relaxed mb-3 break-words">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-white border-l-4 border-[var(--club-accent-light)] rounded-r-xl text-sm italic text-slate-700 shadow-sm break-words">
                          <strong>Slovo hráče:</strong> „{t.quote}“
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400 italic">
                V tomto přestupovém okně nejsou zaznamenány žádné pohyby v kádru.
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION: KLUBOVÁ IDENTITA, DRESY A MASKOT ═══ */}
        <section id="identita" className={ANCHOR_OFFSET}>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500">
                Klubové barvy & Symboly
              </div>
              <h3 className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                Zápasové dresy & Klubová identita
              </h3>
            </div>

            {/* Kits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wider font-heading font-bold text-slate-600 mb-3">
                  Domácí zápasová výstroj
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
                <div className="text-sm text-slate-500 mt-3 font-mono">
                  Primární barva: <strong className="text-slate-800">{primary}</strong>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wider font-heading font-bold text-slate-600 mb-3">
                  Venkovní záložní výstroj
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
                <div className="text-sm text-slate-500 mt-3 font-mono">
                  Sekundární barva: <strong className="text-slate-800">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            {/* Scarf & Mascot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-slate-100">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wider font-heading font-bold text-slate-600 mb-3">
                  🧣 Oficiální fanklubová šála
                </h4>
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as any) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-sm rounded-lg"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wider font-heading font-bold text-slate-600 mb-3">
                  🦁 Klubový maskot
                </h4>
                {team.mascot?.name ? (
                  <div className="flex items-center gap-4">
                    {team.mascot.imageUrl ? (
                      <img
                        src={team.mascot.imageUrl}
                        alt={team.mascot.name}
                        className="w-16 h-16 rounded-xl border border-slate-200 object-cover shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-[var(--club-tint)] border border-[var(--club-line)] rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-heading font-bold text-base text-slate-900 break-words">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-sm text-slate-600 italic mt-1 leading-snug break-words">
                          „{team.mascot.story}“
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 italic py-3">
                    Klub v současnosti nemá oficiálně zapsaného maskota.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION: TISKOVÉ STŘEDISKO ═══ */}
        {showPress && (
          <section id="tisk" className={ANCHOR_OFFSET}>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-100 pb-3">
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500">
                  Tiskové středisko
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                  Rozhovory & Zprávy z klubu
                </h3>
              </div>

              <div className="space-y-8">
                {latestInterview && (
                  <article className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wider bg-[var(--club-tint)] text-[var(--club-ink)] border border-[var(--club-line)]">
                        Rozhovor s trenérem
                      </span>
                      <span className="text-sm text-slate-500 font-medium">
                        {formatDate(latestInterview.createdAt)}
                      </span>
                    </div>
                    <h4 className="font-heading font-black text-lg sm:text-xl text-slate-900 mb-1 break-words">
                      {interviewHeadline(latestInterview)}
                    </h4>
                    <div className="text-sm text-slate-600 mb-4 break-words">
                      Odpovídá trenér{" "}
                      <strong className="text-base font-bold text-slate-900">{interviewCoach(latestInterview, data)}</strong>
                    </div>
                    <InterviewText interview={latestInterview} />
                  </article>
                )}

                {olderInterviews.length > 0 && (
                  <div>
                    <BlockTitle title="Starší rozhovory" note="Archiv" />
                    <ul className="space-y-2">
                      {olderInterviews.map((iv) => {
                        const open = !!openInterviews[iv.id];
                        const panelId = `rozhovor-${iv.id}`;
                        return (
                          <li key={iv.id} className="bg-slate-50 border border-slate-100 rounded-xl">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={panelId}
                              onClick={() => setOpenInterviews((s) => ({ ...s, [iv.id]: !s[iv.id] }))}
                              className="w-full p-3 flex items-center justify-between gap-3 text-left text-sm"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-500">
                                  {formatDate(iv.createdAt)}
                                </span>
                                <span className="block text-base font-bold text-slate-900 break-words">
                                  {interviewHeadline(iv)}
                                </span>
                              </span>
                              <span className="text-[var(--club-ink)] hover:underline font-heading font-bold text-sm shrink-0">
                                {open ? "Skrýt" : "Číst rozhovor"}
                              </span>
                            </button>
                            <div id={panelId} hidden={!open} className="px-3 pb-4 pt-1 border-t border-slate-100">
                              <div className="text-sm text-slate-600 my-3 break-words">
                                Odpovídá trenér{" "}
                                <strong className="text-base font-bold text-slate-900">{interviewCoach(iv, data)}</strong>
                              </div>
                              <InterviewText interview={iv} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {clubNews.length > 0 && (
                  <div>
                    <BlockTitle title="Zprávy z klubu" />
                    <div className="space-y-4">
                      {clubNews.map((n) => (
                        <article
                          key={n.id}
                          className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-2xl transition hover:border-slate-300"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wider bg-[var(--club-tint)] text-[var(--club-ink)] border border-[var(--club-line)]">
                              {PRESS_NEWS_TYPES.get(n.type)}
                            </span>
                            <span className="text-sm text-slate-500 font-medium">
                              {formatDate(n.created_at)}
                            </span>
                          </div>
                          <h4 className="font-heading font-bold text-base text-slate-900 mb-1 break-words">
                            {n.headline}
                          </h4>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words">
                            {n.body}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ═══ SECTION: HISTORIE KLUBU ═══ */}
        {history && (
          <section id="historie" className={ANCHOR_OFFSET}>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-100 pb-3">
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500">
                  Kronika oddílu
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-black text-slate-900">
                  Historie klubu
                </h3>
              </div>

              <div className="space-y-8">
                <p className="text-base text-slate-700 leading-relaxed break-words">
                  {historyIntro(history, team.name)}
                </p>

                {history.trophies.length > 0 && (
                  <div>
                    <BlockTitle title="Úspěchy klubu" />
                    <ul className="divide-y divide-slate-100">
                      {history.trophies.map((tr) => (
                        <li
                          key={`${tr.seasonNumber}-${tr.kind}-${tr.competitionName}`}
                          className="py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                        >
                          <span className="text-sm font-bold text-slate-500 w-24 shrink-0">{tr.seasonNumber}. sezóna</span>
                          <span className="text-base font-bold text-slate-900 min-w-0 break-words">{trophyTitle(tr)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {history.seasons.length > 0 && (
                  <div>
                    <BlockTitle title="Umístění v soutěžích" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-heading font-bold text-sm uppercase tracking-wider">
                            <th className="py-2.5 px-3 text-center whitespace-nowrap">Sezóna</th>
                            <th className="py-2.5 px-3">Soutěž</th>
                            <th className="py-2.5 px-3 text-center">Místo</th>
                            <th className="py-2.5 px-2 text-center">Z</th>
                            <th className="py-2.5 px-2 text-center">V</th>
                            <th className="py-2.5 px-2 text-center">R</th>
                            <th className="py-2.5 px-2 text-center">P</th>
                            <th className="py-2.5 px-3 text-center">Skóre</th>
                            <th className="py-2.5 px-3 text-center font-black">Body</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {history.seasons.map((s) => (
                            <tr key={s.seasonNumber} className="transition hover:bg-slate-50/60 text-slate-700">
                              <td className="py-2.5 px-3 text-center font-heading font-extrabold text-slate-500">
                                {s.seasonNumber}.
                              </td>
                              <td className="py-2.5 px-3 font-medium min-w-[9rem]">{s.leagueName}</td>
                              <td className="py-2.5 px-3 text-center font-heading font-extrabold text-slate-900 whitespace-nowrap">
                                {s.position}.
                              </td>
                              <td className="py-2.5 px-2 text-center">{s.played ?? EMPTY}</td>
                              <td className="py-2.5 px-2 text-center text-emerald-700 font-bold">{s.wins ?? EMPTY}</td>
                              <td className="py-2.5 px-2 text-center text-slate-600">{s.draws ?? EMPTY}</td>
                              <td className="py-2.5 px-2 text-center text-red-600 font-bold">{s.losses ?? EMPTY}</td>
                              <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                                {s.goalsFor !== null && s.goalsAgainst !== null ? `${s.goalsFor}:${s.goalsAgainst}` : EMPTY}
                              </td>
                              <td className="py-2.5 px-3 text-center font-heading font-black text-slate-900 bg-slate-100/60">
                                {s.points ?? EMPTY}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(awardGroups.length > 0 || history.cup.length > 0) && (
                  <div className={awardGroups.length > 0 && history.cup.length > 0 ? "grid grid-cols-1 md:grid-cols-2 gap-8" : ""}>
                    {awardGroups.length > 0 && (
                      <div>
                        <BlockTitle title="Ocenění" />
                        <div className="space-y-5">
                          {awardGroups.map((group) => {
                            const eleven = group.bestEleven.filter((a): a is ClubWebsiteHistoryAward & { name: string } => !!a.name);
                            return (
                              <div key={group.seasonNumber}>
                                <div className="text-sm font-heading font-bold text-slate-500 break-words">
                                  {group.seasonNumber}. sezóna · {group.leagueName}
                                </div>
                                <ul className="divide-y divide-slate-100">
                                  {group.single.map((a, i) => (
                                    <li key={`${a.kind}-${i}`} className="py-2.5">
                                      <div className="text-sm font-heading font-bold uppercase text-[var(--club-ink)]">
                                        {AWARD_TITLES[a.kind]}
                                      </div>
                                      <HistoryName
                                        id={a.playerId}
                                        name={a.name ?? (a.kind === "manager_of_season" ? "Trenér klubu" : "Jméno se nedochovalo")}
                                        className="text-base font-bold text-slate-900 break-words"
                                      />
                                      {a.detail && (
                                        <p className="text-sm text-slate-600 leading-relaxed break-words">{a.detail}</p>
                                      )}
                                    </li>
                                  ))}
                                  {eleven.length > 0 && (
                                    <li className="py-2.5">
                                      <div className="text-sm font-heading font-bold uppercase text-[var(--club-ink)]">
                                        {AWARD_TITLES.best_eleven}
                                      </div>
                                      <div className="text-base text-slate-900 break-words">
                                        {eleven.map((a, i) => (
                                          <span key={`${a.playerId ?? a.name}-${i}`}>
                                            {i > 0 && ", "}
                                            <HistoryName id={a.playerId} name={a.name} className="font-bold" />
                                          </span>
                                        ))}
                                      </div>
                                    </li>
                                  )}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {history.cup.length > 0 && (
                      <div>
                        <BlockTitle title="Pohár" />
                        <ul className="divide-y divide-slate-100">
                          {history.cup.map((run) => (
                            <li
                              key={`${run.seasonNumber}-${run.cupName}`}
                              className="py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                            >
                              <span className="text-sm font-bold text-slate-500 w-24 shrink-0">{run.seasonNumber}. sezóna</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-bold text-slate-900 break-words">{run.cupName}</div>
                                <div className="text-sm text-slate-600 break-words">
                                  {cupResultText(run)}
                                  <CupMatch run={run} />
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {history.topScorers.length > 0 && (
                  <div>
                    <BlockTitle title="Nejlepší střelci v historii klubu" note="Liga i pohár" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-heading font-bold text-sm uppercase tracking-wider">
                            <th className="py-2.5 px-3 text-center w-10">#</th>
                            <th className="py-2.5 px-3">Hráč</th>
                            <th className="py-2.5 px-3 text-center font-black">Góly</th>
                            <th className="py-2.5 px-3 text-center">Zápasy</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {history.topScorers.map((s, i) => (
                            <tr key={`${s.playerId ?? s.name}-${i}`} className="transition hover:bg-slate-50/60 text-slate-700">
                              <td className="py-2.5 px-3 text-center font-heading font-extrabold text-slate-500">
                                {i + 1}.
                              </td>
                              <td className="py-2.5 px-3 min-w-[10rem]">
                                <HistoryName id={s.playerId} name={s.name} className="text-base font-medium text-slate-900" />
                                {!s.stillAtClub && (
                                  <span className="text-sm text-slate-500 ml-1.5 whitespace-nowrap">(odešel)</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-heading font-black text-slate-900 bg-slate-100/60">
                                {s.goals}
                              </td>
                              <td className="py-2.5 px-3 text-center">{s.appearances}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ═══ STADION: FOTKY Z 3D MODELU AREÁLU ═══ */}
        <section id="stadion" className={ANCHOR_OFFSET}>
          <div className="mb-6">
            <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-ink)] mb-1">
              Klubové zázemí
            </div>
            <h2 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 break-words">
              {team.stadium.name || "Stadion a areál"}
            </h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-6 shadow-sm">
            <StadiumPhotoCard data={data} isOwner={isOwner} tone="light" onOpenLightbox={onOpenLightbox} />
          </div>
        </section>

        {/* ═══ SECTION 4: BUFET ═══ */}
        <section id="bufet" className={ANCHOR_OFFSET}>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                Ceník občerstvení
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900">
                Klubový kiosek u hřiště
              </h2>
              <div className="text-sm text-slate-500 mt-1">
                {menu.length > 0 ? "Bufet otevírá 45 minut před výkopem." : "Bufet zatím nic neprodává."}
              </div>
            </div>

            {menu.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-heading">
                {menu.map((item) => (
                  <div key={item.key} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <div className="font-bold text-slate-900 break-words">{item.name}</div>
                      <div className="text-sm text-slate-500 font-sans">{item.desc}</div>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tabular-nums shrink-0">
                      {item.price} Kč
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 5: AUDIO MODULE ═══ */}
        {hasAudioModule && (
          <section id="audio" className={ANCHOR_OFFSET}>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="mb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-[var(--club-accent-light)] mb-1">
                  Klubové audio
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900 break-words">
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

        {/* ═══ SECTION 6: REALIZAČNÍ TÝM (cíl odkazu v navigaci) ═══ */}
        {hasStaff && (
          <section id="realizak" className={ANCHOR_OFFSET}>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="mb-6">
                <div className="text-sm font-heading font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Lidé kolem týmu
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-slate-900">
                  Realizační tým
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {manager && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      <ManagerFace faceConfig={manager.avatar} size={52} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-heading font-bold uppercase text-[var(--club-ink)]">Hlavní trenér</div>
                      <div className="font-heading font-extrabold text-base text-slate-900 break-words">{manager.name}</div>
                      <div className="text-sm text-slate-500">{manager.age} let · Licence {manager.licence}</div>
                    </div>
                  </div>
                )}
                {staff.map((st) => (
                  <div key={st.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                    <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                      <ManagerFace faceConfig={st.avatar} size={52} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-heading font-bold uppercase text-slate-500">{staffRoleLabel(st)}</div>
                      <div className="font-heading font-extrabold text-base text-slate-900 break-words">
                        {st.firstName} {st.lastName}
                      </div>
                      <div className="text-sm text-slate-500">{st.age} let</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Modern Clean Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-slate-200 text-sm text-slate-500 font-heading flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4 text-center sm:text-left">
        <div>
          Oficiální prezentace fotbalového klubu {team.name} · Šablona <strong>Krajský standard</strong>
        </div>
        <div>
          Běží na platformě Prales. Všechna práva vyhrazena.
        </div>
        <LeagueTeamLinks
          standings={standings}
          className="w-full text-center space-y-2 pt-4 border-t border-slate-200"
          titleClassName="font-bold uppercase tracking-wider text-slate-400"
          linkClassName="hover:text-slate-800 hover:underline"
        />
      </footer>
    </div>
  );
}

/** Mezititulek uvnitř sekce, stejný jako „Nedávno odehraná kola“. */
function BlockTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 border-b border-slate-100 pb-2">
      <h4 className="font-heading font-extrabold text-sm uppercase tracking-wider text-slate-700 min-w-0 break-words">
        {title}
      </h4>
      {note && <span className="text-sm text-slate-500 font-medium shrink-0">{note}</span>}
    </div>
  );
}

/** Otázka tučně, odpověď trenéra pod ní. */
function InterviewText({ interview }: { interview: Interview }) {
  return (
    <dl className="space-y-4">
      {interviewPairs(interview).map((pair, i) => (
        <div key={i}>
          <dt className="font-heading font-bold text-base text-slate-900 break-words">{pair.question}</dt>
          <dd className="mt-1 text-base text-slate-700 leading-relaxed break-words">{pair.answer}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Hráč, který už ve hře není, nemá profil: jméno zůstane jen textem. */
function HistoryName({ id, name, className }: { id: string | null; name: string; className: string }) {
  return id ? <PlayerLink id={id} className={className}>{name}</PlayerLink> : <span className={className}>{name}</span>;
}

/** Rozhodující pohárový zápas za výsledkem; soupeř ze hry je odkaz na jeho web. */
function CupMatch({ run }: { run: ClubWebsiteHistoryCupRun }) {
  const text = cupMatchText(run);
  const m = run.decidingMatch;
  if (!text || !m) return null;
  if (m.opponentTeamId && text.endsWith(m.opponentName)) {
    return (
      <>
        {" · "}
        {text.slice(0, text.length - m.opponentName.length)}
        <TeamLink id={m.opponentTeamId} name={m.opponentName} className="font-bold text-slate-900" />
      </>
    );
  }
  return <>{` · ${text}`}</>;
}
