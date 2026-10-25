/**
 * Přestupy jako služby: jedna implementace pravidel pro routy (člověk) i pro AI trenéra.
 *
 * Vytaženo z `routes/game.ts` (spec 3.6): nabídka, přijetí, odmítnutí, protinávrh, stažení,
 * příhoz na inzerát, starý příhoz (`transfer_bids`), inzerát a podpis volného hráče.
 * Routa ověří přihlášení a vlastnictví, zavolá službu a výsledek vrátí jako JSON.
 * AI trenér volá tytéž funkce, takže platí stejné ceny, limity, pauzy i přesuny peněz a hráčů.
 *
 * Zprávy (SMS, oznámení, hráčovy připomínky slibů) dostávají jen lidské kluby. AI klub
 * telefon nemá a nikdo by je nečetl.
 */

import type { Bindings } from "../index";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";
import { mustSeason } from "../lib/season";
import { stropyZDovednosti, talentPodleVeku } from "../skills/stropy-z-dovednosti";
import { recordTransaction } from "../season/finance-processor";
import { resolveClubTeamId, resolveOfferClubScope } from "../transfers/offer-club-scope";
import { areClubsLinked, LINKED_CLUBS_ERRORS } from "../competition/club-links";
import { offerReplyDeadline } from "../transfers/offer-deadline";
import { installmentLimitError, installmentBudgetError, weeklyInstallment } from "../transfers/installments";
import { sendPhoneSMS } from "../messaging/phone-sms";
import {
  MAX_TRANSFER_AMOUNT, formatTermsSummary, marketValue, termsFromRow, transferSchedule, transferTermsError,
  type TransferTerms,
} from "@okresni-masina/shared";

const M = "transfer-actions";
const SMS_ROLE = "Sportovní ředitel";

/** Poplatek za registraci volného hráče. */
export const FREE_AGENT_SIGNING_FEE = 500;

export type TransferActionStatus = 400 | 403 | 404 | 409 | 410 | 429 | 500;

export interface TransferActionFailure {
  ok: false;
  status: TransferActionStatus;
  error: string;
  /** Již existující nabídka (409 u duplicitní nabídky). */
  offerId?: string;
  /** Za kolik dní jde nabídnout znovu (429). */
  retryInDays?: number;
}

export type TransferActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | TransferActionFailure;

export interface TransferActionOptions {
  /** Práce na pozadí (dopad odmítnutí na hráče). Bez ní služba počká, než doběhne. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

function fail(status: TransferActionStatus, error: string, extra: Partial<Pick<TransferActionFailure, "offerId" | "retryInDays">> = {}): TransferActionFailure {
  return { ok: false, status, error, ...extra };
}

async function inBackground(opts: TransferActionOptions | undefined, promise: Promise<unknown>): Promise<void> {
  if (opts?.waitUntil) opts.waitUntil(promise);
  else await promise;
}

function pushEnvOf(env: Bindings) {
  return { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: env.DB };
}

/**
 * Vede klub AI trenér? Zprávy se mu neposílají. Při chybě čtení se zpráva pošle
 * (jako dřív), ať lidský klub o nic nepřijde.
 */
export async function isAiTeam(db: D1Database, teamId: string | null | undefined): Promise<boolean> {
  if (!teamId || teamId === "virtual_ai") return false;
  const row = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `typ klubu ${teamId}`, e); return null; });
  return row?.user_id === "ai";
}

/** SMS sportovního ředitele lidskému klubu; AI klubu se nic neposílá. */
async function smsToClub(db: D1Database, teamId: string, body: string, what: string): Promise<void> {
  if (await isAiTeam(db, teamId)) return;
  await sendPhoneSMS(db, teamId, SMS_ROLE, SMS_ROLE, body).catch((e) => logger.warn({ module: "game" }, what, e));
}

/** Oznámení (a push) lidskému klubu; AI klubu se nic neposílá. */
async function notifyClub(env: Bindings, teamId: string, title: string, body: string, url: string, what: string): Promise<void> {
  if (await isAiTeam(env.DB, teamId)) return;
  try {
    const { createNotification } = await import("../community/notifications");
    await createNotification(env.DB, teamId, "transfer", title, body, url, pushEnvOf(env));
  } catch (e) { logger.warn({ module: "game" }, what, e); }
}

/** Push týmům, které hráče sledují (kromě kupujícího). */
async function pushToWatchers(env: Bindings, playerId: string, buyerTeamId: string, title: string, body: string): Promise<void> {
  try {
    const { sendWebPushToPlayerWatchers } = await import("../community/web-push");
    await sendWebPushToPlayerWatchers(pushEnvOf(env), playerId, buyerTeamId, title, body, `/hrac/${playerId}`);
  } catch (e) { logger.warn({ module: "game" }, "push sledujícím po přestupu", e); }
}

/**
 * After transfer: recalculate commute distance and give the player a free squad number in the new team.
 * `permanent` = hráč klub opouští natrvalo (přestup, odkup z hostování, výměna), ne hostování ani návrat z něj.
 */
