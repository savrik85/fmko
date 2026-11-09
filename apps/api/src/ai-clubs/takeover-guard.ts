/**
 * Ochranná lhůta klubu, který AI trenér převzal po člověku (ai-clubs/abandoned.ts).
 *
 * Majitel se může vrátit (ai-clubs/reclaim.ts) a klub má dostat zpátky poznatelný. Na produ AI
 * den po převzetí utratila 275 tisíc, podepsala sponzory a klub přejmenovala. Prvních 90 dní
 * po převzetí proto platí meze (kód je jen hlídá, o všem ostatním dál rozhoduje model):
 * - klub ani stadion se nepřejmenuje: AI nepodepíše hlavního sponzora ani sponzora stadionu,
 *   protože oba mění název,
 * - investice do stadionu a nového vybavení mají týdenní strop ve výši běžné rezervy trenéra
 *   (`computeReserve`); ušetřené peníze majitele se tak nerozpustí za pár týdnů.
 * Bufet se neomezuje. Klub, který byl AI od začátku (bez `ai_former_user_id`), meze nemá.
 */

import { logger } from "../lib/logger";

const M = "takeover-guard";
const DAY_MS = 86_400_000;

/** Kolik dní po převzetí platí ochranné meze (stejně dlouho se klub drží pro návrat majitele). */
export const TAKEOVER_PROTECTION_DAYS = 90;

export interface TakeoverGuard {
  /** Klub převzatý po člověku, lhůta ještě běží. */
  active: boolean;
  /** Kdy klub převzal AI trenér (reálný čas), nebo null. */
  since: string | null;
  /** Kolik dní lhůty zbývá (0, když neplatí). */
  daysLeft: number;
}

export const NO_TAKEOVER_GUARD: TakeoverGuard = { active: false, since: null, daysLeft: 0 };

/** Čistý výpočet lhůty z údajů týmu. */
export function takeoverGuardFor(team: { userId: string | null; aiSince: string | null; formerUserId: string | null }, now: Date): TakeoverGuard {
  if (team.userId !== "ai" || !team.formerUserId || !team.aiSince) return NO_TAKEOVER_GUARD;
  const since = new Date(team.aiSince).getTime();
  if (!Number.isFinite(since)) return NO_TAKEOVER_GUARD;
  const daysLeft = Math.ceil((since + TAKEOVER_PROTECTION_DAYS * DAY_MS - now.getTime()) / DAY_MS);
  return daysLeft > 0 ? { active: true, since: team.aiSince, daysLeft } : { active: false, since: team.aiSince, daysLeft: 0 };
}

/** Ochranná lhůta klubu. Když ji nejde načíst, platí opatrnější varianta: žádná lhůta se nepředstírá. */
export async function loadTakeoverGuard(db: D1Database, teamId: string, now: Date): Promise<TakeoverGuard> {
  const row = await db.prepare("SELECT user_id, ai_since, ai_former_user_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string | null; ai_since: string | null; ai_former_user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "ochranná lhůta převzatého klubu", e); return null; });
  if (!row) return NO_TAKEOVER_GUARD;
  return takeoverGuardFor({ userId: row.user_id, aiSince: row.ai_since, formerUserId: row.ai_former_user_id }, now);
}
