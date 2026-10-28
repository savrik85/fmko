"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, BadgePreview, PositionBadge, PageHeader, Tabs } from "@/components/ui";
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

const FORM_COLORS: Record<string, string> = { W: "bg-pitch-400", D: "bg-gold-500", L: "bg-card-red" };

interface LeagueMovement { promotion: boolean; relegation: boolean }
const NO_MOVEMENT: LeagueMovement = { promotion: false, relegation: false };
const FORM_LABELS: Record<string, string> = { W: "V", D: "R", L: "P" };

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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
        <div className="card overflow-x-auto table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-muted">
                <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-center w-8">#</th>
                <th className="py-2.5 px-3 text-xs font-heading uppercase text-left">Tým</th>
                <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-center w-8 hidden sm:table-cell">Z</th>
                <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-center">V-R-P</th>
                <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-center w-14">Skóre</th>
                <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-center w-10">B</th>
              </tr>
            </thead>
            <tbody>
              {entry.finalStandings.map((r, idx) => (
                <tr key={r.teamId} className={`border-b border-gray-50 ${r.teamId === myTeamId ? "bg-pitch-50/60" : idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="py-3 px-1.5 text-center"><span className={`font-heading font-[800] text-base tabular-nums ${r.pos === 1 ? "text-gold-500" : r.pos <= 3 ? "text-pitch-500" : "text-muted"}`}>{r.pos}</span></td>
                  <td className="py-3 px-3"><PastTeamLink teamId={r.teamId} name={r.teamName} highlight={r.teamId === myTeamId} /></td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-muted hidden sm:table-cell">{r.played}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums text-muted">{r.wins}-{r.draws}-{r.losses}</td>
                  <td className="py-3 px-1.5 text-center tabular-nums">{r.gf}:{r.ga}</td>
                  <td className="py-3 px-1.5 text-center"><span className="font-heading font-[800] text-lg tabular-nums">{r.points}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  if (!name) return <span>—</span>;
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

type SortKey = "pos" | "team" | "played" | "wins" | "draws" | "losses" | "gd" | "points";
type SortDir = "asc" | "desc";

function StandingsTab({ standings, teamId, movement }: { standings: Standing[]; teamId: string; movement: LeagueMovement }) {
  const [sortKey, setSortKey] = useState<SortKey>("pos");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  if (standings.length === 0) return <div className="card p-8 text-center text-muted">Zatím žádné výsledky.</div>;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "team" ? "asc" : "desc"); }
  };

  const sorted = [...standings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "pos": cmp = a.pos - b.pos; break;
      case "team": cmp = a.team.localeCompare(b.team, "cs"); break;
      case "played": cmp = a.played - b.played; break;
      case "wins": cmp = a.wins - b.wins; break;
      case "draws": cmp = a.draws - b.draws; break;
      case "losses": cmp = a.losses - b.losses; break;
      case "gd": cmp = (a.gf - a.ga) - (b.gf - b.ga); break;
      case "points": cmp = a.points - b.points; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalTeams = standings.length;
  const cols: Array<{ key: SortKey; label: string; w: string }> = [
    { key: "pos", label: "#", w: "w-8" },
    { key: "team", label: "Tým", w: "flex-1" },
    { key: "played", label: "Z", w: "w-8" },
    { key: "wins", label: "V", w: "w-8" },
    { key: "draws", label: "R", w: "w-8" },
    { key: "losses", label: "P", w: "w-8" },
    { key: "gd", label: "Skóre", w: "w-14" },
    { key: "points", label: "B", w: "w-10" },
  ];

  return (
    <div className="card overflow-x-auto table-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            {cols.map((col) => {
              const hideMobile = ["played", "wins", "draws", "losses"].includes(col.key);
              return (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  colSpan={col.key === "team" ? 2 : undefined}
                  className={`py-2.5 px-1.5 text-xs font-heading uppercase cursor-pointer select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                    col.key === "team" ? "text-left pl-3" : "text-center"
                  } ${sortKey === col.key ? "text-pitch-600" : "text-muted"} ${hideMobile ? "hidden sm:table-cell" : ""}`}>
                  {col.label}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              );
            })}
            <th className="py-2.5 px-1.5 text-xs font-heading uppercase text-muted text-center w-28 hidden sm:table-cell">Forma</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const isPromo = movement.promotion && row.pos <= 2;
            const isRel = movement.relegation && row.pos >= totalTeams - 1;
            return (
              <tr key={row.teamId ?? row.pos}
                className={`border-b border-gray-50 transition-colors ${
                  row.isPlayer ? "bg-pitch-50/60" : idx % 2 === 1 ? "bg-gray-50/30" : "hover:bg-gray-50/50"
                }`}>
                {/* Position */}
                <td className="py-3 px-1.5 text-center">
                  <span className={`font-heading font-[800] text-base tabular-nums ${
                    row.pos === 1 ? "text-gold-500" : isPromo ? "text-pitch-500" : isRel ? "text-card-red" : "text-muted"
                  }`}>
                    {row.pos}
                  </span>
                </td>
                {/* Badge */}
                <td className="py-3 pl-2 pr-0 w-8" style={{ verticalAlign: "middle" }}>
                  <BadgePreview primary={row.primaryColor || "#2D5F2D"} secondary={row.secondaryColor || "#FFF"}
                    pattern={(row.badgePattern as BadgePattern) || "shield"} initials={ini(row.team)} size={24} />
                </td>
                {/* Team */}
                <td className="py-3 px-1.5" style={{ verticalAlign: "middle" }}>
                  {/* AI klub je odkaz jako každý jiný klub, rozdíl je jen štítek u trenéra. */}
                  {row.teamId ? (
                    <Link href={`/tym/${row.teamId}`} className={`font-heading font-bold hover:text-pitch-500 transition-colors ${row.isPlayer ? "text-pitch-600" : ""}`}>
                      <TeamName name={row.team} isAi={row.isAi === true} />
                    </Link>
                  ) : (
                    <span className="font-heading font-bold"><TeamName name={row.team} isAi={row.isAi === true} /></span>
                  )}
                </td>
                {/* Stats — hidden on mobile */}
                <td className="py-3 px-1.5 text-center tabular-nums text-muted hidden sm:table-cell">{row.played}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.wins}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.draws}</td>
                <td className="py-3 px-1.5 text-center tabular-nums font-medium hidden sm:table-cell">{row.losses}</td>
                <td className="py-3 px-1.5 text-center tabular-nums">{row.gf}:{row.ga}</td>
                {/* Points */}
                <td className="py-3 px-1.5 text-center">
                  <span className="font-heading font-[800] text-xl tabular-nums">{row.points}</span>
                </td>
                {/* Form — hidden on mobile */}
                <td className="py-3 px-1.5 hidden sm:table-cell">
                  <div className="flex gap-1 justify-center">
                    {(row.form ?? []).slice(0, 5).map((f, i) => (
                      <div key={i} className={`w-5 h-5 rounded ${FORM_COLORS[f] ?? "bg-gray-200"} flex items-center justify-center text-white text-micro font-bold`}>
                        {FORM_LABELS[f] ?? f}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Legenda jen pro postup a sestup, které liga opravdu má */}
      {(movement.promotion || movement.relegation) && (
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-muted">
          {movement.promotion && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pitch-500" /> Postup</span>}
          {movement.relegation && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-card-red" /> Sestup</span>}
        </div>
      )}
    </div>
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
