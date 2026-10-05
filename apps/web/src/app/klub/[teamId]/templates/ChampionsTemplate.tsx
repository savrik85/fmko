"use client";

import { Fragment, useState } from "react";
import type { ClubWebsiteData, ClubWebsiteHistoryCupRun, ClubWebsiteMatchSummary } from "@okresni-masina/shared";
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

/** Výsledek odehraného zápasu z pohledu klubu: výhra, remíza, prohra. */
function matchResult(m: ClubWebsiteMatchSummary): "V" | "R" | "P" {
  const ours = m.isHome ? m.scoreHome : m.scoreAway;
  const theirs = m.isHome ? m.scoreAway : m.scoreHome;
  if (ours > theirs) return "V";
  if (ours === theirs) return "R";
  return "P";
}

const RESULT_STYLE: Record<"V" | "R" | "P", string> = {
  V: "bg-emerald-500/20 text-emerald-400 border-emerald-400/30",
  R: "bg-amber-500/20 text-amber-400 border-amber-400/30",
  P: "bg-red-500/20 text-red-400 border-red-400/30",
};

const RESULT_LABEL: Record<"V" | "R" | "P", string> = {
  V: "výhra",
  R: "remíza",
  P: "prohra",
};

/** Podpis pod titulkem rozhovoru: kdo odpovídá. */
function interviewByline(iv: Interview, data: ClubWebsiteData): string {
  const coach = interviewCoach(iv, data);
  return coach === "Trenér" ? "Odpovídá trenér klubu" : `Odpovídá trenér ${coach}`;
}

