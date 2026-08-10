/**
 * Celorepublikový amatérský pohár — KO soutěž napříč všemi ligami + generované velkokluby.
 * Silová simulace (bez sestav) s šancí na překvapení (giant-killing).
 */

import { createRng, type Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { experienceGainChance } from "../skills/training";
import { recordTransaction } from "../season/finance-processor";
import type { Weather, TeamSetup } from "../engine/types";

/** Odměna za VÝHRU kola podle hloubky (od finále). Platí pro libovolný počet kol. */
const CUP_PRIZE_BY_DEPTH = [240000, 120000, 72000, 42000, 24000, 15000, 9000];
export function cupPrize(round: number, totalRounds: number): number {
  if (round <= 2) return 2000; // předkolo proti slabým amatérům — jen symbolická odměna
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

/** Název kola. Kola 1-2 = předkola (slabé týmy), hlavní pavouk od kola 3 (číslován od 1). */
export function roundName(round: number, totalRounds: number): string {
  if (round === 1) return "1. předkolo";
  if (round === 2) return "2. předkolo";
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Finále";
  if (fromEnd === 1) return "Semifinále";
  if (fromEnd === 2) return "Čtvrtfinále";
  if (fromEnd === 3) return "Osmifinále";
  return `${round - 2}. kolo`;
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
    "SELECT t.id, t.name, t.primary_color, t.user_id, CAST(COALESCE(ROUND(AVG(p.overall_rating)), 30) AS INTEGER) AS strength FROM teams t LEFT JOIN players p ON p.team_id = t.id AND p.status = 'active' WHERE t.team_type = 'senior' AND t.league_id IS NOT NULL AND t.name NOT LIKE 'DELETED-%' GROUP BY t.id",
  ).all<{ id: string; name: string; primary_color: string | null; user_id: string; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "load teams for cup", e); return { results: [] as any[] }; });
  const real = teamsRes.results;
  if (real.length < 2) return { created: false };

  const rng = createRng((seasonNumber * 2654435761) >>> 0);
  const seedBracket = nextPow2(real.length);            // hlavní pavouk (od 3. kola): reálné týmy + velkokluby
  const PRELIM_ROUNDS = 2;                                // 2 předkola se slabými týmy → lidé mají velkou šanci odehrát aspoň 2 kola
  const totalRounds = Math.round(Math.log2(seedBracket)) + PRELIM_ROUNDS;
  const cupId = crypto.randomUUID();
  const roundDates = await cupRoundDates(db, seasonNumber, totalRounds);

  // Účastníci hlavního pavouku (od 3. kola): reálné týmy + velkokluby (doplnění na mocninu 2).
  const participants: CupTeamRow[] = real.map((t) => ({
    id: crypto.randomUUID(), team_id: t.id, name: t.name, strength: t.strength, is_big_club: 0, primary_color: t.primary_color,
  }));
  const usedNames = new Set<string>();
  const bigCount = seedBracket - participants.length;
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

  // Los hlavního pavouku (3. kolo): lidé první, real-vs-real + big-vs-big seskupené — lidé nenarazí
  // na velkoklub hned po předkolech (a real týmy zůstanou spolu).
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
  if (orderedReal.length % 2 === 1) order.push(orderedReal[orderedReal.length - 1]);
  if (bigs.length % 2 === 1) order.push(bigs[bigs.length - 1]);

  // 2 PŘEDKOLA: každý seed dostane 3 vyloženě slabé amatérské týmy (síla ~8-18, bez kádru → rychlý
  // silový výsledek). Sub-pavouk [seed, slabý, slabý, slabý] → seed hraje 2 kola proti slabým a
  // skoro jistě postoupí do 3. kola (hlavní pavouk). Reální hráči tak mají velkou šanci odehrát ≥2 kola.
  const WEAK_A = ["TJ", "SK", "FC", "Sokol", "Slavoj", "Tatran", "Jiskra", "Baník"];
  const WEAK_B = ["Dolní Lhota", "Horní Ves", "Kozojedy", "Trnávka", "Zadní Chlum", "Kravaře", "Suchdol", "Blaťany", "Ořechov", "Bahňany", "Vlčí Důl", "Mokrá", "Podhájí", "Křemže", "Zálesí", "Nová Ves"];
  const weakTeams: CupTeamRow[] = [];
  for (let i = 0; i < order.length * 3; i++) {
    let nm = `${WEAK_A[Math.floor(rng.random() * WEAK_A.length)]} ${WEAK_B[Math.floor(rng.random() * WEAK_B.length)]}`;
    let g = 0;
    while (usedNames.has(nm) && g++ < 60) nm = `${WEAK_A[Math.floor(rng.random() * WEAK_A.length)]} ${WEAK_B[Math.floor(rng.random() * WEAK_B.length)]} ${String.fromCharCode(66 + (g % 8))}`;
    usedNames.add(nm);
    // Vyloženě slabí amatéři (síla 4-10) — velký odstup i od nejslabšího lidského týmu, ať lidé skoro jistě projdou.
    weakTeams.push({ id: crypto.randomUUID(), team_id: null, name: nm, strength: 4 + Math.floor(rng.random() * 7), is_big_club: 0, primary_color: null });
  }
  // ×4 pavouk: [seed, slabý, slabý, slabý] pro každý seed → 2 předkola pak hlavní pavouk.
  const bracketOrder: CupTeamRow[] = [];
  for (let i = 0; i < order.length; i++) {
    bracketOrder.push(order[i], weakTeams[i * 3], weakTeams[i * 3 + 1], weakTeams[i * 3 + 2]);
  }
  const allTeams = [...participants, ...weakTeams];

  // Insert competition + teams. D1 NENÍ transakční napříč dotazy → po vložení ověříme počty a při
  // neúplnosti celý pohár smažeme + hodíme chybu (raději žádný pohár než rozbitý pavouk s dangling id).
  let failed = false;
  await db.prepare("INSERT INTO cup_competitions (id, season_number, name, status, total_rounds, current_round) VALUES (?, ?, ?, 'active', ?, 1)")
    .bind(cupId, seasonNumber, CUP_NAME, totalRounds).run()
    .catch((e) => { failed = true; logger.error({ module: M }, "insert cup", e); });

  for (let i = 0; i < allTeams.length; i += 20) {
    const batch = allTeams.slice(i, i + 20).map((p) =>
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength, is_big_club, primary_color) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(p.id, cupId, p.team_id, p.name, p.strength, p.is_big_club, p.primary_color));
    await db.batch(batch).catch((e) => { failed = true; logger.error({ module: M }, "insert cup teams", e); });
  }

  // 1. kolo (první předkolo) — párování sousedů v ×4 pavouku.
  const matchStmts: D1PreparedStatement[] = [];
  for (let pos = 0; pos < bracketOrder.length / 2; pos++) {
    matchStmts.push(db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, 1, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, pos, bracketOrder[pos * 2].id, bracketOrder[pos * 2 + 1].id, roundDates[0] ?? null));
  }
  const expectedMatches = matchStmts.length;
  for (let i = 0; i < matchStmts.length; i += 40) await db.batch(matchStmts.slice(i, i + 40)).catch((e) => { failed = true; logger.error({ module: M }, "insert round1", e); });

  // Ověření úplnosti — počty MUSÍ sedět, jinak úklid + throw (guard výše by jinak rozbitý pohár nikdy neopravil).
  const teamCount = await db.prepare("SELECT COUNT(*) AS c FROM cup_teams WHERE cup_id = ?").bind(cupId).first<{ c: number }>()
    .catch((e) => { logger.warn({ module: M }, "verify cup teams count", e); return null; });
  const matchCount = await db.prepare("SELECT COUNT(*) AS c FROM cup_matches WHERE cup_id = ?").bind(cupId).first<{ c: number }>()
    .catch((e) => { logger.warn({ module: M }, "verify cup matches count", e); return null; });
  if (failed || (teamCount?.c ?? -1) !== allTeams.length || (matchCount?.c ?? -1) !== expectedMatches) {
    logger.error({ module: M }, `createCup NEÚPLNÝ (teams ${teamCount?.c}/${allTeams.length}, matches ${matchCount?.c}/${expectedMatches}) → úklid + throw`);
    await db.prepare("DELETE FROM cup_matches WHERE cup_id = ?").bind(cupId).run().catch((e) => logger.warn({ module: M }, "cleanup cup matches", e));
    await db.prepare("DELETE FROM cup_teams WHERE cup_id = ?").bind(cupId).run().catch((e) => logger.warn({ module: M }, "cleanup cup teams", e));
    await db.prepare("DELETE FROM cup_competitions WHERE id = ?").bind(cupId).run().catch((e) => logger.warn({ module: M }, "cleanup cup competition", e));
    throw new Error("createCup: neúplné vytvoření poháru — zrušeno (viz error log)");
  }

  logger.info({ module: M }, `cup created s=${seasonNumber} teams=${allTeams.length} (${participants.length} seedů + ${weakTeams.length} slabých) rounds=${totalRounds}`);
  return { created: true, cupId, teams: allTeams.length, rounds: totalRounds };
}

