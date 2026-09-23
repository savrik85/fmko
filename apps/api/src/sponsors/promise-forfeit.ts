/**
 * Propadlé sliby: klub ukončí smlouvu sám (přechod k jiné firmě, výpověď), dřív než se sliby
 * aktuální sezóny a termínové sliby stihly vyhodnotit. Neaktivní smlouvu už nikdo nevyhodnotí,
 * takže by se sliby jinak daly obejít. Propadnou jako porušené: plná pokuta (transakce
 * `promise:<id>`) a náklonnost −8, ale bez počítání porušení, bez výpovědi sponzorem a bez SMS
 * majitele (smlouva končí tak jako tak). Sliby budoucích sezón zůstávají čekat.
 *
 * Prodloužení u stejné firmy sliby nepropadá, ty se přesouvají na novou smlouvu (signing.ts).
 *
 * Příkazy jdou do dávky volajícího spolu s koncem smlouvy. Každý slib se nárokuje jednorázovou
 * značkou v `resolved_at` (stejně jako resolvePromise), peníze a náklonnost platí jen se značkou,
 * takže opakovaný nebo souběžný běh nestrhne pokutu dvakrát.
 */
import { favorDeltaStmts } from "./favor";
import { parsePromiseParams, promiseConsequence, promiseFavorReason, promiseLabel, promiseTransactionText } from "./promise-eval";
import { DEADLINE_KINDS, isPromiseKind, SEASONAL_KINDS } from "./promise-kinds";
import { claimGuard } from "./promise-resolve";
import { cupTotalRoundsOf } from "./promise-runs";
import { moneyStatements, type Guard } from "./signing";

export interface ForfeitRow {
  id: string;
  contract_id: string;
  sponsor_id: number;
  kind: string;
  params: string | null;
  season: number | null;
  penalty: number;
}

/**
 * Podmínka „slib propadne": čeká, a buď je sezónní za sezónu `?` (aktuální), nebo termínový.
 * Klíče druhů jsou konstanty z promise-kinds, žádný vstup od hráče.
 */
function forfeitWhere(alias: string): string {
  const list = (kinds: Iterable<string>) => [...kinds].map((k) => `'${k}'`).join(", ");
  return `${alias}.status = 'pending'
    AND ((${alias}.season = ? AND ${alias}.kind IN (${list(SEASONAL_KINDS)})) OR ${alias}.kind IN (${list(DEADLINE_KINDS)}))`;
}

