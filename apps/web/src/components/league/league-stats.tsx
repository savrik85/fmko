"use client";

// Statistiky soutěže (střelci, nahrávky, brankáři, týmy, zajímavosti). Sdílí je liga
// áčka i U21, data z `/api/teams/:teamId/league-stats`.

import { useState } from "react";
import Link from "next/link";
import { Spinner, BadgePreview, PositionBadge } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface PlayerStat {
  playerId: string; name: string; position: string; teamId: string; teamName: string; teamColor: string;
  teamSecondary: string; teamBadge: string;
  goals: number; assists: number; appearances: number; motm: number;
  yellowCards: number; redCards: number; avgRating: number; cleanSheets: number;
  penaltyGoals: number; penaltyMisses: number; penaltyAttempts: number; setPieceGoals: number;
  saves: number; penaltySaves: number; goalsConceded: number; keeperMatches: number; concededPerMatch: number;
  fouls: number; chances: number; injuries: number; minutesPlayed: number;
  shotAccuracy: number; goalsPer90: number;
  isMyTeam: boolean;
}

interface TeamStat {
  teamId: string; teamName: string; teamColor: string; teamSecondary: string; teamBadge: string;
  penaltyGoals: number; penaltyAttempts: number; setPieceGoals: number;
  yellowCards: number; redCards: number; fouls: number; isMyTeam: boolean;
  goalsFor: number; goalsAgainst: number; played: number;
  homeWins: number; homeDraws: number; homeLosses: number;
  awayWins: number; awayDraws: number; awayLosses: number;
  avgAttendance: number; avgPossession: number;
  longestUnbeaten: number; longestWinStreak: number;
}

interface Curiosity {
  matchId: string; homeName: string; awayName: string; homeScore: number; awayScore: number; value: number;
}

interface Curiosities {
  fastestGoal: Curiosity | null; wildestMatch: Curiosity | null; biggestWin: Curiosity | null;
  mostGoals: Curiosity | null; biggestAttendance: Curiosity | null;
}

export interface StatsData {
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  topRated: PlayerStat[];
  mostCards: PlayerStat[];
  mostAppearances: PlayerStat[];
  topPenalties: PlayerStat[];
  topSetPieces: PlayerStat[];
  topKeepers: PlayerStat[];
  topCleanSheets: PlayerStat[];
  topSaves: PlayerStat[];
  teamPenalties: TeamStat[];
  teamSetPieces: TeamStat[];
  teamCards: TeamStat[];
  mostFouls: PlayerStat[];
  mostMinutes: PlayerStat[];
  mostInjuries: PlayerStat[];
  topAccuracy: PlayerStat[];
  topGoalsPer90: PlayerStat[];
  teamAttack: TeamStat[];
  teamDefense: TeamStat[];
  teamAttendance: TeamStat[];
  teamPossession: TeamStat[];
  teamCleanest: TeamStat[];
  teamUnbeaten: TeamStat[];
  teamWinStreak: TeamStat[];
  teamHomeAway: TeamStat[];
  curiosities: Curiosities | null;
}

