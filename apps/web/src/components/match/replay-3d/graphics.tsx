"use client";

import { FaceAvatar } from "@/components/players/face-avatar";
import { bestTextOn } from "@/lib/team-color";
import type { ReplayEvent, ReplayPlayer, ShotResult } from "./scenes";

interface Lineup { starters: ReplayPlayer[]; subs: ReplayPlayer[] }
/** Co se právě hraje: událost (při „ŠANCE“ ta, která teprve přijde) a její pořadí v zápase. */
export interface GraphicsProps {
  detail: Record<string, unknown>;
  events: ReplayEvent[];
  index: number;
  event: ReplayEvent | undefined;
  attack: boolean;
  /** Výsledek střely ve scéně (šance). */
  result: ShotResult | null;
}

const RESULTS: Record<ShotResult, string> = { goal: "GÓÓÓL!", saved: "CHYTIL BRANKÁŘ!", post: "TYČ!", bar: "BŘEVNO!", wide: "VEDLE!", over: "NAD BRÁNU!", blocked: "ZBLOKOVÁNO!" };
const TONES = { goal: "bg-green-500 text-white", danger: "bg-orange-500 text-white", miss: "bg-red-500 text-white", yellow: "bg-yellow-400 text-gray-900", red: "bg-red-600 text-white", info: "bg-white text-gray-900" };
export interface Label { text: string; tag?: string; sub?: string; tone: keyof typeof TONES }
/** Tmavá plocha televizní grafiky, stejná jako výsledková tabule 2D záznamu. */
const PANEL = "bg-[#0a0a0a]/90 text-white";

const teamName = (detail: Record<string, unknown>, e: ReplayEvent) => (e.teamId === 1 ? detail.home_name : detail.away_name) as string;
const teamColor = (detail: Record<string, unknown>, e: ReplayEvent) => (e.teamId === 1 ? detail.home_color : detail.away_color) as string;
const onColor = (color: string) => (bestTextOn(color) === "light" ? "#fff" : "#111827");
const playerOf = (detail: Record<string, unknown>, e: ReplayEvent): ReplayPlayer | undefined => {
  const lineup = detail[e.teamId === 1 ? "home_lineup_data" : "away_lineup_data"] as Lineup;
  return [...lineup.starters, ...lineup.subs].find((p) => p.name === e.playerName);
};

/** Z čeho šance vznikla: standardka týmu ve stejné minutě těsně před ní, nebo brejk. */
function chanceOrigin(events: ReplayEvent[], index: number): string | undefined {
  const e = events[index];
  const setPiece = events.slice(Math.max(0, index - 2), index + 1).find((x) => x.minute === e.minute && x.teamId === e.teamId && (x.type === "corner" || x.type === "freekick"));
  return setPiece ? (setPiece.type === "corner" ? "ROH" : setPiece.detail === "direct" ? "PŘÍMÝ KOP" : "STANDARDKA") : e.source === "counter" ? "PROTIÚTOK" : undefined;
}

/**
 * Nápis nahoře v obraze. Šance má jeden nápis od rozehrání po střelu („ŠANCE“ a z čeho vznikla), pak výsledek.
 * Roh, standardka ani faul vlastní nápis nemají: 2D záznam je vystřídá šancí nebo kartou během okamžiku a nedal
 * by se přečíst. Jméno hráče je v nápisu jen tam, kde dole není titulek s hráčem.
 */
function labelOf({ detail, events, index, event, attack, result }: GraphicsProps): Label | null {
  if (!event) return null;
  if (event.detail?.startsWith("shootout:")) return { text: "ROZSTŘEL", tag: event.detail === "shootout:goal" ? "GÓL" : "NEDAL", sub: teamName(detail, event), tone: event.detail === "shootout:goal" ? "goal" : "miss" };
  if (event.type === "corner" || event.type === "freekick" || (attack && event.source !== "penalty")) return { text: "ŠANCE", tag: chanceOrigin(events, index), sub: teamName(detail, event), tone: "danger" };
  if (attack || event.type === "penalty") return { text: "PENALTA", sub: event.playerName, tone: "danger" };
  switch (event.type) {
    case "goal": return { text: RESULTS.goal, sub: teamName(detail, event), tone: "goal" };
    // U výsledku je řečeno, čí jméno to je: samotné „VEDLE! Novák“ se dalo číst i jako jméno brankáře.
    case "chance": return { text: event.detail?.startsWith("penalty_") && result !== "saved" ? "NEPROMĚNIL!" : RESULTS[result ?? "wide"], sub: `${event.detail === "header_missed" ? "hlavičkoval" : "střílel"} ${event.playerName}`, tone: "miss" };
    case "card": return { text: event.detail === "red" ? "ČERVENÁ KARTA" : "ŽLUTÁ KARTA", sub: teamName(detail, event), tone: event.detail === "red" ? "red" : "yellow" };
    case "injury": return { text: "ZRANĚNÍ", sub: teamName(detail, event), tone: "miss" };
    case "substitution": return { text: "STŘÍDÁNÍ", sub: teamName(detail, event), tone: "info" };
    default: return null;
  }
}

