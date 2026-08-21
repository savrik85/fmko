/**
 * Přechod samosprávy do nové sezóny.
 *
 * Tady a NIKDE JINDE vzniká sazebník na sezónu. Mid-season se `competition_rules`
 * zásadně needitují — tím padá celá třída chyb „změna sazby na rozehranou".
 *
 * Idempotence stojí na třech nezávislých vrstvách současně, protože `runEndSeasonStep`
 * při výjimce celý rollover zopakuje:
 *   1) per-liga marker v `season_end_progress`
 *   2) `INSERT OR IGNORE` u sazebníku (UNIQUE(league_id, season_number))
 *   3) UNIQUE reference_id v pokladně
 */

import { logger } from "../lib/logger";
import { DEFAULT_RULES, MIN_HUMAN_CLUBS, type CompetitionRules } from "./defaults";
import { recomputeBalance, recordCompetitionEntry } from "./ledger";
import { applyTermReputation, openElections } from "./officials";
import { subsidyFor } from "./projection";
import { nextSeasonRules } from "./proposals";
import { countAllClubs, countHumanClubs, loadGovernance, loadRules } from "./rules";

const M = "competition-rollover";
const PHASE = "governance_rollover";

export interface GovernanceRolloverResult {
  leagues: number;
  enabled: number;
  disabled: number;
  feesCollected: number;
}

/** Marker fáze v season_end_progress — stejný idiom jako u ostatních fází konce sezóny. */
async function markerDone(db: D1Database, leagueId: string, season: number): Promise<boolean> {
  const row = await db.prepare(
    "SELECT status FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?"
  ).bind(leagueId, season, PHASE).first<{ status: string }>()
    .catch((e) => { logger.warn({ module: M }, `marker ${leagueId}`, e); return null; });
  return row?.status === "done";
}

async function setMarker(db: D1Database, leagueId: string, season: number): Promise<void> {
  await db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, updated_at)
     VALUES (?, ?, ?, 'done', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(league_id, season_number, phase) DO UPDATE SET status = 'done',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).bind(leagueId, season, PHASE).run()
    .catch((e) => logger.warn({ module: M }, `zápis markeru ${leagueId}`, e));
}

/**
 * Projde všechny soutěže, které samosprávu mají nebo na ni nově dosáhly,
 * a připraví jim novou sezónu.
 */
export async function applyGovernanceRollover(
  db: D1Database, newSeason: number, startDate: string,
): Promise<GovernanceRolloverResult> {
  const out: GovernanceRolloverResult = { leagues: 0, enabled: 0, disabled: 0, feesCollected: 0 };

  // Kandidáti: seniorské soutěže, které samosprávu už mají, plus ty, co na práh nově dosáhly.
  const leagues = await db.prepare(
    `SELECT l.id, l.level FROM leagues l
      WHERE COALESCE(l.league_type,'senior') = 'senior'`
  ).all<{ id: string; level: string }>()
    .catch((e) => { logger.warn({ module: M }, "seznam soutěží", e); return { results: [] }; });

  for (const league of leagues.results) {
    try {
      if (await markerDone(db, league.id, newSeason)) continue;
      const changed = await rolloverOne(db, league.id, league.level, newSeason, startDate, out);
      if (changed) out.leagues++;
      await setMarker(db, league.id, newSeason);
    } catch (e) {
      // Jedna rozbitá soutěž nesmí shodit přechod ostatních; marker se nenastaví,
      // takže se to při dalším průchodu zkusí znovu.
      logger.error({ module: M }, `rollover samosprávy soutěže ${league.id} selhal`, e);
    }
  }
  return out;
}