/** Rozhovor jako v klubovém zpravodaji: otázka tučně, odpověď trenéra pod ní. */
function InterviewText({ interview }: { interview: Interview }) {
  return (
    <div className="space-y-5">
      {interviewPairs(interview).map((pair, i) => (
        <div key={i}>
          <p className="font-heading font-bold text-base text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] break-words">
            {pair.question}
          </p>
          <p className="mt-1 text-white/90 text-base leading-relaxed whitespace-pre-line break-words">
            {pair.answer}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Hráč z historie klubu: kdo je ještě ve hře, má odkaz na profil. */
function HistoryPlayer({ id, name, className = "" }: { id: string | null; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return (
    <PlayerLink id={id} className={className}>
      {name}
    </PlayerLink>
  );
}

/** Rozhodující pohárový zápas jednou větou; soupeř ze hry je odkaz na jeho web. */
function CupMatchLine({ run }: { run: ClubWebsiteHistoryCupRun }) {
  const text = cupMatchText(run);
  const m = run.decidingMatch;
  if (!text || !m) return null;
  if (!text.endsWith(m.opponentName)) return <>{text}</>;
  return (
    <>
      {text.slice(0, text.length - m.opponentName.length)}
      <TeamLink id={m.opponentTeamId} name={m.opponentName} className="font-bold text-white" />
    </>
  );
}

export function ChampionsTemplate({
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
  const [openInterviewId, setOpenInterviewId] = useState<string | null>(null);

  const primary = team.primaryColor || "#0284c7";
  const secondary = team.secondaryColor || "#fbbf24";
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
  // Forma ze skutečně odehraných zápasů, nejstarší vlevo, poslední vpravo.
  const form = [...recentMatches].reverse();

  // Ceník bufetu: produkt bez ceny klub neprodává, takový řádek se nevykreslí.
  const menu = [
    { key: "beer", icon: "🍺", label: "Pivo", name: concessions.beerName, price: concessions.beerPrice },
    { key: "sausage", icon: "🌭", label: "Klobása", name: concessions.sausageName, price: concessions.sausagePrice },
    { key: "lemonade", icon: "🥤", label: "Limonáda", name: concessions.lemonadeName, price: concessions.lemonadePrice },
  ].filter((item) => item.price !== null);

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

  // Tiskové středisko: nejnovější rozhovor jako hlavní článek, starší na rozbalení, pak zprávy
  const showPress = hasPressContent(data);
  const [latestInterview, ...olderInterviews] = pressInterviews(data);
  const news = pressNews(data);

  // Historie klubu: jen co hra skutečně archivuje
  const history = hasHistory(data.history) ? data.history : null;
  // Ocenění: bez jména jen trenér (klub bez lidského trenéra); hráč bez jména se nedochoval
  const awardGroups = (history ? awardsBySeason(history) : [])
    .map((group) => ({
      ...group,
      single: group.single.filter((a) => a.name || a.kind === "manager_of_season"),
      bestEleven: group.bestEleven.filter((a) => a.name),
    }))
    .filter((group) => group.single.length > 0 || group.bestEleven.length > 0);

  const navItems: Array<{ href: string; label: string; highlight?: "main" | "audio" }> = [
    { href: "#zapas", label: "Přehled", highlight: "main" },
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
    // overflow-x-clip (ne overflow-hidden): ořízne záři do stran, ale nerozbije lepící navigaci
    <div className="min-h-screen bg-[#020510] text-white font-sans pb-20 selection:bg-[var(--club-accent-dark)] selection:text-[var(--club-on-accent-dark)] relative overflow-x-clip">
      {/* Záře v pozadí */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[color-mix(in_srgb,var(--club-accent-dark)_12%,transparent)] blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-[color-mix(in_srgb,var(--club-secondary)_8%,transparent)] blur-[130px] pointer-events-none" />

      {/* Hlavička klubu (nelepí, nahoře už je lišta z ClubWebsiteClient) */}
      <header className="relative backdrop-blur-2xl bg-white/5 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="shrink-0 drop-shadow-[0_0_20px_color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]">
              <BadgePreview
                primary={team.badge.primary}
                secondary={team.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={team.badge.symbol}
                size={54}
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] text-sm font-heading font-black tracking-wide break-words">
                  {leagueName}
                </span>
                <span className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-bold">
                  {team.village.name}
                </span>
              </div>
              <h1 className="font-heading font-black text-xl sm:text-2xl tracking-tight text-white uppercase mt-1 break-words">
                {team.name}
              </h1>
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3">
            <span className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-bold">
              Vstupné {tickets.adultPrice} Kč
            </span>
            <button
              type="button"
              onClick={onOpenTickets}
              className="px-4 sm:px-5 py-2.5 rounded-xl bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] hover:shadow-[0_0_35px_color-mix(in_srgb,var(--club-accent-dark)_70%,transparent)] font-heading font-black text-sm uppercase tracking-wider shadow-[0_0_25px_color-mix(in_srgb,var(--club-accent-dark)_50%,transparent)] active:scale-95 transition"
            >
              Vstupenky
            </button>
          </div>
        </div>
      </header>

      {/* Lepící navigace pod lištou z ClubWebsiteClient (výška cca 52 px) */}
      <nav
        aria-label="Sekce webu"
        className="sticky top-[52px] z-40 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] bg-[#030a1c]/90 backdrop-blur-xl"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2.5 text-sm font-heading font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] flex items-center gap-5 overflow-x-auto">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
                item.highlight === "main"
                  ? "text-[var(--club-accent-dark)] hover:text-white"
                  : item.highlight === "audio"
                    ? "text-amber-400 hover:text-amber-300"
                    : "hover:text-[var(--club-accent-dark)]"
              }`}
            >
              {item.highlight === "main" && <span>✨</span>}
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </nav>

      {/* Sponzorská lišta: jen skuteční partneři ze smluv */}
      {hasSponsorBanner && partners.all.length > 0 && (
        <div className="relative bg-gradient-to-r from-[#030812] via-[color-mix(in_srgb,var(--club-bar)_16%,#030812)] to-[#030812] border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] py-3 px-4 text-sm font-heading text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)]">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
            <span className="font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span>🏆</span>
              <span>Partneři klubu:</span>
            </span>
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
      <main className="relative max-w-6xl mx-auto px-4 sm:px-8 mt-8 space-y-12">
        {/* Prohlášení vedení: jen když ho klub opravdu napsal */}
        {announcement && (
          <div className="backdrop-blur-xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] p-5 sm:p-6 rounded-3xl shadow-[0_0_30px_color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] flex items-start gap-4">
            <span className="text-3xl shrink-0 mt-0.5 text-[var(--club-accent-dark)]">💎</span>
            <div className="min-w-0">
              <div className="text-sm font-heading font-black uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                Prohlášení vedení klubu{hasPressOfficer && " · tiskový mluvčí"}
              </div>
              <p className="text-white/90 text-base font-medium leading-relaxed whitespace-pre-line break-words">
                {announcement}
              </p>
            </div>
          </div>
        )}

        {/* ═══ PŘEHLED: PŘÍŠTÍ ZÁPAS, FORMA, VÝSLEDKY ═══ */}
        <section id="zapas" className={ANCHOR_OFFSET}>
          <div className="backdrop-blur-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--club-bar)_10%,#040a18)] via-[#040c1d]/90 to-[#020612] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] rounded-3xl p-4 sm:p-10 shadow-[0_0_50px_color-mix(in_srgb,var(--club-accent-dark)_20%,transparent)] relative overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] font-heading font-black text-sm uppercase tracking-wider flex items-center gap-1.5 border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--club-accent-dark)] animate-pulse" />
                  Příští zápas
                </span>
                {nextMatch && (
                  <span className="text-sm text-white/60 font-heading font-bold">
                    {nextMatch.round}. kolo
                  </span>
                )}
              </div>
              {/* Forma ze skutečných výsledků */}
              {form.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-heading font-black">
                  <span className="text-white/50 mr-1">Forma:</span>
                  {form.map((m) => {
                    const r = matchResult(m);
                    return (
                      <span
                        key={m.id}
                        title={`${m.opponent.name} ${m.scoreHome}:${m.scoreAway} (${RESULT_LABEL[r]})`}
                        className={`w-7 h-7 rounded border flex items-center justify-center ${RESULT_STYLE[r]}`}
                      >
                        {r}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {nextMatch ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-8 py-4">
                  {/* Domácí */}
                  <div className="flex flex-col items-center min-w-0">
                    <div className="w-24 h-24 rounded-3xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] p-2 shadow-[0_0_30px_color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] flex items-center justify-center mb-3">
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
                    <div className="text-sm font-heading font-bold text-[var(--club-accent-dark)] mt-1 uppercase">
                      Domácí
                    </div>
                  </div>

                  {/* Termín a vstupenky */}
                  <div className="flex flex-col items-center text-center">
                    <div className="px-6 py-2 rounded-2xl bg-[color-mix(in_srgb,var(--club-accent-dark)_10%,transparent)] border border-[color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)] text-3xl sm:text-5xl font-heading font-black tracking-widest text-[var(--club-accent-dark)] shadow-[0_0_25px_color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]">
                      VS
                    </div>
                    <div className="text-base font-heading font-bold text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] mt-3">
                      {formatDateTime(nextMatch.scheduledAt)}
                    </div>
                    <div className="text-sm text-white/50 mt-1 break-words">
                      🏟️ {nextMatch.stadiumName}
                    </div>
                    <button
                      type="button"
                      onClick={onOpenTickets}
                      className="mt-5 px-6 py-2.5 rounded-xl bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] hover:shadow-[0_0_35px_color-mix(in_srgb,var(--club-accent-dark)_70%,transparent)] font-heading font-black text-sm uppercase tracking-wider shadow-lg active:scale-95 transition"
                    >
                      Vstupenky
                    </button>
                    <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] mt-2">
                      Vstupné {tickets.adultPrice} Kč
                    </div>
                  </div>

                  {/* Hosté */}
                  <div className="flex flex-col items-center min-w-0">
                    <div className="w-24 h-24 rounded-3xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] p-2 shadow-[0_0_30px_color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] flex items-center justify-center mb-3">
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
                    <div className="text-sm font-heading font-bold text-[var(--club-accent-dark)] mt-1 uppercase">
                      Hosté
                    </div>
                  </div>
                </div>

                {/* Odpočet do výkopu (jen když je známý termín) */}
                {countdown && !countdown.done && (
                  <div className="mt-4 mx-auto max-w-md" role="timer" aria-label="Odpočet do výkopu">
                    <div className="text-sm font-heading font-bold uppercase tracking-wider text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] text-center mb-2">
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
                          className="bg-[color-mix(in_srgb,var(--club-accent-dark)_10%,transparent)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] rounded-xl py-2 text-center"
                        >
                          <div className="font-heading font-black text-2xl sm:text-3xl text-[var(--club-accent-dark)] tabular-nums">
                            {pad2(part.value)}
                          </div>
                          <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]">{part.label}</div>
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
              <div className="mt-8 pt-4 border-t border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-heading">
                <div className="text-white/60 text-center sm:text-left min-w-0 break-words">
                  Poslední výsledek ({lastMatch.round}. kolo):{" "}
                  <strong className="text-[var(--club-accent-dark)]">
                    {lastMatch.isHome ? team.name : <TeamLink id={lastMatch.opponent.id} name={lastMatch.opponent.name} />}{" "}
                    {lastMatch.scoreHome}:{lastMatch.scoreAway}{" "}
                    {lastMatch.isHome ? <TeamLink id={lastMatch.opponent.id} name={lastMatch.opponent.name} /> : team.name}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenHighlights(lastMatch)}
                  className="shrink-0 px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] font-bold text-sm border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] transition"
                >
                  ▶ Sestřih zápasu
                </button>
              </div>
            )}

            {/* Odehraná kola a program dalších zápasů */}
            {(recentMatches.length > 0 || upcomingMatches.length > 0) && (
              <div className="mt-8 pt-6 border-t border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] grid grid-cols-1 md:grid-cols-2 gap-6">
                {recentMatches.length > 0 && (
                  <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-3 sm:p-4 backdrop-blur-md">
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)] flex items-center gap-1.5">
                      <span>✨</span> Výsledky posledních kol
                    </h3>
                    <ul className="space-y-2">
                      {recentMatches.slice(0, 4).map((m) => (
                        <li
                          key={m.id}
                          className="p-3 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[var(--club-accent-dark)] font-mono">
                              {m.round}. kolo · {formatDate(m.date)}
                            </div>
                            <div className="font-bold text-white break-words">
                              {m.isHome ? team.name : <TeamLink id={m.opponent.id} name={m.opponent.name} />}
                              {" – "}
                              {m.isHome ? <TeamLink id={m.opponent.id} name={m.opponent.name} /> : team.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black px-2 py-0.5 bg-[color-mix(in_srgb,var(--club-accent-dark)_12%,transparent)] border border-[color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)] rounded text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] font-mono text-base">
                              {m.scoreHome}:{m.scoreAway}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenHighlights(m)}
                              className="px-2 py-1 rounded-lg text-[var(--club-accent-dark)] hover:text-white hover:bg-white/5 font-bold text-sm"
                            >
                              Sestřih
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {upcomingMatches.length > 0 && (
                  <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-3 sm:p-4 backdrop-blur-md">
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)] flex items-center gap-1.5">
                      <span>🗓️</span> Program dalších zápasů
                    </h3>
                    <ul className="space-y-2">
                      {upcomingMatches.slice(0, 4).map((um) => (
                        <li
                          key={um.id}
                          className="p-3 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[var(--club-accent-dark)] font-mono">
                              {um.round}. kolo · {formatDate(um.scheduledAt)}
                            </div>
                            <div className="font-bold text-white/90 break-words">
                              <TeamLink id={um.opponent.id} name={um.opponent.name} />
                            </div>
                          </div>
                          <span className={`shrink-0 text-sm font-black px-2 py-0.5 rounded-full uppercase ${
                            um.isHome ? "bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]" : "bg-white/10 text-white/70"
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
          <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
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
                    <tr className="bg-white/5 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-black text-sm uppercase tracking-wide border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]">
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
                        <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]">
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
              <div className="py-10 text-center text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] italic font-heading">
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
                <div className="backdrop-blur-xl bg-white/5 p-1 rounded-xl border border-white/10 flex gap-1 text-sm font-heading font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveRosterTab("aTeam")}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeRosterTab === "aTeam"
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black shadow"
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
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    🌱 Dorost U21 ({roster.u21Team.length})
                  </button>
                </div>
              )}

              <div className="backdrop-blur-xl bg-white/5 p-1 rounded-xl border border-white/10 flex gap-1 text-sm font-heading font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "cards" ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black shadow" : "text-white/60"}`}
                >
                  Karty
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-3 py-1.5 rounded-lg transition ${viewMode === "pitch" ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black shadow" : "text-white/60"}`}
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
                        : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {viewMode === "pitch" ? (
            <div className="backdrop-blur-xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-10 shadow-2xl">
              <TacticalPitch
                players={currentRoster}
                primaryColor={primary}
                secondaryColor={secondary}
              />
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="py-8 text-center text-base text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading">
              Na tomhle postu teď klub nikoho nemá.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRoster.map((player) => (
                <article
                  key={player.id}
                  className="backdrop-blur-xl bg-gradient-to-b from-white/10 via-white/5 to-[#050e20] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] rounded-2xl p-4 shadow-[0_4px_25px_color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] relative overflow-hidden group hover:border-[var(--club-accent-dark)] transition-colors flex flex-col justify-between"
                >
                  {/* Jemný třpyt při najetí */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[color-mix(in_srgb,var(--club-accent-dark)_6%,transparent)] to-[color-mix(in_srgb,var(--club-bar)_12%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <div>
                    {/* Hodnocení, post a číslo */}
                    <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-heading font-black text-sm shadow" title="Hodnocení hráče">
                          {player.overallRating} ★
                        </span>
                        <span className="text-sm font-heading font-extrabold uppercase tracking-wide text-[var(--club-accent-dark)] truncate">
                          {player.positionName || player.position}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-heading font-black text-white/50">
                        #{player.squadNumber ?? EMPTY}
                      </span>
                    </div>

                    {/* Portrét a jméno */}
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-16 h-18 rounded-xl overflow-hidden bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] shrink-0 flex items-center justify-center shadow-inner group-hover:border-[var(--club-accent-dark)] transition-colors">
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
                        <div className="text-sm text-[var(--club-accent-dark)] mt-1 font-heading font-bold">
                          {player.age} let
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Statistiky sezóny */}
                  <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-1 text-center font-heading relative z-10">
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-bold">Zápasy</div>
                      <div className="font-black text-base text-white">{player.stats.appearances}</div>
                    </div>
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-bold">Góly</div>
                      <div className="font-black text-base text-[var(--club-accent-dark)]">{player.stats.goals}</div>
                    </div>
                    <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-bold">Minuty</div>
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
          <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4 flex-wrap gap-3">
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
                        ? "bg-[var(--club-accent-dark)] text-[var(--club-on-accent-dark)] font-black border-[var(--club-accent-dark)] shadow-[0_0_15px_color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]"
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
                      className="p-4 sm:p-5 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl transition hover:border-[color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide ${
                            isIn
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
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
                          <span className="text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]">
                            {" · "}{isIn ? "Odkud" : "Kam"}:{" "}
                            <TeamLink id={t.otherTeamId} name={t.otherTeamName} className="text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)]" />
                          </span>
                        )}
                      </div>

                      <h4 className="font-heading font-bold text-base text-white mb-1 break-words">
                        {t.headline}
                      </h4>
                      <p className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] leading-relaxed mb-3 break-words">
                        {t.story}
                      </p>

                      {t.quote && (
                        <div className="p-3 bg-white/5 border-l-4 border-[var(--club-accent-dark)] rounded-r-xl text-sm italic text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] break-words">
                          <strong>Slovo hráče:</strong> „{t.quote}“
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] italic font-heading">
                Zatím tu nejsou žádné přestupy.
              </div>
            )}
          </div>
        </section>

        {/* ═══ TISKOVÉ STŘEDISKO ═══ */}
        {showPress && (
          <section id="tisk" className={ANCHOR_OFFSET}>
            <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                  Rozhovory a zprávy klubu
                </div>
                <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Tiskové středisko
                </h2>
              </div>

              <div className="space-y-8">
                {/* Nejnovější rozhovor jako hlavní článek */}
                {latestInterview && (
                  <article className="p-4 sm:p-6 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]">
                        Rozhovor
                      </span>
                      <span className="text-sm text-white/50">{formatDate(latestInterview.createdAt)}</span>
                    </div>
                    <h3 className="font-heading font-black text-xl sm:text-2xl text-white uppercase tracking-tight break-words">
                      {interviewHeadline(latestInterview)}
                    </h3>
                    <div className="text-sm font-heading font-bold text-[var(--club-accent-dark)] mt-1 mb-5 break-words">
                      {interviewByline(latestInterview, data)}
                    </div>
                    <InterviewText interview={latestInterview} />
                  </article>
                )}

                {/* Starší rozhovory: titulky, text na rozbalení */}
                {olderInterviews.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Starší rozhovory
                    </h3>
                    <ul className="space-y-2">
                      {olderInterviews.map((iv) => {
                        const isOpen = openInterviewId === iv.id;
                        return (
                          <li
                            key={iv.id}
                            className="bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-xl"
                          >
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={`rozhovor-${iv.id}`}
                              onClick={() => setOpenInterviewId(isOpen ? null : iv.id)}
                              className="w-full p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-left text-sm hover:bg-white/5 transition"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-[var(--club-accent-dark)] font-mono">
                                  {formatDate(iv.createdAt)}
                                </span>
                                <span className="block font-bold text-base text-white break-words">
                                  {interviewHeadline(iv)}
                                </span>
                              </span>
                              <span className="shrink-0 px-2 py-1 rounded-lg text-[var(--club-accent-dark)] font-bold text-sm">
                                {isOpen ? "Skrýt" : "Číst rozhovor"}
                              </span>
                            </button>
                            {isOpen && (
                              <div
                                id={`rozhovor-${iv.id}`}
                                className="px-3 sm:px-4 pt-3 pb-4 border-t border-white/10"
                              >
                                <div className="text-sm font-heading font-bold text-[var(--club-accent-dark)] mb-4 break-words">
                                  {interviewByline(iv, data)}
                                </div>
                                <InterviewText interview={iv} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Zprávy klubu */}
                {news.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Zprávy klubu
                    </h3>
                    <div className="space-y-4">
                      {news.map((n) => (
                        <article
                          key={n.id}
                          className="p-4 sm:p-5 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl transition hover:border-[color-mix(in_srgb,var(--club-accent-dark)_40%,transparent)]"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <span className="text-sm px-2.5 py-0.5 rounded-full font-heading font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]">
                              {PRESS_NEWS_TYPES.get(n.type) ?? "Zpráva klubu"}
                            </span>
                            <span className="text-sm text-white/50">{formatDate(n.created_at)}</span>
                          </div>
                          <h4 className="font-heading font-bold text-base text-white mb-1 break-words">
                            {n.headline}
                          </h4>
                          <p className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] leading-relaxed whitespace-pre-line break-words">
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

        {/* ═══ HISTORIE KLUBU ═══ */}
        {history && (
          <section id="historie" className={ANCHOR_OFFSET}>
            <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
                <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                  Kronika a úspěchy
                </div>
                <h2 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                  Historie klubu
                </h2>
              </div>

              <div className="space-y-8">
                <p className="text-white/90 text-base font-medium leading-relaxed break-words">
                  {historyIntro(history, team.name)}
                </p>

                {/* Úspěchy klubu */}
                {history.trophies.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Úspěchy klubu
                    </h3>
                    <ul className="space-y-2">
                      {history.trophies.map((t, i) => (
                        <li
                          key={`${t.seasonNumber}-${t.kind}-${i}`}
                          className="p-3 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 font-bold text-base text-white break-words">
                            {trophyTitle(t)}
                          </span>
                          <span className="shrink-0 text-[var(--club-accent-dark)] font-mono">
                            {t.seasonNumber}. sezóna
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Umístění v soutěžích */}
                {history.seasons.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Umístění v soutěžích
                    </h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-black text-sm uppercase tracking-wide border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]">
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
                          {history.seasons.map((s) => {
                            const isChampion = s.position === 1;
                            return (
                              <tr
                                key={`${s.seasonNumber}-${s.leagueName}`}
                                className={`transition ${
                                  isChampion
                                    ? "bg-[color-mix(in_srgb,var(--club-accent-dark)_18%,transparent)] font-bold text-white border-l-4 border-l-[var(--club-accent-dark)] shadow-inner"
                                    : "hover:bg-white/5 text-white/80"
                                }`}
                              >
                                <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]">
                                  {s.seasonNumber}.
                                </td>
                                <td className="py-3 px-2 sm:px-3 font-semibold text-base min-w-[9rem] break-words">
                                  {s.leagueName}
                                  {isChampion && <span className="sr-only"> (vítěz soutěže)</span>}
                                </td>
                                <td className="py-3 px-2 text-center font-heading font-black text-white whitespace-nowrap">
                                  {s.position}.
                                  {s.teams !== null && (
                                    <span className="font-sans font-normal text-white/50"> z {s.teams}</span>
                                  )}
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Ocenění po sezónách */}
                {awardGroups.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Ocenění
                    </h3>
                    <div className="space-y-4">
                      {awardGroups.map((group) => (
                        <article
                          key={group.seasonNumber}
                          className="p-4 sm:p-5 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl"
                        >
                          <div className="text-sm text-[var(--club-accent-dark)] font-mono mb-3 break-words">
                            {group.seasonNumber}. sezóna{group.leagueName && ` · ${group.leagueName}`}
                          </div>
                          <ul className="space-y-3">
                            {group.single.map((a, i) => (
                              <li key={`${a.kind}-${i}`} className="break-words">
                                <div className="text-sm font-heading font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)]">
                                  {AWARD_TITLES[a.kind]}
                                </div>
                                <div className="text-base text-white">
                                  {a.name ? (
                                    <HistoryPlayer id={a.playerId} name={a.name} className="font-heading font-bold" />
                                  ) : (
                                    <span className="font-heading font-bold">Trenér klubu</span>
                                  )}
                                </div>
                                {a.detail && (
                                  <p className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] leading-relaxed">
                                    {a.detail}
                                  </p>
                                )}
                              </li>
                            ))}
                            {group.bestEleven.length > 0 && (
                              <li className="break-words">
                                <div className="text-sm font-heading font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)]">
                                  {AWARD_TITLES.best_eleven}
                                </div>
                                <p className="text-base text-white leading-relaxed">
                                  {group.bestEleven.map((a, i) => (
                                    <Fragment key={`${a.playerId ?? a.name}-${i}`}>
                                      {i > 0 && ", "}
                                      <HistoryPlayer id={a.playerId} name={a.name ?? ""} className="font-heading font-bold" />
                                      {a.detail && (
                                        <span className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]"> ({a.detail})</span>
                                      )}
                                    </Fragment>
                                  ))}
                                </p>
                              </li>
                            )}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pohár */}
                {history.cup.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Pohár
                    </h3>
                    <ul className="space-y-2">
                      {history.cup.map((run) => (
                        <li
                          key={`${run.seasonNumber}-${run.cupName}`}
                          className="p-3 bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[var(--club-accent-dark)] font-mono">
                              {run.seasonNumber}. sezóna
                            </div>
                            <div className="font-bold text-base text-white break-words">{run.cupName}</div>
                            {run.decidingMatch && (
                              <div className="text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] break-words">
                                <CupMatchLine run={run} />
                              </div>
                            )}
                          </div>
                          <span
                            className={`shrink-0 text-sm font-black px-2 py-0.5 rounded-full uppercase ${
                              run.status === "won"
                                ? "bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] text-[color-mix(in_srgb,var(--club-accent-dark)_60%,#ffffff)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]"
                                : "bg-white/10 text-white/70"
                            }`}
                          >
                            {cupResultText(run)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nejlepší střelci v historii klubu */}
                {history.topScorers.length > 0 && (
                  <div>
                    <h3 className="mb-3 border-b border-white/10 pb-2 font-heading font-black text-sm uppercase tracking-wider text-[var(--club-accent-dark)]">
                      Nejlepší střelci v historii klubu
                    </h3>
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading font-black text-sm uppercase tracking-wide border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]">
                            <th className="py-3 px-2 sm:px-3 text-center w-10">#</th>
                            <th className="py-3 px-2 sm:px-3">Hráč</th>
                            <th className="py-3 px-2 sm:px-4 text-center font-black text-white">Góly</th>
                            <th className="py-3 px-2 sm:px-3 text-center">Zápasy</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-sans">
                          {history.topScorers.map((s, i) => (
                            <tr key={`${s.playerId ?? s.name}-${i}`} className="transition hover:bg-white/5 text-white/80">
                              <td className="py-3 px-2 sm:px-3 text-center font-heading font-black text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]">
                                {i + 1}.
                              </td>
                              <td className="py-3 px-2 sm:px-3 font-semibold text-base min-w-[9rem] break-words">
                                <HistoryPlayer id={s.playerId} name={s.name} />
                                {!s.stillAtClub && (
                                  <span className="text-sm font-normal text-white/50"> (odešel)</span>
                                )}
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
            </div>
          </section>
        )}

        {/* ═══ DRESY, ŠÁLA A MASKOT ═══ */}
        <section id="identita" className={ANCHOR_OFFSET}>
          <div className="bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-2xl space-y-6 backdrop-blur-xl">
            <div className="border-b border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] pb-4">
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)]">
                Výstroj a identita
              </div>
              <h3 className="text-xl sm:text-3xl font-heading font-black text-white tracking-tight uppercase">
                Dresy
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-5 flex flex-col items-center text-center">
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

              <div className="bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-5 flex flex-col items-center text-center">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)]">
              <div className="bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wide font-heading font-black text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] mb-3">
                  🧣 Klubová šála
                </h4>
                <ClubScarf
                  primary={team.badge.primary}
                  secondary={team.badge.secondary}
                  pattern={badgePattern}
                  scarfPattern={(team.scarfPattern as any) || "classic"}
                  initials={badgeIni}
                  symbol={team.badge.symbol}
                  className="h-16 w-full shadow-[0_0_20px_color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] rounded-lg"
                />
              </div>

              <div className="bg-black/40 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-2xl p-5">
                <h4 className="text-sm uppercase tracking-wide font-heading font-black text-[color-mix(in_srgb,var(--club-accent-dark)_30%,#ffffff)] mb-3">
                  🦁 Klubový maskot
                </h4>
                {team.mascot?.name ? (
                  <div className="flex items-center gap-4">
                    {team.mascot.imageUrl ? (
                      <img
                        src={team.mascot.imageUrl}
                        alt={team.mascot.name}
                        className="w-16 h-16 rounded-xl border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] object-cover shrink-0 shadow-[0_0_15px_color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)]"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-[color-mix(in_srgb,var(--club-accent-dark)_15%,transparent)] border border-[color-mix(in_srgb,var(--club-accent-dark)_30%,transparent)] rounded-xl flex items-center justify-center text-3xl shrink-0">
                        🦁
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-heading font-black text-base text-white break-words">{team.mascot.name}</div>
                      {team.mascot.story && (
                        <p className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] italic mt-1 leading-snug break-words">
                          {team.mascot.story}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] italic py-3 font-heading">
                    Klub zatím maskota nemá.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

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
          <div className="backdrop-blur-xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_20%,transparent)] rounded-3xl p-3 sm:p-6 shadow-xl">
            <StadiumPhotoCard data={data} isOwner={isOwner} tone="dark" onOpenLightbox={onOpenLightbox} />
          </div>
        </section>

        {/* ═══ BUFET ═══ */}
        <section id="bufet" className={ANCHOR_OFFSET}>
          <div className="backdrop-blur-xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-xl">
            <div className="mb-6">
              <div className="text-sm font-heading font-bold uppercase tracking-wider text-[var(--club-accent-dark)] mb-1">
                Bufet
              </div>
              <h2 className="font-heading font-black text-xl sm:text-2xl text-white uppercase">
                Občerstvení a nápoje v areálu
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
              <div className="py-6 text-center text-base text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading">
                Bufet teď nic neprodává.
              </div>
            )}
          </div>
        </section>

        {/* ═══ HYMNA A CHORÁLY ═══ */}
        {hasAudioModule && (
          <section id="audio" className={ANCHOR_OFFSET}>
            <div className="backdrop-blur-xl bg-white/5 border border-[color-mix(in_srgb,var(--club-accent-dark)_25%,transparent)] rounded-3xl p-4 sm:p-8 shadow-xl">
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

      <footer className="relative max-w-6xl mx-auto px-4 sm:px-8 mt-16 pt-8 border-t border-white/10 text-sm text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)] font-heading flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-4 text-center sm:text-left">
        <div className="break-words">
          Oficiální web fotbalového klubu {team.name}
        </div>
        <div>
          Běží na platformě Prales. Všechna práva vyhrazena.
        </div>
        <LeagueTeamLinks
          standings={standings}
          className="w-full text-center space-y-2 pt-4 border-t border-white/10"
          titleClassName="font-bold uppercase tracking-wide text-[color-mix(in_srgb,var(--club-accent-dark)_20%,#ffffffa6)]"
          linkClassName="hover:text-white hover:underline"
        />
      </footer>
    </div>
  );
}
