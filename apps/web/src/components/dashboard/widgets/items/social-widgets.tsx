"use client";

/** Widgety o lidech kolem klubu — rivalové, kabina, odkud jezdí fanoušci, kalendář. */

import Link from "next/link";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { HBarChart, Meter, ChartEmpty, ChartHero, DIVERGING, STATUS } from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { MoreLink, safeTeamColor } from "./shared";

// ── Rivalové ────────────────────────────────────────────────────────────────

export function RivalsWidget({ data, height }: WidgetProps) {
  if (data.relations.loading) return <WidgetSkeleton />;
  if (data.relations.error) return <WidgetError />;
  const vsichni = data.relations.data ?? [];
  if (vsichni.length === 0) return <ChartEmpty>S nikým z ligy tě zatím nic nespojuje.</ChartEmpty>;

  // Nahoru patří ti, s kým se něco děje — ať už dobrého, nebo špatného.
  const razeno = [...vsichni].sort((a, b) => (b.heat + Math.abs(b.respect)) - (a.heat + Math.abs(a.respect)))
    .slice(0, rowsForHeight(height, ROW_PX.rich, 32));

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {razeno.map((r) => (
          <li key={r.teamId}>
            <div className="flex items-baseline gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.primaryColor }} aria-hidden="true" />
              <Link href={`/dashboard/team/${r.teamId}`} className="text-sm font-heading font-bold truncate min-w-0 flex-1 hover:text-pitch-500 hover:underline transition-colors">
                {r.teamName}
              </Link>
              <span className="text-[11px] text-muted shrink-0">{r.archetypeLabel}</span>
            </div>
            <div className="text-sm text-muted mt-0.5">{r.label}</div>
            <div className="flex gap-2 mt-1">
              <div className="flex-1">
                <div className="flex justify-between text-[11px] text-muted mb-0.5">
                  <span>Respekt</span><span className="tabular-nums">{r.respect}</span>
                </div>
                {/* Respekt jde od −100 do 100, proto se posouvá do kladné poloviny */}
                <div className="h-1.5 rounded-full" style={{ background: "#EFEBE3" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${(r.respect + 100) / 2}%`,
                    background: r.respect >= 0 ? DIVERGING.positive : DIVERGING.negative,
                  }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-[11px] text-muted mb-0.5">
                  <span>Napětí</span><span className="tabular-nums">{r.heat}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "#EFEBE3" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${r.heat}%`,
                    background: r.heat >= 60 ? STATUS.critical : r.heat >= 30 ? STATUS.warning : "#B5AFA5",
                  }} />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-muted text-center">Napětí od 60 výš dělá z utkání derby.</div>
    </div>
  );
}

// ── Kabina ──────────────────────────────────────────────────────────────────

const VZTAH_LABEL: Record<string, { text: string; icon: string; dobry: boolean }> = {
  brothers: { text: "bratři", icon: "👬", dobry: true },
  classmates: { text: "spolužáci", icon: "🎓", dobry: true },
  neighbours: { text: "sousedé", icon: "🏘", dobry: true },
  mentor: { text: "mentor", icon: "🧭", dobry: true },
  friends: { text: "kamarádi", icon: "🤝", dobry: true },
  rivals: { text: "rivalové", icon: "⚡", dobry: false },
  exile: { text: "nemluví spolu", icon: "🧊", dobry: false },
  cousins: { text: "bratranci", icon: "👪", dobry: true },
  colleagues: { text: "kolegové z práce", icon: "🔧", dobry: true },
};

export function SquadChemistryWidget({ data, height }: WidgetProps) {
  if (data.relationships.loading) return <WidgetSkeleton />;
  if (data.relationships.error) return <WidgetError />;
  const vazby = data.relationships.data ?? [];
  if (vazby.length === 0) return <ChartEmpty>V kabině se zatím nikdo s nikým nespřátelil.</ChartEmpty>;

  const razeno = [...vazby].sort((a, b) => b.strength - a.strength)
    .slice(0, rowsForHeight(height, ROW_PX.rich, 32));
  const spatnych = vazby.filter((v) => VZTAH_LABEL[v.type]?.dobry === false).length;

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {razeno.map((v) => {
          const popis = VZTAH_LABEL[v.type] ?? { text: v.type, icon: "•", dobry: true };
          return (
            <li key={v.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
              <span className="shrink-0 text-base" aria-hidden="true">{popis.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-heading font-bold truncate">
                  <a href={`/dashboard/player/${v.player_a_id}`} className="hover:text-pitch-500 hover:underline transition-colors">{v.player_a_name}</a>
                  <span className="text-muted font-normal"> a </span>
                  <a href={`/dashboard/player/${v.player_b_id}`} className="hover:text-pitch-500 hover:underline transition-colors">{v.player_b_name}</a>
                </div>
                <div className="text-[11px] text-muted">{popis.text}</div>
              </div>
              <span
                className="text-sm font-heading font-bold tabular-nums shrink-0"
                style={{ color: popis.dobry ? DIVERGING.positive : DIVERGING.negative }}
              >
                {v.strength}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="text-sm text-muted text-center">
        {vazby.length} vazeb v kabině
        {spatnych > 0 && <>, z toho <span className="font-heading font-bold" style={{ color: DIVERGING.negative }}>{spatnych}</span> problémových</>}
      </div>
    </div>
  );
}

// ── Odkud jezdí fanoušci ────────────────────────────────────────────────────

export function FanVillagesWidget({ data, height }: WidgetProps) {
  if (data.fanbase.loading) return <WidgetSkeleton />;
  if (data.fanbase.error) return <WidgetError />;
  const fanbase = data.fanbase.data as (typeof data.fanbase.data & {
    satellites?: Array<{ villageId: string; villageName: string; population: number; distanceKm: number; casualCount: number; regularCount: number; hardcoreCount: number }>;
  }) | null;
  const obce = fanbase?.satellites ?? [];
  if (obce.length === 0) return <ChartEmpty>Zatím k nám jezdí jen domácí.</ChartEmpty>;

  const sPoctem = obce.map((o) => ({ ...o, celkem: o.casualCount + o.regularCount + o.hardcoreCount }));
  const razeno = [...sPoctem].sort((a, b) => b.celkem - a.celkem || a.distanceKm - b.distanceKm)
    .slice(0, rowsForHeight(height, ROW_PX.bar, 32));
  const dovezenych = sPoctem.reduce((s, o) => s + o.celkem, 0);

  return (
    <div className="space-y-3">
      <HBarChart
        data={razeno.map((o) => ({
          label: `${o.villageName} · ${o.distanceKm.toFixed(1)} km`,
          value: o.celkem,
          display: o.celkem > 0 ? String(o.celkem) : "—",
        }))}
      />
      <div className="text-sm text-muted text-center">
        Z okolních obcí máš <span className="font-heading font-bold text-ink tabular-nums">{dovezenych}</span> fanoušků
      </div>
      <MoreLink href="/dashboard/fans">Detail fanoušků →</MoreLink>
    </div>
  );
}

// ── Průběh sezóny ───────────────────────────────────────────────────────────

export function SeasonProgressWidget({ data, height }: WidgetProps) {
  if (data.seasonInfo.loading) return <WidgetSkeleton rows={3} />;
  if (data.seasonInfo.error) return <WidgetError />;
  const info = data.seasonInfo.data;
  if (!info) return <ChartEmpty>Kalendář sezóny zatím není k dispozici.</ChartEmpty>;

  const zbyva = Math.max(0, info.totalDays - info.currentDay);
  const dalsi = (info.upcoming ?? []).slice(0, rowsForHeight(height, ROW_PX.list, 130));

  return (
    <div className="space-y-3">
      <ChartHero value={`${info.currentDay}. den`} note={`ze ${info.totalDays} · zbývá ${zbyva}`} color={safeTeamColor(data.team.data)} />
      <Meter
        value={info.currentDay}
        max={info.totalDays}
        label={`${info.season}. sezóna`}
        display={`${Math.round((info.currentDay / info.totalDays) * 100)} %`}
      />
      {dalsi.length > 0 && (
        <ul className="space-y-1">
          {dalsi.map((u, i) => (
            <li key={`${u.date}-${i}`} className="flex items-center gap-2 py-1 border-b border-gray-50 last:border-b-0">
              <span className="shrink-0">{u.type === "match" ? "⚽" : u.type === "training" ? "🏋️" : "📅"}</span>
              <span className="text-sm font-heading font-bold flex-1 truncate">{u.title}</span>
              <span className="text-[11px] text-muted shrink-0 tabular-nums">
                {new Date(u.date).toLocaleDateString("cs", { day: "numeric", month: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <MoreLink href="/dashboard/calendar">Celý kalendář →</MoreLink>
    </div>
  );
}
