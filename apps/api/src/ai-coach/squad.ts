/**
 * Kádr očima AI trenéra: kdo je opora, kdo do rotace a kdo přebývá, koho nesmí pustit
 * (poslední brankář, minimum kádru, opora bez náhrady) a na kterých postech klubu chybí lidi
 * nebo kvalita. Čisté funkce, data načte `loadClubSquad`.
 */

import { logger } from "../lib/logger";
import type { AiCoachProfile, Formation } from "./profile";
import type { SquadImportance } from "./valuation";

export const SQUAD_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type SquadPosition = typeof SQUAD_POSITIONS[number];

/** Pod tolik vlastních hráčů áčka AI klub nikoho neprodá ani nepůjčí. */
export const MIN_SENIOR_SQUAD = 16;
/** Minimum U21 soupisky, aby dorost dál mohl hrát svou soutěž. */
export const MIN_U21_SQUAD = 12;
/** Pod tolik hráčů áčka AI podepisuje volné hráče. */
export const SIGNING_SQUAD_THRESHOLD = MIN_SENIOR_SQUAD;
/**
 * Kolik hráčů chce mít AI v áčku. Lidé drží 25–29 (Praha a Prachatice 10/2026), protože
 * na zápas vždycky pár hráčů nemůže, a narovnání dává AI kádr podle nich. S cílem 20 bylo
 * AI trvale „přeplněné“ a dokola vystavovalo tytéž neprodejné veterány.
 */
export const TARGET_SENIOR_SQUAD = 24;
/** Strop soupisky (stejný jako u podpisu volného hráče). */
export const MAX_SQUAD = 30;

/** Kolik náhradníků za základní sestavu na postu klub chce mít. */
const BACKUPS: Record<SquadPosition, number> = { GK: 1, DEF: 2, MID: 2, FWD: 1 };

export interface SquadMember {
  id: string;
  position: SquadPosition;
  rating: number;
  age: number;
  /** Soupiska, kde hráč je (A-tým, nebo U21 téhož klubu). */
  rosterTeamId: string;
  isU21Roster: boolean;
  /** Hostuje u nás z cizího klubu: hraje, ale prodat ho nejde. */
  loanedIn: boolean;
  injured: boolean;
}

export type SellBlockReason = "loaned_in" | "last_goalkeeper" | "min_squad" | "key_without_replacement" | "squad_full";

export interface PositionNeed {
  position: SquadPosition;
  /** 0–1: jak moc klub na postu někoho potřebuje. */
  need: number;
  /** Kolik hráčů na postu chybí do plné hloubky. */
  missing: number;
  /** Hodnocení, od kterého by nový hráč tým zlepšil. */
  minRating: number;
  /** Průměr základní sestavy na postu. */
  startersAverage: number;
  /**
   * Post je plný, ale nejslabší hráč základu jde vylepšit (uživatel 26. 10.: „ať kupujou i lepší
   * hráče do základu“). Kupuje se jen hráč aspoň o UPGRADE_MIN_GAIN lepší.
   */
  upgrade?: boolean;
}

/** O kolik musí být posila lepší než nejslabší hráč základu na postu, aby se vyplatila. */
export const UPGRADE_MIN_GAIN = 5;
/** Potřeba na zlepšení základu: stejná jako běžný nákup (transfer-market BUY_NEED). */
export const UPGRADE_NEED = 0.3;

export interface SquadAnalysis {
  formation: Formation;
  members: SquadMember[];
  seniorOwnCount: number;
  u21Count: number;
  /** Průměr nejlepší jedenáctky áčka. */
  top11Average: number;
  importanceOf(playerId: string): SquadImportance;
  /** Proč hráče nejde pustit (prodej, hostování), nebo null. `incoming` = hráči na výměnu. */
  sellBlock(playerId: string, incoming?: Array<{ position: string; rating: number }>): SellBlockReason | null;
  needs: PositionNeed[];
  /** Přijde hráč na výměnu klubu k užitku (hrál by aspoň v rotaci)? */
  isUseful(p: { position: string; rating: number; age: number }): boolean;
}

