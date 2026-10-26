/**
 * Jednání AI klubu s majitelem firmy (hlavní sponzor, název stadionu) stejnou cestou jako
 * u člověka. Kolo po kole model vybere tah (sponsor-negotiation-decision.ts) a kód ho provede
 * stejnými funkcemi jako tlačítka na stránce jednání: podpis (signFromState), vlastní návrh
 * (proposeRound, odpověď majitele počítá server) a ukončení jednání (closeNegotiation).
 *
 * Každý tah má v deníku vlastní záznam (`sponsor_negotiation`). Bez modelu (režim off, výpadek,
 * neplatná odpověď, došel limit tahů) platí dosavadní chování: podepsat, co je na stole.
 * V režimu nanečisto se jednání neotevře: model rozhodne jen první tah nad úvodní nabídkou,
 * jak by ji majitel teď dal (draftNegotiation), a do deníku se zapíše bez provedení.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import type { NegotiationCategory } from "../sponsors/negotiation";
import {
  closeNegotiation, draftNegotiation, loadNegotiationState, teamGameDate,
  type Negotiation, type NegotiationSponsor, type NegotiationState, type NegotiationTeam,
} from "../sponsors/negotiation-db";
import { proposeRound } from "../sponsors/negotiation-round";
import { signFromState } from "../sponsors/signing";
import { NO_TRACE, type DecidedBy, type ModelTrace } from "./buy-model";
import { logDecision, type DecisionMode } from "./decision-log";
import { callCoachModel } from "./llm";
import type { CoachMode } from "./mode";
import type { AiCoachProfile } from "./profile";
import {
  checkSponsorTalks, counterProposal, fallbackSponsorTalks, MAX_AI_COUNTERS, renderSponsorTalksPrompt, SPONSOR_TALKS_SYSTEM_PROMPT,
  sponsorTalksContext, sponsorTalksMoves, sponsorTalksSchema,
  type SponsorTalksContext, type SponsorTalksDecision,
} from "./sponsor-negotiation-decision";

const M = "ai-coach-sponsor-talks";
/** Tah v jednání je krátké rozhodnutí: pondělní správa na model nemá čekat dlouho. */
const MODEL_TIMEOUT_MS = 60_000;
/** Tahů jednoho jednání: vlastní návrhy a závěrečné rozhodnutí (podepsat, nebo odejít). */
const MAX_TURNS = MAX_AI_COUNTERS + 1;
/** Kolik tahů jednoho jednání nejvýš rozhodne model (hledání sponzora ho násobí počtem firem). */
export const MAX_MODEL_TURNS = MAX_TURNS;

export interface TalksModelUse {
  /** Režim přepínače (oblast weekly): `off` = bez modelu, jen pravidlo. */
  mode: CoachMode;
  /** Binding Workers AI; bez něj rozhoduje pravidlo. */
  ai?: Pick<Bindings, "AI"> | null;
  /** Jiný model (srovnání v adminu). */
  model?: string;
  /** Kolik tahů ještě smí rozhodnout model (sdílí ho všechna jednání jednoho hledání). */
  turnsLeft: { n: number };
}

export interface TalksResult {
  /**
   * `signed` podepsáno, `ai_walked_away` AI jednání ukončila, `owner_walked_away` majiteli došla
   * trpělivost, `failed` podpis nebo jednání selhalo (firma mezitím jinde, stav se změnil).
   */
  outcome: "signed" | "ai_walked_away" | "owner_walked_away" | "failed";
  contractId: string | null;
  newTeamName: string | null;
  detail: string;
}

interface TurnOutcome {
  decision: SponsorTalksDecision;
  by: DecidedBy;
  trace: ModelTrace;
}

