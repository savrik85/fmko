/**
 * Souboje „kdo zůstane" na konci sezóny (season-departures.ts `buildDuels`): v každé dvojici
 * jeden hráč odchází nadobro. Rozhoduje trenér klubu, člověk v přehledu konce sezóny
 * (POST /teams/:teamId/season-recap/decide), AI trenér v hodinové práci (ai-coach/season-duels.ts).
 * Obě cesty jdou přes tuhle službu, pravidla jsou jedna.
 */

import { logger } from "../lib/logger";
import { removePlayer } from "../transfers/remove-player";

const M = "season-duels";

export interface SeasonDuelPlayer {
  playerId: string;
  name: string;
  position: string;
  age: number;
  overallRating: number;
}

export interface SeasonDuel {
  a: SeasonDuelPlayer;
  b: SeasonDuelPlayer;
  story?: string;
}

interface RecapRow {
  season_number: number;
  data: string;
}

async function loadUnseenRecap(db: D1Database, teamId: string): Promise<RecapRow | null> {
  return db.prepare("SELECT season_number, data FROM season_recap WHERE team_id = ? AND seen = 0 ORDER BY season_number DESC LIMIT 1")
    .bind(teamId).first<RecapRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "nepřečtený přehled konce sezóny", e); return null; });
}

function parseRecap(raw: string, teamId: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (e) {
    logger.warn({ module: M, teamId }, "nečitelný přehled konce sezóny", e);
    return {};
  }
}

function duelsOf(data: Record<string, unknown>): SeasonDuel[] {
  const decision = data.decision as { duels?: unknown } | null | undefined;
  return Array.isArray(decision?.duels) ? decision.duels as SeasonDuel[] : [];
}

/** Nerozhodnuté souboje klubu z nejnovějšího nepřečteného přehledu konce sezóny, nebo null. */
export async function loadPendingSeasonDuels(db: D1Database, teamId: string): Promise<{ seasonNumber: number; duels: SeasonDuel[] } | null> {
  const row = await loadUnseenRecap(db, teamId);
  if (!row) return null;
  const duels = duelsOf(parseRecap(row.data, teamId));
  return duels.length > 0 ? { seasonNumber: row.season_number, duels } : null;
}

export type SeasonDuelsResult = { ok: true; removed: number } | { ok: false; status: 404; error: string };

/**
 * Rozhodne souboje: `leaving` jsou id hráčů, kteří odejdou. Platí jen id ze soubojů a nejvýš
 * tolik, kolik je soubojů. Odcházející odejdou nadobro (ne na trh volných hráčů), nikdo za ně
 * nepřijde. Přehled konce sezóny se označí za přečtený, i když souboje nebyly.
 */
export async function decideSeasonDuels(db: D1Database, teamId: string, leaving: readonly unknown[]): Promise<SeasonDuelsResult> {
  const row = await loadUnseenRecap(db, teamId);
  if (!row) return { ok: false, status: 404, error: "Recap nenalezen" };

  const data = parseRecap(row.data, teamId);
  const duels = duelsOf(data);
  let removedCount = 0;
  if (duels.length > 0) {
    const byId = new Map<string, SeasonDuelPlayer>();
    for (const d of duels) { byId.set(d.a.playerId, d.a); byId.set(d.b.playerId, d.b); }
    const toRemove = leaving.filter((id): id is string => typeof id === "string" && byId.has(id)).slice(0, duels.length);

    const removed: Array<Record<string, unknown>> = [];
    for (const id of toRemove) {
      const info = byId.get(id)!;
      const r = await removePlayer(db, id, "quit", { toFreeAgent: false, teamId });
      if (r.ok) removed.push({ name: info.name, age: info.age, position: info.position, overallRating: info.overallRating, kind: "decision", reason: "Trenér se rozhodl dát mu sbohem." });
    }
    data.decision = null;
    data.departures = removed;
    removedCount = removed.length;
  }

  await db.prepare("UPDATE season_recap SET data = ?, seen = 1 WHERE team_id = ? AND season_number = ?")
    .bind(JSON.stringify(data), teamId, row.season_number).run()
    .catch((e) => logger.warn({ module: M, teamId }, "přehled konce sezóny po rozhodnutí soubojů", e));
  return { ok: true, removed: removedCount };
}
