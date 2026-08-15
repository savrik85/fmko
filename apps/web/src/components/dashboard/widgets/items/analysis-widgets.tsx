"use client";

/**
 * Analytické widgety — formy, které v katalogu chyběly: bodový graf s kvadranty,
 * heatmapa sezóny, vodopád rozpočtu a vývoj pozice v tabulce.
 */

import { WidgetSkeleton, WidgetError } from "../widget-frame";
import {
  ScatterChart, HeatmapGrid, Waterfall, LineChart, HBarChart,
  ChartEmpty, ChartHero, StatTile,
  DIVERGING, PRIMARY, seriesColor, compact, compactCZK, fullCZK,
} from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { MoreLink } from "./shared";

// ── Věk a rating ────────────────────────────────────────────────────────────

/** Hranice, kterými se kádr dělí na mladé/zkušené a slabší/lepší. */
const HRANICE_VEKU = 26;

export function SquadScatterWidget({ data }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={5} />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length < 3) return <ChartEmpty>Na graf je potřeba aspoň tři hráči.</ChartEmpty>;

  const ratingy = players.map((p) => p.overall_rating);
  const hraniceRatingu = Math.round(ratingy.reduce((a, b) => a + b, 0) / ratingy.length);

  return (
    <div className="space-y-2">
      <ScatterChart
        points={players.map((p) => ({
          label: `${p.first_name} ${p.last_name}`,
          x: p.age,
          y: p.overall_rating,
          size: p.weekly_wage ?? 0,
          color: p.age <= HRANICE_VEKU && p.overall_rating >= hraniceRatingu ? DIVERGING.positive
            : p.age > HRANICE_VEKU && p.overall_rating < hraniceRatingu ? DIVERGING.negative
            : PRIMARY,
        }))}
        xLabel="věk"
        yLabel="rating"
        xDivider={HRANICE_VEKU}
        yDivider={hraniceRatingu}
        quadrants={{
          topLeft: "mladí a dobří",
          topRight: "opory",
          bottomLeft: "vychovat",
          bottomRight: "na odchod",
        }}
        formatPoint={(p) => `${p.label} · ${p.x} let · rating ${p.y}${p.size ? ` · ${Math.round(p.size)} Kč/t` : ""}`}
      />
      <div className="text-sm text-muted text-center">
        Velikost bodu je týdenní mzda. Dělicí čáry: {HRANICE_VEKU} let a průměrný rating {hraniceRatingu}.
      </div>
    </div>
  );
}

// ── Sezóna v kostce ─────────────────────────────────────────────────────────

export function SeasonHeatmapWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const matches = [...(data.matchResults.data?.matches ?? [])]
    .filter((m) => m.round != null)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  if (matches.length === 0) return <ChartEmpty>Zatím bez odehraných zápasů.</ChartEmpty>;

  const barva = (r: string) => (r === "W" ? DIVERGING.positive : r === "L" ? DIVERGING.negative : DIVERGING.neutral);
  // Nejdelší série výher — z heatmapy ji jde vyčíst okem, ale číslo je jistota
  let nej = 0, ted = 0;
  for (const m of matches) { ted = m.result === "W" ? ted + 1 : 0; nej = Math.max(nej, ted); }

  return (
    <HeatmapGrid
      columns={10}
      // Písmeno nese výsledek, tvar domácí/venku. Dřív to bylo obráceně —
      // v políčku stálo D/V (doma/venku) a výsledek nesla jen barva, takže
      // legenda vysvětlovala barvy, ne písmena, a pro červenozelenou vadu
      // widget nenesl žádnou informaci.
      cells={matches.map((m) => ({
        key: m.id,
        color: barva(m.result),
        text: m.result === "W" ? "V" : m.result === "L" ? "P" : "R",
        outline: !m.isHome,
        tooltip: `${m.round}. kolo · ${m.opponent} · ${m.homeScore}:${m.awayScore} (${m.isHome ? "doma" : "venku"})`,
        href: `/dashboard/match/${m.id}`,
      }))}
      legend={[
        { label: "Výhra", color: DIVERGING.positive },
        { label: "Remíza", color: DIVERGING.neutral },
        { label: "Prohra", color: DIVERGING.negative },
      ]}
      note={<>Vyplněné políčko je zápas doma, obrysové venku. Nejdelší série výher: <span className="font-heading font-bold text-ink">{nej}</span></>}
    />
  );
}

