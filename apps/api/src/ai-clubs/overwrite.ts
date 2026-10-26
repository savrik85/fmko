/**
 * Nová registrace přepíše AI klub (spec 3.9).
 *
 * Nový hráč dostane místo AI klubu v nejvyšší lize okresu, kde ještě AI kluby jsou. Zůstává jen
 * místo v lize: id týmu, odehrané zápasy, tabulka a místo v poháru. Všechno ostatní z AI klubu
 * zmizí, aby si hráč všechno rozjel podle sebe: hráči (i jejich statistiky, vztahy, zranění),
 * zaměstnanci (vrací se do poolu), sponzoři, rozjednané přestupy a nabídky, inzeráty, poptávky,
 * přáteláky, deník AI trenéra, incidenty v klubu, stadion a vybavení (založí se nové).
 *
 * Peníze se nikomu nestrhnou ani nepřipíšou: rozjednané přestupy se stáhnou, splátky a procenta
 * z přestupů s AI klubem propadnou, složené sázky přáteláků se vrátí. Hráč, kterého si mezitím
 * koupil jiný klub, už AI klubu nepatří a zůstane, kde je. Hráč na hostování v AI klubu se vrací
 * domů, hráč AI klubu na hostování jinde jde mezi volné hráče.
 *
 * Kterou přednost má který AI klub: původní AI klub dřív než převzatý lidský. Převzatý klub smí
 * nová registrace přepsat, až když je jeho bývalý vlastník 90 dní neaktivní, do té doby se k němu
 * může vrátit (ai-clubs/reclaim.ts). Stejné pravidlo počítá i výběr ligy (league/district-leagues.ts).
 */

import type { PushEnv } from "../community/web-push";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { STAFF_LISTED_WEEKS } from "../staff/staff-generator";
import { removePlayer } from "../transfers/remove-player";
import { overwritableAiTeamSql } from "./owner-activity";

const M = "ai-club-overwrite";
const SMS_ROLE = "Sportovní ředitel";

/**
 * AI klub ligy, který převezme nová registrace, nebo null. Přednost má původní AI klub
 * (`ai_former_user_id IS NULL`), mezi rovnými rozhoduje los.
 */
export async function pickOverwritableAiTeam(db: D1Database, leagueId: string, now: Date): Promise<string | null> {
  const filter = await overwritableAiTeamSql(db, "t", now);
  const row = await db.prepare(
    `SELECT t.id FROM teams t
      WHERE t.league_id = ? AND ${filter.sql}
      ORDER BY CASE WHEN t.ai_former_user_id IS NULL THEN 0 ELSE 1 END, RANDOM()
      LIMIT 1`,
  ).bind(leagueId, filter.bind).first<{ id: string }>();
  return row?.id ?? null;
}

export interface OverwriteSummary {
  playersDeleted: number;
  loansReturned: number;
  loansReleased: number;
  staffReleased: number;
  offersWithdrawn: number;
  friendliesCancelled: number;
}

interface OverwriteOpts {
  /** Jméno AI klubu před přepsáním (do zpráv lidským klubům, kterých se to týká). */
  previousName: string;
  now: Date;
  push?: PushEnv | null;
}

/** Spustí příkaz, chybu zaloguje a vrátí počet změněných řádků (0 při chybě). */
async function runStatement(db: D1Database, label: string, sql: string, ...binds: unknown[]): Promise<number> {
  const res = await db.prepare(sql).bind(...binds).run()
    .catch((e) => { logger.warn({ module: M }, label, e); return null; });
  return res?.meta?.changes ?? 0;
}

/** SMS lidskému klubu (u U21 jeho áčku, schránku má klub). AI klubu se nepíše. */
async function smsHuman(db: D1Database, teamId: string, body: string): Promise<void> {
  const club = await db.prepare(
    "SELECT club.id, club.user_id FROM teams t JOIN teams club ON club.id = COALESCE(t.parent_team_id, t.id) WHERE t.id = ?",
  ).bind(teamId).first<{ id: string; user_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "majitel klubu pro zprávu", e); return null; });
  if (!club?.user_id || club.user_id === "ai") return;
  await sendSystemSMS(db, club.id, SMS_ROLE, body)
    .catch((e) => logger.warn({ module: M }, "zpráva klubu o přepsaném AI klubu", e));
}

