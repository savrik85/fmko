/**
 * Celorepublikový amatérský pohár — KO soutěž napříč všemi ligami + generované velkokluby.
 * Silová simulace (bez sestav) s šancí na překvapení (giant-killing).
 */

import { createRng, type Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import type { Weather, TeamSetup } from "../engine/types";

/** Odměna za VÝHRU kola podle hloubky (od finále). Platí pro libovolný počet kol. */
const CUP_PRIZE_BY_DEPTH = [240000, 120000, 72000, 42000, 24000, 15000, 9000];
export function cupPrize(round: number, totalRounds: number): number {
  return CUP_PRIZE_BY_DEPTH[Math.min(Math.max(0, totalRounds - round), CUP_PRIZE_BY_DEPTH.length - 1)];
}
/** Reputace za výhru kola (trenér + tým). Pohár je prestižnější než liga —
 *  vítěz poháru naskládá kumulativně víc reputace než vítěz ligy. */
function cupRepBonus(round: number, totalRounds: number): { manager: number; team: number } {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return { manager: 8, team: 5 }; // výhra ve finále = vítěz poháru
  if (fromEnd === 1) return { manager: 5, team: 3 }; // výhra v semifinále (postup do finále)
  if (fromEnd === 2) return { manager: 3, team: 2 }; // výhra ve čtvrtfinále
  if (fromEnd === 3) return { manager: 2, team: 1 }; // výhra v osmifinále
  return { manager: 0, team: 0 };
}
/** Tabulka odměn pro UI: název kola → částka za výhru. */
export function cupPrizeTable(totalRounds: number): { round: number; roundName: string; prize: number }[] {
  const out: { round: number; roundName: string; prize: number }[] = [];
  for (let r = 1; r <= totalRounds; r++) out.push({ round: r, roundName: roundName(r, totalRounds), prize: cupPrize(r, totalRounds) });
  return out;
}

/**
 * Datumy jednotlivých kol poháru — rozprostřené přes celou sezónu, FINÁLE na konci ligy.
 * Kola padají na sobotu (ligový den je po/čt), takže se s ligou nekříží.
 */
export async function cupRoundDates(db: D1Database, seasonNumber: number, totalRounds: number): Promise<string[]> {
  const span = await db.prepare(
    "SELECT MIN(scheduled_at) AS first, MAX(scheduled_at) AS last FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id WHERE l.league_type = 'senior' AND sc.season_number = ?",
  ).bind(seasonNumber).first<{ first: string | null; last: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "cup span", e); return null; });
  const startMs = span?.first ? new Date(span.first).getTime() : Date.now();
  const endMs = span?.last ? new Date(span.last).getTime() : startMs + totalRounds * 14 * 86400000;
  const dates: string[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const frac = r / totalRounds; // r = totalRounds → 1.0 → konec ligy (finále)
    const d = new Date(startMs + frac * (endMs - startMs));
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1); // snap na sobotu (pohárový den)
    d.setUTCHours(16, 0, 0, 0);
    dates.push(d.toISOString());
  }
  // Zajisti přísně rostoucí (snap mohl kola slepit) — posuň duplicity o týden.
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] <= dates[i - 1]) { const nd = new Date(dates[i - 1]); nd.setUTCDate(nd.getUTCDate() + 7); dates[i] = nd.toISOString(); }
  }
  return dates;
}

const M = "cup";
const CUP_NAME = "Český amatérský pohár";
const HOME_ADV = 3;

const BIG_CLUB_PREFIX = ["FC", "Sparta", "Slávia", "Viktoria", "Baník", "Tatran", "Sokol", "Union", "Dynamo", "Slovan", "Spartak", "Lokomotiva", "Jiskra", "Real", "Inter", "Dukla", "Slavoj", "AC", "FK", "SK"];
// Reálná česká města seřazená dle velikosti (největší první) — velkokluby jsou z měst,
// síla klubu roste s velikostí města (Praha nejsilnější, menší města slabší).
const BIG_CITIES = [
  "Praha", "Brno", "Ostrava", "Plzeň", "Liberec", "Olomouc", "České Budějovice", "Hradec Králové",
  "Ústí nad Labem", "Pardubice", "Zlín", "Havířov", "Kladno", "Most", "Opava", "Frýdek-Místek",
  "Karviná", "Jihlava", "Teplice", "Děčín", "Karlovy Vary", "Jablonec nad Nisou", "Mladá Boleslav", "Prostějov",
  "Přerov", "Chomutov", "Třebíč", "Třinec", "Tábor", "Znojmo", "Příbram", "Kolín",
  "Cheb", "Trutnov", "Písek", "Kroměříž", "Šumperk", "Vsetín", "Uherské Hradiště", "Břeclav",
  "Hodonín", "Český Těšín", "Litoměřice", "Havlíčkův Brod", "Nový Jičín", "Krnov", "Sokolov", "Vyškov",
  "Náchod", "Bohumín", "Klatovy", "Žďár nad Sázavou", "Jindřichův Hradec", "Kutná Hora", "Blansko", "Strakonice",
  "Rakovník", "Benešov", "Jičín", "Chrudim", "Beroun", "Mělník", "Valašské Meziříčí", "Kopřivnice",
];

