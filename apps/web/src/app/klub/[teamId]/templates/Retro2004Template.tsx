"use client";

import { useContext, useState, type CSSProperties } from "react";
import Link from "next/link";
import { LeagueTeamLinks } from "./LeagueTeamLinks";
import { ROLE_DEFS, type StaffRole } from "@okresni-masina/shared";
import {
  ANCHOR_OFFSET,
  ClubBasePathContext,
  EMPTY,
  PlayerLink,
  TeamLink,
  clubPartners,
  formatDate,
  formatDateTime,
  transferKindLabel,
  useFanPoll,
  type PollChoice,
} from "./shared";
import type { TemplateProps } from "./types";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ClubScarf } from "@/components/team/club-scarf";
import { ManagerFace } from "../ManagerFace";
import { TacticalPitch } from "../TacticalPitch";
import { ClubAudioPlayer } from "../ClubAudioPlayer";
import { StadiumPhotoCard } from "../StadiumPhotoCard";
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

/**
 * Web je v barvách klubu: proměnné `--club-*` nastavuje obal stránky (`clubPaletteStyle`).
 * Odvozené odstíny šablony:
 * - `--club-ink`: `--club-accent-light` drží kontrast 4.5:1 jen proti čisté bílé, šablona má ale
 *   šedavé a nažloutlé podklady, proto drobný barevný text bere o čtvrtinu tmavší odstín.
 * - `--club-tint` / `--club-tint-strong`: světlé podbarvení (najetí myší, náš klub v tabulce).
 * - `--club-line`: světlý rámeček.
 * Odstíny jsou proměnné, ne třídy `bg-[color-mix(...)]`: Tailwind pro prohlížeče bez color-mix
 * podstrčí plnou barvu akcentu a tmavý text by na ní zmizel. Neplatná proměnná místo toho
 * nechá pozadí průhledné.
 */
const CLUB_TONES = {
  "--club-ink": "color-mix(in srgb, var(--club-accent-light) 75%, black)",
  "--club-tint": "color-mix(in srgb, var(--club-accent-light) 12%, white)",
  "--club-tint-strong": "color-mix(in srgb, var(--club-accent-light) 20%, white)",
  "--club-line": "color-mix(in srgb, var(--club-accent-light) 40%, white)",
} as CSSProperties;

/** Jméno z historie klubu: odkaz na profil, pokud hráč ve hře ještě je, jinak jen text. */
function HistoryPlayerName({ id, name }: { id: string | null; name: string }) {
  const className = "text-base font-bold text-[var(--club-ink)]";
  return id ? (
    <PlayerLink id={id} className={className}>
      {name}
    </PlayerLink>
  ) : (
    <span className={className}>{name}</span>
  );
}

