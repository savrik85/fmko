/**
 * Útěk s penězi v DB (spec 4a): načtení varovných signálů a zápis, když se to stane.
 *
 * Incident je zámek: zapíše se první, `INSERT OR IGNORE` na deterministické id. Hráč
 * opustí kádr, jen když ten zápis opravdu vytvořil řádek — druhý průchod týmž herním
 * dnem tak nemůže odebrat hráče dvakrát.
 */

import { createRng } from "../generators/rng";
import { recordClubEvent } from "../fans/club-events";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { applyReputationDelta } from "../lib/reputation";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { removePlayer } from "../transfers/remove-player";
import { zapisIncident } from "./dopady";
import { smsIncidentu } from "./incident-db";
import { SANCE_UTEKU, SMS_ROLE_KUSTOD, UTEK_REPUTACE } from "./nastaveni";
import { text } from "./texty";
import type { NavrhIncidentu, StavKlubu } from "./typy";
import { castkaUteku, kandidatiUteku, type SignalyUteku } from "./utek";

const M = "incidents-utek";

/** Jak dlouho dozadu hledat hospodské řeči o dluzích. Situace `dluhy` trvá nejdýl 35 dní (situace.ts). */
const HOSPODA_OKNO_DNI = 35;

interface PribehZHospody {
  type?: string;
  playerIds?: unknown[];
}

/** Kdo z kádru zmiňoval v hospodě, že pije na sekeru (typ `pije_na_sekeru`, spec 9). */
function nactiMluviloSeVHospode(radky: readonly { incidents: string }[]): Set<string> {
  const mluvilo = new Set<string>();
  for (const r of radky) {
    let pribehy: PribehZHospody[];
    try {
      pribehy = r.incidents ? (JSON.parse(r.incidents) as PribehZHospody[]) : [];
    } catch (e) {
      logger.warn({ module: M }, "nečitelné příhody hospody pro signály útěku", e);
      continue;
    }
    for (const p of pribehy) {
      if (p.type !== "pije_na_sekeru" || !Array.isArray(p.playerIds)) continue;
      for (const id of p.playerIds) if (typeof id === "string") mluvilo.add(id);
    }
  }
  return mluvilo;
}

/** Signály útěku pro celý kádr jednou dávkou: běžící dluhy, rozhodnutá záloha a hospodské řeči. */
export async function nactiSignalyUteku(db: D1Database, teamId: string, gameDate: string): Promise<Map<string, SignalyUteku>> {
  const od = gameExpiry(gameDate, -HOSPODA_OKNO_DNI).slice(0, 10);
  const vysledky = await db.batch([
    db.prepare(
      `SELECT subject_player_id, game_date, json_extract(resolution_data, '$.zaloha') AS zaloha
         FROM club_incidents
        WHERE team_id = ? AND kind = 'dluhy' AND category = 'zivotni' AND status = 'probiha'
          AND subject_player_id IS NOT NULL`,
    ).bind(teamId),
    db.prepare("SELECT incidents FROM pub_sessions WHERE team_id = ? AND game_date >= ?").bind(teamId, od),
  ]).catch((e) => { logger.warn({ module: M }, `signály útěku ${teamId}`, e); return null; });
  if (!vysledky) return new Map();
  const [dluhyRes, hospodaRes] = vysledky;

  const dluhy = dluhyRes.results as Array<{ subject_player_id: string; game_date: string; zaloha: string | null }>;
  const mluvilo = nactiMluviloSeVHospode(hospodaRes.results as Array<{ incidents: string }>);
  const signaly = new Map<string, SignalyUteku>();
  for (const r of dluhy) {
    signaly.set(r.subject_player_id, {
      dluhyOdeDne: r.game_date.slice(0, 10),
      zadalOZalohu: r.zaloha !== null,
      mluviloSeVHospode: mluvilo.has(r.subject_player_id),
    });
  }
  return signaly;
}

/**
 * Zpracuje útěk s penězi klubu (spec 4a). Vrací `true`, když se dnes stal — den je pak
 * hotový, žádný další los se nekoná (útěk je jediná zpráva dne).
 */
export async function zpracujUtek(env: Bindings, stav: StavKlubu): Promise<boolean> {
  if (stav.utekLetos) return false;

  const signaly = await nactiSignalyUteku(env.DB, stav.teamId, stav.gameDate);
  const kandidati = kandidatiUteku(stav, signaly);
  if (kandidati.length === 0) return false;

  const rng = createRng(seedFromString(`utek|${stav.teamId}|${stav.den}`));
  if (rng.random() >= SANCE_UTEKU) return false;

  const kdo = rng.pick(kandidati);
  const castka = castkaUteku(stav);
  const id = `inc-${stav.teamId}-utek_s_penezi-${stav.den}`;
  const hodnoty = { hrac: kdo.jmeno, castka: castka.toLocaleString("cs-CZ") };
  const navrh: NavrhIncidentu = {
    kind: "utek_s_penezi", category: "kradez", status: "uzavreny", severity: 3,
    culpritType: "hrac", culpritPlayerId: kdo.id, culpritRevealed: true,
    ztraty: [{ typ: "penize", castka }],
    text: text(rng, "utek_s_penezi", hodnoty),
  };

  // Zámek: hráč zmizí z kádru jen tehdy, když tenhle zápis incidentu opravdu vytvořil řádek.
  // Druhý průchod týmž dnem narazí na INSERT OR IGNORE a skončí tady, aniž by na hráče sáhl.
  const zapsany = await zapisIncident(env.DB, stav, navrh, id)
    .catch((e) => { logger.error({ module: M }, `zápis útěku ${id}`, e); return null; });
  if (!zapsany) return false;

  await removePlayer(env.DB, kdo.id, "zmizel", { toFreeAgent: false, teamId: stav.teamId })
    .catch((e) => { logger.error({ module: M }, `odchod uteklého hráče ${kdo.id}`, e); return null; });

  await applyReputationDelta(
    env.DB, stav.teamId, UTEK_REPUTACE, "incident", `Útěk hráče ${kdo.jmeno} s klubovými penězi`,
    { referenceId: `${id}-reputace`, gameDate: stav.gameDate },
  ).catch((e) => { logger.error({ module: M }, `reputace za útěk ${id}`, e); return null; });

  await recordClubEvent(env.DB, {
    teamId: stav.teamId, kind: "utek_s_penezi", severity: 1,
    payload: { co: kdo.jmeno }, gameDate: stav.gameDate, referenceId: `${id}-udalost`,
  }).catch((e) => { logger.error({ module: M }, `klubová událost útěku ${id}`, e); return null; });

  await sendSystemSMS(env.DB, stav.teamId, SMS_ROLE_KUSTOD, text(rng, "sms_utek", hodnoty), smsIncidentu(id))
    .catch((e) => { logger.error({ module: M }, `SMS o útěku ${id}`, e); return null; });

  logger.info({ module: M, teamId: stav.teamId }, `útěk s penězi, hráč ${kdo.id}, částka ${castka}`);
  return true;
}
