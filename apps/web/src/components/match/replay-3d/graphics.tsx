"use client";

import { FaceAvatar } from "@/components/players/face-avatar";
import { BadgePreview, type BadgePattern } from "@/components/ui";
import { bestTextOn } from "@/lib/team-color";
import { useEffect, useState, type ReactNode } from "react";
import { chanceResult, substitutedOut, type ReplayCoach, type ReplayEvent, type ReplayKit, type ReplayLineup, type ReplayPlayer, type ShotResult } from "./scenes";

/** Co se právě hraje: událost (při „ŠANCE“ ta, která teprve přijde) a její pořadí v zápase. */
interface GraphicsProps {
  detail: Record<string, unknown>;
  events: ReplayEvent[];
  index: number;
  event: ReplayEvent | undefined;
  attack: boolean;
}

const RESULTS: Record<ShotResult, string> = { goal: "GÓÓÓL!", saved: "CHYTIL BRANKÁŘ!", post: "TYČ!", bar: "BŘEVNO!", wide: "VEDLE!", over: "NAD BRÁNU!", blocked: "ZBLOKOVÁNO!" };
const TONES = { goal: "bg-green-500 text-white", danger: "bg-orange-500 text-white", miss: "bg-red-500 text-white", yellow: "bg-yellow-400 text-gray-900", red: "bg-red-600 text-white", info: "bg-white text-gray-900" };
interface Label { text: string; tag?: string; sub?: string; tone: keyof typeof TONES }
/** Tmavá plocha televizní grafiky, stejná jako výsledková tabule 2D záznamu. */
const PANEL = "bg-[#0a0a0a]/90 text-white";
/** Výška výsledkové tabulky a nápisu akce: stojí nahoře vedle sebe. */
const BAR_HEIGHT = "h-9 sm:h-11";

export const initials = (name: string) => name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const teamName = (detail: Record<string, unknown>, e: ReplayEvent) => (e.teamId === 1 ? detail.home_name : detail.away_name) as string;
/** Barva týmu v grafice je barva dresu, ve kterém hraje. */
const kitColor = (detail: Record<string, unknown>, side: "home" | "away") => (detail[`${side}_kit`] as ReplayKit).shirt;
const onColor = (color: string) => (bestTextOn(color) === "light" ? "#fff" : "#111827");
const playerOf = (detail: Record<string, unknown>, e: ReplayEvent): ReplayPlayer | undefined => {
  const lineup = detail[e.teamId === 1 ? "home_lineup_data" : "away_lineup_data"] as ReplayLineup;
  return [...lineup.starters, ...lineup.subs].find((p) => p.name === e.playerName);
};

/** Z čeho šance vznikla: standardka týmu ve stejné minutě těsně před ní, nebo brejk. */
function chanceOrigin(events: ReplayEvent[], index: number): string | undefined {
  const e = events[index];
  const setPiece = events.slice(Math.max(0, index - 2), index + 1).find((x) => x.minute === e.minute && x.teamId === e.teamId && (x.type === "corner" || x.type === "freekick"));
  return setPiece ? (setPiece.type === "corner" ? "ROH" : setPiece.detail === "direct" ? "PŘÍMÝ KOP" : "STANDARDKA") : e.source === "counter" ? "PROTIÚTOK" : undefined;
}

/**
 * Nápis nahoře v obraze. Šance má jeden nápis od rozehrání (roh, standardka) po střelu: „ŠANCE“ a z čeho
 * vznikla; pak výsledek. Faul před kartou nápis nemá. Jméno hráče je v nápisu jen tam, kde dole není titulek
 * s hráčem.
 */
function labelOf({ detail, events, index, event, attack }: GraphicsProps): Label | null {
  if (!event) return null;
  if (event.detail?.startsWith("shootout:")) return { text: "ROZSTŘEL", tag: event.detail === "shootout:goal" ? "GÓL" : "NEDAL", sub: teamName(detail, event), tone: event.detail === "shootout:goal" ? "goal" : "miss" };
  if (event.type === "corner" || event.type === "freekick" || (attack && event.source !== "penalty")) return { text: "ŠANCE", tag: chanceOrigin(events, index), sub: teamName(detail, event), tone: "danger" };
  if (attack || event.type === "penalty") return { text: "PENALTA", sub: event.playerName, tone: "danger" };
  switch (event.type) {
    case "goal": return { text: RESULTS.goal, sub: teamName(detail, event), tone: "goal" };
    // U výsledku je řečeno, čí jméno to je: samotné „VEDLE! Novák“ se dalo číst i jako jméno brankáře.
    case "chance": {
      const result = chanceResult(event);
      return { text: event.detail?.startsWith("penalty_") && result !== "saved" ? "NEPROMĚNIL!" : RESULTS[result], sub: `${event.detail === "header_missed" ? "hlavičkoval" : "střílel"} ${event.playerName}`, tone: "miss" };
    }
    case "card": return { text: event.detail === "red" ? "ČERVENÁ KARTA" : "ŽLUTÁ KARTA", sub: teamName(detail, event), tone: event.detail === "red" ? "red" : "yellow" };
    case "injury": return { text: "ZRANĚNÍ", sub: teamName(detail, event), tone: "miss" };
    case "substitution": return { text: "STŘÍDÁNÍ", sub: teamName(detail, event), tone: "info" };
    default: return null;
  }
}

