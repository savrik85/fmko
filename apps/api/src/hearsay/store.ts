/**
 * Úložiště „kdo co ví“: tabulky squad_hearsay a squad_hearsay_knowledge (migrace 0335).
 */
import { DAY_MS, HEARSAY_TTL_DAYS, type HearsayItem, type HearsayKnowledge, type KnowledgeVia } from "./types";

interface ItemRow {
  id: string; club_team_id: string; subject_player_id: string; kind: string; origin: string;
  recipient_player_id: string | null; conversation_id: string | null; quote: string; created_at: string; expires_at: string;
}

interface KnowledgeRow {
  hearsay_id: string; player_id: string; via: string; from_player_id: string | null;
  learned_at: string; message_state: string; messaged_at: string | null;
}

function toItem(r: ItemRow): HearsayItem {
  return {
    id: r.id, clubTeamId: r.club_team_id, subjectPlayerId: r.subject_player_id, kind: r.kind as HearsayItem["kind"],
    origin: r.origin as HearsayItem["origin"], recipientPlayerId: r.recipient_player_id, conversationId: r.conversation_id,
    quote: r.quote, createdAt: r.created_at, expiresAt: r.expires_at,
  };
}

function toKnowledge(r: KnowledgeRow): HearsayKnowledge {
  return {
    hearsayId: r.hearsay_id, playerId: r.player_id, via: r.via as KnowledgeVia, fromPlayerId: r.from_player_id,
    learnedAt: r.learned_at, messageState: r.message_state as HearsayKnowledge["messageState"], messagedAt: r.messaged_at,
  };
}

/** Zápis věci; `id` dá volající, když potřebuje zabránit dvojímu zápisu (jinak náhodné). */
export function hearsayItemStmt(db: D1Database, item: HearsayItem): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO squad_hearsay (id, club_team_id, subject_player_id, kind, origin, recipient_player_id, conversation_id, quote, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(item.id, item.clubTeamId, item.subjectPlayerId, item.kind, item.origin, item.recipientPlayerId,
    item.conversationId, item.quote.slice(0, 300), item.createdAt, item.expiresAt);
}

/** Doplní id a platnost (`HEARSAY_TTL_DAYS`). */
export function newHearsayItem(item: Omit<HearsayItem, "id" | "expiresAt">, id: string = crypto.randomUUID()): HearsayItem {
  return { ...item, id, expiresAt: new Date(Date.parse(item.createdAt) + HEARSAY_TTL_DAYS * DAY_MS).toISOString() };
}

/** Znalosti; stejný hráč a věc podruhé nic nezmění (první cesta, kudy se to dozvěděl, zůstává). */
export function knowledgeStmts(db: D1Database, rows: HearsayKnowledge[]): D1PreparedStatement[] {
  return rows.map((k) => db.prepare(
    `INSERT OR IGNORE INTO squad_hearsay_knowledge (hearsay_id, player_id, via, from_player_id, learned_at, message_state, messaged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(k.hearsayId, k.playerId, k.via, k.fromPlayerId, k.learnedAt, k.messageState, k.messagedAt));
}

/** Zapíše věc a kdo ji hned ví. Vrací id věci. */
export async function recordHearsay(
  db: D1Database,
  item: Omit<HearsayItem, "id" | "expiresAt">,
  knowers: Array<{ playerId: string; via: KnowledgeVia }>,
): Promise<string> {
  const full = newHearsayItem(item);
  await db.batch([
    hearsayItemStmt(db, full),
    ...knowledgeStmts(db, knowers.map((k) => ({
      hearsayId: full.id, playerId: k.playerId, via: k.via, fromPlayerId: null,
      learnedAt: item.createdAt, messageState: "none" as const, messagedAt: null,
    }))),
  ]);
  return full.id;
}

/** Nevypršelé věci klubu a jejich znalosti (pro šíření). */
export async function loadClubHearsay(
  db: D1Database,
  clubTeamId: string,
  now: Date,
): Promise<{ items: HearsayItem[]; knowledge: HearsayKnowledge[] }> {
  const at = now.toISOString();
  const [items, knowledge] = await Promise.all([
    db.prepare("SELECT * FROM squad_hearsay WHERE club_team_id = ? AND expires_at > ?").bind(clubTeamId, at).all<ItemRow>(),
    db.prepare(
      `SELECT k.* FROM squad_hearsay_knowledge k JOIN squad_hearsay h ON h.id = k.hearsay_id
        WHERE h.club_team_id = ? AND h.expires_at > ?`,
    ).bind(clubTeamId, at).all<KnowledgeRow>(),
  ]);
  return { items: items.results.map(toItem), knowledge: knowledge.results.map(toKnowledge) };
}

/** Co hráč ví (nevypršelé), nejnovější první, nejvýš pět. */
export async function loadPlayerHearsay(
  db: D1Database,
  playerId: string,
  now: Date,
): Promise<Array<HearsayItem & { knowledge: HearsayKnowledge }>> {
  const rows = await db.prepare(
    `SELECT h.*, k.hearsay_id, k.player_id, k.via, k.from_player_id, k.learned_at, k.message_state, k.messaged_at
       FROM squad_hearsay_knowledge k JOIN squad_hearsay h ON h.id = k.hearsay_id
      WHERE k.player_id = ? AND h.expires_at > ?
      ORDER BY k.learned_at DESC LIMIT 5`,
  ).bind(playerId, now.toISOString()).all<ItemRow & KnowledgeRow>();
  return rows.results.map((r) => ({ ...toItem(r), knowledge: toKnowledge(r) }));
}
