"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PageHeader, useConfirm, Tabs, ListCard, ListRow, ListEmpty, ScoreChip, type MatchOutcome } from "@/components/ui";
import { FixtureGroup, FixtureRow, type FixtureSide } from "@/components/match/fixture-row";
import type { BadgePattern } from "@/components/ui";
import { PreseasonNotice } from "@/components/team/preseason-notice";
import { TeamName } from "@/components/manager/team-name";

interface ScheduleMatch {
  id: string;
  calendarId: string | null;
  round: number | null;
  status: string;
  homeTeamId: string;
  homeName: string;
  homeIsAi?: boolean;
  homeColor: string;
  homeSecondary: string;
  homeBadge: string;
  homeScore: number | null;
  awayTeamId: string;
  awayName: string;
  awayIsAi?: boolean;
  awayColor: string;
  awaySecondary: string;
  awayBadge: string;
  awayScore: number | null;
  scheduledAt: string | null;
  gameWeek: number | null;
  isHome: boolean;
  simulatedAt: string | null;
  promoted?: boolean;
  promotionCost?: number | null;
  promotionBoost?: number | null;
  presetSlot?: "A" | "B" | "C" | null;
  hasLineup?: boolean;
  isDefaultLineup?: boolean;
  defaultPresetSlot?: "A" | "B" | "C" | null;
  isLocalDerby?: boolean;
  /** Domluvený přátelák (bez kola v kalendáři). Sestava se otevře až v den zápasu. */
  isFriendly?: boolean;
  isCup?: boolean;
  /** Turnaj P-Mobile: neutrální půda, nejde propagovat. */
  isTournament?: boolean;
  roundName?: string | null;
  homePens?: number | null;
  awayPens?: number | null;
}

