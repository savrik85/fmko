/**
 * Čekající liga: nižší soutěž okresu (IV. třída Prachatice) založená do zásoby pro případ,
 * že se do okresu bude chtít někdo přihlásit. Dokud do ní registrace nepošle prvního člověka,
 * je zavřená (`leagues.waiting = 1`, áčko i U21):
 *  - nehraje (nemá rozpis),
 *  - AI trenér jejích klubů nic nedělá (trh, přáteláky, odpovědi na nabídky),
 *  - trh, vyhledávání hráčů, nabídky ani přáteláky ji nevidí.
 * První registrace do okresu, která na ni dojde, převezme AI klub a ligu otevře
 * (`startWaitingLeague` shodí `waiting` a dá rozpis). Sloupec místo stavu ligy: `status` má
 * v D1 CHECK jen na `active`/`finished` a změna by znamenala přestavět tabulku lig.
 *
 * Do 2026-11-17 čekala jen bez rozpisu a jinak žila: AI kluby IV. třídy nakupovaly od lidí,
 * domlouvaly přáteláky a psalo se o nich ve Zpravodaji.
 */

import { cancelAiClubFriendlies } from "../ai-clubs/overwrite";
import { logger } from "../lib/logger";

const M = "waiting-league";

/** Hraje klub (áčko i U21) v zavřené čekající lize? */
export async function isTeamInWaitingLeague(db: D1Database, teamId: string): Promise<boolean> {
  const row = await db.prepare(
    "SELECT 1 AS x FROM teams t JOIN leagues l ON l.id = t.league_id WHERE t.id = ? AND l.waiting = 1",
  ).bind(teamId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "liga klubu", e); return null; });
  return !!row;
}

export const WAITING_TEAM_ERROR = "Tenhle klub zatím nehraje, jeho soutěž čeká na první přihlášku.";

export interface CloseWaitingLeagueResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  leagueIds: string[];
  listingsWithdrawn: number;
  offersWithdrawn: number;
  demandsWithdrawn: number;
  friendlyOffersWithdrawn: number;
  challengesDeclined: number;
  /** Domluvené přáteláky: zruší se, sázka se vrátí, lidský soupeř dostane SMS. */
  friendliesCancelled: string[];
  /** Co už s lidmi proběhlo a zavření to nevrací: dokončené přestupy. */
  keptWithHumans: string[];
}

/**
 * Zavře čekající ligu (a její U21): stav `waiting` a stažení všeho, co její AI kluby
 * rozjely na trhu a u přáteláků. Liga nesmí mít člověka ani rozpis v aktivní sezóně.
 */
