"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clientOnly } from "@/components/client-only";
import { apiFetch } from "@/lib/api";
import { builtExtensionsOf } from "@/components/stadium/stadium-3d/stand-levels";
import type { WeatherType } from "@/components/stadium/stadium-3d/constants";
import { venueExtensions, venueFacilities } from "@/app/(hra)/turnaj/venue-scene";
import { ReplayScene, type ReplayStep } from "./ReplayScene";
import { Replay, type ReplayEvent, type ReplayKit, type ReplayPlayer, type ShotResult } from "./scenes";

const Stadium3D = clientOnly(() => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D));

/** Stav 2D záznamu (zaznam/page.tsx); 3D kreslí totéž, co právě ukazuje on. */
export interface ReplayProgress {
  /** Kolik událostí už 2D záznam ukázal. */
  idx: number;
  flash: "goal" | "card" | "chance" | "attacking" | "injury" | "penalty" | null;
  kickoff: "1st" | "2nd" | null;
  halfTime: boolean;
  finished: boolean;
  fast: boolean;
  homeGoals: number;
  awayGoals: number;
}

interface StoredLineup { starters: ReplayPlayer[]; subs: ReplayPlayer[] }
interface StadiumData {
  capacity?: number;
  facilities: Record<string, number>;
  standExtensions?: { slots: { slot: string; built?: { kind: string; level: number } | null }[] };
}

const RESULT_LABELS: Record<ShotResult, string> = { goal: "GÓÓÓL!", saved: "CHYTIL!", post: "TYČ!", bar: "BŘEVNO!", wide: "MIMO!", over: "NAD!", blocked: "ZBLOKOVÁNO!" };
const TONES = { goal: "bg-green-500 text-white", danger: "bg-orange-500 text-white", miss: "bg-red-500 text-white", yellow: "bg-yellow-400 text-gray-900", red: "bg-red-600 text-white", info: "bg-white/90 text-gray-900" };

