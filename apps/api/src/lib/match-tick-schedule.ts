/**
 * Kdy se hraje ligové kolo: v 18:00 pražského času, celý rok.
 *
 * Cloudflare umí crony jen v UTC, takže 18:00 v Praze padá v létě na 16:00 UTC a v zimě
 * na 17:00 UTC. V plánu jsou proto obě hodiny a rozhoduje skutečná pražská hodina. Dřív
 * byly crony jen v 16:xx UTC a kolo se bere podle data (kolo z toho dne je splatné), takže
 * se v zimě hrálo v 17:00, hodinu před časem v rozpisu, a sestava uložená mezi 17. a 18.
 * hodinou platila až na další kolo.
 */

import { logger } from "./logger";

const MATCH_HOUR_PRAGUE = 18;

const MATCH_CRONS_SUMMER = ["0 16 * * *", "5 16 * * *"];
const MATCH_CRONS_WINTER = ["0 17 * * *", "5 17 * * *"];
const RECOVERY_CRON_SUMMER = "20 16 * * *";
const RECOVERY_CRON_WINTER = "20 17 * * *";

/** Hodina v Praze (0–23), nebo `null`, když převod časové zóny selže. */
export function pragueHour(at: Date = new Date()): number | null {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "numeric", hour12: false }).format(at),
    );
    return Number.isFinite(hour) ? hour % 24 : null;
  } catch (e) {
    logger.warn({ module: "match-tick-schedule" }, "pražská hodina se nespočítala", e);
    return null;
  }
}

/**
 * Výkop v 18:00 pražského času daného dne (YYYY-MM-DD) jako ISO v UTC. Přáteláky mají v
 * `matches.created_at` napevno 16:00 UTC, hrají se ale s ligovým kolem, takže v zimě
 * Rozpis i Zápas ukazovaly 17:00. Bez známé pražské hodiny vrátí 16:00 UTC jako dřív.
 */
export function pragueKickoffIso(day: string, hourInPrague: number = MATCH_HOUR_PRAGUE): string {
  const noon = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(noon.getTime())) return `${day}T16:00:00.000Z`;
  const hourAtNoon = pragueHour(noon);
  if (hourAtNoon === null) return `${day}T16:00:00.000Z`;
  const offsetHours = hourAtNoon - 12;
  return new Date(noon.getTime() + (hourInPrague - 12 - offsetHours) * 3_600_000).toISOString();
}

/** Pohár se hraje v poledne v Praze (index.ts pouští kolo ve 12:xx). */
export const CUP_HOUR_PRAGUE = 12;

/**
 * Výkop pohárového zápasu. Kola se dřív ukládala na 16:00 UTC, takže Rozpis ukazoval
 * 17:00/18:00, kdy bylo dávno dohráno. Platí i pro už uložená kola: bere se jen den.
 */
export function cupKickoffIso(scheduledAt: string | null | undefined): string | null {
  if (!scheduledAt) return null;
  return pragueKickoffIso(scheduledAt.slice(0, 10), CUP_HOUR_PRAGUE);
}

/**
 * Hraje tenhle cron ligové kolo? Ruční spuštění (bez cronu) vždy. Bez známé pražské
 * hodiny jede postaru jen 16:xx UTC, ať kolo radši proběhne o hodinu dřív než vůbec.
 */
export function isMatchTickNow(cron: string | undefined, hourInPrague: number | null): boolean {
  if (!cron) return true;
  if (hourInPrague == null) return MATCH_CRONS_SUMMER.includes(cron);
  return [...MATCH_CRONS_SUMMER, ...MATCH_CRONS_WINTER].includes(cron) && hourInPrague === MATCH_HOUR_PRAGUE;
}

/** Dohrání zaseklých kol dvacet minut po výkopu, tedy v 18:20 pražského času. */
export function isRoundRecoveryTickNow(cron: string | undefined, hourInPrague: number | null): boolean {
  if (!cron) return false;
  if (hourInPrague == null) return cron === RECOVERY_CRON_SUMMER;
  return (cron === RECOVERY_CRON_SUMMER || cron === RECOVERY_CRON_WINTER) && hourInPrague === MATCH_HOUR_PRAGUE;
}
