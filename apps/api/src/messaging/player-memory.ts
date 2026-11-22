/**
 * Co hráč ví o sobě, když trenérovi odpovídá. Každá položka vznikla z rozhovoru
 * na produkci, kde to hráč nevěděl a trenérovi odporoval (prod 17.–24. 10.):
 *
 *  - opilá hlasovka: 5 z 6 trenérů, kteří mu pití vytkli, slyšelo „nepiju, to víte",
 *  - zmeškaný hovor: na „nechtěl si volat?" odepsal „já nic netelefonoval",
 *  - čekající nabídka: slíbil „zůstávám, odmítněte to" a po odmítnutí se zlobil,
 *    protože o jeho zájmu rozhoduje výpočet (player-interest.ts), ne rozhovor.
 *
 * Doléčené zranění nese `life_context.lastInjury` a čte ho `loadPlayerSnapshot`.
 */

import { logger } from "../lib/logger";
import { hearsayPromptLines } from "../hearsay/prompt";
import { loadActiveListing } from "../transfers/listing-status";
import { computeInterestForOffer, interestOfferOf, type InterestLevel } from "../transfers/player-interest";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import { commitmentPromptLines, loadCommitmentMemory, pendingInviteOf } from "./coach-commitments";
import { pledgePromptLines } from "./attendance-pledge";
import { claimPromptLines, loadCoachClaimMemory } from "./coach-claims";

const M = "player-memory";

/** Kolik dní hráč ví, že trenérovi volal. */
const MISSED_CALL_DAYS = 3;
/** Jak dlouho platí, co hráč v SMS řekl o čekající nabídce (`life_context.offerStance`). */
export const OFFER_STANCE_DAYS = 7;

export type OfferStance = "stay" | "leave";

export interface StoredOfferStance {
  stance: OfferStance;
  at: string;
  /** Nabídky, o kterých v tu chvíli věděl. Na jiné nabídky postoj neplatí. */
  offerIds: string[];
}

/** Doplní snapshot o to, co se jinak nenačítá. Selhání jednoho dotazu nevadí, hráč jen bude vědět míň. */
export async function loadChatMemory(
  db: D1Database,
  player: PlayerSnapshot,
  opts: { teamId: string; convId: string },
): Promise<{ offerIds: string[] }> {
  const fullName = `${player.firstName} ${player.lastName}`;
  const [call, drunk, offers, commitments, listing, claims] = await Promise.all([
    db.prepare(
      `SELECT pocet FROM missed_calls
        WHERE team_id = ? AND volajici = 'hrac' AND jmeno = ? AND julianday(created_at) > julianday('now', ?)
        ORDER BY created_at DESC LIMIT 1`,
    ).bind(opts.teamId, fullName, `-${MISSED_CALL_DAYS} days`).first<{ pocet: number }>()
      .catch((e) => { logger.warn({ module: M }, "zmeškaný hovor hráče", e); return null; }),
    db.prepare(
      `SELECT 1 AS x FROM messages
        WHERE conversation_id = ? AND sender_type = 'player' AND json_extract(metadata, '$.drunk') = 1
          AND julianday(sent_at) > julianday('now', '-2 days')
        LIMIT 1`,
    ).bind(opts.convId).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, "opilá hlasovka hráče", e); return null; }),
    loadPendingOffers(db, player.id),
    loadCommitmentMemory(db, player.id),
    loadActiveListing(db, player.id),
    // Co trenér v SMS oznámil (vyhazov, prodej, policie, páska, plat) a jestli se to ve hře stalo.
    loadCoachClaimMemory(db, { clubTeamId: opts.teamId, playerId: player.id, convId: opts.convId }),
  ]);
  const { loadHearsayMemory } = await import("../hearsay/prompt");
  const hearsay = await loadHearsayMemory(db, player.id, opts.teamId)
    .catch((e) => { logger.warn({ module: M }, "co se hráč doslechl", e); return []; });
  if (hearsay.length > 0) player.hearsay = hearsay;
  if (commitments.length > 0) player.coachCommitments = commitments;
  player.pendingInvite = pendingInviteOf(commitments);
  if (call) player.missedCall = { count: call.pocet ?? 1 };
  if (drunk) player.drunkVoiceRecently = true;
  if (offers.length > 0) player.pendingOffers = offers.map(({ club, interest }) => ({ club, interest }));
  if (listing) player.marketListing = listing;
  if (claims.length > 0) player.coachClaims = claims;
  return { offerIds: offers.map((o) => o.id) };
}

