/**
 * Zprávy klubu o incidentech: SMS (Kustod, policie, hráč) a notifikace.
 *
 * AI klub zprávy nedostává (spec AI klubů 3.2: incidenty AI trenér řeší podle povahy, bez zpráv).
 * Incidenty se mu dějí stejně jako lidskému klubu, jen tyhle obaly mu nic nepošlou. Lidský klub
 * dostane totéž co dřív. Když se majitele klubu nepodaří načíst, zpráva se pošle, ať o ni lidský
 * klub nepřijde.
 */

import { createNotification } from "../community/notifications";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { sendPlayerSMS, sendPlayerTemplateSMS, sendSystemSMS } from "../messaging/system-sms";
import { TEXTY, vypln, type KlicTextu } from "./texty";

const M = "incidents-messages";

/** Dostává klub zprávy o incidentech? AI klub ne. */
export async function clubReceivesMessages(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "majitel klubu pro zprávu o incidentu", e); return null; });
  return row?.user_id !== "ai";
}

/** Systémová SMS (Kustod, policie, hospodský). AI klubu se nepošle. */
export async function sendIncidentSystemSms(
  db: D1Database, teamId: string, roleTitle: string, body: string, metadata?: Record<string, unknown>,
): Promise<void> {
  if (!(await clubReceivesMessages(db, teamId))) return;
  await sendSystemSMS(db, teamId, roleTitle, body, metadata);
}

/** SMS od hráče trenérovi. AI klubu se nepošle. */
export async function sendIncidentPlayerSms(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
  body: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!(await clubReceivesMessages(db, teamId))) return;
  await sendPlayerSMS(db, teamId, player, body, metadata);
}

/**
 * Předem napsaná SMS od hráče z textů incidentu: varianta, kterou trenérovi ještě neposlal
 * (`sendPlayerTemplateSMS`). Dřív se losovala bez paměti. AI klubu se nepošle.
 */
export async function sendIncidentPlayerTemplate(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
  key: KlicTextu,
  opts: { seed: string; values?: Record<string, string>; metadata?: Record<string, unknown> },
): Promise<void> {
  if (!(await clubReceivesMessages(db, teamId))) return;
  await sendPlayerTemplateSMS(db, teamId, player, TEXTY[key].map((t) => vypln(t, opts.values ?? {})), {
    seed: opts.seed, metadata: { ...(opts.metadata ?? {}), textKey: key },
  });
}

/** Notifikace (a push) o incidentu. AI klubu se nepošle. */
export async function notifyIncident(env: Bindings, teamId: string, title: string, body: string, actionUrl: string): Promise<void> {
  if (!(await clubReceivesMessages(env.DB, teamId))) return;
  await createNotification(env.DB, teamId, "event", title, body, actionUrl, env);
}
