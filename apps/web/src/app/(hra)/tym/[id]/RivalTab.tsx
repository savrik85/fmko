"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  CardSkeleton, ListCard, ListEmpty, ListRow, ListSkeleton, PositionBadge, RatingPill, ResultChip, ScoreChip,
  SectionLabel, ShowMore, SkeletonPage, ratingToneIn, type MatchOutcome,
} from "@/components/ui";
import { PreMatchCard } from "@/components/relations/RelationSection";
import type { ScheduleMatch } from "@/components/dashboard/widgets/types";
import { competitionLabel, mostCommonFormation, nextMeeting, type Competition } from "./rival-view";

// Záložka Soupeř na profilu cizího týmu: soupeř z pohledu mého týmu.
// Data: GET /api/teams/:mine/rival/:rival (apps/api/src/rival/), příští zápas z rozpisu.

interface RecordLine { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }
interface SeasonSide { position: number; points: number; total: RecordLine; home: RecordLine; away: RecordLine; form: MatchOutcome[] }
interface LineAverages { overall: number | null; GK: number | null; DEF: number | null; MID: number | null; FWD: number | null }
interface Scorer { playerId: string | null; name: string; goals: number }

interface RivalProfile {
  me: { id: string; name: string };
  rival: { id: string; name: string };
  headToHead: {
    summary: RecordLine;
    matches: Array<{
      id: string; competition: Competition; label: string | null; date: string | null; isHome: boolean;
      myScore: number; rivalScore: number; myPens: number | null; rivalPens: number | null; result: MatchOutcome;
    }>;
  };
  scorers: { rival: Scorer[]; mine: Scorer[] };
  season: { leagueName: string | null; sameLeague: boolean; me: SeasonSide | null; rival: SeasonSide | null };
  rivalGoals: { matches: number; scored: number[]; conceded: number[] };
  rivalCards: { matches: number; yellow: number; red: number };
  lines: { me: LineAverages; rival: LineAverages };
  keyPlayers: Array<{ id: string; name: string; position: string; rating: number; age: number; goals: number; assists: number }>;
  formations: Array<{ matchId: string; date: string | null; competition: Competition; formation: string; tactic: string | null; opponentName: string }>;
  scoutReport: {
    formation: string | null; tactic: string | null; keyPlayer: string | null; weakPlayer: string | null;
    finishedAt: string; bonusUntil: string | null; bonusActive: boolean;
  } | null;
}

const PERIODS = ["1–15", "16–30", "31–45", "46–60", "61–75", "76–90"];
const PERIOD_WORDS = ["v prvních patnácti minutách", "ve druhé čtvrthodině", "v závěru prvního poločasu", "v úvodu druhého poločasu", "kolem hodiny hry", "v závěru zápasu"];
const SCORERS_SHOWN = 5;

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" }) : "";
/** Tvar slova po čísle: 1 gól, 2 góly, 5 gólů. */
const countWord = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const goalsWord = (n: number) => countWord(n, "gól", "góly", "gólů");