/** Hostování v obou směrech: cizí hráč jde domů, hráč AI klubu mezi volné hráče. */
async function settleLoans(db: D1Database, teamId: string, opts: OverwriteOpts, summary: OverwriteSummary): Promise<void> {
  const nowIso = opts.now.toISOString();

  const loanedIn = await db.prepare(
    "SELECT id, first_name, last_name, loan_from_team_id FROM players WHERE team_id = ? AND loan_from_team_id IS NOT NULL AND loan_from_team_id <> ?",
  ).bind(teamId, teamId).all<{ id: string; first_name: string; last_name: string; loan_from_team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "hostující hráči AI klubu", e); return { results: [] as Array<{ id: string; first_name: string; last_name: string; loan_from_team_id: string }> }; });
  for (const p of loanedIn.results) {
    const ok = await db.batch([
      db.prepare("UPDATE player_contracts SET is_active = 0, left_at = ?, leave_type = 'loan_end' WHERE player_id = ? AND team_id = ? AND join_type = 'loan' AND is_active = 1")
        .bind(nowIso, p.id, teamId),
      db.prepare("UPDATE players SET team_id = loan_from_team_id, loan_from_team_id = NULL, loan_until = NULL WHERE id = ? AND team_id = ?")
        .bind(p.id, teamId),
    ]).then(() => true).catch((e) => { logger.warn({ module: M }, `návrat hostujícího hráče ${p.id}`, e); return false; });
    if (!ok) continue;
    summary.loansReturned++;
    await smsHuman(db, p.loan_from_team_id,
      `↩️ ${p.first_name} ${p.last_name} se vrátil z hostování. Klub ${opts.previousName} převzal nový trenér a hostování skončilo.`);
  }

  const loanedOut = await db.prepare(
    "SELECT id, first_name, last_name, team_id FROM players WHERE loan_from_team_id = ? AND team_id <> ?",
  ).bind(teamId, teamId).all<{ id: string; first_name: string; last_name: string; team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "hráči AI klubu na hostování", e); return { results: [] as Array<{ id: string; first_name: string; last_name: string; team_id: string }> }; });
  for (const p of loanedOut.results) {
    const removed = await removePlayer(db, p.id, "released", { toFreeAgent: true, teamId: p.team_id })
      .catch((e) => { logger.warn({ module: M }, `uvolnění hráče AI klubu z hostování ${p.id}`, e); return null; });
    if (!removed?.ok) continue;
    await runStatement(db, "smlouva hráče z hostování", "DELETE FROM player_contracts WHERE player_id = ? AND team_id = ?", p.id, teamId);
    summary.loansReleased++;
    await smsHuman(db, p.team_id,
      `⚠️ ${p.first_name} ${p.last_name} u vás dál hostovat nebude. Klub ${opts.previousName}, kterému patřil, převzal nový trenér a hráč je teď mezi volnými hráči.`);
  }
}

/** Hráči, kteří AI klubu patří a jsou u něj (ne cizí hráči na hostování). */
const OWN_PLAYERS = "SELECT id FROM players WHERE team_id = ?1 AND loan_from_team_id IS NULL";

