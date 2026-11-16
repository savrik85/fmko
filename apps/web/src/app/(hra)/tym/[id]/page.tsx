"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, showError, type Team, type Player, type TeamMatchResults, type ManagerProfile } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { Spinner, SectionLabel, BadgePreview, PositionBadge, JerseyPreview, ListCard, ListRow, ListEmpty, ShowMore, ScoreChip, RatingPill, DataTable, EntityCell, ratingToneIn, type DataColumn, type MatchOutcome } from "@/components/ui";
import { attrBg } from "@/lib/player-attrs";
import type { BadgePattern } from "@/components/ui";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { FaceAvatar } from "@/components/players/face-avatar";
import { PreMatchCard } from "@/components/relations/RelationSection";
import { ForeignSquad } from "./ForeignSquad";
import { TransferOverview } from "./TransferOverview";
import { readableOnLight, bestTextOn } from "@/lib/team-color";
import { HERO_BUTTON, HeroActions, HeroNavButton, HeroStat, HeroStats, heroTone } from "@/components/ui/hero-kit";
import { CoachName } from "@/components/manager/coach-name";
import { TeamName } from "@/components/manager/team-name";

const POS_LABELS: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
type PosFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

type SkillKey = "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping";

function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

function getMoraleEmoji(morale: number): string {
  if (morale >= 80) return "\u{1F60A}";
  if (morale >= 60) return "\u{1F642}";
  if (morale >= 40) return "\u{1F610}";
  if (morale >= 20) return "\u{1F61E}";
  return "\u{1F621}";
}

/** „Stejný majitel jako …" — propojení klubů zapisuje admin a je veřejné. */
function SameOwnerNote({ clubs }: { clubs?: Array<{ id: string; name: string }> }) {
  if (!clubs || clubs.length === 0) return null;
  return (
    <div className="card px-4 py-3 text-sm text-muted">
      🔗 Stejný majitel jako{" "}
      {clubs.map((club, i) => (
        <span key={club.id}>
          {i > 0 && (i === clubs.length - 1 ? " a " : ", ")}
          <a href={`/tym/${club.id}`} className="font-heading font-bold text-base text-ink hover:underline">{club.name}</a>
        </span>
      ))}
    </div>
  );
}

