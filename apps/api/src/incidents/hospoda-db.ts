/**
 * Incidenty v hospodě a DB (spec Část 9): kontext pro `hospoda.ts`, výběr ohlášeného činu
 * nad stavem klubu a zápis následků. `udalostiHospody` nikdy nehází: hospoda nesmí spadnout
 * kvůli incidentům.
 */

import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import {
  hroziciCin, pribehyHospody, vyberCin,
  type HostHospody, type KontextHospody, type PribehHospody, type VolbyHospody, type ZapisHospody,
} from "./hospoda";
import { smsIncidentu } from "./incident-db";
import { KATALOG_PODLE_KIND } from "./katalog";
import {
  KAMARADSKE_VZTAHY, MIN_ODEHRANYCH_ZAPASU, OBVINENI_PAMET_DNI, RECIDIVA_DNI, SILA_KAMARADSTVI, SMS_ROLE_HOSPODSKY,
} from "./nastaveni";
import { nactiZtraty } from "./popis";
import { hracZRadku, nactiStavKlubu, SLOUPCE_HRACE } from "./stav-klubu";
import { prikazStopyHospody } from "./stopy-db";
import { text } from "./texty";
import type { KategorieIncidentu, StavIncidentu, TypPachatele } from "./typy";
import { nactiObvineni } from "./vysetrovani";
import type { RoleSvedka, VysledekVyslechu } from "./znalosti";
import { prikazyZnalosti } from "./znalosti-db";

const M = "incidents-hospoda";

/** Návštěvník hospody, jak ho zná `season/pub.ts` (`PubAttendee`). */
export interface NavstevnikHospody {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  isCoach?: boolean;
}

export interface TymHospody {
  teamId: string;
  leagueId: string | null;
  /** Herní datum dne hospody, ISO nebo `YYYY-MM-DD` (klíč `pub_sessions.game_date`). */
  gameDate: string;
}

export interface UdalostiHospody {
  pribehy: PribehHospody[];
  zapisy: ZapisHospody[];
  zlodeji: Array<{ playerId: string; jmeno: string }>;
  /** Aktivní sezóna pro zápis, `null`, když se nic nenačetlo. */
  seasonNumber: number | null;
}

const prazdne = (): UdalostiHospody => ({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });

/** Sezóna jako poddotaz, ať celé načtení zůstane jednou dávkou. */
const SEZONA = "(SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)";

type RadekIncidentu = {
  id: string; kind: string; category: KategorieIncidentu; status: StavIncidentu; severity: number; game_date: string;
  deadline: string | null; culprit_type: TypPachatele | null; culprit_player_id: string | null; culprit_revealed: number;
  loss: string; recovered: number; resolved_on: string | null; police_result_on: string | null; accused: string;
  inzerat: number; stopy_hospody: string | null;
};

function pridejVztah(mapa: Map<string, Set<string>>, a: string, b: string): void {
  if (!mapa.has(a)) mapa.set(a, new Set());
  mapa.get(a)?.add(b);
}

