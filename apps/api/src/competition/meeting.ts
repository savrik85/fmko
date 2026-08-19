/**
 * Týdenní schůze vedení soutěže.
 *
 * Běží ve středu z denního ticku. Středa je jediný den bez kolize: liga hraje
 * pondělí a čtvrtek, pohár v sobotu, vesnický týdenní cyklus v pondělí a delegace
 * rozhodčích ve středu míří na pátek, kde se nehraje.
 *
 * IDEMPOTENCE je dvouvrstvá:
 *   1) claim celé schůze — INSERT OR IGNORE nad UNIQUE(league_id, game_date)
 *   2) atomický lock každého návrhu — UPDATE ... WHERE id = ? AND status = 'open'
 * Druhá vrstva je ta důležitá: pád uprostřed schůze nesmí nechat půlku návrhů viset.
 *
 * Návrhy se uzavírají podle `opened_game_date < gameDate`, NIKDY podle absolutního
 * `meeting_at <= now`. Rollover vrací herní hodiny o desítky dní zpět, takže absolutní
 * datum by po přechodu sezóny nemuselo nikdy nastat.
 */

import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { PROPOSAL_KINDS, SIMPLE_MAJORITY } from "./defaults";
import { recomputeBalance, recordCompetitionEntry } from "./ledger";
import { voterStats } from "./proposals";
import { loadLeagueMeta } from "./rules";

const M = "competition-meeting";
const SMS_ROLE = "Sekretariát soutěže";

interface OpenProposal {
  id: string;
  league_id: string;
  season_number: number;
  kind: string;
  title: string;
  gesce: string;
  majority: number;
  quorum: number;
  proposed_by_team_id: string;
  target_team_id: string | null;
  deposit: number;
  effective_from_season: number | null;
}

export interface MeetingOutcome {
  leagueId: string;
  closed: number;
  passed: number;
  balance: number;
}

export interface MeetingsResult {
  meetings: number;
  closed: number;
  passed: number;
}

/** Projde všechny soutěže se zapnutou samosprávou a odbaví jejich schůzi. */
export async function runCompetitionMeetings(
  db: D1Database, gameDate: string,
): Promise<MeetingsResult> {
  const leagues = await db.prepare(
    "SELECT league_id FROM competition_governance WHERE enabled = 1"
  ).all<{ league_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "seznam soutěží se samosprávou", e); return { results: [] }; });

  let meetings = 0, closed = 0, passed = 0;
  for (const row of leagues.results) {
    try {
      const out = await runOneMeeting(db, row.league_id, gameDate);
      if (!out) continue;
      meetings++; closed += out.closed; passed += out.passed;
    } catch (e) {
      // Jedna rozbitá soutěž nesmí shodit schůze ostatních.
      logger.error({ module: M }, `schůze soutěže ${row.league_id} selhala`, e);
    }
  }
  return { meetings, closed, passed };
}

