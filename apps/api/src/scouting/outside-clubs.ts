/**
 * Stálé kádry klubů mimo hru (2026-10-18).
 *
 * Dřív skaut při každé návštěvě vylosoval nové hráče, kteří existovali jen v jeho hlášení:
 * dva týmy nikdy neviděly stejného hráče a tentýž skaut viděl v Písku každý týden jiný kádr.
 * Teď má klub obce na sezónu pevný kádr. Vznikne při první návštěvě kteréhokoli skauta,
 * všichni skauti pak vidí stejné hráče a hráče dostane ten, kdo ho první podepíše.
 *
 * Síla kádru se odvozuje od nejsilnější okresní ligy ve hře, ne od ligy kupce: Písek musí být
 * stejně silný pro každého, kdo tam skauta pošle. Ani od ligy nejbližšího klubu: okresy mají
 * ligy velmi rozdílné (2026-10-18 Prachatice 48,8, Praha 40,2, České Budějovice 29,3), takže
 * stejně velká Vodňany a Strakonice by se lišily o deset bodů jen podle toho, ke kterému
 * okresu ve hře mají blíž. Městské kluby hrají soutěž nad všemi okresními přebory.
 */

import { createRng, type Rng } from "../generators/rng";
import { createPlayer, categoryFromVillageSize, type CreatePlayerOptions } from "../generators/create-player";
import { shiftForRating } from "../skills/generator";
import { firstNamesTakenWith, pickFirstName } from "../generators/player";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import type { VirtualPlayerData } from "../transfers/virtual-purchase";
import { clubMeanFor, normal, townClubMean, villageClubName, type VillageInRange } from "./candidates";

const M = "outside-clubs";

/** Kádr klubu mimo hru: 2 brankáři, 6 obránců, 6 záložníků, 4 útočníci (jako dřív losování postů). */
export const OUTSIDE_SQUAD_POSITIONS = [
  "GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD",
] as const;
export const OUTSIDE_AGE_MIN = 16;
export const OUTSIDE_AGE_MAX = 35;
/** Rozptyl cíle při vzniku hráče; generátor sám přidá ~3,3, dohromady sd 4,5 (spec skautingu). */
const TARGET_SD = 3.1;
/**
 * Vesnický klub není silnější než průměr ligy + 2 body: vzorec podle velikosti obce je
 * nafitovaný na jižní Čechy a pražské městské části by bez stropu byly o deset bodů nad
 * pražskou ligou. Města od 5 tisíc mají klub o soutěž výš (`townClubMean`).
 */
const VILLAGE_MEAN_OVER_LEAGUE = 2;

export type SquadNames = NonNullable<CreatePlayerOptions["names"]>;

export interface OutsidePlayer {
  id: string;
  villageId: string;
  slot: number;
  position: string;
  age: number;
  rating: number;
  clubRank: number;
  status: "available" | "sold";
  player: VirtualPlayerData;
}

export interface OutsideSquad {
  clubMean: number;
  players: OutsidePlayer[];
}

/** Síla klubu obce podle počtu obyvatel a ligy, ke které obec patří. */
export function outsideClubMean(population: number, anchorLeagueAverage: number | null): number {
  const village = Math.min(
    clubMeanFor(population),
    anchorLeagueAverage != null ? anchorLeagueAverage + VILLAGE_MEAN_OVER_LEAGUE : Number.POSITIVE_INFINITY,
  );
  return Math.max(village, townClubMean(population, anchorLeagueAverage) ?? village);
}

/** Celý kádr klubu obce. Čistá funkce: stejné `rng` dá stejný kádr. */
export function buildOutsideSquad(
  rng: Rng, village: Pick<VillageInRange, "id" | "name" | "district" | "population" | "size">, mean: number, names: SquadNames,
): Array<Omit<OutsidePlayer, "id" | "status">> {
  const clubName = villageClubName(village);
  // Stejné jméno i příjmení dvakrát v jednom kádru mate: při shodě se křestní jméno losuje znovu.
  const taken = new Set<string>();
  const built = OUTSIDE_SQUAD_POSITIONS.map((position, slot) => {
    const age = rng.int(OUTSIDE_AGE_MIN, OUTSIDE_AGE_MAX);
    const target = mean + normal(rng) * TARGET_SD;
    const created = createPlayer(rng, {
      position, age, level: "village",
      village: { region_code: village.district, category: categoryFromVillageSize(village.size), population: village.population, district: village.district },
      names, shift: shiftForRating("village", position, 27, target),
    });
    let firstName = created.firstName;
    if (taken.has(`${firstName} ${created.lastName}`) && created.nationality === "CZ") {
      firstName = pickFirstName(rng, names.firstnameData, created.age, "1980s", firstNamesTakenWith(taken, created.lastName));
    }
    taken.add(`${firstName} ${created.lastName}`);
    const player: VirtualPlayerData = {
      firstName, lastName: created.lastName, age: created.age, position,
      overallRating: created.rating, skills: created.skills, physical: created.physical, personality: created.personality,
      weeklyWage: Math.round(10 + (created.rating / 100) * 400), avatar: created.avatar, nationality: created.nationality,
      fromTeam: clubName, fromCity: village.name, fromDistrict: village.district,
      skillCaps: created.skillsMax as Record<string, { current: number; maxPotential: number }>, hiddenTalent: created.hiddenTalent,
      occupation: created.lifeContext.occupation,
    };
    return { villageId: village.id, slot, position, age: created.age, rating: created.rating, clubRank: 0, player };
  });
  // Pořadí v kádru podle hodnocení (1 = nejlepší), při shodě rozhoduje pořadí v kádru.
  const order = [...built].sort((a, b) => b.rating - a.rating || a.slot - b.slot);
  order.forEach((p, i) => { p.clubRank = i + 1; });
  return built;
}

