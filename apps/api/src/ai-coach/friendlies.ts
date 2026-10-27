/**
 * Přáteláky AI trenéra: odpovědi na výzvy a občas vlastní nabídka termínu.
 *
 * AI trenér nehraje podle vlastních pravidel: přijetí, odmítnutí i nabídka jdou přes
 * stejné služby jako u člověka (multiplayer/friendly-actions.ts), takže platí stejné
 * termíny, sázky, náklady, kolize v rozpisu i zákaz peněz mezi propojenými kluby.
 *
 * Model navrhuje, kód hlídá (friendly-decision.ts): kód odmítne, co nejde nebo je mimo meze
 * povahy (soutěžní zápas den před a po, víc než dva přáteláky, sázka a náklady nad limit).
 * Když výzva projde, o přijetí rozhodne model; o vlastní nabídce rozhodne model, jestli
 * a jak ji vypsat. Bez modelu (výpadek, režim off) platí náhradní pravidlo podle povahy.
 *
 * Odpovídá s lidskou prodlevou: výzvu odeslanou dnes vyřídí nejdřív zítra přes den,
 * jen když se má hrát dnes nebo zítra, odpoví hned. Vždy stihne termín výzvy.
 */

import type { PushEnv } from "../community/web-push";
import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
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
import {
  FRIENDLY_REPLY_SCHEMA, FRIENDLY_SYSTEM_PROMPT, friendlyOfferSchema, renderFriendlyOfferPrompt, renderFriendlyReplyPrompt,
  validateFriendlyOffer, validateFriendlyReply,
  type FriendlyClubSnapshot, type FriendlyOfferContext, type FriendlyOfferDecision, type FriendlyReplyContext, type NearbyMatch,
} from "./friendly-decision";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel, COACH_MODEL } from "./llm";
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
/**
 * Soutěžní zápasy, které model u termínu vidí. U odpovědi na výzvu kód vylučuje jen tentýž den,
 * den před a po zvažuje model (liga po a čt, dřív zbyla jen sobota). Vlastní nabídky AI klub
 * dál vypisuje jen na klidné dny, i bez soutěžního zápasu den před a po.
 */
const NEARBY_OFFSETS = [-3, -2, -1, 1, 2, 3];
const OFFER_VENUES: OfferVenue[] = ["poster", "neutral", "taker"];
/** Model na přátelák nemá přemýšlet dlouho: hodinová úloha nesmí stát. */
const MODEL_TIMEOUT_MS = 60_000;