export async function onPlayerTransferred(db: D1Database, playerId: string, newTeamId: string, opts: { permanent: boolean }) {
  // Kupec si vzal hráče nabídnutého k jeho poptávce → poptávka je vyřízená.
  const { closeDemandsForArrival } = await import("../transfers/demands");
  await closeDemandsForArrival(db, playerId, newTeamId)
    .catch((e) => logger.warn({ module: "game" }, "uzavření poptávky po přestupu", e));
  // Get new team's village info
  const team = await db.prepare("SELECT v.name, v.district, v.lat, v.lng FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(newTeamId).first<{ name: string; district: string; lat: number; lng: number }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  // Get player's residence
  const player = await db.prepare("SELECT residence, commute_km FROM players WHERE id = ?")
    .bind(playerId).first<{ residence: string; commute_km: number }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });

  if (team && player) {
    // If player lives in the new team's village → commute = 0
    // Otherwise estimate based on old commute (we don't have player lat/lng)
    // Simple: if residence matches new village → 0, else random 5-20km
    const sameVillage = player.residence === team.name;
    const newCommute = sameVillage ? 0 : Math.floor(5 + Math.random() * 15);
    // trainingRest nemá cestovat s hráčem k novému týmu — volno dal starý trenér
    await db.prepare("UPDATE players SET commute_km = ?, squad_number = NULL, life_context = json_remove(life_context, '$.trainingRest') WHERE id = ?")
      .bind(newCommute, playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else {
    // At minimum reset squad number
    await db.prepare("UPDATE players SET squad_number = NULL, life_context = json_remove(life_context, '$.trainingRest') WHERE id = ?")
      .bind(playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  // Truc a slib patří klubu, ze kterého hráč natrvalo odešel. Hostování ani návrat z něj
  // na nich nic nemění: hráč pořád patří kmenovému klubu, se kterým je má.
  if (opts.permanent) {
    const { clearUnrestAfterTransfer } = await import("../transfers/promises");
    await clearUnrestAfterTransfer(db, playerId, newTeamId);
  }

  // Číslo ze starého klubu se smazalo výše; v novém dostane volné (bez kolize se spoluhráči)
  const { ensureSquadNumbers } = await import("../players/squad-numbers");
  await ensureSquadNumbers(db, newTeamId)
    .catch((e) => logger.warn({ module: "game" }, "squad number after transfer", e));

  // Vazby na nové spoluhráče a výchozí vztah k trenérovi — projde tudy každý přestup i hostování.
  const { attachNewcomerRelations } = await import("../transfers/attach-relations");
  await attachNewcomerRelations(db, newTeamId, playerId);
  const { initNewcomerCoachRelation } = await import("../lib/coach-relation");
  await initNewcomerCoachRelation(db, newTeamId, playerId);
}

// ═══ Přímá nabídka (přestup, hostování, výměna, odkup z hostování) ═══

export interface CreateOfferInput {
  playerId: string;
  amount: number;
  message?: string;
  offerType?: "transfer" | "loan";
  loanDuration?: number;
  offeredPlayerId?: string | null;
  offeredPlayerIds?: string[];
  targetSquad?: "senior" | "u21";
  upfrontPct?: number;
  installments?: number;
  sellOnPct?: number;
}

/** POST /teams/:teamId/offers — nabídka na hráče jiného klubu (lidského i AI). */
export async function createTransferOffer(env: Bindings, actorTeamId: string, body: CreateOfferInput): Promise<TransferActionResult<{ offerId: string }>> {
  const db = env.DB;
  const buyerClubTeamId = await resolveClubTeamId(db, actorTeamId);
  if (!buyerClubTeamId) return fail(404, "Kupující tým nenalezen");
  const targetSquad: "senior" | "u21" = body.targetSquad === "u21" ? "u21" : "senior";
  const player = await db.prepare("SELECT p.*, t.user_id FROM players p JOIN teams t ON p.team_id = t.id WHERE p.id = ?").bind(body.playerId).first<Record<string, unknown>>();
  if (!player) return fail(404, "Hráč nenalezen");

  // Buyout případ: hráč je u nás na hostování a chceme ho odkoupit od původního klubu
  const playerClubTeamId = await resolveClubTeamId(db, player.team_id as string);
  const isBuyout = playerClubTeamId === buyerClubTeamId && !!player.loan_from_team_id;
  let targetOwnerId = player.team_id as string;
  if (isBuyout) {
    targetOwnerId = player.loan_from_team_id as string;
    if (body.offerType === "loan") return fail(400, "Na hostujícího hráče lze poslat jen trvalý odkup");
  } else {
    if (playerClubTeamId === buyerClubTeamId) return fail(400, "Nemůžeš nabídnout na vlastního hráče");
    if (player.loan_from_team_id) return fail(400, "Hráč je již na hostování");
  }

  // Nabídky jdou lidským i AI klubům (spec 3.7). Klub mimo hru vlastní soupisku nemá.
  const ownerTeam = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(targetOwnerId).first<{ user_id: string }>();
  if (!ownerTeam) return fail(400, "Klub hráče nenalezen");
  // Propojené kluby: platí pro přestup, hostování, výměnu i odkup z hostování.
  if (await areClubsLinked(db, buyerClubTeamId, targetOwnerId)) return fail(403, LINKED_CLUBS_ERRORS.transfer);

  // U21 cíl: kupující musí mít U21 tým, hráč musí být do 21 let, nebýt na hostování ani čekat na návrat
  if (targetSquad === "u21") {
    if ((player.age as number) > 21) return fail(400, "Hráč starší 21 let nelze poslat do U21");
    if ((player.next_match_return as number) === 1) return fail(400, "Hráč právě čeká na návrat z U21, nelze nabízet");
    const buyerU21 = await db.prepare(
      "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
    ).bind(buyerClubTeamId).first<{ id: string }>();
    if (!buyerU21) return fail(400, "Tvůj klub nemá U21 tým");
  }

  const offerType = body.offerType ?? "transfer";
  const loanDuration = offerType === "loan" ? (body.loanDuration ?? 30) : null;

  const { parseSwapPlayerIds, swapPlayersError, insertSwapPlayersStmts } = await import("../transfers/swap-players");
  const parsedSwap = parseSwapPlayerIds(body);
  if ("error" in parsedSwap) return fail(400, parsedSwap.error);
  const swapPlayerIds = parsedSwap.ids;

  // Validace částky: 0 jde u hostování (zdarma) a u výměny (hráči za hráče bez doplatku).
  if (!Number.isInteger(body.amount) || body.amount < 0 || (offerType !== "loan" && body.amount === 0 && swapPlayerIds.length === 0)) {
    return fail(400, "Nabídka musí být kladné celé číslo (0 jen u hostování nebo výměny hráčů)");
  }
  if (body.amount > MAX_TRANSFER_AMOUNT) return fail(400, `Částka může být nejvýš ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`);

  // Podmínky: záloha, týdenní splátky, procenta z příštího přestupu (jen trvalý přestup).
  const terms: TransferTerms = { amount: body.amount, upfrontPct: body.upfrontPct ?? 100, installments: body.installments ?? 0, sellOnPct: body.sellOnPct ?? 0 };
  const plainTerms = terms.upfrontPct === 100 && terms.installments === 0 && terms.sellOnPct === 0;
  if (offerType === "loan" && !plainTerms) return fail(400, "Splátky a procenta jdou jen u trvalého přestupu");
  const termsError = transferTermsError(terms);
  if (termsError) return fail(400, termsError);
  if (terms.installments > 0) {
    const limitError = await installmentLimitError(db, buyerClubTeamId)
      ?? await installmentBudgetError(db, buyerClubTeamId, weeklyInstallment(terms));
    if (limitError) return fail(400, limitError);
  }
  // Kupující potřebuje peníze jen na zálohu (u jednorázové platby je záloha celá cena).
  const payNow = transferSchedule(terms).upfront;
  if (payNow > 0) {
    const team = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(buyerClubTeamId).first<{ budget: number }>();
    if (!team || team.budget < payNow) {
      return fail(400, terms.installments > 0
        ? `Nedostatek peněz na zálohu. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, záloha je ${payNow.toLocaleString("cs")} Kč.`
        : `Nedostatek peněz. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.`);
    }
  }

  if (offerType === "loan" && (!loanDuration || loanDuration < 7 || loanDuration > 180)) {
    return fail(400, "Délka hostování musí být 7–180 dní");
  }

  // Hráči na výměnu: jen v úvodní nabídce a jen u trvalého přestupu, vlastní, nezranění, ne chtěný hráč.
  if (swapPlayerIds.length > 0) {
    if (offerType === "loan") return fail(400, "Hráče na výměnu lze přidat jen u trvalého přestupu");
    const swapError = await swapPlayersError(db, swapPlayerIds, { buyerClubTeamId, targetPlayerId: body.playerId });
    if (swapError) return fail(swapError.status, swapError.error);
  }

  // Idempotence: pokud existuje aktivní nabídka od tohoto týmu na tohoto hráče, vrátit ji
  const existing = await db.prepare(
    `SELECT id FROM transfer_offers
     WHERE player_id = ?
       AND from_team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)
       AND status IN ('pending','countered') LIMIT 1`
  ).bind(body.playerId, buyerClubTeamId, buyerClubTeamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "check duplicate offer", e); return null; });
  if (existing) return fail(409, "Již máte aktivní nabídku na tohoto hráče", { offerId: existing.id });

  // Anti-spam: odmítnutá nabídka kazí hráči morálku — opakovat na stejného hráče jde
  // až po 10 dnech. Vlastní stažení kupce neblokuje (pravidla v transfers/offer-cooldown.ts).
  const { offerRetryBlock, offerRetryBlockMessage } = await import("../transfers/offer-cooldown");
  const retryBlock = await offerRetryBlock(db, body.playerId, buyerClubTeamId)
    .catch((e) => { logger.warn({ module: "game" }, "check offer cooldown", e); return null; });
  if (retryBlock) return fail(429, offerRetryBlockMessage(retryBlock), { retryInDays: retryBlock.daysLeft });

  // Snapshot zájmu hráče o přestup (0-3) — stabilní badge v UI po celou dobu jednání.
  const { computeInterestForOffer } = await import("../transfers/player-interest");
  const interest = await computeInterestForOffer(db, body.playerId, { fromTeamId: buyerClubTeamId, offerAmount: body.amount })
    .catch((e) => { logger.warn({ module: "game" }, "compute player interest", e); return null; });

  const id = crypto.randomUUID();
  // Nabídka a hráči na výměnu vznikají naráz, jinak by mohla viset nabídka bez slíbených hráčů.
  await db.batch([
    db.prepare("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, message, expires_at, offer_type, loan_duration, last_action_by, target_squad, player_interest, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, body.playerId, buyerClubTeamId, targetOwnerId, body.amount, body.message ?? null, offerReplyDeadline(), offerType, loanDuration, buyerClubTeamId, targetSquad, interest?.level ?? null, terms.upfrontPct, terms.installments, terms.sellOnPct),
    ...insertSwapPlayersStmts(db, id, swapPlayerIds),
  ]);

  // Log initial offer event (s podmínkami, ať historie vyjednávání ukáže, co se měnilo)
  await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, 'offer', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, buyerClubTeamId, body.amount, body.message ?? null, terms.upfrontPct, terms.installments, terms.sellOnPct).run()
    .catch((e) => logger.warn({ module: "game" }, "insert offer event", e));

  // SMS to the owner team about the incoming offer
  const buyerTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(buyerClubTeamId).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  const pName = `${player.first_name} ${player.last_name}`;

  // Komu zprávu doručit. U hráče z rezervy vlastní kartu U21 tým, jenže trenér
  // je přihlášený za áčko — do telefonu U21 týmu se nikdy nepodívá. Zpráva
  // i notifikace proto míří na mateřský klub. Bez toho nabídky na mládež tiše
  // vypršely: na produkci jich takhle propadlo šest.
  const recipientClubId = await db.prepare(
    "SELECT COALESCE(parent_team_id, id) AS id FROM teams WHERE id = ?"
  ).bind(targetOwnerId).first<{ id: string }>()
    .then((r) => r?.id ?? targetOwnerId)
    .catch((e) => { logger.warn({ module: "game" }, "mateřský klub k doručení", e); return targetOwnerId; });
  // AI klubu se nic neposílá (ani připomínka slibu od hráče), odpoví sám.
  if (await isAiTeam(db, recipientClubId)) return { ok: true, offerId: id };

  // Hráč, kterému trenér slíbil prodej, mu to připomene.
  if (offerType === "transfer") {
    const { remindTransferPromise } = await import("../transfers/promises");
    await remindTransferPromise(db, body.playerId, buyerTeam?.name ?? "jiného klubu", id);
  }
  if (isBuyout) {
    await sendPhoneSMS(db, recipientClubId, SMS_ROLE, SMS_ROLE,
      `📩 ${buyerTeam?.name ?? "Neznámý klub"} chce odkoupit ${pName} (aktuálně u nich na hostování) za ${body.amount.toLocaleString("cs")} Kč.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else if (offerType === "loan") {
    await sendPhoneSMS(db, recipientClubId, SMS_ROLE, SMS_ROLE,
      `📩 ${buyerTeam?.name ?? "Neznámý klub"} má zájem o hostování ${pName}.${body.amount > 0 ? ` Nabízí poplatek ${body.amount.toLocaleString("cs")} Kč.` : ""} Podívejte se na to v přestupech.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  } else {
    await sendPhoneSMS(db, recipientClubId, SMS_ROLE, SMS_ROLE,
      `📩 Přišla nabídka na ${pName} od ${buyerTeam?.name ?? "neznámého klubu"}: ${formatTermsSummary(terms)}. Podívejte se na to v přestupech.`
    ).catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  const offerLabel = offerType === "loan" ? "hostování" : "přestup";
  await notifyClub(env, recipientClubId,
    `💰 Nová nabídka za ${pName}`,
    `${buyerTeam?.name ?? "Neznámý klub"} nabízí ${offerLabel}: ${offerType === "loan" ? `${body.amount.toLocaleString("cs-CZ")} Kč` : formatTermsSummary(terms)}.`,
    `/prestupy/nabidka/${id}`, "new offer notification");

  return { ok: true, offerId: id };
}

// ═══ Příhoz na inzerát ═══

export interface ListingBidInput {
  amount: number;
  upfrontPct?: number;
  installments?: number;
  sellOnPct?: number;
}

export type ListingBidResult = TransferActionResult<
  | { kind: "offer"; offerId: string; alreadyExists?: boolean }
  | { kind: "negotiation"; negotiationId: string; existing: boolean }
>;

/** POST /teams/:teamId/market/:listingId/bid — z inzerátu klubu ve hře vznikne nabídka, u klubu mimo hru jednání. */
export async function placeListingBid(env: Bindings, actorTeamId: string, listingId: string, body: ListingBidInput): Promise<ListingBidResult> {
  const db = env.DB;
  if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) return fail(400, "Nabídka musí být kladné celé číslo");
  if (body.amount > MAX_TRANSFER_AMOUNT) return fail(400, `Částka může být nejvýš ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`);

  const listing = await db.prepare("SELECT is_ai_listing, ai_player_data, asking_price, rejected_by FROM transfer_listings WHERE id = ? AND status = 'active'")
    .bind(listingId).first<{ is_ai_listing: number; ai_player_data: string; asking_price: number; rejected_by: string }>();
  if (!listing) return fail(404, "Listing nenalezen");

  // Peníze, limit dohod i dohoda patří klubu (áčku). Z adresy může přijít i ID dorostu
  // téhož majitele — bez tohohle by se dohoda vedla na U21 a pondělní splátky by ji minuly.
  const buyerClubTeamId = await resolveClubTeamId(db, actorTeamId) ?? actorTeamId;
  // Z trhu nakupuje klub. Přes ID dorostu by šel koupit kdokoli rovnou do U21 (bez kontroly
  // věku) a obejít „hráč vás už odmítl", protože odmítnutí se váže na tým v adrese.
  if (buyerClubTeamId !== actorTeamId) return fail(400, "Na trhu nakupuje klub, ne dorost.");

  // Platba: jednorázově nebo záloha + týdenní splátky. Procenta z příštího přestupu jen
  // u klubu ve hře — cizí klub z trhu hráče zpátky neprodá a nic by mu nepřišlo.
  const terms: TransferTerms = {
    amount: body.amount, upfrontPct: body.upfrontPct ?? 100, installments: body.installments ?? 0,
    sellOnPct: listing.is_ai_listing ? 0 : (body.sellOnPct ?? 0),
  };
  const termsError = transferTermsError(terms);
  if (termsError) return fail(400, termsError);
  if (terms.installments > 0) {
    const limitError = await installmentLimitError(db, buyerClubTeamId)
      ?? await installmentBudgetError(db, buyerClubTeamId, weeklyInstallment(terms));
    if (limitError) return fail(400, limitError);
  }
  const schedule = transferSchedule(terms);
  const team = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(buyerClubTeamId).first<{ budget: number }>();
  if (!team || team.budget < schedule.upfront) {
    return fail(400, terms.installments > 0
      ? `Nedostatek peněz na zálohu. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, záloha je ${schedule.upfront.toLocaleString("cs")} Kč.`
      : `Nedostatek peněz. Máte ${team?.budget?.toLocaleString("cs") ?? 0} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.`);
  }

  if (listing.is_ai_listing) {
    // Cizí klub: cena se vyjednává (spec 2026-10-04). Klub odpoví s prodlevou souhlasem,
    // protinávrhem nebo konec jednání; teprve po dohodě se rozhoduje hráč a platí se.
    const { startAiNegotiation } = await import("../transfers/ai-negotiation");
    const res = await startAiNegotiation(db, { buyerClubTeamId, source: "listing", sourceId: listingId, terms });
    if (!res.ok) return fail(res.status as TransferActionStatus, res.error);
    return { ok: true, kind: "negotiation", negotiationId: res.negotiationId, existing: res.existing ?? false };
  }

  // Inzerát klubu ve hře — vytvoř transfer_offer (sjednocený flow s přímými nabídkami).
  // Tím proběhne jednání přes /prestupy/nabidka/[id] s face-off, timeline a bublinami.
  const listingInfo = await db.prepare(
    `SELECT tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name,
            ts.name as seller_name, tb.name as buyer_name
     FROM transfer_listings tl
     LEFT JOIN players p ON tl.player_id = p.id
     LEFT JOIN teams ts ON tl.team_id = ts.id
     LEFT JOIN teams tb ON tb.id = ?
     WHERE tl.id = ?`
  ).bind(buyerClubTeamId, listingId).first<{ seller_team_id: string; player_id: string; first_name: string; last_name: string; seller_name: string; buyer_name: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch listing for offer", e); return null; });

  if (!listingInfo || !listingInfo.player_id) return fail(404, "Inzerát nenalezen nebo nemá hráče");
  if (listingInfo.seller_team_id === actorTeamId || await resolveClubTeamId(db, listingInfo.seller_team_id) === buyerClubTeamId) {
    return fail(400, "Nemůžeš nabízet na vlastního hráče");
  }
  if (await areClubsLinked(db, buyerClubTeamId, listingInfo.seller_team_id)) return fail(403, LINKED_CLUBS_ERRORS.transfer);

  // Idempotence — pokud už existuje aktivní offer od tohoto týmu na tohoto hráče, vrátit ho
  const existing = await db.prepare(
    "SELECT id FROM transfer_offers WHERE player_id = ? AND from_team_id = ? AND status IN ('pending','countered') LIMIT 1"
  ).bind(listingInfo.player_id, buyerClubTeamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "check duplicate offer from market", e); return null; });
  if (existing) return { ok: true, kind: "offer", offerId: existing.id, alreadyExists: true };

  const offerId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, expires_at, offer_type, last_action_by, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, ?, ?, ?, 'transfer', ?, ?, ?, ?)"
  ).bind(offerId, listingInfo.player_id, buyerClubTeamId, listingInfo.seller_team_id, body.amount, offerReplyDeadline(), buyerClubTeamId,
    terms.upfrontPct, terms.installments, terms.sellOnPct).run();
  const sellerIsAi = await isAiTeam(db, listingInfo.seller_team_id);
  if (!sellerIsAi) {
    // Hráč, kterému trenér slíbil prodej, mu to připomene.
    const buyer = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(buyerClubTeamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "kupec pro připomínku slibu", e); return null; });
    const { remindTransferPromise } = await import("../transfers/promises");
    await remindTransferPromise(db, listingInfo.player_id, buyer?.name ?? "jiného klubu", offerId);
  }

  await db.prepare(
    "INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, 'offer', ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), offerId, buyerClubTeamId, body.amount, terms.upfrontPct, terms.installments, terms.sellOnPct).run()
    .catch((e) => logger.warn({ module: "game" }, "insert market->offer event", e));

  // Notifikace + SMS prodávajícímu
  if (!sellerIsAi) {
    const pName = listingInfo.first_name ? `${listingInfo.first_name} ${listingInfo.last_name}` : "hráče";
    await sendPhoneSMS(db, listingInfo.seller_team_id, SMS_ROLE, SMS_ROLE,
      `💰 ${listingInfo.buyer_name ?? "Klub"} nabízí ${formatTermsSummary(terms)} za ${pName} z tvé inzerce.`
    ).catch((e) => logger.warn({ module: "game" }, "market->offer SMS", e));
    await notifyClub(env, listingInfo.seller_team_id,
      `💰 Nová nabídka za ${pName}`,
      `${listingInfo.buyer_name ?? "Klub"} nabízí ${body.amount.toLocaleString("cs-CZ")} Kč.`,
      `/prestupy/nabidka/${offerId}`, "market->offer notification");
  }

  return { ok: true, kind: "offer", offerId };
}

// ═══ Starý příhoz z inzerátu (`transfer_bids`) ═══

