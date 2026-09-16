/**
 * Zápis incidentu a jeho skutečné následky (spec Část 6c, 7e, 7f).
 */

import { createNotification } from "../community/notifications";
import { CATEGORIES } from "../equipment/equipment-generator";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { poskodZarizeni } from "../stadium/stadium-damage";
import { KATALOG_PODLE_KIND } from "./katalog";
import { LHUTA_ROZHODNUTI_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { TEXTY, vypln } from "./texty";
import type { NavrhIncidentu, StavKlubu, Ztrata } from "./typy";

const M = "incidents-dopady";

export function idIncidentu(teamId: string, kind: string, den: string): string {
  return `inc-${teamId}-${kind}-${den}`;
}

/**
 * Zapíše incident a teprve potom provede škody.
 *
 * Vrací id incidentu, nebo `null`, když už existoval (opakované zpracování dne)
 * nebo se žádná škoda nepovedla (vybavení mezitím prodáno, zařízení už na nule).
 */
export async function zapisIncident(
  db: D1Database,
  stav: StavKlubu,
  navrh: NavrhIncidentu,
  id: string = idIncidentu(stav.teamId, navrh.kind, stav.den),
): Promise<string | null> {
  const deadline = navrh.status === "otevreny" ? gameExpiry(stav.gameDate, LHUTA_ROZHODNUTI_DNI) : null;
  const resolvedOn = navrh.status === "uzavreny" ? stav.gameDate : null;

  const vlozeno = await db.prepare(
    `INSERT OR IGNORE INTO club_incidents
       (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
        culprit_type, culprit_player_id, culprit_revealed, loss, text, resolved_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, stav.teamId, stav.leagueId, stav.seasonNumber, navrh.kind, navrh.category, navrh.status,
    navrh.severity, stav.gameDate, deadline, navrh.culpritType, navrh.culpritPlayerId,
    navrh.culpritRevealed ? 1 : 0, JSON.stringify(navrh.ztraty), navrh.text, resolvedOn,
  ).run().catch((e) => { logger.error({ module: M }, `zápis incidentu ${id}`, e); return null; });
  if ((vlozeno?.meta?.changes ?? 0) === 0) return null;

  if (navrh.ztraty.length === 0) return id;

  const provedene: Ztrata[] = [];
  for (const z of navrh.ztraty) {
    const hotovo = await provedZtratu(db, stav, id, z, navrh.text);
    if (hotovo) provedene.push(hotovo);
  }

  if (provedene.length === 0) {
    await db.prepare("UPDATE club_incidents SET status = 'uzavreny', resolution = 'bez_skody', resolved_on = ?, loss = '[]' WHERE id = ?")
      .bind(stav.gameDate, id).run()
      .catch((e) => logger.warn({ module: M }, `uzavření incidentu bez škody ${id}`, e));
    return null;
  }
  await db.prepare("UPDATE club_incidents SET loss = ? WHERE id = ?")
    .bind(JSON.stringify(provedene), id).run()
    .catch((e) => logger.warn({ module: M }, `uložení provedené škody ${id}`, e));
  return id;
}

async function provedZtratu(db: D1Database, stav: StavKlubu, incidentId: string, z: Ztrata, popis: string): Promise<Ztrata | null> {
  const zmeneno = (r: D1Result | null) => (r?.meta?.changes ?? 0) > 0;

  if (z.typ === "vybaveni" || z.typ === "vybaveni_stav") {
    // Kategorie jde do názvu sloupce: whitelist je povinný.
    if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
      logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${incidentId}`);
      return null;
    }
  }

  switch (z.typ) {
    case "vybaveni": {
      const nova = Math.max(0, z.uroven - z.urovniDolu);
      // Úplně ztracená kategorie se vrací na výchozí stav 50, stejně jako prodej v bazaru.
      const stavPo = nova === 0 ? 50 : z.stav;
      const r = await db.prepare(`UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} = ?`)
        .bind(nova, stavPo, stav.teamId, z.uroven).run()
        .catch((e) => { logger.error({ module: M }, `ztráta vybavení ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
    case "vybaveni_stav": {
      const r = await db.prepare(`UPDATE equipment SET ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie}_condition = ?`)
        .bind(z.stavPo, stav.teamId, z.stavPred).run()
        .catch((e) => { logger.error({ module: M }, `opotřebení vybavení ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
    case "stadion": {
      const d = await poskodZarizeni(db, {
        teamId: stav.teamId, incidentId, facility: z.zarizeni, levels: z.urovni, gameDate: stav.gameDate, popis,
      });
      return d ? { ...z, urovni: d.levels, damageId: d.damageId } : null;
    }
    case "travnik": {
      const r = await db.prepare("UPDATE stadiums SET pitch_condition = ? WHERE team_id = ? AND pitch_condition = ?")
        .bind(z.po, stav.teamId, z.pred).run()
        .catch((e) => { logger.error({ module: M }, `poškození trávníku ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
  }
  return null;
}

/** SMS od kustoda a notifikace. Selhání oznámení incident nezvrací. */
export async function oznamIncident(env: Bindings, teamId: string, navrh: NavrhIncidentu): Promise<void> {
  const def = KATALOG_PODLE_KIND.get(navrh.kind);
  const emoji = def?.emoji ?? "❗";
  await sendSystemSMS(env.DB, teamId, SMS_ROLE_KUSTOD, `${emoji} ${navrh.text}`);
  await createNotification(env.DB, teamId, "event", `${emoji} ${def?.label ?? "Incident v klubu"}`, navrh.text.slice(0, 140), "/dashboard/incidenty", env)
    .catch((e) => logger.warn({ module: M }, `notifikace incidentu ${navrh.kind}`, e));
}

/**
 * Uzavře incidenty z minulé sezóny a otevřené incidenty po lhůtě (spec 7e, fáze 1:
 * jen výsledek `nevyreseno`). Vrací počet uzavřených po lhůtě.
 */
export async function uzavriProsleIncidenty(
  env: Bindings,
  t: { teamId: string; gameDate: string; seasonNumber: number },
): Promise<number> {
  const db = env.DB;
  await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'konec_sezony', resolved_on = ?
      WHERE team_id = ? AND season_number < ? AND status IN ('hrozi', 'otevreny', 'policie', 'probiha')`,
  ).bind(t.gameDate, t.teamId, t.seasonNumber).run()
    .catch((e) => logger.warn({ module: M }, `uzavření incidentů minulé sezóny ${t.teamId}`, e));

  const prosle = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'nevyreseno', resolved_on = ?
      WHERE team_id = ? AND status = 'otevreny' AND deadline IS NOT NULL AND deadline <= ?
      RETURNING kind, category`,
  ).bind(t.gameDate, t.teamId, t.gameDate).all<{ kind: string; category: string }>()
    .catch((e) => { logger.warn({ module: M }, `uzavření incidentů po lhůtě ${t.teamId}`, e); return { results: [] as Array<{ kind: string; category: string }> }; });

  for (const r of prosle.results) {
    const nazev = KATALOG_PODLE_KIND.get(r.kind)?.label ?? r.kind;
    const sablona = r.category === "kradez" ? TEXTY.lhuta_kradez[0] : TEXTY.lhuta_poskozeni[0];
    await sendSystemSMS(db, t.teamId, SMS_ROLE_KUSTOD, vypln(sablona, { nazev }));
  }
  return prosle.results.length;
}