export default function TeamPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId: myTeamId } = useTeam();
  const teamId = params.id as string;
  const isOwnTeam = teamId === myTeamId;
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [manager, setManager] = useState<ManagerProfile | null>(null);
  const [leagueTeams, setLeagueTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [leagueName, setLeagueName] = useState("");
  const [leaguePos, setLeaguePos] = useState<number | null>(null);
  const [matchResults, setMatchResults] = useState<TeamMatchResults | null>(null);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [loading, setLoading] = useState(true);
  const [shownResults, setShownResults] = useState(10);

  useEffect(() => {
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<Array<{ id: string; name: string }>>(`/api/teams/${teamId}/league-teams`).catch((e) => { console.error("load league teams:", e); return []; }),
      apiFetch<{ leagueName: string; standings: Array<{ teamId: string | null; pos: number }> }>(`/api/teams/${teamId}/standings`).catch((e) => { console.error("load standings:", e); return null; }),
      apiFetch<TeamMatchResults>(`/api/teams/${teamId}/match-results`).catch((e) => { console.error("load match results:", e); return null; }),
      apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`).catch((e) => { console.error("load manager:", e); return null; }),
    ]).then(([t, p, lt, standings, results, mgr]) => {
      setTeam(t);
      setPlayers(p);
      setLeagueTeams(lt);
      setMatchResults(results);
      setManager(mgr);
      if (standings) {
        setLeagueName(standings.leagueName);
        const myPos = standings.standings.find((s) => s.teamId === teamId);
        if (myPos) setLeaguePos(myPos.pos);
      }
      setLoading(false);
    });
  }, [teamId]);

  const teamIndex = leagueTeams.findIndex((t) => t.id === teamId);
  const prevTeam = leagueTeams.length > 1 ? leagueTeams[(teamIndex - 1 + leagueTeams.length) % leagueTeams.length] : null;
  const nextTeam = leagueTeams.length > 1 ? leagueTeams[(teamIndex + 1) % leagueTeams.length] : null;

  const squadRows = useMemo(() => {
    const rows = filter === "all" ? players : players.filter((p) => p.position === filter);
    return [...rows].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.overall_rating - a.overall_rating);
  }, [players, filter]);
  const squadRatings = useMemo(() => players.map((p) => p.overall_rating), [players]);

  // Team records from match results
  const records = useMemo(() => {
    if (!matchResults?.matches.length) return null;
    let biggestWin = { diff: 0, match: matchResults.matches[0] };
    let biggestLoss = { diff: 0, match: matchResults.matches[0] };
    for (const m of matchResults.matches) {
      const myGoals = m.isHome ? m.homeScore : m.awayScore;
      const oppGoals = m.isHome ? m.awayScore : m.homeScore;
      const diff = (myGoals as number) - (oppGoals as number);
      if (diff > biggestWin.diff) biggestWin = { diff, match: m };
      if (diff < biggestLoss.diff) biggestLoss = { diff, match: m };
    }
    return { biggestWin: biggestWin.diff > 0 ? biggestWin.match : null, biggestLoss: biggestLoss.diff < 0 ? biggestLoss.match : null };
  }, [matchResults]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const tone = heroTone(color);
  // Pozice v lize stojí na plné destičce; na ní se píše barvou klubu.
  const plateText = tone.light ? "#FFFFFF" : readableOnLight(color);
  const statNumber = "font-heading font-extrabold text-xl sm:text-3xl tabular-nums leading-none";
  const badgePrimary = team.badge_primary_color || color;
  const badgeSecondary = team.badge_secondary_color || team.secondary_color || "#FFFFFF";
  const badgePattern = (team.badge_pattern as BadgePattern) || "shield";
  const badgeInitials = team.badge_initials || team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  const form = matchResults?.form ?? [];

  const openCoachConversation = async () => {
    if (!myTeamId) return;
    try {
      const res = await apiFetch<{ conversationId: string }>(`/api/teams/${myTeamId}/conversation-with/${teamId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (res?.conversationId) router.push(`/telefon/${res.conversationId}`);
    } catch (e) {
      console.error("create conversation:", e);
      showError("Nepodařilo se otevřít konverzaci", (e as Error)?.message || "Zkus to prosím znovu.");
    }
  };

  const ratingColor = readableOnLight(color);
  // Bílé a velmi světlé dresy splynou s bílou kartou — okraj drží tvar prvku viditelný.
  const onColorText = bestTextOn(color) === "light"
    ? "text-white border border-transparent"
    : "text-gray-900 border border-gray-300";
  const avgRating = players.length > 0 ? Math.round(players.reduce((s, p) => s + p.overall_rating, 0) / players.length) : 0;

  const playerFace = (p: Player, size: number) =>
    p.avatar && typeof p.avatar === "object" && Object.keys(p.avatar).length > 2 ? (
      <FaceAvatar faceConfig={p.avatar} size={size} className="shrink-0" />
    ) : (
      <span className={`rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${onColorText}`}
        style={{ backgroundColor: color, width: size, height: size }}>
        {p.first_name[0]}
      </span>
    );
  const skillColumn = (key: SkillKey, header: string, title: string): DataColumn<Player> => ({
    key, header, title, width: "w-11", sortValue: (p) => p.skills?.[key] ?? 0,
    cell: (p) => <span className={`inline-flex w-[30px] h-6 rounded-tight items-center justify-center text-meta font-bold ${attrBg(p.skills?.[key] ?? 0)}`}>{p.skills?.[key] ?? 0}</span>,
  });
  const squadColumns: DataColumn<Player>[] = [
    { key: "name", header: "Hráč", align: "left", sortValue: (p) => p.last_name,
      cell: (p) => (
        <EntityCell leading={<><PositionBadge position={p.position} /><span className="ml-2 flex">{playerFace(p, 28)}</span></>}
          name={`${p.first_name} ${p.last_name}`} meta={p.nickname ? `„${p.nickname}“` : undefined} />
      ) },
    { key: "age", header: "Věk", width: "w-12", sortValue: (p) => p.age, cell: (p) => p.age },
    { key: "rating", header: "Hod.", title: "Hodnocení", width: "w-14", sortValue: (p) => p.overall_rating,
      cell: (p) => <RatingPill value={p.overall_rating} tone={ratingToneIn(p.overall_rating, squadRatings)} /> },
    skillColumn("speed", "Rch", "Rychlost"),
    skillColumn("technique", "Tch", "Technika"),
    skillColumn("shooting", "Stř", "Střelba"),
    skillColumn("passing", "Při", "Přihrávky"),
    skillColumn("heading", "Hlv", "Hlavičky"),
    skillColumn("defense", "Obr", "Obrana"),
    skillColumn("goalkeeping", "Brn", "Brankář"),
    { key: "condition", header: "Kon", title: "Kondice", width: "w-16", sortValue: (p) => p.lifeContext?.condition ?? 0,
      cell: (p) => <span className={`whitespace-nowrap ${conditionLabel(p.lifeContext?.condition ?? 50).color}`}>{p.lifeContext?.condition ?? 0} %</span> },
    { key: "morale", header: "Mor", title: "Morálka", width: "w-12", sortValue: (p) => p.lifeContext?.morale ?? 0,
      cell: (p) => getMoraleEmoji(p.lifeContext?.morale ?? 50) },
  ];

  return (
    <>
      {/* ═══ Team header ═══ */}
      <div className="hero-gradient hero-detail px-3 sm:px-8 py-3 sm:py-5" style={{ backgroundColor: color }}>
        <HeroBackdrop primary={color} secondary={team.secondary_color} pattern={team.badge_pattern ?? null} />
        <div className="max-w-[1280px] mx-auto">
          {/* Jedno rozložení pro mobil i desktop: ukazatele se na mobilu zalomí pod název. */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            {leagueTeams.length > 1 && (
              <HeroNavButton tone={tone} direction="prev" label="Předchozí tým" className="hidden sm:flex"
                onClick={() => prevTeam && router.push(`/tym/${prevTeam.id}`)} />
            )}
            <div className="shrink-0 sm:hidden">
              <BadgePreview primary={badgePrimary} secondary={badgeSecondary} pattern={badgePattern} initials={badgeInitials} symbol={team.badge_symbol} size={40} />
            </div>
            <div className="shrink-0 hidden sm:block">
              <BadgePreview primary={badgePrimary} secondary={badgeSecondary} pattern={badgePattern} initials={badgeInitials} symbol={team.badge_symbol} size={76} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${tone.text} text-lg sm:text-3xl leading-tight`}>
                <TeamName name={team.name} isAi={manager?.coachIsAi === true} />
              </h1>
              <div className={`${tone.muted} text-[13px] sm:text-sm sm:mt-0.5`}>
                <Link href={`/obec/${team.village_id}`} className="underline decoration-current/30 hover:decoration-current">{team.village_name}</Link>
                {" "}&middot; {team.district}
                {leagueName && (
                  <>
                    {" "}&middot;{" "}
                    <Link href="/liga" className="underline decoration-current/30 hover:decoration-current">{leagueName}</Link>
                  </>
                )}
              </div>
            </div>
            {leagueTeams.length > 1 && (
              <div className="flex sm:hidden gap-1.5 shrink-0">
                <HeroNavButton tone={tone} direction="prev" label="Předchozí tým" className="flex"
                  onClick={() => prevTeam && router.push(`/tym/${prevTeam.id}`)} />
                <HeroNavButton tone={tone} direction="next" label="Další tým" className="flex"
                  onClick={() => nextTeam && router.push(`/tym/${nextTeam.id}`)} />
              </div>
            )}

            <HeroStats tone={tone}>
              {leaguePos && (
                <HeroStat tone={tone} label="V lize" href="/liga" title="Tabulka ligy">
                  <span className={`min-w-[38px] sm:min-w-[54px] h-7 sm:h-11 px-1.5 sm:px-2 rounded-control flex items-center justify-center font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none ${tone.plate}`}
                    style={{ color: plateText }}>
                    {leaguePos}.
                  </span>
                </HeroStat>
              )}
              <HeroStat tone={tone} label="Hráčů">
                <span className={statNumber}>{players.length}</span>
              </HeroStat>
              {isOwnTeam && (
                <HeroStat tone={tone} label="Hodnocení">
                  <span className={statNumber}>{avgRating}</span>
                </HeroStat>
              )}
              {form.length > 0 && (
                <HeroStat tone={tone} label="Forma" wide title="Posledních pět zápasů, nejnovější vlevo">
                  <span className="flex gap-0.5 sm:gap-1">
                    {form.map((f, i) => (
                      <span key={i} className={`w-[18px] h-[18px] sm:w-6 sm:h-6 rounded flex items-center justify-center text-[10px] sm:text-xs font-heading font-bold text-white ring-1 ${tone.light ? "ring-black/10" : "ring-white/40"} ${
                        f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-500"
                      }`}>{f === "W" ? "V" : f === "L" ? "P" : "R"}</span>
                    ))}
                  </span>
                </HeroStat>
              )}
            </HeroStats>

            {leagueTeams.length > 1 && (
              <HeroNavButton tone={tone} direction="next" label="Další tým" className="hidden sm:flex"
                onClick={() => nextTeam && router.push(`/tym/${nextTeam.id}`)} />
            )}
          </div>

          <HeroActions tone={tone}>
            <a href={`/klub/${teamId}`} target="_blank" rel="noopener noreferrer"
              className={`${HERO_BUTTON} flex-1 sm:flex-initial ${tone.button}`}>
              {"\u{1F310}"} <span className="sm:hidden">Web</span><span className="hidden sm:inline">Klubový web</span>
            </a>
            <Link href={`/tym/${teamId}/stadion`} className={`${HERO_BUTTON} flex-1 sm:flex-initial ${tone.button}`}>
              🏟️ Stadion
            </Link>
            {!isOwnTeam && (team as any).user_id !== "ai" && (
              <button onClick={openCoachConversation} className={`${HERO_BUTTON} flex-1 sm:flex-initial ${tone.button}`}>
                💬 <span className="sm:hidden">Napsat</span><span className="hidden sm:inline">Napsat trenérovi</span>
              </button>
            )}
          </HeroActions>
        </div>
      </div>

    <div className="page-container space-y-5">
      <SameOwnerNote clubs={team.sameOwnerClubs} />

      {/* ═══ Kádr cizího týmu — hned nahoře, kvůli přestupům i přípravě na zápas ═══ */}
      {!isOwnTeam && (
        <ForeignSquad players={players} color={color} onColorText={onColorText} ratingColor={ratingColor} />
      )}

      {/* ═══ Top row: Info + Manager + Form ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Info */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-2">
            <SectionLabel>Informace o týmu</SectionLabel>
            <JerseyPreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={team.jersey_pattern as string} size={60} />
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            <InfoRow label="Vesnice" value={<Link href={`/obec/${team.village_id}`} className="underline decoration-pitch-500/30 hover:text-pitch-600">{team.village_name}</Link>} />
            <InfoRow label="Okres" value={team.district} />
            <InfoRow label="Region" value={team.region} />
            <InfoRow label="Populace" value={team.population.toLocaleString("cs")} />
            <InfoRow label="Reputace" value={`${team.reputation}`} />
            {isOwnTeam && <InfoRow label="Rozpočet" value={`${team.budget.toLocaleString("cs")} Kč`} />}
          </div>
          {(team as any).stadium && (
            <>
              <div className="h-px bg-gray-100 my-3" />
              <button
                onClick={() => router.push(`/tym/${teamId}/stadion`)}
                className="flex items-center gap-2 mb-2 hover:text-pitch-500 transition-colors group"
              >
                <span className="text-lg">🏟️</span>
                <span className="font-heading font-bold text-sm group-hover:underline">
                  {(team as any).stadium.name || "Obecní hřiště"}
                </span>
                <span className="text-pitch-500 text-xs ml-1">→ navštívit</span>
              </button>
              <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                <InfoRow label="Kapacita" value={`${(team as any).stadium.capacity} diváků`} />
                <InfoRow label="Trávník" value={`${(team as any).stadium.pitchCondition}%`} />
              </div>
            </>
          )}
        </div>

        {/* Manager */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Trenér</SectionLabel>
          {manager ? (
            <a href={`/manazer/${teamId}`} className="flex items-center gap-4 group">
              <div className="shrink-0">
                {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
                  <FaceAvatar faceConfig={manager.avatar} size={56} className="rounded-xl" />
                ) : (
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-heading font-bold text-xl ${onColorText}`} style={{ backgroundColor: color }}>
                    {manager.name[0]}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-lg truncate group-hover:underline"><CoachName name={manager.name} isAi={manager.coachIsAi === true} /></div>
                {manager.birthplace && <div className="text-sm text-muted">{manager.birthplace}</div>}
                {manager.age && <div className="text-sm text-muted">{manager.age} let</div>}
                <div className="flex gap-3 mt-2 text-xs">
                  <AttrPill label="Kou" value={manager.coaching ?? 40} />
                  <AttrPill label="Mot" value={manager.motivation ?? 40} />
                  <AttrPill label="Tak" value={manager.tactics ?? 40} />
                  <AttrPill label="Dis" value={manager.discipline ?? 40} />
                </div>
              </div>
            </a>
          ) : (
            <div className="text-muted text-sm">Bez trenéra</div>
          )}
        </div>

        {/* Form + Records */}
        <div className="card p-4 sm:p-5">
          <SectionLabel>Sezónní bilance</SectionLabel>
          {matchResults && matchResults.matches.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-soft py-2">
                  <div className="font-heading font-bold text-lg tabular-nums text-pitch-500">{matchResults.summary.wins}</div>
                  <div className="text-micro text-muted uppercase">Výhry</div>
                </div>
                <div className="bg-gray-50 rounded-soft py-2">
                  <div className="font-heading font-bold text-lg tabular-nums">{matchResults.summary.draws}</div>
                  <div className="text-micro text-muted uppercase">Remízy</div>
                </div>
                <div className="bg-gray-50 rounded-soft py-2">
                  <div className="font-heading font-bold text-lg tabular-nums text-card-red">{matchResults.summary.losses}</div>
                  <div className="text-micro text-muted uppercase">Prohry</div>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted border-t border-gray-100 pt-2">
                <span>Skóre: <span className="font-heading font-bold text-ink">{matchResults.summary.goalsFor}:{matchResults.summary.goalsAgainst}</span></span>
                <span>Zápasů: <span className="font-heading font-bold text-ink">{matchResults.summary.played}</span></span>
              </div>
              {records && (
                <div className="text-xs text-muted space-y-1 border-t border-gray-100 pt-2">
                  {records.biggestWin && (
                    <div>Nejvyšší výhra: <span className="font-heading font-bold text-pitch-600">{records.biggestWin.homeScore}:{records.biggestWin.awayScore}</span> vs {records.biggestWin.opponent}</div>
                  )}
                  {records.biggestLoss && (
                    <div>Nejvyšší prohra: <span className="font-heading font-bold text-card-red">{records.biggestLoss.homeScore}:{records.biggestLoss.awayScore}</span> vs {records.biggestLoss.opponent}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted text-sm">Zatím bez zápasů</div>
          )}
        </div>
      </div>

      {/* ═══ Před zápasem — špičkování a sázky (jen cizí tým s nadcházejícím vzájemným zápasem) ═══ */}
      {myTeamId && !isOwnTeam && (
        <PreMatchCard myTeamId={myTeamId} otherTeamId={teamId} otherTeamName={team.name} />
      )}

      {/* ═══ Results + Top players ═══ */}
      {matchResults && matchResults.matches.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
          {/* Results */}
          <ListCard title="Výsledky" count={`${matchResults.matches.length} zápasů`}>
            {matchResults.matches.slice(0, shownResults).map((m) => (
              <ListRow key={m.id} href={`/zapas/${m.id}/zaznam`}
                leading={<BadgePreview primary={m.opponentColor} secondary={m.opponentSecondary}
                  pattern={(m.opponentBadge as BadgePattern) || "shield"}
                  initials={(m.opponent ?? "").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={32} />}
                title={m.opponent ?? "Soupeř"}
                meta={[m.round != null ? `${m.round}. kolo` : null, m.isHome ? "doma" : "venku",
                  m.attendance != null ? `${Number(m.attendance).toLocaleString("cs")} diváků` : null].filter(Boolean).join(" · ")}
                trailing={<ScoreChip result={(m.result === "W" || m.result === "L" ? m.result : "D") as MatchOutcome}>{m.homeScore}:{m.awayScore}</ScoreChip>} />
            ))}
            <ShowMore shown={Math.min(shownResults, matchResults.matches.length)} total={matchResults.matches.length} step={10}
              onMore={() => setShownResults((n) => n + 10)} />
          </ListCard>

          {/* Top players */}
          {matchResults.topPlayers.length > 0 && (
            <ListCard title="Statistiky hráčů">
              {matchResults.topPlayers.map((p) => (
                <ListRow key={p.playerId} href={p.isDeparted ? undefined : `/hrac/${p.playerId}`}
                  title={<>{p.name}{p.isDeparted && <span className="ml-1.5 text-micro text-muted uppercase font-normal">(bývalý)</span>}</>}
                  meta={[POS_LABELS[p.position] ?? p.position, `${p.appearances} zápasů`,
                    (p.goals as number) > 0 ? `${p.goals} gólů` : null,
                    (p.assists as number) > 0 ? `${p.assists} asistencí` : null].filter(Boolean).join(" · ")}
                  trailing={
                    <span className="flex items-center gap-2">
                      {(p.yellowCards as number) > 0 && <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-gold-400" title={`${p.yellowCards} žlutých`} />}
                      {(p.redCards as number) > 0 && <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-card-red" title={`${p.redCards} červených`} />}
                      <RatingPill value={(p.avgRating as number)?.toFixed(1) ?? "-"} tone={(p.avgRating as number) >= 7 ? "good" : "neutral"} />
                    </span>
                  } />
              ))}
            </ListCard>
          )}
        </div>
      )}

      {/* ═══ Squad (vlastní tým; cizí má ForeignSquad nahoře) ═══ */}
      {isOwnTeam && (
        <ListCard title="Kádr" count={`${players.length} hráčů`}>
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-line-soft">
            {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
              <button key={pos} onClick={() => setFilter(pos)}
                className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
                  filter === pos ? onColorText : "bg-gray-100 text-muted hover:bg-gray-200"
                }`} style={filter === pos ? { backgroundColor: color } : undefined}>
                {pos === "all" ? "Všichni" : `${POS_LABELS[pos]} (${players.filter((p) => p.position === pos).length})`}
              </button>
            ))}
          </div>

          {/* Od 768 px tabulka s atributy na porovnávání, na telefonu řádky na rychlé nalezení hráče. */}
          <div className="hidden md:block">
            <DataTable columns={squadColumns} rows={squadRows} rowKey={(p) => p.id}
              rowHref={(p) => `/hrac/${p.id}`} scroll={{ minWidth: 820 }}
              empty="Na tomhle postu teď nikoho nemáš." />
          </div>
          <div className="md:hidden">
            {squadRows.length === 0 && <ListEmpty icon="👥">Na tomhle postu teď nikoho nemáš.</ListEmpty>}
            {squadRows.map((p) => {
              const condition = p.lifeContext?.condition ?? 100;
              const injury = (p as unknown as { injury?: { daysRemaining: number } | null }).injury ?? null;
              return (
                <ListRow key={p.id} href={`/hrac/${p.id}`}
                  tone={injury ? "danger" : condition < 50 ? "warn" : undefined}
                  leading={playerFace(p, 30)}
                  title={`${p.first_name} ${p.last_name}`}
                  meta={<><PositionBadge position={p.position} /> {p.age} let{injury ? ` · zraněn ${injury.daysRemaining} d` : condition < 50 ? ` · kondice ${condition} %` : ""}</>}
                  trailing={<RatingPill value={p.overall_rating} tone={ratingToneIn(p.overall_rating, squadRatings)} />} />
              );
            })}
          </div>
        </ListCard>
      )}

      {/* ═══ Přehled přestupů (vlastní i cizí tým) ═══ */}
      <TransferOverview teamId={teamId} />
    </div>
    </>
  );
}

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-label">{label}</div>
      <div className="font-heading font-bold text-base">{value}</div>
    </div>
  );
}

function AttrPill({ label, value }: { label: string; value: number }) {
  const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 text-card-red";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-heading font-bold ${bg}`}>
      <span className="text-muted font-normal">{label}</span>{value}
    </span>
  );
}