export function Retro2004Template({
  data,
  hasSponsorBanner,
  hasAudioModule,
  hasPressOfficer,
  onOpenTickets,
  onOpenHighlights,
  onOpenLightbox,
  visitorCount,
  isOwner,
}: TemplateProps) {
  const { team, website, manager, staff, roster, matches, concessions, tickets, transfers = [] } = data;
  const [activeRosterTab, setActiveRosterTab] = useState<"aTeam" | "u21Team">("aTeam");
  const [viewMode, setViewMode] = useState<"table" | "pitch">("table");
  const [pollSelection, setPollSelection] = useState<PollChoice>("win");
  const [transferFilter, setTransferFilter] = useState<"all" | "in" | "out">("all");
  const [openInterviews, setOpenInterviews] = useState<Record<string, boolean>>({});
  const fanPoll = useFanPoll(data);
  // Adresa webu klubu pro podstránky (zápasy, zpravodaj, trenér).
  const base = useContext(ClubBasePathContext) ?? `/klub/${team.id}`;

  const primary = team.primaryColor || "#2D5F2D";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();
  const leagueName = team.league?.name ?? "Okresní soutěž";
  const announcement = website.announcement?.trim() || null;

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

  // Skuteční sponzoři ze smluv klubu; když nikoho nemá, lišta se nevykreslí.
  const partners = clubPartners(data);
  const sponsorLines = [
    { label: "Generální partner", value: partners.general },
    { label: "Partner stadionu", value: partners.stadium },
    { label: "Partneři", value: partners.partners.join(", ") || null },
  ].filter((s): s is { label: string; value: string } => !!s.value);

  // Ceník bufetu: produkt, který klub neprodává (null), se vůbec nevypisuje.
  const menu = [
    { key: "beer", name: concessions.beerName, price: concessions.beerPrice },
    { key: "sausage", name: concessions.sausageName, price: concessions.sausagePrice },
    { key: "lemonade", name: concessions.lemonadeName, price: concessions.lemonadePrice },
  ].filter((item): item is { key: string; name: string; price: number } => item.name !== null && item.price !== null);
  const beer = menu.find((item) => item.key === "beer");

  const pollOptions: Array<{ choice: PollChoice; label: string; bar: string }> = [
    { choice: "win", label: "Vyhrajeme o parník", bar: "bg-[var(--club-accent-light)]" },
    { choice: "draw", label: "Bude to plichta", bar: "bg-yellow-600" },
    { choice: "loss", label: "Zařízne nás sudí", bar: "bg-red-600" },
  ];
  const pollOpponent = fanPoll.poll && nextMatch && nextMatch.id === fanPoll.poll.matchId ? nextMatch.opponent.name : null;

  const staffRoleLabel = (st: { role: string; profession: string }) =>
    ROLE_DEFS[st.role as StaffRole]?.label ?? ROLE_DEFS[st.profession as StaffRole]?.label ?? "Realizační tým";

  // Domácí vlevo, hosté vpravo; soupeř je odkaz na jeho klubový web.
  const homeSide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? team.name : <TeamLink id={opponent.id} name={opponent.name} />;
  const awaySide = (isHome: boolean, opponent: { id: string; name: string }) =>
    isHome ? <TeamLink id={opponent.id} name={opponent.name} /> : team.name;

  // Tiskové středisko: nejnovější rozhovor celý jako článek, starší na rozkliknutí, pod nimi zprávy klubu.
  const hasPress = hasPressContent(data);
  const [latestInterview, ...olderInterviews] = pressInterviews(data);
  const clubNews = pressNews(data);

  const interviewByline = (iv: Interview) => {
    const coach = interviewCoach(iv, data);
    return (
      <div className="text-gray-700 mb-2 break-words">
        Odpovídá{" "}
        {coach === "Trenér" ? (
          "trenér klubu"
        ) : (
          <>
            trenér{" "}
            <strong>
              {manager && coach === manager.name ? (
                <Link href={`${base}/trener`} className="hover:underline">
                  {coach}
                </Link>
              ) : (
                coach
              )}
            </strong>
          </>
        )}
      </div>
    );
  };
  const interviewText = (iv: Interview) => (
    <div className="space-y-2.5 font-serif text-sm leading-relaxed text-gray-800">
      {interviewPairs(iv).map((pair, i) => (
        <div key={i}>
          <p className="font-bold text-black break-words">{pair.question}</p>
          <p className="break-words">{pair.answer}</p>
        </div>
      ))}
    </div>
  );

  // Historie klubu: kronika je vždycky, archiv sezón, ocenění a pohárů jen když se něco dochovalo.
  const history = hasHistory(data.history) ? data.history : null;
  const hasSeasons = !!history && history.seasons.length > 0;
  const foundingYear = team.identity.foundingYear;
  const chronicle =
    team.identity.foundingStory ||
    (foundingYear
      ? `Oddíl ${team.name} byl založen roku ${foundingYear}.${hasSeasons ? "" : " Další stránky kroniky se teprve píšou."}`
      : hasSeasons
        ? null
        : `Kronika oddílu ${team.name} se teprve píše.`);
  // Mezititulek uvnitř sekce, stejný jako u dresů v sekci „Klubová kultura“.
  const subHeading = "font-bold text-sm uppercase text-[var(--club-ink)] mb-2 border-b border-gray-300 pb-1";

  const navLink =
    "px-2.5 py-1 bg-[#f5f5f0] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-[var(--club-tint)] shrink-0";

  return (
    <div className="min-h-screen bg-[#d8d6ce] text-[#111111] font-sans pb-16" style={CLUB_TONES}>
      {/* 2004 Framed Boxed Container */}
      <div className="max-w-5xl mx-auto my-3 bg-white border-2 border-black shadow-[6px_6px_0px_rgba(0,0,0,0.5)]">
        {/* Retro Header Top Banner */}
        <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] p-3 sm:p-4 border-b-4 border-[var(--club-secondary)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 text-center sm:text-left min-w-0">
            <div className="p-1 bg-white border border-[var(--club-secondary)] shadow shrink-0">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={44}
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm tracking-wide text-[var(--club-on-bar)] font-mono uppercase">
                *** Oficiální webové stránky ***
              </div>
              <h1 className="text-xl sm:text-3xl font-serif font-black tracking-tight drop-shadow-md break-words">
                {team.name}
              </h1>
              <div className="text-sm text-[var(--club-on-bar)] mt-0.5">
                Obec {team.village.name} · Okres {team.village.district} {team.identity.foundingYear ? `· Založeno roku ${team.identity.foundingYear}` : ""}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-3 py-1.5 bg-[var(--club-on-bar)] text-[var(--club-bar)] hover:opacity-90 border-2 border-t-white border-l-white border-b-black border-r-black font-bold text-sm uppercase shadow active:translate-y-0.5"
            >
              [ 🎟️ Vstupenky ]
            </button>
            <span className="text-sm text-[var(--club-on-bar)]">
              Vstupné {tickets.adultPrice} Kč, platí se u vstupu
            </span>
          </div>
        </div>

        {/* Retro 2004 Scrolling Marquee Ticker */}
        <div className="bg-[var(--club-tint)] border-b border-gray-400 py-1 px-3 text-sm text-[var(--club-ink)] font-mono font-bold flex items-center overflow-hidden">
          <span className="shrink-0 bg-[var(--club-bar)] text-[var(--club-on-bar)] px-1.5 mr-2 text-sm font-sans uppercase">Zpráva:</span>
          <div className="whitespace-nowrap overflow-x-auto min-w-0 text-sm">
            +++ VÍTÁME VÁS NA WEBU ODDÍLU {team.name.toUpperCase()} +++ PŘÍŠTÍ UTKÁNÍ:{" "}
            {nextMatch
              ? `${nextMatch.isHome ? "DOMA" : "VENKU"} PROTI ${nextMatch.opponent.name.toUpperCase()}, ${formatDateTime(nextMatch.scheduledAt).toUpperCase()}`
              : "ČEKÁ SE NA ROZLOSOVÁNÍ"}{" "}
            +++ {menu.length > 0 ? "BUFET OTEVÍRÁ 45 MINUT PŘED VÝKOPEM +++ " : ""}
            {beer ? `TOČENÉ PIVO ${beer.name.toUpperCase()} ZA ${beer.price} KČ +++` : ""}
          </div>
        </div>

        {/* Sponsor Banner Addon (Retro Web 1.0 Edition) */}
        {hasSponsorBanner && partners.all.length > 0 && (
          <div className="bg-[#f0f0e0] border-b border-gray-400 py-1.5 px-3 text-center text-sm border-dashed border-t-0 font-serif break-words">
            <span className="font-bold text-[var(--club-ink)]">SPONZOŘI KLUBU: </span>
            {sponsorLines.map((s, i) => (
              <span key={s.label} className="font-sans">
                {i > 0 && " · "}
                {s.label}: <span className="underline font-bold">{s.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* Retro Bevel Navigation Bar */}
        <div className="bg-[#ece9d8] border-b-2 border-gray-500 p-1 flex items-center gap-1 overflow-x-auto text-sm font-sans">
          <a href="#zapas" className={`${navLink} font-medium`}>
            Úvod & Zápasy
          </a>
          <Link href={`${base}/zapasy`} className={`${navLink} font-medium`}>
            Zápasy sezóny
          </Link>
          <Link href={`${base}/zpravodaj`} className={`${navLink} font-medium`}>
            Zpravodaj
          </Link>
          <a href="#tabulka" className={`${navLink} font-bold text-[var(--club-ink)]`}>
            Tabulka soutěže
          </a>
          <a href="#kadr" className={`${navLink} font-medium`}>
            Soupiska kádru
          </a>
          <a href="#prestupy" className={`${navLink} font-bold text-[var(--club-ink)]`}>
            Přestupy ({transfers.length})
          </a>
          <a href="#identita" className={`${navLink} font-medium`}>
            Dresy & Maskot
          </a>
          <a href="#stadion" className={`${navLink} font-medium`}>
            Areál hřiště
          </a>
          <a href="#bufet" className={`${navLink} font-medium`}>
            Klubový bufet
          </a>
          {hasAudioModule && (
            <a href="#audio" className="px-2.5 py-1 bg-[var(--club-tint)] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-[var(--club-tint-strong)] shrink-0 font-bold text-[var(--club-ink)]">
              🎵 Klubové audio
            </a>
          )}
          <a href="#realizak" className={`${navLink} font-medium`}>
            Vedení oddílu
          </a>
          <a href="#historie" className={`${navLink} font-medium`}>
            Klubová historie
          </a>
        </div>

        {/* ═══ TWO-COLUMN CLASSIC WEB 1.0 PORTAL LAYOUT ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-4 p-3 gap-4">
          {/* ═══ LEFT SIDEBAR (Width ~1 col) ═══ */}
          <aside className="md:col-span-1 space-y-4 text-sm font-sans min-w-0">
            {/* Sidebar Box 1: Navigace */}
            <div className="border border-gray-400 bg-[#f9f9f6]">
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-2 py-1 font-bold text-sm uppercase flex items-center justify-between">
                <span>Rychlé menu</span>
                <span className="text-[var(--club-on-bar)]">▼</span>
              </div>
              <ul className="p-2 space-y-1.5 text-blue-800 underline">
                <li><a href="#zapas" className="hover:text-red-600">» Příští zápas</a></li>
                <li><Link href={`${base}/zapasy`} className="hover:text-red-600">» Zápasy sezóny</Link></li>
                <li><Link href={`${base}/zpravodaj`} className="hover:text-red-600">» Zpravodaj</Link></li>
                <li><a href="#kadr" className="hover:text-red-600">» Hráčská soupiska</a></li>
                {hasPress && <li><a href="#tisk" className="hover:text-red-600">» Tiskové středisko</a></li>}
                <li><a href="#stadion" className="hover:text-red-600">» Fotky stadionu</a></li>
                <li><a href="#bufet" className="hover:text-red-600">» Pivo a klobásy</a></li>
                <li><a href="#realizak" className="hover:text-red-600">» Trenér a vedení</a></li>
                <li><a href="#historie" className="hover:text-red-600">» Kronika a tradice</a></li>
              </ul>
            </div>

            {/* Sidebar Box 2: Anketa k příštímu zápasu (skutečné hlasy z API) */}
            {fanPoll.poll && (
              <div className="border border-gray-400 bg-[#f9f9f6]">
                <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-2 py-1 font-bold text-sm uppercase">
                  Anketa fanoušků
                </div>
                <div className="p-2.5">
                  <div className="font-bold text-gray-900 mb-2 break-words">
                    {pollOpponent ? `Jak dopadne příští zápas proti ${pollOpponent}?` : "Jak dopadne náš příští zápas?"}
                  </div>
                  {fanPoll.voted ? (
                    <div className="space-y-1">
                      <div className="text-green-700 font-bold mb-1">Děkujeme za Váš hlas!</div>
                      {pollOptions.map((o) => {
                        const count = fanPoll.votes[o.choice];
                        const pct = fanPoll.percent(count);
                        return (
                          <div key={o.choice}>
                            <div className="flex justify-between gap-2 mt-1">
                              <span className="min-w-0">
                                {o.label}
                                {fanPoll.voted === o.choice ? " (váš tip)" : ""}
                              </span>
                              <span className="font-mono font-bold shrink-0">
                                {pct} % ({count})
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 border border-gray-400">
                              <div className={`${o.bar} h-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="text-gray-600 pt-1">Hlasovalo celkem: {fanPoll.total}</div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {pollOptions.map((o) => (
                        <label key={o.choice} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="poll"
                            checked={pollSelection === o.choice}
                            onChange={() => setPollSelection(o.choice)}
                          />
                          <span>{o.label}</span>
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => void fanPoll.vote(pollSelection)}
                        disabled={fanPoll.busy}
                        className="mt-2 w-full py-1 bg-[#ece9d8] hover:bg-[var(--club-tint)] border border-t-white border-l-white border-b-gray-600 border-r-gray-600 font-bold text-sm disabled:opacity-60 disabled:cursor-wait"
                      >
                        {fanPoll.busy ? "[ Odesílám… ]" : "[ Odeslat hlas ]"}
                      </button>
                    </div>
                  )}
                  {fanPoll.error && (
                    <div role="alert" className="mt-2 text-red-700 font-bold">
                      {fanPoll.error}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sidebar Box 3: Počítadlo návštěv (LED Counter) */}
            <div className="border border-gray-400 bg-[#f9f9f6] p-2.5 text-center">
              <div className="text-sm uppercase font-bold text-gray-600 mb-1">
                Počítadlo přístupů:
              </div>
              <div className="inline-flex bg-black text-[#00ff41] font-mono font-bold text-sm px-2.5 py-1 border-2 border-gray-600 tracking-widest shadow-inner">
                {String(Math.max(0, visitorCount)).padStart(6, "0")}
              </div>
              {visitorCount > 0 && (
                <div className="text-sm text-gray-500 mt-1">
                  Jste {visitorCount}. návštěvník
                </div>
              )}
            </div>

            {/* Sidebar Box 4: Občerstvení u klandru */}
            <div id="bufet" className={`border border-gray-400 bg-[#f9f9f6] ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-2 py-1 font-bold text-sm uppercase flex items-center justify-between">
                <span>Vesnický bufet</span>
                <span>🍺</span>
              </div>
              <div className="p-2 space-y-1">
                {menu.length > 0 ? (
                  <>
                    {menu.map((item, i) => (
                      <div
                        key={item.key}
                        className={`flex justify-between gap-2 ${i < menu.length - 1 ? "border-b border-gray-200 pb-0.5" : ""}`}
                      >
                        <span className="min-w-0 break-words">{item.name}:</span>
                        <span className="font-bold shrink-0">{item.price} Kč</span>
                      </div>
                    ))}
                    <div className="text-gray-600 pt-1">Bufet otevírá 45 minut před výkopem.</div>
                  </>
                ) : (
                  <div className="text-gray-600 italic">Bufet zatím nic neprodává.</div>
                )}
              </div>
            </div>

            {/* Sidebar Box 5: Výměna odkazů */}
            <div className="border border-gray-400 bg-[#f9f9f6] p-2 text-sm">
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
          <main className="md:col-span-3 space-y-6 min-w-0">
            {/* Press Officer Pinned Announcement (Retro Notice Box): jen skutečné prohlášení vedení */}
            {announcement && (
              <div className="p-3 bg-[#fffbe6] border-2 border-red-600 text-sm shadow-sm">
                <div className="flex items-center gap-2 font-bold text-red-700 uppercase tracking-wide border-b border-red-300 pb-1 mb-1.5">
                  <span aria-hidden="true">⚠️</span>
                  <span>Důležité sdělení vedení klubu{hasPressOfficer ? " a tiskového mluvčího" : ""}</span>
                </div>
                <p className="font-serif italic leading-relaxed text-gray-900 break-words">
                  „{announcement}“
                </p>
                <div className="text-sm text-gray-500 text-right mt-1">
                  Vedení klubu {team.name}
                </div>
              </div>
            )}

            {/* ═══ MATCH REPORT & NEXT MATCH (TELETEXT / EUROFOTBAL TABLE STYLE) ═══ */}
            <section id="zapas" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Mistrovská utkání</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">{leagueName}</span>
              </div>

              <div className="p-3 space-y-4">
                {/* Next Match Card */}
                {nextMatch ? (
                  <div className="border border-gray-300 bg-[#f7f7f4] p-3">
                    <div className="text-sm font-bold uppercase text-[var(--club-ink)] mb-1 border-b border-gray-300 pb-0.5">
                      Příští mistrovské utkání · {nextMatch.round ? `${nextMatch.round}. kolo` : "Zápas týdne"}
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2">
                      <div className="text-center sm:text-left min-w-0">
                        <div className="text-base sm:text-lg font-serif font-black text-black break-words">
                          {homeSide(nextMatch.isHome, nextMatch.opponent)} vs. {awaySide(nextMatch.isHome, nextMatch.opponent)}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5">
                          📅 Výkop: {formatDateTime(nextMatch.scheduledAt)}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5 break-words">
                          🏟️ Hřiště: {nextMatch.stadiumName} · {nextMatch.isHome ? "Domácí hřiště" : "Hřiště soupeře"}
                        </div>
                        <div className="text-sm mt-0.5">
                          <Link href={`${base}/zpravodaj`} className="text-blue-800 underline hover:text-red-600 font-bold">
                            [ Zpravodaj ke kolu ]
                          </Link>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={onOpenTickets}
                          className="px-3 py-1 bg-[var(--club-bar)] text-[var(--club-on-bar)] hover:opacity-90 border border-black font-bold text-sm shadow active:translate-y-0.5"
                        >
                          Vstupenky
                        </button>
                        <span className="text-sm text-gray-600">Vstupné {tickets.adultPrice} Kč</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center text-sm text-gray-500 italic">
                    V nejbližších dnech není naplánováno žádné mistrovské utkání.
                  </div>
                )}

                {/* Last Match Summary */}
                {lastMatch && (
                  <div className="border border-gray-300 p-2.5 bg-white text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-gray-200 pb-1 mb-1.5 font-bold">
                      <span className="text-gray-700">Poslední odehrané utkání ({lastMatch.round ? `${lastMatch.round}. kolo` : "Zápas"}):</span>
                      <button
                        type="button"
                        onClick={() => onOpenHighlights(lastMatch)}
                        className="text-blue-800 underline hover:text-red-600 font-bold cursor-pointer"
                      >
                        [ ▶ Zobrazit zápis & sestřih ]
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-bold min-w-0 break-words">{homeSide(lastMatch.isHome, lastMatch.opponent)}</span>
                      <span className="bg-black text-[var(--club-accent-dark)] font-mono px-2 py-0.5 font-bold text-base shrink-0">
                        {lastMatch.scoreHome} : {lastMatch.scoreAway}
                      </span>
                      <span className="font-bold min-w-0 break-words text-right">{awaySide(lastMatch.isHome, lastMatch.opponent)}</span>
                    </div>
                  </div>
                )}

                {/* Upcoming Matches List */}
                {upcomingMatches.length > 1 && (
                  <div className="border border-gray-300 bg-white text-sm">
                    <div className="bg-[#f0f0e8] px-2.5 py-1 font-bold text-gray-800 border-b border-gray-300">
                      📅 Rozlosování nadcházejících kol
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
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
                            <tr key={m.id} className="border-b border-gray-100 hover:bg-[var(--club-tint)]">
                              <td className="py-1 px-2 font-mono font-bold text-[var(--club-ink)]">{m.round}.</td>
                              <td className="py-1 px-2 font-bold min-w-[10rem]">
                                {homeSide(m.isHome, m.opponent)} vs. {awaySide(m.isHome, m.opponent)}
                              </td>
                              <td className="py-1 px-2 text-gray-600 min-w-[8rem]">
                                {m.isHome ? "Doma" : "Venku"} ({m.stadiumName})
                              </td>
                              <td className="py-1 px-2 text-right text-gray-500 font-mono whitespace-nowrap">
                                {formatDate(m.scheduledAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Recent Matches Archive */}
                {recentMatches.length > 1 && (
                  <div className="border border-gray-300 bg-white text-sm">
                    <div className="bg-[#f0f0e8] px-2.5 py-1 font-bold text-gray-800 border-b border-gray-300">
                      ⏮️ Výsledkový servis uplynulých kol
                    </div>
                    <div className="divide-y divide-gray-100">
                      {recentMatches.slice(1, 5).map((rm) => (
                        <div
                          key={rm.id}
                          className="p-1.5 flex items-center justify-between gap-2 hover:bg-[var(--club-tint)]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-gray-500 shrink-0">{rm.round ? `${rm.round}. k.` : "Zápas"}</span>
                            <span className="font-bold min-w-0 break-words">
                              {homeSide(rm.isHome, rm.opponent)} vs. {awaySide(rm.isHome, rm.opponent)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="bg-black text-[var(--club-accent-dark)] font-mono font-bold px-1.5">
                              {rm.scoreHome} : {rm.scoreAway}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenHighlights(rm)}
                              className="text-blue-800 underline hover:text-red-600"
                            >
                              [zápis]
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-sm text-right">
                  <Link href={`${base}/zapasy`} className="text-blue-800 underline hover:text-red-600 font-bold">
                    [ Všechny zápasy ]
                  </Link>
                </div>
              </div>
            </section>

            {/* ═══ TABULKA SOUTĚŽE (OFFICIAL LEAGUE TABLE) ═══ */}
            <section id="tabulka" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Tabulka soutěže</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">Aktuální pořadí</span>
              </div>
              <div className="p-2 overflow-x-auto">
                {standings.length > 0 ? (
                  <table className="w-full text-left text-sm border-collapse">
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
                              ? "bg-[var(--club-tint-strong)] font-bold text-[var(--club-ink)] border-[var(--club-accent-light)]"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="py-1 px-1.5 text-center font-mono font-bold">{row.pos}.</td>
                          <td className="py-1 px-2 min-w-[9rem]">
                            <TeamLink id={row.teamId} name={row.teamName} />{" "}
                            {row.isCurrentTeam && <span className="text-sm text-[var(--club-ink)] font-normal whitespace-nowrap">◀ NÁŠ KLUB</span>}
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
                  <div className="p-4 text-center text-sm text-gray-500 italic">
                    Tabulka soutěže se aktualizuje po odehrání úvodních kol.
                  </div>
                )}
              </div>
            </section>

            {/* ═══ SOUPISKA - THE LEGENDARY 2004 HTML TABLE! ═══ */}
            <section id="kadr" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Hráčský kádr (Soupiska mužstva)</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">Počet hráčů: {currentRoster.length}</span>
              </div>
              <div className="bg-[#ece9d8] p-2 border-b border-gray-400 flex items-center justify-between gap-2 flex-wrap text-sm">
                <div className="flex items-center gap-1.5 font-mono flex-wrap">
                  <span className="font-bold text-gray-800 mr-1 font-sans">Kádr:</span>
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("aTeam")}
                    className={`px-3 py-1 border text-sm cursor-pointer ${
                      activeRosterTab === "aTeam"
                        ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] font-bold border-black shadow"
                        : "bg-[#f5f5f0] text-black border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-[var(--club-tint)]"
                    }`}
                  >
                    ⚽ A-MUŽSTVO ({roster.aTeam.length})
                  </button>
                  {hasU21 && (
                    <button
                      type="button"
                      onClick={() => setActiveRosterTab("u21Team")}
                      className={`px-3 py-1 border text-sm cursor-pointer ${
                        activeRosterTab === "u21Team"
                          ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] font-bold border-black shadow"
                          : "bg-[#f5f5f0] text-[var(--club-ink)] font-bold border-t-white border-l-white border-b-gray-600 border-r-gray-600 hover:bg-[var(--club-tint)]"
                      }`}
                    >
                      🌱 U21 ({roster.u21Team.length} HRÁČŮ)
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-2 py-0.5 border text-sm cursor-pointer ${
                      viewMode === "table" ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] font-bold" : "bg-gray-200"
                    }`}
                  >
                    Tabulka
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("pitch")}
                    className={`px-2 py-0.5 border text-sm cursor-pointer ${
                      viewMode === "pitch" ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] font-bold" : "bg-gray-200"
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
                  <table className="w-full text-left text-sm border-collapse font-sans">
                    <thead>
                      <tr className="bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-gray-400 text-sm uppercase">
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
                            className={`border-b border-gray-200 hover:bg-[var(--club-tint)] transition-colors ${
                              isEven ? "bg-white" : "bg-[#f5f5ee]"
                            }`}
                          >
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-gray-700">
                              {player.squadNumber ?? EMPTY}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <div className="w-7 h-8 mx-auto border border-gray-400 bg-gray-200 overflow-hidden flex items-center justify-center">
                                <ManagerFace faceConfig={player.avatar} size={28} />
                              </div>
                            </td>
                            <td className="py-1.5 px-3 whitespace-nowrap">
                              <PlayerLink id={player.id} className="text-base font-bold text-[var(--club-ink)]">
                                {player.firstName} {player.lastName}
                              </PlayerLink>
                            </td>
                            <td className="py-1.5 px-2 font-medium text-gray-700 whitespace-nowrap">
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
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-[var(--club-ink)]">
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
            <section id="prestupy" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Pohyby v kádru (Přestupy & Hostování)</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">
                  [ Celkem záznamů: {transfers.length} ]
                </span>
              </div>

              {/* Filter tabs */}
              <div className="bg-[#ece9d8] border-b border-gray-400 p-2 flex items-center justify-between gap-2 text-sm flex-wrap">
                <span className="font-bold text-gray-700">Filtrovat zprávy:</span>
                <div className="flex items-center gap-1 font-mono flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTransferFilter("all")}
                    className={`px-2.5 py-0.5 border text-sm cursor-pointer ${
                      transferFilter === "all"
                        ? "bg-[var(--club-bar)] text-[var(--club-on-bar)] font-bold border-black shadow-inner"
                        : "bg-[#f5f5f0] text-black border-t-white border-l-white border-b-gray-600 border-r-gray-600"
                    }`}
                  >
                    Vše ({transfers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferFilter("in")}
                    className={`px-2.5 py-0.5 border text-sm cursor-pointer ${
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
                    className={`px-2.5 py-0.5 border text-sm cursor-pointer ${
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
                        className={`p-3 border text-sm ${
                          isArrival
                            ? "bg-[#f3f9f3] border-emerald-400"
                            : "bg-[#fff5f5] border-red-300"
                        }`}
                      >
                        {/* Meta header */}
                        <div className="flex items-center justify-between gap-2 border-b border-gray-300 pb-1.5 mb-2 flex-wrap">
                          <span
                            className={`font-mono font-bold text-sm px-1.5 py-0.5 ${
                              isArrival
                                ? "bg-emerald-700 text-white"
                                : "bg-red-700 text-white"
                            }`}
                          >
                            {isArrival ? "[ + PŘÍCHOD DO KÁDRU ]" : "[ - ODCHOD Z KÁDRU ]"}
                          </span>
                          <span className="text-gray-600 text-sm">
                            Datum: <strong>{formatDate(t.date)}</strong> · Typ:{" "}
                            <strong>{transferKindLabel(t.kind, t.direction)}</strong>
                          </span>
                        </div>

                        {/* Hráč a protistrana */}
                        <div className="text-gray-700 mb-1 break-words">
                          Hráč:{" "}
                          <PlayerLink id={t.playerId} className="text-base font-bold text-[var(--club-ink)]">
                            {t.playerName}
                          </PlayerLink>
                          {t.otherTeamName && (
                            <>
                              {" · "}
                              {isArrival ? "Z klubu" : "Do klubu"}:{" "}
                              <TeamLink id={t.otherTeamId} name={t.otherTeamName} className="font-bold" />
                            </>
                          )}
                        </div>

                        {/* Headline */}
                        <h4 className="font-bold text-base text-[var(--club-ink)] mb-1 break-words">
                          {t.headline}
                        </h4>

                        {/* Story */}
                        <p className="text-gray-800 leading-relaxed mb-2 font-serif text-sm break-words">
                          {t.story}
                        </p>

                        {/* Slovo hráče ve žlutém retro rámečku */}
                        {t.quote && (
                          <div className="p-2 bg-[var(--club-tint)] border border-[var(--club-line)] border-l-4 border-l-[var(--club-accent-light)] text-gray-800 italic text-sm leading-snug break-words">
                            <strong>Slovo hráče:</strong> „{t.quote}“
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-sm text-gray-600 italic bg-[#f9f9f6] border border-dashed border-gray-300">
                    V tomto přestupovém období nejsou v registru hlášeny žádné nové změny.
                  </div>
                )}
              </div>
            </section>

            {/* ═══ DRESY, MASKOT & IDENTITA ═══ */}
            <section id="identita" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Klubová kultura, dresy & maskot</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">Tradice oddílu</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Dresy */}
                <div>
                  <h4 className="font-bold text-sm uppercase text-[var(--club-ink)] mb-2 border-b border-gray-300 pb-1">
                    👕 Oficiální zápasová sada dresů pro tuto sezónu
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Domácí sada */}
                    <div className="border border-gray-300 p-3 bg-[#fbfbf8] flex flex-col items-center">
                      <span className="font-bold text-sm text-gray-800 uppercase mb-2">Domácí dresy</span>
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
                      <span className="text-sm text-gray-600 mt-2 font-mono">Hlavní barva: {primary}</span>
                    </div>

                    {/* Hostující sada */}
                    <div className="border border-gray-300 p-3 bg-[#fbfbf8] flex flex-col items-center">
                      <span className="font-bold text-sm text-gray-800 uppercase mb-2">Venkovní dresy</span>
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
                      <span className="text-sm text-gray-600 mt-2 font-mono">Venkovní barva: {team.secondaryColor || "#ffffff"}</span>
                    </div>
                  </div>
                </div>

                {/* Šála & Maskot */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
                  {/* Šála */}
                  <div className="border border-gray-300 p-3 bg-[#fbfbf8]">
                    <h5 className="font-bold text-sm uppercase text-gray-700 mb-2">🧣 Oficiální klubová šála</h5>
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
                    <h5 className="font-bold text-sm uppercase text-gray-700 mb-2">🦁 Klubový maskot</h5>
                    {team.mascot?.name ? (
                      <div className="flex items-center gap-3">
                        {team.mascot.imageUrl ? (
                          <img
                            src={team.mascot.imageUrl}
                            alt={team.mascot.name}
                            className="w-16 h-16 rounded border border-gray-400 object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-[var(--club-tint)] border border-[var(--club-accent-light)] rounded flex items-center justify-center text-3xl shrink-0">
                            🦁
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-base text-[var(--club-ink)] break-words">{team.mascot.name}</div>
                          {team.mascot.story && (
                            <p className="text-sm text-gray-700 leading-snug mt-1 italic break-words">
                              „{team.mascot.story}“
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic py-2">
                        Oddíl zatím nemá oficiálně registrovaného maskota.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ═══ REALIZAČNÍ TÝM ═══ */}
            <section id="realizak" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase">
                Vedení oddílu a realizační tým
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {manager && (
                  <div className="border border-gray-300 p-2 bg-[#f9f9f6] flex items-center gap-3">
                    <div className="w-12 h-14 border border-gray-400 bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                      <ManagerFace faceConfig={manager.avatar} size={48} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--club-ink)] font-bold uppercase">Hlavní trenér</div>
                      <div className="font-bold text-base text-[var(--club-ink)] break-words">
                        <Link href={`${base}/trener`} className="hover:underline">
                          {manager.name}
                        </Link>
                      </div>
                      <div className="text-gray-600 text-sm">Věk {manager.age} let · Licence {manager.licence}</div>
                    </div>
                  </div>
                )}
                {staff.slice(0, 3).map((st) => (
                  <div key={st.id} className="border border-gray-300 p-2 bg-[#f9f9f6] flex items-center gap-3">
                    <div className="w-12 h-14 border border-gray-400 bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                      <ManagerFace faceConfig={st.avatar} size={48} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-600 font-bold uppercase">{staffRoleLabel(st)}</div>
                      <div className="font-bold text-base text-black break-words">{st.firstName} {st.lastName}</div>
                      <div className="text-gray-600 text-sm">{st.age} let</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 pb-3 text-sm text-right">
                <Link href={`${base}/trener`} className="text-blue-800 underline hover:text-red-600 font-bold">
                  [ Celý realizační tým ]
                </Link>
              </div>
            </section>

            {/* ═══ TISKOVÉ STŘEDISKO ═══ */}
            {hasPress && (
              <section id="tisk" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
                <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span>Tiskové středisko</span>
                  <span className="text-[var(--club-on-bar)] text-sm font-mono">Rozhovory & zprávy klubu</span>
                </div>

                <div className="p-3 space-y-5 text-sm">
                  {latestInterview && (
                    <div>
                      <h4 className={subHeading}>Slovo trenéra</h4>
                      <div className="space-y-3">
                        <article className="p-3 border border-gray-300 bg-[#f9f9f6] text-sm">
                          <div className="flex items-center justify-between gap-2 border-b border-gray-300 pb-1.5 mb-2 flex-wrap">
                            <span className="font-mono font-bold text-sm px-1.5 py-0.5 bg-[var(--club-bar)] text-[var(--club-on-bar)]">
                              [ ROZHOVOR ]
                            </span>
                            <span className="text-gray-600 text-sm">
                              Datum: <strong>{formatDate(latestInterview.createdAt)}</strong>
                            </span>
                          </div>
                          <h4 className="font-bold text-base text-[var(--club-ink)] mb-1 break-words">
                            {interviewHeadline(latestInterview)}
                          </h4>
                          {interviewByline(latestInterview)}
                          {interviewText(latestInterview)}
                        </article>

                        {olderInterviews.length > 0 && (
                          <div className="border border-gray-300 bg-white text-sm">
                            <div className="bg-[#f0f0e8] px-2.5 py-1 font-bold text-gray-800 border-b border-gray-300">
                              Starší rozhovory ({olderInterviews.length})
                            </div>
                            <ul className="divide-y divide-gray-200">
                              {olderInterviews.map((iv) => {
                                const open = !!openInterviews[iv.id];
                                const panelId = `rozhovor-${iv.id}`;
                                return (
                                  <li key={iv.id}>
                                    <button
                                      type="button"
                                      aria-expanded={open}
                                      aria-controls={panelId}
                                      onClick={() => setOpenInterviews((s) => ({ ...s, [iv.id]: !s[iv.id] }))}
                                      className="w-full p-1.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--club-tint)] cursor-pointer"
                                    >
                                      <span className="min-w-0 break-words font-bold text-blue-800 underline">
                                        {interviewHeadline(iv)}
                                      </span>
                                      <span className="flex items-center gap-2 shrink-0 font-mono">
                                        <span className="text-gray-500">{formatDate(iv.createdAt)}</span>
                                        <span className="text-gray-700" aria-hidden="true">{open ? "[-]" : "[+]"}</span>
                                      </span>
                                    </button>
                                    <div id={panelId} hidden={!open} className="px-2.5 pt-1 pb-3 border-t border-dashed border-gray-300">
                                      {interviewByline(iv)}
                                      {interviewText(iv)}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {clubNews.length > 0 && (
                    <div>
                      <h4 className={subHeading}>Zprávy z klubu</h4>
                      <div className="space-y-3">
                        {clubNews.map((n) => (
                          <article key={n.id} className="p-3 border border-gray-300 bg-[#f9f9f6] text-sm">
                            <div className="flex items-center justify-between gap-2 border-b border-gray-300 pb-1.5 mb-2 flex-wrap">
                              <span className="font-mono font-bold text-sm px-1.5 py-0.5 bg-[var(--club-bar)] text-[var(--club-on-bar)] uppercase">
                                [ {PRESS_NEWS_TYPES.get(n.type)} ]
                              </span>
                              <span className="text-gray-600 text-sm">
                                Datum: <strong>{formatDate(n.created_at)}</strong>
                              </span>
                            </div>
                            <h4 className="font-bold text-base text-[var(--club-ink)] mb-1 break-words">{n.headline}</h4>
                            <p className="text-gray-800 leading-relaxed font-serif text-sm whitespace-pre-line break-words">
                              {n.body}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ═══ STADION: FOTKY Z 3D MODELU AREÁLU ═══ */}
            <section id="stadion" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex items-center justify-between gap-2 flex-wrap">
                <span>Fotodokumentace areálu: {team.stadium.name || "naše hřiště"}</span>
              </div>
              <div className="p-3">
                <StadiumPhotoCard data={data} isOwner={isOwner} tone="light" onOpenLightbox={onOpenLightbox} />
              </div>
            </section>

            {/* ═══ AUDIO MODUL (RETRO WINAMP / WMP STYLE) ═══ */}
            {hasAudioModule && (
              <section id="audio" className={`border border-gray-400 bg-[#e0ded8] p-3 shadow-inner ${ANCHOR_OFFSET}`}>
                <div className="text-sm font-bold font-mono text-[var(--club-ink)] mb-2 uppercase flex items-center gap-1.5">
                  <span>📻</span>
                  <span>Audio přehrávač oddílu</span>
                </div>
                <ClubAudioPlayer
                  teamName={team.name}
                  anthem={team.anthem}
                  chants={team.chants}
                />
              </section>
            )}

            {/* ═══ HISTORIE KLUBU & KRONIKA ═══ */}
            <section id="historie" className={`border border-gray-400 bg-white ${ANCHOR_OFFSET}`}>
              <div className="bg-[var(--club-bar)] text-[var(--club-on-bar)] px-3 py-1.5 font-bold text-sm uppercase flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span>Historie klubu</span>
                <span className="text-[var(--club-on-bar)] text-sm font-mono">
                  {foundingYear ? `Založeno roku ${foundingYear}` : "Kronika oddílu"}
                </span>
              </div>

              <div className="p-3 space-y-5 text-sm">
                {/* Kronika */}
                <div>
                  <h4 className={subHeading}>Z kroniky oddílu {team.name}</h4>
                  <div className="space-y-2 font-serif leading-relaxed text-gray-900">
                    {chronicle && <p className="break-words">{chronicle}</p>}
                    {history && hasSeasons && <p className="break-words">{historyIntro(history, team.name)}</p>}
                  </div>
                  {team.identity.motto && (
                    <div className="mt-2 text-center font-serif font-bold text-gray-700 italic border-t border-gray-200 pt-1 break-words">
                      Klubové heslo: „{team.identity.motto}“
                    </div>
                  )}
                </div>

                {/* Úspěchy klubu */}
                {history && history.trophies.length > 0 && (
                  <div>
                    <h4 className={subHeading}>Úspěchy klubu</h4>
                    <ul className="list-disc pl-5 space-y-0.5 font-serif text-gray-900">
                      {history.trophies.map((t) => (
                        <li key={`${t.seasonNumber}-${t.kind}-${t.competitionName}`} className="break-words">
                          <strong>{trophyTitle(t)}</strong> ({t.seasonNumber}. sezóna)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Umístění v soutěžích, stejná tabulka jako „Tabulka soutěže“ */}
                {history && hasSeasons && (
                  <div>
                    <h4 className={subHeading}>Umístění v soutěžích</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-[#f0f0e8] border-b border-gray-400 text-gray-700 font-bold">
                            <th className="py-1 px-1.5 text-center">Sezóna</th>
                            <th className="py-1 px-2">Soutěž</th>
                            <th className="py-1 px-1.5 text-center">Místo</th>
                            <th className="py-1 px-1.5 text-center">Z</th>
                            <th className="py-1 px-1.5 text-center">V</th>
                            <th className="py-1 px-1.5 text-center">R</th>
                            <th className="py-1 px-1.5 text-center">P</th>
                            <th className="py-1 px-2 text-center">Skóre</th>
                            <th className="py-1 px-2 text-center font-black">Body</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.seasons.map((s) => (
                            <tr
                              key={s.seasonNumber}
                              className={`border-b border-gray-200 ${
                                s.position === 1
                                  ? "bg-[var(--club-tint-strong)] font-bold text-[var(--club-ink)] border-[var(--club-accent-light)]"
                                  : "hover:bg-gray-50"
                              }`}
                            >
                              <td className="py-1 px-1.5 text-center font-mono font-bold">{s.seasonNumber}.</td>
                              <td className="py-1 px-2 min-w-[9rem]">{s.leagueName}</td>
                              <td className="py-1 px-1.5 text-center font-mono font-bold whitespace-nowrap">
                                {s.position}.{s.teams !== null ? ` z ${s.teams}` : ""}
                              </td>
                              <td className="py-1 px-1.5 text-center font-mono">{s.played ?? EMPTY}</td>
                              <td className="py-1 px-1.5 text-center font-mono text-emerald-800">{s.wins ?? EMPTY}</td>
                              <td className="py-1 px-1.5 text-center font-mono text-gray-600">{s.draws ?? EMPTY}</td>
                              <td className="py-1 px-1.5 text-center font-mono text-red-800">{s.losses ?? EMPTY}</td>
                              <td className="py-1 px-2 text-center font-mono text-gray-700 whitespace-nowrap">
                                {s.goalsFor !== null && s.goalsAgainst !== null ? `${s.goalsFor}:${s.goalsAgainst}` : EMPTY}
                              </td>
                              <td className="py-1 px-2 text-center font-mono font-black text-black bg-black/5">{s.points ?? EMPTY}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Ocenění po sezónách */}
                {history && history.awards.length > 0 && (
                  <div>
                    <h4 className={subHeading}>Ocenění</h4>
                    <div className="space-y-3">
                      {awardsBySeason(history).map((group) => (
                        <div key={group.seasonNumber}>
                          <div className="font-bold text-gray-800 border-b border-gray-200 pb-0.5 mb-1 break-words">
                            {group.seasonNumber}. sezóna{group.leagueName ? `, ${group.leagueName}` : ""}
                          </div>
                          <ul className="list-disc pl-5 space-y-1 text-gray-900">
                            {group.single.map((a, i) => (
                              <li key={`${a.kind}-${i}`} className="break-words">
                                <span className="font-bold">{AWARD_TITLES[a.kind]}:</span>{" "}
                                {a.name ? (
                                  <HistoryPlayerName id={a.playerId} name={a.name} />
                                ) : (
                                  <span>{a.kind === "manager_of_season" ? "trenér klubu" : "jméno se nedochovalo"}</span>
                                )}
                                {a.detail && a.kind === "top_scorer" && <span className="text-gray-600">, {a.detail}</span>}
                                {a.detail && a.kind !== "top_scorer" && (
                                  <div className="font-serif text-gray-600 break-words">{a.detail}</div>
                                )}
                              </li>
                            ))}
                            {group.bestEleven.length > 0 && (
                              <li className="break-words">
                                <span className="font-bold">{AWARD_TITLES.best_eleven}:</span>{" "}
                                {group.bestEleven.map((p, i) => (
                                  <span key={`${p.playerId ?? p.name}-${i}`}>
                                    {i > 0 && ", "}
                                    <HistoryPlayerName id={p.playerId} name={p.name ?? "neznámý hráč"} />
                                    {p.detail && <span className="text-gray-600"> ({p.detail.toLowerCase()})</span>}
                                  </span>
                                ))}
                              </li>
                            )}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pohár */}
                {history && history.cup.length > 0 && (
                  <div>
                    <h4 className={subHeading}>Pohár</h4>
                    <ul className="border border-gray-300 divide-y divide-gray-200">
                      {history.cup.map((run) => {
                        const m = run.decidingMatch;
                        const matchText = cupMatchText(run);
                        // Soupeř na konci věty je odkaz na jeho klubový web (velkokluby mimo hru ho nemají).
                        const matchLead = m && matchText?.endsWith(m.opponentName) ? matchText.slice(0, -m.opponentName.length) : null;
                        return (
                          <li key={`${run.seasonNumber}-${run.cupName}`} className="p-1.5 hover:bg-[var(--club-tint)]">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="font-bold min-w-0 break-words">
                                {run.cupName} <span className="font-normal text-gray-600">({run.seasonNumber}. sezóna)</span>
                              </span>
                              <span className={`font-bold ${run.status === "won" ? "text-[var(--club-ink)]" : "text-gray-700"}`}>
                                {cupResultText(run)}
                              </span>
                            </div>
                            {m && matchText && (
                              <div className="text-gray-600 break-words">
                                Rozhodující zápas:{" "}
                                {matchLead !== null ? (
                                  <>
                                    {matchLead}
                                    <TeamLink id={m.opponentTeamId} name={m.opponentName} className="font-bold text-gray-800" />
                                  </>
                                ) : (
                                  matchText
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Nejlepší střelci, stejná tabulka jako „Tabulka soutěže“ */}
                {history && history.topScorers.length > 0 && (
                  <div>
                    <h4 className={subHeading}>Nejlepší střelci v historii klubu</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-[#f0f0e8] border-b border-gray-400 text-gray-700 font-bold">
                            <th className="py-1 px-1.5 text-center w-8">#</th>
                            <th className="py-1 px-2">Hráč</th>
                            <th className="py-1 px-2 text-center font-black">Góly</th>
                            <th className="py-1 px-1.5 text-center">Zápasy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.topScorers.map((s, i) => (
                            <tr key={`${s.playerId ?? s.name}-${i}`} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="py-1 px-1.5 text-center font-mono font-bold">{i + 1}.</td>
                              <td className="py-1 px-2 min-w-[10rem]">
                                <HistoryPlayerName id={s.playerId} name={s.name} />
                                {!s.stillAtClub && <span className="text-sm text-gray-600 whitespace-nowrap"> (odešel)</span>}
                              </td>
                              <td className="py-1 px-2 text-center font-mono font-black text-black bg-black/5">{s.goals}</td>
                              <td className="py-1 px-1.5 text-center font-mono">{s.appearances}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-gray-600 mt-1">Započteny jsou mistrovské i pohárové zápasy.</div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>

        {/* Retro 2004 Footer */}
        <footer className="bg-[#ece9d8] border-t-2 border-gray-500 p-4 text-center text-sm text-gray-700 font-sans space-y-1">
          <div>
            Optimalizováno pro rozlišení <strong>1024 × 768</strong> a prohlížeč <strong>Microsoft Internet Explorer 6.0</strong>.
          </div>
          <div>
            Oficiální prezentace fotbalového klubu {team.name} · Běží na systému Prales 2004.
          </div>
          <div className="text-gray-500">
            Všechna práva vyhrazena.
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
