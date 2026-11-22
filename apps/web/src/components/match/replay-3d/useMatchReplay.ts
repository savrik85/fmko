"use client";

import { useCallback, useRef, useState } from "react";
import type { MatchEvent } from "@okresni-masina/shared";
import { clientOnly } from "../../client-only";
import type { ReplayInput, ReplayKit, ReplayPlan, ReplayPlayer } from "./timeline";
import type { ReplayClock } from "./ReplayActors";

interface StoredLineup { starters: ReplayPlayer[]; subs?: ReplayPlayer[] }

/** Data pro 3D záznam z detailu zápasu (liga, pohár i turnaj mají stejný tvar); bez dresů nebo sestav null. */
export function replayInputOf(r: Record<string, unknown>): ReplayInput | null {
  const events = r.events as MatchEvent[] | undefined;
  const homeLineup = r.home_lineup_data as StoredLineup | null;
  const awayLineup = r.away_lineup_data as StoredLineup | null;
  const homeKit = r.home_kit as ReplayKit | undefined;
  const awayKit = r.away_kit as ReplayKit | undefined;
  if (!events?.length || !homeLineup?.starters?.length || !awayLineup?.starters?.length || !homeKit || !awayKit) return null;
  if (typeof r.home_score !== "number" || typeof r.away_score !== "number") return null;
  return {
    matchId: r.id as string,
    events,
    commentary: (r.commentary as string[]) ?? [],
    home: { name: (r.home_name as string) ?? "Domácí", kit: homeKit, starters: homeLineup.starters, subs: homeLineup.subs ?? [] },
    away: { name: (r.away_name as string) ?? "Hosté", kit: awayKit, starters: awayLineup.starters, subs: awayLineup.subs ?? [] },
    score: { home: r.home_score, away: r.away_score },
    // Penalty po remíze; zápas bez rozstřelu má 0:0 nebo null.
    shootout: typeof r.home_pens === "number" && typeof r.away_pens === "number" && r.home_pens + r.away_pens > 0 ? { home: r.home_pens, away: r.away_pens } : null,
  };
}

/** Zápas jde přehrát ve 3D (hlavní tlačítko zápasového dne, tlačítko 3D ve 2D záznamu). */
export const canPlay3d = (r: Record<string, unknown>) => replayInputOf(r) !== null;

/** Hráči a míč ve scéně stadionu; kód se stáhne, až se záznam pustí. */
export const ReplayActors = clientOnly(() => import("./ReplayActors").then((m) => m.ReplayActors));

/** 3D záznam zápasu: `load` dostane detail zápasu, `start` sestaví plán (kód časové osy se stáhne teprve tehdy). */
export function useMatchReplay() {
  const clock = useRef<ReplayClock>({ t: 0, speed: 1, playing: true }).current;
  const [plan, setPlan] = useState<ReplayPlan | null>(null);
  const [input, setInput] = useState<ReplayInput | null>(null);
  const load = useCallback((detail: Record<string, unknown>) => setInput(replayInputOf(detail)), []);

  /** Vrací false, když 3D nejde (pak se pouští 2D záznam). */
  const start = useCallback(async () => {
    if (!input) return false;
    try {
      const { ReplayPlan } = await import("./timeline");
      const built = new ReplayPlan(input);
      // Pro snímky obrazovky při vývoji: posun v čase přes window.__replay.clock.t.
      if (process.env.NODE_ENV === "development") Object.assign(window, { __replay: { plan: built, clock } });
      setPlan(built);
      return true;
    } catch (e) {
      console.error("3D záznam nejde sestavit, pouští se 2D:", e);
      return false;
    }
  }, [input, clock]);

  return { plan, clock, available: input !== null, load, start };
}
