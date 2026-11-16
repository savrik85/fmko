"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PositionBadge, PageHeader, Tabs, DataTable, EntityCell, ListCard, ResultChip, type DataColumn, type MatchOutcome } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { PreseasonNotice } from "@/components/team/preseason-notice";
import { LeagueStatsTab, type StatsData } from "@/components/league/league-stats";
import { CoachName } from "@/components/manager/coach-name";
import { TeamName } from "@/components/manager/team-name";

// ═══ Types ═══

interface Standing {
  pos: number; teamId: string | null; team: string;
  played: number; wins: number; draws: number; losses: number;
  gf: number; ga: number; points: number; form: string[];
  isPlayer?: boolean; isAi?: boolean;
  primaryColor?: string; secondaryColor?: string; badgePattern?: string;
}

interface LeagueRound {
  round: number; scheduledAt: string | null;
  matches: Array<{
    id: string; status: string;
    homeTeamId: string; homeName: string; homeColor: string; homeSecondary: string; homeBadge: string; homeScore: number | null;
    awayTeamId: string; awayName: string; awayColor: string; awaySecondary: string; awayBadge: string; awayScore: number | null;
  }>;
}

// ═══ Helpers ═══


interface LeagueMovement { promotion: boolean; relegation: boolean }
const NO_MOVEMENT: LeagueMovement = { promotion: false, relegation: false };

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}


/** 1 gól, 2–4 góly, jinak gólů. */

type Tab = "tabulka" | "rozpis" | "vysledky" | "statistiky" | "zpravodaj";

interface NewsArticle { id: string; type: string; headline: string; body: string; icon: string; date: string; gameWeek?: number | null }

// ═══ Minulé sezóny (archiv) ═══

interface PastStanding { pos: number; teamId: string; teamName: string; points: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; played: number }
interface BestElevenEntry { playerId: string; name: string; position: string; teamName: string }
interface AwardsSnapshot {
  champion?: { teamId: string; name: string | null } | null;
  playerOfSeason?: { id: string | null; name: string | null; reason: string | null };
  topScorer?: { id: string | null; name: string | null; goals: number };
  managerOfSeason?: { teamId: string | null; name: string | null; coachIsAi?: boolean; reason: string | null };
  discovery?: { id: string | null; name: string | null; reason: string | null };
  bestEleven?: BestElevenEntry[];
}
interface PastSeasonStats {
  matchesPlayed: number; totalGoals: number; goalsPerMatch: number;
  biggestWin?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
  recordAttendance?: { value: number; homeTeam: string } | null;
  totalBeer?: number;
  wildestMatch?: { homeTeam: string; awayTeam: string; cards: number } | null;
  totalYellowCards: number; totalRedCards: number;
  longestWinStreak?: { teamName: string; length: number } | null;
}
interface HistoryEntry {
  id: string; leagueId: string; leagueName: string; seasonNumber: number;
  finalStandings: PastStanding[] | null; awards: AwardsSnapshot | null; seasonStats: PastSeasonStats | null;
}

// ═══ Main Page ═══

export default function LigaPageWrapper() {
  return <Suspense><LigaPage /></Suspense>;
}

interface LeagueOption { id: string; name: string; district: string; level?: string; team_count: number }