/** Nápis akce: barevné pole s tím, co se děje, a tmavé pole s upřesněním. */
export function EventLabel(props: GraphicsProps & { override?: Label }) {
  const label = props.override ?? labelOf(props);
  if (!label) return null;
  return (
    <div className="absolute top-2 inset-x-12 z-30 flex justify-center pointer-events-none">
      {/* Stejný nápis po sobě (roh → šance) se znovu neanimuje. */}
      <div key={`${label.text}-${label.tag}`} className="flex items-stretch max-w-full rounded-lg overflow-hidden shadow-xl font-heading animate-in fade-in zoom-in-95 duration-200">
        <div className={`flex items-center px-3 py-1 font-[900] text-base sm:text-2xl tracking-wider whitespace-nowrap ${TONES[label.tone]}`}>{label.text}</div>
        {(label.tag || label.sub) && (
          <div className={`flex items-center gap-2 px-3 min-w-0 ${PANEL}`}>
            {label.tag && <span className="font-[800] text-[10px] sm:text-xs tracking-widest text-white/60 whitespace-nowrap">{label.tag}</span>}
            {label.sub && <span className="font-bold text-xs sm:text-base truncate">{label.sub}</span>}
          </div>
        )}
      </div>
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
 * Televizní titulek přes spodek obrazu u gólu, karty, zranění a střídání: obličej na barvě klubu, jméno hráče,
 * pod ním světlý pruh s tím, co nápis nahoře neříká (kolikátý gól a střelci zápasu, druh zranění, kdo odchází),
 * a minuta.
 */
export function EventCard({ detail, events, index, event, attack }: GraphicsProps) {
  if (!event || attack || !["goal", "card", "injury", "substitution"].includes(event.type)) return null;
  const player = playerOf(detail, event);
  const color = teamColor(detail, event);
  const goals = events.slice(0, index + 1).filter((e) => e.type === "goal" && e.playerName === event.playerName && e.teamId === event.teamId).length;
  // „Střídání: X za Y“, u vyloučeného brankáře „… ven jde Y“.
  const out = event.description.match(/(?: za | ven jde )([^,]+)$/)?.[1];
  const note = event.type === "goal" ? `${goals}. gól v zápase`
    : event.type === "substitution" ? `↓ ${out}`
    : event.type === "injury" ? event.detail
    : event.detail === "red" ? "vyloučen" : "napomenut";
  const board = event.type === "goal" ? [1, 2].map((teamId) => scorers(events, index, teamId)).filter(Boolean).join("   —   ") : null;
  return (
    <div className="absolute bottom-2 left-32 right-2 z-30 pointer-events-none">
      <div key={index} className="flex items-stretch h-11 sm:h-16 rounded-lg overflow-hidden shadow-xl font-heading animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="shrink-0 w-11 sm:w-16 overflow-hidden flex items-end justify-center font-[900] text-lg" style={{ backgroundColor: color, color: onColor(color) }}>
          {player?.avatar ? <FaceAvatar faceConfig={player.avatar} size={50} className="scale-[0.7] sm:scale-100 origin-bottom" /> : <span className="self-center">{event.playerName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className={`flex-1 flex items-center px-3 min-w-0 ${PANEL}`}>
            <span className="text-sm sm:text-xl font-[900] uppercase tracking-wide truncate">{event.type === "substitution" ? `↑ ${event.playerName}` : event.playerName}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 h-4 sm:h-6 bg-white/95 text-gray-900 text-[9px] sm:text-xs font-bold uppercase tracking-wider">
            <span className="truncate">{note}</span>
            {board && <span className="hidden sm:block truncate normal-case tracking-normal font-semibold text-gray-600">{board}</span>}
          </div>
        </div>
        <div className="shrink-0 flex items-center px-3 font-[900] text-sm sm:text-2xl tabular-nums" style={{ backgroundColor: color, color: onColor(color) }}>{event.minute}&apos;</div>
      </div>
    </div>
  );
}

/** Skóre a minuta v rohu obrazu na celou obrazovku (výsledková tabule stránky tam vidět není). */
export function ScoreBug({ detail, homeGoals, awayGoals, minute }: { detail: Record<string, unknown>; homeGoals: number; awayGoals: number; minute: number | undefined }) {
  const team = (name: string, color: string, goals: number, reverse: boolean) => (
    <div className={`flex items-center gap-2 ${reverse ? "flex-row-reverse" : ""}`}>
      <span className="w-1.5 self-stretch" style={{ backgroundColor: color }} />
      <span className="font-bold text-sm sm:text-base truncate max-w-[24vw]">{name}</span>
      <span className="font-[900] text-lg sm:text-2xl tabular-nums">{goals}</span>
    </div>
  );
  return (
    <div className="absolute top-2 left-2 z-30 pointer-events-none">
      <div className={`flex items-stretch gap-2 h-9 sm:h-11 rounded-lg overflow-hidden shadow-xl font-heading ${PANEL}`}>
        {team(detail.home_name as string, detail.home_color as string, homeGoals, false)}
        <span className="self-center text-white/40 font-[900]">:</span>
        {team(detail.away_name as string, detail.away_color as string, awayGoals, true)}
        {minute !== undefined && <span className="self-center px-3 border-l border-white/20 text-white/70 font-bold text-sm tabular-nums">{minute}&apos;</span>}
      </div>
    </div>
  );
}