/** Jeden tah: model, nebo pravidlo. Jediný přípustný tah (jen odejít) rozhodne kód bez modelu. */
async function decideTurn(c: SponsorTalksContext, use: TalksModelUse): Promise<TurnOutcome> {
  const rule = fallbackSponsorTalks(c);
  if (sponsorTalksMoves(c).length === 1) return { decision: rule, by: "guard", trace: NO_TRACE };
  if (use.mode === "off" || !use.ai) return { decision: rule, by: "fallback", trace: NO_TRACE };
  if (use.turnsLeft.n <= 0) return { decision: rule, by: "fallback", trace: { ...NO_TRACE, error: "došel limit tahů modelu" } };
  use.turnsLeft.n--;
  const prompt = renderSponsorTalksPrompt(c);
  const res = await callCoachModel(use.ai, {
    system: SPONSOR_TALKS_SYSTEM_PROMPT, user: prompt, maxTokens: 400,
    schema: { name: "sponsor_negotiation", schema: sponsorTalksSchema(c) }, model: use.model, timeoutMs: MODEL_TIMEOUT_MS,
  });
  const trace: ModelTrace = {
    model: res.model, raw: res.raw, error: res.error ?? null, tokensIn: res.tokensIn ?? null, tokensOut: res.tokensOut ?? null,
    latencyMs: res.latencyMs, prompt,
  };
  if (!res.json) return { decision: rule, by: "fallback", trace };
  const check = checkSponsorTalks(res.json, c);
  if (!check.ok) return { decision: rule, by: "fallback", trace: { ...trace, error: check.reason } };
  return { decision: check.decision, by: "model", trace };
}

function contextOf(st: NegotiationState, profile: AiCoachProfile): SponsorTalksContext {
  return sponsorTalksContext({
    neg: st.neg, deal: st.ctx, owner: st.owner.personality, favor: st.favor, sponsorName: st.sponsor.name,
    sponsorType: st.sponsor.type, renewal: st.isRenewal, gameDate: teamGameDate(st.team), teamName: st.team.name,
    budget: st.team.budget, profile,
  });
}

/** Zápis tahu do deníku: co model dostal a vrátil, jaké tahy a meze kód nabídl, co se provedlo. */
async function logTurn(db: D1Database, e: {
  teamId: string; mode: DecisionMode; contextRef: string; turn: number; category: NegotiationCategory;
  sponsor: { id: number; name: string }; c: SponsorTalksContext; outcome: TurnOutcome; executed: unknown;
}): Promise<void> {
  const { c, outcome } = e;
  const t = outcome.trace;
  const d = outcome.decision;
  const counter = d.move === "counter" ? counterProposal(d, c) : null;
  await logDecision(db, {
    teamId: e.teamId, kind: "sponsor_negotiation", mode: e.mode, model: t.model, contextRef: e.contextRef,
    inputSummary: t.prompt ?? `${c.sponsorName} (${e.category}): tah ${e.turn}, na stole ${c.table ? `${c.table.monthly} Kč/měs., podpis ${c.table.signingBonus} Kč` : "nic"}`,
    rawOutput: t.raw,
    actions: {
      turn: e.turn, category: e.category, sponsorId: e.sponsor.id, sponsorName: e.sponsor.name,
      move: d.move, reason: d.reason, decidedBy: outcome.by,
      ...(counter ? { proposal: { seasons: counter.seasons, monthly: counter.demands.monthly, signingBonus: counter.demands.signingBonus, promises: counter.promises } } : {}),
      moves: sponsorTalksMoves(c),
      table: c.table
        ? { seasons: c.table.seasons, monthly: c.table.monthly, signingBonus: c.table.signingBonus, promises: c.table.promises.map((p) => p.spec.kind) }
        : null,
      bounds: c.counter
        ? {
          seasons: c.counter.seasons, monthly: c.counter.monthly, signingBonus: c.counter.signingBonus, countersLeft: c.counter.countersLeft,
          promises: c.counter.promises.map((p) => ({ key: p.key, kind: p.spec.kind, params: p.spec.params })),
        }
        : null,
      patience: c.patience, favor: c.favor,
    },
    executed: e.executed,
    usedFallback: outcome.by === "fallback",
    error: t.error,
    tokensIn: t.tokensIn, tokensOut: t.tokensOut, latencyMs: t.latencyMs,
  });
}

