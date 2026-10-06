"use client";

import Link from "next/link";
import { SectionLabel, Tabs, useTabParam } from "@/components/ui";
import { bestTextOn } from "@/lib/team-color";

export const BRAND = "#C8006A";

export interface Side { teamId: string; name: string; color: string | null }

export interface CompetitionMatch {
  id: string;
  stage: "league" | "qf" | "sf" | "final";
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
  position: number; teamId: string; name: string; color: string | null; district: string | null;
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number;
}

export interface Competition {
  matches: CompetitionMatch[];
  standings: StandingRow[];
  venues: Array<{ id: string; name: string; capacity: number; isMain: boolean }>;
  scorers: Array<{ playerId: string; name: string; teamId: string; teamName: string; goals: number; assists: number; apps: number }>;
  myEarnings: number;
  advancing: number;
}

const TAB_KEYS = ["prehled", "tabulka", "rozpis", "playoff", "strelci", "info"] as const;
const STAGE_NAME: Record<string, string> = { qf: "Čtvrtfinále", sf: "Semifinále", final: "Finále" };
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

function Dot({ color }: { color: string | null }) {
  const c = color || "#9aa18c";
  return (
    <span
      className={`w-3.5 h-3.5 rounded-full shrink-0 border ${bestTextOn(c) === "light" ? "border-transparent" : "border-gray-300"}`}
      style={{ background: c }}
      aria-hidden
    />
  );
}

function TeamName({ side, bold }: { side: Side; bold: boolean }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Dot color={side.color} />
      <Link href={`/tym/${side.teamId}`} className={`truncate text-base hover:underline ${bold ? "font-bold text-ink" : "text-ink/80"}`}>{side.name}</Link>
    </span>
  );
}