/** POST /teams/:teamId/bids/:bidId/accept — prodávající přijímá příhoz, nebo kupující protinávrh. */
export async function acceptListingBid(env: Bindings, actorTeamId: string, bidId: string): Promise<TransferActionResult> {
  const db = env.DB;
  // Bid musí být pending nebo countered, hráč stále u sellera, a teamId musí být na tahu
  const bid = await db.prepare(
    `SELECT tb.*, tl.player_id, tl.team_id as seller_team_id
     FROM transfer_bids tb
     JOIN transfer_listings tl ON tb.listing_id = tl.id
     JOIN players p ON tl.player_id = p.id
     WHERE tb.id = ? AND tb.status IN ('pending','countered') AND p.team_id = tl.team_id
       AND (tb.team_id = ? OR tl.team_id = ?)
       AND (tb.last_action_by IS NULL OR tb.last_action_by != ?)`
  ).bind(bidId, actorTeamId, actorTeamId, actorTeamId).first<Record<string, unknown>>();
  if (!bid) return fail(404, "Nabídka nenalezena, hráč už není v inzerci, nebo nejsi na tahu");

  const buyerTeamId = bid.team_id as string;
  const sellerTeamId = bid.seller_team_id as string;
  if (sellerTeamId !== actorTeamId && buyerTeamId !== actorTeamId) return fail(403, "Nemáš přístup k této nabídce");
  if (await areClubsLinked(db, buyerTeamId, sellerTeamId)) return fail(403, LINKED_CLUBS_ERRORS.transfer);
  const playerId = bid.player_id as string;
  // Counter_amount má přednost (jako u offers)
  const amount = (bid.counter_amount != null ? (bid.counter_amount as number) : (bid.amount as number));

  // Kupující přijímá protinávrh AI klubu: pojistky AI se ověří nad dnešním kádrem (jako u nabídek).
  if (buyerTeamId === actorTeamId && await isAiTeam(db, sellerTeamId)) {
    const { aiSellerGuard } = await import("../ai-coach/transfer-guard");
    const sellerClubTeamId = await resolveClubTeamId(db, sellerTeamId) ?? sellerTeamId;
    const block = await aiSellerGuard(db, {
      sellerClubTeamId, playerId, offerId: bidId, offerType: "transfer",
      terms: { amount, upfrontPct: 100, installments: 0, sellOnPct: 0 },
    });
    if (block) {
      await db.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE id = ? AND status IN ('pending','countered')").bind(bidId).run();
      logger.info({ module: M }, `AI klub ${sellerTeamId} ukončil příhoz ${bidId} při přijetí: ${block}`);
      return fail(409, "Prodávající klub hráče pustit už nemůže, jednání ukončil.");
    }
  }

  const buyer = await db.prepare("SELECT budget, name, game_date FROM teams WHERE id = ?").bind(buyerTeamId).first<{ budget: number; name: string; game_date: string }>();
  if (!buyer) return fail(400, "Kupující nenalezen");

  const seller = await db.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(sellerTeamId).first<{ name: string; league_id: string; budget: number }>();
  const player = await db.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const gameDate = buyer.game_date ?? new Date().toISOString();
  const playerName = `${player?.first_name} ${player?.last_name}`;

  // Atomický budget check + odečtení — zabraňuje race condition.
  const bidDeductResult = await db.prepare(
    "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
  ).bind(amount, buyerTeamId, amount).run();
  if (bidDeductResult.meta.changes === 0) return fail(400, "Kupující nemá dostatek prostředků");

  // Přičíst prodávajícímu + přesunout hráče + uzavřít inzerát/bidy atomicky.
  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1")
    .first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for transfer contract", e); return null; });

  await db.batch([
    db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
    db.prepare("UPDATE players SET team_id = ? WHERE id = ? AND team_id = ?").bind(buyerTeamId, playerId, sellerTeamId),
    db.prepare("UPDATE transfer_listings SET status = 'sold' WHERE id = ?").bind(bid.listing_id),
    db.prepare("UPDATE transfer_bids SET status = 'accepted' WHERE id = ?").bind(bidId),
  ]);

  await db.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND id != ? AND status IN ('pending','countered')")
    .bind(bid.listing_id, bidId).run().catch((e) => logger.warn({ module: "game" }, "reject other bids on accept", e));

  // Transaction log (budget již upraven výše)
  await db.batch([
    db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, `Přestup: ${playerName}`, gameDate),
    db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), sellerTeamId, amount, (seller?.budget ?? 0) + amount, `Prodej: ${playerName}`, gameDate),
  ]).catch((e) => logger.warn({ module: "game" }, "log bid-accept transactions", e));

  // Stejně jako u nabídek: zbytek splátek za hráče a procenta z příštího přestupu jdou hned.
  // Dohody a doložky se vedou na klub (áčko), inzerát může patřit dorostu.
  const sellerClubTeamId = await resolveClubTeamId(db, sellerTeamId) ?? sellerTeamId;
  const { settleOnResale } = await import("../transfers/installments");
  await settleOnResale(db, { playerId, ownerClubTeamId: sellerClubTeamId, saleAmount: amount, saleOfferId: bidId, gameDate })
    .catch((e) => logger.error({ module: "game" }, "doplacení splátek a procent při přijetí bidu", e));

  await onPlayerTransferred(db, playerId, buyerTeamId, { permanent: true });

  // Kořaly kupce: první koupě, celebrita v týmu.
  {
    const { checkTransferAchievements } = await import("../services/achievements");
    await checkTransferAchievements(db, buyerTeamId, playerId)
      .catch((e) => logger.warn({ module: "game" }, "kořaly po přijetí bidu", e));
  }

  await db.prepare("UPDATE player_contracts SET leave_type = 'transfer', is_active = 0, left_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE player_id = ? AND team_id = ? AND is_active = 1")
    .bind(playerId, sellerTeamId).run().catch((e) => logger.warn({ module: "game" }, "deactivate contract on transfer", e));
  await db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'transfer', ?, 1)")
    .bind(crypto.randomUUID(), playerId, buyerTeamId, season?.id ?? "unknown", amount).run().catch((e) => logger.warn({ module: "game" }, "insert transfer contract", e));

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(db, seller?.league_id ?? "", null, "transfer_completed", {
    playerName: `${player?.first_name} ${player?.last_name}`, playerAge: player?.age as number,
    playerPosition: player?.position as string, teamName: seller?.name ?? "",
    fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
  }).catch((e) => logger.warn({ module: "game" }, "create transfer completed news", e));

  // Notifikace + SMS oběma stranám
  await smsToClub(db, buyerTeamId,
    `🤝 Přestup potvrzen! ${playerName} přichází z ${seller?.name ?? "neznámého klubu"} za ${amount.toLocaleString("cs")} Kč.`, "bid accept SMS buyer");
  await smsToClub(db, sellerTeamId,
    `📤 Prodej potvrzen. ${playerName} odchází do ${buyer.name} za ${amount.toLocaleString("cs")} Kč.`, "bid accept SMS seller");
  await notifyClub(env, buyerTeamId, `✅ Přestup ${playerName} dokončen`,
    `Koupili jste od ${seller?.name ?? "prodávajícího"} za ${amount.toLocaleString("cs-CZ")} Kč.`, "/prestupy", "bid accept notifications");
  await notifyClub(env, sellerTeamId, `✅ Prodej ${playerName} dokončen`,
    `${buyer.name} zaplatil ${amount.toLocaleString("cs-CZ")} Kč.`, "/prestupy", "bid accept notifications");
  // Push týmům sledujícím hráče ve watchlistu (kromě obou stran přestupu)
  await pushToWatchers(env, playerId, buyerTeamId, `⭐ ${playerName} přestoupil`,
    `${seller?.name ?? "Klub"} → ${buyer.name} za ${amount.toLocaleString("cs-CZ")} Kč.`);

  return { ok: true };
}