function nextPow2(n: number): number { let p = 1; while (p < n) p <<= 1; return p; }

/** Název kola podle vzdálenosti od finále. */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Finále";
  if (fromEnd === 1) return "Semifinále";
  if (fromEnd === 2) return "Čtvrtfinále";
  if (fromEnd === 3) return "Osmifinále";
  return `${round}. kolo`;
}

function samplePoisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng.random(); } while (p > L && k < 12);
  return k - 1;
}

/** Odsimuluje jeden pohárový zápas (silově). Vrací skóre + vítěze + příznak překvapení. */
function simMatch(sH: number, sA: number, rng: Rng): { hg: number; ag: number; hp: number | null; ap: number | null; homeWin: boolean; upset: boolean } {
  const diff = (sH + HOME_ADV) - sA;
  const expH = Math.max(0.25, Math.min(4.5, 1.45 + diff * 0.055));
  const expA = Math.max(0.25, Math.min(4.5, 1.45 - diff * 0.055));
  let hg = samplePoisson(expH, rng);
  let ag = samplePoisson(expA, rng);
  let hp: number | null = null, ap: number | null = null;
  let homeWin: boolean;
  if (hg === ag) {
    // Penalty — mírně favorizuj silnějšího, ale je to loterie
    const homePenChance = 0.5 + (sH - sA) * 0.01;
    homeWin = rng.random() < Math.max(0.3, Math.min(0.7, homePenChance));
    hp = homeWin ? 5 : 3 + Math.floor(rng.random() * 2);
    ap = homeWin ? 3 + Math.floor(rng.random() * 2) : 5;
  } else {
    homeWin = hg > ag;
  }
  const winnerStr = homeWin ? sH : sA;
  const loserStr = homeWin ? sA : sH;
  const upset = loserStr - winnerStr >= 12; // slabší vyřadil výrazně silnějšího
  return { hg, ag, hp, ap, homeWin, upset };
}

interface CupTeamRow { id: string; team_id: string | null; name: string; strength: number; is_big_club: number; primary_color: string | null }

