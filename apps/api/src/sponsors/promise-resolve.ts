/**
 * Sliby sponzorům (etapa 3): důsledky vyhodnocení. Nárok na slib, bonus nebo pokuta,
 * náklonnost majitele, počítadlo porušení, výpověď sponzorem a SMS majitele.
 *
 * Atomicita a idempotence: nárok na slib a jeho peníze, náklonnost a počítadlo porušení
 * jdou v JEDNÉ dávce D1 (transakce). Nárok (`UPDATE … WHERE status = 'pending'`) zapíše do
 * `resolved_at` jednorázovou značku tohoto běhu, ostatní příkazy dávky platí jen, když slib
 * tu značku nese (`claimGuard`), a poslední příkaz značku přepíše na herní datum. Souběžný
 * běh, který slib nenárokoval, tak nic nepřipíše, a když dávka spadne, nezapíše se nic:
 * `fulfilled` vždycky znamená „bonus vyplacený" (vratka zálohy v signing.ts s tím počítá).
 * Sliby smluv, které už nejsou aktivní, se nenárokují a zůstávají čekat.
 */
import { logger } from "../lib/logger";
import { applyReputationDelta } from "../lib/reputation";
import { sendSystemSMS } from "../lib/sms";
import { recordTransaction } from "../season/finance-processor";
import { favorDeltaStmts } from "./favor";
import { enqueueOwnerSms } from "./owner-sms";
import {
  parsePromiseParams, promiseConsequence, promiseFavorReason, promiseLabel, promiseSmsPlan, promiseTransactionText,
  sponsorTerminates, TERMINATION_REPUTATION, type PromiseKind, type PromiseOutcome,
} from "./promise-eval";
import { contractClawback, loadAdvanceContract, loadTeamSeasonProgress, moneyStatements, type Guard } from "./signing";

const M = "sponsor-promises";

/** Řádek `sponsor_promises` (migrace 0221). */
export interface PromiseRow {
  id: string;
  contract_id: string;
  team_id: string;
  sponsor_id: number;
  kind: string;
  params: string | null;
  season: number | null;
  deadline_game_date: string | null;
  reward: number;
  penalty: number;
  status: string;
}

/** Smlouva, ke které sliby patří. */
export interface ContractRow {
  id: string;
  team_id: string;
  sponsor_id: number;
  sponsor_name: string;
  category: string | null;
  seasons_remaining: number;
}

export interface PromiseEvaluation {
  row: PromiseRow;
  kind: PromiseKind;
  outcome: PromiseOutcome;
  actual: number | null;
}

export interface ResolveContext {
  /** Herní ISO datum pro transakce a `resolved_at`. */
  gameDate: string;
  /** Herní den YYYY-MM-DD pro frontu SMS majitelů. */
  day: string;
  /**
   * Postup sezóny v měsících pro vratku zálohy při výpovědi sponzorem. Chybí = spočítá se
   * z kalendáře klubu (loadTeamSeasonProgress). Rollover (krok 4a běží až po návratu herního
   * času na začátek nové sezóny, ale před odečtením seasons_remaining) MUSÍ předat
   * MONTHS_PER_SEASON: stará sezóna je celá odehraná, jinak by se vratka nadsadila až o sezónu.
   */
  progressMonths?: number;
  /** Počet kol poháru pro popisek slibu cup_round (výchozí DEFAULT_CUP_ROUNDS). */
  cupTotalRounds?: number;
}

export interface ContractOutcomesResult {
  /** Sliby, které tenhle běh nárokoval a připsal. */
  applied: PromiseEvaluation[];
  /** Sponzor v tomhle běhu smlouvu vypověděl. */
  terminated: boolean;
  /** Firma, která smlouvu vypověděla (`district_sponsors.id`), jinak null. Volající ji vyřadí ze sezónních SMS. */
  terminatedSponsorId: number | null;
}

function labelOf(e: PromiseEvaluation, ctx: ResolveContext): string {
  return promiseLabel(e.kind, parsePromiseParams(e.row.params) ?? {}, ctx.cupTotalRounds);
}

/** Podmínka „slib nárokoval právě tenhle běh" (značka v resolved_at). */
export function claimGuard(promiseId: string, token: string): Guard {
  return { sql: "EXISTS (SELECT 1 FROM sponsor_promises WHERE id = ? AND resolved_at = ?)", params: [promiseId, token] };
}

/**
 * Nárok na slib a jeho důsledky v jedné dávce: stav a naměřená hodnota, bonus nebo pokuta
 * (transakce s referencí `promise:<id>`), náklonnost s deníkem, u porušení počítadlo
 * `breaches_season`. Nárok jen u čekajícího slibu aktivní smlouvy.
 * `true` = tenhle běh slib vyřídil; `false` = už vyřízený, smlouva neaktivní, nebo nic.
 * Když dávka spadne, výjimka letí dál a nic se nezapsalo.
 */
