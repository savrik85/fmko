/**
 * Pozvání majitele firmy na nejbližší domácí zápas klubu. Jedna služba pro manažera
 * (POST /teams/:teamId/sponsor-owners/:sponsorId/invite) i AI trenéra (ai-coach/sponsor-invites.ts).
 *
 * Pravidla: jen firma z vlastního okresu, jen nejbližší domácí zápas, který ještě nezačal,
 * majitel přijme na jeden zápasový den jen jedno pozvání, jeden klub zve jednoho majitele na
 * jeden zápas jen jednou. Dárek se platí hned (přijme, nebo ne). Šanci, že majitel přijme,
 * zvedá VIP lóže; přijaté pozvání hned zvedne náklonnost, výsledek zápasu ji pak pohne dál
 * (sponsors/hooks.ts, settleSponsorInvitations).
 */
import { logger } from "../lib/logger";
import { applySponsorFavorDelta, ensureSponsorOwner, getFavor } from "./favor";
import { FAVOR_REASONS, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost } from "./favor-math";
import type { OwnerPersonality } from "./owners";

/** Důvody odmítnutí podle povahy majitele (vidí je manažer u karty majitele). */
export const REJECT_REASONS: Record<OwnerPersonality, string[]> = {
  patriot: ["Ten den mám zabijačku u bratra, příště určitě.", "Na hřiště rád, ale teď to nevyjde."],
  businessman: ["Mám jednání v Praze, nestihnu to.", "Pošlete mi termíny na další měsíc, ozvu se."],
  fan: ["Po tom, jak jste hráli minule? Letos ne.", "Mám lístky na ligu, sorry."],
  cautious: ["Nejdřív se chci podívat, jak to u vás funguje.", "Radši počkám, až se to u vás usadí."],
};

export interface HomeMatch { id: string; scheduled_at: string; opponent_name: string }

/**
 * Nejbližší domácí ligový zápas klubu, který ještě vůbec nezačal.
 *
 * `match-runner.ts` má životní cyklus zápasu 'scheduled' → 'lineups_open' (kolo je
 * zamčené, běží/čeká na simulaci) → 'simulated'. Pozvánky obce (`routes/villages.ts`)
 * berou `status != 'simulated'`, což pustí i 'lineups_open' — pozvat majitele firmy by
 * pak šlo i v okamžiku, kdy se kolo právě dohrává. Tady chceme jen 'scheduled'.
 */
