/** Zápis a čtení znalostí hráčů o incidentech (`club_incident_knowledge`, spec Část 10). */

import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { ZNALOST_PO_UZAVRENI_DNI } from "./nastaveni";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";
import {
  radekZnalosti, vyberZnalosti, znalostiIncidentu,
  type NovaZnalost, type RadekZnalosti, type RadekZnalostiDb, type TemaKonverzace,
} from "./znalosti";

const M = "incidents-znalosti";

/** `INSERT OR IGNORE`: klíč (incident, hráč, role), opakovaný zápis nic nezdvojí. */
export function prikazyZnalosti(
  db: D1Database, teamId: string, incidentId: string, seasonNumber: number, znalosti: readonly NovaZnalost[],
): D1PreparedStatement[] {
  return znalosti.map((z) => db.prepare(
    `INSERT OR IGNORE INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(incidentId, z.playerId, teamId, z.role, z.fact, z.ochota, z.until, seasonNumber));
}

/**
 * Znalosti nového incidentu jednou dávkou (spec 10a). `stopy` jen ty, které se opravdu
 * zapsaly: svědek bez řádku stopy by výslechem neměl co najít. Selhání incident nezvrací.
 */
export async function zapisZnalosti(
  db: D1Database, stav: StavKlubu, navrh: NavrhIncidentu, incidentId: string, stopy: readonly NavrhStopy[],
): Promise<boolean> {
  const znalosti = znalostiIncidentu(stav, navrh, stopy, createRng(seedFromString(`znalosti|${incidentId}`)));
  if (znalosti.length === 0) return true;
  return db.batch(prikazyZnalosti(db, stav.teamId, incidentId, stav.seasonNumber, znalosti))
    .then(() => true)
    .catch((e) => { logger.error({ module: M }, `znalosti incidentu ${incidentId}`, e); return false; });
}

/**
 * Platná znalost = stejná sezóna a buď `until` ještě nevypršel, nebo jde o kádr, svědka,
 * kamaráda či rivala u incidentu, který není uzavřený nebo se uzavřel nejvýš před týdnem.
 * Jméno pachatele jen u odhaleného.
 */
const DOTAZ_ZNALOSTI = `
  SELECT k.incident_id, k.role, k.fact, k.interrogation,
         i.kind, i.category, i.severity, i.game_date, i.status, i.resolution, i.culprit_revealed, i.culprit_player_id,
         COALESCE(p.first_name, d.first_name) AS pachatel_jmeno, COALESCE(p.last_name, d.last_name) AS pachatel_prijmeni
    FROM club_incident_knowledge k
    JOIN club_incidents i ON i.id = k.incident_id
    LEFT JOIN players p ON p.id = i.culprit_player_id AND i.culprit_revealed = 1
    LEFT JOIN departed_players d ON d.id = i.culprit_player_id AND i.culprit_revealed = 1
   WHERE k.player_id = ? AND k.team_id = ? AND k.season_number = ?
     AND COALESCE(i.resolution, '') != 'bez_skody'
     AND (k.until >= ?
          OR (k.role IN ('kadr', 'svedek', 'kamarad', 'rival')
              AND (i.status != 'uzavreny' OR i.resolved_on >= ?)))
   ORDER BY i.severity DESC, i.game_date DESC
   LIMIT 30`;

/** Znalosti hráče pro prompt (spec 10b). Tajné role jen k incidentu v tématu, a jen v den, kdy se téma nastavilo. */
export async function nactiZnalostiHrace(
  db: D1Database, opts: { teamId: string; playerId: string; tema?: TemaKonverzace | null },
): Promise<RadekZnalosti[] | undefined> {
  const tym = await db.prepare(
    `SELECT t.game_date, (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS sezona
       FROM teams t WHERE t.id = ?`,
  ).bind(opts.teamId).first<{ game_date: string | null; sezona: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní den pro znalosti ${opts.teamId}`, e); return null; });
  if (!tym?.game_date || tym.sezona == null) return undefined;
  const dnes = tym.game_date;

  const rows = await db.prepare(DOTAZ_ZNALOSTI)
    .bind(opts.playerId, opts.teamId, tym.sezona, dnes, gameExpiry(dnes, -ZNALOST_PO_UZAVRENI_DNI))
    .all<RadekZnalostiDb>()
    .catch((e) => { logger.warn({ module: M }, `znalosti hráče ${opts.playerId}`, e); return null; });
  if (!rows) return undefined;

  const temaId = opts.tema && opts.tema.den === dnes.slice(0, 10) ? opts.tema.incidentId : null;
  return vyberZnalosti(rows.results.map((r) => radekZnalosti(r, opts.playerId, dnes)), temaId);
}