async function rolloverOne(
  db: D1Database, leagueId: string, level: string, newSeason: number,
  startDate: string, out: GovernanceRolloverResult,
): Promise<boolean> {
  const gov = await loadGovernance(db, leagueId);
  const humans = await countHumanClubs(db, leagueId);
  const qualifies = humans >= MIN_HUMAN_CLUBS;

  // Práh se vyhodnocuje JEN tady, nikdy uprostřed rozehrané sezóny.
  if (!qualifies) {
    if (gov?.enabled) {
      await db.prepare("UPDATE competition_governance SET enabled = 0 WHERE league_id = ?")
        .bind(leagueId).run()
        .catch((e) => logger.warn({ module: M }, `vypnutí samosprávy ${leagueId}`, e));
      out.disabled++;
      logger.info({ module: M }, `soutěž ${leagueId} klesla na ${humans} lidských klubů — samospráva vypnuta`);
      return true;
    }
    return false;   // soutěž samosprávu nikdy neměla, nic k řešení
  }

  if (!gov) {
    const name = await db.prepare("SELECT name FROM leagues WHERE id = ?")
      .bind(leagueId).first<{ name: string }>().catch(() => null);
    await db.prepare(
      `INSERT INTO competition_governance (league_id, enabled, enabled_from_season, original_name)
       VALUES (?, 1, ?, ?)`
    ).bind(leagueId, newSeason, name?.name ?? null).run()
      .catch((e) => logger.warn({ module: M }, `založení samosprávy ${leagueId}`, e));
    out.enabled++;
  } else if (!gov.enabled) {
    await db.prepare("UPDATE competition_governance SET enabled = 1 WHERE league_id = ?")
      .bind(leagueId).run()
      .catch((e) => logger.warn({ module: M }, `zapnutí samosprávy ${leagueId}`, e));
    out.enabled++;
  }

  await buildRules(db, leagueId, level, newSeason);
  await collectMoney(db, leagueId, level, newSeason, startDate, out);
  await settleSponsor(db, leagueId, newSeason, startDate);
  await endOfficialTerms(db, leagueId, newSeason, startDate);
  await openElections(db, leagueId, newSeason, startDate);
  await restampDeadlines(db, leagueId, startDate);
  // Sponzorské nabídky na novou sezónu. Soutěž, která sponzora má, žádné
  // nedostane — přijmout jde jen jednu smlouvu.
  try {
    const { generateOffers } = await import("./sponsors");
    const stav = await loadGovernance(db, leagueId);
    if (!stav?.sponsor_name) {
      const okres = await db.prepare("SELECT district FROM leagues WHERE id = ?")
        .bind(leagueId).first<{ district: string }>().catch(() => null);
      await generateOffers(db, {
        leagueId, district: okres?.district ?? "", seasonNumber: newSeason,
        humanClubs: humans, gameDate: startDate,
      });
    }
  } catch (e) {
    logger.warn({ module: M }, `sponzorské nabídky ${leagueId}`, e);
  }

  await recomputeBalance(db, leagueId, startDate);
  return true;
}

/** Sazebník na novou sezónu = loňský (nebo výchozí) + odhlasované návrhy. */
async function buildRules(
  db: D1Database, leagueId: string, level: string, newSeason: number,
): Promise<void> {
  const previous = await loadRules(db, leagueId, newSeason - 1);
  let base: CompetitionRules = previous ?? ({ ...DEFAULT_RULES } as CompetitionRules);

  // Stejná funkce, jakou používá strop rozpočtu — jinak by se projekce a
  // skutečnost rozešly a strop by přestal být stropem.
  const pred = base;
  base = await nextSeasonRules(db, leagueId, base, newSeason);
  const changes = (Object.keys(DEFAULT_RULES) as Array<keyof CompetitionRules>)
    .filter((f) => base[f] !== pred[f])
    .map((f) => ({ kind: String(f), value: base[f] }));

  const teams = await countAllClubs(db, leagueId);
  const subsidy = subsidyFor(teams, level);

  // Sloupce se skládají z DEFAULT_RULES, ne ručním výčtem: nové pravidlo se pak
  // nedá zapomenout dopsat sem a tiše propadnout na výchozí hodnotu.
  const fields = Object.keys(DEFAULT_RULES) as Array<keyof CompetitionRules>;
  const cols = ["id", "league_id", "season_number", ...fields, "subsidy_total", "source_proposals"];
  await db.prepare(
    `INSERT OR IGNORE INTO competition_rules (${cols.join(", ")})
     VALUES (${cols.map(() => "?").join(",")})`
  ).bind(
    crypto.randomUUID(), leagueId, newSeason,
    ...fields.map((f) => base[f]),
    subsidy, JSON.stringify(changes.map((ch) => ch.kind)),
  ).run();

  if (changes.length > 0) {
    logger.info({ module: M }, `soutěž ${leagueId}: sazebník na ${newSeason}. sezónu podle ${changes.length} schválených návrhů`);
  }
}

