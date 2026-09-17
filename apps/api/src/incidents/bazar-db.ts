/**
 * Kradené zboží v bazaru: vystavení, nákup a nahlášení policii (spec Část 8).
 */

import { CATEGORIES, CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { cenaKradenehoZbozi, jePoznatelne, jmenoProdejce, kradeneZbozi } from "./bazar";
import { smsIncidentu } from "./incident-db";
import { BONUS_POLICIE, KRADENE_INZERAT_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { prikazyStop } from "./stopy-db";
import { text } from "./texty";

const M = "incidents-bazar";

type RadekKVystaveni = { id: string; league_id: string; status: string; loss: string; district: string | null };

/** Obce okresu ligy pro jméno prodejce. Rezervy mají okres s příponou U21. */
async function obceOkresu(db: D1Database, district: string | null): Promise<string[]> {
  const okres = district?.replace(/\s+U21$/, "").trim();
  if (!okres) return [];
  const rows = await db.prepare("SELECT name FROM villages WHERE district = ? ORDER BY name LIMIT 60")
    .bind(okres).all<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, `obce okresu ${okres}`, e); return null; });
  return (rows?.results ?? []).map((r) => r.name);
}

/**
 * Vystaví kradené zboží, kterému nastal den bazaru (spec 6b krok 6). Okradený klub pozná jen
 * poznatelné věci: SMS od Kustoda a u neuzavřeného incidentu stopa `bazar` s bonusem pro policii.
 * Vrací počet nových inzerátů. `ted` je reálný čas pro expiraci, shodně s ostatními inzeráty.
 */
export async function vystavKradeneZbozi(
  env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, ted: Date = new Date(),
): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.league_id, i.status, i.loss, l.district
       FROM club_incidents i
       LEFT JOIN leagues l ON l.id = i.league_id
      WHERE i.team_id = ? AND i.season_number = ? AND i.bazar_on IS NOT NULL AND i.bazar_on <= ?
        AND i.recovered = 0 AND i.league_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id)`,
  ).bind(t.teamId, t.seasonNumber, t.gameDate).all<RadekKVystaveni>()
    .catch((e) => { logger.warn({ module: M }, `kradené zboží k vystavení ${t.teamId}`, e); return null; });

  const expirace = new Date(ted);
  expirace.setDate(expirace.getDate() + KRADENE_INZERAT_DNI);

  let vystaveno = 0;
  for (const inc of rows?.results ?? []) {
    const rng = createRng(seedFromString(`bazar-inzerat|${inc.id}`));
    const obce = await obceOkresu(db, inc.district);
    for (const z of kradeneZbozi(nactiZtraty(inc.loss))) {
      // Kategorie jde do bazaru a později do názvu sloupce při nákupu: whitelist je povinný.
      if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
        logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${inc.id}`);
        continue;
      }
      const vlozeno = await db.prepare(
        `INSERT OR IGNORE INTO equipment_listings
           (id, team_id, league_id, category, level, condition_at_listing, price, expires_at, is_ai_listing, seller_name, incident_id)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        `bazar-${inc.id}-${z.kategorie}`, inc.league_id, z.kategorie, z.uroven, z.stav,
        cenaKradenehoZbozi(z.kategorie, z.uroven, z.stav), expirace.toISOString(), jmenoProdejce(obce, rng), inc.id,
      ).run()
        .catch((e) => { logger.error({ module: M }, `inzerát kradeného zboží ${inc.id}`, e); return null; });
      if ((vlozeno?.meta?.changes ?? 0) === 0) continue;
      vystaveno++;
      if (!jePoznatelne(z.kategorie, z.uroven)) continue;

      const vec = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
      if (inc.status !== "uzavreny") {
        await db.batch(prikazyStop(db, t.teamId, inc.id, [{
          zdroj: "bazar", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1,
          bonusPolicie: BONUS_POLICIE.bazar, nalezena: true, text: text(rng, "stopa_bazar", { vec }),
        }], t.gameDate)).catch((e) => logger.warn({ module: M }, `stopa bazaru ${inc.id}`, e));
      }
      await sendSystemSMS(db, t.teamId, SMS_ROLE_KUSTOD, `🛒 ${text(rng, "bazar_poznano", { vec })}`, smsIncidentu(inc.id))
        .catch((e) => logger.warn({ module: M }, `SMS bazaru ${inc.id}`, e));
    }
  }
  return vystaveno;
}
