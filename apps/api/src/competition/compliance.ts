/**
 * Kontrola pravidel, která si soutěž sama odhlasovala.
 *
 * Běží jednou týdně před zasedáním. Proč zrovna tam: zasedání je jediné místo
 * v celé samosprávě, které je idempotentní na úrovni celého běhu, takže se
 * pokuta nemůže udělit dvakrát, i kdyby fronta doručila tick opakovaně. Navíc
 * to sedí na fikci — funkcionáři si projdou soutěž a co najdou, jde na stůl.
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
 * Projde soutěž a udělí pokuty za porušená pravidla.
 *
 * Vrací, co se našlo, aby to šlo napsat do zápisu. Když je sazba pokuty nula,
 * kontrola proběhne a do zápisu se zapíše, ale peníze se nehýbou — kluby si
 * můžou pravidlo zavést dřív, než se dohodnou na trestu.
 */
export async function runCompliance(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  rules: CompetitionRules;
  gameDate: string;
}): Promise<ComplianceHit[]> {
  const { rules } = opts;
  const nicSeNehlida = rules.min_pitch_condition <= 0 && rules.squad_min <= 0 && rules.squad_max <= 0;
  if (nicSeNehlida) return [];

  const teams = await loadTeams(db, opts.leagueId);
  const hits = findViolations(teams, rules);
  if (hits.length === 0) return [];

  if (rules.fine_rule > 0) {
    for (const h of hits) {
      // reference_id nese herní datum kontroly, takže opakovaný běh téhož
      // zasedání nepřipíše nic navíc, ale příští týden se pokuta udělí znovu.
      await issueSanction(db, {
        leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, teamId: h.teamId,
        amount: rules.fine_rule, kind: "rule", reason: h.reason, evidence: h.detail,
        issuedBy: "rule", issuedByTeamId: null,
        proposalId: null, gameDate: opts.gameDate,
        referenceId: `rule-${opts.leagueId}-${h.teamId}-${h.reason}-${opts.gameDate.slice(0, 10)}`,
      }).catch((e) => logger.warn({ module: M }, `pokuta za pravidlo klubu ${h.teamId}`, e));
    }
  }

  logger.info({ module: M }, `soutěž ${opts.leagueId}: kontrola pravidel našla ${hits.length} porušení`);
  return hits;
}
