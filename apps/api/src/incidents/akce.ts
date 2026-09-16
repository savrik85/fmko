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
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "../transfers/remove-player";
import { denPlus, prikazAbsence } from "./absence-hracu";
import { posunHrace, posunKadru, posunKamaradu } from "./hraci";
import { herniDatum, nactiHraceKadru, nactiIncident, proAkce } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import {
  LHUTA_PO_ODHALENI_DNI, OBVINENI_PAMET_DNI, POLICIE_DNI_MAX, POLICIE_DNI_MIN, SMS_ROLE_POLICIE, SRAZKA_TYDNU,
  VYRAZENI_MAX_ZAPASU, VYSLECH_ZA_DNI,
} from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text, TEXTY, vypln } from "./texty";
import { castkaPokuty, castkaSrazky, hodnotaSkody, jeOblibeny } from "./tresty";
import type { AkceTrestu, Obvineni, VysledekObvineni } from "./typy";
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

/** SMS, kterou pachatel odpoví na trest. U ostatních trestů hráč nepíše. */
const SMS_TRESTU = { odpustit: "trest_odpustit", srazka: "trest_srazka", pokuta: "trest_pokuta", vyradit: "trest_vyradit" } as const;

export async function rozhodni(
  env: Bindings, teamId: string, incidentId: string, akce: AkceTrestu, volby: { zapasu?: number } = {},
): Promise<VysledekAkce<{ castka: number | null }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;

  const pachatel = inc.culprit_type === "hrac" && inc.culprit_player_id && inc.culprit_revealed === 1
    ? await nactiHraceKadru(db, teamId, inc.culprit_player_id)
    : null;
  if (!pachatel || !dostupneAkce(proAkce(inc, true)).tresty.includes(akce)) {
    return { ok: false, kod: 409, chyba: "Tohle rozhodnutí teď udělat nejde" };
  }
  const zapasu = volby.zapasu;
  if (akce === "vyradit" && !(zapasu !== undefined && Number.isInteger(zapasu) && zapasu >= 1 && zapasu <= VYRAZENI_MAX_ZAPASU)) {
    return { ok: false, kod: 400, chyba: "Vyber 1 až 3 zápasy" };
  }

  const rng = createRng(seedFromString(`trest|${incidentId}|${akce}`));
  const oblibeny = jeOblibeny(pachatel.vudcovstvi, pachatel.silnychVztahu);
  const sms = { id: pachatel.id, firstName: pachatel.krestni, lastName: pachatel.prijmeni };

  if (akce === "policie") {
    // Udání vlastního hráče: výsledek přijde za pár dní a je jistý (spec 7c).
    const vysledekOn = gameExpiry(gameDate, rng.int(POLICIE_DNI_MIN, POLICIE_DNI_MAX));
    const narok = await db.prepare(
      `UPDATE club_incidents SET status = 'policie', resolution = 'policie', police_result_on = ?
        WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 1 AND police_success IS NULL`,
    ).bind(vysledekOn, incidentId, teamId).run()
      .catch((e) => { logger.error({ module: M }, `udání ${incidentId}`, e); return null; });
    if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;
    // Oblíbeného hráče kabina práskači nezapomene.
    if (oblibeny) {
      await posunKadru(db, teamId, -3, [pachatel.id]).run()
        .catch((e) => logger.warn({ module: M }, `morálka po udání ${incidentId}`, e));
    }
    // Výslech a soud jako incidentní absence (spec 7c, 17a), ohlášené dopředu.
    const den = gameDate.slice(0, 10);
    const absence = [
      prikazAbsence(db, {
        incidentId, teamId, playerId: pachatel.id, druh: "vyslech",
        od: denPlus(den, VYSLECH_ZA_DNI), do: denPlus(den, VYSLECH_ZA_DNI), zapasu: null, ohlaseno: den,
        sms: text(rng, "absence_vyslech"),
      }),
      prikazAbsence(db, {
        incidentId, teamId, playerId: pachatel.id, druh: "soud",
        od: vysledekOn.slice(0, 10), do: vysledekOn.slice(0, 10), zapasu: null, ohlaseno: den,
        sms: text(rng, "absence_soud"),
      }),
    ].filter((p): p is D1PreparedStatement => p !== null);
    if (absence.length > 0) {
      await db.batch(absence).catch((e) => logger.error({ module: M }, `absence po udání ${incidentId}`, e));
    }
    await sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, `🚓 ${text(rng, "policie_udani", { hrac: pachatel.jmeno })}`)
      .catch((e) => logger.warn({ module: M }, `SMS udání ${incidentId}`, e));
    return { ok: true, castka: null };
  }

  const skoda = hodnotaSkody(nactiZtraty(inc.loss));
  const castka = akce === "srazka" ? castkaSrazky(skoda, pachatel.mzda)
    : akce === "pokuta" ? castkaPokuty(skoda, pachatel.mzda)
    : null;
  const data = akce === "srazka" ? JSON.stringify({ celkem: castka, tydnuZbyva: castka ? SRAZKA_TYDNU : 0 })
    : akce === "pokuta" ? JSON.stringify({ castka })
    : akce === "vyradit" ? JSON.stringify({ zapasu })
    : null;

  const narok = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = ?, resolution_data = ?, resolved_on = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 1`,
  ).bind(akce, data, gameDate, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `rozhodnutí ${akce} ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  if (akce === "vyhodit") {
    const odebrany = await removePlayer(db, pachatel.id, "released", { toFreeAgent: true, teamId })
      .catch((e) => { logger.error({ module: M }, `vyhazov pachatele ${incidentId}`, e); return null; });
    if (!odebrany?.ok) {
      await db.prepare(
        "UPDATE club_incidents SET status = 'otevreny', resolution = NULL, resolution_data = NULL, resolved_on = NULL WHERE id = ? AND resolution = 'vyhodit'",
      ).bind(incidentId).run()
        .catch((e) => logger.error({ module: M }, `vrácení incidentu po nepovedeném vyhazovu ${incidentId}`, e));
      return { ok: false, kod: 500, chyba: "Hráče se nepodařilo vyhodit" };
    }
    await posunKadru(db, teamId, oblibeny ? -4 : 1).run()
      .catch((e) => logger.warn({ module: M }, `morálka po vyhazovu ${incidentId}`, e));
    return { ok: true, castka: null };
  }

  const davka: D1PreparedStatement[] = [];
  if (akce === "odpustit") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: 5, vztah: 8 }));
    if (inc.severity >= 2) davka.push(posunKadru(db, teamId, -2, [pachatel.id]));
  } else if (akce === "srazka") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -6, vztah: -4 }));
  } else if (akce === "pokuta") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -8, vztah: -6 }));
  } else if (akce === "vyradit" && zapasu !== undefined) {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -10 }));
    // Neoblíbeného zloděje kabina ráda nevidí (spec 7d).
    if (!oblibeny) davka.push(posunKadru(db, teamId, 1, [pachatel.id]));
    const vyrazeni = prikazAbsence(db, {
      incidentId, teamId, playerId: pachatel.id, druh: "vyrazen",
      od: null, do: null, zapasu, ohlaseno: gameDate.slice(0, 10), sms: text(rng, "absence_vyrazen"),
    });
    if (vyrazeni) davka.push(vyrazeni);
  }
  if (davka.length > 0) {
    await db.batch(davka).catch((e) => logger.error({ module: M }, `následky trestu ${incidentId}`, e));
  }

  if (akce === "pokuta" && castka) {
    await recordTransaction(db, teamId, "incident_fine", castka, `Pokuta hráči: ${pachatel.jmeno}`, gameDate, `pokuta-${incidentId}`)
      .catch((e) => logger.error({ module: M }, `pokuta ${incidentId}`, e));
  }
  if (akce === "odpustit" || akce === "srazka" || akce === "pokuta" || akce === "vyradit") {
    await sendPlayerSMS(db, teamId, sms, text(rng, SMS_TRESTU[akce]))
      .catch((e) => logger.warn({ module: M }, `SMS po trestu ${incidentId}`, e));
  }
  return { ok: true, castka };
}
