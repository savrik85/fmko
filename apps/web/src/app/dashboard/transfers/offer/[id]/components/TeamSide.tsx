"use client";

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import { BadgePreview, type BadgePattern } from "@/components/ui/badge-preview";

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
}

export interface ManagerSummary {
  id: string;
  name: string;
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
      <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">{label}</div>
      {hasAvatar ? (
        <FaceAvatar faceConfig={manager!.avatar} size={88} />
      ) : (
        <div className="w-[88px] h-[106px] bg-gray-100 rounded-lg flex items-center justify-center text-white/40 text-3xl">👤</div>
      )}
      <div className={`flex flex-col gap-1 ${isRight ? "items-end" : "items-start"} min-w-0 w-full`}>
        {manager ? (
          <Link href={`/dashboard/manager/${manager.id}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors truncate max-w-full">
            {manager.name}
          </Link>
        ) : (
          <div className="font-heading font-bold text-base text-muted italic">bez trenéra</div>
        )}
        <Link href={`/klub/${team.id}`} className={`flex items-center gap-2 group ${isRight ? "flex-row-reverse" : ""}`}>
          <BadgePreview
            primary={team.primary_color}
            secondary={team.secondary_color}
            pattern={badgePattern}
            symbol={team.badge_symbol}
            initials={initials}
            size={32}
          />
          <span className="font-heading font-bold text-sm group-hover:text-pitch-500 transition-colors truncate">{team.name}</span>
        </Link>
        <div className={`flex flex-wrap gap-1.5 mt-1 ${isRight ? "justify-end" : "justify-start"}`}>
          {team.budget != null && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-heading font-bold tabular-nums">
              {team.budget.toLocaleString("cs")} Kč
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
