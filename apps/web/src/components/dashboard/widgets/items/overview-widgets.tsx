"use client";

/** Přehledové widgety — zpravodaj, úspěchy, síň slávy, události. */

import { ListRow } from "@/components/ui";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { ChartEmpty, ChartHero } from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { timeAgo, safeTeamColor, MoreLink } from "./shared";

// ── Zpravodaj ───────────────────────────────────────────────────────────────

export function NewsWidget({ data, height }: WidgetProps) {
  if (data.news.loading) return <WidgetSkeleton />;
  if (data.news.error) return <WidgetError />;
  const news = (data.news.data ?? []).slice(0, rowsForHeight(height, ROW_PX.rich, 32));
  if (news.length === 0) return <ChartEmpty>Zpravodaj zatím mlčí.</ChartEmpty>;

  // Titulek se smí zalomit na dva řádky (54 px), proto ROW_PX.rich.
  return (
    <>
      <div className="-mx-4 sm:-mx-5">
        {news.map((article) => (
          <ListRow key={article.id} dense href="/zpravodaj"
            leading={<span className="text-lg leading-none" aria-hidden="true">{article.icon}</span>}
            title={article.headline}
            trailing={<span className="text-micro text-muted">{timeAgo(article.date)}</span>} />
        ))}
      </div>
      <MoreLink href="/zpravodaj">Celý zpravodaj →</MoreLink>
    </>
  );
}

// ── Naposledy odemčené úspěchy ──────────────────────────────────────────────

export function AchievementsWidget({ data, teamId, height }: WidgetProps) {
  if (data.achievements.loading) return <WidgetSkeleton />;
  if (data.achievements.error) return <WidgetError />;
  const achievements = (data.achievements.data ?? []).slice(0, rowsForHeight(height, ROW_PX.rich, 32));
  if (achievements.length === 0) return <ChartEmpty>Zatím žádný odemčený úspěch.</ChartEmpty>;

  // Kdy se úspěch odemkl, stojí vpravo; titulek se smí zalomit na dva řádky (54 px), proto ROW_PX.rich.
  return (
    <>
      <div className="-mx-4 sm:-mx-5">
        {achievements.map((a) => {
          const tierColor = a.tier === "gold" ? "text-amber-600" : a.tier === "silver" ? "text-gray-500" : "text-orange-700";
          return (
            <ListRow key={a.key} dense href={`/manazer/${teamId}`}
              leading={<span className="text-xl leading-none" aria-hidden="true">{a.icon}</span>}
              title={<span className={tierColor}>{a.title}</span>}
              trailing={<span className="text-micro text-muted">{timeAgo(a.earnedAt)}</span>} />
          );
        })}
      </div>
      <MoreLink href={`/manazer/${teamId}`}>Všechny úspěchy →</MoreLink>
    </>
  );
}

// ── Síň slávy ───────────────────────────────────────────────────────────────

export function HallOfFameWidget({ data }: WidgetProps) {
  if (data.hallOfFame.loading) return <WidgetSkeleton rows={3} />;
  if (data.hallOfFame.error) return <WidgetError />;
  const hof = data.hallOfFame.data;
  if (!hof) return <ChartEmpty>Žebříček zatím není k dispozici.</ChartEmpty>;

  return (
    <>
      <div className="mt-2 text-center">
        {hof.myRank ? (
          <>
            <ChartHero value={`${hof.myRank}.`} note={`z ${hof.totalEntries} trenérů`} color={safeTeamColor(data.team.data)} />
            <div className="flex items-center justify-center gap-3 mt-3 text-sm tabular-nums">
              <span className="text-amber-600">🥇 {hof.myGold}</span>
              <span className="text-gray-500">🥈 {hof.mySilver}</span>
              <span className="text-orange-700">🥉 {hof.myBronze}</span>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted py-3">Ještě bez úspěchů</div>
        )}
      </div>
      <MoreLink href="/sin-slavy">Celý žebříček →</MoreLink>
    </>
  );
}

// ── Události ────────────────────────────────────────────────────────────────

export function EventsWidget({ data, height }: WidgetProps) {
  if (data.events.loading) return <WidgetSkeleton />;
  if (data.events.error) return <WidgetError />;
  // API vrací `status`, ne `resolved`: dřív filtr nepouštěl pryč nic a widget ukazoval i proběhlé.
  const events = (data.events.data ?? []).filter((e) => e.status !== "resolved").slice(0, rowsForHeight(height, ROW_PX.table, 32));
  if (events.length === 0) return <ChartEmpty>Nic se nechystá.</ChartEmpty>;

  return (
    <>
      <div className="-mx-4 sm:-mx-5">
        {events.map((e) => (
          <ListRow key={e.id} dense
            leading={<span className="text-lg leading-none" aria-hidden="true">{e.icon ?? "📅"}</span>}
            title={e.title ?? e.headline ?? "Událost"}
            trailing={e.gameWeek != null ? <span className="text-micro text-muted">{e.gameWeek}. kolo</span> : undefined} />
        ))}
      </div>
      <MoreLink href="/udalosti">Všechny události →</MoreLink>
    </>
  );
}