// ── Kam tečou peníze ────────────────────────────────────────────────────────

export function BudgetWaterfallWidget({ data }: WidgetProps) {
  if (data.budget.loading) return <WidgetSkeleton rows={5} />;
  if (data.budget.error) return <WidgetError />;
  const w = data.budget.data?.weekly;
  if (!w) return <ChartEmpty>Rozpočet zatím není spočítaný.</ChartEmpty>;

  const kroky = [
    { label: "Příjmy celkem", delta: w.income.total },
    { label: "Mzdy hráčů", delta: -w.expenses.wages },
    { label: "Údržba", delta: -w.expenses.maintenance },
    { label: "Vybavení", delta: -w.expenses.equipment },
    { label: "Trénink", delta: -w.expenses.training },
    { label: "Splátky půjčky", delta: -w.expenses.loanRepayment },
  ].filter((k) => k.delta !== 0);

  return (
    <div className="space-y-3">
      <Waterfall steps={kroky} totalLabel="Týdenní bilance" formatValue={compactCZK} />
      <div className="text-sm text-muted text-center">
        Za sezónu {w.net >= 0 ? "přibude" : "ubude"}{" "}
        <span className="font-heading font-bold text-ink tabular-nums">{fullCZK(Math.abs(w.net) * 16)}</span>
      </div>
      <MoreLink href="/dashboard/finances">Detail financí →</MoreLink>
    </div>
  );
}

// ── Vývoj pozice v tabulce ──────────────────────────────────────────────────

export function PositionProgressionWidget({ data, teamId }: WidgetProps) {
  if (data.leagueResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.leagueResults.error) return <WidgetError />;
  const results = data.leagueResults.data ?? [];
  if (results.length === 0) return <ChartEmpty>V lize se zatím neodehrál žádný zápas.</ChartEmpty>;

  // Tabulka se nikde neukládá, takže ji přehrajeme kolo po kole z výsledků.
  const kola = [...new Set(results.map((r) => r.game_week ?? 0))].sort((a, b) => a - b);
  const body = new Map<string, { b: number; gf: number; ga: number }>();
  const pozice: number[] = [];

  for (const kolo of kola) {
    for (const m of results.filter((r) => (r.game_week ?? 0) === kolo)) {
      for (const [id, dal, dostal] of [
        [m.home_team_id, m.home_score, m.away_score],
        [m.away_team_id, m.away_score, m.home_score],
      ] as Array<[string, number, number]>) {
        const z = body.get(id) ?? { b: 0, gf: 0, ga: 0 };
        z.b += dal > dostal ? 3 : dal === dostal ? 1 : 0;
        z.gf += dal;
        z.ga += dostal;
        body.set(id, z);
      }
    }
    const poradi = [...body.entries()].sort((a, z) =>
      z[1].b - a[1].b || (z[1].gf - z[1].ga) - (a[1].gf - a[1].ga) || z[1].gf - a[1].gf);
    const i = poradi.findIndex(([id]) => id === teamId);
    if (i >= 0) pozice.push(i + 1);
  }

  if (pozice.length < 2) return <ChartEmpty>Na graf je potřeba aspoň dvě odehraná kola.</ChartEmpty>;

  const nej = Math.min(...pozice);
  const nejhorsi = Math.max(...pozice);

  return (
    <div className="space-y-2">
      {/* Menší číslo je lepší umístění, proto se osa obrací přes zápornou hodnotu */}
      <LineChart
        series={[{ label: "Pozice", points: pozice.map((p) => -p), color: seriesColor(0) }]}
        labels={kola.slice(0, pozice.length).map((k) => `${k}. kolo`)}
        formatValue={(v) => `${Math.abs(Math.round(v))}.`}
        fill={false}
      />
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Nejlépe" value={`${nej}.`} />
        <StatTile label="Nyní" value={`${pozice[pozice.length - 1]}.`} />
        <StatTile label="Nejhůř" value={`${nejhorsi}.`} />
      </div>
    </div>
  );
}

