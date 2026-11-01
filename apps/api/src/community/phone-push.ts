/**
 * Push na telefon trenéra, když mu někdo napíše sám od sebe (hráč, obec, okresní akce).
 *
 * Do zprávy v Telefonu se dřív nic neposílalo: zprávy hráčů, pozvánky na pivo i okresní
 * pouť ležely v aplikaci, dokud ji trenér sám neotevřel, a rozhodnutí s termínem propadala
 * (petice 36 %, hospoda 38 %). Spadá pod přepínač „Události a ostatní“ (`event`).
 */

import { logger } from "../lib/logger";
import { getNotificationPreferences, sendWebPushToTeam, type PushEnv } from "./web-push";

const M = "phone-push";

/** Klíče push z `Bindings`. Funkce, které je nedostanou (testy, admin nanečisto), push vynechají. */
export interface OptionalPushKeys {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export function pushEnvOf(db: D1Database, env: OptionalPushKeys): PushEnv | undefined {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return undefined;
  return { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db };
}

/** Push „📱 Jméno: text“ s odkazem rovnou do konverzace. Selhání jen zaloguje. */
export async function pushPhoneMessage(
  db: D1Database,
  env: OptionalPushKeys,
  m: { teamId: string; convId: string; sender: string; text: string },
): Promise<void> {
  const pushEnv = pushEnvOf(db, env);
  if (!pushEnv) return;
  try {
    const prefs = await getNotificationPreferences(db, m.teamId);
    if (prefs.event === false) return;
    const text = m.text.length > 120 ? `${m.text.slice(0, 117)}…` : m.text;
    await sendWebPushToTeam(pushEnv, m.teamId, `📱 ${m.sender}`, text, `/telefon/${m.convId}`);
  } catch (e) {
    logger.warn({ module: M, teamId: m.teamId }, "push zprávy v telefonu", e);
  }
}
