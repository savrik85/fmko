/**
 * Vstupy kurzového modelu, které se čtou z databáze: síla týmu a klubová
 * výhoda domácích.
 *
 * Obojí kopíruje to, s čím do zápasu jde engine (multiplayer/match-runner.ts):
 *  - sílu tvoří jedenáctka, která může nastoupit. Zranění a hráči se stopkou
 *    se nepočítají, a když má klub uloženou sestavu, platí ta. Dřív se bral
 *    průměr nejlepších jedenácti aktivních bez ohledu na marodku: klub s pěti
 *    zraněnými oporami měl kurz favorita a kdo se podíval do kádru, vsadil proti.
 *  - výhodu domácích počítá stejná funkce jako engine (matchHomeAdvantage),
 *    z fanoušků, kotle a zaplněnosti hřiště.
 */

import { logger } from "../lib/logger";
import { fanGroupMatchEffects, type FanSector } from "../engine/fan-groups";
import { homeAdvantageFromFanbase, matchHomeAdvantage, type FanbaseAggregate } from "../season/fanbase-helpers";
import { calculateFacilityEffects } from "../stadium/stadium-generator";

const M = "betting-inputs";

/** Síla týmu, o kterém se nic neví (prázdný kádr, chyba dotazu). */
export const DEFAULT_STRENGTH = 30;

/** Hráčů v základní sestavě. */
const STARTERS = 11;

export interface SquadPlayer {
  id: string;
  rating: number;
  /** Může nastoupit: není zraněný ani nemá stopku. */
  available: boolean;
}

/**
 * Síla jedenáctky, která nejspíš nastoupí. Čistá funkce.
 *
 * S uloženou sestavou platí vybraní hráči, kteří můžou nastoupit; díry po
 * zraněných a stopkách doplní nejlepší z ostatních, stejně jako to dělá engine.
 * Bez sestavy nastupuje nejlepších jedenáct dostupných.
 */
export function lineupStrength(squad: readonly SquadPlayer[], pickedIds: readonly string[] | null): number {
  const available = squad.filter((p) => p.available);
  if (available.length === 0) return DEFAULT_STRENGTH;

  const byId = new Map(available.map((p) => [p.id, p]));
  const starters: SquadPlayer[] = [];
  const used = new Set<string>();
  for (const id of pickedIds ?? []) {
    const p = byId.get(id);
    if (!p || used.has(id) || starters.length >= STARTERS) continue;
    starters.push(p);
    used.add(id);
  }
  const rest = available.filter((p) => !used.has(p.id)).sort((a, b) => b.rating - a.rating);
  for (const p of rest) {
    if (starters.length >= STARTERS) break;
    starters.push(p);
  }
  return starters.reduce((sum, p) => sum + p.rating, 0) / starters.length;
}

/** Id hráčů z lineups.players_data. Nečitelná sestava se bere jako žádná. */
export function pickedPlayerIds(playersData: string | null | undefined): string[] | null {
  if (!playersData) return null;
  try {
    const parsed = JSON.parse(playersData) as Array<{ playerId?: unknown }>;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.map((p) => p?.playerId).filter((id): id is string => typeof id === "string");
    return ids.length > 0 ? ids : null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelná uložená sestava", e);
    return null;
  }
}

/**
 * Síla týmů pro nejbližší kolo: bez zraněných a suspendovaných, podle uložené
 * sestavy, pokud existuje.
 *
 * `daysUntilMatch` říká, kolik herních dní do zápasu zbývá. Zranění, které se
 * do té doby vyléčí, hráče ze sestavy nevyřazuje.
 *
 * Sestava se hledá stejně jako v enginu: nejdřív ta uložená pro tohle kolo,
 * jinak poslední ruční sestava klubu.
 */
