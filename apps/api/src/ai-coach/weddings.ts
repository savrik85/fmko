/**
 * Svatba hráče AI klubu (F3 „Svatba v kabině“), hodinová práce AI trenéra.
 *
 * Lidský trenér ženichovi odepíše v chatu a hra z odpovědi pozná, jestli přijde, pošle dar,
 * nebo klukům pít zakáže (weddings/wedding-db.ts). AI trenér dostane tytéž tři cesty s dopady
 * (wedding-decision.ts) a vybere modelem. Bez modelu (výpadek, neplatná odpověď, `ai = null`,
 * režim off) rozhodne pravidlo podle povahy. Provede se to stejnou službou jako u člověka
 * (`recordWeddingDecision`): dar přes `recordTransaction`, kocovina jako incidentní absence.
 * Když hodinová práce do dne před svatbou nerozhodne, zavolá ji denní tick bez modelu.
 *
 * AI klubu žádné zprávy nechodí (`sendIncidentPlayerSms` mu nic nepošle).
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { planHangover } from "../weddings/wedding";
import { loadGuests, recordWeddingDecision, type WeddingRow } from "../weddings/wedding-db";
import { NO_TRACE, type ModelTrace } from "./buy-model";
import { logDecision } from "./decision-log";
import type { HourlyHook } from "./hourly-hooks";
import { callCoachModel } from "./llm";
import { readCoachMode, type CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import { weeklyRunningCosts } from "./transfer-club";
import { budgetReserve } from "./valuation";
import {
  affordableGifts, checkWeddingDecision, fallbackWeddingDecision, renderWeddingPrompt, WEDDING_SYSTEM_PROMPT, weddingSchema,
  type AiWeddingChoice, type AiWeddingDecision, type WeddingDecisionContext,
} from "./wedding-decision";

const M = "ai-coach-weddings";
/** Svatba je krátké rozhodnutí, hodinová práce na model nemá čekat dlouho. */
const MODEL_TIMEOUT_MS = 60_000;
/** Pro počty chybějících na model stačí jakýkoli los: počty na náhodě nezávisí. */
const COUNT_RNG = { int: (min: number) => min };

export interface AiWeddingOpts {
  mode: CoachMode;
  ai: Pick<Bindings, "AI"> | null;
  model?: string;
  /** Herní den YYYY-MM-DD (denní tick ho předá, jinak `teams.game_date`). */
  today?: string;
  /** Jen tahle svatba (lhůta v denním ticku). */
  weddingId?: string;
}

export interface AiWeddingResult {
  weddingId: string;
  choice: AiWeddingChoice;
  decidedBy: "model" | "fallback";
  executed: boolean;
}