export async function resolvePromise(
  db: D1Database, contract: ContractRow, ev: PromiseEvaluation, ctx: ResolveContext,
): Promise<boolean> {
  const id = ev.row.id;
  const teamId = contract.team_id;
  const label = labelOf(ev, ctx);
  const cons = promiseConsequence(ev.outcome, ev.row.reward, ev.row.penalty);
  const token = `claim:${crypto.randomUUID()}`;
  const guard = claimGuard(id, token);

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE sponsor_promises SET status = ?, actual_value = ?, resolved_at = ?
       WHERE id = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM sponsor_contracts WHERE id = ? AND status = 'active')`,
    ).bind(ev.outcome, ev.actual, token, id, contract.id),
  ];
  if (cons.txType && cons.money !== 0) {
    stmts.push(...moneyStatements(db, teamId, cons.txType, cons.money,
      promiseTransactionText(ev.outcome, contract.sponsor_name, label), ctx.gameDate, `promise:${id}`, guard));
  }
  stmts.push(...favorDeltaStmts(db, ev.row.sponsor_id, teamId, cons.favorDelta, promiseFavorReason(ev.outcome, label), guard));
  if (cons.breach) {
    stmts.push(db.prepare(
      `UPDATE sponsor_contracts SET breaches_season = breaches_season + 1 WHERE id = ? AND ${guard.sql}`,
    ).bind(contract.id, ...guard.params));
  }
  // Značka nároku se na konci dávky mění na herní datum vyřízení.
  stmts.push(db.prepare("UPDATE sponsor_promises SET resolved_at = ? WHERE id = ? AND resolved_at = ?")
    .bind(ctx.gameDate, id, token));

  const results = await db.batch(stmts);
  return (results[0]?.meta?.changes ?? 0) === 1;
}

/**
 * Připíše výsledky slibů jedné smlouvy. Každý slib ve vlastní dávce (resolvePromise),
 * výpověď se rozhodne jednou za smlouvu, SMS majitele jde jedna (výpověď > porušení > splnění).
 */
export async function applyContractOutcomes(
  db: D1Database, contract: ContractRow, evaluations: readonly PromiseEvaluation[], ctx: ResolveContext,
): Promise<ContractOutcomesResult> {
  const applied: PromiseEvaluation[] = [];
  const teamId = contract.team_id;

  for (const ev of evaluations) {
    try {
      if (await resolvePromise(db, contract, ev, ctx)) applied.push(ev);
    } catch (e) {
      // Dávka je transakce: slib zůstal čekat bez peněz i náklonnosti, příští běh ho zkusí znovu.
      logger.error({ module: M, teamId }, `vyřízení slibu ${ev.row.id} (${ev.kind}) selhalo, slib zůstává čekat`, e);
    }
  }
  if (applied.length === 0) return { applied, terminated: false, terminatedSponsorId: null };

  const brokenKinds = applied.filter((a) => a.outcome === "broken").map((a) => a.kind);
  let terminated = false;
  if (brokenKinds.length > 0) {
    try {
      const row = await db.prepare("SELECT breaches_season FROM sponsor_contracts WHERE id = ?")
        .bind(contract.id).first<{ breaches_season: number }>();
      if (sponsorTerminates(row?.breaches_season ?? 0, brokenKinds)) {
        terminated = await terminateContractBySponsor(db, contract, ctx);
      }
    } catch (e) {
      logger.error({ module: M, teamId }, `výpověď smlouvy ${contract.id} sponzorem`, e);
    }
  }

  try {
    const plan = promiseSmsPlan(applied.map((a) => ({ id: a.row.id, outcome: a.outcome, label: labelOf(a, ctx) })), terminated);
    if (plan) {
      await enqueueOwnerSms(db, {
        sponsorId: contract.sponsor_id, teamId, occasion: plan.occasion,
        referenceId: terminated ? `sponsor-quit:${contract.id}` : `promise:${plan.promiseId}`,
        day: ctx.day, vars: { slib: plan.label },
      });
    }
  } catch (e) {
    logger.warn({ module: M, teamId }, `SMS majitele ke slibům smlouvy ${contract.id}`, e);
  }
  return { applied, terminated, terminatedSponsorId: terminated ? contract.sponsor_id : null };
}

function kc(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

/**
 * Sponzor vypoví smlouvu za nesplněné sliby. Nárok přes `status = 'active'` (`.all()` s RETURNING).
 * Výpovědní pokutu klub neplatí, ale vrací nesplacenou část zálohy stejně jako při výpovědi
 * klubem (routes/game.ts terminate: `contractClawback`, reference `sponsor-clawback-<id>`).
 * Pak návrat názvu (SK <obec> / Sportovní areál <obec>), logo z rukávu, reputace −5,
 * zpráva do ligy a SMS sportovního ředitele. Každý důsledek ve vlastním try.
 * `false` = smlouvu už ukončil někdo jiný.
 */
export async function terminateContractBySponsor(db: D1Database, contract: ContractRow, ctx: ResolveContext): Promise<boolean> {
  const claim = await db.prepare(
    "UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ? AND status = 'active' RETURNING id",
  ).bind(contract.id).all<{ id: string }>();
  if (claim.results.length !== 1) return false;
  const teamId = contract.team_id;

  let clawback = 0;
  try {
    const advance = await loadAdvanceContract(db, contract.id);
    if (advance) {
      const progress = ctx.progressMonths ?? await loadTeamSeasonProgress(db, teamId);
      clawback = await contractClawback(db, advance, progress);
    }
    if (clawback > 0) {
      await recordTransaction(db, teamId, "sponsor_termination", -clawback,
        `Vrácení nesplacené zálohy: ${contract.sponsor_name}`, ctx.gameDate, `sponsor-clawback-${contract.id}`);
    }
  } catch (e) {
    logger.error({ module: M, teamId }, `vratka zálohy po výpovědi smlouvy ${contract.id} sponzorem`, e);
    clawback = 0;
  }

  const category = contract.category === "stadium" || contract.category === "banner" ? contract.category : "main";
  let oldName = "";
  let newName = "";
  try {
    const team = await db.prepare(
      "SELECT t.name, v.name AS village_name FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
    ).bind(teamId).first<{ name: string; village_name: string }>();
    oldName = team?.name ?? "";
    const village = team?.village_name ?? "";
    newName = `SK ${village}`.trim();
    if (!village) {
      logger.warn({ module: M, teamId }, `výpověď smlouvy ${contract.id}: klub bez obce, název se nevrací`);
    } else if (category === "main") {
      await db.batch([
        db.prepare("UPDATE teams SET name = ? WHERE id = ?").bind(newName, teamId),
        db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId),
        db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId),
      ]);
    } else if (category === "stadium") {
      await db.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?").bind(`Sportovní areál ${village}`.trim(), teamId).run();
    }
  } catch (e) {
    logger.error({ module: M, teamId }, `návrat názvu po výpovědi smlouvy ${contract.id}`, e);
  }

  try {
    await db.prepare("UPDATE teams SET sleeve_sponsor_id = NULL WHERE id = ? AND sleeve_sponsor_id = ?")
      .bind(teamId, contract.sponsor_id).run();
  } catch (e) {
    logger.error({ module: M, teamId }, `logo z rukávu po výpovědi smlouvy ${contract.id}`, e);
  }

  try {
    await applyReputationDelta(db, teamId, TERMINATION_REPUTATION, "sponsor",
      `${contract.sponsor_name} vypověděl smlouvu za nesplněné sliby`,
      { referenceId: `sponsor-quit-${contract.id}`, gameDate: ctx.gameDate });
  } catch (e) {
    logger.error({ module: M, teamId }, `reputace po výpovědi smlouvy ${contract.id}`, e);
  }

  try {
    const renamed = category === "main" && newName !== "";
    const headline = renamed
      ? `${oldName} se přejmenovává na ${newName}`
      : `${contract.sponsor_name} končí u klubu ${oldName}`;
    const body = renamed
      ? `Firma ${contract.sponsor_name} vypověděla klubu ${oldName} smlouvu hlavního sponzora kvůli nesplněným slibům. Klub se vrací k názvu ${newName}.`
      : `Firma ${contract.sponsor_name} vypověděla klubu ${oldName} smlouvu kvůli nesplněným slibům.`;
    await db.prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, created_at)
       VALUES (?, (SELECT league_id FROM teams WHERE id = ?), ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), teamId, teamId, renamed ? "rename" : "sponsor", headline, body).run();
  } catch (e) {
    logger.error({ module: M, teamId }, `zpráva do ligy o výpovědi smlouvy ${contract.id}`, e);
  }

  try {
    const parts = [`📋 Firma ${contract.sponsor_name} vypověděla smlouvu, protože klub nedodržel sliby.`];
    if (category === "main" && newName) parts.push(`Klub se vrací k názvu ${newName}.`);
    parts.push("Výpovědní pokutu neplatíme, pokuty za porušené sliby ano.");
    if (clawback > 0) parts.push(`Nesplacenou část zálohy vracíme, ${kc(clawback)}.`);
    parts.push(`Reputace klesla o ${Math.abs(TERMINATION_REPUTATION)}.`);
    await sendSystemSMS(db, teamId, "Sportovní ředitel", "Sportovní ředitel", parts.join(" "));
  } catch (e) {
    logger.error({ module: M, teamId }, `SMS sportovního ředitele o výpovědi smlouvy ${contract.id}`, e);
  }

  logger.info({ module: M, teamId },
    `sponzor ${contract.sponsor_id} vypověděl smlouvu ${contract.id}${clawback > 0 ? `, vratka zálohy ${clawback}` : ""}`);
  return true;
}
