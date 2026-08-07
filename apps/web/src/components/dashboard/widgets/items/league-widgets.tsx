"use client";

/** Widgety kolem ligy — tabulka, bilance, žebříčky střelců a grafy sezóny. */

import Link from "next/link";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import {
  DonutChart, LineChart, BarChart, StackedBar, HBarChart,
  DIVERGING, seriesColor, ChartEmpty, ChartHero,
} from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { ScorerRow, MoreLink, FormChip, safeTeamColor } from "./shared";

// ── Tabulka ─────────────────────────────────────────────────────────────────

export function StandingsWidget({ data, height }: WidgetProps) {
  if (data.standings.loading) return <WidgetSkeleton rows={6} />;
  if (data.standings.error) return <WidgetError />;
  const standings = data.standings.data ?? [];
  if (standings.length === 0) return <ChartEmpty>Tabulka zatím není k dispozici.</ChartEmpty>;

  return (
    <>
      <div className="overflow-x-auto -mx-4 sm:-mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-label border-b border-gray-200 text-[11px] uppercase tracking-wide">
              <th className="pb-1.5 pl-4 sm:pl-5 pr-1 w-6">#</th>
              <th className="pb-1.5 pr-2">Tým</th>
              <th className="pb-1.5 pr-1 text-center w-8">Z</th>
              <th className="pb-1.5 pr-1 text-center w-8">V</th>
              <th className="pb-1.5 pr-1 text-center w-8">R</th>
              <th className="pb-1.5 pr-1 text-center w-8">P</th>
              <th className="pb-1.5 pr-4 sm:pr-5 text-center w-8">B</th>
            </tr>
          </thead>
          <tbody>
            {standings.slice(0, rowsForHeight(height, ROW_PX.table, 60)).map((s) => (
              <tr key={s.teamId ?? s.pos} className={`border-b border-gray-50 ${s.isPlayer ? "bg-pitch-50/50 font-bold" : ""}`}>
                <td className="py-1 pl-3 sm:pl-5 pr-1 tabular-nums text-muted text-sm align-top pt-2">{s.pos}</td>
                <td className="py-1 pr-1 align-top pt-2">
                  {s.teamId ? (
                    <Link href={`/dashboard/team/${s.teamId}`} className={`text-sm hover:text-pitch-500 transition-colors leading-tight ${s.isPlayer ? "font-heading font-bold" : ""}`}>
                      {s.team}
                    </Link>
                  ) : (
                    <span className={`text-sm leading-tight ${s.isPlayer ? "font-heading font-bold" : ""}`}>{s.team}</span>
                  )}
                </td>
                <td className="py-1 px-1 text-center tabular-nums text-sm">{s.played}</td>
                <td className="py-1 px-1 text-center tabular-nums text-sm">{s.wins}</td>
                <td className="py-1 px-1 text-center tabular-nums text-sm">{s.draws}</td>
                <td className="py-1 px-1 text-center tabular-nums text-sm">{s.losses}</td>
                <td className="py-1 pr-3 sm:pr-5 text-center tabular-nums text-sm font-heading font-bold">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoreLink href="/dashboard/liga">Celá tabulka →</MoreLink>
    </>
  );
}

// ── Bilance ─────────────────────────────────────────────────────────────────

export function SeasonRecordWidget({ data }: WidgetProps) {
  if (data.standings.loading) return <WidgetSkeleton rows={4} />;
  const me = (data.standings.data ?? []).find((s) => s.isPlayer);
  if (!me) return <ChartEmpty>Zatím bez odehraných zápasů.</ChartEmpty>;

  const form = data.matchResults.data?.form ?? [];
  const diff = (me.gf ?? 0) - (me.ga ?? 0);

  return (
    <div className="space-y-2">
      <ChartHero value={`${me.pos}.`} note={`${me.points} bodů · ${me.played} zápasů`} color={safeTeamColor(data.team.data)} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <RecordTile value={me.wins} label="Výhry" className="text-pitch-500" />
        <RecordTile value={me.draws} label="Remízy" />
        <RecordTile value={me.losses} label="Prohry" className="text-card-red" />
      </div>
      <div className="text-center text-sm text-muted">
        Skóre <span className="font-heading font-bold text-ink tabular-nums">{me.gf}:{me.ga}</span>
        <span className="ml-1 tabular-nums">({diff >= 0 ? "+" : ""}{diff})</span>
      </div>
      {form.length > 0 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          {form.map((f, i) => <FormChip key={i} result={f} />)}
        </div>
      )}
      <MoreLink href="/dashboard/liga">Zobrazit tabulku →</MoreLink>
    </div>
  );
}

function RecordTile({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg py-1.5">
      <div className={`font-heading font-bold text-lg tabular-nums ${className}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase">{label}</div>
    </div>
  );
}

// ── Žebříčky vlastního týmu ─────────────────────────────────────────────────

export function TopScorersWidget({ data }: WidgetProps) {
  return <TopList data={data} kind="goals" empty="Zatím žádné góly." />;
}
export function TopAssistsWidget({ data }: WidgetProps) {
  return <TopList data={data} kind="assists" empty="Zatím žádné asistence." />;
}
export function TopRatedWidget({ data }: WidgetProps) {
  return <TopList data={data} kind="rating" empty="Zatím žádná hodnocení." />;
}

function TopList({ data, kind, empty }: { data: WidgetProps["data"]; kind: "goals" | "assists" | "rating"; empty: string }) {
  if (data.matchResults.loading) return <WidgetSkeleton />;
  if (data.matchResults.error) return <WidgetError />;
  const players = data.matchResults.data?.topPlayers ?? [];

  const list = kind === "rating"
    ? [...players].filter((p) => p.appearances >= 1).sort((a, b) => b.avgRating - a.avgRating).slice(0, 5)
    : [...players].filter((p) => p[kind] > 0).sort((a, b) => b[kind] - a[kind]).slice(0, 5);

  if (list.length === 0) return <div className="text-sm text-muted py-2">{empty}</div>;

  return (
    <>
      {list.map((p, i) => (
        <ScorerRow key={p.playerId} p={p} i={i}>
          {kind === "rating" ? (
            <span className={`font-heading font-bold text-sm px-1.5 py-0.5 rounded tabular-nums ${
              p.avgRating >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"
            }`}>{p.avgRating?.toFixed(1)}</span>
          ) : (
            <span className="font-heading font-bold tabular-nums">{p[kind]}</span>
          )}
        </ScorerRow>
      ))}
    </>
  );
}

// ── Výhry / remízy / prohry ─────────────────────────────────────────────────

export function ResultsDonutWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const s = data.matchResults.data?.summary;
  if (!s || s.played === 0) return <ChartEmpty>Zatím bez odehraných zápasů.</ChartEmpty>;

  const pointsPerMatch = ((s.wins * 3 + s.draws) / s.played).toFixed(2);

  return (
    <div className="space-y-3">
      <DonutChart
        slices={[
          { label: "Výhry", value: s.wins, color: DIVERGING.positive },
          { label: "Remízy", value: s.draws, color: DIVERGING.neutral },
          { label: "Prohry", value: s.losses, color: DIVERGING.negative },
        ]}
        centerValue={String(s.played)}
        centerLabel="zápasů"
      />
      <div className="text-sm text-muted text-center">
        Bodů na zápas <span className="font-heading font-bold text-ink tabular-nums">{pointsPerMatch}</span>
      </div>
    </div>
  );
}

// ── Vývoj bodů po kolech ────────────────────────────────────────────────────

export function PointsProgressionWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const matches = [...(data.matchResults.data?.matches ?? [])]
    .filter((m) => m.round != null)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  if (matches.length < 2) return <ChartEmpty>Na graf je potřeba aspoň dvě odehraná kola.</ChartEmpty>;

  let sum = 0;
  const points = matches.map((m) => { sum += m.result === "W" ? 3 : m.result === "D" ? 1 : 0; return sum; });
  const labels = matches.map((m) => `${m.round}. kolo`);

  return (
    <LineChart
      series={[{ label: "Body", points }]}
      labels={labels}
      formatValue={(v) => String(Math.round(v))}
    />
  );
}

// ── Vstřelené a inkasované po kolech ────────────────────────────────────────

export function GoalsPerRoundWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const matches = [...(data.matchResults.data?.matches ?? [])]
    .filter((m) => m.round != null)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
    .slice(-12);
  if (matches.length === 0) return <ChartEmpty>Zatím bez odehraných zápasů.</ChartEmpty>;

  const scored = matches.map((m) => (m.isHome ? m.homeScore : m.awayScore));
  const conceded = matches.map((m) => (m.isHome ? m.awayScore : m.homeScore));

  return (
    <BarChart
      categories={matches.map((m) => String(m.round))}
      series={[
        { label: "Vstřelené", color: DIVERGING.positive, values: scored },
        { label: "Inkasované", color: DIVERGING.negative, values: conceded },
      ]}
      formatValue={(v) => String(Math.round(v))}
      labelEvery={1}
    />
  );
}

// ── Doma vs. venku ──────────────────────────────────────────────────────────

export function HomeAwaySplitWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const matches = data.matchResults.data?.matches ?? [];
  if (matches.length === 0) return <ChartEmpty>Zatím bez odehraných zápasů.</ChartEmpty>;

  const tally = (home: boolean) => {
    const sub = matches.filter((m) => m.isHome === home);
    return {
      wins: sub.filter((m) => m.result === "W").length,
      draws: sub.filter((m) => m.result === "D").length,
      losses: sub.filter((m) => m.result === "L").length,
      played: sub.length,
      points: sub.reduce((s, m) => s + (m.result === "W" ? 3 : m.result === "D" ? 1 : 0), 0),
    };
  };
  const home = tally(true);
  const away = tally(false);

  return (
    <div className="space-y-4">
      {[{ t: "Doma", d: home }, { t: "Venku", d: away }].map(({ t, d }) => (
        <div key={t}>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="font-heading font-bold text-sm">{t}</span>
            <span className="text-sm text-muted tabular-nums">
              {d.played} zápasů · <span className="font-heading font-bold text-ink">{d.points} b.</span>
            </span>
          </div>
          <StackedBar
            segments={[
              { label: "Výhry", value: d.wins, color: DIVERGING.positive },
              { label: "Remízy", value: d.draws, color: DIVERGING.neutral },
              { label: "Prohry", value: d.losses, color: DIVERGING.negative },
            ]}
            showLegend={t === "Venku"}
            height={24}
          />
        </div>
      ))}
    </div>
  );
}

// ── Nejlepší střelci ligy ───────────────────────────────────────────────────

export function LeagueScorersWidget({ data, teamId, height }: WidgetProps) {
  if (data.leagueStats.loading) return <WidgetSkeleton />;
  if (data.leagueStats.error) return <WidgetError />;
  const rows = (data.leagueStats.data?.topScorers ?? []).filter((r) => r.goals > 0).slice(0, rowsForHeight(height, ROW_PX.bar));
  if (rows.length === 0) return <ChartEmpty>V lize zatím nepadl gól.</ChartEmpty>;

  return (
    <HBarChart
      data={rows.map((r) => ({
        label: `${r.name} · ${r.teamName}`,
        value: r.goals,
        href: `/dashboard/player/${r.playerId}`,
        color: r.teamId === teamId ? DIVERGING.positive : "#B5AFA5",
      }))}
    />
  );
}

// ── Karty v lize ────────────────────────────────────────────────────────────

export function LeagueCardsWidget({ data, height }: WidgetProps) {
  if (data.leagueStats.loading) return <WidgetSkeleton />;
  if (data.leagueStats.error) return <WidgetError />;
  const rows = (data.leagueStats.data?.mostCards ?? []).filter((r) => r.yellowCards + r.redCards > 0).slice(0, rowsForHeight(height, ROW_PX.bar));
  if (rows.length === 0) return <ChartEmpty>V lize zatím nepadla karta.</ChartEmpty>;

  const max = Math.max(...rows.map((r) => r.yellowCards + r.redCards), 1);

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.playerId}>
          <div className="flex items-baseline gap-2 mb-1">
            <a href={`/dashboard/player/${r.playerId}`} className="text-sm truncate min-w-0 flex-1 hover:text-pitch-500 hover:underline transition-colors">
              {r.name} <span className="text-muted">· {r.teamName}</span>
            </a>
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">
              {r.yellowCards}<span className="text-muted">Ž</span> {r.redCards}<span className="text-muted">Č</span>
            </span>
          </div>
          <div className="flex h-2 gap-[2px]">
            <div className="rounded-l-[4px]" style={{ width: `${(r.yellowCards / max) * 100}%`, background: "#F5C542" }} title={`Žluté: ${r.yellowCards}`} />
            <div className="rounded-r-[4px]" style={{ width: `${(r.redCards / max) * 100}%`, background: DIVERGING.negative }} title={`Červené: ${r.redCards}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Pohár ───────────────────────────────────────────────────────────────────

export function CupProgressWidget({ data }: WidgetProps) {
  if (data.cup.loading) return <WidgetSkeleton rows={4} />;
  if (data.cup.error) return <WidgetError />;
  const cup = data.cup.data;
  if (!cup?.cup) return <ChartEmpty>Pohár právě neběží.</ChartEmpty>;

  const my = cup.myTeam;
  const reached = my?.eliminatedRound ?? cup.cup.currentRound;
  const status = my?.isChampion ? "Vítěz poháru!" : my?.alive ? "Ještě jsme ve hře" : `Vypadli jsme v ${reached}. kole`;

  return (
    <div className="space-y-3">
      <ChartHero
        value={`${reached}/${cup.cup.totalRounds}`}
        note={status}
        color={my?.isChampion ? "#C4A035" : my?.alive ? DIVERGING.positive : undefined}
      />
      <ol className="space-y-1">
        {cup.myMatches.map((m) => (
          <li key={m.matchId} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <span className="text-sm text-muted w-24 shrink-0 truncate">{m.roundName}</span>
            <span className="text-sm font-heading font-bold flex-1 truncate">{m.opponent?.name ?? "—"}</span>
            <span className="text-[11px] text-muted uppercase">{m.isHome ? "D" : "V"}</span>
            {m.myScore != null && m.oppScore != null ? (
              <span className={`text-sm font-heading font-bold tabular-nums px-1.5 py-0.5 rounded ${
                m.won ? "bg-pitch-50 text-pitch-600" : "bg-red-50 text-card-red"
              }`}>{m.myScore}:{m.oppScore}</span>
            ) : (
              <span className="text-sm text-muted">{m.daysUntil != null ? `za ${m.daysUntil} d` : "—"}</span>
            )}
          </li>
        ))}
      </ol>
      <MoreLink href="/dashboard/pohar">Celý pavouk →</MoreLink>
    </div>
  );
}

// ── Umístění po sezónách ────────────────────────────────────────────────────

export function SeasonHistoryWidget({ data, teamId }: WidgetProps) {
  if (data.seasonHistory.loading) return <WidgetSkeleton rows={4} />;
  if (data.seasonHistory.error) return <WidgetError />;
  const history = data.seasonHistory.data ?? [];

  const points = history
    .map((h) => {
      const season = h.seasonNumber ?? h.season_number ?? 0;
      const standings = h.finalStandings ?? [];
      const idx = standings.findIndex((s) => s.teamId === teamId);
      return idx >= 0 ? { season, pos: standings[idx].pos ?? idx + 1 } : null;
    })
    .filter((x): x is { season: number; pos: number } => x !== null)
    .sort((a, b) => a.season - b.season);

  if (points.length < 2) return <ChartEmpty>Historie začne dávat smysl po druhé dohrané sezóně.</ChartEmpty>;

  // Menší číslo = lepší umístění, takže osu obracíme přes zápornou hodnotu.
  return (
    <LineChart
      series={[{ label: "Umístění", points: points.map((p) => -p.pos), color: seriesColor(0) }]}
      labels={points.map((p) => `${p.season}. sezóna`)}
      formatValue={(v) => `${Math.abs(Math.round(v))}.`}
      fill={false}
    />
  );
}