/** Vrací null, když se schůze nekonala (žádný bod na programu, nebo už proběhla). */
export async function runOneMeeting(
  db: D1Database, leagueId: string, gameDate: string,
): Promise<MeetingOutcome | null> {
  const meta = await loadLeagueMeta(db, leagueId);
  if (!meta) return null;

  // Schůze se koná, jen když je na programu aspoň jeden bod. Prázdné zasedání
  // každý týden je nejrychlejší způsob, jak lidem samospráva zevšední.
  const open = await db.prepare(
    `SELECT id, league_id, season_number, kind, title, gesce, majority, quorum,
            proposed_by_team_id, target_team_id, deposit, effective_from_season
       FROM competition_proposals
      WHERE league_id = ? AND status = 'open' AND opened_game_date < ?
      ORDER BY created_at ASC`
  ).bind(leagueId, gameDate).all<OpenProposal>()
    .catch((e) => { logger.warn({ module: M }, `otevřené návrhy ${leagueId}`, e); return { results: [] }; });

  if (open.results.length === 0) return null;

  // Claim celé schůze. changes === 0 znamená, že dnes už proběhla.
  const claim = await db.prepare(
    `INSERT OR IGNORE INTO competition_meetings (id, league_id, season_number, game_date)
     VALUES (?,?,?,?)`
  ).bind(crypto.randomUUID(), leagueId, meta.season_number, gameDate).run()
    .catch((e) => { logger.warn({ module: M }, `claim schůze ${leagueId}`, e); return null; });
  if (!claim || (claim.meta?.changes ?? 0) === 0) return null;

  const stats = await voterStats(db, leagueId);
  const results: Array<Record<string, unknown>> = [];
  let closedCount = 0, passedCount = 0;

  for (const p of open.results) {
    const decided = await closeProposal(db, p, gameDate, stats.quorumNeeded, stats.voters.length);
    if (!decided) continue;   // jiný běh ho mezitím uzavřel
    closedCount++;
    if (decided.status === "passed") passedCount++;
    results.push(decided as unknown as Record<string, unknown>);
  }

  const balance = await recomputeBalance(db, leagueId, gameDate);
  const attendance = {
    voters: stats.voters.length,
    active: stats.active.length,
    quorum: stats.quorumNeeded,
  };

  await db.prepare(
    `UPDATE competition_meetings
        SET proposals_closed = ?, proposals_passed = ?, attendance = ?, balance_after = ?, summary = ?
      WHERE league_id = ? AND game_date = ?`
  ).bind(
    closedCount, passedCount, JSON.stringify(attendance), balance,
    JSON.stringify(results), leagueId, gameDate,
  ).run().catch((e) => logger.warn({ module: M }, `zápis schůze ${leagueId}`, e));

  await db.prepare(
    "UPDATE competition_governance SET last_meeting_at = ? WHERE league_id = ?"
  ).bind(gameDate, leagueId).run()
    .catch((e) => logger.warn({ module: M }, `poslední schůze ${leagueId}`, e));

  await notifyMeeting(db, leagueId, meta.name, results, stats.voters);

  return { leagueId, closed: closedCount, passed: passedCount, balance };
}

/**
 * Prostá většina = ostře víc hlasů pro než proti (rovnost tedy neprojde).
 * Kvalifikovaná = aspoň dvě třetiny rozhodujících hlasů, přesná dvoutřetina stačí.
 * Počítá se v celých číslech, aby na 8:4 nezáleželo na zaokrouhlení dvou třetin.
 */
export function hasMajority(pro: number, proti: number, majority: number): boolean {
  const decisive = pro + proti;
  if (decisive === 0) return false;
  if (majority > SIMPLE_MAJORITY) return pro * 3 >= decisive * 2;
  return pro > proti;
}

interface DecidedProposal {
  id: string;
  kind: string;
  title: string;
  status: "passed" | "rejected" | "no_quorum";
  pro: number;
  proti: number;
  zdrzel: number;
  quorum: number;
  effectiveFromSeason: number | null;
}

/**
 * Uzavře jeden návrh. Vrací null, když ho mezitím uzavřel jiný běh.
 *
 * Většina se počítá z hlasů PRO a PROTI; zdržel se se počítá do kvóra, ne do většiny.
 * Rovnost hlasů zatím znamená zamítnutí — rozhodující hlas předsedy přijde s volbami.
 */
