/**
 * Dotace, ceny a půjčky z pokladny soutěže.
 *
 * Doteď z pokladny tekly jen peníze, o kterých kluby nerozhodovaly — odměny za
 * zápasy a za umístění podle sazebníku. Dotace jsou opak: konkrétní částka pro
 * konkrétní kluby, o které se hlasuje jednotlivě.
 *
 * Pořadí zápisu je závazné a stejné jako u pokut: nejdřív ubere pokladně, pak
 * připíše klubu. Kdyby to bylo obráceně a druhý zápis selhal, vznikly by peníze
 * z ničeho. Obojí drží na stabilním `reference_id`, takže opakovaný běh nic
 * nepřipíše podruhé.
 */

import { logger } from "../lib/logger";
import { recordCompetitionEntry } from "./ledger";

const M = "competition-grants";

/** Na co všechno může soutěž dát peníze. Zrcadlí CHECK v migraci 0150. */
export type GrantKind = "equipment" | "pitch" | "travel" | "award" | "loan" | "surplus";

export const GRANT_LABEL: Record<GrantKind, string> = {
  equipment: "Dotace na vybavení",
  pitch: "Dotace na opravu hřiště",
  travel: "Příspěvek na cestovné",
  award: "Sezónní cena",
  loan: "Bezúročná půjčka",
  surplus: "Podíl z přebytku",
};

/** Kolik nejvýš smí jedna dotace stát. Strop je proti vysátí pokladny jedním hlasováním. */
export const GRANT_MIN = 1_000;
export const GRANT_MAX = 300_000;
/** Z přebytku se rozdělí nejvýš tolik — zbytek musí soutěži zůstat. */
export const SURPLUS_MAX_PCT = 60;

export interface GrantPayment {
  teamId: string;
  amount: number;
}

/**
 * Vyplatí dotaci skupině klubů.
 *
 * Vrací, kolik korun z pokladny opravdu odešlo — volající to potřebuje do zápisu
 * a nesmí si to dopočítávat sám, protože část plateb mohla být přeskočená jako
 * duplicitní.
 */