/** Vytvoří pohár pro danou sezónu: los všech senior týmů + doplnění velkokluby na mocninu 2. */
export async function createCup(db: D1Database, seasonNumber: number): Promise<{ created: boolean; cupId?: string; teams?: number; rounds?: number }> {
  const existing = await db.prepare("SELECT id FROM cup_competitions WHERE season_number = ? LIMIT 1").bind(seasonNumber).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "guard cup", e); return null; });
  if (existing) return { created: false, cupId: existing.id };

  const teamsRes = await db.prepare(
    "SELECT t.id, t.name, t.primary_color, t.user_id, CAST(COALESCE(ROUND(AVG(p.overall_rating)), 30) AS INTEGER) AS strength FROM teams t LEFT JOIN players p ON p.team_id = t.id AND p.status = 'active' WHERE t.team_type = 'senior' GROUP BY t.id",
  ).all<{ id: string; name: string; primary_color: string | null; user_id: string; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "load teams for cup", e); return { results: [] as any[] }; });
  const real = teamsRes.results;
  if (real.length < 2) return { created: false };

  const rng = createRng((seasonNumber * 2654435761) >>> 0);
  const bracketSize = nextPow2(real.length);
  const totalRounds = Math.round(Math.log2(bracketSize));
  const cupId = crypto.randomUUID();
  const roundDates = await cupRoundDates(db, seasonNumber, totalRounds);

  // Účastníci: reálné týmy + velkokluby
  const participants: CupTeamRow[] = real.map((t) => ({
    id: crypto.randomUUID(), team_id: t.id, name: t.name, strength: t.strength, is_big_club: 0, primary_color: t.primary_color,
  }));
  const usedNames = new Set<string>();
  const bigCount = bracketSize - participants.length;
  for (let i = 0; i < bigCount; i++) {
    const rank = i % BIG_CITIES.length;           // pořadí města dle velikosti (0 = největší)
    const city = BIG_CITIES[rank];
    let nm = `${BIG_CLUB_PREFIX[Math.floor(rng.random() * BIG_CLUB_PREFIX.length)]} ${city}`;
    let g = 0;
    while (usedNames.has(nm) && g++ < 30) nm = `${BIG_CLUB_PREFIX[Math.floor(rng.random() * BIG_CLUB_PREFIX.length)]} ${city}`;
    usedNames.add(nm);
    // Síla ~ velikost města: největší ~68, nejmenší z listu ~44 (+ malý rozptyl).
    const base = Math.round(68 - (rank / (BIG_CITIES.length - 1)) * 24);
    const strength = Math.max(42, Math.min(70, base + Math.floor(rng.random() * 5) - 2));
    participants.push({ id: crypto.randomUUID(), team_id: null, name: nm, strength, is_big_club: 1, primary_color: null });
  }

  // Insert competition + teams
  await db.prepare("INSERT INTO cup_competitions (id, season_number, name, status, total_rounds, current_round) VALUES (?, ?, ?, 'active', ?, 1)")
    .bind(cupId, seasonNumber, CUP_NAME, totalRounds).run()
    .catch((e) => logger.error({ module: M }, "insert cup", e));

  for (let i = 0; i < participants.length; i += 20) {
    const batch = participants.slice(i, i + 20).map((p) =>
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength, is_big_club, primary_color) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(p.id, cupId, p.team_id, p.name, p.strength, p.is_big_club, p.primary_color));
    await db.batch(batch).catch((e) => logger.error({ module: M }, "insert cup teams", e));
  }

  // Los: zamíchej a spáruj sousedy → 1. kolo
  // Los: 1. kolo real-vs-real + big-vs-big (seskupené, ať real týmy zůstanou spolu i v dalších kolech,
  // a lidské týmy nenarazí na velkoklub hned v 1. kole → šance projít aspoň 2 kola).
  const humanIds = new Set(real.filter((t) => t.user_id !== "ai").map((t) => t.id));
  const shuf = <T,>(arr: T[]): T[] => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const realHuman = shuf(participants.filter((p) => p.is_big_club === 0 && p.team_id !== null && humanIds.has(p.team_id)));
  const realAi = shuf(participants.filter((p) => p.is_big_club === 0 && !(p.team_id !== null && humanIds.has(p.team_id))));
  const bigs = shuf(participants.filter((p) => p.is_big_club === 1));
  const orderedReal = [...realHuman, ...realAi]; // lidské první → případný lichý zbytek je AI

  const order: CupTeamRow[] = [];
  const realPairs = Math.floor(orderedReal.length / 2);
  for (let i = 0; i < realPairs * 2; i++) order.push(orderedReal[i]);
  const bigPairs = Math.floor(bigs.length / 2);
  for (let i = 0; i < bigPairs * 2; i++) order.push(bigs[i]);
  // liché zbytky (real + big) spárované na konci pavouka
  if (orderedReal.length % 2 === 1) order.push(orderedReal[orderedReal.length - 1]);
  if (bigs.length % 2 === 1) order.push(bigs[bigs.length - 1]);
  const matchStmts: D1PreparedStatement[] = [];
  for (let pos = 0; pos < order.length / 2; pos++) {
    matchStmts.push(db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, 1, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, pos, order[pos * 2].id, order[pos * 2 + 1].id, roundDates[0] ?? null));
  }
  for (let i = 0; i < matchStmts.length; i += 40) await db.batch(matchStmts.slice(i, i + 40)).catch((e) => logger.error({ module: M }, "insert round1", e));

  logger.info({ module: M }, `cup created s=${seasonNumber} teams=${participants.length} rounds=${totalRounds}`);
  return { created: true, cupId, teams: participants.length, rounds: totalRounds };
}

/**
 * Lazy generování kádrů velkoklubů (plné atributy, různá morálka/kondice) — chunkovaně,
 * ať se nenarazí na limit subrequestů. Vrátí počet klubů, jimž byl kádr vygenerován.
 */
