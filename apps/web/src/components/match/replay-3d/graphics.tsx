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

const RESULTS: Record<ShotResult, string> = { goal: "GÓL", saved: "CHYTIL BRANKÁŘ", post: "TYČ", bar: "BŘEVNO", wide: "VEDLE", over: "NAD BRÁNU", blocked: "ZBLOKOVÁNO" };
const TONES = { goal: "bg-green-500 text-white", danger: "bg-orange-500 text-white", miss: "bg-red-500 text-white", yellow: "bg-yellow-400 text-gray-900", red: "bg-red-600 text-white", info: "bg-white/90 text-gray-900" };
interface Label { text: string; tag?: string; sub?: string; tone: keyof typeof TONES }

const teamName = (detail: Record<string, unknown>, e: ReplayEvent) => (e.teamId === 1 ? detail.home_name : detail.away_name) as string;
const playerOf = (detail: Record<string, unknown>, e: ReplayEvent): ReplayPlayer | undefined => {
  const lineup = detail[e.teamId === 1 ? "home_lineup_data" : "away_lineup_data"] as Lineup;
  return [...lineup.starters, ...lineup.subs].find((p) => p.name === e.playerName);
};

function labelOf({ detail, event, attack, result }: GraphicsProps): Label | null {
  if (!event) return null;
  const name = event.playerName;
  if (attack) return event.source === "penalty" ? { text: "PENALTA", sub: name, tone: "danger" } : { text: "ŠANCE", sub: teamName(detail, event), tone: "danger" };
  if (event.detail?.startsWith("shootout:")) return { text: "ROZSTŘEL", tag: event.detail === "shootout:goal" ? "GÓL" : "NEDAL", sub: name, tone: event.detail === "shootout:goal" ? "goal" : "miss" };
  switch (event.type) {
    case "goal": return { text: "GÓÓÓL!", sub: name, tone: "goal" };
    // Šance s výsledkem vedle sebe: „ŠANCE“ samotné neříká, jak dopadla.
    case "chance": return { text: event.detail?.startsWith("penalty_") ? "PENALTA" : "ŠANCE", tag: event.detail?.startsWith("penalty_") && result !== "saved" ? "NEPROMĚNIL" : RESULTS[result ?? "wide"], sub: name, tone: "miss" };
    case "card": return { text: event.detail === "red" ? "ČERVENÁ KARTA" : "ŽLUTÁ KARTA", sub: name, tone: event.detail === "red" ? "red" : "yellow" };
    case "injury": return { text: "ZRANĚNÍ", sub: name, tone: "miss" };
    case "penalty": return { text: "PENALTA!", sub: name, tone: "danger" };
    case "corner": return { text: "ROH", sub: name, tone: "info" };
    case "freekick": return { text: event.detail === "direct" ? "PŘÍMÝ KOP" : "STANDARDKA", sub: name, tone: "info" };
    case "foul": return { text: "FAUL", sub: name, tone: "info" };
    case "substitution": return { text: "STŘÍDÁNÍ", sub: teamName(detail, event), tone: "info" };
    default: return null;
  }
}

/** Nápis nahoře v obraze: o jakou akci jde, u šance i jak dopadla. */
export function EventLabel(props: GraphicsProps & { override?: Label }) {
  const label = props.override ?? labelOf(props);
  if (!label) return null;
  return (
    <div className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none">
      <div key={`${props.idx}-${props.attack}`} className={`flex items-center gap-2 px-3 py-1 rounded-lg shadow-lg font-heading animate-in fade-in zoom-in-95 duration-200 ${TONES[label.tone]}`}>
        <span className="font-[900] text-base sm:text-xl tracking-wide">{label.text}</span>
        {label.tag && <span className="px-1.5 py-0.5 rounded bg-black/25 font-[800] text-xs sm:text-sm tracking-wide">{label.tag}</span>}
        {label.sub && <span className="font-bold text-xs sm:text-sm opacity-90 truncate max-w-[40vw]">{label.sub}</span>}
      </div>
    </div>
  );
}

/** Kdo dal v zápase góly do události `idx` (včetně), po týmech: „Novák 12', 30' · Dvořák 55'“. */
function scorers(events: ReplayEvent[], idx: number, teamId: number): string {
  const byPlayer = new Map<string, number[]>();
  for (const e of events.slice(0, idx)) if (e.type === "goal" && e.teamId === teamId) byPlayer.set(e.playerName, [...(byPlayer.get(e.playerName) ?? []), e.minute]);
  return [...byPlayer].map(([name, minutes]) => `${name.split(" ").at(-1)} ${minutes.map((m) => `${m}'`).join(", ")}`).join(" · ");
}

/**
 * Televizní titulek dole v obraze u gólu, karty, zranění a střídání: obličej hráče, co se stalo, a u gólu
 * asistence a přehled střelců zápasu.
 */
export function EventCard({ detail, events, idx, event, attack }: GraphicsProps) {
  if (!event || attack || !["goal", "card", "injury", "substitution"].includes(event.type)) return null;
  const player = playerOf(detail, event);
  const next = events[idx];
  const assist = event.type === "goal" && next?.type === "assist" && next.minute === event.minute && next.teamId === event.teamId ? next.playerName : null;
  const goals = [...events.slice(0, idx)].filter((e) => e.type === "goal" && e.playerName === event.playerName && e.teamId === event.teamId).length;
  const title = event.type === "goal" ? "⚽ Gól" : event.type === "card" ? (event.detail === "red" ? "🟥 Červená karta" : "🟨 Žlutá karta") : event.type === "injury" ? "🏥 Zranění" : "🔁 Střídání";
  // „Střídání: X za Y“, u vyloučeného brankáře „… ven jde Y“.
  const out = event.description.match(/(?: za | ven jde )([^,]+)$/)?.[1];
  const line = event.type === "goal" ? [goals > 1 ? `${goals}. gól v zápase` : null, assist ? `asistence ${assist}` : null].filter(Boolean).join(" · ")
    : event.type === "injury" ? event.detail
    : event.type === "substitution" ? `↓ ${out}`
    : teamName(detail, event);
  return (
    <div className="absolute bottom-2 left-28 right-2 z-30 flex justify-center pointer-events-none">
      <div key={idx} className="flex items-stretch max-w-full rounded-lg overflow-hidden shadow-xl bg-black/80 text-white font-heading animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: (event.teamId === 1 ? detail.home_color : detail.away_color) as string }} />
        <div className="shrink-0 w-12 h-12 bg-white/90 overflow-hidden flex items-center justify-center text-gray-700 font-[800]">
          {player?.avatar ? <FaceAvatar faceConfig={player.avatar} size={40} /> : event.playerName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        <div className="px-2.5 py-1 min-w-0 flex flex-col justify-center">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wide opacity-80">{title} · {event.minute}&apos;</div>
          <div className="text-sm sm:text-base font-[800] leading-tight truncate">{event.type === "substitution" ? `↑ ${event.playerName}` : event.playerName}</div>
          {line && <div className="text-[10px] sm:text-xs opacity-80 truncate">{line}</div>}
        </div>
        {event.type === "goal" && (
          <div className="hidden sm:flex flex-col justify-center px-2.5 py-1 border-l border-white/15 text-[11px] leading-tight min-w-0 max-w-[45%]">
            {[1, 2].map((teamId) => {
              const list = scorers(events, idx, teamId);
              return list ? <div key={teamId} className="truncate"><span className="opacity-60">{(teamId === 1 ? detail.home_name : detail.away_name) as string}:</span> {list}</div> : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
