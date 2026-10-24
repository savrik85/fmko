/**
 * Životní cyklus dorostu: kdo z něj odejde a kdo do něj přijde.
 *
 * Do téhle chvíle se s dorostem při přechodu sezóny stalo jen tohle: všem +1 rok a dospívání.
 * Nikdo nikdy neodešel a nikdo nový nepřišel, což je v `season-rollover.ts` i poznamenané
 * („U21 mimo rozsah — vlastní lifecycle"). Důsledek je vidět na věkové pyramidě rozehrané
 * ligy: místo aby byla nejširší dole, je obrácená — 89 z 212 dorostenců má 20 nebo 21 let,
 * zatímco šestnáctiletých je 29. Kádry jen stárnou a kvalita klesá, protože dorůstající
 * ročník nemá odkud přijít.
 *
 * Cyklus proto dělá dvě věci:
 *   1. Kdo dosáhl 22 let, z dorostu odchází. U lidského klubu vždy do áčka (o kádru
 *      rozhoduje manažer), u AI klubu do áčka do stropu, zbytek mezi volné hráče.
 *   2. Kádr se doplní čerstvým ročníkem šestnáctiletých na cílový počet.
 */

import { logger } from "../lib/logger";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import type { VillageInfo } from "../generators/player";
import { levelFromVillageSize } from "../generators/create-player";
import type { Position } from "../league/u21-generator";
import { teoretickyStropHrace } from "../skills/vyhled-hrace";
import {
  U21_PROGRESS_KEY, insertProgressIfMissing, parseCursor, readProgress, writeProgress, type ProgressKey,
} from "./season-progress";

const M = "u21-lifecycle";

/** Od kolika let už hráč do dorostu nepatří. */
export const VEK_ODCHODU_Z_DOROSTU = 22;

/** Kolik hráčů má dorost mít po doplnění. Dva na každý post plus rezerva. */
export const CILOVY_POCET_DOROSTU = 16;

/**
 * Nad kolik hráčů se A-tým AI klubu už nedoplňuje. Přerostlý dorostenec pak jde mezi volné
 * hráče místo do áčka, jinak by kádry AI klubů rok co rok bobtnaly donekonečna. Stejně jako
 * strop kádru při nákupu (`SQUAD_CAP`); dřív tu bylo 24 a platilo i pro lidské kluby, takže
 * Jitona přišla o kluka s talentem 95 (2026-10-20).
 */
export const MAX_KADR_ACKA = 30;

/** Jak má vypadat rozložení postů v dorostu — podle toho se doplňuje, co chybí. */
const CILOVE_POSTY: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 2 };

export interface VysledekCyklu {
  /** Kdo přešel do A-týmu. */
  povyseni: { jmeno: string; vek: number; rating: number }[];
  /** Kdo skončil mezi volnými hráči, protože se do áčka nevešel. */
  propusteni: { jmeno: string; vek: number; rating: number }[];
  /** Kolik nových šestnáctiletých přišlo. */
  prislo: number;
  /** Kolik hráčů má áčko po povýšení (jen lidský klub, kvůli upozornění nad stropem). */
  seniorSquadSize?: number;
}

/**
 * Projede jeden dorost: odchody přerostlých a doplnění nového ročníku.
 *
 * Přerostlí se řadí od nejlepšího — když je v áčku místo jen pro některé, mají ho dostat
 * ti, kdo si ho zaslouží, ne ti, na koho zrovna vyšlo pořadí v databázi.
 */
