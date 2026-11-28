/**
 * Kapitán sazebník schvaluje (spec bod 2).
 *
 * Trenér sazebník předloží, kód spočítá verdikt (harshness.ts) a kapitán odpoví SMS.
 * Schválený sazebník platí od dalšího pondělí. Výhradu nebo odmítnutí může trenér
 * přebít vnucením: sazebník platí taky, ale je to diktát (slabší účinek, odpor kabiny).
 * Zmírnění platného sazebníku souhlas nepotřebuje a platí hned.
 */

import {
  fineItemDef, fineValueLabel, validateFineItems,
  type FineScheduleItemInput,
} from "@okresni-masina/shared";
import type { ChatEnv } from "../messaging/ai-player-chat";
import { logger } from "../lib/logger";
import { captainDecision, isSoftening, scheduleHarshness, type CaptainDecision } from "./harshness";
import {
  ACTIVE_SEASON_SQL, addDays, ensureScheduleRowStmt, itemStmts, loadSchedule, moraleStmt, nextMonday,
  PLAYER_PROFILE_SQL, profileFromRow, type PlayerFineProfile,
} from "./store";

const M = "fines-captain";

export interface ProposalNote {
  itemKey: string;
  conditionKey: string;
  selfInterest: boolean;
}

/** Kapitán týmu, bez kapitána nejvlivnější dospělý hráč (vůdcovství, pak vztah k trenérovi). */
export async function captainOf(db: D1Database, teamId: string): Promise<PlayerFineProfile | null> {
  const t = await db.prepare("SELECT captain_id FROM teams WHERE id = ?").bind(teamId).first<{ captain_id: string | null }>();
  if (t?.captain_id) {
    const r = await db.prepare(`${PLAYER_PROFILE_SQL} WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`)
      .bind(t.captain_id, teamId).first<Record<string, unknown>>();
    if (r) return profileFromRow(r);
  }
  const r = await db.prepare(
    `${PLAYER_PROFILE_SQL} WHERE team_id = ? AND (status IS NULL OR status = 'active') AND age >= 20
      ORDER BY COALESCE(json_extract(personality, '$.leadership'), 0) DESC, COALESCE(coach_relationship, 50) DESC LIMIT 1`,
  ).bind(teamId).first<Record<string, unknown>>();
  return r ? profileFromRow(r) : null;
}

function itemPhrase(it: FineScheduleItemInput): string {
  const def = fineItemDef(it.itemKey);
  const cond = def?.conditions.find((c) => c.key === it.conditionKey);
  const condText = cond && cond.key !== "any" ? ` (${cond.label.toLowerCase()})` : cond && def && def.conditions.length > 1 ? " (jakákoli)" : "";
  return `${def?.label ?? it.itemKey}${condText}: ${fineValueLabel(it.valueKind, it.amountCzk)}`;
}

export function captainInstruction(items: readonly FineScheduleItemInput[], d: CaptainDecision): string {
  const list = items.map((it) => `- ${itemPhrase(it)}`).join("\n");
  const objection = d.objectionIndex !== null ? items[d.objectionIndex] : null;
  const lines = [
    "Jsi kapitán. Trenér ti předložil sazebník pokut pro kabinu a chce, abys ho za kluky odsouhlasil. Sazebník:",
    list,
  ];
  if (d.verdict === "approved") {
    lines.push("Za kabinu to schvaluješ. Řekni, že to klukům vyřídíš a že je to fér. Krátce.");
  } else if (d.verdict === "reservation" && objection) {
    lines.push(`S většinou souhlasíš, ale s položkou „${itemPhrase(objection)}“ ne.`);
    lines.push(d.selfInterest
      ? "Tahle se týká i tebe a nechceš ji. Řekni to po svém, klidně se vytáčej, ale je jasné, že tohle nechceš."
      : "Řekni proč: je to moc peněz pro kluky, nebo se za tohle podle tebe pokuta nedává.");
    lines.push("Navrhni, ať ji trenér zmírní nebo vyhodí, a pak to podepíšeš.");
  } else {
    lines.push("Za kabinu to odmítáš: je to moc přísné a kluci to platit nebudou.");
    if (objection) lines.push(`Nejvíc ti vadí „${itemPhrase(objection)}“.`);
    lines.push("Řekni to slušně, ale jasně. Když to trenér vnutí, kabina to nevezme.");
  }
  lines.push("Piš jako SMS trenérovi, krátce. Žádná čísla o náladě.");
  return lines.join("\n");
}

