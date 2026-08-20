/**
 * Volby předsedů odborů a jejich mandáty.
 *
 * Volba je TAJNÁ napořád — na rozdíl od hlasování o návrzích se ani po uzavření
 * neodkrývá, kdo koho volil. Kdyby bylo vidět, nikdo nepůjde proti favoritovi
 * a každá volba dopadne jednomyslně.
 *
 * Kandidovat může každý klub s hlasovacím právem. Jediné omezení je, že jeden klub
 * může zastávat nejvýš jednu funkci — o zbytku rozhodnou voliči.
 */

import { logger } from "../lib/logger";
import { FULL_BOARD_CLUBS, ROLE_LABEL, type OfficialRole } from "./defaults";
import { countHumanClubs, listVoters } from "./rules";

const M = "competition-officials";

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
 *
 * Na jednu funkci a sezónu je v tabulce jediný řádek (UNIQUE), takže samotný
 * INSERT OR IGNORE by doplňovací volbu nikdy nevyhlásil: funkce, na kterou nikdo
 * nekandidoval, ani ta po odvolání předsedy, by zůstala prázdná do konce sezóny.
 * Uzavřená volba se proto u neobsazené funkce otevře znovu — a začíná načisto,
 * bez starých kandidatur a hlasů, jinak by se do doplňovací volby přelily hlasy
 * z té minulé.
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
    if ((res?.meta?.changes ?? 0) > 0) { opened++; continue; }

    // Řádek už existuje. Běží-li volba, není co dělat; uzavřená se u neobsazené
    // funkce otevře znovu jako doplňovací.
    const existing = await db.prepare(
      "SELECT id, status FROM competition_elections WHERE league_id = ? AND role = ? AND season_number = ?"
    ).bind(leagueId, role, seasonNumber).first<{ id: string; status: string }>()
      .catch((e) => { logger.warn({ module: M }, `stav voleb ${role}`, e); return null; });
    if (!existing || existing.status === "open") continue;

    const revived = await db.prepare(
      `UPDATE competition_elections
          SET status = 'open', opened_game_date = ?, closed_game_date = NULL,
              winner_team_id = NULL, candidates = 0, votes_cast = 0, result_note = NULL
        WHERE id = ? AND status != 'open'`
    ).bind(gameDate, existing.id).run()
      .catch((e) => { logger.warn({ module: M }, `doplňovací volba ${role}`, e); return null; });
    if (!revived || (revived.meta?.changes ?? 0) === 0) continue;

    // Načisto: staré hlasy ani kandidatury do doplňovací volby nepatří.
    await db.prepare("DELETE FROM competition_election_ballots WHERE election_id = ?")
      .bind(existing.id).run()
      .catch((e) => logger.warn({ module: M }, `úklid hlasů ${role}`, e));
    await db.prepare("DELETE FROM competition_candidacies WHERE election_id = ?")
      .bind(existing.id).run()
      .catch((e) => logger.warn({ module: M }, `úklid kandidatur ${role}`, e));

    opened++;
    logger.info({ module: M }, `soutěž ${leagueId}: doplňovací volba na ${ROLE_LABEL[role]}`);
  }

  if (opened > 0) {
    logger.info({ module: M }, `soutěž ${leagueId}: vyhlášeno ${opened} voleb na ${seasonNumber}. sezónu`);
  }
  return opened;
}

export interface CandidacyCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Smí klub kandidovat? Dvě podmínky, každá se svým důvodem, ať UI ví, co říct.
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

  return { ok: true };
}

/**
 * Věta o výsledku volby. ZÁMĚRNĚ bez jména zvoleného — to se v UI i v zápisu
 * vypisuje zvlášť a jinak by tam stálo dvakrát.
 *
 * Hlasy pro kandidáta, který mezitím odstoupil, propadají — a musí to být vidět,
 * jinak by čísla nesouhlasila s tím, kolik klubů skutečně hlasovalo.
 */
