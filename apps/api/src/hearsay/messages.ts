/**
 * Zpráva „slyšel jsem…“ (spec část 3 a 10): dotčený hráč napíše trenérovi, co se doslechl.
 *
 * Doručuje hodinový běh Telefonu po šíření. Nejvýš dvě za 24 hodin na klub (přednost má
 * rozhodnutí na úkor, pak kritika, pak pochvala), jen klubům s trenérem aktivním v posledních
 * třech dnech, jen 7–22 h v Praze. Dopad už je zapsaný při šíření, zpráva je jen to, že se ozve.
 */
import { logger } from "../lib/logger";
import { pushPhoneMessage } from "../community/phone-push";
import { GeminiUnavailableError, generateInitialMessage, playerTimeContext } from "../messaging/ai-player-chat";
import { getScenarioById } from "../messaging/ai-player-scenarios";
import { ACTIVE_MANAGER_DAYS, type PhoneEnv } from "../messaging/casual-messages";
import { postPlayerMessageStmts } from "../messaging/follow-ups";
import { playerInClub } from "../messaging/player-reach";
import { DAY_MS, type HearsayKind, type HearsayOrigin, type KnowledgeVia } from "./types";
import { heardFact } from "./words";
import { isTransferKind, learningEffect } from "./effects";

const M = "hearsay-messages";

export const MAX_HEARSAY_MESSAGES_PER_DAY = 2;
const PENDING_HOURS = 48;
const PRIORITY: Record<HearsayKind, number> = {
  decision_against: 3, teammate_left: 2.5, teammate_arrived: 2.5, criticism: 2, praise: 1, decision_for: 0,
};
const SCENARIO: Partial<Record<HearsayKind, string>> = {
  decision_against: "heard_decision", criticism: "heard_criticism", praise: "heard_praise",
};

/** Scénář zprávy; u přestupu podle toho, jestli ho to těší (rival odešel, brácha přišel), nebo štve. */
function scenarioIdFor(kind: HearsayKind, via: KnowledgeVia): string | null {
  if (isTransferKind(kind)) {
    const effect = learningEffect(kind, via, { coachTalkedFirst: false, seededRoll: 1 });
    return effect.morale > 0 ? "transfer_reaction_good" : "transfer_reaction_bad";
  }
  return SCENARIO[kind] ?? null;
}

interface PendingRow {
  hearsay_id: string; player_id: string; via: string; from_player_id: string | null; learned_at: string;
  club_team_id: string; kind: string; origin: string; recipient_player_id: string | null; quote: string;
  last_activity_at: string | null;
}

function pragueHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now)) % 24;
}

export async function deliverHearsayMessages(
  db: D1Database,
  env: PhoneEnv,
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number; expired: number }> {
  const result = { sent: 0, skipped: 0, expired: 0 };
  const at = now.toISOString();
  const expired = await db.prepare(
    "UPDATE squad_hearsay_knowledge SET message_state = 'expired' WHERE message_state = 'pending' AND julianday(learned_at) < julianday(?) - ?",
  ).bind(at, PENDING_HOURS / 24).run();
  result.expired = expired.meta?.changes ?? 0;

  const hour = pragueHour(now);
  if (hour < 7 || hour >= 22) return result;
  const { isAiEnabled } = await import("../lib/ai-provider");
  if (!(await isAiEnabled(env))) return result;

  const rows = await db.prepare(
    `SELECT k.hearsay_id, k.player_id, k.via, k.from_player_id, k.learned_at,
            h.club_team_id, h.kind, h.origin, h.recipient_player_id, h.quote, u.last_activity_at
       FROM squad_hearsay_knowledge k
       JOIN squad_hearsay h ON h.id = k.hearsay_id
       JOIN teams t ON t.id = h.club_team_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE k.message_state = 'pending' AND k.player_id = h.subject_player_id`,
  ).all<PendingRow>();

  const byClub = new Map<string, PendingRow[]>();
  for (const r of rows.results) byClub.set(r.club_team_id, [...(byClub.get(r.club_team_id) ?? []), r]);

  for (const [clubId, list] of byClub) {
    const active = list[0].last_activity_at && Date.parse(list[0].last_activity_at) > now.getTime() - ACTIVE_MANAGER_DAYS * DAY_MS;
    if (!active) {
      await db.prepare(
        `UPDATE squad_hearsay_knowledge SET message_state = 'skipped'
          WHERE message_state = 'pending' AND hearsay_id IN (SELECT id FROM squad_hearsay WHERE club_team_id = ?)`,
      ).bind(clubId).run();
      result.skipped += list.length;
      continue;
    }
    const sentToday = await db.prepare(
      `SELECT COUNT(*) AS n FROM squad_hearsay_knowledge k JOIN squad_hearsay h ON h.id = k.hearsay_id
        WHERE h.club_team_id = ? AND k.message_state = 'sent' AND julianday(k.messaged_at) > julianday(?) - 1`,
    ).bind(clubId, at).first<{ n: number }>();
    let room = MAX_HEARSAY_MESSAGES_PER_DAY - (sentToday?.n ?? 0);
    const queue = [...list].sort((a, b) =>
      PRIORITY[b.kind as HearsayKind] - PRIORITY[a.kind as HearsayKind] || a.learned_at.localeCompare(b.learned_at));
    for (const row of queue) {
      if (room <= 0) break;
      try {
        const outcome = await deliverOne(db, env, row, now);
        if (outcome === "sent") { result.sent++; room--; }
        if (outcome === "model_down") break;
      } catch (e) {
        logger.warn({ module: M, teamId: clubId }, `zpráva slyšel jsem (${row.player_id})`, e);
      }
    }
  }
  return result;
}

