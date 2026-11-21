/**
 * Dopad na hráče, který se dozví, co o něm trenér řekl (spec část 3).
 *
 * „Za zády“ = dozvěděl se to od někoho jiného (vazba, hospoda, spoluhráč). Bolí víc než
 * stejná slova do očí a pochvala za zády potěší víc. „Před kabinou“ = trenér to napsal do
 * kabiny a hráč to čte sám: větší než 1:1, ale bez zprávy „slyšel jsem…“ a pod stejným
 * denním stropem zlepšení jako rozhovor 1:1 (`dopadRozhovoru`).
 */
import { logger } from "../lib/logger";
import { coachRelationStmts } from "../lib/coach-relation";
import { seedFromString } from "../lib/seed";
import { createRng } from "../generators/rng";
import { DAY_MS, type HearsayItem, type HearsayKind, type KnowledgeVia } from "./types";

const M = "hearsay-effects";

export interface LearningEffect { relation: number; morale: number; unrest: number; message: boolean }

type Row = Omit<LearningEffect, "message"> & { message: "always" | "never" | number };

type SaidKind = "praise" | "criticism" | "decision_against" | "decision_for";
type TransferKind = "teammate_left" | "teammate_arrived";
type TieGroup = "family" | "friends" | "coworkers" | "rivals" | "competitor";

/** Za zády: vztah, nálada, nespokojenost (jen kdo ji má) a jestli o tom hráč napíše. */
const BEHIND_BACK: Record<SaidKind, Row> = {
  praise: { relation: 3, morale: 2, unrest: 0, message: 0.5 },
  criticism: { relation: -4, morale: -3, unrest: 0, message: "always" },
  decision_against: { relation: -3, morale: -4, unrest: 10, message: "always" },
  decision_for: { relation: 0, morale: 2, unrest: 0, message: "never" },
};

/** Před kabinou (trenér to napsal do skupiny a hráč to čte sám). */
const IN_FRONT: Record<SaidKind, Omit<LearningEffect, "message">> = {
  praise: { relation: 4, morale: 3, unrest: 0 },
  criticism: { relation: -5, morale: -4, unrest: 0 },
  decision_against: { relation: -2, morale: -3, unrest: 0 },
  decision_for: { relation: 0, morale: 3, unrest: 0 },
};

/** Přestup kamaráda, bráchy, rivala nebo konkurenta na postu (spec 3b). Chybějící = nic. */
const TRANSFER: Record<TransferKind, Partial<Record<TieGroup, Row>>> = {
  teammate_left: {
    family: { relation: -5, morale: -6, unrest: 15, message: "always" },
    friends: { relation: -2, morale: -3, unrest: 0, message: 0.5 },
    coworkers: { relation: 0, morale: -1, unrest: 0, message: "never" },
    rivals: { relation: 0, morale: 2, unrest: 0, message: 0.3 },
  },
  teammate_arrived: {
    family: { relation: 4, morale: 5, unrest: 0, message: "always" },
    friends: { relation: 0, morale: 2, unrest: 0, message: 0.3 },
    rivals: { relation: 0, morale: -2, unrest: 0, message: 0.5 },
    competitor: { relation: 0, morale: -3, unrest: 5, message: 0.5 },
  },
};

export function tieGroup(via: KnowledgeVia): TieGroup | null {
  if (via === "brothers" || via === "father_son") return "family";
  if (via === "drinking_buddies" || via === "mentor_pupil" || via === "classmates" || via === "neighbors" || via === "in_laws") return "friends";
  if (via === "coworkers" || via === "rivals" || via === "competitor") return via;
  return null;
}

export const isTransferKind = (kind: HearsayKind): kind is TransferKind => kind === "teammate_left" || kind === "teammate_arrived";

function messageOf(row: Row, roll: number): boolean {
  return row.message === "always" ? true : row.message === "never" ? false : roll < row.message;
}

/** Stejná věc o sobě (stejný druh) do tolika dnů už nic nepřidá: „to už vím“. */
const SAME_KIND_DAYS = 3;

const HALF_IF = (on: boolean, v: number, hurts: boolean) => (on && hurts ? Math.trunc(v / 2) : v);

export function learningEffect(
  kind: HearsayKind,
  via: KnowledgeVia,
  o: { coachTalkedFirst: boolean; seededRoll: number },
): LearningEffect {
  if (isTransferKind(kind)) {
    const group = tieGroup(via);
    const row = group ? TRANSFER[kind][group] : undefined;
    if (!row) return { relation: 0, morale: 0, unrest: 0, message: false };
    return { relation: row.relation, morale: row.morale, unrest: row.unrest, message: messageOf(row, o.seededRoll) };
  }
  if (via === "squad_chat" || via === "direct") return { ...IN_FRONT[kind], message: false };
  const row = BEHIND_BACK[kind];
  // Když to trenér hráči řekl sám dřív, než se to dozvěděl jinudy, zabolí to míň.
  const negative = row.relation < 0 || row.morale < 0 || row.unrest > 0;
  return {
    relation: HALF_IF(o.coachTalkedFirst, row.relation, negative),
    morale: HALF_IF(o.coachTalkedFirst, row.morale, negative),
    unrest: HALF_IF(o.coachTalkedFirst, row.unrest, negative),
    message: messageOf(row, o.seededRoll),
  };
}

