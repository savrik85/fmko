"use client";

import { Fragment, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ClubWebsiteData, ClubWebsiteHistoryCupRun } from "@okresni-masina/shared";
import { LeagueTeamLinks } from "./LeagueTeamLinks";
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
import {
  ANCHOR_OFFSET,
  ClubBasePathContext,
  EMPTY,
  PlayerLink,
  TeamLink,
  clubPartners,
  formatDate,
  formatDateTime,
  pad2,
  transferKindLabel,
  useCountdown,
} from "./shared";

/**
 * „Odpovídá trenér Novák“; když se jméno trenéra nedochovalo, jen „trenér klubu“.
 * Současný trenér je odkaz na jeho stránku, dřívější zůstane jen jménem.
 */
function coachLine(iv: Interview, data: ClubWebsiteData, base: string): ReactNode {
  if (!iv.managerName && !data.manager?.name) return "Odpovídá trenér klubu";
  const coach = interviewCoach(iv, data);
  return (
    <>
      Odpovídá trenér{" "}
      {data.manager && coach === data.manager.name ? (
        <Link href={`${base}/trener`} className="hover:text-white hover:underline">
          {coach}
        </Link>
      ) : (
        coach
      )}
    </>
  );
}

/** Otázky tučně, odpověď pod nimi, jako v novinovém rozhovoru. */
function InterviewText({ iv }: { iv: Interview }) {
  return (
    <div className="space-y-4">
      {interviewPairs(iv).map((pair, i) => (
        <div key={i}>
          <p className="font-heading font-bold text-base text-white break-words">{pair.question}</p>
          <p className="mt-1 text-base text-white/80 leading-relaxed whitespace-pre-line break-words">{pair.answer}</p>
        </div>
      ))}
    </div>
  );
}