export async function ensureBigClubSquads(db: D1Database, cupId: string, maxClubs = 8): Promise<number> {
  const clubs = await db.prepare(
    "SELECT ct.id, ct.name, ct.strength FROM cup_teams ct WHERE ct.cup_id = ? AND ct.is_big_club = 1 AND NOT EXISTS (SELECT 1 FROM cup_club_players p WHERE p.cup_team_id = ct.id) LIMIT ?"
  ).bind(cupId, maxClubs).all<{ id: string; name: string; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "ensure squads: load clubs", e); return { results: [] as { id: string; name: string; strength: number }[] }; });
  if (!clubs.results.length) return 0;

  const { generateSquad } = await import("../generators/player");
  const { cryptoSeed } = await import("../generators/rng");
  const { FIRSTNAMES } = await import("../data/czech-names");
  const SURNAMES: Record<string, number> = { "Novák": 10, "Svoboda": 8, "Dvořák": 7, "Černý": 6, "Procházka": 5, "Kučera": 5, "Veselý": 4, "Horák": 4, "Němec": 3, "Marek": 3, "Pospíšil": 3, "Pokorný": 2, "Hájek": 2, "Král": 2, "Jelínek": 2 };
  const CORE = ["speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping", "stamina", "strength"];

  let done = 0;
  for (const club of clubs.results) {
    const rng = createRng(cryptoSeed());
    const village = { region_code: "Praha", category: "mesto", population: 100000, district: "Praha", lat: 50.08, lng: 14.42, name: club.name } as unknown as Parameters<typeof generateSquad>[1];
    const surnameData = { surnames: SURNAMES, female_forms: {} } as unknown as Parameters<typeof generateSquad>[2];
    const firstnameData = { male: FIRSTNAMES, female: {} } as unknown as Parameters<typeof generateSquad>[3];
    const squad = generateSquad(rng, village, surnameData, firstnameData, 18);

    const overallOf = (p: Record<string, number>) => Math.round(CORE.reduce((s, k) => s + (p[k] ?? 40), 0) / CORE.length);
    const avg = squad.reduce((s, p) => s + overallOf(p as unknown as Record<string, number>), 0) / Math.max(1, squad.length);
    const shift = club.strength - avg; // posun na sílu klubu

    const stmts: D1PreparedStatement[] = [];
    for (const p of squad) {
      const pr = p as unknown as Record<string, number>;
      const sk = (k: string) => Math.max(15, Math.min(95, Math.round((pr[k] ?? 40) + shift)));
      const skills = { speed: sk("speed"), technique: sk("technique"), shooting: sk("shooting"), passing: sk("passing"), heading: sk("heading"), defense: sk("defense"), goalkeeping: sk("goalkeeping"), vision: sk("technique"), creativity: sk("passing"), setPieces: rng.int(20, 70) };
      const physical = { stamina: sk("stamina"), strength: sk("strength"), injuryProneness: pr.injuryProneness ?? 50, height: rng.int(172, 191), weight: rng.int(68, 88), preferredFoot: "right", preferredSide: "center" };
      const personality = { discipline: pr.discipline ?? 50, patriotism: pr.patriotism ?? 50, alcohol: pr.alcohol ?? 30, temper: pr.temper ?? 40, leadership: pr.leadership ?? 40, workRate: pr.workRate ?? 55, aggression: pr.aggression ?? 45, consistency: pr.consistency ?? 55, clutch: pr.clutch ?? 50 };
      const overall = Math.max(20, Math.min(90, overallOf(pr) + Math.round(shift)));
      const pp = p as unknown as { firstName: string; lastName: string; position: string; age?: number };
      stmts.push(db.prepare(
        "INSERT INTO cup_club_players (id, cup_team_id, first_name, last_name, position, overall_rating, age, skills, physical, personality, condition, morale, avatar, suspended_matches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)"
      ).bind(crypto.randomUUID(), club.id, pp.firstName, pp.lastName, pp.position, overall, pp.age ?? 26,
        JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(personality),
        rng.int(78, 100), rng.int(45, 78), rng.random() < 0.05 ? rng.int(1, 2) : 0)); // různá kondice/morálka, občas trest
    }
    for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40)).catch((e) => logger.warn({ module: M }, "insert cup squad", e));
    done++;
  }
  logger.info({ module: M }, `cup squads generated for ${done} clubs`);
  return done;
}

