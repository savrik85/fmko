/**
 * Dospívání mladých hráčů.
 *
 * Šestnáctiletý kluk zesílí a zrychlí sám od sebe — ne jen tím, že chodí na trénink.
 * Bez toho byla mládež ve hře k ničemu: simulace nad skutečnou `simulateTraining()`
 * ukázala, že běžný dorostenec (talent 15) se do základní sestavy nedostane NIKDY,
 * slibný kluk potřeboval 6 sezón na průměr kádru a mezi průměrným klukem a výjimečným
 * talentem byl rozdíl jen dvě sezóny. Talent tak fakticky nic neznamenal.
 *
 * Přírůstek řídí SKRYTÝ TALENT — právě proto, aby se vyplatilo hledat a piplat klenoty:
 *   talent  15 → +4 body    (do sestavy za ~6 sezón)
 *   talent  40 → +7 bodů    (za ~3 sezóny)
 *   talent  60 → +8 bodů    (za ~2,5 sezóny)
 *   talent  90 → +11 bodů   (za ~1,7 sezóny)
 *
 * Nikdy nepřeroste `skills_max` — strop zůstává tím, co určuje, kam až hráč může dojít.
 */

import { logger } from "../lib/logger";

const M = "dospivani";

/** Do kolika let hráč dospívá. Po dvacítce už ho posouvá jen trénink a zápasy. */
export const DOSPIVANI_DO_VEKU = 21;

/** Atributy, které dospíváním rostou. Zkušenost ne — tu dávají odehrané minuty. */
const ATRIBUTY = [
  "speed", "technique", "shooting", "passing", "heading", "defense",
  "vision", "creativity", "setPieces", "stamina", "strength", "goalkeeping",
] as const;

/**
 * Kolik bodů hráč povyroste za sezónu. Základ dostane každý mladík, zbytek podle talentu —
 * bez toho by se piplání klenotu nelišilo od piplání kohokoli jiného.
 */
export function bodyDospivani(vek: number, talent: number): number {
  if (vek > DOSPIVANI_DO_VEKU) return 0;
  // Základ zvednutý ze 3 na 4: i kluk bez talentu má za pět let dorostu (16–21) posbírat
  // dvacet bodů dovedností, ne patnáct. Talentovaný dostává dál výrazně víc.
  return Math.round(4 + Math.max(0, Math.min(100, talent)) / 100 * 9);
}

export interface VysledekDospivani {
  playerId: string;
  jmeno: string;
  vek: number;
  bodu: number;
  /** Kolik atributů se opravdu pohnulo (zbytek už byl na stropu). */
  zmenenoAtributu: number;
  ratingPred: number;
  ratingPo: number;
}

/**
 * Nechá dospět všechny mladé hráče jednoho týmu. Volá se na konci sezóny, PO tom,
 * co se hráčům zvedl věk.
 *
 * Brankáře řeší stejně jako hráče v poli — `goalkeeping` je v seznamu atributů.
 */