/** Psal trenér hráči v jejich konverzaci 1:1 od `sinceIso`? */
export async function coachTalkedSince(
  db: D1Database,
  o: { clubTeamId: string; playerId: string; sinceIso: string },
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = ?
        AND m.sender_type = 'user' AND julianday(m.sent_at) >= julianday(?)
      LIMIT 1`,
  ).bind(o.clubTeamId, o.playerId, o.sinceIso).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `psal trenér hráči ${o.playerId}`, e); return null; });
  return !!row;
}

const DESCRIPTION: Record<SaidKind, string> = {
  praise: "Doslechl se, žes ho chválil",
  criticism: "Doslechl se, žes ho za zády kritizoval",
  decision_against: "Rozhodnutí na jeho úkor se dozvěděl od ostatních",
  decision_for: "Doslechl se, že s ním počítáš",
};

function description(kind: HearsayKind, via: KnowledgeVia, relation: number): string {
  if (kind === "teammate_left") return relation < 0 ? "Z klubu odešel někdo, kdo mu je blízký" : "Z klubu odešel ten, koho nemusí";
  if (kind === "teammate_arrived") return relation > 0 ? "Do klubu jsi přivedl někoho, kdo mu je blízký" : via === "competitor" ? "Přivedl jsi konkurenta na jeho post" : "Do klubu přišel ten, koho nemusí";
  return DESCRIPTION[kind];
}

const IN_FRONT_SUMMARY: Record<SaidKind, string> = {
  praise: "Trenér ho pochválil před celou kabinou",
  criticism: "Trenér ho zkritizoval před celou kabinou",
  decision_against: "Trenér před kabinou oznámil rozhodnutí na jeho úkor",
  decision_for: "Trenér před kabinou oznámil, že s ním počítá",
};

function moraleStmt(db: D1Database, playerId: string, delta: number): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
       MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))
     WHERE id = ?`,
  ).bind(delta, playerId);
}

/**
 * Příkazy, které zapíšou dopad na dotčeného hráče, a jestli má napsat „slyšel jsem…“.
 * Volá se před zápisem jeho znalosti (deduplikace čte, co už ví).
 */
export async function learningEffectStmts(
  db: D1Database,
  o: { item: HearsayItem; playerId: string; via: KnowledgeVia; gameDay: string; now: Date },
): Promise<{ stmts: D1PreparedStatement[]; message: boolean }> {
  const none = { stmts: [] as D1PreparedStatement[], message: false };
  if (o.playerId !== o.item.subjectPlayerId) return none;
  const transfer = isTransferKind(o.item.kind);

  const already = transfer ? null : await db.prepare(
    `SELECT 1 AS x FROM squad_hearsay_knowledge k JOIN squad_hearsay h ON h.id = k.hearsay_id
      WHERE k.player_id = ? AND h.subject_player_id = ? AND h.kind = ? AND h.id != ?
        AND julianday(k.learned_at) >= julianday(?)
      LIMIT 1`,
  ).bind(o.playerId, o.playerId, o.item.kind, o.item.id, new Date(o.now.getTime() - SAME_KIND_DAYS * DAY_MS).toISOString())
    .first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `už to ví ${o.playerId}`, e); return { x: 1 }; });
  if (already) return none;

  const negative = o.item.kind === "criticism" || o.item.kind === "decision_against";
  const behindBack = o.via !== "squad_chat" && o.via !== "direct";
  const coachTalkedFirst = behindBack && negative && await coachTalkedSince(db, {
    clubTeamId: o.item.clubTeamId, playerId: o.playerId,
    sinceIso: new Date(Date.parse(o.item.createdAt) - DAY_MS).toISOString(),
  });
  const seededRoll = createRng(seedFromString(`${o.item.id}:${o.playerId}`)).random();
  const eff = learningEffect(o.item.kind, o.via, { coachTalkedFirst, seededRoll });

  if (!behindBack && !transfer) {
    // Před kabinou: stejná cesta a strop jako rozhovor, který začal trenér.
    const { dopadRozhovoru } = await import("../messaging/coach-initiated");
    const stmts = await dopadRozhovoru(db, o.item.clubTeamId, o.playerId, {
      relationshipDelta: eff.relation, moraleDelta: eff.morale, summary: IN_FRONT_SUMMARY[o.item.kind as SaidKind],
    });
    return { stmts, message: false };
  }

  let { relation, morale } = eff;
  if (relation > 0 || morale > 0) {
    const counted = await db.prepare(
      "SELECT 1 AS x FROM coach_relation_log WHERE player_id = ? AND source = 'hearsay' AND delta > 0 AND substr(game_date, 1, 10) = ? LIMIT 1",
    ).bind(o.playerId, o.gameDay.slice(0, 10)).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, `strop pochval ${o.playerId}`, e); return { x: 1 }; });
    if (counted) { relation = Math.min(0, relation); morale = Math.min(0, morale); }
  }

  const stmts: D1PreparedStatement[] = [
    ...coachRelationStmts(db, { playerId: o.playerId, delta: relation, source: "hearsay", description: description(o.item.kind, o.via, relation), gameDate: o.gameDay }),
  ];
  if (morale !== 0) stmts.push(moraleStmt(db, o.playerId, morale));
  if (eff.unrest !== 0) {
    stmts.push(db.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.transferUnrest.level',
         MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.transferUnrest.level'), 0) + ?)))
       WHERE id = ? AND json_extract(life_context, '$.transferUnrest') IS NOT NULL`,
    ).bind(eff.unrest, o.playerId));
  }
  return { stmts, message: eff.message };
}
