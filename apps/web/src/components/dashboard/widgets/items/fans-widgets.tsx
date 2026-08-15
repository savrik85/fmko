"use client";

/** Widgety o fanoušcích a stadionu — spokojenost, základna, návštěvnost, vybavenost. */

import { WidgetSkeleton, WidgetError } from "../widget-frame";
import {
  Gauge, LineChart, AreaStack, BarChart, RadarChart, Meter,
  ChartEmpty, PRIMARY, DIVERGING, seriesColor, compact,
} from "../charts";
import type { WidgetProps } from "../types";
import { MoreLink } from "./shared";

// ── Spokojenost fanoušků ────────────────────────────────────────────────────

export function FanSatisfactionWidget({ data }: WidgetProps) {
  if (data.fans.loading) return <WidgetSkeleton rows={4} />;
  if (data.fans.error) return <WidgetError />;
  const fans = data.fans.data;
  if (!fans) return <ChartEmpty>Data o fanoušcích zatím nejsou.</ChartEmpty>;

  const delta = fans.lastMatchDelta ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2 flex-wrap">
        <Gauge value={fans.satisfaction} label="Spokojenost" size={140} />
        <Gauge value={fans.loyalty} label="Loajalita" size={140} />
      </div>
      {delta !== 0 && (
        <div className="text-sm text-center">
          <span className="text-muted">Po posledním zápase </span>
          <span className="font-heading font-bold" style={{ color: delta > 0 ? DIVERGING.positive : DIVERGING.negative }}>
            {delta > 0 ? "+" : ""}{delta}
          </span>
        </div>
      )}
      {fans.lastMatchReasons?.length > 0 && (
        <ul className="text-sm text-muted space-y-0.5">
          {fans.lastMatchReasons.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      )}
      <MoreLink href="/dashboard/fans">Detail fanoušků →</MoreLink>
    </div>
  );
}

// ── Vývoj spokojenosti ──────────────────────────────────────────────────────

export function FanSatisfactionHistoryWidget({ data }: WidgetProps) {
  if (data.fansHistory.loading) return <WidgetSkeleton rows={4} />;
  if (data.fansHistory.error) return <WidgetError />;
  const items = [...(data.fansHistory.data ?? [])].reverse();
  if (items.length < 2) return <ChartEmpty>Na graf je potřeba aspoň dva odehrané zápasy.</ChartEmpty>;

  return (
    <LineChart
      series={[{ label: "Spokojenost", points: items.map((i) => i.satisfactionAfter) }]}
      labels={items.map((i) => `${i.opponentName ?? "zápas"} (${i.result === "win" ? "V" : i.result === "loss" ? "P" : "R"})`)}
      formatValue={(v) => String(Math.round(v))}
    />
  );
}

// ── Vývoj fanouškovské základny ─────────────────────────────────────────────

export function FanbaseHistoryWidget({ data }: WidgetProps) {
  if (data.fanbaseHistory.loading) return <WidgetSkeleton rows={4} />;
  if (data.fanbaseHistory.error) return <WidgetError />;
  const history = data.fanbaseHistory.data ?? [];
  if (history.length < 2) return <ChartEmpty>Základna se teprve začíná sledovat.</ChartEmpty>;

  return (
    <AreaStack
      layers={[
        { label: "Tvrdé jádro", points: history.map((h) => h.hardcore), color: seriesColor(0) },
        { label: "Stálí", points: history.map((h) => h.regular), color: seriesColor(1) },
        { label: "Příležitostní", points: history.map((h) => h.casual), color: seriesColor(2) },
      ]}
      labels={history.map((h) => new Date(h.gamedate).toLocaleDateString("cs"))}
      formatValue={compact}
    />
  );
}

// ── Návštěvnost ─────────────────────────────────────────────────────────────

export function AttendanceHistoryWidget({ data }: WidgetProps) {
  if (data.matchResults.loading) return <WidgetSkeleton rows={4} />;
  if (data.matchResults.error) return <WidgetError />;
  const home = (data.matchResults.data?.matches ?? [])
    .filter((m) => m.isHome && m.attendance != null)
    .slice(0, 10)
    .reverse();
  if (home.length === 0) return <ChartEmpty>Doma jsme ještě nehráli.</ChartEmpty>;

  const capacity = data.fanbase.data?.capacity ?? 0;
  const avgAtt = Math.round(home.reduce((s, m) => s + (m.attendance ?? 0), 0) / home.length);

  return (
    <div className="space-y-3">
      <BarChart
        categories={home.map((m) => m.opponent ?? "—")}
        series={[{ label: "Diváků", color: PRIMARY, values: home.map((m) => m.attendance ?? 0) }]}
        formatValue={(v) => `${Math.round(v).toLocaleString("cs")} diváků`}
      />
      {capacity > 0 ? (
        <Meter
          value={avgAtt}
          max={capacity}
          label="Průměrná návštěva vůči kapacitě"
          display={`${avgAtt.toLocaleString("cs")} / ${capacity.toLocaleString("cs")}`}
        />
      ) : (
        <div className="text-sm text-muted text-center">
          Průměr <span className="font-heading font-bold text-ink tabular-nums">{avgAtt.toLocaleString("cs")}</span> diváků
        </div>
      )}
    </div>
  );
}

// ── Vybavenost stadionu ─────────────────────────────────────────────────────

const FACILITY_LABELS: Record<string, string> = {
  changing_rooms: "Kabiny",
  showers: "Sprchy",
  refreshments: "Občerstvení",
  stands: "Tribuny",
  roof: "Střecha",
  toilets: "Záchody",
  parking: "Parkoviště",
  fence: "Oplocení",
  lighting: "Osvětlení",
  ultras_stand: "Kotel",
};

export function StadiumRadarWidget({ data }: WidgetProps) {
  if (data.stadium.loading) return <WidgetSkeleton rows={5} />;
  if (data.stadium.error) return <WidgetError />;
  const stadium = data.stadium.data;
  if (!stadium) return <ChartEmpty>O stadionu zatím nemáme data.</ChartEmpty>;

  const entries = Object.entries(stadium.facilities ?? {})
    .filter(([key]) => FACILITY_LABELS[key])
    .slice(0, 8);

  return (
    <div className="space-y-3">
      {entries.length >= 3 ? (
        <RadarChart
          axes={entries.map(([key]) => FACILITY_LABELS[key])}
          series={[{ label: "Úroveň", values: entries.map(([, v]) => v), color: PRIMARY }]}
          max={5}
        />
      ) : (
        <ChartEmpty>Stadion zatím nemá co vykreslit.</ChartEmpty>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-gray-50 rounded-soft p-2.5 text-center">
          <div className="font-heading font-bold text-lg tabular-nums">{stadium.capacity.toLocaleString("cs")}</div>
          <div className="text-micro text-muted uppercase">Kapacita</div>
        </div>
        <div className="bg-gray-50 rounded-soft p-2.5 text-center">
          <div className="font-heading font-bold text-lg tabular-nums">{Math.round(stadium.pitchCondition)} %</div>
          <div className="text-micro text-muted uppercase">Stav hřiště</div>
        </div>
      </div>
      <MoreLink href="/dashboard/stadium">Detail stadionu →</MoreLink>
    </div>
  );
}
