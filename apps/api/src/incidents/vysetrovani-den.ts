/**
 * Denní část vyšetřování (spec 6b, kroky 2, 3 a 5): výsledky policie,
 * propadlé lhůty a pondělní srážky ze mzdy.
 */

import { createNotification } from "../community/notifications";
import { CATEGORIES, CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng, type Rng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { uzavriProsleIncidenty } from "./dopady";
import { SLOUPCE_INCIDENTU, type IncidentRadek } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import {
  LHUTA_PO_POLICII_DNI, LHUTA_ROZHODNUTI_DNI, POVOLANI_POLICISTA, SMS_ROLE_POLICIE, SRAZKA_TYDNU,
} from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text } from "./texty";
import { hodnotaSkody, splatkaSrazky } from "./tresty";
import { sancePolicie, vysledekPolicie } from "./vysetrovani";

const M = "incidents-vysetrovani";

interface Den {
  teamId: string;
  gameDate: string;
  seasonNumber: number;
}

type IncidentSeJmenem = IncidentRadek & { first_name: string | null; last_name: string | null };
type RadekSrazky = { id: string; resolution_data: string | null; first_name: string | null; last_name: string | null };

/** Přechod ze stavu `policie`. `nastav` je vždy konstanta z tohoto souboru, nikdy vstup. */
async function prechodZPolicie(db: D1Database, id: string, nastav: string, parametry: unknown[]): Promise<boolean> {
  const r = await db.prepare(`UPDATE club_incidents SET ${nastav} WHERE id = ? AND status = 'policie'`)
    .bind(...parametry, id).run()
    .catch((e) => { logger.error({ module: M }, `přechod incidentu ${id} z policie`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

async function oznamVysledek(env: Bindings, teamId: string, incidentId: string, zprava: string): Promise<void> {
  await sendSystemSMS(env.DB, teamId, SMS_ROLE_POLICIE, `🚓 ${zprava}`)
    .catch((e) => logger.warn({ module: M }, `SMS policie ${incidentId}`, e));
  await createNotification(
    env.DB, teamId, "event", "🚓 Výsledek šetření", zprava.slice(0, 140),
    `/dashboard/incidenty?id=${encodeURIComponent(incidentId)}`, env,
  ).catch((e) => logger.warn({ module: M }, `notifikace policie ${incidentId}`, e));
}

/** Cizí pachatel dopaden: ukradené vybavení zpátky (jen když klub nemá stejné nebo lepší), za rozbité náhrada. */
async function vratZtraty(db: D1Database, t: Den, inc: IncidentRadek, nazev: string, rng: Rng): Promise<string[]> {
  const zpravy: string[] = [];
  let nahrada = 0;
  for (const z of nactiZtraty(inc.loss)) {
    if (z.typ !== "vybaveni") {
      // Rozbité se vrátit nedá, pachatel zaplatí polovinu až celou škodu.
      nahrada += Math.round((hodnotaSkody([z]) * rng.int(50, 100)) / 100);
      continue;
    }
    if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
      logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${inc.id}`);
      continue;
    }
    const vec = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
    const r = await db.prepare(
      `UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} < ?`,
    ).bind(z.uroven, z.stav, t.teamId, z.uroven).run()
      .catch((e) => { logger.error({ module: M }, `vrácení vybavení ${inc.id}`, e); return null; });
    zpravy.push(text(rng, (r?.meta?.changes ?? 0) > 0 ? "policie_vraceno" : "policie_lepsi", { vec }));
  }
  if (nahrada > 0) {
    await recordTransaction(db, t.teamId, "incident_recovery", nahrada, `Náhrada škody: ${nazev}`, t.gameDate, `nahrada-${inc.id}`)
      .catch((e) => logger.error({ module: M }, `náhrada škody ${inc.id}`, e));
    zpravy.push(text(rng, "policie_nahrada", { castka: nahrada.toLocaleString("cs-CZ") }));
  }
  if (zpravy.length === 0) zpravy.push(text(rng, "policie_dopaden", { nazev }));
  return zpravy;
}

export async function vyhodnotPolicii(env: Bindings, t: Den): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.map((s) => `i.${s}`).join(", ")},
            COALESCE(p.first_name, d.first_name) AS first_name, COALESCE(p.last_name, d.last_name) AS last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ? AND i.season_number = ? AND i.status = 'policie' AND i.police_result_on <= ?`,
  ).bind(t.teamId, t.seasonNumber, t.gameDate).all<IncidentSeJmenem>()
    .catch((e) => { logger.warn({ module: M }, `šetření policie ${t.teamId}`, e); return { results: [] as IncidentSeJmenem[] }; });

  let vyrizeno = 0;
  for (const inc of rows.results) {
    const rng = createRng(seedFromString(`policie|${inc.id}`));
    // První číslo z generátoru je los šetření, na tom stojí determinismus i testy.
    const los = rng.random();
    const stopy = await nactiStopy(db, inc.id);
    const policista = await db.prepare(
      `SELECT 1 AS ano FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
         AND json_extract(life_context, '$.occupation') = ? AND id != ? LIMIT 1`,
    ).bind(t.teamId, POVOLANI_POLICISTA, inc.culprit_player_id ?? "").first()
      .catch((e) => { logger.warn({ module: M }, `policista v kádru ${t.teamId}`, e); return null; });

    const vysledek = vysledekPolicie({
      udani: inc.resolution === "policie", pachatel: inc.culprit_type,
      sance: sancePolicie(stopy, policista !== null), los,
    });
    const nazev = nazevIncidentu(inc.kind);
    const hrac = [inc.first_name, inc.last_name].filter(Boolean).join(" ") || "hráč z kádru";

    let prosel = false;
    let zprava = "";
    switch (vysledek) {
      case "neuspech":
        prosel = await prechodZPolicie(db, inc.id, "status = 'otevreny', police_success = 0, deadline = ?", [gameExpiry(t.gameDate, LHUTA_PO_POLICII_DNI)]);
        zprava = text(rng, "policie_neuspech", { nazev });
        break;
      case "podminka":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, resolved_on = ?", [t.gameDate]);
        zprava = text(rng, "policie_podminka", { hrac });
        break;
      case "odhalen_hrac":
        prosel = await prechodZPolicie(db, inc.id, "status = 'otevreny', police_success = 1, culprit_revealed = 1, deadline = ?", [gameExpiry(t.gameDate, LHUTA_ROZHODNUTI_DNI)]);
        zprava = text(rng, "policie_hrac", { hrac });
        if (prosel) {
          await db.batch(prikazyStop(db, t.teamId, inc.id, [{
            zdroj: "policie", ukazujeNa: inc.culprit_player_id, podezreli: null, drzitel: null,
            sila: 3, bonusPolicie: 0, nalezena: true, text: text(rng, "stopa_policie_hrac", { hrac }),
          }], t.gameDate)).catch((e) => logger.warn({ module: M }, `stopa policie ${inc.id}`, e));
        }
        break;
      case "nehoda":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, resolution = 'nehoda', resolved_on = ?", [t.gameDate]);
        zprava = text(rng, "policie_nehoda", { nazev });
        break;
      case "dopaden_cizi":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, recovered = 1, resolution = 'vyreseno_policii', resolved_on = ?", [t.gameDate]);
        if (prosel) zprava = (await vratZtraty(db, t, inc, nazev, rng)).join(" ");
        break;
    }
    if (!prosel) continue;
    await oznamVysledek(env, t.teamId, inc.id, zprava);
    vyrizeno++;
  }
  return vyrizeno;
}

function nactiSrazku(raw: string | null): { celkem: number; tydnuZbyva: number } | null {
  try {
    const v = JSON.parse(raw ?? "") as { celkem?: unknown; tydnuZbyva?: unknown };
    if (typeof v.celkem === "number" && typeof v.tydnuZbyva === "number") return { celkem: v.celkem, tydnuZbyva: v.tydnuZbyva };
    logger.warn({ module: M }, "srážka bez částky nebo počtu týdnů");
    return null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelná srážka", e);
    return null;
  }
}

export async function zauctujSrazky(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.resolution_data, p.first_name, p.last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id AND p.team_id = i.team_id
      WHERE i.team_id = ? AND i.resolution = 'srazka' AND COALESCE(json_extract(i.resolution_data, '$.tydnuZbyva'), 0) > 0`,
  ).bind(t.teamId).all<RadekSrazky>()
    .catch((e) => { logger.warn({ module: M }, `srážky ${t.teamId}`, e); return { results: [] as RadekSrazky[] }; });

  let zauctovano = 0;
  for (const r of rows.results) {
    const data = nactiSrazku(r.resolution_data);
    if (!data) continue;
    if (!r.first_name) {
      // Hráč už v klubu není: srážka odchodem končí (spec 7d).
      await db.prepare("UPDATE club_incidents SET resolution_data = json_set(resolution_data, '$.tydnuZbyva', 0) WHERE id = ?")
        .bind(r.id).run()
        .catch((e) => logger.warn({ module: M }, `ukončení srážky ${r.id}`, e));
      continue;
    }
    const narok = await db.prepare(
      "UPDATE club_incidents SET resolution_data = json_set(resolution_data, '$.tydnuZbyva', ?) WHERE id = ? AND json_extract(resolution_data, '$.tydnuZbyva') = ?",
    ).bind(data.tydnuZbyva - 1, r.id, data.tydnuZbyva).run()
      .catch((e) => { logger.error({ module: M }, `nárok na srážku ${r.id}`, e); return null; });
    if ((narok?.meta?.changes ?? 0) === 0) continue;

    const castka = splatkaSrazky(data.celkem, data.tydnuZbyva);
    const tyden = SRAZKA_TYDNU - data.tydnuZbyva + 1;
    if (castka > 0) {
      const jmeno = [r.first_name, r.last_name].filter(Boolean).join(" ");
      await recordTransaction(db, t.teamId, "incident_deduction", castka, `Srážka ze mzdy (${tyden}/${SRAZKA_TYDNU}): ${jmeno}`, t.gameDate, `srazka-${r.id}-t${tyden}`)
        .catch((e) => logger.error({ module: M }, `srážka ${r.id}`, e));
    }
    zauctovano++;
  }
  return zauctovano;
}

export async function zpracujVysetrovani(
  env: Bindings, t: Den, opts: { pondeli: boolean },
): Promise<{ policie: number; uzavreno: number; srazky: number }> {
  // Nejdřív policie: neúspěšné šetření vrací incident s novou lhůtou, ta se pak nesmí hned zavřít.
  const policie = await vyhodnotPolicii(env, t);
  const uzavreno = await uzavriProsleIncidenty(env, t);
  const srazky = opts.pondeli ? await zauctujSrazky(env, t) : 0;
  return { policie, uzavreno, srazky };
}
