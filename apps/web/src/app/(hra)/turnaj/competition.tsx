"use client";

import Link from "next/link";
import { BadgePreview, Tabs, useTabParam, type BadgePattern } from "@/components/ui";
import { FixtureGroup, FixtureRow, type FixtureCrest } from "@/components/match/fixture-row";
import { RoundPager } from "@/components/match/round-pager";
import { PMOBILE, PMobileLogo } from "@/components/brand/p-mobile";

export const BRAND = "#C8006A";

export interface Side { teamId: string; name: string; color: string | null; crest?: FixtureCrest | null }

export interface CompetitionMatch {
  id: string;
  stage: "league" | "qf" | "sf" | "third" | "final";
  /** Písmeno skupiny u zápasu ve skupině, jinak null. */
  group?: string | null;
  day: number;
  scheduledAt: string;
  status: string;
  venue: { id: string; name: string | null; isMain: boolean } | null;
  home: Side;
  away: Side;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
  winnerTeamId: string | null;
  attendance: number | null;
}

export interface StandingRow {
  position: number; teamId: string; name: string; color: string | null; crest?: FixtureCrest | null; district: string | null;
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number;
}

export interface Competition {
  matches: CompetitionMatch[];
  standings: StandingRow[];
  /** Tabulky skupin, null = hraje se jedna tabulka. */
  groups?: Array<{ code: string; standings: StandingRow[] }> | null;
  /** Ve 3 skupinách: pořadí třetích míst, postupuje `advancing` nejlepších. */
  thirds?: { rows: Array<StandingRow & { group: string }>; advancing: number } | null;
  venues: Array<{ id: string; name: string; capacity: number; isMain: boolean }>;
  scorers: Array<{ playerId: string; name: string; teamId: string; teamName: string; goals: number; assists: number; apps: number }>;
  myEarnings: number;
  advancing: number;
}

const TAB_KEYS = ["prehled", "tabulka", "rozpis", "playoff", "strelci", "info"] as const;
const STAGE_NAME: Record<string, string> = { qf: "Čtvrtfinále", sf: "Semifinále", third: "O 3. místo", final: "Finále" };
const WEEKDAY = ["ne", "po", "út", "st", "čt", "pá", "so"];

function kc(n: number): string {
  return `${n.toLocaleString("cs")} Kč`;
}

/** „st 14. 10." z výkopu (UTC půlnoc nehrozí, výkop je odpoledne). */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

function stageTitle(m: CompetitionMatch): string {
  return m.stage === "league" ? `${m.day}. den` : STAGE_NAME[m.stage] ?? m.stage;
}

/** Název hracího dne: v den finále se dřív hraje i o 3. místo. */
function dayTitle(ms: CompetitionMatch[]): string {
  return ms.some((m) => m.stage === "final") && ms.some((m) => m.stage === "third") ? "O 3. místo a finále" : stageTitle(ms[0]);
}

/** Krátký název dne do přepínače dnů. */
function dayShortTitle(ms: CompetitionMatch[]): string {
  return ms.some((m) => m.stage === "final") ? "Finále" : stageTitle(ms[0]);
}

/** Název mého zápasu: u skupin i se skupinou („Skupina A, 1. den"). */
function matchTitle(m: CompetitionMatch): string {
  return m.group ? `Skupina ${m.group}, ${stageTitle(m)}` : stageTitle(m);
}

