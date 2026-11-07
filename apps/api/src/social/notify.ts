/**
 * Socky: oznámení o novém komentáři.
 *
 * Dostane ho jen klub, který vede člověk, a nikdy ten, kdo komentář napsal.
 * Dokud oznámení k téže diskusi leží nepřečtené, nové se nepřidá: deset
 * komentářů pod jedním příspěvkem je jedno oznámení, ne deset.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { createNotification } from "../community/notifications";
import { HUMAN_TEAM } from "./store";

const M = "social-notify";

export function feedLink(key: string): string {
  return `/telefon?socky=${encodeURIComponent(key)}`;
}

function excerpt(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface CommentNotice {
  key: string;
  recipientTeamId: string | null;
  actorTeamId: string | null;
  actorName: string;
  body: string;
  /** O čem je diskuse (titulek článku, „příspěvek trenéra …“). */
  title: string;
  /** Poslat i push do telefonu. Jen u komentářů od lidí. */
  push: boolean;
}

export async function notifyComment(env: Pick<Bindings, "DB" | "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">, n: CommentNotice): Promise<void> {
  if (!n.recipientTeamId || n.recipientTeamId === n.actorTeamId) return;
  const db = env.DB;
  const human = await db.prepare(`SELECT ${HUMAN_TEAM("t")} AS human FROM teams t WHERE t.id = ?`)
    .bind(n.recipientTeamId).first<{ human: number }>()
    .catch((e) => { logger.warn({ module: M }, "je klub lidský", e); return null; });
  if (human?.human !== 1) return;

  const link = feedLink(n.key);
  const pending = await db.prepare("SELECT 1 AS x FROM notifications WHERE team_id = ? AND read = 0 AND action_url = ? LIMIT 1")
    .bind(n.recipientTeamId, link).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "nepřečtené oznámení k diskusi", e); return null; });
  if (pending) return;

  try {
    await createNotification(
      db,
      n.recipientTeamId,
      "event",
      "Socky: nový komentář",
      `${n.actorName} k „${excerpt(n.title, 60)}“: ${excerpt(n.body)}`,
      link,
      n.push ? env : undefined,
    );
  } catch (e) {
    logger.warn({ module: M }, `oznámení o komentáři pro ${n.recipientTeamId}`, e);
  }
}
