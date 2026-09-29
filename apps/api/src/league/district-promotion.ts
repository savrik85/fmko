/**
 * Postup a sestup mezi okresním přeborem a III. třídou (2 ↔ 2).
 *
 * Volá se z `rolloverAllLeagues` PŘED generováním kalendářů nové sezóny: tabulky
 * se počítají za starou sezónu a týmy musí sedět v nové lize dřív, než jí vznikne
 * rozpis. Rezervy (U21) jdou s áčkem do U21 ligy odpovídající úrovně.
 *
 * Idempotence: přesun týmů, zprávy do zpravodaje i marker v `season_end_progress`
 * jdou jednou dávkou (D1 batch = transakce). Opakovaný rollover marker najde a okres
 * přeskočí, takže se týmy nepřehodí dvakrát. Reputace má vlastní reference_id.
 */

import { calculateStandings, type StandingEntry } from "../stats/standings";
import { calculatePromotions } from "./promotion";
import type { StandingEntry as IndexedStanding } from "./standings";
import { applyReputationDelta } from "../lib/reputation";
import { logger } from "../lib/logger";

export const PROMOTION_PHASE = "promotion";
export const PROMOTION_REPUTATION = 5;
export const RELEGATION_REPUTATION = -5;
/** Menší liga by si postupová a sestupová místa překrývala. */
const MIN_TEAMS = 4;

export function promotionMarkerKey(district: string): string {
  return `__promotion__:${district}`;
}

interface LeagueRow { id: string; district: string; level: string; name: string }

export interface DistrictMove {
  district: string;
  promoted: string[];
  relegated: string[];
}

/** Počet odehraných zápasů ligy ve staré sezóně. */
async function playedMatches(db: D1Database, leagueId: string, seasonNumber: number): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE sc.league_id = ? AND sc.season_number = ? AND m.status = 'simulated'`,
  ).bind(leagueId, seasonNumber).first<{ n: number }>();
  return row?.n ?? 0;
}

function toIndexed(standings: StandingEntry[]): IndexedStanding[] {
  return standings.map((s, i) => ({
    teamIndex: i, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses,
    goalsFor: s.gf, goalsAgainst: s.ga, points: s.points,
  }));
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} a ${names[names.length - 1]}`;
}

/**
 * Prohodí poslední dva přeboru s prvními dvěma III. třídy ve všech okresech,
 * kde obě soutěže ve staré sezóně hrály.
 */
export async function applyDistrictPromotions(
  db: D1Database, oldSeasonNumber: number, gameDate: string,
): Promise<DistrictMove[]> {
  const leagues = await db.prepare(
    `SELECT id, district, level, name FROM leagues
      WHERE COALESCE(league_type, 'senior') = 'senior' AND status = 'active'
        AND level IN ('okresni_prebor', 'okresni_soutez')`,
  ).all<LeagueRow>();

  const byDistrict = new Map<string, { prebor?: LeagueRow; soutez?: LeagueRow }>();
  for (const l of leagues.results) {
    const entry = byDistrict.get(l.district) ?? {};
    if (l.level === "okresni_prebor") entry.prebor = l;
    else entry.soutez = l;
    byDistrict.set(l.district, entry);
  }

  const moves: DistrictMove[] = [];
  for (const [district, { prebor, soutez }] of byDistrict) {
    if (!prebor || !soutez) continue;
    try {
      const move = await promoteDistrict(db, district, prebor, soutez, oldSeasonNumber, gameDate);
      if (move) moves.push(move);
    } catch (e) {
      // Chyba v jednom okrese nesmí zastavit rollover ostatních. Marker se nezapsal,
      // takže se okres zkusí znovu při dalším běhu rolloveru.
      logger.error({ module: "district-promotion" }, `postup a sestup v okrese ${district} selhal`, e);
    }
  }
  return moves;
}

