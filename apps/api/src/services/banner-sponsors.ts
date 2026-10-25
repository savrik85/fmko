/**
 * Bannerové sponzorské smlouvy: nabídky a podpis. Jedna služba pro manažera
 * (GET /teams/:teamId/sponsors, POST /teams/:teamId/sponsors/sign) i AI trenéra.
 * Hlavní sponzor a název stadionu se vyjednávají jinde (routes/sponsors.ts).
 */

import { createRng } from "../generators/rng";
import { mustSeason } from "../lib/season";
import { logger } from "../lib/logger";
import type { ServiceError } from "./lineup";

export const MAX_BANNERS = 6;

export interface BannerOffer {
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasons: number;
  earlyTerminationFee: number;
  requirement?: string;
}

/**
 * Nabídky bannerů pro tým: stabilní pro tým a sezónu (stejný seed), bez firem, které klub
 * už sponzorují. Čistá funkce, data dodá volající.
 */
export function computeBannerOffers(input: {
  teamId: string;
  seedSeason: number;
  reputation: number;
  size: string;
  sponsorRows: Array<Record<string, unknown>>;
  activeRows: Array<Record<string, unknown>>;
  seedFromString: (s: string) => number;
}): BannerOffer[] {
  const repMod = input.reputation / 50;
  const sizeMod = input.size === "mesto" ? 1.3 : input.size === "mestys" ? 1.1 : input.size === "obec" ? 1.0 : 0.8;
  // Stable seed: same team + same season = same offers
  const rng = createRng(input.seedFromString(input.teamId + "sponsors" + input.seedSeason));

  // Zamíchej pool per tým (stabilně dle seedu) — jinak všechny týmy v okrese dostávají
  // stejné sponzory (první podle abecedy) a mají tak pořád ty samé.
  const shuffledSponsors = [...input.sponsorRows];
  for (let i = shuffledSponsors.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [shuffledSponsors[i], shuffledSponsors[j]] = [shuffledSponsors[j], shuffledSponsors[i]];
  }

  // Banner offers — vždy 12 možných, malé částky, bez naming/win bonus
  const bannerOffers: BannerOffer[] = [];
  // Firma, která už klubu dělá hlavního sponzora, sponzora stadionu nebo jiný banner, se v
  // nabídkách bannerů znovu nenabízí (párovaní přes sponsor_id, bez něj záložně přes jméno).
  const activeSponsorIds = new Set<number>();
  const activeSponsorNamesFallback = new Set<string>();
  for (const activeRow of input.activeRows) {
    const sid = (activeRow.sponsor_id as number | null) ?? null;
    if (sid != null) activeSponsorIds.add(sid);
    else activeSponsorNamesFallback.add(activeRow.sponsor_name as string);
  }
  const bannerPool = shuffledSponsors.filter((s) =>
    !activeSponsorIds.has(s.id as number) && !activeSponsorNamesFallback.has(s.name as string));
  for (let i = 0; i < Math.min(12, bannerPool.length); i++) {
    const s = bannerPool[i];
    const monthly = Math.round(rng.int(s.monthly_min as number, s.monthly_max as number) * repMod * sizeMod * 0.8);
    const seasons = rng.int(1, 2);
    const terminationFee = Math.round(monthly * seasons * 1.5);
    bannerOffers.push({
      sponsorId: s.id as number, sponsorName: s.name as string, sponsorType: s.type as string,
      monthlyAmount: monthly, winBonus: 0, seasons, earlyTerminationFee: terminationFee,
    });
  }
  bannerOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  return bannerOffers;
}

