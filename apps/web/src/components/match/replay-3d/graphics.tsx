"use client";

import { FaceAvatar } from "@/components/players/face-avatar";
import type { ReplayEvent, ReplayPlayer, ShotResult } from "./scenes";

interface Lineup { starters: ReplayPlayer[]; subs: ReplayPlayer[] }
/** Co se právě hraje: událost (při „ŠANCE!“ ta, která teprve přijde) a kolik událostí už proběhlo. */
export interface GraphicsProps {
  detail: Record<string, unknown>;
  events: ReplayEvent[];
  idx: number;
  event: ReplayEvent | undefined;
  attack: boolean;
  /** Výsledek střely ve scéně (šance). */
  result: ShotResult | null;
}

const RESULTS: Record<ShotResult, string> = { goal: "GÓÓÓL!", saved: "CHYTIL BRANKÁŘ!", post: "TYČ!", bar: "BŘEVNO!", wide: "VEDLE!", over: "NAD BRÁNU!", blocked: "ZBLOKOVÁNO!" };
const TONES = { goal: "bg-green-500 text-white", danger: "bg-orange-500 text-white", miss: "bg-red-500 text-white", yellow: "bg-yellow-400 text-gray-900", red: "bg-red-600 text-white", info: "bg-white/90 text-gray-900" };
export interface Label { text: string; tag?: string; sub?: string; tone: keyof typeof TONES }

const teamName = (detail: Record<string, unknown>, e: ReplayEvent) => (e.teamId === 1 ? detail.home_name : detail.away_name) as string;
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
 * by se přečíst. Jméno je v nápisu jen tam, kde dole není titulek s hráčem.
 */
function labelOf({ detail, events, idx, event, attack, result }: GraphicsProps): Label | null {
  if (!event) return null;
  const index = attack ? idx : idx - 1;
  if (event.detail?.startsWith("shootout:")) return { text: "ROZSTŘEL", tag: event.detail === "shootout:goal" ? "GÓL" : "NEDAL", sub: teamName(detail, event), tone: event.detail === "shootout:goal" ? "goal" : "miss" };
  if (event.type === "corner" || event.type === "freekick" || (attack && event.source !== "penalty")) return { text: "ŠANCE", tag: chanceOrigin(events, index), sub: teamName(detail, event), tone: "danger" };
  if (attack || event.type === "penalty") return { text: "PENALTA", sub: event.playerName, tone: "danger" };
  switch (event.type) {
    case "goal": return { text: RESULTS.goal, tone: "goal" };
    case "chance": return { text: event.detail?.startsWith("penalty_") && result !== "saved" ? "NEPROMĚNIL!" : RESULTS[result ?? "wide"], sub: event.playerName, tone: "miss" };
    case "card": return { text: event.detail === "red" ? "ČERVENÁ KARTA" : "ŽLUTÁ KARTA", tone: event.detail === "red" ? "red" : "yellow" };
    case "injury": return { text: "ZRANĚNÍ", tone: "miss" };
    case "substitution": return { text: "STŘÍDÁNÍ", tone: "info" };
    default: return null;
  }
}

export function EventLabel(props: GraphicsProps & { override?: Label }) {
  const label = props.override ?? labelOf(props);
  if (!label) return null;
  return (
    <div className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none">
      {/* Stejný nápis po sobě (roh → šance) se znovu neanimuje. */}
      <div key={`${label.text}-${label.tag}`} className={`flex items-center gap-2 px-3 py-1 rounded-lg shadow-lg font-heading animate-in fade-in zoom-in-95 duration-200 ${TONES[label.tone]}`}>
        <span className="font-[900] text-base sm:text-xl tracking-wide">{label.text}</span>
        {label.tag && <span className="px-1.5 py-0.5 rounded bg-black/25 font-[800] text-[10px] sm:text-xs tracking-wide">{label.tag}</span>}
        {label.sub && <span className="font-bold text-xs sm:text-sm opacity-90 truncate max-w-[40vw]">{label.sub}</span>}
      </div>
    </div>
  );
}

/** Kdo dal góly do události `idx`, po hráčích: „Novák 12', 30' · Dvořák 55'“. */
function scorers(events: ReplayEvent[], idx: number, teamId: number): string {
  const byPlayer = new Map<string, number[]>();
  for (const e of events.slice(0, idx)) if (e.type === "goal" && e.teamId === teamId) byPlayer.set(e.playerName, [...(byPlayer.get(e.playerName) ?? []), e.minute]);
  return [...byPlayer].map(([name, minutes]) => `${name.split(" ").at(-1)} ${minutes.map((m) => `${m}'`).join(", ")}`).join(" · ");
}

/**
 * Televizní titulek přes spodek obrazu u gólu, karty, zranění a střídání: obličej a jméno hráče a vpravo to,
 * co nápis nahoře neříká (minuta, asistence, střelci zápasu, druh zranění, kdo odchází).
 */
export function EventCard({ detail, events, idx, event, attack }: GraphicsProps) {
  if (!event || attack || !["goal", "card", "injury", "substitution"].includes(event.type)) return null;
  const player = playerOf(detail, event);
  const next = events[idx];
  const assist = event.type === "goal" && next?.type === "assist" && next.minute === event.minute && next.teamId === event.teamId ? next.playerName : null;
  const goals = events.slice(0, idx).filter((e) => e.type === "goal" && e.playerName === event.playerName && e.teamId === event.teamId).length;
  // „Střídání: X za Y“, u vyloučeného brankáře „… ven jde Y“.
  const out = event.description.match(/(?: za | ven jde )([^,]+)$/)?.[1];
  const under = event.type === "goal" ? [goals > 1 ? `${goals}. gól v zápase` : null, assist ? `asistence ${assist}` : null].filter(Boolean).join(" · ") || teamName(detail, event)
    : event.type === "substitution" ? `↓ ${out}`
    : event.type === "injury" ? event.detail
    : teamName(detail, event);
  const board = event.type === "goal" ? [1, 2].map((teamId) => scorers(events, idx, teamId)) : null;
  return (
    <div className="absolute bottom-2 left-32 right-2 z-30 pointer-events-none">
      <div key={idx} className="flex items-stretch h-10 sm:h-14 rounded-lg overflow-hidden shadow-xl bg-black/80 text-white font-heading animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: (event.teamId === 1 ? detail.home_color : detail.away_color) as string }} />
        <div className="shrink-0 w-10 sm:w-14 bg-white/90 overflow-hidden flex items-center justify-center text-gray-700 font-[800]">
          {player?.avatar ? <FaceAvatar faceConfig={player.avatar} size={46} className="scale-[0.72] sm:scale-100" /> : event.playerName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        <div className="px-3 min-w-0 flex-1 flex flex-col justify-center">
          <div className="text-sm sm:text-lg font-[800] uppercase tracking-wide leading-tight truncate">{event.type === "substitution" ? `↑ ${event.playerName}` : event.playerName}</div>
          {under && <div className="text-[10px] sm:text-xs opacity-80 truncate">{under}</div>}
        </div>
        {board && (
          <div className="hidden sm:flex flex-col justify-center px-3 border-l border-white/15 text-xs leading-snug min-w-0 max-w-[50%]">
            {board.map((list, n) => list && <div key={n} className="truncate"><span className="opacity-60">{(n === 0 ? detail.home_name : detail.away_name) as string}</span> {list}</div>)}
          </div>
        )}
        <div className="shrink-0 px-3 flex items-center border-l border-white/15 font-[800] text-sm sm:text-lg tabular-nums">{event.minute}&apos;</div>
      </div>
    </div>
  );
}
