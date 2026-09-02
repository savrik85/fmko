/**
 * Kontrola pravidel, která si soutěž sama odhlasovala.
 *
 * Běží jednou týdně před zasedáním — funkcionáři si projdou soutěž a co najdou,
 * jde na stůl. Porušené pravidlo je plnohodnotný bod programu, takže se kvůli
 * němu zasedání sejde, i kdyby jinak nebylo o čem.
 *
 * Kontrola je rozdělená na čtení a trest schválně: čtení musí proběhnout dřív,
 * než se rozhodne, jestli se zasedání koná, a taky dřív, než se uzavřou návrhy —
 * pravidlo přijaté právě teď se tak vymáhá až od příštího týdne.
 *
 * Každé pravidlo je vypnuté (0), dokud si ho kluby neodhlasují. Soutěž se
 * zapnutou samosprávou a nedotčeným sazebníkem tedy nikomu nic nestrhne.
 */

import { logger } from "../lib/logger";
import { issueSanction } from "./discipline";
import type { CompetitionRules } from "./defaults";

const M = "competition-compliance";

export interface ComplianceHit {
  teamId: string;
  teamName: string;
  /** Co se porušilo — jde do popisu pokuty i do zápisu. */
  reason: string;
  detail: string;
}

interface TeamState {
  id: string;
  name: string;
  pitch: number | null;
  squad: number;
}

/**
 * Načte stav klubů soutěže pro kontrolu. Jen seniorské A-týmy — U21 zrcadlo má
 * vlastní soupisku i hřiště rodičovského klubu a pokutovat ho dvakrát nedává smysl.
 */
async function loadTeams(db: D1Database, leagueId: string): Promise<TeamState[]> {
  const rows = await db.prepare(
    `SELECT t.id, t.name,
            (SELECT s.pitch_condition FROM stadiums s WHERE s.team_id = t.id) AS pitch,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS squad
       FROM teams t
      WHERE t.league_id = ? AND t.team_type = 'senior' AND t.parent_team_id IS NULL`
  ).bind(leagueId).all<{ id: string; name: string; pitch: number | null; squad: number }>()
    .catch((e) => { logger.warn({ module: M }, `kluby soutěže ${leagueId}`, e); return { results: [] }; });
  return rows.results;
}

/** Co se v soutěži porušuje. Čistá funkce nad načteným stavem — testovatelná. */
export function findViolations(teams: TeamState[], rules: CompetitionRules): ComplianceHit[] {
  const out: ComplianceHit[] = [];

  for (const t of teams) {
    if (rules.min_pitch_condition > 0 && t.pitch !== null && t.pitch < rules.min_pitch_condition) {
      out.push({
        teamId: t.id, teamName: t.name,
        reason: "Hřiště pod hranicí soutěže",
        detail: `Stav trávníku ${t.pitch} ze 100, soutěž si odhlasovala minimum ${rules.min_pitch_condition}.`,
      });
    }

    if (rules.squad_min > 0 && t.squad < rules.squad_min) {
      out.push({
        teamId: t.id, teamName: t.name,
        reason: "Málo hráčů na soupisce",
        detail: `Na soupisce ${t.squad}, soutěž vyžaduje aspoň ${rules.squad_min}.`,
      });
    }

    if (rules.squad_max > 0 && t.squad > rules.squad_max) {
      out.push({
        teamId: t.id, teamName: t.name,
        reason: "Přeplněná soupiska",
        detail: `Na soupisce ${t.squad}, soutěž povoluje nejvýš ${rules.squad_max}.`,
      });
    }
  }

  return out;
}

/**
 * Co se v soutěži právě porušuje. Čte, nic nemění — proto se smí zavolat před
 * rozhodnutím, jestli se zasedání vůbec koná. Porušené pravidlo je totiž bod
 * programu stejně jako návrh; bez toho by se pravidla vymáhala jen v týdnech,
 * kdy někdo něco navrhl, což by z nich udělalo loterii.
 */
export async function collectCompliance(
  db: D1Database, leagueId: string, rules: CompetitionRules,
): Promise<ComplianceHit[]> {
  const nicSeNehlida = rules.min_pitch_condition <= 0 && rules.squad_min <= 0 && rules.squad_max <= 0;
  if (nicSeNehlida) return [];
  return findViolations(await loadTeams(db, leagueId), rules);
}

