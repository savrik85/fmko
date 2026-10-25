/**
 * Odchody hráčů na konci sezóny: souboje „kdo zůstane".
 *
 * Lidský i AI klub dostane stejné souboje (vždy až 3 dvojice nejohroženějších hráčů: starší,
 * slabší, nespokojení). V každé dvojici jeden odchází nadobro (ne na trh volných hráčů), nikdo
 * za něj nepřijde. Rozhoduje trenér: člověk v přehledu konce sezóny, AI trenér modelem
 * (ai-coach/season-duels.ts), obojí přes season-duels.ts. Kádr nikdy neklesne pod 11.
 * Zbylým hráčům +1 rok, vývoj kádru a trenéra.
 *
 * Dřív odcházeli AI klubu hráči automaticky (důchod podle věku a „rodinné důvody"), protože
 * AI trenér rozhodovat neuměl. Byla to jiná pravidla než pro člověka (spec AI klubů 3.2, 3.4).
 */

import { createRng } from "../generators/rng";
import { maintainFreeAgentPool } from "../transfers/free-agent-pool";
import { developSquadAndManager, type DevResult } from "./season-development";
import { logger } from "../lib/logger";

export type DepartureKind = "retirement" | "family";

export interface DepartureInfo {
  playerId: string;
  name: string;
  age: number;
  position: string;
  overallRating: number;
  kind: DepartureKind;
  reason: string;
  wasCaptain: boolean;
}

export interface DuelPlayer {
  playerId: string;
  name: string;
  position: string;
  age: number;
  overallRating: number;
}
export interface Duel { a: DuelPlayer; b: DuelPlayer; story: string }

export interface TeamDeparturesResult {
  teamId: string;
  departures: DepartureInfo[];
  agedCount: number;
  dev: DevResult;
  /** Souboje „kdo zůstane" k rozhodnutí trenérem, lidským i AI (season-duels.ts). */
  duels: Duel[];
}

/** Deterministický 32-bit seed z řetězce (FNV-1a). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function moraleOf(lifeContext: string | null): number {
  if (!lifeContext) return 50;
  try {
    const lc = JSON.parse(lifeContext) as { morale?: number };
    return typeof lc.morale === "number" ? lc.morale : 50;
  } catch {
    return 50;
  }
}

/**
 * Zpracuje odchody jednoho týmu + zestárne zbytek kádru.
 * Idempotence řeší orchestrátor přes cursor (processedTeamIds).
 */
export async function processTeamDepartures(
  db: D1Database,
  leagueId: string,
  teamId: string,
  seasonNumber: number,
): Promise<TeamDeparturesResult> {
  const rng = createRng(hashSeed(`${teamId}:s${seasonNumber}:departures`));

  const playersRes = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = ? AND status = 'active'")
    .bind(teamId).first<{ n: number }>().catch((e) => { logger.warn({ module: "season-departures" }, "load squad", e); return null; });
  if (!playersRes) return { teamId, departures: [], agedCount: 0, dev: { improved: [], declined: [], manager: null }, duels: [] };

  // Nikdo neodchází automaticky: připraví se souboje „kdo zůstane" (vždy až 3) a rozhodne
  // trenér, lidský i AI. Poražení odejdou, nikoho za ně klub nepřivede.
  const dev = await developSquadAndManager(db, leagueId, teamId, seasonNumber);
  const duels = await buildDuels(db, teamId, rng);
  const agedCount = await bumpAges(db, teamId);
  return { teamId, departures: [], agedCount, dev, duels };
}

/** Absolutní dno kádru — pod 11 už nelze postavit jedenáctku. */
const PLAYABLE_FLOOR = 11;

/** Krátké (vtipné) příběhy, proč musí jeden ze dvojice skončit. {a}/{b} = jména. */
const DUEL_STORIES = [
  "Oba si dělají zálusk na dres s číslem 9. V kabině visí jen jeden a ustoupit nehodlá ani jeden.",
  "{a} i {b} chodí za stejnou servírkou Maruškou od Pralesa. Pro klid v hospodě musí jeden zmizet.",
  "Hospoda-sponzor spočítala pípu: na celoroční žízeň obou kasa nestačí. Vyber jednoho.",
  "Oba bydlí u stejné zastávky, ale do felicie, co je vozí na zápasy, se vejde jenom jeden.",
  "{a} dává góly, ale na trénink chodí, kdy se mu zachce. {b} maká, ale netrefí ani vrata od stodoly.",
  "Po posledním zápase se servali o poslední řízek v kabině. Předseda rozhodl: spolu už ne.",
  "Manželky obou si na tribuně nadávají do kuropáčů. Pro klid v dědině zůstane jen jeden.",
  "Oba slíbili dvacet gólů. Rozpočet ale věří jen jednomu slibu, komu dáš šanci?",
  "Jeden má klíče od kabiny, druhý od sekačky na trávník. Místo v kádru zbylo jen pro jednoho.",
  "{a} a {b} se věčně hádají, kdo kope penaltu. Vyřešíme to natvrdo, jeden končí.",
  "Po dědině se šušká, že jeden z nich kope i za úhlavního soka z vedlejší vsi. Pro jistotu vyber toho druhého.",
  "Trenér má v sestavě místo jen pro jednoho. Ten druhý by celý rok jen hřál lavici a remcal.",
  "Oba chtějí kapitánskou pásku a druhou nemáme. Klubu jedno ego bohatě stačí.",
  "Pan hospodský dává dres už jen jednomu, ten druhý mu dluží za moc piv a mlčel o tom.",
  "{a} i {b} si zamluvili stejné číslo na kabinu i stejnou holku na zábavě. Tohle dobře neskončí, vyber.",
];