/** Nejsilnější liga dospělých ve hře a její průměr (stejný výpočet jako průměr ligy kupce dřív). */
async function anchorLeague(db: D1Database): Promise<{ leagueId: string; average: number } | null> {
  const row = await db.prepare(
    `SELECT t.league_id, AVG(p.overall_rating) AS avg FROM players p JOIN teams t ON t.id = p.team_id
      WHERE t.league_id IS NOT NULL AND COALESCE(t.team_type, 'senior') != 'u21'
      GROUP BY t.league_id ORDER BY avg DESC LIMIT 1`,
  ).first<{ league_id: string; avg: number | null }>();
  return row?.avg != null ? { leagueId: row.league_id, average: row.avg } : null;
}

type PlayerRow = {
  id: string; village_id: string; slot: number; position: string; age: number; overall_rating: number;
  club_rank: number; status: "available" | "sold"; player_data: string;
};

async function readSquad(db: D1Database, villageId: string, seasonNumber: number): Promise<OutsideSquad | null> {
  const club = await db.prepare("SELECT club_mean FROM outside_clubs WHERE village_id = ? AND season_number = ?")
    .bind(villageId, seasonNumber).first<{ club_mean: number }>();
  if (!club) return null;
  const rows = await db.prepare(
    `SELECT id, village_id, slot, position, age, overall_rating, club_rank, status, player_data
       FROM outside_players WHERE village_id = ? AND season_number = ? ORDER BY slot`,
  ).bind(villageId, seasonNumber).all<PlayerRow>();
  const players: OutsidePlayer[] = [];
  for (const r of rows.results) {
    try {
      players.push({
        id: r.id, villageId: r.village_id, slot: r.slot, position: r.position, age: r.age, rating: r.overall_rating,
        clubRank: r.club_rank, status: r.status, player: JSON.parse(r.player_data) as VirtualPlayerData,
      });
    } catch (e) {
      logger.warn({ module: M }, `nečitelný hráč klubu mimo hru ${r.id}`, e);
    }
  }
  return { clubMean: club.club_mean, players };
}

/**
 * Kádr klubu obce v sezóně. Když ještě není, vytvoří ho. Losuje se ze seedu obce a sezóny,
 * takže dva souběžné běhy vytvoří tentýž kádr a druhý zápis se díky unikátním klíčům zahodí.
 */
export async function loadOutsideSquad(
  db: D1Database, village: VillageInRange, seasonNumber: number, names: SquadNames,
): Promise<OutsideSquad | null> {
  const existing = await readSquad(db, village.id, seasonNumber);
  if (existing && existing.players.length > 0) return existing;

  const anchor = await anchorLeague(db);
  const mean = outsideClubMean(village.population, anchor?.average ?? null);
  const rng = createRng(seedFromString(`outside|${village.id}|${seasonNumber}`));
  const squad = buildOutsideSquad(rng, village, mean, names);
  const stmts = [
    db.prepare("INSERT OR IGNORE INTO outside_clubs (village_id, season_number, club_mean, anchor_league_id) VALUES (?, ?, ?, ?)")
      .bind(village.id, seasonNumber, mean, anchor?.leagueId ?? null),
    ...squad.map((p) => db.prepare(
      `INSERT OR IGNORE INTO outside_players (id, village_id, season_number, slot, position, age, overall_rating, club_rank, player_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), village.id, seasonNumber, p.slot, p.position, p.age, p.rating, p.clubRank, JSON.stringify(p.player))),
  ];
  await db.batch(stmts);
  logger.info({ module: M }, `kádr klubu ${village.name} (sezóna ${seasonNumber}): síla ${mean.toFixed(1)}`);
  return readSquad(db, village.id, seasonNumber);
}

/** Číslo aktivní sezóny (kádry klubů mimo hru jsou na sezónu). */
export async function activeSeasonNumber(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "aktivní sezóna", e); return null; });
  return row?.number ?? null;
}
