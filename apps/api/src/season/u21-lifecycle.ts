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
 *   1. Kdo dosáhl 22 let, z dorostu odchází — buď do áčka, nebo mezi volné hráče.
 *   2. Kádr se doplní čerstvým ročníkem šestnáctiletých na cílový počet.
 */

import { logger } from "../lib/logger";
import { createRng, cryptoSeed, type Rng } from "../generators/rng";
import type { VillageInfo } from "../generators/player";
import type { Position } from "../league/u21-generator";

const M = "u21-lifecycle";

/** Od kolika let už hráč do dorostu nepatří. */
export const VEK_ODCHODU_Z_DOROSTU = 22;

/** Kolik hráčů má dorost mít po doplnění. Dva na každý post plus rezerva. */
export const CILOVY_POCET_DOROSTU = 16;

/**
 * Nad kolik hráčů se A-tým už nedoplňuje. Přerostlý dorostenec pak jde mezi volné hráče
 * místo do áčka — jinak by kádry AI klubů rok co rok bobtnaly donekonečna.
 */
export const MAX_KADR_ACKA = 24;

/** Jak má vypadat rozložení postů v dorostu — podle toho se doplňuje, co chybí. */
const CILOVE_POSTY: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 2 };

export interface VysledekCyklu {
  /** Kdo přešel do A-týmu. */
  povyseni: { jmeno: string; vek: number; rating: number }[];
  /** Kdo skončil mezi volnými hráči, protože se do áčka nevešel. */
  propusteni: { jmeno: string; vek: number; rating: number }[];
  /** Kolik nových šestnáctiletých přišlo. */
  prislo: number;
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

  // ── 1. Odchody ──────────────────────────────────────────────────────────────────
  const prerostli = await db.prepare(
    `SELECT id, first_name, last_name, age, overall_rating, loan_from_team_id
       FROM players
      WHERE team_id = ? AND age >= ? AND (status IS NULL OR status = 'active')
      ORDER BY overall_rating DESC`,
  ).bind(u21TeamId, VEK_ODCHODU_Z_DOROSTU).all<{
    id: string; first_name: string; last_name: string; age: number;
    overall_rating: number; loan_from_team_id: string | null;
  }>().catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load overage", e); return { results: [] as never[] }; });

  let mistoVAcku = await volneMistoVAcku(db, clubId);

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
      db, u21TeamId, posty, village, velikostObce(village), rng,
      surnameData, firstnameData, seasonId, 16, 16,
    );
  } catch (e) {
    logger.error({ module: M, teamId: u21TeamId }, "generate new youth intake", e);
  }

  return vysledek;
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

function velikostObce(village: VillageInfo): string {
  return village.category === "vesnice" ? "hamlet"
    : village.category === "obec" ? "village"
    : village.category === "mestys" ? "town" : "small_city";
}

/**
 * Projede dorosty všech klubů. Volá se z rolloveru, hlídá si ho tam marker — dvakrát
 * spuštěný cyklus by poslal do áčka další ročník a doplnil dorost nad cílový počet.
 */
export async function dorostovyCyklusVsech(db: D1Database): Promise<{ tymu: number; povyseno: number; propusteno: number; prislo: number }> {
  const tymy = await db.prepare(
    "SELECT id FROM teams WHERE team_type = 'u21' AND parent_team_id IS NOT NULL",
  ).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "load u21 teams", e); return { results: [] as never[] }; });

  const souhrn = { tymu: 0, povyseno: 0, propusteno: 0, prislo: 0 };
  for (const t of tymy.results) {
    const rng = createRng(cryptoSeed());
    const v = await dorostovyCyklus(db, t.id, rng);
    souhrn.tymu++;
    souhrn.povyseno += v.povyseni.length;
    souhrn.propusteno += v.propusteni.length;
    souhrn.prislo += v.prislo;
    await oznamDorostovyCyklus(db, t.id, v).catch((e) => logger.warn({ module: M, teamId: t.id }, "notify cycle", e));
  }
  return souhrn;
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
    casti.push(`Do áčka jde ${jmena}${zbytek}`);
  }
  if (v.propusteni.length > 0) {
    const jmena = v.propusteni.slice(0, 3).map((p) => p.jmeno).join(", ");
    const zbytek = v.propusteni.length > 3 ? ` a další ${v.propusteni.length - 3}` : "";
    casti.push(`v áčku nebylo místo pro ${jmena}${zbytek}, jsou volní`);
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
      db, u21TeamId, vyberChybejiciPosty(maPost, chybi), village, velikostObce(village),
      createRng(cryptoSeed()), surnameData, firstnameData, seasonId, 16, 21,
    );
  } catch (e) {
    logger.error({ module: M, teamId: u21TeamId }, "regenerate squad", e);
  }

  return vysledek;
}
