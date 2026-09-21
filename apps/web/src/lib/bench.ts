type Pos = "GK" | "DEF" | "MID" | "FWD";

interface SquadPlayer {
  id: string;
  position: string;
  overallRating: number;
  absent?: boolean;
}

/** Na zápas jede nejvýš 18 hráčů, základ a sedm náhradníků (jako v zápise o utkání). */
const MAX_MATCHDAY_SQUAD = 18;

/** Když omluvený hráč chybí na pozici, kdo za něj přednostně zaskočí. */
const REPLACEMENT_PRIORITY: Record<Pos, Pos[]> = {
  GK: ["GK", "DEF", "MID", "FWD"],
  DEF: ["DEF", "MID", "FWD", "GK"],
  MID: ["MID", "DEF", "FWD", "GK"],
  FWD: ["FWD", "MID", "DEF", "GK"],
};

/**
 * Kdo z hráčů mimo základ opravdu pojede na zápas. Kopíruje výběr enginu
 * (buildMatchPlayers v apps/api/src/multiplayer/match-runner.ts): za omluveného hráče
 * ze základu nejdřív zaskočí nejlepší volný na jeho pozici, zbylá místa do osmnácti
 * dostanou nejlepší podle ratingu. Kdo se nevejde, zůstává doma a střídat nemůže.
 *
 * `players` musí být seřazení stejně jako v API (overall_rating DESC) — při shodném
 * ratingu rozhoduje jejich pořadí, stejně jako v enginu.
 */
export function splitBench<T extends SquadPlayer>(
  players: T[],
  lineup: (string | null)[],
  slotPositions: Pos[],
): { subs: T[]; standIns: Array<{ player: T; replacing: T }>; leftOut: T[] } {
  const byRating = (a: T, b: T) => b.overallRating - a.overallRating;
  const byId = new Map(players.map((p) => [p.id, p]));
  const outsideLineup = players.filter((p) => !lineup.includes(p.id));
  const available = outsideLineup.filter((p) => !p.absent).sort(byRating);

  let startersPlaying = 0;
  const missingByPos: Record<Pos, T[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  lineup.forEach((id, i) => {
    const p = id ? byId.get(id) : undefined;
    if (!p) return;
    if (p.absent) missingByPos[slotPositions[i]].push(p);
    else startersPlaying++;
  });

  const used = new Set<string>();
  const standIns: Array<{ player: T; replacing: T }> = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    for (const absentStarter of missingByPos[pos]) {
      let replacement: T | undefined;
      for (const tryPos of REPLACEMENT_PRIORITY[pos]) {
        replacement = available.find((p) => !used.has(p.id) && p.position === tryPos);
        if (replacement) break;
      }
      if (!replacement) continue;
      used.add(replacement.id);
      standIns.push({ player: replacement, replacing: absentStarter });
    }
  }

  const benchSlots = Math.max(0, MAX_MATCHDAY_SQUAD - startersPlaying - standIns.length);
  const remaining = available.filter((p) => !used.has(p.id));
  return {
    subs: remaining.slice(0, benchSlots),
    standIns,
    leftOut: [...remaining.slice(benchSlots), ...outsideLineup.filter((p) => p.absent).sort(byRating)],
  };
}