function ini(n: string) { return n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function golPlural(n: number): string { return n === 1 ? "gól" : n >= 2 && n <= 4 ? "góly" : "gólů"; }

type StatSection = "hraci" | "brankari" | "tymy" | "zajimavosti";

export function LeagueStatsTab({ data, loaded }: { data: StatsData | null; loaded: boolean }) {
  const [section, setSection] = useState<StatSection>("hraci");
  if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  if (!data) return <div className="card p-8 text-center text-muted">Zatím žádné statistiky.</div>;

  const {
    topScorers, topAssists, topRated, mostCards, mostAppearances,
    topPenalties = [], topSetPieces = [], topKeepers = [], topCleanSheets = [], topSaves = [],
    teamPenalties = [], teamSetPieces = [], teamCards = [],
    mostFouls = [], mostMinutes = [], mostInjuries = [], topAccuracy = [], topGoalsPer90 = [],
    teamAttack = [], teamDefense = [], teamAttendance = [], teamPossession = [], teamCleanest = [],
    teamUnbeaten = [], teamWinStreak = [], teamHomeAway = [], curiosities = null,
  } = data;
  const hasAny = topScorers.length > 0 || topAssists.length > 0 || topRated.length > 0 || mostCards.length > 0;
  if (!hasAny) return <div className="card p-8 text-center text-muted">Zatím žádné statistiky.</div>;

  const hasKeepers = topKeepers.length > 0 || topCleanSheets.length > 0 || topSaves.length > 0;
  const hasTeams = teamPenalties.length > 0 || teamSetPieces.length > 0 || teamCards.length > 0
    || teamAttack.length > 0 || teamAttendance.length > 0;
  const cur = curiosities;
  const hasCuriosities = !!(cur && (cur.fastestGoal || cur.wildestMatch || cur.biggestWin || cur.mostGoals || cur.biggestAttendance));

  // Sekce se přepínají místo skládání pod sebe — na mobilu by 22 tabulek znamenalo
  // desítky obrazovek scrollování, než se člověk dostane ke kuriozitám.
  const sections: Array<{ key: StatSection; label: string; show: boolean }> = [
    { key: "hraci", label: "Hráči", show: true },
    { key: "brankari", label: "Brankáři", show: hasKeepers },
    { key: "tymy", label: "Týmy", show: hasTeams },
    { key: "zajimavosti", label: "Zajímavosti", show: hasCuriosities },
  ];
  const visible = sections.filter((s) => s.show);
  const active = visible.some((s) => s.key === section) ? section : "hraci";

  return (
    <div className="space-y-4">
    {visible.length > 1 && (
      <div className="flex gap-1 bg-surface rounded-xl p-1 overflow-x-auto">
        {visible.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex-1 whitespace-nowrap px-3 py-2 rounded-soft text-sm font-heading font-bold transition-colors ${
              active === s.key ? "bg-white text-pitch-600 shadow-sm" : "text-muted hover:text-ink"
            }`}
          >{s.label}</button>
        ))}
      </div>
    )}

    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${active === "hraci" ? "" : "hidden"}`}>
      {topScorers.length > 0 && (
        <StatTable title="⚽ Nejlepší střelci" rows={topScorers} valueKey="goals" label="Góly" />
      )}
      {topAssists.length > 0 && (
        <StatTable title="👟 Nejlepší nahrávači" rows={topAssists} valueKey="assists" label="Asist." />
      )}
      {topRated.length > 0 && (
        <StatTable title="⭐ Nejlepší hodnocení" rows={topRated} valueKey="avgRating" label="Hod." decimal />
      )}
      {mostAppearances.length > 0 && (
        <StatTable title="🏃 Nejvíc zápasů" rows={mostAppearances} valueKey="appearances" label="Zápasy" />
      )}
      {mostCards.length > 0 && (
        <StatTable title="🟨 Nejvíc karet" rows={mostCards} valueKey="cards" label="Karty" renderValue={(p) => (
          <span className="flex items-center gap-1.5 justify-end whitespace-nowrap">
            {p.yellowCards > 0 && <span className="text-gold-500 font-heading font-bold">{p.yellowCards}🟨</span>}
            {p.redCards > 0 && <span className="text-card-red font-heading font-bold">{p.redCards}🟥</span>}
          </span>
        )} />
      )}
      {topPenalties.length > 0 && (
        <StatTable title="🎯 Exekutoři penalt" rows={topPenalties} valueKey="penaltyGoals" label="Penalty" renderValue={(p) => (
          <span className="flex items-baseline gap-1 justify-end">
            <span>{p.penaltyGoals}</span>
            <span className="text-muted text-sm font-heading font-bold">/{p.penaltyAttempts}</span>
          </span>
        )} />
      )}
      {topSetPieces.length > 0 && (
        <StatTable title="🥅 Góly ze standardek" rows={topSetPieces} valueKey="setPieceGoals" label="Standardky" />
      )}
      {topGoalsPer90.length > 0 && (
        <StatTable title="⏱ Góly na 90 minut" rows={topGoalsPer90} valueKey="goalsPer90" label="Na 90" renderValue={(p) => (
          <span className="flex items-baseline gap-1 justify-end">
            <span>{p.goalsPer90.toFixed(2)}</span>
            <span className="hidden sm:inline text-muted text-xs font-heading">{p.goals} g / {p.minutesPlayed} min</span>
          </span>
        )} />
      )}
      {topAccuracy.length > 0 && (
        <StatTable title="🎯 Úspěšnost zakončení" rows={topAccuracy} valueKey="shotAccuracy" label="Úspěšnost" renderValue={(p) => (
          <span className="flex items-baseline gap-1 justify-end">
            <span>{p.shotAccuracy}%</span>
            <span className="hidden sm:inline text-muted text-xs font-heading">{p.goals} z {p.goals + p.chances}</span>
          </span>
        )} />
      )}
      {mostMinutes.length > 0 && (
        <StatTable title="🕐 Nejvíc odehraných minut" rows={mostMinutes} valueKey="minutesPlayed" label="Minuty" renderValue={(p) => (
          <span className="flex items-baseline gap-1 justify-end">
            <span>{p.minutesPlayed}</span>
            <span className="hidden sm:inline text-muted text-xs font-heading">min</span>
          </span>
        )} />
      )}
      {mostFouls.length > 0 && (
        <StatTable title="🦵 Nejvíc faulů" rows={mostFouls} valueKey="fouls" label="Fauly" />
      )}
      {mostInjuries.length > 0 && (
        <StatTable title="🩹 Nejvíc zranění" rows={mostInjuries} valueKey="injuries" label="Zranění" />
      )}
    </div>

    {hasKeepers && active === "brankari" && (
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topKeepers.length > 0 && (
            <StatTable title="🧤 Nejmíň inkasovaných" rows={topKeepers} valueKey="concededPerMatch" label="Na zápas" renderValue={(p) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{p.concededPerMatch.toFixed(1)}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">z {p.keeperMatches} záp.</span>
              </span>
            )} />
          )}
          {topCleanSheets.length > 0 && (
            <StatTable title="🛡 Čistá konta" rows={topCleanSheets} valueKey="cleanSheets" label="Nuly" />
          )}
          {topSaves.length > 0 && (
            <StatTable title="✋ Nejvíc zákroků" rows={topSaves} valueKey="saves" label="Zákroky" renderValue={(p) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{p.saves + p.penaltySaves}</span>
                {p.penaltySaves > 0 && <span className="hidden sm:inline text-muted text-xs font-heading">z toho {p.penaltySaves} pen.</span>}
              </span>
            )} />
          )}
        </div>
      </div>
    )}

    {hasTeams && active === "tymy" && (
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {teamPenalties.length > 0 && (
            <TeamTable title="🎯 Nejvíc kopaných penalt" rows={teamPenalties} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.penaltyAttempts}</span>
                <span className="text-muted text-sm font-heading font-bold">({t.penaltyGoals} {golPlural(t.penaltyGoals)})</span>
              </span>
            )} />
          )}
          {teamSetPieces.length > 0 && (
            <TeamTable title="🥅 Góly ze standardek" rows={teamSetPieces} renderValue={(t) => <span>{t.setPieceGoals}</span>} />
          )}
          {teamCards.length > 0 && (
            <TeamTable title="🟨 Nejvíc karet" rows={teamCards} renderValue={(t) => (
              <span className="flex items-center gap-1.5 justify-end whitespace-nowrap">
                {t.yellowCards > 0 && <span className="text-gold-500 font-heading font-bold">{t.yellowCards}🟨</span>}
                {t.redCards > 0 && <span className="text-card-red font-heading font-bold">{t.redCards}🟥</span>}
              </span>
            )} />
          )}
          {teamAttack.length > 0 && (
            <TeamTable title="⚔️ Nejlepší útok" rows={teamAttack} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.goalsFor}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">{(t.goalsFor / Math.max(1, t.played)).toFixed(1)} / záp.</span>
              </span>
            )} />
          )}
          {teamDefense.length > 0 && (
            <TeamTable title="🛡 Nejlepší obrana" rows={teamDefense} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.goalsAgainst}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">{(t.goalsAgainst / Math.max(1, t.played)).toFixed(1)} / záp.</span>
              </span>
            )} />
          )}
          {teamAttendance.length > 0 && (
            <TeamTable title="👥 Průměrná návštěva doma" rows={teamAttendance} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.avgAttendance}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">diváků</span>
              </span>
            )} />
          )}
          {teamPossession.length > 0 && (
            <TeamTable title="🔵 Průměrné držení míče" rows={teamPossession} renderValue={(t) => <span>{t.avgPossession}%</span>} />
          )}
          {teamCleanest.length > 0 && (
            <TeamTable title="😇 Nejčistší tým" rows={teamCleanest} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.fouls}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">faulů · {t.yellowCards + t.redCards} karet</span>
              </span>
            )} />
          )}
          {teamUnbeaten.length > 0 && (
            <TeamTable title="🔥 Nejdelší neporazitelnost" rows={teamUnbeaten} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.longestUnbeaten}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">zápasů</span>
              </span>
            )} />
          )}
          {teamWinStreak.length > 0 && (
            <TeamTable title="🏆 Nejvíc výher v řadě" rows={teamWinStreak} renderValue={(t) => (
              <span className="flex items-baseline gap-1 justify-end">
                <span>{t.longestWinStreak}</span>
                <span className="hidden sm:inline text-muted text-xs font-heading">výher</span>
              </span>
            )} />
          )}
          {teamHomeAway.length > 0 && (
            <TeamTable title="🏠 Doma vs. venku" rows={teamHomeAway} renderValue={(t) => (
              <span className="flex flex-col items-end text-sm leading-tight">
                <span className="text-pitch-600">D {t.homeWins}-{t.homeDraws}-{t.homeLosses}</span>
                <span className="text-muted">V {t.awayWins}-{t.awayDraws}-{t.awayLosses}</span>
              </span>
            )} />
          )}
        </div>
      </div>
    )}

    {hasCuriosities && cur && active === "zajimavosti" && (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CuriosityCard icon="⚡" title="Nejrychlejší gól" item={cur.fastestGoal} unit={(v) => `${v}. minuta`} />
          <CuriosityCard icon="🟥" title="Nejdivočejší zápas" item={cur.wildestMatch} unit={(v) => `${v} karet`} />
          <CuriosityCard icon="💥" title="Největší výhra" item={cur.biggestWin} unit={(v) => `rozdíl ${v}`} />
          <CuriosityCard icon="⚽" title="Nejvíc gólů v zápase" item={cur.mostGoals} unit={(v) => golPlural(v) === "gól" ? `${v} gól` : `${v} ${golPlural(v)}`} />
          <CuriosityCard icon="👥" title="Rekordní návštěva" item={cur.biggestAttendance} unit={(v) => `${v} diváků`} />
        </div>
      </div>
    )}
    </div>
  );
}