// ── Sezóna v číslech ────────────────────────────────────────────────────────

interface SeasonStats {
  matchesPlayed?: number; totalGoals?: number; goalsPerMatch?: number;
  totalAttendance?: number; totalBeer?: number;
  totalYellowCards?: number; totalRedCards?: number; longestWinStreak?: number;
  recordAttendance?: { value: number; homeTeam: string; awayTeam: string };
  biggestWin?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };
  wildestMatch?: { homeTeam: string; awayTeam: string; cards: number };
}

export function SeasonNumbersWidget({ data }: WidgetProps) {
  if (data.seasonHistory.loading) return <WidgetSkeleton rows={5} />;
  if (data.seasonHistory.error) return <WidgetError />;
  const zaznamy = data.seasonHistory.data ?? [];
  const posledni = zaznamy[0] as (typeof zaznamy)[number] & { seasonStats?: SeasonStats } | undefined;
  const s = posledni?.seasonStats;
  if (!s) return <ChartEmpty>První sezóna ještě neskončila.</ChartEmpty>;

  const cislo = posledni?.seasonNumber ?? posledni?.season_number;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Odehráno zápasů" value={String(s.matchesPlayed ?? 0)} />
        <StatTile label="Padlo gólů" value={String(s.totalGoals ?? 0)} />
        <StatTile label="Gólů na zápas" value={String(s.goalsPerMatch ?? 0)} />
        <StatTile label="Vypito piv" value={compact(s.totalBeer ?? 0)} />
      </div>
      <ul className="space-y-1.5 text-sm">
        {s.biggestWin && (
          <li className="flex gap-2">
            <span className="shrink-0">💥</span>
            <span className="text-muted">
              Nejvyšší výhra{" "}
              <span className="font-heading font-bold text-ink">
                {s.biggestWin.homeScore}:{s.biggestWin.awayScore}
              </span>{" "}
              — {s.biggestWin.homeTeam} vs. {s.biggestWin.awayTeam}
            </span>
          </li>
        )}
        {s.recordAttendance && (
          <li className="flex gap-2">
            <span className="shrink-0">🎟</span>
            <span className="text-muted">
              Rekordní návštěva <span className="font-heading font-bold text-ink">{s.recordAttendance.value}</span>{" "}
              — {s.recordAttendance.homeTeam}
            </span>
          </li>
        )}
        {s.wildestMatch && (
          <li className="flex gap-2">
            <span className="shrink-0">🟥</span>
            <span className="text-muted">
              Nejdivočejší zápas <span className="font-heading font-bold text-ink">{s.wildestMatch.cards} karet</span>{" "}
              — {s.wildestMatch.homeTeam} vs. {s.wildestMatch.awayTeam}
            </span>
          </li>
        )}
      </ul>
      <div className="text-micro text-muted text-center">
        {cislo != null ? `${cislo}. sezóna` : "Poslední dohraná sezóna"}
      </div>
    </div>
  );
}

// ── Minuty na hřišti ────────────────────────────────────────────────────────

export function PlayingTimeWidget({ data, height }: WidgetProps) {
  if (data.teamStats.loading) return <WidgetSkeleton />;
  if (data.teamStats.error) return <WidgetError />;
  const hraci = (data.teamStats.data ?? []).filter((p) => p.minutesPlayed > 0);
  if (hraci.length === 0) return <ChartEmpty>Zatím nikdo neodehrál ani minutu.</ChartEmpty>;

  const top = [...hraci].sort((a, b) => b.minutesPlayed - a.minutesPlayed)
    .slice(0, rowsForHeight(height, ROW_PX.bar, 32));
  const celkem = hraci.reduce((s, p) => s + p.minutesPlayed, 0);

  return (
    <div className="space-y-3">
      <HBarChart
        data={top.map((p) => ({
          label: `${p.firstName} ${p.lastName}`,
          value: p.minutesPlayed,
          display: `${p.minutesPlayed}′`,
          href: `/dashboard/player/${p.playerId}`,
        }))}
      />
      <div className="text-sm text-muted text-center">
        Rozehráno <span className="font-heading font-bold text-ink tabular-nums">{celkem.toLocaleString("cs")}</span> minut
        mezi {hraci.length} hráči
      </div>
    </div>
  );
}

