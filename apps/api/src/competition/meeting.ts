/**
 * Týdenní zasedání grémia soutěže.
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
import { DEFAULT_RULES, PROPOSAL_KINDS, ROLE_LABEL, SIMPLE_MAJORITY } from "./defaults";
import { recomputeBalance, recordCompetitionEntry } from "./ledger";
import { presidentOf, recallOfficial, resolveElections, restoreOfficial } from "./officials";
import { voterStats } from "./proposals";
import { loadLeagueMeta } from "./rules";

const M = "competition-meeting";
const SMS_ROLE = "Sekretariát grémia";

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
  payload: string;
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

  // Schůze se koná, jen když je na programu aspoň jeden bod — návrh nebo volba.
  // Prázdné zasedání každý týden je nejrychlejší způsob, jak samospráva zevšední.
  const open = await db.prepare(
    `SELECT id, league_id, season_number, kind, title, gesce, majority, quorum,
            proposed_by_team_id, target_team_id, payload, deposit, effective_from_season
       FROM competition_proposals
      WHERE league_id = ? AND status = 'open' AND opened_game_date < ?
      ORDER BY created_at ASC`
  ).bind(leagueId, gameDate).all<OpenProposal>()
    .catch((e) => { logger.warn({ module: M }, `otevřené návrhy ${leagueId}`, e); return { results: [] }; });

  const dueElections = await db.prepare(
    "SELECT COUNT(*) AS n FROM competition_elections WHERE league_id = ? AND status = 'open' AND opened_game_date < ?"
  ).bind(leagueId, gameDate).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `splatné volby ${leagueId}`, e); return null; });

  // Porušené pravidlo je bod programu jako každý jiný — kdyby se kontrola dělala
  // až za touhle branou, vymáhala by se pravidla jen v týdnech, kdy někdo něco
  // navrhl. Čte se před uzavřením návrhů, takže pravidlo přijaté dnes platí
  // až od příštího týdne a klub má čas se přizpůsobit.
  const { resolveRules } = await import("./rules");
  const rules = await resolveRules(db, leagueId, meta.season_number);
  const { collectCompliance } = await import("./compliance");
  const porusení = await collectCompliance(db, leagueId, rules)
    .catch((e) => { logger.warn({ module: M }, `kontrola pravidel ${leagueId}`, e); return []; });

  if (open.results.length === 0 && (dueElections?.n ?? 0) === 0 && porusení.length === 0) return null;

  // Claim celé schůze. changes === 0 znamená, že dnes už proběhla.
  const claim = await db.prepare(
    `INSERT OR IGNORE INTO competition_meetings (id, league_id, season_number, game_date)
     VALUES (?,?,?,?)`
  ).bind(crypto.randomUUID(), leagueId, meta.season_number, gameDate).run()
    .catch((e) => { logger.warn({ module: M }, `claim schůze ${leagueId}`, e); return null; });
  if (!claim || (claim.meta?.changes ?? 0) === 0) return null;

  const stats = await voterStats(db, leagueId);
  const president = await presidentOf(db, leagueId, meta.season_number);
  const results: Array<Record<string, unknown>> = [];
  let closedCount = 0, passedCount = 0;

  for (const p of open.results) {
    const decided = await closeProposal(db, p, gameDate, stats.quorumNeeded, stats.voters.length, president?.teamId ?? null);
    if (!decided) continue;   // jiný běh ho mezitím uzavřel
    closedCount++;
    if (decided.status === "passed") passedCount++;
    results.push(decided as unknown as Record<string, unknown>);
  }

  // Volby se vyhodnocují na stejné schůzi jako návrhy. Tajné zůstávají i potom —
  // do zápisu jde jen jméno vítěze a poměr, nikdy kdo koho volil.
  const elections = await resolveElections(db, leagueId, meta.season_number, gameDate);
  for (const e of elections) {
    results.push({
      kind: "election",
      title: `Volba: ${ROLE_LABEL[e.role] ?? e.role}`,
      status: e.winnerTeamId ? "passed" : "no_quorum",
      // V zápisu jméno být musí — tam se zvolený nikde jinde neuvádí.
      resultNote: e.winner ? `Zvolen ${e.winner}. ${e.note}` : e.note,
      winnerTeamId: e.winnerTeamId,
    } as unknown as Record<string, unknown>);
    // Volba je plnohodnotný bod programu — musí se počítat do zápisu stejně jako návrh.
    closedCount++;
    if (e.winnerTeamId) passedCount++;
  }

  const { punishCompliance } = await import("./compliance");
  await punishCompliance(db, {
    leagueId, seasonNumber: meta.season_number, rules, gameDate, hits: porusení,
  }).catch((e) => logger.warn({ module: M }, `pokuty za pravidla ${leagueId}`, e));
  for (const h of porusení) {
    results.push({
      kind: "compliance",
      title: `${h.reason} — ${h.teamName}`,
      status: rules.fine_rule > 0 ? "passed" : "no_quorum",
      resultNote: rules.fine_rule > 0
        ? `${h.detail} Pokuta ${rules.fine_rule.toLocaleString("cs")} Kč.`
        : `${h.detail} Sazba pokuty je nula, takže zůstalo u napomenutí.`,
    } as unknown as Record<string, unknown>);
    closedCount++;
  }

  // Funkce po klubech, které mezitím osiřely. Musí se uvolnit dřív, než se
  // vyhlašují doplňovací volby — jinak by se na ně letos už nedostalo.
  const { openElections, vacateAbandonedSeats } = await import("./officials");
  const opustene = await vacateAbandonedSeats(db, leagueId, meta.season_number, gameDate)
    .catch((e) => { logger.warn({ module: M }, `osiřelé funkce ${leagueId}`, e); return []; });
  for (const o of opustene) {
    results.push({
      kind: "vacated",
      title: `Uvolněna funkce ${ROLE_LABEL[o.role]}`,
      status: "passed",
      resultNote: `${o.teamName} zůstal bez trenéra. Funkci převezme doplňovací volba.`,
    } as unknown as Record<string, unknown>);
    closedCount++;
  }

  // Doplňovací volby na funkce, které zůstaly neobsazené — po neúspěšné volbě,
  // po odvolání i po demisi. Vyhlásí se dnes, hlasuje se do příštího zasedání.
  await openElections(db, leagueId, meta.season_number, gameDate)
    .catch((e) => logger.warn({ module: M }, `doplňovací volby ${leagueId}`, e));

  const balance = await recomputeBalance(db, leagueId, gameDate);
  const attendance = {
    voters: stats.voters.length,
    active: stats.active.length,
    quorum: stats.quorumNeeded,
  };

  // Kolik klubů se dnes vůbec ozvalo — do zápisu i do článku. Počítá se přes
  // uzavřené body, ne přes jeden návrh: klub mohl hlasovat jen o části programu.
  const ucastniku = await db.prepare(
    `SELECT COUNT(DISTINCT b.team_id) AS n
       FROM competition_ballots b
       JOIN competition_proposals p ON p.id = b.proposal_id
      WHERE p.league_id = ? AND p.closed_game_date = ?`
  ).bind(leagueId, gameDate).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `účast na zasedání ${leagueId}`, e); return null; });
  const odevzdanoHlasu = ucastniku?.n ?? 0;

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

  // Zápis do Zpravodaje. Až po uložení zasedání, aby se čísla v článku shodovala
  // s tím, co je v databázi — a jen jednou, protože zasedání samo je proti
  // dvojímu běhu chráněné claimem.
  try {
    const { publikujZapis, nactiProtiHlasy, mluvci } = await import("./minutes");
    const newsId = await publikujZapis(db, {
      leagueId, leagueName: meta.name, seasonNumber: meta.season_number, gameDate,
      items: results as unknown as Array<{ title: string; status: string }>,
      attendance, hlasovalo: odevzdanoHlasu, balance,
      protiHlasy: await nactiProtiHlasy(db, leagueId, gameDate),
      prezident: await mluvci(db, leagueId, meta.season_number),
    });
    if (newsId) {
      await db.prepare("UPDATE competition_meetings SET news_id = ? WHERE league_id = ? AND game_date = ?")
        .bind(newsId, leagueId, gameDate).run();
    }
  } catch (e) {
    // Zpravodaj je výkladní skříň, ne účetnictví — když se článek nepovede,
    // zasedání i tak platí.
    logger.warn({ module: M }, `zápis ze zasedání ${leagueId} do zpravodaje`, e);
  }

  return { leagueId, closed: closedCount, passed: passedCount, balance };
}

/**
 * Prostá většina = ostře víc hlasů pro než proti (při rovnosti rozhoduje prezident).
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
  presidentTeamId: string | null,
): Promise<DecidedProposal | null> {
  const presidentVote = presidentTeamId
    ? (await db.prepare("SELECT answer FROM competition_ballots WHERE proposal_id = ? AND team_id = ?")
        .bind(p.id, presidentTeamId).first<{ answer: string }>()
        .catch((e) => { logger.warn({ module: M }, "hlas prezidenta", e); return null; }))?.answer ?? null
    : null;

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
  } else if (pro === proti && pro > 0 && p.majority <= SIMPLE_MAJORITY && presidentVote) {
    // Rovnost rozetne prezident soutěže. Je to jeho nadřízenost v praxi:
    // nehlasuje dvakrát, ale jeho hlas rozhoduje, když se grémium nedohodne.
    const forIt = presidentVote === "pro";
    status = forIt ? "passed" : "rejected";
    note = `${forIt ? "Přijato" : "Zamítnuto"} ${pro}:${proti} — při rovnosti rozhodl prezident soutěže.`;
  } else {
    status = "rejected";
    note = pro === proti && pro > 0
      ? `Zamítnuto ${pro}:${proti} — rovnost hlasů a prezident nehlasoval.`
      : `Zamítnuto ${pro}:${proti}${zdrzel ? ` (${zdrzel} se zdrželo)` : ""}.`;
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

  // Odvolání neprošlo → pozastavená pravomoc se vrací a prezident za to zaplatí.
  if (p.kind === "recall" && status !== "passed") {
    try {
      const payload = JSON.parse(p.payload || "{}") as { role?: string };
      if (payload.role) {
        await restoreOfficial(db, p.league_id, payload.role as never, p.season_number,
          p.proposed_by_team_id, gameDate);
      }
    } catch (e) {
      logger.warn({ module: M }, `navrácení pravomoci u návrhu ${p.id}`, e);
    }
  }

  // Sazebníkové změny se aplikují až při rolloveru — competition_rules se mid-season
  // zásadně needitují. Okamžitý dopad mají jen sankce, odvolání a bany rozhodčích.
  if (status === "passed") {
    await applyImmediateEffect(db, p, gameDate);
    if (p.deposit > 0) await refundDeposit(db, p, gameDate);
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
/**
 * Důsledky návrhů, které platí okamžitě. Sazebník sem nepatří — ten čeká na rollover.
 * Každá větev má vlastní idempotenci uvnitř, takže opakované volání nic nezdvojí.
 */
