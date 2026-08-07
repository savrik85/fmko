"use client";

/** Drobnosti sdílené několika widgety. */

import type { ReactNode } from "react";
import Link from "next/link";
import type { Team } from "@/lib/api";

/** Slovní hodnocení kondice + barva. */
export function conditionLabel(condition: number): { text: string; color: string } {
  if (condition >= 80) return { text: "Fit", color: "text-pitch-500" };
  if (condition >= 50) return { text: "OK", color: "text-gold-500" };
  if (condition >= 20) return { text: "Unavený", color: "text-orange-500" };
  return { text: "Vyčerpaný", color: "text-card-red" };
}

/**
 * Klubová barva použitelná jako barva textu. Světlé dresy (bílá, žlutá) by na
 * bílé kartě zmizely, proto se u nich vrací klubová zelená.
 */
export function safeTeamColor(team: Team | null): string {
  const color = team?.primary_color || "#2D5F2D";
  const c = color.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#2D5F2D";
  return (r * 299 + g * 587 + b * 114) / 1000 > 200 ? "#2D5F2D" : color;
}

/** Iniciály z názvu týmu pro erb. */
export function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

/** „dnes / včera / před 3 d" z ISO data. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  return days === 0 ? "dnes" : days === 1 ? "včera" : `před ${days} d`;
}

/** Řádek žebříčku hráčů — jméno je klikatelné, pokud hráč v týmu ještě je. */
export function ScorerRow({
  p, i, children,
}: {
  p: { playerId: string; name: string; isDeparted?: boolean };
  i: number;
  children: ReactNode;
}) {
  const inner = (
    <>
      <span className="text-sm text-muted w-4 tabular-nums">{i + 1}.</span>
      <div className="min-w-0 flex-1">
        <div className="font-heading font-bold text-sm truncate">
          {p.name}
          {p.isDeparted && <span className="ml-1.5 text-[11px] text-muted uppercase font-normal">(bývalý)</span>}
        </div>
      </div>
      {children}
    </>
  );
  const base = "flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0 -mx-1 px-1 rounded";
  return p.isDeparted ? (
    <div className={`${base} opacity-60`}>{inner}</div>
  ) : (
    <a href={`/dashboard/player/${p.playerId}`} className={`${base} hover:bg-gray-50/50 transition-colors`}>{inner}</a>
  );
}

/** Malý štítek atributu trenéra. */
export function AttrPill({ label, value }: { label: string; value: number }) {
  const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 text-card-red";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-heading font-bold ${bg}`}>
      <span className="text-muted font-normal">{label}</span>{value}
    </span>
  );
}

/** Odkaz „… →" pod obsahem widgetu. */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="text-center pt-2">
      <Link href={href} className="text-sm text-pitch-500 font-heading font-bold hover:underline">
        {children}
      </Link>
    </div>
  );
}

/** Dlaždice V/R/P do řádku formy. */
export function FormChip({ result }: { result: string }) {
  const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";
  const text = result === "W" ? "V" : result === "L" ? "P" : "R";
  return (
    <span className={`w-6 h-6 rounded-md text-[11px] flex items-center justify-center font-bold text-white ${cls}`}>
      {text}
    </span>
  );
}