export function electionNote(
  winner: { votes: number } | null | undefined,
  platnychHlasu: number,
  propadlychHlasu: number,
): string {
  const dovetek = propadlychHlasu > 0
    ? ` ${propadlychHlasu} ${propadlychHlasu === 1 ? "hlas propadl" : propadlychHlasu <= 4 ? "hlasy propadly" : "hlasů propadlo"}`
      + " — kandidát odstoupil."
    : "";

  if (!winner) {
    return propadlychHlasu > 0
      ? `Volba dopadla naprázdno — všichni kandidáti odstoupili.${dovetek}`
      : "Nikdo nekandidoval — funkce zůstává neobsazená.";
  }

  // „Získal", ne „Zvolen": v zápisu tomu předchází jméno se slovem Zvolen a stálo
  // by tam dvakrát. Samostatně pod jménem v UI to čte stejně dobře.
  return `Získal ${winner.votes} z ${platnychHlasu} `
    + `${platnychHlasu === 1 ? "hlasu" : "hlasů"}.${dovetek}`;
}

/** Jak se zvolený podepíše — jméno trenéra a klub, když obojí známe. */
export function winnerLabel(managerName: string | null, teamName: string | null): string {
  const jmeno = managerName ?? teamName ?? "neznámý trenér";
  return managerName && teamName ? `${jmeno} (${teamName})` : jmeno;
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
): Promise<Array<{ role: OfficialRole; winnerTeamId: string | null; winner: string | null; note: string }>> {
  const due = await db.prepare(
    `SELECT * FROM competition_elections
      WHERE league_id = ? AND status = 'open' AND opened_game_date < ?`
  ).bind(leagueId, gameDate).all<ElectionRow>()
    .catch((e) => { logger.warn({ module: M }, "splatné volby", e); return { results: [] }; });

  const out: Array<{ role: OfficialRole; winnerTeamId: string | null; winner: string | null; note: string }> = [];

  for (const el of due.results) {
    // Dvě věci, na kterých stojí poctivost volby:
    //
    // 1) JOIN na kandidatury s `withdrawn = 0`. Bez něj vyhrál i kandidát, který
    //    mezitím odstoupil — v UI už nebyl v seznamu, ale hlasy mu zůstaly
    //    a stal se předsedou. Ověřeno na testovací DB.
    // 2) Reputace i jméno poddotazem, NIKDY přes JOIN na managers: tým může mít
    //    v tabulce dva řádky (existuje takový) a join by každý hlas zdvojil.
    const tally = await db.prepare(
      `SELECT b.candidate_team_id AS team_id, COUNT(*) AS votes,
              COALESCE((SELECT m.reputation FROM managers m
                         WHERE m.team_id = b.candidate_team_id
                         ORDER BY m.created_at LIMIT 1), 0) AS rep,
              (SELECT m.name FROM managers m
                WHERE m.team_id = b.candidate_team_id
                ORDER BY m.created_at LIMIT 1) AS manager_name,
              (SELECT t.name FROM teams t WHERE t.id = b.candidate_team_id) AS team_name
         FROM competition_election_ballots b
         JOIN competition_candidacies c
           ON c.election_id = b.election_id AND c.team_id = b.candidate_team_id
          AND c.withdrawn = 0
        WHERE b.election_id = ?
        GROUP BY b.candidate_team_id
        ORDER BY votes DESC, rep DESC, b.candidate_team_id ASC`
    ).bind(el.id).all<{
      team_id: string; votes: number; rep: number;
      manager_name: string | null; team_name: string | null;
    }>()
      .catch((e) => { logger.warn({ module: M }, `sečtení voleb ${el.id}`, e); return { results: [] }; });

    const odevzdano = await db.prepare(
      "SELECT COUNT(*) AS n FROM competition_election_ballots WHERE election_id = ?"
    ).bind(el.id).first<{ n: number }>()
      .catch((e) => { logger.warn({ module: M }, `odevzdané hlasy ${el.id}`, e); return null; });

    const totalVotes = tally.results.reduce((s, r) => s + r.votes, 0);
    const propadlo = Math.max(0, (odevzdano?.n ?? totalVotes) - totalVotes);
    const winner = tally.results[0] ?? null;

    const status = winner ? "decided" : "failed";
    // Volba je tajná, ale kdo ji vyhrál se v zápisu tají těžko — a hráč to chce vědět.
    const note = electionNote(winner && { votes: winner.votes }, totalVotes, propadlo);
    const label = winner ? winnerLabel(winner.manager_name, winner.team_name) : null;

    // Atomický lock: efekt smí aplikovat jen ten běh, který volby opravdu uzavřel.
    const locked = await db.prepare(
      `UPDATE competition_elections
          SET status = ?, closed_game_date = ?, winner_team_id = ?, votes_cast = ?, result_note = ?
        WHERE id = ? AND status = 'open'`
    ).bind(status, gameDate, winner?.team_id ?? null, totalVotes, note, el.id).run()
      .catch((e) => { logger.warn({ module: M }, `uzavření voleb ${el.id}`, e); return null; });
    if (!locked || (locked.meta?.changes ?? 0) === 0) continue;

    if (winner) {
      // OR IGNORE kvůli částečnému unikátnímu indexu na obsazenou funkci. Kdyby
      // se role mezitím zaplnila, volba by jinak hlásila „Zvolen X" a X by přitom
      // v žádné funkci neseděl — a to je horší než hlasitá chyba v logu.
      const zapsan = await db.prepare(
        `INSERT OR IGNORE INTO competition_officials
          (id, league_id, role, team_id, season_number, elected_game_date)
         VALUES (?,?,?,?,?,?)`
      ).bind(crypto.randomUUID(), leagueId, el.role, winner.team_id, seasonNumber, gameDate).run()
        .catch((e) => { logger.error({ module: M }, `zápis funkcionáře ${el.role}`, e); return null; });

      if (!zapsan || (zapsan.meta?.changes ?? 0) === 0) {
        logger.error(
          { module: M },
          `soutěž ${leagueId}: volbu ${el.role} vyhrál ${winner.team_id}, ale funkci se nepodařilo obsadit`,
        );
      } else {
        // Odsloužený mandát se odmění až na konci; zvolení samo o sobě je jen titul.
        logger.info({ module: M }, `soutěž ${leagueId}: ${ROLE_LABEL[el.role]} — zvolen ${winner.team_id}`);
      }
    }

    out.push({ role: el.role, winnerTeamId: winner?.team_id ?? null, winner: label, note });
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

/**
 * Prezident soutěže je nadřízený ostatním předsedům. Nadřízenost není titul,
 * ale tři konkrétní pravomoci:
 *
 *  1. při rovnosti hlasů rozhoduje on (viz hasMajority v meeting.ts),
 *  2. může jinému předsedovi pozastavit pravomoc — a tím rovnou otevřít
 *     hlasování o jeho odvolání,
 *  3. zastupuje každou neobsazenou funkci, takže soutěž nezůstane bez rozhodnutí.
 *
 * Pozastavení je jednorázové za sezónu a nese riziko: když kluby odvolání
 * neschválí, pravomoc se vrátí a prezident vypadá, že si vyřizoval účty.
 */

/** Kdo je prezident soutěže — nebo null, když je funkce neobsazená. */
export async function presidentOf(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<{ teamId: string; status: string } | null> {
  const row = await db.prepare(
    `SELECT team_id, status FROM competition_officials
      WHERE league_id = ? AND role = 'predseda' AND season_number = ? AND status = 'active'`
  ).bind(leagueId, seasonNumber).first<{ team_id: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "prezident soutěže", e); return null; });
  return row ? { teamId: row.team_id, status: row.status } : null;
}

/**
 * Smí tenhle klub jednat v dané gesci?
 *
 * Buď je jejím předsedou, nebo je prezident a funkce je neobsazená. Prezident
 * NEPŘEBÍRÁ pravomoc obsazené funkce — to už by nebyla nadřízenost, ale diktatura.
 */
export async function actsFor(
  db: D1Database, leagueId: string, teamId: string, role: OfficialRole, seasonNumber: number,
): Promise<{ ok: boolean; asPresident: boolean; reason?: string }> {
  const holder = await db.prepare(
    `SELECT team_id, status FROM competition_officials
      WHERE league_id = ? AND role = ? AND season_number = ? AND status IN ('active','suspended')`
  ).bind(leagueId, role, seasonNumber).first<{ team_id: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, `držitel funkce ${role}`, e); return null; });

  if (holder?.team_id === teamId) {
    if (holder.status === "suspended") {
      return { ok: false, asPresident: false, reason: "Prezident ti pravomoc pozastavil. Rozhodne o tom nejbližší zasedání." };
    }
    return { ok: true, asPresident: false };
  }

  if (holder) {
    return { ok: false, asPresident: false, reason: `Tuhle pravomoc má ${ROLE_LABEL[role]}.` };
  }

  const president = await presidentOf(db, leagueId, seasonNumber);
  if (president?.teamId === teamId) return { ok: true, asPresident: true };

  return {
    ok: false, asPresident: false,
    reason: `Funkce ${ROLE_LABEL[role]} je neobsazená — zastupuje ji prezident soutěže.`,
  };
}

