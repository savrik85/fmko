/**
 * Narovnání potenciálu dorostenců, kteří vznikli podle starých pravidel.
 *
 * Dorostenci v rozehrané lize dostali při generování AI penalizaci: −4 až −8 ze stropů
 * dovedností, a šance na výrazný talent neexistovala vůbec. Naměřeno na kádru lidského
 * klubu — strop ø 53,2 proti laťce základní sestavy 52, takže nad ni dosáhlo jen 11 z 30
 * kluků. Dnešní generátor dává stropu ø 59,1 a 7 % ročníku výrazný talent.
 *
 * Tohle NENÍ přegenerování. Hráči zůstávají se svým jménem, věkem i tím, co dnes umí —
 * mění se jen strop, kam můžou dorůst, a skrytý talent. Smyslem je, aby šlo současného
 * dorostence vypiplat do áčka, ne aby se kádr vyměnil za nový.
 *
 * Penalizace brala DVĚ věci a vrací se obě: 4–8 ze stropů a 6–12 ze současných hodnot.
 * Zvednout jen stropy nestačilo — kluci sice měli kam růst, ale startovali tak nízko,
 * že do základní sestavy nebyl připravený ani jeden z třiceti a nejrychlejší cesta trvala
 * dvě sezóny. Současná hodnota se přitom nikdy nedostane nad vlastní strop, takže se tím
 * hráč „nedotrénuje" zadarmo — jen se vrací tam, kde měl začínat.
 *
 * Sahá VÝHRADNĚ na hráče, kteří vznikli před opravou generátoru. Kdo se narodil potom,
 * penalizaci nikdy nedostal a přidat mu šest až dvanáct bodů by bylo rozdávání zadarmo —
 * a protože značka hlídá jen dvojí spuštění, ne stáří hráče, sklaplo by to na každém
 * novém ročníku, kdyby někdo endpoint pustil znovu.
 *
 * Nad úroveň základní sestavy vlastního áčka oprava nikoho nevytáhne. Naměřeno na produkci:
 * u 2 z 23 klubů by nejlepší dorostenec laťku přerostl o víc než deset bodů, protože jejich
 * áčko je slabé (laťky jdou od 35 do 59). Smyslem je zpřístupnit áčko, ne vyrobit hvězdu,
 * která ho hned přeroste — strop zůstává nedotčený, takže dorůst tam pořád může, jen se
 * o to musí vytrénovat.
 */

import { logger } from "../lib/logger";
import { overallRatingFromFlat } from "../skills/generator";

const M = "narovnani-dorostu";

/** Kolik bodů stropu sebrala stará AI penalizace — tolik se vrací. */
const NAVRAT_STROPU_MIN = 4;
const NAVRAT_STROPU_MAX = 8;

/** Jak často se v ročníku urodí kluk, co vesnici přeroste — stejně jako v generátoru. */
const SANCE_NA_KLENOT = 0.07;
const KLENOT_TALENT_MIN = 70;
const KLENOT_TALENT_MAX = 95;
const KLENOT_STROP_MIN = 12;
const KLENOT_STROP_MAX = 25;

/** Spodní hranice talentu po narovnání — dnešní generátor dává na vesnici 0–40. */
const TALENT_STROP_VESNICE = 40;

/** Kolik bodů současné hodnoty sebrala stará AI penalizace — tolik se vrací. */
const NAVRAT_HODNOTY_MIN = 6;
const NAVRAT_HODNOTY_MAX = 12;

/**
 * Značka v `life_context`, aby druhé spuštění hráče nezvedlo podruhé.
 * Verze 1 narovnala jen stropy, verze 2 i současné hodnoty — hráč se značkou 1 tedy
 * ještě jednou projde, ale sáhne se mu pouze na to, co mu chybí.
 */
const ZNACKA = "potencialNarovnan";
const VERZE = 2;

/** Dovednosti uložené v `physical`, ne v plochém `skills`. */
const FYZICKE = new Set(["stamina", "strength"]);

/**
 * Kolik prostoru musí hráči nad jeho dnešní hodnotou zůstat, podle věku.
 *
 * Bez téhle pojistky si narovnání sežralo samo sebe: strop se zvedl o 4–8, ale současná
 * hodnota o 6–12 (ořezaná stropem), takže hráč skončil zase přesně na stropu. Naměřeno
 * na produkci u sedmnáctiletého útočníka — rychlost 50 při stropu 50, střelba 63 při
 * stropu 63, tedy nula prostoru růst. Sedmnáctiletý na svém maximu je nesmysl.
 */
function minimalniProstor(vek: number): number {
  if (vek <= 19) return 18;
  if (vek <= 23) return 12;
  if (vek <= 27) return 8;
  if (vek <= 31) return 4;
  return 2;
}

