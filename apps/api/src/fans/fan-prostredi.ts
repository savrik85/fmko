/**
 * Na co fanoušci koukají kolem sebe.
 *
 * Nálada party se dosud hýbala jen od výsledků a od toho, co manažer udělal
 * s klubem. Jenže lidi na tribuně stojí v dešti u zavřeného bufetu a koukají
 * na oranisko, a to s náladou dělá víc než přestup náhradníka.
 *
 * Každá parta má jiné starosti a to je celý vtip:
 * - rodiny řeší záchody, střechu a limonádu pro děti,
 * - štamgasti pivo, jeho cenu a to, jestli vůbec teče,
 * - kotel svůj sektor a stav hřiště,
 * - pamětníci trávník a to, aby se nic neměnilo,
 * - parta z okolí parkoviště a dostupnost.
 *
 * A ještě jedna věc, kterou nesnesou: když se trenér kamarádí s trenérem
 * klubu, se kterým mají vyřízené účty.
 */

import { logger } from "../lib/logger";
import { ALLY_RESPECT_THRESHOLD } from "../community/manager-relations";
import { rivalitaHorka } from "../engine/fan-groups";
import type { FanGroupKind } from "../engine/fan-groups";
import type { FanGroupRow } from "./fan-group-generator";

const M = "fan-prostredi";

/** Co která parta na stadionu řeší a jak moc. Váha 0–1. */
const ZAJEM: Record<FanGroupKind, Partial<Record<string, number>>> = {
  kotel: { ultras_stand: 1, pitch: 0.6, refreshments: 0.4, toilets: 0.2 },
  stamgasti: { refreshments: 1, toilets: 0.5, roof: 0.4, stands: 0.3 },
  rodiny: { toilets: 1, roof: 0.8, stands: 0.6, refreshments: 0.4 },
  pametnici: { stands: 0.8, roof: 0.6, pitch: 0.8, toilets: 0.5 },
  parta_z_okoli: { parking: 1, refreshments: 0.5, stands: 0.4, roof: 0.3 },
};

/**
 * Nejvýš tolik bodů nálady za HERNÍ TÝDEN ze stavu stadionu.
 *
 * Původně to běželo denně se stropem 3 a nefungovalo to: rozdíl mezi partou,
 * které chybí záchody, a partou, které nevadí, vycházel na desetiny bodu
 * a zaokrouhlení ho smazalo na nulu. Všem vycházelo totéž, takže rozlišení
 * part bylo jen na papíře.
 *
 * Týdenní krok s větší váhou to řeší: čísla jsou dost velká, aby se party
 * poznaly, a přitom je to pořád pozadí proti výsledkům. Navíc to sedí i na to,
 * jak se o stadionu mluví: „ten týden nás to štvalo", ne „dneska ráno".
 */
export const STROP_ZA_TYDEN = 8;

export interface DopadProstredi {
  groupId: string;
  mood: number;
  heat: number;
  duvod: string;
}

export interface StavProstredi {
  /** Úrovně zařízení 0–3. */
  facilities: Record<string, number>;
  pitchCondition: number;
  /**
   * Občerstvení: poměr ceny k doporučené a kvalita 0–3 za druh.
   * Prázdné = klub prodej nemá, což štamgastům vadí samo o sobě.
   */
  produkty: Array<{ key: string; quality: number; priceRatio: number }>;
}

/**
 * Jak se partě líbí, kam chodí.
 *
 * Vrací posun nálady za jeden herní týden. Prostředí je pozadí, ne událost,
 * ale za měsíc chození na rozbitý stadion to nasčítá dost, aby se to poznalo.
 */
export function dopadProstredi(g: {
  kind: FanGroupKind; id: string;
}, stav: StavProstredi): DopadProstredi {
  const zajem = ZAJEM[g.kind] ?? {};
  let soucet = 0;
  let vaha = 0;
  const stiznosti: string[] = [];
  const chvaly: string[] = [];

  const pridej = (klic: string, hodnota: number, popisSpatne: string, popisDobre: string) => {
    const w = zajem[klic] ?? 0;
    if (w <= 0) return;
    // hodnota 0–1: 0,5 je „ujde", pod tím vadí, nad tím těší.
    soucet += (hodnota - 0.5) * 2 * w;
    vaha += w;
    if (hodnota <= 0.25) stiznosti.push(popisSpatne);
    else if (hodnota >= 0.85) chvaly.push(popisDobre);
  };

  const uroven = (k: string) => Math.max(0, Math.min(3, stav.facilities[k] ?? 0)) / 3;

  pridej("toilets", uroven("toilets"), "záchody", "sociálky");
  pridej("roof", uroven("roof"), "žádná střecha", "zastřešení");
  pridej("stands", uroven("stands"), "není kde sedět", "tribuna");
  pridej("parking", uroven("parking"), "není kde parkovat", "parkoviště");
  pridej("ultras_stand", uroven("ultras_stand"), "mizerný sektor", "sektor kotle");
  pridej("pitch", Math.max(0, Math.min(100, stav.pitchCondition)) / 100, "rozorané hřiště", "trávník");

  // Občerstvení: kvalita proti ceně. Drahé a špatné je horší než nic.
  if (stav.produkty.length === 0) {
    pridej("refreshments", 0, "zavřený bufet", "");
  } else {
    const skore = stav.produkty.reduce((s, p) => {
      const kvalita = Math.max(0, Math.min(3, p.quality)) / 3;
      // Poměr 1 = doporučená cena. Nad 1,6 už to lidi štve, pod 0,9 chválí.
      const cena = p.priceRatio <= 0.9 ? 1 : p.priceRatio >= 1.8 ? 0 : 1 - (p.priceRatio - 0.9) / 0.9;
      return s + (kvalita * 0.55 + cena * 0.45);
    }, 0) / stav.produkty.length;
    const predrazene = stav.produkty.some((p) => p.priceRatio >= 1.8);
    pridej("refreshments", skore, predrazene ? "přemrštěné ceny v bufetu" : "mizerný bufet", "bufet");
  }

  if (vaha <= 0) return { groupId: g.id, mood: 0, heat: 0, duvod: "" };

  const normalizovane = soucet / vaha; // −1 až 1
  const mood = Math.round(normalizovane * STROP_ZA_TYDEN);
  // Naštvanost roste jen z toho, co vysloveně vadí. Pěkný stadion ji nesnižuje,
  // to je věcí jednání, ne zastřešení.
  const heat = stiznosti.length >= 2 ? 1 : 0;

  const duvod = stiznosti.length > 0
    ? `Vadí jim: ${stiznosti.slice(0, 3).join(", ")}.`
    : chvaly.length > 0
      ? `Líbí se jim ${chvaly.slice(0, 2).join(" a ")}.`
      : "";

  return { groupId: g.id, mood, heat, duvod };
}

