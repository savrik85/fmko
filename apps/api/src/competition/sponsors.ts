/**
 * Sponzor soutěže.
 *
 * Přijetím se soutěž přejmenuje na „{Sponzor} liga" — a to není jen kosmetika:
 * `leagues.name` čte půlka hry včetně titulku ligového chatu, který je snapshot,
 * a skloňování v novinách. Původní znění se proto ukládá do `original_name`
 * a po odchodu sponzora se vrací (viz rollover.ts).
 *
 * Jména jsou jednoslovná a klíčovaná okresem, aby zněla místně. Přijmout lze
 * nejvýš jednu nabídku; o tom, která půjde na hlasování, rozhoduje prezident
 * soutěže, a když funkce není obsazená, může ji předložit kterýkoli klub.
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";

const M = "competition-sponsors";

export type SponsorTier = "mistni" | "okresni" | "regionalni";

export interface SponsorOffer {
  id: string;
  leagueId: string;
  seasonNumber: number;
  name: string;
  amount: number;
  seasons: number;
  tier: SponsorTier;
  conditions: string[];
  status: string;
}

/** Výchozí spokojenost sponzora při podpisu. */
export const SPONSOR_START_SATISFACTION = 60;
/** Pod tuhle hranici na konci sezóny sponzor odchází (vyhodnocuje rollover). */
export const SPONSOR_QUIT_BELOW = 30;
/** Od kolika lidských klubů má soutěž šanci na regionální značku. */
const REGIONAL_MIN_HUMANS = 10;

/** Jednoslovná jména podle okresu. Cizí značka v okresním přeboru zní falešně. */
const JMENA: Record<string, string[]> = {
  Praha: ["Braník", "Staropramen", "Kozel", "Krušovice", "Bernard", "Kofola"],
  Prachatice: [
    "Gambrinus", "Budvar", "Platan", "Madeta", "Vodňanka", "Jihostroj",
    "Schwan", "Hauser", "Fezko", "Šumavan", "Otava", "Lipno",
  ],
};

/** Když okres v seznamu není, ať soutěž nezůstane bez nabídek. */
const OBECNA_JMENA = ["Pramen", "Klas", "Zdroj", "Podnik", "Družstvo", "Silnice"];

const PODMINKY: Record<SponsorTier, string[]> = {
  mistni: [],
  okresni: ["Žádná konkurenční značka na dresech klubů."],
  regionalni: [
    "Žádná konkurenční značka na dresech klubů.",
    "Klid na hřištích — opakované vyloučení sráží spokojenost.",
  ],
};

const ROZSAHY: Record<SponsorTier, { min: number; max: number; seasons: number }> = {
  mistni: { min: 60_000, max: 120_000, seasons: 1 },
  okresni: { min: 150_000, max: 260_000, seasons: 2 },
  regionalni: { min: 300_000, max: 450_000, seasons: 3 },
};

/** Název soutěže se sponzorem. Jediné místo, kde tenhle tvar vzniká. */
export function sponzorovanyNazev(sponsorName: string): string {
  return `${sponsorName} liga`;
}

/**
 * Vygeneruje nabídky pro danou sezónu. Idempotentní přes UNIQUE(liga, sezóna, jméno)
 * a přes kontrolu, že už nějaká nabídka existuje — opakovaný běh nepřidá další.
 */