// ── Muž zápasu ──────────────────────────────────────────────────────────────

export function ManOfMatchWidget({ data, height }: WidgetProps) {
  if (data.teamStats.loading) return <WidgetSkeleton />;
  if (data.teamStats.error) return <WidgetError />;
  const hraci = (data.teamStats.data ?? []).filter((p) => p.manOfMatch > 0);
  if (hraci.length === 0) return <ChartEmpty>Muž zápasu zatím nepadl na nikoho z týmu.</ChartEmpty>;

  const top = [...hraci].sort((a, b) => b.manOfMatch - a.manOfMatch)
    .slice(0, rowsForHeight(height, ROW_PX.bar));

  return (
    <HBarChart
      data={top.map((p) => ({
        label: `${p.firstName} ${p.lastName}`,
        value: p.manOfMatch,
        display: `${p.manOfMatch}×`,
        href: `/dashboard/player/${p.playerId}`,
      }))}
    />
  );
}

// ── Čistá konta ─────────────────────────────────────────────────────────────

export function CleanSheetsWidget({ data, height }: WidgetProps) {
  if (data.teamStats.loading) return <WidgetSkeleton />;
  if (data.teamStats.error) return <WidgetError />;
  const brankari = (data.teamStats.data ?? []).filter((p) => p.position === "GK" && p.appearances > 0);
  if (brankari.length === 0) return <ChartEmpty>Zatím nechytal žádný brankář.</ChartEmpty>;

  const top = [...brankari].sort((a, b) => b.cleanSheets - a.cleanSheets)
    .slice(0, rowsForHeight(height, ROW_PX.bar, 32));

  return (
    <div className="space-y-3">
      <HBarChart
        max={Math.max(...brankari.map((p) => p.appearances), 1)}
        data={top.map((p) => ({
          label: `${p.firstName} ${p.lastName}`,
          value: p.cleanSheets,
          display: `${p.cleanSheets} / ${p.appearances}`,
          href: `/dashboard/player/${p.playerId}`,
        }))}
      />
      <div className="text-micro text-muted text-center">Čistá konta ze všech odchytaných zápasů.</div>
    </div>
  );
}

// ── Disciplína ──────────────────────────────────────────────────────────────

export function DisciplineWidget({ data, height }: WidgetProps) {
  if (data.teamStats.loading) return <WidgetSkeleton />;
  if (data.teamStats.error) return <WidgetError />;
  const hrisnici = (data.teamStats.data ?? []).filter((p) => p.yellowCards + p.redCards > 0);
  if (hrisnici.length === 0) return <ChartEmpty>Tým je zatím bez karet.</ChartEmpty>;

  const top = [...hrisnici].sort((a, b) => (b.redCards * 3 + b.yellowCards) - (a.redCards * 3 + a.yellowCards))
    .slice(0, rowsForHeight(height, ROW_PX.bar, 32));
  const max = Math.max(...top.map((p) => p.yellowCards + p.redCards), 1);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {top.map((p) => (
          <li key={p.playerId}>
            <div className="flex items-baseline gap-2 mb-1">
              <a href={`/dashboard/player/${p.playerId}`} className="text-sm truncate min-w-0 flex-1 hover:text-pitch-500 hover:underline transition-colors">
                {p.firstName} {p.lastName}
              </a>
              <span className="text-sm font-heading font-bold tabular-nums shrink-0">
                {p.yellowCards}<span className="text-muted">Ž</span> {p.redCards}<span className="text-muted">Č</span>
              </span>
            </div>
            <div className="flex h-2 gap-[2px]">
              <div className="rounded-l-[4px]" style={{ width: `${(p.yellowCards / max) * 100}%`, background: "#F5C542" }} title={`Žluté: ${p.yellowCards}`} />
              <div className="rounded-r-[4px]" style={{ width: `${(p.redCards / max) * 100}%`, background: DIVERGING.negative }} title={`Červené: ${p.redCards}`} />
            </div>
          </li>
        ))}
      </ul>
      <div className="text-micro text-muted text-center">Řazeno podle závažnosti — červená váží jako tři žluté.</div>
    </div>
  );
}