async function promoteDistrict(
  db: D1Database, district: string, prebor: LeagueRow, soutez: LeagueRow,
  oldSeasonNumber: number, gameDate: string,
): Promise<DistrictMove | null> {
  const markerKey = promotionMarkerKey(district);
  const marker = await db.prepare(
    "SELECT status FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?",
  ).bind(markerKey, oldSeasonNumber, PROMOTION_PHASE).first<{ status: string }>();
  if (marker?.status === "done") return null;

  // Liga, která ve staré sezóně nehrála (vznikla v přípravném období), nemá tabulku.
  if (await playedMatches(db, prebor.id, oldSeasonNumber) === 0) return null;
  if (await playedMatches(db, soutez.id, oldSeasonNumber) === 0) return null;

  const preborTable = await calculateStandings(db, prebor.id, oldSeasonNumber);
  const soutezTable = await calculateStandings(db, soutez.id, oldSeasonNumber);
  if (preborTable.length < MIN_TEAMS || soutezTable.length < MIN_TEAMS) {
    logger.warn({ module: "district-promotion" }, `${district}: málo týmů na postup a sestup (${preborTable.length}/${soutezTable.length})`);
    return null;
  }

  // Z přeboru jen sestup (postup do I.B třídy okres nemá), z III. třídy jen postup.
  const relegated = calculatePromotions(toIndexed(preborTable), "okresni_prebor")
    .filter((r) => r.type === "relegation" && r.toLevel === "okresni_soutez")
    .map((r) => preborTable[r.teamIndex].teamId);
  const promoted = calculatePromotions(toIndexed(soutezTable), "okresni_soutez")
    .filter((r) => r.type === "promotion" && r.toLevel === "okresni_prebor")
    .map((r) => soutezTable[r.teamIndex].teamId);
  if (relegated.length === 0 && promoted.length === 0) return null;

  const u21 = await db.prepare(
    "SELECT id, parent_league_id FROM leagues WHERE league_type = 'u21' AND parent_league_id IN (?, ?)",
  ).bind(prebor.id, soutez.id).all<{ id: string; parent_league_id: string }>();
  const u21Prebor = u21.results.find((r) => r.parent_league_id === prebor.id)?.id ?? null;
  const u21Soutez = u21.results.find((r) => r.parent_league_id === soutez.id)?.id ?? null;

  const names = new Map<string, string>();
  const nameRows = await db.prepare(
    `SELECT id, name FROM teams WHERE id IN (${[...relegated, ...promoted].map(() => "?").join(",")})`,
  ).bind(...relegated, ...promoted).all<{ id: string; name: string }>();
  for (const r of nameRows.results) names.set(r.id, r.name);
  const promotedNames = promoted.map((id) => names.get(id) ?? "neznámý klub");
  const relegatedNames = relegated.map((id) => names.get(id) ?? "neznámý klub");

  const stmts: D1PreparedStatement[] = [];
  const moveTeams = (ids: string[], seniorTarget: string, u21Target: string | null) => {
    for (const id of ids) {
      stmts.push(db.prepare("UPDATE teams SET league_id = ? WHERE id = ?").bind(seniorTarget, id));
      if (u21Target) {
        stmts.push(db.prepare(
          "UPDATE teams SET league_id = ? WHERE parent_team_id = ? AND team_type = 'u21'",
        ).bind(u21Target, id));
      }
    }
  };
  moveTeams(relegated, soutez.id, u21Soutez);
  moveTeams(promoted, prebor.id, u21Prebor);
  if (!u21Prebor || !u21Soutez) {
    logger.error({ module: "district-promotion" }, `${district}: chybí U21 liga (přebor ${u21Prebor ?? "ne"}, III. třída ${u21Soutez ?? "ne"}), rezervy zůstávají`);
  }

  const promotedText = joinNames(promotedNames);
  const relegatedText = joinNames(relegatedNames);
  const preborNews = {
    headline: `Do přeboru postupují ${promotedText}`,
    body: `Sezóna ${oldSeasonNumber} skončila a okresní fotbal se přeskupuje. Z III. třídy postupují ${promotedText}, `
      + `naopak ${relegatedText} ${relegatedNames.length === 1 ? "sestupuje" : "sestupují"} o patro níž. `
      + `Nováčci se v přeboru můžou těšit na silnější soupeře a plnější hlediště.`,
  };
  const soutezNews = {
    headline: `${promotedText} slaví postup do přeboru`,
    body: `V III. třídě je dobojováno. ${promotedText} ${promotedNames.length === 1 ? "si vybojoval" : "si vybojovali"} postup do okresního přeboru. `
      + `Místo nich do soutěže ${relegatedNames.length === 1 ? "přichází" : "přicházejí"} ${relegatedText}, `
      + `kterým se v přeboru nedařilo. Příští sezóna bude o to zajímavější.`,
  };
  for (const [leagueId, news] of [[prebor.id, preborNews], [soutez.id, soutezNews]] as const) {
    stmts.push(db.prepare(
      `INSERT INTO news (id, league_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, 'league_movement', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), leagueId, news.headline, news.body, oldSeasonNumber));
  }

  stmts.push(db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, updated_at)
     VALUES (?, ?, ?, 'done', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase) DO UPDATE SET status = 'done', cursor = excluded.cursor, updated_at = excluded.updated_at`,
  ).bind(markerKey, oldSeasonNumber, PROMOTION_PHASE, JSON.stringify({ promoted, relegated })));

  await db.batch(stmts);

  for (const id of promoted) {
    await applyReputationDelta(db, id, PROMOTION_REPUTATION, "promotion", "Postup do okresního přeboru", {
      referenceId: `promotion-s${oldSeasonNumber}-${id}`, gameDate,
    }).catch((e) => logger.warn({ module: "district-promotion", teamId: id }, "reputace za postup", e));
  }
  for (const id of relegated) {
    await applyReputationDelta(db, id, RELEGATION_REPUTATION, "promotion", "Sestup do III. třídy", {
      referenceId: `relegation-s${oldSeasonNumber}-${id}`, gameDate,
    }).catch((e) => logger.warn({ module: "district-promotion", teamId: id }, "reputace za sestup", e));
  }

  logger.info({ module: "district-promotion" }, `${district}: postup ${promotedNames.join(", ")}, sestup ${relegatedNames.join(", ")}`);
  return { district, promoted, relegated };
}