export async function generateOffers(db: D1Database, opts: {
  leagueId: string;
  district: string;
  seasonNumber: number;
  humanClubs: number;
  gameDate: string;
}): Promise<number> {
  const existing = await db.prepare(
    "SELECT COUNT(*) AS n FROM competition_sponsor_offers WHERE league_id = ? AND season_number = ?"
  ).bind(opts.leagueId, opts.seasonNumber).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "existující nabídky", e); return null; });
  if ((existing?.n ?? 0) > 0) return 0;

  // Deterministicky podle ligy a sezóny — opakovaný běh dá tytéž nabídky.
  const rng = createRng(seedFromString(`sponsor-${opts.leagueId}-${opts.seasonNumber}`));
  const okres = Object.keys(JMENA).find((k) => opts.district.startsWith(k));
  const jmena = [...(okres ? JMENA[okres] : OBECNA_JMENA)];

  const tiers: SponsorTier[] = ["mistni"];
  if (rng.int(0, 100) < 60) tiers.push("okresni");
  if (opts.humanClubs >= REGIONAL_MIN_HUMANS && rng.int(0, 100) < 25) tiers.push("regionalni");

  let vlozeno = 0;
  for (const tier of tiers) {
    if (jmena.length === 0) break;
    const name = jmena.splice(rng.int(0, jmena.length - 1), 1)[0];
    const r = ROZSAHY[tier];
    // Na celé tisíce — sponzor v okrese nepočítá koruny.
    const amount = Math.round(rng.int(r.min, r.max) / 1000) * 1000;

    const res = await db.prepare(
      `INSERT OR IGNORE INTO competition_sponsor_offers
        (id, league_id, season_number, name, amount, seasons, tier, conditions, opened_game_date)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(
      crypto.randomUUID(), opts.leagueId, opts.seasonNumber, name, amount,
      r.seasons, tier, JSON.stringify(PODMINKY[tier]), opts.gameDate,
    ).run().catch((e) => { logger.warn({ module: M }, `nabídka ${name}`, e); return null; });
    if ((res?.meta?.changes ?? 0) > 0) vlozeno++;
  }

  if (vlozeno > 0) {
    logger.info({ module: M }, `soutěž ${opts.leagueId}: ${vlozeno} sponzorských nabídek na ${opts.seasonNumber}. sezónu`);
  }
  return vlozeno;
}

export async function listOffers(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<SponsorOffer[]> {
  const rows = await db.prepare(
    `SELECT * FROM competition_sponsor_offers
      WHERE league_id = ? AND season_number = ? ORDER BY amount DESC`
  ).bind(leagueId, seasonNumber).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "výpis nabídek", e); return { results: [] }; });

  return rows.results.map((r) => ({
    id: r.id as string,
    leagueId: r.league_id as string,
    seasonNumber: r.season_number as number,
    name: r.name as string,
    amount: r.amount as number,
    seasons: r.seasons as number,
    tier: r.tier as SponsorTier,
    conditions: safeParse(r.conditions as string),
    status: r.status as string,
  }));
}

function safeParse(v: string): string[] {
  try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

/**
 * Přijetí nabídky: přejmenování soutěže a zápis smlouvy.
 *
 * Peníze NEtečou hned — sponzorské plnění se připisuje při rolloveru na začátku
 * každé sezóny, kterou smlouva pokrývá (viz rollover.ts). Přijetí je podpis,
 * ne výplata.
 */
export async function acceptOffer(db: D1Database, opts: {
  leagueId: string;
  offerId: string;
  seasonNumber: number;
}): Promise<{ ok: boolean; reason?: string; name?: string }> {
  const offer = await db.prepare(
    "SELECT * FROM competition_sponsor_offers WHERE id = ? AND league_id = ?"
  ).bind(opts.offerId, opts.leagueId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "nabídka k přijetí", e); return null; });
  if (!offer) return { ok: false, reason: "Taková nabídka neexistuje." };
  if (offer.status !== "open") return { ok: false, reason: "Tahle nabídka už není ve hře." };

  const gov = await db.prepare(
    "SELECT sponsor_name, original_name FROM competition_governance WHERE league_id = ?"
  ).bind(opts.leagueId).first<{ sponsor_name: string | null; original_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "stav samosprávy", e); return null; });
  if (gov?.sponsor_name) {
    return { ok: false, reason: `Soutěž už sponzora má — ${gov.sponsor_name}.` };
  }

  // Atomicky: nabídku smí přijmout jen jeden běh.
  const locked = await db.prepare(
    "UPDATE competition_sponsor_offers SET status = 'accepted' WHERE id = ? AND status = 'open'"
  ).bind(opts.offerId).run()
    .catch((e) => { logger.error({ module: M }, "přijetí nabídky", e); return null; });
  if (!locked || (locked.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: "Tahle nabídka už není ve hře." };
  }

  const liga = await db.prepare("SELECT name FROM leagues WHERE id = ?")
    .bind(opts.leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "název ligy", e); return null; });

  const name = offer.name as string;
  const novyNazev = sponzorovanyNazev(name);
  // Původní název si pamatujeme jen poprvé — jinak by se po druhém sponzorovi
  // uložil ten sponzorovaný a soutěž by se ke svému jménu už nevrátila.
  const puvodni = gov?.original_name ?? liga?.name ?? null;

  await db.prepare(
    `UPDATE competition_governance
        SET sponsor_name = ?, sponsor_amount = ?, sponsor_satisfaction = ?,
            sponsor_until_season = ?, original_name = COALESCE(original_name, ?)
      WHERE league_id = ?`
  ).bind(
    name, offer.amount as number, SPONSOR_START_SATISFACTION,
    opts.seasonNumber + (offer.seasons as number) - 1, puvodni, opts.leagueId,
  ).run().catch((e) => logger.error({ module: M }, "zápis sponzora", e));

  await db.prepare("UPDATE leagues SET name = ? WHERE id = ?")
    .bind(novyNazev, opts.leagueId).run()
    .catch((e) => logger.warn({ module: M }, "přejmenování ligy", e));
  // Titulek ligového chatu je snapshot, musí se přepsat spolu s ligou.
  await db.prepare("UPDATE group_chats SET title = ? WHERE id = ?")
    .bind(novyNazev, `league:${opts.leagueId}`).run()
    .catch((e) => logger.warn({ module: M }, "přejmenování ligového chatu", e));

  // Ostatní nabídky téže sezóny padají — přijmout jde jen jednu.
  await db.prepare(
    "UPDATE competition_sponsor_offers SET status = 'rejected' WHERE league_id = ? AND season_number = ? AND status = 'open'"
  ).bind(opts.leagueId, opts.seasonNumber).run()
    .catch((e) => logger.warn({ module: M }, "uzavření ostatních nabídek", e));

  logger.info({ module: M }, `soutěž ${opts.leagueId}: sponzor ${name}, nový název „${novyNazev}"`);
  return { ok: true, name };
}

/**
 * Posun spokojenosti sponzora. Volá se na každém zasedání.
 *
 * Sponzor kouká na dvě věci: jestli je v soutěži klid a jestli o ní je slyšet.
 * Pokuty udělené za týden ho odrazují, zasedání bez skandálu ho drží v klidu.
 * Bez sponzora se nic neděje.
 */
export async function updateSatisfaction(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  gameDate: string;
}): Promise<number | null> {
  const gov = await db.prepare(
    "SELECT sponsor_name, sponsor_satisfaction FROM competition_governance WHERE league_id = ?"
  ).bind(opts.leagueId).first<{ sponsor_name: string | null; sponsor_satisfaction: number }>()
    .catch((e) => { logger.warn({ module: M }, "spokojenost sponzora", e); return null; });
  if (!gov?.sponsor_name) return null;

  // Sponzor podepsaný na dnešním zasedání nemůže odnést pokuty, které padly
  // na témže zasedání — podepisoval se do stavu, jaký byl, ne do toho po něm.
  const dnesPodepsan = await db.prepare(
    `SELECT 1 FROM competition_proposals
      WHERE league_id = ? AND kind = 'sponsor' AND status = 'passed' AND closed_game_date = ?`
  ).bind(opts.leagueId, opts.gameDate).first()
    .catch((e) => { logger.warn({ module: M }, "čerstvý podpis sponzora", e); return null; });
  if (dnesPodepsan) return gov.sponsor_satisfaction;

  const sankce = await db.prepare(
    `SELECT COUNT(*) AS n FROM competition_sanctions
      WHERE league_id = ? AND game_date = ? AND status IN ('issued','appealed')`
  ).bind(opts.leagueId, opts.gameDate).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "sankce pro sponzora", e); return null; });

  const pokut = sankce?.n ?? 0;
  const delta = pokut > 0 ? -3 * pokut : 2;
  const novy = Math.max(0, Math.min(100, gov.sponsor_satisfaction + delta));
  if (novy === gov.sponsor_satisfaction) return novy;

  await db.prepare("UPDATE competition_governance SET sponsor_satisfaction = ? WHERE league_id = ?")
    .bind(novy, opts.leagueId).run()
    .catch((e) => logger.warn({ module: M }, "zápis spokojenosti", e));
  return novy;
}