async function applyImmediateEffect(
  db: D1Database, p: OpenProposal, gameDate: string,
): Promise<void> {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(p.payload || "{}") as Record<string, unknown>; }
  catch (e) { logger.warn({ module: M }, `payload návrhu ${p.id} nejde přečíst`, e); return; }

  try {
    if (p.kind === "sanction" && p.target_team_id) {
      const { issueSanction } = await import("./discipline");
      await issueSanction(db, {
        leagueId: p.league_id, seasonNumber: p.season_number, teamId: p.target_team_id,
        amount: Number(payload.amount) || 0, kind: String(payload.offence ?? "other"),
        reason: String(payload.reason ?? p.title), evidence: (payload.evidence as string) ?? null,
        issuedBy: "vote", issuedByTeamId: p.proposed_by_team_id, proposalId: p.id, gameDate,
      });
      return;
    }

    if (p.kind === "appeal" && payload.sanctionId) {
      const { refundSanction } = await import("./discipline");
      await refundSanction(db, String(payload.sanctionId), gameDate);
      return;
    }

    if (p.kind === "recall" && payload.role) {
      await recallOfficial(db, p.league_id, payload.role as never, p.season_number, gameDate);
      return;
    }

    if (p.kind === "referee_ban" && payload.refereeId) {
      const { applyRefereeBan } = await import("./referee-bans");
      await applyRefereeBan(db, {
        leagueId: p.league_id, seasonNumber: p.season_number,
        refereeId: String(payload.refereeId), reason: String(payload.reason ?? p.title),
        source: "snem", proposalId: p.id, gameDate,
      });
      return;
    }

    // Pravidla soutěže (zákaz transferů, stav hřiště, velikost soupisky) platí
    // hned — nejsou to peníze, takže na rollover čekat nemusí. Název sloupce jde
    // výhradně z katalogu PROPOSAL_KINDS, nikdy z požadavku.
    const spec = PROPOSAL_KINDS[p.kind];
    if (spec?.rulesField && !spec.nextSeason && typeof payload.value === "number") {
      const field = spec.rulesField;
      if (!(field in DEFAULT_RULES)) {
        logger.error({ module: M }, `návrh ${p.kind} míří na neznámé pravidlo ${field}`);
        return;
      }
      await db.prepare(
        `UPDATE competition_rules SET ${field} = ? WHERE league_id = ? AND season_number = ?`
      ).bind(payload.value, p.league_id, p.season_number).run();
      logger.info({ module: M }, `soutěž ${p.league_id}: ${field} = ${payload.value}`);
      return;
    }
  } catch (e) {
    // Efekt nesmí shodit celé zasedání — návrh zůstane přijatý a chyba je v logu.
    logger.error({ module: M }, `aplikace důsledku návrhu ${p.id} (${p.kind}) selhala`, e);
  }
}

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
  const body = `Zasedání grémia soutěže (${leagueName}) projednalo ${n} ${bodu}: `
    + `${parts.join(", ") || "bez rozhodnutí"}. Zápis najdeš v sekci Grémium.`;

  for (const teamId of voters) {
    await sendSystemSMS(db, teamId, SMS_ROLE, body)
      .catch((e) => logger.warn({ module: M }, `SMS o schůzi pro tým ${teamId}`, e));
  }
}

export { PROPOSAL_KINDS };
