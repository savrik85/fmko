"use client";

/**
 * „U nás v hospodě" — co se dělo včera večer.
 * Widget si kreslí vlastní obal (šála, klubové pruhy), proto je v registry `bare`.
 */

import Link from "next/link";
import { ClubScarf, type ScarfPattern } from "@/components/team/club-scarf";
import type { BadgePattern } from "@/components/ui";
import type { WidgetProps } from "../types";
import { initials } from "./shared";

const INCIDENT_ICONS: Record<string, string> = {
  cross_team_fight: "🥊",
  cross_team_brotherhood: "🍻",
  cross_team_provocation: "👊",
  drink_record: "🍺",
  automat_win: "💰",
  story: "📰",
  lone_drinker: "🪑",
  nobody: "🌙",
  coach_led_visit: "🧑‍🏫",
  coach_led_one: "🧑‍🏫",
  cat: "🐈",
  priest: "⛪",
  scout: "🕵️",
  wife_call: "📞",
};

export function PubSessionWidget({ data }: WidgetProps) {
  const team = data.team.data;
  const session = data.pubSession.data;

  // Bez posezení není co ukázat — rámeček v editaci zajistí WidgetFrame.
  if (!team || !session || (session.attendees.length === 0 && session.incidents.length === 0)) {
    return (
      <div className="card p-4 sm:p-5 text-sm text-muted text-center">
        Včera v hospodě nikdo neseděl.
      </div>
    );
  }

  const scarfPrimary = team.badge_primary_color || team.primary_color || "#2D5F2D";
  const scarfSecondary = team.badge_secondary_color || team.secondary_color || "#FFF";
  const badgeInit = team.badge_initials || initials(team.name);
  const scarfProps = {
    primary: scarfPrimary,
    secondary: scarfSecondary,
    pattern: (team.badge_pattern as BadgePattern) || "shield",
    scarfPattern: (team.scarf_pattern as ScarfPattern) || "classic",
    initials: badgeInit,
    symbol: team.badge_symbol,
  };

  const playerNameById = (id: string) => {
    const a = session.attendees.find((x) => x.playerId === id);
    return a ? `${a.firstName} ${a.lastName}` : "?";
  };

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: "#F5EDDF" }}>
      <div className="h-1" style={{ background: scarfPrimary }} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x lg:divide-amber-200/50">
        <div className="flex flex-col items-center text-center gap-3 px-5 py-5 lg:py-6">
          <ClubScarf {...scarfProps} className="h-14 w-full sm:hidden" />
          <ClubScarf {...scarfProps} width={260} height={80} className="hidden sm:block" />
          <div>
            <h2 className="font-heading font-[800] text-xl leading-none text-ink">U nás v hospodě</h2>
            <div className="text-[11px] uppercase text-muted mt-1">
              {new Date(session.gameDate).toLocaleDateString("cs", { weekday: "long" })} večer
            </div>
          </div>
          <Link href="/dashboard/hospoda" className="text-sm font-heading font-bold text-pitch-500 hover:text-pitch-600 whitespace-nowrap">
            Historie →
          </Link>
        </div>

        <div className="lg:col-span-2 bg-white p-4 sm:p-5">
          {session.dailySpecial && (
            <div className="mb-3 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 px-4 sm:px-5 py-2 text-[11px] uppercase font-heading tracking-wider text-amber-800 bg-amber-50 border-b border-amber-100">
              📋 {session.dailySpecial}
            </div>
          )}

          {session.attendees.length > 0 && (
            <div className="text-sm mb-3">
              <span className="text-muted">V hospodě seděli: </span>
              {session.attendees.map((a, i) => (
                <span key={a.playerId}>
                  {i > 0 && ", "}
                  <Link
                    href={a.isVisitor ? "#" : `/dashboard/player/${a.playerId}`}
                    className={`font-heading font-bold ${a.isVisitor ? "text-amber-600" : "hover:text-pitch-500 underline decoration-pitch-500/20"}`}
                  >
                    {a.firstName} {a.lastName}
                  </Link>
                  {a.isVisitor && <span className="text-[11px] text-amber-600 ml-1">({a.fromTeamName})</span>}
                </span>
              ))}
            </div>
          )}

          {session.incidents.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {session.incidents.map((inc, i) => (
                <li key={i} className="text-sm py-2 first:pt-0 last:pb-0">
                  <div className="flex gap-2 items-start">
                    <span className="shrink-0">{INCIDENT_ICONS[inc.type] ?? "•"}</span>
                    <span className="text-ink leading-snug">{inc.text}</span>
                  </div>
                  {inc.effects && inc.effects.length > 0 && (
                    <div className="ml-7 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                      {inc.effects.map((ef, ei) => {
                        const efColor = ef.type === "injury" || ef.type === "hangover" || (ef.delta != null && ef.delta < 0)
                          ? "text-card-red"
                          : ef.delta != null && ef.delta > 0
                            ? "text-pitch-500"
                            : "text-muted";
                        return (
                          <span key={ei} className={efColor}>
                            <span className="text-muted">{playerNameById(ef.playerId)}:</span>{" "}
                            <span className="font-heading font-bold">{ef.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="h-1" style={{ background: scarfSecondary }} />
    </div>
  );
}