/** Načte kádr velkoklubu z cup_club_players ve tvaru řádků `players` (pro buildMatchPlayers sourceRows). */
async function loadCupClubRows(db: D1Database, cupTeamId: string): Promise<{ results: Record<string, unknown>[] }> {
  const res = await db.prepare("SELECT * FROM cup_club_players WHERE cup_team_id = ? ORDER BY overall_rating DESC").bind(cupTeamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "load cup club rows", e); return { results: [] as Record<string, unknown>[] }; });
  return {
    results: res.results.map((r) => ({
      ...r, nickname: null, status: "active",
      life_context: JSON.stringify({ morale: r.morale ?? 60, condition: r.condition ?? 100 }),
    })),
  };
}

/** Penaltový rozstřel — mírně zvýhodní silnější tým. */
function cupShootout(rng: Rng, sHome: number, sAway: number): { hp: number; ap: number } {
  let hp = 0, ap = 0;
  const pHome = Math.max(0.55, Math.min(0.9, 0.72 + (sHome - 50) / 500));
  const pAway = Math.max(0.55, Math.min(0.9, 0.72 + (sAway - 50) / 500));
  for (let i = 0; i < 5; i++) { if (rng.random() < pHome) hp++; if (rng.random() < pAway) ap++; }
  let guard = 0;
  while (hp === ap && guard++ < 20) { if (rng.random() < pHome) hp++; if (rng.random() < pAway) ap++; }
  if (hp === ap) hp++; // pojistka
  return { hp, ap };
}

/**
 * Plnohodnotná simulace pohárového zápasu — reálný zápasový engine (sestavy, morálka, kondice,
 * absence, počasí) + uložení hráčských statistik do match_player_stats.
 */