/** Sliby smlouvy, které při jejím ukončení klubem propadnou. */
export async function loadForfeitablePromises(db: D1Database, contractId: string, season: number): Promise<ForfeitRow[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.contract_id, p.sponsor_id, p.kind, p.params, p.season, p.penalty
     FROM sponsor_promises p WHERE p.contract_id = ? AND ${forfeitWhere("p")}
     ORDER BY p.id`,
  ).bind(contractId, season).all<ForfeitRow>();
  return rows.results;
}

export interface PreparedForfeit {
  rows: ForfeitRow[];
  /** Součet pokut v Kč (kladně). */
  total: number;
  /** Počet kol poháru sezóny pro popisek slibu cup_round v transakci. */
  cupTotalRounds?: number;
}

/** Propadající sliby smlouvy, jejich součet a počet kol poháru pro popisky. */
export async function prepareForfeit(db: D1Database, contractId: string, season: number): Promise<PreparedForfeit> {
  const rows = await loadForfeitablePromises(db, contractId, season);
  const cupTotalRounds = rows.some((r) => r.kind === "cup_round") ? await cupTotalRoundsOf(db, season) : undefined;
  return { rows, total: forfeitPenaltyTotal(rows), cupTotalRounds };
}

/** Plná pokuta za slib, stejně jako u porušení (promiseConsequence). */
function finePerRow(r: ForfeitRow): number {
  return -promiseConsequence("broken", 0, r.penalty).money;
}

/** Součet pokut za propadlé sliby (kladné číslo v Kč). */
export function forfeitPenaltyTotal(rows: readonly ForfeitRow[]): number {
  return rows.reduce((sum, r) => sum + finePerRow(r), 0);
}

/** Pokuty za propadlé sliby po aktivních smlouvách klubu: id smlouvy → Kč (jen nenulové). */
export async function forfeitPenaltiesByContract(db: D1Database, teamId: string, season: number): Promise<Map<string, number>> {
  const rows = await db.prepare(
    `SELECT p.id, p.contract_id, p.sponsor_id, p.kind, p.params, p.season, p.penalty
     FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
     WHERE p.team_id = ? AND sc.status = 'active' AND ${forfeitWhere("p")}`,
  ).bind(teamId, season).all<ForfeitRow>();
  const out = new Map<string, number>();
  for (const r of rows.results) {
    const fine = finePerRow(r);
    if (fine > 0) out.set(r.contract_id, (out.get(r.contract_id) ?? 0) + fine);
  }
  return out;
}

/**
 * Příkazy do dávky: každý slib propadne jako porušený, jen když platí `guard` (smlouva se v téže
 * dávce právě ukončuje). Nárok značkou v `resolved_at`, pokuta a náklonnost podmíněné značkou,
 * na konci značka → herní datum. Počítadlo porušení se nemění.
 */
export function forfeitStatements(
  db: D1Database,
  input: { teamId: string; sponsorName: string; rows: readonly ForfeitRow[]; gameDate: string; guard: Guard; cupTotalRounds?: number },
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const r of input.rows) {
    const token = `forfeit:${crypto.randomUUID()}`;
    const claimed = claimGuard(r.id, token);
    const label = isPromiseKind(r.kind)
      ? promiseLabel(r.kind, parsePromiseParams(r.params) ?? {}, input.cupTotalRounds)
      : "sponzorský slib";
    const cons = promiseConsequence("broken", 0, r.penalty);
    stmts.push(db.prepare(
      `UPDATE sponsor_promises SET status = 'broken', resolved_at = ?
       WHERE id = ? AND status = 'pending' AND ${input.guard.sql}`,
    ).bind(token, r.id, ...input.guard.params));
    if (cons.txType && cons.money !== 0) {
      stmts.push(...moneyStatements(db, input.teamId, cons.txType, cons.money,
        promiseTransactionText("broken", input.sponsorName, label), input.gameDate, `promise:${r.id}`, claimed));
    }
    stmts.push(...favorDeltaStmts(db, r.sponsor_id, input.teamId, cons.favorDelta, promiseFavorReason("broken", label), claimed));
    stmts.push(db.prepare("UPDATE sponsor_promises SET resolved_at = ? WHERE id = ? AND resolved_at = ?")
      .bind(input.gameDate, r.id, token));
  }
  return stmts;
}

/**
 * Výpověď smlouvy klubem (routes/game.ts terminate) spolu s propadlými sliby v jedné dávce.
 * Sliby propadnou jen, když je smlouva v tu chvíli pořád aktivní, a nárok na smlouvu je poslední
 * příkaz dávky: dávka je transakce, takže propadnutí a konec smlouvy platí buď obojí, nebo nic.
 * `true` = tenhle požadavek smlouvu ukončil; `false` = už ji ukončil někdo jiný (nic se nestrhlo).
 */
export async function terminateWithForfeit(
  db: D1Database,
  input: { teamId: string; contractId: string; sponsorName: string; forfeit: PreparedForfeit; gameDate: string },
): Promise<boolean> {
  const contractActive: Guard = {
    sql: "EXISTS (SELECT 1 FROM sponsor_contracts WHERE id = ? AND status = 'active')",
    params: [input.contractId],
  };
  const stmts = [
    ...forfeitStatements(db, {
      teamId: input.teamId, sponsorName: input.sponsorName, rows: input.forfeit.rows, gameDate: input.gameDate,
      guard: contractActive, cupTotalRounds: input.forfeit.cupTotalRounds,
    }),
    db.prepare("UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ? AND status = 'active'").bind(input.contractId),
  ];
  const results = await db.batch(stmts);
  return (results[results.length - 1]?.meta?.changes ?? 0) === 1;
}