/** Nápis akce: barevné pole s tím, co se děje, a tmavé pole s upřesněním. Stejně vysoký jako výsledková tabulka vedle něj. */
export function EventLabel(props: GraphicsProps & { override?: Label }) {
  const label = props.override ?? labelOf(props);
  if (!label) return null;
  // Stejný nápis po sobě (roh → šance) se znovu neanimuje.
  return (
    <div key={`${label.text}-${label.tag}`} className={`ml-auto min-w-0 flex items-stretch ${BAR_HEIGHT} rounded-lg overflow-hidden shadow-xl font-heading animate-[fadeIn_0.2s_ease-out]`}>
      <div className={`flex items-center px-3 font-[900] text-base sm:text-2xl tracking-wider whitespace-nowrap ${TONES[label.tone]}`}>{label.text}</div>
      {(label.tag || label.sub) && (
        <div className={`flex items-center gap-2 px-3 min-w-0 ${PANEL}`}>
          {label.tag && <span className="font-[800] text-[10px] sm:text-xs tracking-widest text-white/60 whitespace-nowrap">{label.tag}</span>}
          {label.sub && <span className="font-bold text-xs sm:text-base truncate">{label.sub}</span>}
        </div>
      )}
    </div>
  );
}

/** Kdo dal góly do události `index` včetně, po hráčích: „Novák 12', 30' · Dvořák 55'“. */
function scorers(events: ReplayEvent[], index: number, teamId: number): string {
  const byPlayer = new Map<string, number[]>();
  for (const e of events.slice(0, index + 1)) if (e.type === "goal" && e.teamId === teamId) byPlayer.set(e.playerName, [...(byPlayer.get(e.playerName) ?? []), e.minute]);
  return [...byPlayer].map(([name, minutes]) => `${name.split(" ").at(-1)} ${minutes.map((m) => `${m}'`).join(", ")}`).join(" · ");
}

/**
 * Televizní titulek přes spodek obrazu u gólu, karty, zranění a střídání: obličej na barvě klubu, jméno hráče
 * a minuta. Pod jménem je světlý pruh s tím, co nápis nahoře neříká (kolikátý gól a střelci zápasu, druh zranění,
 * kdo odchází); u karty není, tam není co dodat.
 */
export function EventCard({ detail, events, index, event, attack }: GraphicsProps) {
  if (!event || attack || !["goal", "card", "injury", "substitution"].includes(event.type)) return null;
  const player = playerOf(detail, event);
  const color = kitColor(detail, event.teamId === 1 ? "home" : "away");
  const goals = events.slice(0, index + 1).filter((e) => e.type === "goal" && e.playerName === event.playerName && e.teamId === event.teamId).length;
  const note = event.type === "goal" ? `${goals}. gól v zápase`
    : event.type === "substitution" ? `↓ ${substitutedOut(event)}`
    : event.type === "injury" ? event.detail
    : null;
  const board = event.type === "goal" ? [1, 2].map((teamId) => scorers(events, index, teamId)).filter(Boolean).join("   —   ") : null;
  return <LowerThird key={index} color={color} name={event.playerName} avatar={player?.avatar} title={event.type === "substitution" ? `↑ ${event.playerName}` : event.playerName}
    note={note} board={board} badge={`${event.minute}'`} />;
}

/** Představení trenéra před výkopem: obličej, jméno, klub a kolik ligových zápasů sezóny jeho tým odehrál a vyhrál. */
export function CoachCard({ detail, side }: { detail: Record<string, unknown>; side: "home" | "away" }) {
  const coach = detail[`${side}_coach`] as ReplayCoach;
  const stats = coach.record && (
    <div className="text-center leading-none">
      <div className="text-[7px] sm:text-[10px] font-[900] uppercase tracking-[0.25em] opacity-80">V lize</div>
      <div className="flex gap-3 sm:gap-5 mt-0.5 sm:mt-1">
        {([["Zápasy", coach.record.played], ["Výhry", coach.record.won]] as const).map(([label, value]) => (
          <div key={label}>
            <div className="text-[7px] sm:text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
            <div className="mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return <LowerThird key={side} color={kitColor(detail, side)} name={coach.name} avatar={coach.avatar} title={coach.name}
    note={`Trenér · ${detail[`${side}_name`]}`} board={null} badge={stats} />;
}

/** Titulek přes spodek obrazu: obličej na barvě klubu, jméno, světlý pruh s poznámkou a pole vpravo. */
function LowerThird({ color, name, avatar, title, note, board, badge }: {
  color: string; name: string; avatar: Record<string, unknown> | undefined; title: string; note: string | null | undefined; board: string | null; badge: ReactNode;
}) {
  return (
    <div className="absolute bottom-2 inset-x-2 z-30 pointer-events-none">
      <div className="flex items-stretch h-11 sm:h-16 rounded-lg overflow-hidden shadow-xl font-heading animate-slide-up">
        <div className="shrink-0 w-11 sm:w-16 overflow-hidden flex items-end justify-center font-[900] text-lg" style={{ backgroundColor: color, color: onColor(color) }}>
          {avatar ? <FaceAvatar faceConfig={avatar} size={50} className="scale-[0.7] sm:scale-100 origin-bottom" /> : <span className="self-center">{initials(name)}</span>}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className={`flex-1 flex items-center px-3 min-w-0 ${PANEL}`}>
            <span className="text-sm sm:text-xl font-[900] uppercase tracking-wide truncate">{title}</span>
          </div>
          {note && (
            <div className="flex items-center justify-between gap-3 px-3 h-4 sm:h-6 bg-white/95 text-gray-900 text-[9px] sm:text-xs font-bold uppercase tracking-wider">
              <span className="truncate">{note}</span>
              {board && <span className="hidden sm:block truncate normal-case tracking-normal font-semibold text-gray-600">{board}</span>}
            </div>
          )}
        </div>
        {badge && <div className="shrink-0 flex items-center px-3 font-[900] text-sm sm:text-2xl tabular-nums" style={{ backgroundColor: color, color: onColor(color) }}>{badge}</div>}
      </div>
    </div>
  );
}

/** Nápis opakovaného záběru gólu; stojí nahoře mezi výsledkovou tabulkou a nápisem akce. */
export function ReplayChip() {
  return (
    <div className={`hidden group-data-[replaying]/shot:flex items-center px-3 ${BAR_HEIGHT} rounded-lg bg-red-600 text-white text-sm sm:text-lg font-heading font-[900] tracking-widest whitespace-nowrap shadow-xl`}>
      <span className="sm:hidden">↺ ZNOVU</span><span className="hidden sm:inline">↺ OPAKOVANÝ ZÁBĚR</span>
    </div>
  );
}

/**
 * Výsledková tabulka: skóre a minuta. Po gólu (`scored` = kdo ho dal) pod ní vyskočí znak klubu s novým skóre
 * a doletí na tabulku; teprve pak se na ní skóre změní.
 */
export function ScoreBug({ detail, homeGoals, awayGoals, minute, scored, fast }: {
  detail: Record<string, unknown>; homeGoals: number; awayGoals: number; minute: number | undefined; scored: "home" | "away" | null; fast: boolean;
}) {
  // Po gólu: 0 = na tabulce je staré skóre (míč je sotva v síti), 1 = pod tabulkou je znak s novým skóre, 2 = letí na ni, 3 = skóre je na tabulce.
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!scored) return;
    const timers = [500, 1700, 2300].map((ms, n) => setTimeout(() => setStep(n + 1), ms / (fast ? 2 : 1)));
    return () => { timers.forEach(clearTimeout); setStep(0); };
  }, [scored, fast]);
  const team = (side: "home" | "away", goals: number) => {
    const name = detail[`${side}_name`] as string, flying = scored === side && step < 3;
    return (
      <div className={`flex items-center gap-2 ${side === "away" ? "flex-row-reverse" : ""}`}>
        <span className={`w-1.5 self-stretch ${side === "home" ? "rounded-l-lg" : ""}`} style={{ backgroundColor: kitColor(detail, side) }} />
        <span className="hidden sm:block font-bold text-base truncate max-w-[9rem]">{name}</span>
        <span className="sm:hidden font-bold text-sm">{initials(name)}</span>
        <span className="relative font-[900] text-lg sm:text-2xl tabular-nums">
          {flying ? goals - 1 : goals}
          {flying && (
            <span className={`absolute left-1/2 top-1/2 z-10 -translate-x-1/2 flex items-center justify-center transition-all duration-500 ease-in-out ${
              step === 0 ? "translate-y-full scale-0 opacity-0" : step === 1 ? "translate-y-full scale-[1.6] sm:scale-[2.2]" : "-translate-y-1/2 scale-50 opacity-0"}`}>
              {/* Pohár ukládá klubům jen barvu: znak má výchozí tvar a bílý doplněk, stejně jako v záhlaví záznamu. */}
              <BadgePreview primary={detail[`${side}_color`] as string} secondary={(detail[`${side}_secondary`] as string | null) ?? "#FFF"}
                pattern={(detail[`${side}_badge`] as BadgePattern | null) ?? "shield"} initials="" size={48} />
              <span className="absolute text-white [text-shadow:0_1px_4px_#000]">{goals}</span>
            </span>
          )}
        </span>
      </div>
    );
  };
  return (
    <div className={`shrink-0 flex items-stretch gap-2 ${BAR_HEIGHT} rounded-lg shadow-xl font-heading ${PANEL}`}>
      {team("home", homeGoals)}
      <span className="self-center text-white/40 font-[900]">:</span>
      {team("away", awayGoals)}
      {minute !== undefined && <span className="self-center px-2 sm:px-3 border-l border-white/20 text-white/70 font-bold text-sm tabular-nums">{minute}&apos;</span>}
    </div>
  );
}