async function decideWithModel(
  ai: Pick<Bindings, "AI">, c: WeddingDecisionContext, model: string | undefined,
): Promise<{ decision: AiWeddingDecision | null; trace: ModelTrace }> {
  const prompt = renderWeddingPrompt(c);
  const res = await callCoachModel(ai, {
    system: WEDDING_SYSTEM_PROMPT, user: prompt, maxTokens: 200,
    schema: { name: "wedding", schema: weddingSchema(c) }, model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  if (!res.json) return { decision: null, trace };
  const check = checkWeddingDecision(res.json, c);
  return check.ok ? { decision: check.decision, trace } : { decision: null, trace: { ...trace, error: check.reason } };
}

/**
 * Rozhodne o svatbách hráčů AI klubu, na které se ještě neodpovědělo. Nikdy nehází ven: chyba
 * jedné svatby jde do logu. Režim shadow jen rozhodne a zapíše do deníku (`wedding`).
 */
export async function decideAiWeddings(
  env: Bindings, teamId: string, profile: AiCoachProfile, now: Date, opts: AiWeddingOpts,
): Promise<AiWeddingResult[]> {
  const db = env.DB;
  const team = await db.prepare("SELECT name, budget, game_date, user_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ name: string; budget: number; game_date: string | null; user_id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "klub pro svatbu", e); return null; });
  if (!team || team.user_id !== "ai") return [];
  const gameDate = team.game_date ?? now.toISOString();
  const today = (opts.today ?? gameDate).slice(0, 10);
  const rows = await db.prepare(
    `SELECT * FROM weddings WHERE team_id = ? AND choice IS NULL AND wedding_date > ? AND (? IS NULL OR id = ?)
      ORDER BY wedding_date`,
  ).bind(teamId, today, opts.weddingId ?? null, opts.weddingId ?? null).all<WeddingRow>()
    .catch((e) => { logger.warn({ module: M, teamId }, "svatby AI klubu", e); return { results: [] as WeddingRow[] }; });
  if (rows.results.length === 0) return [];

  const reserve = budgetReserve(profile, await weeklyRunningCosts(db, teamId)
    .catch((e) => { logger.warn({ module: M, teamId }, "týdenní náklady pro svatbu", e); return 0; }));
  const results: AiWeddingResult[] = [];
  for (const w of rows.results) {
    try {
      const groom = await db.prepare(
        "SELECT first_name, last_name, age, position FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
      ).bind(w.player_id, teamId).first<{ first_name: string; last_name: string; age: number; position: string }>();
      if (!groom) continue;
      const guests = await loadGuests(db, teamId, w.player_id);
      const budget = Number(team.budget) || 0;
      const c: WeddingDecisionContext = {
        teamName: team.name, profile, budget, reserve,
        groom: { name: `${groom.first_name} ${groom.last_name}`, age: groom.age, position: groom.position },
        weddingDay: w.wedding_date, matchNextDay: !!w.match_date,
        absentIfFull: w.match_date ? planHangover(guests, "none", COUNT_RNG).absent.length : 0,
        absentIfAttend: w.match_date ? planHangover(guests, "attend", COUNT_RNG).absent.length : 0,
        giftOptions: affordableGifts(budget, reserve),
      };
      const { decision, trace } = opts.mode !== "off" && opts.ai?.AI
        ? await decideWithModel(opts.ai, c, opts.model)
        : { decision: null, trace: NO_TRACE };
      const decidedBy: "model" | "fallback" = decision ? "model" : "fallback";
      let choice = decision ?? fallbackWeddingDecision(c);

      if (choice.choice === "gift" && choice.giftAmount) {
        // Model přemýšlí i minutu, mezitím se rozpočet mohl změnit: dar nesmí sáhnout na rezervu.
        const fresh = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
        if (!fresh || fresh.budget - choice.giftAmount < reserve) choice = { choice: "attend", giftAmount: null, reason: "dar by sáhl na rezervu" };
      }

      const logMode: CoachMode = opts.mode;
      let executed = false;
      if (logMode !== "shadow") {
        const r = await recordWeddingDecision(db, w, {
          choice: choice.choice, giftAmount: choice.giftAmount, decidedBy: decidedBy === "model" ? "ai" : "ai_fallback", quote: choice.reason,
        }, { today, gameDate });
        executed = r.recorded;
      }
      await logDecision(db, {
        teamId, kind: "wedding", mode: logMode, model: trace.model, contextRef: w.id,
        inputSummary: trace.prompt ?? `svatba ${w.wedding_date}, zápas druhý den: ${c.matchNextDay ? "ano" : "ne"}, chyběli by ${c.absentIfFull}, s trenérem ${c.absentIfAttend}`,
        rawOutput: trace.raw,
        actions: { choice: choice.choice, giftAmount: choice.giftAmount, reason: choice.reason, decidedBy },
        executed: logMode === "shadow" ? null : { recorded: executed },
        usedFallback: decidedBy === "fallback", error: trace.error,
        tokensIn: trace.tokensIn, tokensOut: trace.tokensOut, latencyMs: trace.latencyMs,
      });
      results.push({ weddingId: w.id, choice: choice.choice, decidedBy, executed });
    } catch (e) {
      logger.warn({ module: M, teamId }, `svatba AI klubu ${w.id}`, e);
    }
  }
  return results;
}

/** Hodinová práce AI trenéra (hourly-hooks.ts). Svatby spadají pod správu klubu (oblast weekly). */
export const weddingsHourlyHook: HourlyHook = async (env, teamId, profile, now) => {
  const mode = await readCoachMode(env.CACHE_KV, "weekly");
  await decideAiWeddings(env, teamId, profile, now, { mode, ai: env });
};
