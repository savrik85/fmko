"use client";

/**
 * Řádek zápasu pro výpisy (turnaj, pohár): znaky klubů, jména jako odkazy a výsledková
 * tabule uprostřed. Tabule je jediný výrazný prvek — tmavá jako na okresním hřišti,
 * u neodehraného zápasu ukazuje výkop a vede na sestavu, u odehraného na detail.
 *
 * Mobil: kluby pod sebou, tabule vpravo s čísly u svého týmu.
 * Od sm: domácí | tabule | hosté v jednom řádku.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { BadgePreview, type BadgePattern } from "@/components/ui";

export interface FixtureCrest {
  pattern: string | null;
  primary: string | null;
  secondary: string | null;
  initials: string | null;
  symbol: string | null;
}

export interface FixtureSide {
  name: string;
  /** Odkaz na klub; bez něj se jméno jen vypíše (volný los). */
  href?: string | null;
  color?: string | null;
  crest?: FixtureCrest | null;
  /** Vygenerovaný klub bez týmu ve hře (pohárový velkoklub). */
  italic?: boolean;
}

export interface FixtureScore {
  home: number;
  away: number;
  homePens?: number | null;
  awayPens?: number | null;
}

interface FixtureRowProps {
  home: FixtureSide;
  away: FixtureSide;
  score?: FixtureScore | null;
  /** Text v tabuli před zápasem, typicky čas výkopu. */
  kickoff?: string | null;
  winner?: "home" | "away" | null;
  /** Kam vede tabule: detail odehraného zápasu nebo sestava na nadcházející. */
  href?: string | null;
  hrefLabel?: string;
  /** Hřiště, diváci, překvapení… */
  meta?: ReactNode;
  /** Barva proužku vlevo pro zápas mého klubu. */
  accent?: string | null;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter((w) => /\p{L}/u.test(w[0] ?? "")).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function Crest({ side }: { side: FixtureSide }) {
  const c = side.crest;
  return (
    <BadgePreview
      primary={c?.primary || side.color || "#5c6b52"}
      secondary={c?.secondary || "#FFFFFF"}
      pattern={(c?.pattern as BadgePattern) || "shield"}
      initials={c?.initials || initialsOf(side.name)}
      symbol={c?.symbol}
      size={28}
    />
  );
}

function Name({ side, state, align }: { side: FixtureSide; state: "win" | "loss" | "even"; align: "left" | "right" }) {
  const tone = state === "win" ? "font-bold text-ink" : state === "loss" ? "font-medium text-ink/55" : "font-semibold text-ink";
  const cls = `min-w-0 truncate text-base leading-tight ${tone} ${side.italic ? "italic" : ""} ${align === "right" ? "sm:text-right" : ""}`;
  return side.href
    ? <Link href={side.href} className={`${cls} hover:underline`}>{side.name}</Link>
    : <span className={cls}>{side.name}</span>;
}

/** Tabule: od sm vodorovně „2 : 1", na mobilu čísla pod sebou u svých týmů. */
function Board({ score, kickoff, winner }: { score?: FixtureScore | null; kickoff?: string | null; winner?: "home" | "away" | null }) {
  if (!score) {
    return (
      <span className="flex items-center justify-center rounded-md border border-ink/15 bg-paper px-2.5 h-9 min-w-[3.75rem] font-heading font-bold text-sm text-ink tabular-nums">
        {kickoff ?? "–"}
      </span>
    );
  }
  const digit = (v: number, side: "home" | "away") => (
    <span className={`tabular-nums ${winner && winner !== side ? "text-white/55" : "text-white"}`}>{v}</span>
  );
  return (
    <span className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-md bg-ink px-2.5 py-1.5 sm:py-0 sm:h-9 min-w-[2.5rem] sm:min-w-[3.75rem] font-heading font-[800] text-lg leading-none">
      {digit(score.home, "home")}
      <span className="hidden sm:inline text-white/40 font-bold">:</span>
      {digit(score.away, "away")}
    </span>
  );
}

export function FixtureRow({ home, away, score, kickoff, winner, href, hrefLabel, meta, accent }: FixtureRowProps) {
  const state = (side: "home" | "away") => (!score || !winner ? "even" : winner === side ? "win" : "loss");
  const pens = score && score.homePens != null && score.awayPens != null;
  const board = <Board score={score} kickoff={kickoff} winner={winner} />;
  const boardEl = href
    ? <Link href={href} aria-label={hrefLabel ?? `${home.name} proti ${away.name}`} className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pitch-500 hover:opacity-90">{board}</Link>
    : <span className="shrink-0">{board}</span>;

  return (
    <div className="relative px-4 py-3" style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}>
      {/* Mobil: kluby pod sebou, tabule vpravo */}
      <div className="flex items-center gap-3 sm:hidden">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2.5 min-w-0"><Crest side={home} /><Name side={home} state={state("home")} align="left" /></div>
          <div className="flex items-center gap-2.5 min-w-0"><Crest side={away} /><Name side={away} state={state("away")} align="left" /></div>
        </div>
        {boardEl}
      </div>

      {/* Od sm: domácí | tabule | hosté */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-end gap-2.5 min-w-0"><Name side={home} state={state("home")} align="right" /><Crest side={home} /></div>
        {boardEl}
        <div className="flex items-center gap-2.5 min-w-0"><Crest side={away} /><Name side={away} state={state("away")} align="left" /></div>
      </div>

      {(meta || pens) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted sm:justify-center">
          {pens && <span className="font-heading font-bold text-ink/70">penalty {score!.homePens}:{score!.awayPens}</span>}
          {meta}
        </div>
      )}
    </div>
  );
}

/** Skupina zápasů (den, kolo) s nadpisem a počtem. */
export function FixtureGroup({ title, note, children }: { title: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
        <h3 className="font-heading font-bold text-base text-ink">{title}</h3>
        {note && <span className="text-sm text-muted shrink-0">{note}</span>}
      </div>
      <div className="card overflow-hidden divide-y divide-gray-100">{children}</div>
    </section>
  );
}
