"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { BadgePreview } from "@/components/ui/badge-preview";
import type { BadgePattern } from "@/components/ui/badge-preview";

interface PageHeaderProps {
  name?: string;
  detail?: string;
  color?: string;
  badge?: ReactNode | null;
  children?: ReactNode | null;
}

export function PageHeader({ name, detail, color, badge, children }: PageHeaderProps) {
  const ctx = useTeam();
  const bg = color || ctx.primaryColor || "#2D5F2D";
  const displayName = name || ctx.teamName || "";
  const displayDetail = detail ?? (ctx.villageName && ctx.district ? `${ctx.villageName} · ${ctx.district}` : null);

  const isLight = (() => {
    const c = bg.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  })();
  const txt = isLight ? "text-gray-900" : "text-white";
  const txtMuted = isLight ? "text-gray-500" : "text-white/60";
  const boxBg = isLight ? "bg-black/5" : "bg-white/10";
  const boxBgHover = isLight ? "hover:bg-black/10" : "hover:bg-white/20";
  const boxLabel = isLight ? "text-gray-400" : "text-white/50";

  const autoInitials = (name || ctx.teamName || "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  const effectiveInitials = ctx.badgeInitials || autoInitials;
  const defaultBadge = (color || ctx.primaryColor) ? (
    <BadgePreview
      primary={ctx.badgePrimary || color || ctx.primaryColor || "#2D5F2D"}
      secondary={ctx.badgeSecondary || ctx.secondaryColor || "#FFFFFF"}
      pattern={(ctx.badgePattern as BadgePattern) || "shield"}
      initials={effectiveInitials}
      symbol={ctx.badgeSymbol}
      size={44}
    />
  ) : null;

  const renderedBadge = badge === null ? null : (badge ?? defaultBadge);

  const defaultChildren = (
    <Link href="/dashboard/liga" className={`${boxBg} ${boxBgHover} rounded-xl px-4 py-2.5 text-center transition-colors`}>
      <div className={`font-heading font-[800] text-2xl tabular-nums leading-none ${txt}`}>
        {ctx.leaguePosition != null ? `${ctx.leaguePosition}.` : "—"}
      </div>
      <div className={`${boxLabel} text-[10px] font-heading font-bold uppercase mt-1`}>Místo v lize</div>
    </Link>
  );

  const renderedChildren = children === null ? null : (children ?? defaultChildren);

  return (
    <div
      className="hero-gradient py-3 px-5 sm:px-8"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {renderedBadge && <div className="shrink-0">{renderedBadge}</div>}
          <div className="min-w-0">
            <div className={`font-heading font-[800] ${txt} text-xl sm:text-2xl leading-tight truncate`}>
              {displayName}
            </div>
            {displayDetail && (
              <div className={`${txtMuted} text-sm mt-0.5 truncate`}>{displayDetail}</div>
            )}
          </div>
        </div>
        {renderedChildren && <div className="flex items-center gap-3 shrink-0">{renderedChildren}</div>}
      </div>
    </div>
  );
}

export function HeaderStat({ value, label, light }: { value: string | number; label: string; light?: boolean }) {
  return (
    <div className={`${light ? "bg-black/5" : "bg-white/10"} rounded-xl px-4 py-2 text-center min-w-[60px]`}>
      <div className={`font-heading font-[800] text-xl tabular-nums leading-none ${light ? "text-gray-900" : "text-white"}`}>{value}</div>
      <div className={`${light ? "text-gray-400" : "text-white/50"} text-[10px] font-heading font-bold uppercase mt-1`}>{label}</div>
    </div>
  );
}