/**
 * Udělí pokuty za nalezená porušení.
 *
 * Když je sazba nula, kontrola proběhla a do zápisu se zapíše, ale peníze se
 * nehýbou — kluby si můžou pravidlo zavést dřív, než se dohodnou na trestu.
 * Idempotence stojí na klíči sankce: opakovaný běh téhož zasedání nepřipíše nic,
 * příští týden se pokuta udělí znovu.
 */
export async function punishCompliance(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  rules: CompetitionRules;
  gameDate: string;
  hits: ComplianceHit[];
}): Promise<void> {
  if (opts.hits.length === 0 || opts.rules.fine_rule <= 0) return;

  for (const h of opts.hits) {
    await issueSanction(db, {
      leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, teamId: h.teamId,
      amount: opts.rules.fine_rule, kind: "rule", reason: h.reason, evidence: h.detail,
      issuedBy: "rule", issuedByTeamId: null,
      proposalId: null, gameDate: opts.gameDate,
      referenceId: `rule-${opts.leagueId}-${h.teamId}-${h.reason}-${opts.gameDate.slice(0, 10)}`,
    }).catch((e) => logger.warn({ module: M }, `pokuta za pravidlo klubu ${h.teamId}`, e));
  }

  logger.info({ module: M }, `soutěž ${opts.leagueId}: pokuta za ${opts.hits.length} porušení pravidel`);
}

/**
 * Smí tenhle klub vidět přehled stavu hřišť celé soutěže?
 *
 * Předseda disciplinární rady ano — vymáhá hranici, kterou si kluby odhlasovaly,
 * takže musí vidět, kdo se k ní blíží. Prezident soutěže taky: je nadřízený
 * ostatním předsedům a bez přístupu by nemohl posoudit, jestli předseda koná.
 *
 * Nikdo další ne. Stav cizího trávníku je vstup do rozhodnutí o taktice
 * i o tom, koho na zasedání navrhnout k pokutě — plošně viditelný by z něj
 * udělal běžnou skautskou informaci, ne agendu odboru.
 */
export async function muzeNaHriste(
  db: D1Database, leagueId: string, teamId: string, seasonNumber: number,
): Promise<boolean> {
  const { actsFor, presidentOf } = await import("./officials");
  const predseda = await actsFor(db, leagueId, teamId, "disciplinarni", seasonNumber);
  if (predseda.ok) return true;
  const prezident = await presidentOf(db, leagueId, seasonNumber);
  return prezident?.teamId === teamId;
}

export interface PitchRow {
  teamId: string;
  teamName: string;
  pitch: number | null;
  capacity: number | null;
  /** Je pod hranicí, kterou si soutěž odhlasovala. */
  breaches: boolean;
}

/**
 * Stav hřišť soutěže, seřazený od nejhoršího — koho má disciplinárka řešit,
 * je nahoře. Jen seniorské A-týmy: U21 hraje na hřišti mateřského klubu
 * a v přehledu by stálo dvakrát.
 */
export async function pitchOverview(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<{ limit: number; teams: PitchRow[] }> {
  const { resolveRules } = await import("./rules");
  const rules = await resolveRules(db, leagueId, seasonNumber)
    .catch((e) => { logger.warn({ module: M }, "pravidla pro přehled hřišť", e); return null; });
  const limit = rules?.min_pitch_condition ?? 0;

  const rows = await db.prepare(
    `SELECT t.id, t.name, s.pitch_condition AS pitch, s.capacity
       FROM teams t
       LEFT JOIN stadiums s ON s.team_id = t.id
      WHERE t.league_id = ? AND t.team_type = 'senior' AND t.parent_team_id IS NULL
      ORDER BY s.pitch_condition ASC NULLS LAST, t.name`
  ).bind(leagueId).all<{ id: string; name: string; pitch: number | null; capacity: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "stav hřišť soutěže", e); return { results: [] }; });

  return {
    // Nula znamená, že si soutěž hranici neodhlasovala a hřiště se nehlídají.
    limit,
    teams: rows.results.map((t) => ({
      teamId: t.id, teamName: t.name, pitch: t.pitch, capacity: t.capacity,
      breaches: limit > 0 && t.pitch !== null && t.pitch < limit,
    })),
  };
}