/** POST /teams/:teamId/bids/:bidId/reject — prodávající odmítá příhoz, nebo kupující protinávrh. */
export async function rejectListingBid(env: Bindings, actorTeamId: string, bidId: string): Promise<TransferActionResult> {
  const db = env.DB;
  const bidInfo = await db.prepare(
    `SELECT tb.team_id as buyer_team_id, tb.amount, tb.counter_amount, tb.last_action_by, tb.status,
            tl.player_id, tl.team_id as seller_team_id,
            p.first_name, p.last_name,
            ts.name as seller_name, tbuyer.name as buyer_name
     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id
     LEFT JOIN players p ON tl.player_id = p.id
     LEFT JOIN teams ts ON tl.team_id = ts.id
     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id
     WHERE tb.id = ? AND (tb.team_id = ? OR tl.team_id = ?) AND tb.status IN ('pending','countered')`
  ).bind(bidId, actorTeamId, actorTeamId).first<{ buyer_team_id: string; amount: number; counter_amount: number | null; last_action_by: string | null; status: string; seller_team_id: string; first_name: string; last_name: string; seller_name: string; buyer_name: string; player_id: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch bid for reject notif", e); return null; });
  if (!bidInfo) return fail(404, "Nabídka nenalezena");
  // Reject smí ten kdo je na tahu
  const canReject = bidInfo.last_action_by != null
    ? bidInfo.last_action_by !== actorTeamId
    : bidInfo.seller_team_id === actorTeamId;
  if (!canReject) return fail(409, "Nejsi na tahu");

  await db.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE id = ?").bind(bidId).run();

  // Notifikace druhé straně
  const pName = bidInfo.first_name ? `${bidInfo.first_name} ${bidInfo.last_name}` : "hráče";
  const isSellerRejecting = actorTeamId === bidInfo.seller_team_id;
  const otherTeamId = isSellerRejecting ? bidInfo.buyer_team_id : bidInfo.seller_team_id;
  const rejecterName = isSellerRejecting ? bidInfo.seller_name : bidInfo.buyer_name;
  await smsToClub(db, otherTeamId,
    `❌ ${rejecterName ?? "Klub"} odmítl ${isSellerRejecting ? "nabídku" : "protinabídku"} za ${pName}.`, "bid reject SMS");
  await notifyClub(env, otherTeamId, `❌ Nabídka za ${pName} zamítnuta`, `${rejecterName ?? "Klub"} odmítl jednání.`,
    "/prestupy", "bid reject notification");

  return { ok: true };
}

/** POST /teams/:teamId/bids/:bidId/counter — protinávrh ke starému příhozu. */
export async function counterListingBid(env: Bindings, actorTeamId: string, bidId: string, body: { amount: number }): Promise<TransferActionResult> {
  const db = env.DB;
  if (!body.amount || body.amount <= 0 || !Number.isInteger(body.amount)) return fail(400, "Protinabídka musí být kladné celé číslo");
  if (body.amount > MAX_TRANSFER_AMOUNT) return fail(400, `Částka může být nejvýš ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`);

  const bid = await db.prepare(
    `SELECT tb.*, tl.team_id as seller_team_id, tl.player_id, p.first_name, p.last_name,
            tbuyer.name as buyer_name, ts.name as seller_name
     FROM transfer_bids tb JOIN transfer_listings tl ON tb.listing_id = tl.id
     LEFT JOIN players p ON tl.player_id = p.id
     LEFT JOIN teams tbuyer ON tb.team_id = tbuyer.id
     LEFT JOIN teams ts ON tl.team_id = ts.id
     WHERE tb.id = ? AND (tb.team_id = ? OR tl.team_id = ?) AND tb.status IN ('pending','countered')`
  ).bind(bidId, actorTeamId, actorTeamId).first<{ team_id: string; seller_team_id: string; last_action_by: string | null; status: string; player_id: string; first_name: string; last_name: string; buyer_name: string; seller_name: string }>();
  if (!bid) return fail(404, "Nabídka nenalezena");

  const canCounter = bid.last_action_by != null
    ? bid.last_action_by !== actorTeamId
    : bid.seller_team_id === actorTeamId;
  if (!canCounter) return fail(409, "Nejsi na tahu");

  // Pokud counter posílá kupující, ověř budget
  if (bid.team_id === actorTeamId) {
    const buyer = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(actorTeamId).first<{ budget: number }>();
    if (!buyer || buyer.budget < body.amount) {
      return fail(400, `Nedostatek peněz. Máte ${(buyer?.budget ?? 0).toLocaleString("cs")} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.`);
    }
  }

  await db.prepare(
    "UPDATE transfer_bids SET status = 'countered', counter_amount = ?, last_action_by = ? WHERE id = ?"
  ).bind(body.amount, actorTeamId, bidId).run();

  const otherTeamId = actorTeamId === bid.seller_team_id ? bid.team_id : bid.seller_team_id;
  const counterTeamName = actorTeamId === bid.seller_team_id ? bid.seller_name : bid.buyer_name;
  const pName = `${bid.first_name} ${bid.last_name}`;
  await smsToClub(db, otherTeamId,
    `🔄 ${counterTeamName ?? "Klub"} poslal protinabídku ${body.amount.toLocaleString("cs")} Kč za ${pName}.`, "bid counter SMS");
  await notifyClub(env, otherTeamId, `🔄 Protinabídka za ${pName}`,
    `${counterTeamName ?? "Klub"} poslal protinabídku ${body.amount.toLocaleString("cs-CZ")} Kč.`, "/prestupy", "bid counter notification");

  return { ok: true };
}

// ═══ Přijetí nabídky ═══

/** POST /teams/:teamId/offers/:offerId/accept — přijetí smí ten, kdo je na tahu (prodávající i kupující). */
export async function acceptTransferOffer(
  env: Bindings,
  actorTeamId: string,
  offerId: string,
  input: { message?: string | null } = {},
): Promise<TransferActionResult<{ soldTo?: string }>> {
  const db = env.DB;
  const acceptMessage = input.message ?? null;
  // Accept smí ten, kdo JE na tahu — tj. neudělal poslední akci. Buyer i seller mohou přijmout protinabídku.
  // Fallback pro nabídky bez last_action_by: pending → seller, countered → buyer.
  const offer = await db.prepare(
    `SELECT * FROM transfer_offers
     WHERE id = ? AND status IN ('pending','countered')`
  ).bind(offerId).first<Record<string, unknown>>();
  if (!offer) return fail(409, "Nabídka nenalezena nebo nejsi na tahu");
  const scope = await resolveOfferClubScope(db, actorTeamId, offer);
  if (!scope?.role || !scope.onTurn) return fail(409, "Nabídka nenalezena nebo nejsi na tahu");
  if (offer.expires_at && new Date(offer.expires_at as string) < new Date()) return fail(410, "Nabídka vypršela");
  // Nabídka mohla vzniknout, než admin kluby propojil. Přijetím by obchod prošel.
  if (await areClubsLinked(db, scope.buyerClubTeamId, scope.sellerClubTeamId)) return fail(403, LINKED_CLUBS_ERRORS.transfer);

  // ?? přeskakuje jen null/undefined, ne 0 — proto explicitní kontrola.
  const amount = (offer.counter_amount != null ? (offer.counter_amount as number) : (offer.offer_amount as number));
  if (amount < 0) return fail(400, "Neplatná částka přestupu");
  // Podmínky posledního návrhu: záloha + týdenní splátky, procenta z příštího přestupu.
  const terms = termsFromRow(offer as { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, amount);
  const schedule = transferSchedule(terms);
  const buyerTeamId = scope.buyerClubTeamId;
  const sellerTeamId = scope.sellerClubTeamId;
  const playerId = offer.player_id as string;
  const offerType = (offer.offer_type as string) ?? "transfer";
  const loanDuration = offer.loan_duration as number | null;
  if (offerType === "loan" && !loanDuration) return fail(400, "Nabídce hostování chybí délka");
  // Hráči na výměnu se čtou teď, dokud ještě sedí na původní soupisce —
  // po dokončení výměny už jsou jinde a do zprávy by se dohledávali hůř.
  // Bez try/catch schválně: přestup bez slíbených hráčů by byl horší než chyba.
  const swapRows = (await db.prepare(
    `SELECT s.player_id AS id, p.first_name, p.last_name, p.overall_rating, p.age, p.position
       FROM transfer_offer_swap_players s LEFT JOIN players p ON p.id = s.player_id
      WHERE s.offer_id = ? ORDER BY s.sort_order`,
  ).bind(offerId).all<{ id: string; first_name: string | null; last_name: string | null; overall_rating: number | null; age: number | null; position: string | null }>()).results;
  const swapPlayerIds = swapRows.map((r) => r.id);
  const swapPlayerNames = swapRows.filter((r) => r.first_name).map((r) => `${r.first_name} ${r.last_name}`);
  // Hráč s doložkou o procentech na výměnu nesmí (nabídka mohla vzniknout dřív, než to výměna hlídala).
  if (swapRows.length > 0) {
    const { swapSellOnError } = await import("../transfers/swap-players");
    for (const r of swapRows) {
      const sellOn = await swapSellOnError(db, r, "Na výměnu jít nemůže.");
      if (sellOn) return fail(409, sellOn);
    }
  }
  // AI klub jako prodávající: kupující přijímá protinávrh AI, který mohl ležet až tři dny.
  // Kádr se mezitím mohl změnit (přijaté jiné protinávrhy, přesuny do U21), proto se pojistky
  // AI (poslední brankář, minimum kádru, opora bez náhrady, 60 % tržní hodnoty) ověří znovu.
  if (scope.role === "buyer" && await isAiTeam(db, sellerTeamId)) {
    const { aiSellerGuard } = await import("../ai-coach/transfer-guard");
    const block = await aiSellerGuard(db, { sellerClubTeamId: sellerTeamId, playerId, offerId, terms, offerType });
    if (block) {
      const closed = await db.prepare(
        `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ? AND status = ? AND last_action_by IS ?`,
      ).bind(offerId, offer.status, offer.last_action_by ?? null).run();
      if (closed.meta.changes === 1) {
        await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'withdraw', NULL, NULL)")
          .bind(crypto.randomUUID(), offerId, sellerTeamId).run()
          .catch((e) => logger.warn({ module: M }, "událost ukončení jednání AI klubem", e));
      }
      logger.info({ module: M }, `AI klub ${sellerTeamId} ukončil jednání ${offerId} při přijetí: ${block}`);
      return fail(409, "Prodávající klub hráče pustit už nemůže, jednání ukončil.");
    }
  }
  // Procenta z příštího přestupu se u výměny počítají z doplatku i z tržní ceny hráčů, kteří
  // jdou opačně. Jinak by šlo doložku obejít prodejem za hráče a symbolický doplatek.
  const saleValueForSellOn = amount + swapRows.reduce((sum, r) =>
    sum + (r.overall_rating != null ? marketValue(r.overall_rating, r.age ?? 26, r.position) : 0), 0);
  const targetSquad = ((offer.target_squad as string) ?? "senior") === "u21" ? "u21" : "senior";

  // Nabídka odkazuje na konkrétní soupisku, finance ale patří mateřskému klubu.
  // Hráč mohl během jednání mezi A/U21 pendlovat, proto skutečnou zdrojovou
  // soupisku ověřujeme podle aktuálního stavu a klubového rootu.
  const currentPlayer = await db.prepare(
    `SELECT p.team_id, p.loan_from_team_id, p.loan_until, p.parent_club_id, p.next_match_return, p.status,
            COALESCE(current_team.parent_team_id, current_team.id) AS current_club_team_id,
            COALESCE(owner_team.parent_team_id, owner_team.id) AS loan_owner_club_team_id
     FROM players p
     JOIN teams current_team ON current_team.id = p.team_id
     LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
     WHERE p.id = ?`
  ).bind(playerId).first<{
    team_id: string;
    loan_from_team_id: string | null;
    loan_until: string | null;
    parent_club_id: string | null;
    next_match_return: number;
    status: string | null;
    current_club_team_id: string;
    loan_owner_club_team_id: string | null;
  }>();
  if (!currentPlayer) return fail(409, "Hráč již není v kádru");

  const isBuyoutAccept = !!currentPlayer.loan_from_team_id
    && currentPlayer.loan_owner_club_team_id === sellerTeamId
    && currentPlayer.current_club_team_id === buyerTeamId;
  // Odkup z hostování: poplatek za běžící hostování je součást ceny. Jinak by šlo hráče s doložkou
  // půjčit za skutečnou cenu, odkoupit za 1 Kč a procenta by se počítala z 1 Kč.
  const activeLoanFee = isBuyoutAccept
    ? (await db.prepare("SELECT fee FROM player_contracts WHERE player_id = ? AND join_type = 'loan' AND is_active = 1 LIMIT 1")
        .bind(playerId).first<{ fee: number | null }>()
        .catch((e) => { logger.warn({ module: "game" }, "poplatek za hostování pro procenta", e); return null; }))?.fee ?? 0
    : 0;
  const sellerRosterTeamId = isBuyoutAccept
    ? currentPlayer.loan_from_team_id!
    : currentPlayer.current_club_team_id === sellerTeamId && !currentPlayer.loan_from_team_id
      ? currentPlayer.team_id
      : null;
  if (!sellerRosterTeamId) {
    // Nabídka už nemůže být splněna (hráč mezitím odešel jinam). Nenechávat ji
    // viset mezi aktivními nabídkami, ale nikdy nepřepsat souběžně dokončenou akci.
    await db.prepare(
      `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = ? AND last_action_by IS ?`,
    ).bind(offerId, offer.status, offer.last_action_by ?? null).run();
    return fail(409, "Hráč již nepatří prodávajícímu");
  }

  const claimOffer = async (): Promise<boolean> => {
    const claimed = await db.prepare(
      `UPDATE transfer_offers
       SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = ? AND last_action_by IS ?`,
    ).bind(offerId, offer.status, offer.last_action_by ?? null).run();
    return claimed.meta.changes === 1;
  };
  const releaseOfferClaim = async () => {
    await db.prepare(
      "UPDATE transfer_offers SET status = ?, resolved_at = NULL WHERE id = ? AND status = 'accepted'",
    ).bind(offer.status, offerId).run()
      .catch((e) => logger.warn({ module: "game" }, "release failed offer accept claim", e));
  };
  const closeStaleOfferClaim = async () => {
    await db.prepare(
      `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE id = ? AND status = 'accepted'`,
    ).bind(offerId).run()
      .catch((e) => logger.warn({ module: "game" }, "close stale offer accept claim", e));
  };

  // ── Prodej virtuálnímu klubu — hráč odchází ze hry, prodávající dostane peníze ──
  if (buyerTeamId === "virtual_ai") {
    const previousPlayerStatus = currentPlayer.status ?? "active";
    let vd: { name?: string; city?: string; country?: string } = {};
    try {
      if (offer.virtual_team_data) vd = JSON.parse(offer.virtual_team_data as string);
      else if (offer.message) { const legacy = JSON.parse(offer.message as string); vd = { name: legacy.teamName, city: legacy.city }; }
    } catch (e) { logger.warn({ module: "game" }, "parse virtual_team_data on accept", e); }
    const virtualName = vd.name ?? "Neznámý klub";

    const vSeller = await db.prepare("SELECT name, league_id, budget, game_date FROM teams WHERE id = ?")
      .bind(sellerTeamId).first<{ name: string; league_id: string; budget: number; game_date: string }>();
    if (!vSeller) return fail(400, "Prodávající nenalezen");
    const vGameDate = vSeller.game_date ?? new Date().toISOString();

    if (!(await claimOffer())) return fail(409, "Nabídku mezitím vyřešil někdo jiný");

    // Per-player claim: jiná lidská/virtuální nabídka nesmí hráče mezi SELECTem
    // a fyzickým odebráním přesunout nebo smazat podruhé.
    const claimedPlayer = await db.prepare(
      "UPDATE players SET status = 'transferring' WHERE id = ? AND team_id = ? AND status IS ?",
    ).bind(playerId, sellerRosterTeamId, currentPlayer.status).run();
    if (claimedPlayer.meta.changes === 0) {
      await closeStaleOfferClaim();
      return fail(409, "Hráč mezitím změnil klub");
    }

    // removePlayer: FK úklid + archiv departed_players + uzavření kontraktu + DELETE hráče.
    // Zároveň stáhne všechny pending nabídky na hráče (včetně této — hned poté ji přepíšeme na accepted).
    const { removePlayer } = await import("../transfers/remove-player");
    const removed = await removePlayer(db, playerId, "transfer", { toFreeAgent: false, teamId: sellerRosterTeamId })
      .catch(async (e) => {
        logger.error({ module: "game" }, "remove player for virtual offer failed", e);
        await db.prepare("UPDATE players SET status = ? WHERE id = ? AND team_id = ? AND status = 'transferring'")
          .bind(previousPlayerStatus, playerId, sellerRosterTeamId).run()
          .catch((restoreError) => logger.error({ module: "game" }, "restore virtual player claim", restoreError));
        return null;
      });
    if (!removed) {
      await releaseOfferClaim();
      return fail(500, "Prodej se nepodařilo dokončit, zkus to znovu");
    }
    if (!removed.ok || !removed.player) {
      await db.prepare("UPDATE players SET status = ? WHERE id = ? AND team_id = ? AND status = 'transferring'")
        .bind(previousPlayerStatus, playerId, sellerRosterTeamId).run()
        .catch((e) => logger.warn({ module: "game" }, "restore lost virtual player claim", e));
      await closeStaleOfferClaim();
      return fail(409, "Hráč již není v kádru");
    }
    const soldName = `${removed.player.firstName} ${removed.player.lastName}`;

    await db.batch([
      db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
      db.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
    ]);
    await db.prepare(
      `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'transfer'
       WHERE player_id = ? AND is_active = 1
         AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
    ).bind(vGameDate, playerId, sellerTeamId, sellerTeamId).run()
      .catch((e) => logger.warn({ module: "game" }, "close virtual sale club contracts", e));
    await db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), sellerTeamId, amount, vSeller.budget + amount, `Prodej: ${soldName} → ${virtualName}`, vGameDate)
      .run().catch((e) => logger.warn({ module: "game" }, "log virtual sale transaction", e));

    // Prodej cizímu klubu: zbytek splátek a procenta z ceny jdou hned, stejně jako u lidského kupce.
    const { settleOnResale } = await import("../transfers/installments");
    await settleOnResale(db, { playerId, ownerClubTeamId: sellerTeamId, saleAmount: amount, saleOfferId: offerId, gameDate: vGameDate })
      .catch((e) => logger.error({ module: "game" }, "doplacení splátek a procent při prodeji cizímu klubu", e));

    // Event log — jen za stranu ve hře (transfer_offer_events.team_id má FK na teams).
    await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'accept', ?, ?)")
      .bind(crypto.randomUUID(), offerId, scope.actorClubTeamId, amount, acceptMessage).run()
      .catch((e) => logger.warn({ module: "game" }, "insert virtual accept event", e));

    const { createTransferNews } = await import("../transfers/transfer-news");
    await createTransferNews(db, vSeller.league_id ?? "", null, "transfer_completed", {
      playerName: soldName, playerAge: removed.player.age,
      playerPosition: removed.player.position, teamName: vSeller.name,
      fromTeamName: vSeller.name, toTeamName: virtualName, fee: amount,
    }).catch((e) => logger.warn({ module: "game" }, "create virtual sale news", e));

    await smsToClub(db, sellerTeamId,
      `📤 Přestup potvrzen. ${soldName} odchází do ${virtualName}${vd.city ? ` (${vd.city}${vd.country === "DE" ? ", Německo" : ""})` : ""} za ${amount.toLocaleString("cs")} Kč.`,
      "virtual sale SMS");
    await notifyClub(env, sellerTeamId, `✅ Přestup ${soldName} dokončen`,
      `${virtualName} zaplatil ${amount.toLocaleString("cs-CZ")} Kč.`, `/prestupy`, "virtual sale notification");

    return { ok: true, soldTo: virtualName };
  }

  // Pokud má hráč jít do U21 kupujícího, dohledej cílový tým. Budget a notifikace stále řeší A-tým.
  let buyerDestTeamId = buyerTeamId;
  if (targetSquad === "u21" && offerType !== "loan") {
    const buyerU21 = await db.prepare(
      "SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'"
    ).bind(buyerTeamId).first<{ id: string }>();
    if (!buyerU21) return fail(400, "Kupující nemá U21 tým, nelze přijmout");
    buyerDestTeamId = buyerU21.id;
  }

  const buyer = await db.prepare("SELECT budget, name, game_date, league_id FROM teams WHERE id = ?").bind(buyerTeamId).first<{ budget: number; name: string; game_date: string; league_id: string }>();
  if (!buyer) return fail(400, "Kupující nenalezen");
  const seller = await db.prepare("SELECT name, league_id, budget FROM teams WHERE id = ?").bind(sellerTeamId).first<{ name: string; league_id: string; budget: number }>();
  if (!seller) return fail(400, "Prodávající nenalezen");
  const sellerRoster = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(sellerRosterTeamId).first<{ league_id: string }>();
  const player = await db.prepare("SELECT first_name, last_name, age, position FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>();
  const gameDate = buyer.game_date ?? new Date().toISOString();
  const offerPlayerName = `${player?.first_name} ${player?.last_name}`;

  // Get current season for contract records
  const currentSeason = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for offer accept", e); return null; });
  const seasonId = mustSeason(currentSeason?.id);

  // Meziligový poplatek a odvod z přestupu uvnitř soutěže. Sazby jdou ze sazebníku
  // soutěže; bez samosprávy zůstává 20 % / 0 %, tedy dosavadní chování.
  const { computeTransferLevies } = await import("../competition/transfer-levy");
  const levies = await computeTransferLevies(db, {
    buyerLeagueId: buyer.league_id, sellerLeagueId: sellerRoster?.league_id,
    amount, isLoan: offerType === "loan",
  });
  const adminFee = levies.adminFee;
  // Při splátkách kupující hned platí jen zálohu (+ celý mezikrajský poplatek).
  const payNow = offerType === "loan" ? amount : schedule.upfront;
  const requiredBudget = offerType === "loan" ? amount : payNow + adminFee;
  if (buyer.budget < requiredBudget) {
    const what = terms.installments > 0 ? `záloha ${payNow.toLocaleString("cs")} Kč` : `cena ${amount.toLocaleString("cs")} Kč`;
    return fail(400, adminFee > 0
      ? `Kupující nemá dostatek prostředků (${what} + administrační poplatek ${adminFee.toLocaleString("cs")} Kč)`
      : terms.installments > 0 ? `Kupující nemá dostatek prostředků na zálohu (${payNow.toLocaleString("cs")} Kč)` : "Kupující nemá dostatek prostředků");
  }
  if (offerType !== "loan" && terms.installments > 0) {
    const limitError = await installmentLimitError(db, buyerTeamId)
      ?? await installmentBudgetError(db, buyerTeamId, weeklyInstallment(terms), scope.role === "buyer");
    if (limitError) return fail(400, limitError);
  }
  if (!(await claimOffer())) return fail(409, "Nabídku mezitím vyřešil někdo jiný");

  if (offerType === "loan" && loanDuration) {
    // Hostování — atomický budget check (pouze pokud je nenulový poplatek)
    if (amount > 0) {
      const loanDeductResult = await db.prepare(
        "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
      ).bind(amount, buyerTeamId, amount).run();
      if (loanDeductResult.meta.changes === 0) {
        await releaseOfferClaim();
        return fail(400, "Kupující nemá dostatek prostředků");
      }
    }

    const loanUntil = new Date(gameDate);
    loanUntil.setDate(loanUntil.getDate() + loanDuration);

    const moved = await db.prepare(
      `UPDATE players
       SET team_id = ?, loan_from_team_id = ?, loan_until = ?, parent_club_id = NULL, next_match_return = 0
       WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL
         AND COALESCE(status, 'active') != 'transferring'`,
    ).bind(buyerTeamId, sellerRosterTeamId, loanUntil.toISOString(), playerId, sellerRosterTeamId).run();
    if (moved.meta.changes === 0) {
      if (amount > 0) {
        await db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?")
          .bind(amount, buyerTeamId).run()
          .catch((e) => logger.warn({ module: "game" }, "refund budget after player loan race", e));
      }
      await closeStaleOfferClaim();
      return fail(409, "Hráč mezitím změnil klub");
    }

    const loanCore = [
      db.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
      db.prepare(
        `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE player_id = ? AND id != ? AND status IN ('pending','countered')`,
      ).bind(playerId, offerId),
      db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'loan', ?, 1)")
        .bind(crypto.randomUUID(), playerId, buyerTeamId, seasonId, gameDate, amount),
    ];
    if (amount > 0) {
      loanCore.push(
        db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_fee', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), buyerTeamId, -amount, buyer.budget - amount, `Hostování: ${offerPlayerName}`, gameDate),
        db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, sellerTeamId),
        db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'loan_income', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), sellerTeamId, amount, (seller?.budget ?? 0) + amount, `Hostování (příjem): ${offerPlayerName}`, gameDate),
      );
    }
    try {
      // Nabídka, smlouva a obě finanční strany jsou jeden atomický D1 batch.
      await db.batch(loanCore);
    } catch (e) {
      logger.error({ module: "game" }, "commit loan offer failed; rolling back guarded move", e);
      const rollback = [
        db.prepare(
          `UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ?, parent_club_id = ?, next_match_return = ?
           WHERE id = ? AND team_id = ? AND loan_from_team_id = ?`,
        ).bind(
          currentPlayer.team_id, currentPlayer.loan_from_team_id, currentPlayer.loan_until,
          currentPlayer.parent_club_id, currentPlayer.next_match_return,
          playerId, buyerTeamId, sellerRosterTeamId,
        ),
        db.prepare("UPDATE transfer_offers SET status = ?, resolved_at = NULL WHERE id = ? AND status = 'accepted'")
          .bind(offer.status, offerId),
      ];
      if (amount > 0) {
        rollback.push(db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(amount, buyerTeamId));
      }
      await db.batch(rollback).catch((rollbackError) => logger.error({ module: "game" }, "rollback failed loan offer", rollbackError));
      return fail(500, "Hostování se nepodařilo dokončit, zkus to znovu");
    }

    const { createTransferNews } = await import("../transfers/transfer-news");
    await createTransferNews(db, seller?.league_id ?? "", null, "loan_completed", {
      playerName: offerPlayerName, playerAge: player?.age as number,
      playerPosition: player?.position as string, teamName: seller?.name ?? "",
      fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
    }).catch((e) => logger.warn({ module: "game" }, "create loan news", e));
  } else {
    // Trvalý přestup — atomický budget check + odečtení (včetně cross-league admin fee).
    // Při splátkách se hned strhne jen záloha, zbytek chodí každé pondělí (transfers/installments.ts).
    const totalCost = payNow + adminFee;
    const transferDeductResult = await db.prepare(
      "UPDATE teams SET budget = budget - ? WHERE id = ? AND budget >= ?"
    ).bind(totalCost, buyerTeamId, totalCost).run();
    if (transferDeductResult.meta.changes === 0) {
      await releaseOfferClaim();
      return fail(400, adminFee > 0
        ? `Kupující nemá dostatek prostředků (cena ${amount.toLocaleString("cs")} Kč + administrační poplatek ${adminFee.toLocaleString("cs")} Kč)`
        : "Kupující nemá dostatek prostředků");
    }

    // Hráči na výměnu — ověř, že všichni stále patří kupujícímu (race-safe).
    // Stačí, aby jeden mezitím odešel, a celý obchod padá.
    const swapMoves: Array<{ id: string; rosterTeamId: string; loanUntil: string | null; parentClubId: string | null; nextMatchReturn: number }> = [];
    for (const swapId of swapPlayerIds) {
      const swap = await db.prepare("SELECT team_id, loan_from_team_id, loan_until, parent_club_id, next_match_return FROM players WHERE id = ?").bind(swapId).first<{ team_id: string; loan_from_team_id: string | null; loan_until: string | null; parent_club_id: string | null; next_match_return: number }>();
      const swapClubTeamId = swap ? await resolveClubTeamId(db, swap.team_id) : null;
      if (!swap || swapClubTeamId !== buyerTeamId || swap.loan_from_team_id || swap.next_match_return === 1) {
        // Vrátit peníze (rollback budget)
        await db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(totalCost, buyerTeamId).run()
          .catch((e) => logger.warn({ module: "game" }, "rollback budget after swap race", e));
        await releaseOfferClaim();
        return fail(409, "Hráč na výměnu již není k dispozici");
      }
      swapMoves.push({ id: swapId, rosterTeamId: swap.team_id, loanUntil: swap.loan_until, parentClubId: swap.parent_club_id, nextMatchReturn: swap.next_match_return });
    }
    // Vrácení už přesunutých hráčů na výměnu na jejich původní soupisku.
    const swapRollbackStmts = (moves: typeof swapMoves) => moves.map((m) => db.prepare(
      `UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = ?, parent_club_id = ?, next_match_return = ?
       WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL`,
    ).bind(m.rosterTeamId, m.loanUntil, m.parentClubId, m.nextMatchReturn, m.id, sellerTeamId));

    // Přičíst prodávajícímu + přesunout hráče + swap + uzavřít nabídku atomicky.
    // Guard `AND team_id = ?` chrání proti race condition (hráč mezitím prodán).
    const playerUpdateStmt = isBuyoutAccept
      ? db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL, parent_club_id = NULL, next_match_return = 0 WHERE id = ? AND team_id = ? AND loan_from_team_id = ? AND COALESCE(status, 'active') != 'transferring'").bind(buyerDestTeamId, playerId, currentPlayer.team_id, sellerRosterTeamId)
      : db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL, parent_club_id = NULL, next_match_return = 0 WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL AND COALESCE(status, 'active') != 'transferring'").bind(buyerDestTeamId, playerId, sellerRosterTeamId);

    const moved = await playerUpdateStmt.run();
    if (moved.meta.changes === 0) {
      await db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(totalCost, buyerTeamId).run()
        .catch((e) => logger.warn({ module: "game" }, "refund budget after player transfer race", e));
      await closeStaleOfferClaim();
      return fail(409, "Hráč mezitím změnil klub");
    }

    for (let i = 0; i < swapMoves.length; i++) {
      const m = swapMoves[i];
      const swapMoved = await db.prepare(
        `UPDATE players SET team_id = ?, loan_from_team_id = NULL, loan_until = NULL, parent_club_id = NULL, next_match_return = 0
         WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL AND next_match_return = 0
           AND COALESCE(status, 'active') != 'transferring'`,
      ).bind(sellerTeamId, m.id, m.rosterTeamId).run();
      if (swapMoved.meta.changes === 0) {
        await db.batch([
          db.prepare(
            `UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ?, parent_club_id = ?, next_match_return = ?
             WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL`,
          ).bind(
            currentPlayer.team_id, currentPlayer.loan_from_team_id, currentPlayer.loan_until,
            currentPlayer.parent_club_id, currentPlayer.next_match_return, playerId, buyerDestTeamId,
          ),
          ...swapRollbackStmts(swapMoves.slice(0, i)),
        ]).catch((e) => logger.warn({ module: "game" }, "rollback players after swap race", e));
        await db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(totalCost, buyerTeamId).run()
          .catch((e) => logger.warn({ module: "game" }, "refund budget after swap race", e));
        await releaseOfferClaim();
        return fail(409, "Hráč na výměnu již není k dispozici");
      }
    }

    const buyerBalanceAfter = buyer.budget - totalCost;
    const transferCore = [
      db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(payNow, sellerTeamId),
      db.prepare("UPDATE transfer_offers SET status = 'accepted', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(offerId),
      db.prepare(
        `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE player_id = ? AND id != ? AND status IN ('pending','countered')`,
      ).bind(playerId, offerId),
      db.prepare("UPDATE transfer_listings SET status = 'sold' WHERE player_id = ? AND status = 'active'").bind(playerId),
      db.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id IN (SELECT id FROM transfer_listings WHERE player_id = ?) AND status = 'pending'").bind(playerId),
    ];
    // Čistá výměna hráčů bez doplatku nemá co účtovat — nulové řádky by jen zaplevelily finance.
    if (payNow > 0) {
      transferCore.push(
        db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_fee', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), buyerTeamId, -payNow, buyerBalanceAfter + adminFee,
            terms.installments > 0 ? `Přestup: ${offerPlayerName} (záloha ${terms.upfrontPct} %, zbytek ${terms.installments}× týdně)` : `Přestup: ${offerPlayerName}`, gameDate),
        db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_income', ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), sellerTeamId, payNow, (seller?.budget ?? 0) + payNow,
            terms.installments > 0 ? `Prodej: ${offerPlayerName} (záloha, zbytek ${terms.installments}× týdně)` : `Prodej: ${offerPlayerName}`, gameDate),
      );
    }
    if (terms.installments > 0) {
      transferCore.push(db.prepare(
        `INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id, total_amount, upfront_amount,
           installment_amount, installments_total, remaining, created_game_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), offerId, playerId, offerPlayerName, buyerTeamId, sellerTeamId, amount, schedule.upfront,
        schedule.installmentAmount, schedule.installments, schedule.remainingAfterUpfront, gameDate));
    }
    if (terms.sellOnPct > 0) {
      transferCore.push(db.prepare(
        "INSERT INTO sell_on_clauses (id, offer_id, player_id, player_name, beneficiary_team_id, owner_team_id, pct) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), offerId, playerId, offerPlayerName, sellerTeamId, buyerTeamId, terms.sellOnPct));
    }
    if (adminFee > 0) {
      transferCore.push(db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'transfer_admin_fee', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), buyerTeamId, -adminFee, buyerBalanceAfter, `Administrační poplatek za meziligový přestup (${levies.adminFeePct} %)`, gameDate));
    }
    if (levies.levy > 0) {
      // Odvod platí prodávající z utržené částky — kupujícího se netýká.
      transferCore.push(db.prepare("UPDATE teams SET budget = budget - ? WHERE id = ?").bind(levies.levy, sellerTeamId));
      transferCore.push(db.prepare("INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date) VALUES (?, ?, 'competition_fee', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), sellerTeamId, -levies.levy, (seller?.budget ?? 0) + payNow - levies.levy,
          `Odvod z přestupu uvnitř soutěže (${levies.levyPct} %)`, gameDate));
    }

    if (isBuyoutAccept) {
      transferCore.push(
        db.prepare(
          `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_bought'
           WHERE player_id = ? AND join_type = 'loan' AND is_active = 1
             AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
        ).bind(gameDate, playerId, buyerTeamId, buyerTeamId),
        db.prepare(
          `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'transfer'
           WHERE player_id = ? AND join_type != 'loan' AND is_active = 1
             AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
        ).bind(gameDate, playerId, sellerTeamId, sellerTeamId),
      );
    } else {
      transferCore.push(db.prepare(
        `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'transfer'
         WHERE player_id = ? AND is_active = 1
           AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
      ).bind(gameDate, playerId, sellerTeamId, sellerTeamId));
    }
    transferCore.push(db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'transfer', ?, 1)")
      .bind(crypto.randomUUID(), playerId, buyerDestTeamId, seasonId, gameDate, amount));

    // Kontrakty pro hráče na výměnu
    for (const m of swapMoves) {
      transferCore.push(
        db.prepare(
          `UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'transfer'
           WHERE player_id = ? AND is_active = 1
             AND team_id IN (SELECT id FROM teams WHERE id = ? OR parent_team_id = ?)`,
        ).bind(gameDate, m.id, buyerTeamId, buyerTeamId),
        db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active) VALUES (?, ?, ?, ?, ?, 'swap', 0, 1)")
          .bind(crypto.randomUUID(), m.id, sellerTeamId, seasonId, gameDate),
      );
    }

    try {
      // Peníze obou klubů, účetní log, nabídka a smlouvy se potvrdí společně.
      await db.batch(transferCore);
    } catch (e) {
      logger.error({ module: "game" }, "commit transfer offer failed; rolling back guarded moves", e);
      const rollback = [
        db.prepare(
          `UPDATE players SET team_id = ?, loan_from_team_id = ?, loan_until = ?, parent_club_id = ?, next_match_return = ?
           WHERE id = ? AND team_id = ? AND loan_from_team_id IS NULL`,
        ).bind(
          currentPlayer.team_id, currentPlayer.loan_from_team_id, currentPlayer.loan_until,
          currentPlayer.parent_club_id, currentPlayer.next_match_return, playerId, buyerDestTeamId,
        ),
        db.prepare("UPDATE teams SET budget = budget + ? WHERE id = ?").bind(totalCost, buyerTeamId),
        db.prepare("UPDATE transfer_offers SET status = ?, resolved_at = NULL WHERE id = ? AND status = 'accepted'")
          .bind(offer.status, offerId),
      ];
      rollback.push(...swapRollbackStmts(swapMoves));
      await db.batch(rollback).catch((rollbackError) => logger.error({ module: "game" }, "rollback failed transfer offer", rollbackError));
      return fail(500, "Přestup se nepodařilo dokončit, zkus to znovu");
    }

    // Výnos do pokladny soutěže. Idempotentní přes reference_id odvozené z nabídky.
    const { recordTransferLevies } = await import("../competition/transfer-levy");
    await recordTransferLevies(db, {
      levies, buyerLeagueId: buyer.league_id, sellerLeagueId: sellerRoster?.league_id,
      buyerTeamId, sellerTeamId, offerId, gameDate,
    }).catch((e) => logger.warn({ module: "game" }, "zápis poplatků z přestupu do pokladny", e));

    // Prodávající hráče sám splácel nebo slíbil procenta: zbytek dluhu a procenta z ceny jdou hned.
    const { settleOnResale } = await import("../transfers/installments");
    await settleOnResale(db, { playerId, ownerClubTeamId: sellerTeamId, saleAmount: saleValueForSellOn + activeLoanFee, saleOfferId: offerId, gameDate })
      .catch((e) => logger.error({ module: "game" }, "doplacení splátek a procent při dalším prodeji", e));

    const { createTransferNews } = await import("../transfers/transfer-news");
    await createTransferNews(db, seller?.league_id ?? "", null, "transfer_completed", {
      playerName: offerPlayerName, playerAge: player?.age as number,
      playerPosition: player?.position as string, teamName: seller?.name ?? "",
      fromTeamName: seller?.name, toTeamName: buyer.name, fee: amount,
      swapPlayerNames,
      playerRating: player?.overall_rating as number | undefined,
      sellerTeamId, buyerTeamId,
    }).catch((e) => logger.warn({ module: "game" }, "create offer accepted news", e));
  }

  // Event log
  await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, 'accept', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), offerId, scope.actorClubTeamId, amount, acceptMessage, terms.upfrontPct, terms.installments, terms.sellOnPct).run()
    .catch((e) => logger.warn({ module: "game" }, "insert accept event", e));

  // Update commute + reset squad number (odkup z hostování je trvalý přestup, samo hostování ne)
  await onPlayerTransferred(db, playerId, buyerDestTeamId, { permanent: offerType !== "loan" });
  for (const swapId of swapPlayerIds) {
    await onPlayerTransferred(db, swapId, sellerTeamId, { permanent: true });
  }

  // Kořaly kupce (klub, ne jeho dorost): první koupě, celebrita v týmu. Hostování
  // koupě není.
  if (offerType !== "loan") {
    const { checkTransferAchievements } = await import("../services/achievements");
    await checkTransferAchievements(db, buyerTeamId, playerId)
      .catch((e) => logger.warn({ module: "game" }, "kořaly po přijetí nabídky", e));
  }

  // SMS notifications
  const playerName = offerPlayerName;
  // U výměny je částka jen doplatek (klidně nulový) — „za 0 Kč" by z výměny udělalo dárek.
  const { czechList } = await import("../transfers/swap-players");
  const moneyLabel = `${amount.toLocaleString("cs-CZ")} Kč`;
  const swapGoods = swapPlayerNames.length > 0
    ? czechList(amount > 0 ? [...swapPlayerNames, moneyLabel] : swapPlayerNames)
    : null;
  const dealLabel = swapGoods ? `výměnou za ${swapGoods}` : `za ${moneyLabel}`;
  if (offerType === "loan") {
    await smsToClub(db, buyerTeamId, `🤝 Hostování schváleno! ${playerName} přichází z ${seller?.name ?? "neznámého klubu"} na ${loanDuration} dní.`, "loan accept SMS buyer");
    await smsToClub(db, sellerTeamId, `📤 Hostování potvrzeno. ${playerName} odchází do ${buyer.name} na ${loanDuration} dní.${amount > 0 ? ` Poplatek: ${amount.toLocaleString("cs")} Kč.` : ""}`, "loan accept SMS seller");
  } else {
    await smsToClub(db, buyerTeamId, `🤝 Přestup potvrzen! ${playerName} přichází z ${seller?.name ?? "neznámého klubu"} ${dealLabel}.`, "transfer accept SMS buyer");
    await smsToClub(db, sellerTeamId, `📤 Přestup potvrzen. ${playerName} odchází do ${buyer.name} ${dealLabel}.`, "transfer accept SMS seller");
  }

  // Push notifikace
  const label = offerType === "loan" ? "Hostování" : "Přestup";
  const acceptNote = acceptMessage ? ` „${acceptMessage}"` : "";
  await notifyClub(env, buyerTeamId, `✅ ${label} ${playerName} dokončen`, `Koupili jste od ${seller?.name ?? "prodávajícího"} ${dealLabel}.${acceptNote}`, `/prestupy/nabidka/${offerId}`, "offer accept notifications");
  await notifyClub(env, sellerTeamId, `✅ ${label} ${playerName} dokončen`, `${swapGoods ? `Od ${buyer.name} přichází ${swapGoods}` : `${buyer.name} zaplatil ${moneyLabel}`}.${acceptNote}`, `/prestupy/nabidka/${offerId}`, "offer accept notifications");
  // Push týmům sledujícím hráče ve watchlistu (kromě obou stran)
  await pushToWatchers(env, offer.player_id as string, buyerTeamId,
    `⭐ ${playerName} ${offerType === "loan" ? "jde na hostování" : "přestoupil"}`,
    `${seller?.name ?? "Klub"} → ${buyer.name} ${dealLabel}.`);

  return { ok: true };
}

// ═══ Odmítnutí, protinávrh, stažení ═══

interface OfferForReply {
  id: string; player_id: string; from_team_id: string; to_team_id: string; offer_amount: number; counter_amount: number | null;
  offer_type: string; status: string; last_action_by: string | null; virtual_team_data: string | null;
}

/** POST /teams/:teamId/offers/:offerId/reject — odmítnout smí ten, kdo je na tahu. */
export async function rejectTransferOffer(
  env: Bindings,
  actorTeamId: string,
  offerId: string,
  input: { message?: string | null } = {},
  opts?: TransferActionOptions,
): Promise<TransferActionResult> {
  const db = env.DB;
  const message = input.message ?? null;
  // Reject smí ten, kdo JE na tahu — buyer i seller.
  const offer = await db.prepare(
    `SELECT id, player_id, from_team_id, to_team_id, offer_amount, counter_amount, offer_type, status, last_action_by, virtual_team_data
     FROM transfer_offers WHERE id = ? AND status IN ('pending','countered')`
  ).bind(offerId).first<OfferForReply>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch offer for reject", e); return null; });
  if (!offer) return fail(404, "Nabídka nenalezena");
  const scope = await resolveOfferClubScope(db, actorTeamId, offer);
  if (!scope?.role) return fail(404, "Nabídka nenalezena");
  if (!scope.onTurn) return fail(409, "Nejsi na tahu");

  const rejected = await db.prepare(
    `UPDATE transfer_offers
     SET status = 'rejected', reject_message = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ? AND status = ? AND last_action_by IS ?`
  ).bind(message, offerId, offer.status, offer.last_action_by).run();
  if (rejected.meta.changes === 0) return fail(409, "Nabídku mezitím vyřešil někdo jiný");

  // Dopad na hráče — jen když nabídku odmítl VLASTNÍK hráče (prodávající). I u AI klubu:
  // truc platí stejně, jen bez zpráv (applyOfferRejectionImpact AI klubu nic nepíše).
  if (scope.role === "seller") {
    const { applyOfferRejectionImpact } = await import("../transfers/offer-rejection-impact");
    await inBackground(opts, applyOfferRejectionImpact(db, offer, "reject", {
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db,
    }).catch((e) => logger.warn({ module: "game" }, "rejection impact", e)));
  }

  await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'reject', NULL, ?)")
    .bind(crypto.randomUUID(), offerId, scope.actorClubTeamId, message).run()
    .catch((e) => logger.warn({ module: "game" }, "insert reject event", e));

  const otherTeamId = scope.role === "buyer" ? scope.sellerClubTeamId : scope.buyerClubTeamId;
  // Virtuální klub nemá telefon ani notifikace — odmítnutí končí tady.
  if (otherTeamId === "virtual_ai" || await isAiTeam(db, otherTeamId)) return { ok: true };
  const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
    .bind(offer.player_id).first<{ first_name: string; last_name: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch player for reject notif", e); return null; });
  const rejecterTeam = await db.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(scope.actorClubTeamId).first<{ name: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch rejecter team", e); return null; });
  const playerName = player ? `${player.first_name} ${player.last_name}` : "hráče";
  const isLoan = offer.offer_type === "loan";
  await sendPhoneSMS(db, otherTeamId, SMS_ROLE, SMS_ROLE,
    `❌ ${rejecterTeam?.name ?? "Klub"} odmítl ${isLoan ? "hostování" : "přestup"} ${playerName}.${message ? ` Vzkaz: "${message}"` : ""}`
  ).catch((e) => logger.warn({ module: "game" }, "SMS reject notif", e));
  await notifyClub(env, otherTeamId,
    `❌ Nabídka za ${playerName} zamítnuta`,
    `${rejecterTeam?.name ?? "Klub"} odmítl nabídku${message ? `: „${message}"` : "."}`,
    `/prestupy/nabidka/${offerId}`, "reject offer notification");

  return { ok: true };
}

export interface CounterOfferInput {
  amount: number;
  message?: string;
  upfrontPct?: number;
  installments?: number;
  sellOnPct?: number;
}

/** POST /teams/:teamId/offers/:offerId/counter — protinávrh smí ten, kdo je na tahu. */
export async function counterTransferOffer(env: Bindings, actorTeamId: string, offerId: string, body: CounterOfferInput): Promise<TransferActionResult> {
  const db = env.DB;
  if (!Number.isInteger(body.amount) || body.amount < 0) return fail(400, "Protinabídka musí být kladné celé číslo");
  if (body.amount > MAX_TRANSFER_AMOUNT) return fail(400, `Částka může být nejvýš ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`);

  // Counter smí ten, kdo JE na tahu.
  const offer = await db.prepare(
    "SELECT player_id, from_team_id, to_team_id, status, last_action_by, expires_at, offer_type, upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE id = ? AND status IN ('pending','countered')"
  ).bind(offerId).first<{ player_id: string; from_team_id: string; to_team_id: string; status: string; last_action_by: string | null; expires_at: string; offer_type: string | null; upfront_pct: number | null; installments: number | null; sell_on_pct: number | null }>();
  if (!offer) return fail(404, "Nabídka nenalezena");
  // Nula jde jen u výměny hráčů — hráči za hráče bez doplatku.
  if (body.amount === 0) {
    const hasSwap = await db.prepare("SELECT 1 FROM transfer_offer_swap_players WHERE offer_id = ? LIMIT 1")
      .bind(offerId).first();
    if (!hasSwap) return fail(400, "Protinabídka musí být kladné celé číslo (0 jen u výměny hráčů)");
  }
  const scope = await resolveOfferClubScope(db, actorTeamId, offer);
  if (!scope?.role) return fail(404, "Nabídka nenalezena");
  if (scope.buyerClubTeamId === "virtual_ai") return fail(400, "Virtuální klub o ceně nejedná, ber, nebo nech být");
  if (!scope.onTurn) return fail(409, "Nejsi na tahu");
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) return fail(410, "Nabídka vypršela");
  if (await areClubsLinked(db, scope.buyerClubTeamId, scope.sellerClubTeamId)) return fail(403, LINKED_CLUBS_ERRORS.transfer);

  // Podmínky protinávrhu: co strana neposlala, zůstává z aktuálního návrhu (starší klienti posílají jen částku).
  const current = termsFromRow(offer, body.amount);
  const terms: TransferTerms = {
    amount: body.amount,
    upfrontPct: body.upfrontPct ?? current.upfrontPct,
    installments: body.installments ?? current.installments,
    sellOnPct: body.sellOnPct ?? current.sellOnPct,
  };
  const plainTerms = terms.upfrontPct === 100 && terms.installments === 0 && terms.sellOnPct === 0;
  if ((offer.offer_type ?? "transfer") === "loan" && !plainTerms) return fail(400, "Splátky a procenta jdou jen u trvalého přestupu");
  const termsError = transferTermsError(terms);
  if (termsError) return fail(400, termsError);
  if (terms.installments > 0 && (offer.installments ?? 0) === 0) {
    const limitError = await installmentLimitError(db, scope.buyerClubTeamId);
    if (limitError) return fail(400, limitError);
  }
  // Strop splátek podle příjmů kupujícího: protinávrh, který by kupující neutáhl, nejde poslat.
  if (terms.installments > 0) {
    const budgetError = await installmentBudgetError(db, scope.buyerClubTeamId, weeklyInstallment(terms), scope.role === "buyer");
    if (budgetError) return fail(400, budgetError);
  }

  // Pokud counter posílá kupující (from_team_id), ověř že má peníze na to, co platí hned
  if (scope.role === "buyer") {
    const payNow = transferSchedule(terms).upfront;
    const buyer = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(scope.buyerClubTeamId).first<{ budget: number }>();
    if (!buyer || buyer.budget < payNow) {
      return fail(400, terms.installments > 0
        ? `Nedostatek peněz na zálohu. Máte ${(buyer?.budget ?? 0).toLocaleString("cs")} Kč, záloha je ${payNow.toLocaleString("cs")} Kč.`
        : `Nedostatek peněz. Máte ${(buyer?.budget ?? 0).toLocaleString("cs")} Kč, nabízíte ${body.amount.toLocaleString("cs")} Kč.`);
    }
  }

  const countered = await db.prepare(
    `UPDATE transfer_offers SET status = 'countered', counter_amount = ?, upfront_pct = ?, installments = ?, sell_on_pct = ?, last_action_by = ?,
            expires_at = ?
     WHERE id = ? AND status = ? AND last_action_by IS ?`
  ).bind(body.amount, terms.upfrontPct, terms.installments, terms.sellOnPct, scope.actorClubTeamId,
    // Lhůta běží od posledního tahu: protinávrh dává druhé straně nové tři dny.
    offerReplyDeadline(), offerId, offer.status, offer.last_action_by).run();
  if (countered.meta.changes === 0) return fail(409, "Nabídku mezitím vyřešil někdo jiný");

  await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message, upfront_pct, installments, sell_on_pct) VALUES (?, ?, ?, 'counter', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), offerId, scope.actorClubTeamId, body.amount, body.message ?? null, terms.upfrontPct, terms.installments, terms.sellOnPct).run()
    .catch((e) => logger.warn({ module: "game" }, "insert counter event", e));

  const otherTeamId = scope.role === "buyer" ? scope.sellerClubTeamId : scope.buyerClubTeamId;
  if (await isAiTeam(db, otherTeamId)) return { ok: true };
  const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?")
    .bind(offer.player_id).first<{ first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch player for counter notif", e); return null; });
  const counterTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(scope.actorClubTeamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "fetch counter team", e); return null; });
  const pName = player ? `${player.first_name} ${player.last_name}` : "hráče";
  await sendPhoneSMS(db, otherTeamId, SMS_ROLE, SMS_ROLE,
    `💰 ${counterTeam?.name ?? "Klub"} poslal protinabídku na ${pName}: ${formatTermsSummary(terms)}.`
  ).catch((e) => logger.warn({ module: "game" }, "SMS counter notif", e));
  await notifyClub(env, otherTeamId,
    `🔄 Protinabídka za ${pName}`,
    `${counterTeam?.name ?? "Klub"} poslal protinabídku ${formatTermsSummary(terms)}${body.message ? `: „${body.message}"` : "."}`,
    `/prestupy/nabidka/${offerId}`, "counter offer notification");

  return { ok: true };
}