/** Nabídky bannerů, které jde teď podepsat (bez oborů chráněných exkluzivitou), a počet aktivních bannerů. */
export async function listBannerOffers(db: D1Database, teamId: string): Promise<{ offers: BannerOffer[]; activeBanners: number } | null> {
  const team = await db.prepare(
    "SELECT t.reputation, v.district, v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ reputation: number; district: string; size: string }>()
    .catch((e) => { logger.warn({ module: "banner-sponsors" }, `tým ${teamId}`, e); return null; });
  if (!team) return null;
  const activeRows = await db.prepare("SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "banner-sponsors" }, `aktivní smlouvy ${teamId}`, e); return { results: [] as Array<Record<string, unknown>> }; });
  const sponsorRows = await db.prepare("SELECT * FROM district_sponsors WHERE district = ? ORDER BY name")
    .bind(team.district).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "banner-sponsors" }, `sponzoři okresu ${team.district}`, e); return { results: [] as Array<Record<string, unknown>> }; });
  const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>()
    .catch((e) => { logger.warn({ module: "banner-sponsors" }, "sezóna pro seed", e); return null; });
  const { seedFromString } = await import("../lib/seed");
  const offers = computeBannerOffers({
    teamId, seedSeason: mustSeason(season?.number), reputation: team.reputation, size: team.size,
    sponsorRows: sponsorRows.results, activeRows: activeRows.results, seedFromString,
  });
  const { exclusiveSectors } = await import("../sponsors/promise-runs");
  const exclusive = await exclusiveSectors(db, teamId)
    .catch((e) => { logger.warn({ module: "banner-sponsors", teamId }, "exkluzivita oboru pro nabídky bannerů", e); return new Map<string, string>(); });
  const activeBanners = activeRows.results.filter((r) => r.category === "banner").length;
  return { offers: activeBanners >= MAX_BANNERS ? [] : offers.filter((o) => !exclusive.has(o.sponsorType)), activeBanners };
}

export interface SignSponsorInput {
  category: "main" | "stadium" | "banner";
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasons: number;
  earlyTerminationFee: number;
  isNamingRights?: boolean;
}

/**
 * Podpis sponzorské smlouvy s pevnou nabídkou (dnes jen bannery). Klient nesmí určovat
 * ekonomické hodnoty: ověří se proti mezím sponzora, pokuta za výpověď se dopočítá.
 */