async function simulateCupTie(
  db: D1Database, rng: Rng, cupMatchId: string,
  homeCupTeamId: string, awayCupTeamId: string,
  realTeamOf: Map<string, string | null>, strengthOf: Map<string, number>, weather: Weather,
): Promise<{ hg: number; ag: number; hp: number; ap: number; homeWin: boolean; upset: boolean }> {
  const { buildMatchPlayers } = await import("../multiplayer/match-runner");
  const { simulateMatch } = await import("../engine/simulation");
  const { calculatePlayerRatings, extractStatsFromEvents, saveMatchPlayerStats, determineManOfMatch, saveMatchMom } = await import("../stats/update-stats");

  const homeReal = realTeamOf.get(homeCupTeamId) ?? null;
  const awayReal = realTeamOf.get(awayCupTeamId) ?? null;
  const savedLineup = async (rid: string | null) => rid
    ? await db.prepare("SELECT players_data, formation FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 1").bind(rid).first<{ players_data: string; formation: string }>().catch((e) => { logger.warn({ module: M }, "cup saved lineup", e); return null; })
    : null;
  const homeLR = await savedLineup(homeReal);
  const awayLR = await savedLineup(awayReal);

  const homeBuild = homeReal
    ? await buildMatchPlayers(db, homeReal, homeLR?.players_data ?? null, 0, { matchKey: cupMatchId })
    : await buildMatchPlayers(db, homeCupTeamId, null, 0, { matchKey: cupMatchId }, await loadCupClubRows(db, homeCupTeamId));
  const awayBuild = awayReal
    ? await buildMatchPlayers(db, awayReal, awayLR?.players_data ?? null, 100, { matchKey: cupMatchId })
    : await buildMatchPlayers(db, awayCupTeamId, null, 100, { matchKey: cupMatchId }, await loadCupClubRows(db, awayCupTeamId));

  const homeLineup = homeBuild.players; const homeSubs = homeLineup.splice(11);
  const awayLineup = awayBuild.players; const awaySubs = awayLineup.splice(11);
  if (homeLineup.length < 7 || awayLineup.length < 7) {
    const fb = simMatch(strengthOf.get(homeCupTeamId) ?? 30, strengthOf.get(awayCupTeamId) ?? 30, rng); // pojistka
    return { ...fb, hp: fb.hp ?? 0, ap: fb.ap ?? 0 };
  }
  const homePre = homeLineup.map((p) => ({ ...p }));
  const awayPre = awayLineup.map((p) => ({ ...p }));

  const homeSetup: TeamSetup = { teamId: 1, teamName: "Domácí", lineup: homeLineup, subs: homeSubs, tactic: "balanced", formation: homeLR?.formation ?? "4-4-2", formationFamiliarity: 0 };
  const awaySetup: TeamSetup = { teamId: 2, teamName: "Hosté", lineup: awayLineup, subs: awaySubs, tactic: "balanced", formation: awayLR?.formation ?? "4-4-2", formationFamiliarity: 0 };
  const result = simulateMatch(rng, { home: homeSetup, away: awaySetup, weather, isHomeAdvantage: false });

  const fullIdMap = new Map<number, string>();
  for (const [e, d] of homeBuild.idMap) fullIdMap.set(e, d);
  for (const [e, d] of awayBuild.idMap) fullIdMap.set(e, d);
  const positions = new Map<string, string>();       // dbId → pozice (pro záznamy statistik)
  for (const [d, p] of homeBuild.positionMap) positions.set(d, p);
  for (const [d, p] of awayBuild.positionMap) positions.set(d, p);
  const enginePos = new Map<number, string>();        // engineId → pozice (pro výpočet ratingů)
  for (const p of [...homePre, ...homeSubs, ...awayPre, ...awaySubs]) enginePos.set(p.id, p.matchPosition ?? p.position);

  const ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore, enginePos);
  const homeStarterIds = homePre.map((p) => homeBuild.idMap.get(p.id) ?? "").filter(Boolean);
  const awayStarterIds = awayPre.map((p) => awayBuild.idMap.get(p.id) ?? "").filter(Boolean);
  const homeUpdates = extractStatsFromEvents(result.events, homeBuild.idMap, homeStarterIds, ratings, result.playerMinutes);
  const awayUpdates = extractStatsFromEvents(result.events, awayBuild.idMap, awayStarterIds, ratings, result.playerMinutes);
  const toEntry = (u: (typeof homeUpdates)[number], cupTeamId: string, starters: string[]) => ({
    playerId: u.playerId, teamId: cupTeamId, started: starters.includes(u.playerId), position: positions.get(u.playerId) ?? "MID",
    minutesPlayed: u.minutesPlayed, goals: u.goals, assists: u.assists, yellowCards: u.yellowCards, redCards: u.redCards, rating: u.rating,
  });
  const entries = [
    ...homeUpdates.map((u) => toEntry(u, homeCupTeamId, homeStarterIds)),
    ...awayUpdates.map((u) => toEntry(u, awayCupTeamId, awayStarterIds)),
  ];
  await saveMatchPlayerStats(db, cupMatchId, entries).catch((e) => logger.warn({ module: M }, "save cup player stats", e));
  await saveMatchMom(db, cupMatchId, determineManOfMatch(ratings)).catch((e) => logger.warn({ module: M }, "cup mom", e));

  let hp = 0, ap = 0;
  if (result.homeScore === result.awayScore) {
    ({ hp, ap } = cupShootout(rng, strengthOf.get(homeCupTeamId) ?? 50, strengthOf.get(awayCupTeamId) ?? 50));
  }
  const homeWin = result.homeScore > result.awayScore || (result.homeScore === result.awayScore && hp > ap);
  const winnerStr = homeWin ? (strengthOf.get(homeCupTeamId) ?? 30) : (strengthOf.get(awayCupTeamId) ?? 30);
  const loserStr = homeWin ? (strengthOf.get(awayCupTeamId) ?? 30) : (strengthOf.get(homeCupTeamId) ?? 30);
  return { hg: result.homeScore, ag: result.awayScore, hp, ap, homeWin, upset: loserStr - winnerStr >= 12 };
}

