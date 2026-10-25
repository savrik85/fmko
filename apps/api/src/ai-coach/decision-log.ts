/**
 * Deník rozhodnutí AI trenérů (`ai_coach_decisions`).
 *
 * Každé rozhodnutí se zapíše: co model dostal (stručně), co vrátil, co prošlo kontrolou,
 * co se provedlo a jestli rozhodlo náhradní pravidlo. Admin z toho pozná, proč AI klub
 * udělal, co udělal, a jak často model selhává.
 */

import { logger } from "../lib/logger";

export type DecisionMode = "on" | "shadow" | "off";

export interface DecisionEntry {
  teamId: string;
  /** Druh rozhodnutí, např. `match`, `weekly`, `transfer_reply`, `transfer_market`, `friendly`. */
  kind: string;
  mode: DecisionMode;
  model?: string | null;
  /** Na co se rozhodnutí vztahuje (id kola, nabídky, týden). */
  contextRef?: string | null;
  inputSummary?: string | null;
  rawOutput?: string | null;
  actions?: unknown;
  executed?: unknown;
  usedFallback: boolean;
  error?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
}

const MAX_TEXT = 8000;

function clip(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
}

function toJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return clip(JSON.stringify(v));
  } catch (e) {
    logger.warn({ module: "ai-coach-log" }, "převod rozhodnutí na JSON", e);
    return null;
  }
}

export async function logDecision(db: D1Database, entry: DecisionEntry): Promise<void> {
  await db.prepare(
    `INSERT INTO ai_coach_decisions
       (id, team_id, kind, mode, model, context_ref, input_summary, raw_output, actions, executed,
        used_fallback, error, tokens_in, tokens_out, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), entry.teamId, entry.kind, entry.mode, entry.model ?? null, entry.contextRef ?? null,
    clip(entry.inputSummary), clip(entry.rawOutput), toJson(entry.actions), toJson(entry.executed),
    entry.usedFallback ? 1 : 0, clip(entry.error), entry.tokensIn ?? null, entry.tokensOut ?? null, entry.latencyMs ?? null,
  ).run().catch((e) => logger.warn({ module: "ai-coach-log" }, `zápis rozhodnutí ${entry.kind} týmu ${entry.teamId}`, e));
}