export async function loadMatchStrengths(
  db: D1Database, teamIds: string[], calendarId: string, daysUntilMatch: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (teamIds.length === 0) return out;
  const ph = teamIds.map(() => "?").join(",");

  const players = await db.prepare(
    `SELECT id, team_id, overall_rating, COALESCE(suspended_matches, 0) AS suspended
       FROM players
      WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active')`
  ).bind(...teamIds).all<{ id: string; team_id: string; overall_rating: number; suspended: number }>()
    .catch((e) => { logger.warn({ module: M }, "kádry pro sílu týmů", e); return { results: [] }; });

  const injured = await db.prepare(
    `SELECT player_id FROM injuries
      WHERE days_remaining > ? AND player_id IN (SELECT id FROM players WHERE team_id IN (${ph}))`
  ).bind(Math.max(0, daysUntilMatch), ...teamIds).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "zranění pro sílu týmů", e); return { results: [] }; });
  const injuredIds = new Set(injured.results.map((r) => r.player_id));

  const lineups = await db.prepare(
    `SELECT team_id, players_data FROM (
       SELECT team_id, players_data,
              ROW_NUMBER() OVER (
                PARTITION BY team_id
                ORDER BY (calendar_id = ?) DESC, is_auto ASC, submitted_at DESC, id ASC
              ) AS pos
         FROM lineups
        WHERE team_id IN (${ph}) AND (calendar_id = ? OR is_auto = 0)
     ) WHERE pos = 1`
  ).bind(calendarId, ...teamIds, calendarId).all<{ team_id: string; players_data: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "uložené sestavy pro sílu týmů", e); return { results: [] }; });
  const picked = new Map(lineups.results.map((l) => [l.team_id, pickedPlayerIds(l.players_data)]));

  const squads = new Map<string, SquadPlayer[]>();
  for (const p of players.results) {
    const squad = squads.get(p.team_id) ?? [];
    squad.push({ id: p.id, rating: p.overall_rating, available: p.suspended === 0 && !injuredIds.has(p.id) });
    squads.set(p.team_id, squad);
  }
  for (const id of teamIds) out.set(id, lineupStrength(squads.get(id) ?? [], picked.get(id) ?? null));
  return out;
}

/** Zařízení stadionu, která čte calculateFacilityEffects. Stejný seznam jako v enginu. */
const FACILITY_KEYS = [
  "changing_rooms", "showers", "refreshments", "lighting", "stands", "stand_main", "stand_opposite",
  "stand_goal_west", "stand_goal_east", "stand_ext_capacity", "parking", "fence", "roof", "ultras_stand",
  "toilets", "entrance_gate", "security", "cage", "vip_box",
] as const;

/** Z kolika posledních domácích zápasů se odhaduje návštěva. */
const ATTENDANCE_MATCHES = 3;

export interface ClubHomeAdvantageInput {
  fanbase: { hardcore: number; regular: number; casual: number };
  /** Řádek tabulky stadiums, null = klub stadion nemá. */
  stadium: Record<string, unknown> | null;
  groups: Array<{
    kind: string; size: number; mood: number; passion: number; spending: number; noise: number;
    sector: string | null; closed_matches: number; ticket_discount: number;
  }>;
  /** Průměrná návštěva posledních domácích zápasů, null = ještě doma nehrál. */
  recentAttendance: number | null;
}

/**
 * Výhoda domácích, s jakou klub nejspíš nastoupí. Čistá funkce nad tím, co
 * engine čte před zápasem; každý krok volá stejnou funkci jako engine.
 *
 * Jediné, co se před zápasem neví, je návštěva. Bere se průměr posledních
 * domácích zápasů; rozhoduje jen o tom, jestli bude vyprodáno, nebo prázdno.
 */
export function clubHomeAdvantage(input: ClubHomeAdvantageInput): number {
  const facilities: Record<string, number> = {};
  if (input.stadium) {
    for (const key of FACILITY_KEYS) {
      if (key.startsWith("stand_") && !(key in input.stadium)) continue;
      facilities[key] = (input.stadium[key] as number) ?? 0;
    }
  }
  const effects = calculateFacilityEffects(facilities);
  const capacity = ((input.stadium?.capacity as number) ?? 200) + effects.capacityBonus;

  // Kotel mimo svůj sektor nebo se zavřeným sektorem atmosféru nedělá.
  const ultras = input.groups.find((g) => g.kind === "kotel");
  const ultrasAtHome = !ultras || (ultras.sector === "kotel" && ultras.closed_matches === 0);

  const noiseBonus = fanGroupMatchEffects(input.groups.map((g) => ({
    size: g.size, mood: g.mood, passion: g.passion, spending: g.spending, noise: g.noise,
    sector: (g.sector as FanSector) ?? "hlavni",
    sectorClosed: g.closed_matches > 0,
    ticketDiscount: g.ticket_discount,
  }))).noiseBonus;

  const { hardcore, regular, casual } = input.fanbase;
  const aggregate: FanbaseAggregate = {
    hardcore, regular, casual, total: hardcore + regular + casual,
    fromHome: { hardcore, regular, casual },
    fromPromo: { casual: 0 },
    fromSatellites: { hardcore: 0, regular: 0, casual: 0 },
  };
  // Bez odehraného domácího zápasu se počítá s napůl plným hřištěm, tedy bez
  // bonusu za vyprodáno i bez srážky za prázdno.
  const attendance = input.recentAttendance ?? capacity * 0.5;
  const fromFanbase = homeAdvantageFromFanbase(aggregate, attendance, capacity);

  return matchHomeAdvantage({
    fanbaseTotal: fromFanbase.total,
    noiseBonus,
    ultrasAdvantage: ultrasAtHome ? effects.homeAdvantageBonus : 0,
  });
}

