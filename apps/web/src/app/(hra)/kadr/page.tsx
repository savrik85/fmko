"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { TalentStars } from "@/components/players/talent-stars";
import { apiFetch, type Team, type Player } from "@/lib/api";
import { Spinner, PositionBadge, Tabs, useTabParam, ListCard, ListRow, ListEmpty, DataTable } from "@/components/ui";
import { PositionFilter, SquadAttributeTable, StickyPlayerName, type PosFilter } from "@/components/players/squad-attribute-table";
import { SquadBodyTab } from "@/components/players/squad-body-tab";
import { SquadAnalysisTab } from "@/components/players/squad-analysis-tab";

type Tab = "atributy" | "sezona" | "top" | "dochazka" | "postava" | "rozbor";
// Pořadí určuje i výchozí záložku — první je ta bez ?tab= v adrese.
const TAB_KEYS = ["atributy", "rozbor", "sezona", "postava", "dochazka", "top"] as const;

interface AttendanceRow {
  playerId: string;
  firstName: string;
  lastName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  trainingAttended: number;
  trainingTotal: number;
  trainingPct: number;
  matchesAvailable: number;
  matchesPlayed: number;
  matchesMissed: number;
  breakdown: { injury: number; suspension: number; excuse: number; bench: number; notNominated: number };
}

interface PlayerSeasonStats {
  playerId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  position: "GK" | "DEF" | "MID" | "FWD";
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  avgRating: number | null;
  cleanSheets: number;
  manOfMatch: number;
}