/** DELETE /teams/:teamId/offers/:offerId — stáhnout nabídku (kupec) nebo ukončit jednání (prodávající). */
export async function withdrawTransferOffer(
  env: Bindings,
  actorTeamId: string,
  offerId: string,
  input: { message?: string | null } = {},
  opts?: TransferActionOptions,
): Promise<TransferActionResult> {
  const db = env.DB;
  const withdrawMessage = input.message ?? null;
  // Stáhnout/ukončit smí kupec i prodávající, pokud je jednání aktivní.
  const offer = await db.prepare(
    `SELECT id, player_id, from_team_id, to_team_id, offer_amount, counter_amount, offer_type, status, last_action_by, virtual_team_data
     FROM transfer_offers WHERE id = ? AND status IN ('pending','countered')`
  ).bind(offerId).first<OfferForReply>();
  if (!offer) return fail(409, "Jednání nelze ukončit (nejsi součástí nebo už je vyřešené)");
  const scope = await resolveOfferClubScope(db, actorTeamId, offer);
  if (!scope?.role) return fail(409, "Jednání nelze ukončit (nejsi součástí nebo už je vyřešené)");

  const result = await db.prepare(
    "UPDATE transfer_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND status IN ('pending','countered')"
  ).bind(offerId).run();
  if (result.meta.changes === 0) return fail(409, "Jednání nelze ukončit (nejsi součástí nebo už je vyřešené)");
  await db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, message) VALUES (?, ?, ?, 'withdraw', NULL, ?)")
    .bind(crypto.randomUUID(), offerId, scope.actorClubTeamId, withdrawMessage).run()
    .catch((e) => logger.warn({ module: "game" }, "insert withdraw event", e));

  // Prodávající, který jednání ukončí, hráče nepustil: dopad jako u odmítnutí (i u AI klubu, bez zpráv).
  // Jinak šla nespokojenost hráče, který chtěl odejít, obejít ukončením místo odmítnutí.
  if (scope.role === "seller") {
    const { applyOfferRejectionImpact } = await import("../transfers/offer-rejection-impact");
    await inBackground(opts, applyOfferRejectionImpact(db, offer, "reject", {
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db,
    }).catch((e) => logger.warn({ module: "game" }, "end negotiation impact", e)));
  }

  // Notifikace druhé straně
  if (scope.buyerClubTeamId !== "virtual_ai") {
    const otherTeamId = scope.role === "buyer" ? scope.sellerClubTeamId : scope.buyerClubTeamId;
    const initiatorIsBuyer = scope.role === "buyer";
    const player = await db.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(offer.player_id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "player for withdraw", e); return null; });
    const initiatorTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(scope.actorClubTeamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "game" }, "initiator team for withdraw", e); return null; });
    const pName = player ? `${player.first_name} ${player.last_name}` : "hráče";
    const verb = initiatorIsBuyer ? "stáhl nabídku" : "ukončil jednání";
    await notifyClub(env, otherTeamId,
      `↩️ Jednání o ${pName} ukončeno`,
      `${initiatorTeam?.name ?? "Klub"} ${verb}${withdrawMessage ? `: „${withdrawMessage}"` : "."}`,
      `/prestupy/nabidka/${offerId}`, "withdraw notification");
  }

  return { ok: true };
}