export async function dorostovyCyklus(
  db: D1Database,
  u21TeamId: string,
  rng: Rng,
): Promise<VysledekCyklu> {
  const vysledek: VysledekCyklu = { povyseni: [], propusteni: [], prislo: 0 };

  const tym = await db.prepare(
    "SELECT parent_team_id, league_id FROM teams WHERE id = ? AND team_type = 'u21'",
  ).bind(u21TeamId).first<{ parent_team_id: string | null; league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load u21 team", e); return null; });
  if (!tym?.parent_team_id) return vysledek;
  const clubId = tym.parent_team_id;
  const owner = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(clubId).first<{ user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: clubId }, "load club owner", e); return null; });
  const humanClub = !!owner?.user_id && owner.user_id !== "ai";

  // ── 1. Odchody ──────────────────────────────────────────────────────────────────
  const overageRows = await db.prepare(
    `SELECT id, first_name, last_name, age, position, overall_rating, skills_max, hidden_talent, loan_from_team_id
       FROM players
      WHERE team_id = ? AND age >= ? AND (status IS NULL OR status = 'active')`,
  ).bind(u21TeamId, VEK_ODCHODU_Z_DOROSTU).all<{
    id: string; first_name: string; last_name: string; age: number; position: string;
    overall_rating: number; skills_max: string | null; hidden_talent: number | null; loan_from_team_id: string | null;
  }>().catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load overage", e); return { results: [] as never[] }; });
  // Když je v áčku AI klubu místo jen pro některé, dostane ho ten s největším potenciálem,
  // ne ten, kdo je zrovna o pár bodů lepší.
  const prerostli = { results: [...overageRows.results].sort((a, b) => youthPotential(b) - youthPotential(a)) };

  // Lidský klub: všichni do áčka, koho pustit, rozhodne manažer.
  let mistoVAcku = humanClub ? Number.POSITIVE_INFINITY : await volneMistoVAcku(db, clubId);

  for (const h of prerostli.results) {
    const jmeno = `${h.first_name} ${h.last_name}`;
    // Hostující hráč patří jinému klubu — ten si ho vyřeší sám, tady se na něj nesahá.
    if (h.loan_from_team_id) continue;

    if (mistoVAcku > 0) {
      const ok = await db.prepare("UPDATE players SET team_id = ? WHERE id = ?")
        .bind(clubId, h.id).run()
        .then(() => true)
        .catch((e) => { logger.warn({ module: M, playerId: h.id }, "promote to senior", e); return false; });
      if (ok) {
        vysledek.povyseni.push({ jmeno, vek: h.age, rating: h.overall_rating });
        mistoVAcku--;
      }
      continue;
    }

    // Áčko je plné — kluk jde mezi volné hráče. `removePlayer` uklidí i cizí klíče
    // (sestava, statistiky, zranění, nabídky, vztahy), jinak by mazání spadlo na FK.
    try {
      const { removePlayer } = await import("../transfers/remove-player");
      const odebran = await removePlayer(db, h.id, "released", { toFreeAgent: true, teamId: u21TeamId });
      if (odebran.ok) vysledek.propusteni.push({ jmeno, vek: h.age, rating: h.overall_rating });
    } catch (e) {
      logger.warn({ module: M, playerId: h.id }, "release overage youth", e);
    }
  }

  if (humanClub && vysledek.povyseni.length > 0) {
    const r = await db.prepare("SELECT COUNT(*) AS pocet FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')")
      .bind(clubId).first<{ pocet: number }>()
      .catch((e) => { logger.warn({ module: M, teamId: clubId }, "count senior squad after promotion", e); return null; });
    vysledek.seniorSquadSize = r?.pocet;
  }

  // ── 2. Nový ročník ──────────────────────────────────────────────────────────────
  const zbyva = await db.prepare(
    `SELECT position, COUNT(*) AS pocet FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active') GROUP BY position`,
  ).bind(u21TeamId).all<{ position: string; pocet: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "count squad", e); return { results: [] as never[] }; });

  const maPost = new Map(zbyva.results.map((r) => [r.position, r.pocet]));
  const celkem = zbyva.results.reduce((s, r) => s + r.pocet, 0);
  const chybi = CILOVY_POCET_DOROSTU - celkem;
  if (chybi <= 0) return vysledek;

  const posty = vyberChybejiciPosty(maPost, chybi);
  const village = await nactiObec(db, clubId);
  if (!village) return vysledek;

  const seasonId = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>().then((r) => r?.id ?? "")
    .catch((e) => { logger.warn({ module: M }, "load season", e); return ""; });

  try {
    const { vygenerujDorostence } = await import("../league/u21-generator");
    const { getDistrictDataFromDB } = await import("../data/districts");
    const { FIRSTNAMES } = await import("../data/czech-names");
    const districtData = await getDistrictDataFromDB(db, village.district ?? village.region_code);
    const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
    const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };
    // Nový ročník je vždycky šestnáctiletý — to je smysl doplňování. Kdyby přicházeli
    // rovnou dvacetiletí, pyramida se nenarovná a jen se posune problém o rok dál.
    vysledek.prislo = await vygenerujDorostence(
      db, u21TeamId, posty, village, levelFromVillageSize(village.size), rng,
      surnameData, firstnameData, seasonId, 16, 16,
    );
  } catch (e) {
    logger.error({ module: M, teamId: u21TeamId }, "generate new youth intake", e);
  }

  return vysledek;
}