/** Zápas turnaje: tabule vede na detail (odehraný) nebo na sestavu (můj nadcházející). */
function MatchRow({ m, myTeamId, showTag }: { m: CompetitionMatch; myTeamId: string | null; showTag: boolean }) {
  // Štítek u zápasu, který ve výpisu dne není poznat z nadpisu: skupina, nebo zápas o 3. místo vedle finále.
  const tag = !showTag ? null : m.group ? `Skupina ${m.group}` : m.stage === "third" ? "O 3. místo" : null;
  const played = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const mine = m.home.teamId === myTeamId || m.away.teamId === myTeamId;
  const winner = !played ? null
    : m.winnerTeamId === m.home.teamId ? "home"
    : m.winnerTeamId === m.away.teamId ? "away"
    : m.homeScore! > m.awayScore! ? "home" : m.awayScore! > m.homeScore! ? "away" : null;
  return (
    <FixtureRow
      home={{ name: m.home.name, href: `/tym/${m.home.teamId}`, color: m.home.color, crest: m.home.crest }}
      away={{ name: m.away.name, href: `/tym/${m.away.teamId}`, color: m.away.color, crest: m.away.crest }}
      score={played ? { home: m.homeScore!, away: m.awayScore!, homePens: m.homePens, awayPens: m.awayPens } : null}
      kickoff={timeLabel(m.scheduledAt)}
      winner={winner}
      href={played ? `/zapas/${m.id}` : mine ? `/zapas?calendarId=${m.id}` : null}
      hrefLabel={played ? `Detail zápasu ${m.home.name} proti ${m.away.name}` : "Nastavit sestavu"}
      accent={mine ? BRAND : null}
      boardColor={PMOBILE.deep}
      meta={
        <>
          {tag && <span className="font-heading font-bold text-ink">{tag}</span>}
          {m.venue?.name && (
            <span className={m.venue.isMain ? "font-heading font-bold" : undefined} style={m.venue.isMain ? { color: BRAND } : undefined}>
              {m.venue.name}
            </span>
          )}
          {played && m.attendance != null && m.attendance > 0 && <span>{m.attendance.toLocaleString("cs")} diváků</span>}
          {!played && mine && <span>Klepni na čas a nastav sestavu</span>}
        </>
      }
    />
  );
}

function zapasy(n: number): string {
  return `${n} ${n === 1 ? "zápas" : n >= 2 && n <= 4 ? "zápasy" : "zápasů"}`;
}

function DayBlock({ title, matches, myTeamId, showTags = true }: { title: string; matches: CompetitionMatch[]; myTeamId: string | null; showTags?: boolean }) {
  return (
    <FixtureGroup title={title} note={zapasy(matches.length)}>
      {matches.map((m) => <MatchRow key={m.id} m={m} myTeamId={myTeamId} showTag={showTags} />)}
    </FixtureGroup>
  );
}

function Standings({ rows, advancing, myTeamId, footer }: { rows: StandingRow[]; advancing: number; myTeamId: string | null; footer: string | null }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted border-b border-gray-100">
        <span className="w-6 text-right">#</span>
        <span className="flex-1">Tým</span>
        <span className="w-8 text-center">Z</span>
        <span className="w-14 text-center">Skóre</span>
        <span className="w-8 text-right">B</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.teamId}
          className={`flex items-center gap-2 px-4 py-2.5 ${r.position === advancing ? "border-b-2 border-pitch-400" : "border-b border-gray-50"} ${r.teamId === myTeamId ? "bg-pitch-50" : ""}`}
        >
          <span className={`w-6 text-right text-sm tabular-nums ${r.position <= advancing ? "font-bold text-pitch-600" : "text-muted"}`}>{r.position}.</span>
          <span className="flex-1 min-w-0 flex items-center gap-2">
            <BadgePreview
              primary={r.crest?.primary || r.color || "#5c6b52"}
              secondary={r.crest?.secondary || "#FFFFFF"}
              pattern={(r.crest?.pattern as BadgePattern) || "shield"}
              initials={r.crest?.initials || r.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              symbol={r.crest?.symbol}
              size={22}
            />
            <Link href={`/tym/${r.teamId}`} className="truncate text-base font-bold hover:underline">{r.name}</Link>
          </span>
          <span className="w-8 text-center text-sm tabular-nums">{r.played}</span>
          <span className="w-14 text-center text-sm tabular-nums">{r.goalsFor}:{r.goalsAgainst}</span>
          <span className="w-8 text-right font-heading font-[800] text-base tabular-nums">{r.points}</span>
        </div>
      ))}
      {footer && <div className="px-4 py-2 text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** Tabulky skupin pod sebou, nadpis jako u bloků zápasů; ve 3 skupinách i pořadí třetích míst. */
function GroupTables({ groups, thirds, advancing, myTeamId }: {
  groups: NonNullable<Competition["groups"]>; thirds: Competition["thirds"]; advancing: number; myTeamId: string | null;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.code}>
          <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
            <h3 className="font-heading font-bold text-base text-ink">Skupina {g.code}</h3>
            <span className="text-sm text-muted shrink-0">{g.standings.length} {g.standings.length >= 2 && g.standings.length <= 4 ? "týmy" : "týmů"}</span>
          </div>
          <Standings rows={g.standings} advancing={advancing} myTeamId={myTeamId} footer={null} />
        </section>
      ))}
      {thirds && thirds.rows.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
            <h3 className="font-heading font-bold text-base text-ink">Třetí místa</h3>
            <span className="text-sm text-muted shrink-0">postupují {thirds.advancing} nejlepší</span>
          </div>
          <Standings
            rows={thirds.rows.map((r) => ({ ...r, name: `${r.name} (${r.group})` }))}
            advancing={thirds.advancing}
            myTeamId={myTeamId}
            footer="Třetí ze skupin se porovnávají podle bodů, rozdílu skóre a vstřelených gólů."
          />
        </section>
      )}
      <div className="px-1 text-sm text-muted">
        Z každé skupiny postupují do čtvrtfinále první dva{thirds ? " a k nim dva nejlepší ze třetích míst" : ""}, nad čarou.
      </div>
    </div>
  );
}