/** Jméno z historie: odkaz na profil, jen když je hráč ještě ve hře. */
function HistoryPlayer({ id, name, className = "" }: { id: string | null; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return (
    <PlayerLink id={id} className={className}>
      {name}
    </PlayerLink>
  );
}

/** Rozhodující pohárový zápas; soupeř ze hry je klikatelný. */
function CupMatchLine({ run }: { run: ClubWebsiteHistoryCupRun }) {
  const text = cupMatchText(run);
  const m = run.decidingMatch;
  if (!text || !m) return null;
  const prefix = text.endsWith(m.opponentName) ? text.slice(0, text.length - m.opponentName.length) : null;
  return (
    <div className="text-sm text-white/60 break-words">
      {prefix !== null ? (
        <>
          {prefix}
          <TeamLink id={m.opponentTeamId} name={m.opponentName} className="text-white/90" />
        </>
      ) : (
        text
      )}
    </div>
  );
}

export function ProfiLeagueTemplate({
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
  const [openInterviews, setOpenInterviews] = useState<Record<string, boolean>>({});
  // Adresa webu klubu pro podstránky (zápasy, zpravodaj, trenér).
  const base = useContext(ClubBasePathContext) ?? `/klub/${team.id}`;

  const primary = team.primaryColor || "#dc2626";
  const secondary = team.secondaryColor || "#ffffff";
  const badgePattern = (team.badge.pattern as BadgePattern) || "shield";
  const badgeIni = team.badge.customInitials || team.name.slice(0, 3).toUpperCase();
  const leagueName = team.league?.name || "Okresní soutěž";
  const partners = clubPartners(data);
  const announcement = website.announcement?.trim() || null;

  const hasU21 = (roster.u21Team?.length ?? 0) > 0;
  const currentRoster = activeRosterTab === "u21Team" && hasU21 ? roster.u21Team : roster.aTeam;

  const nextMatch = matches.nextMatch;
  const lastMatch = matches.lastMatch;
  const recentMatches = matches.recentMatches || [];
  const upcomingMatches = matches.upcomingMatches || [];
  const standings = matches.standings || [];
  const countdown = useCountdown(nextMatch?.scheduledAt ?? null);

  // Ceník bufetu: produkt bez ceny klub neprodává, takový řádek se nevykreslí.
  const menu = [
    { key: "beer", icon: "🍺", label: "Pivo", name: concessions.beerName, price: concessions.beerPrice },
    { key: "sausage", icon: "🌭", label: "Klobása", name: concessions.sausageName, price: concessions.sausagePrice },
    { key: "lemonade", icon: "🥤", label: "Limonáda", name: concessions.lemonadeName, price: concessions.lemonadePrice },
  ].filter((item) => item.price !== null);

  // Tiskové středisko: nejnovější rozhovor jako článek, starší na rozbalení, pod nimi zprávy klubu
  const showPress = hasPressContent(data);
  const [leadInterview, ...olderInterviews] = pressInterviews(data);
  const clubNews = pressNews(data);

  // Historie klubu: jen to, co hra skutečně archivuje
  const history = hasHistory(data.history) ? data.history : null;
  const historyAwards = history ? awardsBySeason(history) : [];

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

  const navItems: Array<{ href: string; label: string; highlight?: "live" | "audio" }> = [
    { href: "#zapas", label: "Příští zápas", highlight: "live" },
    ...(recentMatches.length > 0 ? [{ href: "#zaznamy", label: "Záznamy zápasů" }] : []),
    { href: `${base}/zapasy`, label: "Zápasy" },
    { href: `${base}/zpravodaj`, label: "Zpravodaj" },
    { href: `${base}/trener`, label: "Trenér" },
    { href: "#tabulka", label: "Tabulka" },
    { href: "#kadr", label: "Kádr" },
    { href: "#prestupy", label: `Přestupy (${transfers.length})` },
    ...(showPress ? [{ href: "#tisk", label: "Tisk" }] : []),
    ...(history ? [{ href: "#historie", label: "Historie" }] : []),
    { href: "#identita", label: "Dresy" },
    { href: "#stadion", label: "Stadion" },
    { href: "#bufet", label: "Bufet" },
    ...(hasAudioModule ? [{ href: "#audio", label: "Hymna a chorály", highlight: "audio" as const }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#070a12] text-white font-sans pb-16 selection:bg-[var(--club-accent-dark)] selection:text-[var(--club-on-accent-dark)]">
      {/* Hlavička klubu (nelepí, nahoře už je lišta z ClubWebsiteClient) */}
      <header className="bg-[var(--club-bar)] text-[var(--club-on-bar)] border-b border-white/10 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
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
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="px-2 py-0.5 rounded text-[var(--club-on-bar)] border border-[color-mix(in_srgb,var(--club-on-bar)_40%,transparent)] text-sm font-heading font-black tracking-wide break-words">
                  {leagueName}
                </span>
                <span className="text-sm text-[var(--club-on-bar)] font-heading font-bold">
                  {team.village.name}
                </span>
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl tracking-tight text-[var(--club-on-bar)] uppercase mt-1 break-words">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3">
            <span className="text-sm text-[var(--club-on-bar)] font-heading font-bold">
              Vstupné {tickets.adultPrice} Kč
            </span>
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-5 py-2.5 rounded-xl bg-[var(--club-on-bar)] text-[var(--club-bar)] hover:ring-2 hover:ring-[color-mix(in_srgb,var(--club-on-bar)_45%,transparent)] font-heading font-black text-sm uppercase tracking-wider shadow-lg active:scale-95 transition"
            >
              Vstupenky
            </button>
          </div>
        </div>
      </header>

      {/* Lepící navigace pod lištou z ClubWebsiteClient (výška cca 52 px) */}
      <nav
        aria-label="Sekce webu"
        className="sticky top-[52px] z-40 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_35%,transparent)] bg-[#0b0e17]/95 backdrop-blur-md"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2.5 text-sm font-heading font-bold uppercase tracking-wide text-white/70 flex items-center gap-5 overflow-x-auto">
          {navItems.map((item) => {
            const className = `shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
              item.highlight === "live"
                ? "text-[var(--club-accent-dark)] hover:text-white"
                : item.highlight === "audio"
                  ? "text-amber-400 hover:text-amber-300"
                  : "hover:text-white"
            }`;
            const content = (
              <>
                {item.highlight === "live" && <span className="w-2 h-2 rounded-full bg-[var(--club-accent-dark)] animate-pulse" />}
                <span>{item.label}</span>
              </>
            );
            // Sekce téže stránky jsou kotvy, podstránky webu (zápasy, zpravodaj) jdou přes Link.
            return item.href.startsWith("#") ? (
              <a key={item.href} href={item.href} className={className}>
                {content}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Sponzorská lišta: jen skuteční partneři ze smluv */}
      {hasSponsorBanner && partners.all.length > 0 && (
        <div className="bg-[#121826] border-b border-amber-500/20 py-3 px-4 text-sm font-heading text-slate-300">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
            <span className="font-black text-amber-400 uppercase tracking-wider">Partneři klubu:</span>
            {partners.general && (
              <span>
                Generální partner <strong className="text-white break-words">{partners.general}</strong>
              </span>
            )}
            {partners.stadium && (
              <span>
                Partner stadionu <strong className="text-white break-words">{partners.stadium}</strong>
              </span>
            )}
            {partners.partners.length > 0 && (
              <span className="font-bold text-white break-words">{partners.partners.join(" · ")}</span>
            )}
          </div>
        </div>
      )}

      {/* ═══ OBSAH ═══ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-12">
        {/* Tiskové prohlášení: jen když ho klub opravdu napsal */}
        {announcement && (
          <div className="bg-[#111726] border-l-4 border-[var(--club-accent-dark)] p-5 rounded-2xl shadow-xl flex items-start gap-4">
            <span className="text-3xl shrink-0 mt-0.5">🎙️</span>
            <div className="min-w-0">
              <div className="text-sm font-heading font-black uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                Tiskové prohlášení klubu{hasPressOfficer && " · tiskový mluvčí"}
              </div>
              <p className="text-white/90 text-base font-medium leading-relaxed whitespace-pre-line break-words">
                {announcement}
              </p>
            </div>
          </div>
        )}

        {/* ═══ PŘÍŠTÍ ZÁPAS ═══ */}
        <section id="zapas" className={ANCHOR_OFFSET}>
          <div className="bg-gradient-to-br from-[#121828] via-[#0d121e] to-[#080b14] border border-white/10 rounded-3xl p-4 sm:p-10 shadow-2xl relative overflow-hidden">
            {/* Podsvícení v barvě klubu */}
            <div
              className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
              style={{ background: "var(--club-accent-dark)" }}
            />

            <div className="relative flex flex-wrap items-center justify-between gap-2 mb-6 pb-4 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-md bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-heading font-black text-sm uppercase tracking-wider flex items-center gap-1.5 shadow">
                  <span className="w-2 h-2 rounded-full bg-[var(--club-on-accent-dark)] animate-ping" />
                  Příští zápas
                </span>
                {nextMatch && (
                  <span className="text-sm text-white/60 font-heading font-bold">
                    {nextMatch.round}. kolo
                  </span>
                )}
              </div>
              <div className="text-sm font-heading font-black text-[var(--club-accent-dark)] bg-black/40 px-3 py-1 rounded-lg border border-white/10 max-w-full break-words">
                {leagueName}
              </div>
            </div>

            {nextMatch ? (
              <>
                <div className="relative grid grid-cols-1 sm:grid-cols-3 items-center gap-8 py-4">
                  {/* Domácí */}
                  <div className="flex flex-col items-center min-w-0">
                    <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 p-2 shadow-2xl flex items-center justify-center mb-3">
                      <BadgePreview
                        primary={nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                        secondary={nextMatch.isHome ? team.badge.secondary : "#fff"}
                        pattern="shield"
                        initials={(nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                        size={68}
                      />
                    </div>
                    <div className="font-heading font-black text-xl sm:text-2xl text-white uppercase tracking-tight text-center break-words max-w-full">
                      {nextMatch.isHome ? (
                        team.name
                      ) : (
                        <TeamLink id={nextMatch.opponent.id} name={nextMatch.opponent.name} />
                      )}
                    </div>
                    <div className="text-sm font-heading font-bold text-white/50 mt-1 uppercase">
                      Domácí
                    </div>
                  </div>

                  {/* Termín a vstupenky */}
                  <div className="flex flex-col items-center text-center">
                    <div className="px-6 py-2 rounded-2xl bg-black/60 border border-white/10 text-3xl sm:text-5xl font-heading font-black tracking-widest text-[var(--club-accent-dark)] shadow-inner">
                      VS
                    </div>
                    <div className="text-base font-heading font-bold text-white/80 mt-3">
                      {formatDateTime(nextMatch.scheduledAt)}
                    </div>
                    <div className="text-sm text-white/50 mt-1 break-words">
                      🏟️ {nextMatch.stadiumName}
                    </div>
                    <button
                      type="button"
                      onClick={onOpenTickets}
                      className="mt-5 px-6 py-2.5 rounded-xl bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] hover:shadow-[0_0_24px_color-mix(in_srgb,var(--club-accent-dark)_55%,transparent)] font-heading font-black text-sm uppercase tracking-wider shadow-lg active:scale-95 transition"
                    >
                      Vstupenky
                    </button>
                    <div className="text-sm text-white/60 mt-2">
                      Vstupné {tickets.adultPrice} Kč
                    </div>
                    <Link
                      href={`${base}/zpravodaj`}
                      className="mt-1 px-2 py-1 rounded-lg text-[var(--club-accent-dark)] hover:text-white hover:bg-white/5 font-bold text-sm"
                    >
                      Zpravodaj ke kolu
                    </Link>
                  </div>

                  {/* Hosté */}
                  <div className="flex flex-col items-center min-w-0">
                    <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 p-2 shadow-2xl flex items-center justify-center mb-3">
                      <BadgePreview
                        primary={!nextMatch.isHome ? team.badge.primary : nextMatch.opponent.primaryColor || "#333"}
                        secondary={!nextMatch.isHome ? team.badge.secondary : "#fff"}
                        pattern="shield"
                        initials={(!nextMatch.isHome ? team.name : nextMatch.opponent.name).slice(0, 3).toUpperCase()}
                        size={68}
                      />
                    </div>
                    <div className="font-heading font-black text-xl sm:text-2xl text-white uppercase tracking-tight text-center break-words max-w-full">
                      {!nextMatch.isHome ? (
                        team.name
                      ) : (
                        <TeamLink id={nextMatch.opponent.id} name={nextMatch.opponent.name} />
                      )}
                    </div>
                    <div className="text-sm font-heading font-bold text-white/50 mt-1 uppercase">
                      Hosté
                    </div>
                  </div>
                </div>

                {/* Odpočet do výkopu (jen když je známý termín) */}
                {countdown && !countdown.done && (
                  <div className="relative mt-4 mx-auto max-w-md" role="timer" aria-label="Odpočet do výkopu">
                    <div className="text-sm font-heading font-bold uppercase tracking-wider text-white/50 text-center mb-2">
                      Do výkopu zbývá
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: countdown.days, label: "dní" },
                        { value: countdown.hours, label: "hodin" },
                        { value: countdown.minutes, label: "minut" },
                        { value: countdown.seconds, label: "sekund" },
                      ].map((part) => (
                        <div
                          key={part.label}
                          className="bg-black/50 border border-white/10 rounded-xl py-2 text-center"
                        >
                          <div className="font-heading font-black text-2xl sm:text-3xl text-white tabular-nums">
                            {pad2(part.value)}
                          </div>
                          <div className="text-sm text-white/50">{part.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center text-white/50 text-base font-heading">
                Klub teď nemá naplánovaný žádný zápas.
              </div>
            )}

            {/* Poslední výsledek */}
            {lastMatch && (
              <div className="relative mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-heading">
                <div className="text-white/60 text-center sm:text-left min-w-0 break-words">
                  Poslední zápas ({lastMatch.round}. kolo):{" "}
                  <strong className="text-white">
                    {lastMatch.isHome ? team.name : <TeamLink id={lastMatch.opponent.id} name={lastMatch.opponent.name} />}{" "}
                    {lastMatch.scoreHome}:{lastMatch.scoreAway}{" "}
                    {lastMatch.isHome ? <TeamLink id={lastMatch.opponent.id} name={lastMatch.opponent.name} /> : team.name}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="shrink-0 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition"
                >
                  ▶ Sestřih zápasu
                </button>
              </div>
            )}

            {/* Odehraná kola se záznamy a program dalších zápasů */}
            {(recentMatches.length > 0 || upcomingMatches.length > 0) && (
              <div className="relative mt-8 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
                {recentMatches.length > 0 && (
                  <div id="zaznamy" className={`${ANCHOR_OFFSET} bg-[#121826] border border-white/10 rounded-2xl p-3 sm:p-4`}>
                    <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)] flex items-center gap-1.5">
                      <span>⏪</span> Záznamy zápasů
                    </h3>
                    <ul className="space-y-2">
                      {recentMatches.slice(0, 4).map((m) => (
                        <li
                          key={m.id}
                          className="p-3 bg-black/30 border border-white/5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-white/50 font-mono">
                              {m.round}. kolo · {formatDate(m.date)}
                            </div>
                            <div className="font-bold text-white break-words">
                              {m.isHome ? team.name : <TeamLink id={m.opponent.id} name={m.opponent.name} />}
                              {" – "}
                              {m.isHome ? <TeamLink id={m.opponent.id} name={m.opponent.name} /> : team.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black px-2 py-0.5 bg-white/10 rounded text-[var(--club-accent-dark)] font-mono text-base">
                              {m.scoreHome}:{m.scoreAway}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenHighlights(m)}
                              className="px-2 py-1 rounded-lg text-[var(--club-accent-dark)] hover:text-white hover:bg-white/5 font-bold text-sm"
                            >
                              Záznam
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 text-right">
                      <Link
                        href={`${base}/zapasy`}
                        className="inline-block px-2 py-1 rounded-lg text-[var(--club-accent-dark)] hover:text-white hover:bg-white/5 font-bold text-sm"
                      >
                        Všechny zápasy
                      </Link>
                    </div>
                  </div>
                )}

                {upcomingMatches.length > 0 && (
                  <div className="bg-[#121826] border border-white/10 rounded-2xl p-3 sm:p-4">
                    <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                      <span>⏩</span> Program dalších zápasů
                    </h3>
                    <ul className="space-y-2">
                      {upcomingMatches.slice(0, 4).map((um) => (
                        <li
                          key={um.id}
                          className="p-3 bg-black/30 border border-white/5 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-white/50 font-mono">
                              {um.round}. kolo · {formatDate(um.scheduledAt)}
                            </div>
                            <div className="font-bold text-white/90 break-words">
                              <TeamLink id={um.opponent.id} name={um.opponent.name} />
                            </div>
                          </div>
                          <span className={`shrink-0 text-sm font-black px-2 py-0.5 rounded uppercase ${
                            um.isHome ? "bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_35%,transparent)]" : "bg-white/10 text-white/70"
                          }`}>
                            {um.isHome ? "Doma" : "Venku"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ═══ TABULKA SOUTĚŽE ═══ */}
        <section id="tabulka" className={ANCHOR_OFFSET}>
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="mb-6 border-b border-white/10 pb-4">
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] break-words">
                {leagueName}
              </div>
              <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                Tabulka soutěže
              </h3>
            </div>

            {standings.length > 0 ? (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-white/60 font-heading font-black text-sm uppercase tracking-wide border-b border-white/10">
                      <th className="py-3 px-2 sm:px-3 text-center w-10">#</th>
                      <th className="py-3 px-2 sm:px-3">Klub</th>
                      <th className="py-3 px-2 text-center" title="Zápasy">Z</th>
                      <th className="py-3 px-2 text-center text-emerald-400" title="Výhry">V</th>
                      <th className="py-3 px-2 text-center text-slate-400" title="Remízy">R</th>
                      <th className="py-3 px-2 text-center text-red-400" title="Prohry">P</th>
                      <th className="py-3 px-2 sm:px-3 text-center">Skóre</th>
                      <th className="py-3 px-2 sm:px-4 text-center font-black text-white">Body</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-sans">
                    {standings.map((row) => (
                      <tr
                        key={row.teamId}
                        className={`transition ${
                          row.isCurrentTeam
                            ? "bg-[color-mix(in_srgb,var(--club-accent-dark)_18%,transparent)] font-bold text-white border-l-4 border-l-[var(--club-accent-dark)] shadow-inner"
                            : "hover:bg-white/5 text-white/80"
                        }`}
                      >
                        <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-white/50">
                          {row.pos}.
                        </td>
                        <td className="py-3 px-2 sm:px-3 font-semibold text-base min-w-[9rem]">
                          <TeamLink id={row.isCurrentTeam ? null : row.teamId} name={row.teamName} />
                          {row.isCurrentTeam && <span className="sr-only"> (náš klub)</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono">{row.played}</td>
                        <td className="py-3 px-2 text-center font-mono text-emerald-400 font-bold">{row.won}</td>
                        <td className="py-3 px-2 text-center font-mono text-white/60">{row.drawn}</td>
                        <td className="py-3 px-2 text-center font-mono text-red-400 font-bold">{row.lost}</td>
                        <td className="py-3 px-2 sm:px-3 text-center font-mono whitespace-nowrap">{row.gf}:{row.ga}</td>
                        <td className="py-3 px-2 sm:px-4 text-center font-heading font-black text-[var(--club-accent-dark)] text-base bg-black/40">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-white/50 italic font-heading">
                Tabulka bude k dispozici po odehrání prvních kol.
              </div>
            )}
          </div>
        </section>

        {/* ═══ KÁDR ═══ */}
        <section id="kadr" className={ANCHOR_OFFSET}>
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                Soupiska
              </div>
              <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase">
                Kádr
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* A-tým / U21 (jen když klub U21 má) */}
              {hasU21 && (
                <div className="bg-[#121826] p-1 rounded-xl border border-white/10 flex gap-1 text-sm font-heading font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("aTeam")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeRosterTab === "aTeam"
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    ⚽ A-tým ({roster.aTeam.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("u21Team")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeRosterTab === "u21Team"
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    🌱 Dorost U21 ({roster.u21Team.length})
                  </button>
                </div>
              )}

              <div className="bg-[#121826] p-1 rounded-xl border border-white/10 flex gap-1 text-sm font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] shadow" : "text-white/60"}`}
                >
                  Karty
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] shadow" : "text-white/60"}`}
                >
                  Na hřišti
                </button>
              </div>
            </div>
          </div>

          {/* Filtr podle postu */}
          {viewMode === "cards" && (
            <div className="flex items-center gap-1.5 mb-6 flex-wrap text-sm font-heading font-bold">
              {(["all", "GK", "DEF", "MID", "FWD"] as const).map((pos) => {
                const label = pos === "all" ? "Všichni" : pos === "GK" ? "Brankáři" : pos === "DEF" ? "Obránci" : pos === "MID" ? "Záložníci" : "Útočníci";
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPositionFilter(pos)}
                    className={`px-3 sm:px-4 py-1.5 rounded-lg uppercase tracking-wide transition ${
                      positionFilter === pos
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black shadow-lg"
                        : "bg-[#121826] text-white/70 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {viewMode === "pitch" ? (
            <div className="bg-[#121826] border border-white/10 rounded-3xl p-4 sm:p-10 shadow-2xl">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={secondary}
              />
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="py-8 text-center text-base text-white/50 font-heading">
              Na tomhle postu teď klub nikoho nemá.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((player) => (
                <article
                  key={player.id}
                  className="bg-gradient-to-b from-[#161f33] to-[#0e1422] border border-white/15 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-[color-mix(in_srgb,var(--club-accent-dark)_60%,transparent)] transition-colors flex flex-col justify-between"
                >
                  {/* Číslo dresu jako vodoznak */}
                  <div className="absolute -right-3 -top-5 text-7xl font-heading font-black text-white/5 pointer-events-none select-none tracking-tighter">
                    {player.squadNumber ?? ""}
                  </div>

                  <div>
                    {/* Hodnocení, post a číslo */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-heading font-black text-sm shadow" title="Hodnocení hráče">
                          {player.overallRating}
                        </span>
                        <span className="text-sm font-heading font-extrabold uppercase tracking-wide text-white/60 truncate">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-heading font-black text-white/50">
                        #{player.squadNumber ?? EMPTY}
                      </span>
                    </div>

                    {/* Portrét a jméno */}
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-18 rounded-xl overflow-hidden bg-black/40 border border-white/20 shrink-0 flex items-center justify-center shadow-inner group-hover:border-[color-mix(in_srgb,var(--club-accent-dark)_50%,transparent)] transition-colors">
                        <ManagerFace faceConfig={player.avatar} size={58} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <PlayerLink id={player.id} className="block min-w-0">
                          <span className="block font-heading font-black text-lg text-white uppercase tracking-tight break-words">
                            {player.lastName}
                          </span>
                          <span className="block text-base text-white/70 font-semibold break-words">
                            {player.firstName}
                          </span>
                        </PlayerLink>
                        <div className="text-sm text-white/50 mt-1">
                          {player.age} let
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Statistiky sezóny */}
                  <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-1 text-center font-heading">
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-white/50 font-bold">Zápasy</div>
                      <div className="font-black text-base text-white">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-white/50 font-bold">Góly</div>
                      <div className="font-black text-base text-[var(--club-accent-dark)]">{player.stats.goals}</div>
                    </div>
                    <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-white/50 font-bold">Minuty</div>
                      <div className="font-black text-base text-white">{player.stats.minutesPlayed}&apos;</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ═══ PŘESTUPY ═══ */}
        <section id="prestupy" className={ANCHOR_OFFSET}>
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4 flex-wrap gap-3">
              <div>
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                  Příchody a odchody
                </div>
                <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Přestupy
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-sm font-heading font-bold">
                {(["all", "in", "out"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTransferFilter(tab)}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      transferFilter === tab
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] border-[var(--club-accent-dark)] shadow"
                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
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
                    <article
                      key={t.id}
                      className="p-4 sm:p-5 bg-black/40 border border-white/10 rounded-2xl transition hover:border-white/20"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide ${
                            isIn
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {isIn ? "🟢 Příchod" : "🔴 Odchod"} · {transferKindLabel(t.kind, t.direction)}
                        </span>
                        <span className="text-sm text-white/50">{formatDate(t.date)}</span>
                      </div>

                      <div className="text-base text-white mb-1 break-words">
                        <PlayerLink id={t.playerId} className="font-heading font-black">
                          {t.playerName}
                        </PlayerLink>
                        {t.otherTeamName && (
                          <span className="text-white/60">
                            {" · "}{isIn ? "Odkud" : "Kam"}:{" "}
                            <TeamLink id={t.otherTeamId} name={t.otherTeamName} className="text-white/90" />
                          </span>
                        )}
                      </div>

                      <h4 className="font-heading font-bold text-base text-white mb-1 break-words">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-white/70 leading-relaxed mb-3 break-words">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-white/5 border-l-4 border-[var(--club-accent-dark)] rounded-r-xl text-sm italic text-white/80 break-words">
                          <strong>Slovo hráče:</strong> „{t.quote}“
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-white/50 italic font-heading">
                Zatím tu nejsou žádné přestupy.
              </div>
            )}
          </div>
        </section>

        {/* ═══ DRESY, ŠÁLA A MASKOT ═══ */}
        <section id="identita" className={ANCHOR_OFFSET}>
          <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                Výstroj a identita
              </div>
              <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                Dresy
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wide font-heading font-black text-[var(--club-accent-dark)] mb-3">
                  Domácí dres
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
                <div className="text-sm text-white/50 mt-3 font-mono">
                  Hlavní barva: <strong className="text-white">{primary}</strong>
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center">
                <span className="text-sm uppercase tracking-wide font-heading font-black text-[var(--club-accent-dark)] mb-3">
                  Venkovní dres
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
                <div className="text-sm text-white/50 mt-3 font-mono">
                  Doplňková barva: <strong className="text-white">{team.secondaryColor || "#ffffff"}</strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-white/10">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wide font-heading font-black text-white/80 mb-3">
                  🧣 Klubová šála
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
                <h4 className="text-sm uppercase tracking-wide font-heading font-black text-white/80 mb-3">
                  🦁 Klubový maskot
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
                      <div className="w-16 h-16 bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] border border-[color-mix(in_srgb,var(--club-accent-dark)_35%,transparent)] rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-heading font-black text-base text-white break-words">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-sm text-white/60 italic mt-1 leading-snug break-words">
                          {team.mascot.story}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/50 italic py-3 font-heading">
                    Klub zatím maskota nemá.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ TISKOVÉ STŘEDISKO ═══ */}
        {showPress && (
          <section id="tisk" className={ANCHOR_OFFSET}>
            <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl space-y-6">
              <div className="border-b border-white/10 pb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                  Tiskové středisko
                </div>
                <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Slovo trenéra a zprávy klubu
                </h2>
              </div>

              {/* Nejnovější rozhovor jako hlavní článek */}
              {leadInterview && (
                <article className="p-4 sm:p-5 bg-black/40 border border-white/10 rounded-2xl">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_35%,transparent)]">
                      Rozhovor
                    </span>
                    <span className="text-sm text-white/50">{formatDate(leadInterview.createdAt)}</span>
                  </div>
                  <h3 className="font-heading font-black text-lg sm:text-xl text-white uppercase tracking-tight break-words">
                    {interviewHeadline(leadInterview)}
                  </h3>
                  <p className="text-sm text-white/60 mb-4 break-words">{coachLine(leadInterview, data, base)}</p>
                  <InterviewText iv={leadInterview} />
                </article>
              )}

              {/* Starší rozhovory: titulky, text na rozbalení */}
              {olderInterviews.length > 0 && (
                <div>
                  <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                    Starší rozhovory
                  </h3>
                  <ul className="space-y-2">
                    {olderInterviews.map((iv) => {
                      const open = !!openInterviews[iv.id];
                      const panelId = `rozhovor-${iv.id}`;
                      return (
                        <li key={iv.id} className="bg-black/30 border border-white/5 rounded-xl">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={panelId}
                            onClick={() => setOpenInterviews((s) => ({ ...s, [iv.id]: !s[iv.id] }))}
                            className="w-full p-3 flex flex-wrap items-center justify-between gap-2 text-left text-sm rounded-xl hover:bg-white/5 transition"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-white/50 font-mono">{formatDate(iv.createdAt)}</span>
                              <span className="block font-bold text-base text-white break-words">{interviewHeadline(iv)}</span>
                            </span>
                            <span className="shrink-0 px-2 py-1 rounded-lg text-[var(--club-accent-dark)] font-bold text-sm">
                              {open ? "Skrýt" : "Číst"}
                            </span>
                          </button>
                          <div id={panelId} hidden={!open} className="px-3 pt-3 pb-4 border-t border-white/10">
                            <p className="text-sm text-white/60 mb-3 break-words">{coachLine(iv, data, base)}</p>
                            <InterviewText iv={iv} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Zprávy klubu ve stylu článků z přestupů */}
              {clubNews.length > 0 && (
                <div>
                  <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                    Zprávy klubu
                  </h3>
                  <div className="space-y-4">
                    {clubNews.map((n) => (
                      <article
                        key={n.id}
                        className="p-4 sm:p-5 bg-black/40 border border-white/10 rounded-2xl transition hover:border-white/20"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                          <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_35%,transparent)]">
                            {PRESS_NEWS_TYPES.get(n.type)}
                          </span>
                          <span className="text-sm text-white/50">{formatDate(n.created_at)}</span>
                        </div>
                        <h4 className="font-heading font-bold text-base text-white mb-1 break-words">
                          {n.headline}
                        </h4>
                        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line break-words">
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

        {/* ═══ HISTORIE KLUBU ═══ */}
        {history && (
          <section id="historie" className={ANCHOR_OFFSET}>
            <div className="bg-[#0e1320] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl space-y-6">
              <div className="border-b border-white/10 pb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                  Kronika klubu
                </div>
                <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Historie klubu
                </h2>
              </div>

              <p className="text-base text-white/80 leading-relaxed break-words">
                {historyIntro(history, team.name)}
              </p>

              {/* Úspěchy klubu */}
              {history.trophies.length > 0 && (
                <div>
                  <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                    Úspěchy klubu
                  </h3>
                  <ul className="space-y-2">
                    {history.trophies.map((tr) => (
                      <li
                        key={`${tr.seasonNumber}-${tr.kind}-${tr.competitionName}`}
                        className="p-3 bg-black/30 border border-white/5 rounded-xl flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                      >
                        <span className="min-w-0 font-heading font-bold text-base text-white break-words">
                          {trophyTitle(tr)}
                        </span>
                        <span className="shrink-0 text-sm text-white/50 font-mono">{tr.seasonNumber}. sezóna</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Umístění v soutěžích */}
              {history.seasons.length > 0 && (
                <div>
                  <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                    Umístění v soutěžích
                  </h3>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-white/60 font-heading font-black text-sm uppercase tracking-wide border-b border-white/10">
                          <th className="py-3 px-2 sm:px-3 text-center">Sezóna</th>
                          <th className="py-3 px-2 sm:px-3">Soutěž</th>
                          <th className="py-3 px-2 text-center">Místo</th>
                          <th className="py-3 px-2 text-center" title="Zápasy">Z</th>
                          <th className="py-3 px-2 text-center text-emerald-400" title="Výhry">V</th>
                          <th className="py-3 px-2 text-center text-slate-400" title="Remízy">R</th>
                          <th className="py-3 px-2 text-center text-red-400" title="Prohry">P</th>
                          <th className="py-3 px-2 sm:px-3 text-center">Skóre</th>
                          <th className="py-3 px-2 sm:px-4 text-center font-black text-white">Body</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans">
                        {history.seasons.map((s) => (
                          <tr key={`${s.seasonNumber}-${s.leagueName}`} className="transition hover:bg-white/5 text-white/80">
                            <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-white/50">
                              {s.seasonNumber}.
                            </td>
                            <td className="py-3 px-2 sm:px-3 font-semibold text-base min-w-[9rem] break-words">
                              {s.leagueName}
                            </td>
                            <td className="py-3 px-2 text-center font-heading font-black text-white text-base">
                              {s.position}.
                            </td>
                            <td className="py-3 px-2 text-center font-mono">{s.played ?? EMPTY}</td>
                            <td className="py-3 px-2 text-center font-mono text-emerald-400 font-bold">{s.wins ?? EMPTY}</td>
                            <td className="py-3 px-2 text-center font-mono text-white/60">{s.draws ?? EMPTY}</td>
                            <td className="py-3 px-2 text-center font-mono text-red-400 font-bold">{s.losses ?? EMPTY}</td>
                            <td className="py-3 px-2 sm:px-3 text-center font-mono whitespace-nowrap">
                              {s.goalsFor !== null && s.goalsAgainst !== null ? `${s.goalsFor}:${s.goalsAgainst}` : EMPTY}
                            </td>
                            <td className="py-3 px-2 sm:px-4 text-center font-heading font-black text-[var(--club-accent-dark)] text-base bg-black/40">
                              {s.points ?? EMPTY}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Ocenění a pohár vedle sebe jako záznamy a program u zápasu */}
              {(historyAwards.length > 0 || history.cup.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {historyAwards.length > 0 && (
                    <div>
                      <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                        Ocenění
                      </h3>
                      <ul className="space-y-2">
                        {historyAwards.map((group) => {
                          const elevenNames = group.bestEleven.filter((a) => a.name);
                          return (
                            <li key={group.seasonNumber} className="p-3 bg-black/30 border border-white/5 rounded-xl text-sm">
                              <div className="text-white/50 font-mono break-words">
                                {group.seasonNumber}. sezóna{group.leagueName && ` · ${group.leagueName}`}
                              </div>
                              <ul className="mt-1 space-y-2">
                                {group.single.map((a, i) => (
                                  <li key={`${a.kind}-${i}`} className="break-words">
                                    <div className="text-base text-white">
                                      <span className="font-heading font-bold text-[var(--club-accent-dark)]">
                                        {AWARD_TITLES[a.kind]}
                                      </span>
                                      {a.name && (
                                        <>
                                          {": "}
                                          <HistoryPlayer id={a.playerId} name={a.name} className="font-bold text-white" />
                                        </>
                                      )}
                                    </div>
                                    {a.detail && <p className="text-sm text-white/60 leading-relaxed">{a.detail}</p>}
                                  </li>
                                ))}
                                {elevenNames.length > 0 && (
                                  <li className="text-base text-white/80 break-words">
                                    <span className="font-heading font-bold text-[var(--club-accent-dark)]">
                                      {AWARD_TITLES.best_eleven}
                                    </span>
                                    {": "}
                                    {elevenNames.map((a, i) => (
                                      <Fragment key={`${a.playerId ?? a.name}-${i}`}>
                                        {i > 0 && ", "}
                                        <HistoryPlayer id={a.playerId} name={a.name ?? ""} className="font-bold text-white" />
                                      </Fragment>
                                    ))}
                                  </li>
                                )}
                              </ul>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {history.cup.length > 0 && (
                    <div>
                      <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                        Pohár
                      </h3>
                      <ul className="space-y-2">
                        {history.cup.map((run) => (
                          <li
                            key={`${run.seasonNumber}-${run.cupName}`}
                            className="p-3 bg-black/30 border border-white/5 rounded-xl text-sm"
                          >
                            <div className="text-white/50 font-mono">{run.seasonNumber}. sezóna</div>
                            <div className="font-heading font-bold text-base text-white break-words">{run.cupName}</div>
                            <div
                              className={`font-bold text-base break-words ${
                                run.status === "won" ? "text-[var(--club-accent-dark)]" : "text-white/80"
                              }`}
                            >
                              {cupResultText(run)}
                            </div>
                            <CupMatchLine run={run} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Nejlepší střelci v historii klubu */}
              {history.topScorers.length > 0 && (
                <div>
                  <h3 className="mb-3 border-b border-white/5 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                    Nejlepší střelci v historii klubu
                  </h3>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-white/60 font-heading font-black text-sm uppercase tracking-wide border-b border-white/10">
                          <th className="py-3 px-2 sm:px-3 text-center w-10">#</th>
                          <th className="py-3 px-2 sm:px-3">Hráč</th>
                          <th className="py-3 px-2 sm:px-4 text-center font-black text-white">Góly</th>
                          <th className="py-3 px-2 sm:px-3 text-center">Zápasy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans">
                        {history.topScorers.map((s, i) => (
                          <tr key={`${s.playerId ?? s.name}-${i}`} className="transition hover:bg-white/5 text-white/80">
                            <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-white/50">
                              {i + 1}.
                            </td>
                            <td className="py-3 px-2 sm:px-3 font-semibold text-base min-w-[9rem] break-words">
                              <HistoryPlayer id={s.playerId} name={s.name} />
                              {!s.stillAtClub && <span className="text-sm font-normal text-white/50"> (odešel)</span>}
                            </td>
                            <td className="py-3 px-2 sm:px-4 text-center font-heading font-black text-[var(--club-accent-dark)] text-base bg-black/40">
                              {s.goals}
                            </td>
                            <td className="py-3 px-2 sm:px-3 text-center font-mono">{s.appearances}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═══ STADION ═══ */}
        <section id="stadion" className={ANCHOR_OFFSET}>
          <div className="mb-6">
            <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
              Stadion
            </div>
            <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight uppercase break-words">
              {team.stadium.name || "Domácí hřiště"}
            </h2>
          </div>
          <div className="bg-[#121826] border border-white/10 rounded-3xl p-3 sm:p-6 shadow-xl">
            <StadiumPhotoCard data={data} isOwner={isOwner} tone="dark" onOpenLightbox={onOpenLightbox} />
          </div>
        </section>

        {/* ═══ BUFET ═══ */}
        <section id="bufet" className={ANCHOR_OFFSET}>
          <div className="bg-[#121826] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-xl">
            <div className="mb-6">
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                Bufet
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                Občerstvení u hřiště
              </h2>
            </div>

            {menu.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-heading">
                {menu.map((item) => (
                  <div
                    key={item.key}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <div className="font-black text-base text-white break-words">{item.name || item.label}</div>
                      <div className="text-sm text-white/50">{item.label}</div>
                    </div>
                    <div className="shrink-0 text-2xl font-black text-[var(--club-accent-dark)] tabular-nums">
                      {item.price} Kč
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-base text-white/50 font-heading">
                Bufet teď nic neprodává.
              </div>
            )}
          </div>
        </section>

        {/* ═══ HYMNA A CHORÁLY ═══ */}
        {hasAudioModule && (
          <section id="audio" className={ANCHOR_OFFSET}>
            <div className="bg-[#121826] border border-white/10 rounded-3xl p-4 sm:p-8 shadow-xl">
              <div className="mb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                  Klubové písně
                </div>
                <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                  Hymna a chorály
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

      <footer className="max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-white/10 text-sm text-white/50 font-heading flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4 text-center sm:text-left">
        <div className="break-words">
          Oficiální web fotbalového klubu {team.name}
        </div>
        <div>
          Běží na platformě Prales. Všechna práva vyhrazena.
        </div>
        <LeagueTeamLinks
          standings={standings}
          className="w-full text-center space-y-2 pt-4 border-t border-white/10"
          titleClassName="font-bold uppercase tracking-wide text-white/40"
          linkClassName="hover:text-white hover:underline"
        />
      </footer>
    </div>
  );
}