interface TeamStatsResponse {
  stats: PlayerSeasonStats[];
  topScorers: PlayerSeasonStats[];
  topAssists: PlayerSeasonStats[];
}

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export default function SquadPage() {
  const { teamId } = useTeam();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  // Potenciál celého kádru jedním dotazem — bez skauta zůstane prázdný
  const [potencial, setPotencial] = useState<Map<string, { strop: number | null; uroven: string | null; slovne: string | null }>>(new Map());
  const [stropOpor, setStropOpor] = useState<number | null>(null);
  /** Běžící sliby hráčům: hráč → co jsi mu slíbil (značka 🤞 u jména). */
  const [promises, setPromises] = useState<Map<string, string>>(new Map());
  const [seasonStats, setSeasonStats] = useState<PlayerSeasonStats[]>([]);
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [filter, setFilter] = useState<PosFilter>("all");
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<Player[]>(`/api/teams/${teamId}/players`),
      apiFetch<TeamStatsResponse>(`/api/teams/${teamId}/stats`).catch((e) => { console.error("team stats:", e); return { stats: [], topScorers: [], topAssists: [] } as TeamStatsResponse; }),
    ]).then(([t, p, s]) => { setTeam(t); setPlayers(p); setSeasonStats(s.stats); setLoading(false); });

    // Potenciál celého kádru — musí se načíst rovnou s kádrem, ne až s nějakým tabem
    apiFetch<{ maSkauta: boolean; stropOpor: number | null; hraci: Array<{ id: string; strop: number | null; uroven: string | null; slovne: string | null }> }>(
      `/api/teams/${teamId}/potencial-kadru`)
      .then((d) => {
        setStropOpor(d.stropOpor);
        setPotencial(new Map(d.hraci.map((h) => [h.id, { strop: h.strop, uroven: h.uroven, slovne: h.slovne }])));
      })
      .catch((e) => console.error("potencial kadru:", e));

    apiFetch<{ active: Record<string, string> }>(`/api/teams/${teamId}/promises`)
      .then((d) => setPromises(new Map(Object.entries(d.active))))
      .catch((e) => console.error("sliby hráčům:", e));
  }, [teamId]);

  // Lazy fetch attendance při kliknutí na tab Docházka
  useEffect(() => {
    if (tab !== "dochazka" || !teamId || attendanceLoaded) return;
    apiFetch<{ players: AttendanceRow[]; matchesAvailable: number }>(`/api/teams/${teamId}/attendance`)
      .then((d) => { setAttendance(d.players); setAttendanceLoaded(true); })
      .catch((e) => { console.error("attendance fetch:", e); setAttendanceLoaded(true); });
  }, [tab, teamId, attendanceLoaded]);

  // TOP tab — výpočty leaderů (musí být před early returnem kvůli rules of hooks)
  const topMatchData = useMemo(() => {
    const sortBy = (key: keyof PlayerSeasonStats, min = 0) =>
      seasonStats
        .filter((s) => (s[key] as number) > min)
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, 5);
    const minutesMin = 1;
    return {
      scorers: sortBy("goals", 0),
      assists: sortBy("assists", 0),
      mom: sortBy("manOfMatch", 0),
      cards: [...seasonStats]
        .map((s) => ({ ...s, _disc: (s.yellowCards ?? 0) + (s.redCards ?? 0) * 3 }))
        .filter((s) => s._disc > 0)
        .sort((a, b) => b._disc - a._disc)
        .slice(0, 5),
      cleanSheets: seasonStats
        .filter((s) => s.position === "GK" && (s.cleanSheets ?? 0) > 0)
        .sort((a, b) => (b.cleanSheets ?? 0) - (a.cleanSheets ?? 0))
        .slice(0, 5),
      ratings: seasonStats
        .filter((s) => (s.minutesPlayed ?? 0) >= minutesMin && (s.avgRating ?? 0) > 0)
        .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
        .slice(0, 5),
      minutes: [...seasonStats]
        .sort((a, b) => (b.minutesPlayed ?? 0) - (a.minutesPlayed ?? 0))
        .slice(0, 5),
    };
  }, [seasonStats]);

  // TOP atributy — z player roster, fungují i bez odehraných zápasů
  const topPlayerData = useMemo(() => {
    const active = players.filter((p) => (p as any).status !== "quit");
    const sortBySkill = (skill: string) => [...active]
      .map((p) => ({ p, v: (p.skills as Record<string, number> | undefined)?.[skill] ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    const sortByPhys = (key: string) => [...active]
      .map((p) => ({ p, v: ((p.physical as unknown) as Record<string, number> | undefined)?.[key] ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    const sortByLC = (key: string) => [...active]
      .map((p) => ({ p, v: ((p.lifeContext as unknown as Record<string, number> | undefined))?.[key] ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    return {
      ratings: [...active].sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0)).slice(0, 5),
      speed: sortBySkill("speed"),
      shooting: sortBySkill("shooting"),
      technique: sortBySkill("technique"),
      passing: sortBySkill("passing"),
      heading: sortBySkill("heading"),
      defense: sortBySkill("defense"),
      stamina: sortByPhys("stamina"),
      strength: sortByPhys("strength"),
      condition: sortByLC("condition"),
      morale: sortByLC("morale"),
      youngest: [...active].sort((a, b) => a.age - b.age).slice(0, 5),
      oldest: [...active].sort((a, b) => b.age - a.age).slice(0, 5),
      wages: [...active].sort((a, b) => (b.weekly_wage ?? 0) - (a.weekly_wage ?? 0)).slice(0, 5),
    };
  }, [players]);

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  if (!team) return <div className="p-6">Tým nenalezen.</div>;

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);

  // Stats tab — filter + sort
  const statsFiltered = filter === "all" ? seasonStats : seasonStats.filter((s) => s.position === filter);
  const totalGoals = seasonStats.reduce((s, p) => s + (p.goals ?? 0), 0);
  const totalAssists = seasonStats.reduce((s, p) => s + (p.assists ?? 0), 0);
  const totalApps = seasonStats.reduce((s, p) => s + (p.appearances ?? 0), 0);
  const totalYellow = seasonStats.reduce((s, p) => s + (p.yellowCards ?? 0), 0);
  const totalRed = seasonStats.reduce((s, p) => s + (p.redCards ?? 0), 0);

  // Summary stats
  const avgRating = players.length ? Math.round(players.reduce((s, p) => s + (p.overall_rating ?? 0), 0) / players.length) : 0;
  const totalWage = players.reduce((s, p) => s + (p.weekly_wage ?? 0), 0);
  const avgAge = players.length ? (players.reduce((s, p) => s + p.age, 0) / players.length).toFixed(1) : "0";

  return (
    <div className="page-container space-y-4">

      {/* Tabs */}
      <div className="card p-1.5">
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Pohled na kádr"
          dense
          mobileIcons={false}
          items={[
            // Rozbor hned za Atributy: na mobilu je vidět bez posouvání lišty, TOP až na konci.
            { key: "atributy", label: "Atributy", icon: "\u{1F4CB}" },
            { key: "rozbor", label: "Rozbor", icon: "\u{1F9ED}" },
            { key: "sezona", label: "Sezóna", icon: "\u{1F4CA}" },
            { key: "postava", label: "Postava", icon: "\u2696\uFE0F" },
            { key: "dochazka", label: "Docházka", icon: "\u{1F4C5}" },
            { key: "top", label: "TOP", icon: "\u{1F3C6}" },
          ]}
        />
      </div>

      {/* Souhrn kádru jen u Atributů, v jednom řádku a POD lištou záložek: nad ní by lišta při
          přepínání skákala nahoru a dolů. */}
      {tab === "atributy" && (
        <div className="card grid grid-cols-4 divide-x divide-gray-100">
          {[
            { value: String(players.length), label: "Hráčů", className: "" },
            { value: String(avgRating), label: "Ø Hodnocení", className: "" },
            { value: avgAge, label: "Ø Věk", className: "" },
            { value: totalWage.toLocaleString("cs"), label: "Mzdy/týd", className: "text-card-red" },
          ].map((s) => (
            <div key={s.label} className="px-1 py-2 sm:py-3 text-center min-w-0">
              <div className={`font-heading font-[800] text-base sm:text-2xl tabular-nums leading-tight ${s.className}`}>{s.value}</div>
              <div className="text-micro text-muted uppercase tracking-wide truncate">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rozbor je za celou jedenáctku, filtr postů by v něm nic neznamenal. */}
      {tab !== "rozbor" && <PositionFilter players={players} value={filter} onChange={setFilter} />}

      {/* FM-style table — Atributy tab */}
      {tab === "atributy" && <SquadAttributeTable players={filtered} potential={potencial} promises={promises} />}

      {/* Sezóna — match stats tab */}
      {tab === "sezona" && (
        <>
          {/* Souhrn sezony — 4 boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-pitch-500">{totalGoals}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Góly</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-blue-500">{totalAssists}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Asistence</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-amber-500">{totalYellow}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Žluté</div>
            </div>
            <div className="card p-3 text-center">
              <div className="font-heading font-[800] text-2xl tabular-nums text-card-red">{totalRed}</div>
              <div className="text-micro text-muted uppercase tracking-wide">Červené</div>
            </div>
          </div>

          {totalApps === 0 && (
            <div className="card p-3 text-center text-xs text-muted">
              {"\u{2139}\u{FE0F}"} Tým zatím neodehrál žádný zápas. Statistiky se naplní postupně po každém kole. <Link href="/rozpis" className="text-pitch-600 underline ml-1">Rozpis zápasů</Link>
            </div>
          )}
          <ListCard>
            <DataTable rows={statsFiltered} rowKey={(r) => r.playerId}
              rowHref={(r) => `/hrac/${r.playerId}`} scroll={{ minWidth: 620 }}
              defaultSort={{ key: "g", dir: "desc" }}
              empty="Žádní hráči neodpovídají filtru."
              columns={[
                { key: "name", header: "Jméno", title: "Jméno hráče", align: "left", sortValue: (r) => `${r.lastName} ${r.firstName}`, firstDir: "asc",
                  cell: (r) => <span className="text-body font-bold text-ink whitespace-nowrap"><StickyPlayerName firstName={r.firstName} lastName={r.lastName} /></span> },
                { key: "pos", header: "Poz", title: "Pozice", width: "w-14", sortValue: (r) => POS_ORDER[r.position] ?? 9, firstDir: "asc", cell: (r) => <PositionBadge position={r.position} /> },
                { key: "apps", header: "Záp", title: "Zápasy", width: "w-11", sortValue: (r) => r.appearances ?? 0, cell: (r) => r.appearances ?? 0 },
                { key: "min", header: "Min", title: "Odehrané minuty", width: "w-12", sortValue: (r) => r.minutesPlayed ?? 0, cell: (r) => r.minutesPlayed ?? 0 },
                { key: "g", header: "G", title: "Góly", width: "w-10", sortValue: (r) => r.goals ?? 0, cell: (r) => <span className="font-bold text-pitch-600">{r.goals ?? 0}</span> },
                { key: "a", header: "A", title: "Asistence", width: "w-10", sortValue: (r) => r.assists ?? 0, cell: (r) => <span className="font-bold text-blue-600">{r.assists ?? 0}</span> },
                { key: "ga", header: "G+A", title: "Góly + asistence", width: "w-12", sortValue: (r) => (r.goals ?? 0) + (r.assists ?? 0), cell: (r) => <span className="font-bold text-ink">{(r.goals ?? 0) + (r.assists ?? 0)}</span> },
                { key: "y", header: "ŽK", title: "Žluté karty", width: "w-10", sortValue: (r) => r.yellowCards ?? 0, cell: (r) => <span className="text-amber-600">{r.yellowCards ?? 0}</span> },
                { key: "r", header: "ČK", title: "Červené karty", width: "w-10", sortValue: (r) => r.redCards ?? 0, cell: (r) => <span className="text-card-red">{r.redCards ?? 0}</span> },
                { key: "cs", header: "CS", title: "Čistá konta (brankáři)", width: "w-10", sortValue: (r) => r.cleanSheets ?? 0, cell: (r) => (r.position === "GK" ? (r.cleanSheets ?? 0) : "-") },
                { key: "mom", header: "MoM", title: "Hráč zápasu", width: "w-12", sortValue: (r) => r.manOfMatch ?? 0, cell: (r) => <span className="text-gold-600">{r.manOfMatch ?? 0}</span> },
                { key: "avg", header: "Ø", title: "Průměrné hodnocení", width: "w-12", emphasis: true, sortValue: (r) => r.avgRating ?? 0,
                  cell: (r) => (r.avgRating != null && r.avgRating > 0 ? r.avgRating.toFixed(1) : "-") },
              ]} />
          </ListCard>
        </>
      )}

      {/* TOP hráči — atributy + matchové */}
      {tab === "top" && (
        <>
          <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mt-1">{"\u{1F3C5}"} Žebříčky kádru</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <PlayerTopList title={"\u{2B50} Nejvyšší hodnocení"} items={topPlayerData.ratings} valueOf={(p) => p.overall_rating ?? 0} />
            <PlayerTopList title={"\u{1F525} Top kondice"} items={topPlayerData.condition.map((x) => x.p)} valueOf={(p) => `${(p.lifeContext as unknown as Record<string, number>)?.condition ?? 0}%`} />
            <PlayerTopList title={"\u{1F60A} Top morálka"} items={topPlayerData.morale.map((x) => x.p)} valueOf={(p) => `${(p.lifeContext as unknown as Record<string, number>)?.morale ?? 0}%`} />
            <PlayerTopList title={"\u{1F4A8} Nejrychlejší"} items={topPlayerData.speed.map((x) => x.p)} valueOf={(p) => p.skills?.speed ?? 0} />
            <PlayerTopList title={"\u{1F3AF} Nejlepší střelba"} items={topPlayerData.shooting.map((x) => x.p)} valueOf={(p) => p.skills?.shooting ?? 0} />
            <PlayerTopList title={"\u{1F3A8} Top technika"} items={topPlayerData.technique.map((x) => x.p)} valueOf={(p) => p.skills?.technique ?? 0} />
            <PlayerTopList title={"\u{1F4E4} Top přihrávky"} items={topPlayerData.passing.map((x) => x.p)} valueOf={(p) => p.skills?.passing ?? 0} />
            <PlayerTopList title={"\u{1F9E0} Top hlavičky"} items={topPlayerData.heading.map((x) => x.p)} valueOf={(p) => p.skills?.heading ?? 0} />
            <PlayerTopList title={"\u{1F6E1}\u{FE0F} Top obrana"} items={topPlayerData.defense.map((x) => x.p)} valueOf={(p) => p.skills?.defense ?? 0} />
            <PlayerTopList title={"\u{1F3C3} Top výdrž"} items={topPlayerData.stamina.map((x) => x.p)} valueOf={(p) => (p.physical as unknown as Record<string, number>)?.stamina ?? 0} />
            <PlayerTopList title={"\u{1F4AA} Top síla"} items={topPlayerData.strength.map((x) => x.p)} valueOf={(p) => (p.physical as unknown as Record<string, number>)?.strength ?? 0} />
            <PlayerTopList title={"\u{1F476} Nejmladší"} items={topPlayerData.youngest} valueOf={(p) => `${p.age} l.`} />
            <PlayerTopList title={"\u{1F474} Nejstarší"} items={topPlayerData.oldest} valueOf={(p) => `${p.age} l.`} />
            <PlayerTopList title={"\u{1F4B0} Nejvyšší mzdy"} items={topPlayerData.wages} valueOf={(p) => (p.weekly_wage ?? 0).toLocaleString("cs")} suffix="Kč" />
          </div>

          {totalApps > 0 && (
            <>
              <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider mt-4">{"\u{26BD}"} Sezónní výkonnost</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TopList title={"\u{26BD} Nejlepší střelci"} items={topMatchData.scorers} valueOf={(s) => s.goals ?? 0} suffix="g" />
                <TopList title={"\u{1F3AF} Nejlepší asistenti"} items={topMatchData.assists} valueOf={(s) => s.assists ?? 0} suffix="a" />
                <TopList title={"\u{2B50} Průměrné hodnocení v zápasech"} items={topMatchData.ratings} valueOf={(s) => (s.avgRating ?? 0).toFixed(1)} />
                <TopList title={"\u{1F451} Hráč zápasu"} items={topMatchData.mom} valueOf={(s) => s.manOfMatch ?? 0} suffix="×" />
                <TopList title={"\u{23F1}\u{FE0F} Nejvíce minut"} items={topMatchData.minutes} valueOf={(s) => `${s.minutesPlayed ?? 0} '`} />
                <TopList title={"\u{1F9E4} Čistá konta"} items={topMatchData.cleanSheets} valueOf={(s) => s.cleanSheets ?? 0} />
                {topMatchData.cards.length > 0 && (
                  <TopList title={"\u{1F7E5} Disciplinární přestupky"} items={topMatchData.cards as PlayerSeasonStats[]}
                    valueOf={(s) => `${s.yellowCards ?? 0}ŽK / ${s.redCards ?? 0}ČK`} />
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Docházka — týmový přehled */}
      {tab === "dochazka" && (
        !attendanceLoaded ? (
          <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>
        ) : (
          <DochazkaTab
            rows={attendance.filter((r) => filter === "all" || r.position === filter)}
          />
        )
      )}

      {tab === "postava" && teamId && <SquadBodyTab teamId={teamId} filter={filter} />}

      {tab === "rozbor" && teamId && <SquadAnalysisTab teamId={teamId} potential={potencial} />}

    </div>
  );
}

function DochazkaTab({ rows }: { rows: AttendanceRow[] }) {
  const totalMatches = rows[0]?.matchesAvailable ?? 0;
  const dash = (n: number) => n || "-";
  return (
    <>
      {totalMatches === 0 && rows.length > 0 && (
        <div className="card p-3 text-center text-xs text-muted">
          {"\u{2139}\u{FE0F}"} Tým zatím neodehrál žádný zápas. Tabulka zobrazí jen tréninkovou docházku.
        </div>
      )}
      <ListCard>
        <DataTable rows={rows} rowKey={(r) => r.playerId}
          rowHref={(r) => `/hrac/${r.playerId}#ucast`} scroll={{ minWidth: 820 }}
          defaultSort={{ key: "trainPct", dir: "desc" }}
          empty="Žádní hráči neodpovídají filtru."
          columns={[
            { key: "name", header: "Jméno", title: "Jméno hráče", align: "left", sortValue: (r) => `${r.lastName} ${r.firstName}`, firstDir: "asc",
              cell: (r) => <span className="text-body font-bold text-ink whitespace-nowrap"><StickyPlayerName firstName={r.firstName} lastName={r.lastName} /></span> },
            { key: "pos", header: "Poz", title: "Pozice", width: "w-14", sortValue: (r) => POS_ORDER[r.position] ?? 9, firstDir: "asc", cell: (r) => <PositionBadge position={r.position} /> },
            { key: "trainPct", header: "Tréninky %", title: "Procento docházky na trénink", sortValue: (r) => r.trainingPct,
              cell: (r) => <span className={`font-bold ${r.trainingPct >= 80 ? "text-pitch-600" : r.trainingPct >= 60 ? "text-amber-600" : "text-card-red"}`}>{r.trainingTotal > 0 ? `${r.trainingPct} %` : "-"}</span> },
            { key: "trainAtt", header: "Tréninky", title: "Účast / celkem", sortValue: (r) => r.trainingAttended,
              cell: (r) => (r.trainingTotal > 0 ? `${r.trainingAttended}/${r.trainingTotal}` : "-") },
            { key: "matches", header: "Zápasy", title: "Odehrané zápasy / dostupné", sortValue: (r) => r.matchesPlayed, cell: (r) => `${r.matchesPlayed}/${r.matchesAvailable}` },
            { key: "injury", header: "Zranění", title: "Zameškáno kvůli zranění", sortValue: (r) => r.breakdown.injury, cell: (r) => <span className="text-card-red">{dash(r.breakdown.injury)}</span> },
            { key: "suspension", header: "Stopka", title: "Zameškáno kvůli stopce za karty", sortValue: (r) => r.breakdown.suspension, cell: (r) => <span className="text-amber-600">{dash(r.breakdown.suspension)}</span> },
            { key: "excuse", header: "Výmluvy", title: "Zameškáno kvůli omluvě (osobní, zdraví, kocovina…)", sortValue: (r) => r.breakdown.excuse, cell: (r) => <span className="text-blue-600">{dash(r.breakdown.excuse)}</span> },
            { key: "bench", header: "Lavička", title: "Byl v nominaci jako náhradník, ale nedostal šanci", sortValue: (r) => r.breakdown.bench, cell: (r) => dash(r.breakdown.bench) },
            { key: "notNominated", header: "Nenominován", title: "Trenér ho do zápasu vůbec nenominoval", sortValue: (r) => r.breakdown.notNominated, cell: (r) => dash(r.breakdown.notNominated) },
          ]} />
      </ListCard>
    </>
  );
}

/** Pořadí v žebříčku: první tři medaile, dál číslo. */
function rankMark(index: number) {
  return index === 0 ? "\u{1F947}" : index === 1 ? "\u{1F948}" : index === 2 ? "\u{1F949}" : <span className="text-meta text-muted tabular-nums">{index + 1}.</span>;
}

function TopValue({ value, suffix }: { value: string | number; suffix: string }) {
  return (
    <span className="text-body font-bold tabular-nums text-pitch-600">
      {value}{suffix && <span className="text-muted font-normal text-meta ml-0.5">{suffix}</span>}
    </span>
  );
}

function PlayerTopList({ title, items, valueOf, suffix = "" }: {
  title: string;
  items: Player[];
  valueOf: (p: Player) => string | number;
  suffix?: string;
}) {
  return (
    <ListCard title={title}>
      {items.length === 0 && <ListEmpty icon="📊">Tenhle žebříček se naplní, až budou mít hráči co ukázat.</ListEmpty>}
      {items.map((p, i) => (
        <ListRow key={p.id} dense href={`/hrac/${p.id}`}
          leading={rankMark(i)}
          title={<span className="flex items-center gap-2"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /><span className="min-w-0">{p.first_name} {p.last_name}</span></span>}
          trailing={<TopValue value={valueOf(p)} suffix={suffix} />} />
      ))}
    </ListCard>
  );
}

function TopList({ title, items, valueOf, suffix = "" }: {
  title: string;
  items: PlayerSeasonStats[];
  valueOf: (s: PlayerSeasonStats) => string | number;
  suffix?: string;
}) {
  return (
    <ListCard title={title}>
      {items.length === 0 && <ListEmpty icon="📊">Tenhle žebříček se naplní po prvních odehraných zápasech.</ListEmpty>}
      {items.map((s, i) => (
        <ListRow key={s.playerId} dense href={`/hrac/${s.playerId}`}
          leading={rankMark(i)}
          title={<span className="flex items-center gap-2"><PositionBadge position={s.position} /><span className="min-w-0">{s.firstName} {s.lastName}</span></span>}
          trailing={<TopValue value={valueOf(s)} suffix={suffix} />} />
      ))}
    </ListCard>
  );
}
