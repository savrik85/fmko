"use client";

/** Widgety o kádru — stav, složení, dovednosti, kondice, hodnota, mzdy, zranění. */

import type { Player } from "@/lib/api";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import {
  HBarChart, BarChart, RadarChart, DonutChart, ChartEmpty, ChartHero,
  PRIMARY, DIVERGING, STATUS, seriesColor, compactCZK, fullCZK,
} from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { conditionLabel, safeTeamColor, MoreLink } from "./shared";

const POSITIONS = [
  { key: "GK", label: "Brankáři" },
  { key: "DEF", label: "Obránci" },
  { key: "MID", label: "Záložníci" },
  { key: "FWD", label: "Útočníci" },
] as const;

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
const playerName = (p: Player) => `${p.first_name} ${p.last_name}`;

/**
 * Odhad tržní hodnoty hráče. Zrcadlí `estimateMarketValue`
 * z apps/api/src/season/economy.ts — API ho žádným endpointem nevystavuje.
 */
function marketValue(rating: number, age: number): number {
  const base = 400 * Math.exp(0.058 * rating);
  const ageMod = age <= 19 ? 1.35 : age <= 22 ? 1.25 : age <= 26 ? 1.1 : age <= 29 ? 1.0 : age <= 32 ? 0.75 : age <= 35 ? 0.55 : 0.4;
  return Math.round(base * ageMod);
}

// ── Stav kádru ──────────────────────────────────────────────────────────────

export function SquadStatusWidget({ data }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={6} />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length === 0) return <ChartEmpty>Kádr je prázdný.</ChartEmpty>;

  const avgCondition = Math.round(avg(players.map((p) => p.lifeContext?.condition ?? 50)));
  const avgMorale = Math.round(avg(players.map((p) => p.lifeContext?.morale ?? 50)));
  const avgRating = Math.round(avg(players.map((p) => p.overall_rating)));
  const avgAge = Math.round(avg(players.map((p) => p.age)) * 10) / 10;
  const injured = players.filter((p) => (p.lifeContext?.condition ?? 100) < 30).length;
  const lowMorale = players.filter((p) => (p.lifeContext?.morale ?? 50) < 30).length;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <MiniTile value={String(players.length)} label="Hráčů" color={safeTeamColor(data.team.data)} />
        <MiniTile value={`${avgCondition} %`} label="Kondice" className={conditionLabel(avgCondition).color} />
        <MiniTile value={String(avgRating)} label="Rating" />
      </div>
      <div className="space-y-1">
        <StatRow label="Prům. morálka" value={String(avgMorale)} />
        <StatRow label="Prům. věk" value={String(avgAge)} />
        {injured > 0 && <StatRow label="Zranění" value={String(injured)} valueClass="text-card-red" />}
        {lowMorale > 0 && <StatRow label="Nízká morálka" value={String(lowMorale)} valueClass="text-gold-600" />}
        {POSITIONS.map(({ key, label }) => {
          const sub = players.filter((p) => p.position === key);
          return (
            <StatRow
              key={key}
              label={label}
              value={`${sub.length}× · ø${Math.round(avg(sub.map((p) => p.overall_rating)))}`}
            />
          );
        })}
      </div>
      <MoreLink href="/dashboard/squad">Zobrazit kádr →</MoreLink>
    </div>
  );
}

function MiniTile({ value, label, color, className = "" }: { value: string; label: string; color?: string; className?: string }) {
  return (
    <div className="bg-gray-50 rounded-soft p-2.5 text-center">
      <div className={`font-heading font-bold text-xl tabular-nums ${className}`} style={color ? { color } : undefined}>{value}</div>
      <div className="text-micro text-muted uppercase">{label}</div>
    </div>
  );
}