/**
 * Slib „logo na rukávu“ u nové smlouvy stadionu AI splní hned po podpisu stejnou službou jako
 * tlačítko na webu (jediná rozumná možnost, kód ji provede bez modelu).
 */
async function placePromisedSleeveLogo(db: D1Database, teamId: string, contractId: string, gameDate: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT id FROM sponsor_promises WHERE contract_id = ? AND team_id = ? AND kind = 'jersey_logo' AND status = 'pending'",
  ).bind(contractId, teamId).all<{ id: string }>()
    .catch((e) => {
      logger.warn({ module: M, teamId }, `sliby loga na rukávu smlouvy ${contractId}`, e);
      return { results: [] as Array<{ id: string }> };
    });
  let placed = 0;
  const { placeSleeveLogo } = await import("../sponsors/promise-runs");
  for (const r of rows.results) {
    const res = await placeSleeveLogo(db, teamId, r.id, gameDate);
    if (res.ok) placed++;
    else logger.warn({ module: M, teamId }, `logo na rukáv podle slibu ${r.id} nešlo umístit: ${res.error}`);
  }
  return placed;
}

interface Executed {
  /** Co se v DB stalo (do deníku). */
  executed: Record<string, unknown>;
  /** Jednání skončilo; bez výsledku se pokračuje dalším tahem. */
  result: TalksResult | null;
}

async function signTurn(db: D1Database, st: NegotiationState): Promise<Executed> {
  const teamId = st.team.id;
  const signed = await signFromState(db, st);
  if (signed.ok) {
    const logos = st.neg.category === "stadium" ? await placePromisedSleeveLogo(db, teamId, signed.contractId, teamGameDate(st.team)) : 0;
    logger.info({ module: M, teamId }, `${st.sponsor.name} (${st.neg.category}) podepsán, smlouva ${signed.contractId}`);
    return {
      executed: { result: "signed", contractId: signed.contractId, newTeamName: signed.newTeamName, ...(logos ? { sleeveLogo: true } : {}) },
      result: { outcome: "signed", contractId: signed.contractId, newTeamName: signed.newTeamName, detail: st.sponsor.name },
    };
  }
  // Podmínky nejde podepsat (firma mezitím jinde, stav klubu se změnil): jednání se zavře, ať nevisí.
  await closeNegotiation(db, teamId, st.neg.id);
  logger.info({ module: M, teamId }, `${st.sponsor.name}: podmínky nejde podepsat: ${signed.error}`);
  return {
    executed: { result: "sign_failed", error: signed.error },
    result: { outcome: "failed", contractId: null, newTeamName: null, detail: signed.error },
  };
}

async function walkAwayTurn(db: D1Database, st: NegotiationState): Promise<Executed> {
  const closed = await closeNegotiation(db, st.team.id, st.neg.id);
  return {
    executed: { result: "closed", closed },
    result: { outcome: "ai_walked_away", contractId: null, newTeamName: null, detail: `${st.sponsor.name}: jednání ukončeno` },
  };
}

/**
 * Vede otevřené jednání tah po tahu, dokud AI nepodepíše nebo neodejde, nebo neodejde majitel.
 * Nikdy nehází (chyba DB jde do logu a jednání skončí jako `failed`).
 */
