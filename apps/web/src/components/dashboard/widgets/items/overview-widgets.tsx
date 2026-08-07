"use client";

/** Přehledové widgety — zpravodaj, úspěchy, síň slávy, události. */

import Link from "next/link";
import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { ChartEmpty, ChartHero } from "../charts";
import type { WidgetProps } from "../types";
import { rowsForHeight, ROW_PX } from "../widget-heights";
import { timeAgo, safeTeamColor, MoreLink } from "./shared";

// ── Zpravodaj ───────────────────────────────────────────────────────────────

export function NewsWidget({ data, height }: WidgetProps) {
  if (data.news.loading) return <WidgetSkeleton />;
  if (data.news.error) return <WidgetError />;
  const news = (data.news.data ?? []).slice(0, rowsForHeight(height, ROW_PX.list, 32));
  if (news.length === 0) return <ChartEmpty>Zpravodaj zatím mlčí.</ChartEmpty>;

  return (
    <>
      <div className="space-y-2">
        {news.map((article) => (
          <Link
            key={article.id}
            href="/dashboard/news"
            className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 -mx-1 px-1 rounded transition-colors"
          >
            <span className="text-lg shrink-0">{article.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-heading font-bold truncate">{article.headline}</div>
            </div>
            <span className="text-[11px] text-muted shrink-0">{timeAgo(article.date)}</span>
          </Link>
        ))}
      </div>
      <MoreLink href="/dashboard/news">Celý zpravodaj →</MoreLink>
    </>
  );
}

// ── Naposledy odemčené úspěchy ──────────────────────────────────────────────

export function AchievementsWidget({ data, teamId, height }: WidgetProps) {
  if (data.achievements.loading) return <WidgetSkeleton />;
  if (data.achievements.error) return <WidgetError />;
  const achievements = (data.achievements.data ?? []).slice(0, rowsForHeight(height, ROW_PX.rich, 32));
  if (achievements.length === 0) return <ChartEmpty>Zatím žádný odemčený úspěch.</ChartEmpty>;

  return (
    <>
      <div className="mt-2 space-y-1">
        {achievements.map((a) => {
          const tierColor = a.tier === "gold" ? "text-amber-600" : a.tier === "silver" ? "text-gray-500" : "text-orange-700";
          return (
            <Link
              key={a.key}
              href={`/dashboard/manager/${teamId}`}
              className="flex items-center gap-2.5 py-1.5 px-1 hover:bg-gray-50/60 rounded-md transition-colors"
            >
              <div className="text-xl shrink-0 leading-none">{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className={`font-heading font-bold text-sm truncate ${tierColor}`}>{a.title}</div>
                <div className="text-[11px] text-muted mt-0.5">{timeAgo(a.earnedAt)}</div>
              </div>
            </Link>
          );
        })}
      </div>
      <MoreLink href={`/dashboard/manager/${teamId}`}>Všechny úspěchy →</MoreLink>
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
      <MoreLink href="/dashboard/hall-of-fame">Celý žebříček →</MoreLink>
    </>
  );
}

// ── Události ────────────────────────────────────────────────────────────────

export function EventsWidget({ data, height }: WidgetProps) {
  if (data.events.loading) return <WidgetSkeleton />;
  if (data.events.error) return <WidgetError />;
  const events = (data.events.data ?? []).filter((e) => !e.resolved).slice(0, rowsForHeight(height, ROW_PX.list, 32));
  if (events.length === 0) return <ChartEmpty>Nic se nechystá.</ChartEmpty>;

  return (
    <>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-b-0">
            <span className="text-lg shrink-0">{e.icon ?? "📅"}</span>
            <span className="text-sm font-heading font-bold flex-1 truncate">{e.title ?? e.headline ?? "Událost"}</span>
            {e.gameWeek != null && <span className="text-[11px] text-muted shrink-0">{e.gameWeek}. týden</span>}
          </li>
        ))}
      </ul>
      <MoreLink href="/dashboard/events">Všechny události →</MoreLink>
    </>
  );
}