/** Nabídky na hráče, o kterých ještě nerozhodl jeho klub, a jak moc ho lákají. Nejvýš dvě. */
async function loadPendingOffers(
  db: D1Database,
  playerId: string,
): Promise<Array<{ id: string; club: string; interest: InterestLevel }>> {
  const rows = await db.prepare(
    `SELECT o.id, o.from_team_id, o.offer_amount, o.counter_amount, o.virtual_team_data, t.name AS buyer_name
       FROM transfer_offers o LEFT JOIN teams t ON t.id = o.from_team_id
      -- Na tahu je hráčův klub: nová nabídka, nebo protinávrh kupce (stejně jako offer-expiry.ts).
      WHERE o.player_id = ? AND o.status IN ('pending', 'countered')
        AND (o.last_action_by IS NULL OR o.last_action_by = o.from_team_id)
      ORDER BY o.created_at DESC LIMIT 2`,
  ).bind(playerId).all<{
    id: string; from_team_id: string; offer_amount: number; counter_amount: number | null;
    virtual_team_data: string | null; buyer_name: string | null;
  }>()
    .catch((e) => { logger.warn({ module: M }, "čekající nabídky na hráče", e); return { results: [] as never[] }; });

  const out: Array<{ id: string; club: string; interest: InterestLevel }> = [];
  for (const r of rows.results) {
    const interest = await computeInterestForOffer(db, playerId, interestOfferOf(r))
      .catch((e) => { logger.warn({ module: M }, `zájem o nabídku ${r.id}`, e); return null; });
    if (!interest) continue;
    out.push({ id: r.id, club: r.buyer_name ?? virtualClubName(r.virtual_team_data) ?? "jiný klub", interest: interest.level });
  }
  return out;
}

function virtualClubName(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { name?: string }).name ?? null;
  } catch (e) {
    logger.warn({ module: M }, "virtual_team_data nabídky", e);
    return null;
  }
}

/**
 * Zapíše, co hráč v SMS řekl o čekající nabídce. Odmítnutí nabídky se podle toho
 * zařídí (`stanceForOffer` v offer-rejection-impact.ts): kdo trenérovi sám řekl
 * „odmítněte to", ten se pak nezlobí.
 */
export function offerStanceStmt(
  db: D1Database,
  playerId: string,
  stance: OfferStance,
  offerIds: string[],
): D1PreparedStatement {
  const value: StoredOfferStance = { stance, at: new Date().toISOString(), offerIds };
  return db.prepare(
    "UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.offerStance', json(?)) WHERE id = ?",
  ).bind(JSON.stringify(value), playerId);
}

/**
 * Platí uložený postoj pro tuhle nabídku? Jen pro nabídku, o které hráč v tu chvíli věděl,
 * a nejvýš týden, pak si to mohl rozmyslet.
 */
export function stanceForOffer(raw: unknown, offerId: string, now = Date.now()): OfferStance | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StoredOfferStance>;
  if (s.stance !== "stay" && s.stance !== "leave") return null;
  const at = s.at ? Date.parse(s.at) : NaN;
  if (!Number.isFinite(at) || now - at > OFFER_STANCE_DAYS * 86400_000) return null;
  if (!Array.isArray(s.offerIds) || !s.offerIds.includes(offerId)) return null;
  return s.stance;
}

/** Jak moc ho nabídka láká, slovy pro prompt (čísla hráč v hlavě nemá). */
const INTEREST_WORDS: Record<InterestLevel, string> = {
  0: "vůbec tě to neláká, chceš zůstat",
  1: "trochu tě to láká, ale spíš váháš",
  2: "dost tě to láká, rád bys šel",
  3: "hodně tě to táhne, chceš jít",
};

function dayCz(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d}. ${m}.` : "";
}

/** Hráč je na přestupové listině: ví to a nezapírá, že se s ním počítá. */
export function marketListingLine(l: { kind: "transfer" | "loan"; since: string }): string {
  const since = dayCz(l.since);
  return l.kind === "loan"
    ? `- Trenér tě nabízí na hostování${since ? ` (od ${since})` : ""}: klub tě chce poslat hrát jinam. Víš o tom. Nediv se, že nehraješ, a netvrď, že nevíš proč. Reaguj podle povahy: naštvaně, smířeně, nebo že rád půjdeš hrát jinam.`
    : `- Trenér tě dal na přestupovou listinu${since ? ` (od ${since})` : ""}: klub tě chce prodat. Víš o tom. Nediv se, že nehraješ, a netvrď, že nevíš proč. Reaguj podle povahy: naštvaně, smířeně, nebo že si hledáš klub.`;
}

/** Řádky do promptu podle toho, co `loadChatMemory` zjistil. Prázdné pole = nic. */
export function memoryPromptLines(player: PlayerSnapshot): string[] {
  const lines: string[] = [];
  if (player.drunkVoiceRecently) {
    lines.push("- Nedávno jsi trenérovi poslal OPILOU hlasovku z hospody (je v historii). Když ti to vyčte, nezapírej, že jsi pil. Klidně se omluv nebo to zlehči.");
  }
  if (player.missedCall) {
    lines.push(`- V posledních dnech jsi trenérovi ${player.missedCall.count > 1 ? `${player.missedCall.count}× ` : ""}volal a nevzal to. Volal jsi, protože tým prohrává a ty máš blbou náladu. Když se na to ptá, víš o tom.`);
  }
  lines.push(...commitmentPromptLines(player.coachCommitments));
  lines.push(...pledgePromptLines(player));
  lines.push(...hearsayPromptLines(player.hearsay));
  if (player.marketListing) lines.push(marketListingLine(player.marketListing));
  lines.push(...claimPromptLines(player.coachClaims));
  for (const o of player.pendingOffers ?? []) {
    lines.push(`- NABÍDKA: ${o.club} o tebe stojí a trenér ještě nerozhodl. Jak tě to láká: ${INTEREST_WORDS[o.interest]}. Když se tě na to trenér ptá, odpovídej podle toho. Rozmyslet si to můžeš, jen když tě opravdu přesvědčí (konkrétní slib, ocenění, víc peněz); samotné „zůstaň" nestačí.`);
  }
  return lines;
}