export interface SuspendResult { ok: boolean; reason?: string; proposalId?: string }

/**
 * Prezident pozastaví pravomoc jinému předsedovi a tím otevře hlasování o odvolání.
 * Do rozhodnutí zasedání ten předseda nesmí jednat, ale zůstává ve vedení a hlasuje.
 */
export async function suspendOfficial(db: D1Database, opts: {
  leagueId: string; seasonNumber: number; presidentTeamId: string;
  role: OfficialRole; reason: string; gameDate: string;
}): Promise<SuspendResult> {
  if (opts.role === "predseda") {
    return { ok: false, reason: "Sám sebe pozastavit nemůžeš. Odvolat prezidenta můžou jen kluby." };
  }

  const pres = await db.prepare(
    `SELECT team_id, used_suspend FROM competition_officials
      WHERE league_id = ? AND role = 'predseda' AND season_number = ? AND status = 'active'`
  ).bind(opts.leagueId, opts.seasonNumber).first<{ team_id: string; used_suspend: number }>()
    .catch((e) => { logger.warn({ module: M }, "prezident", e); return null; });

  if (!pres || pres.team_id !== opts.presidentTeamId) {
    return { ok: false, reason: "Tuhle pravomoc má jen prezident soutěže." };
  }
  // Sezónní strop tu vědomě NENÍ. Brzdou je cena: každé pozastavení otevře
  // hlasování o odvolání, a když neprojde, prezident přijde o pět bodů reputace.
  // Kdo si vyřizuje účty, odnese si to sám — počítat mu to navíc nemusíme.

  const target = await db.prepare(
    `SELECT team_id FROM competition_officials
      WHERE league_id = ? AND role = ? AND season_number = ? AND status = 'active'`
  ).bind(opts.leagueId, opts.role, opts.seasonNumber).first<{ team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "držitel funkce", e); return null; });
  if (!target) return { ok: false, reason: "Tahle funkce není obsazená." };

  const locked = await db.prepare(
    `UPDATE competition_officials SET status = 'suspended'
      WHERE league_id = ? AND role = ? AND season_number = ? AND status = 'active'`
  ).bind(opts.leagueId, opts.role, opts.seasonNumber).run()
    .catch((e) => { logger.error({ module: M }, "pozastavení pravomoci", e); return null; });
  if (!locked || (locked.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: "Pravomoc se nepodařilo pozastavit." };
  }

  await db.prepare(
    `UPDATE competition_officials SET used_suspend = used_suspend + 1
      WHERE league_id = ? AND role = 'predseda' AND season_number = ? AND status = 'active'`
  ).bind(opts.leagueId, opts.seasonNumber).run()
    .catch((e) => logger.warn({ module: M }, "čerpání pozastavení", e));

  // Pozastavení samo o sobě nestačí — musí o něm rozhodnout zasedání.
  const proposalId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO competition_proposals
      (id, league_id, season_number, kind, gesce, title, body, payload, proposed_by_team_id,
       target_team_id, majority, quorum, opened_game_date, deposit)
     VALUES (?,?,?,'recall','soutez',?,?,?,?,?,?,?,?,0)`
  ).bind(
    proposalId, opts.leagueId, opts.seasonNumber,
    `Odvolání z funkce ${ROLE_LABEL[opts.role]}`,
    opts.reason.slice(0, 300),
    JSON.stringify({ role: opts.role, targetTeamId: target.team_id }),
    opts.presidentTeamId, target.team_id, 2 / 3, 0.5, opts.gameDate,
  ).run().catch((e) => { logger.error({ module: M }, "návrh na odvolání", e); return null; });

  try {
    const { sendSystemSMS } = await import("../messaging/system-sms");
    await sendSystemSMS(db, target.team_id, "Sekretariát grémia",
      `Prezident soutěže ti pozastavil pravomoc ${ROLE_LABEL[opts.role]}. `
      + `O odvolání z funkce rozhodne nejbližší zasedání grémia. Do té doby nejednáš, ale hlasuješ.`);
  } catch (e) {
    logger.warn({ module: M }, "SMS o pozastavení", e);
  }

  logger.info({ module: M }, `soutěž ${opts.leagueId}: prezident pozastavil ${opts.role}`);
  return { ok: true, proposalId };
}

/** Odvolání prošlo — funkce se uvolní a mandát se zapíše jako odvolaný. */
export async function recallOfficial(
  db: D1Database, leagueId: string, role: OfficialRole, seasonNumber: number, gameDate: string,
): Promise<boolean> {
  const holder = await db.prepare(
    `SELECT team_id FROM competition_officials
      WHERE league_id = ? AND role = ? AND season_number = ? AND status IN ('active','suspended')`
  ).bind(leagueId, role, seasonNumber).first<{ team_id: string }>()
    .catch(() => null);
  if (!holder) return false;

  const res = await db.prepare(
    `UPDATE competition_officials SET status = 'recalled', ended_game_date = ?
      WHERE league_id = ? AND role = ? AND season_number = ? AND status IN ('active','suspended')`
  ).bind(gameDate, leagueId, role, seasonNumber).run()
    .catch((e) => { logger.error({ module: M }, "odvolání funkcionáře", e); return null; });
  if (!res || (res.meta?.changes ?? 0) === 0) return false;

  await applyTermReputation(db, holder.team_id, "recalled", role, seasonNumber, gameDate);
  await openElections(db, leagueId, seasonNumber, gameDate);
  return true;
}

/** Odvolání neprošlo — pravomoc se vrací a prezident za to zaplatí reputací. */
export async function restoreOfficial(
  db: D1Database, leagueId: string, role: OfficialRole, seasonNumber: number,
  presidentTeamId: string | null, gameDate: string,
): Promise<void> {
  await db.prepare(
    `UPDATE competition_officials SET status = 'active'
      WHERE league_id = ? AND role = ? AND season_number = ? AND status = 'suspended'`
  ).bind(leagueId, role, seasonNumber).run()
    .catch((e) => logger.warn({ module: M }, "navrácení pravomoci", e));

  if (!presidentTeamId) return;
  try {
    const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
    await applyManagerAttrDelta(
      db, presidentTeamId, "reputation", -5, "competition_office",
      `Neúspěšné pozastavení pravomoci (${ROLE_LABEL[role]})`,
      { referenceId: `suspend-fail-${seasonNumber}-${role}-${leagueId}`, gameDate },
    );
  } catch (e) {
    logger.warn({ module: M }, "reputace za neúspěšné pozastavení", e);
  }
}