export async function nextHomeMatch(db: D1Database, teamId: string): Promise<HomeMatch | null> {
  return db.prepare(
    `SELECT m.id, sc.scheduled_at, aw.name AS opponent_name
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     JOIN teams aw ON aw.id = m.away_team_id
     WHERE m.home_team_id = ? AND m.status = 'scheduled' AND sc.scheduled_at >= date('now', '-1 day')
     ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId).first<HomeMatch>();
}

/** Prohry klubu v posledních pěti odehraných zápasech (fanouška odrazují od pozvání). */
export async function recentLosses(db: D1Database, teamId: string): Promise<number> {
  const recent = await db.prepare(
    `SELECT home_team_id, home_score, away_score FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{ home_team_id: string; home_score: number; away_score: number }>();
  return recent.results.filter((m) => {
    const ours = m.home_team_id === teamId ? m.home_score : m.away_score;
    const theirs = m.home_team_id === teamId ? m.away_score : m.home_score;
    return ours < theirs;
  }).length;
}

/**
 * Efektivní úroveň VIP lóže pro pozvání. Když se úroveň nenačte, zve se jako bez lóže.
 * Bez tribun (stands < 1) je efektivní úroveň 0, i kdyby v DB zůstal vip_box > 0
 * po tom, co výtržnosti tribuny zbořily pod stojící lóží (viz calculateFacilityEffects).
 */
export async function vipBoxLevelForInvites(db: D1Database, teamId: string): Promise<number> {
  const vipRow = await db.prepare("SELECT vip_box, stands FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<{ vip_box: number | null; stands: number | null }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "load vip box for invite", e); return null; });
  return (vipRow?.stands ?? 0) >= 1 ? (vipRow?.vip_box ?? 0) : 0;
}

export type InviteResult =
  | {
    ok: true;
    status: "accepted" | "declined";
    giftCost: number;
    /** Šance, se kterou majitel rozhodoval (na setiny). */
    probability: number;
    rejectReason: string | null;
    /** Náklonnost majitele ke klubu po pozvání. */
    favor: number;
  }
  | { ok: false; error: string; status: 400 | 404 | 409 };

/**
 * Pozve majitele firmy `sponsorId` na zápas `matchId` (musí to být nejbližší domácí zápas klubu).
 * `random` je zdroj náhody (šum šance, hod, důvod odmítnutí), manažer i AI hrají s Math.random.
 */
export async function inviteSponsorOwner(
  db: D1Database, teamId: string, sponsorId: number, matchId: string, random: () => number = Math.random,
): Promise<InviteResult> {
  const team = await db.prepare(
    "SELECT t.id, v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ id: string; district: string }>();
  if (!team) return { ok: false, error: "Tým nenalezen", status: 404 };
  const sponsor = await db.prepare("SELECT id, district FROM district_sponsors WHERE id = ?")
    .bind(sponsorId).first<{ id: number; district: string }>();
  if (!sponsor) return { ok: false, error: "Sponzor nenalezen", status: 404 };
  if (sponsor.district !== team.district) return { ok: false, error: "Zvát jde jen firmy z vlastního okresu", status: 400 };

  const match = await nextHomeMatch(db, teamId);
  if (!match || match.id !== matchId) return { ok: false, error: "Zvát jde jen na nejbližší domácí zápas", status: 400 };
  const matchDay = match.scheduled_at.slice(0, 10);

  const taken = await db.prepare(
    `SELECT 1 FROM sponsor_invitations WHERE sponsor_id = ? AND match_day = ? AND status IN ('accepted','attended') AND team_id != ?`,
  ).bind(sponsorId, matchDay, teamId).first();
  if (taken) return { ok: false, error: "Majitel už ten den přijal pozvání jiného klubu", status: 409 };

  const owner = await ensureSponsorOwner(db, sponsorId);
  if (!owner) return { ok: false, error: "Majitel nenalezen", status: 404 };
  const favor = await getFavor(db, sponsorId, teamId);
  const giftCost = invitationGiftCost(favor);

  const budget = await db.prepare("SELECT budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; game_date: string | null }>();
  if (!budget || budget.budget < giftCost) return { ok: false, error: "Na dárek nemáš peníze", status: 400 };

  const losses = await recentLosses(db, teamId);
  // Lóže dělá z pozvání zážitek.
  const vipBoxLevel = await vipBoxLevelForInvites(db, teamId);

  const probability = invitationAcceptance({
    favor, personality: owner.personality, recentLosses: losses, noise: (random() - 0.5) * 0.2, vipBoxLevel,
  });
  const accepted = random() < probability;
  const reasons = REJECT_REASONS[owner.personality];
  const rejectReason = accepted ? null : reasons[Math.floor(random() * reasons.length)];

  try {
    await db.prepare(
      `INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost, reject_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), sponsorId, teamId, match.id, matchDay, accepted ? "accepted" : "declined", giftCost, rejectReason).run();
  } catch (e) {
    // Unikátní index: už pozváno na tenhle zápas, nebo slot mezitím obsadil jiný klub.
    logger.warn({ module: "sponsors", teamId }, `insert sponsor invitation sponsor=${sponsorId}`, e);
    return { ok: false, error: "Tohohle majitele už na ten zápas zvát nejde", status: 409 };
  }

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(db, teamId, "event", -giftCost, `Pozvání ${owner.firstName} ${owner.lastName} na zápas`,
    budget.game_date ?? new Date().toISOString());
  if (accepted) {
    await applySponsorFavorDelta(db, sponsorId, teamId, invitationAcceptedDelta(owner.personality), FAVOR_REASONS.invitationAccepted);
  }

  return {
    ok: true,
    status: accepted ? "accepted" : "declined",
    giftCost,
    probability: Math.round(probability * 100) / 100,
    rejectReason,
    favor: await getFavor(db, sponsorId, teamId),
  };
}