/**
 * Klubová výhoda domácích pro víc týmů naráz.
 *
 * Tým, ke kterému se nepodařilo nic načíst, v mapě chybí a volající pro něj
 * vezme průměrnou výhodu (CLUB_HA_REFERENCE). Nula by z něj dělala outsidera.
 */
export async function loadClubHomeAdvantages(db: D1Database, teamIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (teamIds.length === 0) return out;
  const ph = teamIds.map(() => "?").join(",");

  try {
    const [fanbase, satellites, stadiums, groups, attendance] = await Promise.all([
      db.prepare(
        `SELECT team_id, hardcore_count, regular_count, casual_count, COALESCE(promo_casual_count, 0) AS promo
           FROM team_fanbase WHERE team_id IN (${ph})`
      ).bind(...teamIds).all<{ team_id: string; hardcore_count: number; regular_count: number; casual_count: number; promo: number }>(),
      db.prepare(
        `SELECT team_id, COALESCE(SUM(hardcore_count), 0) AS h, COALESCE(SUM(regular_count), 0) AS r,
                COALESCE(SUM(casual_count), 0) AS c
           FROM bus_satellite_fans WHERE team_id IN (${ph}) GROUP BY team_id`
      ).bind(...teamIds).all<{ team_id: string; h: number; r: number; c: number }>(),
      db.prepare(`SELECT * FROM stadiums WHERE team_id IN (${ph})`)
        .bind(...teamIds).all<Record<string, unknown>>(),
      db.prepare(
        `SELECT team_id, kind, size, mood, passion, spending, noise, sector, closed_matches, ticket_discount
           FROM fan_groups WHERE team_id IN (${ph})`
      ).bind(...teamIds).all<ClubHomeAdvantageInput["groups"][number] & { team_id: string }>(),
      db.prepare(
        `SELECT home_team_id AS team_id, AVG(attendance) AS avg_attendance FROM (
           SELECT home_team_id, attendance,
                  ROW_NUMBER() OVER (PARTITION BY home_team_id ORDER BY simulated_at DESC) AS pos
             FROM matches
            WHERE home_team_id IN (${ph}) AND status = 'simulated'
              AND league_id IS NOT NULL AND attendance IS NOT NULL
         ) WHERE pos <= ${ATTENDANCE_MATCHES} GROUP BY home_team_id`
      ).bind(...teamIds).all<{ team_id: string; avg_attendance: number }>(),
    ]);

    const fanbaseByTeam = new Map(fanbase.results.map((r) => [r.team_id, r]));
    const satellitesByTeam = new Map(satellites.results.map((r) => [r.team_id, r]));
    const stadiumByTeam = new Map(stadiums.results.map((r) => [r.team_id as string, r]));
    const attendanceByTeam = new Map(attendance.results.map((r) => [r.team_id, r.avg_attendance]));
    const groupsByTeam = new Map<string, ClubHomeAdvantageInput["groups"]>();
    for (const g of groups.results) {
      const arr = groupsByTeam.get(g.team_id) ?? [];
      arr.push(g);
      groupsByTeam.set(g.team_id, arr);
    }

    for (const id of teamIds) {
      const fb = fanbaseByTeam.get(id);
      const sat = satellitesByTeam.get(id);
      out.set(id, clubHomeAdvantage({
        fanbase: {
          hardcore: (fb?.hardcore_count ?? 0) + (sat?.h ?? 0),
          regular: (fb?.regular_count ?? 0) + (sat?.r ?? 0),
          casual: (fb?.casual_count ?? 0) + (fb?.promo ?? 0) + (sat?.c ?? 0),
        },
        stadium: stadiumByTeam.get(id) ?? null,
        groups: groupsByTeam.get(id) ?? [],
        recentAttendance: attendanceByTeam.get(id) ?? null,
      }));
    }
  } catch (e) {
    logger.warn({ module: M }, "klubová výhoda domácích", e);
    return new Map();
  }
  return out;
}