export function RivalTab({ myTeamId, rivalId, rivalName }: { myTeamId: string; rivalId: string; rivalName: string }) {
  const [profile, setProfile] = useState<RivalProfile | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMatch[]>([]);
  const [failed, setFailed] = useState(false);
  const [shownMatches, setShownMatches] = useState(5);

  const load = useCallback(() => {
    setFailed(false);
    setProfile(null);
    Promise.all([
      apiFetch<RivalProfile>(`/api/teams/${myTeamId}/rival/${rivalId}`),
      // Bez rozpisu jen chybí karta s příštím zápasem, profil se ukáže i tak.
      apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${myTeamId}/schedule`)
        .catch((e) => { console.warn("rozpis pro profil soupeře:", e); return { matches: [] as ScheduleMatch[] }; }),
    ]).then(([p, s]) => {
      setProfile(p);
      setSchedule(s.matches ?? []);
    }).catch((e) => {
      console.error("profil soupeře:", e);
      setFailed(true);
    });
  }, [myTeamId, rivalId]);

  useEffect(() => { load(); }, [load]);

  if (failed) {
    return (
      <div className="card p-4 space-y-3">
        <p className="text-sm">Profil soupeře se nepodařilo načíst.</p>
        <button type="button" onClick={load} className="btn btn-secondary btn-sm">Zkusit znovu</button>
      </div>
    );
  }
  if (!profile) {
    return (
      <SkeletonPage className="space-y-4">
        <CardSkeleton lines={2} />
        <ListSkeleton rows={5} />
        <CardSkeleton lines={5} />
      </SkeletonPage>
    );
  }

  const next = nextMeeting(schedule, rivalId);
  const h2h = profile.headToHead;

  return (
    <div className="space-y-4">
      {next && <NextMeetingCard match={next} />}
      <PreMatchCard myTeamId={myTeamId} otherTeamId={rivalId} otherTeamName={rivalName} />

      {/* ═══ Vzájemné zápasy ═══ */}
      <ListCard title="Vzájemné zápasy" count={h2h.summary.played > 0 ? `${h2h.summary.played} ${countWord(h2h.summary.played, "zápas", "zápasy", "zápasů")}` : undefined}>
        {h2h.summary.played === 0 ? (
          <ListEmpty icon="🤝">Zatím jste spolu nehráli.</ListEmpty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center px-4 py-3 border-b border-line-soft">
              <BigNumber value={h2h.summary.wins} label="Výhry" tone="text-pitch-500" />
              <BigNumber value={h2h.summary.draws} label="Remízy" />
              <BigNumber value={h2h.summary.losses} label="Prohry" tone="text-card-red" />
            </div>
            <div className="px-4 py-2.5 text-sm text-muted border-b border-line-soft">
              Skóre ze všech vzájemných zápasů{" "}
              <span className="font-heading font-bold text-ink tabular-nums">{h2h.summary.goalsFor}:{h2h.summary.goalsAgainst}</span>
            </div>
            {h2h.matches.slice(0, shownMatches).map((m) => {
              const home = m.isHome ? m.myScore : m.rivalScore;
              const away = m.isHome ? m.rivalScore : m.myScore;
              const pens = m.myPens != null && m.rivalPens != null
                ? `penalty ${m.isHome ? m.myPens : m.rivalPens}:${m.isHome ? m.rivalPens : m.myPens}`
                : null;
              const venue = m.competition === "tournament" ? "turnaj" : m.isHome ? "doma" : "venku";
              return (
                <ListRow key={m.id} href={`/zapas/${m.id}/zaznam`}
                  title={competitionLabel(m)}
                  meta={[shortDate(m.date), venue, pens].filter(Boolean).join(" · ")}
                  trailing={<ScoreChip result={m.result}>{home}:{away}</ScoreChip>} />
              );
            })}
            <ShowMore shown={Math.min(shownMatches, h2h.matches.length)} total={h2h.matches.length} step={10}
              onMore={() => setShownMatches((n) => n + 10)} />
          </>
        )}
      </ListCard>

      {/* ═══ Střelci ve vzájemných zápasech ═══ */}
      {h2h.summary.played > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScorerList title="Dávají vám góly" scorers={profile.scorers.rival} empty="Proti vám zatím nikdo z nich neskóroval." />
          <ScorerList title="Dáváte jim góly" scorers={profile.scorers.mine} empty="Proti nim jste zatím gól nedali." />
        </div>
      )}

      {/* ═══ Sezóna ═══ */}
      <SeasonCard profile={profile} next={next} />

      {/* ═══ Kdy dávají a dostávají góly ═══ */}
      <GoalTimingCard goals={profile.rivalGoals} cards={profile.rivalCards} />

      {/* ═══ Kádr ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LinesCard me={profile.me.name} rival={profile.rival.name} lines={profile.lines} />
        <ListCard title="Nejlepší hráči soupeře">
          {profile.keyPlayers.length === 0 && <ListEmpty icon="👥">Soupeř teď nemá v kádru nikoho.</ListEmpty>}
          {profile.keyPlayers.map((p) => (
            <ListRow key={p.id} href={`/hrac/${p.id}`}
              leading={<PositionBadge position={p.position} />}
              title={p.name}
              meta={[`${p.age} let`, p.goals > 0 ? `${p.goals} ${goalsWord(p.goals)} v lize` : null,
                p.assists > 0 ? `${p.assists} ${countWord(p.assists, "asistence", "asistence", "asistencí")}` : null]
                .filter(Boolean).join(" · ")}
              trailing={<RatingPill value={p.rating} tone={ratingToneIn(p.rating, profile.keyPlayers.map((k) => k.rating))} />} />
          ))}
        </ListCard>
      </div>

      {/* ═══ Jak hrají ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormationsCard formations={profile.formations} myName={profile.me.name} />
        <ScoutCard report={profile.scoutReport} />
      </div>
    </div>
  );
}

function BigNumber({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return (
    <div className="bg-gray-50 rounded-soft py-2">
      <div className={`font-heading font-bold text-lg tabular-nums ${tone}`}>{value}</div>
      <div className="text-micro text-muted uppercase">{label}</div>
    </div>
  );
}

function NextMeetingCard({ match }: { match: ScheduleMatch }) {
  const what = match.isTournament
    ? match.roundName ?? "Turnaj"
    : match.isCup
      ? `Pohár, ${(match.roundName ?? "").toLocaleLowerCase("cs")}`.replace(/, $/, "")
      : match.isFriendly ? "Přátelák" : match.round != null ? `Liga, ${match.round}. kolo` : "Liga";
  const where = match.isTournament ? "na turnaji" : match.isHome ? "doma" : "u nich";
  const when = match.scheduledAt
    ? new Date(match.scheduledAt).toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric", timeZone: "Europe/Prague" })
    : null;
  return (
    <div className="card p-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <SectionLabel>Příští vzájemný zápas</SectionLabel>
        <div className="font-heading font-bold text-base">{what}</div>
        <div className="text-sm text-muted">{[when, where].filter(Boolean).join(" · ")}</div>
      </div>
      <Link href="/zapas" className="text-sm text-pitch-600 font-heading font-bold hover:underline">Sestava →</Link>
    </div>
  );
}

function ScorerList({ title, scorers, empty }: { title: string; scorers: Scorer[]; empty: string }) {
  const [shown, setShown] = useState(SCORERS_SHOWN);
  return (
    <ListCard title={title}>
      {scorers.length === 0 && <ListEmpty icon="⚽">{empty}</ListEmpty>}
      {scorers.slice(0, shown).map((s) => (
        <ListRow key={`${s.playerId ?? s.name}`} href={s.playerId ? `/hrac/${s.playerId}` : undefined}
          title={s.name}
          meta={s.playerId ? undefined : "už ve hře nehraje"}
          trailing={<span className="font-heading font-bold text-base tabular-nums">{s.goals} {goalsWord(s.goals)}</span>} />
      ))}
      <ShowMore shown={Math.min(shown, scorers.length)} total={scorers.length} step={10} onMore={() => setShown((n) => n + 10)} />
    </ListCard>
  );
}

function recordText(r: RecordLine): string {
  return r.played === 0 ? "–" : `${r.wins}-${r.draws}-${r.losses}, ${r.goalsFor}:${r.goalsAgainst}`;
}

function SeasonCard({ profile, next }: { profile: RivalProfile; next: ScheduleMatch | null }) {
  const { me, rival, leagueName, sameLeague } = profile.season;
  if (!me && !rival) return null;
  // Příští vzájemný zápas určí, která bilance je důležitá: moje doma proti jejich venku, nebo naopak.
  const venue = next && !next.isTournament ? (next.isHome ? "home" : "away") : null;
  const mark = (side: "me" | "rival", where: "home" | "away") =>
    venue != null && ((side === "me") === (venue === where)) ? "bg-pitch-50 text-pitch-700 rounded-tight px-1.5" : "";

  const rows: Array<{ label: string; mine: ReactNode; theirs: ReactNode }> = [
    { label: "Místo", mine: me ? `${me.position}.` : "–", theirs: rival ? `${rival.position}.` : "–" },
    { label: "Body", mine: me?.points ?? "–", theirs: rival?.points ?? "–" },
    { label: "V-R-P", mine: me ? `${me.total.wins}-${me.total.draws}-${me.total.losses}` : "–", theirs: rival ? `${rival.total.wins}-${rival.total.draws}-${rival.total.losses}` : "–" },
    { label: "Skóre", mine: me ? `${me.total.goalsFor}:${me.total.goalsAgainst}` : "–", theirs: rival ? `${rival.total.goalsFor}:${rival.total.goalsAgainst}` : "–" },
    {
      label: "Forma",
      mine: <span className="inline-flex gap-0.5">{(me?.form ?? []).map((f, i) => <ResultChip key={i} result={f} />)}</span>,
      theirs: <span className="inline-flex gap-0.5">{(rival?.form ?? []).map((f, i) => <ResultChip key={i} result={f} />)}</span>,
    },
    { label: "Doma", mine: <span className={mark("me", "home")}>{me ? recordText(me.home) : "–"}</span>, theirs: <span className={mark("rival", "home")}>{rival ? recordText(rival.home) : "–"}</span> },
    { label: "Venku", mine: <span className={mark("me", "away")}>{me ? recordText(me.away) : "–"}</span>, theirs: <span className={mark("rival", "away")}>{rival ? recordText(rival.away) : "–"}</span> },
  ];

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Sezóna{leagueName ? ` · ${leagueName}` : ""}</SectionLabel>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 pb-2 border-b border-line text-sm font-heading font-bold">
        <Link href={`/tym/${profile.me.id}`} className="hover:underline">{profile.me.name}</Link>
        <span className="w-12" />
        <span className="text-right">{profile.rival.name}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 py-2 border-b border-line-soft last:border-b-0">
          <span className="font-heading font-bold text-base tabular-nums">{r.mine}</span>
          <span className="text-micro text-muted uppercase font-heading text-center w-12">{r.label}</span>
          <span className="font-heading font-bold text-base tabular-nums text-right">{r.theirs}</span>
        </div>
      ))}
      {(venue || !sameLeague) && (
        <p className="text-sm text-muted mt-3">
          {venue && `Zvýrazněná je bilance pro příští vzájemný zápas: vy hrajete ${venue === "home" ? "doma" : "venku"}, oni ${venue === "home" ? "venku" : "doma"}. `}
          {!sameLeague && "Každý hrajete jinou soutěž, místo je ve vlastní tabulce."}
        </p>
      )}
    </div>
  );
}

function GoalTimingCard({ goals, cards }: { goals: RivalProfile["rivalGoals"]; cards: RivalProfile["rivalCards"] }) {
  const max = Math.max(1, ...goals.scored, ...goals.conceded);
  const peak = (values: number[]) => {
    const top = Math.max(...values);
    return top > 0 ? values.indexOf(top) : null;
  };
  const scoredPeak = peak(goals.scored);
  const concededPeak = peak(goals.conceded);
  // Z mého pohledu: jejich góly jsou hrozba (červeně), jejich obdržené šance pro mě (zeleně).
  const cell = (n: number, rgb: string) => (
    <span className="h-9 rounded-tight flex items-center justify-center font-heading font-bold text-sm tabular-nums"
      style={{ backgroundColor: n > 0 ? `rgba(${rgb}, ${0.12 + 0.5 * (n / max)})` : undefined }}>
      {n > 0 ? n : <span className="text-muted font-normal">0</span>}
    </span>
  );
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Kdy dávají a dostávají góly</SectionLabel>
      {goals.matches === 0 ? (
        <p className="text-sm text-muted">V téhle sezóně ještě ligu nehráli.</p>
      ) : (
        <>
          <div className="grid grid-cols-[80px_repeat(6,minmax(0,1fr))] gap-1 items-center">
            <span />
            {PERIODS.map((p) => <span key={p} className="text-micro text-muted text-center tabular-nums">{p}</span>)}
            <span className="text-sm">Dávají</span>
            {goals.scored.map((n, i) => <span key={i}>{cell(n, "201, 58, 58")}</span>)}
            <span className="text-sm">Dostávají</span>
            {goals.conceded.map((n, i) => <span key={i}>{cell(n, "61, 122, 61")}</span>)}
          </div>
          <p className="text-sm text-muted mt-3">
            Za {goals.matches} {countWord(goals.matches, "ligový zápas", "ligové zápasy", "ligových zápasů")} sezóny.
            {scoredPeak != null && ` Nejvíc gólů dávají ${PERIOD_WORDS[scoredPeak]}`}
            {scoredPeak != null && concededPeak != null && `, dostávají ${PERIOD_WORDS[concededPeak]}.`}
            {scoredPeak != null && concededPeak == null && "."}
            {scoredPeak == null && concededPeak != null && ` Nejvíc gólů dostávají ${PERIOD_WORDS[concededPeak]}.`}
          </p>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-gold-400" aria-hidden="true" />
            {cards.yellow} {countWord(cards.yellow, "žlutá", "žluté", "žlutých")}
            <span className="inline-block w-2.5 h-3.5 rounded-[1px] bg-card-red ml-2" aria-hidden="true" />
            {cards.red} {countWord(cards.red, "červená", "červené", "červených")}
            <span>v lize této sezóny</span>
          </p>
        </>
      )}
    </div>
  );
}

function LinesCard({ me, rival, lines }: { me: string; rival: string; lines: RivalProfile["lines"] }) {
  const rows: Array<{ label: string; key: keyof LineAverages }> = [
    { label: "Hodnocení", key: "overall" }, { label: "BRA", key: "GK" }, { label: "OBR", key: "DEF" }, { label: "ZÁL", key: "MID" }, { label: "ÚTO", key: "FWD" },
  ];
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Srovnání kádrů</SectionLabel>
      <div className="flex justify-between text-sm font-heading font-bold mb-2 gap-3">
        <span>{me}</span><span className="text-right">{rival}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const a = lines.me[r.key];
          const b = lines.rival[r.key];
          const meBetter = a != null && b != null && a > b;
          const rivalBetter = a != null && b != null && b > a;
          const total = (a ?? 0) + (b ?? 0) || 1;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-heading font-bold tabular-nums ${meBetter ? "text-pitch-600" : rivalBetter ? "text-card-red" : "text-ink"}`}>{a ?? "–"}</span>
                <span className="text-micro text-muted uppercase font-heading">{r.label}</span>
                <span className={`text-sm font-heading font-bold tabular-nums ${rivalBetter ? "text-pitch-600" : meBetter ? "text-card-red" : "text-ink"}`}>{b ?? "–"}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                <div style={{ width: `${Math.round(((a ?? 0) / total) * 100)}%`, background: meBetter ? "#3D7A3D" : rivalBetter ? "#dc6b6b" : "#9ca3af" }} />
                <div className="flex-1" style={{ background: rivalBetter ? "#3D7A3D" : meBetter ? "#dc6b6b" : "#9ca3af" }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted mt-3">Průměrné hodnocení hráčů v kádru podle postu.</p>
    </div>
  );
}

function FormationsCard({ formations, myName }: { formations: RivalProfile["formations"]; myName: string }) {
  const most = mostCommonFormation(formations);
  return (
    <ListCard title="Jak hrají" count={most && formations.length > 1 ? `nejčastěji ${most.formation}` : undefined}>
      {formations.length === 0 && <ListEmpty icon="📋">Ze záznamů zatím nic, soupeř ještě nehrál.</ListEmpty>}
      {formations.map((f) => (
        <ListRow key={f.matchId} href={`/zapas/${f.matchId}/zaznam`}
          title={`${f.formation}${f.tactic ? ` · ${f.tactic}` : ""}`}
          meta={[f.opponentName === myName ? "proti vám" : `proti ${f.opponentName}`, competitionLabel({ competition: f.competition, label: null }), shortDate(f.date)]
            .filter(Boolean).join(" · ")} />
      ))}
    </ListCard>
  );
}

function ScoutCard({ report }: { report: RivalProfile["scoutReport"] }) {
  if (!report) {
    return (
      <div className="card p-4 sm:p-5">
        <SectionLabel>Skautský rozbor</SectionLabel>
        <p className="text-sm">Skaut soupeře rozebere: koho hlídat, kde má slabé místo, a tvůj tým dostane bonus do ligového zápasu s ním.</p>
        <Link href="/zamestnanci/skaut" className="inline-block mt-3 text-sm text-pitch-600 font-heading font-bold hover:underline">Poslat skauta →</Link>
      </div>
    );
  }
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Skautský rozbor · {shortDate(report.finishedAt)}</SectionLabel>
      <dl className="space-y-2 text-sm">
        {report.formation && (
          <div><dt className="text-muted inline">Hrají: </dt><dd className="inline font-heading font-bold text-base">{report.formation}{report.tactic ? `, ${report.tactic}` : ""}</dd></div>
        )}
        {report.keyPlayer && <div><dt className="text-muted inline">Hlídat: </dt><dd className="inline">{report.keyPlayer}</dd></div>}
        {report.weakPlayer && <div><dt className="text-muted inline">Slabé místo: </dt><dd className="inline">{report.weakPlayer}</dd></div>}
      </dl>
      <p className={`text-sm mt-3 ${report.bonusActive ? "text-pitch-700" : "text-muted"}`}>
        {report.bonusActive
          ? `Bonus do ligového zápasu s nimi platí${report.bonusUntil ? ` do ${shortDate(report.bonusUntil)}` : ""}.`
          : "Bonus z tohohle rozboru už vypršel."}
      </p>
      <Link href="/zamestnanci/skaut" className="inline-block mt-2 text-sm text-pitch-600 font-heading font-bold hover:underline">
        {report.bonusActive ? "Skaut →" : "Nový rozbor u skauta →"}
      </Link>
    </div>
  );
}