export async function signSponsorContract(db: D1Database, teamId: string, body: SignSponsorInput): Promise<{ ok: true; contractId: string } | ServiceError> {
  const category = body.category || "main";
  // Hlavní sponzor a název stadionu se podepisují po jednání s majitelem firmy
  // (POST /teams/:teamId/sponsors/negotiations/:id/accept). Tady už jen bannery.
  // Přetypování záměrně: zúžení `category` na "banner" by rozbilo zbylá porovnání níž (TS2367).
  if ((category as string) !== "banner") {
    return { ok: false, status: 400, error: "Hlavního sponzora a název stadionu teď vyjednáváš s majitelem firmy na stránce sponzora" };
  }

  // Check no active contract in this category (banner: max 8 současně)
  const allActive = await db.prepare(
    "SELECT id, category, sponsor_id, sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active'"
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "game" }, "fetch active contracts for signing", e); return { results: [] }; });

  if (category === "banner") {
    const bannerCount = allActive.results.filter((r) => r.category === "banner").length;
    if (bannerCount >= MAX_BANNERS) {
      return { ok: false, status: 400, error: `Maximální počet bannerů (${MAX_BANNERS}) je dosažen` };
    }
  } else {
    const existing = allActive.results.find((r) => (r.category || "main") === category);
    if (existing) return { ok: false, status: 400, error: `Už máš aktivní smlouvu pro ${category === "main" ? "hlavního sponzora" : "stadion"}` };
  }

  // Anti-podvrh: klient NESMÍ určovat ekonomické hodnoty. Ověř je proti serverovým mezím sponzora
  // (rng.int nikdy nepřekročí monthly_max × přesné multiplikátory z generování) + fee dopočítej serverově.
  const econ = await db.prepare(
    "SELECT t.reputation, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<{ reputation: number; size: string; district: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "sponsor econ lookup", e); return null; });
  if (!econ) return { ok: false, status: 404, error: "Tým nenalezen" };
  const spBounds = await db.prepare("SELECT id, name, type, monthly_max, win_bonus_max FROM district_sponsors WHERE district = ?")
    .bind(econ.district).all<{ id: number; name: string; type: string; monthly_max: number; win_bonus_max: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "sponsor bounds lookup", e); return { results: [] as { id: number; name: string; type: string; monthly_max: number; win_bonus_max: number }[] }; });
  const cleanSp = (nm: string) => nm.replace(/\s*s\.r\.o\.?\s*/gi, "").trim();
  const baseName = category === "stadium" ? body.sponsorName.replace(/\s+Arena$/i, "").trim() : body.sponsorName;
  const spRow = category === "stadium"
    ? spBounds.results.find((r) => cleanSp(r.name) === baseName)
    : spBounds.results.find((r) => r.name === body.sponsorName);
  if (!spRow) return { ok: false, status: 400, error: "Neplatný sponzor pro tento okres" };
  // Firma, která klubu už dělá hlavního sponzora, sponzora stadionu nebo jiný banner, se znovu
  // podepsat nedá (párování přes sponsor_id, bez něj záložně přes jméno) — GET /sponsors ji ze
  // stejného důvodu z nabídek bannerů vynechá.
  const alreadySponsors = allActive.results.some((r) => {
    const sid = (r.sponsor_id as number | null) ?? null;
    return sid != null ? sid === spRow.id : r.sponsor_name === body.sponsorName;
  });
  if (alreadySponsors) return { ok: false, status: 409, error: `${body.sponsorName} už tvůj klub sponzoruje, další smlouvu s ní podepsat nejde` };
  // Slib „exkluzivita oboru" u hlavního sponzora nebo stadionu: banner stejného oboru nejde.
  // Není to porušení slibu, podpis se prostě zakáže s vysvětlením.
  if (category === "banner") {
    const { exclusiveSectors } = await import("../sponsors/promise-runs");
    const { sectorBlockMessage } = await import("../sponsors/promise-eval");
    const holder = (await exclusiveSectors(db, teamId)).get(spRow.type);
    if (holder) return { ok: false, status: 409, error: sectorBlockMessage(holder, "sign") };
  }
  const repMod = econ.reputation / 50;
  const sizeMod = econ.size === "mesto" ? 1.3 : econ.size === "mestys" ? 1.1 : econ.size === "obec" ? 1.0 : 0.8;
  const catMult = category === "main" ? 3 : category === "stadium" ? 1.5 : 0.8;
  const maxMonthly = Math.ceil(spRow.monthly_max * repMod * sizeMod * catMult) + 1;
  const maxWinBonus = category === "main" ? Math.ceil(spRow.win_bonus_max * repMod * 2) + 1 : 0;
  const maxSeasons = category === "banner" ? 2 : 3;
  if (!Number.isFinite(body.monthlyAmount) || body.monthlyAmount < 0 || body.monthlyAmount > maxMonthly) return { ok: false, status: 400, error: "Neplatná výše sponzoringu" };
  if (!Number.isFinite(body.winBonus) || body.winBonus < 0 || body.winBonus > maxWinBonus) return { ok: false, status: 400, error: "Neplatný bonus za výhru" };
  if (!Number.isInteger(body.seasons) || body.seasons < 1 || body.seasons > maxSeasons) return { ok: false, status: 400, error: "Neplatná délka smlouvy" };
  // earlyTerminationFee se NEbere od klienta — dopočítej serverově dle skutečných hodnot.
  const validatedTerminationFee = Math.round(body.monthlyAmount * body.seasons * (category === "banner" ? 1.5 : 2));

  // Hlavní sponzor: vložit jen pokud ho mezitím nepodepsal jiný klub (atomicky v jednom příkazu).
  const { MAIN_SPONSOR_FREE_SQL, mainSponsorFreeParams } = await import("../sponsors/exclusivity");
  const id = crypto.randomUUID();
  const ins = await db.prepare(
    `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus,
      seasons_total, seasons_remaining, early_termination_fee, is_naming_rights, category, sponsor_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ? != 'main' OR ${MAIN_SPONSOR_FREE_SQL}`
  ).bind(id, teamId, body.sponsorName, spRow.type, body.monthlyAmount, body.winBonus,
    body.seasons, body.seasons, validatedTerminationFee, body.isNamingRights ? 1 : 0, category, spRow.id,
    category, ...mainSponsorFreeParams(spRow.id, teamId),
  ).run();
  if (!ins.meta.changes) return { ok: false, status: 409, error: `${body.sponsorName} právě podepsal s jiným klubem` };

  return { ok: true, contractId: id };
}
