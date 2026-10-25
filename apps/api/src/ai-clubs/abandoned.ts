/**
 * Převzetí opuštěných lidských klubů AI trenérem.
 *
 * Klub, jehož vlastník se 45 dní nepřihlásil (`users.last_activity_at`, reálný čas), převezme
 * AI trenér: áčko i U21 dostanou `user_id = 'ai'`, zapíše se kdy (`ai_since`) a komu klub
 * patřil (`ai_former_user_id`). Lidský trenér se od klubu odpojí (`team_id = NULL`), ale
 * zůstane uložený, aby se k němu vlastník mohl vrátit (ai-clubs/reclaim.ts). Klub pak
 * dostane AI trenéra s povahou a všechno, co má mít AI klub (completeAiClub).
 *
 * Propojení klubů (`club_links`) zůstává: převzatý klub dál nesmí obchodovat ani hrát
 * o peníze s ostatními kluby téhož vlastníka. Dva kluby pod jedním účtem se dřív poznaly
 * jen podle společného `user_id`, proto se před převzetím zapíšou do skupiny výslovně.
 *
 * Volá se denně z cronu `0 3 * * *` po denním ticku.
 */

import { completeAiClub } from "./complete-club";
import { ABANDONED_AFTER_DAYS, daysBefore, lastActivitySql } from "./owner-activity";
import { logger } from "../lib/logger";

const M = "abandoned-clubs";

export interface AbandonedClub {
  teamId: string;
  userId: string;
}

/** Lidská áčka v soutěži, jejichž vlastník je aspoň `days` dní neaktivní. */
export async function findAbandonedClubs(db: D1Database, now: Date, days = ABANDONED_AFTER_DAYS): Promise<AbandonedClub[]> {
  const activity = await lastActivitySql(db, "u");
  const rows = await db.prepare(
    `SELECT t.id AS team_id, t.user_id
       FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.user_id <> 'ai' AND t.parent_team_id IS NULL AND COALESCE(t.team_type, 'senior') <> 'u21'
        AND t.league_id IS NOT NULL AND t.name NOT LIKE 'DELETED%'
        AND julianday(${activity}) <= julianday(?)
      ORDER BY t.id`,
  ).bind(daysBefore(now, days)).all<{ team_id: string; user_id: string }>()
    .catch((e) => {
      logger.error({ module: M }, "hledání opuštěných klubů", e);
      return { results: [] as Array<{ team_id: string; user_id: string }> };
    });
  return rows.results.map((r) => ({ teamId: r.team_id, userId: r.user_id }));
}

/**
 * Klub pod jedním účtem s jiným áčkem je s ním propojený jen přes společné user_id.
 * Po převzetí by to propojení zmizelo, proto se zapíše do club_links (stejná skupina).
 */
async function keepOwnerLinks(db: D1Database, teamId: string, userId: string): Promise<void> {
  const others = await db.prepare(
    `SELECT id FROM teams WHERE user_id = ? AND id <> ? AND parent_team_id IS NULL AND COALESCE(team_type, 'senior') <> 'u21'`,
  ).bind(userId, teamId).all<{ id: string }>();
  if (others.results.length === 0) return;
  const ids = [teamId, ...others.results.map((r) => r.id)];
  const existing = await db.prepare(
    `SELECT group_id FROM club_links WHERE team_id IN (${ids.map(() => "?").join(",")}) LIMIT 1`,
  ).bind(...ids).first<{ group_id: string }>();
  const groupId = existing?.group_id ?? `owner-${userId}`;
  await db.batch(ids.map((id) => db.prepare(
    "INSERT OR IGNORE INTO club_links (team_id, group_id, note) VALUES (?, ?, ?)",
  ).bind(id, groupId, "Stejný účet, propojeno při převzetí klubu AI trenérem")));
}

/**
 * Převezme klub AI trenérem. Jen lidské áčko, jehož vlastník je pořád `minInactiveDays`
 * neaktivní (kontroluje se znovu v zápisu, kdyby se mezitím přihlásil). Vrací true, když
 * klub převzal. Opakované volání nic nezmění.
 */
