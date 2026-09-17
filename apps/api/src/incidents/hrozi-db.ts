/**
 * Hrozící čin v DB (spec 9a): vyhodnocení po lhůtě v denním kroku a záznam rozhovoru s hráčem.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { nactiIncidentniAbsence } from "./absence-hracu";
import { oznamIncident, zapisIncident } from "./dopady";
import { promluvil, sanceHroziciho } from "./hrozi";
import { smsIncidentu } from "./incident-db";
import { CINY_HRACE, cinHrace } from "./katalog";
import { HROZI_NESTALO_SE_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { prikazStopyHospody } from "./stopy-db";
import { text } from "./texty";
import type { StavKlubu } from "./typy";
import { prikazyZnalosti } from "./znalosti-db";

const M = "incidents-hrozi";

type RadekHroziciho = {
  id: string; kind: string; culprit_player_id: string | null; resolution_data: string | null;
  first_name: string | null; last_name: string | null;
};

/**
 * Hrozící činy, kterým vypršela lhůta: buď se stanou (skutečná škoda, pachatel známý, stopa z hospody),
 * nebo hráč vystřízliví. Vrací, kolik se jich stalo; denní krok pak nový problém nelosuje.
 */
export async function vyhodnotHrozici(env: Bindings, stav: StavKlubu): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.kind, i.culprit_player_id, i.resolution_data,
            COALESCE(p.first_name, d.first_name) AS first_name, COALESCE(p.last_name, d.last_name) AS last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ? AND i.status = 'hrozi' AND i.deadline <= ?`,
  ).bind(stav.teamId, stav.gameDate).all<RadekHroziciho>()
    .catch((e) => { logger.warn({ module: M }, `hrozící činy ${stav.teamId}`, e); return null; });
  if (!rows || rows.results.length === 0) return 0;

  const absence = await nactiIncidentniAbsence(db, stav.teamId, stav.den);
  const zraneni = await db.prepare("SELECT DISTINCT player_id FROM injuries WHERE team_id = ? AND days_remaining > 0")
    .bind(stav.teamId).all<{ player_id: string }>()
    .catch((e) => { logger.warn({ module: M }, `zranění ${stav.teamId}`, e); return { results: [] as Array<{ player_id: string }> }; });
  const zraneny = new Set(zraneni.results.map((r) => r.player_id));

  let stalo = 0;
  for (const r of rows.results) {
    const rng = createRng(seedFromString(`hrozi|${r.id}`));
    // První číslo z generátoru je los, na tom stojí determinismus i testy.
    const los = rng.random();
    const hrac = stav.kadr.find((h) => h.id === r.culprit_player_id) ?? null;
    const kind = CINY_HRACE.find((k) => k === r.kind) ?? null;
    const sance = hrac && kind ? sanceHroziciho({
      promluvil: promluvil(r.resolution_data), vztahKTrenerovi: hrac.vztahKTrenerovi, kind,
      zabezpeceni: stav.vybaveni.area_security ?? 0, nepritomen: absence.has(hrac.id) || zraneny.has(hrac.id),
    }) : 0;
    const navrh = hrac && kind && los * 100 < sance ? cinHrace(kind, stav, hrac, rng) : null;

    if (hrac && navrh) {
      const cin = { ...navrh, text: `${text(rng, "hrozi_splnil", { hrac: hrac.jmeno })} ${navrh.text}` };
      const zapsany = await zapisIncident(db, stav, cin, r.id, { zHroziciho: true });
      if (!zapsany) continue;
      await db.batch([prikazStopyHospody(db, stav.teamId, r.id, "ohlasil", {
        zdroj: "hospoda", ukazujeNa: hrac.id, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0,
        text: text(rng, "stopa_hospoda_ohlasil", { hrac: hrac.jmeno }), nalezena: true,
      }, stav.gameDate)]).catch((e) => logger.warn({ module: M }, `stopa ohlášeného činu ${r.id}`, e));
      await oznamIncident(env, stav.teamId, cin, zapsany);
      stalo++;
      continue;
    }

    const uzavreno = await db.prepare(
      "UPDATE club_incidents SET status = 'uzavreny', resolution = 'nestalo_se', resolved_on = ? WHERE id = ? AND status = 'hrozi'",
    ).bind(stav.gameDate, r.id).run()
      .catch((e) => { logger.error({ module: M }, `uzavření hrozícího činu ${r.id}`, e); return null; });
    if ((uzavreno?.meta?.changes ?? 0) === 0) continue;

    const jmeno = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Hráč z kádru";
    const fakt = text(rng, "hrozi_nestalo_se", { hrac: jmeno });
    // Kádr týden ví, že to byly jen řeči (spec 9a).
    const until = gameExpiry(stav.gameDate, HROZI_NESTALO_SE_DNI);
    if (stav.kadr.length > 0) {
      await db.batch(prikazyZnalosti(db, stav.teamId, r.id, stav.seasonNumber,
        stav.kadr.map((h) => ({ playerId: h.id, role: "kadr" as const, fact: fakt, ochota: 50, until }))))
        .catch((e) => logger.warn({ module: M }, `znalost nesplněné hrozby ${r.id}`, e));
    }
    await sendSystemSMS(db, stav.teamId, SMS_ROLE_KUSTOD, `🍺 ${fakt}`, smsIncidentu(r.id))
      .catch((e) => logger.warn({ module: M }, `SMS nesplněné hrozby ${r.id}`, e));
  }
  return stalo;
}

/** Trenér mluví s hráčem, který čin ohlásil. `true`, když hrozba je jeho a pořád trvá. */
export async function zaznamenejPromluvu(
  db: D1Database, o: { teamId: string; incidentId: string; playerId: string; den: string },
): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE club_incidents SET resolution_data = json_set(
        CASE WHEN json_valid(resolution_data) THEN resolution_data ELSE '{}' END, '$.promluvil', ?)
      WHERE id = ? AND team_id = ? AND status = 'hrozi' AND culprit_player_id = ?`,
  ).bind(o.den, o.incidentId, o.teamId, o.playerId).run()
    .catch((e) => { logger.warn({ module: M }, `rozhovor o hrozbě ${o.incidentId}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}