const initials = (name: string) => name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/** 3D záznam zápasu na stadionu domácích, řízený stavem 2D záznamu. Vyplní rodiče, do kterého se vloží. */
export function Replay3D({ detail, events, progress }: { detail: Record<string, unknown>; events: ReplayEvent[]; progress: ReplayProgress }) {
  const { idx, flash, kickoff, halfTime, finished, fast, homeGoals, awayGoals } = progress;
  const homeName = detail.home_name as string, awayName = detail.away_name as string;
  const kits = useMemo(() => ({ home: detail.home_kit as ReplayKit, away: detail.away_kit as ReplayKit }), [detail]);
  const replay = useMemo(() => new Replay({
    matchId: detail.id as string, events,
    home: { name: homeName, kit: kits.home, ...(detail.home_lineup_data as StoredLineup) },
    away: { name: awayName, kit: kits.away, ...(detail.away_lineup_data as StoredLineup) },
  }), [detail, events, homeName, awayName, kits]);

  // Krok 2D záznamu → scéna: „ŠANCE!“ je útočná fáze události, která teprve přijde, jinak běží poslední ukázaná událost.
  const attack = flash === "attacking";
  const still = kickoff !== null || halfTime || (idx === 0 && !attack);
  const scene = useMemo(() => (still ? replay.kickoff(idx) : replay.scene(attack ? idx : idx - 1)), [replay, still, attack, idx]);
  const started = useMemo(() => ({ scene, attack, startedAt: performance.now() }), [scene, attack]);
  const step = useRef<ReplayStep>({ ...started, rate: 1 });
  /** Jen při vývoji: scéna zastavená pro snímek obrazovky (window.__replay3d.freeze). */
  const frozen = useRef<ReplayStep | null>(null);
  step.current = frozen.current ?? { ...started, rate: fast ? 2 : 1 };
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const freeze = (index: number, attackBeat: boolean, seconds: number) => {
      // Posledních 0,4 s se přehraje, ať mají hráči krok a natočení jako při sledování.
      frozen.current = { scene: index < 0 ? replay.kickoff(0) : replay.scene(index), attack: attackBeat, startedAt: performance.now() - Math.max(0, seconds - 0.4) * 1000, rate: 1, hold: seconds };
      step.current = frozen.current;
    };
    Object.assign(window, { __replay3d: { replay, freeze } });
  }, [replay]);

  // Stadion domácích; turnaj se hraje na hřišti z losu a velkoklub z poháru stadion ve hře nemá.
  const venue = detail.isTournament === true ? (detail.venue as { capacity?: number; look?: Record<string, unknown> } | null) : null;
  const homeTeamId = detail.home_team_id as string | null;
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  useEffect(() => {
    if (venue?.look) {
      const look = venue.look;
      setStadium({ capacity: venue.capacity, facilities: venueFacilities(look), standExtensions: { slots: venueExtensions(look).map((e) => ({ slot: e.slot, built: { kind: e.kind, level: e.level } })) } });
    } else if (homeTeamId) {
      apiFetch<StadiumData>(`/api/teams/${homeTeamId}/stadium`).then(setStadium).catch((e) => console.error("stadion pro 3D záznam:", e));
    }
  }, [venue, homeTeamId]);

  const [fullscreen, setFullscreen] = useState(false);
  const event = attack ? events[idx] : events[idx - 1];
  const label = labelOf();
  const attendance = detail.attendance as number | null;

  function labelOf(): { text: string; sub?: string; tone: keyof typeof TONES } | null {
    if (still || finished || !event) return null;
    const name = event.playerName;
    if (attack) return event.source === "penalty" ? { text: "PENALTA", sub: name, tone: "danger" } : { text: "ŠANCE!", sub: event.teamId === 1 ? homeName : awayName, tone: "danger" };
    if (event.detail?.startsWith("shootout:")) return { text: "ROZSTŘEL", sub: `${name}: ${event.detail === "shootout:goal" ? "gól" : "nedal"}`, tone: event.detail === "shootout:goal" ? "goal" : "miss" };
    switch (event.type) {
      case "goal": return { text: "GÓÓÓL!", sub: name, tone: "goal" };
      case "chance": return { text: event.detail?.startsWith("penalty_") ? "NEPROMĚNIL!" : RESULT_LABELS[scene.result!], sub: name, tone: "miss" };
      case "card": return { text: event.detail === "red" ? "ČERVENÁ KARTA" : "ŽLUTÁ KARTA", sub: name, tone: event.detail === "red" ? "red" : "yellow" };
      case "injury": return { text: "ZRANĚNÍ", sub: name, tone: "miss" };
      case "penalty": return { text: "PENALTA!", sub: name, tone: "danger" };
      case "corner": return { text: "ROH", sub: name, tone: "info" };
      case "freekick": return { text: event.detail === "direct" ? "PŘÍMÝ KOP" : "STANDARDKA", sub: name, tone: "info" };
      case "foul": return { text: "FAUL", sub: name, tone: "info" };
      case "substitution": return { text: "STŘÍDÁNÍ", sub: event.description.replace(/^[^:]*:\s*/, ""), tone: "info" };
      default: return null;
    }
  }

  const pens = typeof detail.home_pens === "number" && typeof detail.away_pens === "number" && detail.home_pens + detail.away_pens > 0 ? ` (pen. ${detail.home_pens}:${detail.away_pens})` : "";
  const curtain = kickoff ? { text: "VÝKOP", sub: kickoff === "2nd" ? "2. poločas" : "" }
    : halfTime ? { text: "POLOČAS", sub: `${homeGoals} : ${awayGoals}` }
    : finished ? { text: "KONEC", sub: `${detail.home_score} : ${detail.away_score}${pens}` } : null;

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-black" : "absolute inset-0 z-20 rounded-control overflow-hidden bg-black"}>
      <Stadium3D
        pitchCondition={(detail.pitch_condition as number | null) ?? 85}
        pitchType={(venue?.look?.pitch_type as string) ?? (detail.pitch_type as string) ?? "natural"}
        facilities={stadium?.facilities ?? { stands: 1, fence: 1, entrance_gate: 1 }}
        standExtensions={builtExtensionsOf(stadium?.standExtensions)}
        teamColor={(venue?.look?.primary as string) ?? (detail.home_color as string)}
        secondaryColor={(venue?.look?.secondary as string) ?? (detail.home_secondary as string)}
        badgePattern={venue ? "shield" : (detail.home_badge as string)}
        badgeInitials={venue ? "PM" : initials(homeName)}
        sponsors={venue ? ["P-Mobile"] : undefined}
        adBoardColor={venue ? "#C8006A" : undefined}
        stadiumName={(detail.stadium_name as string | null) ?? `Stadion ${homeName}`}
        // Na tribunách tolik lidí, kolik na zápas přišlo.
        attendanceRatio={attendance !== null && stadium?.capacity ? Math.min(1, attendance / stadium.capacity) : undefined}
        initialWeather={(detail.weather as WeatherType | null) ?? "sunny"}
        showControls={false}
        // Pohled „z tribuny“ nemá rozostření okrajů, které stadion používá u pohledů z dálky.
        initialViewpoint="main_stand"
        replay={(mainStand) => <ReplayScene replay={replay} kits={kits} step={step} tv={mainStand} />}
      />

      {label && (
        <div className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none">
          <div key={`${idx}-${flash}`} className={`flex items-baseline gap-2 px-3 py-1 rounded-lg shadow-lg font-heading animate-in fade-in zoom-in-95 duration-200 ${TONES[label.tone]}`}>
            <span className="font-[900] text-base sm:text-xl tracking-wide">{label.text}</span>
            {label.sub && <span className="font-bold text-xs sm:text-sm opacity-90 truncate max-w-[50vw]">{label.sub}</span>}
          </div>
        </div>
      )}
      {curtain && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/45">
          <div className="text-center font-heading text-white">
            <div className="font-[900] text-4xl sm:text-6xl tracking-widest">{curtain.text}</div>
            {curtain.sub && <div className="font-[800] text-xl sm:text-3xl text-white/80 mt-1 tabular-nums">{curtain.sub}</div>}
          </div>
        </div>
      )}
      {fullscreen && (
        <div className="absolute bottom-3 inset-x-0 z-30 flex justify-center pointer-events-none">
          <div className="px-3 py-1 rounded-lg bg-black/70 text-white font-heading font-bold text-sm tabular-nums">
            {homeName} {homeGoals} : {awayGoals} {awayName}{event ? ` · ${event.minute}'` : ""}
          </div>
        </div>
      )}
      <button onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Zmenšit" : "Na celou obrazovku"}
        className="absolute top-2 right-2 z-40 w-8 h-8 rounded-lg bg-black/60 hover:bg-black/80 text-white text-base leading-none">
        {fullscreen ? "✕" : "⛶"}
      </button>
    </div>
  );
}