/** Odsimuluje aktuální kolo poháru a vygeneruje další kolo z vítězů (nebo ukončí pohár ve finále). */
export async function simulateCupRound(db: D1Database, cupId: string): Promise<{ ok: boolean; round?: number; finished?: boolean; winner?: string }> {
  const cup = await db.prepare("SELECT total_rounds, current_round, status, season_number FROM cup_competitions WHERE id = ?").bind(cupId)
    .first<{ total_rounds: number; current_round: number; status: string; season_number: number }>()
    .catch((e) => { logger.warn({ module: M }, "load cup", e); return null; });
  if (!cup || cup.status !== "active") return { ok: false };
  const round = cup.current_round;

  // Chunk: max 12 zápasů na invokaci (plný engine je drahý — 64 zápasů kola by přeteklo limit workeru).
  const CUP_CHUNK = 12;
  const matchesRes = await db.prepare("SELECT id, bracket_pos, home_cup_team_id, away_cup_team_id FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled' ORDER BY bracket_pos LIMIT ?")
    .bind(cupId, round, CUP_CHUNK).all<{ id: string; bracket_pos: number; home_cup_team_id: string | null; away_cup_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load round matches", e); return { results: [] as any[] }; });

  const teamsRes = await db.prepare("SELECT id, strength, team_id FROM cup_teams WHERE cup_id = ?").bind(cupId).all<{ id: string; strength: number; team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load cup teams", e); return { results: [] as any[] }; });
  const strengthOf = new Map<string, number>(teamsRes.results.map((t) => [t.id, t.strength]));
  const realTeamOf = new Map<string, string | null>(teamsRes.results.map((t) => [t.id, t.team_id]));

  // Odměny za postup — herní datum pro transakce + částka/reputace daného kola
  const gdRow = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load game date", e); return null; });
  const gameDate = gdRow?.d ?? new Date().toISOString();
  const prize = cupPrize(round, cup.total_rounds);
  const repBonus = cupRepBonus(round, cup.total_rounds);
  const roundLabel = roundName(round, cup.total_rounds);

  const rng = createRng((cupId.charCodeAt(0) + round * 7919) >>> 0);
  const winners: { pos: number; teamId: string }[] = [];

  for (const m of matchesRes.results) {
    if (!m.home_cup_team_id || !m.away_cup_team_id) continue;
    const cupWeathers: Weather[] = ["sunny", "cloudy", "cloudy", "rain", "wind", "snow"];
    const tieWeather = cupWeathers[rng.int(0, cupWeathers.length - 1)];
    const r = await simulateCupTie(db, rng, m.id, m.home_cup_team_id, m.away_cup_team_id, realTeamOf, strengthOf, tieWeather);
    const winnerId = r.homeWin ? m.home_cup_team_id : m.away_cup_team_id;
    const loserId = r.homeWin ? m.away_cup_team_id : m.home_cup_team_id;
    await db.prepare("UPDATE cup_matches SET home_score=?, away_score=?, home_pens=?, away_pens=?, winner_cup_team_id=?, status='simulated', upset=? WHERE id=?")
      .bind(r.hg, r.ag, r.hp, r.ap, winnerId, r.upset ? 1 : 0, m.id).run()
      .catch((e) => logger.warn({ module: M }, "update cup match", e));
    await db.prepare("UPDATE cup_teams SET eliminated_round = ? WHERE id = ?").bind(round, loserId).run()
      .catch((e) => logger.warn({ module: M }, "eliminate", e));
    winners.push({ pos: m.bracket_pos, teamId: winnerId });

    // Odměna reálnému vítězi (velkokluby nemají rozpočet)
    const realWinner = realTeamOf.get(winnerId);
    if (realWinner) {
      await recordTransaction(db, realWinner, "cup_prize", prize, `Pohár — postup (${roundLabel})`, gameDate, `cup-${cupId}-r${round}-${winnerId}`)
        .catch((e) => logger.warn({ module: M }, "cup prize", e));
      if (repBonus.manager > 0) {
        await db.prepare("UPDATE managers SET reputation = MAX(15, MIN(75, reputation + ?)) WHERE team_id = ?").bind(repBonus.manager, realWinner).run()
          .catch((e) => logger.warn({ module: M }, "cup manager reputation", e));
      }
      if (repBonus.team > 0) {
        await db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?").bind(repBonus.team, realWinner).run()
          .catch((e) => logger.warn({ module: M }, "cup team reputation", e));
      }
    }
  }

  // Ještě zbývají zápasy tohoto kola? → zpracují se v dalším chunku (příští invokace/tick).
  const remain = await db.prepare("SELECT COUNT(*) AS c FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'").bind(cupId, round).first<{ c: number }>()
    .catch((e) => { logger.warn({ module: M }, "count remaining", e); return { c: 0 }; });
  if ((remain?.c ?? 0) > 0) return { ok: true, round }; // kolo ještě není celé dohrané

  // Celé kolo dohrané → posbírej všechny vítěze z DB (napříč chunky).
  const winnersRes = await db.prepare("SELECT bracket_pos, winner_cup_team_id FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'simulated' AND winner_cup_team_id IS NOT NULL").bind(cupId, round).all<{ bracket_pos: number; winner_cup_team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "gather winners", e); return { results: [] as { bracket_pos: number; winner_cup_team_id: string }[] }; });
  const winnersAll = winnersRes.results.map((w) => ({ pos: w.bracket_pos, teamId: w.winner_cup_team_id }));

  // Finále hotové?
  if (round >= cup.total_rounds) {
    const champ = winnersAll[0]?.teamId ?? null;
    await db.prepare("UPDATE cup_competitions SET status='finished', winner_team_id=? WHERE id=?").bind(champ, cupId).run()
      .catch((e) => logger.warn({ module: M }, "finish cup", e));
    return { ok: true, round, finished: true, winner: champ ?? undefined };
  }

  // Vygeneruj další kolo: vítěz pozice i → další kolo pozice floor(i/2), home pokud i sudé
  winnersAll.sort((a, b) => a.pos - b.pos);
  const nextByPos = new Map<number, { home?: string; away?: string }>();
  for (const w of winnersAll) {
    const np = Math.floor(w.pos / 2);
    const slot = nextByPos.get(np) ?? {};
    if (w.pos % 2 === 0) slot.home = w.teamId; else slot.away = w.teamId;
    nextByPos.set(np, slot);
  }
  const roundDates = await cupRoundDates(db, cup.season_number, cup.total_rounds);
  const nextDate = roundDates[round] ?? null; // datum kola round+1 (0-indexováno)
  const nextStmts: D1PreparedStatement[] = [];
  for (const [np, slot] of nextByPos) {
    nextStmts.push(db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, round + 1, np, slot.home ?? null, slot.away ?? null, nextDate));
  }
  for (let i = 0; i < nextStmts.length; i += 40) await db.batch(nextStmts.slice(i, i + 40)).catch((e) => logger.error({ module: M }, "insert next round", e));
  await db.prepare("UPDATE cup_competitions SET current_round = ? WHERE id = ?").bind(round + 1, cupId).run()
    .catch((e) => logger.warn({ module: M }, "bump round", e));

  return { ok: true, round };
}

