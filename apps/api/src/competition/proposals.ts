/**
 * Validace návrhů a výpočet kvóra.
 *
 * Kvórum se počítá z AKTIVNÍCH klubů, ne ze všech lidských. V poloprázdné lize
 * (Praha: 8 lidí, reálně aktivní zhruba polovina) by kvórum z celku nebylo nikdy
 * dosažitelné, každý návrh by padl na neusnášeníschopnost a samospráva by tiše umřela.
 */

import { logger } from "../lib/logger";
import {
  ACTIVITY_WINDOW_MEETINGS, BUDGET_KINDS, DEFAULT_RULES, MIN_QUORUM_VOTES,
  PROPOSAL_DEPOSIT, PROPOSAL_KINDS, SIMPLE_MAJORITY,
  type CompetitionRules, type Gesce, type ProposalSpec,
} from "./defaults";
import { checkBudget } from "./projection";
import { countAllClubs, listVoters } from "./rules";

const M = "competition-proposals";

export interface VoterStats {
  /** Všechny kluby s hlasovacím právem. */
  voters: string[];
  /** Z nich ti, kdo hlasovali aspoň v jedné ze tří posledních schůzí. */
  active: string[];
  /** Kolik hlasů musí padnout, aby byla schůze usnášeníschopná. */
  quorumNeeded: number;
}

/**
 * Kdo se počítá do kvóra.
 * Dokud soutěž nemá za sebou tři schůze, jsou aktivní všichni — jinak by první
 * hlasování nikdy neprošlo.
 */
export async function voterStats(
  db: D1Database, leagueId: string, quorumRatio = 0.5,
): Promise<VoterStats> {
  const voters = await listVoters(db, leagueId);
  if (voters.length === 0) return { voters, active: [], quorumNeeded: MIN_QUORUM_VOTES };

  const meetings = await db.prepare(
    `SELECT game_date FROM competition_meetings WHERE league_id = ?
      ORDER BY game_date DESC LIMIT ?`
  ).bind(leagueId, ACTIVITY_WINDOW_MEETINGS).all<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: M }, `historie schůzí ${leagueId}`, e); return { results: [] }; });

  let active = voters;
  if (meetings.results.length >= ACTIVITY_WINDOW_MEETINGS) {
    const dates = meetings.results.map((r) => r.game_date);
    const placeholders = dates.map(() => "?").join(",");
    const rows = await db.prepare(
      `SELECT DISTINCT b.team_id FROM competition_ballots b
         JOIN competition_proposals p ON p.id = b.proposal_id
        WHERE p.league_id = ? AND p.closed_game_date IN (${placeholders})`
    ).bind(leagueId, ...dates).all<{ team_id: string }>()
      .catch((e) => { logger.warn({ module: M }, `aktivní kluby ${leagueId}`, e); return null; });

    if (rows) {
      const voted = new Set(rows.results.map((r) => r.team_id));
      // Klub, který vstoupil až po nejstarší sledované schůzi, nemohl hlasovat — bereme ho jako aktivní.
      const oldest = dates[dates.length - 1];
      const fresh = await db.prepare(
        "SELECT id FROM teams WHERE league_id = ? AND created_at > ?"
      ).bind(leagueId, oldest).all<{ id: string }>()
        .catch(() => ({ results: [] as Array<{ id: string }> }));
      for (const f of fresh.results) voted.add(f.id);

      const filtered = voters.filter((v) => voted.has(v));
      if (filtered.length > 0) active = filtered;
    }
  }

  const quorumNeeded = Math.max(MIN_QUORUM_VOTES, Math.ceil(quorumRatio * active.length));
  return { voters, active, quorumNeeded };
}

export interface ValidationOk {
  ok: true;
  spec: ProposalSpec;
  gesce: Gesce;
  majority: number;
  value: number;
  effectiveFromSeason: number | null;
  deposit: number;
  /** Popis dopadu na rozpočet, když jde o sazebníkový návrh. */
  budgetNote: string | null;
}
export interface ValidationErr { ok: false; error: string }
export type Validation = ValidationOk | ValidationErr;

const czk = (n: number) => `${Math.round(n).toLocaleString("cs")} Kč`;

