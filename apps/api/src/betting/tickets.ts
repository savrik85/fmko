/**
 * Podání tiketu.
 *
 * Peníze se strhávají HNED při podání, ne až při vyhodnocení — jinak by šlo
 * vsadit víc, než klub má, a prohrané tikety by se vymáhaly z prázdné kasy.
 */

import { logger } from "../lib/logger";
import { resolveRules } from "../competition/rules";
import { recordTransaction, assertPurchaseAllowed } from "../season/finance-processor";
import { recordCompetitionEntry } from "../competition/ledger";
import { combineOddsX100, capPayout } from "./odds-model";

const M = "betting-tickets";

/** Nejnižší přijatelný vklad. Pod tím je to jen šum v historii transakcí. */
export const MIN_STAKE = 100;

/** Kolik tiketů smí klub podat na jedno kolo. */
export const MAX_TICKETS_PER_ROUND = 3;

/** Nejvíc tipů na jednom tiketu. Na lístku bývá sedm zápasů, jeden je vlastní. */
export const MAX_SELECTIONS = 6;

export interface SelectionInput {
  matchId: string;
  market: string;
  selection: string;
  /** Kurz, který hráč viděl. Slouží jen k porovnání, nikdy k výpočtu výplaty. */
  oddsX100: number;
}

export type PlaceResult =
  | { ok: true; ticketId: string; totalOddsX100: number; payout: number; capped: boolean; levy: number }
  | { ok: false; status: number; error: string; changed?: Array<{ matchId: string; market: string; selection: string; oldOddsX100: number; newOddsX100: number }> };

interface OddsRow {
  match_id: string; market: string; selection: string;
  odds_x100: number; label: string; calendar_id: string;
  league_id: string; season_number: number;
}

/**
 * Všechny týmy, které řídí tentýž člověk.
 *
 * Musí se brát přes user_id, ne jen zadané teamId: U21 tým sdílí user_id
 * s A-týmem, takže bez tohohle by šlo vsadit na vlastní zápas rezervy.
 */
