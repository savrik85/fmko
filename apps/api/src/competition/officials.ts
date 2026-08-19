/**
 * Volby předsedů odborů a jejich mandáty.
 *
 * Volba je TAJNÁ napořád — na rozdíl od hlasování o návrzích se ani po uzavření
 * neodkrývá, kdo koho volil. Kdyby bylo vidět, nikdo nepůjde proti favoritovi
 * a každá volba dopadne jednomyslně.
 *
 * Docházka je jediná vstupenka do kandidatury: kdo se o soutěž nezajímá, nemá ji
 * řídit. Práh se počítá z posledních schůzí, ne z celé historie, aby se dal
 * vrátit i klub, který chvíli chyběl.
 */

import { logger } from "../lib/logger";
import { FULL_BOARD_CLUBS, ROLE_LABEL, type OfficialRole } from "./defaults";
import { countHumanClubs, listVoters } from "./rules";

const M = "competition-officials";

/** Kolik posledních schůzí se dívá na docházku kandidáta. */
const ATTENDANCE_WINDOW = 5;
/** Kolik z nich musel klub odhlasovat, aby mohl kandidovat. */
const MIN_ATTENDANCE_RATIO = 0.6;

/** Funkce, které v soutěži té velikosti vůbec existují. */
export function rolesFor(humanClubs: number): OfficialRole[] {
  // V malé lize nemá smysl mít čtyři bafuňáře na osm klubů — disciplinární
  // pokuty i škrtání rozhodčích se tam řeší vždycky hlasováním.
  return humanClubs >= FULL_BOARD_CLUBS
    ? ["predseda", "hospodarska", "disciplinarni", "rozhodcich"]
    : ["predseda", "hospodarska"];
}

export interface ElectionRow {
  id: string;
  league_id: string;
  role: OfficialRole;
  season_number: number;
  status: string;
  opened_game_date: string;
  winner_team_id: string | null;
  candidates: number;
  votes_cast: number;
  result_note: string | null;
}

/**
 * Vyhlásí volby pro všechny neobsazené funkce dané sezóny.
 * Idempotentní přes UNIQUE(league_id, role, season_number).
 */
export async function openElections(
  db: D1Database, leagueId: string, seasonNumber: number, gameDate: string,
): Promise<number> {
  const humans = await countHumanClubs(db, leagueId);
  const roles = rolesFor(humans);
  let opened = 0;

  for (const role of roles) {
    const held = await db.prepare(
      `SELECT 1 FROM competition_officials
        WHERE league_id = ? AND role = ? AND season_number = ? AND status IN ('active','suspended')`
    ).bind(leagueId, role, seasonNumber).first()
      .catch((e) => { logger.warn({ module: M }, `stav funkce ${role}`, e); return null; });
    if (held) continue;

    const res = await db.prepare(
      `INSERT OR IGNORE INTO competition_elections
        (id, league_id, role, season_number, opened_game_date) VALUES (?,?,?,?,?)`
    ).bind(crypto.randomUUID(), leagueId, role, seasonNumber, gameDate).run()
      .catch((e) => { logger.warn({ module: M }, `vyhlášení voleb ${role}`, e); return null; });
    if ((res?.meta?.changes ?? 0) > 0) opened++;
  }

  if (opened > 0) {
    logger.info({ module: M }, `soutěž ${leagueId}: vyhlášeno ${opened} voleb na ${seasonNumber}. sezónu`);
  }
  return opened;
}

export interface CandidacyCheck {
  ok: boolean;
  reason?: string;
  attendance?: { present: number; of: number };
}

/**
 * Smí klub kandidovat? Tři podmínky, každá se svým důvodem, ať UI ví, co říct.
 */