/** Smaže hráče AI klubu i se vším, co na ně ukazuje. Pořadí drží cizí klíče na players(id). */
async function deleteOwnPlayers(db: D1Database, teamId: string, nowIso: string): Promise<number> {
  const steps: Array<[string, string]> = [
    ["kapitán", `UPDATE teams SET captain_id = NULL WHERE captain_id IN (${OWN_PLAYERS})`],
    ["exekutor penalt", `UPDATE teams SET penalty_taker_id = NULL WHERE penalty_taker_id IN (${OWN_PLAYERS})`],
    ["exekutor standardek", `UPDATE teams SET freekick_taker_id = NULL WHERE freekick_taker_id IN (${OWN_PLAYERS})`],
    ["hráči nabídnutí k výměně",
      `UPDATE transfer_offers SET status = CASE WHEN status IN ('pending','countered') THEN 'withdrawn' ELSE status END, offered_player_id = NULL
        WHERE offered_player_id IN (${OWN_PLAYERS})`],
    ["nabídky na hráče",
      `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = ?2
        WHERE status IN ('pending','countered')
          AND (player_id IN (${OWN_PLAYERS}) OR id IN (SELECT offer_id FROM transfer_offer_swap_players WHERE player_id IN (${OWN_PLAYERS})))`],
    ["inzeráty hráčů", `UPDATE transfer_listings SET status = 'withdrawn' WHERE status = 'active' AND player_id IN (${OWN_PLAYERS})`],
    ["procenta z přestupu hráčů", `UPDATE sell_on_clauses SET status = 'lapsed', resolved_at = ?2 WHERE status = 'active' AND player_id IN (${OWN_PLAYERS})`],
    ["vztahy", `DELETE FROM relationships WHERE player_a_id IN (${OWN_PLAYERS}) OR player_b_id IN (${OWN_PLAYERS})`],
    ["zranění", `DELETE FROM injuries WHERE player_id IN (${OWN_PLAYERS})`],
    ["sezónní statistiky", `DELETE FROM player_stats WHERE player_id IN (${OWN_PLAYERS})`],
    ["zápasové statistiky", `DELETE FROM match_player_stats WHERE player_id IN (${OWN_PLAYERS})`],
    ["tréninkový deník", `DELETE FROM training_log WHERE player_id IN (${OWN_PLAYERS})`],
    ["deník váhy", `DELETE FROM weight_log WHERE player_id IN (${OWN_PLAYERS})`],
    ["deník kondice", `DELETE FROM condition_log WHERE player_id IN (${OWN_PLAYERS})`],
    ["sledování hráčů", `DELETE FROM player_watchlist WHERE player_id IN (${OWN_PLAYERS})`],
    ["smlouvy hráčů", `DELETE FROM player_contracts WHERE player_id IN (${OWN_PLAYERS})`],
    ["hráč zápasu", `UPDATE matches SET mom_player_id = NULL WHERE mom_player_id IN (${OWN_PLAYERS})`],
    ["hráči nabídnutí k poptávkám", `DELETE FROM transfer_demand_pitches WHERE player_id IN (${OWN_PLAYERS})`],
    ["sliby hráčům", `DELETE FROM player_promises WHERE player_id IN (${OWN_PLAYERS})`],
  ];
  for (const [label, sql] of steps) {
    // ?2 jen tam, kde ho příkaz čte; nadbytečný parametr D1 odmítne, proto se váže podle potřeby.
    if (sql.includes("?2")) await runStatement(db, label, sql, teamId, nowIso);
    else await runStatement(db, label, sql, teamId);
  }
  const deleted = await db.prepare("DELETE FROM players WHERE team_id = ? AND loan_from_team_id IS NULL").bind(teamId).run()
    .catch((e) => { logger.error({ module: M, teamId }, "smazání hráčů přepsaného AI klubu", e); return null; });
  return deleted?.meta?.changes ?? 0;
}