/**
 * Lazy generování kádrů generovaných pohárových týmů (velkokluby i slabé předkolové soupeře).
 * Bez kádru spadne zápas do silové simulace — jen skóre, žádný průběh, komentář ani statistiky.
 * Chunkovaně, ať se nenarazí na limit subrequestů.
 *
 * `onlyTeamIds` omezí generování na konkrétní týmy (soupeři právě simulovaného chunku) —
 * díky tomu dostane kádr každý, na koho přijde řada, i když je pohárové pole velké.
 * Vrátí počet klubů, jimž byl kádr vygenerován.
 */
export async function ensureBigClubSquads(db: D1Database, cupId: string, maxClubs = 8, onlyTeamIds?: string[]): Promise<number> {
  if (onlyTeamIds && onlyTeamIds.length === 0) return 0;
  // Cílené volání (onlyTeamIds = soupeři právě simulované dávky) NEfiltruje na eliminated_round:
  // ty týmy mají zápas na programu, takže kádr potřebují bez ohledu na to, co je u nich zapsáno.
  // Kdyby se eliminated_round rozešel s pavoukem (jako po staré chybě s duplicitními koly),
  // filtr by tiše zablokoval generování a zápas by se odehrál bez průběhu.
  // Warm-up (bez onlyTeamIds) naopak vyřazené přeskakuje, ať negeneruje kádry nadarmo.
  const filter = onlyTeamIds
    ? ` AND ct.id IN (${onlyTeamIds.map(() => "?").join(",")})`
    : " AND ct.eliminated_round IS NULL";
  const clubs = await db.prepare(
    `SELECT ct.id, ct.name, ct.strength FROM cup_teams ct
     WHERE ct.cup_id = ? AND ct.team_id IS NULL${filter}
       AND NOT EXISTS (SELECT 1 FROM cup_club_players p WHERE p.cup_team_id = ct.id)
     ORDER BY ct.is_big_club DESC LIMIT ?`
  ).bind(cupId, ...(onlyTeamIds ?? []), maxClubs).all<{ id: string; name: string; strength: number }>()
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

    // Podlaha atributů: pro velkokluby (síla 42-70) drží původních 15/20, ale u předkolových
    // amatérů (síla 4-10) by je vytáhla na trojnásobek. Los je dělá záměrně slabé, aby lidé
    // předkola skoro jistě prošli — proto podlahu srazíme na jejich vlastní sílu.
    const skFloor = Math.min(15, Math.max(4, club.strength));
    const ovFloor = Math.min(20, Math.max(5, club.strength));

    const stmts: D1PreparedStatement[] = [];
    for (const p of squad) {
      const pr = p as unknown as Record<string, number>;
      const sk = (k: string) => Math.max(skFloor, Math.min(95, Math.round((pr[k] ?? 40) + shift)));
      const skills = { speed: sk("speed"), technique: sk("technique"), shooting: sk("shooting"), passing: sk("passing"), heading: sk("heading"), defense: sk("defense"), goalkeeping: sk("goalkeeping"), vision: sk("technique"), creativity: sk("passing"), setPieces: rng.int(20, 70) };
      const physical = { stamina: sk("stamina"), strength: sk("strength"), injuryProneness: pr.injuryProneness ?? 50, height: rng.int(172, 191), weight: rng.int(68, 88), preferredFoot: "right", preferredSide: "center" };
      const personality = { discipline: pr.discipline ?? 50, patriotism: pr.patriotism ?? 50, alcohol: pr.alcohol ?? 30, temper: pr.temper ?? 40, leadership: pr.leadership ?? 40, workRate: pr.workRate ?? 55, aggression: pr.aggression ?? 45, consistency: pr.consistency ?? 55, clutch: pr.clutch ?? 50 };
      const overall = Math.max(ovFloor, Math.min(90, overallOf(pr) + Math.round(shift)));
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

/** Sestaví lineup_data JSON pro detail zápasu (obdoba buildLineupData v match-runner). */
function buildCupLineupData(
  lineup: Array<Record<string, any>>, subs: Array<Record<string, any>>,
  idMap: Map<number, string>, formation: string, tactic: string,
): { starters: any[]; subs: any[]; formation: string; tactic: string; captainId: string | null } {
  const mapPlayer = (p: Record<string, any>) => ({
    id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`,
    position: p.matchPosition ?? p.position, naturalPosition: p.position,
    rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
  });
  return { starters: lineup.map(mapPlayer), subs: subs.map(mapPlayer), formation, tactic, captainId: null };
}

/**
 * Domácí návštěva pohárového zápasu — plná obdoba ligy (fanbase + reputace + forma + dovoz
 * fanoušků autobusem + propagace + spokojenost + počasí, cap kapacitou stadionu). Bez faktorů,
 * které v poháru nedávají smysl (derby dle vztahů manažerů — soupeřem bývá velkoklub).
 * Vrací null pokud domácí není reálný tým (velkoklub).
 */
async function cupHomeMatchContext(db: D1Database, homeRealTeamId: string | null, weather: Weather, cupMatchId: string):
  Promise<{ attendance: number; stadiumName: string | null; pitchCondition: number } | null> {
  if (!homeRealTeamId) return null;
  try {
    const { loadFanbaseAggregate, loadRegionalPopulation, expectedAttendance } = await import("../season/fanbase-helpers");
    const { weatherAttendanceFactor } = await import("../season/weather");
    const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
    const { BUS_CONFIG } = await import("../season/fanbase-config");

    const team = await db.prepare(
      "SELECT t.reputation, v.population FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
    ).bind(homeRealTeamId).first<{ reputation: number; population: number }>();
    const rep = team?.reputation ?? 50;

    const { agg: fanbaseAgg } = await loadFanbaseAggregate(db, homeRealTeamId);
    const { regionalPopulation } = await loadRegionalPopulation(db, homeRealTeamId);
    const popBase = expectedAttendance(fanbaseAgg, team?.population ?? 500, regionalPopulation).total;

    const repBonus = Math.round(popBase * (rep / 100) * 0.3);
    const wins = await db.prepare(
      `SELECT COUNT(*) as w FROM (SELECT CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END as win
        FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5) WHERE win = 1`
    ).bind(homeRealTeamId, homeRealTeamId, homeRealTeamId, homeRealTeamId).first<{ w: number }>().catch((e) => { logger.warn({ module: M }, "cup home recent wins", e); return { w: 0 }; });
    const formBonus = Math.round((wins?.w ?? 0) * popBase * 0.08);

    const fansSatRow = await db.prepare("SELECT satisfaction FROM fans WHERE team_id = ?").bind(homeRealTeamId).first<{ satisfaction: number }>().catch((e) => { logger.warn({ module: M }, "cup home fans satisfaction", e); return null; });
    const satMul = 0.75 + (Math.max(0, Math.min(100, fansSatRow?.satisfaction ?? 50)) / 100) * 0.5;

    const stadiumRow = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(homeRealTeamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: M }, "cup home stadium", e); return null; });
    const facilities = stadiumRow ?? {};
    const fx = calculateFacilityEffects(facilities as any);
    const stadiumCapacity = ((stadiumRow?.capacity as number) ?? 200) + fx.capacityBonus;
    const stadiumName = (await db.prepare("SELECT stadium_name FROM teams WHERE id = ?").bind(homeRealTeamId).first<{ stadium_name: string | null }>().catch((e) => { logger.warn({ module: M }, "cup home stadium name", e); return null; }))?.stadium_name ?? null;

    // Dovoz fanoušků — objednané autobusy z okolních obcí (stejně jako u ligy)
    const busRows = await db.prepare(
      "SELECT bus_size FROM bus_subsidies WHERE team_id = ? AND match_id = ?"
    ).bind(homeRealTeamId, cupMatchId).all<{ bus_size: keyof typeof BUS_CONFIG.SIZES }>()
      .catch((e) => { logger.warn({ module: M }, "cup bus subsidies for attendance", e); return { results: [] as Array<{ bus_size: keyof typeof BUS_CONFIG.SIZES }> }; });
    let busDropIn = 0;
    for (const b of busRows.results) {
      const cfg = BUS_CONFIG.SIZES[b.bus_size];
      if (cfg) busDropIn += Math.round(cfg.attendeesMin + Math.random() * (cfg.attendeesMax - cfg.attendeesMin));
    }

    // Propagace zápasu — klub zaplatil plakáty a rozhlas, přijde víc lidí
    const promoRow = await db.prepare("SELECT promotion_boost FROM cup_matches WHERE id = ?")
      .bind(cupMatchId).first<{ promotion_boost: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "cup promotion boost", e); return null; });
    const promoBoost = promoRow?.promotion_boost ?? 1.0;

    const wf = weatherAttendanceFactor(weather);
    const shieldedWeather = wf + (1 - wf) * fx.weatherAttendanceShield;
    const rawAttendance = Math.max(8, popBase + repBonus + formBonus + busDropIn + Math.round(rng2(homeRealTeamId) * 10 - 5));
    const attendance = Math.min(Math.round(rawAttendance * (1 + fx.attendanceBonus) * satMul * shieldedWeather * promoBoost), stadiumCapacity);
    return { attendance, stadiumName, pitchCondition: (stadiumRow?.pitch_condition as number) ?? 50 };
  } catch (e) {
    logger.warn({ module: M }, "cup home match context", e);
    return null;
  }
}

/**
 * Pozápasový dopad domácího pohárového zápasu na fanouškovskou základnu — stejný balík
 * jako u ligy (match-runner): konverze cestujících z autobusů na stálé fanoušky dané obce
 * a konverze z propagace. Volá se jen pro domácí reálný tým.
 */
async function applyCupHomeFanbase(db: D1Database, homeRealTeamId: string, cupMatchId: string, attendance: number): Promise<void> {
  try {
    const { applyBusConversion, applyPromoConversion } = await import("../season/fanbase-helpers");
    const busResult = await applyBusConversion(db, homeRealTeamId, cupMatchId);
    const promoRow = await db.prepare("SELECT promotion_boost FROM cup_matches WHERE id = ?")
      .bind(cupMatchId).first<{ promotion_boost: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "cup promo boost for conversion", e); return null; });
    const promoResult = await applyPromoConversion(db, homeRealTeamId, (promoRow?.promotion_boost ?? 1.0) > 1.0, attendance);
    logger.info(
      { module: M, teamId: homeRealTeamId, matchId: cupMatchId },
      `cup fanbase post-match: bus drop-in=${busResult.totalDropIn} converted=${busResult.totalConverted} promo+${promoResult.converted} -${promoResult.lost}`,
    );
  } catch (e) {
    logger.warn({ module: M }, "cup fanbase post-match update", e);
  }
}

/** Deterministický malý rozptyl návštěvy z team id (nemáme tu Math.random ve všech cestách). */
function rng2(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * Plnohodnotná simulace pohárového zápasu — reálný zápasový engine (sestavy, morálka, kondice,
 * absence, počasí) + uložení hráčských statistik do match_player_stats + detail zápasu
 * (průběh/sestavy/ratingy) a domácí tržby (návštěva, vstupné, občerstvení) jako u ligy.
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
  // Sestava: preferuj tu uloženou přímo pro TENTO pohárový zápas (lineups.calendar_id = cupMatchId,
  // ukládá ji FE stránka Sestavy), fallback na poslední uloženou sestavu týmu (zpětná kompatibilita
  // — kdo si pohár explicitně nenastaví, hraje v poslední použité sestavě).
  const savedLineup = async (rid: string | null) => {
    if (!rid) return null;
    const perMatch = await db.prepare("SELECT players_data, formation, tactic FROM lineups WHERE team_id = ? AND calendar_id = ?").bind(rid, cupMatchId).first<{ players_data: string; formation: string; tactic: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "cup per-match lineup", e); return null; });
    if (perMatch) return perMatch;
    return await db.prepare("SELECT players_data, formation, tactic FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 1").bind(rid).first<{ players_data: string; formation: string; tactic: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "cup saved lineup", e); return null; });
  };
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

  // Bonus trenéra (taktika → přihrávky a obrana, motivace → morálka). Do teď ho uměla
  // jen liga, takže stejný trenér byl v poháru k ničemu. Jen reálné týmy — pohárové
  // kluby bez klubu v lize trenéra nemají.
  const { applyManagerMatchBonus } = await import("../season/manager-match-bonus");
  if (homeReal) await applyManagerMatchBonus(db, homeReal, [homeLineup, homeSubs]);
  if (awayReal) await applyManagerMatchBonus(db, awayReal, [awayLineup, awaySubs]);
  if (homeLineup.length < 7 || awayLineup.length < 7) {
    logger.warn({ module: M }, `cup tie ${cupMatchId}: málo hráčů (home ${homeLineup.length}, away ${awayLineup.length}) → silová simulace bez statistik (kádr velkoklubu nebo tenký reálný kádr)`);
    const fb = simMatch(strengthOf.get(homeCupTeamId) ?? 30, strengthOf.get(awayCupTeamId) ?? 30, rng);
    // I silová simulace (slabý předkolový soupeř): domácí zápas → návštěva + tržby pro domácí
    // reálný tým. Průběh/sestavy nejsou (bez plného enginu), ale výsledek + návštěva se uloží.
    try {
      const ctx = await cupHomeMatchContext(db, homeReal, weather, cupMatchId);
      await db.prepare(
        "UPDATE cup_matches SET attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?, simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?"
      ).bind(ctx?.attendance ?? null, ctx?.stadiumName ?? null, ctx?.pitchCondition ?? null, weather, cupMatchId).run()
        .catch((e) => logger.warn({ module: M }, "save cup fallback detail", e));
      if (homeReal && ctx) {
        const { processMatchDayFinances } = await import("../season/finance-processor");
        const homeResult = fb.hg > fb.ag ? "win" : fb.hg < fb.ag ? "loss" : "draw";
        const gd = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(homeReal).first<{ game_date: string | null }>().catch((e) => { logger.warn({ module: M }, "cup fallback game_date", e); return null; }))?.game_date ?? new Date().toISOString();
        await processMatchDayFinances(db, homeReal, cupMatchId, true, homeResult, ctx.attendance, gd, strengthOf.get(awayCupTeamId) ?? 50, false, weather)
          .catch((e) => logger.warn({ module: M }, "cup fallback finances", e));
        await applyCupHomeFanbase(db, homeReal, cupMatchId, ctx.attendance);
      }
    } catch (e) { logger.warn({ module: M }, "cup fallback tržby", e); }
    // Paušální únava + morálka reálného týmu i u silové simulace (odehráli zápas, jen bez
    // per-hráč modelu). Bez tohohle by pohár proti slabým soupeřům byl "zadarmo" (žádná únava).
    try {
      const homeWon = fb.hg > fb.ag, draw = fb.hg === fb.ag;
      const applyFatigue = async (realTeam: string | null, lineup: typeof homeLineup, idMap: Map<number, string>, teamWon: boolean) => {
        if (!realTeam || lineup.length === 0) return;
        const moraleDelta = draw ? 0 : teamWon ? 3 : -3;
        const stmts: D1PreparedStatement[] = [];
        for (const p of lineup.slice(0, 11)) {
          const dbId = idMap.get(p.id);
          if (!dbId) continue;
          const newCond = Math.max(30, Math.round(((p as any).condition ?? 80) - 9));
          const newMorale = Math.max(0, Math.min(100, Math.round(((p as any).morale ?? 50) + moraleDelta)));
          stmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?").bind(newCond, newMorale, dbId));
        }
        if (stmts.length > 0) await db.batch(stmts).catch((e) => logger.warn({ module: M }, "cup fallback fatigue batch", e));
      };
      await applyFatigue(homeReal, homeLineup, homeBuild.idMap, homeWon);
      await applyFatigue(awayReal, awayLineup, awayBuild.idMap, !homeWon && !draw);
    } catch (e) { logger.warn({ module: M }, "cup fallback kondice/morálka", e); }
    return { ...fb, hp: fb.hp ?? 0, ap: fb.ap ?? 0 };
  }
  const homePre = homeLineup.map((p) => ({ ...p }));
  const awayPre = awayLineup.map((p) => ({ ...p }));

  // Pohár dřív jel natvrdo na "balanced" a nulovou sehranost a vztahy v něm neexistovaly
  // vůbec — z pohledu chemie i taktiky byl neviditelný. Teď se chová jako ligový zápas.
  const { injectRelationships } = await import("../multiplayer/inject-relations");
  await injectRelationships(db, [
    { players: [...homeLineup, ...homeSubs], idMap: homeBuild.idMap },
    { players: [...awayLineup, ...awaySubs], idMap: awayBuild.idMap },
  ]);

  const { readFamiliarity, applyMatchResult } = await import("../engine/chemistry");
  const homeFormation = homeLR?.formation ?? "4-4-2";
  const awayFormation = awayLR?.formation ?? "4-4-2";
  const homeTactic = (homeLR?.tactic as TeamSetup["tactic"]) ?? "balanced";
  const awayTactic = (awayLR?.tactic as TeamSetup["tactic"]) ?? "balanced";
  const homeFam = homeReal ? await readFamiliarity(db, homeReal) : { tactic: {}, formation: {} };
  const awayFam = awayReal ? await readFamiliarity(db, awayReal) : { tactic: {}, formation: {} };

  const homeSetup: TeamSetup = { teamId: 1, teamName: "Domácí", lineup: homeLineup, subs: homeSubs, tactic: homeTactic, formation: homeFormation, formationFamiliarity: homeFam.formation[homeFormation] ?? 0 };
  const awaySetup: TeamSetup = { teamId: 2, teamName: "Hosté", lineup: awayLineup, subs: awaySubs, tactic: awayTactic, formation: awayFormation, formationFamiliarity: awayFam.formation[awayFormation] ?? 0 };
  const result = simulateMatch(rng, { home: homeSetup, away: awaySetup, weather, isHomeAdvantage: false });

  // Odehraný pohár se počítá do sehranosti stejně jako liga
  if (homeReal) await applyMatchResult(db, homeReal, homeTactic, homeFormation).catch((e) => logger.warn({ module: M }, "cup familiarity home", e));
  if (awayReal) await applyMatchResult(db, awayReal, awayTactic, awayFormation).catch((e) => logger.warn({ module: M }, "cup familiarity away", e));

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

  // ── Kondice + morálka hráčů po zápase + suspendace (červená karta) — jen reálné týmy.
  // Velkoklubové kádry jsou v cup_club_players (ne players), takže se do players nezapisují.
  try {
    // Suspendace za červenou kartu (jako liga: red card = ban na 1 zápas)
    const susStmts: D1PreparedStatement[] = [];
    for (const u of homeUpdates) if (u.redCards > 0 && homeReal) susStmts.push(db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId));
    for (const u of awayUpdates) if (u.redCards > 0 && awayReal) susStmts.push(db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId));
    if (susStmts.length > 0) await db.batch(susStmts).catch((e) => logger.warn({ module: M }, "cup suspensions", e));

    // Kondice + morálka zpět do players (post-sim hodnoty z result.homeLineup/awayLineup)
    const { logConditionStmt } = await import("../lib/condition-log");
    const preSimCondById = new Map<number, number>();
    for (const p of [...homePre, ...awayPre]) preSimCondById.set(p.id, p.condition);
    const condStmts: D1PreparedStatement[] = [];
    const homePost = result.homeLineup ?? [];
    for (const p of [...homePost, ...(result.awayLineup ?? [])]) {
      const dbId = fullIdMap.get(p.id);
      if (!dbId) continue;
      const realTeam = homePost.includes(p) ? homeReal : awayReal;
      if (!realTeam) continue; // velkoklub → není v players
      condStmts.push(db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?").bind(Math.round(p.condition), Math.round(p.morale), dbId));
      const oldCond = preSimCondById.get(p.id);
      if (oldCond != null && Math.round(oldCond) !== Math.round(p.condition)) {
        condStmts.push(logConditionStmt(db, dbId, realTeam, oldCond, p.condition, "match", `Pohár (${result.homeScore}:${result.awayScore})`));
      }
    }
    if (condStmts.length > 0) await db.batch(condStmts).catch((e) => logger.warn({ module: M }, "cup condition/morale persist", e));
  } catch (e) {
    logger.warn({ module: M }, "cup kondice/morálka/suspendace", e);
  }

  // ── Zkušenost + zlepšení dovedností za odehrané minuty — parita s ligou.
  // Pohár je ostřejší než liga (importance 1.2). Velkoklubové kádry se přeskakují,
  // nejsou v tabulce players.
  try {
    const expRng = createRng(cupMatchId.charCodeAt(1) * 7919 + result.homeScore);
    for (const [engineId, pm] of Object.entries(result.playerMinutes)) {
      const dbId = fullIdMap.get(Number(engineId));
      if (!dbId) continue;
      const isHome = homeBuild.idMap.has(Number(engineId));
      if (!(isHome ? homeReal : awayReal)) continue;

      const minutes = ((pm as { left?: number; entered: number }).left ?? 90) - (pm as { entered: number }).entered;
      if (minutes < 15) continue;

      const row = await db.prepare("SELECT age, skills, position FROM players WHERE id = ?")
        .bind(dbId).first<{ age: number; skills: string; position: string }>()
        .catch((e) => { logger.warn({ module: M }, "load player for cup experience", e); return null; });
      if (!row) continue;

      const skills = JSON.parse(row.skills);
      let changed = false;

      const currentExp = skills.experience ?? 0;
      if (currentExp < 100 && expRng.random() < experienceGainChance(minutes, "cup", row.age)) {
        skills.experience = currentExp + 1;
        changed = true;
      }

      // Zlepšení dovednosti — stejné šance jako v lize
      const ageMod = row.age < 22 ? 0.08 : row.age < 26 ? 0.05 : row.age < 30 ? 0.03 : 0.01;
      if (expRng.random() < ageMod * (minutes / 90)) {
        const posSkills: Record<string, string[]> = {
          GK: ["goalkeeping"], DEF: ["defense", "heading", "strength"],
          MID: ["passing", "vision", "technique"], FWD: ["shooting", "speed", "technique"],
        };
        const attr = expRng.pick(posSkills[row.position] ?? ["technique"]);
        const current = skills[attr] ?? 50;
        if (current < 85) {
          skills[attr] = current + 1;
          changed = true;
          await db.prepare(
            "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'cup', ?)"
          ).bind(dbId, isHome ? homeCupTeamId : awayCupTeamId, attr, current, current + 1, new Date().toISOString())
            .run().catch((e) => logger.warn({ module: M }, "cup training log", e));
        }
      }

      if (changed) {
        await db.prepare("UPDATE players SET skills = ? WHERE id = ?")
          .bind(JSON.stringify(skills), dbId).run()
          .catch((e) => logger.warn({ module: M }, "cup skills persist", e));
      }
    }
  } catch (e) {
    logger.warn({ module: M }, "cup zkušenost/zlepšení", e);
  }

  // ── Detail zápasu (průběh, sestavy, ratingy, počasí) + domácí tržby — parita s ligovým zápasem ──
  try {
    const homeLineupData = buildCupLineupData(homePre, homeSubs, homeBuild.idMap, homeFormation, homeTactic);
    const awayLineupData = buildCupLineupData(awayPre, awaySubs, awayBuild.idMap, awayFormation, awayTactic);
    const ctx = await cupHomeMatchContext(db, homeReal, weather, cupMatchId);

    // Komentář (dějiště = okres domácího reálného týmu; velkoklub bez okresu)
    const nameRows = await db.prepare("SELECT id, name FROM cup_teams WHERE id = ? OR id = ?").bind(homeCupTeamId, awayCupTeamId).all<{ id: string; name: string }>()
      .catch((e) => { logger.warn({ module: M }, "cup team names for commentary", e); return { results: [] as { id: string; name: string }[] }; });
    const nameOf = new Map(nameRows.results.map((n) => [n.id, n.name]));
    const district = homeReal
      ? (await db.prepare("SELECT v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?").bind(homeReal).first<{ district: string }>().catch((e) => { logger.warn({ module: M }, "cup district", e); return null; }))?.district
      : undefined;
    const { generateMatchCommentary } = await import("../engine/commentary");
    const commentary = generateMatchCommentary(rng, result.events, nameOf.get(homeCupTeamId) ?? "Domácí", nameOf.get(awayCupTeamId) ?? "Hosté", district ?? undefined);

    const matchAbsences = [
      ...((homeBuild.absentNames ?? []) as any[]).map((a) => ({ ...a, teamId: homeCupTeamId })),
      ...((awayBuild.absentNames ?? []) as any[]).map((a) => ({ ...a, teamId: awayCupTeamId })),
    ];

    await db.prepare(
      `UPDATE cup_matches SET events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?, absences = ?, player_ratings = ?, simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`
    ).bind(
      JSON.stringify(result.events), JSON.stringify(commentary), ctx?.attendance ?? null, ctx?.stadiumName ?? null, ctx?.pitchCondition ?? null, weather,
      JSON.stringify(homeLineupData), JSON.stringify(awayLineupData), matchAbsences.length > 0 ? JSON.stringify(matchAbsences) : null, JSON.stringify(ratings), cupMatchId,
    ).run().catch((e) => logger.warn({ module: M }, "save cup match detail", e));

    // Zranění ze zápasu — jen pro reálné týmy (velkoklubové kádry nejsou v players, FK by spadl)
    const injuryTypeMap: Record<string, string> = {
      "natažený sval": "sval", "naražené žebro": "zebra", "podvrtnutý kotník": "kotnik",
      "bolest kolene": "koleno", "bolavá záda": "zada", "naražená hlava": "hlava",
      "pohmožděný palec": "obecne", "přetržený achilov": "achilovka",
    };
    const injuryStmts: D1PreparedStatement[] = [];
    for (const event of result.events) {
      if (event.type !== "injury") continue;
      const isHome = event.teamId === 1;
      const realTeam = isHome ? homeReal : awayReal;
      if (!realTeam) continue;
      const realPlayerId = (isHome ? homeBuild.idMap : awayBuild.idMap).get(event.playerId);
      if (!realPlayerId) continue;
      const days = Math.max(2, 3 + Math.floor(rng.random() * 18));
      const injType = injuryTypeMap[event.detail ?? ""] ?? "obecne";
      const severity = days <= 7 ? "lehke" : days <= 14 ? "stredni" : "tezke";
      injuryStmts.push(db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), realPlayerId, realTeam, injType, event.detail ?? "zranění", severity, days, days, cupMatchId));
    }
    if (injuryStmts.length > 0) await db.batch(injuryStmts).catch((e) => logger.warn({ module: M }, "persist cup injuries", e));

    // Domácí tržby (vstupné + občerstvení) — jen pokud domácí je reálný tým se stadionem
    if (homeReal && ctx) {
      const { processMatchDayFinances } = await import("../season/finance-processor");
      const homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
      const gd = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(homeReal).first<{ game_date: string | null }>().catch((e) => { logger.warn({ module: M }, "cup home game_date", e); return null; }))?.game_date ?? new Date().toISOString();
      await processMatchDayFinances(db, homeReal, cupMatchId, true, homeResult, ctx.attendance, gd, strengthOf.get(awayCupTeamId) ?? 50, false, weather)
        .catch((e) => logger.warn({ module: M }, "cup home matchday finances", e));
      await applyCupHomeFanbase(db, homeReal, cupMatchId, ctx.attendance);
    }
  } catch (e) {
    logger.warn({ module: M }, "cup match detail/finances", e);
  }

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

  // Chunk: kolik zápasů se z kola vezme do jedné invokace. Drahý je jen plný engine, a ten
  // potřebují pouze zápasy, kde hraje něčí tým — v předkolech je to menšina (na testu 27 %).
  // Souboje dvou generovaných klubů se dopočítají silově za pár dotazů, takže jich zvládneme
  // v jedné dávce mnohem víc a kolo se dohraje řádově rychleji.
  const CUP_CHUNK = 48;
  // Kolik zápasů z dávky smí projít plným enginem (sestavy, události, komentář, statistiky).
  const FULL_ENGINE_BUDGET = 12;
  // Po kolika minutách se claim nedokončeného zápasu považuje za mrtvý (spadlá invokace).
  const CLAIM_STALE_MIN = 15;
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

  // Kádry soupeřů TOHOTO chunku — bez kádru spadne zápas do silové simulace (holé skóre bez
  // průběhu, komentáře i statistik). Generujeme cíleně pro ty, na které právě přišla řada,
  // takže na kádr nikdo nečeká přes celé pohárové pole. Rozpočet drží invokaci pod limitem;
  // zápas, na jehož soupeře rozpočet nezbyl, se v tomto chunku přeskočí a přijde na řadu příště.
  // Rozpočet pokrývá celý chunk (12 zápasů = max 24 soupeřů), takže se běžně na nic nečeká.
  const SQUAD_BUDGET = 24;
  // Kádr potřebují jen soupeři zápasů, které opravdu půjdou plným enginem — tedy ty, kde hraje
  // něčí tým, a jen do výše rozpočtu enginu. Generovat ho pro souboje dvou AI klubů by byla
  // čistá ztráta času i místa.
  const chunkTeamIds = [...new Set(
    matchesRes.results
      .filter((m) => !!m.home_cup_team_id && !!m.away_cup_team_id
        && (!!realTeamOf.get(m.home_cup_team_id) || !!realTeamOf.get(m.away_cup_team_id)))
      .slice(0, FULL_ENGINE_BUDGET)
      .flatMap((m) => [m.home_cup_team_id, m.away_cup_team_id])
      .filter((x): x is string => !!x),
  )].filter((id) => realTeamOf.get(id) === null); // reálné týmy mají kádr v players
  const stillMissing = new Set<string>();
  if (chunkTeamIds.length > 0) {
    const generated = await ensureBigClubSquads(db, cupId, SQUAD_BUDGET, chunkTeamIds)
      .catch((e) => { logger.warn({ module: M }, "ensure squads for chunk", e); return 0; });
    if (generated > 0) logger.info({ module: M }, `cup: dogenerováno ${generated} kádrů pro kolo ${round}`);

    const miss = await db.prepare(
      `SELECT ct.id FROM cup_teams ct WHERE ct.id IN (${chunkTeamIds.map(() => "?").join(",")})
         AND NOT EXISTS (SELECT 1 FROM cup_club_players p WHERE p.cup_team_id = ct.id)`,
    ).bind(...chunkTeamIds).all<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, "recheck missing squads", e); return { results: [] as { id: string }[] }; });

    // Odložit zápas smí jen ten, komu kádr teprve vzniká (rozpočet došel). Když se nevygeneroval
    // ani jeden kádr, generování selhává — pak zápas NEODKLÁDÁME a pustíme ho do silové simulace.
    // Jinak by kolo uvázlo a hráči by zase nevěděli, kdy hrají dál.
    if (generated > 0) {
      for (const r of miss.results) stillMissing.add(r.id);
    } else if (miss.results.length > 0) {
      logger.warn({ module: M }, `cup: ${miss.results.length} soupeřů bez kádru a generování nic nevrátilo → silová simulace (bez průběhu)`);
    }
  }

  const rng = createRng((cupId.charCodeAt(0) + round * 7919) >>> 0);
  const winners: { pos: number; teamId: string }[] = [];
  let fullUsed = 0; // kolik zápasů už v této invokaci prošlo plným enginem

  for (const m of matchesRes.results) {
    if ((m.home_cup_team_id && stillMissing.has(m.home_cup_team_id)) || (m.away_cup_team_id && stillMissing.has(m.away_cup_team_id))) {
      logger.info({ module: M }, `cup tie ${m.id}: čeká na dogenerování kádru soupeře, odloženo na další dávku`);
      continue;
    }
    if (!m.home_cup_team_id || !m.away_cup_team_id) continue;
    // Rozpočet plného enginu je vyčerpán → zápas, který ho potřebuje, počká na další dávku.
    // Radši ať se odehraje později se vším všudy, než hned jako holé skóre.
    if (fullUsed >= FULL_ENGINE_BUDGET
        && (!!realTeamOf.get(m.home_cup_team_id) || !!realTeamOf.get(m.away_cup_team_id))) {
      continue;
    }

    // Claim — zápas smí odsimulovat jen jedna invokace. Bez toho dvě souběžné invokace
    // (cron + advance-day + admin endpoint) odsimulují tentýž zápas s různými výsledky,
    // druhá přepíše vítěze první, a do dalšího kola postoupí tým, který prohrál.
    // Mrtvý claim (spadlá invokace) se po CLAIM_STALE_MIN minutách uvolní sám.
    const claim = await db.prepare(
      `UPDATE cup_matches SET claimed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ? AND status = 'scheduled'
         AND (claimed_at IS NULL OR claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ','now',?))`,
    ).bind(m.id, `-${CLAIM_STALE_MIN} minutes`).run()
      .catch((e) => { logger.warn({ module: M }, "claim cup match", e); return null; });
    if ((claim?.meta?.changes ?? 0) !== 1) {
      logger.info({ module: M }, `cup tie ${m.id}: zabrala jiná invokace, přeskakuji`);
      continue;
    }

    const cupWeathers: Weather[] = ["sunny", "cloudy", "cloudy", "rain", "wind", "snow"];
    const tieWeather = cupWeathers[rng.int(0, cupWeathers.length - 1)];
    // Zápas dvou generovaných klubů nemá reálné hráče, domácí tržby ani diváka mezi manažery —
    // stačí silový výsledek. Plný engine si šetříme pro zápasy, kde hraje něčí tým.
    const isWatched = !!realTeamOf.get(m.home_cup_team_id) || !!realTeamOf.get(m.away_cup_team_id);
    const r = isWatched
      ? await simulateCupTie(db, rng, m.id, m.home_cup_team_id, m.away_cup_team_id, realTeamOf, strengthOf, tieWeather)
      : simMatch(strengthOf.get(m.home_cup_team_id) ?? 30, strengthOf.get(m.away_cup_team_id) ?? 30, rng);
    if (isWatched) fullUsed++;
    const winnerId = r.homeWin ? m.home_cup_team_id : m.away_cup_team_id;
    const loserId = r.homeWin ? m.away_cup_team_id : m.home_cup_team_id;
    await db.prepare("UPDATE cup_matches SET home_score=?, away_score=?, home_pens=?, away_pens=?, winner_cup_team_id=?, status='simulated', upset=? WHERE id=?")
      .bind(r.hg, r.ag, r.hp, r.ap, winnerId, r.upset ? 1 : 0, m.id).run()
      .catch((e) => logger.warn({ module: M }, "update cup match", e));
    await db.prepare("UPDATE cup_teams SET eliminated_round = ? WHERE id = ?").bind(round, loserId).run()
      .catch((e) => logger.warn({ module: M }, "eliminate", e));
    winners.push({ pos: m.bracket_pos, teamId: winnerId });

    // Odměna reálnému vítězi (velkokluby nemají rozpočet). Idempotence přes reference_id —
    // když zápas zůstane 'scheduled' (status-flip selhal) a kolo se přepočítá, odměna/reputace
    // se NEpřipíšou podruhé.
    const realWinner = realTeamOf.get(winnerId);
    const cupRefId = `cup-${cupId}-r${round}-${winnerId}`;
    const alreadyPaid = realWinner
      ? await db.prepare("SELECT 1 FROM transactions WHERE reference_id = ?").bind(cupRefId).first().catch((e) => { logger.warn({ module: M }, "cup prize gate", e); return null; })
      : null;
    if (realWinner && !alreadyPaid) {
      await recordTransaction(db, realWinner, "cup_prize", prize, `Pohár — postup (${roundLabel})`, gameDate, cupRefId)
        .catch((e) => logger.warn({ module: M }, "cup prize", e));
      if (repBonus.manager > 0) {
        const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
        await applyManagerAttrDelta(
          db, realWinner, "reputation", repBonus.manager, "cup",
          `Postup v poháru — ${roundLabel}`,
          { referenceId: `${cupRefId}-mgr-rep`, gameDate },
        );
      }
      if (repBonus.team > 0) {
        const { applyReputationDelta } = await import("../lib/reputation");
        await applyReputationDelta(
          db, realWinner, repBonus.team, "cup",
          `Postup v poháru — ${roundLabel}`,
          { referenceId: `${cupRefId}-rep`, gameDate },
        );
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

  // Finále hotové? Guard na status — pohár smí ukončit jen jedna invokace.
  if (round >= cup.total_rounds) {
    const champ = winnersAll[0]?.teamId ?? null;
    const fin = await db.prepare("UPDATE cup_competitions SET status='finished', winner_team_id=? WHERE id=? AND status='active'").bind(champ, cupId).run()
      .catch((e) => { logger.warn({ module: M }, "finish cup", e); return null; });
    if ((fin?.meta?.changes ?? 0) !== 1) return { ok: true, round };
    return { ok: true, round, finished: true, winner: champ ?? undefined };
  }

  // Zámek uzavření kola: další kolo smí vygenerovat jen ta invokace, které se povede
  // posunout current_round. Souběžná invokace dostane changes=0 a nic negeneruje —
  // bez toho obě uvidí remain=0 a vloží další kolo dvakrát.
  const bump = await db.prepare("UPDATE cup_competitions SET current_round = ? WHERE id = ? AND current_round = ?")
    .bind(round + 1, cupId, round).run()
    .catch((e) => { logger.warn({ module: M }, "bump round", e); return null; });
  if ((bump?.meta?.changes ?? 0) !== 1) {
    logger.info({ module: M }, `cup ${cupId}: kolo ${round} uzavřela jiná invokace`);
    return { ok: true, round };
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
    // OR IGNORE + unique index na (cup_id, round, bracket_pos): opakovaný pokus (po částečně
    // selhaném batchi) doplní jen chybějící pozice místo aby spadl na duplicitě.
    nextStmts.push(db.prepare(
      "INSERT OR IGNORE INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')",
    ).bind(crypto.randomUUID(), cupId, round + 1, np, slot.home ?? null, slot.away ?? null, nextDate));
  }
  let inserted = true;
  for (let i = 0; i < nextStmts.length; i += 40) {
    const ok = await db.batch(nextStmts.slice(i, i + 40)).then(() => true)
      .catch((e) => { logger.error({ module: M }, "insert next round", e); return false; });
    if (!ok) inserted = false;
  }
  // Insert selhal → vrátit current_round zpět, jinak by kolo zůstalo prázdné a pohár
  // by se zasekl (maybeAdvanceCup nemá co simulovat a nikdy se k dogenerování nevrátí).
  if (!inserted) {
    await db.prepare("UPDATE cup_competitions SET current_round = ? WHERE id = ? AND current_round = ?")
      .bind(round, cupId, round + 1).run()
      .catch((e) => logger.error({ module: M }, "rollback bump round", e));
    return { ok: false, round };
  }

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

/**
 * Zpětný dopočet návštěvy + tržeb pro už odehrané domácí pohárové zápasy reálných týmů.
 * Idempotentní: zpracuje jen zápasy, které ještě nemají uloženou návštěvu (attendance IS NULL).
 * Průběh/sestavy NEdoplňuje (ta data neexistují a přesimulovat by změnilo výsledky) — jen
 * návštěvu a finance (vstupné + občerstvení − rozhodčí) pro domácí reálný tým.
 */
export async function backfillCupFinances(db: D1Database): Promise<{ processed: number; skipped: number }> {
  const rows = await db.prepare(
    `SELECT cm.id, cm.home_score, cm.away_score, cm.weather, cm.scheduled_at,
       hc.team_id AS home_real, ac.strength AS away_strength
     FROM cup_matches cm
     JOIN cup_teams hc ON hc.id = cm.home_cup_team_id
     JOIN cup_teams ac ON ac.id = cm.away_cup_team_id
     JOIN cup_competitions cc ON cc.id = cm.cup_id AND cc.status = 'active'
     WHERE cm.status = 'simulated' AND cm.attendance IS NULL AND hc.team_id IS NOT NULL AND cm.home_score IS NOT NULL`
  ).all<{ id: string; home_score: number; away_score: number; weather: string | null; scheduled_at: string | null; home_real: string; away_strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "backfill: load cup matches", e); return { results: [] as any[] }; });

  const { processMatchDayFinances } = await import("../season/finance-processor");
  let processed = 0, skipped = 0;
  for (const m of rows.results) {
    const weather = (m.weather ?? "cloudy") as Weather;
    const ctx = await cupHomeMatchContext(db, m.home_real, weather, m.id);
    if (!ctx) { skipped++; continue; }
    // Návštěvu ulož PŘED financemi — attendance IS NULL guard tak brání dvojitému připsání.
    await db.prepare("UPDATE cup_matches SET attendance = ?, stadium_name = ?, pitch_condition = ? WHERE id = ? AND attendance IS NULL")
      .bind(ctx.attendance, ctx.stadiumName, ctx.pitchCondition, m.id).run()
      .catch((e) => logger.warn({ module: M }, "backfill: save attendance", e));
    const homeResult = m.home_score > m.away_score ? "win" : m.home_score < m.away_score ? "loss" : "draw";
    const gd = m.scheduled_at ?? new Date().toISOString();
    await processMatchDayFinances(db, m.home_real, m.id, true, homeResult, ctx.attendance, gd, m.away_strength ?? 50, false, weather)
      .catch((e) => logger.warn({ module: M }, "backfill: finances", e));
    processed++;
  }
  logger.info({ module: M }, `cup backfill finances: ${processed} zpracováno, ${skipped} přeskočeno`);
  return { processed, skipped };
}