export async function takeOverAbandonedClub(
  db: D1Database, teamId: string, now: Date, opts: { minInactiveDays?: number } = {},
): Promise<boolean> {
  const team = await db.prepare(
    `SELECT id, user_id FROM teams WHERE id = ? AND parent_team_id IS NULL AND COALESCE(team_type, 'senior') <> 'u21'`,
  ).bind(teamId).first<{ id: string; user_id: string }>();
  if (!team || team.user_id === "ai") return false;
  const formerUserId = team.user_id;

  await keepOwnerLinks(db, teamId, formerUserId)
    .catch((e) => logger.error({ module: M, teamId }, "zápis propojení klubů před převzetím", e));

  const activity = await lastActivitySql(db, "u");
  const since = now.toISOString();
  const cutoff = daysBefore(now, opts.minInactiveDays ?? ABANDONED_AFTER_DAYS);
  // Jedna dávka = jedna transakce. U21 a trenér se přepnou, jen když se přepnulo áčko.
  const [senior] = await db.batch([
    db.prepare(
      `UPDATE teams SET user_id = 'ai', ai_since = ?1, ai_former_user_id = ?2
        WHERE id = ?3 AND user_id = ?2
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ?2 AND julianday(${activity}) > julianday(?4))`,
    ).bind(since, formerUserId, teamId, cutoff),
    db.prepare(
      `UPDATE teams SET user_id = 'ai', ai_since = ?1, ai_former_user_id = ?2
        WHERE parent_team_id = ?3 AND COALESCE(team_type, 'senior') = 'u21'
          AND EXISTS (SELECT 1 FROM teams a WHERE a.id = ?3 AND a.user_id = 'ai' AND a.ai_former_user_id = ?2 AND a.ai_since = ?1)`,
    ).bind(since, formerUserId, teamId),
    // Lidský trenér se odpojí, ale zůstane (návrat vlastníka ho připojí zpátky).
    db.prepare(
      `UPDATE managers SET team_id = NULL
        WHERE team_id = ?1 AND user_id <> 'ai'
          AND EXISTS (SELECT 1 FROM teams a WHERE a.id = ?1 AND a.user_id = 'ai' AND a.ai_former_user_id = ?2 AND a.ai_since = ?3)`,
    ).bind(teamId, formerUserId, since),
  ]);
  if ((senior.meta?.changes ?? 0) === 0) return false;

  // AI trenér s povahou, stadion, vybavení, čísla dresů a bydliště, co chybí.
  await completeAiClub(db, teamId);
  const u21 = await db.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND COALESCE(team_type, 'senior') = 'u21'")
    .bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "U21 převzatého klubu", e); return { results: [] as Array<{ id: string }> }; });
  for (const r of u21.results) await completeAiClub(db, r.id);

  logger.info({ module: M, teamId }, `klub převzal AI trenér (bývalý vlastník ${formerUserId})`);
  return true;
}

/** Přepínač v CACHE_KV: `off` denní převzetí vypne (např. před zálohou produkce). Bez klíče platí `on`. */
export const TAKEOVER_SWITCH_KEY = "ai_club_takeover";

export async function isTakeoverEnabled(kv: KVNamespace | undefined): Promise<boolean> {
  if (!kv) return true;
  const raw = await kv.get(TAKEOVER_SWITCH_KEY).catch((e) => {
    logger.warn({ module: M }, "čtení přepínače převzetí klubů", e);
    return null;
  });
  return raw !== "off";
}

/** Denní kontrola: převezme všechny opuštěné kluby. Vrací počet převzatých. */
export async function runAbandonedClubTakeover(db: D1Database, now: Date): Promise<number> {
  const clubs = await findAbandonedClubs(db, now);
  let taken = 0;
  for (const club of clubs) {
    try {
      if (await takeOverAbandonedClub(db, club.teamId, now)) taken++;
    } catch (e) {
      logger.error({ module: M, teamId: club.teamId }, "převzetí opuštěného klubu", e);
    }
  }
  return taken;
}
