"use client";

/** Widgety o lidech kolem klubu — rivalové, kabina, odkud jezdí fanoušci, kalendář. */

import { ListRow, RowValue } from "@/components/ui";
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
    .slice(0, rowsForHeight(height, ROW_PX.tall, 32));

  // Řádek: název (20,6) + popis (17,9) + dva ukazatele (4 + 15 + 2 + 6) + odsazení a čára (13) = 81 px, ROW_PX.tall.
  return (
    <div className="space-y-3">
      <div className="-mx-4 sm:-mx-5">
        {razeno.map((r) => (
          <ListRow key={r.teamId} dense href={`/tym/${r.teamId}`}
            leading={
              <span className="flex h-5 items-center" aria-hidden="true">
                <span className="w-2.5 h-2.5 rounded-tight" style={{ background: r.primaryColor }} />
              </span>
            }
            title={r.teamName}
            trailing={<span className="text-micro text-muted">{r.archetypeLabel}</span>}
            detail={
              <>
                <span className="block text-muted">{r.label}</span>
                <span className="flex gap-2 mt-1">
                  <span className="flex-1">
                    <span className="flex justify-between text-micro text-muted mb-0.5">
                      <span>Respekt</span><span className="tabular-nums">{r.respect}</span>
                    </span>
                    {/* Respekt jde od −100 do 100, proto se posouvá do kladné poloviny */}
                    <span className="block h-1.5 rounded-full" style={{ background: "#EFEBE3" }}>
                      <span className="block h-full rounded-full" style={{
                        width: `${(r.respect + 100) / 2}%`,
                        background: r.respect >= 0 ? DIVERGING.positive : DIVERGING.negative,
                      }} />
                    </span>
                  </span>
                  <span className="flex-1">
                    <span className="flex justify-between text-micro text-muted mb-0.5">
                      <span>Napětí</span><span className="tabular-nums">{r.heat}</span>
                    </span>
                    <span className="block h-1.5 rounded-full" style={{ background: "#EFEBE3" }}>
                      <span className="block h-full rounded-full" style={{
                        width: `${r.heat}%`,
                        background: r.heat >= 60 ? STATUS.critical : r.heat >= 30 ? STATUS.warning : "#B5AFA5",
                      }} />
                    </span>
                  </span>
                </span>
              </>
            } />
        ))}
      </div>
      <div className="text-micro text-muted text-center">Napětí od 60 výš dělá z utkání derby.</div>
    </div>
  );
}

// ── Kabina ──────────────────────────────────────────────────────────────────

/** Klíče odpovídají sloupci `relationships.type` — ověřeno dotazem do databáze. */
const VZTAH_LABEL: Record<string, { text: string; icon: string; dobry: boolean }> = {
  drinking_buddies: { text: "kumpáni od piva", icon: "🍻", dobry: true },
  classmates: { text: "spolužáci", icon: "🎓", dobry: true },
  brothers: { text: "bratři", icon: "👬", dobry: true },
  neighbors: { text: "sousedé", icon: "🏘", dobry: true },
  father_son: { text: "otec a syn", icon: "👨‍👦", dobry: true },
  mentor_pupil: { text: "mentor a učeň", icon: "🧭", dobry: true },
  coworkers: { text: "kolegové z práce", icon: "🔧", dobry: true },
  in_laws: { text: "příbuzní po přeslici", icon: "👪", dobry: true },
  rivals: { text: "rivalové", icon: "⚡", dobry: false },
};

export function SquadChemistryWidget({ data, height }: WidgetProps) {
  if (data.relationships.loading) return <WidgetSkeleton />;
  if (data.relationships.error) return <WidgetError />;
  const vazby = data.relationships.data ?? [];
  if (vazby.length === 0) return <ChartEmpty>V kabině se zatím nikdo s nikým nespřátelil.</ChartEmpty>;

  // Dvě jména se na úzké dlaždici zalomí na dva řádky, proto ROW_PX.pair místo ROW_PX.rich.
  const razeno = [...vazby].sort((a, b) => b.strength - a.strength)
    .slice(0, rowsForHeight(height, ROW_PX.pair, 32));
  const spatnych = vazby.filter((v) => VZTAH_LABEL[v.type]?.dobry === false).length;

  return (
    <div className="space-y-3">
      {/* Řádek má dva odkazy (oba hráče), proto celý odkazem není. */}
      <div className="-mx-4 sm:-mx-5">
        {razeno.map((v) => {
          const popis = VZTAH_LABEL[v.type] ?? { text: v.type, icon: "•", dobry: true };
          return (
            <ListRow key={v.id} dense
              leading={<span className="text-base leading-none" aria-hidden="true">{popis.icon}</span>}
              title={
                <>
                  <a href={`/hrac/${v.player_a_id}`} className="hover:text-pitch-500 hover:underline transition-colors">{v.player_a_name}</a>
                  <span className="text-muted font-normal"> a </span>
                  <a href={`/hrac/${v.player_b_id}`} className="hover:text-pitch-500 hover:underline transition-colors">{v.player_b_name}</a>
                </>
              }
              detail={<span className="text-muted">{popis.text}</span>}
              trailing={<RowValue tone={popis.dobry ? "plus" : "minus"}>{v.strength}</RowValue>} />
          );
        })}
      </div>
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
          display: o.celkem > 0 ? String(o.celkem) : "-",
        }))}
      />
      <div className="text-sm text-muted text-center">
        Z okolních obcí máš <span className="font-heading font-bold text-ink tabular-nums">{dovezenych}</span> fanoušků
      </div>
      <MoreLink href="/fanousci">Detail fanoušků →</MoreLink>
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
  const dalsi = (info.upcoming ?? []).slice(0, rowsForHeight(height, ROW_PX.table, 130));

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
        <div className="-mx-4 sm:-mx-5">
          {dalsi.map((u, i) => (
            <ListRow key={`${u.date}-${i}`} dense
              leading={<span className="leading-none" aria-hidden="true">{u.type === "match" ? "⚽" : u.type === "training" ? "🏋️" : "📅"}</span>}
              title={u.title}
              trailing={
                <span className="text-micro text-muted tabular-nums">
                  {new Date(u.date).toLocaleDateString("cs", { day: "numeric", month: "numeric" })}
                </span>
              } />
          ))}
        </div>
      )}
      <MoreLink href="/kalendar">Celý kalendář →</MoreLink>
    </div>
  );
}