async function closeProposal(
  db: D1Database, p: OpenProposal, gameDate: string, quorumNeeded: number, voters: number,
): Promise<DecidedProposal | null> {
  const tally = await db.prepare(
    `SELECT
       SUM(CASE WHEN answer = 'pro' THEN 1 ELSE 0 END)    AS pro,
       SUM(CASE WHEN answer = 'proti' THEN 1 ELSE 0 END)  AS proti,
       SUM(CASE WHEN answer = 'zdrzel' THEN 1 ELSE 0 END) AS zdrzel
     FROM competition_ballots WHERE proposal_id = ?`
  ).bind(p.id).first<{ pro: number | null; proti: number | null; zdrzel: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `sečtení hlasů ${p.id}`, e); return null; });

  const pro = tally?.pro ?? 0;
  const proti = tally?.proti ?? 0;
  const zdrzel = tally?.zdrzel ?? 0;
  const cast = pro + proti + zdrzel;
  const decisive = pro + proti;

  let status: DecidedProposal["status"];
  let note: string;
  if (cast < quorumNeeded) {
    status = "no_quorum";
    note = `Neusnášeníschopné — hlasovalo ${cast} z potřebných ${quorumNeeded}.`;
  } else if (decisive === 0) {
    status = "rejected";
    note = "Všichni se zdrželi, návrh nebyl přijat.";
  } else if (hasMajority(pro, proti, p.majority)) {
    status = "passed";
    note = `Přijato ${pro}:${proti}${zdrzel ? ` (${zdrzel} se zdrželo)` : ""}.`;
  } else {
    status = "rejected";
    note = `Zamítnuto ${pro}:${proti}${zdrzel ? ` (${zdrzel} se zdrželo)` : ""}.`;
  }

  // Atomický lock: jen ten běh, který změní řádek, smí aplikovat důsledky.
  const locked = await db.prepare(
    `UPDATE competition_proposals
        SET status = ?, closed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), closed_game_date = ?,
            votes_pro = ?, votes_proti = ?, votes_zdrzel = ?, eligible_voters = ?,
            decided_by = 'vote', result_note = ?
      WHERE id = ? AND status = 'open'`
  ).bind(status, gameDate, pro, proti, zdrzel, voters, note, p.id).run()
    .catch((e) => { logger.warn({ module: M }, `uzavření návrhu ${p.id}`, e); return null; });

  if (!locked || (locked.meta?.changes ?? 0) === 0) return null;

  // Kauce se vrací jen za přijatý návrh. Sazebníkové změny se aplikují až při
  // rolloveru — competition_rules se mid-season zásadně needitují.
  if (status === "passed" && p.deposit > 0) {
    await refundDeposit(db, p, gameDate);
  }

  return {
    id: p.id, kind: p.kind, title: p.title, status,
    pro, proti, zdrzel, quorum: quorumNeeded,
    effectiveFromSeason: p.effective_from_season,
  };
}

/**
 * Vrátí kauci navrhovateli. Peníze musí ubýt POKLADNĚ, ne vzniknout z ničeho —
 * kauce do ní při podání přitekla, takže odchází stejnou cestou zpátky.
 * Obě strany mají vlastní reference_id, takže opakovaný běh nepřipíše nic navíc.
 */
async function refundDeposit(db: D1Database, p: OpenProposal, gameDate: string): Promise<void> {
  const refId = `dep-refund-${p.id}`;
  const out = await recordCompetitionEntry(db, {
    leagueId: p.league_id, seasonNumber: p.season_number, type: "deposit",
    amount: -p.deposit, description: "Vrácení kauce za přijatý návrh",
    teamId: p.proposed_by_team_id, gameDate, referenceId: refId,
  });
  // Pokladna kauci vrací jen jednou; když už zápis existoval, klub ji taky dostal.
  if (!out.written) return;

  try {
    const { recordTransaction } = await import("../season/finance-processor");
    await recordTransaction(
      db, p.proposed_by_team_id, "competition_deposit", p.deposit,
      "Vrácení kauce za přijatý návrh", gameDate, refId,
    );
  } catch (e) {
    logger.error({ module: M }, `kauce odešla z pokladny, ale klubu ${p.proposed_by_team_id} se nepřipsala (návrh ${p.id})`, e);
  }
}

/** SMS všem lidským klubům — jedna věta o tom, co se na schůzi stalo. */
async function notifyMeeting(
  db: D1Database, leagueId: string, leagueName: string,
  results: Array<Record<string, unknown>>, voters: string[],
): Promise<void> {
  if (voters.length === 0) return;
  const passed = results.filter((r) => r.status === "passed").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  const noQuorum = results.filter((r) => r.status === "no_quorum").length;

  const parts: string[] = [];
  if (passed) parts.push(`${passed} přijato`);
  if (rejected) parts.push(`${rejected} zamítnuto`);
  if (noQuorum) parts.push(`${noQuorum} neusnášeníschopné`);

  const n = results.length;
  const bodu = n === 1 ? "bod" : n <= 4 ? "body" : "bodů";
  const body = `Schůze vedení soutěže (${leagueName}) projednala ${n} ${bodu}: `
    + `${parts.join(", ") || "bez rozhodnutí"}. Zápis najdeš v sekci Vedení soutěže.`;

  for (const teamId of voters) {
    await sendSystemSMS(db, teamId, SMS_ROLE, body)
      .catch((e) => logger.warn({ module: M }, `SMS o schůzi pro tým ${teamId}`, e));
  }
}

export { PROPOSAL_KINDS };