// ═══ Inzerát ═══

/** POST /teams/:teamId/players/:playerId/list — vystavit hráče na trh. */
export async function listPlayerOnMarket(env: Bindings, teamId: string, playerId: string, askingPrice: number): Promise<TransferActionResult<{ listingId: string }>> {
  const db = env.DB;
  if (!Number.isInteger(askingPrice) || askingPrice <= 0 || askingPrice > MAX_TRANSFER_AMOUNT) {
    return fail(400, `Cena musí být celé číslo od 1 do ${MAX_TRANSFER_AMOUNT.toLocaleString("cs")} Kč.`);
  }

  // Dorostenec patří U21 týmu, ale frontend sem posílá ID A-týmu — klub je jeden a manažer
  // ho ovládá odtamtud. Bez druhé podmínky hráče nenajdeme a manažer dostane „Hráč nenalezen",
  // takže z dorostu nešlo nikoho propustit ani vystavit na trh.
  const player = await db.prepare(
    `SELECT p.first_name, p.last_name, p.age, p.position, p.loan_from_team_id, t.name as team_name
       FROM players p JOIN teams t ON p.team_id = t.id
      WHERE p.id = ? AND (p.team_id = ? OR t.parent_team_id = ?)`
  ).bind(playerId, teamId, teamId).first<Record<string, unknown>>();
  if (!player) return fail(404, "Hráč nenalezen");
  if (player.loan_from_team_id) return fail(400, "Hostující hráč nemůže být vylistován na trh");

  // Check if already listed
  const existing = await db.prepare(
    "SELECT id FROM transfer_listings WHERE player_id = ? AND status = 'active'"
  ).bind(playerId).first();
  if (existing) return fail(400, "Hráč je už na trhu");

  // Inzerát patří KLUBU, který hráče prodává — tedy A-týmu a jeho lize, i když je hráč
  // vedený v dorostu. Trh se čte přes `league_id` a `team_id` áčka, takže inzerát založený
  // na dorostenecký tým je neviditelný: nevidí ho soupeři ani vlastník mezi svými nabídkami.
  const listingTeam = await db.prepare("SELECT league_id, name FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string; name: string }>();
  if (!listingTeam) return fail(404, "Tým nenalezen");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  const id = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, playerId, teamId, askingPrice, listingTeam.league_id, expiresAt.toISOString()).run();

  const { createTransferNews } = await import("../transfers/transfer-news");
  await createTransferNews(db, listingTeam.league_id, teamId, "player_listed", {
    playerName: `${player.first_name} ${player.last_name}`, playerAge: player.age as number,
    playerPosition: player.position as string, teamName: player.team_name as string, fee: askingPrice,
  }).catch((e) => logger.warn({ module: "game" }, "create listing news", e));

  return { ok: true, listingId: id };
}