/** Domluvené a čekající přáteláky AI klubu: zrušit, sázky vrátit, lidskému soupeři napsat. */
async function cancelFriendlies(db: D1Database, teamId: string, opts: OverwriteOpts): Promise<number> {
  const reason = `Klub ${opts.previousName} převzal nový trenér.`;
  const nowIso = opts.now.toISOString();
  const accepted = await db.prepare(
    `SELECT c.id, c.challenger_team_id, c.challenged_team_id, c.stake, c.stake_status, c.match_id
       FROM challenges c JOIN matches m ON m.id = c.match_id
      WHERE c.status = 'accepted' AND ?1 IN (c.challenger_team_id, c.challenged_team_id)
        AND m.status IN ('scheduled', 'lineups_open')`,
  ).bind(teamId).all<{ id: string; challenger_team_id: string; challenged_team_id: string; stake: number | null; stake_status: string | null; match_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "domluvené přáteláky AI klubu", e); return { results: [] as Array<{ id: string; challenger_team_id: string; challenged_team_id: string; stake: number | null; stake_status: string | null; match_id: string }> }; });

  let cancelled = 0;
  for (const ch of accepted.results) {
    const opponentId = ch.challenger_team_id === teamId ? ch.challenged_team_id : ch.challenger_team_id;
    // Složená sázka se vrátí jen soupeři. Podíl AI klubu by připadl novému majiteli týmu.
    if (ch.stake && ch.stake_status === "held") {
      const claimed = await db.prepare("UPDATE challenges SET stake_status = 'refunded' WHERE id = ? AND stake_status = 'held' RETURNING id")
        .bind(ch.id).first<{ id: string }>()
        .catch((e) => { logger.warn({ module: M }, `zabrání sázky přáteláku ${ch.id}`, e); return null; });
      if (claimed) {
        await recordTransaction(db, opponentId, "friendly_stake_payout", ch.stake,
          `Vrácená sázka, přátelák s ${opts.previousName} se nehrál`, nowIso, ch.id)
          .catch((e) => logger.warn({ module: M }, `vrácení sázky přáteláku ${ch.id}`, e));
      }
    }
    const ok = await db.batch([
      db.prepare(`UPDATE challenges SET status = 'expired', cancel_reason = ?, match_id = NULL, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
        .bind(reason, ch.id),
      db.prepare("DELETE FROM lineups WHERE calendar_id = ?").bind(ch.match_id),
      db.prepare("DELETE FROM matches WHERE id = ? AND status IN ('scheduled', 'lineups_open')").bind(ch.match_id),
    ]).then(() => true).catch((e) => { logger.warn({ module: M }, `zrušení přáteláku ${ch.id}`, e); return false; });
    if (!ok) continue;
    cancelled++;
    await smsHuman(db, opponentId,
      `↩️ Přátelák s ${opts.previousName} se nehraje: klub převzal nový trenér.${ch.stake && ch.stake_status === "held" ? " Sázka se vrátila." : ""}`);
  }

  cancelled += await runStatement(db, "čekající výzvy",
    `UPDATE challenges SET status = 'expired', cancel_reason = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE status = 'pending' AND ? IN (challenger_team_id, challenged_team_id)`, reason, teamId);
  await runStatement(db, "nabídky termínů",
    "UPDATE friendly_offers SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE status = 'open' AND team_id = ?", teamId);
  return cancelled;
}

/**
 * Smaže všechno, co AI klubu patřilo, kromě místa v lize (řádek týmu, zápasy, tabulka, pohár).
 * Volá se při nové registraci PŘED přesunem nových hráčů a trenéra do týmu. Trenéra
 * AI klubu maže routa (smaže všechny trenéry týmu a připojí nového).
 */
export async function wipeAiClubForNewcomer(db: D1Database, teamId: string, opts: OverwriteOpts): Promise<OverwriteSummary> {
  const summary: OverwriteSummary = {
    playersDeleted: 0, loansReturned: 0, loansReleased: 0, staffReleased: 0, offersWithdrawn: 0, friendliesCancelled: 0,
  };
  const nowIso = opts.now.toISOString();

  // ── Hráči ──
  await settleLoans(db, teamId, opts, summary);
  summary.playersDeleted = await deleteOwnPlayers(db, teamId, nowIso);

  // ── Přestupy: nikomu se nic nestrhne ani nepřipíše ──
  summary.offersWithdrawn = await runStatement(db, "rozjednané přestupy",
    `UPDATE transfer_offers SET status = 'withdrawn', resolved_at = ?
      WHERE status IN ('pending','countered') AND ? IN (from_team_id, to_team_id)`, nowIso, teamId);
  await runStatement(db, "příhozy", `UPDATE transfer_bids SET status = 'withdrawn'
      WHERE status = 'pending' AND (team_id = ? OR listing_id IN (SELECT id FROM transfer_listings WHERE team_id = ?))`, teamId, teamId);
  await runStatement(db, "inzeráty", "UPDATE transfer_listings SET status = 'withdrawn' WHERE status = 'active' AND team_id = ?", teamId);
  await runStatement(db, "poptávky", "UPDATE transfer_demands SET status = 'withdrawn' WHERE status = 'active' AND team_id = ?", teamId);
  // Místní hráči nabídnutí AI klubu (hospodský, starosta…) nový klub nezdědí.
  await runStatement(db, "nabídky místních hráčů", "UPDATE player_offers SET status = 'expired' WHERE status = 'pending' AND team_id = ?", teamId);
  await runStatement(db, "nabídnutí k poptávkám", "DELETE FROM transfer_demand_pitches WHERE team_id = ?", teamId);
  await runStatement(db, "splátky", `UPDATE transfer_installments SET status = 'settled', closed_at = ?
      WHERE status = 'active' AND ? IN (buyer_team_id, seller_team_id)`, nowIso, teamId);
  await runStatement(db, "procenta z přestupů", `UPDATE sell_on_clauses SET status = 'lapsed', resolved_at = ?
      WHERE status = 'active' AND ? IN (beneficiary_team_id, owner_team_id)`, nowIso, teamId);
  await runStatement(db, "události jednání s cizími kluby",
    "DELETE FROM ai_negotiation_events WHERE negotiation_id IN (SELECT id FROM ai_negotiations WHERE team_id = ?)", teamId);
  await runStatement(db, "jednání s cizími kluby", "DELETE FROM ai_negotiations WHERE team_id = ?", teamId);
  await runStatement(db, "sledovaní hráči", "DELETE FROM player_watchlist WHERE team_id = ?", teamId);

  // ── Přáteláky ──
  summary.friendliesCancelled = await cancelFriendlies(db, teamId, opts);

  // ── Zaměstnanci zpět do poolu, jejich úkoly končí bez vracení peněz ──
  await runStatement(db, "úkoly zaměstnanců", "DELETE FROM staff_tasks WHERE team_id = ?", teamId);
  await runStatement(db, "hlášení skautů", "DELETE FROM scout_reports WHERE team_id = ?", teamId);
  await runStatement(db, "úkoly skautů", "DELETE FROM scout_assignments WHERE team_id = ?", teamId);
  const listedUntil = new Date(opts.now.getTime() + STAFF_LISTED_WEEKS * 7 * 86_400_000).toISOString();
  summary.staffReleased = await runStatement(db, "zaměstnanci zpět do poolu",
    `UPDATE staff_members SET team_id = NULL, role = NULL, hired_at = NULL, listed_until = ?,
            course_attribute = NULL, course_points = NULL, course_weeks_remaining = NULL, task_cooldown_until = NULL
      WHERE team_id = ?`, listedUntil, teamId);

  // ── Sponzoři: sliby a jednání dřív než smlouvy (cizí klíč sponsor_promises → sponsor_contracts) ──
  await runStatement(db, "sliby sponzorům",
    "DELETE FROM sponsor_promises WHERE team_id = ? OR contract_id IN (SELECT id FROM sponsor_contracts WHERE team_id = ?)", teamId, teamId);
  await runStatement(db, "jednání se sponzory", "DELETE FROM sponsor_negotiations WHERE team_id = ?", teamId);
  // sponsor_favor_log před sponsor_team_favor — deník popisuje změny náklonnosti.
  for (const table of ["sponsor_requests", "sponsor_owner_sms", "sponsor_favor_log", "sponsor_team_favor", "sponsor_invitations", "sponsor_pub_encounters", "sponsor_contracts"]) {
    await runStatement(db, table, `DELETE FROM ${table} WHERE team_id = ?`, teamId);
  }

  // ── Deník a nároky AI trenéra ──
  await runStatement(db, "deník AI trenéra", "DELETE FROM ai_coach_decisions WHERE team_id = ?", teamId);
  await runStatement(db, "nároky AI trenéra", "DELETE FROM ai_coach_claims WHERE team_id = ?", teamId);

  // ── Incidenty AI klubu (krádeže, škody, situace hráčů): nový klub je nezdědí ──
  // Id týmu zůstává, bez úklidu by nový trenér viděl otevřené případy hráčů, kteří už nejsou.
  for (const table of ["club_incident_absences", "club_incident_knowledge", "club_incident_clues", "club_incidents"]) {
    await runStatement(db, table, `DELETE FROM ${table} WHERE team_id = ?`, teamId);
  }

  // ── Stadion, vybavení, sestavy: nový klub začíná od nuly ──
  await runStatement(db, "inzeráty vybavení",
    "UPDATE equipment_listings SET status = 'withdrawn', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE status = 'active' AND team_id = ?", teamId);
  for (const table of ["equipment", "stadium_extensions", "stadium_damage", "stadiums", "lineup_presets"]) {
    await runStatement(db, table, `DELETE FROM ${table} WHERE team_id = ?`, teamId);
  }
  // Odehrané sestavy drží zápasy (cizí klíč), ty zůstávají. Čekající sestavy s hráči AI pryč.
  await runStatement(db, "sestavy",
    `DELETE FROM lineups WHERE team_id = ?
        AND id NOT IN (SELECT home_lineup_id FROM matches WHERE home_lineup_id IS NOT NULL)
        AND id NOT IN (SELECT away_lineup_id FROM matches WHERE away_lineup_id IS NOT NULL)`, teamId);
  await runStatement(db, "kampaně fanoušků", `UPDATE fan_campaigns SET status = 'vyresena', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE team_id = ? AND status IN ('sbira','splnena')`, teamId);

  // ── Telefon, notifikace a zařízení: u převzatého lidského klubu patřily bývalému vlastníkovi ──
  await runStatement(db, "odložené zprávy hráčů", "DELETE FROM player_follow_ups WHERE team_id = ?", teamId);
  await runStatement(db, "zprávy", "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ?)", teamId);
  for (const table of ["conversations", "notifications", "push_subscriptions", "notification_preferences", "player_promises"]) {
    await runStatement(db, table, `DELETE FROM ${table} WHERE team_id = ?`, teamId);
  }

  // ── Trenér, peníze, nastavení ──
  await runStatement(db, "deník vlastností trenéra", "DELETE FROM manager_attr_log WHERE team_id = ?", teamId);
  await runStatement(db, "trenérské kurzy", "DELETE FROM coach_exam_attempts WHERE team_id = ?", teamId);
  await runStatement(db, "trenérské kurzy", "DELETE FROM coach_courses WHERE team_id = ?", teamId);
  await runStatement(db, "půjčky", "UPDATE cash_loans SET status = 'defaulted' WHERE status = 'active' AND team_id = ?", teamId);
  await runStatement(db, "transakce", "DELETE FROM transactions WHERE team_id = ?", teamId);
  await runStatement(db, "příznak AI klubu",
    `UPDATE teams SET ai_since = NULL, ai_former_user_id = NULL, sleeve_sponsor_id = NULL,
            captain_id = NULL, penalty_taker_id = NULL, freekick_taker_id = NULL
      WHERE id = ?`, teamId);
  await runStatement(db, "nastavení klubu",
    `UPDATE teams SET training_type = 'conditioning', training_approach = 'balanced', training_sessions = 2,
            training_plan = NULL, last_training_at = NULL, last_training_result = NULL,
            training_attendance = '{}', formation_familiarity = '{}', tactic_familiarity = '{}',
            youth_investment = 'none', youth_paid_base = 0, youth_paid_weeks = 0
      WHERE id = ?`, teamId);
  // Zvlášť: sloupec training_days je na produkci (přidaný ručně), v migracích chybí.
  await runStatement(db, "tréninkové dny", "UPDATE teams SET training_days = NULL WHERE id = ?", teamId);

  logger.info({ module: M, teamId }, `AI klub přepsán: ${JSON.stringify(summary)}`);
  return summary;
}
