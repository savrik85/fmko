/**
 * Co trenér s pokutou udělá: trvá na zaplacení dluhu, promine, nebo dá ruční pokutu
 * (položky, které hra sama nepozná, např. „Pozdě na sraz“).
 */

import { fineItemDef } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { activeItemsOn, addDays, moraleStmt, recordFines, type RecordedFine } from "./store";

const M = "fines-actions";

type ActionResult = { ok: true; message: string } | { ok: false; error: string; status: number };

interface FineRow {
  id: string; team_id: string; player_id: string; item_key: string | null; status: string;
  value_kind: string; amount_czk: number | null; in_schedule: number; game_date: string;
}

async function loadFine(db: D1Database, teamId: string, fineId: string): Promise<FineRow | null> {
  return db.prepare("SELECT id, team_id, player_id, item_key, status, value_kind, amount_czk, in_schedule, game_date FROM fines WHERE id = ? AND team_id = ?")
    .bind(fineId, teamId).first<FineRow>();
}

async function coachDiscipline(db: D1Database, teamId: string, delta: number, description: string, fineId: string, day: string): Promise<void> {
  const { applyManagerAttrDelta } = await import("../lib/manager-attrs");
  await applyManagerAttrDelta(db, teamId, "discipline", delta, "fines", description, { referenceId: `fine:${fineId}`, gameDate: day })
    .catch((e) => logger.warn({ module: M, teamId }, `disciplína trenéra u pokuty ${fineId}`, e));
}

/** Trvat na zaplacení: hráč zaplatí, ale je to další rána do vztahu. Důslednost zvedá trenérovu disciplínu. */
export async function insistOnFine(db: D1Database, o: { teamId: string; fineId: string; day: string }): Promise<ActionResult> {
  const f = await loadFine(db, o.teamId, o.fineId);
  if (!f) return { ok: false, error: "Pokuta nenalezena.", status: 404 };
  if (f.status !== "refused") return { ok: false, error: "Tahle pokuta se nedluží.", status: 409 };
  const claim = await db.prepare("UPDATE fines SET status = 'paid', resolved_at = ?, reaction_sent_at = NULL WHERE id = ? AND status = 'refused'")
    .bind(o.day, f.id).run();
  if ((claim.meta?.changes ?? 0) === 0) return { ok: false, error: "Už je to vyřízené.", status: 409 };
  const { coachRelationStmts } = await import("../lib/coach-relation");
  const stmts: D1PreparedStatement[] = [
    moraleStmt(db, f.player_id, -4),
    ...coachRelationStmts(db, { playerId: f.player_id, delta: -3, source: "fine", description: "Trenér trval na zaplacení pokuty", gameDate: o.day }),
  ];
  if (f.value_kind === "czk" && f.in_schedule === 1 && f.amount_czk) {
    stmts.push(db.prepare("UPDATE teams SET fine_fund_balance = fine_fund_balance + ? WHERE id = ?").bind(f.amount_czk, o.teamId));
  }
  await db.batch(stmts);
  await coachDiscipline(db, o.teamId, 1, "Trval na zaplacení pokuty podle sazebníku", f.id, o.day);
  return { ok: true, message: "Hráč pokutu zaplatí. Radost z toho mít nebude." };
}

/**
 * Prominout. Když za totéž v posledním měsíci jiný platil, kabina to bere jako nespravedlnost:
 * ti, kdo platili, jsou naštvaní a trenérova disciplína klesá.
 */
export async function forgiveFine(db: D1Database, o: { teamId: string; fineId: string; day: string }): Promise<ActionResult> {
  const f = await loadFine(db, o.teamId, o.fineId);
  if (!f) return { ok: false, error: "Pokuta nenalezena.", status: 404 };
  if (f.status === "forgiven") return { ok: false, error: "Už je prominutá.", status: 409 };
  const claim = await db.prepare("UPDATE fines SET status = 'forgiven', resolved_at = ? WHERE id = ? AND status != 'forgiven'").bind(o.day, f.id).run();
  if ((claim.meta?.changes ?? 0) === 0) return { ok: false, error: "Už je prominutá.", status: 409 };
  const stmts: D1PreparedStatement[] = [moraleStmt(db, f.player_id, 2)];
  if (f.status === "paid" && f.value_kind === "czk" && f.in_schedule === 1 && f.amount_czk) {
    stmts.push(db.prepare("UPDATE teams SET fine_fund_balance = MAX(0, fine_fund_balance - ?) WHERE id = ?").bind(f.amount_czk, o.teamId));
  }
  const payers = f.item_key
    ? await db.prepare(
      `SELECT DISTINCT player_id FROM fines WHERE team_id = ? AND item_key = ? AND player_id != ? AND status = 'paid' AND game_date > ?`,
    ).bind(o.teamId, f.item_key, f.player_id, addDays(o.day, -28)).all<{ player_id: string }>()
    : { results: [] as { player_id: string }[] };
  const unfair = (payers.results ?? []).map((r) => r.player_id);
  for (const pid of unfair) stmts.push(moraleStmt(db, pid, -2));
  await db.batch(stmts);
  if (unfair.length > 0) {
    await coachDiscipline(db, o.teamId, -1, "Prominul pokutu, za kterou jiní platili", f.id, o.day);
    const who = unfair.length === 1 ? "Jeden hráč za totéž platil a ví to" : unfair.length < 5 ? `${unfair.length} hráči za totéž platili a vědí to` : `${unfair.length} hráčů za totéž platilo a ví to`;
    return { ok: true, message: `Prominuto. ${who}.` };
  }
  return { ok: true, message: "Prominuto." };
}

/** Ruční pokuta za položku, kterou hra sama nepozná. Jedna za položku a hráče za den. */
export async function manualFine(db: D1Database, o: { teamId: string; playerId: string; itemKey: string; day: string }): Promise<ActionResult & { fine?: RecordedFine }> {
  const def = fineItemDef(o.itemKey);
  if (!def?.manual) return { ok: false, error: "Ručně jde dát jen pokuta za položku, kterou hra sama nepozná.", status: 400 };
  const { items } = await activeItemsOn(db, o.teamId, o.day);
  const item = items.find((i) => i.itemKey === o.itemKey);
  if (!item) return { ok: false, error: "Tahle položka v platném sazebníku není. Pokutu mimo sazebník dáš v SMS.", status: 409 };
  const player = await db.prepare("SELECT id FROM players WHERE id = ? AND team_id = ?").bind(o.playerId, o.teamId).first();
  if (!player) return { ok: false, error: "Hráč není v kádru.", status: 404 };
  const [fine] = await recordFines(db, o.teamId, o.day, [{
    playerId: o.playerId, itemKey: item.itemKey, conditionKey: item.conditionKey,
    sourceRef: `manual|${item.itemKey}|${o.playerId}|${o.day}`, source: "manual", fact: `${def.label} (zapsal trenér)`,
  }], items);
  if (!fine) return { ok: false, error: "Za tohle už dnes pokutu má.", status: 409 };
  return { ok: true, message: fine.status === "refused" ? "Zapsáno, ale hráč odmítá platit." : "Zapsáno do pokladničky.", fine };
}
