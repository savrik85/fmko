/**
 * Přáteláky AI trenéra: odpovědi na výzvy a občas vlastní nabídka termínu.
 *
 * AI trenér nehraje podle vlastních pravidel: přijetí, odmítnutí i nabídka jdou přes
 * stejné služby jako u člověka (multiplayer/friendly-actions.ts), takže platí stejné
 * termíny, sázky, náklady, kolize v rozpisu i zákaz peněz mezi propojenými kluby.
 * Tady se jen rozhoduje, co by udělal rozumný trenér podle své povahy. Model se neptá,
 * všechno je náhradní pravidlo.
 *
 * Odpovídá s lidskou prodlevou: výzvu odeslanou dnes vyřídí nejdřív zítra přes den,
 * jen když se má hrát dnes nebo zítra, odpoví hned. Vždy stihne termín výzvy.
 */

import type { PushEnv } from "../community/web-push";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { pragueHour } from "../lib/match-tick-schedule";
import { seedFromString } from "../lib/seed";
import {
  FRIENDLY_MAX_STAKE, FRIENDLY_STAKE_STEP,
  addDays, findBusy, quoteFriendly, sumCosts,
  type ChallengeVenue, type CostPayer, type OfferVenue,
} from "../multiplayer/friendlies";
import {
  acceptChallenge, declineChallenge, friendlyToday, isPlayableClub, loadFriendlyClub, pendingChallengeTerms, postFriendlyOffer,
  type FriendlyClub,
} from "../multiplayer/friendly-actions";
import { claimCoachTask } from "./claims";
import { logDecision } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { readCoachMode, type CoachArea, type CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";

const M = "ai-coach-friendlies";

/** Přáteláky patří ke správě klubu, přepínač je společný s týdenní správou. */
export const FRIENDLY_COACH_AREA: CoachArea = "weekly";

/** Kolik přátelák klub nejvýš má domluvených dopředu, než další odmítne. */
const MAX_UPCOMING_FRIENDLIES = 2;
/** Nabídka termínu: kolik dní dopředu (pravidla povolují 14). */
const OFFER_DAYS_FROM = 3;
const OFFER_DAYS_TO = 10;
/** Přes den, ne v noci: v kolik hodin (Praha) trenér odpovídá a vypisuje nabídky. */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;

export interface FriendlyCoachOpts {
  /** Režim přepínače. `shadow` rozhodne a zapíše do deníku, ale nic neprovede. */
  mode?: CoachMode;
  /** Web push pro notifikace lidskému soupeři. */
  push?: PushEnv | null;
}

/** Nejvyšší sázka, do které trenér jde: šetrný skoro žádnou, odvážný víc. Po krocích sázky. */
export function maxFriendlyStake(profile: Pick<AiCoachProfile, "thrift" | "risk">): number {
  const raw = FRIENDLY_MAX_STAKE * ((100 - profile.thrift) / 100) * (0.5 + profile.risk / 200);
  return Math.max(0, Math.floor(raw / FRIENDLY_STAKE_STEP) * FRIENDLY_STAKE_STEP);
}

/** Kolik z rozpočtu pustí na jeden přátelák (sázka a náklady dohromady). */
export function friendlySpendLimit(budget: number, profile: Pick<AiCoachProfile, "thrift">): number {
  if (budget <= 0) return 0;
  return Math.round(budget * (0.05 + (0.2 * (100 - profile.thrift)) / 100));
}

/** Pražská hodina, kdy trenér na výzvu odpoví. Pevná pro výzvu, aby opakovaný běh nic neměnil. */
export function replyHour(challengeId: string): number {
  return DAY_FROM_HOUR + (seedFromString(`friendly-reply:${challengeId}`) % (DAY_TO_HOUR - DAY_FROM_HOUR + 1));
}

/**
 * Má trenér na výzvu odpovědět teď? Hraje se dnes nebo zítra: hned. Výzva z dneška
 * počká do zítřka. Starší výzva: od jeho hodiny odpovědi. Termín tak stihne vždy.
 */
export function replyDue(input: { today: string; sentDay: string; matchDate: string; hour: number | null; replyHour: number }): boolean {
  if (input.matchDate <= addDays(input.today, 1)) return true;
  if (input.sentDay >= input.today) return false;
  return input.hour === null || input.hour >= input.replyHour;
}

interface ChallengeRow {
  id: string; challenger_team_id: string; created_at: string; match_date: string | null; venue: ChallengeVenue | null;
  neutral_village_id: string | null; cost_payer: CostPayer | null; stake: number | null; message: string | null;
}

export type FriendlyDecision =
  | { accept: true; reason: "fits" }
  | { accept: false; reason: "stake_too_high" | "competitive_nearby" | "busy_with_friendlies" | "too_expensive" };

/** Je den před, v den nebo den po `day` soutěžní zápas (liga, pohár, turnaj)? */
async function competitiveNearby(db: D1Database, teamId: string, day: string): Promise<boolean> {
  for (const d of [addDays(day, -1), day, addDays(day, 1)]) {
    if (await findBusy(db, teamId, d, { competitiveOnly: true })) return true;
  }
  return false;
}

async function upcomingFriendlies(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM challenges c JOIN matches m ON m.id = c.match_id
      WHERE ?1 IN (c.challenger_team_id, c.challenged_team_id) AND c.status = 'accepted'
        AND m.status IN ('scheduled', 'lineups_open')`,
  ).bind(teamId).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Rozhodnutí o výzvě podle povahy. Pravidla hry (termín, kolize, peníze) ověří až služba přijetí. */
export async function decideOnChallenge(
  db: D1Database, team: FriendlyClub, ch: ChallengeRow, profile: AiCoachProfile, today: string, hour: number | null,
): Promise<FriendlyDecision> {
  const terms = pendingChallengeTerms(ch, today, hour);
  if (terms.stake > maxFriendlyStake(profile)) return { accept: false, reason: "stake_too_high" };
  if (await competitiveNearby(db, team.id, terms.date)) return { accept: false, reason: "competitive_nearby" };
  if (await upcomingFriendlies(db, team.id) >= MAX_UPCOMING_FRIENDLIES) return { accept: false, reason: "busy_with_friendlies" };
  const quote = await quoteFriendly(db, ch.challenger_team_id, team.id, { venue: terms.venue, costPayer: terms.costPayer }, ch.neutral_village_id);
  const myCosts = quote ? sumCosts(quote.costs.opponent) : 0;
  if (terms.stake + myCosts > friendlySpendLimit(team.budget, profile)) return { accept: false, reason: "too_expensive" };
  return { accept: true, reason: "fits" };
}

async function loadAiClub(db: D1Database, teamId: string): Promise<FriendlyClub | null> {
  const team = await loadFriendlyClub(db, teamId);
  return team && team.user_id === "ai" && isPlayableClub(team) ? team : null;
}

/**
 * Vyřídí výzvy, které AI klub dostal a na které je čas odpovědět.
 * Vrací počet vyřízených výzev (přijatých i odmítnutých).
 */
export async function respondToFriendlyChallenges(
  db: D1Database, teamId: string, profile: AiCoachProfile, now: Date, opts: FriendlyCoachOpts = {},
): Promise<number> {
  const mode = opts.mode ?? "on";
  const team = await loadAiClub(db, teamId);
  if (!team) return 0;
  const today = friendlyToday(team);
  const hour = pragueHour(now);

  const pending = await db.prepare(
    `SELECT id, challenger_team_id, created_at, match_date, venue, neutral_village_id, cost_payer, stake, message
       FROM challenges WHERE challenged_team_id = ? AND status = 'pending' ORDER BY created_at, id`,
  ).bind(teamId).all<ChallengeRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "čekající výzvy AI klubu", e); return { results: [] as ChallengeRow[] }; });

  let handled = 0;
  for (const ch of pending.results) {
    try {
      const terms = pendingChallengeTerms(ch, today, hour);
      const due = replyDue({ today, sentDay: ch.created_at.slice(0, 10), matchDate: terms.date, hour, replyHour: replyHour(ch.id) });
      if (!due) continue;

      // Rozpočet se mohl změnit předchozím přijetím ve stejném běhu.
      const fresh = (await loadAiClub(db, teamId)) ?? team;
      const decision = await decideOnChallenge(db, fresh, ch, profile, today, hour);
      const inputSummary = `date=${terms.date} venue=${terms.venue} costPayer=${terms.costPayer} stake=${terms.stake} budget=${fresh.budget}`;

      if (mode === "shadow") {
        // Výzva zůstane čekat, deník ji ale nemá zapisovat každou hodinu znovu.
        const logged = await db.prepare(
          "SELECT 1 AS x FROM ai_coach_decisions WHERE team_id = ? AND kind = 'friendly_reply' AND context_ref = ? LIMIT 1",
        ).bind(teamId, ch.id).first()
          .catch((e) => { logger.warn({ module: M, teamId }, "deník odpovědi na výzvu", e); return null; });
        if (!logged) {
          await logDecision(db, { teamId, kind: "friendly_reply", mode, contextRef: ch.id, inputSummary, actions: decision, executed: null, usedFallback: true });
        }
        continue;
      }

      let executed: Record<string, unknown>;
      if (decision.accept) {
        const accepted = await acceptChallenge(db, teamId, ch.id, { now, push: opts.push });
        if (accepted.ok) {
          executed = { accepted: true, matchId: accepted.matchId };
        } else if (accepted.status === 404 || accepted.status === 410) {
          // Výzvu mezitím vyřídil někdo jiný, nebo jí prošel termín (služba ji uzavřela).
          executed = { accepted: false, error: accepted.error };
        } else {
          // Pravidla hry přijetí nepustila (kolize, peníze, propojené kluby): trenér odmítne.
          const declined = await declineChallenge(db, teamId, ch.id, { now, push: opts.push });
          executed = { accepted: false, error: accepted.error, declined: declined.ok };
        }
      } else {
        const declined = await declineChallenge(db, teamId, ch.id, { now, push: opts.push });
        executed = { declined: declined.ok, ...(declined.ok ? {} : { error: declined.error }) };
      }
      handled++;
      await logDecision(db, { teamId, kind: "friendly_reply", mode, contextRef: ch.id, inputSummary, actions: decision, executed, usedFallback: true });
    } catch (e) {
      logger.error({ module: M, teamId }, `odpověď AI klubu na výzvu ${ch.id}`, e);
    }
  }
  return handled;
}

/**
 * Občas vypíše veřejnou nabídku termínu („ten den mám volno a chci hrát"). Nejvýš jednou
 * za herní den, nejvýš jedna otevřená nabídka a jen když nemá domluvený jiný přátelák.
 * Vrací true, když nabídku vypsal.
 */
export async function maybeOfferFriendly(
  db: D1Database, teamId: string, profile: AiCoachProfile, now: Date, opts: FriendlyCoachOpts = {},
): Promise<boolean> {
  const mode = opts.mode ?? "on";
  const hour = pragueHour(now);
  if (hour !== null && (hour < DAY_FROM_HOUR || hour > DAY_TO_HOUR)) return false;
  const team = await loadAiClub(db, teamId);
  if (!team) return false;
  const today = friendlyToday(team);

  // Jeden pokus za herní den, i když hodinový běh přijde víckrát (fronta doručuje aspoň jednou).
  if (!await claimCoachTask(db, teamId, "friendly_offer", today)) return false;

  const rng = createRng(seedFromString(`friendly-offer:${teamId}:${today}`));
  // Vzácně: zhruba jednou za dva týdny, ctižádostivý a odvážný trenér častěji.
  const chance = 0.03 + (0.05 * profile.ambition) / 100 + (0.03 * profile.risk) / 100;
  if (rng.random() >= chance) return false;

  const open = await db.prepare("SELECT COUNT(*) AS n FROM friendly_offers WHERE team_id = ? AND status = 'open'")
    .bind(teamId).first<{ n: number }>();
  if ((open?.n ?? 0) > 0) return false;
  if (await upcomingFriendlies(db, teamId) > 0) return false;

  const candidates: string[] = [];
  for (let d = OFFER_DAYS_FROM; d <= OFFER_DAYS_TO; d++) {
    const day = addDays(today, d);
    if (await findBusy(db, teamId, day)) continue;
    if (await competitiveNearby(db, teamId, day)) continue;
    candidates.push(day);
  }
  if (candidates.length === 0) return false;

  const date = rng.pick(candidates);
  const venue = rng.weighted({ poster: 7, neutral: 2, taker: 1 }) as OfferVenue;
  const maxStake = Math.min(maxFriendlyStake(profile), Math.floor(friendlySpendLimit(team.budget, profile) / FRIENDLY_STAKE_STEP) * FRIENDLY_STAKE_STEP);
  const stake = maxStake >= FRIENDLY_STAKE_STEP && rng.random() < 0.2 + profile.risk / 400
    ? FRIENDLY_STAKE_STEP * rng.int(1, Math.min(4, maxStake / FRIENDLY_STAKE_STEP))
    : 0;
  const body = { date, venue, costPayer: "each", stake };

  if (mode === "shadow") {
    await logDecision(db, { teamId, kind: "friendly_offer", mode, contextRef: date, inputSummary: `budget=${team.budget} candidates=${candidates.length}`, actions: body, executed: null, usedFallback: true });
    return false;
  }

  const posted = await postFriendlyOffer(db, teamId, body, { now });
  await logDecision(db, {
    teamId, kind: "friendly_offer", mode, contextRef: date,
    inputSummary: `budget=${team.budget} candidates=${candidates.length}`,
    actions: body, executed: posted.ok ? { offerId: posted.offerId } : { error: posted.error }, usedFallback: true,
  });
  return posted.ok;
}

/**
 * Hodinová část AI trenéra pro přáteláky (podpis HourlyHook z ai-coach/hourly-hooks.ts).
 * Zapojí ji koordinátor do HOURLY_HOOKS.
 */
export const friendliesHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, FRIENDLY_COACH_AREA);
  const push: PushEnv = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
  await respondToFriendlyChallenges(env.DB, teamId, profile, now, { mode, push });
  await maybeOfferFriendly(env.DB, teamId, profile, now, { mode });
};