/**
 * Ověří jeden návrh proti katalogu, rozsahům a rozpočtovému stropu.
 *
 * Rozsahy se kontrolují na serveru nezávisle na UI — formulář je jen nápověda.
 */
export async function validateProposal(opts: {
  db: D1Database;
  leagueId: string;
  level: string;
  seasonNumber: number;
  currentRules: CompetitionRules;
  balance: number;
  kind: string;
  value: number;
}): Promise<Validation> {
  const spec = PROPOSAL_KINDS[opts.kind];
  if (!spec) return { ok: false, error: "Neznámý typ návrhu." };

  if (!Number.isFinite(opts.value)) return { ok: false, error: "Chybí hodnota návrhu." };
  const min = spec.min ?? Number.NEGATIVE_INFINITY;
  const max = spec.max ?? Number.POSITIVE_INFINITY;
  if (opts.value < min || opts.value > max) {
    return { ok: false, error: `Hodnota musí být mezi ${min.toLocaleString("cs")} a ${max.toLocaleString("cs")}.` };
  }

  if (spec.rulesField && opts.currentRules[spec.rulesField] === opts.value) {
    return { ok: false, error: "Návrh nic nemění — tahle hodnota už platí." };
  }

  let budgetNote: string | null = null;
  if (BUDGET_KINDS.has(opts.kind) && spec.rulesField) {
    const teams = await countAllClubs(opts.db, opts.leagueId);
    const proposed: CompetitionRules = { ...opts.currentRules, [spec.rulesField]: opts.value };
    const check = checkBudget({
      rules: proposed, teams, level: opts.level, balance: opts.balance,
    });
    if (!check.ok) {
      return {
        ok: false,
        error: `Návrh nelze podat — pokladně by chybělo ${czk(check.deficit)}. `
          + `Zvedněte startovné na ${czk(check.requiredEntryFee)}, nebo sežeňte sponzora.`,
      };
    }
    const current = checkBudget({ rules: opts.currentRules, teams, level: opts.level, balance: opts.balance });
    const delta = check.projected - current.projected;
    budgetNote = delta === 0
      ? "Na rozpočet soutěže to nemá vliv."
      : `Dopad na rozpočet soutěže: ${delta > 0 ? "+" : "−"}${czk(Math.abs(delta))} za sezónu.`;
  }

  return {
    ok: true,
    spec,
    gesce: spec.gesce,
    majority: spec.majority ?? SIMPLE_MAJORITY,
    value: opts.value,
    effectiveFromSeason: spec.nextSeason ? opts.seasonNumber + 1 : null,
    deposit: PROPOSAL_DEPOSIT,
    budgetNote,
  };
}

/** Čitelný titulek návrhu — do zápisu i do seznamu. */
export function proposalTitle(kind: string, value: number, current: number): string {
  const spec = PROPOSAL_KINDS[kind];
  if (!spec) return "Návrh";
  const fmt = (v: number) => {
    if (kind === "place_decay") return v.toFixed(2);
    if (kind === "fine_mult") return `${v.toFixed(1)}×`;
    if (kind.endsWith("_pct")) return `${v} %`;
    if (kind === "ban_own_owner_transfers") return v ? "zavést" : "zrušit";
    return `${Math.round(v).toLocaleString("cs")} Kč`;
  };
  if (kind === "ban_own_owner_transfers") return `${spec.label} — ${fmt(value)}`;
  return `${spec.label}: ${fmt(current)} → ${fmt(value)}`;
}

/** Sazebník po aplikaci schválených návrhů — používá rollover. */
export function applyPassedToRules(
  base: CompetitionRules, passed: Array<{ kind: string; value: number }>,
): CompetitionRules {
  const out = { ...base };
  for (const p of passed) {
    const spec = PROPOSAL_KINDS[p.kind];
    if (!spec?.rulesField) continue;
    const min = spec.min ?? Number.NEGATIVE_INFINITY;
    const max = spec.max ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(p.value) || p.value < min || p.value > max) {
      logger.warn({ module: M }, `schválený návrh ${p.kind} má hodnotu mimo rozsah (${p.value}), ignoruji`);
      continue;
    }
    out[spec.rulesField] = p.value;
  }
  return out;
}

export const BASE_RULES = { ...DEFAULT_RULES } as CompetitionRules;