/** Kontext jedné hospody. `hraciIds` = hráči klubu u stolu, nesmí být prázdné. */
export async function nactiKontextHospody(db: D1Database, t: TymHospody, hraciIds: readonly string[]): Promise<KontextHospody | null> {
  if (hraciIds.length === 0) return null;
  const ph = hraciIds.map(() => "?").join(", ");
  const kamaradske = KAMARADSKE_VZTAHY.map((typ) => `'${typ}'`).join(", ");
  const vysledky = await db.batch([
    db.prepare(`SELECT t.name, ${SEZONA} AS sezona FROM teams t WHERE t.id = ?`).bind(t.teamId),
    db.prepare(
      `SELECT i.id, i.kind, i.category, i.status, i.severity, i.game_date, i.deadline, i.culprit_type, i.culprit_player_id,
              i.culprit_revealed, i.loss, i.recovered, i.resolved_on, i.police_result_on, i.accused,
              EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id) AS inzerat,
              (SELECT group_concat(replace(c.id, i.id || '-hospoda-', ''), ',') FROM club_incident_clues c
                WHERE c.incident_id = i.id AND c.source = 'hospoda') AS stopy_hospody
         FROM club_incidents i
        WHERE i.team_id = ? AND i.season_number = ${SEZONA}
          AND i.status != 'hrozi' AND COALESCE(i.resolution, '') NOT IN ('bez_skody', 'nestalo_se')
          AND i.game_date >= ?
        ORDER BY i.game_date DESC
        LIMIT 30`,
    ).bind(t.teamId, gameExpiry(t.gameDate, -OBVINENI_PAMET_DNI)),
    db.prepare("SELECT culprit_player_id AS id FROM club_incidents WHERE team_id = ? AND status = 'hrozi' AND culprit_player_id IS NOT NULL").bind(t.teamId),
    db.prepare(`SELECT ${SLOUPCE_HRACE} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`).bind(t.teamId),
    db.prepare(
      `SELECT DISTINCT culprit_player_id AS id FROM club_incidents
        WHERE team_id = ? AND season_number = ${SEZONA} AND culprit_type = 'hrac' AND culprit_player_id IS NOT NULL
          AND status = 'uzavreny' AND COALESCE(resolution, '') NOT IN ('bez_skody', 'nestalo_se', 'konec_sezony')
          AND resolved_on >= ?`,
    ).bind(t.teamId, gameExpiry(t.gameDate, -RECIDIVA_DNI)),
    db.prepare(
      `SELECT incident_id, player_id, role, interrogation FROM club_incident_knowledge
        WHERE team_id = ? AND role IN ('svedek', 'kamarad', 'rival') AND player_id IN (${ph})`,
    ).bind(t.teamId, ...hraciIds),
    db.prepare(
      `SELECT player_a_id, player_b_id, type FROM relationships
        WHERE (player_a_id IN (${ph}) OR player_b_id IN (${ph}))
          AND (type = 'rivals' OR (type IN (${kamaradske}) AND COALESCE(strength, 50) >= ?))`,
    ).bind(...hraciIds, ...hraciIds, SILA_KAMARADSTVI),
    db.prepare(
      `SELECT subject_player_id AS player_id, id AS incident_id, kind, json_extract(resolution_data, '$.zaloha') AS zaloha
         FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
    ).bind(t.teamId),
  ]).catch((e) => { logger.warn({ module: M }, `kontext hospody ${t.teamId}`, e); return null; });
  if (!vysledky) return null;
  const [tymRes, incRes, hroziRes, kadrRes, recidRes, svedciRes, vztahyRes, situaceRes] = vysledky;

  const tym = tymRes.results[0] as { name: string; sezona: number | null } | undefined;
  if (!tym || tym.sezona == null) return null;

  const recidiviste = new Set((recidRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const kadr = new Map((kadrRes.results as Array<Record<string, unknown>>).map((r) => {
    const h = hracZRadku(r, recidiviste);
    return [h.id, h] as const;
  }));
  const kamaradi = new Map<string, Set<string>>();
  const rivalove = new Map<string, Set<string>>();
  for (const r of vztahyRes.results as Array<{ player_a_id: string; player_b_id: string; type: string }>) {
    const mapa = r.type === "rivals" ? rivalove : kamaradi;
    pridejVztah(mapa, r.player_a_id, r.player_b_id);
    pridejVztah(mapa, r.player_b_id, r.player_a_id);
  }
  const situace = new Map<string, string>();
  const idSituaci = new Map<string, string>();
  const odmitnuteZalohy = new Set<string>();
  for (const r of situaceRes.results as Array<{ player_id: string; incident_id: string; kind: string; zaloha: string | null }>) {
    situace.set(String(r.player_id), String(r.kind));
    idSituaci.set(String(r.player_id), String(r.incident_id));
    if (r.zaloha === "odmitnuto") odmitnuteZalohy.add(String(r.player_id));
  }

  return {
    teamId: t.teamId, leagueId: t.leagueId, seasonNumber: tym.sezona, nazevKlubu: tym.name,
    den: t.gameDate.slice(0, 10), gameDate: t.gameDate,
    incidenty: (incRes.results as RadekIncidentu[]).map((r) => ({
      id: r.id, kind: r.kind, category: r.category, status: r.status, severity: r.severity, den: r.game_date.slice(0, 10),
      culpritType: r.culprit_type, culpritPlayerId: r.culprit_player_id, odhalen: r.culprit_revealed === 1,
      deadline: r.deadline, ztraty: nactiZtraty(r.loss), recovered: r.recovered === 1, inzerat: r.inzerat === 1,
      uzavrenoDne: r.status === "uzavreny" && r.resolved_on ? r.resolved_on.slice(0, 10) : null,
      policeResultOn: r.police_result_on ? r.police_result_on.slice(0, 10) : null,
      obvineni: nactiObvineni(r.accused),
      stopyHospody: r.stopy_hospody ? r.stopy_hospody.split(",") : [],
    })),
    svedci: (svedciRes.results as Array<{ incident_id: string; player_id: string; role: RoleSvedka; interrogation: VysledekVyslechu | null }>)
      .map((r) => ({ incidentId: r.incident_id, playerId: r.player_id, role: r.role, vyslech: r.interrogation })),
    kadr, kamaradi, rivalove,
    hrozi: new Set((hroziRes.results as Array<{ id: string }>).map((r) => String(r.id))),
    situace, idSituaci, odmitnuteZalohy,
  };
}

/** Trenér, vůdci fanoušků a NPC (starosta) nejsou hráči: o incidentech nemluví. */
function jeHrac(a: NavstevnikHospody): boolean {
  return !a.isCoach && !/^(coach|fan|npc)-/.test(a.playerId);
}

/** Příhody o incidentech pro jednu hospodskou session. `attendees` = všichni u stolu včetně hostů. */
export async function udalostiHospody(
  db: D1Database, t: TymHospody, attendees: readonly NavstevnikHospody[], v: VolbyHospody,
): Promise<UdalostiHospody> {
  try {
    const hoste: HostHospody[] = attendees.filter(jeHrac).map((a) => ({
      playerId: a.playerId, krestni: a.firstName, prijmeni: a.lastName,
      alkohol: typeof a.alcohol === "number" ? a.alcohol : 30, teamId: a.teamId, host: a.isVisitor,
    }));
    const mistni = hoste.filter((h) => !h.host && h.teamId === t.teamId).map((h) => h.playerId);
    if (mistni.length === 0) return prazdne();

    const k = await nactiKontextHospody(db, t, mistni);
    if (!k) return prazdne();
    const r = pribehyHospody(hoste, k, v);
    const vysledek: UdalostiHospody = { pribehy: r.pribehy, zapisy: r.zapisy, zlodeji: r.zlodeji, seasonNumber: k.seasonNumber };

    if (r.ohlaseni) {
      // Co ohlásí, rozhoduje stav klubu: nikdy čin, na který klub nemá (spec 9a).
      const stav = await nactiStavKlubu(db, { id: t.teamId, league_id: t.leagueId }, t.gameDate, k.seasonNumber);
      const rng = createRng(seedFromString(`hospoda|${t.teamId}|${k.den}|cin|${r.ohlaseni.playerId}`));
      // Ochrana nových klubů, stejně jako v losování: dokud klub neodehrál dost zápasů, nic nehrozí.
      const kind = stav && stav.odehranychZapasu >= MIN_ODEHRANYCH_ZAPASU ? vyberCin(stav, r.ohlaseni.obvineny, rng) : null;
      const cin = kind ? hroziciCin(k, hoste, r.ohlaseni.playerId, kind, rng) : null;
      if (cin) {
        vysledek.pribehy.push({ type: "ohlasuje_cin", playerIds: [cin.playerId], text: cin.text, effects: [], incidentId: cin.id });
        vysledek.zapisy.push({ typ: "hrozi", cin });
      }
    }
    return vysledek;
  } catch (e) {
    logger.warn({ module: M }, `incidenty v hospodě ${t.teamId}`, e);
    return prazdne();
  }
}

/** Následky příhod jednou dávkou. SMS až po zápisu: manažer nesmí číst o stopě, která v DB není. */
export async function zapisHospody(
  db: D1Database, t: TymHospody & { seasonNumber: number }, zapisy: readonly ZapisHospody[],
): Promise<void> {
  const prikazy: D1PreparedStatement[] = [];
  const puvod: Array<string | null> = [];
  for (const z of zapisy) {
    switch (z.typ) {
      case "prozradil":
        // Co svědek řekl v hospodě, se výslechem znovu najít nedá: jeho stopy nahradí stopa z hospody.
        prikazy.push(
          db.prepare(
            `DELETE FROM club_incident_clues
              WHERE incident_id = ? AND holder_player_id = ? AND source IN ('svedek', 'kamarad', 'rival') AND found = 0`,
          ).bind(z.incidentId, z.svedekId),
        );
        puvod.push(null);
        prikazy.push(prikazStopyHospody(db, t.teamId, z.incidentId, `drb-${z.svedekId}`, z.stopa, t.gameDate));
        puvod.push(z.incidentId);
        prikazy.push(
          db.prepare(
            `UPDATE club_incident_knowledge SET interrogation = 'prozradil', interrogated_on = ?
              WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ('svedek', 'kamarad', 'rival') AND interrogation IS NULL`,
          ).bind(t.gameDate, z.incidentId, z.svedekId, t.teamId),
        );
        puvod.push(z.incidentId);
        break;
      case "stopa":
        prikazy.push(prikazStopyHospody(db, t.teamId, z.incidentId, z.klic, z.stopa, t.gameDate));
        puvod.push(z.incidentId);
        break;
      case "odhaleni":
        prikazy.push(db.prepare(
          `UPDATE club_incidents SET culprit_revealed = 1, deadline = ?
            WHERE id = ? AND team_id = ? AND culprit_revealed = 0 AND status IN ('otevreny', 'policie')`,
        ).bind(z.deadline, z.incidentId, t.teamId));
        puvod.push(z.incidentId);
        break;
      case "drb":
        const drbPrikazy = prikazyZnalosti(db, z.teamId, z.incidentId, t.seasonNumber, [z.znalost]);
        prikazy.push(...drbPrikazy);
        for (let i = 0; i < drbPrikazy.length; i++) puvod.push(null);
        break;
      case "hrozi":
        // Bez odhalení: `culprit_revealed = 1` by z hráče udělalo odhaleného pachatele v zápase i tréninku (17a–17c).
        prikazy.push(
          db.prepare(
            `INSERT OR IGNORE INTO club_incidents
               (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
                culprit_type, culprit_player_id, culprit_revealed, loss, text)
             VALUES (?, ?, ?, ?, ?, ?, 'hrozi', 1, ?, ?, 'hrac', ?, 0, '[]', ?)`,
          ).bind(
            z.cin.id, t.teamId, t.leagueId, t.seasonNumber, z.cin.kind, KATALOG_PODLE_KIND.get(z.cin.kind)?.category ?? "kradez",
            t.gameDate, z.cin.deadline, z.cin.playerId, z.cin.text,
          ),
        );
        puvod.push(z.cin.id);
        const hroziPrikazy = prikazyZnalosti(db, t.teamId, z.cin.id, t.seasonNumber, [z.cin.znalost]);
        prikazy.push(...hroziPrikazy);
        for (let i = 0; i < hroziPrikazy.length; i++) puvod.push(null);
        break;
      case "sms":
        break;
    }
  }

  let zmeneno = new Set<string>();
  if (prikazy.length > 0) {
    const vysledky = await db.batch(prikazy).catch((e) => {
      logger.error({ module: M }, `následky hospody ${t.teamId}`, e);
      return null;
    });
    if (!vysledky) return;

    // SMS pouze o změnách, které se skutečně zapsaly (spec: kontrola meta.changes).
    for (let i = 0; i < vysledky.length; i++) {
      const originId = puvod[i];
      if (originId && (vysledky[i]?.meta?.changes ?? 0) > 0) {
        zmeneno.add(originId);
      }
    }
  }

  for (const z of zapisy) {
    if (z.typ === "sms" && zmeneno.has(z.incidentId)) {
      await sendSystemSMS(db, t.teamId, SMS_ROLE_HOSPODSKY, z.text, smsIncidentu(z.incidentId))
        .catch((e) => logger.warn({ module: M }, `SMS hospodského ${z.incidentId}`, e));
    } else if (z.typ === "hrozi" && zmeneno.has(z.cin.id)) {
      const rng = createRng(seedFromString(`hospoda-sms|${z.cin.id}`));
      if (z.cin.posel) {
        await sendPlayerSMS(db, t.teamId, z.cin.posel, `${text(rng, "sms_ohlaseni_kamarad")} ${z.cin.text}`, smsIncidentu(z.cin.id))
          .catch((e) => logger.warn({ module: M }, `SMS kamaráda o ohlášeném činu ${z.cin.id}`, e));
      } else {
        await sendSystemSMS(db, t.teamId, SMS_ROLE_HOSPODSKY, `🍺 ${text(rng, "sms_ohlaseni_hospodsky")} ${z.cin.text}`, smsIncidentu(z.cin.id))
          .catch((e) => logger.warn({ module: M }, `SMS hospodského o ohlášeném činu ${z.cin.id}`, e));
      }
    }
  }
}
