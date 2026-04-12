/**
 * FMK-20: Notifikace — push/email/in-app.
 */

import { getNotificationPreferences, sendWebPushToTeam, type PushEnv } from "./web-push";

export type NotificationType = "match_reminder" | "match_result" | "event" | "challenge" | "transfer" | "season" | "system";

export interface Notification {
  id: string;
  teamId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

/**
 * Create a notification (in-app) and optionally send a web push if the team has subscriptions and has that type enabled.
 */
export async function createNotification(
  db: D1Database,
  teamId: string,
  type: NotificationType,
  title: string,
  body: string,
  actionUrl?: string,
  env?: PushEnv,
): Promise<void> {
  await db.prepare(
    "INSERT INTO notifications (id, team_id, type, title, body, action_url) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), teamId, type, title, body, actionUrl ?? null).run();

  if (env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY) {
    // Fire-and-forget — selhání push nesmí rozbít in-app notifikaci
    getNotificationPreferences(db, teamId)
      .then((prefs) => {
        if (prefs[type] !== false) {
          return sendWebPushToTeam(env, teamId, title, body, actionUrl);
        }
      })
      .catch((e) => console.warn("[notifications] web push failed:", e));
  }
}

/**
 * Get unread notifications for a team.
 */
export async function getUnreadNotifications(
  db: D1Database,
  teamId: string,
): Promise<Notification[]> {
  const result = await db.prepare(
    "SELECT * FROM notifications WHERE team_id = ? AND read = 0 ORDER BY created_at DESC LIMIT 20"
  ).bind(teamId).all();

  return result.results.map((r) => ({
    id: r.id as string,
    teamId: r.team_id as string,
    type: r.type as NotificationType,
    title: r.title as string,
    body: r.body as string,
    read: false,
    actionUrl: r.action_url as string | undefined,
    createdAt: r.created_at as string,
  }));
}

/**
 * Mark notification as read.
 */
export async function markAsRead(db: D1Database, notificationId: string): Promise<void> {
  await db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").bind(notificationId).run();
}

/**
 * Mark all notifications as read for a team.
 */
export async function markAllAsRead(db: D1Database, teamId: string): Promise<void> {
  await db.prepare("UPDATE notifications SET read = 1 WHERE team_id = ? AND read = 0").bind(teamId).run();
}

// Helper: create common notifications
export async function notifyMatchReminder(db: D1Database, teamId: string, opponent: string, time: string): Promise<void> {
  await createNotification(db, teamId, "match_reminder", `Zápas za ${time}`, `Proti ${opponent}. Nastav sestavu!`, "/dashboard/match");
}

export async function notifyMatchResult(db: D1Database, teamId: string, homeTeam: string, awayTeam: string, homeScore: number, awayScore: number): Promise<void> {
  await createNotification(db, teamId, "match_result", `${homeTeam} ${homeScore}:${awayScore} ${awayTeam}`, "Podívej se na detail zápasu.", "/dashboard/match");
}