/**
 * Sestaví souboje „kdo zůstane" z nejohroženějších hráčů (srovnatelné dvojice).
 * Vždy se snaží o 3 souboje; omezí je jen aby kádr neklesl pod hratelné dno (11).
 * Nikdo nepřichází — poražení prostě odejdou.
 */
async function buildDuels(db: D1Database, teamId: string, rng: ReturnType<typeof createRng>): Promise<Duel[]> {
  const res = await db.prepare(
    "SELECT id, first_name, last_name, position, age, overall_rating, life_context FROM players WHERE team_id = ? AND status = 'active'",
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number; life_context: string }>()
    .catch((e) => { logger.warn({ module: "season-departures" }, "load squad for duels", e); return { results: [] as any[] }; });
  const players = res.results;
  const activeCount = players.length;
  // Vždy až 3 souboje (= až 3 odchody), ale nikdy nesmí kádr klesnout pod 11.
  let numDuels = Math.min(3, Math.max(0, activeCount - PLAYABLE_FLOOR));
  numDuels = Math.min(numDuels, Math.floor(activeCount / 2));
  if (numDuels <= 0) return [];

  // Skóre ohrožení: starší + slabší + nižší morálka (+ špetka náhody)
  const scored = players.map((p) => ({
    p,
    score: p.age * 1.5 - p.overall_rating * 0.5 + (50 - moraleOf(p.life_context)) * 0.15 + rng.random() * 2,
  }));
  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, numDuels * 2).map((s) => s.p);

  // Srovnatelné dvojice — seřaď podle ratingu a páruj sousedy
  pool.sort((a, b) => b.overall_rating - a.overall_rating);

  // Příběhy bez opakování (deterministický Fisher–Yates)
  const stories = [...DUEL_STORIES];
  for (let i = stories.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [stories[i], stories[j]] = [stories[j], stories[i]];
  }

  const mk = (p: typeof pool[number]): DuelPlayer => ({
    playerId: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, overallRating: p.overall_rating,
  });
  const duels: Duel[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) {
    const a = mk(pool[i]);
    const b = mk(pool[i + 1]);
    const story = stories[(i / 2) % stories.length].replace(/\{a\}/g, a.name).replace(/\{b\}/g, b.name);
    duels.push({ a, b, story });
  }
  return duels;
}

async function bumpAges(db: D1Database, teamId: string): Promise<number> {
  const res = await db.prepare("UPDATE players SET age = age + 1 WHERE team_id = ? AND status = 'active'")
    .bind(teamId).run().catch((e) => { logger.warn({ module: "season-departures" }, "bump ages", e); return null; });

  // Mladí přes léto povyrostou — sami od sebe, ne jen tréninkem. Musí to být AŽ po
  // zestárnutí, protože přírůstek se váže na nový věk.
  try {
    const { dospejMladeHrace, oznamDospivani } = await import("./dospivani");
    const vyrostli = await dospejMladeHrace(db, teamId);
    if (vyrostli.length > 0) await oznamDospivani(db, teamId, vyrostli);
  } catch (e) {
    logger.warn({ module: "season-departures", teamId }, "dospívání mladých", e);
  }

  // Dorost do 18 let vyroste (postava, část 2). Taky až po zestárnutí.
  try {
    const { growYoungPlayers } = await import("./body-drift");
    const gd = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
    await growYoungPlayers(db, teamId, gd?.game_date ?? new Date().toISOString());
  } catch (e) {
    logger.warn({ module: "season-departures", teamId }, "růst dorostu", e);
  }

  return res?.meta?.changes ?? 0;
}

/**
 * Refresh poolu volných hráčů (proven path) — "prostor pro nové hráče".
 * Voláno jednou ve fázi replenish (ne per tým).
 */
export async function refreshFreeAgents(db: D1Database, rng: ReturnType<typeof createRng>, gameDate: Date): Promise<number> {
  return maintainFreeAgentPool(db, rng, gameDate).catch((e) => {
    logger.warn({ module: "season-departures" }, "refresh free agents", e);
    return 0;
  });
}
