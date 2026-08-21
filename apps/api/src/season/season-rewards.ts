/**
 * Finanční odměny a změna reputace na konci sezóny — dle konečného pořadí.
 *
 * BEZ postupů/sestupů. 1. místo = největší odměna + nárůst reputace,
 * poslední = malá odměna + mírný pokles reputace.
 *
 * Idempotence: každá odměna má reference_id `season-{n}-rwd-{teamId}`;
 * reputace se mění jen současně s odměnou (gate na neexistenci transakce).
 */

import { recordTransaction } from "./finance-processor";
import type { StandingEntry } from "../stats/standings";
import { logger } from "../lib/logger";
import { DEFAULT_RULES } from "../competition/defaults";
import { readBalance, recordCompetitionEntry } from "../competition/ledger";
import { loadRules } from "../competition/rules";
import { scaledRewards } from "../competition/projection";

export interface SeasonRewardResult {
  teamId: string;
  pos: number;
  reward: number;
  managerRepDelta: number;
  teamRepDelta: number;
  skipped: boolean;
}

/** Násobič odměny dle úrovně soutěže (vyšší soutěž = vyšší příjmy). */
const LEVEL_MULT: Record<string, number> = {
  okresni_soutez: 0.85,
  okresni_prebor: 1.0,
  ib_trida: 1.2,
  ia_trida: 1.45,
  krajsky_prebor: 1.75,
};

export async function applySeasonRewards(
  db: D1Database,
  standings: StandingEntry[],
  seasonNumber: number,
  gameDate: string,
  level: string,
  leagueId?: string | null,
): Promise<SeasonRewardResult[]> {
  const n = standings.length;
  if (n === 0) return [];
  const levelMult = LEVEL_MULT[level] ?? 1.0;
  const results: SeasonRewardResult[] = [];

  // Soutěž se samosprávou platí odměny ze své pokladny a podle svého sazebníku.
  const rules = leagueId ? await loadRules(db, leagueId, seasonNumber) : null;

  // Když v pokladně nezbývá na plnou výplatu, krátí se VŠEM stejným poměrem.
  // Je to okamžitý a čitelný následek vlastního rozhodnutí: kluby si odhlasovaly
  // víc, než soutěž unese. Poměr se počítá jednou dopředu, aby nezáleželo na pořadí.
  let ratio = 1;
  let scaled: Map<string, number> | null = null;
  if (rules && leagueId) {
    const out = scaledRewards(rules, standings, level, await readBalance(db, leagueId));
    ratio = out.ratio;
    scaled = out.rewards;
    if (ratio < 1) {
      logger.warn({ module: "season-rewards" },
        `pokladna soutěže ${leagueId} nestačí na odměny (${out.required} Kč) — krácení na ${Math.round(ratio * 100)} %`);
    }
  }

  for (const entry of standings) {
    const { teamId, pos } = entry;
    // Mírná geometrická škála — 1. místo 150 000, každé další ×0,80 (každé místo jiné, žádný plateau),
    // floor 6 000 jako pojistka pro malé ligy (× násobič úrovně soutěže).
    // Se samosprávou jde vrchol, koeficient poklesu i floor ze sazebníku soutěže.
    const reward = scaled?.get(teamId)
      ?? Math.round(Math.max(DEFAULT_RULES.place_floor, DEFAULT_RULES.place_top * Math.pow(DEFAULT_RULES.place_decay, pos - 1)) * levelMult);
    const managerRepDelta = Math.round((n / 2 - pos + 0.5) * 1.5);
    const teamRepDelta = Math.round((n / 2 - pos + 0.5) * 0.8);
    const refId = `season-${seasonNumber}-rwd-${teamId}`;

    const exists = await db.prepare("SELECT 1 FROM transactions WHERE reference_id = ?").bind(refId).first();
    if (exists) {
      results.push({ teamId, pos, reward, managerRepDelta, teamRepDelta, skipped: true });
      continue;
    }

    // Transakce (kredit + idempotenční marker) NEJDŘÍV a BEZ .catch — když zápis selže, chyba MÁ
    // propadnout (throw → fáze vrátí "error" → zopakuje se). Dřív spolknutá do warn → tým tiše bez odměny.
    const kraceno = ratio < 1 ? ` — kráceno na ${Math.round(ratio * 100)} %` : "";
    await recordTransaction(
      db, teamId, "season_reward", reward,
      `Odměna za ${seasonNumber}. sezónu (${pos}. místo)${kraceno}`, gameDate, refId,
    );

    // Výdaj pokladny AŽ po markeru v transactions, ať retry fáze nezaúčtuje dvakrát.
    // Ledger má navíc vlastní gate na reference_id, takže drží obojí nezávisle.
    if (rules && leagueId && reward > 0) {
      await recordCompetitionEntry(db, {
        leagueId, seasonNumber, type: "place_reward", amount: -reward,
        description: `Odměna za ${pos}. místo${kraceno}`,
        teamId, gameDate, referenceId: `rwd-${seasonNumber}-${teamId}`,
      });
    }

    // Reputace AŽ PO markeru — na retry gate (exists) přeskočí celý tým, takže se reputace nepřičte podruhé.
    if (managerRepDelta !== 0) {
      const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
      await applyManagerAttrDelta(
        db, teamId, "reputation", managerRepDelta, "season_position",
        `Konečné ${pos}. místo v ${seasonNumber}. sezóně`,
        { referenceId: `mgr-season-${seasonNumber}-${teamId}-rep`, gameDate },
      );
    }
    if (teamRepDelta !== 0) {
      const { applyReputationDelta } = await import("../lib/reputation");
      await applyReputationDelta(
        db, teamId, teamRepDelta, "season_position",
        `Konečné ${pos}. místo v ${seasonNumber}. sezóně`,
        { referenceId: `season-${seasonNumber}-rep-${teamId}`, gameDate },
      );
    }

    results.push({ teamId, pos, reward, managerRepDelta, teamRepDelta, skipped: false });
  }
  return results;
}