/** Zápas: týmy pod sebou (mobil), skóre nebo čas vpravo, pod tím hřiště. */
function MatchRow({ m, myTeamId }: { m: CompetitionMatch; myTeamId: string | null }) {
  const played = m.status === "simulated" && m.homeScore != null && m.awayScore != null;
  const mine = m.home.teamId === myTeamId || m.away.teamId === myTeamId;
  const pens = played && m.homePens != null && m.awayPens != null;
  return (
    <div className={`px-4 py-3 border-b border-gray-50 last:border-b-0 ${mine ? "bg-pitch-50" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <TeamName side={m.home} bold={played && m.winnerTeamId === m.home.teamId} />
          <TeamName side={m.away} bold={played && m.winnerTeamId === m.away.teamId} />
        </div>
        {played ? (
          <div className="shrink-0 text-right">
            <div className="font-heading font-[800] text-base tabular-nums leading-tight">{m.homeScore}</div>
            <div className="font-heading font-[800] text-base tabular-nums leading-tight mt-1.5">{m.awayScore}</div>
          </div>
        ) : (
          <div className="shrink-0 text-sm text-muted text-right">{timeLabel(m.scheduledAt)}</div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {m.venue?.name && <span>{m.venue.isMain ? "🏟️ " : ""}{m.venue.name}</span>}
        {pens && <span>na penalty {m.homePens}:{m.awayPens}</span>}
        {played && m.attendance != null && m.attendance > 0 && <span>{m.attendance.toLocaleString("cs")} diváků</span>}
        {played && <Link href={`/zapas/${m.id}`} className="font-heading font-bold text-pitch-600 hover:underline">Detail →</Link>}
        {!played && mine && <Link href={`/zapas?calendarId=${m.id}`} className="font-heading font-bold text-pitch-600 hover:underline">Sestava →</Link>}
      </div>
    </div>
  );
}

function DayBlock({ title, matches, myTeamId }: { title: string; matches: CompetitionMatch[]; myTeamId: string | null }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="card mt-2">
        {matches.map((m) => <MatchRow key={m.id} m={m} myTeamId={myTeamId} />)}
      </div>
    </div>
  );
}

function Standings({ rows, advancing, myTeamId }: { rows: StandingRow[]; advancing: number; myTeamId: string | null }) {
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
            <Dot color={r.color} />
            <Link href={`/tym/${r.teamId}`} className="truncate text-base font-bold hover:underline">{r.name}</Link>
          </span>
          <span className="w-8 text-center text-sm tabular-nums">{r.played}</span>
          <span className="w-14 text-center text-sm tabular-nums">{r.goalsFor}:{r.goalsAgainst}</span>
          <span className="w-8 text-right font-heading font-[800] text-base tabular-nums">{r.points}</span>
        </div>
      ))}
      <div className="px-4 py-2 text-sm text-muted">Pod čarou končí ligová fáze, nad ní se postupuje do play-off.</div>
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

  const leagueDays = [...new Set(matches.filter((m) => m.stage === "league").map((m) => m.day))].sort((a, b) => a - b);
  const byDay = (day: number) => matches.filter((m) => m.day === day);
  const nextDay = matches.filter((m) => m.status !== "simulated").reduce<number | null>((min, m) => (min == null || m.day < min ? m.day : min), null);
  const lastPlayedDay = matches.filter((m) => m.status === "simulated").reduce<number | null>((max, m) => (max == null || m.day > max ? m.day : max), null);
  const myNext = matches
    .filter((m) => m.status !== "simulated" && (m.home.teamId === myTeamId || m.away.teamId === myTeamId))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const winner = winnerTeamId ? standings.find((s) => s.teamId === winnerTeamId) ?? null : null;
  const playoffStages = (["qf", "sf", "final"] as const).filter((st) => matches.some((m) => m.stage === st));

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
              <div className="text-sm text-muted">Tvůj další zápas · {stageTitle(myNext)} · {dayLabel(myNext.scheduledAt)} v {timeLabel(myNext.scheduledAt)}</div>
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
          { key: "tabulka", label: "Tabulka", icon: "📊" },
          { key: "rozpis", label: "Rozpis", icon: "📅" },
          { key: "playoff", label: "Play-off", icon: "🏆" },
          { key: "strelci", label: "Střelci", icon: "⚽" },
          { key: "info", label: "Info", icon: "ℹ️" },
        ]}
      />

      {tab === "prehled" && (
        <div className="space-y-5">
          {nextDay != null && <DayBlock title={`Příští zápasy · ${stageTitle(byDay(nextDay)[0])} · ${dayLabel(byDay(nextDay)[0].scheduledAt)}`} matches={byDay(nextDay)} myTeamId={myTeamId} />}
          {lastPlayedDay != null && <DayBlock title={`Poslední výsledky · ${stageTitle(byDay(lastPlayedDay)[0])}`} matches={byDay(lastPlayedDay)} myTeamId={myTeamId} />}
        </div>
      )}

      {tab === "tabulka" && <Standings rows={standings} advancing={advancing} myTeamId={myTeamId} />}

      {tab === "rozpis" && (
        <div className="space-y-5">
          {[...leagueDays, ...playoffStages.map((st) => matches.find((m) => m.stage === st)?.day ?? 0)]
            .filter((d, i, arr) => d > 0 && arr.indexOf(d) === i)
            .map((d) => <DayBlock key={d} title={`${stageTitle(byDay(d)[0])} · ${dayLabel(byDay(d)[0].scheduledAt)}`} matches={byDay(d)} myTeamId={myTeamId} />)}
        </div>
      )}

      {tab === "playoff" && (
        playoffStages.length === 0 ? (
          <div className="card p-8 text-center text-muted text-sm">Play-off se rozlosuje po ligové fázi. Postupuje {advancing} nejlepších z tabulky.</div>
        ) : (
          <div className="space-y-5">
            {[...playoffStages].reverse().map((st) => (
              <DayBlock key={st} title={STAGE_NAME[st]} matches={matches.filter((m) => m.stage === st)} myTeamId={myTeamId} />
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
    </div>
  );
}