/** Svazová dotace a startovné od všech klubů včetně AI. */
async function collectMoney(
  db: D1Database, leagueId: string, level: string, newSeason: number,
  gameDate: string, out: GovernanceRolloverResult,
): Promise<void> {
  const rules = await loadRules(db, leagueId, newSeason);
  if (!rules) return;

  const teams = await countAllClubs(db, leagueId);
  await recordCompetitionEntry(db, {
    leagueId, seasonNumber: newSeason, type: "subsidy", amount: subsidyFor(teams, level),
    description: `Svazová dotace na ${newSeason}. sezónu`,
    gameDate, referenceId: `sub-${leagueId}-${newSeason}`,
  });

  if (rules.entry_fee <= 0) return;

  const clubs = await db.prepare("SELECT id FROM teams WHERE league_id = ?")
    .bind(leagueId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `kluby soutěže ${leagueId}`, e); return { results: [] }; });

  const { recordTransaction } = await import("../season/finance-processor");
  for (const club of clubs.results) {
    const refId = `fee-${newSeason}-${club.id}`;
    const entry = await recordCompetitionEntry(db, {
      leagueId, seasonNumber: newSeason, type: "entry_fee", amount: rules.entry_fee,
      description: "Startovné do soutěže", teamId: club.id, gameDate, referenceId: refId,
    });
    if (!entry.written) continue;
    out.feesCollected++;
    await recordTransaction(
      db, club.id, "competition_fee", -rules.entry_fee,
      `Startovné do soutěže (${newSeason}. sezóna)`, gameDate, refId,
    ).catch((e) => logger.warn({ module: M }, `startovné klubu ${club.id}`, e));
  }
}

/** Sponzorské plnění, nebo návrat k původnímu názvu, když smlouva skončila. */
async function settleSponsor(
  db: D1Database, leagueId: string, newSeason: number, gameDate: string,
): Promise<void> {
  const gov = await loadGovernance(db, leagueId);
  if (!gov?.sponsor_name) return;

  const stillValid = (gov.sponsor_until_season ?? 0) >= newSeason && gov.sponsor_satisfaction >= 30;
  if (stillValid) {
    await recordCompetitionEntry(db, {
      leagueId, seasonNumber: newSeason, type: "sponsor", amount: gov.sponsor_amount,
      description: `Sponzorské plnění — ${gov.sponsor_name}`,
      gameDate, referenceId: `spon-${leagueId}-${newSeason}`,
    });
    return;
  }

  // Sponzor končí: název se vrací a s ním i titulek ligového chatu, který je snapshot.
  if (gov.original_name) {
    await db.prepare("UPDATE leagues SET name = ? WHERE id = ?")
      .bind(gov.original_name, leagueId).run()
      .catch((e) => logger.warn({ module: M }, `návrat názvu ligy ${leagueId}`, e));
    await db.prepare("UPDATE group_chats SET title = ? WHERE id = ?")
      .bind(gov.original_name, `league:${leagueId}`).run()
      .catch((e) => logger.warn({ module: M }, `návrat názvu ligového chatu ${leagueId}`, e));
  }
  await db.prepare(
    `UPDATE competition_governance
        SET sponsor_name = NULL, sponsor_amount = 0, sponsor_until_season = NULL,
            sponsor_satisfaction = 60
      WHERE league_id = ?`
  ).bind(leagueId).run()
    .catch((e) => logger.warn({ module: M }, `ukončení sponzora ${leagueId}`, e));

  logger.info({ module: M }, `soutěž ${leagueId}: sponzor ${gov.sponsor_name} skončil, název se vrátil`);
}