async function vlastniTymy(db: D1Database, teamId: string): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT id FROM teams WHERE user_id = (SELECT user_id FROM teams WHERE id = ?)`
  ).bind(teamId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `týmy uživatele ${teamId}`, e); return { results: [] }; });
  const out = new Set(rows.results.map((r) => r.id));
  out.add(teamId);
  return out;
}

export interface BetLimits {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  maxSelections: number;
  ticketsPerRound: number;
  levyPct: number;
}

/** Limity platné pro danou soutěž — sazebník přebíjí výchozí hodnoty. */
export async function limitsFor(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<BetLimits> {
  const r = await resolveRules(db, leagueId, seasonNumber);
  return {
    minStake: MIN_STAKE,
    maxStake: r.bet_max_stake,
    maxPayout: r.bet_max_payout,
    maxSelections: MAX_SELECTIONS,
    ticketsPerRound: MAX_TICKETS_PER_ROUND,
    levyPct: r.levy_bet_pct,
  };
}

/**
 * Smí tenhle klub vůbec sázet?
 * Vrací důvod v češtině, aby ho endpoint mohl poslat rovnou hráči.
 */
export async function canBet(
  db: D1Database, teamId: string, leagueId: string, seasonNumber: number, gameWeek: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rules = await resolveRules(db, leagueId, seasonNumber);
  if (rules.ban_betting === 1) {
    return { ok: false, reason: "Grémium soutěže sázení zakázalo." };
  }

  // Zákaz uložený disciplinárně. Zrušená ('overturned') ani zneplatněná ('void')
  // sankce neplatí, takže úspěšné odvolání zákaz smaže samo.
  const ban = await db.prepare(
    `SELECT bet_ban_until_gw FROM competition_sanctions
      WHERE team_id = ? AND season_number = ? AND status IN ('issued','appealed')
        AND bet_ban_until_gw IS NOT NULL AND bet_ban_until_gw >= ?
      ORDER BY bet_ban_until_gw DESC LIMIT 1`
  ).bind(teamId, seasonNumber, gameWeek).first<{ bet_ban_until_gw: number }>()
    .catch((e) => { logger.warn({ module: M }, `zákaz sázení ${teamId}`, e); return null; });

  if (ban) {
    return { ok: false, reason: `Disciplinární rada ti zakázala sázet do ${ban.bet_ban_until_gw}. kola.` };
  }
  return { ok: true };
}

/**
 * Podá tiket.
 *
 * Pořadí kroků je závazné: nejdřív se ověří všechno, co může selhat bez následku,
 * pak teprve vznikne řádek a odejdou peníze.
 */
export async function placeTicket(db: D1Database, input: {
  teamId: string;
  stake: number;
  selections: SelectionInput[];
  gameDate: string;
}): Promise<PlaceResult> {
  const { teamId, stake, selections, gameDate } = input;

  if (!Number.isInteger(stake) || stake < MIN_STAKE) {
    return { ok: false, status: 400, error: `Nejnižší sázka je ${MIN_STAKE} Kč.` };
  }
  if (selections.length === 0) {
    return { ok: false, status: 400, error: "Tiket je prázdný." };
  }
  if (selections.length > MAX_SELECTIONS) {
    return { ok: false, status: 400, error: `Na tiket se vejde nejvýš ${MAX_SELECTIONS} tipů.` };
  }

  // Jeden zápas smí být na tiketu jen jednou. Vynucuje to i UNIQUE v databázi,
  // ale hezká hláška je lepší než chyba z SQL.
  const zapasy = new Set(selections.map((s) => s.matchId));
  if (zapasy.size !== selections.length) {
    return { ok: false, status: 400, error: "Z jednoho zápasu si můžeš vybrat jen jeden tip." };
  }

  // ── Vlastní zápas ────────────────────────────────────────────────────────
  // Musí se ověřit DŘÍV než kurzy: konflikt zájmů je závažnější než neshoda
  // kurzu a hráč si zaslouží vědět, co je skutečně špatně. Kontroluje se proti
  // všem týmům uživatele, aby to pokrylo i rezervu (U21 sdílí user_id).
  const moje = await vlastniTymy(db, teamId);
  const zapasyMoje = await db.prepare(
    `SELECT id, home_team_id, away_team_id FROM matches WHERE id IN (${[...zapasy].map(() => "?").join(",")})`
  ).bind(...zapasy).all<{ id: string; home_team_id: string; away_team_id: string }>()
    .catch((e) => { logger.error({ module: M }, "kontrola vlastního zápasu", e); return { results: [] }; });

  if (zapasyMoje.results.length !== zapasy.size) {
    return { ok: false, status: 409, error: "Některý zápas z tiketu už neexistuje." };
  }
  for (const m of zapasyMoje.results) {
    if (moje.has(m.home_team_id) || moje.has(m.away_team_id)) {
      return { ok: false, status: 400, error: "Na vlastní zápas se nesází. To by nebyl fotbal, ale domluva." };
    }
  }

  // ── Kurzy ze serveru. To, co poslal klient, se použije jen k porovnání. ──
  const ph = selections.map(() => "(match_id = ? AND market = ? AND selection = ?)").join(" OR ");
  const vazby = selections.flatMap((s) => [s.matchId, s.market, s.selection]);
  const kurzy = await db.prepare(
    `SELECT o.match_id, o.market, o.selection, o.odds_x100, o.label,
            o.calendar_id, o.league_id, o.season_number
       FROM bet_odds o WHERE ${ph}`
  ).bind(...vazby).all<OddsRow>()
    .catch((e) => { logger.error({ module: M }, "načtení kurzů pro tiket", e); return { results: [] }; });

  if (kurzy.results.length !== selections.length) {
    return { ok: false, status: 409, error: "Některý z tipů už kancelář nenabízí. Načti si lístek znovu." };
  }

  const mapa = new Map(kurzy.results.map((r) => [`${r.match_id}|${r.market}|${r.selection}`, r]));

  const zmeny: Array<{ matchId: string; market: string; selection: string; oldOddsX100: number; newOddsX100: number }> = [];
  for (const s of selections) {
    const r = mapa.get(`${s.matchId}|${s.market}|${s.selection}`)!;
    if (r.odds_x100 !== s.oddsX100) {
      zmeny.push({ matchId: s.matchId, market: s.market, selection: s.selection,
                   oldOddsX100: s.oddsX100, newOddsX100: r.odds_x100 });
    }
  }
  if (zmeny.length > 0) {
    return { ok: false, status: 409, error: "Kurz se mezitím změnil. Mrkni na lístek znovu.", changed: zmeny };
  }

  // ── Všechny tipy musí být z jednoho kola ────────────────────────────────
  const kola = new Set(kurzy.results.map((r) => r.calendar_id));
  if (kola.size !== 1) {
    return { ok: false, status: 400, error: "Na jeden tiket patří jen zápasy z téhož kola." };
  }
  const calendarId = [...kola][0];
  const { league_id: leagueId, season_number: seasonNumber } = kurzy.results[0];

  // ── Herní kolo a povolení sázet ──────────────────────────────────────────
  const kolo = await db.prepare(
    "SELECT game_week, status FROM season_calendar WHERE id = ?"
  ).bind(calendarId).first<{ game_week: number; status: string }>()
    .catch((e) => { logger.error({ module: M }, "stav kola", e); return null; });

  if (!kolo) return { ok: false, status: 409, error: "Kolo nenalezeno." };
  if (kolo.status !== "scheduled") {
    return { ok: false, status: 409, error: "Sázky na tohle kolo jsou uzavřené — kolo se právě hraje." };
  }

  const povoleno = await canBet(db, teamId, leagueId, seasonNumber, kolo.game_week);
  if (!povoleno.ok) return { ok: false, status: 403, error: povoleno.reason };

  // ── Limity ───────────────────────────────────────────────────────────────
  const limity = await limitsFor(db, leagueId, seasonNumber);
  if (stake > limity.maxStake) {
    return { ok: false, status: 400, error: `Nejvyšší sázka na tiket je ${limity.maxStake.toLocaleString("cs")} Kč.` };
  }

  const uzPodano = await db.prepare(
    `SELECT COUNT(*) AS n FROM bet_tickets
      WHERE team_id = ? AND calendar_id = ? AND status <> 'void'`
  ).bind(teamId, calendarId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet tiketů v kole", e); return null; });

  if ((uzPodano?.n ?? 0) >= limity.ticketsPerRound) {
    return { ok: false, status: 409, error: `Na jedno kolo smíš podat nejvýš ${limity.ticketsPerRound} tikety.` };
  }

  // ── Peníze ───────────────────────────────────────────────────────────────
  const levy = Math.round((stake * limity.levyPct) / 100);
  const celkem = stake + levy;

  const muze = await assertPurchaseAllowed(db, teamId, celkem);
  if (!muze.ok) return { ok: false, status: 400, error: muze.reason };

  const totalOdds = combineOddsX100(selections.map((s) => mapa.get(`${s.matchId}|${s.market}|${s.selection}`)!.odds_x100));
  const { payout, capped } = capPayout(stake, totalOdds, limity.maxPayout);
  const ticketId = crypto.randomUUID();

  // Podmíněný INSERT — mezi kontrolou stavu kola a zápisem mohl match tick kolo
  // zamknout. Stejný vzor jako atomický lock kola v season/league-round.ts.
  const ins = await db.prepare(
    `INSERT INTO bet_tickets
       (id, team_id, league_id, season_number, calendar_id, stake, levy,
        total_odds_x100, potential_payout, capped, status, placed_game_date)
     SELECT ?,?,?,?,?,?,?,?,?,?,'pending',?
      WHERE EXISTS (SELECT 1 FROM season_calendar WHERE id = ? AND status = 'scheduled')`
  ).bind(
    ticketId, teamId, leagueId, seasonNumber, calendarId, stake, levy,
    totalOdds, payout, capped ? 1 : 0, gameDate, calendarId,
  ).run().catch((e) => { logger.error({ module: M }, "zápis tiketu", e); return null; });

  if (!ins || (ins.meta?.changes ?? 0) === 0) {
    return { ok: false, status: 409, error: "Sázky na tohle kolo jsou uzavřené — kolo se právě hraje." };
  }

  const legs = selections.map((s) => {
    const r = mapa.get(`${s.matchId}|${s.market}|${s.selection}`)!;
    return db.prepare(
      `INSERT INTO bet_selections (id, ticket_id, match_id, market, selection, odds_x100, label)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(crypto.randomUUID(), ticketId, r.match_id, r.market, r.selection, r.odds_x100, r.label);
  });

  try {
    await db.batch(legs);
  } catch (e) {
    logger.error({ module: M }, `zápis tipů tiketu ${ticketId}`, e);
    await db.prepare("DELETE FROM bet_tickets WHERE id = ? AND status = 'pending'").bind(ticketId).run()
      .catch((err) => logger.error({ module: M }, `úklid tiketu ${ticketId}`, err));
    return { ok: false, status: 500, error: "Tiket se nepodařilo uložit. Zkus to znovu." };
  }

  await recordTransaction(db, teamId, "bet_stake", -stake,
    `Sázka u kanceláře (${(totalOdds / 100).toFixed(2).replace(".", ",")}×)`, gameDate, `bet-stake-${ticketId}`);

  if (levy > 0) {
    // Nejdřív ubrat klubu, pak připsat pokladně — pořadí je v projektu zvyk.
    await recordTransaction(db, teamId, "bet_levy", -levy,
      "Odvod ze sázky do pokladny soutěže", gameDate, `bet-levy-${ticketId}`);
    await recordCompetitionEntry(db, {
      leagueId, seasonNumber, type: "levy_bet", amount: levy,
      description: "Odvod ze sázky", teamId, gameDate, referenceId: `bet-levy-${ticketId}`,
    });
  }

  // Teprve teď je tiket zaplacený a smí se vyhodnocovat.
  await db.prepare("UPDATE bet_tickets SET status = 'open' WHERE id = ? AND status = 'pending'")
    .bind(ticketId).run()
    .catch((e) => logger.error({ module: M }, `aktivace tiketu ${ticketId}`, e));

  return { ok: true, ticketId, totalOddsX100: totalOdds, payout, capped, levy };
}