export async function canRunFor(
  db: D1Database, leagueId: string, teamId: string, role: OfficialRole, seasonNumber: number,
): Promise<CandidacyCheck> {
  const voters = await listVoters(db, leagueId);
  if (!voters.includes(teamId)) {
    return { ok: false, reason: "Tvůj klub nemá v téhle soutěži hlasovací právo." };
  }

  // Jeden klub nejvýš jedna funkce — ani jako držitel, ani jako kandidát.
  const holds = await db.prepare(
    `SELECT role FROM competition_officials
      WHERE league_id = ? AND team_id = ? AND season_number = ? AND status IN ('active','suspended')`
  ).bind(leagueId, teamId, seasonNumber).first<{ role: string }>()
    .catch((e) => { logger.warn({ module: M }, "držená funkce", e); return null; });
  if (holds) {
    return { ok: false, reason: `Tvůj klub už zastává funkci ${ROLE_LABEL[holds.role as OfficialRole]}. Jeden klub může mít nejvýš jednu.` };
  }

  const elsewhere = await db.prepare(
    `SELECT e.role FROM competition_candidacies c
       JOIN competition_elections e ON e.id = c.election_id
      WHERE e.league_id = ? AND e.season_number = ? AND e.status = 'open'
        AND c.team_id = ? AND c.withdrawn = 0 AND e.role != ?`
  ).bind(leagueId, seasonNumber, teamId, role).first<{ role: string }>()
    .catch((e) => { logger.warn({ module: M }, "kandidatura jinde", e); return null; });
  if (elsewhere) {
    return { ok: false, reason: `Už kandiduješ na ${ROLE_LABEL[elsewhere.role as OfficialRole]}. Nejdřív tu kandidaturu stáhni.` };
  }

  const att = await attendanceOf(db, leagueId, teamId);
  if (att.of > 0 && att.present / att.of < MIN_ATTENDANCE_RATIO) {
    return {
      ok: false, attendance: att,
      reason: `Na kandidaturu je potřeba účast aspoň ${Math.round(MIN_ATTENDANCE_RATIO * 100)} % schůzí. Ty máš ${att.present} z ${att.of}.`,
    };
  }

  return { ok: true, attendance: att };
}

/** Na kolika z posledních schůzí klub odhlasoval aspoň jeden bod. */
export async function attendanceOf(
  db: D1Database, leagueId: string, teamId: string,
): Promise<{ present: number; of: number }> {
  const meetings = await db.prepare(
    "SELECT game_date FROM competition_meetings WHERE league_id = ? ORDER BY game_date DESC LIMIT ?"
  ).bind(leagueId, ATTENDANCE_WINDOW).all<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: M }, "historie schůzí", e); return { results: [] }; });

  const dates = meetings.results.map((r) => r.game_date);
  if (dates.length === 0) return { present: 0, of: 0 };

  const row = await db.prepare(
    `SELECT COUNT(DISTINCT p.closed_game_date) AS n
       FROM competition_ballots b JOIN competition_proposals p ON p.id = b.proposal_id
      WHERE p.league_id = ? AND b.team_id = ?
        AND p.closed_game_date IN (${dates.map(() => "?").join(",")})`
  ).bind(leagueId, teamId, ...dates).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "docházka klubu", e); return null; });

  return { present: row?.n ?? 0, of: dates.length };
}

/**
 * Vyhodnotí volby splatné k danému hernímu dni. Volá se ze schůze.
 *
 * Vítězí prostá většina odevzdaných hlasů. Při rovnosti rozhoduje vyšší reputace
 * manažera, a když i ta sedí, pořadí podle id — deterministicky, aby opakovaný
 * běh dal stejný výsledek.
 */
