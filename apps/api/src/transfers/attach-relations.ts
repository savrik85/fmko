/**
 * Vazby nově příchozího hráče na kabinu.
 *
 * Vztahy dřív vznikaly jen při zakládání týmu a při odchodu hráče se mazaly
 * (`remove-player.ts`), takže kabina sezónu od sezóny chudla až na nulu. Tenhle helper
 * se volá z každé cesty příchodu — přestup, hostování, volný hráč, dorostenec,
 * doplnění kádru po sezóně, U21 — a nováčkovi dogeneruje pár vazeb na stávající soupisku.
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { generateRelationsForNewcomer, type RelationCandidate } from "../generators/relationships";
import { logger } from "../lib/logger";

const M = "attach-relations";

interface SquadRow {
  id: string;
  last_name: string;
  age: number;
  residence: string | null;
  personality: string | null;
  life_context: string | null;
}

function toCandidate(row: SquadRow): RelationCandidate {
  let occupation: string | null = null;
  let alcohol: number | null = null;
  let leadership: number | null = null;
  try {
    const pers = row.personality ? JSON.parse(row.personality) : {};
    alcohol = typeof pers.alcohol === "number" ? pers.alcohol : null;
    leadership = typeof pers.leadership === "number" ? pers.leadership : null;
  } catch (e) { logger.warn({ module: M }, "parse personality", e); }
  try {
    const lc = row.life_context ? JSON.parse(row.life_context) : {};
    occupation = typeof lc.occupation === "string" ? lc.occupation : null;
  } catch (e) { logger.warn({ module: M }, "parse life_context", e); }
  return { id: row.id, lastName: row.last_name, age: row.age, residence: row.residence, occupation, alcohol, leadership };
}

/** Domovská obec klubu — bydliště v ní se nepočítá jako sousedství. */
async function homeVillageOf(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT v.name FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "load home village", e); return null; });
  return row?.name ?? null;
}

/**
 * Dogeneruje a uloží vazby hráče `playerId` na jeho nové spoluhráče v `teamId`.
 * Bezpečné volat opakovaně — duplicitní pár se nevytvoří (kontroluje se obousměrně).
 *
 * Nikdy nevyhazuje: vazby jsou ozdoba kabiny, ne blokující krok přestupu.
 */
export async function attachNewcomerRelations(
  db: D1Database,
  teamId: string,
  playerId: string,
  maxRelations: number = 2,
): Promise<number> {
  try {
    const rows = await db.prepare(
      `SELECT id, last_name, age, residence, personality, life_context
         FROM players
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(teamId).all<SquadRow>();

    const squad = rows.results ?? [];
    const newcomerRow = squad.find((r) => r.id === playerId);
    if (!newcomerRow || squad.length < 2) return 0;

    const rng = createRng(cryptoSeed());
    const relations = generateRelationsForNewcomer(
      rng,
      toCandidate(newcomerRow),
      squad.map(toCandidate),
      maxRelations,
      await homeVillageOf(db, teamId),
    );
    if (relations.length === 0) return 0;

    // Existující páry — ať opakované volání (nebo návrat z hostování) nezaloží duplicitu.
    const existing = await db.prepare(
      "SELECT player_a_id, player_b_id FROM relationships WHERE player_a_id = ? OR player_b_id = ?",
    ).bind(playerId, playerId).all<{ player_a_id: string; player_b_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "load existing relations", e); return { results: [] as Array<{ player_a_id: string; player_b_id: string }> }; });
    const taken = new Set(
      (existing.results ?? []).map((r) => (r.player_a_id === playerId ? r.player_b_id : r.player_a_id)),
    );

    const stmts = relations
      .filter((r) => !taken.has(r.otherPlayerId))
      .map((r) =>
        db.prepare(
          "INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), playerId, r.otherPlayerId, r.type, r.strength),
      );
    if (stmts.length === 0) return 0;

    await db.batch(stmts);
    logger.info({ module: M, teamId }, `nováček ${playerId}: ${stmts.length} nových vazeb (${relations.map((r) => r.type).join(", ")})`);
    return stmts.length;
  } catch (e) {
    logger.warn({ module: M, teamId }, "attach newcomer relations failed", e);
    return 0;
  }
}

/**
 * Vazby pro celou čerstvě vygenerovanou soupisku (U21, doplnění kádru).
 *
 * Postupuje po hráčích a každého napojuje na ty, kteří už jsou zpracovaní — vznikne
 * tím přirozená síť se stejnými pravidly jako u jednotlivého příchozího, jen bez nutnosti
 * mapovat indexy. Přeskočí hráče, kteří už nějakou vazbu mají.
 */
export async function attachSquadRelations(
  db: D1Database,
  teamId: string,
  maxPerPlayer: number = 1,
): Promise<number> {
  try {
    const rows = await db.prepare(
      `SELECT id, last_name, age, residence, personality, life_context
         FROM players
        WHERE team_id = ? AND (status IS NULL OR status = 'active')`,
    ).bind(teamId).all<SquadRow>();
    const squad = (rows.results ?? []).map(toCandidate);
    if (squad.length < 3) return 0;

    const rng = createRng(cryptoSeed());
    const homeVillage = await homeVillageOf(db, teamId);
    const stmts: D1PreparedStatement[] = [];
    const paired = new Set<string>();
    const seen: RelationCandidate[] = [];

    for (const p of squad) {
      if (seen.length > 0) {
        for (const r of generateRelationsForNewcomer(rng, p, seen, maxPerPlayer, homeVillage)) {
          const key = [p.id, r.otherPlayerId].sort().join("|");
          if (paired.has(key)) continue;
          paired.add(key);
          stmts.push(db.prepare(
            "INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, ?, ?)",
          ).bind(crypto.randomUUID(), p.id, r.otherPlayerId, r.type, r.strength));
        }
      }
      seen.push(p);
    }
    if (stmts.length === 0) return 0;

    for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
    logger.info({ module: M, teamId }, `soupiska: ${stmts.length} vazeb pro ${squad.length} hráčů`);
    return stmts.length;
  } catch (e) {
    logger.warn({ module: M, teamId }, "attach squad relations failed", e);
    return 0;
  }
}