/** Potenciál dorostence: teoretický strop z dovedností a talentu, jinak aktuální hodnocení. */
function youthPotential(p: { position: string; overall_rating: number; skills_max: string | null; hidden_talent: number | null }): number {
  if (!p.skills_max) return p.overall_rating;
  try {
    return teoretickyStropHrace(p.position, JSON.parse(p.skills_max), p.hidden_talent ?? 0) ?? p.overall_rating;
  } catch (e) {
    logger.warn({ module: M }, "parse skills_max for youth potential", e);
    return p.overall_rating;
  }
}

/** Kolik hráčů se ještě vejde do A-týmu, než narazí na `MAX_KADR_ACKA`. */
async function volneMistoVAcku(db: D1Database, clubId: string): Promise<number> {
  const r = await db.prepare(
    "SELECT COUNT(*) AS pocet FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(clubId).first<{ pocet: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: clubId }, "count senior squad", e); return null; });
  return Math.max(0, MAX_KADR_ACKA - (r?.pocet ?? MAX_KADR_ACKA));
}

/**
 * Které posty doplnit. Bere ty, kde je proti cílovému rozložení největší díra — aby
 * dorostu po pár sezónách nezbyli samí záložníci a ani jeden brankář.
 */
export function vyberChybejiciPosty(maPost: Map<string, number>, kolik: number): Position[] {
  const posty: Position[] = [];
  const stav = new Map<Position, number>(
    (Object.keys(CILOVE_POSTY) as Position[]).map((p) => [p, maPost.get(p) ?? 0]),
  );

  for (let i = 0; i < kolik; i++) {
    let nejhorsi: Position = "MID";
    let nejvetsiDira = -Infinity;
    for (const post of Object.keys(CILOVE_POSTY) as Position[]) {
      const dira = CILOVE_POSTY[post] - (stav.get(post) ?? 0);
      if (dira > nejvetsiDira) { nejvetsiDira = dira; nejhorsi = post; }
    }
    posty.push(nejhorsi);
    stav.set(nejhorsi, (stav.get(nejhorsi) ?? 0) + 1);
  }
  return posty;
}

/** Obec A-týmu — určuje jména, povolání i sílu ročníku. */
async function nactiObec(db: D1Database, clubId: string): Promise<(VillageInfo & { size: string }) | null> {
  const r = await db.prepare(
    `SELECT v.district, v.population, v.size FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(clubId).first<{ district: string; population: number; size: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: clubId }, "load village", e); return null; });
  if (!r) return null;

  const kategorie: Record<string, VillageInfo["category"]> = {
    hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto",
  };
  return {
    region_code: r.district,
    category: kategorie[r.size] ?? "obec",
    population: r.population ?? 500,
    district: r.district,
    size: r.size ?? "village",
  };
}

/**
 * Kolik dorostů projde jedna invokace cyklu. Dorost stojí kolem dvaceti dotazů (povýšení
 * po hráči, nový ročník, SMS) a D1 má strop dotazů na invokaci. Všech 42 dorostů najednou
 * by se k němu nebezpečně přiblížilo, proto po dávkách.
 */
export const YOUTH_CYCLE_CHUNK = 6;

export interface YouthCycleChunkResult {
  /** Prošly už všechny dorosty. */
  done: boolean;
  teamsDone: number;
  teamsTotal: number;
  /** Součty za celý cyklus sezóny, ne jen za tuhle dávku. */
  promoted: number;
  released: number;
  arrived: number;
}

interface YouthCycleCursor {
  teams: string[];
  promoted: number;
  released: number;
  arrived: number;
}

export function youthCycleKey(seasonNumber: number): ProgressKey {
  return { leagueId: U21_PROGRESS_KEY, seasonNumber, phase: "u21_cycle" };
}

/**
 * Jedna dávka dorostového cyklu sezóny `seasonNumber` (sezóna, do které se právě přešlo).
 *
 * NIKDY nikoho nestárne. Počítá s tím, že stárnutí sezóny už proběhlo, a jen pošle do áčka,
 * kdo už 22 má, a doplní nový ročník. Proto jde pustit i dodatečně, když rollover po stárnutí
 * nedoběhl (21. 10. 2026).
 *
 * Jeden dorost je idempotentní: přerostlí po prvním průchodu v dorostu nejsou a kádr je
 * doplněný na cílový počet, takže druhý průchod nic nezmění. Kurzor se proto píše až PO
 * dorostu. Spadne-li invokace mezi dorostem a zápisem kurzoru, další dávka ho projede
 * znovu a nic se nezdvojí. Kurzor celé sezóny navíc brání tomu, aby se cyklus pustil
 * podruhé: dvakrát by to vadilo jen se stárnutím mezi tím, ale opatrnost nic nestojí.
 */
export async function runYouthCycleChunk(
  db: D1Database, seasonNumber: number, chunkSize = YOUTH_CYCLE_CHUNK,
): Promise<YouthCycleChunkResult> {
  const key = youthCycleKey(seasonNumber);
  const progress = await readProgress(db, key);
  const cursor = parseCursor<YouthCycleCursor>(progress?.cursor, { teams: [], promoted: 0, released: 0, arrived: 0 });
  const processed = new Set(cursor.teams);
  const teams = (await db.prepare(
    "SELECT id FROM teams WHERE team_type = 'u21' AND parent_team_id IS NOT NULL ORDER BY id",
  ).all<{ id: string }>()).results.map((t) => t.id);
  const summary = (done: boolean): YouthCycleChunkResult => ({
    done,
    teamsDone: teams.filter((id) => processed.has(id)).length,
    teamsTotal: teams.length,
    promoted: cursor.promoted, released: cursor.released, arrived: cursor.arrived,
  });
  if (progress?.status === "done") return summary(true);

  for (const teamId of teams.filter((id) => !processed.has(id)).slice(0, chunkSize)) {
    const outcome = await dorostovyCyklus(db, teamId, createRng(cryptoSeed()));
    await oznamDorostovyCyklus(db, teamId, outcome)
      .catch((e) => logger.warn({ module: M, teamId }, "notify cycle", e));
    processed.add(teamId);
    cursor.teams = [...processed];
    cursor.promoted += outcome.povyseni.length;
    cursor.released += outcome.propusteni.length;
    cursor.arrived += outcome.prislo;
    await writeProgress(db, key, "pending", JSON.stringify(cursor));
  }

  const finished = teams.every((id) => processed.has(id));
  if (finished) await writeProgress(db, key, "done", JSON.stringify(cursor));
  logger.info({ module: M },
    `dorostový cyklus sezóny ${seasonNumber}: ${processed.size}/${teams.length} dorostů, do áčka ${cursor.promoted}, uvolněno ${cursor.released}, přišlo ${cursor.arrived}`);
  return summary(finished);
}

/**
 * Zapíše stárnutí a dospívání dorostu sezóny jako hotové, aniž by cokoli spustilo.
 *
 * Pro dodatečný cyklus po rolloveru, který 21. 10. 2026 po stárnutí a dospívání dorostu
 * přestal zapisovat: obojí proběhlo, marker ne. Bez markeru by se stárnutí jednou mohlo
 * pustit znovu a kluci by zestárli o dva roky. Existující marker nepřepíše.
 */
export async function markYouthAgingDone(db: D1Database, seasonNumber: number): Promise<void> {
  const note = JSON.stringify({ recorded: "manual" });
  for (const phase of ["u21_aging", "u21_maturation"]) {
    await insertProgressIfMissing(db, { leagueId: U21_PROGRESS_KEY, seasonNumber, phase }, "done", note);
  }
}

/** Proběhlo už stárnutí dorostu sezóny (podle markeru)? */
export async function youthAgingDone(db: D1Database, seasonNumber: number): Promise<boolean> {
  const row = await readProgress(db, { leagueId: U21_PROGRESS_KEY, seasonNumber, phase: "u21_aging" });
  return row?.status === "done";
}

/**
 * Úklid značky čerstvého odchovance. Platí jen pro léto, ve kterém vznikl, takže patří
 * až za stárnutí, dospívání i cyklus. Idempotentní.
 */
export async function clearFreshAcademyFlags(db: D1Database): Promise<number> {
  const r = await db.prepare(
    "UPDATE players SET life_context = json_remove(life_context, '$.freshAcademyGraduate') WHERE json_extract(COALESCE(life_context, '{}'), '$.freshAcademyGraduate') IS NOT NULL",
  ).run();
  return r.meta?.changes ?? 0;
}

/**
 * SMS manažerovi o tom, co se v dorostu přes léto stalo. Bez ní by hráči zmizeli
 * a objevili se potichu a manažer by na to přišel až náhodou v soupisce.
 */
export async function oznamDorostovyCyklus(
  db: D1Database,
  u21TeamId: string,
  v: VysledekCyklu,
): Promise<void> {
  if (v.povyseni.length === 0 && v.propusteni.length === 0 && v.prislo === 0) return;

  const casti: string[] = [];
  if (v.povyseni.length > 0) {
    const jmena = v.povyseni.slice(0, 5).map((p) => `${p.jmeno} (${p.rating})`).join(", ");
    const zbytek = v.povyseni.length > 5 ? ` a další ${v.povyseni.length - 5}` : "";
    casti.push(`Do áčka ${v.povyseni.length === 1 ? "jde" : "jdou"} ${jmena}${zbytek}`);
  }
  if (v.propusteni.length > 0) {
    const jmena = v.propusteni.slice(0, 3).map((p) => p.jmeno).join(", ");
    const zbytek = v.propusteni.length > 3 ? ` a další ${v.propusteni.length - 3}` : "";
    casti.push(`v áčku nebylo místo pro ${jmena}${zbytek}, jsou volní`);
  }
  if (v.seniorSquadSize !== undefined && v.seniorSquadSize > MAX_KADR_ACKA) {
    casti.push(`v áčku je teď ${v.seniorSquadSize} hráčů, nad ${MAX_KADR_ACKA} nikoho nekoupíš, dokud někoho nepustíš`);
  }
  if (v.prislo > 0) {
    casti.push(`z žáků přišlo ${v.prislo} ${v.prislo === 1 ? "nový kluk" : v.prislo < 5 ? "noví kluci" : "nových kluků"}`);
  }
  const telo = `${casti.join("; ")}. Mrkni na dorost, ročník je nový.`;

  // Schránku má klub, ne dorost — zpráva o U21 musí přijít na A-tým, jinak si jí
  // manažer nikdy nevšimne.
  const klub = await db.prepare("SELECT COALESCE(parent_team_id, id) AS club_id FROM teams WHERE id = ?")
    .bind(u21TeamId).first<{ club_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load club id", e); return null; });
  const clubId = klub?.club_id ?? u21TeamId;

  // AI klubu není komu psát
  const jeAi = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(clubId)
    .first<{ user_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: clubId }, "load owner", e); return null; });
  if (!jeAi || jeAi.user_id === "ai") return;

  const nazev = "Mládež";
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(clubId, nazev).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: M }, "find conversation", e); return null; });

  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
    ).bind(convId, clubId, nazev).run()
      .catch((e) => logger.warn({ module: M }, "create conversation", e));
  }
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Trenér mládeže', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), convId, telo).run()
    .catch((e) => logger.warn({ module: M }, "insert message", e));
  await db.prepare(
    "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
  ).bind(telo.slice(0, 100), convId).run()
    .catch((e) => logger.warn({ module: M }, "bump conversation", e));
}

/**
 * Přepíše soupisku jednoho dorostu dnešním generátorem.
 *
 * NEVRATNÉ. Existující dorostenci se odeberou přes `removePlayer` (úklid cizích klíčů),
 * ale NE do volných hráčů — jde o přepis vadných dat, ne o transfer, a čtrnáct nových
 * volných hráčů na klub by zaplavilo trh.
 *
 * Hostující hráči zůstávají: patří jinému klubu a přegenerováním by o ně přišel.
 */
export async function pregenerujDorost(
  db: D1Database,
  u21TeamId: string,
): Promise<{ teamId: string; smazano: number; vytvoreno: number }> {
  const vysledek = { teamId: u21TeamId, smazano: 0, vytvoreno: 0 };

  const tym = await db.prepare("SELECT parent_team_id FROM teams WHERE id = ? AND team_type = 'u21'")
    .bind(u21TeamId).first<{ parent_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load team", e); return null; });
  if (!tym?.parent_team_id) return vysledek;

  const stavajici = await db.prepare(
    `SELECT id FROM players WHERE team_id = ? AND loan_from_team_id IS NULL`,
  ).bind(u21TeamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load squad", e); return { results: [] as never[] }; });

  const { removePlayer } = await import("../transfers/remove-player");
  for (const h of stavajici.results) {
    const r = await removePlayer(db, h.id, "released", { toFreeAgent: false, teamId: u21TeamId })
      .catch((e) => { logger.warn({ module: M, playerId: h.id }, "remove for regen", e); return { ok: false }; });
    if (r.ok) vysledek.smazano++;
  }

  const zbyva = await db.prepare(
    `SELECT position, COUNT(*) AS pocet FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active') GROUP BY position`,
  ).bind(u21TeamId).all<{ position: string; pocet: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "count after wipe", e); return { results: [] as never[] }; });
  const maPost = new Map(zbyva.results.map((r) => [r.position, r.pocet]));
  const celkem = zbyva.results.reduce((s, r) => s + r.pocet, 0);
  // Kolik jich má vzniknout: aspoň cílový počet, ale nikdy míň, než klub měl. Manažer,
  // který si dorost vypiploval na třicet kluků, nemá přijít o polovinu jen proto, že se
  // přepisují vadná data.
  const cil = Math.max(CILOVY_POCET_DOROSTU, vysledek.smazano);
  const chybi = cil - celkem;
  if (chybi <= 0) return vysledek;

  const village = await nactiObec(db, tym.parent_team_id);
  if (!village) return vysledek;

  const seasonId = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>().then((r) => r?.id ?? "")
    .catch((e) => { logger.warn({ module: M }, "load season", e); return ""; });

  try {
    const { vygenerujDorostence } = await import("../league/u21-generator");
    const { getDistrictDataFromDB } = await import("../data/districts");
    const { FIRSTNAMES } = await import("../data/czech-names");
    const districtData = await getDistrictDataFromDB(db, village.district ?? village.region_code);
    const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
    const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };
    // Celá věková škála 16–21, ne jen šestnáctiletí — přegenerování má nahradit celý
    // dorost, takže pyramida musí vzniknout rovnou celá.
    vysledek.vytvoreno = await vygenerujDorostence(
      db, u21TeamId, vyberChybejiciPosty(maPost, chybi), village, levelFromVillageSize(village.size),
      createRng(cryptoSeed()), surnameData, firstnameData, seasonId, 16, 21,
    );
  } catch (e) {
    logger.error({ module: M, teamId: u21TeamId }, "regenerate squad", e);
  }

  return vysledek;
}