export async function resolveElections(
  db: D1Database, leagueId: string, seasonNumber: number, gameDate: string,
): Promise<Array<{ role: OfficialRole; winnerTeamId: string | null; note: string }>> {
  const due = await db.prepare(
    `SELECT * FROM competition_elections
      WHERE league_id = ? AND status = 'open' AND opened_game_date < ?`
  ).bind(leagueId, gameDate).all<ElectionRow>()
    .catch((e) => { logger.warn({ module: M }, "splatné volby", e); return { results: [] }; });

  const out: Array<{ role: OfficialRole; winnerTeamId: string | null; note: string }> = [];

  for (const el of due.results) {
    const tally = await db.prepare(
      `SELECT b.candidate_team_id AS team_id, COUNT(*) AS votes,
              COALESCE(m.reputation, 0) AS rep
         FROM competition_election_ballots b
         LEFT JOIN managers m ON m.team_id = b.candidate_team_id
        WHERE b.election_id = ?
        GROUP BY b.candidate_team_id
        ORDER BY votes DESC, rep DESC, b.candidate_team_id ASC`
    ).bind(el.id).all<{ team_id: string; votes: number; rep: number }>()
      .catch((e) => { logger.warn({ module: M }, `sečtení voleb ${el.id}`, e); return { results: [] }; });

    const totalVotes = tally.results.reduce((s, r) => s + r.votes, 0);
    const winner = tally.results[0] ?? null;

    const status = winner ? "decided" : "failed";
    const note = winner
      ? `Zvolen ${winner.votes} z ${totalVotes} hlasů.`
      : "Nikdo nekandidoval — funkce zůstává neobsazená.";

    // Atomický lock: efekt smí aplikovat jen ten běh, který volby opravdu uzavřel.
    const locked = await db.prepare(
      `UPDATE competition_elections
          SET status = ?, closed_game_date = ?, winner_team_id = ?, votes_cast = ?, result_note = ?
        WHERE id = ? AND status = 'open'`
    ).bind(status, gameDate, winner?.team_id ?? null, totalVotes, note, el.id).run()
      .catch((e) => { logger.warn({ module: M }, `uzavření voleb ${el.id}`, e); return null; });
    if (!locked || (locked.meta?.changes ?? 0) === 0) continue;

    if (winner) {
      await db.prepare(
        `INSERT INTO competition_officials
          (id, league_id, role, team_id, season_number, elected_game_date)
         VALUES (?,?,?,?,?,?)`
      ).bind(crypto.randomUUID(), leagueId, el.role, winner.team_id, seasonNumber, gameDate).run()
        .catch((e) => logger.warn({ module: M }, `zápis funkcionáře ${el.role}`, e));

      // Odsloužený mandát se odmění až na konci; zvolení samo o sobě je jen titul.
      logger.info({ module: M }, `soutěž ${leagueId}: ${ROLE_LABEL[el.role]} — zvolen ${winner.team_id}`);
    }

    out.push({ role: el.role, winnerTeamId: winner?.team_id ?? null, note });
  }

  return out;
}

/** Kdo v soutěži zastává kterou funkci. */
export async function loadOfficials(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<Map<OfficialRole, { teamId: string; status: string }>> {
  const rows = await db.prepare(
    `SELECT role, team_id, status FROM competition_officials
      WHERE league_id = ? AND season_number = ? AND status IN ('active','suspended')`
  ).bind(leagueId, seasonNumber).all<{ role: string; team_id: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "načtení funkcionářů", e); return { results: [] }; });

  const out = new Map<OfficialRole, { teamId: string; status: string }>();
  for (const r of rows.results) out.set(r.role as OfficialRole, { teamId: r.team_id, status: r.status });
  return out;
}

/**
 * Reputační dopad konce mandátu. Odsloužil = +6, odvolán = −10, rezignoval = −3
 * (a nic, když už měl za sebou půlku sezóny).
 */
export async function applyTermReputation(
  db: D1Database, teamId: string, outcome: "term_ended" | "recalled" | "resigned",
  role: OfficialRole, seasonNumber: number, gameDate: string,
): Promise<void> {
  const delta = outcome === "term_ended" ? 6 : outcome === "recalled" ? -10 : -3;
  try {
    const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
    await applyManagerAttrDelta(
      db, teamId, "reputation", delta, "competition_office",
      `${ROLE_LABEL[role]} — ${outcome === "term_ended" ? "odsloužený mandát" : outcome === "recalled" ? "odvolání" : "demise"}`,
      { referenceId: `office-${seasonNumber}-${role}-${teamId}-${outcome}`, gameDate },
    );
  } catch (e) {
    logger.warn({ module: M }, `reputace za funkci ${role}`, e);
  }
}