/** DELETE /teams/:teamId/listings/:listingId — stáhnout inzerát (rozjednané příhozy se zamítnou). */
export async function withdrawListing(env: Bindings, teamId: string, listingId: string): Promise<TransferActionResult> {
  const db = env.DB;
  await db.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE id = ? AND team_id = ?").bind(listingId, teamId).run();
  await db.prepare("UPDATE transfer_bids SET status = 'rejected' WHERE listing_id = ? AND status = 'pending'").bind(listingId).run().catch((e) => logger.warn({ module: "game" }, "reject bids on listing withdrawal", e));
  return { ok: true };
}

// ═══ Volný hráč ═══

export type SignFreeAgentResult = TransferActionResult<{
  success: boolean;
  decision: unknown;
  playerId?: string;
  player?: Record<string, unknown> | null;
}>;

/** POST /teams/:teamId/free-agents/:faId/sign — podpis volného hráče (rozhoduje hráč). */
export async function signFreeAgent(env: Bindings, teamId: string, faId: string, offeredWage: number): Promise<SignFreeAgentResult> {
  const db = env.DB;
  const team = await db.prepare(
    "SELECT t.*, v.lat, v.lng, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?"
  ).bind(teamId).first<Record<string, unknown>>();
  if (!team) return fail(404, "Tým nenalezen");

  const fa = await db.prepare("SELECT * FROM free_agents WHERE id = ?").bind(faId).first<Record<string, unknown>>();
  if (!fa) return fail(404, "Volný hráč nenalezen");

  // Hráč z jiného okresu propuštěný dalším klubem téhož majitele: propuštění a podpis
  // by přesunuly hráče mezi vlastními kluby bez přestupu, mimo dohled soutěže.
  if (fa.district !== team.district && fa.released_from_team_id && fa.released_from_team_id !== teamId) {
    const releasedBy = await db.prepare("SELECT user_id FROM teams WHERE id = ?")
      .bind(fa.released_from_team_id).first<{ user_id: string }>();
    if (releasedBy && releasedBy.user_id !== "ai" && releasedBy.user_id === team.user_id) {
      return fail(400, "Hráče propuštěného z jiného tvého klubu podepsat nemůžeš.");
    }
  }
  // Propojené kluby i ve stejném okrese: propuštění a podpis by byl přestup bez přestupu.
  if (fa.released_from_team_id && await areClubsLinked(db, teamId, fa.released_from_team_id as string)) {
    return fail(403, LINKED_CLUBS_ERRORS.freeAgent);
  }

  let agentVillage: { lat: number; lng: number } | null = null;
  if (fa.village_id) {
    agentVillage = await db.prepare("SELECT lat, lng FROM villages WHERE id = ?")
      .bind(fa.village_id).first<{ lat: number; lng: number }>().catch((e) => { logger.warn({ module: "game" }, "fetch agent village coords", e); return null; });
  }

  const squadCount = await db.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ?")
    .bind(teamId).first<{ cnt: number }>();
  if ((squadCount?.cnt ?? 0) >= 30) return fail(400, "Kádr je plný (max. 30 hráčů)");

  // Peníze na registraci se kontrolují PŘED rozhodnutím hráče. Dřív se nekontrolovaly vůbec:
  // hráč rozhodl, a když odmítl, zapsal se klub do `rejected_by` a hráč mu zmizel z trhu,
  // přestože manažer na podpis ani neměl. Když kývnul, rozpočet spadl do mínusu.
  const budget = Number(team.budget) || 0;
  if (budget < FREE_AGENT_SIGNING_FEE) {
    return fail(400, `Na registraci hráče nemáš dost peněz. Stojí ${FREE_AGENT_SIGNING_FEE.toLocaleString("cs")} Kč, máš ${budget.toLocaleString("cs")} Kč.`);
  }

  const personality = (() => { try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent personality", e); return {}; } })();

  const { evaluateSigningChance } = await import("../transfers/player-agency");
  const { loadCoachStandings } = await import("../transfers/player-interest");
  const coach = (await loadCoachStandings(db, [teamId])).get(teamId) ?? null;
  const rng = createRng(cryptoSeed());
  const decision = evaluateSigningChance(
    { weekly_wage: fa.weekly_wage as number, personality, village_id: fa.village_id as string | null, district: fa.district as string | null },
    { reputation: team.reputation as number, villageLat: team.lat as number, villageLon: team.lng as number, squadSize: squadCount?.cnt ?? 15, district: team.district as string | null, coach },
    agentVillage, offeredWage, rng,
  );

  if (!decision.accepted) {
    // Odmítl tento tým — přidat do rejected_by (JSON pole), nelze zkoušet znovu
    const currentRejected = (() => { try { return JSON.parse((fa.rejected_by as string) ?? "[]"); } catch (e) { logger.warn({ module: "game" }, "parse rejected_by for update", e); return []; } })();
    currentRejected.push(teamId);
    await db.prepare("UPDATE free_agents SET rejected_by = ? WHERE id = ?")
      .bind(JSON.stringify(currentRejected), faId).run().catch((e) => logger.warn({ module: "game" }, "update rejected_by", e));
    // Hlášení skauta o tomhle hráči: odmítl.
    await db.prepare("UPDATE scout_reports SET status = 'refused', resolved_at = ? WHERE free_agent_id = ? AND team_id = ? AND status = 'active'")
      .bind(new Date().toISOString(), faId, teamId).run().catch((e) => logger.warn({ module: "game" }, "hlášení skauta po odmítnutí", e));
    return { ok: true, success: false, decision };
  }

  const playerId = crypto.randomUUID();
  const isCelebrity = (fa.is_celebrity as number) ?? 0;
  // Extract skillsMax from life_context (fallen_star celebrities have it stored there)
  const faLifeCtx = (() => {
    try { return JSON.parse(fa.life_context as string); } catch (e) { logger.warn({ module: "game" }, "parse free agent life_context", e); return {}; }
  })();
  // Stropy: celebrity je mají v `life_context`, ostatní ve vlastním sloupci (migrace 0178).
  //
  // Dřív se za stropy dosazovaly ploché dovednosti `fa.skills`, takže vznikl tvar
  // {"speed": 51} místo {"speed": {"current": 51, "maxPotential": 68}} a hráč neměl
  // KAM RŮST — strop se rovnal dnešní hodnotě. Volní hráči z doby před migrací sloupec
  // nemají vyplněný, proto se pro ně stropy dopočítají tady.
  const capsRng = createRng(cryptoSeed());
  const faSkillsMaxRaw = (() => {
    if (faLifeCtx.skillsMax) return faLifeCtx.skillsMax as Record<string, unknown>;
    const storedCaps = (() => {
      try { return JSON.parse((fa.skills_max as string) ?? "{}"); } catch (e) { logger.warn({ module: "game" }, "parse free agent skills_max", e); return {}; }
    })();
    const hasCapObjects = Object.values(storedCaps).some((v) => v && typeof v === "object");
    if (hasCapObjects) return storedCaps as Record<string, unknown>;
    const flatSkills = (() => {
      try { return JSON.parse((fa.skills as string) ?? "{}"); } catch (e) { logger.warn({ module: "game" }, "parse free agent skills", e); return {}; }
    })();
    return stropyZDovednosti(capsRng, flatSkills as Record<string, number>, Number(fa.age) || 25);
  })();
  const faSkillsMax = JSON.stringify(faSkillsMaxRaw);
  const faTalent = (fa.hidden_talent as number) || talentPodleVeku(capsRng, Number(fa.age) || 25);
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, hidden_talent, weekly_wage, nationality, status, is_celebrity, skills_max)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).bind(playerId, teamId, fa.first_name, fa.last_name, (fa.nickname as string) ?? "", fa.age, fa.position, fa.overall_rating,
    fa.skills, fa.physical, fa.personality, fa.life_context, fa.avatar, faTalent, offeredWage, (fa.nationality as string) ?? "CZ", isCelebrity, faSkillsMax).run();

  // Set residence & commute for new signing
  const { generateResidence } = await import("../generators/residence");
  const teamVillage = await db.prepare("SELECT v.name, v.size, v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
    .bind(teamId).first<{ name: string; size: string; district: string }>().catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (teamVillage) {
    const resRng = createRng(cryptoSeed());
    const res = generateResidence(resRng, teamVillage.name, teamVillage.size, teamVillage.district);
    await db.prepare("UPDATE players SET residence = ?, commute_km = ? WHERE id = ?")
      .bind(res.residence, res.commuteKm, playerId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }

  const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ id: string }>().catch((e) => { logger.warn({ module: "game" }, "fetch season for signing contract", e); return null; });
  await db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'free_agent', 0, 1)")
    .bind(crypto.randomUUID(), playerId, teamId, season?.id ?? "unknown").run().catch((e) => logger.warn({ module: "game" }, "insert signing contract", e));

  // Nováček si do kabiny přinese pár vazeb (soused, kolega z práce, vrstevník…)
  const { attachNewcomerRelations } = await import("../transfers/attach-relations");
  await attachNewcomerRelations(db, teamId, playerId);
  const { initNewcomerCoachRelation } = await import("../lib/coach-relation");
  await initNewcomerCoachRelation(db, teamId, playerId);

  // Atomický DELETE — pokud FA mezitím podepsal jiný tým, RETURNING vrátí 0 řádků.
  const deleted = await db.prepare("DELETE FROM free_agents WHERE id = ? RETURNING id").bind(faId).first<{ id: string }>();
  if (!deleted) {
    // Jiný tým ho stihl dřív — rollback: smazat hráče co jsme právě insertli
    await db.prepare("DELETE FROM players WHERE id = ?").bind(playerId).run()
      .catch((e) => logger.warn({ module: "game" }, "rollback player after FA race condition", e));
    return fail(409, "Hráč již byl podepsán jiným týmem");
  }

  // Kdo volného hráče sledoval, sleduje ho dál v novém klubu. Podpisem dostal hráč
  // nové id a sledování pod id volného hráče by jinak viselo na ničem.
  await db.prepare("UPDATE player_watchlist SET player_id = ? WHERE player_id = ?")
    .bind(playerId, faId).run()
    .catch((e) => logger.warn({ module: "game" }, "převod sledování na podepsaného hráče", e));

  const gameDate = (team.game_date as string) ?? new Date().toISOString();
  await recordTransaction(db, teamId, "signing_fee", -FREE_AGENT_SIGNING_FEE, `Registrace: ${fa.first_name} ${fa.last_name}`, gameDate);

  // Kořaly „Showman": celebrity přicházejí do hry mezi volnými hráči, takže tohle
  // je skoro jediná cesta, jak ji získat.
  if (isCelebrity) {
    const { checkFreeAgentSigningAchievements } = await import("../services/achievements");
    await checkFreeAgentSigningAchievements(db, teamId, { isCelebrity: true })
      .catch((e) => logger.warn({ module: "game" }, "kořaly po podpisu celebrity", e));
  }

  const { createTransferNews } = await import("../transfers/transfer-news");
  if (isCelebrity) {
    // Celebrity signing — bombastic league-wide news + broadcast
    const celebPers = (() => {
      try { return JSON.parse(fa.personality as string); } catch (e) { logger.warn({ module: "game" }, "parse celebrity personality", e); return {}; }
    })();
    const celebTier = celebPers.celebrityTier as string | undefined;
    const celebTypeStr = celebPers.celebrityType as string ?? "legend";
    const tierDesc = celebTypeStr === "legend"
      ? { S: "bývalý reprezentant", A: "ex-ligista z 1. ligy", B: "hráč 2. ligy", C: "krajský přeborník" }[celebTier ?? "C"]
      : celebTypeStr === "fallen_star" ? "zkrachovalý talent" : "věčně zraněný profík";
    const headline = `HOTOVO: ${fa.first_name} ${fa.last_name} podepsal za ${team.name}!`;
    const bodyText = celebTier === "S"
      ? `Je to oficiální! ${fa.first_name} ${fa.last_name} bude hrát za ${team.name} v okresním přeboru. Celý okres je vzhůru nohama.`
      : `${fa.first_name} ${fa.last_name}, ${tierDesc}, se dohodl s ${team.name}. Posílí kádr pro zbytek sezóny.`;
    await db.prepare("INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'celebrity_signing', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(crypto.randomUUID(), team.league_id, headline, bodyText).run()
      .catch((e) => logger.warn({ module: "game" }, "celebrity signing news", e));
    // Broadcast to all human teams
    const leagueTeams = await db.prepare(
      "SELECT c.id as conv_id FROM teams t JOIN conversations c ON c.team_id = t.id AND c.type = 'chairman' WHERE t.league_id = ? AND t.user_id != 'ai'"
    ).bind(team.league_id).all().catch((e) => { logger.warn({ module: "game" }, "fetch league teams for celeb broadcast", e); return { results: [] }; });
    for (const lt of leagueTeams.results) {
      await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Předseda Přeboru', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
        .bind(crypto.randomUUID(), lt.conv_id, `⭐ ${fa.first_name} ${fa.last_name} podepsal smlouvu s ${team.name}!`)
        .run().catch((e) => logger.warn({ module: "game" }, "celeb signing broadcast", e));
    }
    // Reputation + morale boost
    const repBonus = { S: 15, A: 10, B: 7, C: 4 }[celebTier ?? "C"] ?? 5;
    {
      const { applyReputationDelta } = await import("../lib/reputation");
      await applyReputationDelta(
        db, teamId, repBonus, "celebrity",
        `Podpis hvězdy: ${fa.first_name} ${fa.last_name}`,
        { referenceId: `celeb-${fa.id}` },
      );
    }
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', MIN(100, json_extract(life_context, '$.morale') + 3)) WHERE team_id = ?")
      .bind(teamId).run().catch((e) => logger.warn({ module: "game" }, "celeb morale boost", e));
  } else {
    await createTransferNews(db, team.league_id as string, teamId, "player_signed", {
      playerName: `${fa.first_name} ${fa.last_name}`, playerAge: fa.age as number,
      playerPosition: fa.position as string, teamName: team.name as string,
    }).catch((e) => logger.warn({ module: "game" }, "create signing news", e));
  }

  // Return full player data for reveal card
  const newPlayer = await db.prepare("SELECT * FROM players WHERE id = ?").bind(playerId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "game" }, "fetch new player after signing", e); return null; });
  const playerData = newPlayer ? {
    ...newPlayer,
    skills: JSON.parse((newPlayer.skills as string) ?? "{}"),
    physical: JSON.parse((newPlayer.physical as string) ?? "{}"),
    personality: JSON.parse((newPlayer.personality as string) ?? "{}"),
    lifeContext: JSON.parse((newPlayer.life_context as string) ?? "{}"),
    avatar: JSON.parse((newPlayer.avatar as string) ?? "{}"),
  } : null;

  // Hlášení skautů o tomhle hráči: u kupce podepsal, ostatním ho sebral jiný klub.
  await db.prepare(
    "UPDATE scout_reports SET status = CASE WHEN team_id = ? THEN 'signed' ELSE 'gone' END, resolved_at = ? WHERE free_agent_id = ? AND status = 'active'",
  ).bind(teamId, new Date().toISOString(), faId).run().catch((e) => logger.warn({ module: "game" }, "hlášení skautů po podpisu", e));

  return { ok: true, success: true, decision, playerId, player: playerData };
}
