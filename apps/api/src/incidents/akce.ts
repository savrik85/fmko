/**
 * Akce manažera nad incidentem: obvinění, policie, tresty (spec 7b, 7c, 7d).
 *
 * Každá akce si nejdřív hlídaným UPDATE zabere přechod stavu a teprve po
 * úspěchu provede následky. Dvojklik ani souběh je tak nezdvojí.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { posunHrace, posunKadru, posunKamaradu } from "./hraci";
import { herniDatum, nactiHraceKadru, nactiIncident, proAkce } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import {
  LHUTA_PO_ODHALENI_DNI, OBVINENI_PAMET_DNI, POLICIE_DNI_MAX, POLICIE_DNI_MIN, SMS_ROLE_POLICIE,
} from "./nastaveni";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text, TEXTY, vypln } from "./texty";
import type { Obvineni, VysledekObvineni } from "./typy";
import { dostupneAkce, nactiObvineni, rozhodniObvineni } from "./vysetrovani";

const M = "incidents-akce";

export type VysledekAkce<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; kod: 400 | 404 | 409 | 500; chyba: string };

const NENALEZENO = { ok: false, kod: 404, chyba: "Incident nenalezen" } as const;
const ZMENENO = { ok: false, kod: 409, chyba: "Incident se mezitím změnil, načti ho znovu" } as const;

function pozdejsi(a: string | null, b: string): string {
  return a && a > b ? a : b;
}

export async function obvinHrace(
  env: Bindings, teamId: string, incidentId: string, playerId: string,
): Promise<VysledekAkce<{ vysledek: VysledekObvineni; odhalen: boolean }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!dostupneAkce(proAkce(inc, false)).obvinit) return { ok: false, kod: 409, chyba: "Obvinit teď nejde" };

  const obvineny = await nactiHraceKadru(db, teamId, playerId);
  if (!obvineny) return { ok: false, kod: 400, chyba: "Hráč není v kádru" };

  const stopy = await nactiStopy(db, incidentId);
  const poradi = inc.accusations + 1;
  const rng = createRng(seedFromString(`obvineni|${incidentId}|${playerId}|${poradi}`));
  const { vysledek, vinen } = rozhodniObvineni({
    obvineny, pachatelId: inc.culprit_type === "hrac" ? inc.culprit_player_id : null, stopy, rng,
  });
  const odhalen = vinen && vysledek !== "zapira";
  const obvineni: Obvineni[] = [...nactiObvineni(inc.accused), { playerId, jmeno: obvineny.jmeno, den: gameDate.slice(0, 10), vysledek }];
  const deadline = odhalen ? pozdejsi(inc.deadline, gameExpiry(gameDate, LHUTA_PO_ODHALENI_DNI)) : inc.deadline;

  const narok = await db.prepare(
    `UPDATE club_incidents SET accusations = ?, accused = ?, culprit_revealed = ?, deadline = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 0 AND accusations = ?`,
  ).bind(poradi, JSON.stringify(obvineni), odhalen ? 1 : 0, deadline, incidentId, teamId, inc.accusations).run()
    .catch((e) => { logger.error({ module: M }, `obvinění ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  const davka: D1PreparedStatement[] = [];
  if (odhalen) {
    davka.push(...prikazyStop(db, teamId, incidentId, [{
      zdroj: "priznani", ukazujeNa: playerId, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0, nalezena: true,
      text: text(rng, vysledek === "priznal" ? "stopa_priznani" : "stopa_usvedcen", { hrac: obvineny.jmeno }),
    }], gameDate));
  } else if (vinen) {
    davka.push(posunHrace(db, teamId, playerId, { vztah: -8 }));
  } else {
    davka.push(
      posunHrace(db, teamId, playerId, { morale: -12, vztah: -20 }),
      posunKamaradu(db, teamId, playerId, -3),
      posunKadru(db, teamId, -2, [playerId], playerId),
      db.prepare(
        `INSERT OR REPLACE INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
         VALUES (?, ?, ?, 'obvineny', ?, 50, ?, ?)`,
      ).bind(
        incidentId, playerId, teamId, vypln(TEXTY.znalost_obvineny[0], { nazev: nazevIncidentu(inc.kind) }),
        gameExpiry(gameDate, OBVINENI_PAMET_DNI), inc.season_number,
      ),
    );
  }
  await db.batch(davka).catch((e) => logger.error({ module: M }, `následky obvinění ${incidentId}`, e));

  const klic = vysledek === "priznal" ? "obvineni_priznani" : vysledek === "usvedcen" ? "obvineni_usvedcen" : "obvineni_zapira";
  await sendPlayerSMS(db, teamId, { id: playerId, firstName: obvineny.krestni, lastName: obvineny.prijmeni }, text(rng, klic))
    .catch((e) => logger.warn({ module: M }, `SMS po obvinění ${incidentId}`, e));
  return { ok: true, vysledek, odhalen };
}

export async function zavolejPolicii(
  env: Bindings, teamId: string, incidentId: string,
): Promise<VysledekAkce<{ vysledekOn: string }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!dostupneAkce(proAkce(inc, false)).policie) return { ok: false, kod: 409, chyba: "Policii teď zavolat nejde" };

  const rng = createRng(seedFromString(`policie-prijeti|${incidentId}`));
  const vysledekOn = gameExpiry(gameDate, rng.int(POLICIE_DNI_MIN, POLICIE_DNI_MAX));
  const narok = await db.prepare(
    `UPDATE club_incidents SET status = 'policie', police_result_on = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 0 AND police_success IS NULL`,
  ).bind(vysledekOn, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `policie ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  await sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, `🚓 ${text(rng, "policie_prijato", { nazev: nazevIncidentu(inc.kind) })}`)
    .catch((e) => logger.warn({ module: M }, `SMS policie ${incidentId}`, e));
  return { ok: true, vysledekOn };
}
