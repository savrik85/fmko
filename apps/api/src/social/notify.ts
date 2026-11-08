/**
 * Socky: oznámení o komentáři, lajku a označení (@).
 *
 * Dostane ho jen klub, který vede člověk, a nikdy ten, kdo to udělal, ani ten,
 * kdo si klub autora nebo ten příspěvek skryl.
 * Dokud oznámení téhož druhu k téže diskusi leží nepřečtené, nové se nepřidá:
 * deset komentářů pod jedním příspěvkem je jedno oznámení, ne deset.
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

export type NoticeKind = "comment" | "like" | "mention";

const NOTICE_TITLES: Record<NoticeKind, string> = {
  comment: "Socky: nový komentář",
  like: "Socky: lajk",
  mention: "Socky: zmínka",
};

export interface SocialNotice {
  kind: NoticeKind;
  /** Příspěvek, na který vede odkaz (u lajku komentáře příspěvek, pod kterým je). */
  key: string;
  recipientTeamId: string | null;
  actorTeamId: string | null;
  actorName: string;
  /** Text komentáře nebo příspěvku; u lajku to, co se líbilo. */
  body: string;
  /** O čem je diskuse (titulek článku, „příspěvek trenéra …“). */
  title: string;
  /** Poslat i push do telefonu. Jen u komentářů a zmínek od lidí. */
  push: boolean;
}

/** Co lajk potěšil, z pohledu toho, komu oznámení přijde. */
export function likedWhat(kind: string, snippet: string): string {
  const s = `„${excerpt(snippet, 80)}“`;
  if (kind === "post") return `tvůj příspěvek ${s}`;
  if (kind === "comment") return `tvůj komentář ${s}`;
  return `článek ${s}`;
}

/** Text oznámení. Bez rodu: „dává lajk“, „tě zmiňuje“ sedí na trenéra i trenérku. */
export function noticeText(n: Pick<SocialNotice, "kind" | "actorName" | "body" | "title">): string {
  if (n.kind === "like") return `${n.actorName} dává lajk: ${n.body}`;
  if (n.kind === "mention") return `${n.actorName} tě zmiňuje: ${excerpt(n.body)}`;
  return `${n.actorName} k „${excerpt(n.title, 60)}“: ${excerpt(n.body)}`;
}

export async function notifySocial(env: Pick<Bindings, "DB" | "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">, n: SocialNotice): Promise<void> {
  if (!n.recipientTeamId || n.recipientTeamId === n.actorTeamId) return;
  const db = env.DB;
  const human = await db.prepare(`SELECT ${HUMAN_TEAM("t")} AS human FROM teams t WHERE t.id = ?`)
    .bind(n.recipientTeamId).first<{ human: number }>()
    .catch((e) => { logger.warn({ module: M }, "je klub lidský", e); return null; });
  if (human?.human !== 1) return;

  // Kdo si klub nebo příspěvek skryl, od něj ani o něm nic dostávat nechce: jinak by
  // skrytý klub mohl otravovat zmínkami a lajky dál, i s pushem do telefonu.
  const muted = await db.prepare(
    `SELECT 1 AS x FROM social_mutes m JOIN teams t ON t.user_id = m.user_id
      WHERE t.id = ? AND ((m.kind = 'team' AND m.value = ?) OR (m.kind = 'item' AND m.value = ?)) LIMIT 1`,
  ).bind(n.recipientTeamId, n.actorTeamId ?? "", n.key).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "skrytí u příjemce oznámení", e); return null; });
  if (muted) return;

  const link = feedLink(n.key);
  const title = NOTICE_TITLES[n.kind];
  const pending = await db.prepare("SELECT 1 AS x FROM notifications WHERE team_id = ? AND read = 0 AND action_url = ? AND title = ? LIMIT 1")
    .bind(n.recipientTeamId, link, title).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "nepřečtené oznámení k diskusi", e); return null; });
  if (pending) return;

  try {
    await createNotification(
      db,
      n.recipientTeamId,
      "event",
      title,
      noticeText(n),
      link,
      n.push ? env : undefined,
    );
  } catch (e) {
    logger.warn({ module: M }, `oznámení (${n.kind}) pro ${n.recipientTeamId}`, e);
  }
}