export async function negotiateWithOwner(
  db: D1Database, teamId: string, negotiationId: string, profile: AiCoachProfile, use: TalksModelUse,
): Promise<TalksResult> {
  const failed = (detail: string): TalksResult => ({ outcome: "failed", contractId: null, newTeamName: null, detail });
  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const st = await loadNegotiationState(db, teamId, negotiationId);
      if ("error" in st) return failed(st.error);
      if (st.neg.status === "walked_away") {
        return { outcome: "owner_walked_away", contractId: null, newTeamName: null, detail: `${st.sponsor.name}: majitel odešel` };
      }
      if (st.neg.status !== "open" && st.neg.status !== "accepted") return failed(`jednání je ve stavu ${st.neg.status}`);

      const c = contextOf(st, profile);
      let outcome = await decideTurn(c, use);
      let done: Executed;
      if (outcome.decision.move === "counter") {
        const proposal = counterProposal(outcome.decision, c);
        const res = await proposeRound(db, st, proposal);
        if (res.ok) {
          const reply = res.reply;
          done = {
            executed: {
              result: "proposed", ownerResponse: reply.kind, status: reply.next.status, patience: reply.next.patience,
              ...(reply.round.response.counter ? { ownerCounter: reply.round.response.counter } : {}),
            },
            result: reply.next.status === "walked_away"
              ? { outcome: "owner_walked_away", contractId: null, newTeamName: null, detail: `${st.sponsor.name}: majitel odešel` }
              : null,
          };
        } else {
          // Návrh služba nepřijala (validace, souběžný zápis): dosavadní chování, podepsat, co je na stole.
          outcome = { decision: fallbackSponsorTalks(c), by: "fallback", trace: { ...outcome.trace, error: `návrh neprošel: ${res.error}` } };
          done = outcome.decision.move === "sign" ? await signTurn(db, st) : await walkAwayTurn(db, st);
        }
      } else {
        done = outcome.decision.move === "sign" ? await signTurn(db, st) : await walkAwayTurn(db, st);
      }
      await logTurn(db, {
        teamId, mode: use.mode === "off" ? "off" : "on", contextRef: negotiationId, turn, category: st.neg.category,
        sponsor: { id: st.sponsor.id, name: st.sponsor.name }, c, outcome, executed: done.executed,
      });
      if (done.result) return done.result;
    }
    // Pojistka: poslední tah je vždycky podpis, nebo odchod. Kdyby ne, jednání nesmí viset.
    await closeNegotiation(db, teamId, negotiationId);
    return failed("došly tahy jednání");
  } catch (e) {
    logger.error({ module: M, teamId }, `jednání ${negotiationId} selhalo`, e);
    return failed(String((e as Error)?.message ?? e).slice(0, 200));
  }
}

/**
 * Nanečisto: jak by AI zahájila jednání s firmou. Jednání se neotevře, model rozhodne první tah
 * nad úvodní nabídkou, jakou by majitel teď dal, a tah se zapíše do deníku bez provedení.
 */
export async function shadowFirstTurn(db: D1Database, i: {
  team: NegotiationTeam; sponsor: NegotiationSponsor; category: NegotiationCategory; season: number; renewal: boolean;
  profile: AiCoachProfile; use: TalksModelUse; contextRef: string;
}): Promise<SponsorTalksDecision | null> {
  const draft = await draftNegotiation(db, i.team, i.sponsor, i.category, i.season)
    .catch((e) => {
      logger.warn({ module: M, teamId: i.team.id }, `návrh jednání s ${i.sponsor.name} nanečisto`, e);
      return null;
    });
  if (!draft || "error" in draft) return null;
  const neg: Negotiation = {
    id: `shadow-${i.sponsor.id}`, teamId: i.team.id, sponsorId: i.sponsor.id, category: i.category, wishes: draft.wishes,
    budgetB: draft.budgetB, patience: draft.patience, rounds: draft.rounds, roundsRaw: JSON.stringify(draft.rounds),
    status: "open", expiresGameDate: draft.expiresGameDate, cooldownUntil: null,
  };
  const c = sponsorTalksContext({
    neg, deal: draft.ctx, owner: draft.owner.personality, favor: draft.favor, sponsorName: i.sponsor.name, sponsorType: i.sponsor.type,
    renewal: i.renewal, gameDate: teamGameDate(i.team), teamName: i.team.name, budget: i.team.budget, profile: i.profile,
  });
  const outcome = await decideTurn(c, i.use);
  await logTurn(db, {
    teamId: i.team.id, mode: "shadow", contextRef: i.contextRef, turn: 1, category: i.category,
    sponsor: { id: i.sponsor.id, name: i.sponsor.name }, c, outcome, executed: null,
  });
  return outcome.decision;
}
