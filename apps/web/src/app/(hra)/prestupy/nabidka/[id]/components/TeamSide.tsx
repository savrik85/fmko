"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { BadgePreview, type BadgePattern } from "@/components/ui/badge-preview";
import { CoachName } from "@/components/manager/coach-name";
import { TeamName } from "@/components/manager/team-name";
import { formatKc } from "@/lib/format";

export interface TeamSummary {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  badge_pattern: string | null;
  badge_symbol: string | null;
  initials: string | null;
  budget: number | null;
  reputation: number | null;
  is_virtual?: boolean; // virtuální (počítačový) klub — nemá profil ani trenéra
  city?: string | null;
  /** Země virtuálního klubu (`DE` = bavorský klub). */
  country?: string | null;
}

export interface ManagerSummary {
  id: string;
  name: string;
  /** Trenér AI klubu: k jménu patří odznak s robotem. */
  coachIsAi?: boolean;
  avatar: Record<string, unknown>;
  coaching: number;
  motivation: number;
  tactics: number;
  reputation: number;
}

export function TeamSide({
  team, manager, label, alignment,
}: {
  team: TeamSummary;
  manager: ManagerSummary | null;
  label: string;
  alignment: "left" | "right";
}) {
  const isRight = alignment === "right";
  const alignItems = isRight ? "items-end text-right" : "items-start text-left";
  const badgePattern = (team.badge_pattern ?? "shield") as BadgePattern;
  const initials = team.initials ?? team.name.slice(0, 3).toUpperCase();
  const hasAvatar = manager?.avatar && Object.keys(manager.avatar).length > 0;

  return (
    <div className={`flex flex-col ${alignItems} gap-2 min-w-0`}>
      <div className="text-micro font-heading font-bold text-muted uppercase tracking-wider">{label}</div>
      {hasAvatar ? (
        <FaceAvatar faceConfig={manager!.avatar} size={88} />
      ) : (
        <div className="w-[88px] h-[106px] bg-gray-100 rounded-soft flex items-center justify-center text-white/40 text-3xl">👤</div>
      )}
      <div className={`flex flex-col gap-1 ${isRight ? "items-end" : "items-start"} min-w-0 w-full`}>
        {/* Stránka trenéra bere v URL ID TÝMU, ne trenéra — manager.id vedl na neexistující tým. */}
        {/* Předseda cizího klubu nemá v Pralese profil, jen jméno. */}
        {manager && team.is_virtual ? (
          <div className="font-heading font-bold text-base truncate max-w-full">{manager.name}</div>
        ) : manager ? (
          <Link href={`/manazer/${team.id}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors truncate max-w-full">
            <CoachName name={manager.name} isAi={manager.coachIsAi === true} />
          </Link>
        ) : (
          <div className="font-heading font-bold text-base text-muted italic">{team.is_virtual ? "Cizí klub" : "bez trenéra"}</div>
        )}
        {/* Dlouhé názvy („SK Slavoj Albrechtice nad Vltavou“) se na mobilu zalomí do své poloviny.
            Dřív řádek neměl omezenou šířku, název vytekl z buňky a ležel přes název druhého klubu. */}
        {team.is_virtual ? (
          <div className={`flex items-center gap-2 min-w-0 max-w-full ${isRight ? "flex-row-reverse" : ""}`}>
            <span className="shrink-0">
              <BadgePreview
                primary={team.primary_color}
                secondary={team.secondary_color}
                pattern={badgePattern}
                symbol={team.badge_symbol}
                initials={initials}
                size={32}
              />
            </span>
            <span className="font-heading font-bold text-sm leading-tight min-w-0 break-words">{team.name}</span>
          </div>
        ) : (
        <Link href={`/tym/${team.id}`} className={`flex items-center gap-2 min-w-0 max-w-full group ${isRight ? "flex-row-reverse" : ""}`}>
          <span className="shrink-0">
            <BadgePreview
              primary={team.primary_color}
              secondary={team.secondary_color}
              pattern={badgePattern}
              symbol={team.badge_symbol}
              initials={initials}
              size={32}
            />
          </span>
          <span className="font-heading font-bold text-sm leading-tight group-hover:text-pitch-500 transition-colors min-w-0 break-words">
            <TeamName name={team.name} isAi={manager?.coachIsAi === true} wrap />
          </span>
        </Link>
        )}
        {team.is_virtual && team.city && (
          <div className="text-xs text-muted">{team.city}{team.country === "DE" ? ", Německo 🇩🇪" : ""}</div>
        )}
        <div className={`flex flex-wrap gap-1.5 mt-1 ${isRight ? "justify-end" : "justify-start"}`}>
          {team.budget != null && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-heading font-bold tabular-nums">
              {formatKc(team.budget)}
            </span>
          )}
          {team.reputation != null && (
            <span className="px-2 py-0.5 rounded-full bg-gold-500/10 text-xs font-heading font-bold text-gold-600 tabular-nums">
              Rep. {team.reputation}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
