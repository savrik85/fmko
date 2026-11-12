/**
 * Potenciál hráče, který prodávající odkryl u inzerátu na trhu.
 *
 * Ukazuje se stejný údaj jako ve skautském hlášení (rozpětí, kam to hráč dotáhne), jen s
 * přesností špičkového skauta po dvou návštěvách: prodávající svého hráče zná. Rozpětí je
 * pro všechny kupující stejné a po dobu inzerátu se nemění (seed = id inzerátu).
 */
import { logger } from "../lib/logger";
import { potentialRange, ratingRange } from "../scouting/fog";

/** Přesnost odkrytého údaje: nejlepší skaut (20/20), dvě návštěvy. */
const REVEAL_SCOUT_EFFECTIVENESS = 20;
const REVEAL_VISITS = 2;

export interface RevealedPotential {
  lo: number;
  hi: number;
  /** Horní odhad dnešního hodnocení; u dospělých z něj web počítá, kolik hráč ještě přidá. */
  ratingHi: number;
}

export interface RevealSource {
  listingId: string;
  age: number;
  rating: number;
  position: string;
  hiddenTalent: number | null;
  /** Surový JSON sloupce players.skills_max. */
  skillsMax: string | null;
}

export function revealedPotential(source: RevealSource): RevealedPotential | null {
  let skillsMax: Record<string, { maxPotential?: number }> = {};
  try {
    skillsMax = source.skillsMax ? JSON.parse(source.skillsMax) : {};
  } catch (e) {
    logger.warn({ module: "transfers" }, `neplatné stropy dovedností u inzerátu ${source.listingId}`, e);
    return null;
  }
  const range = potentialRange(
    { age: source.age, rating: source.rating, position: source.position, talent: source.hiddenTalent ?? 0, skillsMax },
    REVEAL_SCOUT_EFFECTIVENESS, REVEAL_VISITS, source.listingId,
  );
  if (!range) return null;
  const rating = ratingRange(source.rating, REVEAL_SCOUT_EFFECTIVENESS, REVEAL_VISITS, source.listingId);
  return { lo: range.lo, hi: range.hi, ratingHi: rating.hi };
}

/** Odkrytý potenciál hráče s aktivním inzerátem (profil cizího hráče). `null` = neodkryto. */
export async function revealedPotentialForPlayer(
  db: D1Database,
  player: { id: string; age: number; rating: number; position: string; hiddenTalent: number | null; skillsMax: string | null },
): Promise<RevealedPotential | null> {
  const listing = await db.prepare(
    "SELECT id FROM transfer_listings WHERE player_id = ? AND status = 'active' AND reveal_potential = 1 LIMIT 1",
  ).bind(player.id).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "transfers" }, "inzerát s odkrytým potenciálem", e); return null; });
  if (!listing) return null;
  return revealedPotential({
    listingId: listing.id, age: player.age, rating: player.rating, position: player.position,
    hiddenTalent: player.hiddenTalent, skillsMax: player.skillsMax,
  });
}