/**
 * Auto-postup poháru: pokud aktuální kolo aktivního poháru má naplánované datum
 * <= herní den, odsimuluj ho (i víc kol dozadu, kdyby se hra opozdila). Volá se z daily-ticku.
 */
export async function maybeAdvanceCup(db: D1Database): Promise<number> {
  const season = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'").first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "advance: season", e); return null; });
  if (!season?.n) return 0;
  const gd = await db.prepare("SELECT MAX(game_date) AS d FROM teams WHERE game_date IS NOT NULL").first<{ d: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "advance: game date", e); return null; });
  if (!gd?.d) return 0;

  // Lazy vytvoření: pokud pro aktivní sezónu pohár ještě není (rollover je těžká invokace,
  // vytvoření tam může padnout na limit subrequestů), vytvoř ho tady a postup nech na příště.
  const anyCup = await db.prepare("SELECT id FROM cup_competitions WHERE season_number = ? LIMIT 1").bind(season.n).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "advance: any cup", e); return null; });
  if (!anyCup) {
    await createCup(db, season.n).catch((e) => logger.warn({ module: M }, "lazy create cup", e));
    return 0;
  }

  // Lazy dogenerování kádrů velkoklubů (chunk 8/tick) — musí být hotové před 1. kolem.
  await ensureBigClubSquads(db, anyCup.id, 8).catch((e) => logger.warn({ module: M }, "ensure big club squads", e));

  let advanced = 0, guard = 0;
  while (guard++ < 3) { // max 3 chunky/tick (plný engine je drahý na subrequesty)
    const cup = await db.prepare("SELECT id, current_round FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1")
      .bind(season.n).first<{ id: string; current_round: number }>()
      .catch((e) => { logger.warn({ module: M }, "advance: load cup", e); return null; });
    if (!cup) break;
    const cur = await db.prepare("SELECT MIN(scheduled_at) AS d FROM cup_matches WHERE cup_id = ? AND round = ? AND status = 'scheduled'")
      .bind(cup.id, cup.current_round).first<{ d: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "advance: round date", e); return null; });
    if (!cur?.d || cur.d > gd.d) break; // kolo ještě nemá nadejít / už je dohrané
    await simulateCupRound(db, cup.id);
    advanced++;
  }
  if (advanced > 0) logger.info({ module: M }, `cup auto-advanced ${advanced} kol (s=${season.n})`);
  return advanced;
}