interface LeagueRound {
  round: number;
  scheduledAt: string | null;
  matches: Array<{
    id: string;
    status: string;
    homeTeamId: string;
    homeName: string;
    homeIsAi?: boolean;
    homeColor: string;
    homeSecondary: string;
    homeBadge: string;
    homeScore: number | null;
    awayTeamId: string;
    awayName: string;
    awayIsAi?: boolean;
    awayColor: string;
    awaySecondary: string;
    awayBadge: string;
    awayScore: number | null;
  }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

type Tab = "my" | "league";

export default function SchedulePage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useState<Tab>("my");
  const [matches, setMatches] = useState<ScheduleMatch[]>([]);
  const [promotionPrice, setPromotionPrice] = useState<number | null>(null);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [leagueName, setLeagueName] = useState("");
  const [loading, setLoading] = useState(true);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueLoaded, setLeagueLoaded] = useState(false);
  const [acting, setActing] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const loadSchedule = async () => {
    if (!teamId) return;
    const data = await apiFetch<{ leagueName: string; season: number; matches: ScheduleMatch[]; promotionPrice?: number }>(`/api/teams/${teamId}/schedule`);
    setLeagueName(data.season ? `${data.leagueName}. Sezóna ${data.season}` : data.leagueName);
    setMatches(data.matches);
    setPromotionPrice(data.promotionPrice ?? null);
  };

  // Load my schedule
  useEffect(() => {
    if (!teamId) return;
    loadSchedule()
      .then(() => setLoading(false))
      .catch((e) => { console.error("load schedule:", e); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const promoteMatch = async (m: ScheduleMatch) => {
    if (!teamId || acting) return;
    const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";
    const ok = await confirm({
      title: `Propagovat zápas proti ${m.isHome ? m.awayName : m.homeName}?`,
      description: "Vyjde článek ve Zpravodaji a přijde více diváků (+25 %).",
      details: [{ label: "Cena", value: `-${priceStr}`, color: "text-card-red" }],
      confirmLabel: promotionPrice != null ? `Propagovat za ${priceStr}` : "Propagovat",
    });
    if (!ok) return;
    setActing(true);
    const res = await apiFetch<{ ok?: boolean; cost?: number; error?: string }>(
      `/api/teams/${teamId}/matches/${m.id}/promote`,
      { method: "POST" },
    ).catch((e) => { console.error("promote match:", e); return { error: "Chyba při propagaci" }; });
    setActing(false);
    if (res?.error) {
      showError("Chyba", res.error ?? "Zkus to prosím znovu.");
      return;
    }
    await loadSchedule();
  };

  // Lazy-load league schedule on tab switch
  useEffect(() => {
    if (tab !== "league" || leagueLoaded || !teamId) return;
    setLeagueLoading(true);
    apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule`)
      .then((data) => {
        setRounds(data.rounds);
        setLeagueLoaded(true);
        setLeagueLoading(false);
      })
      .catch(() => setLeagueLoading(false));
  }, [tab, teamId, leagueLoaded]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const played = matches.filter((m) => m.status === "simulated");
  const upcoming = matches.filter((m) => m.status !== "simulated");
  const upcomingIds = new Set(upcoming.map((m) => m.id));

  const nextHome = upcoming.find((m) => m.isHome && !m.isTournament && !m.isFriendly); // ligový i pohárový domácí zápas lze propagovat, turnaj a přátelák ne

  return (
    <>
      {confirmDialog}
      <PageHeader compact name={leagueName || "Rozpis zápasů"} detail={`${played.length} odehráno · ${upcoming.length} zbývá`}>{null}</PageHeader>
    <div className="page-container space-y-5">
      <PreseasonNotice />

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Rozpis zápasů"
        items={[
          { key: "my", label: "Můj tým" },
          { key: "league", label: "Celá liga" },
        ]}
      />

      {/* My team schedule */}
      {tab === "my" && (
        <>
          {/* Promo banner — nejbližší domácí zápas */}
          {nextHome && (
            <div className="card px-3 py-2.5 sm:p-5 bg-gradient-to-r from-gold-50 to-pitch-50 border border-gold-200">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="text-xl sm:text-3xl shrink-0">📢</div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold text-sm sm:text-base leading-tight">
                    {nextHome.promoted ? "Zápas je propagovaný" : "Propagace dalšího zápasu"}
                  </div>
                  <div className="text-xs sm:text-sm text-muted mt-0.5 leading-tight">
                    vs <TeamName name={nextHome.awayName} isAi={nextHome.awayIsAi === true} /> · {nextHome.isCup ? `🏆 ${nextHome.roundName ?? "Pohár"} · ` : ""}{formatDate(nextHome.scheduledAt)}
                    {nextHome.promoted && nextHome.promotionCost
                      ? <span className="hidden sm:inline">, zaplaceno {nextHome.promotionCost.toLocaleString("cs")} Kč</span>
                      : null}
                  </div>
                </div>
                {!nextHome.promoted ? (
                  <button
                    onClick={() => promoteMatch(nextHome)}
                    disabled={acting}
                    className="shrink-0 py-1.5 px-3 sm:py-2 sm:px-4 rounded-soft text-xs sm:text-sm font-heading font-bold bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-50 transition-colors"
                  >
                    {acting ? "..." : "Propagovat"}
                  </button>
                ) : (
                  <span className="shrink-0 py-1.5 px-3 text-xs font-heading font-bold text-gold-700">
                    ✓
                  </span>
                )}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <ListCard title="Nadcházející" count={upcoming.length} className="mb-6">
              {upcoming.map((m) => (
                <MatchRow key={m.id} match={m} canEditLineup={upcomingIds.has(m.id)} />
              ))}
            </ListCard>
          )}

          {played.length > 0 && (
            <ListCard title="Odehrané" count={played.length}>
              {played.map((m) => (
                <MatchRow key={m.id} match={m} canEditLineup={false} />
              ))}
            </ListCard>
          )}

          {matches.length === 0 && (
            <ListCard><ListEmpty icon="📅">Zatím žádné zápasy. Rozpis se objeví, až se losuje soutěž.</ListEmpty></ListCard>
          )}
        </>
      )}

      {/* League schedule */}
      {tab === "league" && (
        <>
          {leagueLoading && (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          )}
          {!leagueLoading && rounds.length === 0 && (
            <ListCard><ListEmpty icon="📅">Rozpis ligy zatím není dostupný.</ListEmpty></ListCard>
          )}
          {!leagueLoading && (
            <div className="space-y-4">
              {rounds.map((round) => (
                <FixtureGroup key={round.round} title={`${round.round}. kolo`}
                  note={round.scheduledAt ? `${formatDate(round.scheduledAt)} ${formatTime(round.scheduledAt)}` : undefined}>
                  {round.matches.map((m) => <LeagueMatchRow key={m.id} match={m} myTeamId={teamId!} />)}
                </FixtureGroup>
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}

function MatchRow({ match: m, canEditLineup }: { match: ScheduleMatch; canEditLineup: boolean }) {
  const isPlayed = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const opp = m.isHome
    ? { name: m.awayName, isAi: m.awayIsAi === true, color: m.awayColor, secondary: m.awaySecondary, badge: m.awayBadge }
    : { name: m.homeName, isAi: m.homeIsAi === true, color: m.homeColor, secondary: m.homeSecondary, badge: m.homeBadge };
  const oppInitials = opp.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  // Přátelák na pozdější den čeká jako „scheduled": sestava se mu otevře až v den zápasu.
  const lineupLater = !isPlayed && m.isFriendly === true && m.status === "scheduled";
  const canEdit = canEditLineup && !lineupLater;
  const lineup: { label: string; tone: "ok" | "neutral" | "danger" } | null = lineupLater
    ? { label: "Sestava v den zápasu", tone: "neutral" }
    : !isPlayed && canEdit
      ? (m.presetSlot
          ? { label: `Sestava ${m.presetSlot}`, tone: "ok" }
          : m.hasLineup
            ? { label: "Sestava ✓", tone: "ok" }
            : m.isDefaultLineup
              ? { label: m.defaultPresetSlot ? `Sestava ${m.defaultPresetSlot} (výchozí)` : "Výchozí sestava", tone: "neutral" }
              : { label: "Bez sestavy", tone: "danger" })
      : null;

  const kind = m.isFriendly ? (m.isHome ? "přátelák doma" : "přátelák venku")
    : m.isTournament ? (m.roundName ?? "turnaj")
    : m.isCup ? `🏆 ${m.roundName ?? "pohár"}`
    : `${m.round ? `${m.round}. kolo · ` : ""}${m.isHome ? "doma" : "venku"}`;
  const outcome: MatchOutcome | null = isPlayed
    ? ((m.isHome ? m.homeScore! - m.awayScore! : m.awayScore! - m.homeScore!) > 0 ? "W"
      : (m.isHome ? m.homeScore! - m.awayScore! : m.awayScore! - m.homeScore!) < 0 ? "L" : "D")
    : null;
  // Odehraný zápas (i pohárový, má vlastní detail) vede na detail; nadcházející na sestavu.
  // Pro přátelák (calendarId=null) i pohár je klíčem m.id, BE next-match ho mapuje jako calendarId.
  const href = isPlayed ? `/zapas/${m.id}` : canEdit ? `/zapas?calendarId=${m.calendarId ?? m.id}` : undefined;

  return (
    // Místní derby nese červený proužek vlevo jako dřív.
    <ListRow href={href} tone={m.isLocalDerby ? "danger" : undefined}
      leading={<BadgePreview primary={opp.color} secondary={opp.secondary} pattern={opp.badge as BadgePattern} initials={oppInitials} size={32} />}
      title={<>{m.isLocalDerby && <span title="Místní derby" className="mr-1">🏘️</span>}<TeamName name={opp.name} isAi={opp.isAi} wrap /></>}
      meta={isPlayed ? kind : `${kind} · ${formatDate(m.scheduledAt)} ${formatTime(m.scheduledAt)}`}
      // Stav sestavy pod podrobnostmi jako dřív: štítek vpravo by dlouhý název soupeře zalomil na tři řádky.
      detail={!outcome && lineup
        ? <span className={`font-bold ${lineup.tone === "ok" ? "text-pitch-600" : lineup.tone === "danger" ? "text-card-red" : "text-muted"}`}>{lineup.tone === "danger" ? "⚠ " : ""}{lineup.label}</span>
        : undefined}
      trailing={outcome ? <ScoreChip result={outcome}>{m.homeScore}:{m.awayScore}</ScoreChip> : undefined} />
  );
}

function LeagueMatchRow({ match: m, myTeamId }: {
  match: LeagueRound["matches"][number];
  myTeamId: string;
}) {
  const isPlayed = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const side = (id: string, name: string, isAi: boolean | undefined, color: string, secondary: string, badge: string): FixtureSide => ({
    name, href: id ? `/tym/${id}` : null, color, isAi: isAi === true,
    crest: { pattern: badge, primary: color, secondary, initials: null, symbol: null },
  });
  return (
    <FixtureRow
      home={side(m.homeTeamId, m.homeName, m.homeIsAi, m.homeColor, m.homeSecondary, m.homeBadge)}
      away={side(m.awayTeamId, m.awayName, m.awayIsAi, m.awayColor, m.awaySecondary, m.awayBadge)}
      score={isPlayed ? { home: m.homeScore!, away: m.awayScore! } : null}
      kickoff="vs"
      winner={isPlayed ? (m.homeScore! > m.awayScore! ? "home" : m.awayScore! > m.homeScore! ? "away" : null) : null}
      href={isPlayed ? `/zapas/${m.id}` : null}
      accent={m.homeTeamId === myTeamId || m.awayTeamId === myTeamId ? "var(--color-pitch-500)" : null} />
  );
}