/**
 * Datum opravy generátoru. Hráč vzniklý později penalizaci nedostal, takže nemá co vracet.
 * Datum je pevné schválně: kdyby se odvozovalo od „teď", každé pozdější spuštění by
 * narovnalo i ročník, který vznikl už podle správných pravidel.
 */
const GENERATOR_OPRAVEN = "2026-08-26";

export interface VysledekNarovnani {
  upraveno: number;
  preskoceno: number;
  klenotu: number;
  stropPred: number;
  stropPo: number;
  /** Průměrné hodnocení dorostu před zásahem a po něm. */
  hodnoceniPred: number;
  hodnoceniPo: number;
}

/**
 * Stabilní pseudonáhoda z textu, 0–1. Musí být deterministická: dvakrát spuštěné
 * narovnání nesmí témuž hráči přiřknout jiný strop, a bez značky by se rozdíl neprojevil.
 */
function stabilniHodnota(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Narovná potenciál dorostenců jednoho týmu.
 *
 * Strop se jen zvedá, nikdy nesnižuje, a nepřeleze 100. Hráč, který má stropy v pořádku
 * (vznikl už podle nových pravidel), se pozná podle značky a přeskočí se.
 */
export async function narovnejPotencialDorostu(
  db: D1Database,
  u21TeamId: string,
): Promise<VysledekNarovnani> {
  // Laťka základní sestavy áčka — přes ni oprava nikoho nepustí.
  const latka = await db.prepare(
    `SELECT ROUND(AVG(CASE WHEN poradi <= 11 THEN overall_rating END)) AS sestava
       FROM (SELECT overall_rating, ROW_NUMBER() OVER (ORDER BY overall_rating DESC) AS poradi
               FROM players
              WHERE team_id = (SELECT parent_team_id FROM teams WHERE id = ?)
                AND (status IS NULL OR status = 'active'))`,
  ).bind(u21TeamId).first<{ sestava: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load senior bar", e); return null; });
  const latkaSestavy = latka?.sestava ?? null;

  const vysledek: VysledekNarovnani = {
    upraveno: 0, preskoceno: 0, klenotu: 0, stropPred: 0, stropPo: 0, hodnoceniPred: 0, hodnoceniPo: 0,
  };

  const hraci = await db.prepare(
    `SELECT id, position, age, overall_rating, weekly_wage, hidden_talent, skills, physical, skills_max, life_context
       FROM players
      WHERE team_id = ? AND (status IS NULL OR status = 'active') AND skills_max IS NOT NULL
        AND (created_at IS NULL OR date(created_at) < ?)`,
  ).bind(u21TeamId, GENERATOR_OPRAVEN).all<{
    id: string; position: string; age: number; overall_rating: number; weekly_wage: number | null;
    hidden_talent: number | null; skills: string | null; physical: string | null;
    skills_max: string; life_context: string | null;
  }>()
    .catch((e) => { logger.warn({ module: M, teamId: u21TeamId }, "load youth", e); return { results: [] as never[] }; });

  const prikazy: D1PreparedStatement[] = [];
  let soucetPred = 0, soucetPo = 0, pocitano = 0;
  let ratingPred = 0, ratingPo = 0, ratingu = 0;

  for (const h of hraci.results) {
    let ctx: Record<string, unknown> = {};
    try { ctx = h.life_context ? JSON.parse(h.life_context) as Record<string, unknown> : {}; }
    catch (e) { logger.warn({ module: M, playerId: h.id }, "parse life_context", e); ctx = {}; }
    const verzeHrace = typeof ctx[ZNACKA] === "number" ? ctx[ZNACKA] as number : ctx[ZNACKA] ? 1 : 0;
    if (verzeHrace >= VERZE) { vysledek.preskoceno++; continue; }
    // Stropy už narovnané ve verzi 1 se podruhé nezvedají — chybí jen současné hodnoty
    const resitStropy = verzeHrace < 1;

    let sm: Record<string, { current?: number; maxPotential?: number }>;
    try { sm = JSON.parse(h.skills_max) as typeof sm; }
    catch (e) { logger.warn({ module: M, playerId: h.id }, "parse skills_max", e); vysledek.preskoceno++; continue; }

    const jeKlenot = stabilniHodnota(`${h.id}:klenot`) < SANCE_NA_KLENOT;
    if (jeKlenot && !resitStropy) vysledek.klenotu++;
    const rozsah = NAVRAT_STROPU_MAX - NAVRAT_STROPU_MIN;
    let pridat = NAVRAT_STROPU_MIN + Math.round(stabilniHodnota(`${h.id}:strop`) * rozsah);
    if (jeKlenot) {
      pridat += KLENOT_STROP_MIN + Math.round(stabilniHodnota(`${h.id}:bonus`) * (KLENOT_STROP_MAX - KLENOT_STROP_MIN));
      vysledek.klenotu++;
    }

    let pred = 0, po = 0, dovednosti = 0;
    for (const [nazev, hodnoty] of Object.entries(sm)) {
      const strop = hodnoty?.maxPotential;
      if (typeof strop !== "number") continue;
      // Zkušenost má strop 100 odjakživa, zvedat ji nemá co
      if (nazev === "experience") continue;
      const novy = resitStropy ? Math.min(100, strop + pridat) : strop;
      pred += strop; po += novy; dovednosti++;
      sm[nazev] = { ...hodnoty, maxPotential: novy };
    }
    if (dovednosti === 0) { vysledek.preskoceno++; continue; }
    soucetPred += pred / dovednosti; soucetPo += po / dovednosti; pocitano++;

    // ── Současné hodnoty: vrátit, co sebrala penalizace, ale nikdy nad vlastní strop ──
    let skills: Record<string, unknown> = {};
    let physical: Record<string, unknown> = {};
    try { skills = h.skills ? JSON.parse(h.skills) as Record<string, unknown> : {}; }
    catch (e) { logger.warn({ module: M, playerId: h.id }, "parse skills", e); }
    try { physical = h.physical ? JSON.parse(h.physical) as Record<string, unknown> : {}; }
    catch (e) { logger.warn({ module: M, playerId: h.id }, "parse physical", e); }

    const zadanyPridavek = NAVRAT_HODNOTY_MIN
      + Math.round(stabilniHodnota(`${h.id}:hodnota`) * (NAVRAT_HODNOTY_MAX - NAVRAT_HODNOTY_MIN));

    /** Zvedne dovednosti o `kolik` a vrátí, na jaké hodnocení to vyjde. */
    const talentDnes = h.hidden_talent ?? 0;
    const novyTalent = jeKlenot
      ? Math.max(talentDnes, KLENOT_TALENT_MIN + Math.round(stabilniHodnota(`${h.id}:talent`) * (KLENOT_TALENT_MAX - KLENOT_TALENT_MIN)))
      : Math.max(talentDnes, Math.round(stabilniHodnota(`${h.id}:tal2`) * TALENT_STROP_VESNICE));

    const zkusPridavek = (kolik: number): { rating: number; skills: Record<string, unknown>; physical: Record<string, unknown>; sm: typeof sm } => {
      const s2 = { ...skills }, f2 = { ...physical };
      const sm2: typeof sm = {};
      for (const [nazev, hodnoty] of Object.entries(sm)) sm2[nazev] = { ...hodnoty };
      for (const [nazev, hodnoty] of Object.entries(sm2)) {
        if (nazev === "experience") continue;
        const strop = hodnoty?.maxPotential;
        if (typeof strop !== "number") continue;
        const zdroj = FYZICKE.has(nazev) ? f2 : s2;
        const dnes = zdroj[nazev];
        if (typeof dnes !== "number") continue;
        const nova = Math.min(strop, 100, dnes + kolik);
        zdroj[nazev] = nova;
        // Strop musí nad hráčem nechat prostor odpovídající jeho věku — jinak si
        // narovnání sežere samo sebe a hráč skončí zase na maximu.
        const sProstorem = Math.min(100, Math.max(strop, nova + minimalniProstor(h.age)));
        // Snímek uvnitř `skills_max` drží krok s živou hodnotou, jinak by si čísla o témž
        // hráči protiřečila (profil ho čte jako záložní zdroj pro přehled a zkušenost).
        sm2[nazev] = { ...sm2[nazev], current: nova, maxPotential: sProstorem };
      }
      // Hodnocení se počítá z NOVÉHO talentu, ne ze starého. Dnes už na výsledku nic
      // nemění (talent se do hodnocení nezapočítává), ale při prvním běhu ještě ano:
      // bonus byl talent × 0,15, takže skok z talentu 1 na 94 znamenal +14 bodů.
      // Narovnání zapsalo hodnocení spočítané ze starého talentu, noční přepočet
      // v denním ticku ho pak dopočítal s novým — a v tabulkách to vypadalo jako
      // skokové zlepšení z ničeho nic (potvrzeno na produkci: 172 ze 191 skoků
      // v noci 27.→28. 8. 2026 se přesně rovnalo talent × 0,15).
      // Předává se dál i tak: co narovnání zapisuje, má odpovídat tomu, co spočítalo.
      const r = overallRatingFromFlat(h.position, s2, f2, novyTalent, sm2);
      return { rating: r !== null ? Math.max(1, r) : h.overall_rating, skills: s2, physical: f2, sm: sm2 };
    };

    // Největší přídavek, po kterém hráč nepřeroste základní sestavu vlastního áčka.
    // Kdo už je nad laťkou, nedostane nic — pomoc nepotřebuje.
    let pokus = zkusPridavek(zadanyPridavek);
    if (latkaSestavy !== null) {
      for (let kolik = zadanyPridavek; kolik >= 0 && pokus.rating > latkaSestavy; kolik--) {
        pokus = zkusPridavek(kolik);
      }
    }
    skills = pokus.skills;
    physical = pokus.physical;
    sm = pokus.sm;
    const rating = pokus.rating;
    ratingPred += h.overall_rating; ratingPo += rating; ratingu++;

    // Mzda se posouvá v poměru, v jakém se změnilo hodnocení — stejně jako po tréninku.
    // Přepsat ji holým vzorcem by smazalo vyjednaná navýšení.
    const zakladMzdy = (r: number) => Math.round(10 + (r / 100) * 400);
    const stara = h.weekly_wage ?? 0;
    const starýZaklad = zakladMzdy(h.overall_rating);
    const novaMzda = stara > 0 && starýZaklad > 0
      ? Math.round(stara * (zakladMzdy(rating) / starýZaklad))
      : zakladMzdy(rating);

    ctx[ZNACKA] = VERZE;
    prikazy.push(
      db.prepare(
        `UPDATE players SET skills = ?, physical = ?, skills_max = ?, hidden_talent = ?,
                            overall_rating = ?, weekly_wage = ?, life_context = ? WHERE id = ?`,
      ).bind(
        JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(sm), novyTalent,
        rating, novaMzda, JSON.stringify(ctx), h.id,
      ),
    );
    vysledek.upraveno++;
  }

  if (prikazy.length > 0) {
    // Po dávkách, ať se nenarazí na limit podpožadavků u velkých kádrů
    for (let i = 0; i < prikazy.length; i += 40) {
      await db.batch(prikazy.slice(i, i + 40))
        .catch((e) => logger.error({ module: M, teamId: u21TeamId }, "batch update youth", e));
    }
  }

  vysledek.stropPred = pocitano ? Math.round((soucetPred / pocitano) * 10) / 10 : 0;
  vysledek.stropPo = pocitano ? Math.round((soucetPo / pocitano) * 10) / 10 : 0;
  vysledek.hodnoceniPred = ratingu ? Math.round((ratingPred / ratingu) * 10) / 10 : 0;
  vysledek.hodnoceniPo = ratingu ? Math.round((ratingPo / ratingu) * 10) / 10 : 0;
  return vysledek;
}

/** Narovná dorosty všech klubů daného typu vlastníka. */
export async function narovnejDorosty(
  db: D1Database,
  scope: "ai" | "human" | "all",
): Promise<VysledekNarovnani & { tymu: number }> {
  const filtr = scope === "ai" ? " AND rodic.user_id = 'ai'"
    : scope === "human" ? " AND rodic.user_id != 'ai'" : "";

  // I hráči v A-týmu. Penalizace generátoru se týkala HRÁČŮ, ne soupisek — omezit
  // narovnání na U21 znamenalo, že 592 z 597 hráčů áček zůstalo se starými stropy,
  // mezi nimi i sedmnáctiletí, kteří už nemohli vyrůst ani o bod.
  const tymy = await db.prepare(
    `SELECT t.id FROM teams t JOIN teams rodic ON rodic.id = COALESCE(t.parent_team_id, t.id)
      WHERE t.team_type IN ('u21', 'senior')${filtr}`,
  ).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, "load u21 teams", e); return { results: [] as never[] }; });

  const souhrn = {
    tymu: 0, upraveno: 0, preskoceno: 0, klenotu: 0,
    stropPred: 0, stropPo: 0, hodnoceniPred: 0, hodnoceniPo: 0,
  };
  let vazenoPred = 0, vazenoPo = 0, ratPred = 0, ratPo = 0, tymuSDaty = 0;
  for (const t of tymy.results) {
    const v = await narovnejPotencialDorostu(db, t.id);
    souhrn.tymu++;
    souhrn.upraveno += v.upraveno;
    souhrn.preskoceno += v.preskoceno;
    souhrn.klenotu += v.klenotu;
    if (v.upraveno > 0) {
      vazenoPred += v.stropPred; vazenoPo += v.stropPo;
      ratPred += v.hodnoceniPred; ratPo += v.hodnoceniPo;
      tymuSDaty++;
    }
  }
  souhrn.stropPred = tymuSDaty ? Math.round((vazenoPred / tymuSDaty) * 10) / 10 : 0;
  souhrn.stropPo = tymuSDaty ? Math.round((vazenoPo / tymuSDaty) * 10) / 10 : 0;
  souhrn.hodnoceniPred = tymuSDaty ? Math.round((ratPred / tymuSDaty) * 10) / 10 : 0;
  souhrn.hodnoceniPo = tymuSDaty ? Math.round((ratPo / tymuSDaty) * 10) / 10 : 0;
  return souhrn;
}