/** Jedna kuriozita — zápas a čím vyčnívá. Klik vede na detail zápasu. */
function CuriosityCard({ icon, title, item, unit }: {
  icon: string; title: string; item: Curiosity | null; unit: (v: number) => string;
}) {
  if (!item) return null;
  return (
    <Link href={`/zapas/${item.matchId}`} className="card p-3 hover:bg-gray-50 transition-colors block">
      <div className="flex items-start gap-2">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-heading font-bold uppercase text-muted">{title}</span>
            <span className="shrink-0 font-heading font-[800] text-sm text-pitch-600">{unit(item.value)}</span>
          </div>
          {/* Název zápasu na vlastním řádku — vedle hodnoty se na mobilu ořezával po pár znacích. */}
          <div className="font-heading font-bold text-base leading-tight">
            {item.homeName} <span className="tabular-nums">{item.homeScore}:{item.awayScore}</span> {item.awayName}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Žebříček týmů — stejný rytmus jako StatTable, jen bez hráče a pozice. */
function TeamTable({ title, rows, renderValue }: {
  title: string; rows: TeamStat[]; renderValue: (t: TeamStat) => React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-heading font-bold uppercase text-muted">{title}</span>
      </div>
      <table className="stat-table w-full text-sm table-fixed">
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.teamId} className={`border-b border-gray-50 last:border-b-0 ${t.isMyTeam ? "bg-pitch-50/40" : ""}`}>
              <td className="py-2 pl-3 w-8 text-center font-heading font-bold tabular-nums text-muted">{i + 1}</td>
              <td className="py-2 px-2 min-w-0">
                <Link href={`/tym/${t.teamId}`} className="flex items-center gap-2 min-w-0 hover:text-pitch-500 transition-colors">
                  <BadgePreview primary={t.teamColor} secondary={t.teamSecondary} pattern={t.teamBadge as BadgePattern} initials={ini(t.teamName)} size={18} />
                  <span className={`font-heading font-bold truncate ${t.isMyTeam ? "text-pitch-600" : ""}`}>{t.teamName}</span>
                </Link>
              </td>
              <td className="py-2 pr-4 w-24 sm:w-32 text-right font-heading font-[800] text-lg tabular-nums whitespace-nowrap">{renderValue(t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatTable({ title, rows, valueKey, label, decimal, renderValue }: {
  title: string; rows: PlayerStat[]; valueKey: string; label: string; decimal?: boolean;
  renderValue?: (p: PlayerStat) => React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-heading font-bold uppercase text-muted">{title}</span>
      </div>
      <table className="stat-table w-full text-sm table-fixed">
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className={`border-b border-gray-50 last:border-b-0 ${p.isMyTeam ? "bg-pitch-50/40" : ""}`}>
              <td className="py-1.5 pl-3 w-8 text-center align-top font-heading font-bold tabular-nums text-muted leading-snug">{i + 1}</td>
              {/* Mobil: tým pod jménem, aby se vešel celý název. Od sm výš vedle sebe jako dřív. */}
              <td className="py-1.5 px-2 min-w-0 align-top">
                {/* Mobil: první řádek odznak + jméno, druhý řádek tým odsazený pod jménem. */}
                <div className="flex items-start gap-2 min-w-0">
                  <span className="shrink-0 w-10 flex justify-center pt-px"><PositionBadge position={p.position as "GK" | "DEF" | "MID" | "FWD"} /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/hrac/${p.playerId}`} className={`block font-heading font-bold truncate leading-snug hover:text-pitch-500 transition-colors ${p.isMyTeam ? "text-pitch-600" : ""}`}>{p.name}</Link>
                    <Link href={`/tym/${p.teamId}`} className="sm:hidden flex items-center gap-1 min-w-0 leading-snug hover:text-pitch-500 transition-colors">
                      <BadgePreview primary={p.teamColor} secondary={p.teamSecondary} pattern={p.teamBadge as BadgePattern} initials={ini(p.teamName)} size={12} />
                      <span className="text-xs text-muted truncate">{p.teamName}</span>
                    </Link>
                  </div>
                  <Link href={`/tym/${p.teamId}`} className="hidden sm:flex items-center gap-1.5 shrink-0 max-w-[45%] hover:text-pitch-500 transition-colors">
                    <BadgePreview primary={p.teamColor} secondary={p.teamSecondary} pattern={p.teamBadge as BadgePattern} initials={ini(p.teamName)} size={16} />
                    <span className="text-xs text-muted truncate">{p.teamName}</span>
                  </Link>
                </div>
              </td>
              <td className="py-1.5 pr-4 w-24 sm:w-36 text-right align-top font-heading font-[800] text-lg leading-snug tabular-nums whitespace-nowrap">
                {renderValue ? renderValue(p) : decimal ? ((p as any)[valueKey] as number).toFixed(1) : (p as any)[valueKey]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