/** Počet hráčů v základu podle formace („4-4-2“ → 1 / 4 / 4 / 2). */
export function formationSlots(formation: string): Record<SquadPosition, number> {
  const parts = formation.split("-").map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 1)) {
    logger.warn({ module: "ai-squad" }, `neznámá formace ${formation}, beru 4-4-2`);
    return { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  }
  return { GK: 1, DEF: parts[0], MID: parts[1], FWD: parts[2] };
}

function isPosition(v: string): v is SquadPosition {
  return (SQUAD_POSITIONS as readonly string[]).includes(v);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function byPosition(members: SquadMember[]): Record<SquadPosition, SquadMember[]> {
  const out: Record<SquadPosition, SquadMember[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const m of members) out[m.position].push(m);
  for (const p of SQUAD_POSITIONS) out[p].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  return out;
}

/** Význam hráče na jedné soupisce (áčko, nebo U21). */
function rosterImportance(roster: SquadMember[], slots: Record<SquadPosition, number>): Map<string, SquadImportance> {
  const grouped = byPosition(roster);
  const starters: SquadMember[] = [];
  for (const p of SQUAD_POSITIONS) starters.push(...grouped[p].slice(0, slots[p]));
  const startersAvg = average(starters.map((s) => s.rating));
  const out = new Map<string, SquadImportance>();
  for (const p of SQUAD_POSITIONS) {
    const list = grouped[p];
    const depth = slots[p] + BACKUPS[p];
    list.forEach((m, rank) => {
      if (rank < slots[p]) {
        // Náhrada = nejlepší hráč na postu mimo základ.
        const backup = list[slots[p]];
        const hardToReplace = !backup || backup.rating < m.rating - 5;
        out.set(m.id, m.rating >= startersAvg + 1 || hardToReplace ? "key" : "rotation");
      } else if (rank < depth) {
        out.set(m.id, "rotation");
      } else {
        out.set(m.id, "surplus");
      }
    });
  }
  return out;
}

export function analyzeSquad(members: SquadMember[], profile: AiCoachProfile): SquadAnalysis {
  const formation = profile.favouriteFormations[0] ?? "4-4-2";
  const slots = formationSlots(formation);
  const senior = members.filter((m) => !m.isU21Roster);
  const u21 = members.filter((m) => m.isU21Roster);
  const seniorOwn = senior.filter((m) => !m.loanedIn);

  const seniorImportance = rosterImportance(senior, slots);
  const u21Importance = rosterImportance(u21, formationSlots("4-4-2"));

  const groupedSenior = byPosition(senior);
  const top11: SquadMember[] = [];
  for (const p of SQUAD_POSITIONS) top11.push(...groupedSenior[p].slice(0, slots[p]));
  const top11Average = average(top11.map((m) => m.rating));

  const byId = new Map(members.map((m) => [m.id, m]));

  const importanceOf = (playerId: string): SquadImportance => {
    const m = byId.get(playerId);
    if (!m) return "surplus";
    if (m.isU21Roster) {
      const base = u21Importance.get(playerId) ?? "surplus";
      // Opora dorostu není opora klubu, jen mládežník ji tak bere.
      if (base === "key" && profile.youthFocus < 70) return "rotation";
      return base;
    }
    let base = seniorImportance.get(playerId) ?? "surplus";
    // Mládežník si mladé nechává, i když zrovna nehrají.
    if (base === "surplus" && m.age <= 20 && profile.youthFocus >= 60) base = "rotation";
    return base;
  };

  const sellBlock = (playerId: string, incoming: Array<{ position: string; rating: number }> = []): SellBlockReason | null => {
    const m = byId.get(playerId);
    if (!m) return null;
    if (m.loanedIn) return "loaned_in";
    const incomingGk = incoming.filter((p) => p.position === "GK").length;
    if (m.position === "GK") {
      const clubGk = members.filter((x) => x.position === "GK" && !x.loanedIn).length;
      const seniorGk = seniorOwn.filter((x) => x.position === "GK").length;
      // Hráči na výměnu jdou do áčka prodávajícího.
      if (clubGk - 1 + incomingGk < 1) return "last_goalkeeper";
      if (!m.isU21Roster && seniorGk - 1 + incomingGk < 1) return "last_goalkeeper";
    }
    if (m.isU21Roster) {
      if (u21.length - 1 < MIN_U21_SQUAD) return "min_squad";
    } else {
      if (seniorOwn.length - 1 + incoming.length < MIN_SENIOR_SQUAD) return "min_squad";
    }
    if (seniorOwn.length - (m.isU21Roster ? 0 : 1) + incoming.length > MAX_SQUAD) return "squad_full";
    if (importanceOf(playerId) === "key") {
      // Opora jde jen s plánem náhrady: v klubu (i v dorostu nebo mezi hráči na výměnu)
      // musí být někdo na stejném postu, kdo za ni nebude o moc horší.
      const replacement = members.some((x) => x.id !== m.id && !x.loanedIn && x.position === m.position && x.rating >= m.rating - 8)
        || incoming.some((p) => p.position === m.position && p.rating >= m.rating - 8);
      if (!replacement) return "key_without_replacement";
    }
    return null;
  };

  const needs: PositionNeed[] = [];
  for (const p of SQUAD_POSITIONS) {
    const list = groupedSenior[p];
    const depth = slots[p] + BACKUPS[p];
    const missing = Math.max(0, depth - list.length);
    const startersAverage = average(list.slice(0, slots[p]).map((m) => m.rating));
    const gap = list.length === 0 ? 10 : top11Average - startersAverage;
    const need = Math.max(0, Math.min(1, missing * 0.35 + Math.max(0, gap - 2) * 0.06 + (list.length < slots[p] ? 0.3 : 0)));
    if (need <= 0) {
      // Plný post: posila do základu, když by byla lepší než jeho nejslabší hráč.
      const starters = list.slice(0, slots[p]);
      if (starters.length >= slots[p] && starters.length > 0) {
        const weakest = Math.min(...starters.map((m) => m.rating));
        needs.push({
          position: p, need: UPGRADE_NEED, missing: 0, minRating: weakest + UPGRADE_MIN_GAIN,
          startersAverage: Math.round(startersAverage * 10) / 10, upgrade: true,
        });
      }
      continue;
    }
    // Posila má být aspoň tak dobrá jako průměr základu na postu (u prázdného postu jako tým).
    const minRating = Math.round(list.length >= slots[p] ? Math.max(startersAverage, top11Average - 4) : Math.max(1, top11Average - 8));
    needs.push({ position: p, need, missing, minRating, startersAverage: Math.round(startersAverage * 10) / 10 });
  }
  needs.sort((a, b) => b.need - a.need);

  const isUseful = (p: { position: string; rating: number; age: number }): boolean => {
    if (!isPosition(p.position) || p.age >= 34) return false;
    const list = groupedSenior[p.position];
    const depth = slots[p.position] + BACKUPS[p.position];
    // Hrál by v rotaci: lepší než poslední hráč v potřebné hloubce, nebo hloubka chybí.
    if (list.length < depth) return p.rating >= top11Average - 10;
    return p.rating > list[depth - 1].rating;
  };

  return {
    formation, members, seniorOwnCount: seniorOwn.length, u21Count: u21.length, top11Average,
    importanceOf, sellBlock, needs, isUseful,
  };
}

interface SquadRow {
  id: string;
  position: string;
  overall_rating: number;
  age: number;
  team_id: string;
  parent_team_id: string | null;
  loan_from_team_id: string | null;
  injured: number;
}

/** Hráči klubu (áčko i U21, včetně hostujících u nás). Hráči půjčení jinam se nepočítají. */
export async function loadClubSquad(db: D1Database, clubTeamId: string): Promise<SquadMember[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.position, p.overall_rating, p.age, p.team_id, t.parent_team_id, p.loan_from_team_id,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) AS injured
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE (t.id = ? OR t.parent_team_id = ?)
        AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(clubTeamId, clubTeamId).all<SquadRow>();
  return rows.results
    .filter((r) => isPosition(r.position))
    .map((r) => ({
      id: r.id,
      position: r.position as SquadPosition,
      rating: Number(r.overall_rating) || 0,
      age: Number(r.age) || 25,
      rosterTeamId: r.team_id,
      isU21Roster: r.parent_team_id != null,
      loanedIn: r.loan_from_team_id != null,
      injured: (r.injured ?? 0) > 0,
    }));
}
