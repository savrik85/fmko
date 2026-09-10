/**
 * Generátor fanouškovských part a jejich vůdců — deterministicky, bez AI.
 *
 * Vzor je `referees/referee-generator.ts`: čistá funkce se seedem odvozeným z ID týmu,
 * takže stejný klub dostane vždy tytéž lidi a dá se to reprodukovat i testovat.
 * Zakládá se líně při prvním čtení (`ensureFanGroups`) — stejně jako komise rozhodčích.
 *
 * Jména a bio se NEGENERUJÍ modelem. Projekt to nikde nedělá a nemá to smysl:
 * vůdce musí přežít restart, mít stabilní ID a být pokaždé stejný.
 */

import { createRng, type Rng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import { getDistrictDataFromDB } from "../data/districts";
import { feminizeSurname, generateStaffFace } from "../staff/staff-generator";
import {
  FAN_GROUPS, FAN_GROUP_KINDS, FAN_LEADER_ARCHETYPES,
  type FanGroupKind, type FanLeaderArchetype, type FanSector,
} from "../engine/fan-groups";

const M = "fan-groups";

const MALE_FIRST_NAMES = [
  "Jan", "Petr", "Martin", "Tomáš", "Josef", "Miroslav", "Karel", "Pavel", "Jiří",
  "Zdeněk", "Jaroslav", "Milan", "Vladimír", "František", "Václav", "Aleš", "Roman",
  "David", "Marek", "Michal", "Radek", "Lukáš", "Ondřej", "Ladislav", "Robert",
  "Filip", "Adam", "Jakub", "Vojtěch", "Bohumil", "Stanislav", "Antonín", "Oldřich",
];

const FEMALE_FIRST_NAMES = [
  "Marie", "Jana", "Eva", "Hana", "Lenka", "Kateřina", "Věra", "Alena", "Petra",
  "Martina", "Markéta", "Veronika", "Michaela", "Monika", "Ivana", "Renata",
];

/** Přezdívky z tribuny. Vůdce bez přezdívky je spíš výjimka. */
const NICKNAMES = [
  "Buben", "Kapo", "Vlajka", "Bourák", "Sysel", "Kníže", "Dědek", "Rambo",
  "Profesor", "Bača", "Kohout", "Špunt", "Generál", "Rezák", "Šerif", "Kanec",
];

export interface GeneratedFanLeader {
  id: string;
  groupId: string;
  teamId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  gender: "m" | "f";
  age: number;
  occupation: string;
  archetype: FanLeaderArchetype;
  charisma: number;
  radikalnost: number;
  vyjednavani: number;
  avatar: Record<string, unknown>;
  bio: string;
  hlaska: string;
}

export interface GeneratedFanGroup {
  id: string;
  teamId: string;
  kind: FanGroupKind;
  name: string;
  share: number;
  sector: FanSector;
  passion: number;
  aggression: number;
  loyalty: number;
  spending: number;
  noise: number;
  leader: GeneratedFanLeader;
}

const inRange = (rng: Rng, r: readonly [number, number]) => rng.int(r[0], r[1]);
const inRangeF = (rng: Rng, r: readonly [number, number]) =>
  Math.round((r[0] + rng.random() * (r[1] - r[0])) * 100) / 100;

/**
 * Vygeneruje všech pět part jednoho klubu i s vůdci. Čistá funkce — bez DB.
 *
 * `okoli` je jméno spádové obce, odkud jezdí autobus; bez něj dostane parta z okolí
 * obecný název. Každá skupina má VLASTNÍ seed odvozený z jejího druhu, takže případná
 * šestá parta v budoucnu nepřejmenuje lidi u těch pěti, co už mají historii — je to
 * stejná past, kterou u rozhodčích řeší dvě vlny generování.
 */
export function generateFanGroups(
  teamId: string,
  opts: { obec: string; okoli?: string | null; surnames: Record<string, number> },
): GeneratedFanGroup[] {
  const usedNames = new Set<string>();
  const out: GeneratedFanGroup[] = [];

  for (const kind of FAN_GROUP_KINDS) {
    const def = FAN_GROUPS[kind];
    const rng = createRng(seedFromString(`fangroups|${teamId}|${kind}`) + 9137);
    const groupId = `fg-${teamId}-${kind}`;

    const misto = kind === "parta_z_okoli" ? (opts.okoli || "okolí") : opts.obec;
    const name = rng.pick(def.nameTemplates).replace("{obec}", misto);

    out.push({
      id: groupId,
      teamId,
      kind,
      name,
      share: inRangeF(rng, def.shareRange),
      sector: def.sector,
      passion: inRange(rng, def.passion),
      aggression: inRange(rng, def.aggression),
      loyalty: inRange(rng, def.loyalty),
      spending: inRange(rng, def.spending),
      noise: inRange(rng, def.noise),
      leader: generateLeader(rng, teamId, groupId, def.leaders, opts.surnames, usedNames),
    });
  }

  return out;
}

function generateLeader(
  rng: Rng,
  teamId: string,
  groupId: string,
  archetypes: readonly FanLeaderArchetype[],
  surnames: Record<string, number>,
  usedNames: Set<string>,
): GeneratedFanLeader {
  const archetype = rng.pick(archetypes);
  const def = FAN_LEADER_ARCHETYPES[archetype];
  const isFemale = rng.random() < def.femaleShare;
  const age = inRange(rng, def.ageRange);

  // Dva Nováci v čele dvou part jednoho klubu by hráče akorát pletli.
  let firstName = rng.pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
  let lastName = rng.weighted(surnames);
  if (isFemale) lastName = feminizeSurname(lastName);
  let guard = 0;
  while (usedNames.has(`${firstName} ${lastName}`) && guard < 30) {
    firstName = rng.pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
    lastName = rng.weighted(surnames);
    if (isFemale) lastName = feminizeSurname(lastName);
    guard++;
  }
  usedNames.add(`${firstName} ${lastName}`);

  return {
    // Archetyp je součástí ID: kdyby se katalog rozšířil a losování vyšlo jinak,
    // vznikne nový člověk místo toho, aby se tomu starému tiše přepsala povaha.
    id: `fl-${seedFromString(`${teamId}|${groupId}|${archetype}`)}-${archetype}`,
    groupId,
    teamId,
    firstName,
    lastName,
    nickname: rng.random() < 0.7 ? rng.pick(NICKNAMES) : null,
    gender: isFemale ? "f" : "m",
    age,
    // Povolání, bio i hláška v rodě podle pohlaví — jinak by z organizátorky
    // byl „starý kápo, svářeč, vede kotel od devadesátek".
    occupation: rng.pick([...(isFemale ? def.occupationsF : def.occupations)]),
    archetype,
    charisma: inRange(rng, def.charisma),
    radikalnost: inRange(rng, def.radikalnost),
    vyjednavani: inRange(rng, def.vyjednavani),
    avatar: generateStaffFace(rng, isFemale, age),
    bio: isFemale ? def.bioF : def.bio,
    hlaska: isFemale ? def.hlaskaF : def.hlaska,
  };
}

// ── DB vrstva ────────────────────────────────────────────────────────────────

export interface FanGroupRow {
  id: string;
  team_id: string;
  kind: string;
  name: string;
  share: number;
  size: number;
  mood: number;
  heat: number;
  passion: number;
  aggression: number;
  loyalty: number;
  spending: number;
  noise: number;
  sector: string;
  closed_matches: number;
  ticket_discount: number;
  leader_id: string | null;
}

export interface FanLeaderRow {
  id: string;
  group_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  gender: string;
  age: number;
  occupation: string;
  archetype: string;
  charisma: number;
  radikalnost: number;
  vyjednavani: number;
  avatar: string;
  bio: string;
  hlaska: string;
  sentiment: number;
  duvod: string | null;
  status: string;
}

/** Celé jméno včetně přezdívky, tak jak se má zobrazit. */
export function fanLeaderFullName(l: Pick<FanLeaderRow, "first_name" | "last_name" | "nickname">): string {
  return l.nickname
    ? `${l.first_name} „${l.nickname}" ${l.last_name}`
    : `${l.first_name} ${l.last_name}`;
}

/**
 * Zajistí, že klub má všech pět part i s vůdci, a vrátí je.
 *
 * Idempotentní: `INSERT OR IGNORE` na deterministická ID. O tom, jestli se má
 * generovat, rozhoduje počet ŘÁDKŮ — kdyby se počítaly jen „živé" party, stačilo by
 * jednu vyřadit a generace by běžela nadarmo při každém čtení (past popsaná
 * v `ensureReferees`).
 */
export async function ensureFanGroups(db: D1Database, teamId: string): Promise<FanGroupRow[]> {
  const existing = await db
    .prepare("SELECT * FROM fan_groups WHERE team_id = ? ORDER BY kind")
    .bind(teamId)
    .all<FanGroupRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení part týmu ${teamId}`, e); return null; });

  if (existing && existing.results.length >= FAN_GROUP_KINDS.length) return existing.results;

  const info = await db
    .prepare(
      `SELECT t.name AS team_name, v.name AS village_name, v.district AS district
       FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?`,
    )
    .bind(teamId)
    .first<{ team_name: string; village_name: string | null; district: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `načtení obce týmu ${teamId}`, e); return null; });

  if (!info) {
    logger.warn({ module: M }, `tým ${teamId} neexistuje, party se nezakládají`);
    return existing?.results ?? [];
  }

  const obec = info.village_name ?? info.team_name;
  const surnames = (await getDistrictDataFromDB(db, info.district ?? "")).surnames;
  const okoli = await spadovaObec(db, teamId);

  const groups = generateFanGroups(teamId, { obec, okoli, surnames });

  const stmts: D1PreparedStatement[] = [];
  for (const g of groups) {
    const l = g.leader;
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO fan_leaders
          (id, group_id, team_id, first_name, last_name, nickname, gender, age, occupation,
           archetype, charisma, radikalnost, vyjednavani, avatar, bio, hlaska)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        l.id, l.groupId, l.teamId, l.firstName, l.lastName, l.nickname, l.gender, l.age,
        l.occupation, l.archetype, l.charisma, l.radikalnost, l.vyjednavani,
        JSON.stringify(l.avatar), l.bio, l.hlaska,
      ),
    );
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO fan_groups
          (id, team_id, kind, name, share, size, passion, aggression, loyalty, spending, noise,
           sector, leader_id)
         VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?)`,
      ).bind(
        g.id, g.teamId, g.kind, g.name, g.share,
        g.passion, g.aggression, g.loyalty, g.spending, g.noise, g.sector, l.id,
      ),
    );
  }

  await db.batch(stmts)
    .catch((e) => { logger.error({ module: M }, `založení part týmu ${teamId}`, e); });

  logger.info({ module: M }, `tým ${teamId}: založeno ${groups.length} fanouškovských part`);

  const fresh = await db
    .prepare("SELECT * FROM fan_groups WHERE team_id = ? ORDER BY kind")
    .bind(teamId)
    .all<FanGroupRow>()
    .catch((e) => { logger.warn({ module: M }, `načtení nových part týmu ${teamId}`, e); return null; });

  return fresh?.results ?? [];
}

/**
 * Obec, odkud klubu jezdí nejvíc lidí autobusem — po ní se jmenuje parta z okolí.
 *
 * Bez satelitu vrací null a parta dostane obecný název; přejmenovat se nemůže,
 * protože název se zapisuje jen jednou při zakládání.
 */
async function spadovaObec(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT v.name AS name FROM bus_satellite_fans b
       JOIN villages v ON v.id = b.village_id
       WHERE b.team_id = ?
       ORDER BY (b.hardcore_count + b.regular_count + b.casual_count) DESC LIMIT 1`,
    )
    .bind(teamId)
    .first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "spádová obec", e); return null; });
  return row?.name ?? null;
}