export interface FriendlyCoachOpts {
  /** Režim přepínače. `shadow` rozhodne a zapíše do deníku, ale nic neprovede. */
  mode?: CoachMode;
  /** Web push pro notifikace lidskému soupeři. */
  push?: PushEnv | null;
  /** Binding Workers AI. Bez něj (testy) rozhoduje náhradní pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání). */
  model?: string;
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

/** Kdo o odpovědi rozhodl: model, náhradní pravidlo (výpadek, off), nebo kód (výzva nešla přijmout). */
type DecidedBy = "model" | "fallback" | "guard";

interface ModelTrace {
  model: string | null;
  raw: string | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  prompt: string | null;
}

const NO_TRACE: ModelTrace = { model: null, raw: null, error: null, tokensIn: null, tokensOut: null, latencyMs: null, prompt: null };

/** Je den před, v den nebo den po `day` soutěžní zápas (liga, pohár, turnaj)? */
async function competitiveNearby(db: D1Database, teamId: string, day: string): Promise<boolean> {
  for (const d of [addDays(day, -1), day, addDays(day, 1)]) {
    if (await findBusy(db, teamId, d, { competitiveOnly: true })) return true;
  }
  return false;
}

/** Soutěžní zápasy dva a tři dny před a po termínu, ať model ví o únavě před důležitým zápasem. */
async function nearbyMatches(db: D1Database, teamId: string, day: string): Promise<NearbyMatch[]> {
  const out: NearbyMatch[] = [];
  for (const offset of NEARBY_OFFSETS) {
    const busy = await findBusy(db, teamId, addDays(day, offset), { competitiveOnly: true })
      .catch((e) => { logger.warn({ module: M, teamId }, "soutěžní zápas u termínu přáteláku", e); return null; });
    if (busy) out.push({ offset, kind: busy.kind });
  }
  return out;
}

async function upcomingFriendlies(db: D1Database, teamId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM challenges c JOIN matches m ON m.id = c.match_id
      WHERE ?1 IN (c.challenger_team_id, c.challenged_team_id) AND c.status = 'accepted'
        AND m.status IN ('scheduled', 'lineups_open')`,
  ).bind(teamId).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Průměr hodnocení nejlepší jedenáctky. */
async function topElevenStrength(db: D1Database, teamId: string): Promise<number | null> {
  const row = await db.prepare(
    `SELECT AVG(overall_rating) AS s FROM (
       SELECT overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
       ORDER BY overall_rating DESC LIMIT 11)`,
  ).bind(teamId).first<{ s: number | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "síla týmu", e); return null; });
  return row?.s ?? null;
}

async function clubSnapshot(db: D1Database, team: FriendlyClub, profile: AiCoachProfile): Promise<FriendlyClubSnapshot> {
  const squad = await db.prepare(
    `SELECT COUNT(*) AS n, AVG(json_extract(life_context, '$.condition')) AS cond,
            (SELECT COUNT(*) FROM injuries i JOIN players p2 ON p2.id = i.player_id WHERE p2.team_id = ?1 AND i.days_remaining > 0) AS injured
       FROM players WHERE team_id = ?1 AND (status IS NULL OR status = 'active')`,
  ).bind(team.id).first<{ n: number; cond: number | null; injured: number }>()
    .catch((e) => { logger.warn({ module: M, teamId: team.id }, "kádr pro přátelák", e); return null; });
  return {
    teamName: team.name,
    profile,
    budget: team.budget,
    strength: await topElevenStrength(db, team.id),
    players: squad?.n ?? 0,
    avgCondition: squad?.cond ?? null,
    injured: squad?.injured ?? 0,
    upcomingFriendlies: await upcomingFriendlies(db, team.id),
  };
}

interface ChallengeCheck {
  decision: FriendlyDecision;
  terms: ReturnType<typeof pendingChallengeTerms>;
  ourCosts: number;
}

/**
 * Meze, které hlídá kód: sázka a náklady podle povahy, soutěžní zápas den před a po, počet
 * domluvených přáteláků. Co projde, smí model přijmout. Pravidla hry ověří služba přijetí.
 */
export async function checkChallenge(
  db: D1Database, team: FriendlyClub, ch: ChallengeRow, profile: AiCoachProfile, today: string, hour: number | null,
): Promise<ChallengeCheck> {
  const terms = pendingChallengeTerms(ch, today, hour);
  const quote = await quoteFriendly(db, ch.challenger_team_id, team.id, { venue: terms.venue, costPayer: terms.costPayer }, ch.neutral_village_id);
  const ourCosts = quote ? sumCosts(quote.costs.opponent) : 0;
  const decline = (reason: Extract<FriendlyDecision, { accept: false }>["reason"]): ChallengeCheck => ({ decision: { accept: false, reason }, terms, ourCosts });
  if (terms.stake > maxFriendlyStake(profile)) return decline("stake_too_high");
  // Jen soutěžní zápas v tentýž den. Den před a po vidí model v `nearby` a rozhodne sám:
  // dřív kód odmítal i ty, takže při lize v pondělí a ve čtvrtek AI klub přijal jen sobotu
  // (prod 2026-10-27, Fezko vyzval čtyři AI kluby na úterý a všechny čtyři odmítl kód).
  if (await findBusy(db, team.id, terms.date, { competitiveOnly: true })) return decline("competitive_nearby");
  if (await upcomingFriendlies(db, team.id) >= MAX_UPCOMING_FRIENDLIES) return decline("busy_with_friendlies");
  if (terms.stake + ourCosts > friendlySpendLimit(team.budget, profile)) return decline("too_expensive");
  return { decision: { accept: true, reason: "fits" }, terms, ourCosts };
}

async function loadAiClub(db: D1Database, teamId: string): Promise<FriendlyClub | null> {
  const team = await loadFriendlyClub(db, teamId);
  return team && team.user_id === "ai" && isPlayableClub(team) ? team : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

/** Výzva prošla mezemi: přijetí rozhodne model, bez něj náhradní pravidlo (přijmout). */
async function decideReply(
  db: D1Database, team: FriendlyClub, ch: ChallengeRow, check: ChallengeCheck, profile: AiCoachProfile, today: string,
  mode: CoachMode, opts: FriendlyCoachOpts,
): Promise<{ accept: boolean; reason: string; by: DecidedBy; trace: ModelTrace }> {
  if (mode === "off" || !opts.ai) return { accept: true, reason: "fits", by: "fallback", trace: NO_TRACE };
  const opponent = await loadFriendlyClub(db, ch.challenger_team_id);
  const venue = check.terms.venue === "neutral" ? "neutral" : check.terms.venue === "opponent" ? "home" : "away";
  const ctx: FriendlyReplyContext = {
    ...(await clubSnapshot(db, team, profile)),
    opponent: {
      name: opponent?.name ?? "unknown club",
      human: !!opponent && opponent.user_id !== "ai",
      strength: await topElevenStrength(db, ch.challenger_team_id),
    },
    date: check.terms.date,
    daysAhead: daysBetween(today, check.terms.date),
    nearby: await nearbyMatches(db, team.id, check.terms.date),
    venue,
    costPayer: check.terms.costPayer,
    ourCosts: check.ourCosts,
    stake: check.terms.stake,
  };
  const prompt = renderFriendlyReplyPrompt(ctx);
  const res = await callCoachModel(opts.ai, {
    system: FRIENDLY_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
    schema: { name: "friendly_reply", schema: FRIENDLY_REPLY_SCHEMA }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  const parsed = res.json ? validateFriendlyReply(res.json) : null;
  if (!parsed) return { accept: true, reason: "fits", by: "fallback", trace: { ...trace, error: trace.error ?? "neplatná odpověď modelu" } };
  return { accept: parsed.accept, reason: parsed.reason, by: "model", trace };
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

      if (mode === "shadow") {
        // Výzva zůstane čekat, model se na ni ale nemá ptát a deník ji zapisovat každou hodinu znovu.
        const logged = await db.prepare(
          "SELECT 1 AS x FROM ai_coach_decisions WHERE team_id = ? AND kind = 'friendly_reply' AND context_ref = ? LIMIT 1",
        ).bind(teamId, ch.id).first()
          .catch((e) => { logger.warn({ module: M, teamId }, "deník odpovědi na výzvu", e); return null; });
        if (logged) continue;
      }

      // Rozpočet se mohl změnit předchozím přijetím ve stejném běhu.
      const fresh = (await loadAiClub(db, teamId)) ?? team;
      const check = await checkChallenge(db, fresh, ch, profile, today, hour);
      const outcome = check.decision.accept
        ? await decideReply(db, fresh, ch, check, profile, today, mode, opts)
        : { accept: false, reason: check.decision.reason, by: "guard" as const, trace: NO_TRACE };
      const inputSummary = outcome.trace.prompt
        ?? `date=${check.terms.date} venue=${check.terms.venue} costPayer=${check.terms.costPayer} stake=${check.terms.stake} costs=${check.ourCosts} budget=${fresh.budget}`;
      const log = (executed: Record<string, unknown> | null) => logDecision(db, {
        teamId, kind: "friendly_reply", mode, model: outcome.trace.model, contextRef: ch.id, inputSummary, rawOutput: outcome.trace.raw,
        actions: { accept: outcome.accept, reason: outcome.reason, decidedBy: outcome.by }, executed,
        usedFallback: outcome.by === "fallback", error: outcome.trace.error,
        tokensIn: outcome.trace.tokensIn, tokensOut: outcome.trace.tokensOut, latencyMs: outcome.trace.latencyMs,
      });

      if (mode === "shadow") {
        await log(null);
        continue;
      }

      let executed: Record<string, unknown>;
      if (outcome.accept) {
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
      await log(executed);
    } catch (e) {
      logger.error({ module: M, teamId }, `odpověď AI klubu na výzvu ${ch.id}`, e);
    }
  }
  return handled;
}

/** Náhradní pravidlo nabídky: náhodný volný termín, většinou doma, sázka podle povahy. */
function fallbackOffer(ctx: FriendlyOfferContext, rng: ReturnType<typeof createRng>, profile: AiCoachProfile): FriendlyOfferDecision {
  const date = rng.pick(ctx.dates.map((d) => d.date));
  const venue = rng.weighted({ poster: 7, neutral: 2, taker: 1 }) as OfferVenue;
  const steps = ctx.stakes.filter((s) => s > 0);
  const stake = steps.length > 0 && rng.random() < 0.2 + profile.risk / 400
    ? steps[rng.int(0, Math.min(3, steps.length - 1))]
    : 0;
  return { post: true, date, venue, stake, reason: "fallback" };
}

/**
 * Občas vypíše veřejnou nabídku termínu („ten den mám volno a chci hrát"). Nejvýš jednou
 * za herní den, nejvýš jedna otevřená nabídka a jen když nemá domluvený jiný přátelák.
 * Jestli nabídku opravdu vypíše a za jakých podmínek, rozhodne model. Vrací true, když ji vypsal.
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

  const maxStake = Math.min(maxFriendlyStake(profile), Math.floor(friendlySpendLimit(team.budget, profile) / FRIENDLY_STAKE_STEP) * FRIENDLY_STAKE_STEP);
  const stakes = [0];
  for (let s = FRIENDLY_STAKE_STEP; s <= maxStake; s += FRIENDLY_STAKE_STEP) stakes.push(s);
  const ctx: FriendlyOfferContext = {
    ...(await clubSnapshot(db, team, profile)),
    dates: await Promise.all(candidates.map(async (date) => ({
      date, daysAhead: daysBetween(today, date), nearby: await nearbyMatches(db, teamId, date),
    }))),
    venues: OFFER_VENUES,
    stakes,
  };

  let decision = fallbackOffer(ctx, rng, profile);
  let by: DecidedBy = "fallback";
  let trace: ModelTrace = NO_TRACE;
  if (mode !== "off" && opts.ai) {
    const prompt = renderFriendlyOfferPrompt(ctx);
    const res = await callCoachModel(opts.ai, {
      system: FRIENDLY_SYSTEM_PROMPT, user: prompt, maxTokens: 300,
      schema: { name: "friendly_offer", schema: friendlyOfferSchema(ctx) }, model: opts.model, timeoutMs: MODEL_TIMEOUT_MS,
    });
    trace = {
      model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
      latencyMs: res.latencyMs, prompt,
    };
    const parsed = res.json ? validateFriendlyOffer(res.json, ctx) : null;
    if (parsed) {
      decision = parsed;
      by = "model";
    } else {
      trace = { ...trace, error: trace.error ?? "neplatná odpověď modelu" };
    }
  }

  const body = { date: decision.date, venue: decision.venue, costPayer: "each" as const, stake: decision.stake };
  const log = (executed: Record<string, unknown> | null) => logDecision(db, {
    teamId, kind: "friendly_offer", mode, model: trace.model ?? (by === "model" ? COACH_MODEL : null), contextRef: today,
    inputSummary: trace.prompt ?? `budget=${team.budget} candidates=${candidates.length}`, rawOutput: trace.raw,
    actions: { ...decision, decidedBy: by }, executed, usedFallback: by === "fallback", error: trace.error,
    tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
  });

  if (!decision.post || mode === "shadow") {
    await log(decision.post ? null : { posted: false });
    return false;
  }

  const posted = await postFriendlyOffer(db, teamId, body, { now });
  await log(posted.ok ? { offerId: posted.offerId } : { error: posted.error });
  return posted.ok;
}

/**
 * Hodinová část AI trenéra pro přáteláky (podpis HourlyHook z ai-coach/hourly-hooks.ts).
 * Zapojí ji koordinátor do HOURLY_HOOKS.
 */
export const friendliesHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, FRIENDLY_COACH_AREA);
  const push: PushEnv = { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
  await respondToFriendlyChallenges(env.DB, teamId, profile, now, { mode, push, ai: env });
  await maybeOfferFriendly(env.DB, teamId, profile, now, { mode, ai: env });
};
