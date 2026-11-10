/**
 * Oznámení a push o zranění hráče v zápase.
 *
 * Zranění ze zápasu se zapsalo do `injuries` a trenér se o něm dozvěděl, až když si
 * otevřel kádr nebo mu chyběl hráč v sestavě. Tahle funkce projde zranění jednoho
 * zápasu a majiteli klubu pošle oznámení (a push, když má zapnuté „Události a ostatní“).
 *
 * Volat po zápisu zranění zápasu. Opakované volání (recovery kola, oprava zápasu) nic
 * nezdvojí: oznámení má id odvozené od id zranění a vkládá se přes INSERT OR IGNORE.
 */

import { logger } from "../lib/logger";
import { getNotificationPreferences, sendWebPushToTeam, type PushEnv } from "../community/web-push";

const M = "match-injury-alerts";

interface InjuryRow {
  id: string;
  player_id: string;
  description: string;
  days_total: number;
  first_name: string;
  last_name: string;
  /** Klub, kterému jde oznámení: áčko, u hráče z U21 jeho mateřský klub. */
  club_team_id: string;
  is_u21: number;
}

/** „na 1 den“, „na 3 dny“, „na 12 dní“. */
export function injuryDaysText(days: number): string {
  if (days === 1) return "na 1 den";
  return days >= 2 && days <= 4 ? `na ${days} dny` : `na ${days} dní`;
}

export function injuryAlertText(r: Pick<InjuryRow, "first_name" | "last_name" | "description" | "days_total" | "is_u21">): { title: string; body: string } {
  const name = `${r.first_name} ${r.last_name}`;
  return {
    title: `🚑 ${name} se v zápase zranil`,
    body: `${r.description ? `${r.description}. ` : ""}Mimo hru bude ${injuryDaysText(r.days_total)}${r.is_u21 === 1 ? " (hráč U21)" : ""}.`,
  };
}

/**
 * Pošle oznámení o zraněních ze zápasu `matchId`. Jen klubům s lidským majitelem
 * a jen skutečná zranění (ne osobní volno ani předstíraná). Vrací počet nových oznámení.
 */
export async function notifyMatchInjuries(db: D1Database, matchId: string, pushEnv?: PushEnv): Promise<number> {
  const rows = await db.prepare(
    `SELECT i.id, i.player_id, i.description, i.days_total, p.first_name, p.last_name,
            COALESCE(t.parent_team_id, t.id) AS club_team_id,
            CASE WHEN t.parent_team_id IS NOT NULL THEN 1 ELSE 0 END AS is_u21
       FROM injuries i
       JOIN players p ON p.id = i.player_id
       JOIN teams t ON t.id = i.team_id
       JOIN teams club ON club.id = COALESCE(t.parent_team_id, t.id)
      WHERE i.match_id = ? AND club.user_id IS NOT NULL AND club.user_id != 'ai'
        AND COALESCE(i.osobni_volno, 0) = 0 AND COALESCE(i.is_fake, 0) = 0`,
  ).bind(matchId).all<InjuryRow>()
    .catch((e) => { logger.warn({ module: M }, `zranění zápasu ${matchId}`, e); return { results: [] as InjuryRow[] }; });

  let sent = 0;
  for (const r of rows.results) {
    try {
      const { title, body } = injuryAlertText(r);
      const actionUrl = `/hrac/${r.player_id}`;
      const inserted = await db.prepare(
        "INSERT OR IGNORE INTO notifications (id, team_id, type, title, body, action_url) VALUES (?, ?, 'event', ?, ?, ?)",
      ).bind(`injury-${r.id}`, r.club_team_id, title, body, actionUrl).run();
      if ((inserted.meta?.changes ?? 0) !== 1) continue;
      sent++;
      if (pushEnv?.VAPID_PUBLIC_KEY && pushEnv.VAPID_PRIVATE_KEY) {
        const prefs = await getNotificationPreferences(db, r.club_team_id);
        if (prefs.event !== false) await sendWebPushToTeam(pushEnv, r.club_team_id, title, body, actionUrl);
      }
    } catch (e) {
      logger.warn({ module: M, teamId: r.club_team_id }, `oznámení o zranění ${r.id}`, e);
    }
  }
  return sent;
}