function StatRow({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className={`font-heading font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Složení kádru podle postů ───────────────────────────────────────────────

export function SquadPositionsWidget({ data }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={4} />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length === 0) return <ChartEmpty>Kádr je prázdný.</ChartEmpty>;

  // Barva tu nenese identitu — post říká popisek řádku. Proto jeden odstín.
  return (
    <HBarChart
      data={POSITIONS.map(({ key, label }) => {
        const sub = players.filter((p) => p.position === key);
        return {
          label,
          value: sub.length,
          display: `${sub.length}× · ø${Math.round(avg(sub.map((p) => p.overall_rating)))}`,
        };
      })}
    />
  );
}

// ── Věková struktura ────────────────────────────────────────────────────────

const AGE_BANDS = [
  { label: "16–19", min: 0, max: 19 },
  { label: "20–23", min: 20, max: 23 },
  { label: "24–27", min: 24, max: 27 },
  { label: "28–31", min: 28, max: 31 },
  { label: "32+", min: 32, max: 200 },
];

export function SquadAgeWidget({ data }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={4} />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length === 0) return <ChartEmpty>Kádr je prázdný.</ChartEmpty>;

  const counts = AGE_BANDS.map((b) => players.filter((p) => p.age >= b.min && p.age <= b.max).length);
  const avgAge = Math.round(avg(players.map((p) => p.age)) * 10) / 10;

  return (
    <div className="space-y-3">
      <BarChart
        categories={AGE_BANDS.map((b) => b.label)}
        series={[{ label: "Hráčů", color: PRIMARY, values: counts }]}
        formatValue={(v) => `${Math.round(v)} hráčů`}
        labelEvery={1}
      />
      <div className="text-sm text-muted text-center">
        Průměrný věk <span className="font-heading font-bold text-ink tabular-nums">{avgAge}</span> let
      </div>
    </div>
  );
}

// ── Dovednosti kádru ────────────────────────────────────────────────────────

const SKILL_AXES = [
  { key: "speed", label: "Rychlost" },
  { key: "technique", label: "Technika" },
  { key: "shooting", label: "Střelba" },
  { key: "passing", label: "Přihrávka" },
  { key: "heading", label: "Hlavičky" },
  { key: "defense", label: "Obrana" },
] as const;

export function SquadSkillsWidget({ data }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={5} />;
  if (data.players.error) return <WidgetError />;
  const players = (data.players.data ?? []).filter((p) => p.position !== "GK");
  if (players.length === 0) return <ChartEmpty>V kádru nejsou hráči do pole.</ChartEmpty>;

  const values = SKILL_AXES.map(({ key }) => avg(players.map((p) => p.skills?.[key] ?? 0)));
  const nejlepsi = SKILL_AXES[values.indexOf(Math.max(...values))];
  const nejhorsi = SKILL_AXES[values.indexOf(Math.min(...values))];

  return (
    <div className="space-y-2">
      <RadarChart
        axes={SKILL_AXES.map((a) => a.label)}
        series={[{ label: "Průměr kádru", values, color: PRIMARY }]}
      />
      <div className="text-sm text-muted text-center">
        Průměr {players.length} hráčů do pole na škále 0–100.{" "}
        Nejsilnější <span className="font-heading font-bold text-ink">{nejlepsi.label.toLowerCase()}</span>,
        nejslabší <span className="font-heading font-bold text-ink">{nejhorsi.label.toLowerCase()}</span>.
      </div>
    </div>
  );
}

// ── Kondice a morálka ───────────────────────────────────────────────────────

export function ConditionRankingWidget({ data, height }: WidgetProps) {
  return <LifeRanking data={data} field="condition" label="kondice" height={height} />;
}
export function MoraleRankingWidget({ data, height }: WidgetProps) {
  return <LifeRanking data={data} field="morale" label="morálka" height={height} />;
}

function LifeRanking({ data, field, label, height }: {
  data: WidgetProps["data"]; field: "condition" | "morale"; label: string; height: WidgetProps["height"];
}) {
  if (data.players.loading) return <WidgetSkeleton />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length === 0) return <ChartEmpty>Kádr je prázdný.</ChartEmpty>;

  const sorted = [...players].sort((a, b) => (a.lifeContext?.[field] ?? 50) - (b.lifeContext?.[field] ?? 50));
  const worst = sorted.slice(0, rowsForHeight(height, ROW_PX.bar, 56));
  const mean = Math.round(avg(players.map((p) => p.lifeContext?.[field] ?? 50)));

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Nejhorší {label} v kádru · průměr <span className="font-heading font-bold text-ink tabular-nums">{mean}</span>
      </div>
      <HBarChart
        max={100}
        scale="quality"
        data={worst.map((p) => {
          const v = p.lifeContext?.[field] ?? 50;
          return {
            label: playerName(p),
            value: v,
            display: String(Math.round(v)),
            href: `/dashboard/player/${p.id}`,
          };
        })}
      />
    </div>
  );
}

// ── Hodnota kádru ───────────────────────────────────────────────────────────

export function SquadValueWidget({ data, height }: WidgetProps) {
  if (data.players.loading) return <WidgetSkeleton rows={5} />;
  if (data.players.error) return <WidgetError />;
  const players = data.players.data ?? [];
  if (players.length === 0) return <ChartEmpty>Kádr je prázdný.</ChartEmpty>;

  const valued = players
    .map((p) => ({ p, value: marketValue(p.overall_rating, p.age) }))
    .sort((a, b) => b.value - a.value);
  const total = valued.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-3">
      <ChartHero value={compactCZK(total)} note="odhadovaná hodnota kádru" color={safeTeamColor(data.team.data)} />
      <HBarChart
        data={valued.slice(0, rowsForHeight(height, ROW_PX.bar, 130)).map(({ p, value }) => ({
          label: playerName(p),
          value,
          display: compactCZK(value),
          href: `/dashboard/player/${p.id}`,
        }))}
      />
      <div className="text-micro text-muted text-center">Odhad podle ratingu a věku, ne nabídková cena.</div>
    </div>
  );
}

// ── Mzdová struktura ────────────────────────────────────────────────────────

export function WageStructureWidget({ data }: WidgetProps) {
  if (data.wages.loading) return <WidgetSkeleton rows={5} />;
  if (data.wages.error) return <WidgetError />;
  const wages = data.wages.data;
  if (!wages || wages.players.length === 0) return <ChartEmpty>Nikdo v kádru nebere mzdu.</ChartEmpty>;

  const byPosition = POSITIONS.map(({ key, label }, i) => ({
    label,
    value: wages.players.filter((p) => p.position === key).reduce((s, p) => s + (p.weeklyWage ?? 0), 0),
    color: seriesColor(i),
  }));

  return (
    <div className="space-y-3">
      <DonutChart
        slices={byPosition}
        centerValue={compactCZK(wages.totalWeekly)}
        centerLabel="týdně"
        formatValue={compactCZK}
      />
      <div className="text-sm text-muted text-center">
        Měsíčně <span className="font-heading font-bold text-ink tabular-nums">{fullCZK(wages.totalMonthly)}</span>
      </div>
    </div>
  );
}

// ── Žebříčky hráčů podle ratingu ────────────────────────────────────────────

/** Věková hranice, do které se hráč ještě počítá jako mladík. */
const YOUNG_MAX_AGE = 21;

export function BestPlayersWidget({ data, height }: WidgetProps) {
  return <RatingRanking players={data.players} empty="Kádr je prázdný." height={height} />;
}

export function YoungTalentsSeniorWidget({ data, height }: WidgetProps) {
  return (
    <RatingRanking
      players={data.players}
      maxAge={YOUNG_MAX_AGE}
      empty={`V A-týmu nikdo do ${YOUNG_MAX_AGE} let není.`}
      height={height}
    />
  );
}

export function YoungTalentsU21Widget({ data, height }: WidgetProps) {
  return <RatingRanking players={data.u21} empty="Mládežnický tým zatím nemáš." height={height} />;
}

function RatingRanking({
  players, maxAge, empty, height,
}: {
  players: WidgetProps["data"]["players"];
  maxAge?: number;
  empty: string;
  height: WidgetProps["height"];
}) {
  if (players.loading) return <WidgetSkeleton />;
  if (players.error) return <WidgetError />;
  const list = (players.data ?? []).filter((p) => (maxAge == null ? true : p.age <= maxAge));
  if (list.length === 0) return <ChartEmpty>{empty}</ChartEmpty>;

  const top = [...list].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, rowsForHeight(height, ROW_PX.bar));

  return (
    <HBarChart
      max={100}
      scale="quality"
      data={top.map((p) => ({
        label: `${playerName(p)} · ${p.age} let`,
        value: p.overall_rating,
        display: String(p.overall_rating),
        href: `/dashboard/player/${p.id}`,
      }))}
    />
  );
}

// ── Zranění ─────────────────────────────────────────────────────────────────

export function InjuriesWidget({ data, height }: WidgetProps) {
  if (data.injuries.loading) return <WidgetSkeleton />;
  if (data.injuries.error) return <WidgetError />;
  const injuries = (data.injuries.data ?? []).filter((i) => i.daysRemaining > 0);
  if (injuries.length === 0) return <ChartEmpty>Nikdo není zraněný. Zaklepat.</ChartEmpty>;

  const severityColor = (s: string) =>
    s === "tezke" ? DIVERGING.negative : s === "stredni" ? STATUS.warning : "#B5AFA5";

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted">
        Zraněných hráčů <span className="font-heading font-bold text-ink tabular-nums">{injuries.length}</span>
      </div>
      <HBarChart
        max={Math.max(...injuries.map((i) => i.daysTotal), 1)}
        data={injuries.slice(0, rowsForHeight(height, ROW_PX.bar, 88)).map((i) => ({
          label: `${i.firstName} ${i.lastName} · ${i.type}`,
          value: i.daysRemaining,
          display: `${i.daysRemaining} d`,
          color: severityColor(i.severity),
          href: `/dashboard/player/${i.playerId}`,
        }))}
      />
      <MoreLink href="/dashboard/squad">Zobrazit kádr →</MoreLink>
    </div>
  );
}