async function deliverOne(db: D1Database, env: PhoneEnv, row: PendingRow, now: Date): Promise<"sent" | "wait" | "gone" | "model_down"> {
  const kind = row.kind as HearsayKind;
  const scenarioId = scenarioIdFor(kind, row.via as KnowledgeVia);
  const scenarioBase = scenarioId ? getScenarioById(scenarioId) : null;
  const markState = (state: string) => db.prepare(
    "UPDATE squad_hearsay_knowledge SET message_state = ? WHERE hearsay_id = ? AND player_id = ?",
  ).bind(state, row.hearsay_id, row.player_id).run();
  if (!scenarioBase || !(await playerInClub(db, row.player_id, row.club_team_id))) {
    await markState("skipped");
    return "gone";
  }

  const spawn = await import("../messaging/ai-player-spawn");
  const playerRow = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.nationality, p.age, p.position, p.team_id, p.loan_from_team_id,
            p.personality, p.life_context, p.coach_relationship, p.is_celebrity, ${spawn.INJURY_COLUMN}
       FROM players p WHERE p.id = ?`,
  ).bind(row.player_id).first<Record<string, unknown>>();
  if (!playerRow) { await markState("skipped"); return "gone"; }
  const playerTeamId = (playerRow.team_id as string | null) ?? row.club_team_id;
  const player = spawn.loadPlayerSnapshot(playerRow, await spawn.loadLastMatchContext(db, playerTeamId));
  if (playerTimeContext(player, now).situace === "spi") return "wait";

  const convId = await spawn.getOrCreatePlayerConversation(db, row.club_team_id, {
    id: player.id, firstName: player.firstName, lastName: player.lastName,
    nickname: playerRow.nickname as string | null, avatar: playerRow.avatar as string | null,
  });
  const conv = await db.prepare("SELECT ai_thread_active FROM conversations WHERE id = ?").bind(convId).first<{ ai_thread_active: number }>();
  if (conv?.ai_thread_active === 1) return "wait";

  const names = await db.prepare("SELECT id, first_name, last_name FROM players WHERE id IN (?, ?)")
    .bind(row.from_player_id ?? "", row.recipient_player_id ?? "").all<{ id: string; first_name: string; last_name: string }>();
  const name = (id: string | null) => {
    const p = id ? names.results.find((n) => n.id === id) : undefined;
    return p ? `${p.first_name} ${p.last_name}` : null;
  };
  const fact = heardFact({
    origin: row.origin as HearsayOrigin, quote: row.quote, recipientName: name(row.recipient_player_id),
    via: row.via as KnowledgeVia, fromName: name(row.from_player_id),
  });
  const scenario = { ...scenarioBase, description: `${scenarioBase.description} CO ZNÁŠ: ${fact}` };
  const team = await spawn.loadTeamContext(db, row.club_team_id, playerTeamId);

  let body: string;
  try {
    body = await generateInitialMessage(env, player, scenario, team, now);
  } catch (e) {
    if (e instanceof GeminiUnavailableError) {
      logger.warn({ module: M, teamId: row.club_team_id }, `model nedostupný pro zprávu slyšel jsem: ${e.message}`);
      return "model_down";
    }
    throw e;
  }

  const sentAt = now.toISOString();
  const state = {
    trigger: scenario.id, scenario_id: scenario.id, max_replies: scenario.expectedTurns, current_replies: 0,
    awaiting: "coach", initiated_at: sentAt, player_id: player.id, resolution: null,
    hearsay_id: row.hearsay_id, ...(scenarioBase.category === "casual" ? { casual: true } : {}),
  };
  await db.batch([
    ...postPlayerMessageStmts(db, {
      convId, player, body, now: sentAt,
      metadata: { ai_generated: true, scenario_id: scenario.id, turn: 0, hearsay_id: row.hearsay_id },
      preview: body.slice(0, 100),
    }),
    db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ?, ai_thread_last_at = ? WHERE id = ? AND ai_thread_active != 1")
      .bind(JSON.stringify(state), sentAt, convId),
    db.prepare("UPDATE squad_hearsay_knowledge SET message_state = 'sent', messaged_at = ? WHERE hearsay_id = ? AND player_id = ?")
      .bind(sentAt, row.hearsay_id, row.player_id),
  ]);
  await pushPhoneMessage(db, env, { teamId: row.club_team_id, convId, sender: `${player.firstName} ${player.lastName}`, text: body });
  logger.info({ module: M, teamId: row.club_team_id }, `slyšel jsem: ${player.firstName} ${player.lastName} → ${scenario.id}`);
  return "sent";
}