const CAPTAIN_REPLIES: Record<CaptainDecision["verdict"], readonly string[]> = {
  approved: [
    "Trenére, sazebník je fér. Klukům to vyřídím, platí to.",
    "Za kabinu beru. Rozumný pravidla, s tím problém nebude.",
    "Prošel jsem to, je to v pohodě. Kluci to vezmou.",
    "Dobře, trenére, podepisuju. Aspoň bude na sud.",
    "Jo, s tímhle souhlasím. Řeknu to na tréninku.",
    "Fér pravidla. Za kabinu to odsouhlasím.",
    "Beru, trenére. Kdo to poruší, ten platí.",
    "To je rozumný. Pověsím to v kabině na nástěnku.",
  ],
  reservation: [
    "Většina je fér, trenére, ale jedna položka ne. Tu zmírněte a podepíšu.",
    "S tímhle skoro souhlasím. Jen tu jednu věc bych vyhodil, to kluci neberou.",
    "Trenére, až na jednu položku dobrý. Tu ale za kabinu nepodepíšu.",
    "Skoro to sedí. Jednu věc ale změňte, jinak bude v kabině dusno.",
    "Jedna položka je přes čáru. Upravte ji a máte to odsouhlasený.",
    "S většinou souhlas. Tu jednu věc kluci platit nebudou.",
    "Dobrý, jen jednu položku bych vyhodil. Pak to vezmu.",
    "Až na jednu věc fér. Tu přepište a jdeme.",
  ],
  rejected: [
    "Trenére, tohle za kabinu nepodepíšu. Je to moc přísný.",
    "Tohle kluci platit nebudou. Fakt ne.",
    "S tímhle nesouhlasím. To je spíš ždímání než pravidla.",
    "Tohle ne, trenére. Když to vnutíte, kabina se postaví proti.",
    "Za kabinu odmítám. Takový pokuty na okrese nikdo nemá.",
    "Je to přes čáru. Takhle to nepůjde.",
    "Nepodepíšu. Zkuste to přepsat, tohle neprojde.",
    "Trenére, tohle by kabinu rozbilo. Odmítám.",
  ],
};

export type ProposeResult =
  | { ok: true; outcome: CaptainDecision["verdict"] | "activated_softening" | "cleared" | "imposed"; captainName?: string }
  | { ok: false; error: string; status: number };

/**
 * Uloží návrh a pošle ho kapitánovi. Verdikt je hned zapsaný, SMS kapitána jde přes model
 * (ve `waitUntil`, když ho volající má).
 */
export async function proposeSchedule(
  db: D1Database, env: ChatEnv | undefined,
  o: { teamId: string; day: string; items: FineScheduleItemInput[]; waitUntil?: (p: Promise<unknown>) => void },
): Promise<ProposeResult> {
  const err = validateFineItems(o.items);
  if (err) return { ok: false, error: err, status: 400 };
  const current = await loadSchedule(db, o.teamId);
  const hasActive = current.row?.status === "active" && current.active.length > 0;

  // Prázdný návrh = zrušit sazebník. Zmírnění souhlas nepotřebuje.
  if (o.items.length === 0) {
    await db.batch([
      ensureScheduleRowStmt(db, o.teamId),
      ...itemStmts(db, o.teamId, "active", []), ...itemStmts(db, o.teamId, "draft", []),
      db.prepare(`UPDATE fine_schedules SET status = 'none', origin = NULL, proposal_status = 'none', proposal_note = NULL,
        ultimatum_match_id = NULL, squad_stage = MIN(squad_stage, 1), updated_at = datetime('now') WHERE team_id = ?`).bind(o.teamId),
    ]);
    return { ok: true, outcome: "cleared" };
  }
  if (hasActive && isSoftening(o.items, current.active)) {
    await db.batch([
      ...itemStmts(db, o.teamId, "active", o.items), ...itemStmts(db, o.teamId, "draft", []),
      db.prepare(`UPDATE fine_schedules SET proposal_status = 'none', proposal_note = NULL, ultimatum_match_id = NULL,
        squad_stage = MIN(squad_stage, 1), updated_at = datetime('now') WHERE team_id = ?`).bind(o.teamId),
    ]);
    return { ok: true, outcome: "activated_softening" };
  }

  const captain = await captainOf(db, o.teamId);
  if (!captain) return { ok: false, error: "V kádru není nikdo, kdo by sazebník za kabinu odsouhlasil.", status: 409 };
  const decision = captainDecision(o.items, captain);
  const note: ProposalNote | null = decision.objectionIndex !== null
    ? { itemKey: o.items[decision.objectionIndex].itemKey, conditionKey: o.items[decision.objectionIndex].conditionKey, selfInterest: decision.selfInterest }
    : null;

  const stmts: D1PreparedStatement[] = [
    ensureScheduleRowStmt(db, o.teamId),
    ...itemStmts(db, o.teamId, "draft", o.items),
    db.prepare(`UPDATE fine_schedules SET proposal_status = ?, proposal_captain_id = ?, proposal_note = ?, proposed_at = ?, decided_at = ?,
      updated_at = datetime('now') WHERE team_id = ?`)
      .bind(decision.verdict, captain.id, note ? JSON.stringify(note) : null, o.day, o.day, o.teamId),
  ];
  if (decision.verdict === "approved") stmts.push(...activateStmts(db, o.teamId, o.items, "approved", o.day, hasActive));
  await db.batch(stmts);

  const send = sendCaptainReply(db, env, o.teamId, captain, o.items, decision)
    .catch((e) => logger.warn({ module: M, teamId: o.teamId }, "SMS kapitána k sazebníku", e));
  if (o.waitUntil) o.waitUntil(send); else await send;
  return { ok: true, outcome: decision.verdict, captainName: `${captain.firstName} ${captain.lastName}` };
}