export async function closeWaitingLeague(
  db: D1Database, leagueId: string, opts: { dryRun: boolean; now?: Date },
): Promise<CloseWaitingLeagueResult> {
  const { dryRun } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const empty = { leagueIds: [], listingsWithdrawn: 0, offersWithdrawn: 0, demandsWithdrawn: 0, friendlyOffersWithdrawn: 0, challengesDeclined: 0, friendliesCancelled: [], keptWithHumans: [] };
  const stop = (reason: string): CloseWaitingLeagueResult => ({ ok: false, reason, dryRun, ...empty });

  const league = await db.prepare("SELECT id, name, COALESCE(league_type, 'senior') AS league_type, status FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ id: string; name: string; league_type: string; status: string }>();
  if (!league) return stop("Soutěž nenalezena.");
  if (league.league_type !== "senior") return stop("Zadej seniorskou soutěž, U21 se zavře s ní.");
  const u21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' LIMIT 1")
    .bind(leagueId).first<{ id: string }>();
  const leagueIds = u21 ? [leagueId, u21.id] : [leagueId];
  const marks = leagueIds.map(() => "?").join(",");

  const humans = await db.prepare(
    `SELECT COUNT(*) AS n FROM teams WHERE league_id IN (${marks}) AND user_id IS NOT NULL AND user_id != 'ai'`,
  ).bind(...leagueIds).first<{ n: number }>();
  if ((humans?.n ?? 0) > 0) return stop(`${league.name} už má lidský klub, zavřít ji nejde.`);
  const calendar = await db.prepare(
    `SELECT COUNT(*) AS n FROM season_calendar WHERE league_id IN (${marks})
        AND season_number = (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)`,
  ).bind(...leagueIds).first<{ n: number }>();
  if ((calendar?.n ?? 0) > 0) return stop(`${league.name} má rozpis, nejdřív ho zruš.`);

  const teamsSql = `SELECT id FROM teams WHERE league_id IN (${marks})`;
  const count = async (sql: string) => (await db.prepare(sql).bind(...leagueIds).first<{ n: number }>())?.n ?? 0;
  const result: CloseWaitingLeagueResult = {
    ok: true, dryRun, leagueIds,
    listingsWithdrawn: await count(`SELECT COUNT(*) AS n FROM transfer_listings WHERE status = 'active' AND team_id IN (${teamsSql})`),
    offersWithdrawn: 0,
    demandsWithdrawn: await count(`SELECT COUNT(*) AS n FROM transfer_demands WHERE status = 'active' AND team_id IN (${teamsSql})`),
    friendlyOffersWithdrawn: await count(`SELECT COUNT(*) AS n FROM friendly_offers WHERE status = 'open' AND team_id IN (${teamsSql})`),
    challengesDeclined: 0,
    friendliesCancelled: [],
    keptWithHumans: [],
  };
  // Nabídky v obou směrech: dva výskyty seznamu týmů, každý se svými parametry.
  result.offersWithdrawn = (await db.prepare(
    `SELECT COUNT(*) AS n FROM transfer_offers WHERE status IN ('pending', 'countered')
        AND (from_team_id IN (${teamsSql}) OR to_team_id IN (${teamsSql}))`,
  ).bind(...leagueIds, ...leagueIds).first<{ n: number }>())?.n ?? 0;
  result.challengesDeclined = (await db.prepare(
    `SELECT COUNT(*) AS n FROM challenges WHERE status = 'pending'
        AND (challenger_team_id IN (${teamsSql}) OR challenged_team_id IN (${teamsSql}))`,
  ).bind(...leagueIds, ...leagueIds).first<{ n: number }>())?.n ?? 0;

  const accepted = await db.prepare(
    `SELECT c.match_date, ct.name AS challenger, dt.name AS challenged
       FROM challenges c JOIN teams ct ON ct.id = c.challenger_team_id JOIN teams dt ON dt.id = c.challenged_team_id
      WHERE c.status = 'accepted' AND (c.challenger_team_id IN (${teamsSql}) OR c.challenged_team_id IN (${teamsSql}))`,
  ).bind(...leagueIds, ...leagueIds).all<{ match_date: string | null; challenger: string; challenged: string }>()
    .catch((e) => { logger.warn({ module: M }, "domluvené přáteláky", e); return { results: [] }; });
  for (const a of accepted.results) result.friendliesCancelled.push(`${a.challenger} – ${a.challenged} (${a.match_date ?? "?"})`);
  const sold = await db.prepare(
    `SELECT o.offer_amount, f.name AS buyer, tt.name AS seller, p.first_name || ' ' || p.last_name AS player
       FROM transfer_offers o JOIN teams f ON f.id = o.from_team_id JOIN teams tt ON tt.id = o.to_team_id
       LEFT JOIN players p ON p.id = o.player_id
      WHERE o.status = 'accepted' AND (o.from_team_id IN (${teamsSql}) OR o.to_team_id IN (${teamsSql}))`,
  ).bind(...leagueIds, ...leagueIds).all<{ offer_amount: number; buyer: string; seller: string; player: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "dokončené přestupy", e); return { results: [] }; });
  for (const s of sold.results) result.keptWithHumans.push(`přestup ${s.player ?? "?"}: ${s.seller} → ${s.buyer} za ${s.offer_amount} Kč`);

  if (dryRun) return result;

  await db.batch([
    db.prepare(`UPDATE leagues SET waiting = 1 WHERE id IN (${marks})`).bind(...leagueIds),
    db.prepare(`UPDATE transfer_listings SET status = 'withdrawn' WHERE status = 'active' AND team_id IN (${teamsSql})`).bind(...leagueIds),
    db.prepare(
      `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = ? WHERE status IN ('pending', 'countered')
          AND (from_team_id IN (${teamsSql}) OR to_team_id IN (${teamsSql}))`,
    ).bind(now, ...leagueIds, ...leagueIds),
    db.prepare(`UPDATE transfer_demands SET status = 'withdrawn' WHERE status = 'active' AND team_id IN (${teamsSql})`).bind(...leagueIds),
    db.prepare(`UPDATE friendly_offers SET status = 'withdrawn' WHERE status = 'open' AND team_id IN (${teamsSql})`).bind(...leagueIds),
    db.prepare(
      `UPDATE challenges SET status = 'declined' WHERE status = 'pending'
          AND (challenger_team_id IN (${teamsSql}) OR challenged_team_id IN (${teamsSql}))`,
    ).bind(...leagueIds, ...leagueIds),
  ]);
  // Domluvené přáteláky AI klubů zavřené ligy: zrušit, sázku vrátit, lidskému soupeři SMS.
  const clubs = await db.prepare(`SELECT id, name FROM teams WHERE league_id IN (${marks})`).bind(...leagueIds)
    .all<{ id: string; name: string }>();
  for (const club of clubs.results) {
    await cancelAiClubFriendlies(db, club.id, {
      clubName: club.name,
      reason: `${league.name} se zatím nehraje, klub ${club.name} čeká na otevření soutěže.`,
      smsReason: "jeho soutěž se zatím nehraje",
    }, opts.now ?? new Date());
  }
  logger.info({ module: M }, `${league.name} zavřena do první přihlášky`);
  return result;
}