export async function payGrants(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  kind: GrantKind;
  /** Stabilní klíč celé dotace — obvykle id návrhu. */
  referenceKey: string;
  payments: GrantPayment[];
  gameDate: string;
  description?: string;
}): Promise<number> {
  const { recordTransaction } = await import("../season/finance-processor");
  const popis = opts.description ?? GRANT_LABEL[opts.kind];
  let vyplaceno = 0;

  for (const p of opts.payments) {
    const amount = Math.round(p.amount);
    if (amount <= 0) continue;
    const refId = `grant-${opts.referenceKey}-${p.teamId}`;

    // Pokladna první. Když je klíč už použitý, recordCompetitionEntry nic neudělá
    // a klubu se taky nic nepřipíše — obojí visí na témže referenceId.
    const uz = await db.prepare("SELECT 1 FROM competition_ledger WHERE reference_id = ?")
      .bind(refId).first()
      .catch((e) => { logger.warn({ module: M }, "kontrola dotace", e); return null; });
    if (uz) continue;

    await recordCompetitionEntry(db, {
      leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, type: "grant",
      amount: -amount, description: popis, teamId: p.teamId,
      gameDate: opts.gameDate, referenceId: refId,
    });

    await recordTransaction(db, p.teamId, "competition_grant", amount, popis, opts.gameDate, refId)
      .catch((e) => logger.error({ module: M }, `připsání dotace klubu ${p.teamId}`, e));

    await db.prepare(
      `INSERT INTO competition_grants
        (id, league_id, season_number, proposal_id, team_id, kind, amount, game_date)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      crypto.randomUUID(), opts.leagueId, opts.seasonNumber, opts.referenceKey,
      p.teamId, opts.kind, amount, opts.gameDate,
    ).run().catch((e) => logger.warn({ module: M }, "evidence dotace", e));

    vyplaceno += amount;
  }

  if (vyplaceno > 0) {
    logger.info({ module: M }, `soutěž ${opts.leagueId}: ${popis} — vyplaceno ${vyplaceno} Kč`);
  }
  return vyplaceno;
}

/** Komu dotace patří. Vrací prázdno, když cíl neexistuje — volající to musí zvládnout. */
export async function prijemci(db: D1Database, opts: {
  leagueId: string;
  kind: GrantKind;
  /** Celková částka k rozdělení, nebo částka pro jeden klub u cílené dotace. */
  amount: number;
  targetTeamId?: string | null;
  /** Pod jakým stavem hřiště se považuje za potřebné. Bere se ze sazebníku. */
  pitchThreshold?: number;
}): Promise<GrantPayment[]> {
  // Cílená dotace jednomu klubu — půjčka, cena, cestovné.
  if (opts.targetTeamId) return [{ teamId: opts.targetTeamId, amount: opts.amount }];

  const kluby = await db.prepare(
    `SELECT t.id,
            (SELECT s.pitch_condition FROM stadiums s WHERE s.team_id = t.id) AS pitch
       FROM teams t
      WHERE t.league_id = ? AND t.team_type = 'senior' AND t.parent_team_id IS NULL
      ORDER BY t.id`
  ).bind(opts.leagueId).all<{ id: string; pitch: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "příjemci dotace", e); return { results: [] }; });

  // Dotace na hřiště jde jen tam, kde je co spravovat. Kdyby ji dostali všichni,
  // byla by to jen jinak pojmenovaná výplata.
  const vybrani = opts.kind === "pitch"
    ? kluby.results.filter((t) => t.pitch !== null && t.pitch < (opts.pitchThreshold ?? 30))
    : kluby.results;

  if (vybrani.length === 0) return [];

  // Rovným dílem. Zbytek po dělení zůstává v pokladně — rozdávat koruny navíc
  // podle abecedy by bylo tiché zvýhodnění.
  const podil = Math.floor(opts.amount / vybrani.length);
  return podil <= 0 ? [] : vybrani.map((t) => ({ teamId: t.id, amount: podil }));
}

/**
 * Sezónní ceny: fair play, návštěvnost, nejlepší střelec.
 *
 * Počítá se z odehraných zápasů sezóny, ne z ničeho — cena bez měřitelného
 * důvodu je jen přesun peněz kamarádovi.
 */
export async function seasonAwards(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  amountPerAward: number;
}): Promise<Array<{ teamId: string; title: string; amount: number }>> {
  const out: Array<{ teamId: string; title: string; amount: number }> = [];

  const fairplay = await db.prepare(
    `SELECT t.id, t.name,
            COALESCE(SUM(mps.yellow_cards), 0) + 3 * COALESCE(SUM(mps.red_cards), 0) AS body
       FROM teams t
       LEFT JOIN match_player_stats mps ON mps.team_id = t.id
       LEFT JOIN matches m ON m.id = mps.match_id AND m.season_number = ?
      WHERE t.league_id = ? AND t.team_type = 'senior' AND t.parent_team_id IS NULL
      GROUP BY t.id ORDER BY body ASC, t.id ASC LIMIT 1`
  ).bind(opts.seasonNumber, opts.leagueId).first<{ id: string; name: string; body: number }>()
    .catch((e) => { logger.warn({ module: M }, "fair play", e); return null; });
  if (fairplay) {
    out.push({ teamId: fairplay.id, title: `Cena fair play — ${fairplay.name}`, amount: opts.amountPerAward });
  }

  const navstevnost = await db.prepare(
    `SELECT t.id, t.name, COALESCE(AVG(m.attendance), 0) AS prumer
       FROM teams t
       JOIN matches m ON m.home_team_id = t.id AND m.season_number = ? AND m.status = 'simulated'
      WHERE t.league_id = ? AND t.team_type = 'senior' AND t.parent_team_id IS NULL
      GROUP BY t.id ORDER BY prumer DESC, t.id ASC LIMIT 1`
  ).bind(opts.seasonNumber, opts.leagueId).first<{ id: string; name: string; prumer: number }>()
    .catch((e) => { logger.warn({ module: M }, "návštěvnost", e); return null; });
  if (navstevnost && navstevnost.prumer > 0) {
    out.push({
      teamId: navstevnost.id,
      title: `Cena za návštěvnost — ${navstevnost.name} (${Math.round(navstevnost.prumer)} diváků v průměru)`,
      amount: opts.amountPerAward,
    });
  }

  const strelec = await db.prepare(
    `SELECT t.id AS team_id, t.name AS team_name,
            COALESCE(p.first_name, dp.first_name) AS jmeno,
            COALESCE(p.last_name, dp.last_name) AS prijmeni,
            SUM(mps.goals) AS golu
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id AND m.season_number = ?
       JOIN teams t ON t.id = mps.team_id
       LEFT JOIN players p ON p.id = mps.player_id
       LEFT JOIN departed_players dp ON dp.id = mps.player_id
      WHERE t.league_id = ?
      GROUP BY mps.player_id HAVING golu > 0
      ORDER BY golu DESC, mps.player_id ASC LIMIT 1`
  ).bind(opts.seasonNumber, opts.leagueId)
    .first<{ team_id: string; team_name: string; jmeno: string; prijmeni: string; golu: number }>()
    .catch((e) => { logger.warn({ module: M }, "nejlepší střelec", e); return null; });
  if (strelec) {
    out.push({
      teamId: strelec.team_id,
      title: `Cena pro nejlepšího střelce — ${strelec.jmeno} ${strelec.prijmeni} (${strelec.golu} gólů), ${strelec.team_name}`,
      amount: opts.amountPerAward,
    });
  }

  return out;
}

/**
 * Splátka bezúročné půjčky ze sezónní odměny.
 *
 * Vrací, kolik se z odměny strhlo. Klub, který dostal půjčku a skončil poslední,
 * splatí jen tolik, kolik odměna unese — dluh se nepřenáší, soutěž si ho odepíše.
 * Je to půjčka klubu v nouzi, ne exekuce.
 */
export async function repayLoans(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  teamId: string;
  reward: number;
  gameDate: string;
}): Promise<number> {
  if (opts.reward <= 0) return 0;

  const dluh = await db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM competition_grants
      WHERE league_id = ? AND season_number = ? AND team_id = ? AND kind = 'loan' AND repaid = 0`
  ).bind(opts.leagueId, opts.seasonNumber, opts.teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "nesplacené půjčky", e); return null; });

  const splatka = Math.min(opts.reward, dluh?.n ?? 0);
  if (splatka <= 0) return 0;

  await recordCompetitionEntry(db, {
    leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, type: "loan_repaid",
    amount: splatka, description: "Splátka bezúročné půjčky", teamId: opts.teamId,
    gameDate: opts.gameDate, referenceId: `loanrep-${opts.seasonNumber}-${opts.teamId}`,
  });

  await db.prepare(
    `UPDATE competition_grants SET repaid = 1
      WHERE league_id = ? AND season_number = ? AND team_id = ? AND kind = 'loan' AND repaid = 0`
  ).bind(opts.leagueId, opts.seasonNumber, opts.teamId).run()
    .catch((e) => logger.warn({ module: M }, "označení splacené půjčky", e));

  logger.info({ module: M }, `soutěž ${opts.leagueId}: klub ${opts.teamId} splatil ${splatka} Kč z půjčky`);
  return splatka;
}