/**
 * Kamarádíš se s trenérem klubu, se kterým mají vyřízené účty.
 *
 * Fanoušci to nesou hůř než prohru: rvali se s jejich kotlem a ty s jejich
 * trenérem popíjíš. Týká se to jen part, které rivalitu žijí, tedy kotle
 * a party z okolí. Rodiny to neřeší.
 */
export async function dopadKamaradeniSRivalem(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<{ heat: number; duvod: string; souper: string } | null> {
  const spojenci = await db
    .prepare(
      `SELECT CASE WHEN team_a_id = ?1 THEN team_b_id ELSE team_a_id END AS druhy, respect
       FROM manager_relations
       WHERE (team_a_id = ?1 OR team_b_id = ?1) AND respect >= ?2`,
    )
    .bind(teamId, ALLY_RESPECT_THRESHOLD)
    .all<{ druhy: string; respect: number }>()
    .catch((e) => { logger.warn({ module: M }, `spojenci ${teamId}`, e); return null; });
  if (!spojenci || spojenci.results.length === 0) return null;

  const { rivaloveKlubu } = await import("./fan-rivalries");
  const rivalove = await rivaloveKlubu(db, teamId, gameDate, 6);

  for (const s of spojenci.results) {
    const r = rivalove.find((x) => x.teamId === s.druhy);
    if (!r || !rivalitaHorka(r.heat)) continue;
    // Čím vřelejší kamarádství a čím horčejší rivalita, tím hůř.
    const heat = Math.min(6, 2 + Math.round((s.respect - ALLY_RESPECT_THRESHOLD) / 15) + Math.round(r.heat / 40));
    return {
      heat,
      souper: r.name,
      duvod: `Kamarádíš se s trenérem klubu ${r.name}. S jejich lidmi se rveme a ty s ním chodíš na pivo.`,
    };
  }
  return null;
}

/** Které party rivalitu žijí. Rodiny a pamětníci to neřeší. */
export function zijeRivalitu(kind: string): boolean {
  return kind === "kotel" || kind === "parta_z_okoli";
}

/** Načte stav prostředí pro jeden klub. */
export async function nactiProstredi(db: D1Database, teamId: string): Promise<StavProstredi | null> {
  const s = await db
    .prepare(
      `SELECT toilets, roof, stands, parking, ultras_stand, refreshments, pitch_condition
       FROM stadiums WHERE team_id = ?`,
    )
    .bind(teamId)
    .first<Record<string, number>>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${teamId}`, e); return null; });
  if (!s) return null;

  const produkty = await db
    .prepare("SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ? AND quality_level > 0")
    .bind(teamId)
    .all<{ product_key: string; quality_level: number; sell_price: number }>()
    .catch((e) => { logger.warn({ module: M }, `občerstvení ${teamId}`, e); return { results: [] as never[] }; });

  const { CONCESSION_CATALOG } = await import("../season/concession-catalog");
  return {
    facilities: {
      toilets: s.toilets ?? 0, roof: s.roof ?? 0, stands: s.stands ?? 0,
      parking: s.parking ?? 0, ultras_stand: s.ultras_stand ?? 0,
      refreshments: s.refreshments ?? 0,
    },
    pitchCondition: s.pitch_condition ?? 50,
    produkty: produkty.results.map((p) => {
      const katalog = CONCESSION_CATALOG[p.product_key as keyof typeof CONCESSION_CATALOG];
      const tier = katalog?.tiers?.[p.quality_level];
      const doporucena = tier?.defaultSellPrice ?? 0;
      return {
        key: p.product_key,
        quality: p.quality_level,
        priceRatio: doporucena > 0 ? p.sell_price / doporucena : 1,
      };
    }),
  };
}
