/**
 * Kolo jednání se sponzorem: návrh klubu a odpověď majitele. Jedna služba pro manažera
 * (POST /teams/:teamId/sponsors/negotiations/:id/propose) i AI trenéra
 * (ai-coach/sponsor-negotiation.ts). Klient (i model) posílá jen návrh; cenu, ochotu
 * i protinabídku počítá server z vlastního kontextu jednání.
 *
 * Návrh jde poslat i do jednání ve stavu 'accepted': nový návrh nahradí přijaté podmínky
 * (další kolo pak počítá stejně jako z 'open': přijetí zůstává 'accepted', protinabídka
 * nebo odmítnutí se vrací do 'open', dojití trpělivosti na 'walked_away').
 */
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { applySponsorFavorDelta } from "./favor";
import { FAVOR_REASONS, WALKED_AWAY_FAVOR } from "./favor-math";
import { afterReject, complaintFor, COOLDOWN_DAYS, evaluateRound, INSULT_FAVOR, wishComplaint, type Proposal } from "./negotiation";
import { pendingTerms, saveRound, teamGameDate, type NegotiationRound, type NegotiationState, type NegotiationStatus } from "./negotiation-db";
import { ownerResponse, type ResponseKind } from "./negotiation-texts";
import { validateProposal } from "./proposal";

/** Protinabídky trpělivost neberou, strop kol drží JSON kol v rozumné velikosti. */
export const MAX_NEGOTIATION_ROUNDS = 30;

export const NEGOTIATION_STATUS_ERRORS: Record<Exclude<NegotiationStatus, "open">, { error: string; status: 409 | 410 }> = {
  accepted: { error: "Majitel už návrh přijal, zbývá podepsat", status: 409 },
  walked_away: { error: "Majitel od jednání odešel", status: 409 },
  expired: { error: "Jednání vypršelo", status: 410 },
  signed: { error: "Smlouva už je podepsaná", status: 409 },
};

export interface OwnerReply {
  /** Odpověď majitele: přijetí, protinabídka za peníze nebo za přání, odmítnutí, urážka, odchod. */
  kind: ResponseKind;
  round: NegotiationRound;
  next: { status: NegotiationStatus; patience: number; cooldownUntil: string | null };
  /** Návrh byl nad 1,5 × ochoty (náklonnost −3, i když majitel zároveň odešel). */
  insulted: boolean;
}

/** Odpověď majitele na platný návrh klubu nad načteným stavem jednání (bez zápisu). */
export function ownerReply(st: Pick<NegotiationState, "neg" | "ctx" | "owner" | "team">, proposal: Proposal): OwnerReply {
  const outcome = evaluateRound(proposal, st.ctx);
  const gameDate = teamGameDate(st.team);
  let status: NegotiationStatus = "open";
  let patience = st.neg.patience;
  let cooldown = st.neg.cooldownUntil;
  let kind: ResponseKind;
  if (outcome.kind === "accept") {
    status = "accepted";
    kind = "accept";
  } else if (outcome.kind === "counter_money" || outcome.kind === "counter_wish") {
    kind = outcome.kind;
  } else {
    const after = afterReject(patience);
    patience = after.patience;
    kind = outcome.insulted ? "insulted" : "reject";
    if (after.walkedAway) {
      status = "walked_away";
      kind = "walked_away";
      cooldown = gameExpiry(gameDate, COOLDOWN_DAYS);
    }
  }
  const wish = outcome.kind === "counter_wish" ? outcome.wish : undefined;
  const counter = outcome.kind === "counter_money" || outcome.kind === "counter_wish" ? outcome.counter : undefined;
  // Co majiteli konkrétně vadí: u protinabídky za přání je to rovnou ten chybějící slib
  // (stejný jako `wish`), jinak položka nejvíc zvednutá oproti poslední dohodě (complaintFor).
  // Nikdy pro accept.
  const complaint = outcome.kind === "counter_wish"
    ? wishComplaint(outcome.wish).text
    : outcome.kind !== "accept" ? complaintFor(proposal, st.ctx, pendingTerms(st.neg))?.text : undefined;
  const insulted = outcome.kind === "reject" && outcome.insulted;
  const round: NegotiationRound = {
    proposal,
    response: {
      kind,
      text: ownerResponse(st.owner.personality, kind, st.neg.rounds.length, wish),
      gameDate,
      // Postup sezóny, se kterým majitel přijal nebo spočítal protinabídku: podpis podle něj ověřuje cenu.
      ...(outcome.kind !== "reject" ? { progressMonths: st.ctx.seasonProgressMonths } : {}),
      ...(counter ? { counter } : {}),
      ...(wish ? { wish } : {}),
      ...(insulted ? { insulted: true } : {}),
      ...(complaint ? { complaint } : {}),
    },
  };
  return { kind, round, next: { status, patience, cooldownUntil: cooldown }, insulted };
}

export type ProposeResult =
  | { ok: true; reply: OwnerReply }
  | { ok: false; error: string; status: 400 | 409 | 410 };

/**
 * Návrh klubu do jednání: stav a strop kol, validace (stejná jako u podpisu), odpověď majitele,
 * zápis kola s optimistickým zámkem (dvojklik nespálí trpělivost dvakrát) a náklonnost
 * za urážku a odchod majitele.
 */
export async function proposeRound(db: D1Database, st: NegotiationState, raw: unknown): Promise<ProposeResult> {
  if (st.neg.status !== "open" && st.neg.status !== "accepted") {
    const e = NEGOTIATION_STATUS_ERRORS[st.neg.status];
    return { ok: false, error: e.error, status: e.status };
  }
  if (st.neg.rounds.length >= MAX_NEGOTIATION_ROUNDS) {
    return { ok: false, error: "Majitel už o tom nechce dál mluvit, přijmi jeho poslední nabídku, nebo to nech být", status: 409 };
  }
  const valid = validateProposal(raw, st.ctx);
  if (!valid.ok) return { ok: false, error: valid.error, status: 400 };

  const reply = ownerReply(st, valid.proposal);
  const saved = await saveRound(db, st.neg, reply.round, reply.next);
  if (!saved) return { ok: false, error: "Návrh se právě zpracovává, načti stránku znovu", status: 409 };

  const teamId = st.team.id;
  // Nabídka nad 1,5 × ochoty majitele urazí (spec: náklonnost −3), zapisuje se do deníku.
  if (reply.insulted) {
    await applySponsorFavorDelta(db, st.sponsor.id, teamId, INSULT_FAVOR, FAVOR_REASONS.negotiationInsult)
      .catch((e) => { logger.error({ module: "sponsors", teamId }, `urážka při jednání ${st.neg.id} se nezapsala do náklonnosti`, e); });
  }
  // Trpělivost došla, majitel odchází bez dohody (spec: náklonnost −5, navíc k urážce, když se sešly obě).
  if (reply.next.status === "walked_away") {
    await applySponsorFavorDelta(db, st.sponsor.id, teamId, WALKED_AWAY_FAVOR, FAVOR_REASONS.walkedAway)
      .catch((e) => { logger.error({ module: "sponsors", teamId }, `odchod od jednání ${st.neg.id} se nezapsal do náklonnosti`, e); });
  }
  logger.info({ module: "sponsors", teamId },
    `jednání ${st.neg.id}: kolo ${st.neg.rounds.length + 1}, ${reply.kind}, trpělivost ${reply.next.patience}`);
  return { ok: true, reply };
}