export async function dospejMladeHrace(db: D1Database, teamId: string): Promise<VysledekDospivani[]> {
  const hraci = await db.prepare(
    `SELECT id, first_name, last_name, age, position, overall_rating, hidden_talent,
            skills, physical, skills_max
       FROM players
      WHERE team_id = ? AND age <= ? AND (status IS NULL OR status = 'active')`,
  ).bind(teamId, DOSPIVANI_DO_VEKU).all<{
    id: string; first_name: string; last_name: string; age: number; position: string;
    overall_rating: number; hidden_talent: number | null;
    skills: string; physical: string | null; skills_max: string | null;
  }>().catch((e) => { logger.warn({ module: M, teamId }, "load young players", e); return { results: [] as never[] }; });

  if (hraci.results.length === 0) return [];

  const { overallRatingFromFlat } = await import("../skills/generator");
  const vysledky: VysledekDospivani[] = [];
  const zapisy: D1PreparedStatement[] = [];

  for (const h of hraci.results) {
    const talent = h.hidden_talent ?? 0;
    const bodu = bodyDospivani(h.age, talent);
    if (bodu <= 0) continue;

    let skills: Record<string, number>;
    let physical: Record<string, unknown>;
    let stropy: Record<string, { maxPotential?: number }>;
    try {
      skills = JSON.parse(h.skills) as Record<string, number>;
      physical = h.physical ? JSON.parse(h.physical) as Record<string, unknown> : {};
      stropy = h.skills_max ? JSON.parse(h.skills_max) as Record<string, { maxPotential?: number }> : {};
    } catch (e) {
      logger.warn({ module: M, playerId: h.id }, "parse player json", e);
      continue;
    }

    let zmeneno = 0;
    for (const attr of ATRIBUTY) {
      const soucasna = skills[attr];
      if (typeof soucasna !== "number") continue;
      // Brankářskou dovednost hráči v poli nezvedáme — mají tam jedničku a má tam zůstat
      if (attr === "goalkeeping" && h.position !== "GK") continue;

      const strop = Math.min(100, stropy[attr]?.maxPotential ?? 100);
      if (soucasna >= strop) continue;

      skills[attr] = Math.min(strop, soucasna + bodu);
      zmeneno++;
    }

    if (zmeneno === 0) continue;

    // Výdrž a síla drží pravdu v `physical` — bez tohohle by je zápasový engine neviděl
    for (const attr of ["stamina", "strength"] as const) {
      if (typeof skills[attr] === "number") physical[attr] = skills[attr];
    }

    const novyRating = overallRatingFromFlat(h.position, skills, physical, talent, stropy);
    const ratingPo = novyRating !== null ? Math.max(1, novyRating) : h.overall_rating;

    // Mzda roste s hodnocením ve stejném poměru jako po tréninku (daily-tick)
    const zakladniMzda = (r: number) => Math.round(10 + (r / 100) * 400);
    const pomer = zakladniMzda(h.overall_rating) > 0
      ? zakladniMzda(ratingPo) / zakladniMzda(h.overall_rating)
      : 1;

    // Zápisy se sbírají do dávky — po jednom by 300 dorostenců přes všechny kluby
    // vyčerpalo limit subrequestů dřív, než by rollover doběhl.
    zapisy.push(
      db.prepare(
        "UPDATE players SET skills = ?, physical = ?, overall_rating = ?, weekly_wage = ROUND(weekly_wage * ?) WHERE id = ?",
      ).bind(JSON.stringify(skills), JSON.stringify(physical), ratingPo, pomer, h.id),
      // Do tréninkového deníku, ať je v profilu vidět, odkud ten skok přišel
      db.prepare(
        `INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date)
         VALUES (?, ?, 'dospivani', ?, ?, ?, 'dospivani', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      ).bind(h.id, teamId, h.overall_rating, ratingPo, ratingPo - h.overall_rating),
    );

    vysledky.push({
      playerId: h.id,
      jmeno: `${h.first_name} ${h.last_name}`,
      vek: h.age,
      bodu,
      zmenenoAtributu: zmeneno,
      ratingPred: h.overall_rating,
      ratingPo,
    });
  }

  // D1 zvládne ~40 příkazů v dávce, proto po částech
  for (let i = 0; i < zapisy.length; i += 40) {
    await db.batch(zapisy.slice(i, i + 40))
      .catch((e) => logger.warn({ module: M, teamId }, "save maturation batch", e));
  }

  if (vysledky.length > 0) {
    logger.info({ module: M, teamId }, `dospělo ${vysledky.length} mladých hráčů`);
  }
  return vysledky;
}

/**
 * SMS manažerovi o tom, kdo přes léto vyrostl. Bez zprávy by se skok v hodnocení
 * objevil potichu a manažer by si ho všiml až náhodou v kádru.
 */
export async function oznamDospivani(
  db: D1Database,
  teamId: string,
  vysledky: VysledekDospivani[],
): Promise<void> {
  // Hlásit má smysl jen ty, u kterých se hodnocení opravdu hnulo
  const vyrostli = vysledky.filter((v) => v.ratingPo > v.ratingPred).sort((a, b) => (b.ratingPo - b.ratingPred) - (a.ratingPo - a.ratingPred));
  if (vyrostli.length === 0) return;

  const radky = vyrostli.slice(0, 6).map((v) => `${v.jmeno} (${v.vek}) ${v.ratingPred} → ${v.ratingPo}`);
  const zbytek = vyrostli.length > 6 ? ` a další ${vyrostli.length - 6}` : "";
  const telo = `Přes léto kluci povyrostli: ${radky.join("; ")}${zbytek}. Podívej se na ně v kádru, někteří už můžou být na áčko.`;

  try {
    // Schránku má klub, ne dorostenecký tým — zpráva o hráčích U21 musí přijít na A-tým,
    // jinak si jí manažer nikdy nevšimne.
    const klub = await db.prepare("SELECT COALESCE(parent_team_id, id) AS club_id FROM teams WHERE id = ?")
      .bind(teamId).first<{ club_id: string }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "load club id", e); return null; });
    const clubId = klub?.club_id ?? teamId;

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
    ).bind(crypto.randomUUID(), convId, telo).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(telo.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: M, teamId }, "maturation SMS failed", e);
  }
}