export function CompetitionView({
  competition, myTeamId, myEntry, winnerTeamId, info,
}: {
  competition: Competition;
  myTeamId: string | null;
  myEntry: boolean;
  winnerTeamId: string | null;
  info: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const { matches, standings, scorers, myEarnings, advancing } = competition;
  const groups = competition.groups ?? null;

  const leagueDays = [...new Set(matches.filter((m) => m.stage === "league").map((m) => m.day))].sort((a, b) => a - b);
  // Zápasy dne podle výkopu (o 3. místo před finále), ve skupinách po skupinách (A, B, C, D),
  // jinak v pořadí z API (hlavní stadion první).
  const byDay = (day: number) => matches.filter((m) => m.day === day)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || (a.group ?? "").localeCompare(b.group ?? ""));
  const nextDay = matches.filter((m) => m.status !== "simulated").reduce<number | null>((min, m) => (min == null || m.day < min ? m.day : min), null);
  const lastPlayedDay = matches.filter((m) => m.status === "simulated").reduce<number | null>((max, m) => (max == null || m.day > max ? m.day : max), null);
  const myNext = matches
    .filter((m) => m.status !== "simulated" && (m.home.teamId === myTeamId || m.away.teamId === myTeamId))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const winner = winnerTeamId ? standings.find((s) => s.teamId === winnerTeamId) ?? null : null;
  const playoffStages = (["qf", "sf", "third", "final"] as const).filter((st) => matches.some((m) => m.stage === st));

  return (
    <div className="space-y-5">
      {winner && (
        <div className="card px-4 py-5 bg-gradient-to-r from-gold-50 to-pitch-50 border border-gold-200 text-center">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-sm font-heading uppercase tracking-wider text-muted">Vítěz turnaje</div>
          <div className="text-2xl font-heading font-bold mt-0.5">
            <Link href={`/tym/${winner.teamId}`} className="hover:underline">{winner.name}</Link>
          </div>
        </div>
      )}

      {myEntry && (
        <div className="card px-4 py-4 space-y-3">
          {myNext ? (
            <div>
              <div className="text-sm text-muted">Tvůj další zápas · {matchTitle(myNext)} · {dayLabel(myNext.scheduledAt)} v {timeLabel(myNext.scheduledAt)}</div>
              <div className="font-heading font-bold text-base mt-0.5">
                {myNext.home.teamId === myTeamId ? myNext.away.name : myNext.home.name}
                {myNext.venue?.name && <span className="text-muted font-normal text-sm"> · {myNext.venue.name}</span>}
              </div>
              <Link href={`/zapas?calendarId=${myNext.id}`} className="btn btn-primary btn-md mt-3 inline-block">Nastavit sestavu</Link>
            </div>
          ) : (
            <div className="text-sm text-muted">{winner ? "Turnaj skončil." : "Další zápas zatím nemáš. Play-off se doplní po dohrání předchozí fáze."}</div>
          )}
          <div className="text-sm">
            <span className="text-muted">Od P-Mobile tvůj klub zatím dostal: </span>
            <span className="font-heading font-bold text-base" style={{ color: BRAND }}>{kc(myEarnings)}</span>
          </div>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Turnaj"
        items={[
          { key: "prehled", label: "Přehled", icon: "📋" },
          { key: "tabulka", label: groups ? "Skupiny" : "Tabulka", icon: "📊" },
          { key: "rozpis", label: "Rozpis", icon: "📅" },
          { key: "playoff", label: "Play-off", icon: "🏆" },
          { key: "strelci", label: "Střelci", icon: "⚽" },
          { key: "info", label: "Info", icon: "ℹ️" },
        ]}
      />

      {tab === "prehled" && (
        <div className="space-y-5">
          {nextDay != null && <DayBlock title={`Hraje se ${dayLabel(byDay(nextDay)[0].scheduledAt)}, ${dayTitle(byDay(nextDay)).toLowerCase()}`} matches={byDay(nextDay)} myTeamId={myTeamId} />}
          {lastPlayedDay != null && <DayBlock title={`Výsledky: ${dayTitle(byDay(lastPlayedDay)).toLowerCase()}`} matches={byDay(lastPlayedDay)} myTeamId={myTeamId} />}
        </div>
      )}

      {tab === "tabulka" && (groups
        ? <GroupTables groups={groups} thirds={competition.thirds ?? null} advancing={advancing} myTeamId={myTeamId} />
        : <Standings rows={standings} advancing={advancing} myTeamId={myTeamId} footer="Pod čarou končí ligová fáze, nad ní se postupuje do play-off." />)}

      {tab === "rozpis" && (() => {
        const days = [...leagueDays, ...playoffStages.map((st) => matches.find((m) => m.stage === st)?.day ?? 0)]
          .filter((d, i, arr) => d > 0 && arr.indexOf(d) === i);
        // Výchozí den: nejbližší, který se ještě hraje; po turnaji poslední.
        const initial = nextDay ?? days.at(-1) ?? null;
        return (
          <RoundPager
            pages={days.map((d) => ({ key: String(d), label: dayShortTitle(byDay(d)) }))}
            initialKey={initial != null ? String(initial) : null}
            accent={BRAND}
          >
            {(key) => {
              const d = Number(key);
              return <DayBlock title={`${dayTitle(byDay(d))}, ${dayLabel(byDay(d)[0].scheduledAt)}`} matches={byDay(d)} myTeamId={myTeamId} />;
            }}
          </RoundPager>
        );
      })()}

      {tab === "playoff" && (
        playoffStages.length === 0 ? (
          <div className="card p-8 text-center text-muted text-sm">
            {groups
              ? groups.length === 3
                ? "Čtvrtfinále se doplní po skupinách. Postupují první dva z každé skupiny a dva nejlepší ze třetích míst. Vítězové skupin hrají se třetími a s nejhorším z druhých, týmy ze stejné skupiny se ve čtvrtfinále nepotkají."
                : "Čtvrtfinále se doplní po skupinách. Postupují první dva z každé skupiny: A1 s B2, C1 s D2, B1 s A2 a D1 s C2."
              : `Play-off se rozlosuje po ligové fázi. Postupuje ${advancing} nejlepších z tabulky.`}
          </div>
        ) : (
          <div className="space-y-5">
            {[...playoffStages].reverse().map((st) => (
              <DayBlock key={st} title={STAGE_NAME[st]} matches={matches.filter((m) => m.stage === st)} myTeamId={myTeamId} showTags={false} />
            ))}
          </div>
        )
      )}

      {tab === "strelci" && (
        scorers.length === 0 ? (
          <div className="card p-8 text-center text-muted text-sm">Střelci se objeví po prvních zápasech.</div>
        ) : (
          <div className="card">
            {scorers.map((s, i) => (
              <div key={s.playerId} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
                <span className="w-6 text-right text-sm text-muted tabular-nums shrink-0">{i + 1}.</span>
                <span className="flex-1 min-w-0">
                  <Link href={`/hrac/${s.playerId}`} className="block truncate text-base font-bold hover:underline">{s.name}</Link>
                  <Link href={`/tym/${s.teamId}`} className="block truncate text-sm text-muted hover:underline">{s.teamName}</Link>
                </span>
                {s.assists > 0 && <span className="text-sm text-muted shrink-0">{s.assists} A</span>}
                <span className="font-heading font-[800] text-base tabular-nums shrink-0 w-6 text-right">{s.goals}</span>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "info" && info}

      {/* Pořadatel */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4 text-sm text-muted">
        <PMobileLogo size={22} />
        <span>pořádá turnaj a hradí všechny jeho náklady</span>
      </div>
    </div>
  );
}