function LigaPage() {
  const ctx = useTeam();
  const teamId = ctx.teamId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "tabulka";
  const [tab, setTab] = useState<Tab>(initialTab);

  const [leagueName, setLeagueName] = useState("");
  const [seasonNum, setSeasonNum] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  // Postup a sestup, které liga opravdu má (III. třída a přebor bez postupu je nemají).
  const [movement, setMovement] = useState<LeagueMovement>(NO_MOVEMENT);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadedTabs, setLoadedTabs] = useState<Set<Tab>>(new Set());

  // League picker
  const [allLeagues, setAllLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const isOtherLeague = selectedLeagueId !== null;
  // Název vlastní ligy z prvního načtení: podle něj se pozná „moje“ soutěž mezi záložkami okresu.
  const [ownLeagueName, setOwnLeagueName] = useState<string | null>(null);

  // Season picker (archiv minulých sezón)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [seasonView, setSeasonView] = useState<number | "current">("current");
  useEffect(() => {
    apiFetch<{ history: HistoryEntry[] }>("/api/season-history")
      .then((d) => setHistory(d.history ?? []))
      .catch((e) => console.error("fetch season history:", e));
  }, []);

  // Load available leagues
  useEffect(() => {
    apiFetch<{ leagues: LeagueOption[] }>("/api/leagues")
      .then((data) => setAllLeagues(data.leagues))
      .catch((e) => console.error("fetch leagues:", e));
  }, []);

  // Load own league standings on mount
  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ leagueName: string; season?: number; standings: Standing[]; movement?: LeagueMovement }>(`/api/teams/${teamId}/standings`)
      .then((data) => {
        setLeagueName(data.leagueName);
        setOwnLeagueName(data.leagueName);
        setSeasonNum(data.season ?? null);
        setStandings(data.standings);
        setMovement(data.movement ?? NO_MOVEMENT);
        setLoadingStandings(false);
        setLoadedTabs((s) => new Set(s).add("tabulka"));
      })
      .catch(() => setLoadingStandings(false));
  }, [teamId]);

  // Load other league data when selected
  useEffect(() => {
    if (!selectedLeagueId) return;
    setLoadingStandings(true);
    setLoadedTabs(new Set());
    setRounds([]);
    setStatsData(null);
    apiFetch<{ leagueName: string; season?: number; standings: Standing[]; movement?: LeagueMovement }>(`/api/leagues/${selectedLeagueId}/standings`)
      .then((data) => {
        setLeagueName(data.leagueName);
        setSeasonNum(data.season ?? null);
        setStandings(data.standings);
        setMovement(data.movement ?? NO_MOVEMENT);
        setLoadingStandings(false);
        setLoadedTabs((s) => new Set(s).add("tabulka"));
      })
      .catch(() => setLoadingStandings(false));
  }, [selectedLeagueId]);

  // Rozpis a statistiky: vlastní liga, nebo vybraná cizí (`?leagueId=`).
  useEffect(() => {
    if (!teamId) return;
    const leagueQuery = selectedLeagueId ? `?leagueId=${encodeURIComponent(selectedLeagueId)}` : "";
    if ((tab === "rozpis" || tab === "vysledky") && !loadedTabs.has("rozpis")) {
      apiFetch<{ rounds: LeagueRound[] }>(`/api/teams/${teamId}/league-schedule${leagueQuery}`)
        .then((data) => {
          setRounds(data.rounds);
          setLoadedTabs((s) => { const n = new Set(s); n.add("rozpis"); n.add("vysledky"); return n; });
        }).catch((e) => console.error("fetch league-schedule:", e));
    }
    if (tab === "statistiky" && !loadedTabs.has("statistiky")) {
      apiFetch<StatsData>(`/api/teams/${teamId}/league-stats${leagueQuery}`)
        .then((data) => {
          setStatsData(data);
          setLoadedTabs((s) => new Set(s).add("statistiky"));
        }).catch((e) => console.error("fetch league-stats:", e));
    }
  }, [tab, teamId, loadedTabs, selectedLeagueId]);

  // Load zpravodaj for other league
  useEffect(() => {
    if (!isOtherLeague || !selectedLeagueId) return;
    if (tab === "zpravodaj" && !loadedTabs.has("zpravodaj")) {
      apiFetch<{ articles: NewsArticle[] }>(`/api/leagues/${selectedLeagueId}/news`)
        .then((data) => {
          setNewsArticles(data.articles);
          setLoadedTabs((s) => new Set(s).add("zpravodaj"));
        }).catch((e) => console.error("fetch league-news:", e));
    }
  }, [tab, selectedLeagueId, loadedTabs, isOtherLeague]);

  const changeTab = (t: Tab) => { setTab(t); router.replace(`/liga?tab=${t}`, { scroll: false }); };

  const handleLeagueChange = (leagueId: string) => {
    if (leagueId === "own") {
      setSelectedLeagueId(null);
      // Reload own data
      if (teamId) {
        setLoadingStandings(true);
        setLoadedTabs(new Set());
        apiFetch<{ leagueName: string; season?: number; standings: Standing[]; movement?: LeagueMovement }>(`/api/teams/${teamId}/standings`)
          .then((data) => {
            setLeagueName(data.leagueName);
            setSeasonNum(data.season ?? null);
            setStandings(data.standings);
            setMovement(data.movement ?? NO_MOVEMENT);
        setMovement(data.movement ?? NO_MOVEMENT);
            setLoadingStandings(false);
            setLoadedTabs((s) => new Set(s).add("tabulka"));
          })
          .catch(() => setLoadingStandings(false));
      }
    } else {
      setSelectedLeagueId(leagueId);
    }
    setSeasonView("current");
    setTab("tabulka");
  };

  if (loadingStandings) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const displayName = seasonNum ? `${leagueName}. Sezóna ${seasonNum}` : (leagueName || "Liga");

  // Minulé sezóny aktuálně zobrazené ligy (dle názvu) + vybraný archiv
  const pastSeasons = history.filter((h) => h.leagueName === leagueName).sort((a, b) => b.seasonNumber - a.seasonNumber);
  const pastEntry = typeof seasonView === "number" ? pastSeasons.find((h) => h.seasonNumber === seasonView) ?? null : null;

  return (
    <>
    <PageHeader compact name={displayName} detail={ctx.district ? `Okres ${ctx.district}` : undefined} badge={null}>{null}</PageHeader>
    <div className="page-container space-y-5">
      {!isOtherLeague && <PreseasonNotice />}

      {/* Soutěže mého okresu: přebor a III. třída jedním klepnutím. */}
      {(() => {
        const district = allLeagues.filter((l) => l.district === ctx.district);
        if (district.length < 2) return null;
        const ownId = district.find((l) => l.name === ownLeagueName)?.id ?? null;
        return (
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Soutěže okresu ${ctx.district}`}>
            {district.map((l) => {
              const active = selectedLeagueId ? selectedLeagueId === l.id : l.id === ownId;
              return (
                <button key={l.id} type="button" aria-pressed={active}
                  onClick={() => handleLeagueChange(l.id === ownId ? "own" : l.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-600 text-white" : "bg-white text-ink border border-gray-200 hover:bg-gray-50"}`}>
                  {l.name}{l.id === ownId ? " (moje)" : ""}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Přepínače — liga + sezóna na jednom řádku */}
      {/* Dva sloupce: na 375 px se popisek + select vedle sebe nevesly
          a každý filtr zabral celý řádek, tedy ~110 px než začal obsah. */}
      {(allLeagues.length > 1 || pastSeasons.length > 0) && (
      <div className="grid grid-cols-2 gap-3 items-end">
      {allLeagues.length > 1 && (
        <div className="min-w-0">
          <span className="block text-micro text-muted font-heading font-bold uppercase tracking-wide mb-1">Liga</span>
          <select
            value={selectedLeagueId ?? "own"}
            onChange={(e) => handleLeagueChange(e.target.value)}
            className="select w-full"
          >
            <option value="own">Moje liga</option>
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.team_count} týmů)</option>
            ))}
          </select>
        </div>
      )}

      {/* Season picker — listování minulých sezón této ligy */}
      {pastSeasons.length > 0 && (
        <div className="min-w-0">
          <span className="block text-micro text-muted font-heading font-bold uppercase tracking-wide mb-1">Sezóna</span>
          <select
            value={seasonView === "current" ? "current" : String(seasonView)}
            onChange={(e) => setSeasonView(e.target.value === "current" ? "current" : Number(e.target.value))}
            className="select w-full"
          >
            <option value="current">Aktuální</option>
            {pastSeasons.map((h) => (
              <option key={h.id} value={h.seasonNumber}>Sezóna {h.seasonNumber} (archiv)</option>
            ))}
          </select>
        </div>
      )}
      </div>
      )}

      {pastEntry ? (
        <PastSeasonView entry={pastEntry} myTeamId={teamId} />
      ) : (
      <>
      {/* Tabs — cizí liga: tabulka + zpravodaj, vlastní: plné menu */}
      <Tabs
        value={tab}
        onChange={changeTab}
        ariaLabel="Liga"
        items={(isOtherLeague
          ? (["tabulka", "rozpis", "vysledky", "statistiky", "zpravodaj"] as Tab[])
          : (["tabulka", "rozpis", "vysledky", "statistiky"] as Tab[])
        ).map((key) => ({
          key,
          label: { tabulka: "Tabulka", rozpis: "Rozpis", vysledky: "Výsledky", statistiky: "Statistiky", zpravodaj: "Zpravodaj" }[key],
        }))}
      />

      {/* Tab content */}
      {tab === "tabulka" && <StandingsTab standings={standings} teamId={teamId!} movement={movement} />}
      {tab === "rozpis" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("rozpis")} teamId={teamId!} showAll />}
      {tab === "vysledky" && <ScheduleTab rounds={rounds} loaded={loadedTabs.has("vysledky")} teamId={teamId!} showAll={false} />}
      {tab === "statistiky" && <LeagueStatsTab data={statsData} loaded={loadedTabs.has("statistiky")} />}
      {isOtherLeague && tab === "zpravodaj" && (
        !loadedTabs.has("zpravodaj") ? <div className="flex justify-center py-8"><Spinner /></div> : (
          <div className="space-y-3">
            {newsArticles.length === 0 && <p className="text-muted text-sm text-center py-8">Zatím žádné zprávy</p>}
            {newsArticles.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-bold text-base text-ink">{a.headline}</h3>
                    <ArticleBody article={a} />
                    <p className="text-xs text-muted/60 mt-2">{a.date ? formatDate(a.date) : ""}{a.gameWeek ? ` ${a.gameWeek}. kolo` : ""}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
      </>
      )}
    </div>
    </>
  );
}

// ═══ Minulá sezóna (archiv) ═══

function PastSeasonView({ entry, myTeamId }: { entry: HistoryEntry; myTeamId: string | null }) {
  const a = entry.awards;
  const s = entry.seasonStats;
  return (
    <div className="space-y-5">
      {/* Ocenění */}
      {a && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {a.champion?.name && <PastAward icon="🏆" label="Mistr"><PastTeamLink teamId={a.champion.teamId} name={a.champion.name} /></PastAward>}
          {a.playerOfSeason?.name && <PastAward icon="⭐" label="Hráč sezóny" reason={a.playerOfSeason.reason}><span className="font-heading font-bold">{a.playerOfSeason.name}</span></PastAward>}
          {a.topScorer?.name && <PastAward icon="👟" label="Král střelců"><span className="font-heading font-bold">{a.topScorer.name}</span><span className="text-muted text-sm"> · {a.topScorer.goals} gólů</span></PastAward>}
          {a.managerOfSeason?.name && <PastAward icon="🎩" label="Trenér sezóny" reason={a.managerOfSeason.reason}><span className="font-heading font-bold"><CoachName name={a.managerOfSeason.name} isAi={a.managerOfSeason.coachIsAi === true} /></span></PastAward>}
          {a.discovery?.name && <PastAward icon="🌱" label="Objev sezóny" reason={a.discovery.reason}><span className="font-heading font-bold">{a.discovery.name}</span></PastAward>}
        </div>
      )}

      {/* Konečná tabulka */}
      {entry.finalStandings && entry.finalStandings.length > 0 && (
        <ListCard title="Konečná tabulka">
          <DataTable
            rows={entry.finalStandings} rowKey={(r) => r.teamId}
            rowHref={(r) => `/tym/${r.teamId}`}
            rowTone={(r) => ({ own: r.teamId === myTeamId })}
            empty="Konečná tabulka téhle sezóny se nedochovala."
            columns={[
              { key: "pos", header: "#", width: "w-10", align: "center",
                cell: (r) => <span className={`font-bold ${r.pos === 1 ? "text-gold-700" : "text-muted"}`}>{r.pos}</span> },
              { key: "team", header: "Klub", align: "left",
                cell: (r) => <EntityCell name={r.teamName} bold={r.teamId === myTeamId}
                  meta={`${r.wins}-${r.draws}-${r.losses} · ${r.gf}:${r.ga}`} metaMobileOnly /> },
              { key: "played", header: "Z", title: "Zápasy", width: "w-10", cell: (r) => r.played },
              { key: "record", header: "V-R-P", width: "w-20", priority: 2, cell: (r) => `${r.wins}-${r.draws}-${r.losses}` },
              { key: "score", header: "Skóre", width: "w-16", priority: 2, cell: (r) => `${r.gf}:${r.ga}` },
              { key: "points", header: "Body", width: "w-14", emphasis: true, cell: (r) => r.points },
            ]} />
        </ListCard>
      )}

      {/* Nejlepší jedenáctka */}
      {a?.bestEleven && a.bestEleven.length > 0 && (
        <div>
          <SectionLabel>Nejlepší jedenáctka</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {a.bestEleven.map((p) => (
              <div key={p.playerId} className="bg-gray-50 rounded-soft px-3 py-1.5 text-sm">
                <span className="text-micro font-heading font-bold text-pitch-600 uppercase mr-1.5">{p.position}</span>
                <span className="font-heading font-bold">{p.name}</span>
                <span className="text-muted text-xs"> · {p.teamName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sezona v číslech */}
      {s && (
        <div>
          <SectionLabel>Sezona v číslech</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <PastStat label="Branek celkem" value={`${s.totalGoals}`} sub={`${s.goalsPerMatch} / zápas`} />
            {s.totalBeer != null && s.totalBeer > 0 && <PastStat label="🍺 Vypito piv" value={`${s.totalBeer.toLocaleString("cs")}`} sub="za sezónu" />}
            {s.recordAttendance && <PastStat label="👥 Nejvíc lidí" value={`${s.recordAttendance.value}`} sub={s.recordAttendance.homeTeam} />}
            {s.wildestMatch && <PastStat label="🟥 Nejdivočejší zápas" value={`${s.wildestMatch.cards} karet`} sub={`${s.wildestMatch.homeTeam} ${s.wildestMatch.awayTeam}`} />}
            {s.biggestWin && <PastStat label="Nejvyšší výhra" value={`${s.biggestWin.homeScore}:${s.biggestWin.awayScore}`} sub={`${s.biggestWin.homeTeam} ${s.biggestWin.awayTeam}`} />}
            <PastStat label="Zápasů" value={`${s.matchesPlayed}`} />
            {s.longestWinStreak && <PastStat label="Nejdelší série" value={`${s.longestWinStreak.length}×`} sub={s.longestWinStreak.teamName} />}
          </div>
        </div>
      )}
    </div>
  );
}

function PastTeamLink({ teamId, name, highlight }: { teamId?: string | null; name?: string | null; highlight?: boolean }) {
  if (!name) return <span>-</span>;
  if (!teamId) return <span className="font-heading font-bold">{name}</span>;
  return <Link href={`/tym/${teamId}`} className={`font-heading font-bold hover:text-pitch-500 transition-colors ${highlight ? "text-pitch-600" : ""}`}>{name}</Link>;
}

function PastAward({ icon, label, reason, children }: { icon: string; label: string; reason?: string | null; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-soft px-3 py-2">
      <div className="text-micro font-heading font-bold text-muted uppercase">{icon} {label}</div>
      <div className="text-base">{children}</div>
      {reason && <div className="text-xs text-muted mt-0.5 italic">„{reason}"</div>}
    </div>
  );
}

function PastStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-soft px-3 py-2">
      <div className="text-micro font-heading font-bold text-muted uppercase">{label}</div>
      <div className="font-heading font-bold tabular-nums whitespace-nowrap">{value}</div>
      {sub && <div className="text-xs text-muted truncate">{sub}</div>}
    </div>
  );
}

// ═══ Article body renderer ═══

function ArticleBody({ article }: { article: NewsArticle }) {
  if (article.type === "interview") {
    let meta: { article?: string } = {};
    try { meta = JSON.parse(article.body); } catch (e) { console.error("parse interview body:", e); }
    const text = meta.article ?? article.body;
    return (
      <div className="text-sm text-muted mt-1 space-y-1">
        {text.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
      </div>
    );
  }
  if (article.type === "round_results") {
    const re = /(.+?)\s+(?:porazil|remizoval\s+s|zvítězil\s+nad)\s+(.+?)\s+(\d+:\d+)/g;
    const structured = Array.from(article.body.matchAll(re)).map((m) => ({
      home: m[1].replace(/^\.\s*/, "").trim(), away: m[2].trim(), score: m[3],
    }));
    if (structured.length === 0) return <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{article.body}</p>;
    return (
      <div className="mt-1 space-y-1">
        {structured.map((r, i) => {
          const [h, a] = r.score.split(":").map(Number);
          const isDraw = h === a;
          const homeWin = h > a;
          return (
            <div key={i} className="flex items-center text-sm py-1 border-b border-gray-50 last:border-b-0">
              <span className={`flex-1 text-right truncate pr-2 ${homeWin ? "font-heading font-bold" : ""}`}>{r.home}</span>
              <span className={`font-heading font-bold text-xs tabular-nums px-2 py-0.5 rounded min-w-[40px] text-center ${
                isDraw ? "bg-gray-100 text-muted" : "bg-gray-50 text-ink"
              }`}>{r.score}</span>
              <span className={`flex-1 truncate pl-2 ${!homeWin && !isDraw ? "font-heading font-bold" : ""}`}>{r.away}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{article.body}</p>;
}

// ═══ Tabulka ═══

function StandingsTab({ standings, teamId, movement }: { standings: Standing[]; teamId: string; movement: LeagueMovement }) {
  const totalTeams = standings.length;
  const columns: DataColumn<Standing>[] = [
    { key: "pos", header: "#", width: "w-10", align: "center", sortValue: (r) => r.pos, firstDir: "asc",
      cell: (r) => <span className={`font-bold ${r.pos === 1 ? "text-gold-700" : "text-muted"}`}>{r.pos}</span> },
    { key: "team", header: "Klub", align: "left", sortValue: (r) => r.team,
      cell: (r) => (
        <EntityCell
          leading={<BadgePreview primary={r.primaryColor || "#2D5F2D"} secondary={r.secondaryColor || "#FFF"}
            pattern={(r.badgePattern as BadgePattern) || "shield"} initials={ini(r.team)} size={24} />}
          name={<TeamName name={r.team} isAi={r.isAi === true} wrap />} bold={r.isPlayer}
          meta={`${r.wins}-${r.draws}-${r.losses} · ${r.gf}:${r.ga}`} metaMobileOnly />
      ) },
    { key: "played", header: "Z", title: "Zápasy", width: "w-10", sortValue: (r) => r.played, cell: (r) => r.played },
    { key: "wins", header: "V", title: "Výhry", width: "w-10", priority: 2, sortValue: (r) => r.wins, cell: (r) => r.wins },
    { key: "draws", header: "R", title: "Remízy", width: "w-10", priority: 2, sortValue: (r) => r.draws, cell: (r) => r.draws },
    { key: "losses", header: "P", title: "Prohry", width: "w-10", priority: 2, sortValue: (r) => r.losses, cell: (r) => r.losses },
    { key: "gd", header: "Skóre", width: "w-16", priority: 2, sortValue: (r) => r.gf - r.ga, cell: (r) => `${r.gf}:${r.ga}` },
    { key: "form", header: "Forma", width: "w-32", priority: 3,
      cell: (r) => (
        <span className="inline-flex gap-1">
          {(r.form ?? []).slice(0, 5).map((f, i) => <ResultChip key={i} result={f as MatchOutcome} />)}
        </span>
      ) },
    { key: "points", header: "Body", width: "w-14", emphasis: true, sortValue: (r) => r.points, cell: (r) => r.points },
  ];

  return (
    <ListCard>
      <DataTable columns={columns} rows={standings} rowKey={(r) => r.teamId ?? String(r.pos)}
        rowHref={(r) => (r.teamId ? `/tym/${r.teamId}` : undefined)}
        rowTone={(r) => ({
          own: r.isPlayer,
          bar: movement.promotion && r.pos <= 2 ? "up" : movement.relegation && r.pos >= totalTeams - 1 ? "down" : undefined,
        })}
        empty="Tabulka se naplní po prvním odehraném kole." emptyIcon="🏆" />
      {/* Legenda jen pro postup a sestup, které liga opravdu má */}
      {standings.length > 0 && (movement.promotion || movement.relegation) && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-line text-meta text-muted">
          {movement.promotion && <span className="flex items-center gap-1.5"><span className="w-[3px] h-3 bg-pitch-500" /> Postup</span>}
          {movement.relegation && <span className="flex items-center gap-1.5"><span className="w-[3px] h-3 bg-card-red" /> Sestup</span>}
        </div>
      )}
    </ListCard>
  );
}

// ═══ Rozpis / Výsledky ═══

function ScheduleTab({ rounds, loaded, teamId, showAll }: { rounds: LeagueRound[]; loaded: boolean; teamId: string; showAll: boolean }) {
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  const displayRounds = showAll
    ? rounds
    : rounds.filter((r) => r.matches.some((m) => m.status === "simulated")).reverse();

  if (displayRounds.length === 0) {
    return <div className="card p-8 text-center text-muted">{showAll ? "Rozpis není dostupný" : "Žádné odehrané zápasy"}</div>;
  }

  return (
    <div className="space-y-4">
      {displayRounds.map((round) => (
        <div key={round.round} className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="font-heading font-bold text-sm">{round.round}. kolo</span>
            {round.scheduledAt && <span className="text-xs text-muted">{formatDate(round.scheduledAt)}</span>}
          </div>
          <div>
            {round.matches.map((m, i) => {
              const isPlayed = m.status === "simulated";
              const isMyMatch = m.homeTeamId === teamId || m.awayTeamId === teamId;
              const rowCls = `px-4 py-3 ${i < round.matches.length - 1 ? "border-b border-gray-50" : ""} ${isMyMatch ? "bg-pitch-50/40" : ""} ${isPlayed ? "hover:bg-gray-50 transition-colors cursor-pointer" : ""}`;
              const content = (
                <div className={rowCls}>
                  {/* Mobil — každý tým na svém řádku, aby se vešel celý název */}
                  <div className="sm:hidden flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 h-7 min-w-0">
                        <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern} initials={ini(m.homeName)} size={22} />
                        <span className={`text-base font-heading truncate ${m.homeTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.homeName}</span>
                      </div>
                      <div className="flex items-center gap-2 h-7 min-w-0">
                        <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern} initials={ini(m.awayName)} size={22} />
                        <span className={`text-base font-heading truncate ${m.awayTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.awayName}</span>
                      </div>
                    </div>
                    {isPlayed ? (
                      <div className="shrink-0 space-y-1 text-right font-heading font-[800] text-lg tabular-nums">
                        <div className="h-7 flex items-center justify-end">{m.homeScore}</div>
                        <div className="h-7 flex items-center justify-end">{m.awayScore}</div>
                      </div>
                    ) : (
                      <span className="shrink-0 text-sm text-muted font-heading">vs</span>
                    )}
                  </div>

                  {/* Desktop — klasicky proti sobě */}
                  <div className="hidden sm:flex items-center">
                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <span className={`text-sm font-heading truncate ${m.homeTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.homeName}</span>
                      <BadgePreview primary={m.homeColor} secondary={m.homeSecondary} pattern={m.homeBadge as BadgePattern} initials={ini(m.homeName)} size={22} />
                    </div>
                    <div className="shrink-0 w-20 text-center">
                      {isPlayed ? (
                        <span className="font-heading font-[800] text-lg tabular-nums">{m.homeScore} : {m.awayScore}</span>
                      ) : (
                        <span className="text-xs text-muted font-heading">vs</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <BadgePreview primary={m.awayColor} secondary={m.awaySecondary} pattern={m.awayBadge as BadgePattern} initials={ini(m.awayName)} size={22} />
                      <span className={`text-sm font-heading truncate ${m.awayTeamId === teamId ? "font-bold text-pitch-600" : ""}`}>{m.awayName}</span>
                    </div>
                  </div>
                </div>
              );
              if (isPlayed) return <Link key={m.id} href={`/zapas/${m.id}`}>{content}</Link>;
              return <div key={m.id}>{content}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══ Statistiky ═══