function activateStmts(
  db: D1Database, teamId: string, items: readonly FineScheduleItemInput[], origin: "approved" | "imposed", day: string, replacing: boolean,
): D1PreparedStatement[] {
  return [
    ...itemStmts(db, teamId, "active", items),
    ...itemStmts(db, teamId, "draft", []),
    // Změny se počítají za sezónu: v nové sezóně začíná počítadlo znovu od nuly.
    // Sazebník schválený kapitánem kabinu uklidní jako zmírnění (ultimátum padá, stávka taky).
    // Vnucený stav kabiny nechává, ten nastaví impose.
    db.prepare(`UPDATE fine_schedules SET status = 'active', origin = ?, effective_from = ?, ultimatum_match_id = NULL,
      squad_stage = CASE WHEN ? = 'approved' THEN MIN(squad_stage, 1) ELSE squad_stage END,
      changes_season = CASE WHEN season_number IS (${ACTIVE_SEASON_SQL}) THEN changes_season + ? ELSE ? END,
      season_number = (${ACTIVE_SEASON_SQL}), updated_at = datetime('now') WHERE team_id = ?`)
      .bind(origin, nextMonday(day), origin, replacing ? 1 : 0, replacing ? 1 : 0, teamId),
  ];
}

async function sendCaptainReply(
  db: D1Database, env: ChatEnv | undefined, teamId: string, captain: PlayerFineProfile,
  items: readonly FineScheduleItemInput[], decision: CaptainDecision,
): Promise<void> {
  const { clubReceivesMessages } = await import("../incidents/club-messages");
  if (!(await clubReceivesMessages(db, teamId))) return;
  const { sendEventSms } = await import("../messaging/event-sms");
  await sendEventSms(db, env, {
    clubTeamId: teamId,
    player: { id: captain.id, firstName: captain.firstName, lastName: captain.lastName },
    instruction: captainInstruction(items, decision),
    fallback: CAPTAIN_REPLIES[decision.verdict],
    seed: `sazebnik|${teamId}|${items.map((i) => `${i.itemKey}:${i.conditionKey}:${i.valueKind}:${i.amountCzk}`).join(",")}`,
    scenarioId: "fine_schedule_captain",
    metadata: { type: "fine_schedule", verdict: decision.verdict },
  });
}

/**
 * Vnutí návrh, který kapitán neschválil. Platí od dalšího pondělí jako diktát: vztah s
 * kapitánem klesne, kabina začíná na 1. stupni odporu a tvrdý sazebník rovnou dostane ultimátum.
 */
export async function imposeSchedule(db: D1Database, env: ChatEnv | undefined, o: { teamId: string; day: string; waitUntil?: (p: Promise<unknown>) => void }): Promise<ProposeResult> {
  const s = await loadSchedule(db, o.teamId);
  if (!s.row || (s.row.proposal_status !== "reservation" && s.row.proposal_status !== "rejected") || s.draft.length === 0) {
    return { ok: false, error: "Není co vnutit: kapitán návrh schválil, nebo žádný návrh není.", status: 409 };
  }
  const harsh = scheduleHarshness(s.draft).score;
  const hasActive = s.row.status === "active" && s.active.length > 0;
  const stage = harsh >= 2 ? 2 : 1;
  const { coachRelationStmts } = await import("../lib/coach-relation");
  const captainId = s.row.proposal_captain_id;
  const stmts: D1PreparedStatement[] = [
    ...activateStmts(db, o.teamId, s.draft, "imposed", o.day, hasActive),
    db.prepare(`UPDATE fine_schedules SET proposal_status = 'none', squad_stage = MAX(squad_stage, ?), squad_stage_at = ?,
      resentment_until = ? WHERE team_id = ?`).bind(stage, o.day, addDays(o.day, 60), o.teamId),
    db.prepare(`UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
      MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) - 2))) WHERE team_id = ? AND (status IS NULL OR status = 'active')`).bind(o.teamId),
  ];
  if (captainId) {
    stmts.push(moraleStmt(db, captainId, -4));
    stmts.push(...coachRelationStmts(db, { playerId: captainId, delta: -6, source: "fine", description: "Trenér vnutil sazebník pokut, který neschválil", gameDate: o.day }));
  }
  await db.batch(stmts);
  const { announceSquadStage } = await import("./squad");
  const send = announceSquadStage(db, env, o.teamId, stage, o.day)
    .catch((e) => logger.warn({ module: M, teamId: o.teamId }, "kabina po vnuceném sazebníku", e));
  if (o.waitUntil) o.waitUntil(send); else await send;
  return { ok: true, outcome: "imposed" };
}