/**
 * Mandáty končí se sezónou; nové se volí na prvních schůzích té další.
 * Odsloužený mandát je jediná odměna, kterou funkcionář dostane — +6 reputace
 * a řádek v profilu manažera. Nikdo nedělá bafuňáře pro peníze.
 */
async function endOfficialTerms(
  db: D1Database, leagueId: string, newSeason: number, gameDate: string,
): Promise<void> {
  const ending = await db.prepare(
    `SELECT team_id, role, season_number FROM competition_officials
      WHERE league_id = ? AND season_number < ? AND status = 'active'`
  ).bind(leagueId, newSeason).all<{ team_id: string; role: string; season_number: number }>()
    .catch((e) => { logger.warn({ module: M }, `mandáty ke konci ${leagueId}`, e); return { results: [] }; });

  await db.prepare(
    `UPDATE competition_officials SET status = 'term_ended', ended_game_date = ?
      WHERE league_id = ? AND season_number < ? AND status IN ('active','suspended')`
  ).bind(gameDate, leagueId, newSeason).run()
    .catch((e) => logger.warn({ module: M }, `ukončení mandátů ${leagueId}`, e));

  for (const o of ending.results) {
    await applyTermReputation(
      db, o.team_id, "term_ended", o.role as never, o.season_number, gameDate,
    );
  }

  // Volby, které se do konce sezóny nestihly rozhodnout, propadají spolu s ní.
  // Bez tohohle by v tabulce navěky visely otevřené volby do minulé sezóny.
  await db.prepare(
    `UPDATE competition_elections
        SET status = 'failed', closed_game_date = ?,
            result_note = 'Volba nebyla uzavřena do konce sezóny a propadla.'
      WHERE league_id = ? AND season_number < ? AND status = 'open'`
  ).bind(gameDate, leagueId, newSeason).run()
    .catch((e) => logger.warn({ module: M }, `uzavření starých voleb ${leagueId}`, e));
}

/**
 * Přerazítkování herních termínů na novou časovou osu.
 *
 * Rollover nuluje `game_clock.offset_days`, takže herní datum skočí o desítky dní
 * zpět. Cokoliv uloženého jako absolutní herní timestamp by tím ztratilo smysl —
 * stejný důvod, proč se přerazítkovává `coach_interviews.expires_at`.
 */
async function restampDeadlines(db: D1Database, leagueId: string, startDate: string): Promise<void> {
  await db.prepare(
    "UPDATE competition_governance SET next_meeting_at = NULL, last_meeting_at = NULL WHERE league_id = ?"
  ).bind(leagueId).run()
    .catch((e) => logger.warn({ module: M }, `přerazítkování termínů ${leagueId}`, e));

  // Návrhy, které zůstaly otevřené přes konec sezóny, se posunou na novou osu,
  // aby je první schůze nové sezóny projednala místo aby visely navždy.
  await db.prepare(
    "UPDATE competition_proposals SET opened_game_date = ? WHERE league_id = ? AND status = 'open'"
  ).bind(startDate, leagueId).run()
    .catch((e) => logger.warn({ module: M }, `přerazítkování otevřených návrhů ${leagueId}`, e));

  await db.prepare(
    "UPDATE competition_sanctions SET appeal_deadline_gd = NULL WHERE league_id = ? AND appeal_deadline_gd IS NOT NULL"
  ).bind(leagueId).run()
    .catch((e) => logger.warn({ module: M }, `přerazítkování lhůt sankcí ${leagueId}`, e));
}
