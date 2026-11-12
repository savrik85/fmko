/**
 * Automatická jedenáctka: kdo nastoupí a kde, když sestavu neskládá trenér (U21 vždy,
 * áčko bez uložené sestavy).
 *
 * Dřív automat bral pevně jednu formaci a místa, na která neměl hráče, zaplnil prvním
 * volným bez ohledu na pozici (náhradní brankář v útoku). Teď zkusí všechny formace, které
 * hra nabízí, a vybere tu, ve které stojí nejvíc hráčů na vlastní pozici. Co zbyde, doplní
 * hráčem z nejbližší řady.
 */

export type LineupSlot = "GK" | "DEF" | "MID" | "FWD";

export interface AutoLineupPlayer {
  id: string;
  position: string;
  rating: number;
}

export interface AutoLineupPick {
  playerId: string;
  matchPosition: LineupSlot;
}

/** Formace, které hra nabízí v sestavovači (web: lib/tactic-info.ts). */
export const AUTO_FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3"] as const;

const SLOT_ORDER: readonly LineupSlot[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Jak moc hráč na cizím místě trpí: sousední řada je malý ústupek, přes dvě řady velký
 * a brankář v poli (nebo hráč z pole v bráně) až poslední možnost.
 */
const MISMATCH_COST: Record<LineupSlot, Record<LineupSlot, number>> = {
  GK: { GK: 0, DEF: 4, MID: 5, FWD: 6 },
  DEF: { GK: 4, DEF: 0, MID: 1, FWD: 2 },
  MID: { GK: 5, DEF: 1, MID: 0, FWD: 1 },
  FWD: { GK: 6, DEF: 2, MID: 1, FWD: 0 },
};

function toSlot(position: string): LineupSlot {
  return (SLOT_ORDER as readonly string[]).includes(position) ? (position as LineupSlot) : "MID";
}

function slotCounts(formation: string): Record<LineupSlot, number> | null {
  const parts = formation.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 1) || parts[0] + parts[1] + parts[2] !== 10) return null;
  return { GK: 1, DEF: parts[0], MID: parts[1], FWD: parts[2] };
}

interface Candidate {
  formation: string;
  picks: AutoLineupPick[];
  cost: number;
  rating: number;
}

function fillFormation(players: readonly AutoLineupPlayer[], formation: string, counts: Record<LineupSlot, number>): Candidate {
  const picks: AutoLineupPick[] = [];
  const used = new Set<string>();
  let cost = 0;
  let rating = 0;
  const open: Record<LineupSlot, number> = { ...counts };

  // 1. Každou řadu nejdřív obsadí nejlepší hráči, kteří tam patří.
  for (const slot of SLOT_ORDER) {
    for (const p of players) {
      if (open[slot] === 0) break;
      if (used.has(p.id) || toSlot(p.position) !== slot) continue;
      picks.push({ playerId: p.id, matchPosition: slot });
      used.add(p.id);
      rating += p.rating;
      open[slot]--;
    }
  }

  // 2. Zbylá místa: hráč z nejbližší řady, při shodě ten lepší. Brána se plní první,
  // bez brankáře se nehraje.
  for (const slot of SLOT_ORDER) {
    while (open[slot] > 0) {
      let best: AutoLineupPlayer | null = null;
      for (const p of players) {
        if (used.has(p.id)) continue;
        if (!best) { best = p; continue; }
        const diff = MISMATCH_COST[toSlot(p.position)][slot] - MISMATCH_COST[toSlot(best.position)][slot];
        if (diff < 0 || (diff === 0 && p.rating > best.rating)) best = p;
      }
      if (!best) break;
      picks.push({ playerId: best.id, matchPosition: slot });
      used.add(best.id);
      cost += MISMATCH_COST[toSlot(best.position)][slot];
      rating += best.rating;
      open[slot]--;
    }
  }
  return { formation, picks, cost, rating };
}

/**
 * Vybere formaci a jedenáctku z dostupných hráčů. `preferredFormation` (poslední formace
 * týmu) vyhraje při shodě, aby tým zbytečně neměnil rozestavení, na které je zvyklý.
 * S méně než 11 hráči vrátí tolik, kolik jich je.
 */
export function pickAutoEleven(
  available: readonly AutoLineupPlayer[],
  preferredFormation?: string | null,
): { formation: string; picks: AutoLineupPick[] } {
  const players = [...available].sort((a, b) => b.rating - a.rating);
  const preferred = preferredFormation && slotCounts(preferredFormation) ? preferredFormation : AUTO_FORMATIONS[0];
  const formations = [preferred, ...AUTO_FORMATIONS.filter((f) => f !== preferred)];

  let best: Candidate | null = null;
  for (const formation of formations) {
    const counts = slotCounts(formation);
    if (!counts) continue;
    const candidate = fillFormation(players, formation, counts);
    // Pořadí formací dává přednost té oblíbené: jiná vyhraje, jen když je opravdu lepší.
    if (
      !best
      || candidate.picks.length > best.picks.length
      || (candidate.picks.length === best.picks.length && candidate.cost < best.cost)
      || (candidate.picks.length === best.picks.length && candidate.cost === best.cost && candidate.rating > best.rating)
    ) best = candidate;
  }
  return best ? { formation: best.formation, picks: best.picks } : { formation: preferred, picks: [] };
}
